import { describe, expect, it } from "vitest";
import {
  createAgentRunId,
  createTraceError,
  createTraceEvent,
  createTraceStep,
  isAgentRunId,
  normalizeAgentRunId,
  parseAgentRunId,
} from "../src/agent";

describe("agent core types helpers", () => {
  it("creates and validates agent run ids", () => {
    const runId = createAgentRunId();

    expect(runId).toMatch(/^ar_[0-9a-f-]{36}$/i);
    expect(isAgentRunId(runId)).toBe(true);
    expect(isAgentRunId("not-an-agent-run-id")).toBe(false);
    expect(parseAgentRunId(`  ${runId}  `)).toBe(runId);
    expect(normalizeAgentRunId(runId)).toBe(runId);
    expect(parseAgentRunId("bad-id")).toBeUndefined();
  });

  it("creates trace errors and trace steps", () => {
    const runId = createAgentRunId();
    const error = createTraceError({
      code: "TABLEAU_MCP_TIMEOUT",
      message: "The Tableau MCP request timed out",
      details: {
        toolName: "tableau-mcp",
        timeoutMs: 3000,
      },
    });
    const step = createTraceStep({
      agentRunId: runId,
      type: "tool_execution",
      status: "running",
      message: "Executing Tableau MCP",
      startedAt: "2026-01-01T00:00:00.000Z",
      metadata: {
        toolName: "tableau-mcp",
      },
      error,
    });

    expect(step).toMatchObject({
      agentRunId: runId,
      type: "tool_execution",
      status: "running",
      message: "Executing Tableau MCP",
      startedAt: "2026-01-01T00:00:00.000Z",
      metadata: {
        toolName: "tableau-mcp",
      },
      error,
    });
    expect(step.stepId).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("creates trace events with the expected shape", () => {
    const runId = createAgentRunId();
    const traceStep = createTraceStep({
      agentRunId: runId,
      type: "plan_build",
      status: "completed",
      message: "Plan built",
      startedAt: "2026-01-01T00:00:00.000Z",
      endedAt: "2026-01-01T00:00:01.000Z",
    });
    const event = createTraceEvent({
      agentRunId: runId,
      kind: "run_started",
      message: "Run started",
      severity: "info",
      runStatus: "running",
      traceStep,
      metadata: { source: "unit-test" },
      at: "2026-01-01T00:00:00.000Z",
      eventId: "trace-event-1",
    });

    expect(event).toEqual({
      agentRunId: runId,
      eventId: "trace-event-1",
      at: "2026-01-01T00:00:00.000Z",
      type: "run_started",
      kind: "run_started",
      severity: "info",
      message: "Run started",
      runStatus: "running",
      stepId: traceStep.stepId,
      stepType: "plan_build",
      stepStatus: "completed",
      traceStep,
      metadata: { source: "unit-test" },
      data: { source: "unit-test" },
    });
  });
});
