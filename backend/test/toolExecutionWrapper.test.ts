import { describe, expect, it, vi } from "vitest";
import {
  buildToolExecutionTraceMetadata,
  createAgentRunId,
  createDefaultToolExecutionWrapper,
  createMinimalToolExecutionWrapper,
  type ToolDefinition,
  type ToolExecutionInput,
} from "../src/agent";

function createToolDefinition(name = "context.selectedMarks"): ToolDefinition {
  return {
    name,
    description: "Reads selected mark summaries from orchestration context.",
    category: "context",
    capabilities: ["read_context", "read_selected_marks"],
    safety: {
      level: "read_only",
      safeForPreview: true,
      requiresExplicitAction: false,
      externalAccess: false,
      mayAccessWorkbookContext: true,
      mayAccessSelectedMarks: true,
    },
    availability: { status: "available" },
    inputSchema: { kind: "typescript_contract" },
    outputSchema: { kind: "typescript_contract" },
    version: "v1",
    metadata: {
      source: "context_preview",
    },
    traceMetadata: {
      toolKind: name,
    },
  };
}

function createInput(
  overrides: Partial<ToolExecutionInput> = {},
): ToolExecutionInput {
  const agentRunId = createAgentRunId();
  return {
    agentRunId,
    toolName: "context.selectedMarks",
    tool: createToolDefinition(),
    input: {
      contextKey: "selectedMarks",
    },
    context: {
      selectedMarkCount: 2,
      worksheetNames: ["Sales by Region"],
    },
    timeoutMs: 25,
    budget: {
      maxToolCalls: 2,
      timeoutMs: 25,
    },
    budgetUsage: {
      toolCallsUsed: 1,
    },
    preconditionResults: [
      {
        id: "selected_marks.required",
        type: "requires_selected_marks",
        required: true,
        status: "passed",
      },
    ],
    routingResult: {
      agentRunId,
      intentId: "selected_mark_explanation",
      planId: "selected_mark_explanation-v1",
      stepId: "route-tool",
      status: "allowed",
      toolName: "context.selectedMarks",
      reason: "Tool is allowed.",
      warnings: [],
      preconditionStatus: "passed",
      budgetStatus: {
        exceeded: false,
        maxToolCalls: 2,
        toolCallsUsed: 1,
      },
      traceMetadata: {
        router: "unit-test",
      },
    },
    metadata: {
      source: "unit-test",
    },
    traceMetadata: {
      trace: "unit-test",
    },
    ...overrides,
  };
}

