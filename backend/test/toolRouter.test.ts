import { describe, expect, it } from "vitest";
import {
  buildToolRoutingTraceMetadata,
  createAgentRunId,
  InMemoryToolRegistry,
  createMinimalToolRouter,
  createSelectedMarkExplanationPlanDefinition,
  createUnsupportedPlanDefinition,
  type ToolRoutingInput,
  type ToolRoutingPreconditionResult,
  type ToolRoutingResult,
  type ToolDefinition,
} from "../src/agent";
import type { PlanStep } from "../src/agent";
import type { ContextPack } from "../src/agent";
import type { DashboardContext } from "../src/types/tableau";

function createDashboardContext(selectedMarkCount = 2): DashboardContext {
  return {
    dashboardName: "Sales Overview",
    worksheets: [{ name: "Sales by Region" }],
    filters: [],
    parameters: [],
    selectedMarks:
      selectedMarkCount > 0
        ? Array.from({ length: selectedMarkCount }, (_, index) => ({
            worksheetName: "Sales by Region",
            columns: ["Region", "Sales"],
            rowCount: index + 1,
          }))
        : [],
    capturedAt: "2026-01-01T00:00:00.000Z",
  };
}

function createContextPack(selectedMarkCount = 2): ContextPack {
  return {
    agentRunId: createAgentRunId(),
    createdAt: "2026-01-01T00:00:00.000Z",
    question: "Explain this selection.",
    dashboardContext: createDashboardContext(selectedMarkCount),
  };
}

function createStep(overrides: Partial<PlanStep> = {}): PlanStep {
  return {
    id: "route-tool",
    type: "call_tool",
    required: true,
    description: "Route a tool call.",
    toolName: "context.selectedMarks",
    outputKey: "toolResult",
    onFailure: "fail",
    ...overrides,
  };
}

function createPreconditionResult(
  overrides: Partial<ToolRoutingPreconditionResult> = {},
): ToolRoutingPreconditionResult {
  return {
    id: "requires_selected_marks",
    type: "requires_selected_marks",
    required: true,
    status: "passed",
    reasonBrief: "Selected marks are available.",
    ...overrides,
  };
}

function createContextToolDefinition(
  overrides: Partial<ToolDefinition> = {},
): ToolDefinition {
  return {
    name: "context.selectedMarks",
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
    inputSchema: { kind: "none" },
    outputSchema: { kind: "typescript_contract" },
    version: "v1",
    ...overrides,
  };
}

function createUnsafeContextToolDefinition(
  overrides: Partial<ToolDefinition> = {},
): ToolDefinition {
  return {
    name: "context.summaryDataPreview",
    description: "Reads summary data preview references from context.",
    category: "context",
    capabilities: ["read_context", "read_summary_data"],
    safety: {
      level: "read_only",
      safeForPreview: false,
      requiresExplicitAction: false,
      externalAccess: false,
      mayAccessSummaryData: true,
    },
    availability: { status: "available" },
    inputSchema: { kind: "none" },
    outputSchema: { kind: "typescript_contract" },
    version: "v1",
    ...overrides,
  };
}

function createInput(
  overrides: Partial<ToolRoutingInput> = {},
): ToolRoutingInput {
  const contextPack = createContextPack();
  return {
    agentRunId: contextPack.agentRunId,
    intentId: "selected_mark_explanation",
    planId: "selected_mark_explanation-v1",
    step: createStep(),
    requestedToolName: "context.selectedMarks",
    allowedTools: ["context.selectedMarks", "context.summaryDataPreview"],
    disallowedTools: [],
    toolPolicy: {
      mode: "allowlist",
      allowedTools: ["context.selectedMarks", "context.summaryDataPreview"],
      disallowedTools: [],
    },
    runBudget: {
      maxModelCalls: 1,
      maxToolCalls: 1,
      timeoutMs: 15_000,
    },
    budgetUsage: {
      toolCallsUsed: 0,
      modelCallsUsed: 0,
    },
    contextSummary: {
      dashboardName: contextPack.dashboardContext.dashboardName,
      worksheetNames: contextPack.dashboardContext.worksheets.map(
        (worksheet) => worksheet.name,
      ),
      selectedMarkCount:
        contextPack.dashboardContext.selectedMarks?.length ?? 0,
      hasSelectedMarks:
        (contextPack.dashboardContext.selectedMarks?.length ?? 0) > 0,
      contextPackIds: ["dashboard_context", "selected_marks"],
    },
    preconditions: [createPreconditionResult()],
    metadata: {
      source: "unit-test",
    },
    ...overrides,
  };
}

