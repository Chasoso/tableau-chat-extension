# Add ExecutionEngine skeleton

## Background

The current backend has a hand-shaped loop for agent execution.

v0.4.0 needs a minimal execution engine that can execute a fixed plan while reporting trace and budget usage.

## Goal

Add the smallest useful `ExecutionEngine` skeleton for the selected-mark explanation path.

## Scope

- Define the execution engine shape.
- Execute a fixed plan in a controlled step sequence.
- Track budget usage and trace events.
- Stop safely on errors, timeout, or budget exhaustion.

## Out of scope

- Full multi-intent engine
- Full recovery and retry policies
- AgentCore migration

## Tasks

- Define the engine inputs and outputs.
- Define how steps are executed and reported.
- Ensure the engine can surface fallback and error states.
- Add tests for the selected-mark fixed-plan path.

## Acceptance criteria

- The execution engine can run the minimal fixed plan.
- Trace and budget usage are visible.
- The engine stays separate from plan selection and response composition.

## Validation

- Unit tests cover a successful run and a bounded failure path.
- The engine does not replace the existing chat flow yet.

## Related

- [docs/v0.4-structured-orchestration-plan.md](../../v0.4-structured-orchestration-plan.md)
- [docs/issues/v0.4/04-define-plan-execution-contract.md](./04-define-plan-execution-contract.md)
- [backend/src/agent/runner.ts](../../../backend/src/agent/runner.ts)