describe("MinimalToolExecutionWrapper", () => {
  it("executes a handler and normalizes the output to JSON-safe data", async () => {
    const handler = vi.fn(async () => {
      const output: Record<string, unknown> = {
        when: new Date("2026-01-01T00:00:00.000Z"),
        count: 2n,
        transform: () => "ignored",
        error: new Error("boom"),
      };
      output.self = output;
      return output;
    });
    const wrapper = createDefaultToolExecutionWrapper({
      handlers: {
        "context.selectedMarks": handler,
      },
    });

    const result = await wrapper.execute(createInput());

    expect(handler).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("completed");
    expect(result.toolName).toBe("context.selectedMarks");
    expect(result.budgetUsage.toolCallsUsed).toBe(2);
    expect(result.jsonSafe).toBe(true);
    expect(result.normalization.truncated).toBe(true);
    expect(result.normalizedOutput).toMatchObject({
      when: "2026-01-01T00:00:00.000Z",
      count: "2",
      transform: "[Function]",
      error: {
        name: "Error",
        message: "boom",
      },
      self: "[Circular]",
    });
    expect(JSON.stringify(result)).toContain("context.selectedMarks");
  });

  it("returns a blocked result when a handler is missing", async () => {
    const wrapper = createMinimalToolExecutionWrapper();
    const result = await wrapper.execute(createInput());

    expect(result.status).toBe("blocked");
    expect(result.reason).toContain("handler");
    expect(result.warnings).toContain("missing_tool_handler");
    expect(result.budgetUsage.toolCallsUsed).toBe(1);
  });

  it("returns a failed result when the handler throws", async () => {
    const wrapper = createDefaultToolExecutionWrapper({
      handlers: {
        "context.selectedMarks": vi.fn(() => {
          throw new Error("handler failed");
        }),
      },
    });

    const result = await wrapper.execute(createInput());

    expect(result.status).toBe("failed");
    expect(result.error?.message).toBe("handler failed");
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it("returns a timed_out result when the handler exceeds the timeout", async () => {
    const wrapper = createDefaultToolExecutionWrapper({
      handlers: {
        "context.selectedMarks": async () => {
          await new Promise((resolve) => setTimeout(resolve, 25));
          return { ok: true };
        },
      },
    });

    const result = await wrapper.execute(
      createInput({
        timeoutMs: 1,
        budget: {
          maxToolCalls: 2,
          timeoutMs: 1,
        },
      }),
    );

    expect(result.status).toBe("timed_out");
    expect(result.reason).toContain("timeout");
    expect(result.error?.name).toBe("ToolExecutionTimeoutError");
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it("blocks execution when a required precondition fails", async () => {
    const handler = vi.fn(async () => ({ ok: true }));
    const wrapper = createDefaultToolExecutionWrapper({
      handlers: {
        "context.selectedMarks": handler,
      },
    });

    const result = await wrapper.execute(
      createInput({
        preconditionResults: [
          {
            id: "selected_marks.required",
            type: "requires_selected_marks",
            required: true,
            status: "failed",
            reason: "Selected marks are required.",
          },
        ],
      }),
    );

    expect(result.status).toBe("blocked");
    expect(handler).not.toHaveBeenCalled();
    expect(result.reason).toContain("Selected marks");
  });

  it("continues when only optional preconditions are skipped", async () => {
    const handler = vi.fn(async () => ({ ok: true }));
    const wrapper = createDefaultToolExecutionWrapper({
      handlers: {
        "context.selectedMarks": handler,
      },
    });

    const result = await wrapper.execute(
      createInput({
        preconditionResults: [
          {
            id: "summary_data.optional",
            type: "requires_summary_data",
            required: false,
            status: "skipped",
            reason: "Summary data preview is unavailable.",
          },
        ],
      }),
    );

    expect(result.status).toBe("completed");
    expect(handler).toHaveBeenCalledTimes(1);
    expect(result.warnings).toContain("optional_tool_precondition_skipped");
  });

  it("blocks when the tool budget is exhausted", async () => {
    const handler = vi.fn(async () => ({ ok: true }));
    const wrapper = createDefaultToolExecutionWrapper({
      handlers: {
        "context.selectedMarks": handler,
      },
    });

    const result = await wrapper.execute(
      createInput({
        budgetUsage: {
          toolCallsUsed: 2,
        },
      }),
    );

    expect(result.status).toBe("blocked");
    expect(handler).not.toHaveBeenCalled();
    expect(result.reason).toContain("budget");
  });

  it("normalizes large outputs and exposes truncation metadata", async () => {
    const wrapper = createDefaultToolExecutionWrapper({
      handlers: {
        "context.selectedMarks": async () =>
          Array.from({ length: 50 }, (_, index) => ({
            id: index,
            label: `row-${index}`,
          })),
      },
      maxOutputEntries: 4,
    });

    const result = await wrapper.execute(createInput());

    expect(result.status).toBe("completed");
    expect(result.jsonSafe).toBe(true);
    expect(result.normalization.truncated).toBe(true);
    expect(JSON.stringify(result)).toContain("[Truncated]");
  });

  it("keeps trace metadata compact and JSON-safe", async () => {
    const wrapper = createDefaultToolExecutionWrapper({
      handlers: {
        "context.summaryDataPreview": async () => ({
          rowCount: 3,
          columnNames: ["Region", "Sales"],
          previewRows: [
            { Region: "West", Sales: 100 },
            { Region: "East", Sales: 200 },
          ],
        }),
      },
    });

    const result = await wrapper.execute(
      createInput({
        toolName: "context.summaryDataPreview",
        tool: createToolDefinition("context.summaryDataPreview"),
        routingResult: {
          agentRunId: createAgentRunId(),
          intentId: "selected_mark_explanation",
          planId: "selected_mark_explanation-v1",
          stepId: "route-summary",
          status: "allowed",
          toolName: "context.summaryDataPreview",
          reason: "Tool is allowed.",
          warnings: [],
          preconditionStatus: "passed",
          budgetStatus: {
            exceeded: false,
            maxToolCalls: 2,
            toolCallsUsed: 1,
          },
          traceMetadata: {
            router: "unit-test",
          },
        },
      }),
    );

    const traceMetadata = buildToolExecutionTraceMetadata(result);

    expect(traceMetadata.toolName).toBe("context.summaryDataPreview");
    expect(traceMetadata.status).toBe("completed");
    expect(JSON.stringify(traceMetadata)).toEqual(
      JSON.stringify(traceMetadata),
    );
    expect(JSON.stringify(traceMetadata)).not.toContain("previewRows");
  });
});
