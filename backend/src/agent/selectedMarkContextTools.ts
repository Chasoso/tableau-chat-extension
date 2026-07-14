import { createDefaultToolExecutionWrapper } from "./toolExecutionWrapper";
import { InMemoryToolRegistry } from "./toolRegistry";
import {
  composeSelectedMarkExplanationResponse,
  type ResponseComposerInput,
} from "./responseComposer";
import type {
  ToolCapability,
  ToolCategory,
  ToolDefinition,
  ToolSafety,
  ToolSchemaPolicy,
} from "./toolDefinition";
import type { IntentResolutionContextSummary } from "./intent";
import type { JsonObject, JsonValue } from "./types";
import type { ToolExecutionHandler } from "./toolExecutionWrapper";
import type {
  SelectedMarkCellSummary,
  SelectedMarkRowSummary,
  SelectedMarkSummary,
} from "../types/tableau";

export type SelectedMarkExplanationContextToolName =
  | "context.selectedMarks"
  | "context.summaryDataPreview"
  | "context.filters"
  | "context.parameters";

export type SelectedMarkExplanationContextSummary =
  IntentResolutionContextSummary;

export type SelectedMarkExplanationResponseMaterial = {
  intentId: "selected_mark_explanation";
  selectedMarks: {
    available: boolean;
    count: number;
    worksheetNames: string[];
    fieldNames: string[];
    items: SelectedMarkSummary[];
    summary: string;
  };
  summaryDataPreview?: {
    available: boolean;
    rowCount?: number;
    columnCount?: number;
    columnNames?: string[];
    truncated?: boolean;
  };
  filters?: {
    available: boolean;
    count?: number;
    names?: string[];
  };
  parameters?: {
    available: boolean;
    count?: number;
    names?: string[];
  };
  warnings: string[];
};

export type SelectedMarkExplanationContextToolOutputs = Partial<
  Record<SelectedMarkExplanationContextToolName, JsonValue>
>;

export type SelectedMarkExplanationToolRuntime = {
  registry: InMemoryToolRegistry;
  executionWrapper: ReturnType<typeof createDefaultToolExecutionWrapper>;
};

const CONTEXT_TOOL_CATEGORY: ToolCategory = "context";
const CONTEXT_TOOL_INPUT_SCHEMA: ToolSchemaPolicy = {
  kind: "typescript_contract",
  description: "Structured orchestration context reference.",
  requiredFields: ["contextSummary"],
};
const CONTEXT_TOOL_OUTPUT_SCHEMA: ToolSchemaPolicy = {
  kind: "typescript_contract",
  description: "Compact JSON-safe context summary material.",
};

export function createSelectedMarkExplanationToolRuntime(
  contextSummary?: SelectedMarkExplanationContextSummary,
): SelectedMarkExplanationToolRuntime {
  const registry = createSelectedMarkExplanationContextToolRegistry();
  const executionWrapper = createDefaultToolExecutionWrapper({
    handlers: createSelectedMarkExplanationContextToolHandlers(contextSummary),
    defaultTimeoutMs: 15_000,
    maxOutputDepth: 8,
    maxOutputEntries: 24,
  });

  return {
    registry,
    executionWrapper,
  };
}

export function createSelectedMarkExplanationContextToolRegistry(): InMemoryToolRegistry {
  return new InMemoryToolRegistry(
    createSelectedMarkExplanationContextToolDefinitions(),
  );
}

