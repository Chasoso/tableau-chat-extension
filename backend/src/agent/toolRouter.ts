import type { AgentRunId } from "./runId";
import type { IntentId } from "./intent";
import type {
  PlanPreconditionResult,
  PlanStep,
  RunBudget,
  PlanId,
  PlanMetadata,
} from "./plan";
import type {
  ToolLookupResult,
  ToolPolicy,
  ToolRegistry,
} from "./toolRegistry";
import type { JsonObject } from "./types";

export type ToolRoutingStatus =
  | "allowed"
  | "skipped"
  | "blocked"
  | "unavailable";

export type ToolRoutingPreconditionStatus =
  | "passed"
  | "failed"
  | "skipped"
  | "blocked"
  | "unknown";

export type ToolRoutingBudgetStatus = {
  exceeded: boolean;
  maxToolCalls?: number;
  toolCallsUsed?: number;
};

export type ToolRoutingPolicy = {
  mode: "allowlist" | "denylist";
  allowedTools: readonly string[];
  disallowedTools: readonly string[];
  safeForPreviewOnly?: boolean;
  requiresExplicitActionAllowed?: boolean;
};

export type ToolRoutingFallbackBehavior =
  | {
      kind: "none";
      reasonBrief?: string;
    }
  | {
      kind: "skip";
      reasonBrief: string;
    }
  | {
      kind: "block";
      reasonBrief: string;
    }
  | {
      kind: "route_to_fallback";
      toolName: string;
      reasonBrief: string;
    };

export type ToolRoutingContextSummary = {
  dashboardName?: string;
  worksheetNames?: string[];
  selectedMarkCount?: number;
  hasSelectedMarks?: boolean;
  contextPackIds?: string[];
};

export type ToolRoutingPreconditionResult = Pick<
  PlanPreconditionResult,
  "id" | "type" | "required" | "reasonBrief" | "fallbackReason" | "metadata"
> & {
  status: ToolRoutingPreconditionStatus;
};

export type ToolRoutingInput = {
  agentRunId: AgentRunId;
  intentId: IntentId;
  planId: PlanId;
  step: PlanStep;
  requestedToolName?: string;
  allowedTools?: readonly string[];
  disallowedTools?: readonly string[];
  toolPolicy?: ToolRoutingPolicy;
  runBudget?: RunBudget;
  budgetUsage?: {
    toolCallsUsed?: number;
    modelCallsUsed?: number;
  };
  contextSummary?: ToolRoutingContextSummary;
  preconditions?: ToolRoutingPreconditionResult[];
  metadata?: JsonObject;
};

export type ToolRoutingResult = {
  agentRunId: AgentRunId;
  intentId: IntentId;
  planId: PlanId;
  stepId: string;
  status: ToolRoutingStatus;
  toolName?: string;
  reason?: string;
  warnings: string[];
  preconditionStatus: ToolRoutingPreconditionStatus;
  budgetStatus: ToolRoutingBudgetStatus;
  fallbackBehavior?: ToolRoutingFallbackBehavior;
  metadata?: JsonObject;
  traceMetadata?: JsonObject;
};

export interface ToolRouter {
  route(input: ToolRoutingInput): Promise<ToolRoutingResult>;
}

export type MinimalToolRouterOptions = {
  defaultFallbackBehavior?: ToolRoutingFallbackBehavior;
  registry?: ToolRegistry;
};

export class MinimalToolRouter implements ToolRouter {
  constructor(private readonly options: MinimalToolRouterOptions = {}) {}

