# Define ToolRegistry contract

## Background

ToolDefinition が定義されても、登録・lookup・availability を統一的に扱う層が必要。

## Goal

ToolRegistry の最小 contract を定義し、tool の register / lookup / list / availability を安全に扱える形にする。

## Scope

- ToolRegistry interface
- register / unregister
- lookup / list
- availability
- allowed / disallowed との照合

## Out of scope

- tool execution
- registry discovery の自動化
- tool precondition のフル評価

## Tasks

- registry API を定義する
- lookup 結果の shape を定義する
- missing / unavailable の扱いを決める

## Acceptance criteria

- registry contract が backend から参照できる
- selected_mark_explanation に必要な最低限の tool lookup が表現できる

## Validation

- contract test が通る
- 実装コードの大規模変更をしていない

## Related

- #51 v0.5.0 Tool Layer Rebuild
- docs/v0.5-tool-layer-rebuild-plan.md
