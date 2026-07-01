import type { JsonObject, JsonValue } from "./types";

export type ResponseComposerStatus =
  | "composed"
  | "fallback"
  | "failed"
  | "skipped";

export type ResponseType =
  | "deterministic_summary"
  | "placeholder"
  | "fallback_message";

export type ResponseComposerNormalizationSummary = {
  jsonSafe: boolean;
  truncated: boolean;
  circularReferenceCount: number;
  depthExceeded: boolean;
  replacedValueCount: number;
  redactedValueCount: number;
};

export type ResponseComposerInput = {
  agentRunId?: string;
  intentId?: string;
  planId?: string;
  executionStatus?: string;
  responseStrategy?: string;
  responseMaterial?: unknown;
  toolResults?: unknown[];
  warnings?: string[];
  errors?: Array<{ message: string; code?: string }>;
  fallbackReason?: string;
  locale?: string;
  metadata?: JsonObject;
  traceMetadata?: JsonObject;
};

export type ResponseComposerResult = {
  status: ResponseComposerStatus;
  intentId?: string;
  planId?: string;
  responseType: ResponseType;
  message: string;
  summary?: JsonObject;
  sourceMaterialSummary?: JsonObject;
  warnings: string[];
  errors: Array<{ message: string; code?: string }>;
  fallbackReason?: string;
  metadata?: JsonObject;
  traceMetadata?: JsonObject;
  jsonSafe: boolean;
  normalization: ResponseComposerNormalizationSummary;
};

export interface ResponseComposer {
  compose(input: ResponseComposerInput): Promise<ResponseComposerResult>;
}

export type MinimalResponseComposerOptions = {
  defaultLocale?: string;
  maxDepth?: number;
  maxEntries?: number;
  maxStringLength?: number;
};

export class MinimalResponseComposer implements ResponseComposer {
  constructor(private readonly options: MinimalResponseComposerOptions = {}) {}

  async compose(input: ResponseComposerInput): Promise<ResponseComposerResult> {
    return composeResponse(input, this.options);
  }
}

export function createMinimalResponseComposer(
  options?: MinimalResponseComposerOptions,
): ResponseComposer {
  return new MinimalResponseComposer(options);
}

export function createDefaultResponseComposer(): ResponseComposer {
  return new MinimalResponseComposer();
}

export function composeResponse(
  input: ResponseComposerInput,
  options: MinimalResponseComposerOptions = {},
): ResponseComposerResult {
  if (input.intentId === "selected_mark_explanation") {
    return composeSelectedMarkExplanationResponse(input, options);
  }

  return composeFallbackResponse({
    input,
    options,
    responseType: "fallback_message",
    message:
      "This response type is not supported by the deterministic composer yet.",
    fallbackReason:
      input.fallbackReason ??
      "The deterministic composer does not yet support this intent.",
  });
}

export function composeSelectedMarkExplanationResponse(
  input: ResponseComposerInput,
  options: MinimalResponseComposerOptions = {},
): ResponseComposerResult {
  const material = normalizeSelectedMarkExplanationMaterial(
    input.responseMaterial,
    {
      maxDepth: options.maxDepth ?? 4,
      maxEntries: options.maxEntries ?? 24,
      maxStringLength: options.maxStringLength ?? 2_000,
    },
  );
  const warnings = dedupeStrings([
    ...(input.warnings ?? []),
    ...material.warnings,
  ]);
  const errors = normalizeErrors(input.errors);
  const locale = normalizeLocale(input.locale ?? options.defaultLocale);

  if (!material.selectedMarks.available || material.selectedMarks.count <= 0) {
    const sourceMaterialSummary = buildSelectedMarkSourceSummary(material);
    return composeFallbackResponse({
      input: { ...input, warnings, errors },
      options,
      responseType: "fallback_message",
      message: buildSelectedMarksFallbackMessage(locale),
      fallbackReason:
        input.fallbackReason ??
        "Select one or more marks in the Tableau view before asking for an explanation.",
      summary: sourceMaterialSummary,
      sourceMaterialSummary,
    });
  }

  const summary = normalizeJsonValue(material, {
    maxDepth: options.maxDepth ?? 4,
    maxEntries: options.maxEntries ?? 24,
    maxStringLength: options.maxStringLength ?? 2_000,
  });
  const sourceMaterialSummary = buildSelectedMarkSourceSummary(material);
  const traceMetadata = buildResponseComposerTraceMetadata({
    input,
    responseType: "deterministic_summary",
    status: "composed",
    sourceMaterialSummary,
    normalization: summary.normalization,
  });

  return {
    status: "composed",
    intentId: input.intentId ?? "selected_mark_explanation",
    planId: input.planId,
    responseType: "deterministic_summary",
    message: buildSelectedMarkExplanationMessage(material, locale),
    summary: isJsonObject(summary.value)
      ? {
          intentId: input.intentId ?? "selected_mark_explanation",
          ...summary.value,
        }
      : {
          ...sourceMaterialSummary,
        },
    sourceMaterialSummary,
    warnings,
    errors,
    ...(input.fallbackReason ? { fallbackReason: input.fallbackReason } : {}),
    ...(input.metadata ? { metadata: sanitizeJsonObject(input.metadata) } : {}),
    ...(traceMetadata ? { traceMetadata } : {}),
    jsonSafe: summary.normalization.jsonSafe,
    normalization: summary.normalization,
  };
}

