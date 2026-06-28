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
        sourceVersion: "dashboard-context-preview-v1",
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
        worksheetName: "Sales Trend",
        fieldName: "Region",
        filterType: "categorical",
        appliedValues: ["West", "Central"],
        isAllSelected: false,
      },
    ]);
    expect(preview.parameters).toEqual([
      {
        name: "Metric Selector",
        currentValue: "Sales",
        dataType: "string",
        allowableValues: ["Sales", "Profit"],
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

  it("truncates selected marks for preview safety", () => {
    const dashboardContext = createDashboardContext();
    dashboardContext.selectedMarks = Array.from({ length: 12 }, (_, index) => ({
      worksheetName: `Worksheet ${index + 1}`,
      columns: [`Column ${index + 1}`],
      rowCount: index + 1,
      status: "available",
    }));

    const preview = buildContextPreviewModel(dashboardContext);

    expect(preview.selectedMarks.totalCount).toBe(12);
    expect(preview.selectedMarks.truncated).toBe(true);
    expect(preview.selectedMarks.items).toHaveLength(10);
    expect(preview.selectedMarks.items[0]).toMatchObject({
      worksheetName: "Worksheet 1",
    });
    expect(preview.selectedMarks.items[9]).toMatchObject({
      worksheetName: "Worksheet 10",
    });
  });

  it("does not mutate the input dashboard context", () => {
    const dashboardContext = createDashboardContext();
    const snapshot = structuredClone(dashboardContext);

    buildContextPreviewModel(dashboardContext);

    expect(dashboardContext).toEqual(snapshot);
  });
});
