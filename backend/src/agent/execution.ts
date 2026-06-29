import type { AgentRunId } from "./runId";
import type { IntentResolutionResult } from "./intent";
import type {
  PlanDefinition,
  PlanMetadata,
  PlanSelectionResult,
  PlanStep,
  RunBudget,
} from "./plan";
import {
  createDefaultToolRouter,
  type ToolRouter,
  type ToolRoutingInput,
  type ToolRoutingPreconditionResult,
  type ToolRoutingResult,
} from "./toolRouter";
import type { JsonObject } from "./types";

export type ExecutionStatus = "completed" | "partial" | "failed" | "skipped";

export type ExecutionStepStatus =
  | "routed"
  | "skipped"
  | "blocked"
  | "failed"
  | "not_executed";

export type ExecutionBudgetUsage = {
  toolCallsUsed: number;
  modelCallsUsed: number;
  maxToolCalls: number;
  maxModelCalls: number;
  timeoutMs: number;
  startedAt: string;
  completedAt: string;
  durationMs: number;
};

export type ExecutionStepResult = {
  stepId: string;
  stepType: PlanStep["type"];
  status: ExecutionStepStatus;
  toolName?: string;
  routingStatus?: ToolRoutingResult["status"];
  reason?: string;
  warnings: string[];
  metadata?: JsonObject;
  traceMetadata?: JsonObject;
};

export type ExecutionInput = {
  agentRunId: AgentRunId;
  intentResolution: IntentResolutionResult;
  plan: PlanDefinition;
  selection?: PlanSelectionResult;
  contextSummary?: JsonObject;
  initialBudget?: Partial<RunBudget>;
  budgetUsage?: {
    toolCallsUsed?: number;
    modelCallsUsed?: number;
  };
  metadata?: JsonObject;
  traceMetadata?: JsonObject;
  toolRouter?: ToolRouter;
};

export type ExecutionResult = {
  agentRunId: AgentRunId;
  status: ExecutionStatus;
  planId: PlanDefinition["id"];
  intentId: IntentResolutionResult["resolvedIntentId"];
  executedSteps: string[];
  skippedSteps: string[];
  blockedSteps: string[];
  stepResults: ExecutionStepResult[];
  budgetUsage: ExecutionBudgetUsage;
  warnings: string[];
  errors: Array<{
    message: string;
    stepId?: string;
    stepType?: PlanStep["type"];
  }>;
  fallbackReason?: string;
  metadata?: JsonObject;
  traceMetadata?: JsonObject;
};

export interface ExecutionEngine {
  execute(input: ExecutionInput): Promise<ExecutionResult>;
}

export type MinimalExecutionEngineOptions = {
  toolRouter?: ToolRouter;
};

export class MinimalExecutionEngine implements ExecutionEngine {
  constructor(private readonly options: MinimalExecutionEngineOptions = {}) {}

