import type { AuthenticatedUser } from "../types/auth";
import type { JsonObject } from "./types";
import type {
  TableauMcpAuthContextSummary,
  TableauMcpUserContextSummary,
} from "./tableauMetadataToolRuntime";
import type {
  TableauMetadataAuthenticatedContext,
  TableauMetadataSiteSettingsState,
} from "./tableauMetadataPreconditions";

export type HostedMcpAuthState =
  | "ready"
  | "missing"
  | "expired"
  | "unknown"
  | "not_configured";

export type HostedMcpAuthMode =
  | "oauth_delegated"
  | "token_reference"
  | "direct_trust"
  | "fake"
  | "unknown";

export type HostedMcpAuthReasonCode =
  | "AUTH_REQUIRED"
  | "AUTH_EXPIRED"
  | "AUTH_STATE_UNKNOWN"
  | "HOSTED_AUTH_NOT_CONFIGURED"
  | "SITE_SETTINGS_DISABLED"
  | "TOKEN_REFERENCE_MISSING";

export type HostedMcpTokenReference = {
  kind: "token_reference";
  referenceId: string;
  expiresAt?: string;
  scopes?: readonly string[];
  source?: "oauth" | "connected_app" | "fake" | "unknown";
};

export type HostedMcpSafeAuthContext = {
  state: HostedMcpAuthState;
  mode: HostedMcpAuthMode;
  tokenReference?: HostedMcpTokenReference;
  userActionRequired?: boolean;
  retryable?: boolean;
  reasonCode?: HostedMcpAuthReasonCode;
  message?: string;
  metadata?: JsonObject;
};

export type HostedMcpUserContextSummary = {
  userId?: string;
  tableauUserId?: string;
  email?: string;
  siteId?: string;
  siteName?: string;
  siteContentUrl?: string;
  locale?: string;
  authMode?: HostedMcpAuthMode;
  metadata?: JsonObject;
};

export type HostedMcpAuthTraceSummary = {
  requestId?: string;
  correlationId?: string;
  agentRunId?: string;
  authState: HostedMcpAuthState;
  authMode: HostedMcpAuthMode;
  userId?: string;
  tableauUserId?: string;
  siteId?: string;
  siteName?: string;
  siteContentUrl?: string;
  tokenReferencePresent?: boolean;
  tokenReferenceMasked?: boolean;
  tokenReferenceExpiresAt?: string;
  siteSettingsStatus?: TableauMetadataSiteSettingsState["status"];
  reasonCode?: HostedMcpAuthReasonCode;
  message?: string;
  metadata?: JsonObject;
};

export type HostedMcpAuthContextWarning = {
  code:
    | "AUTH_CONTEXT_MISSING"
    | "AUTH_CONTEXT_EXPIRED"
    | "AUTH_CONTEXT_UNKNOWN"
    | "HOSTED_AUTH_NOT_CONFIGURED"
    | "SITE_SETTINGS_DISABLED"
    | "TOKEN_REFERENCE_MISSING";
  message: string;
  metadata?: JsonObject;
};

export type HostedMcpAuthContextError = {
  code: HostedMcpAuthReasonCode | "UNKNOWN_ERROR";
  message: string;
  retryable?: boolean;
  userActionRequired?: boolean;
  metadata?: JsonObject;
};

export type HostedMcpAuthContextAdapterInput = {
  requestId?: string;
  correlationId?: string;
  agentRunId?: string;
  authenticatedUser?: AuthenticatedUser;
  authenticatedTableauContext?: TableauMetadataAuthenticatedContext;
  tokenReference?: Partial<HostedMcpTokenReference>;
  authStatus?: {
    state?: HostedMcpAuthState;
    reasonCode?: HostedMcpAuthReasonCode;
    message?: string;
  };
  siteSettings?: TableauMetadataSiteSettingsState;
  metadata?: JsonObject;
};

export type HostedMcpAuthContextAdapterResult = {
  authContext: HostedMcpSafeAuthContext;
  userContext: HostedMcpUserContextSummary;
  traceSummary: HostedMcpAuthTraceSummary;
  transportAuthContext: TableauMcpAuthContextSummary;
  transportUserContext: TableauMcpUserContextSummary;
  warnings?: readonly HostedMcpAuthContextWarning[];
  error?: HostedMcpAuthContextError;
};

