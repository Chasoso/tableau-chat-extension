import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  HostedTableauMcpTransport,
  createHostedMcpAuthContextAdapter,
  maskTokenReferenceForTrace,
  toTableauMcpTransportAuthContext,
  toTableauMcpTransportUserContext,
  type HostedMcpAuthContextAdapterInput,
  type HostedMcpRequestClient,
  type TableauMcpTransportRequest,
} from "../src/agent";

const FIXED_NOW = new Date("2026-07-04T00:00:00.000Z");
const FUTURE_EXPIRES_AT = new Date("2026-07-05T00:00:00.000Z").toISOString();

function createInput(
  overrides: Partial<HostedMcpAuthContextAdapterInput> = {},
): HostedMcpAuthContextAdapterInput {
  return {
    requestId: "request-1",
    correlationId: "corr-1",
    agentRunId: "agent-1",
    authenticatedUser: {
      userId: "user-1",
      email: "user@example.com",
      tableauSubject: "tableau-user-1",
    },
    authenticatedTableauContext: {
      isAuthenticated: true,
      userId: "user-1",
      tableauUserId: "tableau-user-1",
      email: "user@example.com",
      siteId: "site-1",
      siteName: "Site One",
      siteContentUrl: "site-one",
      authMode: "oauth_delegated",
    },
    tokenReference: {
      referenceId: "reference-1",
      expiresAt: FUTURE_EXPIRES_AT,
      scopes: ["read", "view"],
      source: "oauth",
    },
    metadata: {
      accessToken: "should-not-leak",
      refreshToken: "should-not-leak",
      authorizationHeader: "should-not-leak",
      clientSecret: "should-not-leak",
      nested: {
        token: "should-not-leak",
      },
    },
    ...overrides,
  };
}

function createRequest(
  authContext = createHostedMcpAuthContextAdapter(createInput())
    .transportAuthContext,
  userContext = createHostedMcpAuthContextAdapter(createInput())
    .transportUserContext,
): TableauMcpTransportRequest {
  return {
    requestId: "request-1",
    toolName: "tableau.metadata.describeDatasource",
    input: {
      datasource: {
        datasourceId: "datasource-1",
      },
    },
    timeoutMs: 3_000,
    correlationId: "corr-1",
    agentRunId: "agent-1",
    authContext,
    userContext,
    metadata: {
      requestSource: "adapter-test",
      accessToken: "request-access-token-should-not-leak",
      tokenReferencePresent: true,
    },
  };
}

