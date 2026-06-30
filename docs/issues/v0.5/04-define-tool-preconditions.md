# Define tool preconditions

## Background

Tool の安全性を担保するには、selected marks や availability、permission などの前提条件を統一的に表現する必要がある。

## Goal

ToolPrecondition model を定義し、ToolRegistry / ToolRouter / ExecutionEngine から参照できるようにする。

## Scope

- ToolPrecondition model
- selected marks / summary data / availability
- permission / explicit confirmation の表現
- budget / policy の最小表現

## Out of scope

- 実際の precondition enforcement のフル実装
- write-capable tool の大規模追加

## Tasks

- precondition type を整理する
- pass / fail / skip / blocked を定義する
- selected_mark_explanation 向けの precondition を決める

## Acceptance criteria

- precondition が JSON-safe に表現できる
- required / optional を表現できる
- selected_mark_explanation に必要な条件を表せる

## Validation

- contract test が通る
- 既存 orchestration を壊していない

## Related

- #51 v0.5.0 Tool Layer Rebuild
- docs/v0.5-tool-layer-rebuild-plan.md
