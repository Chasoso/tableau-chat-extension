import { describe, expect, it } from "vitest";
import { buildContextPreviewModel } from "./contextPreview";
import type { DashboardContext } from "../types/tableau";

function createDashboardContext(): DashboardContext {
  return {
    dashboardName: "Executive Overview",
    workbookName: "Sales Workbook",
    workbookId: "workbook-1",
    workbookContentUrl: "sales-workbook",
    viewName: "Executive Overview",
    viewId: "view-1",
    worksheets: [
      {
        name: "Sales Trend",
        sheetType: "worksheet",
        size: {
          width: 1200,
          height: 800,
        },
        summary: "Monthly sales trend",
      },
    ],
    filters: [
      {
        worksheetName: "Sales Trend",
        fieldName: "Region",
        filterType: "categorical",
        appliedValues: ["West", "Central"],
        isAllSelected: false,
      },
    ],
    parameters: [
      {
        name: "Metric Selector",
        currentValue: "Sales",
        dataType: "string",
        allowableValues: ["Sales", "Profit"],
      },
    ],
    selectedMarks: [
      {
        worksheetName: "Sales Trend",
        columns: ["Region", "Sales"],
        rowCount: 2,
        status: "available",
      },
      {
        worksheetName: "Regional Performance",
        columns: ["Region"],
        rowCount: 1,
        status: "notAvailable",
      },
    ],
    dataSources: [
      {
        worksheetName: "Sales Trend",
        name: "Superstore",
        id: "ds-1",
        fields: ["Region", "Sales"],
        fieldsAvailability: "available",
      },
    ],
    availability: {
      workbookId: "available",
      viewId: "not_implemented",
      datasourceFields: "available",
    },
    contextSource: "tableau-extension",
    contextWarning: "Live context may be incomplete.",
    capturedAt: "2026-06-07T00:00:00.000Z",
  };
}

