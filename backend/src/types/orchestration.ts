import type {
  ExecutionResult,
  IntentResolutionResult,
  OrchestrationTraceContextSummary,
  PlanSelectionResult,
  TraceEvent,
} from "../agent";

export type ResolveIntentContextSummary = {
  dashboardName?: string;
  workbookName?: string;
  viewName?: string;
  hasSelectedMarks?: boolean;
  selectedMarkCount?: number;
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

export type SelectedMarkOrchestrationResponse = {
  mode: Extract<ResolveIntentRunMode, "resolve_and_execute_fixed_plan">;
  status: "completed" | "partial" | "fallback" | "failed";
  message: string;
  placeholderResponse: string;
  intentResolution: IntentResolutionResult;
  planSelection?: PlanSelectionResult;
  execution?: ExecutionResult;
  traceEvents: TraceEvent[];
  traceMetadata?: Record<string, unknown>;
  contextSummary?: OrchestrationTraceContextSummary;
  responseMaterial?: Record<string, unknown>;
};

export type ResolveIntentResponse = {
  result: IntentResolutionResult;
  orchestration?: SelectedMarkOrchestrationResponse;
};
