# Preserve fake no-network and stdio fallback tests

## Background

The hosted path must not break the deterministic fake and stdio fallback coverage that keeps local development and CI safe.

## Goal

Preserve the fake / no-network metadata tests, stdio fallback tests, `selected_mark_explanation` regression tests, and the free-form chat legacy path while hosted work lands.

## Scope

- fake / no-network metadata tests
- stdio fallback config tests
- `selected_mark_explanation` regression tests
- ToolRegistry metadata registration tests
- free-form chat legacy non-regression checks
- CI default no Hosted MCP

## Out of scope

- real Hosted MCP integration in default CI
- free-form chat migration
- frontend changes

## Tasks

- verify the fallback tests still pass after hosted wiring is added
- keep default CI no-network
- add any missing regression checks for the legacy path
- make sure hosted work does not disturb `selected_mark_explanation`

## Acceptance criteria

- fake / no-network behavior is preserved
- stdio fallback remains available
- `selected_mark_explanation` remains unchanged
- the free-form chat legacy path remains unchanged

## Validation

- backend lint
- backend typecheck
- backend tests

## Related issues

- Parent: #{{PARENT_ISSUE_NUMBER}} v0.8.0 Hosted Tableau MCP Metadata Execution
- docs/v0.8-plan.md
- docs/roadmap-v0.7-to-v0.10.md
