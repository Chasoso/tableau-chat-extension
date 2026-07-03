import type { JsonObject } from "./types";
import {
  cloneMetadataJson,
  hasForbiddenRuntimeValue,
  isTableauMetadataJsonSafe,
  normalizeMaxItems,
  type TableauMetadataResolutionSummary,
} from "./tableauMetadataSchemas";
import {
  TABLEAU_METADATA_DESCRIBE_DATASOURCE_TOOL_NAME,
  TABLEAU_METADATA_LIST_FIELDS_TOOL_NAME,
} from "./tableauMetadataTools";

export type TableauMetadataToolName =
  | typeof TABLEAU_METADATA_DESCRIBE_DATASOURCE_TOOL_NAME
  | typeof TABLEAU_METADATA_LIST_FIELDS_TOOL_NAME;

export type TableauMetadataToolPreconditionInput = {
  toolName: string;
  requestId?: string;
  correlationId?: string;
  agentRunId?: string;
  authenticatedTableauContext?: TableauMetadataAuthenticatedContext;
  siteSettings?: TableauMetadataSiteSettingsState;
  identifierResolution?: TableauMetadataIdentifierResolutionState;
  toolPolicy?: TableauMetadataToolPolicy;
  budget?: TableauMetadataBudgetState;
  transportConfig?: TableauMetadataTransportState;
  permission?: TableauMetadataPermissionState;
  metadata?: JsonObject;
};

export type TableauMetadataPreconditionInput =
  TableauMetadataToolPreconditionInput;

export type TableauMetadataAuthenticatedContext = {
  isAuthenticated: boolean;
  userId?: string;
  tableauUserId?: string;
  email?: string;
  siteId?: string;
  siteName?: string;
  siteContentUrl?: string;
  authMode?:
    | "direct_trust"
    | "oauth_delegated"
    | "token_reference"
    | "fake"
    | "unknown";
};

export type TableauMetadataSiteSettingsState = {
  status: "enabled" | "disabled" | "unknown" | "not_required_for_fake";
  checkedAt?: string;
  source?: "tableau_rest_api" | "config" | "fake" | "unknown";
};

export type TableauMetadataIdentifierResolutionState = {
  site?: TableauMetadataResolutionSummary;
  workbook?: TableauMetadataResolutionSummary;
  view?: TableauMetadataResolutionSummary;
  datasource?: TableauMetadataResolutionSummary;
};

export type TableauMetadataToolPolicy = {
  allowedToolNames?: readonly string[];
  safeForPreviewOnly?: boolean;
  readOnlyOnly?: boolean;
  allowExternalAccess?: boolean;
  allowUnderlyingDataAccess?: boolean;
  allowWriteOperations?: boolean;
};

export type TableauMetadataBudgetState = {
  timeoutMs?: number;
  remainingTimeMs?: number;
  maxItems?: number;
};

export type TableauMetadataTransportState = {
  selectedTransportKind?: TableauMetadataTransportKind;
  status?: "selected" | "fallback" | "disabled" | "not_configured" | "invalid";
  noNetwork?: boolean;
};

export type TableauMetadataTransportKind =
  | "stdio"
  | "hosted"
  | "remote"
  | "fake"
  | "unknown";

export type TableauMetadataPermissionState = {
  status?:
    | "verified"
    | "not_verified"
    | "denied"
    | "insufficient_scope"
    | "unknown";
  scopes?: readonly string[];
  capabilities?: readonly string[];
};

export type TableauMetadataPreconditionStatus =
  | "passed"
  | "blocked"
  | "warning"
  | "not_checked";

export type TableauMetadataPreconditionFailureCode =
  | "AUTH_REQUIRED"
  | "TABLEAU_CONTEXT_MISSING"
  | "SITE_SETTINGS_DISABLED"
  | "SITE_SETTINGS_UNKNOWN"
  | "DATASOURCE_IDENTIFIER_MISSING"
  | "DATASOURCE_IDENTIFIER_AMBIGUOUS"
  | "WORKBOOK_IDENTIFIER_AMBIGUOUS"
  | "VIEW_IDENTIFIER_AMBIGUOUS"
  | "TOOL_NOT_ALLOWED"
  | "EXTERNAL_ACCESS_NOT_ALLOWED"
  | "NOT_READ_ONLY"
  | "SAFE_FOR_PREVIEW_REQUIRED"
  | "UNDERLYING_DATA_ACCESS_NOT_ALLOWED"
  | "WRITE_OPERATION_NOT_ALLOWED"
  | "BUDGET_EXHAUSTED"
  | "TIMEOUT_TOO_LOW"
  | "TRANSPORT_NOT_CONFIGURED"
  | "PERMISSION_NOT_VERIFIED"
  | "PERMISSION_DENIED"
  | "INSUFFICIENT_SCOPE"
  | "UNKNOWN_PRECONDITION_FAILURE";

