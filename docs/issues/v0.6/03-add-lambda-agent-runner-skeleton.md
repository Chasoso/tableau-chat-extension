# Add LambdaAgentRunner skeleton

## Background

The current selected_mark_explanation flow already works in the backend runtime.
We want a thin runner wrapper around that existing path before comparing it to AgentCore.

## Goal

Add a `LambdaAgentRunner` skeleton that wraps the existing structured orchestration path.

## Scope

- LambdaAgentRunner wrapper
- selected_mark_explanation path passthrough
- runner-level trace and budget normalization

## Out of scope

- AgentCoreRunner implementation
- runtime migration of free-form chat
- broader orchestration changes

## Tasks

- wrap the existing selected_mark_explanation path
- preserve current behavior
- normalize runner output

Implementation note:

- this issue introduces a thin wrapper around `runSelectedMarkExplanationOrchestration()`
- `selected_mark_explanation` remains the only supported run mode for now
- `ChatService` and `runLightweightAgentLoop` are not switched over yet

## Acceptance criteria

- selected_mark_explanation can run through the wrapper
- the wrapper does not change existing behavior

## Validation

- contract and path tests

## Related

- #02 Define AgentRunner contract
- #04 Route selected_mark_explanation through LambdaAgentRunner
