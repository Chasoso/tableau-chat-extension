import type { JsonObject } from "./types";

export type ToolPreconditionType =
  | "requires_selected_marks"
  | "requires_summary_data"
  | "requires_tool_availability"
  | "requires_permission"
  | "requires_explicit_confirmation"
  | "requires_budget"
  | "requires_policy_allowance"
  | "requires_context";

export type ToolPreconditionSeverity =
  | "info"
  | "warning"
  | "error"
  | "critical";

export type ToolPreconditionStatus =
  | "passed"
  | "failed"
  | "skipped"
  | "blocked";

export type ToolPrecondition = {
  id: string;
  type: ToolPreconditionType;
  description?: string;
  required: boolean;
  severity?: ToolPreconditionSeverity;
  expected?: JsonObject;
  fallbackReason?: string;
  metadata?: JsonObject;
};

export type ToolPreconditionResult = {
  id: string;
  type: ToolPreconditionType;
  status: ToolPreconditionStatus;
  required: boolean;
  reason?: string;
  warnings?: string[];
  metadata?: JsonObject;
  evaluatedAt?: string;
};

export type ToolPreconditionEvaluationContext = {
  selectedMarkCount?: number;
  summaryDataPreviewAvailable?: boolean;
  permissionGranted?: boolean;
  explicitConfirmation?: boolean;
  budgetRemaining?: boolean;
  allowedByPolicy?: boolean;
  contextAvailable?: boolean;
  toolAvailable?: boolean;
};

export const selectedMarkExplanationPreconditions: readonly ToolPrecondition[] =
  [
    {
      id: "selected_marks.required",
      type: "requires_selected_marks",
      required: true,
      severity: "critical",
      description: "Requires at least one selected mark.",
      expected: {
        minSelectedMarkCount: 1,
      },
      fallbackReason:
        "Select one or more marks before explaining the selection.",
      metadata: {
        contextSource: "selected_marks",
      },
    },
    {
      id: "summary_data.optional",
      type: "requires_summary_data",
      required: false,
      severity: "info",
      description: "Uses summary data preview when available.",
      expected: {
        summaryDataPreviewAvailable: true,
      },
      fallbackReason:
        "Summary data preview is unavailable; continue with the selected marks only.",
      metadata: {
        contextSource: "summary_data_preview",
      },
    },
    {
      id: "tool_policy.allowed",
      type: "requires_policy_allowance",
      required: true,
      severity: "error",
      description: "Tool must be allowed by the selected plan policy.",
      expected: {
        allowedByPolicy: true,
      },
      fallbackReason: "This tool is not allowed by the current plan policy.",
      metadata: {
        policySurface: "plan",
      },
    },
  ] as const;

export function evaluateToolPrecondition(
  precondition: ToolPrecondition,
  context: ToolPreconditionEvaluationContext = {},
): ToolPreconditionResult {
  switch (precondition.type) {
    case "requires_selected_marks":
      return evaluateSelectedMarksPrecondition(precondition, context);
    case "requires_summary_data":
      return evaluateSummaryDataPrecondition(precondition, context);
    case "requires_tool_availability":
      return evaluateToolAvailabilityPrecondition(precondition, context);
    case "requires_permission":
      return evaluatePermissionPrecondition(precondition, context);
    case "requires_explicit_confirmation":
      return evaluateExplicitConfirmationPrecondition(precondition, context);
    case "requires_budget":
      return evaluateBudgetPrecondition(precondition, context);
    case "requires_policy_allowance":
      return evaluatePolicyPrecondition(precondition, context);
    case "requires_context":
      return evaluateContextPrecondition(precondition, context);
  }
}

export function evaluateToolPreconditions(
  preconditions: readonly ToolPrecondition[],
  context: ToolPreconditionEvaluationContext = {},
): ToolPreconditionResult[] {
  return preconditions.map((precondition) =>
    evaluateToolPrecondition(precondition, context),
  );
}

function evaluateSelectedMarksPrecondition(
  precondition: ToolPrecondition,
  context: ToolPreconditionEvaluationContext,
): ToolPreconditionResult {
  const selectedMarkCount = context.selectedMarkCount ?? 0;
  const passed = selectedMarkCount > 0;

  return createResult({
    precondition,
    status: passed ? "passed" : precondition.required ? "failed" : "skipped",
    reason: passed
      ? `Selected marks are available (${selectedMarkCount}).`
      : (precondition.fallbackReason ?? "Selected marks are required."),
    metadata: {
      ...(precondition.metadata ?? {}),
      minSelectedMarkCount: precondition.expected?.minSelectedMarkCount ?? 1,
      selectedMarkCount,
    },
  });
}

