import { createHash } from "node:crypto";

import type {
  DerivedArtifact,
  EducationalRelease,
  ReleaseDocument,
} from "./types";

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

export function sha256(value: unknown): string {
  const input = typeof value === "string" ? value : stableStringify(value);
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export function computeArtifactProofHash(
  artifact: Pick<DerivedArtifact, "id" | "dependsOn">,
  documents: ReleaseDocument[],
): string {
  const dependencyProof = artifact.dependsOn.map((path) => {
    const document = documents.find((item) => item.path === path);
    if (!document) {
      throw new Error(
        `Derived artifact ${artifact.id} depends on missing document ${path}`,
      );
    }

    return { path, contentHash: sha256(document.content) };
  });

  return sha256({ artifactId: artifact.id, dependencyProof });
}

export function computeReleaseHash(release: EducationalRelease): string {
  return sha256(release);
}

export function cloneRelease(release: EducationalRelease): EducationalRelease {
  return structuredClone(release);
}
