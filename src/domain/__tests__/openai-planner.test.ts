import { describe, expect, it, vi } from "vitest";

import { isDomainError } from "../errors";
import { hydrateRelease, loadFixture } from "../fixture";
import { computeReleaseHash } from "../hash";
import { FixtureRepairPlanner, OpenAIRepairPlanner } from "../planners";
import { extractExplicitReplacementIntent } from "../validation";

async function plannerInput() {
  const fixture = loadFixture();
  const release = hydrateRelease(fixture.release);
  const correctionIntent = extractExplicitReplacementIntent(
    fixture.defaultCorrection,
  )!;
  return {
    input: {
      release,
      releaseHash: computeReleaseHash(release),
      correction: fixture.defaultCorrection,
      correctionIntent,
    },
    fixturePlan: (await new FixtureRepairPlanner().plan({
      release,
      releaseHash: computeReleaseHash(release),
      correction: fixture.defaultCorrection,
      correctionIntent,
    })).plan,
  };
}

describe("OpenAIRepairPlanner", () => {
  it("uses GPT-5.6 Responses with strict JSON Schema and no stored response", async () => {
    const { input, fixturePlan } = await plannerInput();
    const fetchImpl = vi.fn(async (_url, init?: RequestInit) => {
      return new Response(
        JSON.stringify({
          id: "resp_test_123",
          model: "gpt-5.6-sol-2026-07-13",
          status: "completed",
          output: [
            {
              type: "message",
              content: [
                { type: "output_text", text: JSON.stringify(fixturePlan) },
              ],
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    const planner = new OpenAIRepairPlanner({
      apiKey: "test-key-not-real",
      safetyIdentifier: "lp_session_123",
      fetchImpl,
    });

    const result = await planner.plan(input);
    expect(result.trace).toEqual({
      mode: "openai",
      model: "gpt-5.6-sol-2026-07-13",
      responseId: "resp_test_123",
    });

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/responses");
    const request = JSON.parse(String(init?.body)) as Record<string, any>;
    expect(request.model).toBe("gpt-5.6-sol");
    expect(request.store).toBe(false);
    expect(request.safety_identifier).toBe("lp_session_123");
    expect(request.reasoning).toEqual({ effort: "medium" });
    expect(request.text.format).toMatchObject({
      type: "json_schema",
      name: "lessonproof_repair_plan",
      strict: true,
    });
    expect(request.text.format.schema.additionalProperties).toBe(false);
    expect(request.instructions).toContain("untrusted data");
    expect(request.input).toContain("sin⁻¹(x) = 1/sin(x)");
    expect(JSON.parse(request.input).explicitReplacement).toEqual({
      find: "sin⁻¹(x) = 1/sin(x)",
      replace: "sin⁻¹(x) = arcsin(x)",
    });
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer test-key-not-real",
      "Content-Type": "application/json",
    });
  });

  it("fails honestly when live mode has no API key", async () => {
    const { input } = await plannerInput();
    const planner = new OpenAIRepairPlanner();

    await expect(planner.plan(input)).rejects.toSatisfy(
      (error: unknown) =>
        isDomainError(error) && error.code === "OPENAI_API_KEY_MISSING",
    );
  });

  it("rejects non-GPT-5.6 live model configuration", () => {
    expect(() => new OpenAIRepairPlanner({ model: "gpt-4o" })).toThrow(
      /requires a GPT-5.6 family model/,
    );
  });

  it("keeps the provider timeout active while reading the response body", async () => {
    const { input } = await plannerInput();
    const fetchImpl = vi.fn(async (_url, init?: RequestInit) => {
      const signal = init?.signal;
      return {
        text: () =>
          new Promise<string>((_resolve, reject) => {
            signal?.addEventListener(
              "abort",
              () => reject(new DOMException("Aborted", "AbortError")),
              { once: true },
            );
          }),
      } as Response;
    });
    const planner = new OpenAIRepairPlanner({
      apiKey: "test-key-not-real",
      timeoutMs: 10,
      fetchImpl,
    });

    await expect(planner.plan(input)).rejects.toSatisfy(
      (error: unknown) =>
        isDomainError(error) && error.code === "OPENAI_TIMEOUT",
    );
  });

  it("surfaces refusals without inventing or applying a plan", async () => {
    const { input } = await plannerInput();
    const planner = new OpenAIRepairPlanner({
      apiKey: "test-key-not-real",
      fetchImpl: vi.fn(async () =>
        new Response(
          JSON.stringify({
            id: "resp_refusal",
            model: "gpt-5.6-sol",
            status: "completed",
            output: [
              {
                type: "message",
                content: [
                  {
                    type: "refusal",
                    refusal: "PRIVATE UPSTREAM REFUSAL DETAIL",
                  },
                ],
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    });

    await expect(planner.plan(input)).rejects.toSatisfy((error: unknown) =>
      isDomainError(error) &&
      error.code === "OPENAI_REFUSAL" &&
      !error.message.includes("PRIVATE UPSTREAM") &&
      error.details.responseId === "resp_refusal",
    );
  });

  it("rejects schema-invalid structured output at the application boundary", async () => {
    const { input } = await plannerInput();
    const planner = new OpenAIRepairPlanner({
      apiKey: "test-key-not-real",
      fetchImpl: vi.fn(async () =>
        new Response(
          JSON.stringify({
            id: "resp_bad_schema",
            model: "gpt-5.6-sol",
            status: "completed",
            output: [
              {
                type: "message",
                content: [
                  {
                    type: "output_text",
                    text: JSON.stringify({ verdict: "repairable" }),
                  },
                ],
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    });

    await expect(planner.plan(input)).rejects.toSatisfy(
      (error: unknown) =>
        isDomainError(error) && error.code === "OPENAI_PLAN_SCHEMA_MISMATCH",
    );
  });

  it("rejects a completed response that does not identify a GPT-5.6 model", async () => {
    const { input, fixturePlan } = await plannerInput();
    const planner = new OpenAIRepairPlanner({
      apiKey: "test-key-not-real",
      fetchImpl: vi.fn(async () =>
        new Response(
          JSON.stringify({
            id: "resp_wrong_model",
            model: "gpt-4o",
            status: "completed",
            output: [
              {
                type: "message",
                content: [
                  { type: "output_text", text: JSON.stringify(fixturePlan) },
                ],
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    });

    await expect(planner.plan(input)).rejects.toSatisfy(
      (error: unknown) =>
        isDomainError(error) && error.code === "OPENAI_MODEL_MISMATCH",
    );
  });
});
