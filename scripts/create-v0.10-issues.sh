#!/usr/bin/env bash
set -euo pipefail

# Prerequisites:
# - gh CLI is installed
# - gh auth status succeeds for the target GitHub account
# - run from the repository root

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

REPO="${REPO:-Chasoso/tableau-chat-extension}"
MILESTONE="${MILESTONE:-v0.10.0}"
COMMON_LABELS_CSV="${COMMON_LABELS:-planning,docs}"
CODE_LABELS_CSV="${CODE_LABELS:-enhancement,backend}"
TEST_LABELS_CSV="${TEST_LABELS:-test,backend}"
DOCS_LABELS_CSV="${DOCS_LABELS:-docs}"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

AVAILABLE_LABELS=""
AVAILABLE_MILESTONES=""
MILESTONE_ARGS=()
LABEL_ARGS=()

trim_value() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

load_repo_metadata() {
  AVAILABLE_LABELS="$(
    gh label list --repo "$REPO" --limit 500 --json name --jq '.[].name' 2>/dev/null || true
  )"
  AVAILABLE_MILESTONES="$(
    gh milestone list --repo "$REPO" --limit 200 --json title --jq '.[].title' 2>/dev/null || true
  )"
}

build_milestone_args() {
  MILESTONE_ARGS=()
  if [[ -z "$MILESTONE" || "$MILESTONE" == "none" ]]; then
    return 0
  fi

  if grep -Fxq "$MILESTONE" <<<"$AVAILABLE_MILESTONES"; then
    MILESTONE_ARGS=(--milestone "$MILESTONE")
  else
    printf 'Warning: milestone "%s" not found, creating issues without a milestone\n' "$MILESTONE" >&2
  fi
}

build_label_args() {
  local csv="$1"
  LABEL_ARGS=()

  if [[ -z "$csv" ]]; then
    return 0
  fi

  local -a requested=()
  IFS=',' read -r -a requested <<<"$csv"

  local raw_label label
  for raw_label in "${requested[@]}"; do
    label="$(trim_value "$raw_label")"
    [[ -z "$label" ]] && continue

    if [[ -n "$AVAILABLE_LABELS" ]] && grep -Fxq "$label" <<<"$AVAILABLE_LABELS"; then
      LABEL_ARGS+=("--label" "$label")
    else
      printf 'Warning: label "%s" not found in repo, skipping\n' "$label" >&2
    fi
  done
}

issue_create() {
  local title="$1"
  local body_file="$2"
  local labels_csv="$3"

  build_label_args "$labels_csv"

  gh issue create \
    --repo "$REPO" \
    --title "$title" \
    --body-file "$body_file" \
    "${MILESTONE_ARGS[@]}" \
    "${LABEL_ARGS[@]}"
}

shared_safety_boundaries() {
  cat <<'EOF'
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
EOF
}

shared_related_docs() {
  cat <<'EOF'
- `docs/v0.10-plan.md`
- `docs/v0.9-wrap-up.md`
- `docs/v0.9-structured-discovery-result.md`
- `docs/v0.9-plan.md`
- `docs/roadmap-v0.7-to-v0.10.md`
- `docs/issues/v0.9/README.md`
EOF
}

llm_safety_boundaries() {
  cat <<'EOF'
- deterministic ResponseComposer remains baseline
- LLM composition is optional / guarded
- evidence-bounded response material only
- fallback to deterministic composer on failure / timeout / unsafe output
- no LLM-generated Tableau MCP query execution
EOF
}

session_safety_boundaries() {
  cat <<'EOF'
- no uncontrolled memory
- no sensitive raw data persistence
- session lifecycle must be explicit
- session state must be JSON-safe
- stale context / invalidation / expiration must be handled
- no underlying data / row data / field values in session state
EOF
}

