import { describe, expect, it } from "vitest";
import {
  hasForbiddenRuntimeValue,
  isTableauMetadataJsonSafe,
  type TableauDescribeDatasourceInput,
  type TableauDescribeDatasourceOutput,
  type TableauFieldSummary,
  type TableauListFieldsInput,
  type TableauListFieldsOutput,
  type TableauMetadataDatasourceIdentifier,
  type TableauMetadataErrorSummary,
  type TableauMetadataOmissionSummary,
  type TableauMetadataResolutionSummary,
  type TableauMetadataTruncationSummary,
  type TableauMetadataWarningSummary,
} from "../src/agent";

const datasource: TableauMetadataDatasourceIdentifier = {
  datasourceId: "datasource-1",
  datasourceName: "Sales Datasource",
  workbookId: "workbook-1",
  workbookName: "Sales Workbook",
  projectId: "project-1",
  projectName: "Sales Project",
};

const requestContext = {
  requestId: "req-1",
  correlationId: "corr-1",
  agentRunId: "ar_123",
  site: {
    siteId: "site-1",
    siteName: "Sales Site",
    contentUrl: "sales",
  },
  workbook: {
    workbookId: "workbook-1",
    workbookName: "Sales Workbook",
    projectId: "project-1",
    projectName: "Sales Project",
  },
  view: {
    viewId: "view-1",
    viewName: "Overview",
    workbookId: "workbook-1",
  },
  datasource,
  locale: "en-US",
  maxItems: 25,
  includeHidden: false,
  includeTechnicalMetadata: false,
  metadata: {
    source: "selected_mark_explanation",
  },
};

const resolution: TableauMetadataResolutionSummary = {
  status: "resolved",
  target: "datasource",
  selectedId: "datasource-1",
  selectedName: "Sales Datasource",
  candidates: [
    {
      id: "datasource-1",
      name: "Sales Datasource",
      type: "datasource",
      workbookName: "Sales Workbook",
      confidence: "high",
      metadata: {
        source: "resolved_by_id",
      },
    },
  ],
  message: "Datasource resolved by identifier.",
  metadata: {
    resolver: "metadata-wrapper",
  },
};

const warning: TableauMetadataWarningSummary = {
  code: "OUTPUT_TRUNCATED",
  message: "The metadata summary was truncated to stay within bounds.",
  target: "fields",
  metadata: {
    limit: 25,
  },
};

const error: TableauMetadataErrorSummary = {
  code: "AMBIGUOUS_IDENTIFIER",
  message: "The datasource name matched multiple candidates.",
  retryable: false,
  userActionRequired: true,
  target: "datasource",
  metadata: {
    candidateCount: 2,
  },
};

const truncation: TableauMetadataTruncationSummary = {
  truncated: true,
  limit: 25,
  returned: 25,
  totalAvailable: 87,
  reason: "field_limit",
};

const omission: TableauMetadataOmissionSummary = {
  omitted: true,
  reason: "hidden_by_default",
  message: "Hidden fields were omitted from the default response.",
  count: 4,
};

