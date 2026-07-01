# Audit AgentCore fit for selected_mark_explanation

## Background

selected_mark_explanation is the first path intended for AgentCore comparison, but it should be audited before any implementation work begins.

## Goal

Determine whether AgentCore is a good fit for selected_mark_explanation and what remains custom.

## Scope

- selected_mark_explanation fit analysis
- observability comparison
- latency and timeout comparison
- operational trade-off analysis

## Out of scope

- AgentCore implementation
- AgentRunner implementation

## Tasks

- compare the current runtime with the intended AgentCore shape
- identify what should remain custom
- record risks and constraints

## Acceptance criteria

- a written fit assessment exists
- the decision can inform the next implementation step

## Validation

- docs only

## Related

- #00 v0.6.0 AgentCore Spike
