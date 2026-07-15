import type { SelectedMarkSummary } from "./tableau";

export type ResolveIntentContextSummary = {
  dashboardName?: string;
  workbookName?: string;
  viewName?: string;
  hasSelectedMarks?: boolean;
  selectedMarkCount?: number;
  selectedMarks?: SelectedMarkSummary[];
  worksheetNames?: string[];
  summaryDataPreview?: {
    available?: boolean;
    rowCount?: number;
    columnCount?: number;
    columnNames?: string[];
    truncated?: boolean;
  };
  filters?: {
    count?: number;
    names?: string[];
  };
  parameters?: {
    count?: number;
    names?: string[];
  };
};

export type ResolveIntentRunMode =
  | "resolve_only"
  | "resolve_and_execute_fixed_plan";

export type ResolveIntentRequest = {
  actionId?: string;
  requestedIntent?: string;
  message?: string;
  clientTimestamp?: string;
  contextSummary?: ResolveIntentContextSummary;
  runMode?: ResolveIntentRunMode;
  metadata?: Record<string, unknown>;
};

export type IntentResolutionResult = {
  agentRunId: string;
  status: "resolved" | "unresolved" | "fallback";
  resolvedIntentId: string;
  confidence: number;
  source: "ui_action" | "explicit" | "deterministic_rule" | "llm" | "fallback";
  reason?: string;
  warnings: string[];
  fallbackIntentId?: string;
  evidence?: Array<{
    type: string;
    value: string;
    metadata?: Record<string, unknown>;
  }>;
  traceMetadata?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

export type SelectedMarkPlanSelection = {
  status: "selected" | "fallback" | "unsupported";
  matched: boolean;
  resolvedIntentId: string;
  selectedPlan: {
    id: string;
    title: string;
    responseStrategy: string;
    budget: {
      maxModelCalls: number;
      maxToolCalls: number;
      timeoutMs: number;
    };
  };
  preconditions: Array<{
    id: string;
    type: string;
    required: boolean;
    satisfied: boolean;
    reasonBrief: string;
    fallbackReason?: string;
  }>;
  reasonBrief: string;
};

export type SelectedMarkExecutionResult = {
  status: "completed" | "partial" | "failed" | "skipped";
  planId: string;
  intentId: string;
  executedSteps: string[];
  skippedSteps: string[];
  blockedSteps: string[];
  stepResults: Array<{
    stepId: string;
    stepType: string;
    status: "routed" | "skipped" | "blocked" | "failed" | "not_executed";
    toolName?: string;
    routingStatus?: "allowed" | "skipped" | "blocked" | "unavailable";
    reason?: string;
    warnings: string[];
    lookupResult?: Record<string, unknown>;
    preconditionResults?: Array<Record<string, unknown>>;
    toolExecutionResult?: Record<string, unknown>;
    output?: Record<string, unknown> | string | number | boolean | null;
    normalizedOutput?:
      | Record<string, unknown>
      | string
      | number
      | boolean
      | null;
  }>;
  budgetUsage: {
    toolCallsUsed: number;
    modelCallsUsed: number;
    maxToolCalls: number;
    maxModelCalls: number;
    timeoutMs: number;
    startedAt: string;
    completedAt: string;
    durationMs: number;
  };
  warnings: string[];
  errors: Array<{
    message: string;
    stepId?: string;
    stepType?: string;
  }>;
  fallbackReason?: string;
  responseMaterial?: Record<string, unknown>;
};

export type SelectedMarkOrchestrationResponse = {
  mode: "resolve_and_execute_fixed_plan";
  status: "completed" | "partial" | "fallback" | "failed";
  message: string;
  placeholderResponse: string;
  intentResolution: IntentResolutionResult;
  planSelection?: SelectedMarkPlanSelection;
  execution?: SelectedMarkExecutionResult;
  traceEvents: Array<Record<string, unknown>>;
  traceMetadata?: Record<string, unknown>;
  contextSummary?: ResolveIntentContextSummary & {
    selectedMarks?: {
      hasSelectedMarks?: boolean;
      totalCount?: number;
      previewCount?: number;
      truncated?: boolean;
      worksheetNames?: string[];
      items?: SelectedMarkSummary[];
    };
  };
  responseMaterial?: Record<string, unknown>;
};

export type ResolveIntentResponse = {
  result: IntentResolutionResult;
  orchestration?: SelectedMarkOrchestrationResponse;
};
