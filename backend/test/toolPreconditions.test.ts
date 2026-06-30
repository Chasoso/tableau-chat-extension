import { describe, expect, it } from "vitest";
import type { ToolDefinition } from "../src/agent";
import {
  evaluateToolPrecondition,
  evaluateToolPreconditions,
  selectedMarkExplanationPreconditions,
  type ToolPrecondition,
} from "../src/agent";

function createToolDefinition(
  preconditions: readonly ToolPrecondition[],
): ToolDefinition {
  return {
    name: "context.selectedMarks",
    description: "Reads selected mark summaries from the current context.",
    category: "context",
    capabilities: ["read_context", "read_selected_marks"],
    safety: {
      level: "read_only",
      safeForPreview: true,
      requiresExplicitAction: false,
      externalAccess: false,
      mayAccessWorkbookContext: true,
      mayAccessSelectedMarks: true,
    },
    availability: { status: "available" },
    inputSchema: { kind: "typescript_contract" },
    outputSchema: { kind: "typescript_contract" },
    preconditions,
  };
}

describe("ToolPrecondition contract", () => {
  it("defines selected_mark_explanation preconditions and keeps them JSON-safe", () => {
    const definition = createToolDefinition(
      selectedMarkExplanationPreconditions,
    );

    expect(definition.preconditions).toHaveLength(3);
    expect(JSON.parse(JSON.stringify(definition))).toEqual(definition);
    expect(JSON.parse(JSON.stringify(definition.preconditions))).toEqual(
      definition.preconditions,
    );
  });

  it("represents selected marks, summary data, availability, permission, confirmation, budget and policy conditions", () => {
    const customPreconditions: ToolPrecondition[] = [
      {
        id: "selected_marks.required",
        type: "requires_selected_marks",
        required: true,
        severity: "critical",
        fallbackReason: "Select at least one mark.",
      },
      {
        id: "summary_data.optional",
        type: "requires_summary_data",
        required: false,
        severity: "info",
      },
      {
        id: "tool_availability.required",
        type: "requires_tool_availability",
        required: true,
        severity: "error",
      },
      {
        id: "permission.required",
        type: "requires_permission",
        required: true,
        severity: "critical",
      },
      {
        id: "confirmation.required",
        type: "requires_explicit_confirmation",
        required: true,
        severity: "critical",
      },
      {
        id: "budget.required",
        type: "requires_budget",
        required: true,
        severity: "error",
      },
      {
        id: "policy.required",
        type: "requires_policy_allowance",
        required: true,
        severity: "error",
      },
      {
        id: "context.required",
        type: "requires_context",
        required: false,
        severity: "warning",
      },
    ];

    const results = evaluateToolPreconditions(customPreconditions, {
      selectedMarkCount: 1,
      summaryDataPreviewAvailable: true,
      permissionGranted: true,
      explicitConfirmation: true,
      budgetRemaining: true,
      allowedByPolicy: true,
      contextAvailable: true,
      toolAvailable: true,
    });

    expect(results).toHaveLength(8);
    expect(results.map((result) => result.status)).toEqual([
      "passed",
      "passed",
      "passed",
      "passed",
      "passed",
      "passed",
      "passed",
      "passed",
    ]);
    expect(JSON.parse(JSON.stringify(results))).toEqual(results);
  });

  it("distinguishes required failures, optional skips and blocked conditions", () => {
    const selectedMarksRequired = evaluateToolPrecondition(
      {
        id: "selected_marks.required",
        type: "requires_selected_marks",
        required: true,
      },
      { selectedMarkCount: 0 },
    );
    const summaryDataOptional = evaluateToolPrecondition(
      {
        id: "summary_data.optional",
        type: "requires_summary_data",
        required: false,
      },
      { summaryDataPreviewAvailable: false },
    );
    const explicitConfirmationBlocked = evaluateToolPrecondition(
      {
        id: "confirmation.required",
        type: "requires_explicit_confirmation",
        required: true,
      },
      { explicitConfirmation: false },
    );
    const budgetBlocked = evaluateToolPrecondition(
      {
        id: "budget.required",
        type: "requires_budget",
        required: true,
      },
      { budgetRemaining: false },
    );
    const policyBlocked = evaluateToolPrecondition(
      {
        id: "policy.required",
        type: "requires_policy_allowance",
        required: true,
      },
      { allowedByPolicy: false },
    );

    expect(selectedMarksRequired.status).toBe("failed");
    expect(summaryDataOptional.status).toBe("skipped");
    expect(explicitConfirmationBlocked.status).toBe("blocked");
    expect(budgetBlocked.status).toBe("blocked");
    expect(policyBlocked.status).toBe("blocked");

    expect(selectedMarksRequired.reason?.toLowerCase()).toContain(
      "selected marks",
    );
    expect(summaryDataOptional.reason?.toLowerCase()).toContain("optional");
    expect(explicitConfirmationBlocked.reason?.toLowerCase()).toContain(
      "confirmation",
    );
    expect(budgetBlocked.reason?.toLowerCase()).toContain("budget");
    expect(policyBlocked.reason?.toLowerCase()).toContain("policy");
  });

  it("does not include raw selected marks or summary data bodies in results", () => {
    const result = evaluateToolPrecondition(
      {
        id: "selected_marks.required",
        type: "requires_selected_marks",
        required: true,
      },
      { selectedMarkCount: 2 },
    );

    expect(result.metadata).toEqual({
      selectedMarkCount: 2,
      minSelectedMarkCount: 1,
    });
    expect(JSON.stringify(result)).not.toContain("selectedMarks");
    expect(JSON.stringify(result)).not.toContain("summaryDataPreview");
  });

  it("can be embedded in ToolDefinition preconditions and remains execution-free", () => {
    const definition = createToolDefinition(
      selectedMarkExplanationPreconditions,
    );

    expect(definition.preconditions?.[0]?.required).toBe(true);
    expect(definition.preconditions?.[1]?.required).toBe(false);
    expect(definition.preconditions?.[2]?.type).toBe(
      "requires_policy_allowance",
    );
    expect(definition.preconditions?.[0]?.fallbackReason).toContain(
      "Select one or more marks",
    );
  });
});
