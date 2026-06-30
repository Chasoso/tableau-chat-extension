# Register context-derived pseudo tools

## Background

selected marks や summary data preview は外部ツールではないが、plan から参照しやすい形で扱う必要がある。

## Goal

context-derived data を ToolRegistry 上でどう扱うかを決め、必要なら pseudo tool として登録する。

## Scope

- selected marks
- summary data preview
- filters
- parameters
- dashboard / workbook metadata

## Out of scope

- Tableau MCP の登録
- 実外部ツールの追加

## Tasks

- pseudo tool にするかを決める
- hybrid で扱う場合の責務を整理する
- selected_mark_explanation の最小 path と整合させる

## Acceptance criteria

- context-derived data の扱い方針が明確
- ToolRegistry 化との境界が分かる

## Validation

- docs に方針が記載されている
- 実装コードを変更していない

## Related

- #51 v0.5.0 Tool Layer Rebuild
- docs/v0.5-tool-layer-rebuild-plan.md
