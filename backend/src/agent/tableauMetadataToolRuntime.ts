import { createDefaultToolExecutionWrapper } from "./toolExecutionWrapper";
import { InMemoryToolRegistry } from "./toolRegistry";
import type { JsonObject, JsonValue } from "./types";
import {
  cloneMetadataJson,
  normalizeMaxItems,
  type TableauDescribeDatasourceInput,
  type TableauDescribeDatasourceOutput,
  type TableauFieldSummary,
  type TableauListFieldsInput,
  type TableauListFieldsOutput,
  type TableauMetadataErrorCode,
  type TableauMetadataErrorSummary,
  type TableauMetadataOmissionSummary,
  type TableauMetadataResolutionSummary,
  type TableauMetadataTruncationSummary,
  type TableauMetadataWarningSummary,
} from "./tableauMetadataSchemas";
import {
  createTableauMetadataToolDefinitions,
  TABLEAU_METADATA_DESCRIBE_DATASOURCE_TOOL_NAME,
  TABLEAU_METADATA_LIST_FIELDS_TOOL_NAME,
} from "./tableauMetadataTools";
import {
  evaluateTableauMetadataToolPreconditions,
  TABLEAU_METADATA_ALLOWED_TOOL_NAMES,
  type TableauMetadataPreconditionInput,
  type TableauMetadataPreconditionResult,
  type TableauMetadataToolPolicy,
  type TableauMetadataTransportKind,
} from "./tableauMetadataPreconditions";
import type {
  ToolExecutionHandler,
  ToolExecutionInput,
} from "./toolExecutionWrapper";

export type TableauMetadataFakeExecutionContext = {
  preconditionInput?: Partial<TableauMetadataPreconditionInput>;
};

export type TableauMetadataToolRuntime = {
  registry: InMemoryToolRegistry;
  executionWrapper: ReturnType<typeof createDefaultToolExecutionWrapper>;
};

const FAKE_TRANSPORT_WARNING: TableauMetadataWarningSummary = {
  code: "TRANSPORT_WARNING",
  message: "Fake no-network metadata result.",
  metadata: {
    transportKind: "fake",
    noNetwork: true,
    source: "fake_no_network",
    placeholder: true,
  },
};

const FAKE_DATASET = {
  datasourceId: "fake-datasource-id",
  datasourceName: "Fake Tableau Datasource",
  workbookId: "fake-workbook-id",
  workbookName: "Fake Workbook",
  siteId: "fake-site-id",
  siteName: "Fake Site",
  ownerName: "Fake Owner",
  connectionType: "fake",
  isExtract: false,
  fields: [
    {
      fieldId: "fake-field-region",
      fieldName: "Region",
      caption: "Region",
      role: "dimension",
      dataType: "string",
      isHidden: false,
      isCalculated: false,
      semanticRole: "location",
      description: "Fake region field for no-network testing.",
    },
    {
      fieldId: "fake-field-sales",
      fieldName: "Sales",
      caption: "Sales",
      role: "measure",
      dataType: "number",
      isHidden: false,
      isCalculated: false,
      defaultAggregation: "sum",
      semanticRole: "measure",
      description: "Fake sales field for no-network testing.",
    },
    {
      fieldId: "fake-field-order-date",
      fieldName: "Order Date",
      caption: "Order Date",
      role: "dimension",
      dataType: "date",
      isHidden: false,
      isCalculated: false,
      semanticRole: "temporal",
      description: "Fake order date field for no-network testing.",
    },
    {
      fieldId: "fake-field-internal-note",
      fieldName: "Internal Note",
      caption: "Internal Note",
      role: "dimension",
      dataType: "string",
      isHidden: true,
      isCalculated: false,
      semanticRole: "text",
      description: "Hidden fake field for truncation and omission tests.",
    },
  ] satisfies readonly TableauFieldSummary[],
} as const;

const FAKE_HANDLER_TOOL_POLICY: TableauMetadataToolPolicy = {
  allowedToolNames: [...TABLEAU_METADATA_ALLOWED_TOOL_NAMES],
  safeForPreviewOnly: true,
  readOnlyOnly: true,
  allowExternalAccess: true,
  allowUnderlyingDataAccess: false,
  allowWriteOperations: false,
};