export function createHostedMcpAuthContextAdapter(
  input: HostedMcpAuthContextAdapterInput,
): HostedMcpAuthContextAdapterResult {
  const safeMetadata = sanitizeJsonObject(input.metadata ?? {});
  const safeUserContext = buildUserContextSummary(input);
  const tokenReference = buildTokenReference(input);
  const authMode = normalizeAuthMode(
    input.authenticatedTableauContext?.authMode,
    tokenReference?.source,
  );
  const inferredState = inferAuthState({
    authenticatedTableauContext: input.authenticatedTableauContext,
    tokenReference,
    authStatusState: input.authStatus?.state,
    siteSettingsStatus: input.siteSettings?.status,
    authMode,
  });
  const state = input.authStatus?.state ?? inferredState.state;
  const reasonCode = input.authStatus?.reasonCode ?? inferredState.reasonCode;
  const message = input.authStatus?.message ?? inferredState.message;
  const authContext: HostedMcpSafeAuthContext = {
    state,
    mode: authMode,
    ...(tokenReference ? { tokenReference } : {}),
    userActionRequired: state !== "ready",
    retryable:
      state === "expired" || state === "missing" || state === "unknown",
    ...(reasonCode ? { reasonCode } : {}),
    ...(message ? { message } : {}),
    ...(Object.keys(safeMetadata).length > 0 ? { metadata: safeMetadata } : {}),
  };

  const transportAuthContext: TableauMcpAuthContextSummary = {
    mode: mapTransportAuthMode(authMode),
    ...(state ? { state } : {}),
    ...(reasonCode ? { reasonCode } : {}),
    userActionRequired: state !== "ready",
    retryable:
      state === "expired" || state === "missing" || state === "unknown",
    ...(tokenReference?.referenceId
      ? { tokenReference: tokenReference.referenceId }
      : {}),
    ...(tokenReference?.scopes?.length
      ? { scopes: [...tokenReference.scopes] }
      : {}),
    ...(tokenReference?.expiresAt
      ? { expiresAt: tokenReference.expiresAt }
      : {}),
    metadata: buildTransportAuthMetadata({
      requestId: input.requestId,
      correlationId: input.correlationId,
      agentRunId: input.agentRunId,
      state,
      reasonCode,
      tokenReference,
      siteSettings: input.siteSettings,
      userContext: safeUserContext,
      metadata: safeMetadata,
    }),
  };

  const traceSummary: HostedMcpAuthTraceSummary = {
    requestId: input.requestId,
    correlationId: input.correlationId,
    agentRunId: input.agentRunId,
    authState: state,
    authMode,
    ...(safeUserContext.userId ? { userId: safeUserContext.userId } : {}),
    ...(safeUserContext.tableauUserId
      ? { tableauUserId: safeUserContext.tableauUserId }
      : {}),
    ...(safeUserContext.siteId ? { siteId: safeUserContext.siteId } : {}),
    ...(safeUserContext.siteName ? { siteName: safeUserContext.siteName } : {}),
    ...(safeUserContext.siteContentUrl
      ? { siteContentUrl: safeUserContext.siteContentUrl }
      : {}),
    tokenReferencePresent: Boolean(tokenReference),
    tokenReferenceMasked: Boolean(tokenReference),
    ...(tokenReference?.expiresAt
      ? { tokenReferenceExpiresAt: tokenReference.expiresAt }
      : {}),
    ...(input.siteSettings?.status
      ? { siteSettingsStatus: input.siteSettings.status }
      : {}),
    ...(reasonCode ? { reasonCode } : {}),
    ...(message ? { message } : {}),
    ...(Object.keys(safeMetadata).length > 0 ? { metadata: safeMetadata } : {}),
  };

  const warnings = buildWarnings({
    state,
    reasonCode,
    siteSettingsStatus: input.siteSettings?.status,
    tokenReferencePresent: Boolean(tokenReference),
  });
  const error = buildError({
    state,
    reasonCode,
    siteSettingsStatus: input.siteSettings?.status,
  });

  return {
    authContext,
    userContext: safeUserContext,
    traceSummary,
    transportAuthContext,
    transportUserContext: buildTransportUserContext(safeUserContext),
    ...(warnings.length ? { warnings } : {}),
    ...(error ? { error } : {}),
  };
}

