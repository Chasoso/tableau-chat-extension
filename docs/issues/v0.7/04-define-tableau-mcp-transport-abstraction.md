# Define Tableau MCP transport abstraction

## Background

v0.7.0 should treat transport as a first-class boundary so the Tool Layer can stay independent from stdio, hosted, and fake/no-network execution paths.

## Goal

Define a transport boundary that can switch between stdio, hosted / remote, and fake transports without exposing transport details to higher layers.

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
- define the normalized result and error shape
- separate trace metadata from transport internals
- document how fake transport should behave in no-network mode

## Acceptance criteria

- the transport boundary is explicit
- stdio, hosted, and fake candidates are documented
- result and error normalization are defined

## Validation

- type and contract tests if code is added
- otherwise docs only

## Related issues

- Parent: #{{PARENT_ISSUE_NUMBER}} v0.7.0 Hosted Tableau MCP Migration Foundation
- docs/roadmap-v0.7-to-v0.10.md

