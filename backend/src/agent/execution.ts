import type { AgentRunId } from "./runId";
import type {
  IntentResolutionContextSummary,
  IntentResolutionResult,
} from "./intent";
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
import type { ToolRegistry } from "./toolRegistry";
import type { ToolLookupResult } from "./toolRegistry";
import type { ToolExecutionWrapper } from "./toolExecutionWrapper";
import type { ToolExecutionResult } from "./toolExecutionWrapper";
import type { ToolPreconditionEvaluationContext } from "./toolPreconditions";
import type { ToolPreconditionResult } from "./toolPreconditions";
import { buildSelectedMarkExplanationResponseMaterial } from "./selectedMarkContextTools";
import { evaluateToolPreconditions } from "./toolPreconditions";
import {
  createBudgetTraceEvent,
  createPlanStepTraceEvent,
  createToolExecutionTraceEvent,
  createToolPreconditionTraceEvent,
  createToolRegistryTraceEvent,
} from "./orchestrationTrace";
import type { TraceEvent } from "./types";
import type { JsonObject, JsonValue } from "./types";

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
  lookupResult?: ToolLookupResult;
  preconditionResults?: readonly ToolPreconditionResult[];
  toolExecutionResult?: ToolExecutionResult;
  output?: JsonValue;
  normalizedOutput?: JsonValue;
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
  toolExecutionWrapper?: ToolExecutionWrapper;
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
  responseMaterial?: JsonObject;
  metadata?: JsonObject;
  traceMetadata?: JsonObject;
  traceEvents: TraceEvent[];
};

export interface ExecutionEngine {
  execute(input: ExecutionInput): Promise<ExecutionResult>;
}

export type MinimalExecutionEngineOptions = {
  toolRouter?: ToolRouter;
  toolRegistry?: ToolRegistry;
  toolExecutionWrapper?: ToolExecutionWrapper;
};

export class MinimalExecutionEngine implements ExecutionEngine {
  constructor(private readonly options: MinimalExecutionEngineOptions = {}) {}

