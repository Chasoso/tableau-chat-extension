# Register metadata tools with fake no-network handlers

## Background

The read-only metadata tools should be registerable and testable even when Hosted Tableau MCP is not reachable, so local and CI runs stay deterministic.

## Goal

Register the metadata tools in ToolRegistry and add fake / no-network handlers so the tools can be exercised without live Tableau connectivity.

## Scope

- ToolRegistry registration
- fake handler for `tableau.metadata.describeDatasource`
- fake handler for `tableau.metadata.listFields`
- no-network contract tests
- safe placeholder metadata result
- `selected_mark_explanation` regression protection

## Out of scope

- real Tableau MCP execution
- Hosted MCP connection
- free-form chat migration

## Tasks

- register the metadata tools in ToolRegistry
- wire fake handlers for no-network testing
- keep the fake outputs safe and placeholder-only
- preserve `selected_mark_explanation` behavior

## Acceptance criteria

- metadata tools are registered in ToolRegistry
- fake / no-network handlers exist for both tools
- `selected_mark_explanation` regression risk is protected

## Validation

- backend lint
- backend typecheck
- backend tests

## Related issues

- Parent: #125 v0.7.0 Hosted Tableau MCP Migration Foundation
- docs/roadmap-v0.7-to-v0.10.md
- docs/v0.7-metadata-tools-fake-no-network-handlers.md

