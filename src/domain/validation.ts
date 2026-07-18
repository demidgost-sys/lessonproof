import type {
  EducationalRelease,
  EvidenceAnchor,
  ExplicitReplacementIntent,
  RawRepairPlan,
  RequiredCheckId,
} from "./types";
import { REQUIRED_CHECK_IDS } from "./types";

export interface PlanValidationSuccess {
  ok: true;
  anchors: EvidenceAnchor[];
}

export interface PlanValidationFailure {
  ok: false;
  code: "AMBIGUOUS_EVIDENCE" | "INVALID_PLAN";
  message: string;
}

export type PlanValidationResult =
  | PlanValidationSuccess
  | PlanValidationFailure;

const PATH_UNSAFE = /(^\/|\\|(?:^|\/)\.\.(?:\/|$)|\0)/;
const REPLACEMENT_UNSAFE =
  /<script\b|javascript:|data:text\/html|begin\s+(?:system|developer)|api[_ -]?key|bearer\s+[a-z0-9._-]+/i;

const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(?:all\s+)?(?:previous|prior|above)\s+instructions?/i,
  /(?:system|developer)\s+(?:prompt|message|instructions?)/i,
  /(?:reveal|show|extract|leak|print)\b.{0,40}\b(?:secret|token|api[_ -]?key|credential)/i,
  /(?:run|execute)\b.{0,30}\b(?:shell|terminal|command|code)/i,
  /(?:call|invoke)\b.{0,20}\b(?:tool|function)/i,
  /(?:upload|send|exfiltrate)\b.{0,40}\b(?:secret|credential|file|data)/i,
  /begin\s+(?:system|developer)\b/i,
];

