import {
  runSelectedMarkExplanationOrchestration,
  type SelectedMarkOrchestrationInput,
  type SelectedMarkOrchestrationResponse,
} from "./selectedMarkOrchestration";
import type {
  AgentRunBudgetUsage,
  AgentRunContextSummary,
  AgentRunError,
  AgentRunExecutionResult,
  AgentRunInput,
  AgentRunIntentResult,
  AgentRunMode,
  AgentRunObservability,
  AgentRunPlanResult,
  AgentRunResponseResult,
  AgentRunResult,
  AgentRunResultStatus,
  AgentRunTraceResult,
  AgentRunWarning,
  AgentRunner,
  AgentRunnerMetadata,
} from "./runner";
import type { IntentResolutionContextSummary } from "./intent";
import type { JsonObject, TraceEvent } from "./types";
import { createTraceError, createTraceEvent } from "./trace";
import type { SelectedMarkSummary } from "../types/tableau";

export type LambdaAgentRunnerOptions = {
  runSelectedMarkExplanation?: (
    input: SelectedMarkOrchestrationInput,
  ) => Promise<SelectedMarkOrchestrationResponse>;
  now?: () => Date;
  metadata?: JsonObject;
};

const LAMBDA_RUNNER_NAME = "LambdaAgentRunner";
const LAMBDA_RUNNER_KIND: AgentRunnerMetadata["kind"] = "lambda";
const SUPPORTED_RUN_MODE: AgentRunMode = "selected_mark_explanation";

export class LambdaAgentRunner implements AgentRunner {
  constructor(private readonly options: LambdaAgentRunnerOptions = {}) {}

  async run(input: AgentRunInput): Promise<AgentRunResult> {
    const startedAt = this.now();
    const runnerMetadata = buildRunnerMetadata();
    const runnerTraceEvents = [
      createTraceEvent({
        agentRunId: input.agentRunId,
        type: "run_started",
        message: `${LAMBDA_RUNNER_NAME} started.`,
        metadata: {
          runner: runnerMetadata,
          runMode: input.runMode ?? null,
          requestedIntent: input.requestedIntent ?? null,
        },
      }),
    ];

    try {
      const unsupportedReason = getUnsupportedReason(input);
      if (unsupportedReason) {
        return buildFallbackResult({
          input,
          startedAt,
          completedAt: this.now(),
          runnerMetadata,
          traceEvents: [
            ...runnerTraceEvents,
            createTraceEvent({
              agentRunId: input.agentRunId,
              type: "run_completed",
              message: `${LAMBDA_RUNNER_NAME} completed with fallback.`,
              severity: "warn",
              metadata: {
                runner: runnerMetadata,
                runMode: input.runMode ?? null,
                requestedIntent: input.requestedIntent ?? null,
                resultStatus: "fallback",
              },
            }),
          ],
          warnings: [createWarning("UNSUPPORTED_RUN_MODE", unsupportedReason)],
          fallbackReason: unsupportedReason,
        });
      }

      const orchestrationInput =
        mapAgentRunInputToSelectedMarkExplanationInput(input);
      const runSelectedMarkExplanation =
        this.options.runSelectedMarkExplanation ??
        runSelectedMarkExplanationOrchestration;
      const orchestrationResult =
        await runSelectedMarkExplanation(orchestrationInput);
      const completedAt = this.now();
      const runnerTraceEventsAfterCompletion = [
        ...runnerTraceEvents,
        ...orchestrationResult.traceEvents,
        createTraceEvent({
          agentRunId: input.agentRunId,
          type:
            orchestrationResult.status === "failed"
              ? "run_failed"
              : "run_completed",
          message:
            orchestrationResult.status === "failed"
              ? `${LAMBDA_RUNNER_NAME} failed.`
              : `${LAMBDA_RUNNER_NAME} completed.`,
          severity: orchestrationResult.status === "failed" ? "error" : "info",
          metadata: {
            runner: runnerMetadata,
            runMode: input.runMode ?? null,
            requestedIntent: input.requestedIntent ?? null,
            resultStatus: orchestrationResult.status,
          },
          ...(orchestrationResult.status === "failed"
            ? {
                error: createTraceError({
                  code: "LAMBDA_AGENT_RUNNER_FAILED",
                  message:
                    orchestrationResult.message ??
                    "Selected-mark orchestration failed.",
                }),
              }
            : {}),
        }),
      ];

      return buildResult({
        input,
        orchestrationResult,
        startedAt,
        completedAt,
        runnerMetadata,
        traceEvents: runnerTraceEventsAfterCompletion,
      });
    } catch (error) {
      const completedAt = this.now();
      const traceError = toTraceError(error);

      return buildFailedResult({
        input,
        startedAt,
        completedAt,
        runnerMetadata,
        traceEvents: [
          ...runnerTraceEvents,
          createTraceEvent({
            agentRunId: input.agentRunId,
            type: "run_failed",
            message: `${LAMBDA_RUNNER_NAME} failed.`,
            severity: "error",
            metadata: {
              runner: runnerMetadata,
              runMode: input.runMode ?? null,
              requestedIntent: input.requestedIntent ?? null,
            },
            error: traceError,
          }),
        ],
        traceError,
      });
    }
  }

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }
}