export function maskTokenReferenceForTrace(
  tokenReference?: HostedMcpTokenReference,
): Pick<
  HostedMcpAuthTraceSummary,
  "tokenReferencePresent" | "tokenReferenceMasked" | "tokenReferenceExpiresAt"
> {
  return {
    tokenReferencePresent: Boolean(tokenReference),
    tokenReferenceMasked: Boolean(tokenReference),
    ...(tokenReference?.expiresAt
      ? { tokenReferenceExpiresAt: tokenReference.expiresAt }
      : {}),
  };
}

export function toTableauMcpTransportAuthContext(
  authContext: HostedMcpSafeAuthContext,
): TableauMcpAuthContextSummary {
  return {
    mode: mapTransportAuthMode(authContext.mode),
    ...(authContext.state ? { state: authContext.state } : {}),
    ...(authContext.reasonCode ? { reasonCode: authContext.reasonCode } : {}),
    ...(authContext.userActionRequired !== undefined
      ? { userActionRequired: authContext.userActionRequired }
      : {}),
    ...(authContext.retryable !== undefined
      ? { retryable: authContext.retryable }
      : {}),
    ...(authContext.tokenReference?.referenceId
      ? { tokenReference: authContext.tokenReference.referenceId }
      : {}),
    ...(authContext.tokenReference?.scopes?.length
      ? { scopes: [...authContext.tokenReference.scopes] }
      : {}),
    ...(authContext.tokenReference?.expiresAt
      ? { expiresAt: authContext.tokenReference.expiresAt }
      : {}),
    metadata: buildTransportAuthMetadata({
      state: authContext.state,
      reasonCode: authContext.reasonCode,
      tokenReference: authContext.tokenReference,
      metadata: authContext.metadata,
    }),
  };
}

export function toTableauMcpTransportUserContext(
  userContext: HostedMcpUserContextSummary,
): TableauMcpUserContextSummary {
  return buildTransportUserContext(userContext);
}

function buildUserContextSummary(
  input: HostedMcpAuthContextAdapterInput,
): HostedMcpUserContextSummary {
  const authenticatedContext = input.authenticatedTableauContext;
  const authenticatedUser = input.authenticatedUser;
  const authMode = normalizeAuthMode(
    authenticatedContext?.authMode,
    input.tokenReference?.source,
  );

  return {
    ...(authenticatedUser?.userId ? { userId: authenticatedUser.userId } : {}),
    ...(authenticatedContext?.tableauUserId
      ? { tableauUserId: authenticatedContext.tableauUserId }
      : authenticatedUser?.tableauSubject
        ? { tableauUserId: authenticatedUser.tableauSubject }
        : {}),
    ...(authenticatedUser?.email ? { email: authenticatedUser.email } : {}),
    ...(authenticatedContext?.siteId
      ? { siteId: authenticatedContext.siteId }
      : {}),
    ...(authenticatedContext?.siteName
      ? { siteName: authenticatedContext.siteName }
      : {}),
    ...(authenticatedContext?.siteContentUrl
      ? { siteContentUrl: authenticatedContext.siteContentUrl }
      : {}),
    authMode,
    metadata: sanitizeJsonObject(input.metadata ?? {}),
  };
}

function buildTransportUserContext(
  userContext: HostedMcpUserContextSummary,
): TableauMcpUserContextSummary {
  return {
    ...(userContext.userId ? { userId: userContext.userId } : {}),
    ...(userContext.tableauUserId
      ? { tableauUserId: userContext.tableauUserId }
      : {}),
    ...(userContext.email ? { email: userContext.email } : {}),
    ...(userContext.siteId ? { siteId: userContext.siteId } : {}),
    ...(userContext.siteName ? { siteName: userContext.siteName } : {}),
    ...(userContext.siteContentUrl
      ? { siteContentUrl: userContext.siteContentUrl }
      : {}),
    ...(userContext.locale ? { locale: userContext.locale } : {}),
    source:
      userContext.authMode === "fake"
        ? "fake"
        : userContext.userId
          ? "cognito"
          : "tableau",
    ...(userContext.metadata ? { metadata: userContext.metadata } : {}),
  };
}

