import { DomainError } from "./errors";
import { hydrateRelease, loadFixture } from "./fixture";
import {
  cloneRelease,
  computeArtifactProofHash,
  computeReleaseHash,
  sha256,
} from "./hash";
import { createPlannerFromEnv } from "./planners";
import { RawRepairPlanSchema } from "./schema";
import type {
  BlockedReason,
  CheckResult,
  EducationalRelease,
  JournalRecord,
  JournalSummary,
  LessonProofFixture,
  RawRepairPlan,
  RepairPlan,
  RepairPlanner,
  SessionSnapshot,
} from "./types";
import {
  CHECK_LABELS,
  countExactOccurrences,
  detectUntrustedInstruction,
  extractExplicitReplacementIntent,
  validateRepairPlan,
} from "./validation";

export interface LessonProofEngineOptions {
  fixture?: LessonProofFixture;
  planner?: RepairPlanner;
  clock?: () => string;
}

export interface AnalyzeInput {
  correction: string;
  releaseHash: string;
}

export interface PlanActionInput {
  planId: string;
  releaseHash: string;
}

export interface UndoInput {
  journalId: string;
  expectedCurrentHash: string;
}

const MAX_CORRECTION_LENGTH = 2_000;

function rawPlanFrom(plan: RepairPlan): RawRepairPlan {
  return {
    verdict: plan.verdict,
    summary: plan.summary,
    blockReason: plan.blockReason,
    confidence: plan.confidence,
    evidence: structuredClone(plan.evidence),
    patches: structuredClone(plan.patches),
    invalidates: [...plan.invalidates],
    checks: [...plan.checks],
  };
}

function journalSummary(record: JournalRecord): JournalSummary {
  const {
    beforeRelease: _beforeRelease,
    afterRelease: _afterRelease,
    ...summary
  } = record;
  return structuredClone(summary);
}

export class LessonProofEngine {
  readonly planner: RepairPlanner;

  private readonly fixture: LessonProofFixture;
  private readonly clock: () => string;
  private release!: EducationalRelease;
  private baselineHash = "";
  private gate: SessionSnapshot["gate"] = "READY";
  private correction: string | null = null;
  private repairPlan: RepairPlan | null = null;
  private checks: CheckResult[] = [];
  private blockedReason: BlockedReason | null = null;
  private journal: JournalRecord[] = [];
  private journalSequence = 0;
  private operationEpoch = 0;

  constructor(options: LessonProofEngineOptions = {}) {
    this.fixture = options.fixture ?? loadFixture();
    this.planner = options.planner ?? createPlannerFromEnv();
    this.clock = options.clock ?? (() => new Date().toISOString());
    this.reset();
  }

  reset(): SessionSnapshot {
    this.operationEpoch += 1;
    this.release = hydrateRelease(this.fixture.release);
    this.baselineHash = computeReleaseHash(this.release);
    this.gate = "BLOCKED";
    this.correction = this.fixture.defaultCorrection;
    this.repairPlan = null;
    this.checks = [];
    this.blockedReason = {
      code: "PENDING_CORRECTION",
      message: "An expert correction is unresolved. Review it before release.",
    };
    this.journal = [];
    return this.snapshot();
  }

  snapshot(): SessionSnapshot {
    const release = cloneRelease(this.release) as EducationalRelease & {
      hash: string;
    };
    release.hash = computeReleaseHash(this.release);

    return {
      sessionId: this.fixture.sessionId,
      mode: this.planner.mode,
      model: this.planner.model,
      keyConfigured: this.planner.keyConfigured,
      gate: this.gate,
      release,
      baselineHash: this.baselineHash,
      defaultCorrection: this.fixture.defaultCorrection,
      correction: this.correction,
      plan: this.repairPlan ? structuredClone(this.repairPlan) : null,
      checks: structuredClone(this.checks),
      journal: this.journal.map(journalSummary),
      blockedReason: this.blockedReason
        ? structuredClone(this.blockedReason)
        : null,
    };
  }

