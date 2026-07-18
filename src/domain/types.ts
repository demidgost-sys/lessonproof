export type DocumentRole = "source" | "editable";

export interface ReleaseDocument {
  path: string;
  role: DocumentRole;
  mediaType: "text/markdown" | "text/vtt" | "application/json";
  content: string;
}

export interface DerivedArtifact {
  id: string;
  label: string;
  dependsOn: string[];
  state: "current" | "stale";
  proofHash: string;
}

export interface EducationalRelease {
  id: string;
  title: string;
  version: number;
  documents: ReleaseDocument[];
  derivedArtifacts: DerivedArtifact[];
}

export interface FixtureArtifactInput {
  id: string;
  label: string;
  dependsOn: string[];
}

export interface LessonProofFixture {
  fixtureVersion: 1;
  sessionId: string;
  defaultCorrection: string;
  release: Omit<EducationalRelease, "derivedArtifacts"> & {
    derivedArtifacts: FixtureArtifactInput[];
  };
}

export const REQUIRED_CHECK_IDS = [
  "evidence_unique",
  "editable_path_only",
  "source_immutable",
  "correction_applied",
  "derived_artifacts_current",
  "release_hash_changed",
] as const;

export type RequiredCheckId = (typeof REQUIRED_CHECK_IDS)[number];

export interface RawEvidence {
  id: string;
  path: string;
  quote: string;
  role: "source" | "target";
  explanation: string;
}

export interface RawPatch {
  path: string;
  find: string;
  replace: string;
  evidenceId: string;
}

export interface RawRepairPlan {
  verdict: "repairable" | "blocked";
  summary: string;
  blockReason: string;
  confidence: "high" | "medium" | "low";
  evidence: RawEvidence[];
  patches: RawPatch[];
  invalidates: string[];
  checks: RequiredCheckId[];
}

export interface EvidenceAnchor extends RawEvidence {
  start: number;
  end: number;
}

export interface PlannerTrace {
  mode: "fixture" | "openai";
  model: string;
  responseId: string | null;
}

export interface ExplicitReplacementIntent {
  find: string;
  replace: string;
}

export interface PlannerInput {
  release: EducationalRelease;
  releaseHash: string;
  correction: string;
  correctionIntent: ExplicitReplacementIntent;
}

export interface PlannerResult {
  plan: RawRepairPlan;
  trace: PlannerTrace;
}

export interface RepairPlanner {
  readonly mode: PlannerTrace["mode"];
  readonly model: string;
  readonly keyConfigured: boolean;
  plan(input: PlannerInput): Promise<PlannerResult>;
}

export type PlanState =
  | "blocked"
  | "proposed"
  | "approved"
  | "applied"
  | "undone";

export interface RepairPlan extends RawRepairPlan {
  id: string;
  releaseHash: string;
  state: PlanState;
  anchors: EvidenceAnchor[];
  trace: PlannerTrace;
  approvedAt: string | null;
  appliedAt: string | null;
}

export interface CheckResult {
  id: RequiredCheckId | "undo_integrity";
  label: string;
  status: "pass" | "fail";
  detail: string;
}

export interface JournalSummary {
  id: string;
  planId: string;
  createdAt: string;
  beforeHash: string;
  afterHash: string;
  patchesApplied: number;
  status: "applied" | "undone";
  undoneAt: string | null;
}

export interface JournalRecord extends JournalSummary {
  beforeRelease: EducationalRelease;
  afterRelease: EducationalRelease;
}

export type ReleaseGate =
  | "READY"
  | "BLOCKED"
  | "REPAIR_PROPOSED"
  | "APPROVED";

export interface BlockedReason {
  code:
    | "AMBIGUOUS_EVIDENCE"
    | "INVALID_CORRECTION"
    | "INVALID_PLAN"
    | "MODEL_BLOCKED"
    | "PENDING_CORRECTION"
    | "UNTRUSTED_INSTRUCTION";
  message: string;
}

export interface SessionSnapshot {
  sessionId: string;
  mode: PlannerTrace["mode"];
  model: string;
  keyConfigured: boolean;
  gate: ReleaseGate;
  release: EducationalRelease & { hash: string };
  baselineHash: string;
  defaultCorrection: string;
  correction: string | null;
  plan: RepairPlan | null;
  checks: CheckResult[];
  journal: JournalSummary[];
  blockedReason: BlockedReason | null;
}
