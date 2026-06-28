# Title
Trace schema and agentRunId

## Background
Today, execution details are spread across logs, job progress messages, and debug fields in API responses. This is hard to trace and makes it difficult to separate an execution record from the agent's decision steps.

The reset needs a trace model that can capture every step of a run, keyed by `agentRunId`.

## Scope
- Define the trace schema for agent execution.
- Define the `agentRunId` lifecycle and propagation rules.
- Define the minimum step/event taxonomy for a run.
- Define how trace relates to `chatJobId`, session, and the user question.

## Out of scope
- Building a full observability platform.
- Reworking CloudWatch or adding a new external tracing backend.
- Implementing the full UI for trace inspection.
- Changing the external chat response shape beyond what is needed for the new fields.

## Tasks
- Define `TraceEvent` and `TraceStep` structures.
- Define the `agentRunId` generation and where it is attached.
- Decide whether trace is persisted with job state, stored separately, or both.
- Specify the minimum fields needed to debug intent, plan, tool routing, execution, and response composition.
- Document the correlation rules between run ID, job ID, and chat session ID.

## Acceptance criteria
- Every agent run can be correlated by `agentRunId`.
- The schema can express the steps planned in the architecture reset document.
- The schema can capture both success and failure paths.
- The schema is compatible with future `AgentCoreRunner` execution traces.

## Related document
- [docs/architecture-reset-v0.2.md](../architecture-reset-v0.2.md)
- [docs/issues/00-v0.2.0-architecture-reset.md](./00-v0.2.0-architecture-reset.md)

