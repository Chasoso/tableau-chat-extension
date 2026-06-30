import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type SelectionChangedContext = {
  worksheetName?: string;
  worksheetId?: string;
  changedAt: string;
  eventType: string;
};

type RegisterListenerOptions = {
  onSelectionChanged: (
    context: SelectionChangedContext,
  ) => void | Promise<void>;
};

const mocks = vi.hoisted(() => {
  const initializeTableauExtensionMock = vi.fn();
  const getDashboardContextMock = vi.fn();
  const buildContextPreviewModelMock = vi.fn();
  const resolveIntentMock = vi.fn();
  const runSelectedMarkExplanationOrchestrationMock = vi.fn();
  const aiContextPreviewPanelMock = vi.fn(() => (
    <div data-testid="context-preview-panel" />
  ));
  const registerMarkSelectionChangedListenersMock = vi.fn();
  const chatPanelMock = vi.fn(() => <div data-testid="chat-panel" />);
  const cleanupMock = vi.fn();
  let selectionChangedCallback:
    | ((context: {
        worksheetName?: string;
        worksheetId?: string;
        changedAt: string;
        eventType: string;
      }) => void | Promise<void>)
    | null = null;

  return {
    initializeTableauExtensionMock,
    getDashboardContextMock,
    buildContextPreviewModelMock,
    resolveIntentMock,
    runSelectedMarkExplanationOrchestrationMock,
    aiContextPreviewPanelMock,
    registerMarkSelectionChangedListenersMock,
    chatPanelMock,
    cleanupMock,
    setSelectionChangedCallback(
      callback: typeof selectionChangedCallback,
    ): void {
      selectionChangedCallback = callback;
    },
    getSelectionChangedCallback() {
      return selectionChangedCallback;
    },
  };
});

vi.mock("./env", () => ({
  env: {
    authRequired: false,
    useMockTableau: false,
    appVersion: "test",
  },
}));

vi.mock("./components/ChatPanel", () => ({
  default: mocks.chatPanelMock,
}));

vi.mock("./components/AIContextPreviewPanel", () => ({
  default: mocks.aiContextPreviewPanelMock,
}));

vi.mock("./tableau/tableauExtension", () => ({
  initializeTableauExtension: mocks.initializeTableauExtensionMock,
}));

vi.mock("./tableau/dashboardContext", () => ({
  getDashboardContext: mocks.getDashboardContextMock,
}));

vi.mock("./tableau/contextPreview", () => ({
  buildContextPreviewModel: mocks.buildContextPreviewModelMock,
}));

vi.mock("./api/orchestrationApi", () => ({
  resolveIntent: mocks.resolveIntentMock,
  runSelectedMarkExplanationOrchestration:
    mocks.runSelectedMarkExplanationOrchestrationMock,
}));

vi.mock("./tableau/markSelectionListener", () => ({
  registerMarkSelectionChangedListeners:
    mocks.registerMarkSelectionChangedListenersMock.mockImplementation(
      (_dashboard: unknown, options: RegisterListenerOptions) => {
        mocks.setSelectionChangedCallback(options.onSelectionChanged);
        return mocks.cleanupMock;
      },
    ),
}));

import App from "./App";

