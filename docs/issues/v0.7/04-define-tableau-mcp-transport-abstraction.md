# Define Tableau MCP transport abstraction

## Background

v0.7.0 treats Tableau MCP transport as a first-class boundary so future stdio, hosted / remote, and fake / no-network paths can be selected without exposing transport details to the Tool Layer.

## Goal

Define a normalized Tableau MCP transport contract and the associated request, result, error, warning, trace, and timing shapes.

## Scope

- transport interface / contract
- stdio transport candidate
- hosted / remote transport candidate
- fake / no-network transport candidate
- transport result shape
- error / timeout normalization
- trace metadata boundary

## Out of scope

- production Hosted MCP implementation
- broad client refactor
- real network integration

## Tasks

- define the transport contract
- define normalized request and result shapes
- define normalized error and warning shapes
- separate trace metadata from transport internals
- document fake transport behavior in no-network mode

## Acceptance criteria

- transport boundary is explicit
- stdio / hosted / fake candidates are documented
- result and error normalization are defined

## Validation

- type and contract tests if code is added
- otherwise docs only

## Related issues

- Parent: #125 v0.7.0 Hosted Tableau MCP Migration Foundation
- docs/v0.7-plan.md
- docs/v0.7-tableau-mcp-transport-abstraction.md
- docs/v0.7-stdio-tableau-mcp-usage-audit.md
- docs/v0.7-hosted-tableau-mcp-requirements-audit.md

