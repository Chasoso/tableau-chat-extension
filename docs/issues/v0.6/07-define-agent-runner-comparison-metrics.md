# Define AgentRunner comparison metrics

## Background

AgentCore should be evaluated against the current Lambda runtime using consistent metrics.

## Goal

Define the comparison metrics for LambdaAgentRunner and AgentCoreRunner.

## Scope

- latency
- timeout rate
- failure rate
- trace completeness
- observability usefulness
- implementation complexity
- local testability
- cost estimate
- debugging effort
- selected_mark_explanation consistency

## Out of scope

- runner implementation
- benchmarking infrastructure

## Tasks

- define the metrics
- define the comparison notes format
- align metrics with selected_mark_explanation

## Acceptance criteria

- the metrics are explicit and measurable

## Validation

- docs only

## Related

- #00 v0.6.0 AgentCore Spike
