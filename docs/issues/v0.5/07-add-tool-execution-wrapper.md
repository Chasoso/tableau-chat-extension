# Add tool execution wrapper

## Background

Tool の実行を registry 経由で安全に包む wrapper が必要。

## Goal

timeout / error handling / trace / JSON-safe output を持つ最小の execution wrapper を追加する。

## Scope

- execution wrapper
- timeout / budget handling
- JSON-safe output normalization
- trace metadata

## Out of scope

- registry の大量登録
- full tool execution migration

## Tasks

- wrapper contract を定義する
- execution result を normalize する
- selected_mark_explanation に必要な tool のみ対象にする

## Acceptance criteria

- wrapper が JSON-safe output を返せる
- error / timeout を扱える

## Validation

- wrapper test が通る
- tool execution を広げすぎていない

## Related

- #51 v0.5.0 Tool Layer Rebuild
- docs/v0.5-tool-layer-rebuild-plan.md