  async analyze(input: AnalyzeInput): Promise<SessionSnapshot> {
    this.assertCurrentHash(input.releaseHash);
    const correction = input.correction.trim();
    if (correction.length < 8 || correction.length > MAX_CORRECTION_LENGTH) {
      throw new DomainError(
        "INVALID_CORRECTION",
        `Correction must contain 8-${MAX_CORRECTION_LENGTH} characters.`,
        400,
      );
    }

    const analysisEpoch = ++this.operationEpoch;
    this.correction = correction;
    this.repairPlan = null;
    this.checks = [];
    this.blockedReason = null;
    this.gate = "BLOCKED";

    const untrustedInstruction = detectUntrustedInstruction(correction);
    if (untrustedInstruction) {
      this.blockedReason = {
        code: "UNTRUSTED_INSTRUCTION",
        message: untrustedInstruction,
      };
      return this.snapshot();
    }

    const correctionIntent = extractExplicitReplacementIntent(correction);
    if (!correctionIntent) {
      this.blockedReason = {
        code: "INVALID_CORRECTION",
        message:
          "State exactly one explicit quoted replacement: replace ‘OLD’ with ‘NEW’.",
      };
      return this.snapshot();
    }

    const currentHash = computeReleaseHash(this.release);
    let result: Awaited<ReturnType<RepairPlanner["plan"]>>;
    try {
      result = await this.planner.plan({
        release: cloneRelease(this.release),
        releaseHash: currentHash,
        correction,
        correctionIntent,
      });
    } catch (error) {
      if (
        analysisEpoch === this.operationEpoch &&
        currentHash === computeReleaseHash(this.release) &&
        correction === this.correction
      ) {
        this.blockedReason = {
          code: "MODEL_BLOCKED",
          message:
            "The suggestion request stopped without changing the release. Request a suggestion again.",
        };
        this.gate = "BLOCKED";
      }
      throw error;
    }

    if (
      analysisEpoch !== this.operationEpoch ||
      currentHash !== computeReleaseHash(this.release) ||
      correction !== this.correction
    ) {
      throw new DomainError(
        "STALE_ANALYSIS",
        "The release or correction changed while GPT-5.6 was preparing a suggestion. Request a suggestion for the current state again.",
        409,
      );
    }

    const parsed = RawRepairPlanSchema.safeParse(result.plan);
    if (!parsed.success) {
      this.blockedReason = {
        code: "INVALID_PLAN",
        message: "The planner output failed the strict repair-plan schema.",
      };
      return this.snapshot();
    }

    const validation = validateRepairPlan(
      parsed.data,
      this.release,
      correctionIntent,
    );
    if (!validation.ok) {
      this.blockedReason = {
        code: validation.code,
        message: validation.message,
      };
      return this.snapshot();
    }

    const planId = `plan-${sha256({
      releaseHash: currentHash,
      correction,
      plan: parsed.data,
    }).slice(0, 16)}`;

    this.repairPlan = {
      ...structuredClone(parsed.data),
      id: planId,
      releaseHash: currentHash,
      state: parsed.data.verdict === "blocked" ? "blocked" : "proposed",
      anchors: validation.anchors,
      trace: structuredClone(result.trace),
      approvedAt: null,
      appliedAt: null,
    };

    if (parsed.data.verdict === "blocked") {
      this.blockedReason = {
        code: "MODEL_BLOCKED",
        message: parsed.data.blockReason,
      };
      this.gate = "BLOCKED";
      return this.snapshot();
    }

    this.gate = "REPAIR_PROPOSED";
    return this.snapshot();
  }

  approve(input: PlanActionInput): SessionSnapshot {
    this.assertCurrentHash(input.releaseHash);
    const plan = this.requirePlan(input.planId);
    if (plan.state !== "proposed") {
      throw new DomainError(
        "PLAN_NOT_PROPOSED",
        "Only a proposed repair plan can be approved.",
        409,
        { state: plan.state },
      );
    }

    plan.state = "approved";
    plan.approvedAt = this.clock();
    this.gate = "APPROVED";
    return this.snapshot();
  }