  async execute(input: ExecutionInput): Promise<ExecutionResult> {
    const startedAt = new Date().toISOString();
    const budget = normalizeExecutionBudget(
      input.plan.budget,
      input.initialBudget,
    );
    const toolRouter =
      this.options.toolRouter ??
      createDefaultToolRouter(
        this.options.toolRegistry
          ? { registry: this.options.toolRegistry }
          : undefined,
      );
    const stepResults: ExecutionStepResult[] = [];
    const executedSteps: string[] = [];
    const skippedSteps: string[] = [];
    const blockedSteps: string[] = [];
    const warnings: string[] = [];
    const errors: ExecutionResult["errors"] = [];
    const traceEvents: TraceEvent[] = [];
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
        budget,
        toolCallsUsed,
        modelCallsUsed,
        routeablePreconditions,
      });

      stepResults.push(stepResult.result);
      warnings.push(...stepResult.warnings);
      errors.push(...stepResult.errors);
      traceEvents.push(...stepResult.traceEvents);
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
        if (step.required || step.onFailure === "fail") {
          blockedSteps.push(step.id);
          break;
        }
        continue;
      }

      if (stepResult.result.status === "failed") {
        if (step.required || step.onFailure === "fail") {
          blockedSteps.push(step.id);
          break;
        }
        continue;
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
      ...(input.plan.id === "selected_mark_explanation-v1"
        ? {
            responseMaterial: buildSelectedMarkExplanationResponseMaterial({
              contextSummary: input.contextSummary,
              toolOutputs: collectSelectedMarkToolOutputs(stepResults),
              warnings,
            }),
          }
        : {}),
      ...(input.metadata ? { metadata: { ...input.metadata } } : {}),
      traceEvents,
    };

    traceEvents.push(
      createBudgetTraceEvent({
        agentRunId: input.agentRunId,
        budget: {
          maxModelCalls: result.budgetUsage.maxModelCalls,
          maxToolCalls: result.budgetUsage.maxToolCalls,
          timeoutMs: result.budgetUsage.timeoutMs,
        },
        budgetUsage: {
          modelCallsUsed: result.budgetUsage.modelCallsUsed,
          toolCallsUsed: result.budgetUsage.toolCallsUsed,
          startedAt: result.budgetUsage.startedAt,
          completedAt: result.budgetUsage.completedAt,
          durationMs: result.budgetUsage.durationMs,
        },
        ...(input.contextSummary
          ? { metadata: { contextSummary: input.contextSummary } }
          : {}),
      }),
    );

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
    budget: RunBudget;
    toolCallsUsed: number;
    modelCallsUsed: number;
    routeablePreconditions: ToolRoutingPreconditionResult[];
  }): Promise<{
    result: ExecutionStepResult;
    warnings: string[];
    errors: ExecutionResult["errors"];
    toolCallsUsed: number;
    modelCallsUsed: number;
    traceEvents: TraceEvent[];
  }> {
    const errors: ExecutionResult["errors"] = [];
    const traceEvents: TraceEvent[] = [];
    const step = input.step;
    const contextSummary = summarizeExecutionContext(input.input);

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

      traceEvents.push(
        createPlanStepTraceEvent({
          agentRunId: input.input.agentRunId,
          type: "plan_step.started",
          planId: input.input.plan.id,
          intentId: input.input.intentResolution.resolvedIntentId,
          stepId: step.id,
          stepType: step.type,
          toolName: step.toolName,
          reason: result.reason,
          warnings: result.warnings,
          contextSummary,
          metadata: result.traceMetadata ?? result.metadata,
        }),
      );

      return {
        result,
        warnings: [...result.warnings],
        errors,
        toolCallsUsed: input.toolCallsUsed,
        modelCallsUsed: input.modelCallsUsed,
        traceEvents,
      };
    }

    const toolName = normalizeToolName(step.toolName);
    const routingPolicy = buildStepRoutingPolicy(input.input.plan, toolName);
    const registryLookup =
      toolName && this.options.toolRegistry
        ? this.options.toolRegistry.lookup(toolName, routingPolicy)
        : undefined;

    traceEvents.push(
      createPlanStepTraceEvent({
        agentRunId: input.input.agentRunId,
        type: "plan_step.started",
        planId: input.input.plan.id,
        intentId: input.input.intentResolution.resolvedIntentId,
        stepId: step.id,
        stepType: step.type,
        toolName,
        reason: step.description,
        warnings: [],
        contextSummary,
        metadata: step.metadata,
      }),
    );

    const routingInput: ToolRoutingInput = {
      agentRunId: input.input.agentRunId,
      intentId: input.input.intentResolution.resolvedIntentId,
      planId: input.input.plan.id,
      step,
      requestedToolName: toolName,
      allowedTools: routingPolicy.allowedTools,
      disallowedTools: routingPolicy.disallowedTools,
      toolPolicy: routingPolicy.toolPolicy,
      runBudget: input.budget,
      budgetUsage: {
        toolCallsUsed: input.toolCallsUsed,
        modelCallsUsed: input.modelCallsUsed,
      },
      contextSummary,
      preconditions: input.routeablePreconditions,
      metadata: input.input.metadata,
    };

    const routingResult = await input.toolRouter.route(routingInput);
    if (registryLookup) {
      traceEvents.push(
        createToolRegistryTraceEvent({
          agentRunId: input.input.agentRunId,
          type: "tool_registry.lookup",
          result: registryLookup,
          contextSummary,
        }),
      );
    }
    if (routingResult.status !== "allowed") {
      const routedResult = createStepResult({
        step,
        status: routingResult.status === "skipped" ? "skipped" : "blocked",
        toolName: routingResult.toolName,
        routingStatus: routingResult.status,
        reason: routingResult.reason,
        warnings: routingResult.warnings,
        metadata: routingResult.metadata,
        traceMetadata: routingResult.traceMetadata,
        lookupResult: registryLookup,
      });

      traceEvents.push(
        createPlanStepTraceEvent({
          agentRunId: input.input.agentRunId,
          type: mapPlanStepStatusToTraceEventType(routedResult.status),
          planId: input.input.plan.id,
          intentId: input.input.intentResolution.resolvedIntentId,
          stepId: step.id,
          stepType: step.type,
          toolName: routedResult.toolName,
          reason: routedResult.reason,
          warnings: routedResult.warnings,
          contextSummary,
          metadata: routedResult.traceMetadata ?? routedResult.metadata,
        }),
      );

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
        toolCallsUsed: input.toolCallsUsed,
        modelCallsUsed: input.modelCallsUsed,
        traceEvents,
      };
    }

    const toolDefinition = registryLookup?.tool;
    const toolPreconditionResults = evaluateToolPreconditions(
      toolDefinition?.preconditions ?? [],
      buildToolPreconditionContext(input.input, {
        toolAvailable: Boolean(toolDefinition),
        allowedByPolicy: routingResult.status === "allowed",
        budget: input.budget,
      }),
    );
    const executionContext = buildToolExecutionContext(input.input);

    traceEvents.push(
      ...toolPreconditionResults.map((preconditionResult) =>
        createToolPreconditionTraceEvent({
          agentRunId: input.input.agentRunId,
          type:
            preconditionResult.status === "passed"
              ? "tool_precondition.passed"
              : "tool_precondition.failed",
          result: preconditionResult,
          toolName,
          contextSummary,
        }),
      ),
    );

    if (!this.options.toolExecutionWrapper) {
      const routedResult = createStepResult({
        step,
        status: "routed",
        toolName: routingResult.toolName,
        routingStatus: routingResult.status,
        reason: routingResult.reason,
        warnings: routingResult.warnings,
        metadata: routingResult.metadata,
        traceMetadata: routingResult.traceMetadata,
        lookupResult: registryLookup,
        preconditionResults: toolPreconditionResults,
      });

      traceEvents.push(
        createPlanStepTraceEvent({
          agentRunId: input.input.agentRunId,
          type: "plan_step.completed",
          planId: input.input.plan.id,
          intentId: input.input.intentResolution.resolvedIntentId,
          stepId: step.id,
          stepType: step.type,
          toolName: routedResult.toolName,
          reason: routedResult.reason,
          warnings: routedResult.warnings,
          contextSummary,
          metadata: routedResult.traceMetadata ?? routedResult.metadata,
        }),
      );

      return {
        result: routedResult,
        warnings: [...routingResult.warnings],
        errors,
        toolCallsUsed: input.toolCallsUsed + 1,
        modelCallsUsed: input.modelCallsUsed,
        traceEvents,
      };
    }

    traceEvents.push(
      createToolExecutionTraceEvent({
        agentRunId: input.input.agentRunId,
        type: "tool_execution.started",
        toolName,
        contextSummary,
      }),
    );

    const toolExecutionResult = await this.options.toolExecutionWrapper.execute(
      {
        agentRunId: input.input.agentRunId,
        toolName: toolName ?? "",
        tool: toolDefinition,
        input: buildToolExecutionInput(step, input.input),
        context: executionContext,
        timeoutMs: input.budget.timeoutMs,
        budget: {
          maxToolCalls: input.budget.maxToolCalls,
          timeoutMs: input.budget.timeoutMs,
        },
        budgetUsage: {
          toolCallsUsed: input.toolCallsUsed,
        },
        preconditionResults: toolPreconditionResults,
        routingResult,
        metadata: input.input.metadata,
        traceMetadata: input.input.traceMetadata,
      },
    );

    traceEvents.push(
      createToolExecutionTraceEvent({
        agentRunId: input.input.agentRunId,
        type:
          toolExecutionResult.status === "completed"
            ? "tool_execution.completed"
            : "tool_execution.failed",
        result: toolExecutionResult,
        toolName,
        contextSummary,
      }),
    );

    const executionStepResult = createStepResult({
      step,
      status: mapToolExecutionStatusToStepStatus(toolExecutionResult.status),
      toolName: routingResult.toolName,
      routingStatus: routingResult.status,
      reason: toolExecutionResult.reason ?? routingResult.reason,
      warnings: [...routingResult.warnings, ...toolExecutionResult.warnings],
      lookupResult: registryLookup,
      preconditionResults: toolPreconditionResults,
      toolExecutionResult,
      output: toolExecutionResult.output ?? null,
      normalizedOutput: toolExecutionResult.normalizedOutput ?? null,
      metadata: {
        ...(routingResult.metadata ?? {}),
        ...(toolExecutionResult.metadata ?? {}),
      },
      traceMetadata: {
        ...(routingResult.traceMetadata ?? {}),
        ...(toolExecutionResult.traceMetadata ?? {}),
      },
    });

    if (
      toolExecutionResult.status === "blocked" ||
      toolExecutionResult.status === "failed" ||
      toolExecutionResult.status === "timed_out"
    ) {
      errors.push({
        message:
          toolExecutionResult.reason ??
          "Tool execution failed while processing the step.",
        stepId: step.id,
        stepType: step.type,
      });
    }

    traceEvents.push(
      createPlanStepTraceEvent({
        agentRunId: input.input.agentRunId,
        type: mapPlanStepStatusToTraceEventType(executionStepResult.status),
        planId: input.input.plan.id,
        intentId: input.input.intentResolution.resolvedIntentId,
        stepId: step.id,
        stepType: step.type,
        toolName: executionStepResult.toolName,
        reason: executionStepResult.reason,
        warnings: executionStepResult.warnings,
        contextSummary,
        metadata:
          executionStepResult.traceMetadata ?? executionStepResult.metadata,
      }),
    );

    return {
      result: executionStepResult,
      warnings: [...executionStepResult.warnings],
      errors,
      toolCallsUsed: toolExecutionResult.budgetUsage.toolCallsUsed,
      modelCallsUsed: input.modelCallsUsed,
      traceEvents,
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
  lookupResult?: ToolLookupResult;
  preconditionResults?: readonly ToolPreconditionResult[];
  toolExecutionResult?: ToolExecutionResult;
  output?: JsonValue;
  normalizedOutput?: JsonValue;
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
    ...(input.lookupResult ? { lookupResult: input.lookupResult } : {}),
    ...(input.preconditionResults
      ? { preconditionResults: [...input.preconditionResults] }
      : {}),
    ...(input.toolExecutionResult
      ? { toolExecutionResult: input.toolExecutionResult }
      : {}),
    ...(input.output !== undefined ? { output: input.output } : {}),
    ...(input.normalizedOutput !== undefined
      ? { normalizedOutput: input.normalizedOutput }
      : {}),
    ...(input.metadata ? { metadata: { ...input.metadata } } : {}),
    ...(input.traceMetadata
      ? { traceMetadata: { ...input.traceMetadata } }
      : {}),
  };
}

