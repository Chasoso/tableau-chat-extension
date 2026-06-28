# Title
AgentRunner interface

## Background
The current backend implicitly assumes one execution style: `ChatService` decides whether to use lightweight agent logic, Tableau context providers, Bedrock prompts, and Notion handling.

To make the architecture swappable, we need a stable `AgentRunner` interface that can hide implementation differences between the current Lambda runtime and a future AgentCore runtime.

## Scope
- Define the `AgentRunner` contract.
- Define the inputs and outputs expected by the orchestrator.
- Define how the runner receives context, intent, plan, and trace sinks.
- Define how runner implementations can be swapped without changing the API surface.

## Out of scope
- Implementing the full orchestrator logic.
- Implementing AgentCore.
- Rewriting all backend handlers.
- Replacing the existing chat job workflow in one step.

## Tasks
- Design the interface methods for starting and executing a run.
- Decide which parts of the run are runner-owned and which are orchestrator-owned.
- Define the runner result shape, including response and trace data.
- Document how errors and retries surface through the interface.
- Document how `LambdaAgentRunner` and `AgentCoreRunner` would fit the same contract.

## Acceptance criteria
- The interface supports the v0.2 Lambda implementation and future AgentCore replacement.
- The interface is explicit about context input, execution output, and trace emission.
- The interface does not force Bedrock or MCP details into higher layers.
- The interface is stable enough to use as the base for migration work.

## Related document
- [docs/architecture-reset-v0.2.md](../architecture-reset-v0.2.md)
- [docs/issues/00-v0.2.0-architecture-reset.md](./00-v0.2.0-architecture-reset.md)
- [docs/issues/01-agent-core-types.md](./01-agent-core-types.md)
- [docs/issues/02-trace-schema-and-agentRunId.md](./02-trace-schema-and-agentRunId.md)

