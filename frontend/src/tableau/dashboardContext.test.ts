import { describe, expect, it } from "vitest";
import { getDashboardContext } from "./dashboardContext";

describe("dashboardContext", () => {
  it("normalizes selected mark rows and summary data preview with mixed cell value types", async () => {
    const dashboard = {
      name: "Sales Dashboard",
      workbook: {
        name: "Sales Workbook",
      },
      worksheets: [
        {
          name: "Sales Trend",
          sheetType: "worksheet",
          getSummaryDataAsync: async () => ({
            columns: [
              { fieldName: "Region", dataType: "string" },
              { fieldName: "Sales", dataType: "number" },
            ],
            data: [
              [
                { formattedValue: "West", value: "West" },
                { formattedValue: "1200", value: 1200 },
              ],
            ],
            totalRowCount: 1,
          }),
          getSelectedMarksAsync: async () => ({
            data: [
              {
                columns: [
                  { fieldName: "Region" },
                  { fieldName: "Sales" },
                  { fieldName: "Target" },
                  { fieldName: "Updated At" },
                ],
                data: [
                  [
                    { formattedValue: "West", value: "West" },
                    { formattedValue: "1200", value: 1200 },
                    { formattedValue: "true", value: true },
                    {
                      formattedValue: "2026-06-07T00:00:00.000Z",
                      value: new Date("2026-06-07T00:00:00.000Z"),
                    },
                  ],
                ],
              },
            ],
          }),
        },
      ],
    };

    const context = await getDashboardContext(dashboard as never, {
      referrer: "https://example.com/views/SalesWorkbook/Sales%20Dashboard",
    });

    expect(context.selectedMarks).toEqual([
      {
        worksheetName: "Sales Trend",
        columns: ["Region", "Sales", "Target", "Updated At"],
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
        ],
        rowCount: 1,
        status: "available",
      },
    ]);
    expect(context.summaryDataPreview).toBeDefined();
    const summaryDataPreview = context.summaryDataPreview?.[0];
    if (!summaryDataPreview) {
      throw new Error("summaryDataPreview was not generated");
    }
    expect(summaryDataPreview).toMatchObject({
      worksheetName: "Sales Trend",
      worksheetId: null,
      columns: [
        {
          name: "Region",
          dataType: "string",
        },
        {
          name: "Sales",
          dataType: "number",
        },
      ],
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
          ],
        },
      ],
      maxRows: 20,
      maxColumns: 20,
      totalRowCount: 1,
      previewRowCount: 1,
      totalColumnCount: 2,
      previewColumnCount: 2,
      truncated: false,
      status: "available",
    });
    expect(summaryDataPreview.generatedAt).toEqual(expect.any(String));
    expect(summaryDataPreview.updatedAt).toEqual(expect.any(String));
  });
});
