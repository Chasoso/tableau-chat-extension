# Add summary data preview collector

## Background

Summary data preview gives the user and the AI a compact view of the current dashboard data without pulling in the full underlying dataset.

This is useful for context awareness while staying within a small, preview-friendly surface.

## Goal

Add a bounded summary-data preview collector and expose the result in the frontend preview model.

## Scope

- Collect summary data preview.
- Define row and column limits.
- Keep the collector preview-only.
- Avoid underlying-data expansion.

## Out of scope

- Underlying data extraction.
- Tool routing.
- AI execution.
- Full analytical query planning.

## Tasks

- Implement the summary data preview collector.
- Set limits for rows and columns.
- Normalize the collector output into the preview model.
- Add tests for bounded preview behavior.

## Acceptance criteria

- Summary data preview appears when available.
- The preview is bounded and readable.
- Underlying data is not fetched.
- Tests cover the collector behavior.

## Validation

- Run the relevant unit tests for the summary preview collector.
- Confirm the preview size remains small and deterministic.

## Related

- [docs/architecture-reset-v0.2.md](../../architecture-reset-v0.2.md)
- [docs/issues/v0.3/00-v0.3.0-tableau-context-first.md](./00-v0.3.0-tableau-context-first.md)
- [docs/issues/v0.3/02-context-preview-model.md](./02-context-preview-model.md)