export function buildSelectedMarkExplanationPlaceholderResponse(
  material: unknown,
): string {
  return composeSelectedMarkExplanationResponse({
    intentId: "selected_mark_explanation",
    responseMaterial: material,
  }).message;
}

function composeFallbackResponse(input: {
  input: ResponseComposerInput;
  options: MinimalResponseComposerOptions;
  responseType: ResponseType;
  message: string;
  fallbackReason?: string;
  summary?: JsonObject;
  sourceMaterialSummary?: JsonObject;
}): ResponseComposerResult {
  const normalizedSummary = input.summary
    ? normalizeJsonValue(input.summary, {
        maxDepth: input.options.maxDepth ?? 4,
        maxEntries: input.options.maxEntries ?? 24,
        maxStringLength: input.options.maxStringLength ?? 2_000,
      })
    : undefined;
  const summaryObject =
    (normalizedSummary && isJsonObject(normalizedSummary.value)
      ? normalizedSummary.value
      : undefined) ?? input.sourceMaterialSummary;
  const traceMetadata = buildResponseComposerTraceMetadata({
    input: input.input,
    responseType: input.responseType,
    status: "fallback",
    sourceMaterialSummary: summaryObject,
    normalization: normalizedSummary?.normalization,
    fallbackReason: input.fallbackReason,
  });

  return {
    status: "fallback",
    intentId: input.input.intentId,
    planId: input.input.planId,
    responseType: input.responseType,
    message: input.message,
    summary: summaryObject,
    sourceMaterialSummary: summaryObject,
    warnings: dedupeStrings(input.input.warnings ?? []),
    errors: normalizeErrors(input.input.errors),
    ...(input.fallbackReason ? { fallbackReason: input.fallbackReason } : {}),
    ...(input.input.metadata
      ? { metadata: sanitizeJsonObject(input.input.metadata) }
      : {}),
    ...(traceMetadata ? { traceMetadata } : {}),
    jsonSafe: normalizedSummary?.normalization.jsonSafe ?? true,
    normalization:
      normalizedSummary?.normalization ?? createEmptyNormalizationSummary(),
  };
}

function buildSelectedMarksFallbackMessage(locale: string): string {
  if (locale.startsWith("ja")) {
    return "Select one or more marks in the Tableau view before asking for an explanation.";
  }

  return "Select one or more marks in the Tableau view before asking for an explanation.";
}

function buildSelectedMarkExplanationMessage(
  material: SelectedMarkExplanationMaterial,
  locale: string,
): string {
  const summaryDataPreviewStatus = material.summaryDataPreview
    ? material.summaryDataPreview.available
      ? "available"
      : "unavailable"
    : "unavailable";

  const filterCount = material.filters?.count ?? 0;
  const parameterCount = material.parameters?.count ?? 0;

  if (locale.startsWith("ja")) {
    return [
      "Structured orchestration is connected for selected_mark_explanation.",
      "Selected mark context has been collected; actual AI response generation is not connected yet.",
      `Selected marks: ${material.selectedMarks.count}`,
      `Summary data preview: ${summaryDataPreviewStatus}`,
      `Filters: ${filterCount}`,
      `Parameters: ${parameterCount}`,
    ].join("\n");
  }

  return [
    "Structured orchestration is connected for selected_mark_explanation.",
    "Selected mark context has been collected; actual AI response generation is not connected yet.",
    `Selected marks: ${material.selectedMarks.count}`,
    `Summary data preview: ${summaryDataPreviewStatus}`,
    `Filters: ${filterCount}`,
    `Parameters: ${parameterCount}`,
  ].join("\n");
}