export type TableauMetadataPreconditionWarningCode =
  | "PERMISSION_NOT_VERIFIED"
  | "SITE_SETTINGS_NOT_VERIFIED"
  | "USING_FAKE_TRANSPORT"
  | "USING_STDIO_FALLBACK"
  | "MAX_ITEMS_REDUCED"
  | "OUTPUT_WILL_BE_TRUNCATED"
  | "UNKNOWN_WARNING";

export type TableauMetadataPreconditionWarning = {
  code: TableauMetadataPreconditionWarningCode;
  message: string;
  target?: string;
  metadata?: JsonObject;
};

export type TableauMetadataPreconditionFallbackAction =
  | "none"
  | "authenticate"
  | "select_datasource"
  | "disambiguate_identifier"
  | "enable_site_settings"
  | "configure_transport"
  | "reduce_scope"
  | "retry_later"
  | "check_permissions";

export type TableauMetadataPreconditionFallback = {
  action: TableauMetadataPreconditionFallbackAction;
  message: string;
  target?: string;
  metadata?: JsonObject;
};

export type TableauMetadataGovernanceDecision = {
  readOnly: "allowed" | "blocked" | "not_checked";
  safeForPreview: "allowed" | "blocked" | "not_checked";
  externalAccess: "allowed" | "blocked" | "not_checked";
  underlyingDataAccess: "blocked" | "not_requested" | "not_checked";
  writeOperation: "blocked" | "not_requested" | "not_checked";
  allowedToolPolicy: "allowed" | "blocked" | "not_checked";
  permission: "verified" | "not_verified" | "blocked" | "not_checked";
  siteSettings: "enabled" | "disabled" | "unknown" | "not_checked";
};

export type TableauMetadataPreconditionResult = {
  status: TableauMetadataPreconditionStatus;
  canExecute: boolean;
  failureCode?: TableauMetadataPreconditionFailureCode;
  message?: string;
  userFacingMessage?: string;
  warnings?: readonly TableauMetadataPreconditionWarning[];
  fallback?: TableauMetadataPreconditionFallback;
  governance?: TableauMetadataGovernanceDecision;
  metadata?: JsonObject;
};

export const TABLEAU_METADATA_ALLOWED_TOOL_NAMES: readonly TableauMetadataToolName[] =
  [
    TABLEAU_METADATA_DESCRIBE_DATASOURCE_TOOL_NAME,
    TABLEAU_METADATA_LIST_FIELDS_TOOL_NAME,
  ] as const;

export const TABLEAU_METADATA_PRECONDITION_USER_MESSAGES: Readonly<
  Record<TableauMetadataPreconditionFailureCode, string>
> = {
  AUTH_REQUIRED:
    "Tableau authentication is required before metadata can be inspected.",
  TABLEAU_CONTEXT_MISSING:
    "A Tableau context is required before running this metadata action.",
  SITE_SETTINGS_DISABLED:
    "Hosted Tableau MCP is not enabled for this Tableau site.",
  SITE_SETTINGS_UNKNOWN:
    "Tableau site settings are not verified for this metadata action.",
  DATASOURCE_IDENTIFIER_MISSING:
    "Please select or specify a Tableau datasource before running this metadata action.",
  DATASOURCE_IDENTIFIER_AMBIGUOUS:
    "Multiple datasources match this request. Please choose one datasource first.",
  WORKBOOK_IDENTIFIER_AMBIGUOUS:
    "Multiple workbooks match this request. Please choose one workbook first.",
  VIEW_IDENTIFIER_AMBIGUOUS:
    "Multiple views match this request. Please choose one view first.",
  TOOL_NOT_ALLOWED:
    "This metadata action is not allowed by the current tool policy.",
  EXTERNAL_ACCESS_NOT_ALLOWED:
    "This metadata action requires external access, which is currently disabled.",
  NOT_READ_ONLY: "This metadata action must remain read-only.",
  SAFE_FOR_PREVIEW_REQUIRED:
    "This metadata action must be safe for preview mode.",
  UNDERLYING_DATA_ACCESS_NOT_ALLOWED:
    "Underlying data access is not allowed for this metadata action.",
  WRITE_OPERATION_NOT_ALLOWED:
    "Write operations are not allowed for this metadata action.",
  BUDGET_EXHAUSTED:
    "There is not enough remaining execution time to run this metadata action safely.",
  TIMEOUT_TOO_LOW:
    "The configured timeout is too low for this metadata action.",
  TRANSPORT_NOT_CONFIGURED:
    "Tableau MCP transport is not configured for this metadata action.",
  PERMISSION_NOT_VERIFIED:
    "Tableau permission could not be verified for this metadata action.",
  PERMISSION_DENIED: "Tableau permission is denied for this metadata action.",
  INSUFFICIENT_SCOPE:
    "The current Tableau authorization scope is not sufficient for this metadata action.",
  UNKNOWN_PRECONDITION_FAILURE:
    "Tableau metadata preconditions are not satisfied.",
};