const DEFAULT_SITE_IDENTIFIER = {
  siteId: FAKE_DATASET.siteId,
  siteName: FAKE_DATASET.siteName,
};

const DEFAULT_WORKBOOK_IDENTIFIER = {
  workbookId: FAKE_DATASET.workbookId,
  workbookName: FAKE_DATASET.workbookName,
};

const DEFAULT_DATASOURCE_IDENTIFIER = {
  datasourceId: FAKE_DATASET.datasourceId,
  datasourceName: FAKE_DATASET.datasourceName,
  workbookId: FAKE_DATASET.workbookId,
  workbookName: FAKE_DATASET.workbookName,
  projectId: "fake-project-id",
  projectName: "Fake Project",
};

export function createTableauMetadataToolRegistry(): InMemoryToolRegistry {
  return new InMemoryToolRegistry(createTableauMetadataToolDefinitions());
}

export function createTableauMetadataToolRuntime(): TableauMetadataToolRuntime {
  return {
    registry: createTableauMetadataToolRegistry(),
    executionWrapper: createDefaultToolExecutionWrapper({
      handlers: createTableauMetadataToolHandlers(),
      defaultTimeoutMs: 5_000,
    }),
  };
}

export function createTableauMetadataToolHandlers(): Record<
  string,
  ToolExecutionHandler
> {
  return {
    [TABLEAU_METADATA_DESCRIBE_DATASOURCE_TOOL_NAME]:
      createDescribeDatasourceFakeHandler(),
    [TABLEAU_METADATA_LIST_FIELDS_TOOL_NAME]: createListFieldsFakeHandler(),
  };
}

export function createDescribeDatasourceFakeHandler(): ToolExecutionHandler {
  return async (input) => {
    const normalizedInput = normalizeDescribeDatasourceInput(
      input.input,
      input.context,
    );
    const precondition = evaluateTableauMetadataToolPreconditions(
      buildPreconditionInput(
        input,
        TABLEAU_METADATA_DESCRIBE_DATASOURCE_TOOL_NAME,
        normalizedInput,
      ),
    );

    if (!precondition.canExecute) {
      return buildDescribeDatasourceFailedOutput(normalizedInput, precondition);
    }

    return buildDescribeDatasourceSuccessOutput(normalizedInput, precondition);
  };
}

export function createListFieldsFakeHandler(): ToolExecutionHandler {
  return async (input) => {
    const normalizedInput = normalizeListFieldsInput(
      input.input,
      input.context,
    );
    const precondition = evaluateTableauMetadataToolPreconditions(
      buildPreconditionInput(
        input,
        TABLEAU_METADATA_LIST_FIELDS_TOOL_NAME,
        normalizedInput,
      ),
    );

    if (!precondition.canExecute) {
      return buildListFieldsFailedOutput(normalizedInput, precondition);
    }

    return buildListFieldsSuccessOutput(normalizedInput, precondition);
  };
}