  apply(input: PlanActionInput): SessionSnapshot {
    this.assertCurrentHash(input.releaseHash);
    const plan = this.requirePlan(input.planId);
    if (plan.state !== "approved" || !plan.approvedAt) {
      throw new DomainError(
        "APPROVAL_REQUIRED",
        "Approve the exact current repair plan before applying it.",
        409,
        { state: plan.state },
      );
    }

    if (plan.releaseHash !== input.releaseHash) {
      throw new DomainError(
        "STALE_PLAN",
        "The approved plan targets a different release hash.",
        409,
      );
    }

    const correctionIntent = this.correction
      ? extractExplicitReplacementIntent(this.correction)
      : null;
    if (!correctionIntent) {
      this.blockedReason = {
        code: "INVALID_CORRECTION",
        message:
          "The approved plan is no longer bound to one explicit quoted replacement.",
      };
      this.gate = "BLOCKED";
      return this.snapshot();
    }

    const validation = validateRepairPlan(
      rawPlanFrom(plan),
      this.release,
      correctionIntent,
    );
    if (!validation.ok) {
      this.blockedReason = {
        code: validation.code,
        message: validation.message,
      };
      this.gate = "BLOCKED";
      return this.snapshot();
    }

    const beforeRelease = cloneRelease(this.release);
    const beforeHash = computeReleaseHash(beforeRelease);
    const candidate = cloneRelease(this.release);

    for (const patch of plan.patches) {
      const document = candidate.documents.find(
        (item) => item.path === patch.path,
      );
      if (!document) {
        throw new DomainError(
          "PATCH_TARGET_MISSING",
          `Patch target ${patch.path} disappeared before apply.`,
          409,
        );
      }
      document.content = document.content.replace(patch.find, patch.replace);
    }

    candidate.version += 1;
    for (const artifact of candidate.derivedArtifacts) {
      if (!plan.invalidates.includes(artifact.id)) {
        continue;
      }
      artifact.state = "stale";
      artifact.proofHash = computeArtifactProofHash(artifact, candidate.documents);
      artifact.state = "current";
    }

    const afterHash = computeReleaseHash(candidate);
    const checks = this.runChecks(beforeRelease, candidate, plan, beforeHash, afterHash);
    this.checks = checks;

    if (checks.some((check) => check.status === "fail")) {
      this.blockedReason = {
        code: "INVALID_PLAN",
        message: "The candidate repair failed deterministic validation; no release change was committed.",
      };
      this.gate = "BLOCKED";
      return this.snapshot();
    }

    const appliedAt = this.clock();
    this.release = candidate;
    plan.state = "applied";
    plan.appliedAt = appliedAt;
    this.blockedReason = null;
    this.gate = "READY";

    const journalSequence = ++this.journalSequence;
    const journalId = `journal-${sha256({
      planId: plan.id,
      beforeHash,
      afterHash,
      appliedAt,
      journalSequence,
    }).slice(0, 16)}`;
    this.journal.push({
      id: journalId,
      planId: plan.id,
      createdAt: appliedAt,
      beforeHash,
      afterHash,
      patchesApplied: plan.patches.length,
      status: "applied",
      undoneAt: null,
      beforeRelease,
      afterRelease: cloneRelease(candidate),
    });

    return this.snapshot();
  }

  undo(input: UndoInput): SessionSnapshot {
    const currentHash = computeReleaseHash(this.release);
    if (input.expectedCurrentHash !== currentHash) {
      throw new DomainError(
        "STALE_RELEASE_HASH",
        "Undo was rejected because the release changed after the journal entry.",
        409,
        { expected: input.expectedCurrentHash, actual: currentHash },
      );
    }

    const journal = [...this.journal]
      .reverse()
      .find((entry) => entry.id === input.journalId);
    if (!journal) {
      throw new DomainError("JOURNAL_NOT_FOUND", "Journal entry not found.", 404);
    }
    if (journal.status !== "applied" || journal.afterHash !== currentHash) {
      throw new DomainError(
        "UNDO_GUARD_FAILED",
        "Undo is allowed only while the exact applied release hash is current.",
        409,
      );
    }
    if (computeReleaseHash(journal.afterRelease) !== journal.afterHash) {
      throw new DomainError(
        "JOURNAL_INTEGRITY_FAILED",
        "The stored after-snapshot no longer matches its proof hash.",
        409,
      );
    }

    const restored = cloneRelease(journal.beforeRelease);
    if (computeReleaseHash(restored) !== journal.beforeHash) {
      throw new DomainError(
        "JOURNAL_INTEGRITY_FAILED",
        "The stored undo snapshot no longer matches its proof hash.",
        409,
      );
    }

    this.release = restored;
    journal.status = "undone";
    journal.undoneAt = this.clock();
    if (this.repairPlan?.id === journal.planId) {
      this.repairPlan.state = "undone";
    }
    this.gate = "BLOCKED";
    this.blockedReason = {
      code: "MODEL_BLOCKED",
      message:
        "The approved change was undone. The original correction needs review again.",
    };
    this.checks = [
      {
        id: "undo_integrity",
        label: "Undo snapshot matches the original proof hash",
        status: "pass",
        detail: `Restored ${journal.beforeHash.slice(0, 12)}… exactly.`,
      },
    ];
    return this.snapshot();
  }

