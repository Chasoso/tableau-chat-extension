import type { JsonObject, JsonValue } from "./types";

export type TableauMetadataSiteIdentifier = {
  siteId?: string;
  siteName?: string;
  contentUrl?: string;
};

export type TableauMetadataWorkbookIdentifier = {
  workbookId?: string;
  workbookName?: string;
  projectId?: string;
  projectName?: string;
};

export type TableauMetadataViewIdentifier = {
  viewId?: string;
  viewName?: string;
  workbookId?: string;
};

export type TableauMetadataDatasourceIdentifier = {
  datasourceId?: string;
  datasourceName?: string;
  workbookId?: string;
  workbookName?: string;
  projectId?: string;
  projectName?: string;
};

export type TableauMetadataToolRequestContext = {
  requestId?: string;
  correlationId?: string;
  agentRunId?: string;
  site?: TableauMetadataSiteIdentifier;
  workbook?: TableauMetadataWorkbookIdentifier;
  view?: TableauMetadataViewIdentifier;
  datasource?: TableauMetadataDatasourceIdentifier;
  locale?: string;
  maxItems?: number;
  includeHidden?: boolean;
  includeTechnicalMetadata?: boolean;
  metadata?: JsonObject;
};

export type TableauMetadataAmbiguityStatus =
  | "resolved"
  | "ambiguous"
  | "missing"
  | "not_found"
  | "not_checked";

export type TableauMetadataTarget =
  | "site"
  | "workbook"
  | "view"
  | "datasource"
  | "field";

export type TableauMetadataResolutionCandidate = {
  id?: string;
  name?: string;
  type?: TableauMetadataTarget;
  projectName?: string;
  workbookName?: string;
  datasourceName?: string;
  confidence?: "high" | "medium" | "low" | "unknown";
  metadata?: JsonObject;
};

export type TableauMetadataResolutionSummary = {
  status: TableauMetadataAmbiguityStatus;
  target: TableauMetadataTarget;
  selectedId?: string;
  selectedName?: string;
  candidates?: readonly TableauMetadataResolutionCandidate[];
  message?: string;
  metadata?: JsonObject;
};

export type TableauMetadataWarningCode =
  | "AMBIGUOUS_DATASOURCE"
  | "MISSING_DATASOURCE_IDENTIFIER"
  | "OUTPUT_TRUNCATED"
  | "FIELD_LIST_TRUNCATED"
  | "HIDDEN_FIELDS_OMITTED"
  | "TECHNICAL_METADATA_OMITTED"
  | "TRANSPORT_WARNING"
  | "PERMISSION_NOT_VERIFIED"
  | "SITE_SETTINGS_NOT_VERIFIED"
  | "UNKNOWN_WARNING";

export type TableauMetadataErrorCode =
  | "INVALID_INPUT"
  | "MISSING_REQUIRED_IDENTIFIER"
  | "AMBIGUOUS_IDENTIFIER"
  | "NOT_FOUND"
  | "AUTH_REQUIRED"
  | "PERMISSION_DENIED"
  | "SITE_SETTINGS_DISABLED"
  | "TRANSPORT_NOT_CONFIGURED"
  | "TRANSPORT_FAILED"
  | "TIMEOUT"
  | "UNKNOWN_ERROR";

export type TableauMetadataWarningSummary = {
  code: TableauMetadataWarningCode;
  message: string;
  target?: string;
  metadata?: JsonObject;
};

export type TableauMetadataErrorSummary = {
  code: TableauMetadataErrorCode;
  message: string;
  retryable?: boolean;
  userActionRequired?: boolean;
  target?: string;
  metadata?: JsonObject;
};

export type TableauMetadataOmissionReason =
  | "output_limit"
  | "field_limit"
  | "permission"
  | "not_requested"
  | "not_available"
  | "hidden_by_default"
  | "technical_metadata_disabled"
  | "unknown";

export type TableauMetadataTruncationSummary = {
  truncated: boolean;
  limit?: number;
  returned?: number;
  totalAvailable?: number;
  reason?: TableauMetadataOmissionReason;
};

export type TableauMetadataOmissionSummary = {
  omitted: boolean;
  reason?: TableauMetadataOmissionReason;
  message?: string;
  count?: number;
};

export type TableauDatasourceSummary = {
  datasourceId?: string;
  datasourceName?: string;
  projectId?: string;
  projectName?: string;
  workbookId?: string;
  workbookName?: string;
  siteId?: string;
  siteName?: string;
  ownerName?: string;
  connectionType?: string;
  isExtract?: boolean;
  fieldCount?: number;
  visibleFieldCount?: number;
  hiddenFieldCount?: number;
  lastUpdatedAt?: string;
  metadata?: JsonObject;
};

