# Add transport-aware metadata tool execution boundary

## Background

Once metadata tools are registered, their handlers should execute through the transport boundary rather than hardcoding a single Tableau MCP mode.

## Goal

Create a transport-aware execution boundary for metadata tool handlers.

## Scope

- metadata tool execution boundary
- fake transport path
- stdio / hosted transport interface compatibility
- normalized transport result
- timeout / error normalization
- trace metadata
- no real Hosted MCP requirement

## Out of scope

- production Hosted MCP execution
- arbitrary query tools
- free-form chat migration

## Tasks

- route metadata tool execution through the transport boundary
- normalize result and error handling
- keep the fake transport path available
- attach trace metadata without leaking transport internals

## Acceptance criteria

- metadata handlers execute through a transport-aware boundary
- fake and stdio / hosted candidates are compatible
- timeout and error handling are normalized

## Validation

- backend lint
- backend typecheck
- backend tests

## Related issues

- Parent: #{{PARENT_ISSUE_NUMBER}} v0.7.0 Hosted Tableau MCP Migration Foundation
- docs/roadmap-v0.7-to-v0.10.md

