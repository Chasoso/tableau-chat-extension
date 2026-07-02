# Audit current stdio Tableau MCP usage

## Background

The current Tableau MCP story is still centered on stdio usage. Before we define a hosted migration boundary, we need to know exactly where stdio is assumed today.

## Goal

Document the current stdio Tableau MCP call sites, responsibilities, and failure handling so the team can see what must remain stable during migration.

## Scope

- stdio Tableau MCP client / server invocation audit
- current transport assumptions
- current auth assumptions
- current Tableau MCP usage from legacy chat
- timeout / retry / failure handling
- evidence / trace handling
- overlap with Tool Layer

## Out of scope

- refactor
- transport abstraction implementation
- Hosted MCP connection

## Tasks

- identify current stdio entry points
- map the ownership of auth, timeout, and retry behavior
- document how traces and evidence are handled today
- note where Tool Layer responsibilities overlap with Tableau MCP usage

## Acceptance criteria

- current stdio Tableau MCP responsibilities are documented
- the legacy path and Tool Layer overlap are visible
- failure and timeout assumptions are captured

## Validation

- docs only

## Related issues

- Parent: #125 v0.7.0 Hosted Tableau MCP Migration Foundation
- docs/roadmap-v0.7-to-v0.10.md
- docs/v0.7-stdio-tableau-mcp-usage-audit.md
- docs/v0.6-tableau-mcp-tool-layer-next-step.md