  async route(input: ToolRoutingInput): Promise<ToolRoutingResult> {
    const toolName = normalizeToolName(
      input.requestedToolName ?? input.step.toolName,
    );
    const budgetStatus = buildBudgetStatus(input.runBudget, input.budgetUsage);
    const preconditionStatus = buildPreconditionStatus(input.preconditions);
    const isRequiredStep = input.step.required;
    const warnings: string[] = [];
    const registryPolicy = buildRegistryPolicy(input);

    if (budgetStatus.exceeded) {
      return createBlockedRoutingResult({
        input,
        toolName,
        reason: "Tool budget has been exhausted.",
        warnings: ["tool_budget_exceeded"],
        preconditionStatus,
        budgetStatus,
        fallbackBehavior: {
          kind: "block",
          reasonBrief: "Tool budget has been exhausted.",
        },
      });
    }

    if (preconditionStatus === "failed" || preconditionStatus === "blocked") {
      if (isRequiredStep) {
        return createBlockedRoutingResult({
          input,
          toolName,
          reason: "A required precondition failed before tool routing.",
          warnings: ["precondition_failed"],
          preconditionStatus,
          budgetStatus,
          fallbackBehavior: {
            kind: "block",
            reasonBrief: "A required precondition failed before tool routing.",
          },
        });
      }

      return createSkippedRoutingResult({
        input,
        toolName,
        reason: "An optional step was skipped because a precondition failed.",
        warnings: ["precondition_failed"],
        preconditionStatus,
        budgetStatus,
        fallbackBehavior: {
          kind: "skip",
          reasonBrief:
            "An optional step was skipped because a precondition failed.",
        },
      });
    }

    if (!toolName) {
      if (isRequiredStep) {
        return createUnavailableRoutingResult({
          input,
          reason: "A required tool was not requested for this step.",
          warnings: ["missing_requested_tool"],
          preconditionStatus,
          budgetStatus,
        });
      }

      return createSkippedRoutingResult({
        input,
        reason: "No tool was requested for this optional step.",
        warnings: ["missing_requested_tool"],
        preconditionStatus,
        budgetStatus,
        fallbackBehavior: {
          kind: "skip",
          reasonBrief: "No tool was requested for this optional step.",
        },
      });
    }

    const registry = this.options.registry;
    if (!registry) {
      return this.routeWithoutRegistry({
        input,
        toolName,
        warnings,
        budgetStatus,
        preconditionStatus,
        isRequiredStep,
      });
    }

    const lookup = registry.lookup(toolName, registryPolicy);
    return mapToolLookupToRoutingResult({
      lookup,
      input,
      toolName,
      warnings,
      budgetStatus,
      preconditionStatus,
    });
  }

  private routeWithoutRegistry(input: {
    input: ToolRoutingInput;
    toolName: string;
    warnings: string[];
    budgetStatus: ToolRoutingBudgetStatus;
    preconditionStatus: ToolRoutingPreconditionStatus;
    isRequiredStep: boolean;
  }): ToolRoutingResult {
    if (
      isDisallowedTool(
        input.toolName,
        input.input.disallowedTools,
        input.input.toolPolicy,
      )
    ) {
      return createBlockedRoutingResult({
        input: input.input,
        toolName: input.toolName,
        reason: `Tool '${input.toolName}' is disallowed by the current policy.`,
        warnings: ["tool_disallowed"],
        preconditionStatus: input.preconditionStatus,
        budgetStatus: input.budgetStatus,
        fallbackBehavior: {
          kind: "block",
          reasonBrief: `Tool '${input.toolName}' is disallowed by the current policy.`,
        },
      });
    }

    if (
      isAllowlistedTool(
        input.toolName,
        input.input.allowedTools,
        input.input.toolPolicy,
      )
    ) {
      return createAllowedRoutingResult({
        input: input.input,
        toolName: input.toolName,
        reason: `Tool '${input.toolName}' is allowed by the current plan.`,
        warnings: input.warnings,
        preconditionStatus: input.preconditionStatus,
        budgetStatus: input.budgetStatus,
      });
    }

    if (hasAllowlist(input.input.allowedTools, input.input.toolPolicy)) {
      return createBlockedRoutingResult({
        input: input.input,
        toolName: input.toolName,
        reason: `Tool '${input.toolName}' is not present in the allowlist.`,
        warnings: ["tool_not_allowlisted"],
        preconditionStatus: input.preconditionStatus,
        budgetStatus: input.budgetStatus,
        fallbackBehavior: {
          kind: "block",
          reasonBrief: `Tool '${input.toolName}' is not present in the allowlist.`,
        },
      });
    }

    return createAllowedRoutingResult({
      input: input.input,
      toolName: input.toolName,
      reason: `Tool '${input.toolName}' can proceed under the current policy.`,
      warnings: input.warnings,
      preconditionStatus: input.preconditionStatus,
      budgetStatus: input.budgetStatus,
    });
  }
}

