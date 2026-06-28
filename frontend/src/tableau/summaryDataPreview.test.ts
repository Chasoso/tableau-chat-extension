import { describe, expect, it, vi } from "vitest";
import { collectSummaryDataPreview } from "./summaryDataPreview";

function createWorksheet(
  name: string,
  id: string,
  response: unknown,
  shouldThrow = false,
) {
  const getSummaryDataAsync = vi.fn(async () => {
    if (shouldThrow) {
      throw new Error("summary failed");
    }

    return response;
  });

  return {
    worksheet: {
      name,
      id,
      getSummaryDataAsync,
    },
    getSummaryDataAsync,
  };
}

describe("summaryDataPreview", () => {
  it("collects summary data preview for multiple worksheets", async () => {
    const first = createWorksheet("Sales Trend", "worksheet-1", {
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
    });
    const second = createWorksheet("Regional Performance", "worksheet-2", {
      columns: [],
      data: [],
      totalRowCount: 0,
    });

    const previews = await collectSummaryDataPreview(
      [first.worksheet, second.worksheet],
      {
        maxRows: 20,
        maxColumns: 20,
      },
    );

    expect(first.getSummaryDataAsync).toHaveBeenCalledWith({
      maxRows: 20,
      maxColumns: 20,
    });
    expect(previews).toHaveLength(2);
    expect(previews[0]).toMatchObject({
      worksheetName: "Sales Trend",
      worksheetId: "worksheet-1",
      status: "available",
      totalRowCount: 1,
      previewRowCount: 1,
      totalColumnCount: 2,
      previewColumnCount: 2,
      truncated: false,
      maxRows: 20,
      maxColumns: 20,
    });
    expect(previews[0].rows[0]).toMatchObject({
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
    });
    expect(previews[1]).toMatchObject({
      worksheetName: "Regional Performance",
      worksheetId: "worksheet-2",
      status: "empty",
      totalRowCount: 0,
      previewRowCount: 0,
      totalColumnCount: 0,
      previewColumnCount: 0,
      truncated: false,
    });
  });

  it("truncates rows and columns to the configured limits", async () => {
    const worksheet = createWorksheet("Wide Sheet", "worksheet-wide", {
      columns: Array.from({ length: 5 }, (_, index) => ({
        fieldName: `Field ${index + 1}`,
        dataType: "string",
      })),
      data: Array.from({ length: 3 }, (_, rowIndex) =>
        Array.from({ length: 5 }, (_, columnIndex) => ({
          formattedValue: `R${rowIndex + 1}C${columnIndex + 1}`,
          value: `R${rowIndex + 1}C${columnIndex + 1}`,
        })),
      ),
      totalRowCount: 3,
    });

    const [preview] = await collectSummaryDataPreview([worksheet.worksheet], {
      maxRows: 2,
      maxColumns: 2,
    });

    expect(preview).toMatchObject({
      worksheetName: "Wide Sheet",
      status: "available",
      totalRowCount: 3,
      previewRowCount: 2,
      totalColumnCount: 5,
      previewColumnCount: 2,
      truncated: true,
      maxRows: 2,
      maxColumns: 2,
    });
    expect(preview.columns).toEqual([
      {
        name: "Field 1",
        dataType: "string",
      },
      {
        name: "Field 2",
        dataType: "string",
      },
    ]);
    expect(preview.rows).toHaveLength(2);
    expect(preview.rows[0].values).toHaveLength(2);
  });

  it("keeps missing APIs and failures safe", async () => {
    const [missing, failed] = await collectSummaryDataPreview(
      [
        {
          name: "Missing Summary",
          id: "worksheet-missing",
        },
        createWorksheet("Broken Summary", "worksheet-broken", null, true)
          .worksheet,
      ],
      {},
    );

    expect(missing).toMatchObject({
      worksheetName: "Missing Summary",
      worksheetId: "worksheet-missing",
      status: "unavailable",
      errorMessage: "Summary data API is unavailable for this worksheet.",
    });
    expect(failed).toMatchObject({
      worksheetName: "Broken Summary",
      worksheetId: "worksheet-broken",
      status: "unavailable",
      errorMessage: "summary failed",
    });
  });
});
