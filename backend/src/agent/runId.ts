import { randomUUID } from "node:crypto";

export type AgentRunId = string & { readonly __brand: "AgentRunId" };

const AGENT_RUN_ID_PREFIX = "ar_";

export function createAgentRunId(): AgentRunId {
  return `${AGENT_RUN_ID_PREFIX}${randomUUID()}` as AgentRunId;
}

export function isAgentRunId(value: string): value is AgentRunId {
  return new RegExp(`^${AGENT_RUN_ID_PREFIX}[0-9a-f-]{36}$`, "i").test(value);
}
