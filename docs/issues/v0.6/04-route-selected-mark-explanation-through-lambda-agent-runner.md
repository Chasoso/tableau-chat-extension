# Route selected_mark_explanation through LambdaAgentRunner

## Background

selected_mark_explanation is the narrowest, most deterministic comparison target for runner evaluation.

## Goal

Route only selected_mark_explanation through `LambdaAgentRunner` for comparison purposes.

## Scope

- selected_mark_explanation routing
- runner-level request / response normalization
- trace and fallback preservation

## Out of scope

- free-form chat migration
- AgentCore implementation
- broad router changes

## Tasks

- connect the explicit selected-mark action path to the runner abstraction
- preserve the current deterministic path
- keep legacy chat behavior unchanged

## Acceptance criteria

- selected_mark_explanation runs through LambdaAgentRunner
- existing chat flow is unchanged

## Validation

- selected-mark orchestration tests

## Related

- #03 Add LambdaAgentRunner skeleton
