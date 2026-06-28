# Frontend Tableau context collector audit

## Background

v0.3.0 starts by strengthening the Tableau context that the extension can already observe.

Before adding more UI or AI behavior, we need to audit what the Tableau Extension can currently read, what is already wired, and what context is still missing.

## Goal

Create a clear inventory of existing Tableau Extension API usage and identify the minimum collector changes needed for the v0.3.0 context-first path.

## Scope

- Review existing Tableau Extension API call sites.
- Document the current dashboard context that is already being captured.
- Identify gaps for filters, parameters, selected marks, and summary data preview.
- Align the current frontend context shape with backend `ContextPack` naming.
- Keep the result usable as the source for follow-up implementation work.

## Out of scope

- New UI surfaces.
- Backend API changes.
- Intent resolution.
- Plan construction.
- Tool routing.
- AI execution.

## Tasks

- Inventory current Tableau Extension API usage in the frontend.
- Map which dashboard-state fields are already available today.
- Identify the exact collector gaps for v0.3.0.
- Document compatibility points with backend `ContextPack`.
- Capture follow-up implementation notes for the next collector issues.

## Acceptance criteria

- The current Tableau context collection surface is documented.
- Missing context pieces are clearly identified.
- The audit output can be used to drive the follow-up collector issues.
- No runtime behavior changes are required for completion.

## Validation

- Review the audit notes for completeness.
- Confirm the identified gaps map cleanly to the other v0.3.0 child issues.

## Related

- [docs/architecture-reset-v0.2.md](../../architecture-reset-v0.2.md)
- [docs/issues/v0.3/00-v0.3.0-tableau-context-first.md](./00-v0.3.0-tableau-context-first.md)

