# Define tool preconditions

## Background

ToolDefinition and ToolRegistry now exist as contracts, but v0.5.0 still needs a shared precondition model so safety, context, policy, and budget checks can be described consistently.

## Goal

Define the minimal ToolPrecondition contract so tools can express required and optional conditions without implementing full enforcement yet.

## Scope

- ToolPrecondition model
- ToolPreconditionType
- pass / fail / skip / blocked
- selected marks / summary data / availability conditions
- permission / explicit confirmation conditions
- budget / policy conditions
- selected_mark_explanation precondition set

## Out of scope

- full precondition enforcement
- ToolRouter / ExecutionEngine integration
- large write-capable tool expansion

## Tasks

- define precondition and result types
- define selected_mark_explanation preconditions
- add a minimal deterministic evaluator for contract tests

## Acceptance criteria

- preconditions are JSON-safe
- required / optional conditions are represented
- selected_mark_explanation conditions are represented
- pass / fail / skip / blocked are clearly distinguishable

## Validation

- contract tests pass
- existing orchestration behavior is unchanged

## Related

- #51 v0.5.0 Tool Layer Rebuild
- docs/v0.5-tool-layer-rebuild-plan.md
