import type {
  SummaryDataCellSummary,
  SummaryDataColumnSummary,
  SummaryDataRowSummary,
  WorksheetSummaryDataPreview,
} from "../types/tableau";

type SummaryDataPreviewResponseTable = {
  columns?: SummaryDataPreviewColumnLike[];
  data?: unknown[];
  totalRowCount?: number;
};

type SummaryDataPreviewColumnLike = {
  fieldName?: string;
  name?: string;
  dataType?: string | null;
  type?: string | null;
};

type SummaryDataPreviewWorksheetLike = {
  name?: string;
  id?: string;
  getSummaryDataAsync?: (
    options?: SummaryDataPreviewOptions,
  ) => Promise<unknown>;
};

export type SummaryDataPreviewOptions = {
  maxRows?: number;
  maxColumns?: number;
};

const DEFAULT_MAX_ROWS = 20;
const DEFAULT_MAX_COLUMNS = 20;

export async function collectSummaryDataPreview(
  worksheets: SummaryDataPreviewWorksheetLike[],
  options: SummaryDataPreviewOptions = {},
): Promise<WorksheetSummaryDataPreview[]> {
  const maxRows = options.maxRows ?? DEFAULT_MAX_ROWS;
  const maxColumns = options.maxColumns ?? DEFAULT_MAX_COLUMNS;

  const summaries = await Promise.all(
    worksheets.map(async (worksheet) => {
      if (!worksheet.getSummaryDataAsync) {
        return buildUnavailableSummaryDataPreview(
          worksheet,
          "Summary data API is unavailable for this worksheet.",
          maxRows,
          maxColumns,
        );
      }

      try {
        const response = (await worksheet.getSummaryDataAsync({
          maxRows,
          maxColumns,
        })) as SummaryDataPreviewResponseTable;
        return normalizeSummaryDataPreview(
          worksheet,
          response,
          maxRows,
          maxColumns,
        );
      } catch (error) {
        return buildUnavailableSummaryDataPreview(
          worksheet,
          getErrorMessage(error),
          maxRows,
          maxColumns,
        );
      }
    }),
  );

  return summaries;
}

function normalizeSummaryDataPreview(
  worksheet: SummaryDataPreviewWorksheetLike,
  response: SummaryDataPreviewResponseTable | null | undefined,
  maxRows: number,
  maxColumns: number,
): WorksheetSummaryDataPreview {
  const timestamp = new Date().toISOString();
  const rawColumns = Array.isArray(response?.columns) ? response?.columns : [];
  const rawRows = Array.isArray(response?.data) ? response?.data : [];
  const inferredColumns = rawColumns.length
    ? rawColumns
    : inferColumnsFromRows(rawRows);
  const totalColumnCount = rawColumns.length || inferredColumns.length;
  const previewColumns = inferredColumns.slice(0, maxColumns);
  const totalRowCount = resolveTotalRowCount(
    response?.totalRowCount,
    rawRows.length,
  );
  const previewRows = rawRows
    .slice(0, maxRows)
    .map((row) => normalizeSummaryDataRow(row, previewColumns));
  const previewRowCount = previewRows.length;
  const previewColumnCount = previewColumns.length;

  const truncated =
    totalRowCount > previewRowCount || totalColumnCount > previewColumnCount;

  return {
    worksheetName: worksheet.name ?? "Untitled worksheet",
    worksheetId: worksheet.id ?? null,
    columns: previewColumns.map(normalizeSummaryDataColumn),
    rows: previewRows,
    maxRows,
    maxColumns,
    totalRowCount,
    previewRowCount,
    totalColumnCount,
    previewColumnCount,
    truncated,
    status: previewRowCount > 0 ? "available" : "empty",
    generatedAt: timestamp,
    updatedAt: timestamp,
  };
}

function buildUnavailableSummaryDataPreview(
  worksheet: SummaryDataPreviewWorksheetLike,
  errorMessage: string,
  maxRows: number,
  maxColumns: number,
): WorksheetSummaryDataPreview {
  const timestamp = new Date().toISOString();

  return {
    worksheetName: worksheet.name ?? "Untitled worksheet",
    worksheetId: worksheet.id ?? null,
    columns: [],
    rows: [],
    maxRows,
    maxColumns,
    totalRowCount: 0,
    previewRowCount: 0,
    totalColumnCount: 0,
    previewColumnCount: 0,
    truncated: false,
    status: "unavailable",
    generatedAt: timestamp,
    updatedAt: timestamp,
    errorMessage,
  };
}

