# Execute selected_mark_explanation context tools

## Background

selected_mark_explanation は v0.5.0 で最初に実行対象にする path。

## Goal

selected_mark_explanation fixed plan に対して、context tools を実行し、ExecutionResult に材料を載せられるようにする。

## Scope

- selected marks context
- summary data preview
- filters / parameters reference
- deterministic response material

## Out of scope

- LLM 回答生成
- Tableau MCP の全面移行

## Tasks

- selected_mark_explanation の tool path を決める
- execution result に context tool results を載せる
- trace との整合を取る

## Acceptance criteria

- selected_mark_explanation が context tool results を扱える
- response material が JSON-safe である

## Validation

- selected_mark_explanation path test が通る

## Related

- #51 v0.5.0 Tool Layer Rebuild
- docs/v0.5-tool-layer-rebuild-plan.md