function buildPreconditionInput(
  input: ToolExecutionInput,
  toolName: string,
  normalizedInput: TableauDescribeDatasourceInput | TableauListFieldsInput,
): TableauMetadataPreconditionInput {
  const context = isJsonObject(input.context) ? input.context : undefined;
  const contextualPrecondition = isJsonObject(
    context?.tableauMetadataPreconditionInput,
  )
    ? (context.tableauMetadataPreconditionInput as Partial<TableauMetadataPreconditionInput>)
    : undefined;

  return {
    toolName,
    requestId: readString(context?.tableauMetadataRequestId),
    correlationId: readString(context?.tableauMetadataCorrelationId),
    agentRunId:
      readString(context?.tableauMetadataAgentRunId) ?? input.agentRunId,
    authenticatedTableauContext:
      contextualPrecondition?.authenticatedTableauContext ?? {
        isAuthenticated: true,
        authMode: "fake",
        ...buildJsonObjectFromPairs([
          ["userId", readString(context?.tableauMetadataUserId)],
          ["tableauUserId", readString(context?.tableauMetadataTableauUserId)],
          ["email", readString(context?.tableauMetadataEmail)],
          ["siteId", readString(context?.tableauMetadataSiteId)],
          ["siteName", readString(context?.tableauMetadataSiteName)],
        ]),
      },
    siteSettings:
      contextualPrecondition?.siteSettings ??
      ({
        status: "not_required_for_fake",
        source: "fake",
      } as const),
    identifierResolution: contextualPrecondition?.identifierResolution ?? {
      datasource:
        readResolutionOverride(context?.tableauMetadataDatasourceResolution) ??
        buildDatasourceResolution(normalizedInput),
      workbook: readResolutionOverride(
        context?.tableauMetadataWorkbookResolution,
      ),
      view: readResolutionOverride(context?.tableauMetadataViewResolution),
      site: readResolutionOverride(context?.tableauMetadataSiteResolution),
    },
    toolPolicy: {
      ...FAKE_HANDLER_TOOL_POLICY,
      ...(contextualPrecondition?.toolPolicy ?? {}),
    },
    budget: {
      timeoutMs: 5_000,
      remainingTimeMs: 5_000,
      maxItems: 25,
      ...(contextualPrecondition?.budget ?? {}),
    },
    transportConfig: contextualPrecondition?.transportConfig ?? {
      selectedTransportKind: readTransportKind(
        context?.tableauMetadataTransportKind,
      ),
      status: "selected",
      noNetwork: true,
    },
    permission:
      contextualPrecondition?.permission ??
      ({
        status: "not_verified",
      } as const),
    metadata: buildJsonObjectFromPairs([
      ["source", "fake_no_network"],
      ["placeholder", true],
      ["toolName", toolName],
      ...(input.agentRunId ? [["agentRunId", input.agentRunId] as const] : []),
    ]),
  };
}

function normalizeDescribeDatasourceInput(
  value: unknown,
  context: JsonObject | undefined,
): TableauDescribeDatasourceInput {
  const input = normalizeMetadataToolInput(value);
  const requestContext = readRequestContext(context);

  return {
    requestContext: requestContext ?? createDefaultRequestContext(),
    datasource: normalizeDatasourceIdentifier(input.datasource),
    workbook: normalizeWorkbookIdentifier(input.workbook),
    view: normalizeViewIdentifier(input.view),
    site: normalizeSiteIdentifier(input.site),
    includeFieldsSummary:
      typeof input.includeFieldsSummary === "boolean"
        ? input.includeFieldsSummary
        : true,
    includeConnectionSummary:
      typeof input.includeConnectionSummary === "boolean"
        ? input.includeConnectionSummary
        : true,
    maxFieldsForSummary: normalizeMaxItems(
      readNumber(input.maxFieldsForSummary),
    ),
  };
}

function normalizeListFieldsInput(
  value: unknown,
  context: JsonObject | undefined,
): TableauListFieldsInput {
  const input = normalizeMetadataToolInput(value);
  const requestContext = readRequestContext(context);

  return {
    requestContext: requestContext ?? createDefaultRequestContext(),
    datasource: normalizeDatasourceIdentifier(input.datasource),
    workbook: normalizeWorkbookIdentifier(input.workbook),
    view: normalizeViewIdentifier(input.view),
    site: normalizeSiteIdentifier(input.site),
    maxFields: normalizeMaxItems(readNumber(input.maxFields)),
    includeHidden: Boolean(input.includeHidden),
    includeTechnicalMetadata: Boolean(input.includeTechnicalMetadata),
    ...(typeof input.fieldNameFilter === "string"
      ? { fieldNameFilter: input.fieldNameFilter }
      : {}),
  };
}

