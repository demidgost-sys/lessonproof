// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import type { LessonProofApi } from "./api";
import type { CheckResult, WorkflowState } from "./types";

const baselineHash = "sha256:1111111111111111111111111111111111111111111111111111111111111111";
const proofHash = "sha256:2222222222222222222222222222222222222222222222222222222222222222";

const pendingChecks: CheckResult[] = [
  { id: "evidence_unique", label: "Evidence is exact and unique", detail: "Runs after approval.", status: "pending" },
  { id: "editable_path_only", label: "Patch stays inside editable paths", detail: "Runs after approval.", status: "pending" },
  { id: "source_immutable", label: "Checked source remains immutable", detail: "Runs after approval.", status: "pending" },
  { id: "correction_applied", label: "Correction is applied exactly once", detail: "Runs after approval.", status: "pending" },
  { id: "derived_artifacts_current", label: "Dependency proof records are current", detail: "Runs after approval.", status: "pending" },
  { id: "release_hash_changed", label: "Release proof hash changed", detail: "Runs after approval.", status: "pending" },
];

const passedChecks: CheckResult[] = [
  { id: "evidence_unique", label: "Evidence is exact and unique", detail: "2 exact evidence anchors resolved before mutation.", status: "pass" },
  { id: "editable_path_only", label: "Patch stays inside editable paths", detail: "1 patch target stayed inside the release edit allowlist.", status: "pass" },
  { id: "source_immutable", label: "Checked source remains immutable", detail: "Checked teaching-source bytes are unchanged.", status: "pass" },
  { id: "correction_applied", label: "Correction is applied exactly once", detail: "The approved replacement is present exactly once.", status: "pass" },
  { id: "derived_artifacts_current", label: "Dependency proof records are current", detail: "2 dependency proof records have recomputed hashes that match current dependencies.", status: "pass" },
  { id: "release_hash_changed", label: "Release proof hash changed", detail: "The release hash changed after apply.", status: "pass" },
];

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
  release: { ...initialState.release, status: "blocked", gateLabel: "SUGGESTION READY" },
  plan: {
    id: "plan-1",
    plannerModel: "deterministic-fixture-v1",
    status: "proposed",
    blocked: false,
    summary: "Correct one caption claim and recompute only its affected dependency proof records.",
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
    checks: pendingChecks,
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
    checks: passedChecks,
  },
  permissions: {
    canAnalyze: false,
    canApprove: false,
    canApply: false,
    canUndo: true,
    canReset: true,
  },
};

const liveInitialState: WorkflowState = {
  ...initialState,
  mode: "live",
};