describe("App", () => {
  beforeEach(() => {
    mocks.initializeTableauExtensionMock.mockReset();
    mocks.getDashboardContextMock.mockReset();
    mocks.buildContextPreviewModelMock.mockReset();
    mocks.resolveIntentMock.mockReset();
    mocks.runSelectedMarkExplanationOrchestrationMock.mockReset();
    mocks.aiContextPreviewPanelMock.mockClear();
    mocks.registerMarkSelectionChangedListenersMock.mockClear();
    mocks.chatPanelMock.mockClear();
    mocks.cleanupMock.mockReset();
    mocks.setSelectionChangedCallback(null);

    const dashboard = { worksheets: [{ name: "Sales Trend" }] };

    Object.defineProperty(window, "tableau", {
      configurable: true,
      value: {
        extensions: {
          initializeAsync: vi.fn(),
          workbook: {
            id: "workbook-1",
          },
          dashboardContent: {
            dashboard,
          },
        },
      },
    });

    mocks.initializeTableauExtensionMock.mockResolvedValue({
      dashboardName: "Executive Overview",
      workbookName: "Sales Workbook",
      workbookId: "workbook-1",
      workbookContentUrl: "sales-workbook",
      viewName: "Executive Overview",
      viewId: "view-1",
      worksheets: [],
      filters: [],
      parameters: [],
      selectedMarks: [],
      dataSources: [],
      availability: {
        workbookId: "available",
        viewId: "not_implemented",
        datasourceFields: "not_implemented",
      },
      contextSource: "tableau-extension",
      capturedAt: "2026-06-07T00:00:00.000Z",
    });

    mocks.getDashboardContextMock.mockResolvedValue({
      dashboardName: "Executive Overview",
      workbookName: "Sales Workbook",
      workbookId: "workbook-1",
      workbookContentUrl: "sales-workbook",
      viewName: "Executive Overview",
      viewId: "view-1",
      worksheets: [],
      filters: [],
      parameters: [],
      selectedMarks: [],
      dataSources: [],
      availability: {
        workbookId: "available",
        viewId: "not_implemented",
        datasourceFields: "not_implemented",
      },
      contextSource: "tableau-extension",
      capturedAt: "2026-06-07T00:01:00.000Z",
    });

    mocks.buildContextPreviewModelMock.mockImplementation(
      (_context, options) => ({
        previewVersion: "v1",
        generatedAt: "2026-06-07T00:00:00.000Z",
        dashboard: { name: "Executive Overview" },
        workbook: {
          name: "Sales Workbook",
          id: "workbook-1",
          contentUrl: "sales-workbook",
        },
        view: { name: "Executive Overview", id: "view-1" },
        worksheets: [],
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
        dataSources: [],
        summaryDataPreview: {
          status: "notCollected",
          generatedAt: null,
          updatedAt: null,
          maxRows: 20,
          maxColumns: 20,
          totalWorksheetCount: 0,
          previewWorksheetCount: 0,
          truncated: false,
          items: [],
          note: "Summary data preview has not been collected yet.",
        },
        lastChangedWorksheet: options?.lastChangedWorksheet ?? null,
        availability: {
          status: "available",
          workbookId: "available",
          viewId: "not_implemented",
          datasourceFields: "not_implemented",
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
        metadata: {
          sourceKind: "tableau-extension",
          sourceVersion: "dashboard-context-preview-v2",
          generatedFrom: "dashboardContext",
        },
      }),
    );
  });

  it("registers mark selection listeners and rebuilds context preview on selection change", async () => {
    const { unmount } = render(<App />);

    await waitFor(() => {
      expect(mocks.initializeTableauExtensionMock).toHaveBeenCalledTimes(1);
      expect(
        mocks.registerMarkSelectionChangedListenersMock,
      ).toHaveBeenCalledTimes(1);
      expect(mocks.aiContextPreviewPanelMock).toHaveBeenCalled();
    });

    mocks.getDashboardContextMock.mockClear();
    mocks.buildContextPreviewModelMock.mockClear();

    const callback = mocks.getSelectionChangedCallback();
    expect(callback).toBeTruthy();

    await act(async () => {
      await callback?.({
        worksheetName: "Sales Trend",
        worksheetId: "worksheet-1",
        changedAt: "2026-06-07T01:23:45.000Z",
        eventType: "MarkSelectionChanged",
      });
    });

    expect(mocks.getDashboardContextMock).toHaveBeenCalledTimes(1);
    expect(mocks.buildContextPreviewModelMock).toHaveBeenCalledWith(
      expect.objectContaining({
        capturedAt: "2026-06-07T00:01:00.000Z",
      }),
      {
        lastChangedWorksheet: {
          worksheetName: "Sales Trend",
          worksheetId: "worksheet-1",
          changedAt: "2026-06-07T01:23:45.000Z",
          source: "selection",
        },
      },
    );
    expect(mocks.aiContextPreviewPanelMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        preview: expect.objectContaining({
          lastChangedWorksheet: {
            worksheetName: "Sales Trend",
            worksheetId: "worksheet-1",
            changedAt: "2026-06-07T01:23:45.000Z",
            source: "selection",
          },
        }),
      }),
      undefined,
    );

    unmount();
    expect(mocks.cleanupMock).toHaveBeenCalledTimes(1);
  });

  it("resolves selected-mark actions without auto-submitting chat jobs", async () => {
    mocks.runSelectedMarkExplanationOrchestrationMock.mockResolvedValue({
      result: {
        agentRunId: "agent-run-1",
        status: "resolved",
        resolvedIntentId: "selected_mark_explanation",
        confidence: 0.99,
        source: "ui_action",
        reason: "Resolved from UI action.",
        evidence: [],
        warnings: [],
      },
      orchestration: {
        mode: "resolve_and_execute_fixed_plan",
        status: "completed",
        message:
          "Structured orchestration is connected for selected_mark_explanation. Actual AI response generation is not connected yet.",
        placeholderResponse:
          "Structured orchestration is connected for selected_mark_explanation. Actual AI response generation is not connected yet.",
        intentResolution: {
          agentRunId: "agent-run-1",
          status: "resolved",
          resolvedIntentId: "selected_mark_explanation",
          confidence: 0.99,
          source: "ui_action",
          warnings: [],
          evidence: [],
        },
        planSelection: {
          status: "selected",
          matched: true,
          resolvedIntentId: "selected_mark_explanation",
          selectedPlan: {
            id: "selected_mark_explanation-v1",
            title: "Selected mark explanation",
            responseStrategy: "explain_selection",
            budget: {
              maxModelCalls: 0,
              maxToolCalls: 2,
              timeoutMs: 15000,
            },
          },
          preconditions: [],
          reasonBrief: "Selected the selected-mark explanation plan.",
        },
        execution: {
          status: "partial",
          planId: "selected_mark_explanation-v1",
          intentId: "selected_mark_explanation",
          executedSteps: ["route-selected-marks", "route-summary-data-preview"],
          skippedSteps: [],
          blockedSteps: [],
          stepResults: [],
          budgetUsage: {
            toolCallsUsed: 2,
            modelCallsUsed: 0,
            maxToolCalls: 2,
            maxModelCalls: 0,
            timeoutMs: 15000,
            startedAt: "2026-06-07T00:00:00.000Z",
            completedAt: "2026-06-07T00:00:01.000Z",
            durationMs: 1000,
          },
          warnings: [],
          errors: [],
        },
        traceEvents: [],
        contextSummary: {
          dashboardName: "Executive Overview",
          workbookName: "Sales Workbook",
          viewName: "Executive Overview",
          worksheetNames: ["Sales Trend"],
          selectedMarks: {
            hasSelectedMarks: true,
            totalCount: 3,
            previewCount: 1,
            truncated: false,
            worksheetNames: ["Sales Trend"],
          },
        },
      },
    });
    mocks.buildContextPreviewModelMock.mockImplementationOnce(
      (_context, options) => ({
        previewVersion: "v1",
        generatedAt: "2026-06-07T00:00:00.000Z",
        dashboard: { name: "Executive Overview" },
        workbook: {
          name: "Sales Workbook",
          id: "workbook-1",
          contentUrl: "sales-workbook",
        },
        view: { name: "Executive Overview", id: "view-1" },
        worksheets: [],
        filters: [],
        parameters: [],
        selectedMarks: {
          status: "available",
          items: [
            {
              worksheetName: "Sales Trend",
              columns: ["Region"],
              columnCount: 1,
              rowCount: 3,
              previewRowCount: 1,
              rows: [],
              status: "available",
              truncated: false,
            },
          ],
          totalCount: 3,
          previewCount: 1,
          limit: 10,
          truncated: false,
        },
        dataSources: [],
        summaryDataPreview: {
          status: "notCollected",
          generatedAt: null,
          updatedAt: null,
          maxRows: 20,
          maxColumns: 20,
          totalWorksheetCount: 0,
          previewWorksheetCount: 0,
          truncated: false,
          items: [],
          note: "Summary data preview has not been collected yet.",
        },
        lastChangedWorksheet: options?.lastChangedWorksheet ?? null,
        availability: {
          status: "available",
          workbookId: "available",
          viewId: "not_implemented",
          datasourceFields: "not_implemented",
        },
        actionSuggestions: [
          {
            id: "explain_selection",
            label: "Explain this selection",
            intent: "selected_mark_explanation",
            enabled: true,
            reason: undefined,
            source: "selectedMarks",
            prompt: "Explain this selection.",
            selectedMarkCount: 3,
            previewCount: 1,
            truncated: false,
          },
        ],
        warnings: [],
        metadata: {
          sourceKind: "tableau-extension",
          sourceVersion: "dashboard-context-preview-v2",
          generatedFrom: "dashboardContext",
        },
      }),
    );

    render(<App />);

    await waitFor(() => {
      expect(mocks.aiContextPreviewPanelMock).toHaveBeenCalled();
    });

    const previewProps = (
      mocks.aiContextPreviewPanelMock.mock.calls.at(-1) as
        | [
            {
              onActionSuggestionClick?: (suggestion: {
                id: string;
                label: string;
                intent: string;
                enabled: boolean;
                prompt?: string;
                source: string;
                selectedMarkCount?: number;
                previewCount?: number;
                truncated?: boolean;
              }) => void | Promise<void>;
            },
          ]
        | undefined
    )?.[0];
    expect(previewProps?.onActionSuggestionClick).toBeInstanceOf(Function);

    await act(async () => {
      await previewProps?.onActionSuggestionClick?.({
        id: "explain_selection",
        label: "Explain this selection",
        intent: "selected_mark_explanation",
        enabled: true,
        prompt: "Explain this selection.",
        source: "selectedMarks",
        selectedMarkCount: 3,
        previewCount: 1,
        truncated: false,
      });
    });

    expect(
      mocks.runSelectedMarkExplanationOrchestrationMock,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        actionId: "explain_selection",
        requestedIntent: "selected_mark_explanation",
        message: "Explain this selection.",
        contextSummary: expect.objectContaining({
          hasSelectedMarks: true,
          selectedMarkCount: 3,
          worksheetNames: ["Sales Trend"],
          dashboardName: "Executive Overview",
          workbookName: "Sales Workbook",
          viewName: "Executive Overview",
        }),
        metadata: expect.objectContaining({
          previewVersion: "v1",
          sourceKind: "tableau-extension",
        }),
      }),
      undefined,
    );

    expect(
      screen.getByText(/Resolved intent: selected_mark_explanation/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Orchestration: completed \/ Plan: selected_mark_explanation-v1 \/ Execution: partial/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Structured orchestration is connected for selected_mark_explanation/,
      ),
    ).toBeInTheDocument();

    const chatPanelProps = (
      mocks.chatPanelMock.mock.calls.at(-1) as
        | [
            {
              questionPrefill?: {
                requestId: string;
                text: string;
              } | null;
            },
          ]
        | undefined
    )?.[0];
    expect(chatPanelProps?.questionPrefill).toBeUndefined();
  });
});
