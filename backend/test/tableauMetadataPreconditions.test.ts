import { describe, expect, it } from "vitest";
import {
  evaluateTableauMetadataToolPreconditions,
  TABLEAU_METADATA_ALLOWED_TOOL_NAMES,
  type TableauMetadataResolutionSummary,
} from "../src/agent";

function resolvedResolution(
  target: TableauMetadataResolutionSummary["target"],
): TableauMetadataResolutionSummary {
  return {
    status: "resolved",
    target,
    selectedId: `${target}-1`,
    selectedName: `${target} one`,
  };
}

function ambiguousResolution(
  target: TableauMetadataResolutionSummary["target"],
): TableauMetadataResolutionSummary {
  return {
    status: "ambiguous",
    target,
    candidates: [
      {
        id: `${target}-1`,
        name: `${target} one`,
        type: target,
        confidence: "medium",
      },
      {
        id: `${target}-2`,
        name: `${target} two`,
        type: target,
        confidence: "low",
      },
    ],
  };
}

describe("Tableau metadata precondition contract", () => {
  it("allows the read-only metadata tools when the safety boundary is satisfied", () => {
    const result = evaluateTableauMetadataToolPreconditions({
      toolName: TABLEAU_METADATA_ALLOWED_TOOL_NAMES[0],
      authenticatedTableauContext: {
        isAuthenticated: true,
        userId: "user-1",
        tableauUserId: "tableau-1",
        email: "person@example.com",
        siteId: "site-1",
        siteName: "Site One",
        authMode: "oauth_delegated",
      },
      siteSettings: {
        status: "enabled",
        checkedAt: "2026-07-03T00:00:00.000Z",
        source: "tableau_rest_api",
      },
      identifierResolution: {
        datasource: resolvedResolution("datasource"),
        workbook: resolvedResolution("workbook"),
        view: resolvedResolution("view"),
        site: resolvedResolution("site"),
      },
      toolPolicy: {
        allowedToolNames: [...TABLEAU_METADATA_ALLOWED_TOOL_NAMES],
        safeForPreviewOnly: true,
        readOnlyOnly: true,
        allowExternalAccess: true,
        allowUnderlyingDataAccess: false,
        allowWriteOperations: false,
      },
      budget: {
        timeoutMs: 10_000,
        remainingTimeMs: 9_000,
        maxItems: 25,
      },
      transportConfig: {
        selectedTransportKind: "stdio",
        status: "selected",
      },
      permission: {
        status: "verified",
        scopes: ["tableau:metadata:read"],
        capabilities: ["read_tableau_metadata"],
      },
      metadata: {
        note: "safe",
      },
    });

    expect(result.status).toBe("passed");
    expect(result.canExecute).toBe(true);
    expect(result.failureCode).toBeUndefined();
    expect(result.governance?.readOnly).toBe("allowed");
    expect(result.governance?.safeForPreview).toBe("allowed");
    expect(result.governance?.externalAccess).toBe("allowed");
    expect(result.governance?.underlyingDataAccess).toBe("blocked");
    expect(result.governance?.writeOperation).toBe("blocked");
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it("blocks unknown tools and raw MCP-like names", () => {
    const result = evaluateTableauMetadataToolPreconditions({
      toolName: "tableau.mcp.rawExecute",
    });

    expect(result.status).toBe("blocked");
    expect(result.failureCode).toBe("TOOL_NOT_ALLOWED");
    expect(result.userFacingMessage).toContain("not allowed");
    expect(JSON.stringify(result)).not.toContain("accessToken");
    expect(JSON.stringify(result)).not.toContain("refreshToken");
    expect(JSON.stringify(result)).not.toContain("authorizationHeader");
  });

  it("blocks when authentication is missing", () => {
    const result = evaluateTableauMetadataToolPreconditions({
      toolName: TABLEAU_METADATA_ALLOWED_TOOL_NAMES[1],
      authenticatedTableauContext: {
        isAuthenticated: false,
        authMode: "unknown",
      },
      identifierResolution: {
        datasource: resolvedResolution("datasource"),
      },
      siteSettings: {
        status: "enabled",
      },
      transportConfig: {
        selectedTransportKind: "fake",
        status: "not_configured",
        noNetwork: true,
      },
    });

    expect(result.status).toBe("blocked");
    expect(result.failureCode).toBe("AUTH_REQUIRED");
    expect(result.userFacingMessage).toContain("authentication");
  });

  it("blocks ambiguous datasource resolution", () => {
    const result = evaluateTableauMetadataToolPreconditions({
      toolName: TABLEAU_METADATA_ALLOWED_TOOL_NAMES[0],
      authenticatedTableauContext: {
        isAuthenticated: true,
        authMode: "fake",
      },
      siteSettings: {
        status: "not_required_for_fake",
        source: "fake",
      },
      identifierResolution: {
        datasource: ambiguousResolution("datasource"),
      },
      transportConfig: {
        selectedTransportKind: "fake",
        status: "selected",
        noNetwork: true,
      },
    });

    expect(result.status).toBe("blocked");
    expect(result.failureCode).toBe("DATASOURCE_IDENTIFIER_AMBIGUOUS");
    expect(result.userFacingMessage).toContain("datasource");
  });

  it("warns for fake transport and unverified permission without exposing secrets", () => {
    const result = evaluateTableauMetadataToolPreconditions({
      toolName: TABLEAU_METADATA_ALLOWED_TOOL_NAMES[1],
      authenticatedTableauContext: {
        isAuthenticated: true,
        authMode: "fake",
      },
      siteSettings: {
        status: "not_required_for_fake",
        source: "fake",
      },
      identifierResolution: {
        datasource: resolvedResolution("datasource"),
      },
      transportConfig: {
        selectedTransportKind: "fake",
        status: "selected",
        noNetwork: true,
      },
      budget: {
        timeoutMs: 2_000,
        remainingTimeMs: 2_000,
        maxItems: 250,
      },
      metadata: {
        requestLabel: "no-network",
      },
    });

    expect(result.status).toBe("warning");
    expect(result.canExecute).toBe(true);
    expect(result.warnings?.map((warning) => warning.code)).toContain(
      "SITE_SETTINGS_NOT_VERIFIED",
    );
    expect(result.warnings?.map((warning) => warning.code)).toContain(
      "USING_FAKE_TRANSPORT",
    );
    expect(result.warnings?.map((warning) => warning.code)).toContain(
      "PERMISSION_NOT_VERIFIED",
    );
    expect(result.warnings?.map((warning) => warning.code)).toContain(
      "MAX_ITEMS_REDUCED",
    );
    expect(JSON.stringify(result)).not.toContain("accessToken");
    expect(JSON.stringify(result)).not.toContain("refreshToken");
    expect(JSON.stringify(result)).not.toContain("stack");
  });

  it("blocks when the transport is not configured for a non-fake execution path", () => {
    const result = evaluateTableauMetadataToolPreconditions({
      toolName: TABLEAU_METADATA_ALLOWED_TOOL_NAMES[0],
      authenticatedTableauContext: {
        isAuthenticated: true,
        authMode: "direct_trust",
      },
      siteSettings: {
        status: "enabled",
      },
      identifierResolution: {
        datasource: resolvedResolution("datasource"),
      },
      transportConfig: {
        selectedTransportKind: "stdio",
        status: "not_configured",
      },
      permission: {
        status: "verified",
      },
    });

    expect(result.status).toBe("blocked");
    expect(result.failureCode).toBe("TRANSPORT_NOT_CONFIGURED");
    expect(result.userFacingMessage).toContain("transport");
  });

  it("blocks when site settings are disabled for hosted execution", () => {
    const result = evaluateTableauMetadataToolPreconditions({
      toolName: TABLEAU_METADATA_ALLOWED_TOOL_NAMES[0],
      authenticatedTableauContext: {
        isAuthenticated: true,
        authMode: "oauth_delegated",
      },
      siteSettings: {
        status: "disabled",
        source: "tableau_rest_api",
      },
      identifierResolution: {
        datasource: resolvedResolution("datasource"),
      },
      transportConfig: {
        selectedTransportKind: "hosted",
        status: "selected",
      },
      permission: {
        status: "verified",
      },
    });

    expect(result.status).toBe("blocked");
    expect(result.failureCode).toBe("SITE_SETTINGS_DISABLED");
  });

  it("blocks when the remaining budget is too low", () => {
    const result = evaluateTableauMetadataToolPreconditions({
      toolName: TABLEAU_METADATA_ALLOWED_TOOL_NAMES[0],
      authenticatedTableauContext: {
        isAuthenticated: true,
        authMode: "direct_trust",
      },
      siteSettings: {
        status: "enabled",
      },
      identifierResolution: {
        datasource: resolvedResolution("datasource"),
      },
      transportConfig: {
        selectedTransportKind: "stdio",
        status: "selected",
      },
      budget: {
        timeoutMs: 1_000,
        remainingTimeMs: 50,
      },
      permission: {
        status: "verified",
      },
    });

    expect(result.status).toBe("blocked");
    expect(result.failureCode).toBe("BUDGET_EXHAUSTED");
    expect(result.userFacingMessage).toContain("execution time");
  });
});
