# Connect describeDatasource to Hosted MCP transport behind feature flag

## Background

`tableau.metadata.describeDatasource` is the first hosted metadata execution target for v0.8.0. It should remain gated so we can preserve fake / no-network and stdio fallback behavior.

## Goal

Wire `tableau.metadata.describeDatasource` to the hosted MCP transport behind an explicit feature flag and configuration check.

## Scope

- `tableau.metadata.describeDatasource` hosted execution path
- explicit hosted feature flag
- fake / no-network fallback
- stdio fallback if configured
- precondition evaluator reuse
- transport-aware execution boundary reuse
- normalized output
- no broad tool exposure

## Out of scope

- `tableau.metadata.listFields` hosted execution unless explicitly safe
- arbitrary query
- underlying data
- write tools
- free-form chat migration

## Tasks

- route `describeDatasource` through the hosted transport only when gated on
- keep the fake and stdio fallback paths available
- preserve the existing precondition and normalization layers
- add contract tests for the hosted path

## Acceptance criteria

- `describeDatasource` can execute through the hosted path when enabled
- fallback behavior remains available and safe
- the transport boundary still hides transport details from the Tool Layer

## Validation

- backend lint
- backend typecheck
- backend tests
- hosted integration tests optional / gated only

## Related issues

- Parent: #{{PARENT_ISSUE_NUMBER}} v0.8.0 Hosted Tableau MCP Metadata Execution
- docs/v0.8-plan.md
- docs/roadmap-v0.7-to-v0.10.md
