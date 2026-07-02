# Define Tableau MCP tool-layer next step

## Background

Tableau MCP migration was intentionally deferred during v0.5.0.

Before any implementation work begins, we need a documented next step that identifies the smallest safe migration unit and the right scope boundary.

## Goal

Define the next Tableau MCP Tool Layer step, including registration strategy, schema boundaries, and whether the work belongs in v0.6 or later.

## Scope

- Tableau MCP tool family audit
- tool registration strategy
- input / output schema boundaries
- precondition boundaries
- smallest migration unit candidates
- v0.6 or later decision
- relationship with AgentRunner and AgentCoreRunner

## Out of scope

- Tableau MCP implementation
- Tableau MCP tool registration implementation
- Tableau MCP execution through ToolExecutionWrapper
- AgentCore implementation
- AgentCoreRunner implementation
- selected_mark_explanation route changes
- free-form chat migration
- LLM ResponseComposer implementation

## Tasks

- identify the smallest migration unit
- decide whether the work belongs in v0.6 or later
- document the relation to AgentRunner and AgentCoreRunner

## Acceptance criteria

- a next-step plan is documented
- the plan is small enough to be actionable

## Validation

- docs only

## Related

- [Tableau MCP Tool Layer Next Step](../../v0.6-tableau-mcp-tool-layer-next-step.md)
- #99 v0.6.0 AgentCore Spike
- #100 Agent runner audit and boundaries
- #101 Define AgentRunner contract
- #102 Add LambdaAgentRunner skeleton
- #103 Route selected_mark_explanation through LambdaAgentRunner
- #104 Audit AgentCore fit for selected_mark_explanation
- #105 Define AgentCoreRunner design
- #106 Define AgentRunner comparison metrics