function buildDescribeDatasourceSuccessOutput(
  input: TableauDescribeDatasourceInput,
  precondition: TableauMetadataPreconditionResult,
): TableauDescribeDatasourceOutput {
  const visibleFields = getVisibleFields();
  const hiddenFields = getHiddenFields();
  const allFields = [...visibleFields, ...hiddenFields];
  const maxFields =
    normalizeMaxItems(input.maxFieldsForSummary) ?? allFields.length;
  const sampleFields = allFields.slice(0, maxFields);
  const fieldCount = allFields.length;

  return {
    status: "success",
    summary: buildDatasourceSummary(
      input,
      fieldCount,
      visibleFields.length,
      hiddenFields.length,
    ),
    resolution: preconditionToResolution(precondition),
    ...(input.includeFieldsSummary === false
      ? {}
      : {
          fieldsSummary: {
            totalFields: fieldCount,
            visibleFields: visibleFields.length,
            hiddenFields: hiddenFields.length,
            returnedSampleCount: sampleFields.length,
            sampleFieldNames: sampleFields.map((field) => field.fieldName),
            truncated: sampleFields.length < fieldCount,
          },
        }),
    ...(input.includeConnectionSummary === false
      ? {}
      : {
          connectionSummary: {
            connectionType: FAKE_DATASET.connectionType,
            isExtract: FAKE_DATASET.isExtract,
            liveOrExtract: "unknown" as const,
          },
        }),
    warnings: buildOutputWarnings(precondition),
    metadata: buildPlaceholderMetadata("success"),
  };
}

function buildListFieldsSuccessOutput(
  input: TableauListFieldsInput,
  precondition: TableauMetadataPreconditionResult,
): TableauListFieldsOutput {
  const baseFields =
    input.includeHidden === true
      ? [...FAKE_DATASET.fields]
      : getVisibleFields();
  const filteredFields = applyFieldNameFilter(
    baseFields,
    input.fieldNameFilter,
  );
  const maxFields = normalizeMaxItems(input.maxFields) ?? filteredFields.length;
  const returnedFields = filteredFields.slice(0, maxFields);
  const hiddenFieldCount = FAKE_DATASET.fields.filter(
    (field) => field.isHidden,
  ).length;
  const visibleFieldCount = FAKE_DATASET.fields.filter(
    (field) => !field.isHidden,
  ).length;
  const omissions: TableauMetadataOmissionSummary[] = [];

  if (input.includeHidden !== true && hiddenFieldCount > 0) {
    omissions.push({
      omitted: true,
      reason: "hidden_by_default",
      message: "Hidden fields were omitted from the fake result.",
      count: hiddenFieldCount,
    });
  }

  if (returnedFields.length < filteredFields.length) {
    omissions.push({
      omitted: true,
      reason: "field_limit",
      message: "The fake field list was truncated to respect maxFields.",
      count: filteredFields.length - returnedFields.length,
    });
  }

  return {
    status: "success",
    datasource: buildDatasourceSummary(
      input,
      baseFields.length,
      visibleFieldCount,
      hiddenFieldCount,
    ),
    resolution: preconditionToResolution(precondition),
    fields: returnedFields,
    fieldCountSummary: {
      returned: returnedFields.length,
      totalAvailable: filteredFields.length,
      visibleFields: visibleFieldCount,
      hiddenFields: hiddenFieldCount,
    },
    warnings: buildOutputWarnings(
      precondition,
      returnedFields.length < filteredFields.length,
    ),
    ...(omissions.length > 0 ? { omissions } : {}),
    ...(returnedFields.length < filteredFields.length
      ? {
          truncation: {
            truncated: true,
            limit: maxFields,
            returned: returnedFields.length,
            totalAvailable: filteredFields.length,
            reason: "field_limit",
          } satisfies TableauMetadataTruncationSummary,
        }
      : {}),
    metadata: buildPlaceholderMetadata("success"),
  };
}

function buildDescribeDatasourceFailedOutput(
  input: TableauDescribeDatasourceInput,
  precondition: TableauMetadataPreconditionResult,
): TableauDescribeDatasourceOutput {
  return {
    status: "failed",
    summary: buildDatasourceSummary(input, 0, 0, 0, true),
    resolution: preconditionToResolution(precondition),
    error: buildOutputError(precondition),
    warnings: buildOutputWarnings(precondition),
    metadata: buildPlaceholderMetadata("failed"),
  };
}

