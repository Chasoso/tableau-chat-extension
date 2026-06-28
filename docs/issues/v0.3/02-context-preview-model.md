# Define frontend context preview model

## Background

The v0.3.0 UI needs a stable data model for showing Tableau context before any AI execution.

That model should feel like a frontend-facing version of backend `ContextPack`, not a one-off UI structure.

## Goal

Define the preview model that the frontend uses to represent dashboard state, selected marks, filters, parameters, and summary data preview.

## Scope

- Define the frontend context preview types.
- Keep naming and structure aligned with backend `ContextPack`.
- Model the data in a way that can be rendered directly by the preview UI.
- Avoid tying the model to orchestration or tool execution details.

## Out of scope

- Actual Tableau API data collection.
- Preview panel rendering.
- Intent resolution.
- Tool routing.
- Execution engine work.

## Tasks

- Define the preview model and its nested sections.
- Map the preview model to backend `ContextPack` concepts.
- Document any normalization rules needed for rendering.
- Add a minimal test or type-level check if useful.

## Acceptance criteria

- The frontend has a stable context preview model.
- The model is easy to map from Tableau API output.
- The model is aligned with backend `ContextPack` terminology.
- The model does not include execution concerns.

## Validation

- Review the type definitions for consistency with backend `ContextPack`.
- Confirm the model is suitable for the preview panel and selected-mark suggestions.

## Related

- [docs/architecture-reset-v0.2.md](../../architecture-reset-v0.2.md)
- [docs/issues/v0.3/00-v0.3.0-tableau-context-first.md](./00-v0.3.0-tableau-context-first.md)

