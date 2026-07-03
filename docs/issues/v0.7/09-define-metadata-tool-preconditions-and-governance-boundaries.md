# Define metadata tool preconditions and governance boundaries

## Background

Metadata tools should fail safely when identifiers are ambiguous, auth is missing, or the requested operation falls outside the allowed policy.

## Goal

Define the preconditions and governance checks that must pass before metadata tools execute.

## Scope

- authenticated Tableau context
- site / workbook / view / datasource resolution
- datasource ambiguity handling
- allowed tool policy
- read-only operation check
- safeForPreviewOnly policy
- budget / timeout precondition
- permission / capability notes
- fallback and user-facing messages

## Out of scope

- full permission implementation
- write operation support
- underlying data access

## Tasks

- define the precondition checks that guard metadata tools
- decide how ambiguous identifiers should fail
- document the safe fallback and user-facing messaging behavior
- keep governance checks separate from execution details

## Acceptance criteria

- the precondition boundary is documented
- ambiguous and unauthorized cases have safe outcomes
- governance checks are clearly separated from transport concerns

## Validation

- precondition contract tests if code is added

## Related issues

- Parent: #125 v0.7.0 Hosted Tableau MCP Migration Foundation
- docs/roadmap-v0.7-to-v0.10.md
- Main doc: docs/v0.7-metadata-tool-preconditions-governance.md

