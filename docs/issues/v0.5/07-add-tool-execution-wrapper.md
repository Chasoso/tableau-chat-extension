# Add tool execution wrapper

## Background

Tool execution needs a safe wrapper before ToolRegistry-backed tool calls can be connected to orchestration. The wrapper must preserve JSON-safe metadata, handle timeout and errors, and keep raw external payloads out of trace.

## Goal

Add a minimal `ToolExecutionWrapper` contract and implementation that can safely execute registered tools through a handler map while normalizing results for orchestration use.

## Scope

- execution wrapper contract
- `ToolExecutionInput` / `ToolExecutionResult`
- timeout and budget handling
- error handling
- JSON-safe output normalization
- trace metadata for execution results

## Out of scope

- full tool execution migration
- bulk registry registration
- Tableau MCP execution changes
- ResponseComposer implementation

## Tasks

- define the wrapper contract
- implement a minimal handler-map-based wrapper
- normalize output into JSON-safe data
- keep selected-mark pseudo tools as the first target

## Acceptance criteria

- wrapper returns JSON-safe output
- timeout and error cases are handled safely
- raw selected marks / summary data bodies are not copied into trace metadata

## Validation

- wrapper tests pass
- existing orchestration behavior remains unchanged

## Related

- #74 v0.5.0 Tool Layer Rebuild
- `docs/v0.5-tool-layer-rebuild-plan.md`
- `docs/v0.5-tool-layer-audit-and-boundaries.md`
