import { describe, expect, it } from "vitest";
import {
  createToolDefinitionSummary,
  isToolDefinitionJsonSafe,
  type ToolDefinition,
  type ToolDefinitionSummary,
} from "../src/agent";

describe("tool definition contract", () => {
  it("describes context-derived pseudo tools for selected_mark_explanation", () => {
    const selectedMarksToolDefinition: ToolDefinition = {
      name: "context.selectedMarks",
      description:
        "Reads selected mark summaries from the current Tableau context preview.",
      category: "context",
      capabilities: ["read_context", "read_selected_marks"],
      safety: {
        level: "read_only",
        safeForPreview: true,
        requiresExplicitAction: false,
        externalAccess: false,
        mayAccessWorkbookContext: true,
        mayAccessSelectedMarks: true,
      },
      availability: {
        status: "conditional",
        reason: "Requires selected marks in the dashboard context.",
      },
      inputSchema: {
        kind: "typescript_contract",
        description:
          "Uses orchestration context rather than external arguments.",
        requiredFields: ["contextSummary"],
      },
      outputSchema: {
        kind: "typescript_contract",
        description: "Returns selected mark summaries and references only.",
        optionalFields: ["previewCount", "truncated"],
      },
      version: "v1",
      metadata: {
        source: "context_preview",
      },
      traceMetadata: {
        toolKind: "context.selectedMarks",
      },
    };

    const summary = createToolDefinitionSummary(selectedMarksToolDefinition);

    expect(summary).toEqual({
      name: "context.selectedMarks",
      description:
        "Reads selected mark summaries from the current Tableau context preview.",
      category: "context",
      capabilities: ["read_context", "read_selected_marks"],
      safety: {
        level: "read_only",
        safeForPreview: true,
        requiresExplicitAction: false,
        externalAccess: false,
        mayAccessWorkbookContext: true,
        mayAccessSelectedMarks: true,
      },
      availability: {
        status: "conditional",
        reason: "Requires selected marks in the dashboard context.",
      },
      inputSchema: {
        kind: "typescript_contract",
        description:
          "Uses orchestration context rather than external arguments.",
        requiredFields: ["contextSummary"],
      },
      outputSchema: {
        kind: "typescript_contract",
        description: "Returns selected mark summaries and references only.",
        optionalFields: ["previewCount", "truncated"],
      },
      version: "v1",
    });

    expect(isToolDefinitionJsonSafe(selectedMarksToolDefinition)).toBe(true);
    expect(JSON.parse(JSON.stringify(summary))).toEqual(summary);
  });

  it("supports Tableau MCP, Notion, REST API and internal tool categories", () => {
    const definitions: ToolDefinitionSummary[] = [
      {
        name: "tableau.metadata",
        description: "Reads Tableau workbook and datasource metadata.",
        category: "tableau_mcp",
        capabilities: ["read_tableau_metadata"],
        safety: {
          level: "read_only",
          safeForPreview: false,
          requiresExplicitAction: false,
          requiresAuthentication: true,
          externalAccess: true,
          mayCallMcp: true,
        },
        availability: { status: "available" },
        inputSchema: { kind: "none" },
        outputSchema: { kind: "typescript_contract" },
      },
      {
        name: "notion.createPage",
        description: "Creates a Notion page for a user-requested action.",
        category: "notion",
        capabilities: ["write_external_service"],
        safety: {
          level: "write_capable",
          safeForPreview: false,
          requiresExplicitAction: true,
          requiresAuthentication: true,
          externalAccess: true,
          mayCallMcp: true,
        },
        availability: {
          status: "conditional",
          reason: "Requires a connected Notion workspace.",
        },
        inputSchema: { kind: "json_schema", requiredFields: ["title"] },
        outputSchema: { kind: "json_schema" },
      },
      {
        name: "rest.lookup",
        description: "Calls a bounded external REST API.",
        category: "rest_api",
        capabilities: ["call_external_api"],
        safety: {
          level: "read_only",
          safeForPreview: false,
          requiresExplicitAction: false,
          externalAccess: true,
          mayCallExternalApi: true,
        },
        availability: { status: "unavailable", reason: "API disabled." },
        inputSchema: { kind: "json_schema" },
        outputSchema: { kind: "json_schema" },
      },
      {
        name: "internal.summarize",
        description: "Summarizes existing orchestration state.",
        category: "internal",
        capabilities: ["read_context"],
        safety: {
          level: "read_only",
          safeForPreview: true,
          requiresExplicitAction: false,
        },
        availability: { status: "available" },
        inputSchema: { kind: "typescript_contract" },
        outputSchema: { kind: "typescript_contract" },
      },
    ];

    for (const definition of definitions) {
      expect(isToolDefinitionJsonSafe(definition as ToolDefinition)).toBe(true);
      expect(JSON.parse(JSON.stringify(definition))).toEqual(definition);
    }
  });

  it("does not require ToolRegistry, tool execution or a schema library", () => {
    const pseudoTool: ToolDefinition = {
      name: "context.summaryDataPreview",
      description:
        "Reads summary data preview references from the current Tableau context preview.",
      category: "context",
      capabilities: ["read_context", "read_summary_data"],
      safety: {
        level: "read_only",
        safeForPreview: true,
        requiresExplicitAction: false,
        externalAccess: false,
        mayAccessSummaryData: true,
      },
      availability: {
        status: "conditional",
        reason: "Requires summary data preview to be collected.",
      },
      inputSchema: {
        kind: "none",
        description:
          "No external input is required; the orchestration context supplies the reference.",
      },
      outputSchema: {
        kind: "typescript_contract",
        description: "Returns summary metadata only; no raw data payload.",
      },
      metadata: {
        note: "This is a contract-only shape for v0.5 planning.",
      },
    };

    expect(isToolDefinitionJsonSafe(pseudoTool)).toBe(true);

    const pseudoToolWithExecutor = {
      ...pseudoTool,
      execute: () => undefined,
    } as ToolDefinition & { execute: () => void };

    expect(
      isToolDefinitionJsonSafe(pseudoToolWithExecutor as ToolDefinition),
    ).toBe(false);
    expect(
      Object.prototype.hasOwnProperty.call(pseudoToolWithExecutor, "execute"),
    ).toBe(true);

    const summary = createToolDefinitionSummary(pseudoToolWithExecutor);
    expect(summary).not.toHaveProperty("execute");
    expect(JSON.parse(JSON.stringify(summary))).toEqual(summary);
  });
});