export function createMinimalToolRouter(
  options?: MinimalToolRouterOptions,
): ToolRouter {
  return new MinimalToolRouter(options);
}

export function createDefaultToolRouter(
  options?: MinimalToolRouterOptions,
): ToolRouter {
  return createMinimalToolRouter(options);
}

function mapToolLookupToRoutingResult(input: {
  lookup: ToolLookupResult;
  input: ToolRoutingInput;
  toolName: string;
  warnings: string[];
  budgetStatus: ToolRoutingBudgetStatus;
  preconditionStatus: ToolRoutingPreconditionStatus;
}): ToolRoutingResult {
  const lookupMetadata = buildRegistryLookupMetadata(input.lookup);
  const routingWarnings = [
    ...input.warnings,
    ...(input.lookup.warnings ? input.lookup.warnings : []),
  ];

  switch (input.lookup.status) {
    case "found": {
      const result = createAllowedRoutingResult({
        input: input.input,
        toolName: input.toolName,
        reason:
          input.lookup.reason ??
          `Tool '${input.toolName}' is registered and available.`,
        warnings: routingWarnings,
        preconditionStatus: input.preconditionStatus,
        budgetStatus: input.budgetStatus,
      });
      return mergeRoutingResultMetadata(result, lookupMetadata);
    }
    case "missing": {
      const result = createUnavailableRoutingResult({
        input: input.input,
        reason:
          input.lookup.reason !== undefined
            ? `Tool '${input.toolName}' is missing from the registry. ${input.lookup.reason}`
            : `Tool '${input.toolName}' is missing from the registry.`,
        warnings:
          routingWarnings.length > 0 ? routingWarnings : ["missing_tool"],
        preconditionStatus: input.preconditionStatus,
        budgetStatus: input.budgetStatus,
      });
      return mergeRoutingResultMetadata(result, lookupMetadata);
    }
    case "unavailable": {
      const result = createUnavailableRoutingResult({
        input: input.input,
        reason:
          input.lookup.reason !== undefined
            ? `Tool '${input.toolName}' is unavailable. ${input.lookup.reason}`
            : `Tool '${input.toolName}' is unavailable.`,
        warnings:
          routingWarnings.length > 0 ? routingWarnings : ["tool_unavailable"],
        preconditionStatus: input.preconditionStatus,
        budgetStatus: input.budgetStatus,
      });
      return mergeRoutingResultMetadata(result, lookupMetadata);
    }
    case "disallowed": {
      const result = createBlockedRoutingResult({
        input: input.input,
        toolName: input.toolName,
        reason:
          input.lookup.reason ?? `Tool '${input.toolName}' is disallowed.`,
        warnings:
          routingWarnings.length > 0
            ? routingWarnings
            : ["tool_disallowed_by_registry"],
        preconditionStatus: input.preconditionStatus,
        budgetStatus: input.budgetStatus,
        fallbackBehavior: {
          kind: "block",
          reasonBrief:
            input.lookup.reason ?? `Tool '${input.toolName}' is disallowed.`,
        },
      });
      return mergeRoutingResultMetadata(result, lookupMetadata);
    }
  }
}

function mergeRoutingResultMetadata(
  result: ToolRoutingResult,
  metadata: JsonObject,
): ToolRoutingResult {
  return {
    ...result,
    metadata: {
      ...(result.metadata ?? {}),
      routingDecision: metadata,
    },
    traceMetadata: {
      ...(result.traceMetadata ?? {}),
      registryLookup: metadata,
    },
  };
}

function buildRegistryLookupMetadata(lookup: ToolLookupResult): JsonObject {
  const metadata: JsonObject = {
    lookupStatus: lookup.status,
    toolName: lookup.toolName,
  };

  if (lookup.reason) {
    metadata.reason = lookup.reason;
  }
  if (lookup.warnings && lookup.warnings.length > 0) {
    metadata.warnings = [...lookup.warnings];
  }
  if (lookup.tool) {
    metadata.tool = buildToolSummaryMetadata(lookup.tool);
  }
  if (lookup.metadata) {
    metadata.metadata = { ...lookup.metadata };
  }
  if (lookup.traceMetadata) {
    metadata.traceMetadata = { ...lookup.traceMetadata };
  }

  return metadata;
}

