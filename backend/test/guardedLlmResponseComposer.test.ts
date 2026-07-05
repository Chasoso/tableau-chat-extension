import { describe, expect, it } from "vitest";
import {
  buildLlmResponseMaterial,
  createDefaultResponseComposer,
  createFakeLlmResponseComposerAdapter,
  createGuardedLlmResponseComposer,
  composeSelectedMarkExplanationResponse,
  readGuardedLlmResponseComposerConfig,
  validateLlmResponseMaterial,
  type ResponseComposerInput,
  type LlmResponseComposerAdapter,
  type LlmResponseComposerMaterial,
} from "../src/agent";

function createInput(
  overrides: Partial<ResponseComposerInput> = {},
): ResponseComposerInput {
  return {
    agentRunId: "agent-run-1",
    intentId: "metadata_discovery",
    planId: "metadata-discovery-v1",
    executionStatus: "completed",
    responseStrategy: "guarded_llm_response_composer",
    responseMaterial: {
      source: "unit-test",
      accessToken: "secret-value",
      fieldValues: ["hidden"],
      rawMcpOutput: "secret raw output",
    },
    warnings: ["input_warning"],
    errors: [{ message: "step failed", code: "step-1" }],
    fallbackReason: "fallback",
    locale: "en",
    metadata: {
      source: "unit-test",
      accessToken: "secret-value",
    },
    traceMetadata: {
      requestId: "request-1",
    },
    ...overrides,
  };
}

function createCapturingAdapter(
  onMaterial: (material: LlmResponseComposerMaterial) => void,
  output: string | ((material: LlmResponseComposerMaterial) => string),
): LlmResponseComposerAdapter {
  return {
    async compose(material: LlmResponseComposerMaterial): Promise<unknown> {
      onMaterial(material);
      return typeof output === "function" ? output(material) : output;
    },
  };
}

