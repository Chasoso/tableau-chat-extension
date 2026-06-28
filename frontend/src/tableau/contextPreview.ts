import type {
  Availability,
  ContextAvailability,
  DataSourceSummary,
  DashboardContext,
  FilterSummary,
  ParameterSummary,
  SelectedMarkSummary,
  WorksheetSummary,
} from "../types/tableau";

export type ContextPreviewVersion = "v1";

export type ContextPreviewSourceKind =
  | DashboardContext["contextSource"]
  | "unknown";

export type ContextPreviewCellValue = string | number | boolean | null;

export type ContextPreviewRow = Record<string, ContextPreviewCellValue>;

export type ContextPreviewDashboard = {
  name: string;
};

export type ContextPreviewWorkbook = {
  name?: string | null;
  id?: string | null;
  contentUrl?: string | null;
};

export type ContextPreviewView = {
  name?: string | null;
  id?: string | null;
};

export type ContextPreviewSelectedMarks = {
  items: SelectedMarkSummary[];
  totalCount: number;
  limit: number;
  truncated: boolean;
};

export type ContextPreviewSummaryDataPreview = {
  status: "notCollected" | "available" | "notAvailable";
  worksheetName?: string | null;
  rowCount?: number;
  columnCount?: number;
  columns?: string[];
  rows?: ContextPreviewRow[];
  truncated?: boolean;
  limitRows?: number;
  limitColumns?: number;
  note?: string;
};

export type ContextPreviewLastChangedWorksheet = {
  worksheetName: string;
  changedAt?: string;
  source?: "selection" | "filter" | "parameter" | "manual" | "unknown";
} | null;

export type ContextPreviewAvailability = {
  status: "available" | "partial" | "unavailable";
  workbookId: ContextAvailability["workbookId"];
  viewId: ContextAvailability["viewId"];
  datasourceFields: ContextAvailability["datasourceFields"];
};

export type ContextPreviewMetadata = {
  sourceKind: ContextPreviewSourceKind;
  sourceVersion: string;
  generatedFrom: "dashboardContext";
};

export type ContextPreviewModel = {
  previewVersion: ContextPreviewVersion;
  generatedAt: string;
  dashboard: ContextPreviewDashboard;
  workbook: ContextPreviewWorkbook;
  view: ContextPreviewView;
  worksheets: WorksheetSummary[];
  filters: FilterSummary[];
  parameters: ParameterSummary[];
  selectedMarks: ContextPreviewSelectedMarks;
  dataSources: DataSourceSummary[];
  summaryDataPreview: ContextPreviewSummaryDataPreview;
  lastChangedWorksheet: ContextPreviewLastChangedWorksheet;
  availability: ContextPreviewAvailability;
  warnings: string[];
  metadata: ContextPreviewMetadata;
};

const DEFAULT_SELECTED_MARK_LIMIT = 10;

export function buildContextPreviewModel(
  dashboardContext: DashboardContext,
): ContextPreviewModel {
  const worksheets = cloneWorksheets(dashboardContext.worksheets ?? []);
  const filters = cloneFilters(dashboardContext.filters ?? []);
  const parameters = cloneParameters(dashboardContext.parameters ?? []);
  const dataSources = cloneDataSources(dashboardContext.dataSources ?? []);
  const selectedMarks = buildSelectedMarksPreview(
    dashboardContext.selectedMarks ?? [],
  );
  const availability = buildAvailability(dashboardContext.availability);
  const warnings = buildWarnings(dashboardContext);

  return {
    previewVersion: "v1",
    generatedAt: dashboardContext.capturedAt,
    dashboard: {
      name: dashboardContext.dashboardName,
    },
    workbook: {
      name: dashboardContext.workbookName ?? null,
      id: dashboardContext.workbookId ?? null,
      contentUrl: dashboardContext.workbookContentUrl ?? null,
    },
    view: {
      name: dashboardContext.viewName ?? null,
      id: dashboardContext.viewId ?? null,
    },
    worksheets,
    filters,
    parameters,
    selectedMarks,
    dataSources,
    summaryDataPreview: {
      status: "notCollected",
      note: "Summary data preview has not been collected yet.",
    },
    lastChangedWorksheet: null,
    availability,
    warnings,
    metadata: {
      sourceKind: dashboardContext.contextSource ?? "unknown",
      sourceVersion: "dashboard-context-preview-v1",
      generatedFrom: "dashboardContext",
    },
  };
}

function cloneWorksheets(worksheets: WorksheetSummary[]): WorksheetSummary[] {
  return worksheets.map((worksheet) => ({
    ...worksheet,
    size: worksheet.size ? { ...worksheet.size } : undefined,
  }));
}

function cloneFilters(filters: FilterSummary[]): FilterSummary[] {
  return filters.map((filter) => ({
    ...filter,
    appliedValues: filter.appliedValues ? [...filter.appliedValues] : undefined,
  }));
}

function cloneParameters(parameters: ParameterSummary[]): ParameterSummary[] {
  return parameters.map((parameter) => ({
    ...parameter,
    allowableValues: parameter.allowableValues
      ? [...parameter.allowableValues]
      : undefined,
  }));
}

function cloneDataSources(
  dataSources: DataSourceSummary[],
): DataSourceSummary[] {
  return dataSources.map((dataSource) => ({
    ...dataSource,
    fields: dataSource.fields ? [...dataSource.fields] : dataSource.fields,
  }));
}

function buildSelectedMarksPreview(
  selectedMarks: SelectedMarkSummary[],
): ContextPreviewSelectedMarks {
  const totalCount = selectedMarks.length;
  const truncated = totalCount > DEFAULT_SELECTED_MARK_LIMIT;
  const items = selectedMarks
    .slice(0, DEFAULT_SELECTED_MARK_LIMIT)
    .map((mark) => ({
      ...mark,
      columns: mark.columns ? [...mark.columns] : undefined,
      status: mark.status ?? ("available" as Availability),
    }));

  return {
    items,
    totalCount,
    limit: DEFAULT_SELECTED_MARK_LIMIT,
    truncated,
  };
}

function buildAvailability(
  availability: DashboardContext["availability"],
): ContextPreviewAvailability {
  const dashboardAvailability: ContextAvailability = availability ?? {
    workbookId: "not_implemented",
    viewId: "not_implemented",
    datasourceFields: "not_implemented",
  };

  const hasAnyAvailable =
    dashboardAvailability.workbookId === "available" ||
    dashboardAvailability.viewId === "available" ||
    dashboardAvailability.datasourceFields === "available";

  const hasAnyPartial =
    dashboardAvailability.workbookId !== "not_supported" ||
    dashboardAvailability.viewId !== "not_supported" ||
    dashboardAvailability.datasourceFields !== "not_supported";

  return {
    status: hasAnyAvailable
      ? "available"
      : hasAnyPartial
        ? "partial"
        : "unavailable",
    workbookId: dashboardAvailability.workbookId,
    viewId: dashboardAvailability.viewId,
    datasourceFields: dashboardAvailability.datasourceFields,
  };
}

function buildWarnings(dashboardContext: DashboardContext): string[] {
  const warnings = new Set<string>();

  if (dashboardContext.contextWarning) {
    warnings.add(dashboardContext.contextWarning);
  }

  if (dashboardContext.contextSource !== "tableau-extension") {
    warnings.add(
      "Context preview is not using a live Tableau Extension source.",
    );
  }

  if (!dashboardContext.workbookName) {
    warnings.add("Workbook name is missing from the dashboard context.");
  }

  return [...warnings];
}
