# Connect ToolRouter to ToolRegistry

## Background

v0.4.0 の ToolRouter は門番として動いているだけなので、ToolRegistry を参照して実行可否を判断できるようにしたい。

## Goal

ToolRouter が ToolRegistry lookup / availability / preconditions を参照できるようにする。

## Scope

- ToolRouter contract の拡張
- ToolRegistry lookup との接続
- allowed / blocked / unavailable の判定

## Out of scope

- 実 tool execution
- registry discovery

## Tasks

- ToolRouter 入力に registry reference を追加する
- lookup result を routing result に落とす
- selected_mark_explanation に必要な tool だけを通す

## Acceptance criteria

- ToolRouter が registry を参照できる
- routing 結果が安全に返る

## Validation

- router contract test が通る
- 既存 behavior を壊していない

## Related

- #51 v0.5.0 Tool Layer Rebuild
- docs/v0.5-tool-layer-rebuild-plan.md