export type TableauMetadataFieldRole = "dimension" | "measure" | "unknown";

export type TableauMetadataFieldDataType =
  | "string"
  | "number"
  | "integer"
  | "float"
  | "boolean"
  | "date"
  | "datetime"
  | "geographic"
  | "unknown";

export type TableauFieldSummary = {
  fieldId?: string;
  fieldName: string;
  caption?: string;
  role?: TableauMetadataFieldRole;
  dataType?: TableauMetadataFieldDataType;
  isHidden?: boolean;
  isCalculated?: boolean;
  defaultAggregation?: string;
  semanticRole?: string;
  description?: string;
  metadata?: JsonObject;
};

export type TableauMetadataOutputStatus = "success" | "partial" | "failed";

export type TableauMetadataOutputBase = {
  status: TableauMetadataOutputStatus;
  resolution?: TableauMetadataResolutionSummary;
  warnings?: readonly TableauMetadataWarningSummary[];
  error?: TableauMetadataErrorSummary;
  truncation?: TableauMetadataTruncationSummary;
  omissions?: readonly TableauMetadataOmissionSummary[];
  metadata?: JsonObject;
};

export type TableauDescribeDatasourceInput = {
  requestContext?: TableauMetadataToolRequestContext;
  datasource: TableauMetadataDatasourceIdentifier;
  workbook?: TableauMetadataWorkbookIdentifier;
  view?: TableauMetadataViewIdentifier;
  site?: TableauMetadataSiteIdentifier;
  includeFieldsSummary?: boolean;
  includeConnectionSummary?: boolean;
  maxFieldsForSummary?: number;
};

export type TableauDescribeDatasourceOutput = TableauMetadataOutputBase & {
  summary?: TableauDatasourceSummary;
  fieldsSummary?: {
    totalFields?: number;
    visibleFields?: number;
    hiddenFields?: number;
    returnedSampleCount?: number;
    sampleFieldNames?: readonly string[];
    truncated?: boolean;
  };
  connectionSummary?: {
    connectionType?: string;
    isExtract?: boolean;
    liveOrExtract?: "live" | "extract" | "unknown";
  };
};

export type TableauListFieldsInput = {
  requestContext?: TableauMetadataToolRequestContext;
  datasource: TableauMetadataDatasourceIdentifier;
  workbook?: TableauMetadataWorkbookIdentifier;
  view?: TableauMetadataViewIdentifier;
  site?: TableauMetadataSiteIdentifier;
  maxFields?: number;
  includeHidden?: boolean;
  includeTechnicalMetadata?: boolean;
  fieldNameFilter?: string;
};

export type TableauListFieldsOutput = TableauMetadataOutputBase & {
  datasource?: TableauDatasourceSummary;
  fields: readonly TableauFieldSummary[];
  fieldCountSummary?: {
    returned: number;
    totalAvailable?: number;
    visibleFields?: number;
    hiddenFields?: number;
  };
};

export type TableauMetadataToolOutput<TSummary> = TableauMetadataOutputBase & {
  toolName: string;
  summary: TSummary;
};

export function isTableauMetadataJsonSafe(value: unknown): boolean {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every((item) => isTableauMetadataJsonSafe(item));
  }

  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).every((item) =>
      isTableauMetadataJsonSafe(item),
    );
  }

  return false;
}

export function hasForbiddenRuntimeValue(value: unknown): boolean {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return false;
  }

  if (
    typeof value === "function" ||
    typeof value === "symbol" ||
    typeof value === "bigint"
  ) {
    return true;
  }

  if (typeof value !== "object") {
    return false;
  }

  if (value instanceof Date || value instanceof Map || value instanceof Set) {
    return true;
  }

  for (const item of Object.values(value as Record<string, unknown>)) {
    if (
      typeof item === "function" ||
      typeof item === "symbol" ||
      typeof item === "bigint" ||
      item instanceof Date ||
      item instanceof Map ||
      item instanceof Set
    ) {
      return true;
    }

    if (item && typeof item === "object" && hasForbiddenRuntimeValue(item)) {
      return true;
    }
  }

  return false;
}

export function normalizeMaxItems(
  value: number | undefined,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Number.isFinite(value)) {
    return undefined;
  }

  return Math.max(1, Math.floor(value));
}

export function cloneMetadataJson<T extends JsonValue>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
