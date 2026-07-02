# Define LLM ResponseComposer next step

## Background

The current `ResponseComposer` is deterministic and placeholder-only. Before any LLM-based composer is introduced, we need a documented next step that defines the boundary between deterministic baseline behavior and optional generated responses.

## Goal

Document the migration strategy and safety boundary for a future optional LLM-based `ResponseComposer`.

## Scope

- deterministic composer vs LLM composer split
- prompt boundary
- responseMaterial boundary
- safety and hallucination concerns
- observability and trace reuse
- runner compatibility implications
- migration strategy
- next-step decision

## Out of scope

- LLM composer implementation
- Bedrock changes
- prompt implementation
- ChatService changes
- runLightweightAgentLoop changes
- selected_mark_explanation route changes
- AgentCore implementation
- AgentCoreRunner implementation
- Tableau MCP migration implementation

## Tasks

- define the safe prompt and responseMaterial boundary
- define when LLM generation would be allowed
- define the fallback behavior
- define how the composer stays compatible with both runners

## Acceptance criteria

- the next-step decision is documented
- the safety boundary is explicit

## Validation

- docs only

## Related

- [LLM ResponseComposer Next Step](../../v0.6-llm-response-composer-next-step.md)
- #99 v0.6.0 AgentCore Spike
- #100 Agent runner audit and boundaries
- #101 Define AgentRunner contract
- #102 Add LambdaAgentRunner skeleton
- #103 Route selected_mark_explanation through LambdaAgentRunner
- #104 Audit AgentCore fit for selected_mark_explanation
- #105 Define AgentCoreRunner design
- #106 Define AgentRunner comparison metrics
- #107 Define Tableau MCP tool-layer next step
