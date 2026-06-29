import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import AIContextPreviewPanel from "./AIContextPreviewPanel";
import type { ContextPreviewModel } from "../tableau/contextPreview";

function createPreviewModel(): ContextPreviewModel {
  return {
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
    worksheets: [
      {
        name: "Sales Trend",
        sheetType: "worksheet",
        summary: "Monthly sales trend",
      },
    ],
    filters: [
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
    ],
    parameters: [
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
    ],
    selectedMarks: {
      status: "available",
      items: [
        {
          worksheetName: "Sales Trend",
          columns: ["Region", "Sales"],
          columnCount: 2,
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
              ],
            },
          ],
          status: "available",
          truncated: false,
        },
      ],
      totalCount: 1,
      previewCount: 1,
      limit: 10,
      truncated: false,
    },
    dataSources: [],
    summaryDataPreview: {
      status: "available",
      generatedAt: "2026-06-07T00:00:00.000Z",
      updatedAt: "2026-06-07T00:00:00.000Z",
      maxRows: 20,
      maxColumns: 20,
      totalWorksheetCount: 1,
      previewWorksheetCount: 1,
      truncated: false,
      items: [
        {
          worksheetName: "Sales Trend",
          worksheetId: "worksheet-1",
          columns: [
            { name: "Region", dataType: "string" },
            { name: "Sales", dataType: "number" },
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
          generatedAt: "2026-06-07T00:00:00.000Z",
          updatedAt: "2026-06-07T00:00:00.000Z",
        },
      ],
    },
    lastChangedWorksheet: {
      worksheetName: "Sales Trend",
      worksheetId: "worksheet-1",
      changedAt: "2026-06-07T01:23:45.000Z",
      source: "selection",
    },
    availability: {
      status: "available",
      workbookId: "available",
      viewId: "not_implemented",
      datasourceFields: "available",
    },
    actionSuggestions: [
      {
        id: "explain_selection",
        label: "この選択を説明",
        intent: "selected_mark_explanation",
        enabled: true,
        description: "1件の選択マーク・1件をプレビュー表示",
        source: "selectedMarks",
        prompt: "この選択を説明してください。",
        selectedMarkCount: 1,
        previewCount: 1,
        truncated: false,
      },
    ],
    warnings: ["Live context may be incomplete."],
    metadata: {
      sourceKind: "tableau-extension",
      sourceVersion: "dashboard-context-preview-v2",
      generatedFrom: "dashboardContext",
    },
  };
}

describe("AIContextPreviewPanel", () => {
  it("renders the main preview sections", () => {
    render(<AIContextPreviewPanel preview={createPreviewModel()} />);

    expect(
      screen.getByRole("heading", { name: "AI Context Preview", level: 2 }),
    ).toBeInTheDocument();
    expect(screen.getByText("Overview")).toBeInTheDocument();
    expect(screen.getByText("Worksheets")).toBeInTheDocument();
    expect(screen.getByText("Filters")).toBeInTheDocument();
    expect(screen.getByText("Parameters")).toBeInTheDocument();
    expect(screen.getByText("Selected Marks")).toBeInTheDocument();
    expect(screen.getByText("Summary Data Preview")).toBeInTheDocument();
    expect(screen.getByText("Suggested Actions")).toBeInTheDocument();
    expect(screen.getByText("Availability / Warnings")).toBeInTheDocument();
    expect(screen.getAllByText("Executive Overview").length).toBeGreaterThan(1);
    expect(screen.getAllByText("Sales Trend").length).toBeGreaterThan(0);
    expect(screen.getByText("Region: West · Sales: 1200")).toBeInTheDocument();
    expect(
      screen.getByText("Live context may be incomplete."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "この選択を説明" }),
    ).toBeEnabled();
    expect(
      screen.getByText((content) =>
        content.includes("2026-06-07T01:23:45.000Z"),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("2026-06-07T00:00:00.000Z").length,
    ).toBeGreaterThan(0);
  });

  it("renders empty and unavailable states safely", () => {
    render(
      <AIContextPreviewPanel
        preview={{
          ...createPreviewModel(),
          filters: [],
          parameters: [],
          selectedMarks: {
            status: "empty",
            items: [],
            totalCount: 0,
            previewCount: 0,
            limit: 10,
            truncated: false,
          },
          summaryDataPreview: {
            status: "unavailable",
            generatedAt: null,
            updatedAt: null,
            maxRows: 20,
            maxColumns: 20,
            totalWorksheetCount: 0,
            previewWorksheetCount: 0,
            truncated: false,
            items: [],
            note: "Summary data preview is unavailable.",
          },
          actionSuggestions: [
            {
              id: "explain_selection",
              label: "この選択を説明",
              intent: "selected_mark_explanation",
              enabled: false,
              reason: "マークが選択されていません。",
              source: "selectedMarks",
              prompt: "この選択を説明してください。",
            },
          ],
          warnings: [],
          lastChangedWorksheet: null,
        }}
      />,
    );

    expect(screen.getByText("No filters")).toBeInTheDocument();
    expect(screen.getByText("No parameters")).toBeInTheDocument();
    expect(screen.getByText("No selected marks")).toBeInTheDocument();
    expect(
      screen.getByText("Summary data preview is unavailable."),
    ).toBeInTheDocument();
    expect(screen.getByText("Suggested Actions")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "この選択を説明" }),
    ).toBeDisabled();
    expect(screen.getByText("No warnings")).toBeInTheDocument();
    expect(screen.getByText("Not available")).toBeInTheDocument();
  });

  it("invokes the action suggestion callback without auto submitting anything", async () => {
    const user = userEvent.setup();
    const onActionSuggestionClick = vi.fn();

    render(
      <AIContextPreviewPanel
        preview={createPreviewModel()}
        onActionSuggestionClick={onActionSuggestionClick}
      />,
    );

    await user.click(screen.getByRole("button", { name: "この選択を説明" }));

    expect(onActionSuggestionClick).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "explain_selection",
        prompt: "この選択を説明してください。",
      }),
    );
  });
});