export function createLambdaAgentRunner(
  options?: LambdaAgentRunnerOptions,
): LambdaAgentRunner {
  return new LambdaAgentRunner(options);
}

function getUnsupportedReason(input: AgentRunInput): string | undefined {
  const runMode = normalizeRunMode(input.runMode);
  const requestedIntent = normalizeRunMode(input.requestedIntent);

  if (
    runMode &&
    runMode !== SUPPORTED_RUN_MODE &&
    requestedIntent &&
    requestedIntent !== SUPPORTED_RUN_MODE
  ) {
    return "LambdaAgentRunner currently supports selected_mark_explanation only.";
  }

  if (requestedIntent && requestedIntent !== SUPPORTED_RUN_MODE) {
    return "LambdaAgentRunner currently supports selected_mark_explanation only.";
  }

  if (runMode && runMode !== SUPPORTED_RUN_MODE) {
    return "LambdaAgentRunner currently supports selected_mark_explanation only.";
  }

  return undefined;
}

function mapAgentRunInputToSelectedMarkExplanationInput(
  input: AgentRunInput,
): SelectedMarkOrchestrationInput {
  const contextSummary = toIntentResolutionContextSummary(
    input.context ?? buildContextSummaryFromLegacyContextPack(input),
  );
  const metadata = mergeJsonObjects(input.metadata, input.options?.metadata);

  return {
    agentRunId: input.agentRunId,
    intentResolutionInput: {
      agentRunId: input.agentRunId,
      message: input.userMessage,
      frontendActionId: input.actionId,
      requestedIntentId: "selected_mark_explanation",
      contextSummary,
      resolverMode: "deterministic",
      traceMetadata: buildTraceMetadata(input),
      ...(metadata ? { metadata } : {}),
    },
    ...(contextSummary ? { contextSummary } : {}),
    ...(metadata ? { metadata } : {}),
  };
}

function buildContextSummaryFromLegacyContextPack(
  input: AgentRunInput,
): AgentRunContextSummary | undefined {
  const contextPack = input.contextPack;
  if (!contextPack) {
    return undefined;
  }

  const dashboardContext = contextPack.dashboardContext;
  const selectedMarks = dashboardContext.selectedMarks ?? [];

  return {
    dashboardName: dashboardContext.dashboardName,
    workbookName: dashboardContext.workbookName ?? undefined,
    viewName: dashboardContext.viewName ?? undefined,
    worksheetNames: dashboardContext.worksheets.map(
      (worksheet) => worksheet.name,
    ),
    selectedMarks: {
      available: selectedMarks.length > 0,
      count: selectedMarks.length,
      worksheetNames: selectedMarks.map((mark) => mark.worksheetName),
      fieldNames: selectedMarks.flatMap((mark) => mark.columns ?? []),
      items: selectedMarks.map((mark) => cloneSelectedMarkSummary(mark)),
      summary:
        selectedMarks.length > 0
          ? `Selected ${selectedMarks.length} mark(s).`
          : "No selected marks are available.",
      truncated: false,
    },
    summaryDataPreview:
      selectedMarks.length > 0
        ? {
            available: true,
            rowCount: selectedMarks.reduce(
              (sum, mark) => sum + (mark.rowCount ?? 1),
              0,
            ),
            columnCount: selectedMarks[0]?.columns?.length ?? 0,
            columnNames: selectedMarks[0]?.columns ?? [],
            truncated: false,
          }
        : undefined,
    filters: {
      available: dashboardContext.filters.length > 0,
      count: dashboardContext.filters.length,
      names: dashboardContext.filters.map((filter) => filter.fieldName),
      truncated: false,
    },
    parameters: {
      available: dashboardContext.parameters.length > 0,
      count: dashboardContext.parameters.length,
      names: dashboardContext.parameters.map((parameter) => parameter.name),
      truncated: false,
    },
    contextReference: contextPack.sessionId ?? undefined,
    rawDataPolicy: {
      includeRawSelectedMarks: false,
      includeFullSummaryRows: false,
    },
  };
}