export function createSelectedMarkExplanationContextToolDefinitions(): ToolDefinition[] {
  return [
    createContextToolDefinition({
      name: "context.selectedMarks",
      description:
        "Reads a compact summary of selected marks from the orchestration context.",
      capabilities: ["read_context", "read_selected_marks"],
      safety: {
        level: "read_only",
        safeForPreview: true,
        requiresExplicitAction: false,
        externalAccess: false,
        mayAccessWorkbookContext: true,
        mayAccessSelectedMarks: true,
      },
      availability: { status: "available" },
      preconditions: [
        {
          id: "selected_marks.required",
          type: "requires_selected_marks",
          required: true,
          severity: "critical",
          description: "Requires at least one selected mark.",
          expected: {
            minSelectedMarkCount: 1,
          },
          fallbackReason:
            "Select one or more marks before explaining the selection.",
          metadata: {
            contextSource: "selected_marks",
          },
        },
      ],
      outputSchema: {
        ...CONTEXT_TOOL_OUTPUT_SCHEMA,
        requiredFields: ["available", "count", "worksheetNames", "summary"],
        optionalFields: ["fieldNames", "items"],
      },
    }),
    createContextToolDefinition({
      name: "context.summaryDataPreview",
      description:
        "Reads a compact summary of the summary data preview from orchestration context.",
      capabilities: ["read_context", "read_summary_data"],
      safety: {
        level: "read_only",
        safeForPreview: true,
        requiresExplicitAction: false,
        externalAccess: false,
        mayAccessSummaryData: true,
      },
      availability: {
        status: "conditional",
        reason:
          "Summary data preview may be unavailable in the current orchestration context.",
      },
      preconditions: [
        {
          id: "summary_data.optional",
          type: "requires_summary_data",
          required: false,
          severity: "info",
          description: "Uses summary data preview when available.",
          expected: {
            summaryDataPreviewAvailable: true,
          },
          fallbackReason:
            "Summary data preview is unavailable; continue with the selected marks only.",
          metadata: {
            contextSource: "summary_data_preview",
          },
        },
      ],
      outputSchema: {
        ...CONTEXT_TOOL_OUTPUT_SCHEMA,
        requiredFields: ["available"],
        optionalFields: ["rowCount", "columnCount", "columnNames", "truncated"],
      },
    }),
    createContextToolDefinition({
      name: "context.filters",
      description:
        "Reads a compact summary of active filters from orchestration context.",
      capabilities: ["read_context", "read_filters"],
      safety: {
        level: "read_only",
        safeForPreview: true,
        requiresExplicitAction: false,
        externalAccess: false,
      },
      availability: { status: "available" },
      outputSchema: {
        ...CONTEXT_TOOL_OUTPUT_SCHEMA,
        requiredFields: ["available"],
        optionalFields: ["count", "names"],
      },
    }),
    createContextToolDefinition({
      name: "context.parameters",
      description:
        "Reads a compact summary of active parameters from orchestration context.",
      capabilities: ["read_context", "read_parameters"],
      safety: {
        level: "read_only",
        safeForPreview: true,
        requiresExplicitAction: false,
        externalAccess: false,
      },
      availability: { status: "available" },
      outputSchema: {
        ...CONTEXT_TOOL_OUTPUT_SCHEMA,
        requiredFields: ["available"],
        optionalFields: ["count", "names"],
      },
    }),
  ];
}

export function createSelectedMarkExplanationContextToolHandlers(
  contextSummary?: SelectedMarkExplanationContextSummary,
): Record<SelectedMarkExplanationContextToolName, ToolExecutionHandler> {
  return {
    "context.selectedMarks": async () =>
      buildSelectedMarksMaterial(contextSummary),
    "context.summaryDataPreview": async () =>
      buildSummaryDataPreviewMaterial(contextSummary),
    "context.filters": async () => buildFiltersMaterial(contextSummary),
    "context.parameters": async () => buildParametersMaterial(contextSummary),
  };
}

export function buildSelectedMarkExplanationResponseMaterial(input: {
  contextSummary?: SelectedMarkExplanationContextSummary;
  toolOutputs?: SelectedMarkExplanationContextToolOutputs;
  warnings?: readonly string[];
}): SelectedMarkExplanationResponseMaterial {
  const selectedMarks = normalizeSelectedMarksMaterial({
    contextSummary: input.contextSummary,
    output: input.toolOutputs?.["context.selectedMarks"],
  });
  const summaryDataPreview = normalizeSummaryDataPreviewMaterial({
    contextSummary: input.contextSummary,
    output: input.toolOutputs?.["context.summaryDataPreview"],
  });
  const filters = normalizeNamedCountMaterial({
    contextSummary: input.contextSummary,
    output: input.toolOutputs?.["context.filters"],
    key: "filters",
  });
  const parameters = normalizeNamedCountMaterial({
    contextSummary: input.contextSummary,
    output: input.toolOutputs?.["context.parameters"],
    key: "parameters",
  });

  return {
    intentId: "selected_mark_explanation",
    selectedMarks,
    ...(summaryDataPreview ? { summaryDataPreview } : {}),
    ...(filters ? { filters } : {}),
    ...(parameters ? { parameters } : {}),
    warnings: cloneStringList(input.warnings),
  };
}