make_parent_body() {
  cat <<EOF
# v0.10.0 LLM ResponseComposer or Exploration Session

## Summary

v0.10.0 is the next milestone after the v0.9.0 structured discovery result.

Its job is to choose between LLM ResponseComposer and Exploration Session while preserving the v0.9.0 safety boundary.

AgentCore full migration remains out of scope.

## Background

v0.9.0 completed the narrow structured metadata discovery path and left the legacy fallback intact.

The milestone result shows that the repository now has a safe, auditable boundary for the next decision, but not yet the next user-experience direction.

## Scope

- decide between the two alternative branches
- keep the choice explicit before implementation starts
- preserve the v0.9.0 safety boundaries
- keep the branch that is not chosen deferred

## Out of scope

- implementing both branches at once
- AgentCore full migration
- broad Hosted MCP exposure
- arbitrary query execution
- underlying data access
- field values / row data retrieval
- write-capable tools
- frontend redesign
- default hosted CI changes

## Proposed tasks

- create a planning and branch decision issue first
- compare LLM ResponseComposer and Exploration Session against current evidence
- choose the branch that best matches the current product need
- record the decision in the plan and wrap-up docs
- keep AgentCore deferred

## Acceptance criteria

- the milestone has a clear branch decision path
- the selected branch is explicit
- the unselected branch is explicitly deferred
- the safety boundaries from v0.9.0 remain intact

## Validation

- docs review only

## Safety boundaries

$(shared_safety_boundaries)

## Parent issue reference

This is the parent issue for v0.10.0.

## Related docs

$(shared_related_docs)
EOF
}

make_planning_body() {
  cat <<EOF
# v0.10.0 planning and branch decision

## Summary

Compare LLM ResponseComposer and Exploration Session, then decide which branch v0.10.0 should pursue.

## Background

v0.9.0 already solved the structured discovery boundary and preserved the legacy fallback path.

This issue turns the v0.10.0 branch choice into an explicit decision instead of an implicit drift.

## Scope

- review the v0.9.0 result and wrap-up
- compare both candidate branches
- choose the preferred branch
- record the decision in `docs/v0.10-plan.md`
- update the milestone README with the selected path

## Out of scope

- full implementation of either branch
- AgentCore migration
- broad Hosted MCP expansion
- arbitrary query execution
- underlying data access
- field values / row data retrieval
- write-capable tools

## Proposed tasks

- compare the two options against current product pain
- decide whether response quality or workflow continuity is the stronger need
- capture the decision in the plan document
- keep the unselected branch deferred
- reaffirm that AgentCore remains deferred

## Acceptance criteria

- the branch choice is explicit
- the reason for the choice is documented
- the unselected branch is deferred rather than silently dropped
- the milestone can proceed without reopening v0.9.0 safety decisions

## Validation

- docs review only

## Safety boundaries

$(shared_safety_boundaries)

## Parent issue reference

Part of ${PARENT_URL}

## Related docs

$(shared_related_docs)
EOF
}

make_llm_boundary_body() {
  cat <<EOF
# Define LLM ResponseComposer safety boundary

## Summary

Define the safety boundary for an optional, guarded LLM ResponseComposer while keeping the deterministic composer baseline.

## Background

This issue belongs to Branch A and should only proceed if the branch decision selects LLM ResponseComposer.

The goal is to improve wording without weakening evidence discipline or exposing raw tool data.

## Scope

- define the deterministic baseline
- define the guarded LLM composition boundary
- define the evidence-bounded prompt and output material boundary
- define the failure and timeout fallback rule

## Out of scope

- full Exploration Session implementation
- AgentCore migration
- raw MCP exposure
- arbitrary query generation
- underlying data access
- field values / row data retrieval
- write-capable tools

## Proposed tasks

- document the response-composition boundary
- define what input the composer may see
- define what output the composer may produce
- define fallback behavior on unsafe or failed composition

## Acceptance criteria

- deterministic composition remains the default baseline
- LLM composition is optional and guarded
- no raw MCP or transport output is passed to the composer
- no LLM-generated Tableau MCP query execution is introduced

## Validation

- backend lint / typecheck / tests when code is added
- no-network defaults must remain intact

## Safety boundaries

$(shared_safety_boundaries)
$(llm_safety_boundaries)

## Parent issue reference

Part of ${PARENT_URL}

## Related docs

$(shared_related_docs)
EOF
}

