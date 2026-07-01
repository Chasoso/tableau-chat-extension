import type { JsonObject, JsonValue } from "./types";
import type { ToolDefinition, ToolDefinitionSummary } from "./toolDefinition";
import type { RunBudget } from "./plan";
import type { ToolPreconditionResult } from "./toolPreconditions";
import type { ToolRoutingResult } from "./toolRouter";

export type ToolExecutionStatus =
  | "completed"
  | "failed"
  | "timed_out"
  | "skipped"
  | "blocked";

export type ToolExecutionBudgetUsage = {
  toolCallsUsed: number;
  toolCallsRemaining?: number;
  maxToolCalls?: number;
};

export type ToolExecutionNormalizationSummary = {
  jsonSafe: boolean;
  truncated: boolean;
  circularReferenceCount: number;
  depthExceeded: boolean;
  replacedValueCount: number;
};

export type ToolExecutionInput = {
  agentRunId?: string;
  toolName: string;
  tool?: ToolDefinition | ToolDefinitionSummary;
  input?: unknown;
  context?: JsonObject;
  timeoutMs?: number;
  budget?: Partial<Pick<RunBudget, "maxToolCalls" | "timeoutMs">>;
  budgetUsage?: {
    toolCallsUsed?: number;
  };
  preconditionResults?: readonly ToolPreconditionResult[];
  routingResult?: ToolRoutingResult;
  metadata?: JsonObject;
  traceMetadata?: JsonObject;
};

export type ToolExecutionResult = {
  status: ToolExecutionStatus;
  toolName: string;
  reason?: string;
  output?: JsonValue;
  normalizedOutput?: JsonValue;
  error?: {
    name?: string;
    message: string;
    stack?: string;
  };
  warnings: string[];
  durationMs: number;
  timeoutMs?: number;
  budgetUsage: ToolExecutionBudgetUsage;
  preconditionSummary?: JsonObject;
  routingSummary?: JsonObject;
  jsonSafe: boolean;
  normalization: ToolExecutionNormalizationSummary;
  metadata?: JsonObject;
  traceMetadata?: JsonObject;
};

export type ToolExecutionHandler = (
  input: ToolExecutionInput,
) => Promise<unknown> | unknown;

export type ToolExecutionWrapperOptions = {
  handlers?: Record<string, ToolExecutionHandler>;
  defaultTimeoutMs?: number;
  maxOutputDepth?: number;
  maxOutputEntries?: number;
  maxStringLength?: number;
};

export interface ToolExecutionWrapper {
  execute(input: ToolExecutionInput): Promise<ToolExecutionResult>;
}

export type MinimalToolExecutionWrapperOptions = ToolExecutionWrapperOptions;

export class MinimalToolExecutionWrapper implements ToolExecutionWrapper {
  constructor(
    private readonly options: MinimalToolExecutionWrapperOptions = {},
  ) {}

