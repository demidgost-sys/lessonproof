import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { extname, resolve, sep } from "node:path";

import {
  DomainError,
  LessonProofEngine,
  createEngineFromEnv,
  isDomainError,
} from "../domain";
import {
  LiveAnalysisGuard,
  ServerSession,
  SessionStore,
  type AnalysisLimitOptions,
  type EngineFactoryContext,
  type SessionEngineFactory,
  type SessionStoreOptions,
} from "./session";

export interface LessonProofServerOptions {
  engine?: LessonProofEngine;
  engineFactory?: SessionEngineFactory;
  distDir?: string;
  env?: NodeJS.ProcessEnv;
  session?: Partial<SessionStoreOptions>;
  analysisLimits?: Partial<AnalysisLimitOptions>;
}

export type LessonProofRequestHandler = (
  request: IncomingMessage,
  response: ServerResponse,
) => Promise<void>;

const MAX_JSON_BODY_BYTES = 64 * 1024;

const GET_ROUTES = new Set(["/api/health", "/api/demo"]);
const POST_ROUTES = new Set([
  "/api/demo/reset",
  "/api/analyze",
  "/api/approve",
  "/api/apply",
  "/api/undo",
]);

const MIME_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

function setCommonHeaders(response: ServerResponse): void {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; base-uri 'none'; connect-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; script-src 'self'; style-src 'self'",
  );
  response.setHeader(
    "Permissions-Policy",
    "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
  );
}

function sendJson(
  response: ServerResponse,
  status: number,
  payload: unknown,
): void {
  setCommonHeaders(response);
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(payload));
}

function sendError(response: ServerResponse, error: unknown): void {
  if (isDomainError(error)) {
    const retryAfterSeconds = error.details.retryAfterSeconds;
    if (
      error.status === 429 &&
      typeof retryAfterSeconds === "number" &&
      Number.isSafeInteger(retryAfterSeconds) &&
      retryAfterSeconds > 0
    ) {
      response.setHeader("Retry-After", String(retryAfterSeconds));
    }
    sendJson(response, error.status, {
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
    });
    return;
  }

  sendJson(response, 500, {
    error: {
      code: "INTERNAL_ERROR",
      message: "LessonProof could not complete the request.",
      details: {},
    },
  });
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const contentType = request.headers["content-type"] ?? "";
  const mediaType = contentType.split(";", 1)[0].trim().toLowerCase();
  if (mediaType !== "application/json") {
    throw new DomainError(
      "JSON_REQUIRED",
      "POST requests require Content-Type: application/json.",
      415,
    );
  }

  const chunks: Buffer[] = [];
  let size = 0;
  let tooLarge = false;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_JSON_BODY_BYTES) {
      tooLarge = true;
      continue;
    }
    chunks.push(buffer);
  }

  if (tooLarge) {
    throw new DomainError(
      "BODY_TOO_LARGE",
      `JSON body exceeds ${MAX_JSON_BODY_BYTES} bytes.`,
      413,
    );
  }

  const body = Buffer.concat(chunks).toString("utf8").trim();
  if (!body) {
    return {};
  }

  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new DomainError("INVALID_JSON", "Request body is not valid JSON.", 400);
  }
}

function firstHeaderValue(value: string | string[] | undefined): string | null {
  const first = Array.isArray(value) ? value[0] : value;
  return first?.split(",", 1)[0].trim() || null;
}

function requestOrigin(request: IncomingMessage): string | null {
  const host =
    firstHeaderValue(request.headers["x-forwarded-host"]) ??
    firstHeaderValue(request.headers.host);
  if (!host) {
    return null;
  }

  const forwardedProtocol = firstHeaderValue(request.headers["x-forwarded-proto"]);
  const socket = request.socket as
    | (IncomingMessage["socket"] & { encrypted?: boolean })
    | undefined;
  const encrypted = Boolean(socket?.encrypted);
  const protocol = forwardedProtocol ?? (encrypted ? "https" : "http");
  if (protocol !== "http" && protocol !== "https") {
    return null;
  }

  try {
    return new URL(`${protocol}://${host}`).origin;
  } catch {
    return null;
  }
}

function assertSameOriginMutation(request: IncomingMessage): void {
  const fetchSite = firstHeaderValue(request.headers["sec-fetch-site"]);
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    throw new DomainError(
      "CROSS_SITE_MUTATION_REJECTED",
      "Cross-site workflow mutations are not allowed.",
      403,
    );
  }

  const origin = firstHeaderValue(request.headers.origin);
  if (!origin) {
    return;
  }

  const expectedOrigin = requestOrigin(request);
  let normalizedOrigin: string | null = null;
  try {
    normalizedOrigin = new URL(origin).origin;
  } catch {
    // Invalid and opaque origins are never trusted for state-changing routes.
  }
  if (!expectedOrigin || !normalizedOrigin || normalizedOrigin !== expectedOrigin) {
    throw new DomainError(
      "CROSS_SITE_MUTATION_REJECTED",
      "Cross-site workflow mutations are not allowed.",
      403,
    );
  }
}

