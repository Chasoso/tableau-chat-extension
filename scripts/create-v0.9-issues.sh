#!/usr/bin/env bash
set -euo pipefail

REPO="Chasoso/tableau-chat-extension"
MILESTONE="v0.9.0"
MILESTONE_DESCRIPTION="Structured Data Discovery and Legacy Chat Reduction"
TMP_DIR="$(mktemp -d)"
CREATED_ISSUE_URLS=()
PARENT_ISSUE_URL=""

trap 'rm -rf "$TMP_DIR"' EXIT

log() {
  printf '%s\n' "$*" >&2
}

die() {
  log "Error: $*"
  exit 1
}

check_prerequisites() {
  gh auth status >/dev/null || die "gh auth status failed. Re-authenticate with 'gh auth login -h github.com'."
  gh repo view "$REPO" --json nameWithOwner >/dev/null || die "Repository '$REPO' could not be reached. Check the repo name and gh auth state."
}

gh_has_milestone_subcommand() {
  gh milestone list --help >/dev/null 2>&1
}

milestone_exists() {
  if gh_has_milestone_subcommand; then
    gh milestone list --repo "$REPO" --limit 200 --json title --jq '.[].title' | grep -Fxq "$MILESTONE"
  else
    gh api "repos/$REPO/milestones?state=all&per_page=100" --jq '.[].title' | grep -Fxq "$MILESTONE"
  fi
}

create_milestone_via_api() {
  gh api \
    --method POST \
    "repos/$REPO/milestones" \
    -f "title=$MILESTONE" \
    -f "description=$MILESTONE_DESCRIPTION" >/dev/null
}

ensure_milestone() {
  if milestone_exists; then
    return 0
  fi

  log "Milestone '$MILESTONE' was not found."
  if gh_has_milestone_subcommand; then
    if gh milestone create "$MILESTONE" --repo "$REPO" --description "$MILESTONE_DESCRIPTION" >/dev/null; then
      log "Created milestone '$MILESTONE' with gh milestone create."
      return 0
    fi
  fi

  if create_milestone_via_api; then
    log "Created milestone '$MILESTONE' with gh api."
    return 0
  fi

  cat >&2 <<EOF
Milestone '$MILESTONE' is required and could not be created automatically.

Create it manually in GitHub UI:
- Repository: $REPO
- Issues -> Milestones -> New milestone
- Title: $MILESTONE
- Description: $MILESTONE_DESCRIPTION
EOF
  exit 1
}

create_issue() {
  local title="$1"
  local body_file="$2"
  local issue_url

  issue_url="$(gh issue create \
    --repo "$REPO" \
    --title "$title" \
    --milestone "$MILESTONE" \
    --body-file "$body_file")"
  CREATED_ISSUE_URLS+=("$issue_url")
  printf '%s\n' "$issue_url"
}

append_parent_section() {
  local body_file="$1"
  {
    printf '\nParent: %s\n\n' "$PARENT_ISSUE_URL"
    printf '## Parent\n\nPart of v0.9.0 Structured Data Discovery and Legacy Chat Reduction.\n'
  } >> "$body_file"
}