describe("tableau metadata schemas", () => {
  it("keeps describeDatasource input bounded and JSON-safe", () => {
    const input: TableauDescribeDatasourceInput = {
      requestContext,
      datasource,
      workbook: requestContext.workbook,
      view: requestContext.view,
      site: requestContext.site,
      includeFieldsSummary: true,
      includeConnectionSummary: true,
      maxFieldsForSummary: 12,
    };

    expect(isTableauMetadataJsonSafe(input)).toBe(true);
    expect(JSON.parse(JSON.stringify(input))).toEqual(input);
    expect(hasForbiddenRuntimeValue(input)).toBe(false);
    expect(input.datasource.datasourceId).toBe("datasource-1");
  });

  it("keeps describeDatasource output summary-first, bounded, and JSON-safe", () => {
    const output: TableauDescribeDatasourceOutput = {
      status: "partial",
      summary: {
        datasourceId: "datasource-1",
        datasourceName: "Sales Datasource",
        projectId: "project-1",
        projectName: "Sales Project",
        workbookId: "workbook-1",
        workbookName: "Sales Workbook",
        siteId: "site-1",
        siteName: "Sales Site",
        ownerName: "Analyst",
        connectionType: "postgres",
        isExtract: false,
        fieldCount: 87,
        visibleFieldCount: 83,
        hiddenFieldCount: 4,
        lastUpdatedAt: "2026-07-03T00:00:00.000Z",
        metadata: {
          source: "catalog",
        },
      },
      resolution,
      fieldsSummary: {
        totalFields: 87,
        visibleFields: 83,
        hiddenFields: 4,
        returnedSampleCount: 12,
        sampleFieldNames: ["Customer", "Sales", "Profit"],
        truncated: true,
      },
      connectionSummary: {
        connectionType: "postgres",
        isExtract: false,
        liveOrExtract: "live",
      },
      warnings: [warning],
      error,
      truncation,
      omissions: [omission],
      metadata: {
        source: "tableau.metadata.describeDatasource",
      },
    };

    expect(output.status).toBe("partial");
    expect(output.summary?.datasourceId).toBe("datasource-1");
    expect(output.fieldsSummary?.truncated).toBe(true);
    expect(isTableauMetadataJsonSafe(output)).toBe(true);
    expect(JSON.parse(JSON.stringify(output))).toEqual(output);
    expect(hasForbiddenRuntimeValue(output)).toBe(false);
    expect(JSON.stringify(output)).not.toContain("rawMcpResult");
    expect(JSON.stringify(output)).not.toContain("accessToken");
  });

  it("keeps listFields input bounded and disallows arbitrary query or raw token fields", () => {
    const input: TableauListFieldsInput = {
      requestContext,
      datasource,
      workbook: requestContext.workbook,
      view: requestContext.view,
      site: requestContext.site,
      maxFields: 25,
      includeHidden: false,
      includeTechnicalMetadata: false,
      fieldNameFilter: "Sales",
    };

    expect(isTableauMetadataJsonSafe(input)).toBe(true);
    expect(JSON.parse(JSON.stringify(input))).toEqual(input);
    expect(hasForbiddenRuntimeValue(input)).toBe(false);

    function acceptListFieldsInput(value: TableauListFieldsInput): void {
      void value;
    }

    // @ts-expect-error arbitrary query text is not part of the schema
    acceptListFieldsInput({ datasource, query: "select * from sales" });
    // @ts-expect-error access tokens are not part of the schema
    acceptListFieldsInput({ datasource, accessToken: "secret" });
    // @ts-expect-error raw MCP payloads are not part of the schema
    acceptListFieldsInput({ datasource, rawMcpResult: { rows: [] } });
  });

  it("keeps listFields output field-summary only, bounded, and JSON-safe", () => {
    const fields: TableauFieldSummary[] = [
      {
        fieldId: "field-1",
        fieldName: "Customer",
        caption: "Customer",
        role: "dimension",
        dataType: "string",
        isHidden: false,
        isCalculated: false,
        defaultAggregation: "ATTR",
        semanticRole: "dimension",
        description: "Customer name",
        metadata: {
          source: "metadata-wrapper",
        },
      },
      {
        fieldId: "field-2",
        fieldName: "Sales",
        role: "measure",
        dataType: "number",
        isHidden: false,
        isCalculated: false,
      },
    ];

    const output: TableauListFieldsOutput = {
      status: "success",
      datasource: {
        datasourceId: "datasource-1",
        datasourceName: "Sales Datasource",
        workbookId: "workbook-1",
        workbookName: "Sales Workbook",
        projectId: "project-1",
        projectName: "Sales Project",
        siteId: "site-1",
        siteName: "Sales Site",
        ownerName: "Analyst",
        connectionType: "postgres",
        isExtract: false,
        fieldCount: 87,
        visibleFieldCount: 83,
        hiddenFieldCount: 4,
        lastUpdatedAt: "2026-07-03T00:00:00.000Z",
        metadata: {
          source: "catalog",
        },
      },
      resolution,
      fields,
      fieldCountSummary: {
        returned: 2,
        totalAvailable: 87,
        visibleFields: 83,
        hiddenFields: 4,
      },
      warnings: [warning],
      truncation,
      omissions: [omission],
      metadata: {
        source: "tableau.metadata.listFields",
      },
    };

    expect(output.fields).toHaveLength(2);
    expect(output.fields[0]?.fieldName).toBe("Customer");
    expect(isTableauMetadataJsonSafe(output)).toBe(true);
    expect(JSON.parse(JSON.stringify(output))).toEqual(output);
    expect(hasForbiddenRuntimeValue(output)).toBe(false);
    expect(JSON.stringify(output)).not.toContain("rawMcpResult");
    expect(JSON.stringify(output)).not.toContain("fieldValues");
  });

  it("rejects forbidden runtime values in nested metadata objects", () => {
    expect(hasForbiddenRuntimeValue({ createdAt: new Date() })).toBe(true);
    expect(hasForbiddenRuntimeValue({ values: new Map([["a", 1]]) })).toBe(
      true,
    );
    expect(hasForbiddenRuntimeValue({ values: new Set(["a"]) })).toBe(true);
    expect(hasForbiddenRuntimeValue({ value: 1n })).toBe(true);
  });

  it("keeps the schema free of raw output, secret, and header fields", () => {
    function acceptDescribeOutput(
      value: TableauDescribeDatasourceOutput,
    ): void {
      void value;
    }

    // @ts-expect-error raw rows are not part of the output schema
    acceptDescribeOutput({ status: "success", rawRows: [] });
    // @ts-expect-error raw MCP payloads are not part of the output schema
    acceptDescribeOutput({ status: "success", rawMcpResult: {} });
    // @ts-expect-error tokens are not part of the output schema
    acceptDescribeOutput({ status: "success", accessToken: "secret" });
    // prettier-ignore
    // @ts-expect-error authorization headers are not part of the output schema
    acceptDescribeOutput({ status: "success", authorizationHeader: "Bearer x" });
  });
});
