import type { AgentRunId } from "./runId";
import type {
  AgentIntent,
  AgentPlan,
  AgentRunContext as LegacyAgentRunContext,
  AgentRunStatus as LegacyAgentRunStatus,
  JsonObject,
  TraceError,
  TraceEvent,
} from "./types";

export type AgentRunBudget = {
  maxModelCalls?: number;
  maxToolCalls?: number;
  timeoutMs?: number;
  maxDurationMs?: number;
  maxEstimatedCostUsd?: number;
};

export type AgentRunOptions = {
  budget?: AgentRunBudget;
  metadata?: JsonObject;
  abortSignal?: AbortSignal;
};

export type AgentTraceSink = {
  append: (event: TraceEvent) => void | Promise<void>;
  flush?: () => void | Promise<void>;
};

export type AgentRunMode =
  | "selected_mark_explanation"
  | "freeform_chat"
  | "future_intent";

export type AgentRunContextSummary = {
  dashboardName?: string;
  workbookName?: string;
  viewName?: string;
  worksheetNames?: string[];
  selectedMarks?: {
    available: boolean;
    count?: number;
    worksheetNames?: string[];
    fieldNames?: string[];
    summary?: string;
    truncated?: boolean;
  };
  summaryDataPreview?: {
    available: boolean;
    rowCount?: number;
    columnCount?: number;
    columnNames?: string[];
    truncated?: boolean;
  };
  filters?: {
    available: boolean;
    count?: number;
    names?: string[];
    truncated?: boolean;
  };
  parameters?: {
    available: boolean;
    count?: number;
    names?: string[];
    truncated?: boolean;
  };
  contextReference?: string;
  rawDataPolicy?: {
    includeRawSelectedMarks?: boolean;
    includeFullSummaryRows?: boolean;
  };
};

export type AgentRunPlanHint = {
  planId?: string;
  planName?: string;
  fixed?: boolean;
  reason?: string;
  metadata?: JsonObject;
};

export type AgentRunToolPolicy = {
  allowedTools?: string[];
  disallowedTools?: string[];
  safeForPreviewOnly?: boolean;
  requiresExplicitActionAllowed?: boolean;
};

export type AgentRunModelPolicy = {
  provider?: "bedrock" | "openai" | "none" | "unknown";
  modelId?: string;
  maxModelCalls?: number;
  allowLlmGeneration?: boolean;
};

export type AgentRunTraceOptions = {
  traceId?: string;
  correlationId?: string;
  captureEvents?: boolean;
  captureSummary?: boolean;
  includeMetadata?: boolean;
  metadata?: JsonObject;
};

export type AgentRunWarning = {
  code?: string;
  message: string;
  source?: string;
  severity?: "info" | "warning";
  details?: JsonObject;
  metadata?: JsonObject;
};

export type AgentRunError = {
  code?: string;
  message: string;
  source?: string;
  recoverable?: boolean;
  details?: JsonObject;
  metadata?: JsonObject;
};

export type AgentRunIntentResult = {
  intentId?: string;
  intentName?: string;
  status?: string;
  confidence?: number;
  reason?: string;
  summary?: JsonObject;
  metadata?: JsonObject;
};

export type AgentRunPlanResult = {
  planId?: string;
  planName?: string;
  status?: string;
  summary?: JsonObject;
  metadata?: JsonObject;
};

export type AgentRunExecutionResult = {
  status?: string;
  stepCount?: number;
  toolCallsUsed?: number;
  modelCallsUsed?: number;
  durationMs?: number;
  summary?: JsonObject;
  metadata?: JsonObject;
};

export type AgentRunResponseResult = {
  responseType?: string;
  message?: string;
  summary?: JsonObject;
  metadata?: JsonObject;
};

export type AgentRunTraceResult = {
  eventCount?: number;
  summary?: {
    firstEventType?: string;
    lastEventType?: string;
    hasErrors?: boolean;
    hasToolExecution?: boolean;
  };
  metadata?: JsonObject;
};

export type AgentRunBudgetUsage = {
  modelCallsUsed?: number;
  toolCallsUsed?: number;
  durationMs?: number;
  timedOut?: boolean;
  estimatedCostUsd?: number;
};

export type AgentRunnerKind = "lambda" | "agentcore" | "test" | "unknown";

export type AgentRunnerMetadata = {
  kind: AgentRunnerKind;
  name?: string;
  version?: string;
  environment?: string;
  implementation?: string;
};

export type AgentRunObservability = {
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  traceId?: string;
  correlationId?: string;
  cloudProviderRunId?: string;
  agentCoreSessionId?: string;
  agentCoreTraceId?: string;
  logGroupName?: string;
  logStreamName?: string;
  metrics?: {
    latencyMs?: number;
    modelCalls?: number;
    toolCalls?: number;
    timeoutCount?: number;
    retryCount?: number;
  };
};

export type AgentRunResultStatus =
  | LegacyAgentRunStatus
  | "partial"
  | "fallback"
  | "timed_out";

type LegacyAgentRunInput = LegacyAgentRunContext & {
  userMessage: string;
  intent: AgentIntent;
  plan: AgentPlan;
  traceSink?: AgentTraceSink;
  options?: AgentRunOptions;
};

type AgentRunComparisonInput = {
  runMode?: AgentRunMode;
  requestedIntent?: string;
  actionId?: string;
  context?: AgentRunContextSummary;
  planHint?: AgentRunPlanHint;
  toolPolicy?: AgentRunToolPolicy;
  modelPolicy?: AgentRunModelPolicy;
  budget?: AgentRunBudget;
  traceOptions?: AgentRunTraceOptions;
  locale?: string;
  metadata?: JsonObject;
};

export type AgentRunInput = LegacyAgentRunInput & AgentRunComparisonInput;

export type AgentRunResult = {
  agentRunId: AgentRunId;
  runMode?: AgentRunMode;
  status: AgentRunResultStatus;
  answer?: string;
  finalMessage?: string;
  intent?: AgentRunIntentResult;
  plan?: AgentRunPlanResult;
  execution?: AgentRunExecutionResult;
  response?: AgentRunResponseResult;
  trace: TraceEvent[];
  traceSummary?: AgentRunTraceResult;
  warnings: AgentRunWarning[];
  errors?: AgentRunError[];
  error?: TraceError;
  fallbackReason?: string;
  budgetUsage?: AgentRunBudgetUsage;
  runner?: AgentRunnerMetadata;
  observability?: AgentRunObservability;
  startedAt: string;
  endedAt: string;
  metadata?: JsonObject;
};

export interface AgentRunner {
  run(input: AgentRunInput): Promise<AgentRunResult>;
}
