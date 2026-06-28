import { randomUUID } from "node:crypto";
import type { AgentRunId } from "./runId";
import type {
  AgentPlanStepType,
  TraceEvent,
  TraceEventKind,
  TraceEventSeverity,
  ToolAction,
} from "./types";

export function createTraceEvent(input: {
  agentRunId: AgentRunId;
  kind: TraceEventKind;
  message: string;
  severity?: TraceEventSeverity;
  step?: AgentPlanStepType;
  toolAction?: ToolAction;
  data?: Record<string, unknown>;
  at?: string;
  eventId?: string;
}): TraceEvent {
  return {
    agentRunId: input.agentRunId,
    eventId: input.eventId ?? randomUUID(),
    at: input.at ?? new Date().toISOString(),
    kind: input.kind,
    severity: input.severity ?? "info",
    message: input.message,
    ...(input.step ? { step: input.step } : {}),
    ...(input.toolAction ? { toolAction: input.toolAction } : {}),
    ...(input.data ? { data: input.data } : {}),
  };
}