function buildTokenReference(
  input: HostedMcpAuthContextAdapterInput,
): HostedMcpTokenReference | undefined {
  const referenceId = readString(input.tokenReference?.referenceId);
  if (!referenceId) {
    return undefined;
  }

  return {
    kind: "token_reference",
    referenceId,
    ...(readString(input.tokenReference?.expiresAt)
      ? { expiresAt: readString(input.tokenReference?.expiresAt) }
      : {}),
    ...(Array.isArray(input.tokenReference?.scopes)
      ? {
          scopes: input.tokenReference.scopes.filter(
            (scope): scope is string =>
              typeof scope === "string" && scope.length > 0,
          ),
        }
      : {}),
    ...(input.tokenReference?.source
      ? { source: normalizeTokenReferenceSource(input.tokenReference.source) }
      : {}),
  };
}

function inferAuthState(input: {
  authenticatedTableauContext?: TableauMetadataAuthenticatedContext;
  tokenReference?: HostedMcpTokenReference;
  authStatusState?: HostedMcpAuthState;
  siteSettingsStatus?: TableauMetadataSiteSettingsState["status"];
  authMode: HostedMcpAuthMode;
}): {
  state: HostedMcpAuthState;
  reasonCode?: HostedMcpAuthReasonCode;
  message?: string;
} {
  if (input.siteSettingsStatus === "disabled") {
    return {
      state: "not_configured",
      reasonCode: "SITE_SETTINGS_DISABLED",
      message: "Hosted execution is disabled for the current site.",
    };
  }

  if (input.authStatusState) {
    return mapAuthStateResult(input.authStatusState);
  }

  if (!input.authenticatedTableauContext?.isAuthenticated) {
    return {
      state: "missing",
      reasonCode: "AUTH_REQUIRED",
      message: "Authenticated Tableau context is missing.",
    };
  }

  if (input.authMode === "unknown") {
    return {
      state: "unknown",
      reasonCode: "AUTH_STATE_UNKNOWN",
      message: "The Hosted MCP auth mode is unknown.",
    };
  }

  if (input.authMode === "token_reference" && !input.tokenReference) {
    return {
      state: "missing",
      reasonCode: "TOKEN_REFERENCE_MISSING",
      message: "A token reference is required for Hosted MCP auth.",
    };
  }

  if (
    input.tokenReference?.expiresAt &&
    isPastIsoDate(input.tokenReference.expiresAt)
  ) {
    return {
      state: "expired",
      reasonCode: "AUTH_EXPIRED",
      message: "The Hosted MCP token reference is expired.",
    };
  }

  if (
    input.authMode === "oauth_delegated" ||
    input.authMode === "direct_trust" ||
    input.authMode === "token_reference" ||
    input.authMode === "fake"
  ) {
    return {
      state: "ready",
    };
  }

  return {
    state: "unknown",
    reasonCode: "AUTH_STATE_UNKNOWN",
    message: "The Hosted MCP auth state is unknown.",
  };
}

function mapAuthStateResult(state: HostedMcpAuthState): {
  state: HostedMcpAuthState;
  reasonCode?: HostedMcpAuthReasonCode;
  message?: string;
} {
  switch (state) {
    case "ready":
      return { state };
    case "missing":
      return {
        state,
        reasonCode: "AUTH_REQUIRED",
        message: "Hosted MCP auth is missing.",
      };
    case "expired":
      return {
        state,
        reasonCode: "AUTH_EXPIRED",
        message: "Hosted MCP auth has expired.",
      };
    case "not_configured":
      return {
        state,
        reasonCode: "HOSTED_AUTH_NOT_CONFIGURED",
        message: "Hosted MCP auth is not configured.",
      };
    case "unknown":
    default:
      return {
        state: "unknown",
        reasonCode: "AUTH_STATE_UNKNOWN",
        message: "The Hosted MCP auth state is unknown.",
      };
  }
}

