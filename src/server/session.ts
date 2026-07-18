import { createHash, randomBytes } from "node:crypto";

import type { IncomingMessage, ServerResponse } from "node:http";

import { DomainError, type LessonProofEngine } from "../domain";

const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export interface EngineFactoryContext {
  sessionId: string;
  safetyIdentifier: string;
}

export type SessionEngineFactory = (
  context: EngineFactoryContext,
) => LessonProofEngine;

export interface SessionStoreOptions {
  cookieName: string;
  ttlMs: number;
  maxSessions: number;
  secureCookie: boolean;
  now: () => number;
}

const DEFAULT_SESSION_OPTIONS: SessionStoreOptions = {
  cookieName: "lessonproof_session",
  ttlMs: 60 * 60 * 1_000,
  maxSessions: 500,
  secureCookie: process.env.NODE_ENV === "production",
  now: Date.now,
};

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive safe integer.`);
  }
}

function cookieValue(request: IncomingMessage, name: string): string | null {
  const header = request.headers.cookie;
  if (!header) {
    return null;
  }

  for (const pair of header.split(";")) {
    const separator = pair.indexOf("=");
    if (separator === -1 || pair.slice(0, separator).trim() !== name) {
      continue;
    }

    const value = pair.slice(separator + 1).trim();
    return SESSION_ID_PATTERN.test(value) ? value : null;
  }

  return null;
}

function newSessionId(): string {
  return randomBytes(32).toString("base64url");
}

function safetyIdentifier(sessionId: string): string {
  const digest = createHash("sha256").update(sessionId).digest("hex");
  return `lp_${digest.slice(0, 32)}`;
}

export class ServerSession {
  readonly id: string;
  readonly safetyIdentifier: string;
  readonly engine: LessonProofEngine;
  lastSeenAt: number;

  private mutationInProgress = false;

  constructor(
    id: string,
    engineFactory: SessionEngineFactory,
    now: number,
  ) {
    this.id = id;
    this.safetyIdentifier = safetyIdentifier(id);
    this.engine = engineFactory({
      sessionId: id,
      safetyIdentifier: this.safetyIdentifier,
    });
    this.lastSeenAt = now;
  }

  async runMutation<T>(operation: () => Promise<T> | T): Promise<T> {
    if (this.mutationInProgress) {
      throw new DomainError(
        "SESSION_BUSY",
        "Another workflow action is still running for this browser session.",
        409,
      );
    }

    this.mutationInProgress = true;
    try {
      return await operation();
    } finally {
      this.mutationInProgress = false;
    }
  }
}

export class SessionStore {
  private readonly options: SessionStoreOptions;
  private readonly sessions = new Map<string, ServerSession>();

  constructor(
    private readonly engineFactory: SessionEngineFactory,
    options: Partial<SessionStoreOptions> = {},
  ) {
    this.options = { ...DEFAULT_SESSION_OPTIONS, ...options };
    assertPositiveInteger(this.options.ttlMs, "Session ttlMs");
    assertPositiveInteger(this.options.maxSessions, "Session maxSessions");
    if (!/^[A-Za-z0-9_-]+$/.test(this.options.cookieName)) {
      throw new Error("Session cookieName contains unsupported characters.");
    }
  }

  resolve(request: IncomingMessage, response: ServerResponse): ServerSession {
    const now = this.options.now();
    this.removeExpired(now);

    const presentedId = cookieValue(request, this.options.cookieName);
    let session = presentedId ? this.sessions.get(presentedId) : undefined;

    if (!session) {
      this.evictToCapacity();
      let id = newSessionId();
      while (this.sessions.has(id)) {
        id = newSessionId();
      }
      session = new ServerSession(id, this.engineFactory, now);
      this.sessions.set(id, session);
    }

    session.lastSeenAt = now;
    this.setSessionCookie(response, session.id);
    return session;
  }

  get size(): number {
    return this.sessions.size;
  }

  private removeExpired(now: number): void {
    for (const [id, session] of this.sessions) {
      if (now - session.lastSeenAt >= this.options.ttlMs) {
        this.sessions.delete(id);
      }
    }
  }

  private evictToCapacity(): void {
    while (this.sessions.size >= this.options.maxSessions) {
      let oldest: ServerSession | undefined;
      for (const session of this.sessions.values()) {
        if (!oldest || session.lastSeenAt < oldest.lastSeenAt) {
          oldest = session;
        }
      }
      if (!oldest) {
        return;
      }
      this.sessions.delete(oldest.id);
    }
  }

  private setSessionCookie(response: ServerResponse, id: string): void {
    const maxAge = Math.max(1, Math.floor(this.options.ttlMs / 1_000));
    const attributes = [
      `${this.options.cookieName}=${id}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Strict",
      `Max-Age=${maxAge}`,
    ];
    if (this.options.secureCookie) {
      attributes.push("Secure");
    }
    response.setHeader("Set-Cookie", attributes.join("; "));
  }
}