const EXPLICIT_REPLACEMENT_PATTERNS = [
  /\breplace\s+‘([^’]{3,800})’\s+with\s+‘([^’]{1,800})’/giu,
  /\breplace\s+“([^”]{3,800})”\s+with\s+“([^”]{1,800})”/giu,
  /\breplace\s+"([^"]{3,800})"\s+with\s+"([^"]{1,800})"/giu,
  /\breplace\s+'([^']{3,800})'\s+with\s+'([^']{1,800})'/giu,
];

export function detectUntrustedInstruction(correction: string): string | null {
  const matched = INJECTION_PATTERNS.find((pattern) => pattern.test(correction));
  return matched
    ? "The correction contains instruction-like content outside the bounded educational edit."
    : null;
}

export function extractExplicitReplacementIntent(
  correction: string,
): ExplicitReplacementIntent | null {
  const matches = EXPLICIT_REPLACEMENT_PATTERNS.flatMap((pattern) =>
    [...correction.matchAll(pattern)].map((match) => ({
      find: match[1],
      replace: match[2],
    })),
  );

  return matches.length === 1 ? matches[0] : null;
}

export function isSafeDocumentPath(path: string): boolean {
  return path.length > 0 && !PATH_UNSAFE.test(path);
}

export function countExactOccurrences(content: string, quote: string): number {
  if (!quote) {
    return 0;
  }

  let count = 0;
  let cursor = 0;
  while (cursor <= content.length - quote.length) {
    const index = content.indexOf(quote, cursor);
    if (index === -1) {
      break;
    }
    count += 1;
    cursor = index + 1;
  }
  return count;
}

function equalSets(left: string[], right: readonly string[]): boolean {
  const normalizedLeft = [...new Set(left)].sort();
  const normalizedRight = [...new Set(right)].sort();
  return (
    normalizedLeft.length === normalizedRight.length &&
    normalizedLeft.every((value, index) => value === normalizedRight[index])
  );
}

export function validateRepairPlan(
  plan: RawRepairPlan,
  release: EducationalRelease,
  correctionIntent: ExplicitReplacementIntent,
): PlanValidationResult {
  if (plan.verdict !== "repairable") {
    if (plan.blockReason.trim().length === 0) {
      return {
        ok: false,
        code: "INVALID_PLAN",
        message: "A blocked plan must explain why a safe repair cannot be proposed.",
      };
    }
    if (
      plan.evidence.length > 0 ||
      plan.patches.length > 0 ||
      plan.invalidates.length > 0 ||
      plan.checks.length > 0
    ) {
      return {
        ok: false,
        code: "INVALID_PLAN",
        message: "A blocked plan must not contain evidence, patches, or checks.",
      };
    }
    return { ok: true, anchors: [] };
  }

  if (plan.blockReason !== "") {
    return {
      ok: false,
      code: "INVALID_PLAN",
      message: "A repairable plan cannot also contain a block reason.",
    };
  }

  if (plan.evidence.length < 2 || plan.patches.length < 1) {
    return {
      ok: false,
      code: "INVALID_PLAN",
      message: "A repair needs source evidence, target evidence, and at least one patch.",
    };
  }

  if (plan.patches.length !== 1) {
    return {
      ok: false,
      code: "INVALID_PLAN",
      message: "This release gate requires exactly one explicit replacement patch.",
    };
  }

  const evidenceIds = plan.evidence.map((evidence) => evidence.id);
  if (new Set(evidenceIds).size !== evidenceIds.length) {
    return {
      ok: false,
      code: "INVALID_PLAN",
      message: "Evidence ids must be unique.",
    };
  }

  const anchors: EvidenceAnchor[] = [];
  for (const evidence of plan.evidence) {
    if (!isSafeDocumentPath(evidence.path)) {
      return {
        ok: false,
        code: "INVALID_PLAN",
        message: `Evidence path ${evidence.path} is outside the release boundary.`,
      };
    }

    const document = release.documents.find(
      (candidate) => candidate.path === evidence.path,
    );
    if (!document) {
      return {
        ok: false,
        code: "INVALID_PLAN",
        message: `Evidence document ${evidence.path} does not exist.`,
      };
    }

    const expectedRole = evidence.role === "source" ? "source" : "editable";
    if (document.role !== expectedRole) {
      return {
        ok: false,
        code: "INVALID_PLAN",
        message: `Evidence ${evidence.id} has the wrong document role.`,
      };
    }

    const occurrences = countExactOccurrences(document.content, evidence.quote);
    if (occurrences !== 1) {
      return {
        ok: false,
        code: "AMBIGUOUS_EVIDENCE",
        message:
          occurrences === 0
            ? `Evidence ${evidence.id} was not found exactly in ${evidence.path}.`
            : `Evidence ${evidence.id} occurs ${occurrences} times in ${evidence.path}.`,
      };
    }

    const start = document.content.indexOf(evidence.quote);
    anchors.push({ ...evidence, start, end: start + evidence.quote.length });
  }

  if (
    !plan.evidence.some((evidence) => evidence.role === "source") ||
    !plan.evidence.some((evidence) => evidence.role === "target")
  ) {
    return {
      ok: false,
      code: "INVALID_PLAN",
      message: "The plan must bind both checked source evidence and editable target evidence.",
    };
  }

  const patchPaths = plan.patches.map((patch) => patch.path);
  if (new Set(patchPaths).size !== patchPaths.length) {
    return {
      ok: false,
      code: "INVALID_PLAN",
      message: "Only one bounded patch per document is allowed.",
    };
  }

  for (const patch of plan.patches) {
    if (!isSafeDocumentPath(patch.path)) {
      return {
        ok: false,
        code: "INVALID_PLAN",
        message: `Patch path ${patch.path} is outside the release boundary.`,
      };
    }

    const document = release.documents.find(
      (candidate) => candidate.path === patch.path,
    );
    if (!document || document.role !== "editable") {
      return {
        ok: false,
        code: "INVALID_PLAN",
        message: `Patch path ${patch.path} is not an editable release document.`,
      };
    }

    const evidence = plan.evidence.find(
      (candidate) => candidate.id === patch.evidenceId,
    );
    if (
      !evidence ||
      evidence.role !== "target" ||
      evidence.path !== patch.path ||
      evidence.quote !== patch.find
    ) {
      return {
        ok: false,
        code: "INVALID_PLAN",
        message: `Patch for ${patch.path} is not bound to matching target evidence.`,
      };
    }

    if (patch.find === patch.replace) {
      return {
        ok: false,
        code: "INVALID_PLAN",
        message: `Patch for ${patch.path} does not change the target text.`,
      };
    }

    if (REPLACEMENT_UNSAFE.test(patch.replace)) {
      return {
        ok: false,
        code: "INVALID_PLAN",
        message: `Patch for ${patch.path} contains unsafe instruction or executable content.`,
      };
    }

    if (countExactOccurrences(document.content, patch.replace) !== 0) {
      return {
        ok: false,
        code: "AMBIGUOUS_EVIDENCE",
        message: `Replacement text for ${patch.path} is already present before apply.`,
      };
    }

    const supportedBySource = plan.evidence.some(
      (candidate) =>
        candidate.role === "source" && candidate.quote.includes(patch.replace),
    );
    if (!supportedBySource) {
      return {
        ok: false,
        code: "INVALID_PLAN",
        message: `Replacement text for ${patch.path} is not supported by checked source evidence.`,
      };
    }

    if (
      patch.find !== correctionIntent.find ||
      patch.replace !== correctionIntent.replace
    ) {
      return {
        ok: false,
        code: "INVALID_PLAN",
        message: `Patch for ${patch.path} does not exactly match the expert's quoted replacement.`,
      };
    }
  }

  const expectedInvalidates = release.derivedArtifacts
    .filter((artifact) =>
      artifact.dependsOn.some((dependency) => patchPaths.includes(dependency)),
    )
    .map((artifact) => artifact.id);

  if (!equalSets(plan.invalidates, expectedInvalidates)) {
    return {
      ok: false,
      code: "INVALID_PLAN",
      message: "The plan does not invalidate exactly the artifacts affected by its patches.",
    };
  }

  if (!equalSets(plan.checks, REQUIRED_CHECK_IDS)) {
    return {
      ok: false,
      code: "INVALID_PLAN",
      message: "The plan must request every required deterministic check exactly once.",
    };
  }

  return { ok: true, anchors };
}

export const CHECK_LABELS: Record<RequiredCheckId, string> = {
  evidence_unique: "Evidence is exact and unique",
  editable_path_only: "Patch stays inside editable paths",
  source_immutable: "Checked source remains immutable",
  correction_applied: "Correction is applied exactly once",
  derived_artifacts_current: "Dependency proof records are current",
  release_hash_changed: "Release proof hash changed",
};