function buildTransportAuthMetadata(input: {
  requestId?: string;
  correlationId?: string;
  agentRunId?: string;
  state: HostedMcpAuthState;
  reasonCode?: HostedMcpAuthReasonCode;
  tokenReference?: HostedMcpTokenReference;
  siteSettings?: TableauMetadataSiteSettingsState;
  userContext?: HostedMcpUserContextSummary;
  metadata?: JsonObject;
}): JsonObject {
  return sanitizeJsonObject({
    source: "hosted_mcp_auth_context_adapter",
    ...(input.requestId ? { requestId: input.requestId } : {}),
    ...(input.correlationId ? { correlationId: input.correlationId } : {}),
    ...(input.agentRunId ? { agentRunId: input.agentRunId } : {}),
    authState: input.state,
    ...(input.reasonCode ? { reasonCode: input.reasonCode } : {}),
    tokenReferencePresent: Boolean(input.tokenReference),
    ...(input.tokenReference?.expiresAt
      ? { tokenReferenceExpiresAt: input.tokenReference.expiresAt }
      : {}),
    ...(input.siteSettings?.status
      ? { siteSettingsStatus: input.siteSettings.status }
      : {}),
    ...(input.userContext?.siteId ? { siteId: input.userContext.siteId } : {}),
    ...(input.userContext?.siteName
      ? { siteName: input.userContext.siteName }
      : {}),
    ...(input.metadata ?? {}),
  });
}

function buildWarnings(input: {
  state: HostedMcpAuthState;
  reasonCode?: HostedMcpAuthReasonCode;
  siteSettingsStatus?: TableauMetadataSiteSettingsState["status"];
  tokenReferencePresent: boolean;
}): HostedMcpAuthContextWarning[] {
  const warnings: HostedMcpAuthContextWarning[] = [];

  if (input.state === "missing") {
    warnings.push({
      code: "AUTH_CONTEXT_MISSING",
      message: "Hosted MCP auth context is missing.",
      metadata: buildWarningMetadata(input),
    });
  } else if (input.state === "expired") {
    warnings.push({
      code: "AUTH_CONTEXT_EXPIRED",
      message: "Hosted MCP auth context has expired.",
      metadata: buildWarningMetadata(input),
    });
  } else if (input.state === "unknown") {
    warnings.push({
      code: "AUTH_CONTEXT_UNKNOWN",
      message: "Hosted MCP auth context is unknown.",
      metadata: buildWarningMetadata(input),
    });
  }

  if (input.siteSettingsStatus === "disabled") {
    warnings.push({
      code: "SITE_SETTINGS_DISABLED",
      message: "Hosted execution is disabled for the current site.",
      metadata: buildWarningMetadata(input),
    });
  }

  if (!input.tokenReferencePresent && input.state === "ready") {
    warnings.push({
      code: "TOKEN_REFERENCE_MISSING",
      message: "Token reference is missing for Hosted MCP auth.",
      metadata: buildWarningMetadata(input),
    });
  }

  return warnings;
}

function buildError(input: {
  state: HostedMcpAuthState;
  reasonCode?: HostedMcpAuthReasonCode;
  siteSettingsStatus?: TableauMetadataSiteSettingsState["status"];
}): HostedMcpAuthContextError | undefined {
  if (input.state === "ready") {
    return undefined;
  }

  const code =
    input.reasonCode ??
    (input.state === "expired"
      ? "AUTH_EXPIRED"
      : input.state === "not_configured"
        ? "HOSTED_AUTH_NOT_CONFIGURED"
        : "AUTH_REQUIRED");
  const message =
    input.state === "expired"
      ? "Hosted MCP auth has expired."
      : input.state === "not_configured"
        ? "Hosted MCP auth is not configured."
        : input.state === "unknown"
          ? "Hosted MCP auth state is unknown."
          : input.siteSettingsStatus === "disabled"
            ? "Hosted execution is disabled for the current site."
            : "Hosted MCP auth is missing.";

  return {
    code,
    message,
    retryable: input.state === "missing" || input.state === "expired",
    userActionRequired: true,
    metadata: buildWarningMetadata({
      state: input.state,
      reasonCode: input.reasonCode,
      siteSettingsStatus: input.siteSettingsStatus,
      tokenReferencePresent: false,
    }),
  };
}

