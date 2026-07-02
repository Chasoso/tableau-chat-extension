# Add metadata output normalization and trace events

## Background

Metadata tool output needs to be safe for user-facing responses and trace payloads, which means it should be normalized and filtered before it leaves the execution boundary.

## Goal

Normalize metadata output and define trace events for metadata tool execution.

## Scope

- metadata output normalization
- raw result suppression
- truncated / omitted flags
- warning / error summary
- trace event candidates
  - `tableau_metadata_tool.started`
  - `tableau_metadata_tool.completed`
  - `tableau_metadata_tool.failed`
- JSON-safe output
- no secrets / tokens / raw stack traces

## Out of scope

- UI trace panel
- trace persistence
- raw MCP output exposure

## Tasks

- define the normalized metadata result shape
- define the metadata trace events
- keep secrets and raw stack traces out of the payloads
- preserve the distinction between raw transport results and user-facing summaries

## Acceptance criteria

- metadata output is normalized before it is surfaced
- trace events are defined for the metadata path
- secrets and raw MCP output are suppressed

## Validation

- backend lint
- backend typecheck
- backend tests

## Related issues

- Parent: #{{PARENT_ISSUE_NUMBER}} v0.7.0 Hosted Tableau MCP Migration Foundation
- docs/roadmap-v0.7-to-v0.10.md

