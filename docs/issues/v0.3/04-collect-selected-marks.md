# Collect selected marks from Tableau worksheets

## Background

Selected marks are one of the most valuable context signals in a Tableau dashboard.

If the extension can capture selected marks reliably, the AI context preview becomes much more useful and can later support "explain this selection" style actions.

## Goal

Add selected-marks collection to the dashboard-state pipeline and expose a bounded preview representation.

## Scope

- Collect selected marks from Tableau worksheets.
- Handle multiple worksheets safely.
- Handle empty selection states safely.
- Limit preview size so the UI stays readable.

## Out of scope

- Automatic AI execution on selection changes.
- Intent resolver implementation.
- Tool routing.
- Summary data preview.
- Backend API changes.

## Tasks

- Implement selected-marks collection from worksheets.
- Define limits for preview output size.
- Normalize the result into the preview model.
- Add tests for multi-worksheet and empty-selection cases.

## Acceptance criteria

- Selected marks are available in the context preview when present.
- The collector behaves safely when there is no current selection.
- The preview size is bounded.
- Tests cover the expected edge cases.

## Validation

- Run the relevant unit tests for the selected-marks collector.
- Manually verify the preview shape for a dashboard with and without selection.

## Related

- [docs/architecture-reset-v0.2.md](../../architecture-reset-v0.2.md)
- [docs/issues/v0.3/00-v0.3.0-tableau-context-first.md](./00-v0.3.0-tableau-context-first.md)
- [docs/issues/v0.3/02-context-preview-model.md](./02-context-preview-model.md)

