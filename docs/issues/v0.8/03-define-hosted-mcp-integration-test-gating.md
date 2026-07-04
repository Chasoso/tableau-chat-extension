# Define Hosted MCP integration test gating

## Background

Hosted MCP integration tests should not become a default CI dependency. v0.8.0 needs an explicit gating strategy so hosted work stays optional and reproducible.

## Goal

Define how hosted integration tests are enabled, skipped, and documented so the default CI path remains no-network.

## Scope

- no-network default tests
- hosted integration test marker or flag
- secret requirements
- local manual test strategy
- CI opt-in strategy
- failure handling
- skip behavior

## Out of scope

- Hosted MCP implementation
- real integration test execution in default CI
- secrets setup
- infrastructure changes

## Tasks

- define the hosted test marker or environment flag
- document how tests are skipped when Hosted MCP is unavailable
- describe the manual verification flow for developers
- keep default CI no-network

## Acceptance criteria

- hosted integration tests are explicitly gated
- default CI does not require Hosted MCP
- skip and failure behavior is documented

## Validation

- docs only, or config-contract tests if code is added

## Related issues

- Parent: #{{PARENT_ISSUE_NUMBER}} v0.8.0 Hosted Tableau MCP Metadata Execution
- docs/v0.8-plan.md
- docs/roadmap-v0.7-to-v0.10.md
