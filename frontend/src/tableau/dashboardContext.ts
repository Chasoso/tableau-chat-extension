import type {
  DashboardContext,
  DataSourceSummary,
  FilterSummary,
  ParameterSummary,
  SelectedMarkSummary,
  WorksheetSummary,
} from "../types/tableau";

type TableauDashboard = {
  name?: string;
  workbook?: { name?: string };
  worksheets?: TableauWorksheet[];
  getParametersAsync?: () => Promise<unknown[]>;
};

type TableauWorkbook = {
  name?: string;
  workbookName?: string;
  getAllDataSourcesAsync?: () => Promise<unknown[]>;
};

type DashboardContextOptions = {
  workbook?: unknown;
  referrer?: string;
};

type TableauWorksheet = {
  name?: string;
  sheetType?: string;
  size?: { width?: number; height?: number };
  getFiltersAsync?: () => Promise<unknown[]>;
  getSelectedMarksAsync?: () => Promise<unknown>;
  getDataSourcesAsync?: () => Promise<unknown[]>;
};

export function createMockDashboardContext(contextWarning = "モックのダッシュボード情報を使用しています。"): DashboardContext {
  return {
    dashboardName: "Mock Executive Sales Dashboard",
    workbookName: "Mock Sales Workbook",
    worksheets: [
      {
        name: "Sales Trend",
        sheetType: "worksheet",
        summary: "Mock worksheet showing monthly sales trend.",
      },
      {
        name: "Regional Performance",
        sheetType: "worksheet",
        summary: "Mock worksheet showing sales and profit by region.",
      },
    ],
    filters: [
      {
        worksheetName: "Regional Performance",
        fieldName: "Region",
        filterType: "categorical",
        appliedValues: ["Central", "West"],
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
        status: "notAvailable",
      },
    ],
    dataSources: [
      {
        worksheetName: "Sales Trend",
        name: "Mock Superstore",
        id: "mock-datasource",
      },
    ],
    contextSource: "mock",
    contextWarning,
    capturedAt: new Date().toISOString(),
  };
}

export async function getDashboardContext(
  dashboard: TableauDashboard,
  options: DashboardContextOptions = {},
): Promise<DashboardContext> {
  const worksheets = dashboard.worksheets ?? [];
  const workbookName = resolveWorkbookName(dashboard, options);

  const worksheetSummaries: WorksheetSummary[] = worksheets.map((worksheet) => ({
    name: worksheet.name ?? "Untitled worksheet",
    sheetType: worksheet.sheetType ?? null,
    size: worksheet.size
      ? {
          width: worksheet.size.width ?? null,
          height: worksheet.size.height ?? null,
        }
      : undefined,
    summary: worksheet.name ? `Worksheet available in the active dashboard: ${worksheet.name}` : null,
  }));

  const [filters, selectedMarks, dataSources, parameters] = await Promise.all([
    collectFilters(worksheets),
    collectSelectedMarks(worksheets),
    collectDataSources(worksheets),
    collectParameters(dashboard),
  ]);

  return {
    dashboardName: dashboard.name ?? "Untitled dashboard",
    workbookName,
    worksheets: worksheetSummaries,
    filters,
    parameters,
    selectedMarks,
    dataSources,
    contextSource: "tableau-extension",
    capturedAt: new Date().toISOString(),
  };
}

function resolveWorkbookName(dashboard: TableauDashboard, options: DashboardContextOptions): string | null {
  const urlName = parseWorkbookNameFromUrl(options.referrer);
  const explicitName =
    normalizeName(readStringProperty(dashboard.workbook, "name")) ??
    normalizeName(readStringProperty(options.workbook, "name")) ??
    normalizeName(readStringProperty(options.workbook, "workbookName"));

  if (urlName && (!explicitName || explicitName === dashboard.name)) {
    return urlName;
  }

  if (explicitName) {
    return explicitName;
  }

  return urlName;
}