make_llm_material_body() {
  cat <<EOF
# Define response material contract for LLM composition

## Summary

Define the safe response material that may be passed into an optional LLM ResponseComposer.

## Background

This issue belongs to Branch A and should only proceed if the branch decision selects LLM ResponseComposer.

The contract must keep the LLM grounded in structured discovery results, selected-mark explanations, and safe trace summaries only.

## Scope

- define the response material contract
- define what evidence and citations may be included
- define what limitation notes may be included
- define what must never be included

## Out of scope

- full Exploration Session implementation
- AgentCore migration
- raw MCP output
- raw transport output
- underlying data
- field values / row data
- arbitrary query generation

## Proposed tasks

- specify the material available to the composer
- specify evidence IDs or citation-style references if needed
- specify limitation notes and safety notes
- specify the redaction and suppression rules

## Acceptance criteria

- the material is JSON-safe
- the material is evidence-bounded
- the material does not include raw MCP or transport payloads
- the material does not include field values, row data, or underlying data

## Validation

- backend lint / typecheck / tests when code is added
- no-network defaults must remain intact

## Safety boundaries

$(shared_safety_boundaries)
$(llm_safety_boundaries)

## Parent issue reference

Part of ${PARENT_URL}

## Related docs

$(shared_related_docs)
EOF
}

make_llm_prototype_body() {
  cat <<EOF
# Add guarded LLM ResponseComposer prototype

## Summary

Prototype an optional, guarded LLM ResponseComposer while keeping the deterministic fallback path intact.

## Background

This issue belongs to Branch A and should only proceed if the branch decision selects LLM ResponseComposer.

The prototype should prove that composition can be optional without forcing a hosted or networked dependency into default tests.

## Scope

- add a guarded prototype implementation
- keep deterministic fallback available
- keep no-network testability
- keep the feature behind config or flag gates

## Out of scope

- full Exploration Session implementation
- AgentCore migration
- raw MCP exposure
- arbitrary query generation
- underlying data access
- field values / row data retrieval
- write-capable tools

## Proposed tasks

- add a minimal prototype path
- keep deterministic fallback as the default
- wire fake composer behavior for no-network tests
- avoid introducing any default hosted dependency

## Acceptance criteria

- the prototype is disabled by default or otherwise gated
- the deterministic fallback still works when composition is unavailable
- no-network tests still pass without hosted dependencies

## Validation

- backend lint / typecheck / tests
- no-network tests remain the default path

## Safety boundaries

$(shared_safety_boundaries)
$(llm_safety_boundaries)

## Parent issue reference

Part of ${PARENT_URL}

## Related docs

$(shared_related_docs)
EOF
}

make_llm_tests_body() {
  cat <<EOF
# Add LLM ResponseComposer fallback and regression tests

## Summary

Add regression tests that keep the deterministic fallback path intact when LLM composition fails, times out, or produces unsafe output.

## Background

This issue belongs to Branch A and should only proceed if the branch decision selects LLM ResponseComposer.

The tests must prove that the optional LLM layer does not break structured discovery, selected-mark explanation, or the legacy fallback path.

## Scope

- add fallback regression tests
- add unsafe output regression tests
- add timeout or failure regression tests
- preserve no-network defaults

## Out of scope

- full Exploration Session implementation
- AgentCore migration
- raw MCP exposure
- arbitrary query generation
- underlying data access
- field values / row data retrieval
- write-capable tools

## Proposed tasks

- verify deterministic fallback remains available
- verify failure and timeout paths fall back safely
- verify unsafe output does not escape the boundary
- verify selected_mark_explanation and metadata_discovery stay protected

## Acceptance criteria

- deterministic fallback always remains available
- unsafe or failed composition falls back safely
- selected_mark_explanation remains protected
- free-form fallback remains available where it should

## Validation

- backend lint / typecheck / tests
- no-network tests remain the default path

## Safety boundaries

$(shared_safety_boundaries)
$(llm_safety_boundaries)

## Parent issue reference

Part of ${PARENT_URL}

## Related docs

$(shared_related_docs)
EOF
}

