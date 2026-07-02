# Define Hosted MCP OAuth user-context and site-settings boundary

## Background

Hosted Tableau MCP introduces auth and tenant-context questions that are separate from the existing stdio assumptions. Those boundaries should be documented before any implementation work begins.

## Goal

Define the OAuth, user-context, site-settings, and token boundaries for Hosted Tableau MCP usage.

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
- note the token storage and refresh assumptions
- document permission and scope expectations
- capture local-dev and test constraints

## Acceptance criteria

- the OAuth and user-context boundary is explicit
- the token and site-settings boundary is documented
- local test constraints are visible

## Validation

- docs only

## Related issues

- Parent: #{{PARENT_ISSUE_NUMBER}} v0.7.0 Hosted Tableau MCP Migration Foundation
- docs/roadmap-v0.7-to-v0.10.md