export function buildSelectedMarkExplanationPlaceholderResponse(
  material: SelectedMarkExplanationResponseMaterial,
): string {
  return composeSelectedMarkExplanationResponse({
    intentId: "selected_mark_explanation",
    responseMaterial: material,
  } satisfies ResponseComposerInput).message;
}

function createContextToolDefinition(input: {
  name: SelectedMarkExplanationContextToolName;
  description: string;
  capabilities: readonly ToolCapability[];
  safety: ToolSafety;
  availability: ToolDefinition["availability"];
  preconditions?: NonNullable<ToolDefinition["preconditions"]>;
  outputSchema: ToolSchemaPolicy;
}): ToolDefinition {
  return {
    name: input.name,
    description: input.description,
    category: CONTEXT_TOOL_CATEGORY,
    capabilities: [...input.capabilities],
    safety: { ...input.safety },
    availability: { ...input.availability },
    inputSchema: { ...CONTEXT_TOOL_INPUT_SCHEMA },
    outputSchema: { ...input.outputSchema },
    ...(input.preconditions ? { preconditions: [...input.preconditions] } : {}),
    version: "v1",
    metadata: {
      source: "selected_mark_explanation",
    },
    traceMetadata: {
      toolKind: input.name,
    },
  };
}

function buildSelectedMarksMaterial(
  contextSummary?: SelectedMarkExplanationContextSummary,
): JsonObject {
  const count = contextSummary?.selectedMarks?.totalCount ?? 0;
  const items = cloneSelectedMarkSummaries(
    contextSummary?.selectedMarks?.items,
  );
  const worksheetNames = cloneStringList(
    contextSummary?.selectedMarks?.worksheetNames ??
      contextSummary?.worksheetNames,
  );
  const fieldNames = uniqueStringList(
    items.flatMap(
      (item) =>
        item.columns ??
        item.rows?.flatMap((row) =>
          row.values
            .map((cell) => cell.fieldName?.trim())
            .filter((value): value is string => Boolean(value)),
        ) ??
        [],
    ),
  );
  const available = count > 0;

  return {
    available,
    count,
    worksheetNames,
    fieldNames,
    items,
    summary: available
      ? buildSelectedMarksSummary({
          count,
          worksheetNames,
          items,
        })
      : "No selected marks are available.",
  };
}

function buildSummaryDataPreviewMaterial(
  contextSummary?: SelectedMarkExplanationContextSummary,
): JsonObject {
  const summaryDataPreview = contextSummary?.summaryDataPreview;
  const available = Boolean(summaryDataPreview?.available);

  return {
    available,
    ...(summaryDataPreview?.rowCount !== undefined
      ? { rowCount: summaryDataPreview.rowCount }
      : {}),
    ...(summaryDataPreview?.columnCount !== undefined
      ? { columnCount: summaryDataPreview.columnCount }
      : {}),
    ...(summaryDataPreview?.columnNames?.length
      ? { columnNames: [...summaryDataPreview.columnNames] }
      : {}),
    ...(summaryDataPreview?.truncated !== undefined
      ? { truncated: summaryDataPreview.truncated }
      : {}),
  };
}

function buildFiltersMaterial(
  contextSummary?: SelectedMarkExplanationContextSummary,
): JsonObject {
  const filters = contextSummary?.filters;
  const names = cloneStringList(filters?.names);

  return {
    available: (filters?.count ?? names.length) > 0,
    ...(filters?.count !== undefined ? { count: filters.count } : {}),
    ...(names.length ? { names } : {}),
  };
}

