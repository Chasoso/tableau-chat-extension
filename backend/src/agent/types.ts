import type { AuthenticatedUser } from "../types/auth";
import type { DashboardContext, QuestionIntent } from "../types/tableau";
import type { AgentRunId } from "./runId";

export type AgentContextSource = "tableau-extension" | "api" | "job-worker";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

export type AgentUserContext = Pick<
  AuthenticatedUser,
  "userId" | "email" | "tableauSubject" | "tokenUse"
>;

export type ContextPack = {
  agentRunId: AgentRunId;
  createdAt: string;
  question: string;
  dashboardContext: DashboardContext;
  sessionId?: string;
  clientContext?: {
    source?: AgentContextSource | string;
    appVersion?: string;
  };
  user?: AgentUserContext;
  questionInterpretation?: {
    requestType?: string;
    intent?: QuestionIntent;
    requestedMetricText?: string;
    asksForRanking?: boolean;
    topN?: number;
  };
};

export type AgentIntentName = QuestionIntent;

export type AgentRunStatus =
  | "queued"
  | "planning"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type AgentIntent = {
  name: AgentIntentName;
  confidence: number;
  reasonBrief: string;
  answerableFromContext: boolean;
  needsMcp: boolean;
  maxToolCalls: number;
  normalizedQuestion: string;
};

export type AgentPlanStepType =
  | "inspect_context"
  | "resolve_intent"
  | "collect_tool_data"
  | "compose_response"
  | "save_artifact";

export type AgentPlanStep = {
  type: AgentPlanStepType;
  description: string;
  toolActions?: ToolAction[];
};

export type AgentPlan = {
  agentRunId: AgentRunId;
  intent: AgentIntent;
  fixed: boolean;
  reasonBrief: string;
  requiredEvidence: string[];
  steps: AgentPlanStep[];
  maxToolCalls: number;
};

export type ToolActionKind =
  | "context"
  | "tableau-extension"
  | "tableau-rest"
  | "tableau-mcp"
  | "notion"
  | "llm";

export type ToolAction = {
  toolName: string;
  kind: ToolActionKind;
  purpose: string;
  arguments?: Record<string, unknown>;
  dependsOn?: string[];
  retryable?: boolean;
  maxAttempts?: number;
  timeoutMs?: number;
};

export type LegacyTraceEventType =
  | "run_started"
  | "context_normalized"
  | "intent_resolved"
  | "plan_built"
  | "tool_scheduled"
  | "tool_started"
  | "tool_completed"
  | "tool_failed"
  | "response_composed"
  | "run_completed"
  | "run_failed";

export type OrchestrationTraceEventType =
  | "orchestration.started"
  | "orchestration.completed"
  | "orchestration.failed"
  | "intent_resolution.started"
  | "intent_resolution.completed"
  | "intent_resolution.failed"
  | "plan_selection.started"
  | "plan_selection.completed"
  | "plan_selection.failed"
  | "execution.started"
  | "execution.completed"
  | "execution.failed"
  | "plan_step.started"
  | "plan_step.completed"
  | "plan_step.skipped"
  | "plan_step.blocked"
  | "plan_step.failed"
  | "tool_routing.started"
  | "tool_routing.completed"
  | "tool_routing.blocked"
  | "tool_routing.skipped"
  | "tool_routing.failed"
  | "budget.updated"
  | "fallback.selected";

export type TraceEventType = LegacyTraceEventType | OrchestrationTraceEventType;

export type TraceEventKind = TraceEventType;

export type TraceEventSeverity = "debug" | "info" | "warn" | "error";

export type TraceStepType =
  | "context_normalization"
  | "intent_resolution"
  | "plan_build"
  | "tool_routing"
  | "tool_execution"
  | "response_composition";

export type TraceStepStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped";

export type TraceError = {
  code: string;
  message: string;
  details?: JsonObject;
  stack?: string;
  cause?: string;
};

export type TraceStep = {
  agentRunId: AgentRunId;
  stepId: string;
  type: TraceStepType;
  status: TraceStepStatus;
  message: string;
  startedAt?: string;
  endedAt?: string;
  metadata?: JsonObject;
  error?: TraceError;
};

export type TraceEvent = {
  agentRunId: AgentRunId;
  eventId: string;
  at: string;
  type: TraceEventType;
  kind: TraceEventKind;
  severity: TraceEventSeverity;
  message: string;
  runStatus?: AgentRunStatus;
  stepId?: string;
  stepType?: TraceStepType;
  stepStatus?: TraceStepStatus;
  step?: AgentPlanStepType;
  toolAction?: ToolAction;
  traceStep?: TraceStep;
  metadata?: JsonObject;
  error?: TraceError;
  data?: JsonObject;
};

export type AgentRunContext = {
  agentRunId: AgentRunId;
  contextPack: ContextPack;
  trace: TraceEvent[];
};
