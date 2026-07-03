import { describe, expect, it } from "vitest";
import {
  createTableauMetadataToolCompletedEvent,
  createTableauMetadataToolFailedEvent,
  createTableauMetadataToolStartedEvent,
  normalizeTableauMetadataExecutionResult,
  TABLEAU_METADATA_DESCRIBE_DATASOURCE_TOOL_NAME,
  TABLEAU_METADATA_LIST_FIELDS_TOOL_NAME,
  type JsonObject,
  type TableauDescribeDatasourceOutput,
  type TableauListFieldsOutput,
  type TableauMetadataPreconditionResult,
  type TableauMcpTransportRequest,
  type TableauMcpTransportResult,
} from "../src/agent";

function createRequest(toolName: string): TableauMcpTransportRequest {
  return {
    requestId: `${toolName}-request`,
    toolName,
    input: {
      datasource: {
        datasourceId: "datasource-1",
        datasourceName: "Datasource One",
      },
    },
    timeoutMs: 5_000,
    correlationId: "corr-1",
    agentRunId: "agent-1",
    userContext: {
      userId: "user-1",
      tableauUserId: "tableau-user-1",
      email: "user@example.com",
      siteId: "site-1",
      siteName: "Site One",
      source: "fake",
    },
    authContext: {
      mode: "fake",
      metadata: {
        placeholder: true,
      },
    },
    trace: {
      correlationId: "corr-1",
      agentRunId: "agent-1",
      toolName,
      metadata: {
        source: "test",
      },
    },
    metadata: {
      transportKind: "fake",
      noNetwork: true,
      requestedTransportKind: "fake",
    },
  };
}

function createPassedPrecondition(): TableauMetadataPreconditionResult {
  return {
    status: "passed",
    canExecute: true,
    warnings: [],
    governance: {
      readOnly: "allowed",
      safeForPreview: "allowed",
      externalAccess: "allowed",
      underlyingDataAccess: "not_requested",
      writeOperation: "not_requested",
      allowedToolPolicy: "allowed",
      permission: "verified",
      siteSettings: "enabled",
    },
    metadata: {
      datasourceResolution: "resolved",
    },
  };
}

