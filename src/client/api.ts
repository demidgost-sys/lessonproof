import type { WorkflowState } from "./types";
import type { SessionSnapshot } from "../domain/types";
import { adaptSnapshot } from "./snapshotAdapter";

type WireState = WorkflowState | SessionSnapshot;
type StateEnvelope = WireState | { state: WireState } | { snapshot: WireState };

export interface LessonProofApi {
  getState(): Promise<WorkflowState>;
  analyze(input: { correction: string; releaseHash: string }): Promise<WorkflowState>;
  approve(input: { planId: string; releaseHash: string }): Promise<WorkflowState>;
  apply(input: { planId: string; releaseHash: string }): Promise<WorkflowState>;
  undo(input: { journalId: string; expectedCurrentHash: string }): Promise<WorkflowState>;
  reset(): Promise<WorkflowState>;
}

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function isSnapshot(payload: WireState): payload is SessionSnapshot {
  return "sessionId" in payload && "gate" in payload && "journal" in payload;
}

function unwrapState(payload: StateEnvelope): WorkflowState {
  const unwrapped = "state" in payload
    ? payload.state
    : "snapshot" in payload
      ? payload.snapshot
      : payload;

  return isSnapshot(unwrapped) ? adaptSnapshot(unwrapped) : unwrapped;
}

async function request(path: string, init?: RequestInit): Promise<WorkflowState> {
  const response = await fetch(path, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;

    try {
      const payload = (await response.json()) as {
        error?: string | { code?: string; message?: string; details?: unknown };
        message?: string;
      };
      message = typeof payload.error === "string"
        ? payload.error
        : payload.error?.message ?? payload.message ?? message;
    } catch {
      // The status is still actionable when the server has no JSON body.
    }

    throw new ApiError(message, response.status);
  }

  return unwrapState((await response.json()) as StateEnvelope);
}

export function createApiClient(): LessonProofApi {
  return {
    getState: () => request("/api/demo"),
    analyze: ({ correction, releaseHash }) =>
      request("/api/analyze", {
        method: "POST",
        body: JSON.stringify({ correction, releaseHash }),
      }),
    approve: ({ planId, releaseHash }) =>
      request("/api/approve", {
        method: "POST",
        body: JSON.stringify({ planId, releaseHash }),
      }),
    apply: ({ planId, releaseHash }) =>
      request("/api/apply", {
        method: "POST",
        body: JSON.stringify({ planId, releaseHash }),
      }),
    undo: ({ journalId, expectedCurrentHash }) =>
      request("/api/undo", {
        method: "POST",
        body: JSON.stringify({ journalId, expectedCurrentHash }),
      }),
    reset: () =>
      request("/api/demo/reset", {
        method: "POST",
        body: JSON.stringify({}),
      }),
  };
}
