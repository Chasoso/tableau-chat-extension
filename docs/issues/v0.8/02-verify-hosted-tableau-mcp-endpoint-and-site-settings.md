# Verify Hosted Tableau MCP endpoint and site settings

## Background

Before we wire any live hosted execution, we need to know what Hosted Tableau MCP endpoint and site-settings requirements are actually available and supported.

## Goal

Confirm the Hosted Tableau MCP endpoint shape and the site-settings requirements so we know whether v0.8.0 can proceed with a gated hosted execution path.

## Scope

- official docs verification
- endpoint shape
- site settings requirement
- admin enablement
- Tableau Cloud / Tableau Server availability
- REST API settings if applicable
- unknowns and blockers
- v0.8 implementation gate

## Out of scope

- production connection
- OAuth implementation
- transport implementation
- infrastructure changes

## Tasks

- verify the official hosted MCP documentation
- document the endpoint shape and any environment constraints
- confirm whether site settings or admin actions are required
- record unknowns and the implementation gate

## Acceptance criteria

- endpoint and site-settings findings are documented
- unknowns are listed explicitly
- the hosted execution gate for v0.8.0 is clear

## Validation

- docs only
- official source references

## Related issues

- Parent: #{{PARENT_ISSUE_NUMBER}} v0.8.0 Hosted Tableau MCP Metadata Execution
- docs/v0.8-plan.md
- docs/roadmap-v0.7-to-v0.10.md