function normalizeRunMode(value?: string): AgentRunMode | undefined {
  if (value === "selected_mark_explanation") {
    return value;
  }

  if (value === "freeform_chat") {
    return value;
  }

  if (value === "future_intent") {
    return value;
  }

  return undefined;
}

function buildTraceMetadata(input: AgentRunInput): JsonObject {
  const metadata: JsonObject = {
    runnerKind: "lambda",
    runnerName: LAMBDA_RUNNER_NAME,
  };

  if (input.traceOptions?.traceId) {
    metadata.traceId = input.traceOptions.traceId;
  }
  if (input.traceOptions?.correlationId) {
    metadata.correlationId = input.traceOptions.correlationId;
  }
  if (input.locale) {
    metadata.locale = input.locale;
  }
  if (input.traceOptions?.metadata) {
    metadata.traceOptions = { ...input.traceOptions.metadata };
  }

  return metadata;
}

function toIntentResolutionContextSummary(
  context?: AgentRunContextSummary,
): IntentResolutionContextSummary | undefined {
  if (!context) {
    return undefined;
  }

  return {
    dashboardName: context.dashboardName,
    workbookName: context.workbookName,
    viewName: context.viewName,
    worksheetNames: context.worksheetNames,
    selectedMarks: context.selectedMarks
      ? {
          hasSelectedMarks:
            context.selectedMarks.available ??
            (context.selectedMarks.count ?? 0) > 0,
          totalCount: context.selectedMarks.count ?? 0,
          previewCount: context.selectedMarks.count ?? 0,
          truncated: context.selectedMarks.truncated,
          worksheetNames: context.selectedMarks.worksheetNames,
          items: context.selectedMarks.items,
        }
      : undefined,
    summaryDataPreview: context.summaryDataPreview
      ? {
          available: context.summaryDataPreview.available,
          rowCount: context.summaryDataPreview.rowCount,
          columnCount: context.summaryDataPreview.columnCount,
          columnNames: context.summaryDataPreview.columnNames,
          truncated: context.summaryDataPreview.truncated,
        }
      : undefined,
    filters: context.filters
      ? {
          count: context.filters.count,
          names: context.filters.names,
        }
      : undefined,
    parameters: context.parameters
      ? {
          count: context.parameters.count,
          names: context.parameters.names,
        }
      : undefined,
  };
}

function mapOrchestrationStatus(
  status: SelectedMarkOrchestrationResponse["status"],
): AgentRunResultStatus {
  switch (status) {
    case "completed":
      return "completed";
    case "partial":
      return "partial";
    case "fallback":
      return "fallback";
    case "failed":
      return "failed";
    default:
      return "fallback";
  }
}

function normalizeIntentResult(
  result: SelectedMarkOrchestrationResponse,
): AgentRunIntentResult {
  return {
    intentId: result.intentResolution.resolvedIntentId,
    intentName: result.intentResolution.resolvedIntentId,
    status: result.intentResolution.status,
    confidence: result.intentResolution.confidence,
    reason: result.intentResolution.reason,
    summary: {
      source: result.intentResolution.source,
      evidenceCount: result.intentResolution.evidence.length,
    },
    ...(result.intentResolution.traceMetadata
      ? { metadata: cloneJsonObject(result.intentResolution.traceMetadata) }
      : {}),
  };
}

