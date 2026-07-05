# v0.10.0 Issue Set

This directory is reserved for v0.10.0 milestone planning references.

## Purpose

- v0.10.0 chooses between LLM ResponseComposer and Exploration Session.
- Issue 1 is the branch decision issue and selected LLM ResponseComposer.
- Branch A and Branch B are alternatives, not both mandatory implementation tracks.
- AgentCore remains deferred.

## Parent issue

- `v0.10.0 LLM ResponseComposer or Exploration Session`

## Child issues

Selected branch: LLM ResponseComposer

Planned child issue titles, in order:

1. `#209 v0.10.0 planning and branch decision`
2. `#210 Define LLM ResponseComposer safety boundary`
3. `Define response material contract for LLM composition`
4. `Add guarded LLM ResponseComposer prototype`
5. `Add LLM ResponseComposer fallback and regression tests`
6. `Document LLM ResponseComposer result`
7. `v0.10.0 wrap-up`

Issue numbers will be assigned by GitHub when the script is run.

## Dependency map

- Child issue 1 depends on the parent issue and records the branch decision.
- Child issues 2-6 depend on branch A being selected.
- Child issue 7 closes out the milestone after the selected branch is complete.
- The Exploration Session path is deferred to a later milestone unless the decision is revisited.

## Branch positions

### Branch A

LLM ResponseComposer focuses on safer natural-language composition while keeping a deterministic baseline.

### Branch B

Exploration Session focuses on safe session continuity for selected marks, metadata discovery, and interaction history.

### Selected path

Branch A is selected for v0.10.0.

The initial focus is to keep the deterministic baseline while improving user-facing summary and explanation quality with optional guarded composition.

The LLM ResponseComposer safety boundary is documented in `docs/v0.10-llm-response-composer-safety-boundary.md`.

The response material contract for `#211 Define response material contract for LLM composition` is documented in `docs/v0.10-llm-response-material-contract.md`.

### Deferred path

Branch B is deferred for now.

It can be revisited in a later milestone if session continuity becomes the stronger product need.

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
- The wrap-up issue closes the selected branch path for v0.10.0.