describe("contextPreview", () => {
  it("builds a preview model from a populated dashboard context", () => {
    const dashboardContext = createDashboardContext();

    const preview = buildContextPreviewModel(dashboardContext);

    expect(preview).toMatchObject({
      previewVersion: "v1",
      generatedAt: "2026-06-07T00:00:00.000Z",
      dashboard: {
        name: "Executive Overview",
      },
      workbook: {
        name: "Sales Workbook",
        id: "workbook-1",
        contentUrl: "sales-workbook",
      },
      view: {
        name: "Executive Overview",
        id: "view-1",
      },
      selectedMarks: {
        totalCount: 2,
        limit: 10,
        truncated: false,
      },
      summaryDataPreview: {
        status: "notCollected",
      },
      lastChangedWorksheet: null,
      availability: {
        status: "available",
        workbookId: "available",
        viewId: "not_implemented",
        datasourceFields: "available",
      },
      warnings: ["Live context may be incomplete."],
      metadata: {
        sourceKind: "tableau-extension",
        sourceVersion: "dashboard-context-preview-v2",
        generatedFrom: "dashboardContext",
      },
    });

    expect(preview.worksheets).toEqual([
      {
        name: "Sales Trend",
        sheetType: "worksheet",
        size: {
          width: 1200,
          height: 800,
        },
        summary: "Monthly sales trend",
      },
    ]);
    expect(preview.filters).toEqual([
      {
        status: "available",
        worksheetName: "Sales Trend",
        fieldName: "Region",
        filterType: "categorical",
        appliedValues: {
          items: ["West", "Central"],
          totalCount: 2,
          limit: 10,
          truncated: false,
        },
        isAllSelected: false,
      },
    ]);
    expect(preview.parameters).toEqual([
      {
        status: "available",
        name: "Metric Selector",
        currentValue: {
          raw: "Sales",
          display: "Sales",
          isEmpty: false,
        },
        dataType: "string",
        allowableValues: {
          items: ["Sales", "Profit"],
          totalCount: 2,
          limit: 10,
          truncated: false,
        },
      },
    ]);
    expect(preview.selectedMarks.items).toEqual([
      {
        worksheetName: "Sales Trend",
        columns: ["Region", "Sales"],
        rowCount: 2,
        status: "available",
      },
      {
        worksheetName: "Regional Performance",
        columns: ["Region"],
        rowCount: 1,
        status: "notAvailable",
      },
    ]);
    expect(preview.dataSources).toEqual([
      {
        worksheetName: "Sales Trend",
        name: "Superstore",
        id: "ds-1",
        fields: ["Region", "Sales"],
        fieldsAvailability: "available",
      },
    ]);
  });

  it("keeps empty or missing context safe", () => {
    const preview = buildContextPreviewModel({
      dashboardName: "Empty Dashboard",
      worksheets: [],
      filters: [],
      parameters: [],
      selectedMarks: [],
      dataSources: [],
      capturedAt: "2026-06-07T00:00:00.000Z",
    } as DashboardContext);

    expect(preview.dashboard).toEqual({
      name: "Empty Dashboard",
    });
    expect(preview.filters).toEqual([]);
    expect(preview.parameters).toEqual([]);
    expect(preview.selectedMarks).toEqual({
      status: "empty",
      items: [],
      totalCount: 0,
      limit: 10,
      truncated: false,
    });
    expect(preview.summaryDataPreview).toEqual({
      status: "notCollected",
      note: "Summary data preview has not been collected yet.",
    });
    expect(preview.lastChangedWorksheet).toBeNull();
    expect(preview.warnings).toEqual([
      "Context preview is not using a live Tableau Extension source.",
      "Workbook name is missing from the dashboard context.",
    ]);
  });

  it("truncates selected marks and preview value lists for safety", () => {
    const dashboardContext = createDashboardContext();
    dashboardContext.selectedMarks = Array.from({ length: 12 }, (_, index) => ({
      worksheetName: `Worksheet ${index + 1}`,
      columns: [`Column ${index + 1}`],
      rowCount: index + 1,
      status: "available",
    }));
    dashboardContext.filters = [
      {
        worksheetName: "Sales Trend",
        fieldName: "Region",
        filterType: "categorical",
        appliedValues: Array.from(
          { length: 12 },
          (_, index) => `Region ${index + 1}`,
        ),
        isAllSelected: false,
      },
    ];
    dashboardContext.parameters = [
      {
        name: "Long Parameter",
        currentValue: true,
        dataType: "boolean",
        allowableValues: Array.from(
          { length: 12 },
          (_, index) => `Value ${index + 1}`,
        ),
      },
    ];

    const preview = buildContextPreviewModel(dashboardContext);

    expect(preview.selectedMarks.totalCount).toBe(12);
    expect(preview.selectedMarks.truncated).toBe(true);
    expect(preview.selectedMarks.status).toBe("available");
    expect(preview.selectedMarks.items).toHaveLength(10);
    expect(preview.selectedMarks.items[0]).toMatchObject({
      worksheetName: "Worksheet 1",
    });
    expect(preview.selectedMarks.items[9]).toMatchObject({
      worksheetName: "Worksheet 10",
    });
    expect(preview.filters[0]).toMatchObject({
      status: "available",
      appliedValues: {
        items: [
          "Region 1",
          "Region 2",
          "Region 3",
          "Region 4",
          "Region 5",
          "Region 6",
          "Region 7",
          "Region 8",
          "Region 9",
          "Region 10",
        ],
        totalCount: 12,
        limit: 10,
        truncated: true,
      },
    });
    expect(preview.parameters[0]).toMatchObject({
      status: "available",
      currentValue: {
        raw: true,
        display: "true",
        isEmpty: false,
      },
      allowableValues: {
        items: [
          "Value 1",
          "Value 2",
          "Value 3",
          "Value 4",
          "Value 5",
          "Value 6",
          "Value 7",
          "Value 8",
          "Value 9",
          "Value 10",
        ],
        totalCount: 12,
        limit: 10,
        truncated: true,
      },
    });
  });

  it("formats parameter current values across scalar types", () => {
    const dashboardContext = createDashboardContext();
    dashboardContext.parameters = [
      {
        name: "String Param",
        currentValue: "Sales",
        dataType: "string",
      },
      {
        name: "Number Param",
        currentValue: 42,
        dataType: "number",
      },
      {
        name: "Boolean Param",
        currentValue: false,
        dataType: "boolean",
      },
      {
        name: "Null Param",
        currentValue: null,
        dataType: "string",
      },
    ];

    const preview = buildContextPreviewModel(dashboardContext);

    expect(preview.parameters).toEqual([
      {
        status: "available",
        name: "String Param",
        currentValue: {
          raw: "Sales",
          display: "Sales",
          isEmpty: false,
        },
        dataType: "string",
        allowableValues: {
          items: [],
          totalCount: 0,
          limit: 10,
          truncated: false,
        },
      },
      {
        status: "available",
        name: "Number Param",
        currentValue: {
          raw: 42,
          display: "42",
          isEmpty: false,
        },
        dataType: "number",
        allowableValues: {
          items: [],
          totalCount: 0,
          limit: 10,
          truncated: false,
        },
      },
      {
        status: "available",
        name: "Boolean Param",
        currentValue: {
          raw: false,
          display: "false",
          isEmpty: false,
        },
        dataType: "boolean",
        allowableValues: {
          items: [],
          totalCount: 0,
          limit: 10,
          truncated: false,
        },
      },
      {
        status: "empty",
        name: "Null Param",
        currentValue: {
          raw: null,
          display: "Not set",
          isEmpty: true,
        },
        dataType: "string",
        allowableValues: {
          items: [],
          totalCount: 0,
          limit: 10,
          truncated: false,
        },
      },
    ]);
  });

  it("does not mutate the input dashboard context", () => {
    const dashboardContext = createDashboardContext();
    const snapshot = structuredClone(dashboardContext);

    buildContextPreviewModel(dashboardContext);

    expect(dashboardContext).toEqual(snapshot);
  });
});
