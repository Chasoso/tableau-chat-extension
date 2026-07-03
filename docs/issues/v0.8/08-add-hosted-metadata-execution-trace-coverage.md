# Add hosted metadata execution trace coverage

## Background

The v0.7.0 trace model needs to cover hosted execution as well so we can observe the new path without exposing raw payloads.

## Goal

Add trace coverage for hosted metadata execution, including the transport kind, duration, correlation data, and normalized error status.

## Scope

- hosted transportKind in trace
- requestId / correlationId / agentRunId
- durationMs
- errorCode
- warningCount
- fake / stdio / hosted distinction
- no raw payload
- no tokens, secrets, or stack traces
- tests

## Out of scope

- UI trace panel
- trace persistence
- raw MCP output exposure

## Tasks

- extend the trace coverage for hosted execution
- keep payloads safe and summary-level
- verify the trace stays aligned with the normalized result contract
- add tests for hosted and fallback variants

## Acceptance criteria

- hosted execution emits trace events
- trace payloads remain safe and normalized
- no raw secrets or stack traces are included

## Validation

- backend lint
- backend typecheck
- backend tests

## Related issues

- Parent: #{{PARENT_ISSUE_NUMBER}} v0.8.0 Hosted Tableau MCP Metadata Execution
- docs/v0.8-plan.md
- docs/v0.7-metadata-output-normalization-and-trace-events.md
