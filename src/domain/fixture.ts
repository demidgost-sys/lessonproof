import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import { computeArtifactProofHash } from "./hash";
import type { EducationalRelease, LessonProofFixture } from "./types";

const FixtureSchema = z
  .object({
    fixtureVersion: z.literal(1),
    sessionId: z.string().min(1),
    defaultCorrection: z.string().min(1),
    release: z
      .object({
        id: z.string().min(1),
        title: z.string().min(1),
        version: z.number().int().positive(),
        documents: z.array(
          z
            .object({
              path: z.string().min(1),
              role: z.enum(["source", "editable"]),
              mediaType: z.enum([
                "text/markdown",
                "text/vtt",
                "application/json",
              ]),
              content: z.string(),
            })
            .strict(),
        ),
        derivedArtifacts: z.array(
          z
            .object({
              id: z.string().min(1),
              label: z.string().min(1),
              dependsOn: z.array(z.string().min(1)).min(1),
            })
            .strict(),
        ),
      })
      .strict(),
  })
  .strict();

export const DEFAULT_FIXTURE_URL = new URL(
  "../../fixtures/inverse-sine-release.json",
  import.meta.url,
);

export function loadFixture(
  fixtureUrl: URL = DEFAULT_FIXTURE_URL,
): LessonProofFixture {
  const raw = readFileSync(fileURLToPath(fixtureUrl), "utf8");
  return FixtureSchema.parse(JSON.parse(raw)) as LessonProofFixture;
}

export function hydrateRelease(
  fixtureRelease: LessonProofFixture["release"],
): EducationalRelease {
  const documents = structuredClone(fixtureRelease.documents);
  const derivedArtifacts = fixtureRelease.derivedArtifacts.map((artifact) => ({
    ...structuredClone(artifact),
    state: "current" as const,
    proofHash: computeArtifactProofHash(artifact, documents),
  }));

  return {
    id: fixtureRelease.id,
    title: fixtureRelease.title,
    version: fixtureRelease.version,
    documents,
    derivedArtifacts,
  };
}
