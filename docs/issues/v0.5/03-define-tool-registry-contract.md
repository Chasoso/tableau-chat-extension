# Define ToolRegistry contract

## Background

ToolDefinition is now defined, but v0.5.0 still needs a registry layer that can register, look up, list, and report availability for tools without executing them.

## Goal

Define the minimal ToolRegistry contract so ToolDefinition instances can be managed consistently before execution is introduced.

## Scope

- ToolRegistry interface
- register / unregister
- lookup / list
- availability
- allowedTools / disallowedTools filtering
- missing / unavailable handling

## Out of scope

- tool execution
- registry discovery automation
- full tool precondition evaluation

## Tasks

- define registry APIs and lookup result shapes
- define missing / unavailable / disallowed behavior
- confirm selected_mark_explanation can look up the minimal context tools it needs

## Acceptance criteria

- the registry contract is available from backend agent code
- selected_mark_explanation can express the minimal lookup flow it needs
- registry results are JSON-safe and do not execute tools

## Validation

- contract tests pass
- no execution code is added

## Related

- #51 v0.5.0 Tool Layer Rebuild
- docs/v0.5-tool-layer-rebuild-plan.md
