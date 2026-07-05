# v0.10.0 Issue Set

This directory is reserved for v0.10.0 milestone planning references.

## Purpose

- v0.10.0 chooses between LLM ResponseComposer and Exploration Session.
- Issue 1 is the branch decision issue.
- Branch A and Branch B are alternatives, not both mandatory implementation tracks.
- AgentCore remains deferred.

## Parent issue

- `v0.10.0 LLM ResponseComposer or Exploration Session`

## Child issues

Planned child issue titles, in order:

1. `v0.10.0 planning and branch decision`
2. `Define LLM ResponseComposer safety boundary`
3. `Define response material contract for LLM composition`
4. `Add guarded LLM ResponseComposer prototype`
5. `Add LLM ResponseComposer fallback and regression tests`
6. `Document LLM ResponseComposer result`
7. `Define Exploration Session safety boundary`
8. `Define session state schema and lifecycle`
9. `Add minimal Exploration Session prototype`
10. `Add Exploration Session fallback and regression tests`
11. `Document Exploration Session result`
12. `v0.10.0 wrap-up`

Issue numbers will be assigned by GitHub when the script is run.

## Dependency map

- Child issue 1 depends on the parent issue and records the branch decision.
- Child issues 2-6 depend on branch A being selected.
- Child issues 7-11 depend on branch B being selected.
- Child issue 12 depends on completion of the selected branch and closes out the milestone.

## Branch positions

### Branch A

LLM ResponseComposer focuses on safer natural-language composition while keeping a deterministic baseline.

### Branch B

Exploration Session focuses on safe session continuity for selected marks, metadata discovery, and interaction history.

## Safety boundaries

- no raw MCP tool exposure
- no raw MCP output exposure
- no raw transport output exposure
- no arbitrary query execution
- no underlying data access
- no field values / row data retrieval
- no write-capable tools
- no tokens / secrets / stack traces in user-facing output or traces
- default tests must remain no-network
- hosted or real LLM or real session-store integration must remain optional or gated
- `selected_mark_explanation` must remain protected
- legacy free-form chat fallback must remain available unless explicitly changed later
- AgentCore remains deferred

## Script

Create the milestone issues from the repository root with:

```bash
bash scripts/create-v0.10-issues.sh
```

The script expects `gh auth status` to succeed and will use the configured milestone and labels when available.

## Notes

- Update this README with the created issue numbers after the script runs if desired.
- Keep the branch decision issue first so the milestone can switch direction cleanly before implementation starts.
