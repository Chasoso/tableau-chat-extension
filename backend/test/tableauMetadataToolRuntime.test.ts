import { describe, expect, it } from "vitest";
import {
  type JsonObject,
  createTableauMetadataToolRegistry,
  createTableauMetadataToolRuntime,
  createSelectedMarkExplanationContextToolRegistry,
  TABLEAU_METADATA_DESCRIBE_DATASOURCE_TOOL_NAME,
  TABLEAU_METADATA_LIST_FIELDS_TOOL_NAME,
} from "../src/agent";

function createFakeRuntimeContext(preconditionInput?: JsonObject): JsonObject {
  return {
    tableauMetadataTransportKind: "fake",
    tableauMetadataPreconditionInput: {
      authenticatedTableauContext: {
        isAuthenticated: true,
        authMode: "fake",
      },
      siteSettings: {
        status: "not_required_for_fake",
        source: "fake",
      },
      transportConfig: {
        selectedTransportKind: "fake",
        status: "selected",
        noNetwork: true,
      },
      permission: {
        status: "not_verified",
      },
      ...(preconditionInput ?? {}),
    },
  };
}

describe("Tableau metadata tool runtime", () => {
  it("registers read-only metadata tools without raw MCP names", () => {
    const registry = createTableauMetadataToolRegistry();

    const describeLookup = registry.lookup(
      TABLEAU_METADATA_DESCRIBE_DATASOURCE_TOOL_NAME,
    );
    const listLookup = registry.lookup(TABLEAU_METADATA_LIST_FIELDS_TOOL_NAME);
    const listedNames = registry.list().tools.map((tool) => tool.name);

    expect(describeLookup.status).toBe("found");
    expect(listLookup.status).toBe("found");
    expect(listedNames).toEqual([
      TABLEAU_METADATA_DESCRIBE_DATASOURCE_TOOL_NAME,
      TABLEAU_METADATA_LIST_FIELDS_TOOL_NAME,
    ]);
    expect(listedNames).not.toContain(
      "tableau.metadata.describeDatasource.raw",
    );
    expect(listedNames).not.toContain("tableau.metadata.listFields.raw");
  });

  it("returns safe fake describeDatasource output without network access", async () => {
    const runtime = createTableauMetadataToolRuntime();
    const result = await runtime.executionWrapper.execute({
      toolName: TABLEAU_METADATA_DESCRIBE_DATASOURCE_TOOL_NAME,
      input: {
        datasource: {
          datasourceId: "sales-datasource",
          datasourceName: "Sales Datasource",
        },
        workbook: {
          workbookId: "workbook-1",
          workbookName: "Sales Workbook",
        },
        site: {
          siteId: "site-1",
          siteName: "Sales Site",
        },
      },
      context: createFakeRuntimeContext(),
    });

    expect(result.status).toBe("completed");
    expect(result.output).toEqual(
      expect.objectContaining({
        status: "success",
        summary: expect.objectContaining({
          datasourceId: "sales-datasource",
          datasourceName: "Sales Datasource",
          workbookId: "workbook-1",
          siteId: "site-1",
          connectionType: "fake",
        }),
        resolution: expect.objectContaining({
          status: "resolved",
          target: "datasource",
        }),
        warnings: expect.arrayContaining([
          expect.objectContaining({
            code: "TRANSPORT_WARNING",
          }),
        ]),
      }),
    );
    expect(JSON.stringify(result.output)).not.toContain("accessToken");
    expect(JSON.stringify(result.output)).not.toContain("rawMcpResult");
    expect(JSON.stringify(result.output)).not.toContain("secret");
  });

  it("returns safe fake listFields output with truncation and omission signals", async () => {
    const runtime = createTableauMetadataToolRuntime();
    const result = await runtime.executionWrapper.execute({
      toolName: TABLEAU_METADATA_LIST_FIELDS_TOOL_NAME,
      input: {
        datasource: {
          datasourceId: "sales-datasource",
          datasourceName: "Sales Datasource",
        },
        maxFields: 1,
        includeHidden: false,
        fieldNameFilter: "a",
      },
      context: createFakeRuntimeContext(),
    });

    expect(result.status).toBe("completed");
    expect(result.output).toEqual(
      expect.objectContaining({
        status: "success",
        datasource: expect.objectContaining({
          datasourceId: "sales-datasource",
          connectionType: "fake",
        }),
        fieldCountSummary: expect.objectContaining({
          returned: 1,
        }),
        warnings: expect.arrayContaining([
          expect.objectContaining({
            code: "TRANSPORT_WARNING",
          }),
        ]),
      }),
    );
    expect(JSON.stringify(result.output)).not.toContain("rawMcpResult");
    expect(JSON.stringify(result.output)).not.toContain("values");
    expect(JSON.stringify(result.output)).toContain("field_limit");
  });

  it("fails safely when a datasource identifier is missing", async () => {
    const runtime = createTableauMetadataToolRuntime();
    const result = await runtime.executionWrapper.execute({
      toolName: TABLEAU_METADATA_DESCRIBE_DATASOURCE_TOOL_NAME,
      input: {},
      context: createFakeRuntimeContext(),
    });

    expect(result.status).toBe("completed");
    expect(result.output).toEqual(
      expect.objectContaining({
        status: "failed",
        error: expect.objectContaining({
          code: "MISSING_REQUIRED_IDENTIFIER",
        }),
      }),
    );
  });

  it("fails safely when a datasource identifier is ambiguous", async () => {
    const runtime = createTableauMetadataToolRuntime();
    const result = await runtime.executionWrapper.execute({
      toolName: TABLEAU_METADATA_LIST_FIELDS_TOOL_NAME,
      input: {
        datasource: {
          datasourceName: "Shared Datasource",
        },
      },
      context: createFakeRuntimeContext({
        identifierResolution: {
          datasource: {
            status: "ambiguous",
            target: "datasource",
            candidates: [
              {
                id: "candidate-1",
                name: "Candidate One",
                type: "datasource",
              },
            ],
            message: "Multiple datasources match this request.",
          },
        },
      }),
    });

    expect(result.status).toBe("completed");
    expect(result.output).toEqual(
      expect.objectContaining({
        status: "failed",
        error: expect.objectContaining({
          code: "AMBIGUOUS_IDENTIFIER",
        }),
      }),
    );
  });

  it("continues to expose selected_mark_explanation context tools", () => {
    const registry = createSelectedMarkExplanationContextToolRegistry();

    expect(registry.lookup("context.selectedMarks").status).toBe("found");
    expect(registry.lookup("context.summaryDataPreview").status).toBe("found");
    expect(registry.lookup("context.filters").status).toBe("found");
    expect(registry.lookup("context.parameters").status).toBe("found");
  });
});
