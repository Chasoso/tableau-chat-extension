import type { AgentRunId } from "./runId";
import type {
  AgentIntent,
  AgentPlan,
  AgentRunContext,
  AgentRunStatus,
  JsonObject,
  TraceError,
  TraceEvent,
} from "./types";

export type AgentRunBudget = {
  maxModelCalls?: number;
  maxToolCalls?: number;
  timeoutMs?: number;
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

export type AgentRunWarning = {
  code: string;
  message: string;
  details?: JsonObject;
};

export type AgentRunInput = AgentRunContext & {
  userMessage: string;
  intent: AgentIntent;
  plan: AgentPlan;
  traceSink?: AgentTraceSink;
  options?: AgentRunOptions;
};

export type AgentRunResult = {
  agentRunId: AgentRunId;
  status: AgentRunStatus;
  answer?: string;
  trace: TraceEvent[];
  warnings: AgentRunWarning[];
  error?: TraceError;
  startedAt: string;
  endedAt: string;
  metadata?: JsonObject;
};

export interface AgentRunner {
  run(input: AgentRunInput): Promise<AgentRunResult>;
}
