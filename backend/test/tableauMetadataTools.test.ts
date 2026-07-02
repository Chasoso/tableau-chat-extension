import { describe, expect, it } from "vitest";
import {
  createToolDefinitionSummary,
  isToolDefinitionJsonSafe,
  TABLEAU_METADATA_DESCRIBE_DATASOURCE_TOOL_DEFINITION,
  TABLEAU_METADATA_DESCRIBE_DATASOURCE_TOOL_NAME,
  TABLEAU_METADATA_LIST_FIELDS_TOOL_DEFINITION,
  TABLEAU_METADATA_LIST_FIELDS_TOOL_NAME,
  TABLEAU_METADATA_TOOL_CAPABILITY,
  TABLEAU_METADATA_TOOL_CATEGORY,
  createTableauMetadataToolDefinitions,
  type ToolDefinition,
} from "../src/agent";

describe("tableau metadata tool definitions", () => {
  it("defines read-only app-specific metadata wrapper tools", () => {
    const definitions = createTableauMetadataToolDefinitions();

    expect(definitions).toHaveLength(2);
    expect(definitions.map((definition) => definition.name)).toEqual([
      TABLEAU_METADATA_DESCRIBE_DATASOURCE_TOOL_NAME,
      TABLEAU_METADATA_LIST_FIELDS_TOOL_NAME,
    ]);

    for (const definition of definitions) {
      expect(definition.category).toBe(TABLEAU_METADATA_TOOL_CATEGORY);
      expect(definition.capabilities).toEqual([
        TABLEAU_METADATA_TOOL_CAPABILITY,
      ]);
      expect(definition.safety).toMatchObject({
        level: "read_only",
        safeForPreview: true,
        requiresExplicitAction: false,
        requiresAuthentication: true,
        externalAccess: true,
      });
      expect(definition.safety.mayCallMcp).toBe(true);
      expect(definition.availability.status).toBe("conditional");
      expect(definition.inputSchema.kind).toBe("typescript_contract");
      expect(definition.outputSchema.kind).toBe("typescript_contract");
      expect(isToolDefinitionJsonSafe(definition)).toBe(true);
      expect(JSON.parse(JSON.stringify(definition))).toEqual(definition);
    }
  });

  it("keeps describeDatasource and listFields distinct in responsibility and metadata", () => {
    expect(TABLEAU_METADATA_DESCRIBE_DATASOURCE_TOOL_DEFINITION).toMatchObject({
      name: TABLEAU_METADATA_DESCRIBE_DATASOURCE_TOOL_NAME,
      description: expect.stringContaining("datasource metadata"),
      category: TABLEAU_METADATA_TOOL_CATEGORY,
      capabilities: [TABLEAU_METADATA_TOOL_CAPABILITY],
      safety: {
        level: "read_only",
        safeForPreview: true,
        requiresAuthentication: true,
        externalAccess: true,
      },
      metadata: {
        toolFamily: "datasource",
        readOnly: true,
        safeForPreview: true,
        externalAccess: true,
        requiresAuthentication: true,
        noRawMcpExposure: true,
      },
    });

    expect(TABLEAU_METADATA_LIST_FIELDS_TOOL_DEFINITION).toMatchObject({
      name: TABLEAU_METADATA_LIST_FIELDS_TOOL_NAME,
      description: expect.stringContaining("fields"),
      category: TABLEAU_METADATA_TOOL_CATEGORY,
      capabilities: [TABLEAU_METADATA_TOOL_CAPABILITY],
      safety: {
        level: "read_only",
        safeForPreview: true,
        requiresAuthentication: true,
        externalAccess: true,
      },
      metadata: {
        toolFamily: "fields",
        readOnly: true,
        safeForPreview: true,
        externalAccess: true,
        requiresAuthentication: true,
        noRawMcpExposure: true,
      },
    });
  });

  it("does not expose raw MCP tool names, raw tokens, or mutating capabilities", () => {
    const definitions: ToolDefinition[] = [
      TABLEAU_METADATA_DESCRIBE_DATASOURCE_TOOL_DEFINITION,
      TABLEAU_METADATA_LIST_FIELDS_TOOL_DEFINITION,
    ];

    for (const definition of definitions) {
      expect(definition.name.startsWith("tableau.metadata.")).toBe(true);
      expect(definition.name).not.toMatch(
        /^(mcp|tableau\.mcp|query-|describe-)/,
      );
      expect(JSON.stringify(definition)).not.toContain("access_token");
      expect(JSON.stringify(definition)).not.toContain("refresh_token");
      expect(JSON.stringify(definition)).not.toContain("secret");
      expect(definition.capabilities).not.toContain("query_tableau");
      expect(definition.capabilities).not.toContain("write_external_service");
    }

    expect(
      JSON.parse(JSON.stringify(createToolDefinitionSummary(definitions[0]))),
    ).toEqual(createToolDefinitionSummary(definitions[0]));
  });
});