describe("GuardedLlmResponseComposer", () => {
  it("keeps the deterministic composer as the default disabled path", async () => {
    const guarded = createGuardedLlmResponseComposer({ enabled: false });
    const baseline =
      await createDefaultResponseComposer().compose(createInput());
    const result = await guarded.compose(createInput());

    expect(result.message).toBe(baseline.message);
    expect(result.status).toBe(baseline.status);
    expect(result.responseType).toBe(baseline.responseType);
    expect(result.summary).toEqual(baseline.summary);
    expect(result.traceMetadata).toMatchObject({
      llmComposer: {
        status: "disabled",
        fallbackReason: "composer_disabled",
      },
    });
  });

  it("does not change selected_mark_explanation behavior when disabled", async () => {
    const selectedMarkInput: ResponseComposerInput = {
      agentRunId: "agent-run-2",
      intentId: "selected_mark_explanation",
      planId: "selected-mark-v1",
      executionStatus: "completed",
      responseStrategy: "selected_mark_explanation",
      responseMaterial: {
        selectedMarks: {
          available: true,
          count: 2,
          worksheetNames: ["Sales Map"],
          fieldNames: ["Region", "Sales"],
          summary: "Selected 2 marks.",
        },
        summaryDataPreview: {
          available: true,
          rowCount: 4,
          columnCount: 3,
          columnNames: ["Region", "Sales", "Profit"],
          truncated: true,
        },
        filters: {
          available: true,
          count: 1,
          names: ["Year"],
        },
        parameters: {
          available: true,
          count: 1,
          names: ["Metric Selector"],
        },
        warnings: ["selected-mark-warning"],
      },
      warnings: ["input_warning"],
      locale: "en",
    };
    const guarded = createGuardedLlmResponseComposer({ enabled: false });
    const baseline = composeSelectedMarkExplanationResponse(selectedMarkInput);
    const result = await guarded.compose(selectedMarkInput);

    expect(result.message).toBe(baseline.message);
    expect(result.summary).toEqual(baseline.summary);
    expect(result.traceMetadata).toMatchObject({
      llmComposer: {
        status: "disabled",
        fallbackReason: "composer_disabled",
      },
    });
  });

  it("uses the fake success adapter while keeping response material safe", async () => {
    let capturedMaterial: LlmResponseComposerMaterial | undefined;
    const guarded = createGuardedLlmResponseComposer({
      enabled: true,
      mode: "fake",
      adapter: createCapturingAdapter(
        (material) => {
          capturedMaterial = material;
        },
        (material) =>
          [
            "Guarded LLM composition is safely enabled.",
            ...material.requiredDisclosures.map(
              (disclosure) => `Disclosure: ${disclosure}`,
            ),
          ].join("\n"),
      ),
    });
    const result = await guarded.compose(createInput());

    expect(result.status).toBe("composed");
    expect(result.message).toContain(
      "Guarded LLM composition is safely enabled.",
    );
    expect(result.message).toContain("Disclosure: input_warning");
    expect(result.message).toContain("Disclosure: fallback");
    expect(capturedMaterial).toBeDefined();
    expect(JSON.stringify(capturedMaterial)).not.toContain("secret-value");
    expect(JSON.stringify(capturedMaterial)).not.toContain("secret raw output");
    expect(capturedMaterial?.requiredDisclosures.length).toBeGreaterThan(0);
    expect(result.traceMetadata).toMatchObject({
      llmComposer: {
        status: "composed",
        mode: "fake",
        sourceKind: "metadata_discovery",
      },
    });
  });

  it("falls back safely when the fake adapter times out", async () => {
    const guarded = createGuardedLlmResponseComposer({
      enabled: true,
      mode: "fake",
      timeoutMs: 1,
      adapter: createFakeLlmResponseComposerAdapter("timeout"),
    });
    const baseline =
      await createDefaultResponseComposer().compose(createInput());
    const result = await guarded.compose(createInput());

    expect(result.message).toBe(baseline.message);
    expect(result.status).toBe(baseline.status);
    expect(result.traceMetadata).toMatchObject({
      llmComposer: {
        status: "disabled",
        fallbackReason: "composer_timeout",
      },
    });
  });

  it("falls back safely when the fake adapter errors", async () => {
    const guarded = createGuardedLlmResponseComposer({
      enabled: true,
      mode: "fake",
      adapter: createFakeLlmResponseComposerAdapter("error"),
    });
    const baseline =
      await createDefaultResponseComposer().compose(createInput());
    const result = await guarded.compose(createInput());

    expect(result.message).toBe(baseline.message);
    expect(result.status).toBe(baseline.status);
    expect(JSON.stringify(result)).not.toContain("Fake LLM composer error.");
    expect(result.traceMetadata).toMatchObject({
      llmComposer: {
        fallbackReason: "composer_error",
      },
    });
  });

  it("falls back safely when the fake adapter returns invalid output", async () => {
    const guarded = createGuardedLlmResponseComposer({
      enabled: true,
      mode: "fake",
      adapter: createFakeLlmResponseComposerAdapter("invalid_output"),
    });
    const baseline =
      await createDefaultResponseComposer().compose(createInput());
    const result = await guarded.compose(createInput());

    expect(result.message).toBe(baseline.message);
    expect(result.status).toBe(baseline.status);
    expect(result.traceMetadata).toMatchObject({
      llmComposer: {
        fallbackReason: "composer_invalid_output",
      },
    });
  });

  it("falls back safely when the fake adapter returns unsafe output", async () => {
    const guarded = createGuardedLlmResponseComposer({
      enabled: true,
      mode: "fake",
      adapter: createFakeLlmResponseComposerAdapter("unsafe_output"),
    });
    const baseline =
      await createDefaultResponseComposer().compose(createInput());
    const result = await guarded.compose(createInput());

    expect(result.message).toBe(baseline.message);
    expect(result.status).toBe(baseline.status);
    expect(JSON.stringify(result)).not.toContain("SELECT * FROM raw_table");
    expect(result.traceMetadata).toMatchObject({
      llmComposer: {
        fallbackReason: "composer_unsafe_output",
      },
    });
  });

  it("falls back safely when the adapter output is too long", async () => {
    const guarded = createGuardedLlmResponseComposer({
      enabled: true,
      mode: "fake",
      maxOutputChars: 16,
      adapter: createCapturingAdapter(() => undefined, "x".repeat(128)),
    });
    const baseline =
      await createDefaultResponseComposer().compose(createInput());
    const result = await guarded.compose(createInput());

    expect(result.message).toBe(baseline.message);
    expect(result.status).toBe(baseline.status);
    expect(result.traceMetadata).toMatchObject({
      llmComposer: {
        fallbackReason: "composer_output_too_long",
      },
    });
  });

  it("falls back safely when required limitations are missing", async () => {
    const guarded = createGuardedLlmResponseComposer({
      enabled: true,
      mode: "fake",
      adapter: createCapturingAdapter(() => undefined, "Short summary only."),
    });
    const baseline =
      await createDefaultResponseComposer().compose(createInput());
    const result = await guarded.compose(createInput());

    expect(result.message).toBe(baseline.message);
    expect(result.status).toBe(baseline.status);
    expect(result.traceMetadata).toMatchObject({
      llmComposer: {
        fallbackReason: "composer_missing_required_limitations",
      },
    });
  });

  it("falls back safely when the adapter returns a tool-call-like string", async () => {
    const guarded = createGuardedLlmResponseComposer({
      enabled: true,
      mode: "fake",
      adapter: createCapturingAdapter(
        () => undefined,
        "Call the Tableau MCP tool to run SELECT * FROM raw_table",
      ),
    });
    const baseline =
      await createDefaultResponseComposer().compose(createInput());
    const result = await guarded.compose(createInput());

    expect(result.message).toBe(baseline.message);
    expect(result.status).toBe(baseline.status);
    expect(JSON.stringify(result)).not.toContain("SELECT * FROM raw_table");
    expect(result.traceMetadata).toMatchObject({
      llmComposer: {
        fallbackReason: "composer_unsafe_output",
      },
    });
  });

  it("builds JSON-safe response material without leaking raw input", async () => {
    const deterministicResult =
      await createDefaultResponseComposer().compose(createInput());
    const material = buildLlmResponseMaterial({
      composerInput: createInput(),
      deterministicResult,
      sourceKind: "metadata_discovery",
      maxInputChars: 2_000,
    });

    expect(validateLlmResponseMaterial(material, 2_000).ok).toBe(true);
    expect(JSON.parse(JSON.stringify(material))).toEqual(material);
    expect(JSON.stringify(material)).not.toContain("secret-value");
    expect(material.userRequestSummary).not.toContain("secret-value");
    expect(material.targetSummary ?? "").not.toContain("secret-value");
    expect(material.materialVersion).toBe("v1");
    expect(material.sourceKind).toBe("metadata_discovery");
    expect(material.evidence.length).toBeGreaterThan(0);
    expect(material.requiredDisclosures.length).toBeGreaterThan(0);
  });

  it("keeps metadata_discovery normalized and safe when captured by the adapter", async () => {
    let capturedMaterial: LlmResponseComposerMaterial | undefined;
    const guarded = createGuardedLlmResponseComposer({
      enabled: true,
      mode: "fake",
      adapter: createCapturingAdapter(
        (material) => {
          capturedMaterial = material;
        },
        (material) =>
          [
            "Guarded metadata discovery summary.",
            ...material.requiredDisclosures.map(
              (disclosure) => `Disclosure: ${disclosure}`,
            ),
          ].join("\n"),
      ),
    });
    const result = await guarded.compose(createInput());

    expect(result.status).toBe("composed");
    expect(capturedMaterial).toBeDefined();
    expect(JSON.stringify(capturedMaterial)).not.toContain("secret-value");
    expect(JSON.stringify(capturedMaterial)).not.toContain("hidden");
    expect(JSON.stringify(capturedMaterial)).not.toContain("secret raw output");
    expect(capturedMaterial?.requiredDisclosures).toContain("input_warning");
    expect(capturedMaterial?.sourceKind).toBe("metadata_discovery");
  });

  it("uses a disabled config by default", () => {
    const config = readGuardedLlmResponseComposerConfig({});

    expect(config.enabled).toBe(false);
    expect(config.mode).toBe("disabled");
    expect(config.timeoutMs).toBeGreaterThan(0);
    expect(config.maxInputChars).toBeGreaterThan(0);
    expect(config.maxOutputChars).toBeGreaterThan(0);
  });
});
