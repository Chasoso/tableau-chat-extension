import { describe, expect, it } from "vitest";
import { createAgentRunId, createTraceEvent, isAgentRunId } from "../src/agent";

describe("agent core types helpers", () => {
  it("creates and validates agent run ids", () => {
    const runId = createAgentRunId();

    expect(runId).toMatch(/^ar_[0-9a-f-]{36}$/i);
    expect(isAgentRunId(runId)).toBe(true);
    expect(isAgentRunId("not-an-agent-run-id")).toBe(false);
  });

  it("creates trace events with the expected shape", () => {
    const runId = createAgentRunId();
    const event = createTraceEvent({
      agentRunId: runId,
      kind: "run_started",
      message: "Run started",
      severity: "info",
      data: { source: "unit-test" },
      at: "2026-01-01T00:00:00.000Z",
      eventId: "trace-event-1",
    });

    expect(event).toEqual({
      agentRunId: runId,
      eventId: "trace-event-1",
      at: "2026-01-01T00:00:00.000Z",
      kind: "run_started",
      severity: "info",
      message: "Run started",
      data: { source: "unit-test" },
    });
  });
});
