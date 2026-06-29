# Add ToolRouter skeleton

## Background

v0.4.0 should separate tool selection from plan selection.

We do not need the full tool registry yet, but we do need a skeleton that can explain which tools are allowed, skipped, or blocked by policy.

## Goal

Add the minimal `ToolRouter` skeleton that can represent tool eligibility and precondition outcomes.

## Scope

- Define the minimal router contract.
- Represent allowed, skipped, and blocked tool decisions.
- Keep the router compatible with fixed plan tool policy.

## Out of scope

- Full tool registry
- New Tableau MCP abstraction
- Tool schema design for v0.5.0

## Tasks

- Define the router input and output types.
- Model a skipped tool result and a precondition failure result.
- Keep the skeleton small enough to plug into the execution engine later.

## Acceptance criteria

- The router contract can represent tool allow/deny decisions.
- The router does not require a full registry implementation.
- The router can be used by the minimal execution path.

## Validation

- Confirm the skeleton is enough for trace-first logging.
- Confirm it does not require immediate changes to existing tool providers.

## Related

- [docs/v0.4-structured-orchestration-plan.md](../../v0.4-structured-orchestration-plan.md)
- [backend/src/agent/fixedPlans.ts](../../../backend/src/agent/fixedPlans.ts)