write_parent_body() {
  cat > "$TMP_DIR/00-parent.md" <<'EOF'
# v0.9.0 Structured Data Discovery and Legacy Chat Reduction

**Type:** docs-only

## Summary

v0.9.0 introduces discovery-oriented structured intents and reduces legacy chat coverage for metadata discovery cases while preserving the safety posture from v0.8.0.

## Background

The roadmap positions v0.9.0 after the hosted metadata execution groundwork from v0.8.0.
The milestone should use the hosted `describeDatasource` path as the first validated metadata boundary and should not reopen transport or hosted migration questions.

## Relationship to v0.8.0

v0.8.0 validated the hosted `describeDatasource` boundary, preserved fake / stdio fallback, and explicitly deferred `listFields`.
It also kept `selected_mark_explanation` and legacy free-form chat stable.

v0.9.0 should build on those decisions instead of weakening them.

## Goals

- Add `metadata_discovery` to structured orchestration.
- Clarify the datasource / workbook / view ambiguity model.
- Define clarification response contracts.
- Define structured metadata discovery plan shape.
- Reuse the v0.8.0 hosted `describeDatasource` boundary.
- Treat `listFields` as a controlled, truncated, permission-aware candidate.
- Move some metadata discovery cases from legacy free-form chat into structured path.
- Preserve `selected_mark_explanation` and legacy chat fallback behavior.

## Non-goals

- Full `ChatService` replacement.
- Full `runLightweightAgentLoop` replacement.
- Arbitrary data query execution.
- LLM-generated Tableau MCP query execution.
- Underlying data access.
- Field values / row data retrieval.
- Write-capable tools.
- Broad raw MCP tool exposure.
- Production Hosted MCP migration.
- OAuth full implementation.
- Token storage or token refresh.
- AgentCore implementation.
- LLM ResponseComposer implementation.
- Frontend redesign.
- Default CI hosted integration.

## Scope

- Structured discovery intent design.
- Ambiguity and clarification contracts.
- Discovery plan shape definition.
- Safe routing to the hosted `describeDatasource` boundary.
- Controlled `listFields` discovery contract.
- Truncation and permission-aware response shaping.
- Gradual reduction of legacy chat coverage for discovery-only cases.
- Regression protection for `selected_mark_explanation` and the fallback chat path.

## Safety and governance boundaries

- Read-only metadata first.
- Hosted execution remains explicit opt-in.
- Default CI stays no-network.
- Fake and stdio fallback stay preserved.
- No raw MCP tool exposure.
- No arbitrary query execution.
- No underlying data access.
- No field values or row data retrieval.
- No write-capable tools.
- Output normalization remains summary-first and JSON-safe.
- No raw MCP result or raw transport result exposure.
- No tokens, secrets, or stack traces in user-facing output or traces.
- `selected_mark_explanation` remains unchanged.
- Free-form chat legacy fallback remains available.
- AgentCore remains deferred.

## Proposed issue sequence

1. v0.9.0 planning and structured discovery boundaries
2. Define metadata_discovery intent
3. Define datasource / workbook / view ambiguity model
4. Add clarification response contracts
5. Define structured metadata discovery plan shape
6. Connect metadata_discovery to describeDatasource boundary
7. Add controlled listFields discovery contract
8. Add truncation and permission-aware discovery responses
9. Reduce legacy chat coverage for metadata discovery cases
10. Validate selected_mark_explanation and free-form chat regressions
11. Document v0.9.0 structured discovery result
12. v0.9.0 wrap-up

## Docs-only issues

- v0.9.0 planning and structured discovery boundaries
- Document v0.9.0 structured discovery result
- v0.9.0 wrap-up

## Code-bearing issues

- Define metadata_discovery intent
- Define datasource / workbook / view ambiguity model
- Add clarification response contracts
- Define structured metadata discovery plan shape
- Connect metadata_discovery to describeDatasource boundary
- Add controlled listFields discovery contract
- Add truncation and permission-aware discovery responses
- Reduce legacy chat coverage for metadata discovery cases
- Validate selected_mark_explanation and free-form chat regressions

Some of the code-bearing items may begin as contract-first work if implementation should wait for a later milestone decision.

## Validation strategy

- Docs-only issues: no lint, typecheck, or test run.
- Contract-first issues: validate the contract shape with the smallest safe tests available.
- Code-bearing issues: keep default validation no-network.
- Hosted integration remains optional and gated.
- Regression coverage must protect `selected_mark_explanation`, legacy fallback behavior, and the no-network baseline.

## Completion criteria

v0.9.0 is complete when:

- structured discovery routes through explicit contracts instead of ad hoc legacy behavior
- `metadata_discovery` is defined and safe to use
- ambiguity and clarification rules are documented and enforced
- the hosted `describeDatasource` boundary is reused for eligible cases
- `listFields` remains controlled and permission-aware
- legacy discovery coverage is reduced without breaking fallback behavior
- `selected_mark_explanation` remains unchanged
- default CI remains no-network
- no new raw MCP, arbitrary query, underlying data, or write-tool surface is introduced

## Notes for v0.10.0

v0.10.0 should choose between safer LLM ResponseComposer work and an exploration-session direction using the boundary that v0.9.0 leaves behind.

AgentCore should remain deferred unless a later milestone explicitly changes that decision.
EOF
}

