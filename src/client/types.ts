export type AiMode = "live" | "fixture";

export type WorkflowPhase = "correction" | "repair" | "proof";

export type CheckStatus = "pending" | "pass" | "fail";

export type ReleaseStatus = "blocked" | "ready" | "verified";

export interface CheckResult {
  id: string;
  label: string;
  detail: string;
  status: CheckStatus;
}

export interface EvidenceAnchor {
  id: string;
  sourceLabel: string;
  locator: string;
  excerpt: string;
  kind?: "caption" | "transcript" | "lesson" | "note";
}

export interface ExpertCorrection {
  text: string;
  authorRole: string;
  submittedAt?: string;
  scope?: string;
}

export interface ProposedChange {
  id: string;
  artifact: string;
  locator: string;
  before: string;
  after: string;
}

export interface RepairPlan {
  id: string;
  plannerModel: string;
  status: "proposed" | "approved";
  blocked: boolean;
  summary: string;
  rationale: string;
  evidenceIds: string[];
  changes: ProposedChange[];
  staleArtifacts: string[];
  checks: CheckResult[];
}

export interface VerifiedProof {
  journalId: string;
  hash: string;
  previousHash: string;
  releaseVersion: string;
  verifiedAt: string;
  checks: CheckResult[];
}

export interface LessonRelease {
  id: string;
  title: string;
  lesson: string;
  version: string;
  status: ReleaseStatus;
  gateLabel: "READY" | "BLOCKED" | "SUGGESTION READY" | "APPROVED" | "VERIFIED";
  baselineHash: string;
  currentHash: string;
  synthetic: boolean;
}

export interface WorkflowPermissions {
  canAnalyze: boolean;
  canApprove: boolean;
  canApply: boolean;
  canUndo: boolean;
  canReset: boolean;
}

export interface WorkflowState {
  mode: AiMode;
  model?: string;
  phase: WorkflowPhase;
  release: LessonRelease;
  correction: ExpertCorrection;
  evidence: EvidenceAnchor[];
  plan: RepairPlan | null;
  proof: VerifiedProof | null;
  permissions: WorkflowPermissions;
  notice?: string;
}

export const DEFAULT_CORRECTION =
  "At 03:24, replace ‘sin⁻¹(x) = 1/sin(x)’ with ‘sin⁻¹(x) = arcsin(x)’. Recheck the caption, mathematical claim, and release proof before publication.";

export function isVerified(state: WorkflowState): boolean {
  return state.phase === "proof" && state.release.status === "verified" && state.proof !== null;
}
