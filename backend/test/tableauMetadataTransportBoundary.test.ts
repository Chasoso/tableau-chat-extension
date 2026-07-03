import { describe, expect, it } from "vitest";
import {
  createTableauMetadataToolRuntime,
  type TableauMcpTransport,
  type TableauMcpTransportRequest,
  type TableauMcpTransportResult,
  TABLEAU_METADATA_DESCRIBE_DATASOURCE_TOOL_NAME,
  TABLEAU_METADATA_LIST_FIELDS_TOOL_NAME,
} from "../src/agent";

function createExecutionContext(overrides: Record<string, unknown> = {}) {
  return {
    tableauMetadataTransportKind: "fake",
    tableauMetadataPreconditionInput: {
      authenticatedTableauContext: {
        isAuthenticated: true,
        authMode: "oauth_delegated" as const,
      },
      siteSettings: {
        status: "enabled" as const,
        source: "config" as const,
      },
      transportConfig: {
        selectedTransportKind: "fake" as const,
        status: "selected" as const,
        noNetwork: true,
      },
      permission: {
        status: "verified" as const,
      },
      ...overrides,
    },
  };
}

function createStubTransport(
  implementation: (
    request: TableauMcpTransportRequest,
  ) => TableauMcpTransportResult,
  calls: TableauMcpTransportRequest[],
): TableauMcpTransport {
  return {
    kind: "fake",
    name: "stub-transport",
    async call(request) {
      calls.push(request);
      return implementation(request);
    },
  };
}