  async execute(input: ToolExecutionInput): Promise<ToolExecutionResult> {
    const startedAt = Date.now();
    const toolName = normalizeToolName(input.toolName);
    const timeoutMs =
      input.timeoutMs ??
      input.budget?.timeoutMs ??
      this.options.defaultTimeoutMs;
    const currentToolCallsUsed = input.budgetUsage?.toolCallsUsed ?? 0;
    const maxToolCalls = input.budget?.maxToolCalls;
    const budgetExceeded =
      typeof maxToolCalls === "number" && currentToolCallsUsed >= maxToolCalls;
    const preconditionEvaluation = evaluateExecutionPreconditions(
      input.preconditionResults,
    );
    const routingSummary = buildRoutingSummary(input.routingResult);
    const metadata = cloneJsonObject(input.metadata);
    const traceMetadata = cloneJsonObject(input.traceMetadata);
    const warnings = [
      ...preconditionEvaluation.warnings,
      ...(input.routingResult?.warnings ?? []),
    ];

    if (!toolName) {
      return buildResult({
        status: "blocked",
        toolName: input.toolName ?? "",
        startedAt,
        timeoutMs,
        warnings: [...warnings, "invalid_tool_name"],
        budgetUsage: {
          toolCallsUsed: currentToolCallsUsed,
          toolCallsRemaining:
            typeof maxToolCalls === "number"
              ? Math.max(maxToolCalls - currentToolCallsUsed, 0)
              : undefined,
          maxToolCalls,
        },
        reason: "Tool name must be a non-empty string.",
        metadata,
        traceMetadata,
        preconditionSummary: preconditionEvaluation.summary,
        routingSummary,
      });
    }

    if (preconditionEvaluation.blocked) {
      return buildResult({
        status: "blocked",
        toolName,
        startedAt,
        timeoutMs,
        warnings,
        budgetUsage: {
          toolCallsUsed: currentToolCallsUsed,
          toolCallsRemaining:
            typeof maxToolCalls === "number"
              ? Math.max(maxToolCalls - currentToolCallsUsed, 0)
              : undefined,
          maxToolCalls,
        },
        reason:
          preconditionEvaluation.reason ??
          "A required precondition blocked tool execution.",
        metadata,
        traceMetadata,
        preconditionSummary: preconditionEvaluation.summary,
        routingSummary,
      });
    }

    if (budgetExceeded) {
      return buildResult({
        status: "blocked",
        toolName,
        startedAt,
        timeoutMs,
        warnings: [...warnings, "tool_budget_exceeded"],
        budgetUsage: {
          toolCallsUsed: currentToolCallsUsed,
          toolCallsRemaining: 0,
          maxToolCalls,
        },
        reason: "Tool budget has been exhausted.",
        metadata,
        traceMetadata,
        preconditionSummary: preconditionEvaluation.summary,
        routingSummary,
      });
    }

    if (input.routingResult) {
      if (input.routingResult.status === "skipped") {
        return buildResult({
          status: "skipped",
          toolName,
          startedAt,
          timeoutMs,
          warnings,
          budgetUsage: buildBudgetUsage({
            currentToolCallsUsed,
            maxToolCalls,
            increment: 0,
          }),
          reason:
            input.routingResult.reason ??
            "Tool routing skipped execution for this step.",
          metadata,
          traceMetadata,
          preconditionSummary: preconditionEvaluation.summary,
          routingSummary,
        });
      }

      if (input.routingResult.status === "blocked") {
        return buildResult({
          status: "blocked",
          toolName,
          startedAt,
          timeoutMs,
          warnings,
          budgetUsage: buildBudgetUsage({
            currentToolCallsUsed,
            maxToolCalls,
            increment: 0,
          }),
          reason:
            input.routingResult.reason ??
            "Tool routing blocked execution for this step.",
          metadata,
          traceMetadata,
          preconditionSummary: preconditionEvaluation.summary,
          routingSummary,
        });
      }

      if (input.routingResult.status === "unavailable") {
        return buildResult({
          status: "blocked",
          toolName,
          startedAt,
          timeoutMs,
          warnings,
          budgetUsage: buildBudgetUsage({
            currentToolCallsUsed,
            maxToolCalls,
            increment: 0,
          }),
          reason:
            input.routingResult.reason ??
            "Tool routing reported the tool as unavailable.",
          metadata,
          traceMetadata,
          preconditionSummary: preconditionEvaluation.summary,
          routingSummary,
        });
      }
    }

    const handler = this.options.handlers?.[toolName];
    if (!handler) {
      return buildResult({
        status: "blocked",
        toolName,
        startedAt,
        timeoutMs,
        warnings: [...warnings, "missing_tool_handler"],
        budgetUsage: buildBudgetUsage({
          currentToolCallsUsed,
          maxToolCalls,
          increment: 0,
        }),
        reason: `No execution handler is registered for tool '${toolName}'.`,
        metadata,
        traceMetadata,
        preconditionSummary: preconditionEvaluation.summary,
        routingSummary,
      });
    }

    const normalizedExecution = await executeWithTimeout(
      handler,
      input,
      timeoutMs,
    );
    const completedAt = Date.now();
    const durationMs = Math.max(0, completedAt - startedAt);

    if (normalizedExecution.kind === "timeout") {
      return buildResult({
        status: "timed_out",
        toolName,
        startedAt,
        timeoutMs,
        warnings: [...warnings, "tool_execution_timed_out"],
        budgetUsage: buildBudgetUsage({
          currentToolCallsUsed,
          maxToolCalls,
          increment: 0,
        }),
        reason:
          normalizedExecution.reason ??
          `Tool execution exceeded the ${timeoutMs} ms timeout.`,
        error: normalizedExecution.error,
        metadata,
        traceMetadata,
        preconditionSummary: preconditionEvaluation.summary,
        routingSummary,
        durationMs,
      });
    }

    if (normalizedExecution.kind === "error") {
      return buildResult({
        status: "failed",
        toolName,
        startedAt,
        timeoutMs,
        warnings: [...warnings, "tool_execution_failed"],
        budgetUsage: buildBudgetUsage({
          currentToolCallsUsed,
          maxToolCalls,
          increment: 0,
        }),
        reason: normalizedExecution.error.message,
        error: normalizedExecution.error,
        metadata,
        traceMetadata,
        preconditionSummary: preconditionEvaluation.summary,
        routingSummary,
        durationMs,
      });
    }

    const normalizedOutput = normalizeToolExecutionValue(
      normalizedExecution.value,
      {
        maxDepth: this.options.maxOutputDepth ?? 4,
        maxEntries: this.options.maxOutputEntries ?? 32,
        maxStringLength: this.options.maxStringLength ?? 2_000,
      },
    );
    const finalDurationMs = Math.max(0, Date.now() - startedAt);
    const completedBudgetUsage = buildBudgetUsage({
      currentToolCallsUsed,
      maxToolCalls,
      increment: 1,
    });

    return buildResult({
      status: "completed",
      toolName,
      startedAt,
      timeoutMs,
      warnings,
      budgetUsage: completedBudgetUsage,
      output: normalizedOutput.value,
      normalizedOutput: normalizedOutput.value,
      metadata,
      traceMetadata,
      preconditionSummary: preconditionEvaluation.summary,
      routingSummary,
      durationMs: finalDurationMs,
      jsonSafe: normalizedOutput.jsonSafe,
      normalization: normalizedOutput.summary,
    });
  }
}

