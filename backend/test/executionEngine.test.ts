import { describe, expect, it } from "vitest";
import {
  buildExecutionTraceMetadata,
  createAgentRunId,
  createDefaultExecutionEngine,
  createMinimalToolRouter,
  createResolvedIntentResolution,
  createSelectedMarkExplanationPlanDefinition,
  type ExecutionInput,
  type ExecutionStepResult,
  type ToolRouter,
  type ToolRoutingResult,
} from "../src/agent";
import type { PlanDefinition, PlanStep } from "../src/agent";

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

function createPlan(overrides: Partial<PlanDefinition> = {}): PlanDefinition {
  return {
    ...createSelectedMarkExplanationPlanDefinition(),
    id: "selected_mark_explanation-v1",
    steps: [
      {
        id: "collect-context",
        type: "collect_context",
        required: true,
        description: "Collect the dashboard context snapshot.",
        outputKey: "context",
      },
      createStep(),
      {
        id: "compose-response",
        type: "compose_response",
        required: true,
        description: "Compose the response from the selected marks.",
        outputKey: "response",
      },
    ],
    ...overrides,
  };
}

function createExecutionInput(
  overrides: Partial<ExecutionInput> = {},
): ExecutionInput {
  const agentRunId = createAgentRunId();
  return {
    agentRunId,
    intentResolution: createResolvedIntentResolution({
      agentRunId,
      resolvedIntentId: "selected_mark_explanation",
      reason: "UI action requested selected mark explanation.",
    }),
    plan: createPlan(),
    contextSummary: {
      dashboardName: "Sales Overview",
      selectedMarkCount: 2,
      worksheetNames: ["Sales by Region"],
    },
    metadata: {
      source: "unit-test",
    },
    ...overrides,
  };
}

function createToolRouter(
  route: (
    input: Parameters<ToolRouter["route"]>[0],
  ) => Promise<ToolRoutingResult> | ToolRoutingResult,
): ToolRouter {
  return {
    route: async (input) => route(input),
  };
}

function createAllowedRoutingResult(
  input: Parameters<ToolRouter["route"]>[0],
): ToolRoutingResult {
  return {
    agentRunId: input.agentRunId,
    intentId: input.intentId,
    planId: input.planId,
    stepId: input.step.id,
    status: "allowed",
    toolName: input.requestedToolName ?? input.step.toolName,
    reason: "Tool is allowed.",
    warnings: [],
    preconditionStatus: "passed",
    budgetStatus: {
      exceeded: false,
      maxToolCalls: input.runBudget?.maxToolCalls,
      toolCallsUsed: input.budgetUsage?.toolCallsUsed,
    },
    traceMetadata: {
      router: "unit-test",
    },
  };
}

function createBlockedRoutingResult(
  input: Parameters<ToolRouter["route"]>[0],
  reason = "Tool is blocked.",
): ToolRoutingResult {
  return {
    agentRunId: input.agentRunId,
    intentId: input.intentId,
    planId: input.planId,
    stepId: input.step.id,
    status: "blocked",
    toolName: input.requestedToolName ?? input.step.toolName,
    reason,
    warnings: ["blocked"],
    preconditionStatus: "passed",
    budgetStatus: {
      exceeded: false,
      maxToolCalls: input.runBudget?.maxToolCalls,
      toolCallsUsed: input.budgetUsage?.toolCallsUsed,
    },
    traceMetadata: {
      router: "unit-test",
      reason,
    },
  };
}

function createSkippedRoutingResult(
  input: Parameters<ToolRouter["route"]>[0],
): ToolRoutingResult {
  return {
    agentRunId: input.agentRunId,
    intentId: input.intentId,
    planId: input.planId,
    stepId: input.step.id,
    status: "skipped",
    toolName: input.requestedToolName ?? input.step.toolName,
    reason: "Tool is skipped.",
    warnings: ["skipped"],
    preconditionStatus: "skipped",
    budgetStatus: {
      exceeded: false,
      maxToolCalls: input.runBudget?.maxToolCalls,
      toolCallsUsed: input.budgetUsage?.toolCallsUsed,
    },
    traceMetadata: {
      router: "unit-test",
      reason: "skipped",
    },
  };
}

function expectStepStatuses(
  stepResults: ExecutionStepResult[],
  statuses: Array<ExecutionStepResult["status"]>,
) {
  expect(stepResults.map((step) => step.status)).toEqual(statuses);
}