function buildToolSummaryMetadata(
  tool: NonNullable<ToolLookupResult["tool"]>,
): JsonObject {
  const metadata: JsonObject = {
    name: tool.name,
    description: tool.description,
    category: tool.category,
    capabilities: [...tool.capabilities],
    safety: buildToolSafetyMetadata(tool.safety),
    availability: buildToolAvailabilityMetadata(tool.availability),
  };

  if (tool.version !== undefined) {
    metadata.version = tool.version;
  }

  return metadata;
}

function buildToolSafetyMetadata(
  toolSafety: NonNullable<ToolLookupResult["tool"]>["safety"],
): JsonObject {
  const metadata: JsonObject = {
    level: toolSafety.level,
    safeForPreview: toolSafety.safeForPreview,
    requiresExplicitAction: toolSafety.requiresExplicitAction,
  };

  if (toolSafety.requiresAuthentication !== undefined) {
    metadata.requiresAuthentication = toolSafety.requiresAuthentication;
  }
  if (toolSafety.externalAccess !== undefined) {
    metadata.externalAccess = toolSafety.externalAccess;
  }
  if (toolSafety.mayCallMcp !== undefined) {
    metadata.mayCallMcp = toolSafety.mayCallMcp;
  }
  if (toolSafety.mayCallExternalApi !== undefined) {
    metadata.mayCallExternalApi = toolSafety.mayCallExternalApi;
  }
  if (toolSafety.mayAccessWorkbookContext !== undefined) {
    metadata.mayAccessWorkbookContext = toolSafety.mayAccessWorkbookContext;
  }
  if (toolSafety.mayAccessSelectedMarks !== undefined) {
    metadata.mayAccessSelectedMarks = toolSafety.mayAccessSelectedMarks;
  }
  if (toolSafety.mayAccessSummaryData !== undefined) {
    metadata.mayAccessSummaryData = toolSafety.mayAccessSummaryData;
  }

  return metadata;
}

function buildToolAvailabilityMetadata(
  toolAvailability: NonNullable<ToolLookupResult["tool"]>["availability"],
): JsonObject {
  const metadata: JsonObject = {
    status: toolAvailability.status,
  };

  if (toolAvailability.reason !== undefined) {
    metadata.reason = toolAvailability.reason;
  }

  return metadata;
}

export function buildToolRoutingTraceMetadata(
  result: ToolRoutingResult,
): PlanMetadata {
  const budgetStatus = buildBudgetStatusMetadata(result.budgetStatus);
  const metadata: PlanMetadata = {
    agentRunId: result.agentRunId,
    intentId: result.intentId,
    planId: result.planId,
    stepId: result.stepId,
    status: result.status,
    preconditionStatus: result.preconditionStatus,
    budgetStatus,
  };

  if (result.toolName) {
    metadata.toolName = result.toolName;
  }
  if (result.reason) {
    metadata.reason = result.reason;
  }
  if (result.warnings.length > 0) {
    metadata.warnings = [...result.warnings];
  }
  if (result.fallbackBehavior) {
    metadata.fallbackBehavior = { ...result.fallbackBehavior };
  }
  if (result.metadata) {
    metadata.metadata = { ...result.metadata };
  }

  return metadata;
}

function createAllowedRoutingResult(input: {
  input: ToolRoutingInput;
  toolName: string;
  reason: string;
  warnings: string[];
  preconditionStatus: ToolRoutingPreconditionStatus;
  budgetStatus: ToolRoutingBudgetStatus;
}): ToolRoutingResult {
  return {
    agentRunId: input.input.agentRunId,
    intentId: input.input.intentId,
    planId: input.input.planId,
    stepId: input.input.step.id,
    status: "allowed",
    toolName: input.toolName,
    reason: input.reason,
    warnings: [...input.warnings],
    preconditionStatus: input.preconditionStatus,
    budgetStatus: { ...input.budgetStatus },
    ...(input.input.metadata ? { metadata: { ...input.input.metadata } } : {}),
    traceMetadata: buildTraceMetadata(input, "allowed"),
  };
}