  async execute(input: ExecutionInput): Promise<ExecutionResult> {
    const startedAt = new Date().toISOString();
    const budget = normalizeExecutionBudget(
      input.plan.budget,
      input.initialBudget,
    );
    const toolRouter = this.options.toolRouter ?? createDefaultToolRouter();
    const stepResults: ExecutionStepResult[] = [];
    const executedSteps: string[] = [];
    const skippedSteps: string[] = [];
    const blockedSteps: string[] = [];
    const warnings: string[] = [];
    const errors: ExecutionResult["errors"] = [];
    const routeablePreconditions = mapPlanPreconditionsToRoutingResults(
      input.selection?.preconditions,
      input.plan,
    );
    let toolCallsUsed = input.budgetUsage?.toolCallsUsed ?? 0;
    let modelCallsUsed = input.budgetUsage?.modelCallsUsed ?? 0;

    for (const step of input.plan.steps) {
      const stepResult = await this.executeStep({
        input,
        step,
        toolRouter,
        toolCallsUsed,
        modelCallsUsed,
        routeablePreconditions,
      });

      stepResults.push(stepResult.result);
      warnings.push(...stepResult.warnings);
      errors.push(...stepResult.errors);
      toolCallsUsed = stepResult.toolCallsUsed;
      modelCallsUsed = stepResult.modelCallsUsed;

      if (stepResult.result.status === "routed") {
        executedSteps.push(step.id);
        continue;
      }

      if (stepResult.result.status === "skipped") {
        skippedSteps.push(step.id);
        continue;
      }

      if (stepResult.result.status === "blocked") {
        blockedSteps.push(step.id);
        if (step.required || step.onFailure === "fail") {
          break;
        }
        continue;
      }

      if (stepResult.result.status === "failed") {
        blockedSteps.push(step.id);
        break;
      }
    }

    const completedAt = new Date().toISOString();
    const durationMs = Math.max(
      0,
      new Date(completedAt).getTime() - new Date(startedAt).getTime(),
    );
    const status = deriveExecutionStatus({
      stepResults,
      executedSteps,
      skippedSteps,
      blockedSteps,
      errors,
    });

    const result: ExecutionResult = {
      agentRunId: input.agentRunId,
      status,
      planId: input.plan.id,
      intentId: input.intentResolution.resolvedIntentId,
      executedSteps: [...executedSteps],
      skippedSteps: [...skippedSteps],
      blockedSteps: [...blockedSteps],
      stepResults,
      budgetUsage: {
        toolCallsUsed,
        modelCallsUsed,
        maxToolCalls: budget.maxToolCalls,
        maxModelCalls: budget.maxModelCalls,
        timeoutMs: budget.timeoutMs,
        startedAt,
        completedAt,
        durationMs,
      },
      warnings: [...warnings],
      errors,
      ...(input.selection?.reasonBrief
        ? { fallbackReason: input.selection.reasonBrief }
        : {}),
      ...(input.metadata ? { metadata: { ...input.metadata } } : {}),
    };

    result.traceMetadata = buildExecutionTraceMetadata(
      result,
      input.traceMetadata,
    );

    return result;
  }

  private async executeStep(input: {
    input: ExecutionInput;
    step: PlanStep;
    toolRouter: ToolRouter;
    toolCallsUsed: number;
    modelCallsUsed: number;
    routeablePreconditions: ToolRoutingPreconditionResult[];
  }): Promise<{
    result: ExecutionStepResult;
    warnings: string[];
    errors: ExecutionResult["errors"];
    toolCallsUsed: number;
    modelCallsUsed: number;
  }> {
    const errors: ExecutionResult["errors"] = [];
    const step = input.step;

    if (step.type !== "call_tool") {
      const result = createStepResult({
        step,
        status: "not_executed",
        reason: "ExecutionEngine skeleton does not execute non-tool steps yet.",
        warnings: ["step_not_executed"],
        metadata: {
          stepMode: "skeleton",
        },
      });

      return {
        result,
        warnings: [...result.warnings],
        errors,
        toolCallsUsed: input.toolCallsUsed,
        modelCallsUsed: input.modelCallsUsed,
      };
    }

    const routingInput: ToolRoutingInput = {
      agentRunId: input.input.agentRunId,
      intentId: input.input.intentResolution.resolvedIntentId,
      planId: input.input.plan.id,
      step: input.step,
      requestedToolName: input.step.toolName,
      allowedTools: input.input.plan.allowedTools,
      disallowedTools: input.input.plan.disallowedTools,
      toolPolicy: input.input.plan.toolPolicy,
      runBudget: input.input.plan.budget,
      budgetUsage: {
        toolCallsUsed: input.toolCallsUsed,
        modelCallsUsed: input.modelCallsUsed,
      },
      contextSummary: summarizeExecutionContext(input.input),
      preconditions: input.routeablePreconditions,
      metadata: input.input.metadata,
    };

    const routingResult = await input.toolRouter.route(routingInput);
    const routedResult = createStepResult({
      step,
      status:
        routingResult.status === "allowed"
          ? "routed"
          : routingResult.status === "skipped"
            ? "skipped"
            : "blocked",
      toolName: routingResult.toolName,
      routingStatus: routingResult.status,
      reason: routingResult.reason,
      warnings: routingResult.warnings,
      metadata: routingResult.metadata,
      traceMetadata: routingResult.traceMetadata,
    });

    const toolCallsUsed =
      input.toolCallsUsed + (routingResult.status === "allowed" ? 1 : 0);
    if (
      routingResult.status === "blocked" ||
      routingResult.status === "unavailable"
    ) {
      errors.push({
        message: routingResult.reason ?? "Tool routing was blocked.",
        stepId: step.id,
        stepType: step.type,
      });
    }

    return {
      result: routedResult,
      warnings: [...routingResult.warnings],
      errors,
      toolCallsUsed,
      modelCallsUsed: input.modelCallsUsed,
    };
  }
}

