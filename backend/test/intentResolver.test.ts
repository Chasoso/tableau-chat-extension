import { describe, expect, it } from "vitest";
import {
  buildIntentResolutionTraceMetadata,
  createFallbackIntentResolution,
  createIntentEvidence,
  createResolvedIntentResolution,
  createUnresolvedIntentResolution,
  normalizeIntentConfidence,
} from "../src/agent";
import { createAgentRunId } from "../src/agent";

describe("intent resolver contract", () => {
  it("clamps confidence into the 0..1 range", () => {
    expect(normalizeIntentConfidence(-1)).toBe(0);
    expect(normalizeIntentConfidence(0.4)).toBe(0.4);
    expect(normalizeIntentConfidence(1)).toBe(1);
    expect(normalizeIntentConfidence(1.5)).toBe(1);
    expect(normalizeIntentConfidence(Number.NaN)).toBe(0);
  });

  it("creates a resolved selected_mark_explanation result", () => {
    const agentRunId = createAgentRunId();
    const result = createResolvedIntentResolution({
      agentRunId,
      resolvedIntentId: "selected_mark_explanation",
      confidence: 0.97,
      source: "ui_action",
      reason: "The user clicked the explain action.",
      evidence: [
        createIntentEvidence("frontend_action", "explain_selection", {
          selectedMarkCount: 3,
        }),
      ],
      traceMetadata: {
        actionId: "explain_selection",
      },
    });

    expect(result).toMatchObject({
      agentRunId,
      status: "resolved",
      resolvedIntentId: "selected_mark_explanation",
      confidence: 0.97,
      source: "ui_action",
      reason: "The user clicked the explain action.",
      evidence: [
        {
          type: "frontend_action",
          value: "explain_selection",
          metadata: { selectedMarkCount: 3 },
        },
      ],
      warnings: [],
      traceMetadata: { actionId: "explain_selection" },
    });
  });

  it("creates an unresolved result with a safe fallback intent", () => {
    const agentRunId = createAgentRunId();
    const result = createUnresolvedIntentResolution({
      agentRunId,
      fallbackIntentId: "unknown",
      reason: "No safe intent could be resolved.",
      warnings: ["missing_ui_action"],
      traceMetadata: {
        resolverMode: "deterministic",
      },
    });

    expect(result).toMatchObject({
      agentRunId,
      status: "unresolved",
      resolvedIntentId: "unknown",
      confidence: 0,
      source: "fallback",
      reason: "No safe intent could be resolved.",
      warnings: ["missing_ui_action"],
      fallbackIntentId: "unknown",
      traceMetadata: { resolverMode: "deterministic" },
    });
  });

  it("creates a fallback result for selected_mark_explanation", () => {
    const agentRunId = createAgentRunId();
    const result = createFallbackIntentResolution({
      agentRunId,
      fallbackIntentId: "selected_mark_explanation",
      confidence: 0.85,
      source: "deterministic_rule",
      reason: "Selected marks are present so the action can be explained.",
      evidence: [
        createIntentEvidence("selected_marks", "present", {
          totalCount: 2,
          truncated: false,
        }),
      ],
    });

    expect(result).toMatchObject({
      agentRunId,
      status: "fallback",
      resolvedIntentId: "selected_mark_explanation",
      confidence: 0.85,
      source: "deterministic_rule",
      reason: "Selected marks are present so the action can be explained.",
      evidence: [
        {
          type: "selected_marks",
          value: "present",
          metadata: { totalCount: 2, truncated: false },
        },
      ],
      fallbackIntentId: "selected_mark_explanation",
    });
  });

  it("builds JSON-safe trace metadata from the result", () => {
    const agentRunId = createAgentRunId();
    const result = createResolvedIntentResolution({
      agentRunId,
      resolvedIntentId: "selected_mark_explanation",
      confidence: 1.2,
      source: "explicit",
      reason: "Explicit request intent provided.",
      evidence: [
        createIntentEvidence("requested_intent", "selected_mark_explanation"),
      ],
      warnings: ["clamped_confidence"],
      traceMetadata: { source: "unit-test" },
      metadata: { correlationId: "corr-1" },
    });

    const traceMetadata = buildIntentResolutionTraceMetadata(result);
    const json = JSON.parse(
      JSON.stringify(traceMetadata),
    ) as typeof traceMetadata;

    expect(traceMetadata).toMatchObject({
      agentRunId,
      status: "resolved",
      resolvedIntentId: "selected_mark_explanation",
      confidence: 1,
      source: "explicit",
      reason: "Explicit request intent provided.",
      warnings: ["clamped_confidence"],
      traceMetadata: { source: "unit-test" },
      metadata: { correlationId: "corr-1" },
    });
    expect(json).toEqual(traceMetadata);
  });
});
