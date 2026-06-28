# Add AI Context Preview panel

## Background

The user should be able to see what context will be passed to AI before any assistant logic runs.

That makes the extension feel more grounded in Tableau state and helps users understand why the assistant will answer the way it does.

## Goal

Add a read-only AI Context Preview panel that displays the current preview model.

## Scope

- Render dashboard context in the UI.
- Show filters, parameters, selected marks, and summary data preview.
- Keep the panel read-only in v0.3.0.
- Reuse the frontend context preview model.

## Out of scope

- AI execution.
- Automatic prompt submission.
- Intent resolver integration.
- Tool execution.

## Tasks

- Build the preview panel UI.
- Render the available context sections clearly.
- Keep the panel aligned with the preview model.
- Add minimal UI coverage if practical in the current test setup.

## Acceptance criteria

- The user can inspect the current AI context before sending a request.
- The panel reflects the current Tableau state.
- The panel does not start AI execution.

## Validation

- Verify the panel renders the preview model correctly.
- Confirm the panel updates when the underlying context changes.

## Related

- [docs/architecture-reset-v0.2.md](../../architecture-reset-v0.2.md)
- [docs/issues/v0.3/00-v0.3.0-tableau-context-first.md](./00-v0.3.0-tableau-context-first.md)
- [docs/issues/v0.3/02-context-preview-model.md](./02-context-preview-model.md)