export function createMinimalToolExecutionWrapper(
  options?: MinimalToolExecutionWrapperOptions,
): ToolExecutionWrapper {
  return new MinimalToolExecutionWrapper(options);
}

export function createDefaultToolExecutionWrapper(
  options?: MinimalToolExecutionWrapperOptions,
): ToolExecutionWrapper {
  return createMinimalToolExecutionWrapper(options);
}

export function buildToolExecutionTraceMetadata(
  result: ToolExecutionResult,
): JsonObject {
  const metadata: JsonObject = {
    toolName: result.toolName,
    status: result.status,
    durationMs: result.durationMs,
    jsonSafe: result.jsonSafe,
    normalization: { ...result.normalization },
    budgetUsage: { ...result.budgetUsage },
  };

  if (result.timeoutMs !== undefined) {
    metadata.timeoutMs = result.timeoutMs;
  }
  if (result.reason !== undefined) {
    metadata.reason = result.reason;
  }
  if (result.error !== undefined) {
    metadata.error = { ...result.error };
  }
  if (result.warnings.length > 0) {
    metadata.warnings = [...result.warnings];
  }
  if (result.preconditionSummary !== undefined) {
    metadata.preconditionSummary = { ...result.preconditionSummary };
  }
  if (result.routingSummary !== undefined) {
    metadata.routingSummary = { ...result.routingSummary };
  }
  if (result.metadata !== undefined) {
    metadata.metadata = { ...result.metadata };
  }
  if (result.traceMetadata !== undefined) {
    metadata.traceMetadata = { ...result.traceMetadata };
  }

  return metadata;
}

