import type { AuthenticatedUser } from "../types/auth";
import type { DashboardContext, QuestionIntent } from "../types/tableau";
import type { AgentRunId } from "./runId";

export type AgentContextSource = "tableau-extension" | "api" | "job-worker";

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

export type TraceEventKind =
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

export type TraceEventSeverity = "debug" | "info" | "warn" | "error";

export type TraceEvent = {
  agentRunId: AgentRunId;
  eventId: string;
  at: string;
  kind: TraceEventKind;
  severity: TraceEventSeverity;
  message: string;
  step?: AgentPlanStepType;
  toolAction?: ToolAction;
  data?: Record<string, unknown>;
};

export type AgentRunContext = {
  agentRunId: AgentRunId;
  contextPack: ContextPack;
  trace: TraceEvent[];
};