describe("Hosted MCP auth context adapter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("builds safe ready auth and user summaries", () => {
    const result = createHostedMcpAuthContextAdapter(createInput());

    expect(result.authContext).toMatchObject({
      state: "ready",
      mode: "oauth_delegated",
      userActionRequired: false,
      retryable: false,
      tokenReference: {
        kind: "token_reference",
        referenceId: "reference-1",
        expiresAt: FUTURE_EXPIRES_AT,
        scopes: ["read", "view"],
        source: "oauth",
      },
    });
    expect(result.userContext).toMatchObject({
      userId: "user-1",
      tableauUserId: "tableau-user-1",
      email: "user@example.com",
      siteId: "site-1",
      siteName: "Site One",
      siteContentUrl: "site-one",
      authMode: "oauth_delegated",
    });
    expect(result.traceSummary).toMatchObject({
      authState: "ready",
      authMode: "oauth_delegated",
      tokenReferencePresent: true,
      tokenReferenceMasked: true,
      tokenReferenceExpiresAt: FUTURE_EXPIRES_AT,
      siteId: "site-1",
      siteName: "Site One",
      siteContentUrl: "site-one",
    });
    expect(result.transportAuthContext).toMatchObject({
      mode: "oauth_delegated",
      state: "ready",
      userActionRequired: false,
      retryable: false,
      tokenReference: "reference-1",
      scopes: ["read", "view"],
      expiresAt: FUTURE_EXPIRES_AT,
    });
    expect(result.transportUserContext).toMatchObject({
      userId: "user-1",
      tableauUserId: "tableau-user-1",
      email: "user@example.com",
      siteId: "site-1",
      siteName: "Site One",
      siteContentUrl: "site-one",
      source: "cognito",
    });
    expect(JSON.stringify(result)).not.toContain("should-not-leak");
    expect(JSON.stringify(result)).not.toContain('"should-not-leak"');
  });

  it("maps missing auth into a recoverable safe state", () => {
    const result = createHostedMcpAuthContextAdapter({
      requestId: "request-2",
      authenticatedTableauContext: {
        isAuthenticated: false,
      },
    });

    expect(result.authContext).toMatchObject({
      state: "missing",
      mode: "unknown",
      reasonCode: "AUTH_REQUIRED",
      userActionRequired: true,
      retryable: true,
    });
    expect(result.error).toMatchObject({
      code: "AUTH_REQUIRED",
      userActionRequired: true,
      retryable: true,
    });
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "AUTH_CONTEXT_MISSING" }),
      ]),
    );
    expect(JSON.stringify(result)).not.toContain("accessToken");
  });

  it("maps expired auth into a recoverable safe state", () => {
    const result = createHostedMcpAuthContextAdapter(
      createInput({
        tokenReference: {
          referenceId: "reference-2",
          expiresAt: "2024-01-01T00:00:00.000Z",
          source: "oauth",
        },
      }),
    );

    expect(result.authContext).toMatchObject({
      state: "expired",
      reasonCode: "AUTH_EXPIRED",
      userActionRequired: true,
      retryable: true,
    });
    expect(result.error).toMatchObject({
      code: "AUTH_EXPIRED",
      userActionRequired: true,
      retryable: true,
    });
    expect(JSON.stringify(result)).not.toContain("should-not-leak");
  });

  it("maps unknown auth into a safe unknown state", () => {
    const result = createHostedMcpAuthContextAdapter(
      createInput({
        authenticatedTableauContext: {
          isAuthenticated: true,
          authMode: "unknown",
        },
        tokenReference: undefined,
      }),
    );

    expect(result.authContext).toMatchObject({
      state: "unknown",
      mode: "unknown",
      reasonCode: "AUTH_STATE_UNKNOWN",
      userActionRequired: true,
    });
    expect(result.error).toMatchObject({
      code: "AUTH_STATE_UNKNOWN",
    });
  });

  it("maps site settings disabled into not_configured", () => {
    const result = createHostedMcpAuthContextAdapter(
      createInput({
        siteSettings: {
          status: "disabled",
          source: "tableau_rest_api",
        },
      }),
    );

    expect(result.authContext).toMatchObject({
      state: "not_configured",
      reasonCode: "SITE_SETTINGS_DISABLED",
      userActionRequired: true,
      retryable: false,
    });
    expect(result.error).toMatchObject({
      code: "SITE_SETTINGS_DISABLED",
      userActionRequired: true,
    });
  });

  it("masks token reference for trace output", () => {
    expect(
      maskTokenReferenceForTrace({
        kind: "token_reference",
        referenceId: "reference-3",
        expiresAt: "2026-07-04T00:00:00.000Z",
      }),
    ).toEqual({
      tokenReferencePresent: true,
      tokenReferenceMasked: true,
      tokenReferenceExpiresAt: "2026-07-04T00:00:00.000Z",
    });
  });

  it("converts the safe adapter output into transport contexts", () => {
    const result = createHostedMcpAuthContextAdapter(createInput());

    expect(toTableauMcpTransportAuthContext(result.authContext)).toMatchObject({
      mode: "oauth_delegated",
      state: "ready",
      tokenReference: "reference-1",
      expiresAt: FUTURE_EXPIRES_AT,
    });
    expect(toTableauMcpTransportUserContext(result.userContext)).toMatchObject({
      userId: "user-1",
      siteContentUrl: "site-one",
      source: "cognito",
    });
  });

  it("bridges the adapter result into the hosted transport without leaking secrets", async () => {
    const adapterResult = createHostedMcpAuthContextAdapter(createInput());
    const client = vi.fn(async (request: TableauMcpTransportRequest) => {
      expect(request.authContext).toMatchObject({
        mode: "oauth_delegated",
        state: "ready",
        tokenReference: "reference-1",
      });
      expect(request.userContext).toMatchObject({
        userId: "user-1",
        siteContentUrl: "site-one",
      });
      return {
        status: "success" as const,
        data: {
          status: "success",
          summary: {
            datasourceId: "datasource-1",
          },
        },
        metadata: {
          transportToken: "should-not-leak",
        },
      };
    }) as HostedMcpRequestClient;

    const transport = new HostedTableauMcpTransport(
      {
        endpoint: "https://example.tableau.invalid/hosted-mcp",
        authMode: "oauth_delegated",
        siteId: "site-1",
        networkEnabled: true,
        protocol: "streamable_http",
      },
      {
        now: () => new Date("2026-07-04T00:00:00.000Z"),
        requestClient: client,
      },
    );

    const result = await transport.call(createRequest());

    expect(result.status).toBe("success");
    expect(client).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain("should-not-leak");
    expect(JSON.stringify(result)).not.toContain(
      '"transportToken":"should-not-leak"',
    );
    expect(JSON.stringify(adapterResult)).not.toContain("should-not-leak");
  });

  it("returns not_configured when the request carries a missing auth state", async () => {
    const adapterResult = createHostedMcpAuthContextAdapter({
      authenticatedTableauContext: {
        isAuthenticated: false,
      },
    });
    const client = vi.fn();
    const transport = new HostedTableauMcpTransport(
      {
        endpoint: "https://example.tableau.invalid/hosted-mcp",
        authMode: "oauth_delegated",
        siteId: "site-1",
        networkEnabled: true,
        protocol: "streamable_http",
      },
      {
        now: () => new Date("2026-07-04T00:00:00.000Z"),
        requestClient: client as HostedMcpRequestClient,
      },
    );

    const result = await transport.call({
      ...createRequest(
        adapterResult.transportAuthContext,
        adapterResult.transportUserContext,
      ),
      authContext: adapterResult.transportAuthContext,
      userContext: adapterResult.transportUserContext,
    });

    expect(result.status).toBe("not_configured");
    expect(result.error?.code).toBe("TRANSPORT_NOT_CONFIGURED");
    expect(client).not.toHaveBeenCalled();
  });
});