function normalizePlanResult(
  result: SelectedMarkOrchestrationResponse,
): AgentRunPlanResult | undefined {
  if (!result.planSelection) {
    return undefined;
  }

  return {
    planId: result.planSelection.selectedPlan.id,
    planName: result.planSelection.selectedPlan.title,
    status: result.planSelection.status,
    summary: {
      responseStrategy: result.planSelection.selectedPlan.responseStrategy,
      reasonBrief: result.planSelection.reasonBrief,
      matched: result.planSelection.matched,
    },
    ...(result.planSelection.traceMetadata
      ? { metadata: cloneJsonObject(result.planSelection.traceMetadata) }
      : {}),
  };
}

function normalizeExecutionResult(
  result: SelectedMarkOrchestrationResponse,
): AgentRunExecutionResult | undefined {
  if (!result.execution) {
    return undefined;
  }

  return {
    status: result.execution.status,
    stepCount: result.execution.stepResults.length,
    toolCallsUsed: result.execution.budgetUsage.toolCallsUsed,
    modelCallsUsed: result.execution.budgetUsage.modelCallsUsed,
    durationMs: result.execution.budgetUsage.durationMs,
    summary: {
      executedSteps: result.execution.executedSteps,
      skippedSteps: result.execution.skippedSteps,
      blockedSteps: result.execution.blockedSteps,
    },
    ...(result.execution.traceMetadata
      ? { metadata: cloneJsonObject(result.execution.traceMetadata) }
      : {}),
  };
}

function normalizeResponseResult(
  result: SelectedMarkOrchestrationResponse,
): AgentRunResponseResult | undefined {
  if (!result.responseMaterial) {
    return {
      responseType: "placeholder",
      message: result.placeholderResponse,
      summary: {
        intentId: result.intentResolution.resolvedIntentId,
        status: result.status,
      },
    };
  }

  return {
    responseType: "deterministic_summary",
    message: result.placeholderResponse,
    summary: cloneJsonObject(result.responseMaterial),
    ...(result.traceMetadata?.responseComposer
      ? {
          metadata: {
            ...result.traceMetadata.responseComposer,
          } as JsonObject,
        }
      : {}),
  };
}

function summarizeTrace(
  traceEvents: readonly TraceEvent[],
): AgentRunTraceResult {
  return {
    eventCount: traceEvents.length,
    summary: {
      firstEventType: traceEvents[0]?.type,
      lastEventType: traceEvents[traceEvents.length - 1]?.type,
      hasErrors: traceEvents.some(
        (event) =>
          event.severity === "error" ||
          event.type.endsWith(".failed") ||
          event.type === "run_failed",
      ),
      hasToolExecution: traceEvents.some(
        (event) =>
          event.type.startsWith("tool_") || event.type.startsWith("plan_step"),
      ),
    },
    metadata: {
      runnerKind: "lambda",
      runnerName: LAMBDA_RUNNER_NAME,
    },
  };
}

function summarizeBudgetUsage(input: {
  input: AgentRunInput;
  durationMs: number;
  timedOut: boolean;
  executionBudgetUsage?: SelectedMarkOrchestrationResponse["execution"] extends infer Execution
    ? Execution extends { budgetUsage: infer BudgetUsage }
      ? BudgetUsage
      : undefined
    : undefined;
}): AgentRunBudgetUsage {
  const budget = resolveBudget(input.input);

  return {
    modelCallsUsed: input.executionBudgetUsage?.modelCallsUsed ?? 0,
    toolCallsUsed: input.executionBudgetUsage?.toolCallsUsed ?? 0,
    durationMs: input.durationMs,
    timedOut: input.timedOut,
    ...(budget.maxEstimatedCostUsd !== undefined
      ? { estimatedCostUsd: budget.maxEstimatedCostUsd }
      : {}),
  };
}

