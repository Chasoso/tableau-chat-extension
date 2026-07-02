# Define stdio vs hosted transport configuration strategy

## Background

Once the transport abstraction exists, the next question is how the repo should choose between stdio, hosted, and fake transports in development, CI, and runtime.

## Goal

Define the configuration strategy that selects the transport safely and predictably.

## Scope

- environment variable strategy
- feature flag strategy
- default transport choice
- local development mode
- CI/no-network mode
- fallback strategy
- safe misconfiguration handling

## Out of scope

- infrastructure changes
- secret storage implementation
- real Hosted MCP connection

## Tasks

- define how transport selection is configured
- document the default and fallback rules
- define the safe behavior for misconfiguration
- keep CI and local no-network paths explicit

## Acceptance criteria

- the transport selection strategy is documented
- the default and fallback behavior are safe
- CI and local modes are covered

## Validation

- docs only, or config contract tests if code is added

## Related issues

- Parent: #{{PARENT_ISSUE_NUMBER}} v0.7.0 Hosted Tableau MCP Migration Foundation
- docs/roadmap-v0.7-to-v0.10.md