function parseWorkbookNameFromUrl(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = new URL(value);
    const hashPath = parsed.hash.startsWith("#") ? parsed.hash.slice(1) : parsed.hash;
    const pathCandidates = [hashPath, parsed.pathname].filter(Boolean);

    for (const path of pathCandidates) {
      const match = path.match(/\/views\/([^/?#]+)\//);
      const workbookContentUrl = match?.[1];
      const name = normalizeName(workbookContentUrl ? decodeURIComponent(workbookContentUrl) : undefined);
      if (name) {
        return name;
      }
    }
  } catch {
    return null;
  }

  return null;
}

function readStringProperty(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  try {
    const propertyValue = (value as Record<string, unknown>)[key];
    return typeof propertyValue === "string" ? propertyValue : undefined;
  } catch {
    return undefined;
  }
}

function normalizeName(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

async function collectFilters(worksheets: TableauWorksheet[]): Promise<FilterSummary[]> {
  const allFilters = await Promise.all(
    worksheets.map(async (worksheet) => {
      if (!worksheet.getFiltersAsync) {
        return [];
      }

      try {
        const filters = await worksheet.getFiltersAsync();
        return filters.map((filter) => mapFilter(filter, worksheet.name ?? null));
      } catch {
        return [];
      }
    }),
  );

  return allFilters.flat();
}

function mapFilter(filter: unknown, worksheetName: string | null): FilterSummary {
  const value = filter as {
    fieldName?: string;
    filterType?: string;
    isAllSelected?: boolean;
    appliedValues?: Array<{ formattedValue?: string; value?: unknown }>;
  };

  return {
    worksheetName,
    fieldName: value.fieldName ?? "Unknown field",
    filterType: value.filterType ?? null,
    isAllSelected: value.isAllSelected ?? null,
    appliedValues: value.appliedValues?.map((item) => item.formattedValue ?? String(item.value ?? "")) ?? [],
  };
}

async function collectParameters(dashboard: TableauDashboard): Promise<ParameterSummary[]> {
  if (!dashboard.getParametersAsync) {
    return [];
  }

  try {
    const parameters = await dashboard.getParametersAsync();
    return parameters.map((parameter) => {
      const value = parameter as {
        name?: string;
        currentValue?: { formattedValue?: string; value?: string | number | boolean };
        dataType?: string;
        allowableValues?: { allowableValues?: Array<{ formattedValue?: string; value?: unknown }> };
      };

      return {
        name: value.name ?? "Unknown parameter",
        currentValue: value.currentValue?.formattedValue ?? value.currentValue?.value ?? null,
        dataType: value.dataType ?? null,
        allowableValues:
          value.allowableValues?.allowableValues?.map((item) => item.formattedValue ?? String(item.value ?? "")) ??
          undefined,
      };
    });
  } catch {
    return [];
  }
}

async function collectSelectedMarks(worksheets: TableauWorksheet[]): Promise<SelectedMarkSummary[]> {
  const summaries = await Promise.all(
    worksheets.map(async (worksheet) => {
      if (!worksheet.getSelectedMarksAsync) {
        return {
          worksheetName: worksheet.name ?? "Untitled worksheet",
          status: "notAvailable" as const,
        };
      }

      try {
        const selected = (await worksheet.getSelectedMarksAsync()) as {
          data?: Array<{ columns?: Array<{ fieldName?: string }>; data?: unknown[] }>;
        };
        const firstTable = selected.data?.[0];
        return {
          worksheetName: worksheet.name ?? "Untitled worksheet",
          columns: firstTable?.columns?.map((column) => column.fieldName ?? "Unknown column") ?? [],
          rowCount: firstTable?.data?.length ?? 0,
          status: "available" as const,
        };
      } catch {
        return {
          worksheetName: worksheet.name ?? "Untitled worksheet",
          status: "notAvailable" as const,
        };
      }
    }),
  );

  return summaries;
}

async function collectDataSources(worksheets: TableauWorksheet[]): Promise<DataSourceSummary[]> {
  const summaries = await Promise.all(
    worksheets.map(async (worksheet) => {
      if (!worksheet.getDataSourcesAsync) {
        return [];
      }

      try {
        const dataSources = await worksheet.getDataSourcesAsync();
        return dataSources.map((source) => {
          const value = source as { name?: string; id?: string };
          return {
            worksheetName: worksheet.name ?? null,
            name: value.name ?? "Unknown datasource",
            id: value.id ?? null,
          };
        });
      } catch {
        return [];
      }
    }),
  );

  return summaries.flat();
}