function buildListFieldsFailedOutput(
  input: TableauListFieldsInput,
  precondition: TableauMetadataPreconditionResult,
): TableauListFieldsOutput {
  return {
    status: "failed",
    datasource: buildDatasourceSummary(input, 0, 0, 0, true),
    resolution: preconditionToResolution(precondition),
    fields: [],
    fieldCountSummary: {
      returned: 0,
      totalAvailable: 0,
      visibleFields: 0,
      hiddenFields: 0,
    },
    error: buildOutputError(precondition),
    warnings: buildOutputWarnings(precondition),
    metadata: buildPlaceholderMetadata("failed"),
  };
}

function buildOutputWarnings(
  precondition: TableauMetadataPreconditionResult,
  truncated = false,
): readonly TableauMetadataWarningSummary[] {
  const warnings: TableauMetadataWarningSummary[] = [
    cloneMetadataJson(FAKE_TRANSPORT_WARNING),
  ];

  if (truncated) {
    warnings.push({
      code: "OUTPUT_TRUNCATED",
      message: "The fake result was truncated to respect the configured limit.",
      metadata: buildJsonObjectFromPairs([
        ["source", "fake_no_network"],
        ["placeholder", true],
      ]),
    });
  }

  if (precondition.status === "warning" && precondition.warnings?.length) {
    for (const warning of precondition.warnings) {
      warnings.push({
        code: normalizeWarningCode(warning.code),
        message: warning.message,
        target: warning.target,
        metadata: warning.metadata
          ? cloneMetadataJson(warning.metadata)
          : undefined,
      });
    }
  }

  return warnings;
}

function buildOutputError(
  precondition: TableauMetadataPreconditionResult,
): TableauMetadataErrorSummary {
  const code = mapPreconditionFailureToErrorCode(precondition.failureCode);
  return {
    code,
    message:
      precondition.userFacingMessage ??
      precondition.message ??
      "Metadata precondition failed.",
    retryable: code === "TIMEOUT" || code === "TRANSPORT_NOT_CONFIGURED",
    userActionRequired:
      code !== "TIMEOUT" && code !== "TRANSPORT_NOT_CONFIGURED",
    metadata: buildJsonObjectFromPairs([
      ["source", "fake_no_network"],
      ["preconditionStatus", precondition.status],
      [
        "failureCode",
        precondition.failureCode ?? "UNKNOWN_PRECONDITION_FAILURE",
      ],
    ]),
  };
}

function mapPreconditionFailureToErrorCode(
  failureCode: TableauMetadataPreconditionResult["failureCode"],
): TableauMetadataErrorCode {
  switch (failureCode) {
    case "AUTH_REQUIRED":
      return "AUTH_REQUIRED";
    case "DATASOURCE_IDENTIFIER_MISSING":
      return "MISSING_REQUIRED_IDENTIFIER";
    case "DATASOURCE_IDENTIFIER_AMBIGUOUS":
    case "WORKBOOK_IDENTIFIER_AMBIGUOUS":
    case "VIEW_IDENTIFIER_AMBIGUOUS":
      return "AMBIGUOUS_IDENTIFIER";
    case "SITE_SETTINGS_DISABLED":
      return "SITE_SETTINGS_DISABLED";
    case "TRANSPORT_NOT_CONFIGURED":
      return "TRANSPORT_NOT_CONFIGURED";
    case "BUDGET_EXHAUSTED":
    case "TIMEOUT_TOO_LOW":
      return "TIMEOUT";
    case "PERMISSION_DENIED":
      return "PERMISSION_DENIED";
    case "INSUFFICIENT_SCOPE":
      return "PERMISSION_DENIED";
    default:
      return "UNKNOWN_ERROR";
  }
}

