# Normalize Hosted MCP metadata errors

## Background

Hosted MCP errors need to be mapped into the same safe, user-facing metadata error summaries used by the rest of the tool layer.

## Goal

Normalize hosted MCP transport errors into safe metadata error summaries without exposing raw protocol, token, or stack-trace details.

## Scope

- auth required or expired
- permission denied
- site settings disabled
- endpoint not configured
- network error
- timeout
- protocol error
- tool not found
- invalid input
- remote server error
- unknown error
- safe user-facing messages

## Out of scope

- raw MCP error exposure
- raw stack traces
- token or secret exposure
- arbitrary query errors

## Tasks

- define the hosted error-to-summary mapping
- keep raw transport details out of the user-facing result
- preserve enough structure for trace and debugging use
- add tests for the error categories

## Acceptance criteria

- hosted errors map into the existing safe summary model
- no raw stack traces or tokens appear in the output
- the mapping is covered by tests

## Validation

- backend lint
- backend typecheck
- backend tests

## Related issues

- Parent: #{{PARENT_ISSUE_NUMBER}} v0.8.0 Hosted Tableau MCP Metadata Execution
- docs/v0.8-plan.md
- docs/roadmap-v0.7-to-v0.10.md