make_llm_result_body() {
  cat <<EOF
# Document LLM ResponseComposer result

## Summary

Document the branch A outcome after the LLM ResponseComposer work is complete.

## Background

This issue belongs to Branch A and should only proceed if the branch decision selects LLM ResponseComposer.

The result document should capture what was enabled, what remained disabled, and how fallback behavior was preserved.

## Scope

- document the branch result
- record enabled and disabled behavior
- record the fallback path
- record the safety and evidence discipline

## Out of scope

- additional feature implementation
- AgentCore migration
- raw MCP exposure
- arbitrary query generation
- underlying data access
- field values / row data retrieval
- write-capable tools

## Proposed tasks

- summarize the implementation outcome
- document fallback and error handling
- document the remaining risks
- document the no-network posture

## Acceptance criteria

- the branch result is documented clearly
- fallback behavior is recorded
- remaining risks are listed
- the decision record stays audit-friendly

## Validation

- docs review only

## Safety boundaries

$(shared_safety_boundaries)
$(llm_safety_boundaries)

## Parent issue reference

Part of ${PARENT_URL}

## Related docs

$(shared_related_docs)
EOF
}

make_session_boundary_body() {
  cat <<EOF
# Define Exploration Session safety boundary

## Summary

Define the safety boundary for an optional Exploration Session while keeping raw data and uncontrolled memory out of scope.

## Background

This issue belongs to Branch B and should only proceed if the branch decision selects Exploration Session.

The goal is to support exploration continuity without storing sensitive or unbounded state.

## Scope

- define what session state may contain
- define what session state must never contain
- define the lifecycle boundary
- define expiration and invalidation behavior

## Out of scope

- full LLM ResponseComposer implementation
- AgentCore migration
- raw MCP exposure
- arbitrary query execution
- underlying data access
- field values / row data retrieval
- write-capable tools

## Proposed tasks

- define the session safety boundary
- define the session lifecycle
- define reset, expiration, and invalidation rules
- define JSON-safe session summaries

## Acceptance criteria

- no uncontrolled memory is introduced
- no sensitive raw data is persisted
- the session lifecycle is explicit
- session state remains JSON-safe

## Validation

- backend lint / typecheck / tests when code is added
- no-network defaults must remain intact

## Safety boundaries

$(shared_safety_boundaries)
$(session_safety_boundaries)

## Parent issue reference

Part of ${PARENT_URL}

## Related docs

$(shared_related_docs)
EOF
}

make_session_schema_body() {
  cat <<EOF
# Define session state schema and lifecycle

## Summary

Define the schema and lifecycle for Exploration Session state.

## Background

This issue belongs to Branch B and should only proceed if the branch decision selects Exploration Session.

The schema should support safe continuity without storing raw values or sensitive payloads.

## Scope

- define the session state schema
- define state transitions and invalidation
- define reset and expiration behavior
- define safe summaries for selected marks and metadata discovery

## Out of scope

- full LLM ResponseComposer implementation
- AgentCore migration
- raw MCP output
- underlying data
- field values / row data
- arbitrary query execution

## Proposed tasks

- define the JSON-safe session schema
- define the lifecycle and expiry rules
- define invalidation and stale-context handling
- define safe serialization requirements

## Acceptance criteria

- the session schema is explicit and JSON-safe
- stale context can be invalidated or reset safely
- no raw data is stored in the session state
- the lifecycle is easy to test in no-network mode

## Validation

- backend lint / typecheck / tests when code is added
- no-network tests remain the default path

## Safety boundaries

$(shared_safety_boundaries)
$(session_safety_boundaries)

## Parent issue reference

Part of ${PARENT_URL}

## Related docs

$(shared_related_docs)
EOF
}

