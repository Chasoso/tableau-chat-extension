# Define ToolDefinition and Tool categories

## Background

Tool を MCP / REST API / Notion / context source の共通の概念として扱うには、最小の ToolDefinition contract が必要。

## Goal

ToolDefinition / ToolCategory / ToolSafety の契約を定義し、selected_mark_explanation に必要な tool から扱えるようにする。

## Scope

- ToolDefinition contract
- ToolCategory contract
- Tool safety / read-only / write-capable の分類
- input/output schema policy の最小定義

## Out of scope

- ToolRegistry 実装
- 実際の tool execution
- schema library の導入

## Tasks

- tool metadata の最小項目を定義する
- category / safety / availability を型に落とす
- schema policy を docs に反映する

## Acceptance criteria

- ToolDefinition が JSON-safe に扱える
- category / safety を表現できる
- selected_mark_explanation 向け tool を表現できる

## Validation

- type / contract test が通る
- 実行コードを増やしていない

## Related

- #51 v0.5.0 Tool Layer Rebuild
- docs/v0.5-tool-layer-rebuild-plan.md