function evaluateSummaryDataPrecondition(
  precondition: ToolPrecondition,
  context: ToolPreconditionEvaluationContext,
): ToolPreconditionResult {
  const available = Boolean(context.summaryDataPreviewAvailable);
  const status = available
    ? "passed"
    : precondition.required
      ? "failed"
      : "skipped";

  return createResult({
    precondition,
    status,
    reason: available
      ? "Summary data preview is available."
      : (precondition.fallbackReason ??
        "Summary data preview is unavailable, but this condition is optional."),
    warnings: available ? [] : ["summary_data_preview_unavailable"],
    metadata: {
      ...(precondition.metadata ?? {}),
      summaryDataPreviewAvailable: available,
    },
  });
}

function evaluateToolAvailabilityPrecondition(
  precondition: ToolPrecondition,
  context: ToolPreconditionEvaluationContext,
): ToolPreconditionResult {
  const available =
    context.toolAvailable === undefined ? true : context.toolAvailable;

  return createResult({
    precondition,
    status: available
      ? "passed"
      : precondition.required
        ? "blocked"
        : "skipped",
    reason: available
      ? "Tool is available."
      : (precondition.fallbackReason ?? "Tool is unavailable."),
    warnings: available ? [] : ["tool_unavailable"],
    metadata: {
      ...(precondition.metadata ?? {}),
      toolAvailable: available,
    },
  });
}

function evaluatePermissionPrecondition(
  precondition: ToolPrecondition,
  context: ToolPreconditionEvaluationContext,
): ToolPreconditionResult {
  const granted = Boolean(context.permissionGranted);

  return createResult({
    precondition,
    status: granted ? "passed" : precondition.required ? "blocked" : "skipped",
    reason: granted
      ? "Permission is granted."
      : (precondition.fallbackReason ?? "Permission is required."),
    warnings: granted ? [] : ["permission_required"],
    metadata: {
      ...(precondition.metadata ?? {}),
      permissionGranted: granted,
    },
  });
}

function evaluateExplicitConfirmationPrecondition(
  precondition: ToolPrecondition,
  context: ToolPreconditionEvaluationContext,
): ToolPreconditionResult {
  const confirmed = Boolean(context.explicitConfirmation);

  return createResult({
    precondition,
    status: confirmed
      ? "passed"
      : precondition.required
        ? "blocked"
        : "skipped",
    reason: confirmed
      ? "Explicit confirmation was provided."
      : (precondition.fallbackReason ??
        "Explicit confirmation is required before continuing."),
    warnings: confirmed ? [] : ["explicit_confirmation_required"],
    metadata: {
      ...(precondition.metadata ?? {}),
      explicitConfirmation: confirmed,
    },
  });
}

function evaluateBudgetPrecondition(
  precondition: ToolPrecondition,
  context: ToolPreconditionEvaluationContext,
): ToolPreconditionResult {
  const remaining =
    context.budgetRemaining === undefined ? true : context.budgetRemaining;

  return createResult({
    precondition,
    status: remaining
      ? "passed"
      : precondition.required
        ? "blocked"
        : "skipped",
    reason: remaining
      ? "Budget remains available."
      : (precondition.fallbackReason ?? "Budget has been exhausted."),
    warnings: remaining ? [] : ["budget_exhausted"],
    metadata: {
      ...(precondition.metadata ?? {}),
      budgetRemaining: remaining,
    },
  });
}

function evaluatePolicyPrecondition(
  precondition: ToolPrecondition,
  context: ToolPreconditionEvaluationContext,
): ToolPreconditionResult {
  const allowed =
    context.allowedByPolicy === undefined ? true : context.allowedByPolicy;

  return createResult({
    precondition,
    status: allowed ? "passed" : precondition.required ? "blocked" : "skipped",
    reason: allowed
      ? "Policy allows this tool."
      : (precondition.fallbackReason ?? "Policy disallows this tool."),
    warnings: allowed ? [] : ["policy_disallowed"],
    metadata: {
      ...(precondition.metadata ?? {}),
      allowedByPolicy: allowed,
    },
  });
}

function evaluateContextPrecondition(
  precondition: ToolPrecondition,
  context: ToolPreconditionEvaluationContext,
): ToolPreconditionResult {
  const available = Boolean(context.contextAvailable);

  return createResult({
    precondition,
    status: available ? "passed" : precondition.required ? "failed" : "skipped",
    reason: available
      ? "Context is available."
      : (precondition.fallbackReason ?? "Context is required."),
    warnings: available ? [] : ["context_unavailable"],
    metadata: {
      ...(precondition.metadata ?? {}),
      contextAvailable: available,
    },
  });
}

function createResult(input: {
  precondition: ToolPrecondition;
  status: ToolPreconditionStatus;
  reason: string;
  warnings?: string[];
  metadata?: JsonObject;
}): ToolPreconditionResult {
  return {
    id: input.precondition.id,
    type: input.precondition.type,
    status: input.status,
    required: input.precondition.required,
    reason: input.reason,
    ...(input.warnings && input.warnings.length > 0
      ? { warnings: [...input.warnings] }
      : {}),
    ...(input.metadata ? { metadata: { ...input.metadata } } : {}),
    evaluatedAt: new Date().toISOString(),
  };
}