const liveProposedState: WorkflowState = {
  ...proposedState,
  mode: "live",
  plan: proposedState.plan
    ? { ...proposedState.plan, plannerModel: "gpt-5.6-sol" }
    : null,
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

describe("LessonProof Proof Ledger", () => {
  it("loads the synthetic release with visible provenance and model mode", async () => {
    const user = userEvent.setup();
    render(<App api={apiMock()} />);

    expect(await screen.findByRole("heading", { name: /lessonproof release review/i })).toBeTruthy();
    expect(screen.getByTestId("ai-mode").textContent).toContain("Built-in demo · no AI call");
    expect(screen.getByTestId("release-gate").textContent).toContain("Evidence anchored");
    expect(screen.getByTestId("release-gate").textContent).toContain("1 exact evidence item");
    expect(screen.getByTestId("release-gate").textContent).toContain("Suggestion locked");
    expect(screen.getByText("The built-in demo shows one safe suggestion. No AI call is made.")).toBeTruthy();
    expect(screen.getByLabelText("What should change?").getAttribute("aria-describedby")).toBe(
      "correction-help correction-count",
    );
    const evidenceDetails = screen.getByTestId("evidence-technical-details") as HTMLDetailsElement;
    expect(evidenceDetails.open).toBe(false);
    const evidenceSummary = evidenceDetails.querySelector("summary")!;
    evidenceSummary.focus();
    expect(document.activeElement).toBe(evidenceSummary);
    await user.click(evidenceSummary);
    expect(evidenceDetails.open).toBe(true);
    expect(evidenceDetails.textContent).toContain("00:03:23 → 00:03:28");
    expect(screen.getAllByText(/sin⁻¹\(x\) = 1\/sin\(x\)/).length).toBeGreaterThanOrEqual(2);
  });

  it("keeps analyze, human approval, apply, and guarded undo as separate actions", async () => {
    const api = apiMock();
    const user = userEvent.setup();
    render(<App api={api} />);

    await user.click(await screen.findByRole("button", { name: "Show a safe suggestion" }));

    await waitFor(() => expect(api.analyze).toHaveBeenCalledWith({
      correction: initialState.correction.text,
      releaseHash: baselineHash,
    }));
    expect((await screen.findByTestId("plan-diff")).textContent).toContain("sin⁻¹(x) = arcsin(x)");
    expect(screen.getByTestId("plan-origin").textContent).toBe("Built-in demo");
    expect(screen.getByTestId("release-gate").textContent).toContain("SUGGESTION READY");
    expect(screen.getByText("Review demo suggestion")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reject suggestion" })).toBeTruthy();
    expect((screen.getByTestId("plan-technical-details") as HTMLDetailsElement).open).toBe(false);

    await user.click(screen.getByRole("button", { name: "Approve this exact change" }));
    await waitFor(() => expect(api.approve).toHaveBeenCalledWith({
      planId: "plan-1",
      releaseHash: baselineHash,
    }));
    expect(await screen.findByText("Ready for final checks")).toBeTruthy();
    expect(screen.getByText("You approved this exact change. The synthetic release has not changed yet.")).toBeTruthy();

    await user.click(await screen.findByRole("button", { name: "Apply change & run 6 checks" }));
    await waitFor(() => expect(api.apply).toHaveBeenCalledWith({
      planId: "plan-1",
      releaseHash: baselineHash,
    }));

    expect((await screen.findAllByText("Change verified")).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId("proof-hash").textContent).toContain(proofHash);
    expect(screen.getByRole("button", { name: "Change verified" })).toBeTruthy();
    expect(screen.getByTestId("verified-outcome").textContent).toContain(
      "1 caption fixed. 2 dependency proofs recomputed. 6 of 6 checks passed.",
    );
    expect(
      screen.getByText("Your approved change is present, the declared dependency proof records are current, and every check passed."),
    ).toBeTruthy();
    expect(
      screen.getByText("It does not prove that the formula is true. It verifies that this approved change is present in this release version and that the declared dependency proof records are current."),
    ).toBeTruthy();
    const proofDetails = screen.getByTestId("proof-technical-details") as HTMLDetailsElement;
    expect(proofDetails.open).toBe(false);
    await user.click(proofDetails.querySelector("summary")!);
    expect(proofDetails.open).toBe(true);
    expect(screen.getAllByText("18 Jul 2026, 12:30 UTC").length).toBeGreaterThanOrEqual(1);

    await user.click(screen.getByRole("button", { name: "Undo verified change" }));
    await waitFor(() => expect(api.undo).toHaveBeenCalledWith({
      journalId: "journal-1",
      expectedCurrentHash: proofHash,
    }));
  });

  it("shows live GPT-5.6 provenance before and after requesting a suggestion", async () => {
    const api = apiMock();
    vi.mocked(api.getState).mockResolvedValueOnce(liveInitialState);
    vi.mocked(api.analyze).mockResolvedValueOnce(liveProposedState);
    const user = userEvent.setup();
    render(<App api={api} />);

    expect((await screen.findByTestId("ai-mode")).textContent).toContain("gpt-5.6-sol live");
    const requestButton = screen.getByRole("button", { name: "Ask GPT-5.6 for a suggestion" });
    await user.click(requestButton);

    await waitFor(() => expect(api.analyze).toHaveBeenCalledWith({
      correction: liveInitialState.correction.text,
      releaseHash: baselineHash,
    }));
    expect((await screen.findByTestId("plan-origin")).textContent).toBe("gpt-5.6-sol live");
    expect(screen.getByText("Review GPT-5.6 suggestion")).toBeTruthy();
  });

  it("refreshes fail-closed state without discarding an unsent correction", async () => {
    const blockedState: WorkflowState = {
      ...initialState,
      release: {
        ...initialState.release,
        status: "blocked",
        gateLabel: "BLOCKED",
      },
      notice: "The suggestion request stopped without changing the release. Request a suggestion again.",
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
    const correction = await screen.findByLabelText("What should change?");
    await user.clear(correction);
    await user.type(correction, draft);
    await user.click(await screen.findByRole("button", { name: "Show a safe suggestion" }));

    expect(await screen.findByText("GPT-5.6 planning timed out.")).toBeTruthy();
    await waitFor(() => expect(api.getState).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId("release-gate").textContent).toContain("BLOCKED");
    expect(
      screen.getByText("The suggestion request stopped without changing the release. Request a suggestion again."),
    ).toBeTruthy();
    expect((screen.getByLabelText("What should change?") as HTMLTextAreaElement).value).toBe(
      draft,
    );
  });
});
