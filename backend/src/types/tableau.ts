export type WorksheetSummary = {
  name: string;
  sheetType?: string | null;
  summary?: string | null;
};

export type FilterSummary = {
  worksheetName?: string | null;
  fieldName: string;
  filterType?: string | null;
  appliedValues?: string[];
  isAllSelected?: boolean | null;
};

export type ParameterSummary = {
  name: string;
  currentValue?: string | number | boolean | null;
  dataType?: string | null;
  allowableValues?: string[];
};

export type SelectedMarkSummary = {
  worksheetName: string;
  columns?: string[];
  rowCount?: number;
  status?: "available" | "notAvailable";
};

export type DataSourceSummary = {
  worksheetName?: string | null;
  name: string;
  id?: string | null;
};

export type DashboardContext = {
  dashboardName: string;
  workbookName?: string | null;
  worksheets: WorksheetSummary[];
  filters: FilterSummary[];
  parameters: ParameterSummary[];
  selectedMarks?: SelectedMarkSummary[];
  dataSources?: DataSourceSummary[];
  capturedAt: string;
};

export type TableauAdditionalContext = {
  provider: "mock" | "direct-tableau-api" | "tableau-mcp";
  workbook?: unknown;
  datasources?: unknown[];
  metadata?: unknown;
  warnings?: string[];
};

