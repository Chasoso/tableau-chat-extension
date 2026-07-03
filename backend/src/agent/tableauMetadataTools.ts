import type {
  ToolCapability,
  ToolCategory,
  ToolDefinition,
  ToolSchemaPolicy,
} from "./toolDefinition";

export const TABLEAU_METADATA_TOOL_CATEGORY: ToolCategory = "tableau_mcp";
export const TABLEAU_METADATA_TOOL_CAPABILITY: ToolCapability =
  "read_tableau_metadata";

export const TABLEAU_METADATA_DESCRIBE_DATASOURCE_TOOL_NAME =
  "tableau.metadata.describeDatasource";
export const TABLEAU_METADATA_LIST_FIELDS_TOOL_NAME =
  "tableau.metadata.listFields";

const TABLEAU_METADATA_INPUT_SCHEMA: ToolSchemaPolicy = {
  kind: "typescript_contract",
  description:
    "Wrapper input contract for read-only Tableau metadata discovery. Detailed fields are finalized in #133.",
};

const TABLEAU_METADATA_OUTPUT_SCHEMA: ToolSchemaPolicy = {
  kind: "typescript_contract",
  description:
    "JSON-safe metadata summary contract. Detailed output fields are finalized in #133.",
};

const TABLEAU_METADATA_AVAILABILITY: ToolDefinition["availability"] = {
  status: "conditional",
  reason:
    "Requires authenticated Tableau metadata access and a configured transport boundary.",
};

const TABLEAU_METADATA_SAFETY: ToolDefinition["safety"] = {
  level: "read_only",
  safeForPreview: true,
  requiresExplicitAction: false,
  requiresAuthentication: true,
  externalAccess: true,
  mayCallMcp: true,
};

export const TABLEAU_METADATA_DESCRIBE_DATASOURCE_TOOL_DEFINITION =
  createTableauMetadataToolDefinition({
    name: TABLEAU_METADATA_DESCRIBE_DATASOURCE_TOOL_NAME,
    description:
      "Reads a safe, read-only summary of datasource metadata through the app-specific Tableau wrapper.",
    metadataFamily: "datasource",
  });

export const TABLEAU_METADATA_LIST_FIELDS_TOOL_DEFINITION =
  createTableauMetadataToolDefinition({
    name: TABLEAU_METADATA_LIST_FIELDS_TOOL_NAME,
    description:
      "Reads a safe, read-only summary of datasource fields through the app-specific Tableau wrapper.",
    metadataFamily: "fields",
  });

export function createTableauMetadataToolDefinitions(): ToolDefinition[] {
  return [
    TABLEAU_METADATA_DESCRIBE_DATASOURCE_TOOL_DEFINITION,
    TABLEAU_METADATA_LIST_FIELDS_TOOL_DEFINITION,
  ];
}

function createTableauMetadataToolDefinition(input: {
  name: string;
  description: string;
  metadataFamily: string;
}): ToolDefinition {
  return {
    name: input.name,
    description: input.description,
    category: TABLEAU_METADATA_TOOL_CATEGORY,
    capabilities: [TABLEAU_METADATA_TOOL_CAPABILITY],
    safety: { ...TABLEAU_METADATA_SAFETY },
    availability: { ...TABLEAU_METADATA_AVAILABILITY },
    inputSchema: { ...TABLEAU_METADATA_INPUT_SCHEMA },
    outputSchema: { ...TABLEAU_METADATA_OUTPUT_SCHEMA },
    version: "v1",
    metadata: {
      source: "tableau_metadata",
      wrapperKind: "app_specific",
      toolFamily: input.metadataFamily,
      readOnly: true,
      safeForPreview: true,
      externalAccess: true,
      requiresAuthentication: true,
      noRawMcpExposure: true,
    },
    traceMetadata: {
      toolKind: input.name,
      toolFamily: "tableau.metadata",
    },
  };
}