async function executeWithTimeout(
  handler: ToolExecutionHandler,
  input: ToolExecutionInput,
  timeoutMs: number | undefined,
): Promise<
  | {
      kind: "success";
      value: unknown;
    }
  | {
      kind: "error";
      error: {
        name?: string;
        message: string;
        stack?: string;
      };
    }
  | {
      kind: "timeout";
      reason: string;
      error: {
        name: string;
        message: string;
      };
    }
> {
  const executionPromise = Promise.resolve().then(() => handler(input));

  if (timeoutMs === undefined || timeoutMs <= 0) {
    try {
      return {
        kind: "success",
        value: await executionPromise,
      };
    } catch (error) {
      return {
        kind: "error",
        error: normalizeError(error),
      };
    }
  }

  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<{
    kind: "timeout";
    reason: string;
    error: {
      name: string;
      message: string;
    };
  }>((resolve) => {
    timeoutHandle = setTimeout(() => {
      resolve({
        kind: "timeout",
        reason: `Tool execution exceeded the ${timeoutMs} ms timeout.`,
        error: {
          name: "ToolExecutionTimeoutError",
          message: `Tool execution timed out after ${timeoutMs} ms.`,
        },
      });
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([
      executionPromise
        .then((value) => ({ kind: "success" as const, value }))
        .catch((error) => ({
          kind: "error" as const,
          error: normalizeError(error),
        })),
      timeoutPromise,
    ]);

    return result;
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

function buildResult(input: {
  status: ToolExecutionStatus;
  toolName: string;
  startedAt: number;
  timeoutMs?: number;
  warnings: string[];
  budgetUsage: ToolExecutionBudgetUsage;
  reason?: string;
  error?: {
    name?: string;
    message: string;
    stack?: string;
  };
  output?: JsonValue;
  normalizedOutput?: JsonValue;
  metadata?: JsonObject;
  traceMetadata?: JsonObject;
  preconditionSummary?: JsonObject;
  routingSummary?: JsonObject;
  durationMs?: number;
  jsonSafe?: boolean;
  normalization?: ToolExecutionNormalizationSummary;
}): ToolExecutionResult {
  const durationMs =
    input.durationMs ?? Math.max(0, Date.now() - input.startedAt);
  const normalization = input.normalization ?? createNormalizationSummary();

  const result: ToolExecutionResult = {
    status: input.status,
    toolName: input.toolName,
    ...(input.reason ? { reason: input.reason } : {}),
    ...(input.output !== undefined ? { output: input.output } : {}),
    ...(input.normalizedOutput !== undefined
      ? { normalizedOutput: input.normalizedOutput }
      : {}),
    ...(input.error ? { error: { ...input.error } } : {}),
    warnings: [...input.warnings],
    durationMs,
    ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {}),
    budgetUsage: { ...input.budgetUsage },
    ...(input.preconditionSummary
      ? { preconditionSummary: { ...input.preconditionSummary } }
      : {}),
    ...(input.routingSummary
      ? { routingSummary: { ...input.routingSummary } }
      : {}),
    jsonSafe: input.jsonSafe ?? normalization.jsonSafe,
    normalization,
    ...(input.metadata ? { metadata: { ...input.metadata } } : {}),
    ...(input.traceMetadata
      ? { traceMetadata: { ...input.traceMetadata } }
      : {}),
  };

  if (input.reason) {
    result.metadata = {
      ...(result.metadata ?? {}),
      reason: input.reason,
    };
    result.traceMetadata = {
      ...(result.traceMetadata ?? {}),
      reason: input.reason,
    };
  }

  return result;
}

function evaluateExecutionPreconditions(
  preconditionResults: readonly ToolPreconditionResult[] | undefined,
): {
  blocked: boolean;
  reason?: string;
  warnings: string[];
  summary?: JsonObject;
} {
  if (!preconditionResults || preconditionResults.length === 0) {
    return {
      blocked: false,
      warnings: [],
    };
  }

  const warnings: string[] = [];
  const summary = preconditionResults.map((result) => ({
    id: result.id,
    type: result.type,
    status: result.status,
    required: result.required,
    ...(result.reason ? { reason: result.reason } : {}),
  }));

  for (const precondition of preconditionResults) {
    if (precondition.status === "failed" || precondition.status === "blocked") {
      if (precondition.required) {
        return {
          blocked: true,
          reason:
            precondition.reason ??
            "A required tool precondition failed or was blocked.",
          warnings: [
            ...warnings,
            ...(precondition.status === "blocked"
              ? ["tool_precondition_blocked"]
              : ["tool_precondition_failed"]),
          ],
          summary: {
            results: summary,
          },
        };
      }

      warnings.push(
        precondition.status === "blocked"
          ? "optional_tool_precondition_blocked"
          : "optional_tool_precondition_failed",
      );
    }

    if (precondition.status === "skipped" && !precondition.required) {
      warnings.push("optional_tool_precondition_skipped");
    }
  }

  return {
    blocked: false,
    warnings,
    summary: {
      results: summary,
    },
  };
}

function buildBudgetUsage(input: {
  currentToolCallsUsed: number;
  maxToolCalls?: number;
  increment: number;
}): ToolExecutionBudgetUsage {
  const toolCallsUsed = input.currentToolCallsUsed + input.increment;
  return {
    toolCallsUsed,
    ...(input.maxToolCalls !== undefined
      ? {
          maxToolCalls: input.maxToolCalls,
          toolCallsRemaining: Math.max(input.maxToolCalls - toolCallsUsed, 0),
        }
      : {}),
  };
}

function buildRoutingSummary(
  routingResult: ToolRoutingResult | undefined,
): JsonObject | undefined {
  if (!routingResult) {
    return undefined;
  }

  const summary: JsonObject = {
    status: routingResult.status,
  };

  if (routingResult.toolName !== undefined) {
    summary.toolName = routingResult.toolName;
  }
  if (routingResult.reason !== undefined) {
    summary.reason = routingResult.reason;
  }
  if (routingResult.warnings.length > 0) {
    summary.warnings = [...routingResult.warnings];
  }
  if (routingResult.preconditionStatus !== undefined) {
    summary.preconditionStatus = routingResult.preconditionStatus;
  }
  if (routingResult.budgetStatus !== undefined) {
    summary.budgetStatus = { ...routingResult.budgetStatus };
  }
  if (routingResult.fallbackBehavior !== undefined) {
    summary.fallbackBehavior = { ...routingResult.fallbackBehavior };
  }
  if (routingResult.traceMetadata !== undefined) {
    summary.traceMetadata = { ...routingResult.traceMetadata };
  }

  return summary;
}

function cloneJsonObject(value?: JsonObject): JsonObject | undefined {
  if (!value) {
    return undefined;
  }

  return { ...value };
}

function normalizeToolExecutionValue(
  value: unknown,
  options: {
    maxDepth: number;
    maxEntries: number;
    maxStringLength: number;
  },
): {
  value: JsonValue;
  jsonSafe: boolean;
  summary: ToolExecutionNormalizationSummary;
} {
  const state = {
    truncated: false,
    circularReferenceCount: 0,
    depthExceeded: false,
    replacedValueCount: 0,
  };
  const normalized = normalizeValue(value, options, state, 0, new WeakSet());

  return {
    value: normalized,
    jsonSafe: true,
    summary: {
      jsonSafe: true,
      truncated: state.truncated,
      circularReferenceCount: state.circularReferenceCount,
      depthExceeded: state.depthExceeded,
      replacedValueCount: state.replacedValueCount,
    },
  };
}

function normalizeValue(
  value: unknown,
  options: {
    maxDepth: number;
    maxEntries: number;
    maxStringLength: number;
  },
  state: {
    truncated: boolean;
    circularReferenceCount: number;
    depthExceeded: boolean;
    replacedValueCount: number;
  },
  depth: number,
  seen: WeakSet<object>,
): JsonValue {
  if (value === null) {
    return null;
  }

  if (typeof value === "string") {
    return truncateString(value, options.maxStringLength, state);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "bigint") {
    state.replacedValueCount += 1;
    return value.toString();
  }
  if (typeof value === "undefined") {
    state.replacedValueCount += 1;
    return null;
  }
  if (typeof value === "function") {
    state.replacedValueCount += 1;
    return "[Function]";
  }
  if (typeof value === "symbol") {
    state.replacedValueCount += 1;
    return String(value);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      ...(value.stack
        ? { stack: truncateString(value.stack, options.maxStringLength, state) }
        : {}),
    };
  }

  if (Array.isArray(value)) {
    if (depth >= options.maxDepth) {
      state.depthExceeded = true;
      state.truncated = true;
      return {
        kind: "array",
        truncated: true,
        length: value.length,
      };
    }

    const items: JsonValue[] = [];
    const limit = Math.min(value.length, options.maxEntries);
    for (let index = 0; index < limit; index += 1) {
      items.push(normalizeValue(value[index], options, state, depth + 1, seen));
    }
    if (value.length > limit) {
      state.truncated = true;
      items.push("[Truncated]");
    }
    return items;
  }

  if (!isPlainObject(value)) {
    state.replacedValueCount += 1;
    return truncateString(
      Object.prototype.toString.call(value),
      options.maxStringLength,
      state,
    );
  }

  if (seen.has(value)) {
    state.circularReferenceCount += 1;
    state.truncated = true;
    return "[Circular]";
  }
  seen.add(value);

  if (depth >= options.maxDepth) {
    state.depthExceeded = true;
    state.truncated = true;
    const keys = Object.keys(value).slice(0, options.maxEntries);
    return {
      kind: "object",
      truncated: true,
      keys,
      keyCount: Object.keys(value).length,
    };
  }

  const output: JsonObject = {};
  const entries = Object.entries(value);
  const limit = Math.min(entries.length, options.maxEntries);
  for (let index = 0; index < limit; index += 1) {
    const [key, item] = entries[index];
    output[key] = normalizeValue(item, options, state, depth + 1, seen);
  }

  if (entries.length > limit) {
    state.truncated = true;
    output.__truncated__ = true;
    output.__keyCount__ = entries.length;
  }

  return output;
}

function createNormalizationSummary(): ToolExecutionNormalizationSummary {
  return {
    jsonSafe: true,
    truncated: false,
    circularReferenceCount: 0,
    depthExceeded: false,
    replacedValueCount: 0,
  };
}

function truncateString(
  value: string,
  maxLength: number,
  state: {
    truncated: boolean;
    circularReferenceCount: number;
    depthExceeded: boolean;
    replacedValueCount: number;
  },
): string {
  if (value.length <= maxLength) {
    return value;
  }

  state.truncated = true;
  return `${value.slice(0, maxLength)}…`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function normalizeToolName(name: string | undefined): string | undefined {
  const normalized = name?.trim();
  return normalized ? normalized : undefined;
}

function normalizeError(error: unknown): {
  name?: string;
  message: string;
  stack?: string;
} {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...(error.stack ? { stack: error.stack } : {}),
    };
  }

  if (typeof error === "string") {
    return {
      message: error,
    };
  }

  return {
    message: "Tool execution failed.",
  };
}