function positiveIntegerFromEnv(
  env: NodeJS.ProcessEnv,
  name: string,
): number | undefined {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") {
    return undefined;
  }
  if (!/^\d+$/.test(raw)) {
    throw new Error(`${name} must be a positive integer.`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive safe integer.`);
  }
  return value;
}

function configuredSessionOptions(
  env: NodeJS.ProcessEnv,
  overrides: Partial<SessionStoreOptions> | undefined,
): Partial<SessionStoreOptions> {
  const ttlMs = positiveIntegerFromEnv(env, "LESSONPROOF_SESSION_TTL_MS");
  const maxSessions = positiveIntegerFromEnv(env, "LESSONPROOF_MAX_SESSIONS");
  return {
    secureCookie: env.NODE_ENV === "production",
    ...(ttlMs !== undefined ? { ttlMs } : {}),
    ...(maxSessions !== undefined ? { maxSessions } : {}),
    ...overrides,
  };
}

function configuredAnalysisLimits(
  env: NodeJS.ProcessEnv,
  overrides: Partial<AnalysisLimitOptions> | undefined,
): Partial<AnalysisLimitOptions> {
  const mappings = [
    ["windowMs", "LESSONPROOF_ANALYSIS_WINDOW_MS"],
    ["perSessionMax", "LESSONPROOF_ANALYSIS_SESSION_LIMIT"],
    ["globalMax", "LESSONPROOF_ANALYSIS_GLOBAL_LIMIT"],
    ["maxConcurrent", "LESSONPROOF_ANALYSIS_MAX_CONCURRENT"],
  ] as const;
  const configured: Partial<AnalysisLimitOptions> = {};
  for (const [field, name] of mappings) {
    const value = positiveIntegerFromEnv(env, name);
    if (value !== undefined) {
      configured[field] = value;
    }
  }
  return { ...configured, ...overrides };
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DomainError("INVALID_BODY", "Request body must be a JSON object.", 400);
  }
  return value as Record<string, unknown>;
}

function requireString(
  body: Record<string, unknown>,
  field: string,
): string {
  const value = body[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new DomainError(
      "INVALID_BODY",
      `Request field ${field} must be a non-empty string.`,
      400,
    );
  }
  return value;
}

async function handleApiRequest(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  healthEngine: LessonProofEngine,
  resolveSession: (
    request: IncomingMessage,
    response: ServerResponse,
  ) => ServerSession,
  analysisGuard: LiveAnalysisGuard,
): Promise<boolean> {
  if (!pathname.startsWith("/api/")) {
    return false;
  }

  if (request.method === "GET" && pathname === "/api/health") {
    const ready =
      healthEngine.planner.mode !== "openai" ||
      healthEngine.planner.keyConfigured;
    sendJson(response, ready ? 200 : 503, {
      ok: ready,
      mode: healthEngine.planner.mode,
      model: healthEngine.planner.model,
      keyConfigured: healthEngine.planner.keyConfigured,
    });
    return true;
  }

  if (!GET_ROUTES.has(pathname) && !POST_ROUTES.has(pathname)) {
    sendJson(response, 404, {
      error: {
        code: "API_ROUTE_NOT_FOUND",
        message: "API route not found.",
        details: {},
      },
    });
    return true;
  }

  const expectedMethod = GET_ROUTES.has(pathname) ? "GET" : "POST";
  if (request.method !== expectedMethod) {
    response.setHeader("Allow", expectedMethod);
    sendJson(response, 405, {
      error: {
        code: "METHOD_NOT_ALLOWED",
        message: "This API route does not support that method.",
        details: {},
      },
    });
    return true;
  }

  if (request.method === "POST") {
    assertSameOriginMutation(request);
  }

  const session = resolveSession(request, response);
  const engine = session.engine;

  if (pathname === "/api/demo") {
    sendJson(response, 200, engine.snapshot());
    return true;
  }

  const body = requireRecord(await readJsonBody(request));
  if (pathname === "/api/demo/reset") {
    const snapshot = await session.runMutation(() => engine.reset());
    sendJson(response, 200, snapshot);
    return true;
  }
  if (pathname === "/api/analyze") {
    const correction = requireString(body, "correction");
    const releaseHash = requireString(body, "releaseHash");
    const analyze = () => engine.analyze({ correction, releaseHash });
    const snapshot = await session.runMutation(() =>
      engine.planner.mode === "openai"
        ? analysisGuard.run(session.id, analyze)
        : analyze(),
    );
    sendJson(
      response,
      200,
      snapshot,
    );
    return true;
  }
  if (pathname === "/api/approve") {
    const snapshot = await session.runMutation(() =>
      engine.approve({
        planId: requireString(body, "planId"),
        releaseHash: requireString(body, "releaseHash"),
      }),
    );
    sendJson(
      response,
      200,
      snapshot,
    );
    return true;
  }
  if (pathname === "/api/apply") {
    const snapshot = await session.runMutation(() =>
      engine.apply({
        planId: requireString(body, "planId"),
        releaseHash: requireString(body, "releaseHash"),
      }),
    );
    sendJson(
      response,
      200,
      snapshot,
    );
    return true;
  }
  if (pathname === "/api/undo") {
    const snapshot = await session.runMutation(() =>
      engine.undo({
        journalId: requireString(body, "journalId"),
        expectedCurrentHash: requireString(body, "expectedCurrentHash"),
      }),
    );
    sendJson(
      response,
      200,
      snapshot,
    );
    return true;
  }

  sendJson(response, 404, {
    error: {
      code: "API_ROUTE_NOT_FOUND",
      message: "API route not found.",
      details: {},
    },
  });
  return true;
}

function safeStaticPath(distDir: string, pathname: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const relative = decoded.replace(/^\/+/, "");
  const candidate = resolve(distDir, relative);
  const root = resolve(distDir);
  if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) {
    return null;
  }
  return candidate;
}

function serveStatic(
  request: IncomingMessage,
  response: ServerResponse,
  distDir: string,
  pathname: string,
): boolean {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return false;
  }
  if (!existsSync(distDir)) {
    return false;
  }

  const requested = safeStaticPath(distDir, pathname);
  if (!requested) {
    return false;
  }

  let filePath = requested;
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    filePath = resolve(distDir, "index.html");
  }
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    return false;
  }

  setCommonHeaders(response);
  response.statusCode = 200;
  const extension = extname(filePath).toLowerCase();
  response.setHeader(
    "Content-Type",
    MIME_TYPES[extension] ?? "application/octet-stream",
  );
  response.setHeader(
    "Cache-Control",
    extension === ".html"
      ? "no-cache"
      : "public, max-age=31536000, immutable",
  );

  if (request.method === "HEAD") {
    response.end();
  } else {
    createReadStream(filePath).pipe(response);
  }
  return true;
}

export function createLessonProofRequestHandler(
  options: LessonProofServerOptions = {},
): LessonProofRequestHandler {
  if (options.engine && options.engineFactory) {
    throw new Error("Provide either engine or engineFactory, not both.");
  }

  const env = options.env ?? process.env;
  const distDir = options.distDir ?? resolve(process.cwd(), "dist");
  const analysisGuard = new LiveAnalysisGuard(
    configuredAnalysisLimits(env, options.analysisLimits),
  );

  let healthEngine: LessonProofEngine;
  let resolveSession: (
    request: IncomingMessage,
    response: ServerResponse,
  ) => ServerSession;

  if (options.engine) {
    const injectedEngine = options.engine;
    const compatibilitySession = new ServerSession(
      "A".repeat(43),
      () => injectedEngine,
      Date.now(),
    );
    healthEngine = injectedEngine;
    resolveSession = () => compatibilitySession;
  } else {
    const engineFactory: SessionEngineFactory =
      options.engineFactory ??
      ((context: EngineFactoryContext) =>
        createEngineFromEnv(env, {
          safetyIdentifier: context.safetyIdentifier,
        }));
    healthEngine = engineFactory({
      sessionId: "health-probe",
      safetyIdentifier: "lp_health_probe",
    });
    const sessions = new SessionStore(
      engineFactory,
      configuredSessionOptions(env, options.session),
    );
    resolveSession = (request, response) => sessions.resolve(request, response);
  }

  return async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://lessonproof.local");
      if (
        await handleApiRequest(
          request,
          response,
          url.pathname,
          healthEngine,
          resolveSession,
          analysisGuard,
        )
      ) {
        return;
      }
      if (serveStatic(request, response, distDir, url.pathname)) {
        return;
      }

      sendJson(response, 404, {
        error: {
          code: "NOT_FOUND",
          message: existsSync(distDir)
            ? "Resource not found."
            : "Frontend build not found. Run npm run build, or use npm run dev.",
          details: {},
        },
      });
    } catch (error) {
      sendError(response, error);
    }
  };
}

export function createLessonProofServer(
  options: LessonProofServerOptions = {},
): Server {
  const handler = createLessonProofRequestHandler(options);
  return createServer((request, response) => {
    void handler(request, response);
  });
}
