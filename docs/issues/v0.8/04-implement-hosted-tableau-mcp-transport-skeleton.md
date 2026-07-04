# Implement HostedTableauMcpTransport skeleton

## Background

The transport abstraction exists from v0.7.0, but we still need a hosted transport skeleton that can be safely wired without forcing real network behavior by default.

## Goal

Add a hosted transport skeleton that fits the existing transport contract and can represent not-configured, timeout, and unsupported states safely.

## Scope

- HostedTableauMcpTransport or RemoteTableauMcpTransport skeleton
- constructor and dependency injection
- not_configured result when endpoint or auth is missing
- unsupported, timeout, and error mapping placeholders
- no real network by default
- no token logging
- contract tests

## Out of scope

- production Hosted MCP execution
- OAuth flow
- token storage or refresh
- free-form chat migration
- arbitrary query tools

## Tasks

- add a hosted transport skeleton that matches the existing transport contract
- preserve no-network default behavior
- make the transport return safe status values when configuration is incomplete
- cover the skeleton with contract tests

## Acceptance criteria

- the skeleton compiles and fits the transport boundary
- missing config does not crash the app
- no raw token data is logged or returned

## Validation

- backend lint
- backend typecheck
- backend tests

## Related issues

- Parent: #{{PARENT_ISSUE_NUMBER}} v0.8.0 Hosted Tableau MCP Metadata Execution
- docs/v0.8-plan.md
- docs/roadmap-v0.7-to-v0.10.md
