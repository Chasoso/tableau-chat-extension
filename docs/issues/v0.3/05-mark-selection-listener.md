# Add MarkSelectionChanged listener

## Background

v0.3.0 should react to Tableau user actions, not only to chat input.

Listening for mark selection changes lets the extension keep the preview in sync with the user's current focus.

## Goal

Register a `MarkSelectionChanged` listener on worksheets and use it to refresh the context preview state.

## Scope

- Add the Tableau worksheet listener.
- Refresh preview state when the selection changes.
- Keep the behavior read-only from the AI perspective.
- Do not trigger AI execution automatically.

## Out of scope

- LLM invocation.
- Intent resolution.
- Plan building.
- Tool routing.
- Fixed plan execution wiring.

## Tasks

- Register the selection listener on the relevant worksheets.
- Update preview state when the listener fires.
- Ensure the listener is resilient to empty or repeated events.
- Add tests or mock coverage if the current setup allows it.

## Acceptance criteria

- The extension reacts to mark selection changes.
- The context preview updates when the selection changes.
- No AI run is started automatically.

## Validation

- Verify the listener updates the preview state on a mocked selection change.
- Confirm the dashboard remains usable when the selection listener receives empty or repeated updates.

## Related

- [docs/architecture-reset-v0.2.md](../../architecture-reset-v0.2.md)
- [docs/issues/v0.3/00-v0.3.0-tableau-context-first.md](./00-v0.3.0-tableau-context-first.md)
- [docs/issues/v0.3/02-context-preview-model.md](./02-context-preview-model.md)