function buildParametersMaterial(
  contextSummary?: SelectedMarkExplanationContextSummary,
): JsonObject {
  const parameters = contextSummary?.parameters;
  const names = cloneStringList(parameters?.names);

  return {
    available: (parameters?.count ?? names.length) > 0,
    ...(parameters?.count !== undefined ? { count: parameters.count } : {}),
    ...(names.length ? { names } : {}),
  };
}

function normalizeSelectedMarksMaterial(input: {
  contextSummary?: SelectedMarkExplanationContextSummary;
  output?: JsonValue;
}): SelectedMarkExplanationResponseMaterial["selectedMarks"] {
  const summary = input.contextSummary?.selectedMarks;
  const output = isPlainObject(input.output) ? input.output : undefined;
  const items = cloneSelectedMarkSummaries(
    readSelectedMarkSummaryArray(output?.items) ?? summary?.items,
  );
  const worksheetNames = cloneStringList(
    readStringArray(output?.worksheetNames) ??
      summary?.worksheetNames ??
      input.contextSummary?.worksheetNames,
  );
  const fieldNames = uniqueStringList(
    cloneStringList(readStringArray(output?.fieldNames)).length
      ? cloneStringList(readStringArray(output?.fieldNames))
      : items.flatMap(
          (item) =>
            item.columns ??
            item.rows?.flatMap((row) =>
              row.values
                .map((cell) => cell.fieldName?.trim())
                .filter((value): value is string => Boolean(value)),
            ) ??
            [],
        ),
  );
  const count =
    readNumber(output?.count) ??
    summary?.totalCount ??
    items.length ??
    worksheetNames.length ??
    0;
  const available = readBoolean(output?.available) ?? count > 0;

  return {
    available,
    count,
    worksheetNames,
    fieldNames,
    items,
    summary:
      readString(output?.summary) ??
      (available
        ? buildSelectedMarksSummary({
            count,
            worksheetNames,
            items,
          })
        : "No selected marks are available."),
  };
}

function normalizeSummaryDataPreviewMaterial(input: {
  contextSummary?: SelectedMarkExplanationContextSummary;
  output?: JsonValue;
}): SelectedMarkExplanationResponseMaterial["summaryDataPreview"] {
  const summaryDataPreview = input.contextSummary?.summaryDataPreview;
  const output = isPlainObject(input.output) ? input.output : undefined;
  const available =
    readBoolean(output?.available) ?? Boolean(summaryDataPreview?.available);

  if (!available && !summaryDataPreview && !output) {
    return undefined;
  }

  const rowCount = readNumber(output?.rowCount) ?? summaryDataPreview?.rowCount;
  const columnCount =
    readNumber(output?.columnCount) ?? summaryDataPreview?.columnCount;
  const columnNames =
    readStringArray(output?.columnNames) ??
    summaryDataPreview?.columnNames ??
    undefined;
  const truncated =
    readBoolean(output?.truncated) ?? summaryDataPreview?.truncated;

  return {
    available,
    ...(rowCount !== undefined ? { rowCount } : {}),
    ...(columnCount !== undefined ? { columnCount } : {}),
    ...(columnNames?.length ? { columnNames: [...columnNames] } : {}),
    ...(truncated !== undefined ? { truncated } : {}),
  };
}

function normalizeNamedCountMaterial(input: {
  contextSummary?: SelectedMarkExplanationContextSummary;
  output?: JsonValue;
  key: "filters" | "parameters";
}):
  | SelectedMarkExplanationResponseMaterial["filters"]
  | SelectedMarkExplanationResponseMaterial["parameters"] {
  const source =
    input.key === "filters"
      ? input.contextSummary?.filters
      : input.contextSummary?.parameters;
  const output = isPlainObject(input.output) ? input.output : undefined;
  const names = cloneStringList(
    readStringArray(output?.names) ?? source?.names,
  );
  const count = readNumber(output?.count) ?? source?.count ?? names.length ?? 0;
  const available = readBoolean(output?.available) ?? count > 0;

  return {
    available,
    ...(count !== undefined ? { count } : {}),
    ...(names.length ? { names } : {}),
  };
}

