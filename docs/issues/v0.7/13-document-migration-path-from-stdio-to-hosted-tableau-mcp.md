# Document migration path from stdio to Hosted Tableau MCP

## Background

v0.7.0 should end with a clear plan for how the project moves from the current stdio-based Tableau MCP setup toward a hosted path.

## Goal

Document the staged migration path, fallback rules, and v0.8.0 handoff from stdio Tableau MCP to Hosted Tableau MCP.

## Scope

- current stdio path
- target hosted path
- staged migration plan
- config / feature flag plan
- rollback / fallback plan
- local dev plan
- CI/no-network plan
- open questions
- v0.8.0 handoff

## Out of scope

- implementation
- Hosted MCP production migration

## Tasks

- describe the current and target architecture
- document the staging and fallback strategy
- record the open questions that must be answered before v0.8.0
- state the handoff point clearly

## Acceptance criteria

- the migration path is documented
- fallback and rollback are visible
- the v0.8.0 handoff is explicit

## Validation

- docs only

## Related issues

- Parent: #{{PARENT_ISSUE_NUMBER}} v0.7.0 Hosted Tableau MCP Migration Foundation
- docs/roadmap-v0.7-to-v0.10.md

