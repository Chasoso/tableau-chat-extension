# Title
Agent core types

## Background
The current code mixes runtime state, collected Tableau context, MCP execution details, and debug data inside broad types such as `TableauAdditionalContext`.

For the architecture reset, we need small, stable types that model the agent domain directly:
Context, Intent, Plan, Tool, and Trace.

## Scope
- Design the core type system for the new agent orchestrator.
- Define how Tableau dashboard state becomes a normalized context pack.
- Define how intent and plan are represented independent of LLM prompts.
- Define a minimal tool action model for orchestration.

## Out of scope
- Implementing the orchestration runtime.
- Implementing trace persistence.
- Implementing the actual tool execution layer.
- Changing the existing chat UI behavior.

## Tasks
- Design `ContextPack` for dashboard state and collected Tableau context.
- Design `Intent` as a separate concept from question text.
- Design `Plan` as a fixed or mostly fixed sequence of actions per intent.
- Design `ToolAction` / `ToolCall` shapes for the orchestrator.
- Map existing types to the new types and note what can be reused.

## Acceptance criteria
- The new types are documented and ready for implementation.
- The types are small enough to separate state from execution.
- The design makes it clear which data is frontend-owned, backend-owned, and runtime-only.
- The types can support future `AgentCoreRunner` compatibility.

## Related document
- [docs/architecture-reset-v0.2.md](../architecture-reset-v0.2.md)
- [docs/issues/00-v0.2.0-architecture-reset.md](./00-v0.2.0-architecture-reset.md)

