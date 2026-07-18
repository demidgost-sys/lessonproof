import type {
  CheckResult as DomainCheckResult,
  ReleaseDocument,
  SessionSnapshot,
} from "../domain/types";
import type {
  CheckResult,
  EvidenceAnchor,
  RepairPlan,
  WorkflowPhase,
  WorkflowState,
} from "./types";

const CHECK_LABELS: Record<string, string> = {
  evidence_unique: "Evidence resolves uniquely",
  editable_path_only: "Patch stays in editable paths",
  source_immutable: "Checked source remains immutable",
  correction_applied: "Expert correction is present",
  derived_artifacts_current: "Dependency proof records are current",
  release_hash_changed: "Release proof hash changed",
  undo_integrity: "Undo target matches current proof",
};

function basename(path: string): string {
  return path.split("/").at(-1) ?? path;
}

function displayLocator(path: string, quote: string): string {
  if (path.endsWith(".vtt") && quote.includes("sin⁻¹")) return "00:03:23 → 00:03:28";
  return path;
}

function documentEvidence(document: ReleaseDocument, index: number): EvidenceAnchor | null {
  const line = document.content
    .split("\n")
    .map((value) => value.trim())
    .find((value) => value.includes("sin⁻¹"));

  if (!line) return null;

  return {
    id: `release-evidence-${index + 1}`,
    sourceLabel: document.role === "source" ? "Checked teaching note" : basename(document.path),
    locator: displayLocator(document.path, line),
    excerpt: line,
    kind: document.mediaType === "text/vtt" ? "caption" : "lesson",
  };
}

function adaptChecks(checks: DomainCheckResult[]): CheckResult[] {
  return checks.map((check) => ({
    id: check.id,
    label: check.label || CHECK_LABELS[check.id] || check.id.replaceAll("_", " "),
    detail: check.detail,
    status: check.status,
  }));
}

function selectedChecks(snapshot: SessionSnapshot): CheckResult[] {
  if (!snapshot.plan) return [];

  const results = new Map(snapshot.checks.map((check) => [check.id, check]));
  return snapshot.plan.checks.map((checkId) => {
    const result = results.get(checkId);
    return result
      ? adaptChecks([result])[0]
      : {
          id: checkId,
          label: CHECK_LABELS[checkId] || checkId.replaceAll("_", " "),
          detail: "Runs after approval against the patched release.",
          status: "pending" as const,
        };
  });
}

function inferPhase(snapshot: SessionSnapshot): WorkflowPhase {
  const latestJournal = snapshot.journal.at(-1);

  if (snapshot.plan?.state === "applied" && latestJournal?.status === "applied") return "proof";
  if (snapshot.plan?.state === "undone") return "correction";
  if (snapshot.plan) return "repair";
  return "correction";
}

function adaptEvidence(snapshot: SessionSnapshot): EvidenceAnchor[] {
  if (snapshot.plan?.anchors.length) {
    return snapshot.plan.anchors.map((anchor) => ({
      id: anchor.id,
      sourceLabel: anchor.role === "source" ? "Checked teaching note" : basename(anchor.path),
      locator: displayLocator(anchor.path, anchor.quote),
      excerpt: anchor.quote,
      kind: anchor.path.endsWith(".vtt") ? "caption" : "lesson",
    }));
  }

  return snapshot.release.documents
    .map(documentEvidence)
    .filter((item): item is EvidenceAnchor => item !== null);
}

function adaptPlan(snapshot: SessionSnapshot): RepairPlan | null {
  const plan = snapshot.plan;
  if (!plan) return null;

  return {
    id: plan.id,
    plannerModel: plan.trace.model,
    status: plan.state === "approved" || plan.state === "applied" ? "approved" : "proposed",
    blocked: plan.verdict === "blocked",
    summary: plan.summary,
    rationale:
      plan.verdict === "blocked"
        ? plan.blockReason
        : `${plan.anchors.length} evidence anchor${plan.anchors.length === 1 ? "" : "s"} validated`,
    evidenceIds: plan.anchors.map((anchor) => anchor.id),
    changes: plan.patches.map((patch, index) => ({
      id: `${plan.id}-patch-${index + 1}`,
      artifact: basename(patch.path),
      locator: patch.path,
      before: patch.find,
      after: patch.replace,
    })),
    staleArtifacts: plan.invalidates,
    checks: selectedChecks(snapshot),
  };
}

export function adaptSnapshot(snapshot: SessionSnapshot): WorkflowState {
  const phase = inferPhase(snapshot);
  const latestJournal = snapshot.journal.at(-1);
  const proofReady = phase === "proof" && latestJournal?.status === "applied";
  const plan = snapshot.plan?.state === "undone" ? null : adaptPlan(snapshot);
  const evidence = adaptEvidence(snapshot);

  return {
    mode: snapshot.mode === "openai" ? "live" : "fixture",
    model: snapshot.model,
    phase,
    release: {
      id: snapshot.release.id,
      title: snapshot.release.title,
      lesson: snapshot.release.title,
      version: `v${snapshot.release.version}`,
      status: proofReady ? "verified" : snapshot.gate === "READY" ? "ready" : "blocked",
      gateLabel: proofReady
        ? "VERIFIED"
        : snapshot.gate === "REPAIR_PROPOSED"
          ? "SUGGESTION READY"
          : snapshot.gate,
      baselineHash: snapshot.baselineHash,
      currentHash: snapshot.release.hash,
      synthetic: true,
    },
    correction: {
      text: snapshot.correction ?? snapshot.defaultCorrection,
      authorRole: "Demo reviewer",
      scope: "Synthetic educational release",
    },
    evidence,
    plan,
    proof: proofReady && latestJournal
      ? {
          journalId: latestJournal.id,
          hash: latestJournal.afterHash,
          previousHash: latestJournal.beforeHash,
          releaseVersion: `v${snapshot.release.version}`,
          verifiedAt: latestJournal.createdAt,
          checks: adaptChecks(snapshot.checks),
        }
      : null,
    permissions: {
      canAnalyze: !snapshot.plan || snapshot.plan.state === "blocked" || snapshot.plan.state === "undone",
      canApprove: snapshot.plan?.state === "proposed" && snapshot.plan.verdict === "repairable",
      canApply: snapshot.plan?.state === "approved" && snapshot.plan.verdict === "repairable",
      canUndo: proofReady,
      canReset: true,
    },
    notice: snapshot.blockedReason?.message,
  };
}