function resolveBudget(input: AgentRunInput): {
  maxModelCalls?: number;
  maxToolCalls?: number;
  timeoutMs?: number;
  maxDurationMs?: number;
  maxEstimatedCostUsd?: number;
} {
  const legacyBudget = input.options?.budget;
  const planBudget = input.plan?.maxToolCalls
    ? { maxToolCalls: input.plan.maxToolCalls }
    : undefined;

  return {
    maxModelCalls: input.budget?.maxModelCalls ?? legacyBudget?.maxModelCalls,
    maxToolCalls:
      input.budget?.maxToolCalls ??
      legacyBudget?.maxToolCalls ??
      planBudget?.maxToolCalls,
    timeoutMs: input.budget?.timeoutMs ?? legacyBudget?.timeoutMs,
    maxDurationMs: input.budget?.maxDurationMs,
    maxEstimatedCostUsd: input.budget?.maxEstimatedCostUsd,
  };
}

function buildObservability(input: {
  input: AgentRunInput;
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
}): AgentRunObservability {
  const budget = resolveBudget(input.input);

  return {
    startedAt: input.startedAt.toISOString(),
    completedAt: input.completedAt.toISOString(),
    durationMs: input.durationMs,
    traceId: input.input.traceOptions?.traceId,
    correlationId: input.input.traceOptions?.correlationId,
    metrics: {
      latencyMs: input.durationMs,
      modelCalls: 0,
      toolCalls: budget.maxToolCalls ?? 0,
      timeoutCount:
        input.durationMs > 0 &&
        budget.timeoutMs &&
        input.durationMs > budget.timeoutMs
          ? 1
          : 0,
      retryCount: 0,
    },
  };
}

function buildResultMetadata(input: {
  input: AgentRunInput;
  resultStatus: AgentRunResultStatus;
  fallbackReason?: string;
  traceSummary: AgentRunTraceResult;
  executionStatus?: string;
}): JsonObject {
  const metadata: JsonObject = {
    runnerKind: "lambda",
    runnerName: LAMBDA_RUNNER_NAME,
    resultStatus: input.resultStatus,
    traceSummary: {
      ...(input.traceSummary.eventCount !== undefined
        ? { eventCount: input.traceSummary.eventCount }
        : {}),
      ...(input.traceSummary.summary
        ? { summary: { ...input.traceSummary.summary } }
        : {}),
      ...(input.traceSummary.metadata
        ? { metadata: { ...input.traceSummary.metadata } }
        : {}),
    },
  };

  if (input.input.runMode) {
    metadata.runMode = input.input.runMode;
  }
  if (input.input.requestedIntent) {
    metadata.requestedIntent = input.input.requestedIntent;
  }
  if (input.fallbackReason) {
    metadata.fallbackReason = input.fallbackReason;
  }
  if (input.executionStatus) {
    metadata.executionStatus = input.executionStatus;
  }
  if (input.input.locale) {
    metadata.locale = input.input.locale;
  }
  const mergedMetadata = mergeJsonObjects(
    input.input.metadata,
    input.input.options?.metadata,
  );
  if (mergedMetadata) {
    metadata.requestMetadata = mergedMetadata;
  }

  return metadata;
}

function buildRunnerMetadata(): AgentRunnerMetadata {
  return {
    kind: LAMBDA_RUNNER_KIND,
    name: LAMBDA_RUNNER_NAME,
    version: "v0.6.0",
    implementation: "selected_mark_explanation_wrapper",
  };
}

function buildFallbackResult(input: {
  input: AgentRunInput;
  startedAt: Date;
  completedAt: Date;
  runnerMetadata: AgentRunnerMetadata;
  traceEvents: TraceEvent[];
  warnings: AgentRunWarning[];
  fallbackReason: string;
}): AgentRunResult {
  const durationMs = Math.max(
    0,
    input.completedAt.getTime() - input.startedAt.getTime(),
  );
  const traceSummary = summarizeTrace(input.traceEvents);

  return {
    agentRunId: input.input.agentRunId,
    runMode: input.input.runMode,
    status: "fallback",
    answer: input.fallbackReason,
    finalMessage: getSafeFallbackMessage(input.input.runMode),
    trace: input.traceEvents,
    traceSummary,
    warnings: input.warnings,
    errors: [],
    fallbackReason: input.fallbackReason,
    budgetUsage: summarizeBudgetUsage({
      input: input.input,
      durationMs,
      timedOut: false,
    }),
    runner: input.runnerMetadata,
    observability: buildObservability({
      input: input.input,
      startedAt: input.startedAt,
      completedAt: input.completedAt,
      durationMs,
    }),
    startedAt: input.startedAt.toISOString(),
    endedAt: input.completedAt.toISOString(),
    metadata: buildResultMetadata({
      input: input.input,
      resultStatus: "fallback",
      fallbackReason: input.fallbackReason,
      traceSummary,
    }),
  };
}

