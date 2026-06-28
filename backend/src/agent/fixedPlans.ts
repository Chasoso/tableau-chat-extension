import type { AgentRunBudget } from "./runner";
import type { AgentRunId } from "./runId";
import type {
  AgentIntent,
  AgentPlanStepType,
  JsonObject,
  ToolActionKind,
  ContextPack,
} from "./types";

export type FixedPlanId =
  | "current-dashboard-summary-v1"
  | "unsupported-intent-v1";

export type FixedPlanTarget =
  | "current_dashboard_summary"
  | "unsupported_intent";

export type FixedPlanContextPack = "dashboard_context";

export type FixedPlanResponseStrategy =
  | "summarize_current_context"
  | "decline_unsupported_intent";

export type FixedPlanFallbackBehavior =
  | {
      kind: "fallback_to_plan";
      planId: FixedPlanId;
      reasonBrief: string;
    }
  | {
      kind: "none";
      reasonBrief: string;
    };

export type FixedPlanToolPolicy = {
  mode: "allowlist" | "denylist";
  allowedTools: ToolActionKind[];
  disallowedTools: ToolActionKind[];
};

export type FixedPlanStep = {
  id: string;
  type: AgentPlanStepType;
  description: string;
  requiredContextPacks: FixedPlanContextPack[];
  allowedTools: ToolActionKind[];
  metadata?: JsonObject;
};

export type FixedPlan = {
  id: FixedPlanId;
  target: FixedPlanTarget;
  supportedIntents: AgentIntent["name"][];
  requiredContextPacks: FixedPlanContextPack[];
  allowedTools: ToolActionKind[];
  disallowedTools: ToolActionKind[];
  toolPolicy: FixedPlanToolPolicy;
  executionSteps: FixedPlanStep[];
  budget: AgentRunBudget;
  responseStrategy: FixedPlanResponseStrategy;
  fallbackBehavior: FixedPlanFallbackBehavior;
  metadata?: JsonObject;
};

export type FixedPlanSelection = {
  plan: FixedPlan;
  matched: boolean;
  reasonBrief: string;
  unsupportedIntent?: AgentIntent["name"];
};

export type BuildFixedPlanInput = {
  agentRunId: AgentRunId;
  intent: AgentIntent;
  contextPack: ContextPack;
  metadata?: JsonObject;
};

const EMPTY_TOOL_ALLOWLIST: ToolActionKind[] = [];
const NO_TOOL_KIND: ToolActionKind[] = [
  "tableau-mcp",
  "tableau-rest",
  "notion",
];

export const CURRENT_DASHBOARD_SUMMARY_PLAN: FixedPlan = {
  id: "current-dashboard-summary-v1",
  target: "current_dashboard_summary",
  supportedIntents: ["dashboard_explanation", "filter_or_selection_state"],
  requiredContextPacks: ["dashboard_context"],
  allowedTools: EMPTY_TOOL_ALLOWLIST,
  disallowedTools: NO_TOOL_KIND,
  toolPolicy: {
    mode: "denylist",
    allowedTools: EMPTY_TOOL_ALLOWLIST,
    disallowedTools: NO_TOOL_KIND,
  },
  executionSteps: [
    {
      id: "review-dashboard-context",
      type: "inspect_context",
      description:
        "Review the current dashboard context and summarize the current state.",
      requiredContextPacks: ["dashboard_context"],
      allowedTools: EMPTY_TOOL_ALLOWLIST,
    },
    {
      id: "compose-summary",
      type: "compose_response",
      description:
        "Compose a concise summary from the available dashboard context only.",
      requiredContextPacks: ["dashboard_context"],
      allowedTools: EMPTY_TOOL_ALLOWLIST,
      metadata: {
        responseStrategy: "summarize_current_context",
      },
    },
  ],
  budget: {
    maxModelCalls: 1,
    maxToolCalls: 0,
    timeoutMs: 15_000,
  },
  responseStrategy: "summarize_current_context",
  fallbackBehavior: {
    kind: "fallback_to_plan",
    planId: "unsupported-intent-v1",
    reasonBrief:
      "Fallback to the unsupported-intent plan when the request cannot be handled from dashboard context alone.",
  },
  metadata: {
    planFamily: "fixed",
    source: "context_pack_only",
  },
};

export const UNSUPPORTED_FIXED_PLAN: FixedPlan = {
  id: "unsupported-intent-v1",
  target: "unsupported_intent",
  supportedIntents: ["unsupported"],
  requiredContextPacks: ["dashboard_context"],
  allowedTools: EMPTY_TOOL_ALLOWLIST,
  disallowedTools: NO_TOOL_KIND,
  toolPolicy: {
    mode: "denylist",
    allowedTools: EMPTY_TOOL_ALLOWLIST,
    disallowedTools: NO_TOOL_KIND,
  },
  executionSteps: [
    {
      id: "decline-unsupported-intent",
      type: "compose_response",
      description:
        "Explain that the current fixed plan set does not support this intent yet.",
      requiredContextPacks: ["dashboard_context"],
      allowedTools: EMPTY_TOOL_ALLOWLIST,
      metadata: {
        responseStrategy: "decline_unsupported_intent",
      },
    },
  ],
  budget: {
    maxModelCalls: 0,
    maxToolCalls: 0,
    timeoutMs: 5_000,
  },
  responseStrategy: "decline_unsupported_intent",
  fallbackBehavior: {
    kind: "none",
    reasonBrief: "This is the terminal fallback plan.",
  },
  metadata: {
    planFamily: "fallback",
    source: "unsupported",
  },
};

export function buildFixedPlan(input: BuildFixedPlanInput): FixedPlanSelection {
  if (isContextOnlyIntent(input.intent)) {
    return {
      plan: cloneFixedPlan(CURRENT_DASHBOARD_SUMMARY_PLAN, input.metadata),
      matched: true,
      reasonBrief:
        "Selected the current dashboard summary plan for a context-only intent.",
    };
  }

  return {
    plan: cloneFixedPlan(UNSUPPORTED_FIXED_PLAN, input.metadata),
    matched: false,
    reasonBrief: "No fixed plan is defined for this intent yet.",
    unsupportedIntent: input.intent.name,
  };
}

function isContextOnlyIntent(intent: AgentIntent): boolean {
  return (
    intent.name === "dashboard_explanation" ||
    intent.name === "filter_or_selection_state"
  );
}

function cloneFixedPlan(plan: FixedPlan, metadata?: JsonObject): FixedPlan {
  return {
    ...plan,
    requiredContextPacks: [...plan.requiredContextPacks],
    allowedTools: [...plan.allowedTools],
    disallowedTools: [...plan.disallowedTools],
    toolPolicy: {
      mode: plan.toolPolicy.mode,
      allowedTools: [...plan.toolPolicy.allowedTools],
      disallowedTools: [...plan.toolPolicy.disallowedTools],
    },
    executionSteps: plan.executionSteps.map((step) => ({
      ...step,
      requiredContextPacks: [...step.requiredContextPacks],
      allowedTools: [...step.allowedTools],
      ...(step.metadata ? { metadata: { ...step.metadata } } : {}),
    })),
    metadata: {
      ...(plan.metadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}
