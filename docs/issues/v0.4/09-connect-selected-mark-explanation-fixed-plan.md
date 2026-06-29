# Connect selected_mark_explanation fixed plan

## Background

The minimal orchestrator needs one concrete path to prove the structured model works.

The selected-mark explanation flow is the best first candidate because the frontend already exposes a safe action suggestion for it.

## Goal

Connect the `selected_mark_explanation` intent to a fixed plan and run it through the minimal orchestration path.

## Scope

- Select the fixed plan for `selected_mark_explanation`.
- Execute the plan through the new orchestration path.
- Keep the legacy lightweight loop in place for other requests.

## Out of scope

- Broad multi-intent support
- Full replacement of `runLightweightAgentLoop`
- AgentCore migration

## Tasks

- Map the selected-mark action to `selected_mark_explanation`.
- Bind the intent to the fixed plan.
- Execute the plan through the minimal engine and trace it.
- Return the composed response to the existing UI flow.

## Acceptance criteria

- The selected-mark explanation path runs end to end through structured orchestration.
- The legacy flow still exists for non-target requests.
- The implementation stays narrow and deterministic.

## Validation

- Confirm the selected-mark explanation path works with explicit user action.
- Confirm other chat behavior is unchanged.

## Related

- [docs/v0.4-structured-orchestration-plan.md](../../v0.4-structured-orchestration-plan.md)
- [docs/issues/v0.4/03-implement-minimal-intent-resolver.md](./03-implement-minimal-intent-resolver.md)
- [docs/issues/v0.4/06-add-execution-engine-skeleton.md](./06-add-execution-engine-skeleton.md)