function buildSelectedMarkSourceSummary(
  material: SelectedMarkExplanationMaterial,
): JsonObject {
  return {
    intentId: "selected_mark_explanation",
    selectedMarks: {
      available: material.selectedMarks.available,
      count: material.selectedMarks.count,
      worksheetNames: [...material.selectedMarks.worksheetNames],
      fieldNames: [...material.selectedMarks.fieldNames],
    },
    ...(material.summaryDataPreview
      ? {
          summaryDataPreview: {
            available: material.summaryDataPreview.available,
            ...(material.summaryDataPreview.rowCount !== undefined
              ? { rowCount: material.summaryDataPreview.rowCount }
              : {}),
            ...(material.summaryDataPreview.columnCount !== undefined
              ? { columnCount: material.summaryDataPreview.columnCount }
              : {}),
            ...(material.summaryDataPreview.columnNames?.length
              ? {
                  columnNames: [...material.summaryDataPreview.columnNames],
                }
              : {}),
            ...(material.summaryDataPreview.truncated !== undefined
              ? { truncated: material.summaryDataPreview.truncated }
              : {}),
          },
        }
      : {}),
    ...(material.filters
      ? {
          filters: {
            available: material.filters.available,
            ...(material.filters.count !== undefined
              ? { count: material.filters.count }
              : {}),
            ...(material.filters.names?.length
              ? { names: [...material.filters.names] }
              : {}),
          },
        }
      : {}),
    ...(material.parameters
      ? {
          parameters: {
            available: material.parameters.available,
            ...(material.parameters.count !== undefined
              ? { count: material.parameters.count }
              : {}),
            ...(material.parameters.names?.length
              ? { names: [...material.parameters.names] }
              : {}),
          },
        }
      : {}),
    warnings: [...material.warnings],
  };
}

