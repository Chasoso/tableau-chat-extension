# Define plan execution contract

## Background

v0.2 introduced fixed plans, but v0.4.0 needs a clearer execution contract so that plans can be executed without relying on the old lightweight loop shape.

## Goal

Define the contract for plan execution, including steps, budgets, tool policy, and response strategy.

## Scope

- Define a backend execution contract that fits the fixed-plan model.
- Align execution input and output with trace and budget requirements.
- Keep the contract compatible with the v0.2 fixed plan definitions.

## Out of scope

- Full execution engine implementation
- Tool registry implementation
- Broad orchestration refactors

## Tasks

- Define the execution input type.
- Define the execution result type.
- Ensure budgets and response strategy are part of the contract.
- Ensure the contract can express skipped steps, fallback, and failure.

## Acceptance criteria

- The plan execution contract is clear and minimal.
- The contract can support the `selected_mark_explanation` fixed plan.
- The contract is aligned with the existing v0.2 fixed-plan concepts.

## Validation

- Confirm the contract can be implemented without changing the current chat runtime.
- Confirm the contract gives the engine enough structure for trace-first visibility.

## Related

- [docs/v0.4-structured-orchestration-plan.md](../../v0.4-structured-orchestration-plan.md)
- [backend/src/agent/fixedPlans.ts](../../../backend/src/agent/fixedPlans.ts)
- [backend/src/agent/runner.ts](../../../backend/src/agent/runner.ts)

