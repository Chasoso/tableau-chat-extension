import type { JsonObject, JsonValue } from "./types";

export type ToolCategory =
  | "context"
  | "tableau_mcp"
  | "notion"
  | "rest_api"
  | "internal";

export type ToolSafetyLevel = "read_only" | "write_capable";

export type ToolCapability =
  | "read_context"
  | "read_selected_marks"
  | "read_summary_data"
  | "read_filters"
  | "read_parameters"
  | "read_tableau_metadata"
  | "query_tableau"
  | "call_external_api"
  | "write_external_service";

export type ToolSafety = {
  level: ToolSafetyLevel;
  safeForPreview: boolean;
  requiresExplicitAction: boolean;
  requiresAuthentication?: boolean;
  externalAccess?: boolean;
  mayAccessWorkbookContext?: boolean;
  mayAccessSelectedMarks?: boolean;
  mayAccessSummaryData?: boolean;
  mayCallMcp?: boolean;
  mayCallExternalApi?: boolean;
};

export type ToolAvailabilityStatus =
  | "available"
  | "unavailable"
  | "conditional";

export type ToolAvailability = {
  status: ToolAvailabilityStatus;
  reason?: string;
};

export type ToolSchemaPolicyKind =
  | "json_schema"
  | "typescript_contract"
  | "none";

export type ToolSchemaPolicy = {
  kind: ToolSchemaPolicyKind;
  description?: string;
  requiredFields?: readonly string[];
  optionalFields?: readonly string[];
};

export type ToolDefinition = {
  name: string;
  description: string;
  category: ToolCategory;
  capabilities: readonly ToolCapability[];
  safety: ToolSafety;
  availability: ToolAvailability;
  inputSchema: ToolSchemaPolicy;
  outputSchema: ToolSchemaPolicy;
  version?: string;
  metadata?: JsonObject;
  traceMetadata?: JsonObject;
};

export type ToolDefinitionSummary = {
  name: string;
  description: string;
  category: ToolCategory;
  capabilities: readonly ToolCapability[];
  safety: ToolSafety;
  availability: ToolAvailability;
  inputSchema: ToolSchemaPolicy;
  outputSchema: ToolSchemaPolicy;
  version?: string;
};

export function createToolDefinitionSummary(
  definition: ToolDefinition,
): ToolDefinitionSummary {
  return {
    name: definition.name,
    description: definition.description,
    category: definition.category,
    capabilities: [...definition.capabilities],
    safety: { ...definition.safety },
    availability: { ...definition.availability },
    inputSchema: cloneToolSchemaPolicy(definition.inputSchema),
    outputSchema: cloneToolSchemaPolicy(definition.outputSchema),
    ...(definition.version ? { version: definition.version } : {}),
  };
}

export function isToolDefinitionJsonSafe(definition: ToolDefinition): boolean {
  const summary = createToolDefinitionSummary(definition);
  return isJsonSafeValue(summary) && !hasFunctionLikeProperty(definition);
}

function cloneToolSchemaPolicy(policy: ToolSchemaPolicy): ToolSchemaPolicy {
  return {
    kind: policy.kind,
    ...(policy.description ? { description: policy.description } : {}),
    ...(policy.requiredFields?.length
      ? { requiredFields: [...policy.requiredFields] }
      : {}),
    ...(policy.optionalFields?.length
      ? { optionalFields: [...policy.optionalFields] }
      : {}),
  };
}

function isJsonSafeValue(value: JsonValue | ToolDefinitionSummary): boolean {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every((item) => isJsonSafeValue(item));
  }

  if (typeof value === "object") {
    return Object.values(value).every((item) =>
      isJsonSafeValue(item as JsonValue),
    );
  }

  return false;
}

function hasFunctionLikeProperty(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }

  for (const item of Object.values(value as Record<string, unknown>)) {
    if (typeof item === "function" || typeof item === "symbol") {
      return true;
    }
    if (item && typeof item === "object" && hasFunctionLikeProperty(item)) {
      return true;
    }
  }

  return false;
}