export function createMinimalExecutionEngine(
  options?: MinimalExecutionEngineOptions,
): ExecutionEngine {
  return new MinimalExecutionEngine(options);
}

export function createDefaultExecutionEngine(
  options?: MinimalExecutionEngineOptions,
): ExecutionEngine {
  return createMinimalExecutionEngine(options);
}

export function buildExecutionTraceMetadata(
  result: ExecutionResult,
  inputTraceMetadata?: JsonObject,
): PlanMetadata {
  const metadata: PlanMetadata = {
    agentRunId: result.agentRunId,
    planId: result.planId,
    intentId: result.intentId,
    status: result.status,
    budgetUsage: {
      toolCallsUsed: result.budgetUsage.toolCallsUsed,
      modelCallsUsed: result.budgetUsage.modelCallsUsed,
      maxToolCalls: result.budgetUsage.maxToolCalls,
      maxModelCalls: result.budgetUsage.maxModelCalls,
      timeoutMs: result.budgetUsage.timeoutMs,
      startedAt: result.budgetUsage.startedAt,
      completedAt: result.budgetUsage.completedAt,
      durationMs: result.budgetUsage.durationMs,
    },
    stepResults: result.stepResults.map((step) => ({
      stepId: step.stepId,
      stepType: step.stepType,
      status: step.status,
      ...(step.toolName ? { toolName: step.toolName } : {}),
      ...(step.reason ? { reason: step.reason } : {}),
      ...(step.warnings.length > 0 ? { warnings: [...step.warnings] } : {}),
      ...(step.metadata ? { metadata: { ...step.metadata } } : {}),
      ...(step.traceMetadata
        ? { traceMetadata: { ...step.traceMetadata } }
        : {}),
    })),
  };

  if (result.warnings.length > 0) {
    metadata.warnings = [...result.warnings];
  }
  if (result.errors.length > 0) {
    metadata.errors = result.errors.map((error) => ({
      message: error.message,
      ...(error.stepId ? { stepId: error.stepId } : {}),
      ...(error.stepType ? { stepType: error.stepType } : {}),
    }));
  }
  if (result.fallbackReason) {
    metadata.fallbackReason = result.fallbackReason;
  }
  if (result.metadata) {
    metadata.metadata = { ...result.metadata };
  }
  if (inputTraceMetadata) {
    metadata.traceMetadata = { ...inputTraceMetadata };
  }

  return metadata;
}

function createStepResult(input: {
  step: PlanStep;
  status: ExecutionStepStatus;
  toolName?: string;
  routingStatus?: ToolRoutingResult["status"];
  reason?: string;
  warnings: string[];
  metadata?: JsonObject;
  traceMetadata?: JsonObject;
}): ExecutionStepResult {
  return {
    stepId: input.step.id,
    stepType: input.step.type,
    status: input.status,
    ...(input.toolName ? { toolName: input.toolName } : {}),
    ...(input.routingStatus ? { routingStatus: input.routingStatus } : {}),
    ...(input.reason ? { reason: input.reason } : {}),
    warnings: [...input.warnings],
    ...(input.metadata ? { metadata: { ...input.metadata } } : {}),
    ...(input.traceMetadata
      ? { traceMetadata: { ...input.traceMetadata } }
      : {}),
  };
}

