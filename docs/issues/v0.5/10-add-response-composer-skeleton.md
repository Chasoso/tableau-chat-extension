# Add ResponseComposer skeleton

## Background

Tool results を安全にまとめるための ResponseComposer skeleton が必要になる。

## Goal

実 LLM 回答ではなく、context tool results を deterministic に要約する最小の ResponseComposer を定義する。

## Scope

- ResponseComposer contract
- deterministic / placeholder response
- JSON-safe summary

## Out of scope

- LLM generation
- free-form chat の全面移行

## Tasks

- composer contract を定義する
- selected_mark_explanation 用の placeholder response を決める

## Acceptance criteria

- response material を安全にまとめられる
- selected_mark_explanation に使える

## Validation

- contract test が通る
- 既存 chat flow を壊していない

## Related

- #51 v0.5.0 Tool Layer Rebuild
- docs/v0.5-tool-layer-rebuild-plan.md
