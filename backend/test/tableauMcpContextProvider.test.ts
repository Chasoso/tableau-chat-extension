import { describe, expect, it } from "vitest";
import {
  extractBestWorkbookId,
  extractWorkbookFromToolResults,
} from "../src/tableau/tableauMcpContextProvider";
import type { TableauMcpToolResultSummary } from "../src/types/tableau";
import type { GetAdditionalContextInput } from "../src/tableau/contextProvider";

const baseInput: GetAdditionalContextInput = {
  question: "Resolve dashboard context",
  dashboardContext: {
    dashboardName: "Statistics",
    worksheets: [{ name: "Views" }, { name: "Favorites" }],
    filters: [],
    parameters: [],
    capturedAt: "2026-05-27T00:00:00.000Z",
  },
  tableauSubject: "user@example.com",
};

describe("TableauMcpContextProvider extraction helpers", () => {
  it("extracts workbook name from search-content parentWorkbookName", () => {
    const toolResults: TableauMcpToolResultSummary[] = [
      {
        toolName: "search-content",
        status: "success",
        summary: JSON.stringify([
          {
            type: "view",
            sheetType: "dashboard",
            title: "Statistics",
            parentWorkbookName: "Tableau Public Insights",
            luid: "8199f5d0-dff2-4d2d-a8ea-4bbef7c5a896",
          },
        ]),
      },
    ];

    expect(extractWorkbookFromToolResults(toolResults, baseInput)).toEqual({
      name: "Tableau Public Insights",
    });
  });

  it("prefers nested workbook id from list-views over the view id", () => {
    const result = {
      content: [
        {
          text: JSON.stringify([
            {
              id: "8199f5d0-dff2-4d2d-a8ea-4bbef7c5a896",
              name: "Statistics",
              workbook: {
                id: "d351b42d-7545-4cbd-bd76-e23410275f1b",
              },
            },
          ]),
        },
      ],
    };

    expect(extractBestWorkbookId(result, "Statistics")).toBe("d351b42d-7545-4cbd-bd76-e23410275f1b");
  });
});