function buildResponseComposerTraceMetadata(input: {
  input: ResponseComposerInput;
  responseType: ResponseType;
  status: ResponseComposerStatus;
  sourceMaterialSummary?: JsonObject;
  normalization?: ResponseComposerNormalizationSummary;
  fallbackReason?: string;
}): JsonObject | undefined {
  const metadata: JsonObject = {
    composerType: "minimal",
    responseType: input.responseType,
    responseStatus: input.status,
  };

  if (input.input.agentRunId) {
    metadata.agentRunId = input.input.agentRunId;
  }
  if (input.input.intentId) {
    metadata.intentId = input.input.intentId;
  }
  if (input.input.planId) {
    metadata.planId = input.input.planId;
  }
  if (input.input.executionStatus) {
    metadata.executionStatus = input.input.executionStatus;
  }
  if (input.input.responseStrategy) {
    metadata.responseStrategy = input.input.responseStrategy;
  }
  if (input.input.locale) {
    metadata.locale = input.input.locale;
  }
  const fallbackReason = input.input.fallbackReason ?? input.fallbackReason;
  if (fallbackReason) {
    metadata.fallbackReason = fallbackReason;
  }
  if (input.input.warnings?.length) {
    metadata.warnings = dedupeStrings(input.input.warnings);
  }
  if (input.input.errors?.length) {
    metadata.errors = normalizeErrors(input.input.errors);
  }
  if (input.sourceMaterialSummary) {
    metadata.sourceMaterialSummary = sanitizeJsonObject(
      input.sourceMaterialSummary,
    );
  }
  if (input.normalization) {
    metadata.normalization = { ...input.normalization };
  }
  if (input.input.traceMetadata) {
    metadata.traceMetadata = sanitizeJsonObject(input.input.traceMetadata);
  }
  if (input.input.metadata) {
    metadata.metadata = sanitizeJsonObject(input.input.metadata);
  }

  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

function normalizeSelectedMarkExplanationMaterial(
  value: unknown,
  options: {
    maxDepth: number;
    maxEntries: number;
    maxStringLength: number;
  },
): SelectedMarkExplanationMaterial {
  const output = isPlainObject(value) ? value : undefined;
  const warnings = dedupeStrings(readStringArray(output?.warnings) ?? []);
  const selectedMarksInput = isPlainObject(output?.selectedMarks)
    ? output?.selectedMarks
    : undefined;
  const selectedMarksCount = readNumber(selectedMarksInput?.count) ?? 0;
  const selectedMarkAvailable =
    readBoolean(selectedMarksInput?.available) ?? selectedMarksCount > 0;
  const selectedMarkWorksheetNames =
    readStringArray(selectedMarksInput?.worksheetNames) ?? [];
  const selectedMarkFieldNames =
    readStringArray(selectedMarksInput?.fieldNames) ?? [];

  const summaryDataPreview = isPlainObject(output?.summaryDataPreview)
    ? output?.summaryDataPreview
    : undefined;
  const filters = isPlainObject(output?.filters) ? output?.filters : undefined;
  const parameters = isPlainObject(output?.parameters)
    ? output?.parameters
    : undefined;

  return {
    selectedMarks: {
      available: selectedMarkAvailable,
      count: selectedMarksCount,
      worksheetNames: normalizeStringArray(
        selectedMarkWorksheetNames,
        options.maxEntries,
        options.maxStringLength,
      ),
      fieldNames: normalizeStringArray(
        selectedMarkFieldNames,
        options.maxEntries,
        options.maxStringLength,
      ),
      summary:
        readString(selectedMarksInput?.summary) ??
        (selectedMarkAvailable
          ? `Selected ${selectedMarksCount} marks across ${selectedMarkWorksheetNames.length} worksheet(s).`
          : "No selected marks are available."),
    },
    ...(summaryDataPreview
      ? {
          summaryDataPreview: {
            available: readBoolean(summaryDataPreview.available) ?? false,
            ...(readNumber(summaryDataPreview.rowCount) !== undefined
              ? { rowCount: readNumber(summaryDataPreview.rowCount) }
              : {}),
            ...(readNumber(summaryDataPreview.columnCount) !== undefined
              ? { columnCount: readNumber(summaryDataPreview.columnCount) }
              : {}),
            ...(readStringArray(summaryDataPreview.columnNames)?.length
              ? {
                  columnNames: normalizeStringArray(
                    readStringArray(summaryDataPreview.columnNames) ?? [],
                    options.maxEntries,
                    options.maxStringLength,
                  ),
                }
              : {}),
            ...(typeof summaryDataPreview.truncated === "boolean"
              ? { truncated: summaryDataPreview.truncated }
              : {}),
          },
        }
      : {}),
    ...(filters
      ? {
          filters: {
            available: readBoolean(filters.available) ?? false,
            ...(readNumber(filters.count) !== undefined
              ? { count: readNumber(filters.count) }
              : {}),
            ...(readStringArray(filters.names)?.length
              ? {
                  names: normalizeStringArray(
                    readStringArray(filters.names) ?? [],
                    options.maxEntries,
                    options.maxStringLength,
                  ),
                }
              : {}),
          },
        }
      : {}),
    ...(parameters
      ? {
          parameters: {
            available: readBoolean(parameters.available) ?? false,
            ...(readNumber(parameters.count) !== undefined
              ? { count: readNumber(parameters.count) }
              : {}),
            ...(readStringArray(parameters.names)?.length
              ? {
                  names: normalizeStringArray(
                    readStringArray(parameters.names) ?? [],
                    options.maxEntries,
                    options.maxStringLength,
                  ),
                }
              : {}),
          },
        }
      : {}),
    warnings,
  };
}

function normalizeJsonValue(
  value: unknown,
  options: {
    maxDepth: number;
    maxEntries: number;
    maxStringLength: number;
  },
): {
  value: JsonValue;
  normalization: ResponseComposerNormalizationSummary;
} {
  const state = createNormalizationState();
  const normalized = normalizeValue(value, options, state, 0, new WeakSet());

  return {
    value: normalized,
    normalization: {
      jsonSafe: true,
      truncated: state.truncated,
      circularReferenceCount: state.circularReferenceCount,
      depthExceeded: state.depthExceeded,
      replacedValueCount: state.replacedValueCount,
      redactedValueCount: state.redactedValueCount,
    },
  };
}

function normalizeValue(
  value: unknown,
  options: {
    maxDepth: number;
    maxEntries: number;
    maxStringLength: number;
  },
  state: {
    truncated: boolean;
    circularReferenceCount: number;
    depthExceeded: boolean;
    replacedValueCount: number;
    redactedValueCount: number;
  },
  depth: number,
  seen: WeakSet<object>,
): JsonValue {
  if (value === null) {
    return null;
  }

  if (typeof value === "string") {
    return truncateString(value, options.maxStringLength, state);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "bigint") {
    state.replacedValueCount += 1;
    return value.toString();
  }

  if (typeof value === "undefined") {
    state.replacedValueCount += 1;
    return null;
  }

  if (typeof value === "function") {
    state.replacedValueCount += 1;
    return "[Function]";
  }

  if (typeof value === "symbol") {
    state.replacedValueCount += 1;
    return String(value);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      ...(value.stack
        ? { stack: truncateString(value.stack, options.maxStringLength, state) }
        : {}),
    };
  }

  if (Array.isArray(value)) {
    if (depth >= options.maxDepth) {
      state.depthExceeded = true;
      state.truncated = true;
      return {
        kind: "array",
        truncated: true,
        length: value.length,
      };
    }

    const items: JsonValue[] = [];
    const limit = Math.min(value.length, options.maxEntries);
    for (let index = 0; index < limit; index += 1) {
      items.push(normalizeValue(value[index], options, state, depth + 1, seen));
    }

    if (value.length > limit) {
      state.truncated = true;
      items.push("[Truncated]");
    }

    return items;
  }

  if (!isPlainObject(value)) {
    state.replacedValueCount += 1;
    return truncateString(
      Object.prototype.toString.call(value),
      options.maxStringLength,
      state,
    );
  }

  if (seen.has(value)) {
    state.circularReferenceCount += 1;
    state.truncated = true;
    return "[Circular]";
  }

  seen.add(value);

  if (depth >= options.maxDepth) {
    state.depthExceeded = true;
    state.truncated = true;
    const keys = Object.keys(value).slice(0, options.maxEntries);
    return {
      kind: "object",
      truncated: true,
      keys,
      keyCount: Object.keys(value).length,
    };
  }

  const output: JsonObject = {};
  const entries = Object.entries(value);
  const limit = Math.min(entries.length, options.maxEntries);

  for (let index = 0; index < limit; index += 1) {
    const [key, item] = entries[index];
    output[key] = shouldRedactKey(key)
      ? redactValue(item, options, state)
      : normalizeValue(item, options, state, depth + 1, seen);
  }

  if (entries.length > limit) {
    state.truncated = true;
    output.__truncated__ = true;
    output.__keyCount__ = entries.length;
  }

  return output;
}