function createSkippedRoutingResult(input: {
  input: ToolRoutingInput;
  toolName?: string;
  reason: string;
  warnings: string[];
  preconditionStatus: ToolRoutingPreconditionStatus;
  budgetStatus: ToolRoutingBudgetStatus;
  fallbackBehavior?: ToolRoutingFallbackBehavior;
}): ToolRoutingResult {
  return {
    agentRunId: input.input.agentRunId,
    intentId: input.input.intentId,
    planId: input.input.planId,
    stepId: input.input.step.id,
    status: "skipped",
    ...(input.toolName ? { toolName: input.toolName } : {}),
    reason: input.reason,
    warnings: [...input.warnings],
    preconditionStatus: input.preconditionStatus,
    budgetStatus: { ...input.budgetStatus },
    ...(input.fallbackBehavior
      ? { fallbackBehavior: input.fallbackBehavior }
      : {}),
    ...(input.input.metadata ? { metadata: { ...input.input.metadata } } : {}),
    traceMetadata: buildTraceMetadata(input, "skipped"),
  };
}

function createBlockedRoutingResult(input: {
  input: ToolRoutingInput;
  toolName?: string;
  reason: string;
  warnings: string[];
  preconditionStatus: ToolRoutingPreconditionStatus;
  budgetStatus: ToolRoutingBudgetStatus;
  fallbackBehavior?: ToolRoutingFallbackBehavior;
}): ToolRoutingResult {
  return {
    agentRunId: input.input.agentRunId,
    intentId: input.input.intentId,
    planId: input.input.planId,
    stepId: input.input.step.id,
    status: "blocked",
    ...(input.toolName ? { toolName: input.toolName } : {}),
    reason: input.reason,
    warnings: [...input.warnings],
    preconditionStatus: input.preconditionStatus,
    budgetStatus: { ...input.budgetStatus },
    ...(input.fallbackBehavior
      ? { fallbackBehavior: input.fallbackBehavior }
      : {}),
    ...(input.input.metadata ? { metadata: { ...input.input.metadata } } : {}),
    traceMetadata: buildTraceMetadata(input, "blocked"),
  };
}

function createUnavailableRoutingResult(input: {
  input: ToolRoutingInput;
  reason: string;
  warnings: string[];
  preconditionStatus: ToolRoutingPreconditionStatus;
  budgetStatus: ToolRoutingBudgetStatus;
}): ToolRoutingResult {
  return {
    agentRunId: input.input.agentRunId,
    intentId: input.input.intentId,
    planId: input.input.planId,
    stepId: input.input.step.id,
    status: "unavailable",
    reason: input.reason,
    warnings: [...input.warnings],
    preconditionStatus: input.preconditionStatus,
    budgetStatus: { ...input.budgetStatus },
    fallbackBehavior: {
      kind: "block",
      reasonBrief: input.reason,
    },
    ...(input.input.metadata ? { metadata: { ...input.input.metadata } } : {}),
    traceMetadata: buildTraceMetadata(input, "unavailable"),
  };
}

function buildTraceMetadata(
  input: {
    input: ToolRoutingInput;
    reason: string;
    warnings: string[];
    preconditionStatus: ToolRoutingPreconditionStatus;
    budgetStatus: ToolRoutingBudgetStatus;
    fallbackBehavior?: ToolRoutingFallbackBehavior;
    toolName?: string;
  },
  status: ToolRoutingStatus,
): PlanMetadata {
  const budgetStatus = buildBudgetStatusMetadata(input.budgetStatus);
  const metadata: PlanMetadata = {
    agentRunId: input.input.agentRunId,
    planId: input.input.planId,
    stepId: input.input.step.id,
    intentId: input.input.intentId,
    status,
    reason: input.reason,
    preconditionStatus: input.preconditionStatus,
    budgetStatus,
  };

  if (input.toolName) {
    metadata.toolName = input.toolName;
  }
  if (input.warnings.length > 0) {
    metadata.warnings = [...input.warnings];
  }
  if (input.fallbackBehavior) {
    metadata.fallbackBehavior = { ...input.fallbackBehavior };
  }

  return metadata;
}

