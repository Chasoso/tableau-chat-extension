# Add Hosted MCP auth context adapter boundary

## Background

Hosted execution will need a clean auth and user-context boundary, but v0.8.0 should still avoid implementing the full OAuth flow.

## Goal

Add an auth context adapter boundary so the hosted transport can receive a safe auth summary and tokenReference handoff without exposing secrets.

## Scope

- auth context adapter types
- tokenReference handoff boundary
- userContext summary mapping
- missing, expired, or unknown auth states
- no raw token in result or trace
- no OAuth implementation
- contract tests

## Out of scope

- OAuth client implementation
- token storage
- token refresh
- token persistence
- Hosted MCP network connection

## Tasks

- define the safe auth context shape for hosted execution
- map missing or expired auth into safe states
- ensure trace and result surfaces never include raw tokens
- add contract tests for the boundary

## Acceptance criteria

- the auth boundary is explicit and safe
- token data is not exposed in result or trace payloads
- missing auth is handled as a recoverable state

## Validation

- backend lint
- backend typecheck
- backend tests

## Related issues

- Parent: #{{PARENT_ISSUE_NUMBER}} v0.8.0 Hosted Tableau MCP Metadata Execution
- docs/v0.8-plan.md
- docs/v0.7-hosted-mcp-auth-user-context-boundary.md
