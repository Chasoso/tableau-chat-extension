# Define AgentCoreRunner design

## Background

If AgentCore is adopted, the team will need a runner contract and comparison boundary before implementation starts.

## Goal

Document a safe design for `AgentCoreRunner` without implementing it.

## Scope

- AgentCoreRunner concept
- input / output normalization strategy
- observability mapping
- selected_mark_explanation comparison fit

## Out of scope

- AgentCore implementation
- runtime migration

## Tasks

- outline the runtime boundary
- describe how results would be normalized
- describe how trace and observability would be compared

## Acceptance criteria

- the design is clear enough to implement later
- it remains comparable with LambdaAgentRunner

## Validation

- docs only

## Related

- #00 v0.6.0 AgentCore Spike
