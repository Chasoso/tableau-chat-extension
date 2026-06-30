# Connect ToolRouter to ToolRegistry

## Background

ToolRouter in v0.4.0 can gate plan steps, but v0.5.0 needs it to consult ToolRegistry so that context pseudo tools and other registered tools can be routed consistently.

## Goal

Connect ToolRouter to ToolRegistry lookups without adding tool execution or registry discovery.

## Scope

- ToolRouter contract extension
- ToolRegistry lookup integration
- allowed / blocked / unavailable decisions

## Out of scope

- tool execution
- registry discovery automation

## Tasks

- inject a ToolRegistry reference into ToolRouter
- map lookup results to routing results
- keep the no-registry path backward-compatible

## Acceptance criteria

- ToolRouter can consult ToolRegistry when available
- routing remains JSON-safe and trace-friendly
- existing routing behavior remains stable when no registry is provided

## Validation

- router contract tests pass
- docs describe the mapping clearly

## Related

- `docs/v0.5-context-derived-pseudo-tools.md`
- `docs/v0.5-tool-layer-rebuild-plan.md`
- `docs/v0.5-tool-layer-audit-and-boundaries.md`
- #74 v0.5.0 Tool Layer Rebuild
