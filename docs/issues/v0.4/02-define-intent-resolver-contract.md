# Define IntentResolver contract

## Background

v0.4.0 needs a deterministic way to convert a user-facing orchestration request into a backend intent.

The first target is the selected-mark action suggestion path, so the contract must be simple and explicit.

## Goal

Define the `IntentResolver` interface, input/output types, confidence model, and fallback behavior without implementing LLM-based classification.

## Scope

- Define the `IntentResolver` contract.
- Define the minimal input payload for orchestration requests.
- Define output fields for resolved intent, confidence, and fallback.
- Keep the contract compatible with the `selected_mark_explanation` path.

## Out of scope

- Full resolver implementation
- LLM-based intent classification
- Plan execution
- Tool routing

## Tasks

- Define the input shape for an orchestration request.
- Define the output shape for resolved intents and fallbacks.
- Define how confidence and reason metadata are represented.
- Make sure the contract can support deterministic UI action routing.

## Acceptance criteria

- `IntentResolver` has a stable interface.
- The contract can represent resolved, unresolved, and fallback cases.
- The contract can support the selected-mark action suggestion path.

## Validation

- Confirm the contract is narrow enough to implement in one later PR.
- Confirm it does not require any frontend or tool execution changes.

## Related

- [docs/v0.4-structured-orchestration-plan.md](../../v0.4-structured-orchestration-plan.md)
- [docs/v0.3-context-collector-audit.md](../../v0.3-context-collector-audit.md)

