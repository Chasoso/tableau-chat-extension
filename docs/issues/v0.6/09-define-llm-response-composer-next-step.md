# Define LLM ResponseComposer next step

## Background

v0.5.0 keeps ResponseComposer deterministic and placeholder-only.
If the project later wants a richer answer generation path, the next step must be planned separately.

## Goal

Define the next-step plan for an optional LLM-based ResponseComposer.

## Scope

- deterministic composer vs LLM composer split
- prompt and responseMaterial boundaries
- safety and hallucination concerns
- observability and trace reuse

## Out of scope

- LLM composer implementation
- Bedrock changes

## Tasks

- define the migration strategy
- define the safety boundary
- define the runner compatibility implications

## Acceptance criteria

- the next-step decision is documented

## Validation

- docs only

## Related

- #00 v0.6.0 AgentCore Spike
