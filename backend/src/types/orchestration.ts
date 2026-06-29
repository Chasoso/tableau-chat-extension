export type ResolveIntentContextSummary = {
  dashboardName?: string;
  workbookName?: string;
  viewName?: string;
  hasSelectedMarks?: boolean;
  selectedMarkCount?: number;
  worksheetNames?: string[];
};

export type ResolveIntentRequest = {
  actionId?: string;
  requestedIntent?: string;
  message?: string;
  clientTimestamp?: string;
  contextSummary?: ResolveIntentContextSummary;
  metadata?: Record<string, unknown>;
};

export type ResolveIntentResponse = {
  result: {
    agentRunId: string;
    status: "resolved" | "unresolved" | "fallback";
    resolvedIntentId: string;
    confidence: number;
    source:
      | "ui_action"
      | "explicit"
      | "deterministic_rule"
      | "llm"
      | "fallback";
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
};
