import { randomUUID } from "node:crypto";
import type { AgentRunStatus, JsonObject } from "./types";
import type { AgentRunId } from "./runId";
import type {
  TraceError,
  AgentPlanStepType,
  TraceEvent,
  TraceEventKind,
  TraceEventSeverity,
  TraceEventType,
  TraceStep,
  TraceStepStatus,
  TraceStepType,
  ToolAction,
} from "./types";

export function createTraceError(input: {
  code: string;
  message: string;
  details?: JsonObject;
  stack?: string;
  cause?: string;
}): TraceError {
  return {
    code: input.code,
    message: input.message,
    ...(input.details ? { details: input.details } : {}),
    ...(input.stack ? { stack: input.stack } : {}),
    ...(input.cause ? { cause: input.cause } : {}),
  };
}

export function createTraceStep(input: {
  agentRunId: AgentRunId;
  stepId?: string;
  type: TraceStepType;
  status?: TraceStepStatus;
  message: string;
  startedAt?: string;
  endedAt?: string;
  metadata?: JsonObject;
  error?: TraceError;
}): TraceStep {
  return {
    agentRunId: input.agentRunId,
    stepId: input.stepId ?? randomUUID(),
    type: input.type,
    status: input.status ?? "pending",
    message: input.message,
    ...(input.startedAt ? { startedAt: input.startedAt } : {}),
    ...(input.endedAt ? { endedAt: input.endedAt } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
    ...(input.error ? { error: input.error } : {}),
  };
}

export function createTraceEvent(input: {
  agentRunId: AgentRunId;
  type?: TraceEventType;
  kind?: TraceEventKind;
  message: string;
  severity?: TraceEventSeverity;
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
  at?: string;
  eventId?: string;
}): TraceEvent {
  const resolvedType = input.type ?? input.kind;
  if (!resolvedType) {
    throw new Error("createTraceEvent requires either type or kind");
  }

  const traceStep = input.traceStep;
  const stepId = input.stepId ?? traceStep?.stepId;
  const stepType = input.stepType ?? traceStep?.type;
  const stepStatus = input.stepStatus ?? traceStep?.status;
  const metadata = input.metadata ?? input.data ?? traceStep?.metadata;
  const error = input.error ?? traceStep?.error;

  return {
    agentRunId: input.agentRunId,
    eventId: input.eventId ?? randomUUID(),
    at: input.at ?? new Date().toISOString(),
    type: resolvedType,
    kind: resolvedType,
    severity: input.severity ?? "info",
    message: input.message,
    ...(input.runStatus ? { runStatus: input.runStatus } : {}),
    ...(stepId ? { stepId } : {}),
    ...(stepType ? { stepType } : {}),
    ...(stepStatus ? { stepStatus } : {}),
    ...(input.step ? { step: input.step } : {}),
    ...(input.toolAction ? { toolAction: input.toolAction } : {}),
    ...(traceStep ? { traceStep } : {}),
    ...(metadata ? { metadata, data: metadata } : {}),
    ...(error ? { error } : {}),
  };
}