function preconditionToResolution(
  precondition: TableauMetadataPreconditionResult,
): TableauMetadataResolutionSummary {
  const datasourceResolution =
    precondition.metadata?.datasourceResolution ?? "not_checked";

  if (datasourceResolution === "resolved") {
    return {
      status: "resolved",
      target: "datasource",
      selectedId: FAKE_DATASET.datasourceId,
      selectedName: FAKE_DATASET.datasourceName,
      message: "Datasource resolved in fake mode.",
    };
  }

  if (datasourceResolution === "ambiguous") {
    return {
      status: "ambiguous",
      target: "datasource",
      candidates: [
        {
          id: "fake-candidate-1",
          name: "Fake Candidate One",
          type: "datasource",
          confidence: "medium",
        },
        {
          id: "fake-candidate-2",
          name: "Fake Candidate Two",
          type: "datasource",
          confidence: "low",
        },
      ],
      message: "Datasource resolution is ambiguous in fake mode.",
    };
  }

  if (datasourceResolution === "missing") {
    return {
      status: "missing",
      target: "datasource",
      message: "Datasource identifier is missing.",
    };
  }

  if (datasourceResolution === "not_found") {
    return {
      status: "not_found",
      target: "datasource",
      message: "Datasource was not found in fake mode.",
    };
  }

  return {
    status: "not_checked",
    target: "datasource",
    message: "Datasource resolution was not checked.",
  };
}

function buildDatasourceSummary(
  input: TableauDescribeDatasourceInput | TableauListFieldsInput,
  fieldCount: number,
  visibleFieldCount: number,
  hiddenFieldCount: number,
  placeholder = false,
): NonNullable<TableauDescribeDatasourceOutput["summary"]> {
  return {
    ...DEFAULT_DATASOURCE_IDENTIFIER,
    datasourceId:
      input.datasource.datasourceId ??
      DEFAULT_DATASOURCE_IDENTIFIER.datasourceId,
    datasourceName:
      input.datasource.datasourceName ??
      DEFAULT_DATASOURCE_IDENTIFIER.datasourceName,
    ...(input.datasource.projectId
      ? { projectId: input.datasource.projectId }
      : { projectId: DEFAULT_DATASOURCE_IDENTIFIER.projectId }),
    ...(input.datasource.projectName
      ? { projectName: input.datasource.projectName }
      : { projectName: DEFAULT_DATASOURCE_IDENTIFIER.projectName }),
    workbookId:
      input.workbook?.workbookId ?? DEFAULT_WORKBOOK_IDENTIFIER.workbookId,
    workbookName:
      input.workbook?.workbookName ?? DEFAULT_WORKBOOK_IDENTIFIER.workbookName,
    siteId: input.site?.siteId ?? DEFAULT_SITE_IDENTIFIER.siteId,
    siteName: input.site?.siteName ?? DEFAULT_SITE_IDENTIFIER.siteName,
    ownerName: FAKE_DATASET.ownerName,
    connectionType: FAKE_DATASET.connectionType,
    isExtract: FAKE_DATASET.isExtract,
    fieldCount,
    visibleFieldCount,
    hiddenFieldCount,
    ...(placeholder
      ? {
          metadata: buildJsonObjectFromPairs([
            ["source", "fake_no_network"],
            ["placeholder", true],
          ]),
        }
      : {}),
  };
}

function getVisibleFields(): TableauFieldSummary[] {
  return FAKE_DATASET.fields.filter((field) => !field.isHidden);
}

function getHiddenFields(): TableauFieldSummary[] {
  return FAKE_DATASET.fields.filter((field) => field.isHidden);
}

function applyFieldNameFilter(
  fields: TableauFieldSummary[],
  filter: string | undefined,
): TableauFieldSummary[] {
  if (!filter) {
    return fields;
  }

  const lowerFilter = filter.toLowerCase();
  return fields.filter((field) =>
    field.fieldName.toLowerCase().includes(lowerFilter),
  );
}

function buildPlaceholderMetadata(status: "success" | "failed"): JsonObject {
  return buildJsonObjectFromPairs([
    ["source", "fake_no_network"],
    ["placeholder", true],
    ["status", status],
  ]);
}