make_session_prototype_body() {
  cat <<EOF
# Add minimal Exploration Session prototype

## Summary

Prototype a minimal Exploration Session that can hold safe summaries while keeping raw data out of state.

## Background

This issue belongs to Branch B and should only proceed if the branch decision selects Exploration Session.

The prototype should prove that state continuity can be introduced without forcing a hosted or networked dependency into default tests.

## Scope

- add a minimal session prototype
- keep safe summaries only
- keep no-network testability
- keep the feature behind config or flag gates

## Out of scope

- full LLM ResponseComposer implementation
- AgentCore migration
- raw MCP exposure
- arbitrary query execution
- underlying data access
- field values / row data retrieval
- write-capable tools

## Proposed tasks

- add a minimal session store or fake session store
- keep the session JSON-safe
- preserve fallback behavior when sessions are disabled
- avoid introducing any default hosted dependency

## Acceptance criteria

- the prototype is disabled by default or otherwise gated
- the prototype stores only safe summaries
- no-network tests still pass without hosted dependencies

## Validation

- backend lint / typecheck / tests
- no-network tests remain the default path

## Safety boundaries

$(shared_safety_boundaries)
$(session_safety_boundaries)

## Parent issue reference

Part of ${PARENT_URL}

## Related docs

$(shared_related_docs)
EOF
}

make_session_tests_body() {
  cat <<EOF
# Add Exploration Session fallback and regression tests

## Summary

Add regression tests that keep the session path safe when sessions are disabled, stale, or invalid.

## Background

This issue belongs to Branch B and should only proceed if the branch decision selects Exploration Session.

The tests must prove that session support does not break `selected_mark_explanation`, metadata discovery, or the legacy fallback path.

## Scope

- add session fallback regression tests
- add stale or invalid session regression tests
- add no-network regression tests
- preserve default fallback behavior

## Out of scope

- full LLM ResponseComposer implementation
- AgentCore migration
- raw MCP exposure
- arbitrary query execution
- underlying data access
- field values / row data retrieval
- write-capable tools

## Proposed tasks

- verify fallback when the session is disabled
- verify stale or missing sessions are handled safely
- verify safe session summaries remain JSON-safe
- verify selected_mark_explanation and metadata_discovery are still protected

## Acceptance criteria

- disabled sessions fall back safely
- stale or invalid sessions are handled safely
- selected_mark_explanation remains protected
- free-form fallback remains available where it should

## Validation

- backend lint / typecheck / tests
- no-network tests remain the default path

## Safety boundaries

$(shared_safety_boundaries)
$(session_safety_boundaries)

## Parent issue reference

Part of ${PARENT_URL}

## Related docs

$(shared_related_docs)
EOF
}

make_session_result_body() {
  cat <<EOF
# Document Exploration Session result

## Summary

Document the branch B outcome after the Exploration Session work is complete.

## Background

This issue belongs to Branch B and should only proceed if the branch decision selects Exploration Session.

The result document should capture what state was retained, how lifecycle boundaries worked, and how safety was preserved.

## Scope

- document the branch result
- record the lifecycle and privacy boundary
- record the fallback path
- record the remaining risks

## Out of scope

- additional feature implementation
- AgentCore migration
- raw MCP exposure
- arbitrary query execution
- underlying data access
- field values / row data retrieval
- write-capable tools

## Proposed tasks

- summarize the implementation outcome
- document fallback and invalidation behavior
- document the remaining risks
- document the no-network posture

## Acceptance criteria

- the branch result is documented clearly
- lifecycle and privacy boundaries are recorded
- remaining risks are listed
- the decision record stays audit-friendly

## Validation

- docs review only

## Safety boundaries

$(shared_safety_boundaries)
$(session_safety_boundaries)

## Parent issue reference

Part of ${PARENT_URL}

## Related docs

$(shared_related_docs)
EOF
}

