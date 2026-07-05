import { describe, expect, it } from "vitest";
import {
  buildMetadataDiscoveryPlan,
  buildMetadataDiscoveryPlanTraceMetadata,
  classifyMetadataDiscoveryIntent,
  createAgentRunId,
} from "../src/agent";

describe("metadata discovery plan shape", () => {
  it("builds an executable plan for a datasource with an identifier", () => {
    const decision = classifyMetadataDiscoveryIntent({
      agentRunId: createAgentRunId(),
      message: "Tell me about this datasource.",
      targetContext: {
        targetType: "datasource",
        identifier: "sales.datasource",
      },
    });

    const plan = buildMetadataDiscoveryPlan({
      decision,
      targetContext: {
        targetType: "datasource",
        identifier: "sales.datasource",
      },
    });

    expect(plan).toMatchObject({
      kind: "metadata_discovery.plan",
      intentId: "metadata_discovery",
      planState: "executable",
      reasonCode: "safe_executable_datasource_candidate",
      targetType: "datasource",
      targetIdentifier: "sales.datasource",
      executionGate: {
        canExecute: true,
        safeToExecute: true,
        requiresHostedMcp: true,
        requiresNetwork: true,
      },
      metadataBoundary: {
        kind: "hosted_wrapper",
        toolName: "tableau.metadata.describeDatasource",
        operation: "describeDatasource",
      },
    });
    expect(plan.executionCandidate).toMatchObject({
      appToolName: "tableau.metadata.describeDatasource",
      status: "ready",
      operation: "describeDatasource",
      safeToExecute: true,
      rawToolExposure: false,
    });
    expect(plan.deferredToolCandidates).toHaveLength(1);
    expect(plan.deferredToolCandidates[0]).toMatchObject({
      appToolName: "tableau.metadata.listFields",
      status: "deferred",
      operation: "listFields",
      safeToExecute: false,
      rawToolExposure: false,
    });
    expect(JSON.parse(JSON.stringify(plan))).toEqual(plan);
  });

  it("builds a clarification plan when the datasource identifier is missing", () => {
    const decision = classifyMetadataDiscoveryIntent({
      agentRunId: createAgentRunId(),
      message: "Tell me about this datasource.",
      targetContext: { targetType: "datasource" },
    });

    const plan = buildMetadataDiscoveryPlan({
      decision,
      targetContext: {
        targetType: "datasource",
        identifier: "sales.datasource",
      },
    });

    expect(plan).toMatchObject({
      planState: "clarification_required",
      reasonCode: "missing_identifier",
      clarification: {
        requiresClarification: true,
      },
      executionGate: {
        canExecute: false,
        safeToExecute: false,
      },
      metadataBoundary: {
        kind: "controlled_candidate",
        toolName: "tableau.metadata.listFields",
        operation: "listFields",
      },
    });
    expect(plan.clarification.clarificationResponse).toMatchObject({
      kind: "clarification_required",
      reasonCode: "missing_identifier",
      canExecute: false,
    });
    expect(JSON.parse(JSON.stringify(plan))).toEqual(plan);
  });

  it("builds an unsupported plan for unsafe data access or write requests", () => {
    const decision = classifyMetadataDiscoveryIntent({
      agentRunId: createAgentRunId(),
      message: "Update the workbook and show me the row values.",
    });

    const plan = buildMetadataDiscoveryPlan({ decision });

    expect(plan).toMatchObject({
      planState: "unsupported",
      unsupportedGate: {
        isUnsupported: true,
        fallbackRecommended: true,
      },
      executionGate: {
        canExecute: false,
        safeToExecute: false,
      },
      fallbackGate: {
        isFallback: false,
      },
    });
    expect(plan.clarification.clarificationResponse).toMatchObject({
      kind: "unsupported",
      reasonCode: "unsupported_write_request",
      canExecute: false,
    });
    expect(JSON.parse(JSON.stringify(plan))).toEqual(plan);
  });

  it("builds a fallback plan for non-discovery requests", () => {
    const decision = classifyMetadataDiscoveryIntent({
      agentRunId: createAgentRunId(),
      message: "Hello there.",
    });

    const plan = buildMetadataDiscoveryPlan({ decision });

    expect(plan).toMatchObject({
      planState: "fallback",
      reasonCode: "legacy_fallback",
      fallbackGate: {
        isFallback: true,
      },
      executionGate: {
        canExecute: false,
        safeToExecute: false,
      },
      metadataBoundary: {
        kind: "none",
      },
    });
    expect(plan.deferredToolCandidates).toHaveLength(0);
    expect(JSON.parse(JSON.stringify(plan))).toEqual(plan);
  });

  it("builds JSON-safe trace metadata without raw MCP exposure", () => {
    const decision = classifyMetadataDiscoveryIntent({
      agentRunId: createAgentRunId(),
      message: "Tell me about this datasource.",
      targetContext: {
        targetType: "datasource",
        identifier: "sales.datasource",
      },
    });

    const plan = buildMetadataDiscoveryPlan({
      decision,
      targetContext: {
        targetType: "datasource",
        identifier: "sales.datasource",
      },
    });
    const traceMetadata = buildMetadataDiscoveryPlanTraceMetadata(plan);

    expect(JSON.parse(JSON.stringify(traceMetadata))).toEqual(traceMetadata);
    expect(traceMetadata).toMatchObject({
      kind: "metadata_discovery.plan",
      planState: "executable",
      executionGate: {
        safeToExecute: true,
      },
      metadataBoundary: {
        kind: "hosted_wrapper",
      },
    });
    expect(JSON.stringify(traceMetadata)).not.toContain("rawMcp");
    expect(JSON.stringify(traceMetadata)).not.toContain("token");
    expect(JSON.stringify(traceMetadata)).not.toContain("secret");
  });
});