function redactValue(
  value: unknown,
  options: {
    maxDepth: number;
    maxEntries: number;
    maxStringLength: number;
  },
  state: {
    truncated: boolean;
    circularReferenceCount: number;
    depthExceeded: boolean;
    replacedValueCount: number;
    redactedValueCount: number;
  },
): JsonValue {
  state.redactedValueCount += 1;
  if (typeof value === "string") {
    return "[REDACTED]";
  }

  return normalizeValue("[REDACTED]", options, state, 0, new WeakSet());
}

function shouldRedactKey(key: string): boolean {
  return /(?:token|secret|password|authorization|auth|api[-_]?key|access[-_]?token)/i.test(
    key,
  );
}

function createEmptyNormalizationSummary(): ResponseComposerNormalizationSummary {
  return {
    jsonSafe: true,
    truncated: false,
    circularReferenceCount: 0,
    depthExceeded: false,
    replacedValueCount: 0,
    redactedValueCount: 0,
  };
}

function createNormalizationState(): {
  truncated: boolean;
  circularReferenceCount: number;
  depthExceeded: boolean;
  replacedValueCount: number;
  redactedValueCount: number;
} {
  return {
    truncated: false,
    circularReferenceCount: 0,
    depthExceeded: false,
    replacedValueCount: 0,
    redactedValueCount: 0,
  };
}

function truncateString(
  value: string,
  maxLength: number,
  state: {
    truncated: boolean;
    circularReferenceCount: number;
    depthExceeded: boolean;
    replacedValueCount: number;
    redactedValueCount: number;
  },
): string {
  if (value.length <= maxLength) {
    return value;
  }

  state.truncated = true;
  return `${value.slice(0, maxLength)}...`;
}

function sanitizeJsonObject(value: JsonObject): JsonObject {
  const normalized = normalizeJsonValue(value, {
    maxDepth: 4,
    maxEntries: 24,
    maxStringLength: 2_000,
  });

  return isJsonObject(normalized.value) ? normalized.value : {};
}

function normalizeStringArray(
  values: readonly string[],
  maxEntries: number,
  maxStringLength: number,
): string[] {
  const normalized = values
    .map((value) =>
      truncateString(value, maxStringLength, createNormalizationState()),
    )
    .filter((value) => value.length > 0);

  return normalized.slice(0, maxEntries);
}

function normalizeLocale(value?: string): string {
  const normalized = value?.trim();
  return normalized ? normalized.toLowerCase() : "en";
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function readString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

function readStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? (value as string[])
    : undefined;
}

function dedupeStrings(values: readonly string[]): string[] {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean)),
  );
}

function normalizeErrors(
  errors: Array<{ message: string; code?: string }> | undefined,
): Array<{ message: string; code?: string }> {
  return (errors ?? []).map((error) => ({
    message: truncateString(error.message, 2_000, createNormalizationState()),
    ...(error.code
      ? {
          code: truncateString(error.code, 120, createNormalizationState()),
        }
      : {}),
  }));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isJsonObject(value: unknown): value is JsonObject {
  return isPlainObject(value);
}

type SelectedMarkExplanationMaterial = {
  selectedMarks: {
    available: boolean;
    count: number;
    worksheetNames: string[];
    fieldNames: string[];
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
