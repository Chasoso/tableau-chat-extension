import { describe, expect, it } from "vitest";
import {
  buildMetadataDiscoveryIntentTraceMetadata,
  classifyMetadataDiscoveryIntent,
  createAgentRunId,
  createDefaultIntentResolver,
} from "../src/agent";

describe("metadata discovery ambiguity model", () => {
  it("classifies a datasource target with an identifier as an executable candidate", () => {
    const agentRunId = createAgentRunId();
    const decision = classifyMetadataDiscoveryIntent({
      agentRunId,
      message: "Tell me about this datasource.",
      targetContext: {
        targetType: "datasource",
        identifier: "sales.datasource",
        identifierType: "datasourceId",
      },
    });

    expect(decision).toMatchObject({
      agentRunId,
      intentId: "metadata_discovery",
      kind: "execute_candidate",
      ambiguityState: "ready",
      clarificationRequired: false,
      metadataBoundaryReady: true,
      targetTypeCandidate: "datasource",
      nextStep: "structured_plan",
    });
    expect(decision.candidateTargetTypes).toEqual(["datasource"]);
    expect(decision.missingPreconditions).toEqual([]);
    expect(decision.safeUserFacingNote).toContain(
      "structured metadata discovery",
    );
    expect(JSON.parse(JSON.stringify(decision))).toEqual(decision);
  });

  it("requires clarification when a datasource target is missing its identifier", () => {
    const decision = classifyMetadataDiscoveryIntent({
      agentRunId: createAgentRunId(),
      message: "Tell me about this datasource.",
      targetContext: { targetType: "datasource" },
    });

    expect(decision).toMatchObject({
      kind: "clarification_candidate",
      ambiguityState: "missing_identifier",
      clarificationRequired: true,
      metadataBoundaryReady: false,
      nextStep: "clarify",
      targetTypeCandidate: "datasource",
    });
    expect(decision.missingPreconditions).toContain(
      "datasource_identifier_present",
    );
  });

  it("keeps workbook targets on the clarification path", () => {
    const decision = classifyMetadataDiscoveryIntent({
      agentRunId: createAgentRunId(),
      message: "Tell me about this workbook.",
      targetContext: {
        targetType: "workbook",
        identifier: "sales-workbook",
      },
    });

    expect(decision).toMatchObject({
      kind: "clarification_candidate",
      ambiguityState: "target_not_supported",
      clarificationRequired: true,
      metadataBoundaryReady: false,
      targetTypeCandidate: "workbook",
    });
    expect(decision.missingPreconditions).toContain(
      "datasource_boundary_supported",
    );
  });

  it("keeps view targets on the clarification path", () => {
    const decision = classifyMetadataDiscoveryIntent({
      agentRunId: createAgentRunId(),
      message: "Tell me about this view.",
      targetContext: {
        targetType: "view",
        identifier: "sales-view",
      },
    });

    expect(decision).toMatchObject({
      kind: "clarification_candidate",
      ambiguityState: "target_not_supported",
      clarificationRequired: true,
      metadataBoundaryReady: false,
      targetTypeCandidate: "view",
    });
  });

  it("returns a clarification candidate for ambiguous target requests", () => {
    const decision = classifyMetadataDiscoveryIntent({
      agentRunId: createAgentRunId(),
      message: "Tell me about the workbook or datasource.",
      targetContext: {
        candidateTargetTypes: ["workbook", "datasource"],
        candidateCount: 2,
      },
    });

    expect(decision).toMatchObject({
      kind: "clarification_candidate",
      ambiguityState: "ambiguous_target",
      clarificationRequired: true,
      nextStep: "clarify",
    });
    expect(decision.candidateTargetTypes).toEqual(
      expect.arrayContaining(["workbook", "datasource"]),
    );
  });

  it("requires clarification when the target type is unknown", () => {
    const decision = classifyMetadataDiscoveryIntent({
      agentRunId: createAgentRunId(),
      message: "Describe it.",
    });

    expect(decision).toMatchObject({
      kind: "clarification_candidate",
      ambiguityState: "unknown_target",
      clarificationRequired: true,
      targetTypeCandidate: "unknown",
      nextStep: "clarify",
    });
    expect(decision.missingPreconditions).toContain("target_type_known");
  });

  it("routes unsafe query-style requests to the legacy fallback path", () => {
    const decision = classifyMetadataDiscoveryIntent({
      agentRunId: createAgentRunId(),
      message: "Run a query and show me row values for this datasource.",
    });

    expect(decision).toMatchObject({
      kind: "unsupported",
      ambiguityState: "unsupported",
      nextStep: "legacy_fallback",
      clarificationRequired: false,
    });
    expect(decision.unsupportedReason).toContain("query-style execution");
  });

  it("builds JSON-safe trace metadata for metadata discovery decisions", () => {
    const decision = classifyMetadataDiscoveryIntent({
      agentRunId: createAgentRunId(),
      message: "Tell me about this datasource.",
      targetContext: {
        targetType: "datasource",
        identifier: "sales.datasource",
      },
    });

    const traceMetadata = buildMetadataDiscoveryIntentTraceMetadata(decision);
    expect(JSON.parse(JSON.stringify(traceMetadata))).toEqual(traceMetadata);
    expect(traceMetadata.intentId).toBe("metadata_discovery");
    expect(traceMetadata.metadataBoundaryReady).toBe(true);
  });

  it("can resolve metadata_discovery through the minimal intent resolver without execution wiring", async () => {
    const resolver = createDefaultIntentResolver();
    const result = await resolver.resolve({
      agentRunId: createAgentRunId(),
      message: "Tell me about this datasource.",
      targetContext: {
        targetType: "datasource",
        identifier: "sales.datasource",
      },
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