function resolveTotalRowCount(
  totalRowCount: number | undefined,
  previewRowCount: number,
): number {
  if (typeof totalRowCount === "number" && totalRowCount >= 0) {
    return totalRowCount;
  }

  return previewRowCount;
}

function inferColumnsFromRows(rows: unknown[]): SummaryDataPreviewColumnLike[] {
  const firstRow = rows[0];
  if (Array.isArray(firstRow)) {
    return firstRow.map((_, index) => ({
      name: `Column ${index + 1}`,
    }));
  }

  if (!firstRow || typeof firstRow !== "object") {
    return [];
  }

  const record = firstRow as Record<string, unknown>;
  if (Array.isArray(record.values)) {
    return record.values.map((_, index) => ({
      name: `Column ${index + 1}`,
    }));
  }

  if (Array.isArray(record.cells)) {
    return record.cells.map((_, index) => ({
      name: `Column ${index + 1}`,
    }));
  }

  return Object.keys(record).map((key) => ({
    name: key,
  }));
}

function normalizeSummaryDataColumn(
  column: SummaryDataPreviewColumnLike,
): SummaryDataColumnSummary {
  return {
    name: column.name ?? column.fieldName ?? "Unknown column",
    dataType: column.dataType ?? column.type ?? null,
  };
}

function normalizeSummaryDataRow(
  row: unknown,
  columns: SummaryDataPreviewColumnLike[],
): SummaryDataRowSummary {
  if (Array.isArray(row)) {
    return {
      values: row
        .slice(0, columns.length)
        .map((cell, index) =>
          normalizeSummaryDataCell(cell, getColumnLabel(columns[index], index)),
        ),
    };
  }

  if (!row || typeof row !== "object") {
    return {
      values: [],
    };
  }

  const record = row as Record<string, unknown>;
  if (Array.isArray(record.values)) {
    return {
      values: record.values
        .slice(0, columns.length)
        .map((cell, index) =>
          normalizeSummaryDataCell(cell, getColumnLabel(columns[index], index)),
        ),
    };
  }

  if (Array.isArray(record.cells)) {
    return {
      values: record.cells
        .slice(0, columns.length)
        .map((cell, index) =>
          normalizeSummaryDataCell(cell, getColumnLabel(columns[index], index)),
        ),
    };
  }

  return {
    values: columns.map((column) =>
      normalizeSummaryDataCell(
        record[getColumnKey(column)],
        getColumnLabel(column),
      ),
    ),
  };
}

function getColumnKey(
  column: SummaryDataPreviewColumnLike | undefined,
): string {
  return column?.fieldName ?? column?.name ?? "";
}

function getColumnLabel(
  column: SummaryDataPreviewColumnLike | undefined,
  index?: number,
): string {
  return column?.name ?? column?.fieldName ?? `Column ${(index ?? 0) + 1}`;
}

function normalizeSummaryDataCell(
  cell: unknown,
  fieldName?: string,
): SummaryDataCellSummary {
  const value = normalizeSummaryDataCellValue(cell);

  return {
    fieldName: fieldName ?? null,
    raw: value.raw,
    display: value.display,
    isEmpty: value.isEmpty,
  };
}

function normalizeSummaryDataCellValue(cell: unknown): {
  raw: string | number | boolean | null;
  display: string;
  isEmpty: boolean;
} {
  if (cell === null || cell === undefined) {
    return {
      raw: null,
      display: "Not set",
      isEmpty: true,
    };
  }

  if (cell instanceof Date) {
    const display = cell.toISOString();
    return {
      raw: display,
      display,
      isEmpty: false,
    };
  }

  if (typeof cell !== "object") {
    return {
      raw: cell as string | number | boolean,
      display: normalizeDisplayValue(cell),
      isEmpty: false,
    };
  }

  const record = cell as {
    formattedValue?: unknown;
    value?: unknown;
    displayValue?: unknown;
  };

  const rawValue =
    record.value ?? record.formattedValue ?? record.displayValue ?? null;
  const displaySource =
    record.formattedValue ?? record.displayValue ?? record.value ?? null;

  return {
    raw: normalizeRawValue(rawValue),
    display: normalizeDisplayValue(displaySource),
    isEmpty: rawValue === null || rawValue === undefined || rawValue === "",
  };
}

function normalizeRawValue(value: unknown): string | number | boolean | null {
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

  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
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

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Summary data preview could not be collected.";
}
