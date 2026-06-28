import { describe, expect, it } from "vitest";
import { getDashboardContext } from "./dashboardContext";

describe("dashboardContext", () => {
  it("normalizes selected mark rows with mixed cell value types", async () => {
    const dashboard = {
      name: "Sales Dashboard",
      workbook: {
        name: "Sales Workbook",
      },
      worksheets: [
        {
          name: "Sales Trend",
          sheetType: "worksheet",
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
  });
});
