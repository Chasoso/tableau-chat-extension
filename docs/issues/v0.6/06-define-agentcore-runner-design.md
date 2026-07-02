# Define AgentCoreRunner design

## Background

`selected_mark_explanation` is already routed through `LambdaAgentRunner`, and the AgentCore fit assessment concluded that AgentCore is a conditional fit rather than an obvious migration target.

Before any AgentCore implementation is started, we need a design for `AgentCoreRunner` that can be compared with `LambdaAgentRunner` using the same `AgentRunner` contract.

## Goal

Document a safe `AgentCoreRunner` design so later implementation can be done without changing the current deterministic path.

## Scope

- AgentCoreRunner concept
- runtime boundary options
- input normalization strategy
- output normalization strategy
- observability mapping
- trace comparison strategy
- selected_mark_explanation comparison fit
- configuration and safety
- testing strategy
- implementation stages

## Out of scope

- AgentCore implementation
- AgentCoreRunner implementation
- runtime migration
- selected_mark_explanation route changes
- LambdaAgentRunner behavior changes
- free-form chat migration
- Tableau MCP migration
- LLM ResponseComposer implementation

## Tasks

- define the AgentCoreRunner concept
- compare thin runner vs managed execution boundary options
- define how AgentRunInput maps into AgentCore runtime input
- define how AgentCore output maps back into AgentRunResult
- describe observability and trace mapping
- describe safety and fallback behavior

## Acceptance criteria

- a written AgentCoreRunner design exists
- the design is comparable to LambdaAgentRunner
- the design can be used as a basis for a later implementation issue

## Validation

- docs only

## Related

- [AgentCoreRunner Design](../../v0.6-agentcore-runner-design.md)
- [AgentCore Fit Assessment for selected_mark_explanation](../../v0.6-agentcore-fit-selected-mark-explanation.md)
- #99 v0.6.0 AgentCore Spike
- #100 Agent runner audit and boundaries
- #101 Define AgentRunner contract
- #102 Add LambdaAgentRunner skeleton
- #103 Route selected_mark_explanation through LambdaAgentRunner
- #104 Audit AgentCore fit for selected_mark_explanation