function buildBudgetStatus(
  runBudget: RunBudget | undefined,
  budgetUsage: ToolRoutingInput["budgetUsage"],
): ToolRoutingBudgetStatus {
  const maxToolCalls = runBudget?.maxToolCalls;
  const toolCallsUsed = budgetUsage?.toolCallsUsed;
  const exceeded =
    maxToolCalls !== undefined &&
    toolCallsUsed !== undefined &&
    toolCallsUsed >= maxToolCalls;

  return {
    exceeded,
    ...(maxToolCalls !== undefined ? { maxToolCalls } : {}),
    ...(toolCallsUsed !== undefined ? { toolCallsUsed } : {}),
  };
}

function buildBudgetStatusMetadata(
  budgetStatus: ToolRoutingBudgetStatus,
): JsonObject {
  const metadata: JsonObject = {
    exceeded: budgetStatus.exceeded,
  };

  if (budgetStatus.maxToolCalls !== undefined) {
    metadata.maxToolCalls = budgetStatus.maxToolCalls;
  }
  if (budgetStatus.toolCallsUsed !== undefined) {
    metadata.toolCallsUsed = budgetStatus.toolCallsUsed;
  }

  return metadata;
}

function buildPreconditionStatus(
  preconditions?: ToolRoutingPreconditionResult[],
): ToolRoutingPreconditionStatus {
  if (!preconditions || preconditions.length === 0) {
    return "unknown";
  }

  if (preconditions.some((precondition) => precondition.status === "blocked")) {
    return "blocked";
  }

  if (preconditions.some((precondition) => precondition.status === "failed")) {
    return "failed";
  }

  if (
    preconditions.every(
      (precondition) =>
        precondition.status === "passed" || precondition.status === "skipped",
    )
  ) {
    return "passed";
  }

  return "skipped";
}

function buildRegistryPolicy(input: ToolRoutingInput): ToolPolicy {
  return {
    allowedTools: input.allowedTools?.length
      ? [...input.allowedTools]
      : input.toolPolicy?.mode === "allowlist"
        ? [...input.toolPolicy.allowedTools]
        : undefined,
    disallowedTools: input.disallowedTools?.length
      ? [...input.disallowedTools]
      : input.toolPolicy?.mode === "denylist"
        ? [...input.toolPolicy.disallowedTools]
        : undefined,
    ...(input.toolPolicy?.safeForPreviewOnly !== undefined
      ? { safeForPreviewOnly: input.toolPolicy.safeForPreviewOnly }
      : {}),
    ...(input.toolPolicy?.requiresExplicitActionAllowed !== undefined
      ? {
          requiresExplicitActionAllowed:
            input.toolPolicy.requiresExplicitActionAllowed,
        }
      : {}),
  };
}

function isAllowlistedTool(
  toolName: string,
  allowedTools?: readonly string[],
  toolPolicy?: ToolRoutingPolicy,
): boolean {
  const allowlist =
    allowedTools && allowedTools.length > 0
      ? allowedTools
      : toolPolicy?.mode === "allowlist"
        ? toolPolicy.allowedTools
        : [];

  if (allowlist.length === 0) {
    return true;
  }

  return allowlist.includes(toolName);
}

function hasAllowlist(
  allowedTools?: readonly string[],
  toolPolicy?: ToolRoutingPolicy,
): boolean {
  if (allowedTools && allowedTools.length > 0) {
    return true;
  }

  return toolPolicy?.mode === "allowlist" && toolPolicy.allowedTools.length > 0;
}

function isDisallowedTool(
  toolName: string,
  disallowedTools?: readonly string[],
  toolPolicy?: ToolRoutingPolicy,
): boolean {
  const denylist =
    disallowedTools && disallowedTools.length > 0
      ? disallowedTools
      : toolPolicy?.mode === "denylist"
        ? toolPolicy.disallowedTools
        : [];

  return denylist.includes(toolName);
}

function normalizeToolName(toolName: string | undefined): string | undefined {
  const normalized = toolName?.trim();
  return normalized ? normalized : undefined;
}
