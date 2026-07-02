# Audit Hosted Tableau MCP requirements and constraints

## Background

The roadmap assumes Hosted / remote Tableau MCP will become a future target, but the access model and runtime constraints still need to be understood before implementation can start.

## Goal

Document the requirements, constraints, and open questions for using Hosted Tableau MCP in this repository.

## Scope

- Hosted MCP availability assumptions
- Tableau Cloud site settings
- OAuth / user-context requirements
- token handling boundary
- backend Lambda connectivity assumptions
- local development strategy
- security / governance notes
- unknowns and open questions

## Out of scope

- actual Hosted MCP connection
- OAuth implementation
- infrastructure changes

## Tasks

- identify the hosted access model assumptions
- capture auth and token boundary questions
- note backend connectivity and local-dev constraints
- record unresolved platform questions

## Acceptance criteria

- hosted readiness requirements are documented
- the unresolved questions are visible
- the infrastructure boundary is explicit

## Validation

- docs only

## Related issues

- Parent: #{{PARENT_ISSUE_NUMBER}} v0.7.0 Hosted Tableau MCP Migration Foundation
- docs/roadmap-v0.7-to-v0.10.md

