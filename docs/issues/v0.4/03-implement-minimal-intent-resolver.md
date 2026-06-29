# Implement minimal IntentResolver

## Background

Once the contract exists, we need one deterministic path that can resolve the selected-mark action into a backend intent.

This is the safest place to start because the frontend already emits a clear user action and does not need free-form intent interpretation for the first step.

## Goal

Implement a minimal deterministic `IntentResolver` for the `selected_mark_explanation` path.

## Scope

- Resolve the selected-mark action suggestion into `selected_mark_explanation`.
- Preserve a fallback when the request cannot be resolved safely.
- Keep the resolver deterministic and easy to trace.

## Out of scope

- General LLM intent classification
- Multi-intent support
- Plan execution
- Tool routing

## Tasks

- Implement a resolver that can read action metadata from the frontend request.
- Return a resolved intent for the selected-mark explanation path.
- Return a fallback or unsupported result when the request is not actionable.
- Add tests for deterministic resolution and fallback behavior.

## Acceptance criteria

- The selected-mark action can resolve to `selected_mark_explanation`.
- Unsupported actions are handled safely.
- The resolver remains deterministic.

## Validation

- Unit tests cover the selected-mark path and at least one fallback path.
- The implementation does not change the existing chat job behavior.

## Related

- [docs/v0.4-structured-orchestration-plan.md](../../v0.4-structured-orchestration-plan.md)
- [docs/issues/v0.4/02-define-intent-resolver-contract.md](./02-define-intent-resolver-contract.md)

