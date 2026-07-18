import "dotenv/config";

import {
  LessonProofEngine,
  OpenAIRepairPlanner,
  loadFixture,
  sha256,
} from "../src/domain";

function shortHash(value: string): string {
  return `${value.slice(0, 12)}…${value.slice(-8)}`;
}

async function main(): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is missing. Add it to ignored .env before running the live smoke.",
    );
  }

  const engine = new LessonProofEngine({
    fixture: loadFixture(),
    planner: new OpenAIRepairPlanner({
      apiKey,
      model: process.env.OPENAI_MODEL ?? "gpt-5.6-sol",
      safetyIdentifier: `lp_${sha256("lessonproof-build-week-smoke-v1").slice(0, 32)}`,
    }),
  });
  const initial = engine.snapshot();
  const proposed = await engine.analyze({
    correction: initial.defaultCorrection,
    releaseHash: initial.release.hash,
  });

  if (proposed.gate !== "REPAIR_PROPOSED" || !proposed.plan) {
    throw new Error(
      `GPT-5.6 smoke failed closed: ${proposed.blockedReason?.message ?? proposed.gate}`,
    );
  }

  const approved = engine.approve({
    planId: proposed.plan.id,
    releaseHash: proposed.release.hash,
  });
  const applied = engine.apply({
    planId: approved.plan!.id,
    releaseHash: approved.release.hash,
  });

  if (
    applied.gate !== "READY" ||
    applied.checks.length !== 6 ||
    applied.checks.some((check) => check.status !== "pass")
  ) {
    throw new Error("GPT-5.6 produced a plan that did not earn a verified release.");
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        planner: proposed.plan.trace.mode,
        model: proposed.plan.trace.model,
        responseIdPrefix: proposed.plan.trace.responseId
          ? `${proposed.plan.trace.responseId.slice(0, 12)}…`
          : null,
        planId: proposed.plan.id,
        evidenceAnchors: proposed.plan.anchors.length,
        patches: proposed.plan.patches.length,
        invalidatedArtifacts: proposed.plan.invalidates.length,
        checksPassed: applied.checks.length,
        beforeHash: shortHash(initial.release.hash),
        afterHash: shortHash(applied.release.hash),
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown smoke failure";
  process.stderr.write(`LessonProof live smoke failed: ${message}\n`);
  process.exitCode = 1;
});