function deriveExecutionStatus(input: {
  stepResults: ExecutionStepResult[];
  executedSteps: string[];
  skippedSteps: string[];
  blockedSteps: string[];
  errors: ExecutionResult["errors"];
}): ExecutionStatus {
  if (input.stepResults.length === 0) {
    return "skipped";
  }

  const hasNotExecutedSteps = input.stepResults.some(
    (stepResult) => stepResult.status === "not_executed",
  );

  if (
    input.errors.length > 0 &&
    input.blockedSteps.length > 0 &&
    input.executedSteps.length === 0
  ) {
    return "failed";
  }

  if (input.errors.length > 0 || input.blockedSteps.length > 0) {
    return "partial";
  }

  if (hasNotExecutedSteps || input.executedSteps.length > 0) {
    return "partial";
  }

  if (input.skippedSteps.length > 0) {
    return "skipped";
  }

  return "completed";
}

function normalizeExecutionBudget(
  planBudget: RunBudget,
  initialBudget?: Partial<RunBudget>,
): RunBudget {
  return {
    maxModelCalls: initialBudget?.maxModelCalls ?? planBudget.maxModelCalls,
    maxToolCalls: initialBudget?.maxToolCalls ?? planBudget.maxToolCalls,
    timeoutMs: initialBudget?.timeoutMs ?? planBudget.timeoutMs,
    ...(initialBudget?.maxRetries !== undefined
      ? { maxRetries: initialBudget.maxRetries }
      : planBudget.maxRetries !== undefined
        ? { maxRetries: planBudget.maxRetries }
        : {}),
    ...(initialBudget?.maxContextItems !== undefined
      ? { maxContextItems: initialBudget.maxContextItems }
      : planBudget.maxContextItems !== undefined
        ? { maxContextItems: planBudget.maxContextItems }
        : {}),
    ...(initialBudget?.maxSummaryRows !== undefined
      ? { maxSummaryRows: initialBudget.maxSummaryRows }
      : planBudget.maxSummaryRows !== undefined
        ? { maxSummaryRows: planBudget.maxSummaryRows }
        : {}),
    ...(initialBudget?.maxSummaryColumns !== undefined
      ? { maxSummaryColumns: initialBudget.maxSummaryColumns }
      : planBudget.maxSummaryColumns !== undefined
        ? { maxSummaryColumns: planBudget.maxSummaryColumns }
        : {}),
  };
}

function summarizeExecutionContext(
  input: ExecutionInput,
): JsonObject | undefined {
  if (input.contextSummary) {
    return { ...input.contextSummary };
  }

  if (input.selection?.traceMetadata) {
    return { selectionTrace: { ...input.selection.traceMetadata } };
  }

  return undefined;
}

function mapPlanPreconditionsToRoutingResults(
  preconditions?: PlanSelectionResult["preconditions"],
  plan?: PlanDefinition,
): ToolRoutingPreconditionResult[] {
  if (preconditions && preconditions.length > 0) {
    return preconditions.map((precondition) => ({
      id: precondition.id,
      type: precondition.type,
      required: precondition.required,
      status: precondition.satisfied ? "passed" : "failed",
      reasonBrief: precondition.reasonBrief,
      ...(precondition.fallbackReason
        ? { fallbackReason: precondition.fallbackReason }
        : {}),
      ...(precondition.metadata
        ? { metadata: { ...precondition.metadata } }
        : {}),
    }));
  }

  return (
    plan?.preconditions.map((precondition) => ({
      id: precondition.id,
      type: precondition.type,
      required: precondition.required,
      status: "unknown" as const,
      reasonBrief:
        precondition.description ??
        precondition.fallbackReason ??
        "Precondition status is unknown in execution skeleton.",
      ...(precondition.fallbackReason
        ? { fallbackReason: precondition.fallbackReason }
        : {}),
      ...(precondition.metadata
        ? { metadata: { ...precondition.metadata } }
        : {}),
    })) ?? []
  );
}
