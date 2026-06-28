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
        columns: ["Region", "Sales", "Target", "Updated At"],
        rowCount: 2,
        rows: [
          {
            values: [
              {
                fieldName: "Region",
                raw: "West",
                display: "West",
                isEmpty: false,
              },
              {
                fieldName: "Sales",
                raw: 1200,
                display: "1200",
                isEmpty: false,
              },
              {
                fieldName: "Target",
                raw: true,
                display: "true",
                isEmpty: false,
              },
              {
                fieldName: "Updated At",
                raw: "2026-06-07T00:00:00.000Z",
                display: "2026-06-07T00:00:00.000Z",
                isEmpty: false,
              },
            ],
          },
          {
            values: [
              {
                fieldName: "Region",
                raw: null,
                display: "Not set",
                isEmpty: true,
              },
              {
                fieldName: "Sales",
                raw: 0,
                display: "0",
                isEmpty: false,
              },
              {
                fieldName: "Target",
                raw: false,
                display: "false",
                isEmpty: false,
              },
              {
                fieldName: "Updated At",
                raw: "2026-06-07T12:34:56.000Z",
                display: "2026-06-07T12:34:56.000Z",
                isEmpty: false,
              },
            ],
          },
        ],
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
        status: "available",
        totalCount: 2,
        previewCount: 2,
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
    expect(preview.selectedMarks.items[0]).toEqual({
      worksheetName: "Sales Trend",
      columns: ["Region", "Sales", "Target", "Updated At"],
      columnCount: 4,
      rowCount: 2,
      previewRowCount: 2,
      rows: [
        {
          values: [
            {
              fieldName: "Region",
              raw: "West",
              display: "West",
              isEmpty: false,
            },
            {
              fieldName: "Sales",
              raw: 1200,
              display: "1200",
              isEmpty: false,
            },
            {
              fieldName: "Target",
              raw: true,
              display: "true",
              isEmpty: false,
            },
            {
              fieldName: "Updated At",
              raw: "2026-06-07T00:00:00.000Z",
              display: "2026-06-07T00:00:00.000Z",
              isEmpty: false,
            },
          ],
        },
        {
          values: [
            {
              fieldName: "Region",
              raw: null,
              display: "Not set",
              isEmpty: true,
            },
            {
              fieldName: "Sales",
              raw: 0,
              display: "0",
              isEmpty: false,
            },
            {
              fieldName: "Target",
              raw: false,
              display: "false",
              isEmpty: false,
            },
            {
              fieldName: "Updated At",
              raw: "2026-06-07T12:34:56.000Z",
              display: "2026-06-07T12:34:56.000Z",
              isEmpty: false,
            },
          ],
        },
      ],
      status: "available",
      truncated: false,
    });
    expect(preview.selectedMarks.items[1]).toEqual({
      worksheetName: "Regional Performance",
      columns: ["Region"],
      columnCount: 1,
      rowCount: 1,
      previewRowCount: 0,
      rows: [],
      status: "notAvailable",
      truncated: true,
    });
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

  it("keeps empty or missing selected marks safe", () => {
    const preview = buildContextPreviewModel({
      dashboardName: "Empty Dashboard",
      worksheets: [],
      filters: [],
      parameters: [],
      dataSources: [],
      capturedAt: "2026-06-07T00:00:00.000Z",
    } as DashboardContext);

    expect(preview.selectedMarks).toEqual({
      status: "unavailable",
      items: [],
      totalCount: 0,
      previewCount: 0,
      limit: 10,
      truncated: false,
    });
    expect(preview.summaryDataPreview).toEqual({
      status: "notCollected",
      note: "Summary data preview has not been collected yet.",
    });
    expect(preview.lastChangedWorksheet).toBeNull();
  });

  it("treats an empty selected mark array as a valid empty state", () => {
    const preview = buildContextPreviewModel({
      ...createDashboardContext(),
      selectedMarks: [],
    });

    expect(preview.selectedMarks).toEqual({
      status: "empty",
      items: [],
      totalCount: 0,
      previewCount: 0,
      limit: 10,
      truncated: false,
    });
  });

  it("propagates last changed worksheet metadata into the preview model", () => {
    const preview = buildContextPreviewModel(createDashboardContext(), {
      lastChangedWorksheet: {
        worksheetName: "Sales Trend",
        worksheetId: "worksheet-1",
        changedAt: "2026-06-07T01:23:45.000Z",
        source: "selection",
      },
    });

    expect(preview.lastChangedWorksheet).toEqual({
      worksheetName: "Sales Trend",
      worksheetId: "worksheet-1",
      changedAt: "2026-06-07T01:23:45.000Z",
      source: "selection",
    });
  });

  it("truncates selected marks and selected rows for preview safety", () => {
    const dashboardContext = createDashboardContext();
    dashboardContext.selectedMarks = Array.from({ length: 12 }, (_, index) => ({
      worksheetName: `Worksheet ${index + 1}`,
      columns: [`Column ${index + 1}`],
      rowCount: 2,
      rows: [
        {
          values: [
            {
              fieldName: `Column ${index + 1}`,
              raw: `Value ${index + 1}`,
              display: `Value ${index + 1}`,
              isEmpty: false,
            },
          ],
        },
        {
          values: [
            {
              fieldName: `Column ${index + 1}`,
              raw: index + 1,
              display: String(index + 1),
              isEmpty: false,
            },
          ],
        },
      ],
      status: "available",
    }));

    const preview = buildContextPreviewModel(dashboardContext, {
      selectedMarkLimit: 10,
      selectedMarkRowLimit: 1,
    });

    expect(preview.selectedMarks.totalCount).toBe(12);
    expect(preview.selectedMarks.previewCount).toBe(10);
    expect(preview.selectedMarks.truncated).toBe(true);
    expect(preview.selectedMarks.status).toBe("available");
    expect(preview.selectedMarks.items).toHaveLength(10);
    expect(preview.selectedMarks.items[0]).toMatchObject({
      worksheetName: "Worksheet 1",
      previewRowCount: 1,
      truncated: true,
      rows: [
        {
          values: [
            {
              fieldName: "Column 1",
              raw: "Value 1",
              display: "Value 1",
              isEmpty: false,
            },
          ],
        },
      ],
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