function cloneStringList(values?: readonly string[] | string[]): string[] {
  return values ? [...values] : [];
}

function cloneSelectedMarkSummaries(
  values?: readonly SelectedMarkSummary[] | SelectedMarkSummary[],
): SelectedMarkSummary[] {
  return (values ?? []).map((item) => ({
    worksheetName: item.worksheetName,
    ...(item.columns?.length ? { columns: [...item.columns] } : {}),
    ...(item.rows?.length
      ? {
          rows: item.rows.map(
            (row): SelectedMarkRowSummary => ({
              values: row.values.map(
                (cell): SelectedMarkCellSummary => ({
                  fieldName: cell.fieldName ?? null,
                  raw: cell.raw,
                  display: cell.display,
                  isEmpty: cell.isEmpty,
                }),
              ),
            }),
          ),
        }
      : {}),
    ...(item.rowCount !== undefined ? { rowCount: item.rowCount } : {}),
    ...(item.status ? { status: item.status } : {}),
  }));
}

function readSelectedMarkSummaryArray(
  value: JsonValue | undefined,
): SelectedMarkSummary[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const items: SelectedMarkSummary[] = [];
  for (const item of value) {
    if (!isPlainObject(item) || typeof item.worksheetName !== "string") {
      continue;
    }

    const rows = Array.isArray(item.rows)
      ? item.rows
          .map((row): SelectedMarkRowSummary | undefined =>
            isPlainObject(row) && Array.isArray(row.values)
              ? {
                  values: row.values
                    .map((cell): SelectedMarkCellSummary | undefined =>
                      isPlainObject(cell)
                        ? {
                            fieldName:
                              typeof cell.fieldName === "string"
                                ? cell.fieldName
                                : cell.fieldName === null
                                  ? null
                                  : undefined,
                            raw: isCellValue(cell.raw) ? cell.raw : null,
                            display:
                              typeof cell.display === "string"
                                ? cell.display
                                : "",
                            isEmpty: Boolean(cell.isEmpty),
                          }
                        : undefined,
                    )
                    .filter((cell): cell is SelectedMarkCellSummary =>
                      Boolean(cell),
                    ),
                }
              : undefined,
          )
          .filter((row): row is SelectedMarkRowSummary => Boolean(row))
      : undefined;

    items.push({
      worksheetName: item.worksheetName,
      ...(Array.isArray(item.columns)
        ? {
            columns: item.columns.filter(
              (column): column is string => typeof column === "string",
            ),
          }
        : {}),
      ...(rows?.length ? { rows } : {}),
      ...(typeof item.rowCount === "number" ? { rowCount: item.rowCount } : {}),
      ...(item.status === "available" || item.status === "notAvailable"
        ? { status: item.status }
        : {}),
    });
  }

  return items;
}

function isCellValue(
  value: unknown,
): value is string | number | boolean | null {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function uniqueStringList(values: readonly string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

function buildSelectedMarksSummary(input: {
  count: number;
  worksheetNames: string[];
  items: SelectedMarkSummary[];
}): string {
  const worksheetCount = input.worksheetNames.length;
  const rowPreview = input.items
    .flatMap((item) =>
      (item.rows ?? []).slice(0, 2).map((row) =>
        row.values
          .map((cell) => {
            const fieldName = cell.fieldName?.trim();
            const display = cell.display.trim();
            if (!fieldName) {
              return display || "(empty)";
            }
            return display ? `${fieldName}=${display}` : `${fieldName}=(empty)`;
          })
          .filter(Boolean)
          .join(", "),
      ),
    )
    .filter(Boolean)
    .slice(0, 3);

  return [
    `Selected ${input.count} mark(s) across ${worksheetCount} worksheet(s).`,
    rowPreview.length ? `Row preview: ${rowPreview.join(" | ")}` : undefined,
  ]
    .filter(Boolean)
    .join(" ");
}

function readStringArray(value: JsonValue | undefined): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? (value as string[])
    : undefined;
}

function readNumber(value: JsonValue | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function readBoolean(value: JsonValue | undefined): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function readString(value: JsonValue | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isPlainObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
