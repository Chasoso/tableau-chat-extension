import { randomUUID } from "node:crypto";

export type AgentRunId = string & { readonly __brand: "AgentRunId" };

export const AGENT_RUN_ID_PREFIX = "ar_";
export const AGENT_RUN_ID_PATTERN = new RegExp(
  `^${AGENT_RUN_ID_PREFIX}[0-9a-f-]{36}$`,
  "i",
);

export function createAgentRunId(): AgentRunId {
  return `${AGENT_RUN_ID_PREFIX}${randomUUID()}` as AgentRunId;
}

export function isAgentRunId(value: string): value is AgentRunId {
  return AGENT_RUN_ID_PATTERN.test(value);
}

export function parseAgentRunId(value: string): AgentRunId | undefined {
  const normalized = value.trim();
  return isAgentRunId(normalized) ? (normalized as AgentRunId) : undefined;
}

export function normalizeAgentRunId(value: string): AgentRunId | undefined {
  return parseAgentRunId(value);
}