function mapPlanStepStatusToTraceEventType(
  status: ExecutionStepStatus,
):
  | "plan_step.started"
  | "plan_step.completed"
  | "plan_step.skipped"
  | "plan_step.blocked"
  | "plan_step.failed" {
  switch (status) {
    case "routed":
      return "plan_step.completed";
    case "skipped":
      return "plan_step.skipped";
    case "blocked":
      return "plan_step.blocked";
    case "failed":
      return "plan_step.failed";
    case "not_executed":
    default:
      return "plan_step.started";
  }
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

function buildStepRoutingPolicy(
  plan: PlanDefinition,
  toolName?: string,
): Pick<ToolRoutingInput, "allowedTools" | "disallowedTools" | "toolPolicy"> {
  const allowedTools = normalizeToolPolicyList([
    ...plan.allowedTools,
    ...(toolName ? [toolName] : []),
  ]);
  const disallowedTools = normalizeToolPolicyList(plan.disallowedTools);

  return {
    allowedTools,
    disallowedTools,
    toolPolicy: {
      mode: plan.toolPolicy.mode,
      allowedTools,
      disallowedTools,
    },
  };
}

function buildToolPreconditionContext(
  input: ExecutionInput,
  options?: {
    toolAvailable?: boolean;
    allowedByPolicy?: boolean;
    explicitConfirmation?: boolean;
    permissionGranted?: boolean;
    budget?: RunBudget;
  },
): ToolPreconditionEvaluationContext {
  const contextSummary = asSelectedMarkExecutionContextSummary(
    input.contextSummary,
  );

  return {
    selectedMarkCount: contextSummary?.selectedMarks?.totalCount ?? 0,
    summaryDataPreviewAvailable:
      contextSummary?.summaryDataPreview?.available ?? false,
    permissionGranted: options?.permissionGranted ?? true,
    explicitConfirmation: options?.explicitConfirmation ?? true,
    budgetRemaining:
      (options?.budget?.maxToolCalls ?? input.plan.budget.maxToolCalls) >
      (input.budgetUsage?.toolCallsUsed ?? 0),
    allowedByPolicy: options?.allowedByPolicy ?? true,
    contextAvailable: Boolean(input.contextSummary),
    toolAvailable: options?.toolAvailable ?? true,
  };
}

function buildToolExecutionContext(input: ExecutionInput): JsonObject {
  return {
    ...(input.contextSummary
      ? { contextSummary: { ...input.contextSummary } }
      : {}),
    planId: input.plan.id,
    intentId: input.intentResolution.resolvedIntentId,
    ...(input.metadata ? { metadata: { ...input.metadata } } : {}),
  };
}

function buildToolExecutionInput(
  step: PlanStep,
  input: ExecutionInput,
): JsonObject {
  return {
    stepId: step.id,
    stepType: step.type,
    ...(step.input ? { stepInput: { ...step.input } } : {}),
    ...(input.contextSummary
      ? { contextSummary: { ...input.contextSummary } }
      : {}),
    planId: input.plan.id,
    intentId: input.intentResolution.resolvedIntentId,
  };
}

function collectSelectedMarkToolOutputs(
  stepResults: readonly ExecutionStepResult[],
): Record<string, JsonObject> {
  const outputs: Record<string, JsonObject> = {};

  for (const stepResult of stepResults) {
    if (!stepResult.toolName || !stepResult.toolExecutionResult) {
      continue;
    }

    if (!isSelectedMarkContextToolName(stepResult.toolName)) {
      continue;
    }

    const normalizedOutput =
      stepResult.normalizedOutput ?? stepResult.output ?? null;
    outputs[stepResult.toolName] =
      isJsonObject(normalizedOutput) && normalizedOutput !== null
        ? { ...normalizedOutput }
        : {
            value: normalizedOutput,
          };
  }

  return outputs;
}

function mapToolExecutionStatusToStepStatus(
  status: ToolExecutionResult["status"],
): ExecutionStepStatus {
  switch (status) {
    case "completed":
      return "routed";
    case "skipped":
      return "skipped";
    case "blocked":
      return "blocked";
    case "timed_out":
    case "failed":
    default:
      return "failed";
  }
}

function normalizeToolName(toolName?: string): string | undefined {
  const normalized = toolName?.trim();
  return normalized ? normalized : undefined;
}

function normalizeToolPolicyList(values: readonly string[]): string[] {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean)),
  );
}

function isSelectedMarkContextToolName(
  toolName: string,
): toolName is
  | "context.selectedMarks"
  | "context.summaryDataPreview"
  | "context.filters"
  | "context.parameters" {
  return (
    toolName === "context.selectedMarks" ||
    toolName === "context.summaryDataPreview" ||
    toolName === "context.filters" ||
    toolName === "context.parameters"
  );
}

function asSelectedMarkExecutionContextSummary(
  value?: JsonObject,
): IntentResolutionContextSummary | undefined {
  return isJsonObject(value)
    ? (value as IntentResolutionContextSummary)
    : undefined;
}

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
