import type {
  Availability,
  ContextAvailability,
  DataSourceSummary,
  DashboardContext,
  FilterSummary,
  ParameterSummary,
  SelectedMarkCellSummary,
  SelectedMarkSummary,
  SelectedMarkRowSummary,
  WorksheetSummaryDataPreview,
  WorksheetSummary,
} from "../types/tableau";

export type ContextPreviewVersion = "v1";

export type ContextPreviewSourceKind =
  | DashboardContext["contextSource"]
  | "unknown";

export type ContextPreviewCellValue = string | number | boolean | null;

export type ContextPreviewSectionStatus = "available" | "empty";

export type ContextPreviewSelectedMarksStatus =
  | ContextPreviewSectionStatus
  | "unavailable";

export type ContextPreviewValueList = {
  items: string[];
  totalCount: number;
  limit: number;
  truncated: boolean;
};

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

export type ContextPreviewFilter = {
  status: ContextPreviewSectionStatus;
  worksheetName?: string | null;
  fieldName: string;
  filterType?: string | null;
  appliedValues: ContextPreviewValueList;
  isAllSelected: boolean | null;
};

export type ContextPreviewParameterValue = {
  raw: ContextPreviewCellValue;
  display: string;
  isEmpty: boolean;
};

export type ContextPreviewParameter = {
  status: ContextPreviewSectionStatus;
  name: string;
  currentValue: ContextPreviewParameterValue;
  dataType?: string | null;
  allowableValues: ContextPreviewValueList;
};

export type ContextPreviewSelectedMark = {
  worksheetName: string;
  columns: string[];
  columnCount: number;
  rowCount: number;
  previewRowCount: number;
  rows: SelectedMarkRowSummary[];
  status: Availability;
  truncated: boolean;
};

export type ContextPreviewSelectedMarks = {
  status: ContextPreviewSelectedMarksStatus;
  items: ContextPreviewSelectedMark[];
  totalCount: number;
  previewCount: number;
  limit: number;
  truncated: boolean;
};

export type ContextPreviewSummaryDataPreview = {
  status: "notCollected" | "available" | "empty" | "unavailable";
  generatedAt: string | null;
  updatedAt: string | null;
  maxRows: number;
  maxColumns: number;
  totalWorksheetCount: number;
  previewWorksheetCount: number;
  truncated: boolean;
  items: WorksheetSummaryDataPreview[];
  note?: string;
};