function expectRoutingResultShape(result: ToolRoutingResult) {
  expect(result.agentRunId).toBeTruthy();
  expect(result.reason).toBeTruthy();
  expect(Array.isArray(result.warnings)).toBe(true);
  expect(JSON.parse(JSON.stringify(result))).toEqual(result);
}

describe("MinimalToolRouter", () => {
  it("allows a requested tool that is in the allowlist", async () => {
    const router = createMinimalToolRouter();
    const result = await router.route(createInput());

    expect(result.status).toBe("allowed");
    expect(result.toolName).toBe("context.selectedMarks");
    expect(result.reason).toContain("allowed");
    expectRoutingResultShape(result);
  });

  it("blocks a tool that is not in the allowlist", async () => {
    const router = createMinimalToolRouter();
    const result = await router.route(
      createInput({
        requestedToolName: "context.unlistedTool",
      }),
    );

    expect(result.status).toBe("blocked");
    expect(result.reason).toContain("allowlist");
    expect(result.warnings).toContain("tool_not_allowlisted");
    expectRoutingResultShape(result);
  });

  it("blocks a tool that is in the disallowlist", async () => {
    const router = createMinimalToolRouter();
    const result = await router.route(
      createInput({
        allowedTools: ["context.selectedMarks", "context.summaryDataPreview"],
        disallowedTools: ["context.summaryDataPreview"],
        toolPolicy: {
          mode: "denylist",
          allowedTools: ["context.selectedMarks", "context.summaryDataPreview"],
          disallowedTools: ["context.summaryDataPreview"],
        },
        requestedToolName: "context.summaryDataPreview",
      }),
    );

    expect(result.status).toBe("blocked");
    expect(result.reason).toContain("disallowed");
    expect(result.warnings).toContain("tool_disallowed");
    expectRoutingResultShape(result);
  });

  it("skips an optional step with no requested tool", async () => {
    const router = createMinimalToolRouter();
    const result = await router.route(
      createInput({
        step: createStep({ required: false, toolName: undefined }),
        requestedToolName: undefined,
      }),
    );

    expect(result.status).toBe("skipped");
    expect(result.reason).toContain("optional step");
    expectRoutingResultShape(result);
  });

  it("marks a required step without a requested tool as unavailable", async () => {
    const router = createMinimalToolRouter();
    const result = await router.route(
      createInput({
        step: createStep({ required: true, toolName: undefined }),
        requestedToolName: undefined,
      }),
    );

    expect(result.status).toBe("unavailable");
    expect(result.reason).toContain("required tool");
    expectRoutingResultShape(result);
  });

  it("blocks when the tool budget is exceeded", async () => {
    const router = createMinimalToolRouter();
    const result = await router.route(
      createInput({
        budgetUsage: {
          toolCallsUsed: 1,
        },
      }),
    );

    expect(result.status).toBe("blocked");
    expect(result.reason).toContain("budget");
    expect(result.budgetStatus.exceeded).toBe(true);
    expect(result.warnings).toContain("tool_budget_exceeded");
  });

  it("blocks or skips when a precondition has failed", async () => {
    const router = createMinimalToolRouter();
    const blocked = await router.route(
      createInput({
        step: createStep({ required: true }),
        preconditions: [createPreconditionResult({ status: "failed" })],
      }),
    );
    const skipped = await router.route(
      createInput({
        step: createStep({ required: false }),
        preconditions: [createPreconditionResult({ status: "failed" })],
      }),
    );

    expect(blocked.status).toBe("blocked");
    expect(skipped.status).toBe("skipped");
    expect(blocked.warnings).toContain("precondition_failed");
    expect(skipped.warnings).toContain("precondition_failed");
  });

  it("includes trace metadata and stays JSON-safe", async () => {
    const router = createMinimalToolRouter();
    const result = await router.route(createInput());
    const traceMetadata = buildToolRoutingTraceMetadata(result);

    expect(traceMetadata.planId).toBe("selected_mark_explanation-v1");
    expect(traceMetadata.status).toBe("allowed");
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect(JSON.parse(JSON.stringify(traceMetadata))).toEqual(traceMetadata);
  });

  it("uses registry lookup when available and allows context pseudo tools", async () => {
    const registry = new InMemoryToolRegistry([
      createContextToolDefinition(),
      createUnsafeContextToolDefinition(),
    ]);
    const router = createMinimalToolRouter({ registry });

    const selectedMarksResult = await router.route(createInput());
    const summaryPreviewResult = await router.route(
      createInput({
        requestedToolName: "context.summaryDataPreview",
        step: createStep({
          toolName: "context.summaryDataPreview",
        }),
      }),
    );

    expect(selectedMarksResult.status).toBe("allowed");
    expect(selectedMarksResult.traceMetadata?.registryLookup).toMatchObject({
      lookupStatus: "found",
      toolName: "context.selectedMarks",
    });
    expect(summaryPreviewResult.status).toBe("allowed");
    expect(summaryPreviewResult.traceMetadata?.registryLookup).toMatchObject({
      lookupStatus: "found",
      toolName: "context.summaryDataPreview",
    });
    expect(JSON.parse(JSON.stringify(selectedMarksResult))).toEqual(
      selectedMarksResult,
    );
  });

  it("maps registry lookup statuses to routing statuses", async () => {
    const registry = new InMemoryToolRegistry([
      createContextToolDefinition(),
      createUnsafeContextToolDefinition({
        availability: { status: "unavailable", reason: "Preview is disabled." },
      }),
    ]);
    const router = createMinimalToolRouter({ registry });

    const missing = await router.route(
      createInput({
        requestedToolName: "context.filters",
        step: createStep({ toolName: "context.filters" }),
      }),
    );
    const unavailable = await router.route(
      createInput({
        requestedToolName: "context.summaryDataPreview",
        step: createStep({ toolName: "context.summaryDataPreview" }),
      }),
    );
    const blocked = await router.route(
      createInput({
        allowedTools: ["context.selectedMarks"],
        disallowedTools: ["context.selectedMarks"],
        toolPolicy: {
          mode: "denylist",
          allowedTools: ["context.selectedMarks"],
          disallowedTools: ["context.selectedMarks"],
        },
        requestedToolName: "context.selectedMarks",
        step: createStep({ toolName: "context.selectedMarks" }),
      }),
    );

    expect(missing.status).toBe("unavailable");
    expect(missing.reason).toContain("missing");
    expect(unavailable.status).toBe("unavailable");
    expect(unavailable.reason).toContain("unavailable");
    expect(blocked.status).toBe("blocked");
    expect(blocked.reason).toContain("disallowed");
  });

  it("blocks unsafe preview tools when safeForPreviewOnly is requested", async () => {
    const registry = new InMemoryToolRegistry([
      createUnsafeContextToolDefinition(),
    ]);
    const router = createMinimalToolRouter({ registry });

    const result = await router.route(
      createInput({
        requestedToolName: "context.summaryDataPreview",
        step: createStep({ toolName: "context.summaryDataPreview" }),
        toolPolicy: {
          mode: "allowlist",
          allowedTools: ["context.summaryDataPreview"],
          disallowedTools: [],
          safeForPreviewOnly: true,
        },
      }),
    );

    expect(result.status).toBe("blocked");
    expect(result.reason).toContain("preview");
    expect(result.traceMetadata?.registryLookup).toMatchObject({
      lookupStatus: "disallowed",
      toolName: "context.summaryDataPreview",
    });
  });

  it("does not execute any tools or call orchestration services", async () => {
    const router = createMinimalToolRouter();
    const result = await router.route(createInput());

    expect(result.status).toBe("allowed");
    expect(createSelectedMarkExplanationPlanDefinition().id).toBe(
      "selected_mark_explanation-v1",
    );
    expect(createUnsupportedPlanDefinition().id).toBe("unsupported-intent-v1");
  });
});
