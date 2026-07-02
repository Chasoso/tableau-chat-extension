# Define Hosted MCP OAuth user-context and site-settings boundary

## Background

Hosted Tableau MCP introduces auth and tenant-context questions that are separate from the current stdio assumptions.

## Goal

Define the OAuth, user-context, site-settings, token storage / refresh, Cognito / Tableau relationship, and permission / scope boundaries for Hosted Tableau MCP usage.

## Scope

- OAuth responsibility boundary
- user-context delegation assumptions
- site settings requirements
- token storage / refresh boundary
- Cognito / Tableau auth relationship
- permission / scope assumptions
- local dev and test constraints

## Out of scope

- OAuth implementation
- token persistence implementation
- Hosted MCP connection
- auth infrastructure changes

## Tasks

- describe who owns each auth boundary
- note token storage and refresh assumptions
- document permission and scope expectations
- capture local-dev and test constraints

## Acceptance criteria

- OAuth and user-context boundary is explicit
- token and site-settings boundary is documented
- local test constraints are visible

## Validation

- docs only

## Related issues

- Parent: #125 v0.7.0 Hosted Tableau MCP Migration Foundation
- docs/v0.7-plan.md
- docs/v0.7-hosted-mcp-auth-user-context-boundary.md
- docs/v0.7-hosted-tableau-mcp-requirements-audit.md
- docs/v0.7-tableau-mcp-transport-configuration-strategy.md

