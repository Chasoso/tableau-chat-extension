# Define read-only Tableau metadata tool definitions

## Background

The roadmap says read-only metadata tools are the first migration target. They should be defined as app-specific wrappers rather than raw MCP exports.

## Goal

Define the first read-only Tableau metadata tools that can be registered in ToolRegistry.

## Scope

- app-specific wrapper tool naming
- candidate tools
  - `tableau.metadata.describeDatasource`
  - `tableau.metadata.listFields`
- ToolDefinition shape
- category / capability / safety
- safeForPreview
- externalAccess
- requiresAuthentication
- no raw MCP tool exposure

## Out of scope

- real MCP execution
- query tools
- underlying data access
- write-capable tools

## Tasks

- define the wrapper tool names and responsibilities
- define the ToolDefinition fields used for metadata tools
- keep the tools read-only and preview-safe
- ensure raw MCP tools are not exposed directly

## Acceptance criteria

- the read-only metadata tool set is defined
- the wrapper naming and capability boundaries are explicit
- raw MCP exposure is avoided

## Validation

- type and contract tests if code is added
- no-network only

## Related issues

- Parent: #{{PARENT_ISSUE_NUMBER}} v0.7.0 Hosted Tableau MCP Migration Foundation
- docs/roadmap-v0.7-to-v0.10.md
- docs/v0.6-tableau-mcp-tool-layer-next-step.md

