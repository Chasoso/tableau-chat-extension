# Add selected mark action suggestions

## Background

When a user selects marks, the extension should be able to suggest context-aware actions instead of waiting for a generic chat prompt.

This keeps the v0.3.0 experience focused on Tableau context first.

## Goal

Show lightweight action suggestions when selected marks are present, such as "explain this selection".

## Scope

- Detect when selected marks exist in the current preview state.
- Show a small set of context-aware actions.
- Keep the suggestions UI-only for v0.3.0.
- Do not connect the suggestions to intent resolution yet.

## Out of scope

- AI execution.
- Intent resolver integration.
- Plan builder integration.
- Tool routing.
- Fixed plan execution wiring.

## Tasks

- Define the suggestion rules for selected-mark presence.
- Add the UI affordance for suggested actions.
- Keep the behavior non-destructive and easy to ignore.
- Add tests for the display logic if practical.

## Acceptance criteria

- The UI shows a sensible action suggestion when marks are selected.
- The suggestions do not trigger AI execution by themselves.
- The behavior is limited to v0.3.0 preview-level UX.

## Validation

- Verify the suggestion appears when selected marks are available.
- Verify the suggestion does not appear when no selection exists.

## Related

- [docs/architecture-reset-v0.2.md](../../architecture-reset-v0.2.md)
- [docs/issues/v0.3/00-v0.3.0-tableau-context-first.md](./00-v0.3.0-tableau-context-first.md)
- [docs/issues/v0.3/02-context-preview-model.md](./02-context-preview-model.md)