write_child_body_01() {
  cat > "$TMP_DIR/01-v0.9.0-planning-and-structured-discovery-boundaries.md" <<'EOF'
# v0.9.0 planning and structured discovery boundaries

**Type:** docs-only

## Summary

Define the v0.9.0 boundary for structured discovery, legacy chat reduction, and safe hosted fallback.

## Background

- v0.8.0 ended with hosted `describeDatasource` validated.
- `listFields` was explicitly deferred.
- The milestone should narrow discovery safely before any broader chat changes.

## Scope

- Lock v0.9.0 goals, non-goals, and guardrails.
- Document what counts as structured discovery.
- Record hosted / no-network / fallback boundaries inherited from v0.8.0.

## Non-goals

- Backend implementation.
- Frontend implementation.
- Tests.
- GitHub Actions changes.

## Proposed tasks

- Write the v0.9.0 planning doc.
- Capture the hosted safety and fallback constraints.
- Enumerate the child issue map and dependencies.

## Acceptance criteria

- The scope and exclusions are explicit.
- The hosted and no-network guardrails are preserved.
- The document is sufficient to start code-bearing work safely.

## Validation

- Docs review only.
- No lint / typecheck / test run.

## Notes

- This issue is docs-only.
EOF
}

write_child_body_02() {
  cat > "$TMP_DIR/02-define-metadata_discovery-intent.md" <<'EOF'
# Define metadata_discovery intent

**Type:** code-bearing

## Summary

Define `metadata_discovery` as a structured intent that can route safe discovery cases without falling through to arbitrary execution.

## Background

- v0.8.0 proved the hosted metadata boundary for `describeDatasource`.
- v0.9.0 needs a structured entry point for discovery-oriented requests.
- The intent should stay aligned with the existing planner and ToolLayer boundaries.

## Scope

- Define the intent name, inputs, outputs, and routing conditions.
- Specify when discovery should clarify instead of execute.
- Align the intent with the current planner and ToolLayer contract.

## Non-goals

- Actual Hosted MCP calls.
- `listFields` execution.
- Arbitrary query execution.
- Underlying data access.
- ResponseComposer LLM generation.

## Proposed tasks

- Specify the intent contract and routing rules.
- Define the safe output envelope.
- Record fallback behavior for unsupported or ambiguous requests.

## Acceptance criteria

- The intent is unambiguous and JSON-safe.
- It does not imply raw MCP access or query execution.
- It cleanly separates clarification from execution.

## Validation

- Contract review and targeted no-network tests once implemented.

## Notes

- Contract-first is acceptable here if implementation needs to stay deferred.
EOF
}

write_child_body_03() {
  cat > "$TMP_DIR/03-define-datasource-workbook-view-ambiguity-model.md" <<'EOF'
# Define datasource / workbook / view ambiguity model

**Type:** code-bearing

## Summary

Define how datasource, workbook, and view ambiguity is detected and resolved for structured discovery.

## Background

- Discovery requests can refer to more than one Tableau content type.
- Ambiguity should be explicit rather than guessed.
- Clarification must happen before any hosted metadata boundary is used.

## Scope

- Define ambiguity states for datasource / workbook / view.
- Specify identifier and precondition checks.
- Define when the runtime must ask for clarification.

## Non-goals

- Broad search implementation.
- Tableau content crawling.
- Raw MCP tool exposure.
- Underlying data access.

## Proposed tasks

- Draft the ambiguity model and decision rules.
- Enumerate the clarification-triggering cases.
- Map the model to the existing metadata precondition system.

## Acceptance criteria

- Ambiguous inputs are detected consistently.
- Clarification is preferred over speculative execution.
- The model stays safe and serializable.

## Validation

- Contract review and no-network regression coverage when implemented.

## Notes

- This can remain contract-first if the code path needs to follow later.
EOF
}

write_child_body_04() {
  cat > "$TMP_DIR/04-add-clarification-response-contracts.md" <<'EOF'
# Add clarification response contracts

**Type:** code-bearing

## Summary

Define safe clarification responses for metadata discovery when the input is ambiguous or incomplete.

## Background

- Discovery should not jump to raw execution when the target is unclear.
- The response shape needs to be safe, JSON-friendly, and stable.
- `selected_mark_explanation` must remain untouched.

## Scope

- Define clarification response types and fields.
- Keep the response safe for UI and logging.
- Ensure raw transport or MCP payloads are never embedded.

## Non-goals

- Frontend redesign.
- Full free-form chat replacement.
- LLM ResponseComposer implementation.

## Proposed tasks

- Define the clarification contract.
- Specify the response options and safety rules.
- Document how the caller should resume with a clarified target.

## Acceptance criteria

- Clarification responses are JSON-safe.
- They do not leak secrets, tokens, or raw MCP details.
- They distinguish clarification from execution clearly.

## Validation

- Contract tests and no-network regression tests once implemented.

## Notes

- The contract should remain compatible with later structured orchestration work.
EOF
}

