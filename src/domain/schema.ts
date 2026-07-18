import { z } from "zod";

import { REQUIRED_CHECK_IDS } from "./types";

const EvidenceSchema = z
  .object({
    id: z.string().min(1).max(80),
    path: z.string().min(1).max(180),
    quote: z.string().min(3).max(800),
    role: z.enum(["source", "target"]),
    explanation: z.string().min(1).max(500),
  })
  .strict();

const PatchSchema = z
  .object({
    path: z.string().min(1).max(180),
    find: z.string().min(3).max(800),
    replace: z.string().min(1).max(800),
    evidenceId: z.string().min(1).max(80),
  })
  .strict();

export const RawRepairPlanSchema = z
  .object({
    verdict: z.enum(["repairable", "blocked"]),
    summary: z.string().min(1).max(600),
    blockReason: z.string().max(600),
    confidence: z.enum(["high", "medium", "low"]),
    evidence: z.array(EvidenceSchema).max(8),
    patches: z.array(PatchSchema).max(4),
    invalidates: z.array(z.string().min(1).max(120)).max(12),
    checks: z.array(z.enum(REQUIRED_CHECK_IDS)).max(REQUIRED_CHECK_IDS.length),
  })
  .strict();

export const REPAIR_PLAN_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    verdict: { type: "string", enum: ["repairable", "blocked"] },
    summary: { type: "string", minLength: 1, maxLength: 600 },
    blockReason: { type: "string", maxLength: 600 },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    evidence: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string", minLength: 1, maxLength: 80 },
          path: { type: "string", minLength: 1, maxLength: 180 },
          quote: { type: "string", minLength: 3, maxLength: 800 },
          role: { type: "string", enum: ["source", "target"] },
          explanation: { type: "string", minLength: 1, maxLength: 500 },
        },
        required: ["id", "path", "quote", "role", "explanation"],
      },
    },
    patches: {
      type: "array",
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          path: { type: "string", minLength: 1, maxLength: 180 },
          find: { type: "string", minLength: 3, maxLength: 800 },
          replace: { type: "string", minLength: 1, maxLength: 800 },
          evidenceId: { type: "string", minLength: 1, maxLength: 80 },
        },
        required: ["path", "find", "replace", "evidenceId"],
      },
    },
    invalidates: {
      type: "array",
      maxItems: 12,
      items: { type: "string", minLength: 1, maxLength: 120 },
    },
    checks: {
      type: "array",
      maxItems: REQUIRED_CHECK_IDS.length,
      items: { type: "string", enum: [...REQUIRED_CHECK_IDS] },
    },
  },
  required: [
    "verdict",
    "summary",
    "blockReason",
    "confidence",
    "evidence",
    "patches",
    "invalidates",
    "checks",
  ],
} as const;
