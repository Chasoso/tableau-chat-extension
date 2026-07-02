# Audit Hosted Tableau MCP requirements and constraints

## Background

The roadmap assumes Hosted / remote Tableau MCP is a future target, but the access model, site settings, and runtime constraints still need to be understood before implementation starts.

## Goal

Document the requirements, constraints, and unknowns for using Hosted Tableau MCP in this repository.

## Scope

- Hosted MCP availability assumptions
- Tableau Cloud site settings
- OAuth / user-context requirements
- token handling boundary
- backend Lambda connectivity assumptions
- local development and CI strategy
- security / governance notes
- unknowns and open questions

## Out of scope

- actual Hosted MCP connection
- OAuth implementation
- infrastructure changes

## Tasks

- identify hosted access model assumptions
- capture auth and token boundary questions
- note backend connectivity and local-dev constraints
- record unresolved platform questions

## Acceptance criteria

- hosted readiness requirements are documented
- unresolved questions are visible
- infrastructure boundary is explicit

## Validation

- docs only

## Related issues

- Parent: #125 v0.7.0 Hosted Tableau MCP Migration Foundation
- docs/v0.7-plan.md
- docs/v0.7-hosted-tableau-mcp-requirements-audit.md
- docs/v0.7-stdio-tableau-mcp-usage-audit.md

