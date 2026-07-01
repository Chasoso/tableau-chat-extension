# Register context-derived pseudo tools

## Background

Context-derived data such as selected marks and summary data preview are not external tools, but v0.5.0 needs a clear way to route and trace them through the orchestration layer.

## Goal

Define the hybrid strategy for representing context-derived data as pseudo tools so that ToolRegistry, ToolRouter, ExecutionEngine, and trace can handle them consistently without turning them into external service calls.

## Scope

- selected marks
- summary data preview
- filters
- parameters
- dashboard / workbook / view metadata

## Out of scope

- Tableau MCP registration
- external tool registration
- tool execution wrapper implementation

## Tasks

- document the adopted hybrid approach
- describe the pseudo tool catalog
- define the ToolRegistry boundary
- align the path with `selected_mark_explanation`

## Acceptance criteria

- the context-derived data strategy is explicitly documented
- the boundary between pseudo tools and external tools is clear
- selected_mark_explanation is aligned with the minimal pseudo tool path

## Validation

- documentation is updated
- implementation code is unchanged

## Related

- `docs/v0.5-context-derived-pseudo-tools.md`
- `docs/v0.5-tool-layer-rebuild-plan.md`
- `docs/v0.5-tool-layer-audit-and-boundaries.md`
- #74 v0.5.0 Tool Layer Rebuild