describe("Tableau metadata output normalization and trace events", () => {
  it("normalizes describeDatasource output and suppresses raw fields", () => {
    const request = createRequest(
      TABLEAU_METADATA_DESCRIBE_DATASOURCE_TOOL_NAME,
    );
    const transportResult: TableauMcpTransportResult = {
      requestId: request.requestId,
      transportKind: "fake",
      status: "success",
      toolName: request.toolName,
      data: {
        status: "success",
        summary: {
          datasourceId: "datasource-1",
          datasourceName: "Datasource One",
          workbookId: "workbook-1",
          workbookName: "Workbook One",
          siteId: "site-1",
          siteName: "Site One",
          ownerName: "Owner",
          connectionType: "fake",
          isExtract: false,
          fieldCount: 2,
          visibleFieldCount: 2,
          hiddenFieldCount: 0,
          lastUpdatedAt: "2026-07-03T00:00:00.000Z",
        },
        fieldsSummary: {
          totalFields: 2,
          visibleFields: 2,
          hiddenFields: 0,
          returnedSampleCount: 2,
          sampleFieldNames: ["Region", "Sales"],
          truncated: false,
        },
        connectionSummary: {
          connectionType: "fake",
          isExtract: false,
          liveOrExtract: "unknown",
        },
        warnings: [
          {
            code: "TRANSPORT_WARNING",
            message: "stub warning",
          },
        ],
        metadata: {
          source: "fake_no_network",
          placeholder: true,
          rawMcpResult: "suppress-me",
          stdout: "suppress-me",
          stderr: "suppress-me",
          stack: "suppress-me",
          accessToken: "suppress-me",
        },
        rawMcpResult: "suppress-me",
        stdout: "suppress-me",
        stderr: "suppress-me",
        stack: "suppress-me",
        accessToken: "suppress-me",
      } as unknown as TableauDescribeDatasourceOutput,
      warnings: [
        {
          code: "TRANSPORT_WARNING",
          message: "stub warning",
        },
      ],
      trace: {
        correlationId: request.correlationId,
        agentRunId: request.agentRunId,
        transportEventId: "transport-event-1",
        startedAt: "2026-07-03T00:00:00.000Z",
        completedAt: "2026-07-03T00:00:00.010Z",
        durationMs: 10,
        transportKind: "fake",
        toolName: request.toolName,
      },
      timing: {
        startedAt: "2026-07-03T00:00:00.000Z",
        completedAt: "2026-07-03T00:00:00.010Z",
        durationMs: 10,
        timeoutMs: request.timeoutMs,
        timedOut: false,
      },
    };

    const result = normalizeTableauMetadataExecutionResult({
      toolName: request.toolName,
      request,
      precondition: createPassedPrecondition(),
      transportResult,
      fallbackOutput: {
        status: "success",
        summary: {
          datasourceId: "datasource-1",
          datasourceName: "Datasource One",
        },
        resolution: {
          status: "resolved",
          target: "datasource",
          selectedId: "datasource-1",
          selectedName: "Datasource One",
        },
      } as TableauDescribeDatasourceOutput,
      startedAt: "2026-07-03T00:00:00.000Z",
      completedAt: "2026-07-03T00:00:00.010Z",
    });

    expect(result).toEqual(
      expect.objectContaining({
        toolName: request.toolName,
        status: "success",
        summary: expect.objectContaining({
          datasource: expect.objectContaining({
            datasourceId: "datasource-1",
            datasourceName: "Datasource One",
            connectionType: "fake",
          }),
          fieldsSummary: expect.objectContaining({
            totalFields: 2,
          }),
        }),
        warnings: expect.arrayContaining([
          expect.objectContaining({
            code: "TRANSPORT_WARNING",
          }),
        ]),
        trace: expect.objectContaining({
          eventNames: expect.arrayContaining([
            "tableau_metadata_tool.started",
            "tableau_metadata_tool.completed",
          ]),
          fakeNoNetwork: true,
        }),
        metadata: expect.objectContaining({
          source: "fake_no_network",
          transportKind: "fake",
          transportStatus: "success",
        }),
      }),
    );
    expect(JSON.stringify(result)).not.toContain("accessToken");
    expect(JSON.stringify(result)).not.toContain("rawMcpResult");
    expect(JSON.stringify(result)).not.toContain("stdout");
    expect(JSON.stringify(result)).not.toContain("stack");
  });

  it("captures hosted trace context and fallback metadata safely", () => {
    const request = createRequest(
      TABLEAU_METADATA_DESCRIBE_DATASOURCE_TOOL_NAME,
    );
    request.metadata = {
      transportKind: "hosted",
      requestedTransportKind: "hosted",
      selectedTransportKind: "hosted",
      fallbackUsed: false,
      hostedFeatureEnabled: true,
      noNetworkRequested: false,
    };
    const transportResult: TableauMcpTransportResult = {
      requestId: request.requestId,
      transportKind: "hosted",
      status: "success",
      toolName: request.toolName,
      data: {
        status: "success",
        summary: {
          datasourceId: "datasource-1",
          datasourceName: "Datasource One",
          connectionType: "hosted",
          fieldCount: 1,
          visibleFieldCount: 1,
          hiddenFieldCount: 0,
        },
      } as unknown as TableauDescribeDatasourceOutput,
      trace: {
        correlationId: request.correlationId,
        agentRunId: request.agentRunId,
        transportEventId: "transport-event-hosted",
        startedAt: "2026-07-03T00:00:00.000Z",
        completedAt: "2026-07-03T00:00:00.005Z",
        durationMs: 5,
        transportKind: "hosted",
        toolName: request.toolName,
        metadata: {
          requestedTransportKind: "hosted",
          selectedTransportKind: "hosted",
          fallbackUsed: false,
          hostedFeatureEnabled: true,
          noNetworkRequested: false,
        },
      },
      timing: {
        startedAt: "2026-07-03T00:00:00.000Z",
        completedAt: "2026-07-03T00:00:00.005Z",
        durationMs: 5,
        timeoutMs: request.timeoutMs,
        timedOut: false,
      },
      metadata: {
        requestedTransportKind: "hosted",
        selectedTransportKind: "hosted",
        fallbackUsed: false,
        hostedFeatureEnabled: true,
        noNetworkRequested: false,
      },
    };

    const result = normalizeTableauMetadataExecutionResult({
      toolName: request.toolName,
      request,
      precondition: createPassedPrecondition(),
      transportResult,
      fallbackOutput: {
        status: "success",
        summary: {
          datasourceId: "datasource-1",
          datasourceName: "Datasource One",
        },
      } as TableauDescribeDatasourceOutput,
      startedAt: "2026-07-03T00:00:00.000Z",
      completedAt: "2026-07-03T00:00:00.005Z",
    });

    expect(result.trace).toEqual(
      expect.objectContaining({
        transportKind: "hosted",
        transportStatus: "success",
        requestedTransportKind: "hosted",
        selectedTransportKind: "hosted",
        fallbackUsed: false,
        hostedFeatureEnabled: true,
        noNetworkRequested: false,
        durationMs: 5,
      }),
    );
    expect(result.metadata).toEqual(
      expect.objectContaining({
        requestedTransportKind: "hosted",
        selectedTransportKind: "hosted",
        transportStatus: "success",
        fallbackUsed: false,
        hostedFeatureEnabled: true,
        noNetworkRequested: false,
      }),
    );
    expect(JSON.stringify(result.trace)).not.toContain("accessToken");
    expect(JSON.stringify(result.trace)).not.toContain("rawMcpResult");
  });

  it("distinguishes stdio trace context safely", () => {
    const request = createRequest(
      TABLEAU_METADATA_DESCRIBE_DATASOURCE_TOOL_NAME,
    );
    request.metadata = {
      transportKind: "stdio",
      requestedTransportKind: "stdio",
      selectedTransportKind: "stdio",
      fallbackUsed: false,
      noNetworkRequested: false,
    };
    const transportResult: TableauMcpTransportResult = {
      requestId: request.requestId,
      transportKind: "stdio",
      status: "success",
      toolName: request.toolName,
      data: {
        status: "success",
        summary: {
          datasourceId: "datasource-1",
          datasourceName: "Datasource One",
          connectionType: "stdio",
          fieldCount: 1,
          visibleFieldCount: 1,
          hiddenFieldCount: 0,
        },
      } as unknown as TableauDescribeDatasourceOutput,
      trace: {
        correlationId: request.correlationId,
        agentRunId: request.agentRunId,
        transportEventId: "transport-event-stdio",
        startedAt: "2026-07-03T00:00:00.000Z",
        completedAt: "2026-07-03T00:00:00.003Z",
        durationMs: 3,
        transportKind: "stdio",
        toolName: request.toolName,
        metadata: {
          requestedTransportKind: "stdio",
          selectedTransportKind: "stdio",
          fallbackUsed: false,
          noNetworkRequested: false,
        },
      },
      timing: {
        startedAt: "2026-07-03T00:00:00.000Z",
        completedAt: "2026-07-03T00:00:00.003Z",
        durationMs: 3,
        timeoutMs: request.timeoutMs,
        timedOut: false,
      },
      metadata: {
        requestedTransportKind: "stdio",
        selectedTransportKind: "stdio",
        fallbackUsed: false,
        noNetworkRequested: false,
      },
    };

    const result = normalizeTableauMetadataExecutionResult({
      toolName: request.toolName,
      request,
      precondition: createPassedPrecondition(),
      transportResult,
      fallbackOutput: {
        status: "success",
        summary: {
          datasourceId: "datasource-1",
          datasourceName: "Datasource One",
        },
      } as TableauDescribeDatasourceOutput,
      startedAt: "2026-07-03T00:00:00.000Z",
      completedAt: "2026-07-03T00:00:00.003Z",
    });

    expect(result.trace).toEqual(
      expect.objectContaining({
        transportKind: "stdio",
        transportStatus: "success",
        requestedTransportKind: "stdio",
        selectedTransportKind: "stdio",
        fallbackUsed: false,
        noNetworkRequested: false,
      }),
    );
    expect(JSON.stringify(result.trace)).not.toContain("refreshToken");
  });

  it("normalizes listFields output with truncation and omission signals", () => {
    const request = createRequest(TABLEAU_METADATA_LIST_FIELDS_TOOL_NAME);
    const transportResult: TableauMcpTransportResult = {
      requestId: request.requestId,
      transportKind: "fake",
      status: "partial",
      toolName: request.toolName,
      data: {
        status: "partial",
        datasource: {
          datasourceId: "datasource-1",
          datasourceName: "Datasource One",
          connectionType: "fake",
        },
        fields: [
          {
            fieldId: "field-1",
            fieldName: "Region",
            caption: "Region",
            role: "dimension",
            dataType: "string",
            isHidden: false,
          },
        ],
        fieldCountSummary: {
          returned: 1,
          totalAvailable: 2,
          visibleFields: 1,
          hiddenFields: 1,
        },
        warnings: [
          {
            code: "OUTPUT_TRUNCATED",
            message: "output truncated",
          },
        ],
        truncation: {
          truncated: true,
          limit: 1,
          returned: 1,
          totalAvailable: 2,
          reason: "field_limit",
        },
        omissions: [
          {
            omitted: true,
            reason: "hidden_by_default",
            message: "hidden field omitted",
            count: 1,
          },
        ],
      } as unknown as TableauListFieldsOutput,
      warnings: [
        {
          code: "OUTPUT_TRUNCATED",
          message: "output truncated",
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
    };

    const result = normalizeTableauMetadataExecutionResult({
      toolName: request.toolName,
      request,
      precondition: createPassedPrecondition(),
      transportResult,
      fallbackOutput: {
        status: "success",
        datasource: {
          datasourceId: "datasource-1",
          datasourceName: "Datasource One",
          connectionType: "fake",
        },
        fields: [
          {
            fieldName: "Region",
            role: "dimension",
            dataType: "string",
            isHidden: false,
          },
        ],
        fieldCountSummary: {
          returned: 1,
          totalAvailable: 1,
          visibleFields: 1,
          hiddenFields: 0,
        },
      } as TableauListFieldsOutput,
      startedAt: "2026-07-03T00:00:00.000Z",
      completedAt: "2026-07-03T00:00:00.002Z",
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: "partial",
        summary: expect.objectContaining({
          datasource: expect.objectContaining({
            datasourceId: "datasource-1",
            connectionType: "fake",
          }),
          fields: expect.arrayContaining([
            expect.objectContaining({
              fieldName: "Region",
            }),
          ]),
        }),
        truncation: expect.objectContaining({
          truncated: true,
          limit: 1,
        }),
        omissions: expect.arrayContaining([
          expect.objectContaining({
            reason: "hidden_by_default",
          }),
        ]),
        trace: expect.objectContaining({
          eventNames: expect.arrayContaining([
            "tableau_metadata_tool.started",
            "tableau_metadata_tool.completed",
          ]),
          omittedCount: 1,
        }),
      }),
    );
    expect(JSON.stringify(result)).not.toContain("rawMcpResult");
    expect(JSON.stringify(result)).not.toContain("accessToken");
  });

  it("normalizes blocked preconditions and failed trace events", () => {
    const request = createRequest(
      TABLEAU_METADATA_DESCRIBE_DATASOURCE_TOOL_NAME,
    );

    const result = normalizeTableauMetadataExecutionResult({
      toolName: request.toolName,
      request,
      precondition: {
        status: "blocked",
        canExecute: false,
        failureCode: "DATASOURCE_IDENTIFIER_MISSING",
        userFacingMessage:
          "Please select or specify a Tableau datasource before running this metadata action.",
        warnings: [],
        governance: {
          readOnly: "allowed",
          safeForPreview: "blocked",
          externalAccess: "blocked",
          underlyingDataAccess: "blocked",
          writeOperation: "blocked",
          allowedToolPolicy: "allowed",
          permission: "not_checked",
          siteSettings: "not_checked",
        },
      },
      fallbackOutput: {
        status: "failed",
        summary: {
          datasourceId: "datasource-1",
        },
        error: {
          code: "MISSING_REQUIRED_IDENTIFIER",
          message:
            "Please select or specify a Tableau datasource before running this metadata action.",
        },
      } as TableauDescribeDatasourceOutput,
      startedAt: "2026-07-03T00:00:00.000Z",
      completedAt: "2026-07-03T00:00:00.000Z",
    });

    expect(result).toEqual(
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
    expect(JSON.stringify(result)).not.toContain("accessToken");
    expect(JSON.stringify(result)).not.toContain("stack");
  });

  it.each([
    [
      "AUTH_EXPIRED",
      {
        code: "AUTH_EXPIRED",
        message: "raw auth expiry details should not leak",
      },
    ],
    [
      "NETWORK_ERROR",
      {
        code: "NETWORK_ERROR",
        message: "raw DNS details should not leak",
      },
    ],
    [
      "MCP_PROTOCOL_ERROR",
      {
        code: "MCP_PROTOCOL_ERROR",
        message: "raw malformed payload should not leak",
      },
    ],
  ] as const)(
    "normalizes hosted metadata errors into safe summaries for %s",
    (expectedCode, error) => {
      const request = createRequest(
        TABLEAU_METADATA_DESCRIBE_DATASOURCE_TOOL_NAME,
      );
      const transportResult: TableauMcpTransportResult = {
        requestId: request.requestId,
        transportKind: "hosted",
        status: "failed",
        toolName: request.toolName,
        error: {
          code: error.code as never,
          message: error.message,
          retryable: true,
          userActionRequired: true,
          metadata: {
            accessToken: "suppress-me",
            rawMcpResponse: "suppress-me",
          },
        },
        trace: {
          correlationId: request.correlationId,
          agentRunId: request.agentRunId,
          transportEventId: "hosted-event-1",
          startedAt: "2026-07-03T00:00:00.000Z",
          completedAt: "2026-07-03T00:00:00.005Z",
          durationMs: 5,
          transportKind: "hosted",
          toolName: request.toolName,
        },
        timing: {
          startedAt: "2026-07-03T00:00:00.000Z",
          completedAt: "2026-07-03T00:00:00.005Z",
          durationMs: 5,
          timeoutMs: request.timeoutMs,
          timedOut: false,
        },
      };

      const result = normalizeTableauMetadataExecutionResult({
        toolName: request.toolName,
        request,
        precondition: createPassedPrecondition(),
        transportResult,
        fallbackOutput: {
          status: "failed",
          summary: {
            datasourceId: "datasource-1",
            datasourceName: "Datasource One",
          },
          error: {
            code: "UNKNOWN_ERROR",
            message: "fallback message",
          },
        } as TableauDescribeDatasourceOutput,
        startedAt: "2026-07-03T00:00:00.000Z",
        completedAt: "2026-07-03T00:00:00.005Z",
      });

      expect(result).toEqual(
        expect.objectContaining({
          status: "failed",
          error: expect.objectContaining({
            code: expectedCode,
            message: expect.any(String),
            metadata: expect.objectContaining({
              source: "hosted_mcp_metadata_error_normalizer",
              normalizedCode: expectedCode,
              toolName: request.toolName,
              transportKind: "hosted",
              requestId: request.requestId,
              correlationId: request.correlationId,
              agentRunId: request.agentRunId,
            }),
          }),
          metadata: expect.objectContaining({
            transportKind: "hosted",
            transportStatus: "failed",
            errorCode: expectedCode,
          }),
        }),
      );
      expect(JSON.stringify(result)).not.toContain("raw auth expiry details");
      expect(JSON.stringify(result)).not.toContain("raw DNS details");
      expect(JSON.stringify(result)).not.toContain("raw malformed payload");
      expect(JSON.stringify(result)).not.toContain("accessToken");
      expect(JSON.stringify(result)).not.toContain("rawMcpResponse");
    },
  );

  it("creates JSON-safe trace events", () => {
    const metadata: Record<string, unknown> = {
      createdAt: new Date("2026-07-03T00:00:00.000Z"),
      error: new Error("boom"),
      count: 123n,
      map: new Map([["key", "value"]]),
      set: new Set(["alpha"]),
      rawMcpResult: "suppress-me",
      stack: "suppress-me",
      accessToken: "suppress-me",
    };
    metadata.self = metadata;

    const started = createTableauMetadataToolStartedEvent({
      eventName: "tableau_metadata_tool.started",
      toolName: TABLEAU_METADATA_DESCRIBE_DATASOURCE_TOOL_NAME,
      requestId: "request-1",
      correlationId: "corr-1",
      agentRunId: "agent-1",
      transportKind: "fake",
      fakeNoNetwork: true,
      metadata: metadata as JsonObject,
    });
    const completed = createTableauMetadataToolCompletedEvent({
      eventName: "tableau_metadata_tool.completed",
      toolName: TABLEAU_METADATA_DESCRIBE_DATASOURCE_TOOL_NAME,
      requestId: "request-1",
      correlationId: "corr-1",
      agentRunId: "agent-1",
      transportKind: "fake",
      status: "success",
      durationMs: 10,
      warningCount: 1,
      truncated: false,
      omittedCount: 0,
      fakeNoNetwork: true,
      metadata: metadata as JsonObject,
    });
    const failed = createTableauMetadataToolFailedEvent({
      eventName: "tableau_metadata_tool.failed",
      toolName: TABLEAU_METADATA_LIST_FIELDS_TOOL_NAME,
      requestId: "request-2",
      correlationId: "corr-2",
      agentRunId: "agent-2",
      transportKind: "hosted",
      status: "failed",
      errorCode: "TIMEOUT",
      durationMs: 25,
      warningCount: 0,
      truncated: true,
      omittedCount: 2,
      fakeNoNetwork: false,
      metadata: metadata as JsonObject,
    });

    expect(JSON.stringify(started)).toEqual(JSON.stringify(started));
    expect(JSON.stringify(completed)).toEqual(JSON.stringify(completed));
    expect(JSON.stringify(failed)).toEqual(JSON.stringify(failed));
    expect(JSON.stringify(started)).not.toContain("accessToken");
    expect(JSON.stringify(started)).not.toContain("rawMcpResult");
    expect(JSON.stringify(started)).not.toContain("stack");
    expect(JSON.stringify(completed)).toContain(
      '"eventName":"tableau_metadata_tool.completed"',
    );
    expect(JSON.stringify(failed)).toContain('"errorCode":"TIMEOUT"');
  });
});
