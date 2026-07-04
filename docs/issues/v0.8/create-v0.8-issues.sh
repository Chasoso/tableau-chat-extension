#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
ISSUE_DIR="$ROOT_DIR/docs/issues/v0.8"
TMP_DIR="$(mktemp -d)"
MILESTONE="${MILESTONE:-v0.8.0}"
PARENT_LABELS_CSV="${PARENT_LABELS:-tableau-mcp}"
CHILD_LABELS_CSV="${CHILD_LABELS:-tableau-mcp}"

trap 'rm -rf "$TMP_DIR"' EXIT

issue_create() {
  local title="$1"
  local body_file="$2"
  shift 2

  local args=()
  local label
  for label in "$@"; do
    args+=("--label" "$label")
  done

  local milestone_args=()
  if repo_has_milestone "$MILESTONE"; then
    milestone_args+=(--milestone "$MILESTONE")
  elif [[ -n "$MILESTONE" && "$MILESTONE" != "none" ]]; then
    printf 'Warning: milestone "%s" not found, creating issue without milestone\n' "$MILESTONE" >&2
  fi

  gh issue create \
    --title "$title" \
    --body-file "$body_file" \
    "${milestone_args[@]}" \
    "${args[@]}"
}

repo_has_milestone() {
  local milestone="$1"
  [[ -z "$milestone" || "$milestone" == "none" ]] && return 1

  gh milestone list --limit 200 --json title --jq '.[].title' | grep -Fxq "$milestone"
}

repo_has_label() {
  local label="$1"
  gh label list --limit 500 --json name --jq '.[].name' | grep -Fxq "$label"
}

filter_labels() {
  local csv="$1"
  local IFS=','
  local -a requested=()
  local -a filtered=()
  read -r -a requested <<< "$csv"

  local label
  for label in "${requested[@]}"; do
    label="${label#"${label%%[![:space:]]*}"}"
    label="${label%"${label##*[![:space:]]}"}"
    [[ -z "$label" ]] && continue
    if repo_has_label "$label"; then
      filtered+=("$label")
    else
      printf 'Warning: label "%s" not found, skipping\n' "$label" >&2
    fi
  done

  printf '%s\n' "${filtered[@]}"
}

render_body() {
  local source_file="$1"
  local target_file="$2"
  local parent_number="$3"

  sed "s/{{PARENT_ISSUE_NUMBER}}/${parent_number}/g" "$source_file" > "$target_file"
}

PARENT_TEMPLATE="$ISSUE_DIR/00-v0.8.0-hosted-tableau-mcp-metadata-execution.md"
mapfile -t PARENT_LABEL_ARGS < <(filter_labels "$PARENT_LABELS_CSV")
PARENT_URL="$(issue_create "v0.8.0 Hosted Tableau MCP Metadata Execution" "$PARENT_TEMPLATE" "${PARENT_LABEL_ARGS[@]}")"
PARENT_NUMBER="${PARENT_URL##*/}"
printf 'Created parent issue #%s: %s\n' "$PARENT_NUMBER" "$PARENT_URL"

CHILD_FILES=(
  "01-v0.8.0-planning-and-hosted-mcp-execution-boundaries.md"
  "02-verify-hosted-tableau-mcp-endpoint-and-site-settings.md"
  "03-define-hosted-mcp-integration-test-gating.md"
  "04-implement-hosted-tableau-mcp-transport-skeleton.md"
  "05-add-hosted-mcp-auth-context-adapter-boundary.md"
  "06-connect-describeDatasource-to-hosted-mcp-transport-behind-feature-flag.md"
  "07-normalize-hosted-mcp-metadata-errors.md"
  "08-add-hosted-metadata-execution-trace-coverage.md"
  "09-preserve-fake-no-network-and-stdio-fallback-tests.md"
  "10-evaluate-listfields-hosted-execution-readiness.md"
  "11-document-v0.8.0-hosted-mcp-metadata-execution-result.md"
  "12-v0.8.0-wrap-up.md"
)

for child in "${CHILD_FILES[@]}"; do
  source_file="$ISSUE_DIR/$child"
  body_file="$TMP_DIR/$child"
  render_body "$source_file" "$body_file" "$PARENT_NUMBER"
  child_title="$(head -n 1 "$source_file" | sed 's/^# //')"
  mapfile -t CHILD_LABEL_ARGS < <(filter_labels "$CHILD_LABELS_CSV")
  child_url="$(issue_create "$child_title" "$body_file" "${CHILD_LABEL_ARGS[@]}")"
  printf 'Created child issue: %s\n' "$child_url"
done
