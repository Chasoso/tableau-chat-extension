# Tool layer audit and boundaries

## Background

v0.4.0 では orchestration の骨組みを作ったが、ToolRegistry 化の境界はまだ未整理。
MCP / REST API / Notion / context-derived data を同じ tool layer に入れる前に、責務の棚卸しが必要。

## Goal

現在の tool-like responsibilities を洗い出し、ToolRegistry に移すものと既存 flow に残すものを明確にする。

## Scope

- backend の MCP / API / context 関連コードの棚卸し
- ToolRegistry 化の境界整理
- ToolDefinition の対象候補整理
- 既存 flow の保持範囲整理

## Out of scope

- 実際の ToolRegistry 実装
- tool execution の実装
- LLM による tool selection

## Tasks

- current call sites を整理する
- tool category ごとの責務を分ける
- selected_mark_explanation の最小 path を確認する
- migration の危険箇所を記録する

## Acceptance criteria

- tool 実行箇所が一覧化されている
- ToolRegistry 化の境界が明確になっている
- context-derived data の扱い方針が記録されている

## Validation

- 調査結果が docs に反映されている
- 実装コードを変更していない

## Related

- #51 v0.5.0 Tool Layer Rebuild
- docs/v0.5-tool-layer-rebuild-plan.md
