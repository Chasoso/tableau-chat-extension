# Define stdio vs hosted transport configuration strategy

## Background

The transport abstraction is defined, so v0.7.0 now needs a safe strategy for choosing among stdio, hosted, fake, and disabled transport modes without breaking local development or CI.

## Goal

Document the configuration strategy for selecting Tableau MCP transport safely and predictably.

## Scope

- environment variable strategy
- feature flag strategy
- default transport choice
- local development mode
- CI / no-network mode
- fallback strategy
- safe misconfiguration handling

## Out of scope

- infrastructure changes
- secret storage implementation
- real Hosted MCP connection

## Tasks

- define transport selection settings
- document default and fallback rules
- define safe misconfiguration behavior
- make CI and local no-network behavior explicit

## Acceptance criteria

- transport selection strategy is documented
- default / fallback behavior is safe
- CI and local modes are covered

## Validation

- docs only, or config contract tests if code is added

## Related issues

- Parent: #125 v0.7.0 Hosted Tableau MCP Migration Foundation
- docs/v0.7-plan.md
- docs/v0.7-tableau-mcp-transport-abstraction.md
- docs/v0.7-tableau-mcp-transport-configuration-strategy.md
- docs/v0.7-hosted-tableau-mcp-requirements-audit.md