function buildFailedResult(input: {
  input: AgentRunInput;
  startedAt: Date;
  completedAt: Date;
  runnerMetadata: AgentRunnerMetadata;
  traceEvents: TraceEvent[];
  traceError: ReturnType<typeof createTraceError>;
}): AgentRunResult {
  const durationMs = Math.max(
    0,
    input.completedAt.getTime() - input.startedAt.getTime(),
  );
  const traceSummary = summarizeTrace(input.traceEvents);

  return {
    agentRunId: input.input.agentRunId,
    runMode: input.input.runMode,
    status: "failed",
    trace: input.traceEvents,
    traceSummary,
    warnings: [],
    errors: [
      {
        code: input.traceError.code,
        message: input.traceError.message,
        source: LAMBDA_RUNNER_NAME,
        recoverable: false,
        metadata: cloneJsonObject(input.traceError.details),
      },
    ],
    error: input.traceError,
    fallbackReason: input.traceError.message,
    budgetUsage: summarizeBudgetUsage({
      input: input.input,
      durationMs,
      timedOut: false,
    }),
    runner: input.runnerMetadata,
    observability: buildObservability({
      input: input.input,
      startedAt: input.startedAt,
      completedAt: input.completedAt,
      durationMs,
    }),
    startedAt: input.startedAt.toISOString(),
    endedAt: input.completedAt.toISOString(),
    metadata: buildResultMetadata({
      input: input.input,
      resultStatus: "failed",
      fallbackReason: input.traceError.message,
      traceSummary,
    }),
  };
}

function buildResult(input: {
  input: AgentRunInput;
  orchestrationResult: SelectedMarkOrchestrationResponse;
  startedAt: Date;
  completedAt: Date;
  runnerMetadata: AgentRunnerMetadata;
  traceEvents: TraceEvent[];
}): AgentRunResult {
  const durationMs = Math.max(
    0,
    input.completedAt.getTime() - input.startedAt.getTime(),
  );
  const traceSummary = summarizeTrace(input.traceEvents);
  const warnings = dedupeWarnings([
    ...(input.orchestrationResult.execution?.warnings ?? []),
    ...(input.orchestrationResult.responseMaterial?.warnings ?? []),
  ]);
  const errors = normalizeExecutionErrors(
    input.orchestrationResult.execution?.errors ?? [],
  );
  const fallbackReason =
    input.orchestrationResult.execution?.fallbackReason ??
    (input.orchestrationResult.status === "fallback"
      ? input.orchestrationResult.message
      : undefined);

  return {
    agentRunId: input.input.agentRunId,
    runMode: input.input.runMode,
    status: mapOrchestrationStatus(input.orchestrationResult.status),
    answer: input.orchestrationResult.placeholderResponse,
    finalMessage: input.orchestrationResult.placeholderResponse,
    intent: normalizeIntentResult(input.orchestrationResult),
    plan: normalizePlanResult(input.orchestrationResult),
    execution: normalizeExecutionResult(input.orchestrationResult),
    response: normalizeResponseResult(input.orchestrationResult),
    trace: input.traceEvents,
    traceSummary,
    warnings,
    errors,
    ...(input.orchestrationResult.execution?.errors.length
      ? {
          error: createTraceError({
            code: "LAMBDA_AGENT_RUNNER_ORCHESTRATION_FAILED",
            message:
              input.orchestrationResult.execution.errors[0]?.message ??
              "Selected-mark orchestration failed.",
          }),
        }
      : {}),
    ...(fallbackReason ? { fallbackReason } : {}),
    budgetUsage: summarizeBudgetUsage({
      input: input.input,
      durationMs,
      timedOut: isTimeoutLikeResult(input.orchestrationResult),
      executionBudgetUsage: input.orchestrationResult.execution?.budgetUsage,
    }),
    runner: input.runnerMetadata,
    observability: buildObservability({
      input: input.input,
      startedAt: input.startedAt,
      completedAt: input.completedAt,
      durationMs,
    }),
    startedAt: input.startedAt.toISOString(),
    endedAt: input.completedAt.toISOString(),
    metadata: buildResultMetadata({
      input: input.input,
      resultStatus: mapOrchestrationStatus(input.orchestrationResult.status),
      fallbackReason,
      traceSummary,
      executionStatus: input.orchestrationResult.execution?.status,
    }),
  };
}