function buildJsonObjectFromPairs(
  entries: readonly (readonly [string, JsonValue | undefined])[],
): JsonObject {
  const result: JsonObject = {};
  for (const [key, value] of entries) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

function createDefaultRequestContext(): TableauDescribeDatasourceInput["requestContext"] {
  return {
    requestId: "fake-request-id",
    correlationId: "fake-correlation-id",
    agentRunId: "fake-agent-run-id",
    locale: "en-US",
    maxItems: 25,
    includeHidden: false,
    includeTechnicalMetadata: false,
    metadata: buildJsonObjectFromPairs([
      ["source", "fake_no_network"],
      ["placeholder", true],
    ]),
  };
}

function readRequestContext(
  context: JsonObject | undefined,
): TableauDescribeDatasourceInput["requestContext"] | undefined {
  if (!isJsonObject(context?.tableauMetadataRequestContext)) {
    return undefined;
  }

  return cloneMetadataJson(
    context.tableauMetadataRequestContext,
  ) as TableauDescribeDatasourceInput["requestContext"];
}

function readResolutionOverride(
  value: unknown,
): TableauMetadataResolutionSummary | undefined {
  if (!isJsonObject(value)) {
    return undefined;
  }

  return cloneMetadataJson(
    value,
  ) as unknown as TableauMetadataResolutionSummary;
}

function buildDatasourceResolution(
  input: TableauDescribeDatasourceInput | TableauListFieldsInput,
): TableauMetadataResolutionSummary {
  const datasourceId = input.datasource.datasourceId;
  const datasourceName = input.datasource.datasourceName;

  if (datasourceId || datasourceName) {
    return {
      status: "resolved",
      target: "datasource",
      selectedId: datasourceId ?? FAKE_DATASET.datasourceId,
      selectedName: datasourceName ?? FAKE_DATASET.datasourceName,
      message: "Datasource resolved in fake mode.",
    };
  }

  return {
    status: "missing",
    target: "datasource",
    message: "Datasource identifier is missing.",
  };
}

function normalizeMetadataToolInput(value: unknown): Record<string, unknown> {
  return isJsonObject(value) ? value : {};
}

function normalizeDatasourceIdentifier(
  value: unknown,
): TableauDescribeDatasourceInput["datasource"] {
  if (isJsonObject(value)) {
    return cloneMetadataJson(value);
  }

  return {};
}

function normalizeWorkbookIdentifier(
  value: unknown,
): TableauDescribeDatasourceInput["workbook"] | undefined {
  if (!isJsonObject(value)) {
    return undefined;
  }

  return cloneMetadataJson(value) as TableauDescribeDatasourceInput["workbook"];
}

function normalizeViewIdentifier(
  value: unknown,
): TableauDescribeDatasourceInput["view"] | undefined {
  if (!isJsonObject(value)) {
    return undefined;
  }

  return cloneMetadataJson(value) as TableauDescribeDatasourceInput["view"];
}

function normalizeSiteIdentifier(
  value: unknown,
): TableauDescribeDatasourceInput["site"] | undefined {
  if (!isJsonObject(value)) {
    return undefined;
  }

  return cloneMetadataJson(value) as TableauDescribeDatasourceInput["site"];
}

function normalizeWarningCode(
  code: TableauMetadataWarningSummary["code"] | string,
): TableauMetadataWarningSummary["code"] {
  switch (code) {
    case "PERMISSION_NOT_VERIFIED":
    case "SITE_SETTINGS_NOT_VERIFIED":
    case "TRANSPORT_WARNING":
    case "FIELD_LIST_TRUNCATED":
    case "OUTPUT_TRUNCATED":
    case "AMBIGUOUS_DATASOURCE":
    case "MISSING_DATASOURCE_IDENTIFIER":
    case "TECHNICAL_METADATA_OMITTED":
    case "HIDDEN_FIELDS_OMITTED":
      return code;
    case "USING_FAKE_TRANSPORT":
    case "USING_STDIO_FALLBACK":
      return "TRANSPORT_WARNING";
    case "MAX_ITEMS_REDUCED":
      return "OUTPUT_TRUNCATED";
    default:
      return "UNKNOWN_WARNING";
  }
}

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function readTransportKind(
  value: unknown,
): TableauMetadataTransportKind | undefined {
  if (
    value === "stdio" ||
    value === "hosted" ||
    value === "remote" ||
    value === "fake" ||
    value === "unknown"
  ) {
    return value;
  }

  return undefined;
}
