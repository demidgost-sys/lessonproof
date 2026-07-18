// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import type { LessonProofApi } from "./api";
import type { WorkflowState } from "./types";

const baselineHash = "sha256:1111111111111111111111111111111111111111111111111111111111111111";
const proofHash = "sha256:2222222222222222222222222222222222222222222222222222222222222222";

const initialState: WorkflowState = {
  mode: "fixture",
  model: "gpt-5.6-sol",
  phase: "correction",
  release: {
    id: "inverse-sine-mini-lesson",
    title: "Inverse notation without the reciprocal trap",
    lesson: "Inverse notation without the reciprocal trap",
    version: "v1",
    status: "ready",
    gateLabel: "READY",
    baselineHash,
    currentHash: baselineHash,
    synthetic: true,
  },
  correction: {
    text: "At 03:24, replace ‘sin⁻¹(x) = 1/sin(x)’ with ‘sin⁻¹(x) = arcsin(x)’.",
    authorRole: "Demo reviewer",
  },
  evidence: [
    {
      id: "caption-anchor",
      sourceLabel: "en.vtt",
      locator: "00:03:23 → 00:03:28",
      excerpt: "Remember: sin⁻¹(x) = 1/sin(x).",
      kind: "caption",
    },
  ],
  plan: null,
  proof: null,
  permissions: {
    canAnalyze: true,
    canApprove: false,
    canApply: false,
    canUndo: false,
    canReset: true,
  },
};

const proposedState: WorkflowState = {
  ...initialState,
  phase: "repair",
  release: { ...initialState.release, status: "blocked", gateLabel: "REPAIR PROPOSED" },
  plan: {
    id: "plan-1",
    plannerModel: "deterministic-fixture-v1",
    status: "proposed",
    blocked: false,
    summary: "Correct one caption claim and rebuild only its dependent artifacts.",
    rationale: "2 evidence anchors validated",
    evidenceIds: ["caption-anchor"],
    changes: [
      {
        id: "patch-1",
        artifact: "en.vtt",
        locator: "captions/en.vtt",
        before: "sin⁻¹(x) = 1/sin(x)",
        after: "sin⁻¹(x) = arcsin(x)",
      },
    ],
    staleArtifacts: ["Caption burn-in manifest", "Release package manifest"],
    checks: [
      {
        id: "source_immutable",
        label: "Checked source remains immutable",
        detail: "Runs after approval.",
        status: "pending",
      },
    ],
  },
  permissions: {
    canAnalyze: false,
    canApprove: true,
    canApply: false,
    canUndo: false,
    canReset: true,
  },
};

const approvedState: WorkflowState = {
  ...proposedState,
  release: { ...proposedState.release, gateLabel: "APPROVED" },
  plan: proposedState.plan ? { ...proposedState.plan, status: "approved" } : null,
  permissions: {
    canAnalyze: false,
    canApprove: false,
    canApply: true,
    canUndo: false,
    canReset: true,
  },
};

const verifiedState: WorkflowState = {
  ...approvedState,
  phase: "proof",
  release: {
    ...approvedState.release,
    version: "v2",
    status: "verified",
    gateLabel: "VERIFIED",
    currentHash: proofHash,
  },
  proof: {
    journalId: "journal-1",
    hash: proofHash,
    previousHash: baselineHash,
    releaseVersion: "v2",
    verifiedAt: "2026-07-18T12:30:00.000Z",
    checks: [
      {
        id: "correction_applied",
        label: "Expert correction is present",
        detail: "The patched caption matches the bounded correction.",
        status: "pass",
      },
    ],
  },
  permissions: {
    canAnalyze: false,
    canApprove: false,
    canApply: false,
    canUndo: true,
    canReset: true,
  },
};

function apiMock(): LessonProofApi {
  return {
    getState: vi.fn().mockResolvedValue(initialState),
    analyze: vi.fn().mockResolvedValue(proposedState),
    approve: vi.fn().mockResolvedValue(approvedState),
    apply: vi.fn().mockResolvedValue(verifiedState),
    undo: vi.fn().mockResolvedValue(initialState),
    reset: vi.fn().mockResolvedValue(initialState),
  };
}

