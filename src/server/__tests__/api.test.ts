import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { Readable, Writable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FixtureRepairPlanner, LessonProofEngine, loadFixture } from "../../domain";
import type { RepairPlanner, SessionSnapshot } from "../../domain";
import {
  createLessonProofRequestHandler,
  type LessonProofRequestHandler,
} from "../app";
import type { EngineFactoryContext } from "../session";

class MemoryResponse extends Writable {
  statusCode = 200;
  readonly headers = new Map<string, string | number | readonly string[]>();
  private readonly chunks: Buffer[] = [];

  setHeader(name: string, value: string | number | readonly string[]): this {
    this.headers.set(name.toLowerCase(), value);
    return this;
  }

  getHeader(name: string): string | number | readonly string[] | undefined {
    return this.headers.get(name.toLowerCase());
  }

  get body(): string {
    return Buffer.concat(this.chunks).toString("utf8");
  }

  _write(
    chunk: Buffer | string,
    encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
    callback();
  }
}

interface TestResponse {
  status: number;
  headers: MemoryResponse["headers"];
  text: string;
  json: () => unknown;
}

describe("LessonProof native request handler", () => {
  let handler: LessonProofRequestHandler;
  let tempRoot: string;
  let distDir: string;

  beforeEach(() => {
    tempRoot = mkdtempSync("/tmp/lessonproof-server-");
    distDir = join(tempRoot, "dist");
    mkdirSync(join(distDir, "assets"), { recursive: true });
    writeFileSync(
      join(distDir, "index.html"),
      "<!doctype html><title>LessonProof test shell</title>",
      "utf8",
    );
    writeFileSync(join(distDir, "assets", "app.js"), "export {};", "utf8");

    handler = createLessonProofRequestHandler({
      engine: new LessonProofEngine({
        fixture: loadFixture(),
        planner: new FixtureRepairPlanner(),
        clock: () => "2026-07-18T12:00:00.000Z",
      }),
      distDir,
    });
  });

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
  });

  async function requestHandler(
    targetHandler: LessonProofRequestHandler,
    path: string,
    options: {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
    } = {},
  ): Promise<TestResponse> {
    const request = Readable.from(options.body ? [options.body] : []) as Readable &
      Partial<IncomingMessage>;
    request.method = options.method ?? "GET";
    request.url = path;
    request.headers = Object.fromEntries(
      Object.entries(options.headers ?? {}).map(([name, value]) => [
        name.toLowerCase(),
        value,
      ]),
    );

    const response = new MemoryResponse();
    const finished = new Promise<void>((resolve, reject) => {
      response.once("finish", resolve);
      response.once("error", reject);
    });
    await targetHandler(
      request as unknown as IncomingMessage,
      response as unknown as ServerResponse,
    );
    await finished;

    return {
      status: response.statusCode,
      headers: response.headers,
      text: response.body,
      json: () => JSON.parse(response.body) as unknown,
    };
  }

  async function requestApp(
    path: string,
    options: {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
    } = {},
  ): Promise<TestResponse> {
    return requestHandler(handler, path, options);
  }

  async function post(
    path: string,
    body: Record<string, unknown>,
    options: {
      handler?: LessonProofRequestHandler;
      headers?: Record<string, string>;
    } = {},
  ) {
    return requestHandler(options.handler ?? handler, path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
      body: JSON.stringify(body),
    });
  }

  function cookieFrom(response: TestResponse): string {
    const setCookie = response.headers.get("set-cookie");
    expect(typeof setCookie).toBe("string");
    return String(setCookie).split(";", 1)[0];
  }

  function createEngine(planner: RepairPlanner = new FixtureRepairPlanner()) {
    return new LessonProofEngine({
      fixture: loadFixture(),
      planner,
      clock: () => "2026-07-18T12:00:00.000Z",
    });
  }

  function liveFixturePlanner(
    onPlan: () => void = () => undefined,
  ): RepairPlanner {
    const fixturePlanner = new FixtureRepairPlanner();
    return {
      mode: "openai",
      model: "gpt-5.6-test",
      keyConfigured: true,
      plan: async (input) => {
        onPlan();
        const result = await fixturePlanner.plan(input);
        return {
          ...result,
          trace: {
            mode: "openai",
            model: "gpt-5.6-test",
            responseId: "resp_server_test",
          },
        };
      },
    };
  }

  it("exposes health and the raw deterministic demo snapshot", async () => {
    const health = await requestApp("/api/health");
    expect(health.headers.get("content-security-policy")).toContain(
      "default-src 'self'",
    );
    expect(health.headers.get("permissions-policy")).toContain("camera=()");
    expect(health.json()).toEqual({
      ok: true,
      mode: "fixture",
      model: "deterministic-fixture-v1",
      keyConfigured: false,
    });

    const response = await requestApp("/api/demo", {
      headers: { Host: "[malformed-host-is-ignored" },
    });
    const snapshot = response.json() as SessionSnapshot;
    expect(response.status).toBe(200);
    expect(snapshot.sessionId).toBe("demo-inverse-sine");
    expect(snapshot.release.hash).toBe(snapshot.baselineHash);
    expect("state" in snapshot).toBe(false);
  });

  it("fails readiness when live mode is configured without an API key", async () => {
    const unreadyHandler = createLessonProofRequestHandler({
      distDir,
      env: {
        LESSONPROOF_PLANNER_MODE: "openai",
        OPENAI_MODEL: "gpt-5.6-sol",
      },
    });

    const health = await requestHandler(unreadyHandler, "/api/health");
    expect(health.status).toBe(503);
    expect(health.json()).toEqual({
      ok: false,
      mode: "openai",
      model: "gpt-5.6-sol",
      keyConfigured: false,
    });
  });

  it("runs the complete approval-gated API journey and guarded undo", async () => {
    const initial = (await requestApp("/api/demo")).json() as SessionSnapshot;
    const analyzed = (
      await post("/api/analyze", {
        correction: initial.defaultCorrection,
        releaseHash: initial.release.hash,
      })
    ).json() as SessionSnapshot;
    expect(analyzed.gate).toBe("REPAIR_PROPOSED");

    const premature = await post("/api/apply", {
      planId: analyzed.plan!.id,
      releaseHash: analyzed.release.hash,
    });
    expect(premature.status).toBe(409);
    expect(premature.json()).toEqual({
      error: expect.objectContaining({ code: "APPROVAL_REQUIRED" }),
    });

    const approved = (
      await post("/api/approve", {
        planId: analyzed.plan!.id,
        releaseHash: analyzed.release.hash,
      })
    ).json() as SessionSnapshot;
    const applied = (
      await post("/api/apply", {
        planId: approved.plan!.id,
        releaseHash: approved.release.hash,
      })
    ).json() as SessionSnapshot;

    expect(applied.gate).toBe("READY");
    expect(applied.checks.every((check) => check.status === "pass")).toBe(true);
    expect(applied.journal[0].afterHash).toBe(applied.release.hash);

    const undone = (
      await post("/api/undo", {
        journalId: applied.journal[0].id,
        expectedCurrentHash: applied.release.hash,
      })
    ).json() as SessionSnapshot;
    expect(undone.release.hash).toBe(initial.release.hash);
    expect(undone.journal[0].status).toBe("undone");
  });

  it("returns typed JSON errors and keeps API routes ahead of SPA fallback", async () => {
    const noContentType = await requestApp("/api/demo/reset", {
      method: "POST",
      body: "{}",
    });
    expect(noContentType.status).toBe(415);
    expect(noContentType.json()).toEqual({
      error: expect.objectContaining({ code: "JSON_REQUIRED" }),
    });

    const missingApi = await requestApp("/api/not-a-route");
    expect(missingApi.status).toBe(404);
    expect(missingApi.headers.get("content-type")).toContain("application/json");
    expect(missingApi.json()).toEqual({
      error: expect.objectContaining({ code: "API_ROUTE_NOT_FOUND" }),
    });
  });

  it("serves built assets and uses index.html as the client-history fallback", async () => {
    const asset = await requestApp("/assets/app.js");
    expect(asset.status).toBe(200);
    expect(asset.headers.get("content-type")).toContain("text/javascript");
    expect(asset.text).toBe("export {};");

    const historyRoute = await requestApp("/release/inverse-sine");
    expect(historyRoute.status).toBe(200);
    expect(historyRoute.headers.get("content-type")).toContain("text/html");
    expect(historyRoute.text).toContain("LessonProof test shell");
  });

  it("rejects stale hashes through the stable error envelope", async () => {
    const response = await post("/api/analyze", {
      correction: loadFixture().defaultCorrection,
      releaseHash: "stale",
    });
    const payload = response.json() as {
      error: { code: string; details: Record<string, unknown> };
    };

    expect(response.status).toBe(409);
    expect(payload.error.code).toBe("STALE_RELEASE_HASH");
    expect(payload.error.details).toHaveProperty("actual");
  });

  it("issues opaque protected cookies and isolates workflow state per browser", async () => {
    const contexts: EngineFactoryContext[] = [];
    const sessionHandler = createLessonProofRequestHandler({
      distDir,
      engineFactory: (context) => {
        contexts.push(context);
        return createEngine();
      },
      session: {
        secureCookie: true,
        ttlMs: 30_000,
        maxSessions: 3,
      },
    });

    const initialA = await requestHandler(sessionHandler, "/api/demo");
    const cookieA = cookieFrom(initialA);
    expect(initialA.headers.get("set-cookie")).toMatch(
      /^lessonproof_session=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; SameSite=Strict; Max-Age=30; Secure$/,
    );

    const stateA = initialA.json() as SessionSnapshot;
    const analyzedA = await post(
      "/api/analyze",
      {
        correction: stateA.defaultCorrection,
        releaseHash: stateA.release.hash,
      },
      { handler: sessionHandler, headers: { Cookie: cookieA } },
    );
    expect((analyzedA.json() as SessionSnapshot).gate).toBe("REPAIR_PROPOSED");

    const initialB = await requestHandler(sessionHandler, "/api/demo");
    const cookieB = cookieFrom(initialB);
    expect(cookieB).not.toBe(cookieA);
    expect((initialB.json() as SessionSnapshot).gate).toBe("BLOCKED");

    const rereadA = await requestHandler(sessionHandler, "/api/demo", {
      headers: { Cookie: cookieA },
    });
    expect((rereadA.json() as SessionSnapshot).gate).toBe("REPAIR_PROPOSED");

    const sessionContexts = contexts.filter(
      (context) => context.sessionId !== "health-probe",
    );
    expect(sessionContexts).toHaveLength(2);
    expect(sessionContexts.every((context) => /^lp_[a-f0-9]{32}$/.test(context.safetyIdentifier))).toBe(true);
    expect(sessionContexts.every((context) => !cookieA.includes(context.safetyIdentifier))).toBe(true);
  });

  it("expires idle sessions and evicts the least-recent session at the cap", async () => {
    let now = 1_000;
    const boundedHandler = createLessonProofRequestHandler({
      distDir,
      engineFactory: () => createEngine(),
      session: {
        now: () => now,
        secureCookie: false,
        ttlMs: 1_000,
        maxSessions: 1,
      },
    });

    const initialA = await requestHandler(boundedHandler, "/api/demo");
    const cookieA = cookieFrom(initialA);
    const stateA = initialA.json() as SessionSnapshot;
    await post(
      "/api/analyze",
      {
        correction: stateA.defaultCorrection,
        releaseHash: stateA.release.hash,
      },
      { handler: boundedHandler, headers: { Cookie: cookieA } },
    );

    now += 1;
    const initialB = await requestHandler(boundedHandler, "/api/demo");
    expect(cookieFrom(initialB)).not.toBe(cookieA);

    const evictedA = await requestHandler(boundedHandler, "/api/demo", {
      headers: { Cookie: cookieA },
    });
    const replacementCookie = cookieFrom(evictedA);
    expect(replacementCookie).not.toBe(cookieA);
    expect((evictedA.json() as SessionSnapshot).gate).toBe("BLOCKED");

    now += 1_000;
    const expired = await requestHandler(boundedHandler, "/api/demo", {
      headers: { Cookie: replacementCookie },
    });
    expect(cookieFrom(expired)).not.toBe(replacementCookie);
    expect((expired.json() as SessionSnapshot).gate).toBe("BLOCKED");
  });

  it("enforces live per-session and global sliding-window analysis limits", async () => {
    let plannerCalls = 0;
    const limitedHandler = createLessonProofRequestHandler({
      distDir,
      engineFactory: () =>
        createEngine(liveFixturePlanner(() => {
          plannerCalls += 1;
        })),
      analysisLimits: {
        now: () => 1_000,
        windowMs: 60_000,
        perSessionMax: 1,
        globalMax: 2,
        maxConcurrent: 2,
      },
    });

    async function newBrowser() {
      const response = await requestHandler(limitedHandler, "/api/demo");
      return {
        cookie: cookieFrom(response),
        state: response.json() as SessionSnapshot,
      };
    }

    async function analyzeBrowser(browser: Awaited<ReturnType<typeof newBrowser>>) {
      return post(
        "/api/analyze",
        {
          correction: browser.state.defaultCorrection,
          releaseHash: browser.state.release.hash,
        },
        { handler: limitedHandler, headers: { Cookie: browser.cookie } },
      );
    }

    const browserA = await newBrowser();
    expect((await analyzeBrowser(browserA)).status).toBe(200);
    const perSessionRejected = await analyzeBrowser(browserA);
    expect(perSessionRejected.status).toBe(429);
    expect(perSessionRejected.headers.get("retry-after")).toBe("60");
    expect(perSessionRejected.json()).toEqual({
      error: expect.objectContaining({ code: "ANALYSIS_RATE_LIMITED" }),
    });

    const browserB = await newBrowser();
    expect((await analyzeBrowser(browserB)).status).toBe(200);
    const browserC = await newBrowser();
    const globalRejected = await analyzeBrowser(browserC);
    expect(globalRejected.status).toBe(429);
    expect(globalRejected.headers.get("retry-after")).toBe("60");
    expect(plannerCalls).toBe(2);
  });

  it("bounds concurrent live analyses across browser sessions", async () => {
    let releaseFirstPlan: (() => void) | undefined;
    const firstPlanGate = new Promise<void>((resolve) => {
      releaseFirstPlan = resolve;
    });
    let plannerCalls = 0;
    const fixturePlanner = new FixtureRepairPlanner();
    const concurrentPlanner: RepairPlanner = {
      mode: "openai",
      model: "gpt-5.6-test",
      keyConfigured: true,
      plan: async (input) => {
        plannerCalls += 1;
        if (plannerCalls === 1) {
          await firstPlanGate;
        }
        const result = await fixturePlanner.plan(input);
        return {
          ...result,
          trace: {
            mode: "openai",
            model: "gpt-5.6-test",
            responseId: `resp_concurrency_${plannerCalls}`,
          },
        };
      },
    };
    const concurrentHandler = createLessonProofRequestHandler({
      distDir,
      engineFactory: () => createEngine(concurrentPlanner),
      analysisLimits: {
        perSessionMax: 4,
        globalMax: 10,
        maxConcurrent: 1,
      },
    });

    const initialA = await requestHandler(concurrentHandler, "/api/demo");
    const initialB = await requestHandler(concurrentHandler, "/api/demo");
    const stateA = initialA.json() as SessionSnapshot;
    const stateB = initialB.json() as SessionSnapshot;

    const pendingA = post(
      "/api/analyze",
      {
        correction: stateA.defaultCorrection,
        releaseHash: stateA.release.hash,
      },
      {
        handler: concurrentHandler,
        headers: { Cookie: cookieFrom(initialA) },
      },
    );
    await vi.waitFor(() => expect(plannerCalls).toBe(1));

    const rejectedB = await post(
      "/api/analyze",
      {
        correction: stateB.defaultCorrection,
        releaseHash: stateB.release.hash,
      },
      {
        handler: concurrentHandler,
        headers: { Cookie: cookieFrom(initialB) },
      },
    );
    expect(rejectedB.status).toBe(429);
    expect(rejectedB.json()).toEqual({
      error: expect.objectContaining({ code: "ANALYSIS_CONCURRENCY_LIMITED" }),
    });
    expect(rejectedB.headers.get("retry-after")).toBe("1");

    releaseFirstPlan?.();
    expect((await pendingA).status).toBe(200);
    expect(plannerCalls).toBe(1);
  });

  it("rejects cross-site mutations before reading or changing session state", async () => {
    const sessionHandler = createLessonProofRequestHandler({
      distDir,
      engineFactory: () => createEngine(),
    });
    const initial = await requestHandler(sessionHandler, "/api/demo");
    const state = initial.json() as SessionSnapshot;
    const cookie = cookieFrom(initial);

    const rejected = await post(
      "/api/analyze",
      {
        correction: state.defaultCorrection,
        releaseHash: state.release.hash,
      },
      {
        handler: sessionHandler,
        headers: {
          Cookie: cookie,
          Host: "lessonproof.example",
          Origin: "https://evil.example",
          "Sec-Fetch-Site": "cross-site",
          "X-Forwarded-Proto": "https",
        },
      },
    );
    expect(rejected.status).toBe(403);
    expect(rejected.headers.get("set-cookie")).toBeUndefined();
    expect(rejected.json()).toEqual({
      error: expect.objectContaining({ code: "CROSS_SITE_MUTATION_REJECTED" }),
    });

    const unchanged = await requestHandler(sessionHandler, "/api/demo", {
      headers: { Cookie: cookie },
    });
    expect((unchanged.json() as SessionSnapshot).gate).toBe("BLOCKED");

    const allowed = await post(
      "/api/analyze",
      {
        correction: state.defaultCorrection,
        releaseHash: state.release.hash,
      },
      {
        handler: sessionHandler,
        headers: {
          Cookie: cookie,
          Host: "lessonproof.example",
          Origin: "https://lessonproof.example",
          "Sec-Fetch-Site": "same-origin",
          "X-Forwarded-Proto": "https",
        },
      },
    );
    expect(allowed.status).toBe(200);
    expect((allowed.json() as SessionSnapshot).gate).toBe("REPAIR_PROPOSED");
  });
});
