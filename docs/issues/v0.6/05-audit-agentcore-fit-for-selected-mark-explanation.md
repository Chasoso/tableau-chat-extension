# Audit AgentCore fit for selected_mark_explanation

## Background

`selected_mark_explanation` is the first concrete comparison path for the v0.6 AgentCore spike, but it is already a deterministic, context-heavy flow with a working Lambda runner wrapper. Before any AgentCore implementation is started, we should document whether AgentCore is actually a good fit for this path.

## Goal

Assess whether AgentCore is worth introducing for `selected_mark_explanation`, and identify what should remain custom in the current Lambda-backed architecture.

## Scope

- selected_mark_explanation fit analysis
- current LambdaAgentRunner vs intended AgentCore shape comparison
- observability comparison
- latency / timeout comparison
- operational trade-off analysis
- custom responsibility boundaries
- risk and constraint recording

## Out of scope

- AgentCore implementation
- AgentCoreRunner implementation
- AgentRunner implementation
- selected_mark_explanation route changes
- free-form chat migration
- Tableau MCP tool migration
- LLM ResponseComposer implementation

## Tasks

- compare the current LambdaAgentRunner path with an intended AgentCore path
- identify what should remain custom
- identify what AgentCore may improve
- record risks and constraints
- determine the recommended next step

## Acceptance criteria

- a written fit assessment exists
- the assessment is specific to `selected_mark_explanation`
- the assessment can inform the next implementation step

## Validation

- docs only

## Related

- [AgentCore Fit Assessment for selected_mark_explanation](../../v0.6-agentcore-fit-selected-mark-explanation.md)
- #99 v0.6.0 AgentCore Spike
- #100 Agent runner audit and boundaries
- #101 Define AgentRunner contract
- #102 Add LambdaAgentRunner skeleton
- #103 Route selected_mark_explanation through LambdaAgentRunner
