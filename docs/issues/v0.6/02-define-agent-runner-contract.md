# Define AgentRunner contract

## Background

Issue #100 established the current backend runtime boundary and recommended that v0.6.0 compare selected_mark_explanation first.

The existing `AgentRunner` abstraction is still a thin wrapper around the legacy chat service flow, so v0.6.0 needs a comparison-oriented contract that can represent both Lambda and future AgentCore runs without changing runtime behavior yet.

## Goal

Define the minimum `AgentRunner`, `AgentRunInput`, and `AgentRunResult` contracts for comparing selected_mark_explanation across runtimes.

## Scope

- `AgentRunner` interface
- `AgentRunInput` contract
- `AgentRunResult` contract
- runner metadata and observability fields
- warnings / errors / fallback / trace metadata
- selected_mark_explanation comparison support

## Out of scope

- `LambdaAgentRunner` implementation
- `AgentCoreRunner` implementation
- changes to `ChatService` or `runLightweightAgentLoop`
- selected_mark_explanation runner migration
- runtime behavior changes

## Tasks

- define the runner contract
- define the minimum comparison input
- define the minimum comparison result
- keep legacy wrapper compatibility where needed
- make the contract usable for selected_mark_explanation comparison

## Acceptance criteria

- the contract supports selected_mark_explanation
- the contract can represent warnings, errors, fallback reasons, and trace metadata
- runner metadata can distinguish lambda, agentcore, and test runners
- the result is JSON-safe and comparison-friendly

## Validation

- type and contract tests
- docs updated only outside of the contract file

## Related

- #99 v0.6.0 AgentCore Spike
- #100 Agent runner audit and boundaries