export interface AnalysisLimitOptions {
  windowMs: number;
  perSessionMax: number;
  globalMax: number;
  maxConcurrent: number;
  now: () => number;
}

const DEFAULT_ANALYSIS_LIMITS: AnalysisLimitOptions = {
  windowMs: 60 * 60 * 1_000,
  perSessionMax: 4,
  globalMax: 50,
  maxConcurrent: 2,
  now: Date.now,
};

export class LiveAnalysisGuard {
  private readonly options: AnalysisLimitOptions;
  private readonly sessionAttempts = new Map<string, number[]>();
  private globalAttempts: number[] = [];
  private active = 0;

  constructor(options: Partial<AnalysisLimitOptions> = {}) {
    this.options = { ...DEFAULT_ANALYSIS_LIMITS, ...options };
    assertPositiveInteger(this.options.windowMs, "Analysis windowMs");
    assertPositiveInteger(this.options.perSessionMax, "Analysis perSessionMax");
    assertPositiveInteger(this.options.globalMax, "Analysis globalMax");
    assertPositiveInteger(this.options.maxConcurrent, "Analysis maxConcurrent");
  }

  async run<T>(sessionId: string, operation: () => Promise<T>): Promise<T> {
    const now = this.options.now();
    const cutoff = now - this.options.windowMs;
    this.globalAttempts = this.globalAttempts.filter((time) => time > cutoff);
    for (const [id, attempts] of this.sessionAttempts) {
      const current = attempts.filter((time) => time > cutoff);
      if (current.length > 0) {
        this.sessionAttempts.set(id, current);
      } else {
        this.sessionAttempts.delete(id);
      }
    }
    const sessionAttempts = this.sessionAttempts.get(sessionId) ?? [];

    const sessionRetry = this.retryAfter(
      sessionAttempts,
      this.options.perSessionMax,
      now,
    );
    const globalRetry = this.retryAfter(
      this.globalAttempts,
      this.options.globalMax,
      now,
    );
    if (sessionRetry !== null || globalRetry !== null) {
      const retryAfterSeconds = Math.max(sessionRetry ?? 0, globalRetry ?? 0);
      throw new DomainError(
        "ANALYSIS_RATE_LIMITED",
        "The live analysis limit has been reached. Try again later.",
        429,
        { retryAfterSeconds },
      );
    }

    if (this.active >= this.options.maxConcurrent) {
      throw new DomainError(
        "ANALYSIS_CONCURRENCY_LIMITED",
        "The live analyzer is busy. Try again shortly.",
        429,
        { retryAfterSeconds: 1 },
      );
    }

    sessionAttempts.push(now);
    this.sessionAttempts.set(sessionId, sessionAttempts);
    this.globalAttempts.push(now);
    this.active += 1;

    try {
      return await operation();
    } finally {
      this.active -= 1;
    }
  }

  private retryAfter(
    attempts: number[],
    limit: number,
    now: number,
  ): number | null {
    if (attempts.length < limit) {
      return null;
    }
    const retryAt = attempts[attempts.length - limit] + this.options.windowMs;
    return Math.max(1, Math.ceil((retryAt - now) / 1_000));
  }
}
