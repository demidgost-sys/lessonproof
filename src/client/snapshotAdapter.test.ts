import { describe, expect, it } from "vitest";
import type { RepairPlan, SessionSnapshot } from "../domain/types";
import { adaptSnapshot } from "./snapshotAdapter";

const baselineHash = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const afterHash = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function snapshot(overrides: Partial<SessionSnapshot> = {}): SessionSnapshot {
  return {
    sessionId: "demo-inverse-sine",
    mode: "fixture",
    model: "gpt-5.6-sol",
    keyConfigured: false,
    gate: "BLOCKED",
    release: {
      id: "inverse-sine-mini-lesson",
      title: "Inverse notation without the reciprocal trap",
      version: 1,
      hash: baselineHash,
      documents: [
        {
          path: "sources/checked-teaching-note.md",
          role: "source",
          mediaType: "text/markdown",
          content: "sin⁻¹(x) = arcsin(x).",
        },
        {
          path: "captions/en.vtt",
          role: "editable",
          mediaType: "text/vtt",
          content: "00:03:23.000 --> 00:03:28.000\nRemember: sin⁻¹(x) = 1/sin(x).",
        },
      ],
      derivedArtifacts: [
        {
          id: "caption-burnin-manifest",
          label: "Caption burn-in manifest",
          dependsOn: ["captions/en.vtt"],
          state: "current",
          proofHash: baselineHash,
        },
      ],
    },
    baselineHash,
    defaultCorrection: "Correct the inverse sine claim at 03:24.",
    correction: null,
    plan: null,
    checks: [],
    journal: [],
    blockedReason: {
      code: "PENDING_CORRECTION",
      message: "An expert correction is unresolved. Analyze it before release.",
    },
    ...overrides,
  };
}

function repairPlan(state: RepairPlan["state"]): RepairPlan {
  return {
    id: "plan-1",
    releaseHash: baselineHash,
    state,
    verdict: "repairable",
    summary: "Correct the caption claim.",
    blockReason: "",
    confidence: "high",
    evidence: [
      {
        id: "source-1",
        path: "sources/checked-teaching-note.md",
        quote: "sin⁻¹(x) = arcsin(x).",
        role: "source",
        explanation: "Checked mathematical statement.",
      },
    ],
    anchors: [
      {
        id: "source-1",
        path: "sources/checked-teaching-note.md",
        quote: "sin⁻¹(x) = arcsin(x).",
        role: "source",
        explanation: "Checked mathematical statement.",
        start: 0,
        end: 24,
      },
    ],
    patches: [
      {
        path: "captions/en.vtt",
        find: "sin⁻¹(x) = 1/sin(x)",
        replace: "sin⁻¹(x) = arcsin(x)",
        evidenceId: "source-1",
      },
    ],
    invalidates: ["caption-burnin-manifest"],
    checks: ["source_immutable", "correction_applied"],
    trace: { mode: "fixture", model: "gpt-5.6-sol", responseId: null },
    approvedAt: state === "approved" || state === "applied" ? "2026-07-18T12:00:00.000Z" : null,
    appliedAt: state === "applied" ? "2026-07-18T12:01:00.000Z" : null,
  };
}

describe("SessionSnapshot adapter", () => {
  it("derives the initial evidence cockpit from release documents", () => {
    const state = adaptSnapshot(snapshot());

    expect(state.phase).toBe("correction");
    expect(state.release.gateLabel).toBe("BLOCKED");
    expect(state.evidence.map((item) => item.sourceLabel)).toEqual([
      "Checked teaching note",
      "en.vtt",
    ]);
    expect(state.evidence[1]?.locator).toBe("00:03:23 → 00:03:28");
    expect(state.permissions.canAnalyze).toBe(true);
  });

  it("exposes a proposed patch for approval without marking checks as passed", () => {
    const state = adaptSnapshot(snapshot({
      gate: "REPAIR_PROPOSED",
      correction: "Correct the inverse sine claim at 03:24.",
      plan: repairPlan("proposed"),
    }));

    expect(state.phase).toBe("repair");
    expect(state.release.gateLabel).toBe("REPAIR PROPOSED");
    expect(state.plan?.changes[0]).toMatchObject({
      before: "sin⁻¹(x) = 1/sin(x)",
      after: "sin⁻¹(x) = arcsin(x)",
    });
    expect(state.plan?.rationale).toBe("1 evidence anchor validated");
    expect(state.plan?.plannerModel).toBe("gpt-5.6-sol");
    expect(state.plan?.checks.every((check) => check.status === "pending")).toBe(true);
    expect(state.permissions.canApprove).toBe(true);
    expect(state.permissions.canApply).toBe(false);
  });

  it("derives verified proof and hash-guarded undo from an applied journal", () => {
    const state = adaptSnapshot(snapshot({
      gate: "READY",
      plan: repairPlan("applied"),
      release: {
        ...snapshot().release,
        version: 2,
        hash: afterHash,
      },
      checks: [
        {
          id: "correction_applied",
          label: "Expert correction is present",
          status: "pass",
          detail: "The patch is present exactly once.",
        },
      ],
      journal: [
        {
          id: "journal-1",
          planId: "plan-1",
          createdAt: "2026-07-18T12:01:00.000Z",
          beforeHash: baselineHash,
          afterHash,
          patchesApplied: 1,
          status: "applied",
          undoneAt: null,
        },
      ],
    }));

    expect(state.phase).toBe("proof");
    expect(state.release.gateLabel).toBe("VERIFIED");
    expect(state.proof).toMatchObject({
      journalId: "journal-1",
      previousHash: baselineHash,
      hash: afterHash,
    });
    expect(state.permissions.canUndo).toBe(true);
  });
});
