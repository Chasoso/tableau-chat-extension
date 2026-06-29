# Orchestration audit and boundaries

## Background

The current backend still routes most user questions through `ChatService` and `runLightweightAgentLoop`.

Before we add new orchestration logic, we need a clean boundary document that explains:

- what the current flow does
- what `ChatService` owns
- what `runLightweightAgentLoop` owns
- where the new orchestrator will begin and end

## Goal

Document the current backend orchestration state and define the migration boundaries for v0.4.0.

## Scope

- Audit the current backend agent and chat service responsibilities.
- Document the migration boundary from the existing flow to the v0.4 orchestration layer.
- Clarify how `AgentRunner`, fixed plans, and trace fit into the new path.

## Out of scope

- Changing the chat runtime behavior
- Implementing intent resolution
- Implementing plan execution
- Connecting the frontend action to the backend

## Tasks

- Review `ChatService`, `runLightweightAgentLoop`, `LambdaAgentRunner`, and the current fixed-plan types.
- Document which responsibilities remain in the legacy flow.
- Document which responsibilities move to the new orchestration layer.
- Write the migration boundary in a form that later implementation PRs can reference.

## Acceptance criteria

- The current backend flow is clearly documented.
- The v0.4 orchestration boundary is explicit.
- The document makes it clear that the existing chat path remains supported during migration.

## Validation

- Confirm the audit covers the current backend entry points and trace flow.
- Confirm the boundary is specific enough to guide later implementation issues.

## Related

- [docs/v0.4-structured-orchestration-plan.md](../../v0.4-structured-orchestration-plan.md)
- [backend/src/services/chatService.ts](../../../backend/src/services/chatService.ts)
- [backend/src/services/chatAgent.ts](../../../backend/src/services/chatAgent.ts)
- [backend/src/agent/index.ts](../../../backend/src/agent/index.ts)