const TOOL_GOVERNANCE: Record<
  TableauMetadataToolName,
  {
    readOnly: true;
    safeForPreview: true;
    externalAccess: true;
    requiresAuthentication: true;
  }
> = {
  [TABLEAU_METADATA_DESCRIBE_DATASOURCE_TOOL_NAME]: {
    readOnly: true,
    safeForPreview: true,
    externalAccess: true,
    requiresAuthentication: true,
  },
  [TABLEAU_METADATA_LIST_FIELDS_TOOL_NAME]: {
    readOnly: true,
    safeForPreview: true,
    externalAccess: true,
    requiresAuthentication: true,
  },
};

const MIN_SAFE_TIMEOUT_MS = 1000;
const MAX_SAFE_ITEMS = 100;

export function evaluateTableauMetadataToolPreconditions(
  input: TableauMetadataToolPreconditionInput,
): TableauMetadataPreconditionResult {
  const toolProfile = getToolProfile(input.toolName);
  const warnings: TableauMetadataPreconditionWarning[] = [];
  const metadata: JsonObject = {
    toolName: input.toolName,
  };

  if (input.requestId) {
    metadata.requestId = input.requestId;
  }
  if (input.correlationId) {
    metadata.correlationId = input.correlationId;
  }
  if (input.agentRunId) {
    metadata.agentRunId = input.agentRunId;
  }

  if (!toolProfile) {
    return blockedResult({
      failureCode: "TOOL_NOT_ALLOWED",
      message: `Tool ${input.toolName} is not part of the metadata allowlist.`,
      userFacingMessage:
        TABLEAU_METADATA_PRECONDITION_USER_MESSAGES.TOOL_NOT_ALLOWED,
      governance: createGovernanceDecision({
        allowedToolPolicy: "blocked",
      }),
      metadata: {
        ...metadata,
        allowedToolNames: [...TABLEAU_METADATA_ALLOWED_TOOL_NAMES],
      },
    });
  }

  const policy = input.toolPolicy ?? {};
  const transportKind =
    input.transportConfig?.selectedTransportKind ?? "unknown";
  const transportStatus = input.transportConfig?.status ?? "not_configured";
  const isStdioTransport = transportKind === "stdio";
  const siteSettingsStatus = input.siteSettings?.status;
  const isFakeTransport = transportKind === "fake";
  const realTransportKind =
    transportKind === "hosted" || transportKind === "remote";
  const isNoNetwork = Boolean(input.transportConfig?.noNetwork);

  const governance = createGovernanceDecision({
    readOnly: toolProfile.readOnly ? "allowed" : "blocked",
    safeForPreview: toolProfile.safeForPreview ? "allowed" : "blocked",
    externalAccess:
      policy.allowExternalAccess === false ? "blocked" : "allowed",
    underlyingDataAccess: "blocked",
    writeOperation: "blocked",
    allowedToolPolicy: isToolAllowedByPolicy(input.toolName, policy)
      ? "allowed"
      : "blocked",
    permission: "not_checked",
    siteSettings: getSiteSettingsStatus(siteSettingsStatus),
  });

  if (!isToolAllowedByPolicy(input.toolName, policy)) {
    return blockedResult({
      failureCode: "TOOL_NOT_ALLOWED",
      message: `Tool ${input.toolName} is not allowed by the current policy.`,
      userFacingMessage:
        TABLEAU_METADATA_PRECONDITION_USER_MESSAGES.TOOL_NOT_ALLOWED,
      governance,
      metadata,
    });
  }

  if (policy.readOnlyOnly === true && !toolProfile.readOnly) {
    return blockedResult({
      failureCode: "NOT_READ_ONLY",
      message: `Tool ${input.toolName} is not read-only.`,
      userFacingMessage:
        TABLEAU_METADATA_PRECONDITION_USER_MESSAGES.NOT_READ_ONLY,
      governance: {
        ...governance,
        readOnly: "blocked",
      },
      metadata,
    });
  }

  if (policy.safeForPreviewOnly === true && !toolProfile.safeForPreview) {
    return blockedResult({
      failureCode: "SAFE_FOR_PREVIEW_REQUIRED",
      message: `Tool ${input.toolName} is not safe for preview mode.`,
      userFacingMessage:
        TABLEAU_METADATA_PRECONDITION_USER_MESSAGES.SAFE_FOR_PREVIEW_REQUIRED,
      governance: {
        ...governance,
        safeForPreview: "blocked",
      },
      metadata,
    });
  }

  if (policy.allowExternalAccess === false && toolProfile.externalAccess) {
    return blockedResult({
      failureCode: "EXTERNAL_ACCESS_NOT_ALLOWED",
      message: `Tool ${input.toolName} requires external access, but external access is disabled.`,
      userFacingMessage:
        TABLEAU_METADATA_PRECONDITION_USER_MESSAGES.EXTERNAL_ACCESS_NOT_ALLOWED,
      governance: {
        ...governance,
        externalAccess: "blocked",
      },
      metadata,
    });
  }

  if (!input.authenticatedTableauContext?.isAuthenticated) {
    return blockedResult({
      failureCode: "AUTH_REQUIRED",
      message: "Authenticated Tableau context is missing.",
      userFacingMessage:
        TABLEAU_METADATA_PRECONDITION_USER_MESSAGES.AUTH_REQUIRED,
      governance: {
        ...governance,
        permission: "not_checked",
      },
      metadata: {
        ...metadata,
        authMode: input.authenticatedTableauContext?.authMode ?? "unknown",
      },
    });
  }

  if (
    siteSettingsStatus === "disabled" ||
    (siteSettingsStatus === "unknown" && realTransportKind)
  ) {
    return blockedResult({
      failureCode:
        siteSettingsStatus === "disabled"
          ? "SITE_SETTINGS_DISABLED"
          : "SITE_SETTINGS_UNKNOWN",
      message:
        siteSettingsStatus === "disabled"
          ? "Hosted Tableau MCP is disabled for the current site."
          : "Tableau site settings are not verified for hosted execution.",
      userFacingMessage:
        TABLEAU_METADATA_PRECONDITION_USER_MESSAGES[
          siteSettingsStatus === "disabled"
            ? "SITE_SETTINGS_DISABLED"
            : "SITE_SETTINGS_UNKNOWN"
        ],
      governance: {
        ...governance,
        siteSettings:
          siteSettingsStatus === "disabled" ? "disabled" : "unknown",
      },
      warnings:
        siteSettingsStatus === "unknown"
          ? [
              {
                code: "SITE_SETTINGS_NOT_VERIFIED",
                message:
                  "Tableau site settings are not verified for this metadata action.",
                metadata: {
                  transportKind,
                },
              },
            ]
          : undefined,
      metadata: {
        ...metadata,
        siteSettingsStatus: siteSettingsStatus ?? "unknown",
      },
    });
  }

  if (
    siteSettingsStatus === "not_required_for_fake" ||
    (siteSettingsStatus === "unknown" && isFakeTransport)
  ) {
    warnings.push({
      code: "SITE_SETTINGS_NOT_VERIFIED",
      message:
        "Tableau site settings are not required for the fake transport path.",
      metadata: {
        transportKind,
      },
    });
  }

  if (transportStatus === "invalid" || transportStatus === "disabled") {
    return blockedResult({
      failureCode: "TRANSPORT_NOT_CONFIGURED",
      message: `Tableau MCP transport is ${transportStatus}.`,
      userFacingMessage:
        TABLEAU_METADATA_PRECONDITION_USER_MESSAGES.TRANSPORT_NOT_CONFIGURED,
      governance,
      metadata: {
        ...metadata,
        transportStatus,
        transportKind,
      },
    });
  }

  if (transportStatus === "not_configured" && !isFakeTransport) {
    return blockedResult({
      failureCode: "TRANSPORT_NOT_CONFIGURED",
      message: "Tableau MCP transport is not configured.",
      userFacingMessage:
        TABLEAU_METADATA_PRECONDITION_USER_MESSAGES.TRANSPORT_NOT_CONFIGURED,
      governance,
      metadata: {
        ...metadata,
        transportStatus,
        transportKind,
      },
    });
  }

  if (isFakeTransport) {
    warnings.push({
      code: "USING_FAKE_TRANSPORT",
      message:
        "The fake transport path is being used for no-network execution.",
      metadata: {
        transportKind,
        noNetwork: isNoNetwork,
      },
    });
  } else if (isStdioTransport && transportStatus === "fallback") {
    warnings.push({
      code: "USING_STDIO_FALLBACK",
      message: "The stdio fallback transport path is being used.",
      metadata: {
        transportKind,
      },
    });
  }

  const datasourceResolution = input.identifierResolution?.datasource;
  if (!datasourceResolution) {
    return blockedResult({
      failureCode: "DATASOURCE_IDENTIFIER_MISSING",
      message: "A datasource resolution summary is required.",
      userFacingMessage:
        TABLEAU_METADATA_PRECONDITION_USER_MESSAGES.DATASOURCE_IDENTIFIER_MISSING,
      governance,
      metadata: {
        ...metadata,
        identifierResolution: "missing",
      },
    });
  }

  const datasourceCheck = evaluateResolution(
    datasourceResolution,
    "datasource",
    "DATASOURCE_IDENTIFIER_MISSING",
    "DATASOURCE_IDENTIFIER_AMBIGUOUS",
  );
  if (datasourceCheck.failureCode) {
    return blockedResult({
      failureCode: datasourceCheck.failureCode,
      message: datasourceCheck.message,
      userFacingMessage:
        TABLEAU_METADATA_PRECONDITION_USER_MESSAGES[
          datasourceCheck.failureCode
        ],
      governance,
      warnings: datasourceCheck.warnings,
      metadata: {
        ...metadata,
        datasourceResolution: datasourceResolution.status,
      },
    });
  }

  for (const [label, resolution] of [
    ["workbook", input.identifierResolution?.workbook],
    ["view", input.identifierResolution?.view],
    ["site", input.identifierResolution?.site],
  ] as const) {
    if (!resolution) {
      continue;
    }
    const check = evaluateResolution(
      resolution,
      label,
      label === "workbook"
        ? "TABLEAU_CONTEXT_MISSING"
        : "TABLEAU_CONTEXT_MISSING",
      label === "workbook"
        ? "WORKBOOK_IDENTIFIER_AMBIGUOUS"
        : label === "view"
          ? "VIEW_IDENTIFIER_AMBIGUOUS"
          : "UNKNOWN_PRECONDITION_FAILURE",
    );

    if (check.failureCode) {
      return blockedResult({
        failureCode: check.failureCode,
        message: check.message,
        userFacingMessage:
          check.failureCode === "TABLEAU_CONTEXT_MISSING"
            ? TABLEAU_METADATA_PRECONDITION_USER_MESSAGES.TABLEAU_CONTEXT_MISSING
            : TABLEAU_METADATA_PRECONDITION_USER_MESSAGES[
                check.failureCode === "WORKBOOK_IDENTIFIER_AMBIGUOUS"
                  ? "WORKBOOK_IDENTIFIER_AMBIGUOUS"
                  : check.failureCode === "VIEW_IDENTIFIER_AMBIGUOUS"
                    ? "VIEW_IDENTIFIER_AMBIGUOUS"
                    : "UNKNOWN_PRECONDITION_FAILURE"
              ],
        governance,
        warnings: check.warnings,
        metadata: {
          ...metadata,
          [`${label}Resolution`]: resolution.status,
        },
      });
    }
  }

  if (input.permission?.status === "denied") {
    return blockedResult({
      failureCode: "PERMISSION_DENIED",
      message: "Tableau permission is denied for this metadata action.",
      userFacingMessage:
        TABLEAU_METADATA_PRECONDITION_USER_MESSAGES.PERMISSION_DENIED,
      governance: {
        ...governance,
        permission: "blocked",
      },
      metadata,
    });
  }

  if (input.permission?.status === "insufficient_scope") {
    return blockedResult({
      failureCode: "INSUFFICIENT_SCOPE",
      message:
        "Tableau authorization scope is insufficient for this metadata action.",
      userFacingMessage:
        TABLEAU_METADATA_PRECONDITION_USER_MESSAGES.INSUFFICIENT_SCOPE,
      governance: {
        ...governance,
        permission: "blocked",
      },
      metadata,
    });
  }

  if (
    input.permission?.status === "not_verified" ||
    !input.permission?.status
  ) {
    if (realTransportKind) {
      return blockedResult({
        failureCode: "PERMISSION_NOT_VERIFIED",
        message:
          "Tableau permission could not be verified for hosted or remote execution.",
        userFacingMessage:
          TABLEAU_METADATA_PRECONDITION_USER_MESSAGES.PERMISSION_NOT_VERIFIED,
        governance: {
          ...governance,
          permission: "not_verified",
        },
        warnings: [
          {
            code: "PERMISSION_NOT_VERIFIED",
            message:
              "Tableau permission was not verified before metadata execution.",
          },
        ],
        metadata,
      });
    }

    warnings.push({
      code: "PERMISSION_NOT_VERIFIED",
      message: "Tableau permission was not verified before metadata execution.",
    });
  }

  if (input.budget?.timeoutMs !== undefined && input.budget.timeoutMs <= 0) {
    return blockedResult({
      failureCode: "TIMEOUT_TOO_LOW",
      message: "The configured timeout is too low.",
      userFacingMessage:
        TABLEAU_METADATA_PRECONDITION_USER_MESSAGES.TIMEOUT_TOO_LOW,
      governance,
      metadata: {
        ...metadata,
        timeoutMs: input.budget.timeoutMs,
      },
    });
  }

  if (
    input.budget?.remainingTimeMs !== undefined &&
    input.budget.remainingTimeMs < MIN_SAFE_TIMEOUT_MS
  ) {
    return blockedResult({
      failureCode: "BUDGET_EXHAUSTED",
      message: "There is not enough remaining execution time.",
      userFacingMessage:
        TABLEAU_METADATA_PRECONDITION_USER_MESSAGES.BUDGET_EXHAUSTED,
      governance,
      warnings: [
        {
          code: "UNKNOWN_WARNING",
          message:
            "The remaining execution time is below the safe execution threshold.",
          metadata: {
            remainingTimeMs: input.budget.remainingTimeMs,
          },
        },
      ],
      metadata: {
        ...metadata,
        remainingTimeMs: input.budget.remainingTimeMs,
      },
    });
  }

  const normalizedMaxItems = normalizeMaxItems(input.budget?.maxItems);
  if (normalizedMaxItems !== undefined && normalizedMaxItems > MAX_SAFE_ITEMS) {
    warnings.push({
      code: "MAX_ITEMS_REDUCED",
      message: `The requested item budget is above the safe limit and will be reduced to ${MAX_SAFE_ITEMS}.`,
      metadata: {
        requestedMaxItems: normalizedMaxItems,
        safeMaxItems: MAX_SAFE_ITEMS,
      },
    });
  }

  const baseMetadata: JsonObject = {
    ...metadata,
    authMode: input.authenticatedTableauContext?.authMode ?? "unknown",
    transportKind,
    transportStatus,
    noNetwork: isNoNetwork,
    siteSettingsStatus: siteSettingsStatus ?? "unknown",
    datasourceResolution: datasourceResolution.status,
  };
  if (normalizedMaxItems !== undefined) {
    baseMetadata.maxItems = normalizedMaxItems;
  }

  if (warnings.length > 0) {
    return {
      status: "warning",
      canExecute: true,
      warnings: warnings.map((warning) => ({
        ...warning,
        ...(warning.metadata
          ? { metadata: sanitizeJsonObject(warning.metadata) }
          : {}),
      })),
      fallback: createFallback(
        "reduce_scope",
        "The metadata action can continue with warnings.",
        {
          transportKind,
        },
      ),
      governance: {
        ...governance,
        permission:
          input.permission?.status === "verified" ? "verified" : "not_verified",
      },
      metadata: sanitizeJsonObject(baseMetadata),
    };
  }

  return {
    status: "passed",
    canExecute: true,
    fallback: {
      action: "none",
      message: "No fallback is required.",
    },
    governance: {
      ...governance,
      permission:
        input.permission?.status === "verified" ? "verified" : "not_checked",
      siteSettings: getSiteSettingsStatus(siteSettingsStatus),
    },
    metadata: sanitizeJsonObject(baseMetadata),
  };
}