make_wrapup_body() {
  cat <<EOF
# v0.10.0 wrap-up

## Summary

Close out the v0.10.0 milestone and record the selected branch, the deferred branch, and the next handoff.

## Background

This issue belongs at the end of the milestone after the selected branch has been completed.

It should capture the final outcome and make the v0.11.0 handoff explicit.

## Scope

- summarize the selected branch
- record the deferred branch
- record the final safety posture
- document the next handoff

## Out of scope

- new features
- extra routing changes
- AgentCore migration
- raw MCP exposure
- arbitrary query execution
- underlying data access
- field values / row data retrieval
- write-capable tools

## Proposed tasks

- summarize what was completed
- summarize what was deferred
- record the final boundary
- record the v0.11.0 handoff notes

## Acceptance criteria

- the milestone outcome is explicit
- the selected branch is explicit
- the deferred branch is explicit
- the safety boundary is still intact

## Validation

- docs review only

## Safety boundaries

$(shared_safety_boundaries)

## Parent issue reference

Part of ${PARENT_URL}

## Related docs

$(shared_related_docs)
EOF
}

load_repo_metadata
build_milestone_args

PARENT_TITLE="v0.10.0 LLM ResponseComposer or Exploration Session"
PARENT_BODY_FILE="$TMP_DIR/parent.md"
make_parent_body >"$PARENT_BODY_FILE"
PARENT_URL="$(issue_create "$PARENT_TITLE" "$PARENT_BODY_FILE" "$COMMON_LABELS_CSV")"
PARENT_NUMBER="${PARENT_URL##*/}"
printf 'Created parent issue #%s: %s\n' "$PARENT_NUMBER" "$PARENT_URL"

create_child_issue() {
  local title="$1"
  local body_function="$2"
  local labels_csv="$3"
  local body_file="$TMP_DIR/${title//[^A-Za-z0-9_-]/_}.md"

  "$body_function" >"$body_file"
  local child_url
  child_url="$(issue_create "$title" "$body_file" "$labels_csv")"
  printf 'Created child issue: %s\n' "$child_url"
}

create_child_issue "v0.10.0 planning and branch decision" make_planning_body "$COMMON_LABELS_CSV"
create_child_issue "Define LLM ResponseComposer safety boundary" make_llm_boundary_body "$CODE_LABELS_CSV"
create_child_issue "Define response material contract for LLM composition" make_llm_material_body "$CODE_LABELS_CSV"
create_child_issue "Add guarded LLM ResponseComposer prototype" make_llm_prototype_body "$CODE_LABELS_CSV"
create_child_issue "Add LLM ResponseComposer fallback and regression tests" make_llm_tests_body "$TEST_LABELS_CSV"
create_child_issue "Document LLM ResponseComposer result" make_llm_result_body "$DOCS_LABELS_CSV"
create_child_issue "Define Exploration Session safety boundary" make_session_boundary_body "$CODE_LABELS_CSV"
create_child_issue "Define session state schema and lifecycle" make_session_schema_body "$CODE_LABELS_CSV"
create_child_issue "Add minimal Exploration Session prototype" make_session_prototype_body "$CODE_LABELS_CSV"
create_child_issue "Add Exploration Session fallback and regression tests" make_session_tests_body "$TEST_LABELS_CSV"
create_child_issue "Document Exploration Session result" make_session_result_body "$DOCS_LABELS_CSV"
create_child_issue "v0.10.0 wrap-up" make_wrapup_body "$DOCS_LABELS_CSV"
