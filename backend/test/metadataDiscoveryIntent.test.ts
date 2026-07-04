import { describe, expect, it } from "vitest";
import {
  buildMetadataDiscoveryIntentTraceMetadata,
  classifyMetadataDiscoveryIntent,
  createAgentRunId,
  createDefaultIntentResolver,
} from "../src/agent";

describe("metadata discovery intent contract", () => {
  it("classifies a safe datasource metadata request as an execute candidate", () => {
    const agentRunId = createAgentRunId();
    const decision = classifyMetadataDiscoveryIntent({
      agentRunId,
      message: "Tell me about this datasource.",
    });

    expect(decision).toMatchObject({
      agentRunId,
      intentId: "metadata_discovery",
      kind: "execute_candidate",
      clarificationRequired: false,
      targetTypeCandidate: "datasource",
      nextStep: "structured_plan",
    });
    expect(decision.safeUserFacingNote).toContain(
      "structured metadata discovery",
    );
    expect(JSON.parse(JSON.stringify(decision))).toEqual(decision);
  });

  it("returns a clarification candidate for ambiguous metadata discovery requests", () => {
    const agentRunId = createAgentRunId();
    const decision = classifyMetadataDiscoveryIntent({
      agentRunId,
      message: "Tell me about the workbook or datasource.",
    });

    expect(decision).toMatchObject({
      agentRunId,
      intentId: "metadata_discovery",
      kind: "clarification_candidate",
      clarificationRequired: true,
      nextStep: "clarify",
    });
    expect(decision.reasonBrief).toContain("ambiguous");
  });

  it("routes unsafe query-style requests to the legacy fallback path", () => {
    const agentRunId = createAgentRunId();
    const decision = classifyMetadataDiscoveryIntent({
      agentRunId,
      message: "Run a query and show me row values for this datasource.",
    });

    expect(decision).toMatchObject({
      agentRunId,
      intentId: "metadata_discovery",
      kind: "unsupported",
      nextStep: "legacy_fallback",
      clarificationRequired: false,
    });
    expect(decision.unsupportedReason).toContain("query-style execution");
  });

  it("builds JSON-safe trace metadata for metadata discovery decisions", () => {
    const decision = classifyMetadataDiscoveryIntent({
      agentRunId: createAgentRunId(),
      message: "Tell me about this view.",
    });

    const traceMetadata = buildMetadataDiscoveryIntentTraceMetadata(decision);
    expect(JSON.parse(JSON.stringify(traceMetadata))).toEqual(traceMetadata);
    expect(traceMetadata.intentId).toBe("metadata_discovery");
  });

  it("can resolve metadata_discovery through the minimal intent resolver without execution wiring", async () => {
    const resolver = createDefaultIntentResolver();
    const result = await resolver.resolve({
      agentRunId: createAgentRunId(),
      message: "Tell me about this datasource.",
      availableIntentIds: [
        "selected_mark_explanation",
        "current_dashboard_summary",
        "metadata_discovery",
      ],
    });

    expect(result.resolvedIntentId).toBe("metadata_discovery");
    expect(result.status).toBe("resolved");
    expect(result.source).toBe("deterministic_rule");
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });
});