function getToolProfile(
  toolName: string,
): (typeof TOOL_GOVERNANCE)[TableauMetadataToolName] | undefined {
  if (
    toolName !== TABLEAU_METADATA_DESCRIBE_DATASOURCE_TOOL_NAME &&
    toolName !== TABLEAU_METADATA_LIST_FIELDS_TOOL_NAME
  ) {
    return undefined;
  }

  return TOOL_GOVERNANCE[toolName];
}

function isToolAllowedByPolicy(
  toolName: string,
  policy: TableauMetadataToolPolicy,
): boolean {
  if (!policy.allowedToolNames?.length) {
    return true;
  }

  return policy.allowedToolNames.includes(toolName);
}

function getSiteSettingsStatus(
  status: TableauMetadataSiteSettingsState["status"] | undefined,
): TableauMetadataGovernanceDecision["siteSettings"] {
  switch (status) {
    case "enabled":
      return "enabled";
    case "disabled":
      return "disabled";
    case "unknown":
      return "unknown";
    case "not_required_for_fake":
      return "not_checked";
    default:
      return "not_checked";
  }
}

function evaluateResolution(
  resolution: TableauMetadataResolutionSummary,
  target: "site" | "workbook" | "view" | "datasource",
  missingCode: TableauMetadataPreconditionFailureCode,
  ambiguousCode:
    | "DATASOURCE_IDENTIFIER_AMBIGUOUS"
    | "WORKBOOK_IDENTIFIER_AMBIGUOUS"
    | "VIEW_IDENTIFIER_AMBIGUOUS"
    | "UNKNOWN_PRECONDITION_FAILURE",
): {
  failureCode?: TableauMetadataPreconditionFailureCode;
  message: string;
  warnings?: TableauMetadataPreconditionWarning[];
} {
  switch (resolution.status) {
    case "resolved":
      return {
        message: `${target} resolution is resolved.`,
      };
    case "ambiguous":
      return {
        failureCode: ambiguousCode,
        message: `${target} resolution is ambiguous.`,
      };
    case "missing":
    case "not_found":
      return {
        failureCode: missingCode,
        message: `${target} resolution is ${resolution.status}.`,
      };
    case "not_checked":
      return {
        failureCode: "UNKNOWN_PRECONDITION_FAILURE",
        message: `${target} resolution has not been checked.`,
      };
    default:
      return {
        failureCode: "UNKNOWN_PRECONDITION_FAILURE",
        message: `${target} resolution is unknown.`,
      };
  }
}