export type ContextPreviewLastChangedWorksheet = {
  worksheetName: string;
  worksheetId?: string | null;
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

export type ContextPreviewBuildOptions = {
  filterValueLimit?: number;
  parameterValueLimit?: number;
  selectedMarkLimit?: number;
  selectedMarkRowLimit?: number;
  lastChangedWorksheet?: ContextPreviewLastChangedWorksheet;
};

export type ContextPreviewModel = {
  previewVersion: ContextPreviewVersion;
  generatedAt: string;
  dashboard: ContextPreviewDashboard;
  workbook: ContextPreviewWorkbook;
  view: ContextPreviewView;
  worksheets: WorksheetSummary[];
  filters: ContextPreviewFilter[];
  parameters: ContextPreviewParameter[];
  selectedMarks: ContextPreviewSelectedMarks;
  dataSources: DataSourceSummary[];
  summaryDataPreview: ContextPreviewSummaryDataPreview;
  lastChangedWorksheet: ContextPreviewLastChangedWorksheet;
  availability: ContextPreviewAvailability;
  warnings: string[];
  metadata: ContextPreviewMetadata;
};

const DEFAULT_SELECTED_MARK_LIMIT = 10;
const DEFAULT_SELECTED_MARK_ROW_LIMIT = 5;
const DEFAULT_FILTER_VALUE_LIMIT = 10;
const DEFAULT_PARAMETER_VALUE_LIMIT = 10;

export function buildContextPreviewModel(
  dashboardContext: DashboardContext,
  options: ContextPreviewBuildOptions = {},
): ContextPreviewModel {
  const worksheets = cloneWorksheets(dashboardContext.worksheets ?? []);
  const filters = buildFilterPreviews(
    dashboardContext.filters ?? [],
    options.filterValueLimit ?? DEFAULT_FILTER_VALUE_LIMIT,
  );
  const parameters = buildParameterPreviews(
    dashboardContext.parameters ?? [],
    options.parameterValueLimit ?? DEFAULT_PARAMETER_VALUE_LIMIT,
  );
  const dataSources = cloneDataSources(dashboardContext.dataSources ?? []);
  const selectedMarks = buildSelectedMarksPreview(
    dashboardContext.selectedMarks,
    options.selectedMarkLimit ?? DEFAULT_SELECTED_MARK_LIMIT,
    options.selectedMarkRowLimit ?? DEFAULT_SELECTED_MARK_ROW_LIMIT,
  );
  const summaryDataPreview = buildSummaryDataPreview(
    dashboardContext.summaryDataPreview ?? [],
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
    summaryDataPreview,
    lastChangedWorksheet: options.lastChangedWorksheet ?? null,
    availability,
    warnings,
    metadata: {
      sourceKind: dashboardContext.contextSource ?? "unknown",
      sourceVersion: "dashboard-context-preview-v2",
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

function buildFilterPreviews(
  filters: FilterSummary[],
  limit: number,
): ContextPreviewFilter[] {
  return filters.map((filter) => {
    const values = normalizeValueList(filter.appliedValues ?? [], limit);

    return {
      status: values.totalCount > 0 ? "available" : "empty",
      worksheetName: filter.worksheetName ?? null,
      fieldName: filter.fieldName,
      filterType: filter.filterType ?? null,
      appliedValues: values,
      isAllSelected: filter.isAllSelected ?? null,
    };
  });
}

function buildParameterPreviews(
  parameters: ParameterSummary[],
  limit: number,
): ContextPreviewParameter[] {
  return parameters.map((parameter) => {
    const allowableValues = normalizeValueList(
      parameter.allowableValues ?? [],
      limit,
    );
    const currentValue = normalizeParameterValue(parameter.currentValue);

    return {
      status:
        currentValue.isEmpty && allowableValues.totalCount === 0
          ? "empty"
          : "available",
      name: parameter.name,
      currentValue,
      dataType: parameter.dataType ?? null,
      allowableValues,
    };
  });
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
  selectedMarks: SelectedMarkSummary[] | undefined,
  limit: number,
  rowLimit: number,
): ContextPreviewSelectedMarks {
  if (selectedMarks === undefined) {
    return {
      status: "unavailable",
      items: [],
      totalCount: 0,
      previewCount: 0,
      limit,
      truncated: false,
    };
  }

  const totalCount = selectedMarks.length;
  const truncated = totalCount > limit;
  const previewMarks = selectedMarks.slice(0, limit);
  const items = previewMarks.map((mark) =>
    normalizeSelectedMarkPreview(mark, rowLimit),
  );
  const hasAvailableMarks = items.some((mark) => mark.status === "available");
  const status: ContextPreviewSelectedMarksStatus =
    totalCount === 0
      ? "empty"
      : hasAvailableMarks
        ? "available"
        : "unavailable";

  return {
    status,
    items,
    totalCount,
    previewCount: items.length,
    limit,
    truncated,
  };
}

function buildSummaryDataPreview(
  summaryDataPreview: WorksheetSummaryDataPreview[],
): ContextPreviewSummaryDataPreview {
  if (!summaryDataPreview.length) {
    return {
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
    };
  }

  const totalWorksheetCount = summaryDataPreview.length;
  const previewWorksheetCount = summaryDataPreview.length;
  const truncated = summaryDataPreview.some((item) => item.truncated);
  const availableCount = summaryDataPreview.filter(
    (item) => item.status === "available",
  ).length;
  const emptyCount = summaryDataPreview.filter(
    (item) => item.status === "empty",
  ).length;
  const unavailableCount = summaryDataPreview.filter(
    (item) => item.status === "unavailable",
  ).length;
  const generatedAt = summaryDataPreview[0]?.generatedAt ?? null;
  const updatedAt =
    summaryDataPreview[summaryDataPreview.length - 1]?.updatedAt ?? generatedAt;

  const status: ContextPreviewSummaryDataPreview["status"] =
    availableCount > 0
      ? "available"
      : unavailableCount > 0 && emptyCount === 0
        ? "unavailable"
        : emptyCount > 0
          ? "empty"
          : "notCollected";

  return {
    status,
    generatedAt,
    updatedAt,
    maxRows: summaryDataPreview[0]?.maxRows ?? 20,
    maxColumns: summaryDataPreview[0]?.maxColumns ?? 20,
    totalWorksheetCount,
    previewWorksheetCount,
    truncated,
    items: cloneSummaryDataPreview(summaryDataPreview),
  };
}

function cloneSummaryDataPreview(
  summaryDataPreview: WorksheetSummaryDataPreview[],
): WorksheetSummaryDataPreview[] {
  return summaryDataPreview.map((item) => ({
    ...item,
    columns: item.columns.map((column) => ({ ...column })),
    rows: item.rows.map((row) => ({
      values: row.values.map((value) => ({
        ...value,
      })),
    })),
  }));
}

function normalizeSelectedMarkPreview(
  mark: SelectedMarkSummary,
  rowLimit: number,
): ContextPreviewSelectedMark {
  const columns = mark.columns ? [...mark.columns] : [];
  const rows = normalizeSelectedMarkRows(mark.rows, columns, rowLimit);
  const previewRowCount = rows.length;
  const rowCount = mark.rowCount ?? previewRowCount;

  return {
    worksheetName: mark.worksheetName,
    columns,
    columnCount: columns.length,
    rowCount,
    previewRowCount,
    rows,
    status: mark.status ?? ("available" as Availability),
    truncated:
      typeof mark.rowCount === "number"
        ? mark.rowCount > previewRowCount
        : false,
  };
}

function normalizeSelectedMarkRows(
  rows: SelectedMarkRowSummary[] | undefined,
  columns: string[],
  limit: number,
): SelectedMarkRowSummary[] {
  if (!rows || rows.length === 0) {
    return [];
  }

  return rows.slice(0, limit).map((row) => ({
    values: row.values.map((value, index) =>
      normalizeSelectedMarkCell(value, columns[index]),
    ),
  }));
}

function normalizeSelectedMarkCell(
  cell: SelectedMarkCellSummary,
  fieldName?: string,
): SelectedMarkCellSummary {
  return {
    fieldName: fieldName ?? cell.fieldName ?? null,
    raw: normalizeSelectedMarkRawValue(cell.raw),
    display: normalizeDisplayValue(cell.display),
    isEmpty: cell.isEmpty,
  };
}

function normalizeSelectedMarkRawValue(
  value: unknown,
): SelectedMarkCellSummary["raw"] {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  return String(value);
}

function normalizeValueList(
  values: Array<string | number | boolean | null | undefined>,
  limit: number,
): ContextPreviewValueList {
  const normalized = values.map((value) => normalizeDisplayValue(value));
  const totalCount = normalized.length;
  return {
    items: normalized.slice(0, limit),
    totalCount,
    limit,
    truncated: totalCount > limit,
  };
}

function normalizeParameterValue(
  value: ParameterSummary["currentValue"],
): ContextPreviewParameterValue {
  return {
    raw: value ?? null,
    display: normalizeDisplayValue(value),
    isEmpty: value === null || value === undefined || value === "",
  };
}

function normalizeDisplayValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "Not set";
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string") {
    return value.trim() ? value : "(empty)";
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
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
