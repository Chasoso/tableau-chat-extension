# Evaluate listFields hosted execution readiness

## Background

`tableau.metadata.listFields` is a useful candidate, but its output size, truncation behavior, and permission edge cases make it riskier than `describeDatasource`.

## Goal

Evaluate whether `tableau.metadata.listFields` is ready for hosted execution in v0.8.0 or should be deferred to v0.9.0.

## Scope

- field output size risk
- truncation or omission behavior
- permission or hidden fields
- schema mapping
- hosted error behavior
- whether to implement in v0.8.0 or defer to v0.9.0
- recommendation

## Out of scope

- mandatory hosted `listFields` execution
- arbitrary query
- field values or row data
- underlying data access

## Tasks

- review the hosted risk profile for `listFields`
- compare output shape and safety against `describeDatasource`
- decide whether to implement now or defer
- document the recommendation clearly

## Acceptance criteria

- a clear recommendation is recorded
- the hosted readiness risks are documented
- the v0.9 handoff is explicit if deferred

## Validation

- docs only, or contract tests if limited code is added

## Related issues

- Parent: #{{PARENT_ISSUE_NUMBER}} v0.8.0 Hosted Tableau MCP Metadata Execution
- docs/v0.8-plan.md
- docs/roadmap-v0.7-to-v0.10.md