function createGovernanceDecision(
  partial?: Partial<TableauMetadataGovernanceDecision>,
): TableauMetadataGovernanceDecision {
  return {
    readOnly: partial?.readOnly ?? "allowed",
    safeForPreview: partial?.safeForPreview ?? "allowed",
    externalAccess: partial?.externalAccess ?? "allowed",
    underlyingDataAccess: partial?.underlyingDataAccess ?? "blocked",
    writeOperation: partial?.writeOperation ?? "blocked",
    allowedToolPolicy: partial?.allowedToolPolicy ?? "allowed",
    permission: partial?.permission ?? "not_checked",
    siteSettings: partial?.siteSettings ?? "not_checked",
  };
}

function blockedResult(input: {
  failureCode: TableauMetadataPreconditionFailureCode;
  message: string;
  userFacingMessage: string;
  governance: TableauMetadataGovernanceDecision;
  warnings?: readonly TableauMetadataPreconditionWarning[];
  metadata?: JsonObject;
}): TableauMetadataPreconditionResult {
  return {
    status: "blocked",
    canExecute: false,
    failureCode: input.failureCode,
    message: input.message,
    userFacingMessage: input.userFacingMessage,
    warnings: input.warnings,
    fallback: createFallbackForFailure(input.failureCode),
    governance: input.governance,
    metadata: sanitizeJsonObject(input.metadata),
  };
}