describe("Tableau metadata transport-aware execution boundary", () => {
  it("routes describeDatasource through an injected transport", async () => {
    const calls: TableauMcpTransportRequest[] = [];
    const transport = createStubTransport(
      (request) => ({
        requestId: request.requestId,
        transportKind: "fake",
        status: "success",
        toolName: request.toolName,
        data: {
          status: "success" as const,
          summary: {
            datasourceId: "stub-datasource",
            datasourceName: "Stub Datasource",
            connectionType: "fake",
            fieldCount: 2,
            visibleFieldCount: 2,
            hiddenFieldCount: 0,
          },
          resolution: {
            status: "resolved" as const,
            target: "datasource" as const,
            selectedId: "stub-datasource",
            selectedName: "Stub Datasource",
          },
          warnings: [
            {
              code: "TRANSPORT_WARNING" as const,
              message: "stub transport used",
            },
          ],
          metadata: {
            source: "stub-transport",
          },
        },
        warnings: [
          {
            code: "TRANSPORT_WARNING",
            message: "stub transport used",
            source: "stub",
          },
        ],
        trace: {
          correlationId: request.correlationId,
          agentRunId: request.agentRunId,
          transportEventId: "transport-event-1",
          startedAt: "2026-07-03T00:00:00.000Z",
          completedAt: "2026-07-03T00:00:00.001Z",
          durationMs: 1,
          transportKind: "fake",
          toolName: request.toolName,
        },
        timing: {
          startedAt: "2026-07-03T00:00:00.000Z",
          completedAt: "2026-07-03T00:00:00.001Z",
          durationMs: 1,
          timeoutMs: request.timeoutMs,
          timedOut: false,
        },
      }),
      calls,
    );

    const runtime = createTableauMetadataToolRuntime({ transport });
    const result = await runtime.executionWrapper.execute({
      toolName: TABLEAU_METADATA_DESCRIBE_DATASOURCE_TOOL_NAME,
      input: {
        datasource: {
          datasourceId: "sales-datasource",
          datasourceName: "Sales Datasource",
        },
      },
      context: createExecutionContext(),
      traceMetadata: {
        correlationId: "corr-1",
      },
    });

    expect(result.status).toBe("completed");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual(
      expect.objectContaining({
        toolName: TABLEAU_METADATA_DESCRIBE_DATASOURCE_TOOL_NAME,
        requestId: expect.any(String),
        input: expect.objectContaining({
          datasource: expect.objectContaining({
            datasourceId: "sales-datasource",
          }),
        }),
      }),
    );
    expect(result.output).toEqual(
      expect.objectContaining({
        status: "success",
        summary: expect.objectContaining({
          datasource: expect.objectContaining({
            datasourceId: "stub-datasource",
            datasourceName: "Stub Datasource",
          }),
        }),
        metadata: expect.objectContaining({
          transportKind: "fake",
          transportStatus: "success",
        }),
        trace: expect.objectContaining({
          eventNames: expect.arrayContaining([
            "tableau_metadata_tool.started",
            "tableau_metadata_tool.completed",
          ]),
        }),
      }),
    );
    expect(JSON.stringify(result.output)).not.toContain("accessToken");
    expect(JSON.stringify(result.output)).not.toContain("rawMcpResult");
  });

  it("routes listFields through an injected transport and preserves trace metadata", async () => {
    const calls: TableauMcpTransportRequest[] = [];
    const transport = createStubTransport(
      (request) => ({
        requestId: request.requestId,
        transportKind: "fake",
        status: "partial",
        toolName: request.toolName,
        data: {
          status: "partial" as const,
          datasource: {
            datasourceId: "sales-datasource",
            datasourceName: "Sales Datasource",
          },
          fields: [
            {
              fieldName: "Region",
              role: "dimension" as const,
              dataType: "string" as const,
              isHidden: false,
            },
          ],
          fieldCountSummary: {
            returned: 1,
            totalAvailable: 2,
            visibleFields: 1,
            hiddenFields: 0,
          },
          warnings: [
            {
              code: "OUTPUT_TRUNCATED" as const,
              message: "stub truncation",
            },
          ],
          truncation: {
            truncated: true,
            limit: 1,
            returned: 1,
            totalAvailable: 2,
            reason: "field_limit" as const,
          },
          metadata: {
            source: "stub-transport",
          },
        },
        warnings: [
          {
            code: "OUTPUT_TRUNCATED",
            message: "stub truncation",
            source: "stub",
          },
        ],
        trace: {
          correlationId: request.correlationId,
          agentRunId: request.agentRunId,
          transportEventId: "transport-event-2",
          startedAt: "2026-07-03T00:00:00.000Z",
          completedAt: "2026-07-03T00:00:00.002Z",
          durationMs: 2,
          transportKind: "fake",
          toolName: request.toolName,
        },
        timing: {
          startedAt: "2026-07-03T00:00:00.000Z",
          completedAt: "2026-07-03T00:00:00.002Z",
          durationMs: 2,
          timeoutMs: request.timeoutMs,
          timedOut: false,
        },
      }),
      calls,
    );

    const runtime = createTableauMetadataToolRuntime({ transport });
    const result = await runtime.executionWrapper.execute({
      toolName: TABLEAU_METADATA_LIST_FIELDS_TOOL_NAME,
      input: {
        datasource: {
          datasourceId: "sales-datasource",
        },
        maxFields: 1,
      },
      context: createExecutionContext(),
    });

    expect(result.status).toBe("completed");
    expect(calls).toHaveLength(1);
    expect(result.output).toEqual(
      expect.objectContaining({
        status: "partial",
        summary: expect.objectContaining({
          datasource: expect.objectContaining({
            datasourceId: "sales-datasource",
          }),
          fields: expect.arrayContaining([
            expect.objectContaining({
              fieldName: "Region",
            }),
          ]),
          fieldCountSummary: expect.objectContaining({
            returned: 1,
          }),
        }),
        metadata: expect.objectContaining({
          transportKind: "fake",
          transportStatus: "partial",
        }),
        trace: expect.objectContaining({
          eventNames: expect.arrayContaining([
            "tableau_metadata_tool.started",
            "tableau_metadata_tool.completed",
          ]),
        }),
      }),
    );
    expect(JSON.stringify(result.output)).not.toContain("rawMcpResult");
  });

  it("normalizes transport failures without leaking raw errors", async () => {
    const transport = createStubTransport(
      (request) => ({
        requestId: request.requestId,
        transportKind: "hosted",
        status: "timeout",
        toolName: request.toolName,
        error: {
          code: "TIMEOUT",
          message: "timed out",
          retryable: true,
          userActionRequired: true,
          source: "stub",
        },
        trace: {
          correlationId: request.correlationId,
          agentRunId: request.agentRunId,
          transportEventId: "transport-event-3",
          startedAt: "2026-07-03T00:00:00.000Z",
          completedAt: "2026-07-03T00:00:01.000Z",
          durationMs: 1000,
          transportKind: "hosted",
          toolName: request.toolName,
        },
        timing: {
          startedAt: "2026-07-03T00:00:00.000Z",
          completedAt: "2026-07-03T00:00:01.000Z",
          durationMs: 1000,
          timeoutMs: request.timeoutMs,
          timedOut: true,
        },
      }),
      [],
    );

    const runtime = createTableauMetadataToolRuntime({ transport });
    const result = await runtime.executionWrapper.execute({
      toolName: TABLEAU_METADATA_DESCRIBE_DATASOURCE_TOOL_NAME,
      input: {
        datasource: {
          datasourceId: "sales-datasource",
        },
      },
      context: createExecutionContext({
        tableauMetadataTransportKind: "hosted" as const,
        transportConfig: {
          selectedTransportKind: "hosted" as const,
          status: "selected" as const,
          noNetwork: false,
        },
      }),
    });

    expect(result.status).toBe("completed");
    expect(result.output).toEqual(
      expect.objectContaining({
        status: "failed",
        error: expect.objectContaining({
          code: "TIMEOUT",
          message: expect.any(String),
        }),
        metadata: expect.objectContaining({
          transportKind: "hosted",
          transportStatus: "timeout",
        }),
        trace: expect.objectContaining({
          eventNames: expect.arrayContaining([
            "tableau_metadata_tool.started",
            "tableau_metadata_tool.failed",
          ]),
        }),
      }),
    );
    expect(JSON.stringify(result.output)).not.toContain("stack");
    expect(JSON.stringify(result.output)).not.toContain("accessToken");
  });

  it.each([
    [
      "not_configured",
      "TRANSPORT_NOT_CONFIGURED",
      {
        code: "TRANSPORT_NOT_CONFIGURED",
        message: "not configured",
      },
    ],
    [
      "auth required",
      "AUTH_REQUIRED",
      {
        code: "AUTH_REQUIRED",
        message: "auth required",
      },
    ],
    [
      "permission denied",
      "PERMISSION_DENIED",
      {
        code: "PERMISSION_DENIED",
        message: "permission denied",
      },
    ],
  ])(
    "maps %s transport failures to safe metadata errors",
    async (_, expectedCode, error) => {
      const transport = createStubTransport(
        (request) => ({
          requestId: request.requestId,
          transportKind: "hosted",
          status:
            error.code === "TRANSPORT_NOT_CONFIGURED"
              ? "not_configured"
              : "failed",
          toolName: request.toolName,
          error: {
            code: error.code as never,
            message: error.message,
            retryable: false,
            userActionRequired: true,
            source: "stub",
          },
          trace: {
            correlationId: request.correlationId,
            agentRunId: request.agentRunId,
            transportEventId: "transport-event-4",
            startedAt: "2026-07-03T00:00:00.000Z",
            completedAt: "2026-07-03T00:00:00.500Z",
            durationMs: 500,
            transportKind: "hosted",
            toolName: request.toolName,
          },
          timing: {
            startedAt: "2026-07-03T00:00:00.000Z",
            completedAt: "2026-07-03T00:00:00.500Z",
            durationMs: 500,
            timeoutMs: request.timeoutMs,
            timedOut: false,
          },
        }),
        [],
      );

      const runtime = createTableauMetadataToolRuntime({ transport });
      const result = await runtime.executionWrapper.execute({
        toolName: TABLEAU_METADATA_DESCRIBE_DATASOURCE_TOOL_NAME,
        input: {
          datasource: {
            datasourceId: "sales-datasource",
          },
        },
        context: createExecutionContext({
          tableauMetadataTransportKind: "hosted" as const,
          transportConfig: {
            selectedTransportKind: "hosted" as const,
            status: "selected" as const,
            noNetwork: false,
          },
        }),
      });

      expect(result.status).toBe("completed");
      expect(result.output).toEqual(
        expect.objectContaining({
          status: "failed",
          error: expect.objectContaining({
            code: expectedCode,
          }),
          metadata: expect.objectContaining({
            transportKind: "hosted",
          }),
          trace: expect.objectContaining({
            eventNames: expect.arrayContaining([
              "tableau_metadata_tool.started",
              "tableau_metadata_tool.failed",
            ]),
          }),
        }),
      );
      expect(JSON.stringify(result.output)).not.toContain("stack");
      expect(JSON.stringify(result.output)).not.toContain("secret");
    },
  );

  it("blocks transport execution when preconditions fail", async () => {
    let called = false;
    const transport = createStubTransport((request) => {
      called = true;
      return {
        requestId: request.requestId,
        transportKind: "fake",
        status: "success",
        toolName: request.toolName,
        data: {},
      };
    }, []);

    const runtime = createTableauMetadataToolRuntime({ transport });
    const result = await runtime.executionWrapper.execute({
      toolName: TABLEAU_METADATA_DESCRIBE_DATASOURCE_TOOL_NAME,
      input: {},
      context: createExecutionContext(),
    });

    expect(called).toBe(false);
    expect(result.output).toEqual(
      expect.objectContaining({
        status: "blocked",
        error: expect.objectContaining({
          code: "MISSING_REQUIRED_IDENTIFIER",
        }),
        trace: expect.objectContaining({
          eventNames: expect.arrayContaining([
            "tableau_metadata_tool.started",
            "tableau_metadata_tool.failed",
          ]),
        }),
      }),
    );
  });
});