write_child_body_05() {
  cat > "$TMP_DIR/05-define-structured-metadata-discovery-plan-shape.md" <<'EOF'
# Define structured metadata discovery plan shape

**Type:** code-bearing

## Summary

Define the structured plan envelope used for metadata discovery before ToolLayer execution.

## Background

- A plan shape is needed to separate executable discovery from clarification.
- The plan should stay narrow and safe.
- The plan should fit the existing orchestration boundary.

## Scope

- Define the discovery plan schema.
- Split executable plans from clarification plans.
- Keep the plan ToolLayer-friendly and JSON-safe.

## Non-goals

- Arbitrary query plans.
- Underlying data plans.
- Write-tool plans.
- LLM-generated MCP execution.

## Proposed tasks

- Draft the plan structure and state transitions.
- Define the execution gate and the clarification gate.
- Align the plan with the hosted `describeDatasource` boundary.

## Acceptance criteria

- The plan shape is explicit and safe.
- It can represent clarification without executing.
- It does not imply raw tool exposure.

## Validation

- Contract tests once the code path exists.

## Notes

- This is intentionally narrower than a general planning DSL.
EOF
}

write_child_body_06() {
  cat > "$TMP_DIR/06-connect-metadata_discovery-to-describeDatasource-boundary.md" <<'EOF'
# Connect metadata_discovery to describeDatasource boundary

**Type:** code-bearing

## Summary

Route eligible `metadata_discovery` cases to the v0.8.0 hosted `describeDatasource` boundary.

## Background

- v0.8.0 already validated a feature-flagged hosted metadata path.
- v0.9.0 should reuse that boundary instead of creating a new raw surface.
- The hosted path must remain explicit and fallback-safe.

## Scope

- Connect eligible structured discovery cases to `describeDatasource`.
- Preserve feature-flag and configuration gating.
- Keep fake / no-network and stdio fallback intact.

## Non-goals

- `listFields` execution.
- Arbitrary query execution.
- Underlying data access.
- Field values / row data access.
- Write-capable tools.
- OAuth full implementation.
- Token refresh or token storage.

## Proposed tasks

- Add the routing from structured discovery to the hosted boundary.
- Preserve the fallback path when the hosted path is not available.
- Keep the validation logic aligned with the existing metadata preconditions.

## Acceptance criteria

- Eligible discovery cases use the hosted boundary when explicitly enabled.
- Fallback remains safe and deterministic.
- No raw MCP result or secret exposure is introduced.

## Validation

- No-network regression tests plus targeted boundary tests.

## Notes

- This issue should remain feature-flagged and fallback-first.
EOF
}

write_child_body_07() {
  cat > "$TMP_DIR/07-add-controlled-listFields-discovery-contract.md" <<'EOF'
# Add controlled listFields discovery contract

**Type:** code-bearing

## Summary

Define `listFields` as a controlled, truncated, permission-aware discovery candidate rather than a broad hosted exposure.

## Background

- v0.8.0 deferred hosted `listFields` because the risk profile is higher.
- v0.9.0 can define the contract before deciding how much execution to enable.
- The contract must stay narrower than `describeDatasource`.

## Scope

- Define controlled limits for `listFields`.
- Specify truncation and omission signals.
- Make permission-aware behavior explicit.

## Non-goals

- Broad `listFields` exposure.
- Raw MCP result exposure.
- Arbitrary field enumeration without limits.
- Field values / row data access.
- Underlying data access.

## Proposed tasks

- Define the candidate contract and its caps.
- Document permission-aware and truncation behavior.
- Record the validation gates required before any execution wiring.

## Acceptance criteria

- The contract prevents broad exposure by default.
- Truncation and permission limits are explicit.
- The contract remains safe for later execution work.

## Validation

- Contract review first; tests only after code wiring exists.

## Notes

- This issue can stay contract-first if execution remains deferred.
EOF
}

