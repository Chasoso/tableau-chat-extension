import { describe, expect, it, vi } from "vitest";
import {
  HostedTableauMcpTransport,
  createHostedTableauMcpTransport,
  type HostedMcpRequestClient,
  type TableauMcpTransportRequest,
} from "../src/agent";

function createRequest(
  overrides: Partial<TableauMcpTransportRequest> = {},
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
    agentRunId: "agent-run-1",
    metadata: {
      requestSource: "unit-test",
      token: "request-token-should-not-leak",
    },
    ...overrides,
  };
}

function createNowSequence(...timestamps: string[]): () => Date {
  let index = 0;
  return () => new Date(timestamps[Math.min(index++, timestamps.length - 1)]);
}

function createTransport(
  config: Record<string, unknown> = {},
  requestClient?: HostedMcpRequestClient,
) {
  return new HostedTableauMcpTransport(
    {
      endpoint: "https://example.tableau.invalid/hosted-mcp",
      authMode: "oauth_delegated",
      siteId: "site-1",
      siteContentUrl: "site-1",
      timeoutMs: 4_000,
      networkEnabled: false,
      protocol: "streamable_http",
      ...config,
    },
    {
      now: createNowSequence(
        "2026-07-03T00:00:00.000Z",
        "2026-07-03T00:00:00.250Z",
      ),
      requestClient,
      logger: {
        warn: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
      },
    },
  );
}

describe("HostedTableauMcpTransport skeleton", () => {
  it("exposes the hosted transport kind and factory", () => {
    const transport = createHostedTableauMcpTransport();
    expect(transport).toBeInstanceOf(HostedTableauMcpTransport);
    expect(transport.kind).toBe("hosted");
    expect(transport.name).toBe("hosted-tableau-mcp-transport");
  });

  it("returns not_configured when endpoint is missing without calling the client", async () => {
    const client = vi.fn();
    const transport = createTransport(
      {
        endpoint: undefined,
        networkEnabled: true,
      },
      client as HostedMcpRequestClient,
    );

    const result = await transport.call(createRequest());

    expect(result.status).toBe("not_configured");
    expect(result.transportKind).toBe("hosted");
    expect(result.error?.code).toBe("TRANSPORT_NOT_CONFIGURED");
    expect(client).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain(
      "request-token-should-not-leak",
    );
    expect(JSON.stringify(result)).not.toContain("accessToken");
  });

  it("returns not_configured when auth is missing without calling the client", async () => {
    const client = vi.fn();
    const transport = createTransport(
      {
        authMode: undefined,
        networkEnabled: true,
      },
      client as HostedMcpRequestClient,
    );

    const result = await transport.call(createRequest());

    expect(result.status).toBe("not_configured");
    expect(result.error?.code).toBe("TRANSPORT_NOT_CONFIGURED");
    expect(client).not.toHaveBeenCalled();
  });

  it("returns not_configured when network access is disabled", async () => {
    const client = vi.fn();
    const transport = createTransport(
      {
        networkEnabled: false,
      },
      client as HostedMcpRequestClient,
    );

    const result = await transport.call(createRequest());

    expect(result.status).toBe("not_configured");
    expect(result.error?.code).toBe("TRANSPORT_NOT_CONFIGURED");
    expect(client).not.toHaveBeenCalled();
  });

  it("returns unsupported for unsupported tools without calling the client", async () => {
    const client = vi.fn();
    const transport = createTransport(
      {
        networkEnabled: true,
      },
      client as HostedMcpRequestClient,
    );

    const result = await transport.call(
      createRequest({
        toolName: "tableau.metadata.writeDatasource",
      }),
    );

    expect(result.status).toBe("unsupported");
    expect(result.error?.code).toBe("UNSUPPORTED_TRANSPORT");
    expect(client).not.toHaveBeenCalled();
  });

  it("maps injected client success results without leaking secrets", async () => {
    const client = vi.fn(async (request: TableauMcpTransportRequest) => {
      const input = request.input as { datasource?: { datasourceId?: string } };
      return {
        status: "success",
        data: {
          status: "success",
          summary: {
            datasourceId: input.datasource?.datasourceId,
            datasourceName: "Datasource 1",
          },
        },
        metadata: {
          requestToken: "client-token-should-not-leak",
        },
        trace: {
          transportEventId: "transport-event-1",
          metadata: {
            clientToken: "client-token-should-not-leak",
          },
        },
      };
    }) as HostedMcpRequestClient;

    const transport = createTransport(
      {
        networkEnabled: true,
      },
      client,
    );
    const result = await transport.call(createRequest());

    expect(result.status).toBe("success");
    expect(client).toHaveBeenCalledTimes(1);
    expect(result.transportKind).toBe("hosted");
    expect(result.trace?.transportKind).toBe("hosted");
    expect(result.trace?.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.trace?.metadata).toMatchObject({
      source: "hosted_tableau_mcp_transport",
      endpointConfigured: true,
      authConfigured: true,
      requestClientConfigured: true,
      networkEnabled: true,
      protocol: "streamable_http",
    });
    expect(result.metadata).toMatchObject({
      source: "hosted_tableau_mcp_transport",
      transportKind: "hosted",
      transportStatus: "success",
    });
    expect(JSON.stringify(result)).not.toContain(
      "request-token-should-not-leak",
    );
    expect(JSON.stringify(result)).not.toContain(
      "client-token-should-not-leak",
    );
    expect(JSON.stringify(result)).not.toContain("stack");
  });

  it("maps timeout-like client failures to safe timeout results", async () => {
    const client = vi.fn(async () => {
      throw new Error("Request timed out while waiting for response");
    }) as HostedMcpRequestClient;

    const transport = createTransport(
      {
        networkEnabled: true,
      },
      client,
    );
    const result = await transport.call(createRequest());

    expect(result.status).toBe("timeout");
    expect(result.error?.code).toBe("TIMEOUT");
    expect(result.error?.message).toContain("timed out");
    expect(JSON.stringify(result)).not.toContain("stack");
    expect(JSON.stringify(result)).not.toContain(
      "request-token-should-not-leak",
    );
  });

  it("maps unsupported client responses to safe unsupported results", async () => {
    const client = vi.fn(async () => ({
      status: "unsupported",
      error: {
        code: "UNSUPPORTED_TRANSPORT",
        message: "unsupported by upstream",
        retryable: false,
        userActionRequired: true,
        metadata: {
          secret: "client-secret-should-not-leak",
        },
      },
    })) as HostedMcpRequestClient;

    const transport = createTransport(
      {
        networkEnabled: true,
      },
      client,
    );
    const result = await transport.call(createRequest());

    expect(result.status).toBe("unsupported");
    expect(result.error?.code).toBe("UNSUPPORTED_TRANSPORT");
    expect(result.error?.message).toContain("does not support");
    expect(JSON.stringify(result)).not.toContain(
      "client-secret-should-not-leak",
    );
  });

  it("maps unexpected client exceptions to safe unknown failures", async () => {
    const client = vi.fn(async () => {
      throw new Error("unexpected failure with secret token");
    }) as HostedMcpRequestClient;

    const transport = createTransport(
      {
        networkEnabled: true,
      },
      client,
    );
    const result = await transport.call(createRequest());

    expect(result.status).toBe("failed");
    expect(result.error?.code).toBe("UNKNOWN_ERROR");
    expect(result.error?.message).toContain("failed unexpectedly");
    expect(JSON.stringify(result)).not.toContain("secret token");
    expect(JSON.stringify(result)).not.toContain("stack");
  });
});