describe("MinimalExecutionEngine", () => {
  it("processes plan steps in order and routes tool steps", async () => {
    const routeCalls: Array<Parameters<ToolRouter["route"]>[0]> = [];
    const router = createToolRouter(async (input) => {
      routeCalls.push(input);
      return createAllowedRoutingResult(input);
    });
    const engine = createDefaultExecutionEngine({ toolRouter: router });

    const result = await engine.execute(createExecutionInput());

    expect(routeCalls).toHaveLength(1);
    expect(routeCalls[0].step.id).toBe("route-tool");
    expect(result.planId).toBe("selected_mark_explanation-v1");
    expect(result.intentId).toBe("selected_mark_explanation");
    expectStepStatuses(result.stepResults, [
      "not_executed",
      "routed",
      "not_executed",
    ]);
    expect(result.executedSteps).toEqual(["route-tool"]);
    expect(result.status).toBe("partial");
  });

  it("handles an empty plan safely", async () => {
    const engine = createDefaultExecutionEngine();

    const result = await engine.execute(
      createExecutionInput({
        plan: createPlan({ steps: [] }),
      }),
    );

    expect(result.status).toBe("skipped");
    expect(result.stepResults).toEqual([]);
    expect(result.executedSteps).toEqual([]);
    expect(result.skippedSteps).toEqual([]);
    expect(result.blockedSteps).toEqual([]);
  });

  it("keeps running when an optional tool step is skipped", async () => {
    const routeCalls: Array<Parameters<ToolRouter["route"]>[0]> = [];
    const router = createToolRouter(async (input) => {
      routeCalls.push(input);
      return createSkippedRoutingResult(input);
    });
    const engine = createDefaultExecutionEngine({ toolRouter: router });

    const result = await engine.execute(
      createExecutionInput({
        plan: createPlan({
          steps: [
            createStep({ id: "optional-tool", required: false }),
            {
              id: "compose-response",
              type: "compose_response",
              required: true,
              outputKey: "response",
            },
          ],
        }),
      }),
    );

    expect(routeCalls).toHaveLength(1);
    expect(result.stepResults[0].status).toBe("skipped");
    expect(result.stepResults[1].status).toBe("not_executed");
    expect(result.status).toBe("partial");
  });

  it("fails when a required tool step is blocked", async () => {
    const router = createToolRouter(async (input) =>
      createBlockedRoutingResult(input),
    );
    const engine = createDefaultExecutionEngine({ toolRouter: router });

    const result = await engine.execute(
      createExecutionInput({
        plan: createPlan({
          steps: [
            createStep({ id: "required-tool", required: true }),
            {
              id: "compose-response",
              type: "compose_response",
              required: true,
              outputKey: "response",
            },
          ],
        }),
      }),
    );

    expect(result.status).toBe("failed");
    expect(result.blockedSteps).toEqual(["required-tool"]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].stepId).toBe("required-tool");
  });

  it("marks a routed step and keeps router metadata", async () => {
    const router = createToolRouter(async (input) =>
      createAllowedRoutingResult(input),
    );
    const engine = createDefaultExecutionEngine({ toolRouter: router });

    const result = await engine.execute(createExecutionInput());
    const routedStep = result.stepResults.find(
      (step) => step.stepId === "route-tool",
    );

    expect(routedStep?.status).toBe("routed");
    expect(routedStep?.routingStatus).toBe("allowed");
    expect(routedStep?.traceMetadata).toEqual({ router: "unit-test" });
  });

  it("includes budget usage and trace metadata", async () => {
    const engine = createDefaultExecutionEngine();
    const result = await engine.execute(createExecutionInput());
    const traceMetadata = buildExecutionTraceMetadata(result);

    expect(result.budgetUsage.maxToolCalls).toBe(0);
    expect(result.budgetUsage.maxModelCalls).toBe(1);
    expect(result.budgetUsage.timeoutMs).toBe(15_000);
    expect(traceMetadata.planId).toBe("selected_mark_explanation-v1");
    expect(traceMetadata.intentId).toBe("selected_mark_explanation");
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect(JSON.parse(JSON.stringify(traceMetadata))).toEqual(traceMetadata);
  });

  it("processes the selected_mark_explanation plan skeleton safely", async () => {
    const engine = createDefaultExecutionEngine();

    const result = await engine.execute(
      createExecutionInput({
        plan: createSelectedMarkExplanationPlanDefinition(),
      }),
    );

    expect(result.planId).toBe("selected_mark_explanation-v1");
    expect(result.stepResults).toHaveLength(3);
    expect(
      result.stepResults.every((step) => step.status === "not_executed"),
    ).toBe(true);
    expect(result.status).toBe("partial");
  });

  it("blocks when the tool budget is exceeded", async () => {
    const router = createMinimalToolRouter();
    const engine = createDefaultExecutionEngine({ toolRouter: router });

    const result = await engine.execute(
      createExecutionInput({
        initialBudget: {
          maxToolCalls: 0,
        },
      }),
    );

    expect(result.status).toBe("failed");
    expect(result.blockedSteps).toContain("route-tool");
  });

  it("remains JSON-safe for the full execution result", async () => {
    const engine = createDefaultExecutionEngine();
    const result = await engine.execute(createExecutionInput());

    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });
});