  private assertCurrentHash(expected: string): void {
    const actual = computeReleaseHash(this.release);
    if (expected !== actual) {
      throw new DomainError(
        "STALE_RELEASE_HASH",
        "The release changed. Refresh before planning or approving a repair.",
        409,
        { expected, actual },
      );
    }
  }

  private requirePlan(planId: string): RepairPlan {
    if (!this.repairPlan || this.repairPlan.id !== planId) {
      throw new DomainError("PLAN_NOT_FOUND", "Repair plan not found.", 404);
    }
    return this.repairPlan;
  }

  private runChecks(
    before: EducationalRelease,
    after: EducationalRelease,
    plan: RepairPlan,
    beforeHash: string,
    afterHash: string,
  ): CheckResult[] {
    const sourceBefore = before.documents
      .filter((document) => document.role === "source")
      .map((document) => ({ path: document.path, content: document.content }));
    const sourceAfter = after.documents
      .filter((document) => document.role === "source")
      .map((document) => ({ path: document.path, content: document.content }));

    const allPatchesApplied = plan.patches.every((patch) => {
      const document = after.documents.find((item) => item.path === patch.path);
      return (
        document !== undefined &&
        !document.content.includes(patch.find) &&
        countExactOccurrences(document.content, patch.replace) === 1
      );
    });
    const allArtifactsCurrent = after.derivedArtifacts.every(
      (artifact) =>
        artifact.state === "current" &&
        artifact.proofHash ===
          computeArtifactProofHash(artifact, after.documents),
    );

    const outcomes: Record<
      Exclude<CheckResult["id"], "undo_integrity">,
      { pass: boolean; detail: string }
    > = {
      evidence_unique: {
        pass: plan.anchors.length === plan.evidence.length,
        detail: `${plan.anchors.length} exact evidence anchors resolved before mutation.`,
      },
      editable_path_only: {
        pass: plan.patches.every(
          (patch) =>
            before.documents.find((document) => document.path === patch.path)
              ?.role === "editable",
        ),
        detail: `${plan.patches.length} patch target(s) stayed inside the release edit allowlist.`,
      },
      source_immutable: {
        pass: sha256(sourceBefore) === sha256(sourceAfter),
        detail: "Checked teaching-source bytes are unchanged.",
      },
      correction_applied: {
        pass: allPatchesApplied,
        detail: allPatchesApplied
          ? "Every old span is absent and every approved replacement is present."
          : "At least one approved replacement did not apply exactly.",
      },
      derived_artifacts_current: {
        pass: allArtifactsCurrent,
        detail: allArtifactsCurrent
          ? `${after.derivedArtifacts.length} dependency proof ${after.derivedArtifacts.length === 1 ? "record has" : "records have"} recomputed hashes that match current dependencies.`
          : "At least one dependency proof record has a stale hash.",
      },
      release_hash_changed: {
        pass: beforeHash !== afterHash,
        detail: `${beforeHash.slice(0, 10)}… → ${afterHash.slice(0, 10)}…`,
      },
    };

    return plan.checks.map((id) => ({
      id,
      label: CHECK_LABELS[id],
      status: outcomes[id].pass ? "pass" : "fail",
      detail: outcomes[id].detail,
    }));
  }
}

export function createEngineFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  options: { safetyIdentifier?: string } = {},
): LessonProofEngine {
  return new LessonProofEngine({
    planner: createPlannerFromEnv(env, options),
  });
}