write_child_body_08() {
  cat > "$TMP_DIR/08-add-truncation-and-permission-aware-discovery-responses.md" <<'EOF'
# Add truncation and permission-aware discovery responses

**Type:** code-bearing

## Summary

Normalize discovery responses so large or restricted results are explicit about truncation and permissions.

## Background

- Discovery responses can be large or incomplete.
- Safe output should explain truncation or permission limits.
- Raw transport or MCP output must not be returned directly.

## Scope

- Add truncation indicators and warning notes.
- Add permission-aware response notes.
- Keep the response summary-first and JSON-safe.

## Non-goals

- Row data access.
- Field values.
- Raw transport output.
- Raw MCP output.
- Stack trace exposure.

## Proposed tasks

- Define the response envelope fields.
- Specify the warning and truncation semantics.
- Ensure the response remains safe for logs and traces.

## Acceptance criteria

- Truncation is visible without exposing raw payloads.
- Permission constraints are surfaced safely.
- The user-facing response remains stable and JSON-safe.

## Validation

- Regression tests for safe response shaping once implemented.

## Notes

- This should build on the existing hosted error and trace safety rules.
EOF
}

write_child_body_09() {
  cat > "$TMP_DIR/09-reduce-legacy-chat-coverage-for-metadata-discovery-cases.md" <<'EOF'
# Reduce legacy chat coverage for metadata discovery cases

**Type:** code-bearing

## Summary

Move eligible metadata discovery cases out of legacy chat while keeping the fallback path intact.

## Background

- v0.9.0 is about shrinking legacy chat, not deleting it.
- `ChatService` and `runLightweightAgentLoop` must remain available.
- Discovery cases should route to structured orchestration where safe.

## Scope

- Identify discovery-oriented chat cases that can move to structured path.
- Keep fallback to legacy chat for unsupported or ambiguous cases.
- Preserve the current `selected_mark_explanation` behavior.

## Non-goals

- `ChatService` full replacement.
- `runLightweightAgentLoop` retirement.
- `selected_mark_explanation` changes.
- Frontend redesign.

## Proposed tasks

- Enumerate the discovery cases eligible for structured routing.
- Add the routing shift while keeping fallback behavior.
- Confirm the legacy path remains available for non-discovery and ambiguous inputs.

## Acceptance criteria

- Eligible discovery cases use the structured path.
- Legacy chat remains available for the rest.
- No regression appears in existing explanation or fallback flows.

## Validation

- Regression tests covering structured-vs-legacy routing.

## Notes

- The goal is gradual reduction, not full replacement.
EOF
}

write_child_body_10() {
  cat > "$TMP_DIR/10-validate-selected_mark_explanation-and-free-form-chat-regressions.md" <<'EOF'
# Validate selected_mark_explanation and free-form chat regressions

**Type:** code-bearing

## Summary

Protect `selected_mark_explanation` and the free-form chat fallback while structured discovery is introduced.

## Background

- The v0.8.0 wrap-up explicitly preserved this behavior.
- v0.9.0 must not regress the deterministic explanation path.
- Legacy chat fallback should remain available where structured discovery is not appropriate.

## Scope

- Regression coverage for `selected_mark_explanation`.
- Regression coverage for free-form chat fallback.
- Boundary tests between structured discovery and legacy chat.

## Non-goals

- New feature implementation.
- Frontend redesign.
- Hosted integration default enablement.

## Proposed tasks

- Add the minimal tests needed for the changed routing.
- Guard the explanation path against routing regressions.
- Verify the fallback remains available.

## Acceptance criteria

- `selected_mark_explanation` behaves as before.
- Free-form chat fallback remains intact.
- The structured discovery path does not leak into unsupported cases.

## Validation

- No-network tests and regression checks only.

## Notes

- This is test-focused and should stay narrow.
EOF
}

write_child_body_11() {
  cat > "$TMP_DIR/11-document-v0.9.0-structured-discovery-result.md" <<'EOF'
# Document v0.9.0 structured discovery result

**Type:** docs-only

## Summary

Document what v0.9.0 actually moved into structured discovery and what intentionally stayed legacy.

## Background

- This milestone needs a clear result record.
- The handoff from v0.8.0 should stay visible.
- The remaining constraints and deferred items should be explicit.

## Scope

- Summarize structured discovery outcomes.
- Record what remains on the legacy path.
- Record the safety boundaries and deferred items.

## Non-goals

- Code changes.
- New execution features.
- Test changes.

## Proposed tasks

- Write the result document.
- Capture the structured-vs-legacy split.
- Record the remaining risks and follow-ups.

## Acceptance criteria

- The outcome is easy to audit.
- Deferred work is clearly marked.
- The document matches the implemented or agreed state.

## Validation

- Docs review only.

## Notes

- This is a milestone record, not an implementation issue.
EOF
}

