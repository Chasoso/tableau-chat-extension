# Define metadata tool input and output schemas

## Background

Read-only metadata tools still need explicit schema boundaries so they can stay JSON-safe, summary-first, and resistant to raw result leakage.

## Goal

Define the input and output schema boundaries for the metadata tools.

## Scope

- datasource / workbook / view identifiers
- field list boundaries
- row / column limits where applicable
- ambiguity fields
- result summary
- truncated / omitted flags
- warning / error summary
- JSON-safe output
- no raw MCP result exposure

## Out of scope

- real MCP execution
- arbitrary query schema
- raw data output

## Tasks

- define the minimum input required by each metadata tool
- define the summary-first output shape
- include truncation and omission signals
- prevent raw result blobs from leaking through the schema

## Acceptance criteria

- the input and output boundaries are explicit
- the schema stays JSON-safe
- raw MCP results are not exposed directly

## Validation

- contract tests if code is added

## Related issues

- Parent: #125 v0.7.0 Hosted Tableau MCP Migration Foundation
- docs/roadmap-v0.7-to-v0.10.md
- docs/v0.7-metadata-tool-input-output-schemas.md