afterEach(() => {
  cleanup();
});

describe("LessonProof evidence cockpit", () => {
  it("loads the synthetic release with visible provenance and model mode", async () => {
    render(<App api={apiMock()} />);

    expect(await screen.findByRole("heading", { name: /ship the lesson/i })).toBeTruthy();
    expect(screen.getByTestId("ai-mode").textContent).toContain("Deterministic fixture");
    expect(screen.getByTestId("release-gate").textContent).toContain("READY");
    expect(screen.getByText("00:03:23 → 00:03:28")).toBeTruthy();
    expect(screen.getAllByText(/sin⁻¹\(x\) = 1\/sin\(x\)/)).toHaveLength(2);
  });

  it("keeps analyze, human approval, apply, and guarded undo as separate actions", async () => {
    const api = apiMock();
    const user = userEvent.setup();
    render(<App api={api} />);

    await user.click(await screen.findByRole("button", { name: "Analyze correction" }));

    await waitFor(() => expect(api.analyze).toHaveBeenCalledWith({
      correction: initialState.correction.text,
      releaseHash: baselineHash,
    }));
    expect((await screen.findByTestId("plan-diff")).textContent).toContain("sin⁻¹(x) = arcsin(x)");
    expect(screen.getByTestId("plan-origin").textContent).toBe("Deterministic fixture");

    await user.click(screen.getByRole("button", { name: "Approve bounded repair" }));
    await waitFor(() => expect(api.approve).toHaveBeenCalledWith({
      planId: "plan-1",
      releaseHash: baselineHash,
    }));
    expect(await screen.findByText("Ready for verification")).toBeTruthy();

    await user.click(await screen.findByRole("button", { name: "Apply approved patch & verify" }));
    await waitFor(() => expect(api.apply).toHaveBeenCalledWith({
      planId: "plan-1",
      releaseHash: baselineHash,
    }));

    expect(await screen.findByText("Release verified")).toBeTruthy();
    expect(screen.getByTestId("proof-hash").textContent).toContain(proofHash);
    expect(screen.getByRole("button", { name: "Applied & verified" })).toBeTruthy();
    expect(
      screen.getByText("The hash-bound plan passed all six checks. The model never certified its own proposal."),
    ).toBeTruthy();
    expect(screen.getByText("18 Jul 2026, 12:30 UTC")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Undo verified change" }));
    await waitFor(() => expect(api.undo).toHaveBeenCalledWith({
      journalId: "journal-1",
      expectedCurrentHash: proofHash,
    }));
  });

  it("refreshes fail-closed state without discarding an unsent correction", async () => {
    const blockedState: WorkflowState = {
      ...initialState,
      release: {
        ...initialState.release,
        status: "blocked",
        gateLabel: "BLOCKED",
      },
      notice: "The planning request stopped without changing the release.",
    };
    const api = apiMock();
    vi.mocked(api.getState)
      .mockResolvedValueOnce(initialState)
      .mockResolvedValueOnce(blockedState);
    vi.mocked(api.analyze).mockRejectedValueOnce(
      new Error("GPT-5.6 planning timed out."),
    );
    const user = userEvent.setup();
    render(<App api={api} />);

    const draft = "Keep this draft while the live analysis limit recovers.";
    const correction = await screen.findByLabelText("Expert correction");
    await user.clear(correction);
    await user.type(correction, draft);
    await user.click(await screen.findByRole("button", { name: "Analyze correction" }));

    expect(await screen.findByText("GPT-5.6 planning timed out.")).toBeTruthy();
    await waitFor(() => expect(api.getState).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId("release-gate").textContent).toContain("BLOCKED");
    expect(
      screen.getByText("The planning request stopped without changing the release."),
    ).toBeTruthy();
    expect((screen.getByLabelText("Expert correction") as HTMLTextAreaElement).value).toBe(
      draft,
    );
  });
});
