# Add trace-first orchestration events

## Background

The v0.2 trace foundation exists, but v0.4.0 needs orchestration-specific events that explain what happened during a run.

## Goal

Add trace events for intent resolution, plan selection, tool decisions, budget usage, fallback, and response composition.

## Scope

- Extend orchestration trace coverage.
- Keep the trace backend-friendly and persistence-agnostic.
- Make the trace useful for later UI debug views.

## Out of scope

- Fancy trace UI
- Full persistence redesign
- AgentCore migration

## Tasks

- Define orchestration trace event shapes.
- Record resolved intent and selected plan.
- Record tool routing decisions and skipped tools.
- Record budget usage, fallback, and errors.
- Keep the trace compatible with the existing v0.2 trace model.

## Acceptance criteria

- The backend trace can explain a structured orchestration run end to end.
- The trace remains usable without a new UI.
- The trace can be extended later for persistence and debug views.

## Validation

- Confirm the trace events are sufficient to reconstruct a basic orchestration run.
- Confirm the trace does not require replacing the current job flow immediately.

## Related

- [docs/v0.4-structured-orchestration-plan.md](../../v0.4-structured-orchestration-plan.md)
- [backend/src/agent/trace.ts](../../../backend/src/agent/trace.ts)
- [backend/src/agent/types.ts](../../../backend/src/agent/types.ts)

