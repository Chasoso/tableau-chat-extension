# Title
Minimal fixed plan design

## Background
The current agent loop relies on dynamic Bedrock planning and re-evaluation. For v0.2, we want to reduce this variability and prefer fixed plans per intent so that LLM calls and MCP calls are easier to reason about.

This issue defines the smallest useful fixed-plan design that still supports the current Tableau chat PoC.

## Scope
- Define fixed plans for the main supported intents.
- Decide when MCP is required and when dashboard context alone is enough.
- Define the minimal decision flow for tool routing.
- Keep LLM use limited to the cases where it adds real value.

## Out of scope
- Fully dynamic agent planning.
- AgentCore execution.
- Expanding tool coverage.
- Rebuilding Notion integration.

## Tasks
- Map existing question intents to fixed plan templates.
- Define when a plan can be satisfied from dashboard context only.
- Define when the plan should call Tableau MCP or Tableau REST / Metadata tools.
- Define the maximum number of LLM calls per run for the v0.2 path.
- Document fallback behavior when a plan is insufficient.

## Acceptance criteria
- The plan set is explicit and intent-driven.
- MCP is only used when the plan requires additional data.
- The number of LLM calls per run is bounded and documented.
- The design is simple enough to implement before any AgentCore migration.

## Related document
- [docs/architecture-reset-v0.2.md](../architecture-reset-v0.2.md)
- [docs/issues/00-v0.2.0-architecture-reset.md](./00-v0.2.0-architecture-reset.md)
- [docs/issues/01-agent-core-types.md](./01-agent-core-types.md)
- [docs/issues/03-agentrunner-interface.md](./03-agentrunner-interface.md)

