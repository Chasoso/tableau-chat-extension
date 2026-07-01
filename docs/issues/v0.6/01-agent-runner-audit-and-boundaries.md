# Agent runner audit and boundaries

## Background

The current backend still splits responsibilities across `ChatService`, `runLightweightAgentLoop`, structured orchestration, and the v0.5 Tool Layer.
Before introducing a runner abstraction, we need to map those responsibilities into clear boundaries.

## Goal

Document the current runtime responsibilities and the boundary where an `AgentRunner` wrapper should sit.

## Scope

- ChatService responsibility audit
- runLightweightAgentLoop responsibility audit
- selected_mark_explanation structured path audit
- Tool Layer boundary review
- AgentRunner insertion point

## Out of scope

- implementation of AgentRunner
- runtime behavior changes
- AgentCore implementation

## Tasks

- map the current chat flow responsibilities
- map the structured orchestration responsibilities
- identify overlap and duplication
- describe the minimum wrapper boundary

## Acceptance criteria

- the current runtime responsibilities are clearly documented
- the AgentRunner boundary is clearly described

## Validation

- docs updated only

## Related

- #00 v0.6.0 AgentCore Spike
