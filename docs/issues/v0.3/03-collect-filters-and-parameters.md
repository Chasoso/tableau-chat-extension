# Collect filters and parameters from Tableau Extension API

## Background

Filters and parameters are part of the current Tableau state and should be visible before the AI sees the request.

Adding them to the context preview makes the assistant more grounded in what the user is actually looking at.

## Goal

Extend the frontend dashboard-state collector so it captures filters and parameters from the Tableau Extension API and exposes them in the preview model.

## Scope

- Add filter collection to the current dashboard state.
- Add parameter collection to the current dashboard state.
- Keep the behavior safe for dashboards that do not expose all metadata.
- Add unit or mock coverage for the collector changes.

## Out of scope

- Selected marks collection.
- Summary data preview.
- AI execution.
- Intent resolution.
- Backend API changes.

## Tasks

- Collect filters from the Tableau Extension API.
- Collect parameters from the Tableau Extension API.
- Normalize the result into the preview model.
- Add tests for common and missing-data cases.

## Acceptance criteria

- Filters and parameters are present in the preview model when available.
- Missing data does not break the dashboard experience.
- The collector behavior is covered by tests.

## Validation

- Run the relevant unit tests for the frontend collector layer.
- Verify the preview model receives filters and parameters in a readable shape.

## Related

- [docs/architecture-reset-v0.2.md](../../architecture-reset-v0.2.md)
- [docs/issues/v0.3/00-v0.3.0-tableau-context-first.md](./00-v0.3.0-tableau-context-first.md)
- [docs/issues/v0.3/02-context-preview-model.md](./02-context-preview-model.md)