write_child_body_12() {
  cat > "$TMP_DIR/12-v0.9.0-wrap-up.md" <<'EOF'
# v0.9.0 wrap-up

**Type:** docs-only

## Summary

Close out v0.9.0 and capture the decision material for v0.10.0.

## Background

- The roadmap says v0.10.0 may branch toward LLM ResponseComposer or an exploration session.
- AgentCore remains deferred.
- The wrap-up should record the actual boundary that v0.9.0 reached.

## Scope

- Summarize the milestone outcome.
- Record the remaining open questions.
- Capture the decision inputs for v0.10.0.

## Non-goals

- Implementation.
- Frontend redesign.
- Default hosted CI changes.

## Proposed tasks

- Write the close-out summary.
- Record whether the next step should be LLM ResponseComposer or exploration-session work.
- Keep the AgentCore deferred decision visible.

## Acceptance criteria

- The milestone outcome is closed out cleanly.
- The v0.10.0 decision inputs are documented.
- Remaining risks are explicit.

## Validation

- Docs review only.

## Notes

- This is the final milestone close-out doc.
EOF
}

create_child_issues() {
  local body_file

  write_child_body_01
  body_file="$TMP_DIR/01-v0.9.0-planning-and-structured-discovery-boundaries.md"
  append_parent_section "$body_file"
  create_issue "v0.9.0 planning and structured discovery boundaries" "$body_file" >/dev/null

  write_child_body_02
  body_file="$TMP_DIR/02-define-metadata_discovery-intent.md"
  append_parent_section "$body_file"
  create_issue "Define metadata_discovery intent" "$body_file" >/dev/null

  write_child_body_03
  body_file="$TMP_DIR/03-define-datasource-workbook-view-ambiguity-model.md"
  append_parent_section "$body_file"
  create_issue "Define datasource / workbook / view ambiguity model" "$body_file" >/dev/null

  write_child_body_04
  body_file="$TMP_DIR/04-add-clarification-response-contracts.md"
  append_parent_section "$body_file"
  create_issue "Add clarification response contracts" "$body_file" >/dev/null

  write_child_body_05
  body_file="$TMP_DIR/05-define-structured-metadata-discovery-plan-shape.md"
  append_parent_section "$body_file"
  create_issue "Define structured metadata discovery plan shape" "$body_file" >/dev/null

  write_child_body_06
  body_file="$TMP_DIR/06-connect-metadata_discovery-to-describeDatasource-boundary.md"
  append_parent_section "$body_file"
  create_issue "Connect metadata_discovery to describeDatasource boundary" "$body_file" >/dev/null

  write_child_body_07
  body_file="$TMP_DIR/07-add-controlled-listFields-discovery-contract.md"
  append_parent_section "$body_file"
  create_issue "Add controlled listFields discovery contract" "$body_file" >/dev/null

  write_child_body_08
  body_file="$TMP_DIR/08-add-truncation-and-permission-aware-discovery-responses.md"
  append_parent_section "$body_file"
  create_issue "Add truncation and permission-aware discovery responses" "$body_file" >/dev/null

  write_child_body_09
  body_file="$TMP_DIR/09-reduce-legacy-chat-coverage-for-metadata-discovery-cases.md"
  append_parent_section "$body_file"
  create_issue "Reduce legacy chat coverage for metadata discovery cases" "$body_file" >/dev/null

  write_child_body_10
  body_file="$TMP_DIR/10-validate-selected_mark_explanation-and-free-form-chat-regressions.md"
  append_parent_section "$body_file"
  create_issue "Validate selected_mark_explanation and free-form chat regressions" "$body_file" >/dev/null

  write_child_body_11
  body_file="$TMP_DIR/11-document-v0.9.0-structured-discovery-result.md"
  append_parent_section "$body_file"
  create_issue "Document v0.9.0 structured discovery result" "$body_file" >/dev/null

  write_child_body_12
  body_file="$TMP_DIR/12-v0.9.0-wrap-up.md"
  append_parent_section "$body_file"
  create_issue "v0.9.0 wrap-up" "$body_file" >/dev/null
}

main() {
  check_prerequisites
  ensure_milestone

  write_parent_body
  PARENT_ISSUE_URL="$(create_issue "v0.9.0 Structured Data Discovery and Legacy Chat Reduction" "$TMP_DIR/00-parent.md")"

  create_child_issues

  printf 'Created issue URLs:\n'
  printf '%s\n' "$PARENT_ISSUE_URL"
  printf '%s\n' "${CREATED_ISSUE_URLS[@]}"
}

main "$@"
