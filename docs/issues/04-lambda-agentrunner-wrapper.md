# Title
LambdaAgentRunner wrapper

## Background
We do not want to rewrite the whole backend at once. The safest migration path is to wrap the current Lambda-based execution behind a new runner abstraction, then gradually move responsibilities out of the old flow.

This wrapper should preserve current behavior while providing the new orchestration boundary.

## Scope
- Implement a Lambda-based runner adapter around the current backend execution.
- Keep current API routes and job processing behavior working during migration.
- Emit the new trace model while reusing existing services where possible.
- Provide a bridge from the current chat flow to the future orchestrator structure.

## Out of scope
- Rebuilding the execution engine from scratch.
- Migrating to AgentCore.
- Changing Tableau MCP or Notion implementation internals in this issue.
- Replacing the current frontend chat flow.

## Tasks
- Wrap the current `ChatService` execution in a `LambdaAgentRunner`.
- Wire `agentRunId` into the existing job and response flow.
- Route the existing progress/debug information into the new trace model.
- Keep current fallback behavior intact during the wrapper phase.
- Document the migration path from the old flow to the new one.

## Acceptance criteria
- The backend can execute via `LambdaAgentRunner` without changing the frontend contract.
- Current chat behavior remains functionally stable during the wrapper phase.
- The wrapper emits trace data with `agentRunId`.
- The wrapper is small enough to be replaced later by `AgentCoreRunner`.

## Related document
- [docs/architecture-reset-v0.2.md](../architecture-reset-v0.2.md)
- [docs/issues/00-v0.2.0-architecture-reset.md](./00-v0.2.0-architecture-reset.md)
- [docs/issues/03-agentrunner-interface.md](./03-agentrunner-interface.md)

