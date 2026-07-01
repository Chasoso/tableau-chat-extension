# Define AgentRunner contract

## Background

We need a small runner abstraction so Lambda and future AgentCore runtimes can be compared using the same input and output shape.

## Goal

Define `AgentRunner`, `AgentRunInput`, and `AgentRunResult` contracts.

## Scope

- AgentRunner interface
- AgentRunInput contract
- AgentRunResult contract
- runner metadata and observability fields

## Out of scope

- LambdaAgentRunner implementation
- AgentCoreRunner implementation
- changes to ChatService or runLightweightAgentLoop

## Tasks

- define the runner contract
- define the minimum run input
- define the minimum run result
- keep the contract compatible with selected_mark_explanation comparison

## Acceptance criteria

- the contract supports selected_mark_explanation
- the contract can represent warnings, errors, fallback reasons, and trace metadata

## Validation

- type and contract tests

## Related

- #00 v0.6.0 AgentCore Spike