function getSafeFallbackMessage(runMode?: AgentRunMode): string {
  if (runMode === SUPPORTED_RUN_MODE) {
    return "Select one or more marks in the Tableau view before asking for an explanation.";
  }

  return "This runner currently supports selected mark explanation only.";
}

function createWarning(code: string, message: string): AgentRunWarning {
  return {
    code,
    message,
    source: LAMBDA_RUNNER_NAME,
    severity: "warning",
  };
}

function dedupeWarnings(warnings: readonly string[]): AgentRunWarning[] {
  const uniqueWarnings = Array.from(
    new Set(warnings.map((warning) => warning.trim()).filter(Boolean)),
  );

  return uniqueWarnings.map((warning, index) => ({
    code: `WARN_${index + 1}`,
    message: warning,
    source: LAMBDA_RUNNER_NAME,
    severity: "warning",
  }));
}

function normalizeExecutionErrors(
  errors: Array<{ message: string; stepId?: string; stepType?: string }>,
): AgentRunError[] {
  return errors.map((error) => ({
    code: error.stepId ? `STEP_${error.stepId}` : undefined,
    message: error.message,
    source: LAMBDA_RUNNER_NAME,
    recoverable: false,
    metadata: error.stepType ? { stepType: error.stepType } : undefined,
  }));
}

function isTimeoutLikeResult(
  result: SelectedMarkOrchestrationResponse,
): boolean {
  const message =
    `${result.message} ${result.placeholderResponse}`.toLowerCase();
  return message.includes("timeout") || message.includes("timed out");
}

function mergeJsonObjects(
  ...values: Array<JsonObject | undefined>
): JsonObject | undefined {
  const merged = values.reduce<JsonObject>((accumulator, value) => {
    if (value) {
      return { ...accumulator, ...value };
    }

    return accumulator;
  }, {});

  return Object.keys(merged).length > 0 ? merged : undefined;
}

function cloneJsonObject(value?: JsonObject): JsonObject | undefined {
  return value ? { ...value } : undefined;
}

function cloneSelectedMarkSummary(
  item: SelectedMarkSummary,
): SelectedMarkSummary {
  return {
    worksheetName: item.worksheetName,
    ...(item.columns?.length ? { columns: [...item.columns] } : {}),
    ...(item.rows?.length
      ? {
          rows: item.rows.map((row) => ({
            values: row.values.map((cell) => ({
              fieldName: cell.fieldName ?? null,
              raw: cell.raw,
              display: cell.display,
              isEmpty: cell.isEmpty,
            })),
          })),
        }
      : {}),
    ...(item.rowCount !== undefined ? { rowCount: item.rowCount } : {}),
    ...(item.status ? { status: item.status } : {}),
  };
}

function toTraceError(error: unknown): ReturnType<typeof createTraceError> {
  if (error instanceof Error) {
    return createTraceError({
      code: "LAMBDA_AGENT_RUNNER_ERROR",
      message: error.message || "LambdaAgentRunner failed.",
      stack: error.stack,
      details: {
        runner: LAMBDA_RUNNER_NAME,
        originalErrorName: error.name || "Error",
      },
    });
  }

  return createTraceError({
    code: "LAMBDA_AGENT_RUNNER_ERROR",
    message: "LambdaAgentRunner failed.",
    details: {
      runner: LAMBDA_RUNNER_NAME,
      errorType: typeof error,
    },
  });
}
