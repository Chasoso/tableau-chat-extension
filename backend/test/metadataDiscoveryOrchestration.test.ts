import { describe, expect, it } from "vitest";
import {
  type TableauMcpTransport,
  type TableauMcpTransportRequest,
  type TableauMcpTransportResult,
  createAgentRunId,
  runMetadataDiscoveryOrchestration,
} from "../src/agent";

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

describe("metadata discovery orchestration", () => {
  it("routes executable datasource plans to describeDatasource through the hosted boundary", async () => {
    const hostedCalls: TableauMcpTransportRequest[] = [];
    const fallbackCalls: TableauMcpTransportRequest[] = [];
    const hostedTransport = createStubTransport((request) => {
      return {
        requestId: request.requestId,
        transportKind: "hosted",
        status: "success",
        toolName: request.toolName,
        data: {
          status: "success" as const,
          summary: {
            datasourceId: "hosted-datasource",
            datasourceName: "Hosted Datasource",
            workbookId: "hosted-workbook",
            workbookName: "Hosted Workbook",
            siteId: "hosted-site",
            siteName: "Hosted Site",
            connectionType: "hosted",
            isExtract: false,
            fieldCount: 2,
            visibleFieldCount: 2,
            hiddenFieldCount: 0,
          },
          resolution: {
            status: "resolved" as const,
            target: "datasource" as const,
            selectedId: "hosted-datasource",
            selectedName: "Hosted Datasource",
          },
          warnings: [
            {
              code: "TRANSPORT_WARNING" as const,
              message: "hosted transport used",
            },
          ],
          metadata: {
            source: "hosted-test",
          },
        },
        warnings: [
          {
            code: "TRANSPORT_WARNING",
            message: "hosted transport used",
            source: "hosted-test",
          },
        ],
        trace: {
          correlationId: request.correlationId,
          agentRunId: request.agentRunId,
          hostedSessionId: "hosted-session-1",
          transportEventId: "hosted-event-1",
          startedAt: "2026-07-03T00:00:00.000Z",
          completedAt: "2026-07-03T00:00:00.100Z",
          durationMs: 100,
          transportKind: "hosted",
          toolName: request.toolName,
        },
        timing: {
          startedAt: "2026-07-03T00:00:00.000Z",
          completedAt: "2026-07-03T00:00:00.100Z",
          durationMs: 100,
          timeoutMs: request.timeoutMs,
          timedOut: false,
        },
      };
    }, hostedCalls);
    const fallbackTransport = createStubTransport((request) => {
      return {
        requestId: request.requestId,
        transportKind: "fake",
        status: "success",
        toolName: request.toolName,
        data: {
          status: "success" as const,
          summary: {
            datasourceId: "fallback-datasource",
            datasourceName: "Fallback Datasource",
            workbookId: "fallback-workbook",
            workbookName: "Fallback Workbook",
            siteId: "fallback-site",
            siteName: "Fallback Site",
            connectionType: "fake",
            isExtract: false,
            fieldCount: 1,
            visibleFieldCount: 1,
            hiddenFieldCount: 0,
          },
          resolution: {
            status: "resolved" as const,
            target: "datasource" as const,
            selectedId: "fallback-datasource",
            selectedName: "Fallback Datasource",
          },
          metadata: {
            source: "fallback-test",
          },
        },
      };
    }, fallbackCalls);

    const response = await runMetadataDiscoveryOrchestration({
      intentResolutionInput: {
        agentRunId: createAgentRunId(),
        message: "Tell me about this datasource.",
        targetContext: {
          targetType: "datasource",
          identifier: "hosted-datasource",
        },
        metadata: {
          locale: "en-US",
        },
      },
      executionContext: {
        authenticatedUser: {
          userId: "user-1",
          email: "user@example.com",
          tableauSubject: "tableau-1",
        },
        tableauMetadataTransportKind: "hosted",
        tableauMetadataHostedExecutionEnabled: true,
        tableauMetadataNoNetwork: false,
      },
      executionBoundary: {
        transport: fallbackTransport,
        hostedTransport,
      },
    });

    expect(response.status).toBe("completed");
    expect(response.plan.planState).toBe("executable");
    expect(response.execution).toEqual(
      expect.objectContaining({
        toolName: "tableau.metadata.describeDatasource",
        status: "success",
        normalizedOutput: expect.objectContaining({
          status: "success",
          summary: expect.objectContaining({
            datasource: expect.objectContaining({
              datasourceId: "hosted-datasource",
              datasourceName: "Hosted Datasource",
            }),
          }),
        }),
      }),
    );
    expect(hostedCalls).toHaveLength(1);
    expect(fallbackCalls).toHaveLength(0);
    expect(response.placeholderResponse).toContain("Hosted Datasource");
    expect(JSON.stringify(response)).not.toContain("rawMcp");
    expect(JSON.stringify(response)).not.toContain("accessToken");
    expect(JSON.stringify(response)).not.toContain("secret");
  });

  it("keeps hosted execution behind the feature flag and falls back safely", async () => {
    const hostedCalls: TableauMcpTransportRequest[] = [];
    const fallbackCalls: TableauMcpTransportRequest[] = [];
    const hostedTransport = createStubTransport((request) => {
      return {
        requestId: request.requestId,
        transportKind: "hosted",
        status: "success",
        toolName: request.toolName,
        data: {},
      };
    }, hostedCalls);
    const fallbackTransport = createStubTransport((request) => {
      return {
        requestId: request.requestId,
        transportKind: "fake",
        status: "success",
        toolName: request.toolName,
        data: {
          status: "success" as const,
          summary: {
            datasourceId: "fallback-datasource",
            datasourceName: "Fallback Datasource",
            workbookId: "fallback-workbook",
            workbookName: "Fallback Workbook",
            siteId: "fallback-site",
            siteName: "Fallback Site",
            connectionType: "fake",
            isExtract: false,
            fieldCount: 1,
            visibleFieldCount: 1,
            hiddenFieldCount: 0,
          },
          resolution: {
            status: "resolved" as const,
            target: "datasource" as const,
            selectedId: "fallback-datasource",
            selectedName: "Fallback Datasource",
          },
          metadata: {
            source: "fallback-test",
          },
        },
      };
    }, fallbackCalls);

    const response = await runMetadataDiscoveryOrchestration({
      intentResolutionInput: {
        agentRunId: createAgentRunId(),
        message: "Tell me about this datasource.",
        targetContext: {
          targetType: "datasource",
          identifier: "fallback-datasource",
        },
      },
      executionContext: {
        tableauMetadataTransportKind: "hosted",
        tableauMetadataHostedExecutionEnabled: false,
        tableauMetadataNoNetwork: false,
      },
      executionBoundary: {
        transport: fallbackTransport,
        hostedTransport,
      },
    });

    expect(response.status).toBe("completed");
    expect(response.plan.planState).toBe("executable");
    expect(response.execution?.normalizedOutput.status).toBe("success");
    expect(hostedCalls).toHaveLength(0);
    expect(fallbackCalls).toHaveLength(1);
    expect(response.execution?.normalizedOutput.summary).toEqual(
      expect.objectContaining({
        datasource: expect.objectContaining({
          datasourceId: "fallback-datasource",
        }),
      }),
    );
  });

  it("returns a clarification plan without executing when the target is incomplete", async () => {
    const hostedCalls: TableauMcpTransportRequest[] = [];
    const fallbackCalls: TableauMcpTransportRequest[] = [];
    const hostedTransport = createStubTransport((request) => {
      return {
        requestId: request.requestId,
        transportKind: "hosted",
        status: "success",
        toolName: request.toolName,
        data: {},
      };
    }, hostedCalls);
    const fallbackTransport = createStubTransport((request) => {
      return {
        requestId: request.requestId,
        transportKind: "fake",
        status: "success",
        toolName: request.toolName,
        data: {},
      };
    }, fallbackCalls);

    const response = await runMetadataDiscoveryOrchestration({
      intentResolutionInput: {
        agentRunId: createAgentRunId(),
        message: "Tell me about this datasource.",
        targetContext: {
          targetType: "datasource",
        },
      },
      executionBoundary: {
        transport: fallbackTransport,
        hostedTransport,
      },
    });

    expect(response.status).toBe("clarification_required");
    expect(response.plan.planState).toBe("clarification_required");
    expect(response.execution).toBeUndefined();
    expect(hostedCalls).toHaveLength(0);
    expect(fallbackCalls).toHaveLength(0);
    expect(response.placeholderResponse).toContain("datasource");
  });

  it("returns an unsupported plan without executing unsafe requests", async () => {
    const hostedCalls: TableauMcpTransportRequest[] = [];
    const fallbackCalls: TableauMcpTransportRequest[] = [];
    const hostedTransport = createStubTransport((request) => {
      return {
        requestId: request.requestId,
        transportKind: "hosted",
        status: "success",
        toolName: request.toolName,
        data: {},
      };
    }, hostedCalls);
    const fallbackTransport = createStubTransport((request) => {
      return {
        requestId: request.requestId,
        transportKind: "fake",
        status: "success",
        toolName: request.toolName,
        data: {},
      };
    }, fallbackCalls);

    const response = await runMetadataDiscoveryOrchestration({
      intentResolutionInput: {
        agentRunId: createAgentRunId(),
        message: "Update the workbook and show me the row values.",
        targetContext: {
          targetType: "datasource",
          identifier: "unsafe-datasource",
        },
      },
      executionBoundary: {
        transport: fallbackTransport,
        hostedTransport,
      },
    });

    expect(response.status).toBe("unsupported");
    expect(response.plan.planState).toBe("unsupported");
    expect(response.execution).toBeUndefined();
    expect(hostedCalls).toHaveLength(0);
    expect(fallbackCalls).toHaveLength(0);
    expect(response.placeholderResponse).toContain("metadata discovery");
  });
});
