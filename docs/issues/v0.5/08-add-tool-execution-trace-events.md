# Add tool execution trace events

## Background

v0.4.0 の orchestration trace に加えて、tool execution を追える trace が必要になる。

## Goal

tool_registry / precondition / execution の最小 trace events を追加する。

## Scope

- tool_registry.lookup
- tool_precondition.passed / failed
- tool_execution.started / completed / failed

## Out of scope

- trace persistence
- UI trace panel

## Tasks

- trace event type を追加する
- tool result metadata を trace 化する
- context を肥大化させない

## Acceptance criteria

- tool execution trace が生成できる
- JSON-safe である

## Validation

- trace test が通る
- 既存 orchestration trace と整合している

## Related

- #51 v0.5.0 Tool Layer Rebuild
- docs/v0.5-tool-layer-rebuild-plan.md
