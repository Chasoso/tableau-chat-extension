# Connect selected-mark action to intent

## Background

The frontend already shows a selected-mark action suggestion, but it only pre-fills the chat input today.

v0.4.0 should add a safe orchestration entry so the action can request `selected_mark_explanation` explicitly.

## Goal

Connect the selected-mark action suggestion to a backend orchestration request without auto-sending a normal chat job.

## Scope

- Add a safe frontend-to-backend orchestration request path for selected-mark actions.
- Preserve the user's explicit click as the only trigger.
- Keep the existing chat job flow intact.

## Out of scope

- Auto execution on panel render
- General chat flow replacement
- Multiple new action types

## Tasks

- Define the frontend payload for the selected-mark action.
- Add a backend entry path that can accept the action metadata.
- Keep the action request separate from the normal text chat submission path.
- Add tests that confirm there is no auto-send behavior.

## Acceptance criteria

- Clicking the selected-mark action can trigger an orchestration request.
- The normal chat job flow still requires an explicit message send.
- No automatic AI execution happens on render or selection change.

## Validation

- Confirm the action still works as a user-driven operation only.
- Confirm the existing chat input behavior is unchanged.

## Related

- [docs/v0.4-structured-orchestration-plan.md](../../v0.4-structured-orchestration-plan.md)
- [frontend/src/components/AIContextPreviewPanel.tsx](../../../frontend/src/components/AIContextPreviewPanel.tsx)
- [frontend/src/App.tsx](../../../frontend/src/App.tsx)

