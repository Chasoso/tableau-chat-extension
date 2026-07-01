# Define AgentRunner comparison metrics

## Background

`LambdaAgentRunner` is already the current baseline for `selected_mark_explanation`, and `AgentCoreRunner` is the future candidate to compare against it.

Before any runtime decisions are made, we need explicit metrics so the two runners can be evaluated consistently.

## Goal

Define the comparison metrics and comparison note format that will be used to evaluate `LambdaAgentRunner` and `AgentCoreRunner`.

## Scope

- latency metrics
- timeout metrics
- failure metrics
- trace completeness metrics
- observability usefulness metrics
- implementation complexity metrics
- local testability metrics
- cost estimate metrics
- debugging effort metrics
- selected_mark_explanation consistency metrics
- comparison notes format
- comparison scenarios
- decision thresholds

## Out of scope

- runner implementation
- AgentCoreRunner implementation
- AgentCore implementation
- benchmarking infrastructure
- metrics collection code
- comparison dashboard
- selected_mark_explanation route changes
- free-form chat migration
- Tableau MCP migration
- LLM ResponseComposer implementation

## Tasks

- define measurable comparison metrics
- define selected_mark_explanation scenarios
- define a comparison notes template
- define decision thresholds for #109

## Acceptance criteria

- the metrics are explicit and measurable
- the metrics are suitable for comparing LambdaAgentRunner and AgentCoreRunner
- the metrics are suitable for writing the #109 decision record

## Validation

- docs only

## Related

- [AgentRunner Comparison Metrics](../../v0.6-agent-runner-comparison-metrics.md)
- #99 v0.6.0 AgentCore Spike
- #100 Agent runner audit and boundaries
- #101 Define AgentRunner contract
- #102 Add LambdaAgentRunner skeleton
- #103 Route selected_mark_explanation through LambdaAgentRunner
- #104 Audit AgentCore fit for selected_mark_explanation
- #105 Define AgentCoreRunner design