function createFallbackForFailure(
  failureCode: TableauMetadataPreconditionFailureCode,
): TableauMetadataPreconditionFallback {
  switch (failureCode) {
    case "AUTH_REQUIRED":
      return createFallback(
        "authenticate",
        TABLEAU_METADATA_PRECONDITION_USER_MESSAGES.AUTH_REQUIRED,
      );
    case "DATASOURCE_IDENTIFIER_MISSING":
      return createFallback(
        "select_datasource",
        TABLEAU_METADATA_PRECONDITION_USER_MESSAGES.DATASOURCE_IDENTIFIER_MISSING,
      );
    case "DATASOURCE_IDENTIFIER_AMBIGUOUS":
    case "WORKBOOK_IDENTIFIER_AMBIGUOUS":
    case "VIEW_IDENTIFIER_AMBIGUOUS":
      return createFallback(
        "disambiguate_identifier",
        TABLEAU_METADATA_PRECONDITION_USER_MESSAGES[
          failureCode === "DATASOURCE_IDENTIFIER_AMBIGUOUS"
            ? "DATASOURCE_IDENTIFIER_AMBIGUOUS"
            : failureCode === "WORKBOOK_IDENTIFIER_AMBIGUOUS"
              ? "WORKBOOK_IDENTIFIER_AMBIGUOUS"
              : "VIEW_IDENTIFIER_AMBIGUOUS"
        ],
      );
    case "SITE_SETTINGS_DISABLED":
    case "SITE_SETTINGS_UNKNOWN":
      return createFallback(
        "enable_site_settings",
        TABLEAU_METADATA_PRECONDITION_USER_MESSAGES[
          failureCode === "SITE_SETTINGS_DISABLED"
            ? "SITE_SETTINGS_DISABLED"
            : "SITE_SETTINGS_UNKNOWN"
        ],
      );
    case "TOOL_NOT_ALLOWED":
    case "EXTERNAL_ACCESS_NOT_ALLOWED":
    case "NOT_READ_ONLY":
    case "SAFE_FOR_PREVIEW_REQUIRED":
    case "UNDERLYING_DATA_ACCESS_NOT_ALLOWED":
    case "WRITE_OPERATION_NOT_ALLOWED":
      return createFallback(
        "reduce_scope",
        TABLEAU_METADATA_PRECONDITION_USER_MESSAGES[
          failureCode === "TOOL_NOT_ALLOWED"
            ? "TOOL_NOT_ALLOWED"
            : failureCode === "EXTERNAL_ACCESS_NOT_ALLOWED"
              ? "EXTERNAL_ACCESS_NOT_ALLOWED"
              : failureCode === "NOT_READ_ONLY"
                ? "NOT_READ_ONLY"
                : failureCode === "SAFE_FOR_PREVIEW_REQUIRED"
                  ? "SAFE_FOR_PREVIEW_REQUIRED"
                  : failureCode === "UNDERLYING_DATA_ACCESS_NOT_ALLOWED"
                    ? "UNDERLYING_DATA_ACCESS_NOT_ALLOWED"
                    : "WRITE_OPERATION_NOT_ALLOWED"
        ],
      );
    case "BUDGET_EXHAUSTED":
    case "TIMEOUT_TOO_LOW":
      return createFallback(
        "retry_later",
        TABLEAU_METADATA_PRECONDITION_USER_MESSAGES[
          failureCode === "BUDGET_EXHAUSTED"
            ? "BUDGET_EXHAUSTED"
            : "TIMEOUT_TOO_LOW"
        ],
      );
    case "TRANSPORT_NOT_CONFIGURED":
      return createFallback(
        "configure_transport",
        TABLEAU_METADATA_PRECONDITION_USER_MESSAGES.TRANSPORT_NOT_CONFIGURED,
      );
    case "PERMISSION_NOT_VERIFIED":
    case "PERMISSION_DENIED":
    case "INSUFFICIENT_SCOPE":
      return createFallback(
        "check_permissions",
        TABLEAU_METADATA_PRECONDITION_USER_MESSAGES[
          failureCode === "PERMISSION_NOT_VERIFIED"
            ? "PERMISSION_NOT_VERIFIED"
            : failureCode === "PERMISSION_DENIED"
              ? "PERMISSION_DENIED"
              : "INSUFFICIENT_SCOPE"
        ],
      );
    default:
      return createFallback(
        "reduce_scope",
        TABLEAU_METADATA_PRECONDITION_USER_MESSAGES.UNKNOWN_PRECONDITION_FAILURE,
      );
  }
}

function createFallback(
  action: TableauMetadataPreconditionFallbackAction,
  message: string,
  metadata?: JsonObject,
): TableauMetadataPreconditionFallback {
  return {
    action,
    message,
    ...(metadata ? { metadata: sanitizeJsonObject(metadata) } : {}),
  };
}

function sanitizeJsonObject(value?: JsonObject): JsonObject | undefined {
  if (!value) {
    return undefined;
  }

  if (hasForbiddenRuntimeValue(value) || !isTableauMetadataJsonSafe(value)) {
    return undefined;
  }

  return cloneMetadataJson(value);
}