function buildWarningMetadata(input: {
  state: HostedMcpAuthState;
  reasonCode?: HostedMcpAuthReasonCode;
  siteSettingsStatus?: TableauMetadataSiteSettingsState["status"];
  tokenReferencePresent: boolean;
}): JsonObject {
  return sanitizeJsonObject({
    authState: input.state,
    ...(input.reasonCode ? { reasonCode: input.reasonCode } : {}),
    ...(input.siteSettingsStatus
      ? { siteSettingsStatus: input.siteSettingsStatus }
      : {}),
    tokenReferencePresent: input.tokenReferencePresent,
  });
}

function normalizeAuthMode(
  value?: TableauMetadataAuthenticatedContext["authMode"] | string,
  tokenReferenceSource?: HostedMcpTokenReference["source"],
): HostedMcpAuthMode {
  if (
    value === "oauth_delegated" ||
    value === "token_reference" ||
    value === "direct_trust" ||
    value === "fake" ||
    value === "unknown"
  ) {
    return value;
  }

  if (tokenReferenceSource === "oauth") {
    return "oauth_delegated";
  }
  if (tokenReferenceSource === "connected_app") {
    return "token_reference";
  }
  if (tokenReferenceSource === "fake") {
    return "fake";
  }

  return "unknown";
}

function mapTransportAuthMode(
  mode: HostedMcpAuthMode,
): TableauMcpAuthContextSummary["mode"] {
  switch (mode) {
    case "oauth_delegated":
    case "token_reference":
    case "direct_trust":
    case "fake":
      return mode;
    case "unknown":
    default:
      return "unknown";
  }
}

function normalizeTokenReferenceSource(
  value: string,
): HostedMcpTokenReference["source"] {
  switch (value) {
    case "oauth":
    case "connected_app":
    case "fake":
    case "unknown":
      return value;
    default:
      return "unknown";
  }
}

function sanitizeJsonObject(value: JsonObject): JsonObject {
  const result: JsonObject = {};
  for (const [key, item] of Object.entries(value)) {
    const normalized = sanitizeJsonValue(key, item);
    if (normalized !== undefined) {
      result[key] = normalized as JsonObject[string];
    }
  }
  return result;
}

function sanitizeJsonValue(key: string, value: unknown): unknown {
  if (isSensitiveKey(key)) {
    return "[Redacted]";
  }
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (Array.isArray(value)) {
    return value
      .map((entry) => sanitizeAnonymousValue(entry))
      .filter((entry) => entry !== undefined);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value && typeof value === "object") {
    const nested: JsonObject = {};
    for (const [nestedKey, nestedValue] of Object.entries(
      value as JsonObject,
    )) {
      const normalized = sanitizeJsonValue(nestedKey, nestedValue);
      if (normalized !== undefined) {
        nested[nestedKey] = normalized as JsonObject[string];
      }
    }
    return nested;
  }
  return undefined;
}

function sanitizeAnonymousValue(value: unknown): unknown {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const nested: JsonObject = {};
    for (const [nestedKey, nestedValue] of Object.entries(
      value as JsonObject,
    )) {
      const normalized = sanitizeJsonValue(nestedKey, nestedValue);
      if (normalized !== undefined) {
        nested[nestedKey] = normalized as JsonObject[string];
      }
    }
    return nested;
  }
  if (Array.isArray(value)) {
    return value
      .map((entry) => sanitizeAnonymousValue(entry))
      .filter((entry) => entry !== undefined);
  }
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  return undefined;
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase();
  if (normalized.startsWith("tokenreference")) {
    return false;
  }
  return (
    normalized === "raw" ||
    normalized === "rawresult" ||
    normalized === "rawmcpresult" ||
    normalized === "mcpresponse" ||
    normalized === "serverresponse" ||
    normalized === "transportrawresult" ||
    normalized === "stdout" ||
    normalized === "stderr" ||
    normalized === "stack" ||
    normalized === "stacktrace" ||
    normalized === "authorization" ||
    normalized === "authorizationheader" ||
    normalized === "token" ||
    normalized === "accesstoken" ||
    normalized === "refreshtoken" ||
    normalized === "idtoken" ||
    normalized.endsWith("token") ||
    normalized.includes("secret") ||
    normalized.includes("password") ||
    normalized.includes("cookie") ||
    normalized === "jwt" ||
    normalized === "setcookie"
  );
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function isPastIsoDate(value: string): boolean {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp < Date.now();
}
