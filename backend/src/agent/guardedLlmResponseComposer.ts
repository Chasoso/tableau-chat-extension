import {
  createDefaultResponseComposer,
  type ResponseComposer,
  type ResponseComposerInput,
  type ResponseComposerResult,
  type ResponseType,
} from "./responseComposer";
import type { JsonObject, JsonValue } from "./types";

export type GuardedLlmResponseComposerMode = "disabled" | "fake";

export type GuardedLlmResponseComposerFallbackReason =
  | "composer_disabled"
  | "composer_not_configured"
  | "composer_timeout"
  | "composer_error"
  | "composer_invalid_output"
  | "composer_unsafe_output"
  | "composer_missing_required_limitations"
  | "composer_output_too_long";

export type LlmResponseComposerSourceKind =
  | "selected_mark_explanation"
  | "metadata_discovery"
  | "clarification"
  | "fallback"
  | "unknown";

export type LlmResponseComposerEvidenceSourceType =
  | "metadata_discovery"
  | "selected_mark_explanation"
  | "clarification"
  | "trace_summary"
  | "limitation";

export type LlmResponseComposerEvidence = {
  id: string;
  sourceType: LlmResponseComposerEvidenceSourceType;
  summary: string;
};

export type LlmResponseComposerCitation = {
  id: string;
  label: string;
  sourceType: LlmResponseComposerEvidenceSourceType;
};

export type LlmResponseComposerMaterial = {
  materialVersion: "v1";
  responseType: ResponseType;
  intent: string;
  sourceKind: LlmResponseComposerSourceKind;
  userRequestSummary?: string;
  targetSummary?: string;
  evidence: LlmResponseComposerEvidence[];
  citations: LlmResponseComposerCitation[];
  facts: string[];
  limitations: string[];
  warnings: string[];
  safetyNotes: string[];
  traceSafeSummary: JsonObject;
  fallbackSummary?: string;
  composerInstructions: string[];
  prohibitedClaims: string[];
  requiredDisclosures: string[];
};

export type LlmResponseComposerAdapter = {
  compose(material: LlmResponseComposerMaterial): Promise<unknown>;
};

export type GuardedLlmResponseComposerOptions = {
  enabled?: boolean;
  mode?: GuardedLlmResponseComposerMode;
  timeoutMs?: number;
  maxInputChars?: number;
  maxOutputChars?: number;
  adapter?: LlmResponseComposerAdapter;
  fallbackComposer?: ResponseComposer;
};

export type GuardedLlmResponseComposerConfig = {
  enabled: boolean;
  mode: GuardedLlmResponseComposerMode;
  timeoutMs: number;
  maxInputChars: number;
  maxOutputChars: number;
};

export type LlmResponseComposerAdapterMode =
  | "success"
  | "timeout"
  | "error"
  | "unsafe_output"
  | "invalid_output";

export type LlmResponseComposerValidationResult =
  | {
      ok: true;
      output: string;
    }
  | {
      ok: false;
      reason: GuardedLlmResponseComposerFallbackReason;
    };

export function readGuardedLlmResponseComposerConfig(
  env: NodeJS.ProcessEnv = process.env,
): GuardedLlmResponseComposerConfig {
  const enabled = env.ENABLE_LLM_RESPONSE_COMPOSER === "true";
  const mode = parseMode(env.LLM_RESPONSE_COMPOSER_MODE);

  return {
    enabled,
    mode: enabled ? mode : "disabled",
    timeoutMs: parsePositiveInt(env.LLM_RESPONSE_COMPOSER_TIMEOUT_MS, 1000),
    maxInputChars: parsePositiveInt(
      env.LLM_RESPONSE_COMPOSER_MAX_INPUT_CHARS,
      8000,
    ),
    maxOutputChars: parsePositiveInt(
      env.LLM_RESPONSE_COMPOSER_MAX_OUTPUT_CHARS,
      2000,
    ),
  };
}

export class GuardedLlmResponseComposer implements ResponseComposer {
  private readonly fallbackComposer: ResponseComposer;

  constructor(
    private readonly options: GuardedLlmResponseComposerOptions = {},
  ) {
    this.fallbackComposer =
      options.fallbackComposer ?? createDefaultResponseComposer();
  }

  async compose(input: ResponseComposerInput): Promise<ResponseComposerResult> {
    const deterministicResult = await this.fallbackComposer.compose(input);
    const config = resolveGuardedComposerConfig(this.options);

    if (!config.enabled) {
      return annotateComposerResult(deterministicResult, {
        status: "disabled",
        fallbackReason: "composer_disabled",
        mode: config.mode,
        material: buildLlmResponseMaterial({
          composerInput: input,
          deterministicResult,
          sourceKind: resolveSourceKind(input.intentId, deterministicResult),
          maxInputChars: config.maxInputChars,
        }),
      });
    }

    const adapter =
      this.options.adapter ??
      (config.mode === "fake"
        ? createFakeLlmResponseComposerAdapter("success")
        : undefined);

    if (!adapter) {
      return annotateComposerResult(deterministicResult, {
        status: "disabled",
        fallbackReason: "composer_not_configured",
        mode: config.mode,
        material: buildLlmResponseMaterial({
          composerInput: input,
          deterministicResult,
          sourceKind: resolveSourceKind(input.intentId, deterministicResult),
          maxInputChars: config.maxInputChars,
        }),
      });
    }

    const material = buildLlmResponseMaterial({
      composerInput: input,
      deterministicResult,
      sourceKind: resolveSourceKind(input.intentId, deterministicResult),
      maxInputChars: config.maxInputChars,
    });
    const materialValidation = validateLlmResponseMaterial(
      material,
      config.maxInputChars,
    );
    if (!materialValidation.ok) {
      return annotateComposerResult(deterministicResult, {
        status: "disabled",
        fallbackReason: materialValidation.reason,
        mode: config.mode,
        material,
      });
    }

    let output: unknown;
    try {
      output = await withTimeout(
        Promise.resolve(adapter.compose(materialValidation.material)),
        config.timeoutMs,
      );
    } catch (error) {
      const reason = isTimeoutError(error)
        ? "composer_timeout"
        : "composer_error";
      return annotateComposerResult(deterministicResult, {
        status: "disabled",
        fallbackReason: reason,
        mode: config.mode,
        material: materialValidation.material,
      });
    }

    const outputValidation = validateLlmResponseOutput(
      output,
      materialValidation.material,
      config.maxOutputChars,
    );
    if (!outputValidation.ok) {
      return annotateComposerResult(deterministicResult, {
        status: "disabled",
        fallbackReason: outputValidation.reason,
        mode: config.mode,
        material: materialValidation.material,
      });
    }

    return annotateComposerResult(
      {
        ...deterministicResult,
        status: "composed",
        message: outputValidation.output,
      },
      {
        status: "composed",
        mode: config.mode,
        material: materialValidation.material,
      },
    );
  }
}

export function createGuardedLlmResponseComposer(
  options?: GuardedLlmResponseComposerOptions,
): ResponseComposer {
  return new GuardedLlmResponseComposer(options);
}

export function createFakeLlmResponseComposerAdapter(
  mode: LlmResponseComposerAdapterMode = "success",
): LlmResponseComposerAdapter {
  return {
    async compose(material: LlmResponseComposerMaterial): Promise<unknown> {
      switch (mode) {
        case "timeout":
          return new Promise<unknown>(() => {
            // Intentionally never resolves so the wrapper timeout path can be exercised.
          });
        case "error":
          throw new Error("Fake LLM composer error.");
        case "unsafe_output":
          return "Use Tableau MCP to run SELECT * FROM raw_table";
        case "invalid_output":
          return {
            message: "This is not a valid string output.",
          };
        case "success":
        default:
          return buildFakeSuccessMessage(material);
      }
    },
  };
}

export function buildLlmResponseMaterial(input: {
  composerInput: ResponseComposerInput;
  deterministicResult: ResponseComposerResult;
  sourceKind: LlmResponseComposerSourceKind;
  maxInputChars: number;
}): LlmResponseComposerMaterial {
  const warningList = dedupeStrings([
    ...(input.deterministicResult.warnings ?? []),
    ...(input.deterministicResult.fallbackReason
      ? [input.deterministicResult.fallbackReason]
      : []),
  ]);
  const limitations = dedupeStrings([
    ...warningList,
    ...(input.deterministicResult.normalization.truncated
      ? ["response truncated"]
      : []),
    ...(input.deterministicResult.normalization.depthExceeded
      ? ["response depth exceeded"]
      : []),
    ...(input.deterministicResult.normalization.redactedValueCount > 0
      ? ["response redacted"]
      : []),
  ]);
  const requiredDisclosures = dedupeStrings([
    ...limitations,
    ...(input.deterministicResult.fallbackReason
      ? [input.deterministicResult.fallbackReason]
      : []),
  ]);
  const intent =
    input.deterministicResult.intentId ?? input.composerInput.intentId;
  const responseType = input.deterministicResult.responseType;

  return {
    materialVersion: "v1",
    responseType,
    intent: intent ?? "unknown",
    sourceKind: input.sourceKind,
    userRequestSummary: summarizeComposerInput(input.composerInput),
    targetSummary: summarizeJsonValue(
      input.deterministicResult.summary ??
        input.deterministicResult.sourceMaterialSummary,
      input.maxInputChars,
    ),
    evidence: buildEvidence(
      input.deterministicResult,
      input.sourceKind,
      input.maxInputChars,
    ),
    citations: buildCitations(input.deterministicResult, input.sourceKind),
    facts: buildFacts(input.deterministicResult, input.maxInputChars),
    limitations,
    warnings: warningList,
    safetyNotes: buildSafetyNotes(),
    traceSafeSummary: buildTraceSafeSummary(
      input.composerInput,
      input.deterministicResult,
      input.sourceKind,
      limitations,
    ),
    fallbackSummary: input.deterministicResult.fallbackReason,
    composerInstructions: buildComposerInstructions(),
    prohibitedClaims: buildProhibitedClaims(),
    requiredDisclosures,
  };
}

export function validateLlmResponseMaterial(
  material: LlmResponseComposerMaterial,
  maxInputChars: number,
): LlmResponseComposerValidationResult & {
  material: LlmResponseComposerMaterial;
} {
  if (!isPlainObject(material)) {
    return {
      ok: false,
      reason: "composer_invalid_output",
      material,
    };
  }

  let cloned: LlmResponseComposerMaterial;
  try {
    cloned = cloneJsonValue(material) as LlmResponseComposerMaterial;
  } catch {
    return {
      ok: false,
      reason: "composer_invalid_output",
      material,
    };
  }
  if (
    cloned.materialVersion !== "v1" ||
    !isResponseType(cloned.responseType) ||
    typeof cloned.intent !== "string" ||
    !isSourceKind(cloned.sourceKind)
  ) {
    return {
      ok: false,
      reason: "composer_invalid_output",
      material: cloned,
    };
  }

  if (
    typeof cloned.userRequestSummary === "string" &&
    cloned.userRequestSummary.length > maxInputChars
  ) {
    return {
      ok: false,
      reason: "composer_invalid_output",
      material: cloned,
    };
  }

  if (
    typeof cloned.targetSummary === "string" &&
    cloned.targetSummary.length > maxInputChars
  ) {
    return {
      ok: false,
      reason: "composer_invalid_output",
      material: cloned,
    };
  }

  if (!Array.isArray(cloned.requiredDisclosures)) {
    return {
      ok: false,
      reason: "composer_invalid_output",
      material: cloned,
    };
  }

  if (
    !isStringArray(cloned.limitations) ||
    !isStringArray(cloned.warnings) ||
    !isStringArray(cloned.safetyNotes) ||
    !isStringArray(cloned.facts) ||
    !isStringArray(cloned.prohibitedClaims) ||
    !isStringArray(cloned.composerInstructions) ||
    !isStringArray(cloned.requiredDisclosures) ||
    !isEvidenceArray(cloned.evidence) ||
    !isCitationArray(cloned.citations) ||
    !isPlainObject(cloned.traceSafeSummary)
  ) {
    return {
      ok: false,
      reason: "composer_invalid_output",
      material: cloned,
    };
  }

  return {
    ok: true,
    output: "",
    material: cloned,
  };
}

export function validateLlmResponseOutput(
  output: unknown,
  material: LlmResponseComposerMaterial,
  maxOutputChars: number,
): LlmResponseComposerValidationResult {
  if (typeof output !== "string") {
    return {
      ok: false,
      reason: "composer_invalid_output",
    };
  }

  const normalized = output.trim();
  if (!normalized) {
    return {
      ok: false,
      reason: "composer_invalid_output",
    };
  }

  if (normalized.length > maxOutputChars) {
    return {
      ok: false,
      reason: "composer_output_too_long",
    };
  }

  if (containsProhibitedComposerOutput(normalized)) {
    return {
      ok: false,
      reason: "composer_unsafe_output",
    };
  }

  const missingDisclosures = material.requiredDisclosures.filter(
    (disclosure) =>
      !normalized.toLowerCase().includes(disclosure.toLowerCase()),
  );
  if (missingDisclosures.length > 0) {
    return {
      ok: false,
      reason: "composer_missing_required_limitations",
    };
  }

  return {
    ok: true,
    output: normalized,
  };
}

function annotateComposerResult(
  result: ResponseComposerResult,
  input: {
    status: "disabled" | "composed";
    fallbackReason?: GuardedLlmResponseComposerFallbackReason;
    mode: GuardedLlmResponseComposerMode;
    material: LlmResponseComposerMaterial;
  },
): ResponseComposerResult {
  const metadata = mergeJsonObjects(result.metadata, {
    llmComposer: {
      status: input.status,
      mode: input.mode,
      materialVersion: input.material.materialVersion,
      sourceKind: input.material.sourceKind,
      ...(input.fallbackReason ? { fallbackReason: input.fallbackReason } : {}),
      evidenceCount: input.material.evidence.length,
      limitationCount: input.material.limitations.length,
    },
  });
  const traceMetadata = mergeJsonObjects(result.traceMetadata, {
    llmComposer: {
      status: input.status,
      mode: input.mode,
      materialVersion: input.material.materialVersion,
      sourceKind: input.material.sourceKind,
      ...(input.fallbackReason ? { fallbackReason: input.fallbackReason } : {}),
      evidenceCount: input.material.evidence.length,
      limitationCount: input.material.limitations.length,
    },
  });

  return {
    ...result,
    ...(metadata ? { metadata } : {}),
    ...(traceMetadata ? { traceMetadata } : {}),
  };
}

function resolveGuardedComposerConfig(
  options: GuardedLlmResponseComposerOptions,
): GuardedLlmResponseComposerConfig {
  if (options.enabled === false) {
    return {
      enabled: false,
      mode: "disabled",
      timeoutMs: options.timeoutMs ?? 1000,
      maxInputChars: options.maxInputChars ?? 8000,
      maxOutputChars: options.maxOutputChars ?? 2000,
    };
  }

  return {
    enabled: options.enabled ?? false,
    mode: options.mode ?? "fake",
    timeoutMs: options.timeoutMs ?? 1000,
    maxInputChars: options.maxInputChars ?? 8000,
    maxOutputChars: options.maxOutputChars ?? 2000,
  };
}

function buildFakeSuccessMessage(
  material: LlmResponseComposerMaterial,
): string {
  const lines = [
    "LLM composition is safely guarded.",
    `Intent: ${material.intent}`,
    `Response type: ${material.responseType}`,
    `Source kind: ${material.sourceKind}`,
    ...material.facts.map((fact) => `Fact: ${fact}`),
    ...material.limitations.map((limitation) => `Limitation: ${limitation}`),
    ...material.requiredDisclosures.map((item) => `Disclosure: ${item}`),
  ];

  return lines.join("\n");
}

function buildEvidence(
  deterministicResult: ResponseComposerResult,
  sourceKind: LlmResponseComposerSourceKind,
  maxInputChars: number,
): LlmResponseComposerEvidence[] {
  const summary = summarizeJsonValue(
    deterministicResult.sourceMaterialSummary ??
      deterministicResult.summary ??
      {},
    maxInputChars,
  );
  const evidence: LlmResponseComposerEvidence[] = [
    {
      id: `${sourceKind}.summary`,
      sourceType: sourceKindToEvidenceSourceType(sourceKind),
      summary,
    },
  ];

  if (deterministicResult.traceMetadata) {
    evidence.push({
      id: `${sourceKind}.trace`,
      sourceType: "trace_summary",
      summary: summarizeJsonValue(
        deterministicResult.traceMetadata,
        maxInputChars,
      ),
    });
  }

  return evidence;
}

function buildCitations(
  deterministicResult: ResponseComposerResult,
  sourceKind: LlmResponseComposerSourceKind,
): LlmResponseComposerCitation[] {
  const citations: LlmResponseComposerCitation[] = [
    {
      id: `${sourceKind}.summary`,
      label: `${sourceKind} summary`,
      sourceType: sourceKindToEvidenceSourceType(sourceKind),
    },
  ];

  if (deterministicResult.traceMetadata) {
    citations.push({
      id: `${sourceKind}.trace`,
      label: `${sourceKind} trace summary`,
      sourceType: "trace_summary",
    });
  }

  return citations;
}

function buildFacts(
  deterministicResult: ResponseComposerResult,
  maxInputChars: number,
): string[] {
  const facts = dedupeStrings([
    `status=${deterministicResult.status}`,
    `responseType=${deterministicResult.responseType}`,
    ...(deterministicResult.intentId
      ? [`intent=${deterministicResult.intentId}`]
      : []),
    ...(deterministicResult.planId
      ? [`plan=${deterministicResult.planId}`]
      : []),
    ...(deterministicResult.sourceMaterialSummary
      ? [
          `source=${summarizeJsonValue(deterministicResult.sourceMaterialSummary, maxInputChars)}`,
        ]
      : []),
  ]);

  return facts;
}

function buildSafetyNotes(): string[] {
  return [
    "Use only the provided evidence.",
    "Do not add unsupported facts.",
    "Preserve required limitations.",
    "Do not create tool calls.",
    "Do not generate queries.",
  ];
}

function buildComposerInstructions(): string[] {
  return [
    "Use only the provided evidence.",
    "Do not add unsupported facts.",
    "Preserve required disclosures.",
    "Represent unknowns as unknown.",
    "Do not create tool calls.",
    "Do not generate queries.",
  ];
}

function buildProhibitedClaims(): string[] {
  return [
    "raw MCP output",
    "raw transport output",
    "raw Tableau response",
    "underlying data",
    "field values",
    "row data",
    "write actions",
    "arbitrary queries",
  ];
}

function buildTraceSafeSummary(
  composerInput: ResponseComposerInput,
  deterministicResult: ResponseComposerResult,
  sourceKind: LlmResponseComposerSourceKind,
  limitations: string[],
): JsonObject {
  return {
    intentId:
      composerInput.intentId ?? deterministicResult.intentId ?? "unknown",
    planId: composerInput.planId ?? deterministicResult.planId ?? "unknown",
    responseType: deterministicResult.responseType,
    responseStatus: deterministicResult.status,
    sourceKind,
    limitationCount: limitations.length,
    warningCount: deterministicResult.warnings.length,
    jsonSafe: deterministicResult.jsonSafe,
  };
}

function summarizeComposerInput(input: ResponseComposerInput): string {
  const parts = [
    input.intentId ? `intent=${input.intentId}` : "intent=unknown",
    input.planId ? `plan=${input.planId}` : "plan=unknown",
    input.responseStrategy
      ? `strategy=${input.responseStrategy}`
      : "strategy=unknown",
    input.executionStatus
      ? `status=${input.executionStatus}`
      : "status=unknown",
  ];

  return parts.join("; ");
}

function summarizeJsonValue(value: unknown, maxLength: number): string {
  const json = safeJsonStringify(value);
  if (json.length <= maxLength) {
    return json;
  }

  return `${json.slice(0, maxLength)}...`;
}

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? "null";
  } catch {
    return "[unserializable]";
  }
}

function containsProhibitedComposerOutput(value: string): boolean {
  const patterns = [
    /raw\s+mcp/i,
    /raw\s+transport/i,
    /raw\s+tableau/i,
    /access\s*token/i,
    /authorization/i,
    /\bsecret\b/i,
    /\bpassword\b/i,
    /\boauth\b/i,
    /\bstack\s*trace\b/i,
    /\btableau\.metadata\./i,
    /\bselect\s+\*/i,
    /\bdrop\s+table\b/i,
    /\binsert\s+into\b/i,
    /\bupdate\s+\w+\b/i,
    /\bdelete\s+from\b/i,
    /\bexecute\b.*\bquery\b/i,
    /\btool\s+call\b/i,
    /\barbitrary\s+query\b/i,
  ];

  return patterns.some((pattern) => pattern.test(value));
}

function sourceKindToEvidenceSourceType(
  sourceKind: LlmResponseComposerSourceKind,
): LlmResponseComposerEvidenceSourceType {
  switch (sourceKind) {
    case "selected_mark_explanation":
      return "selected_mark_explanation";
    case "metadata_discovery":
      return "metadata_discovery";
    case "clarification":
      return "clarification";
    case "fallback":
      return "limitation";
    case "unknown":
    default:
      return "trace_summary";
  }
}

function parseMode(value?: string): GuardedLlmResponseComposerMode {
  return value === "disabled" ? "disabled" : "fake";
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.floor(parsed);
}

function mergeJsonObjects(
  left: JsonObject | undefined,
  right: JsonObject | undefined,
): JsonObject | undefined {
  if (!left && !right) {
    return undefined;
  }

  return {
    ...(left ? cloneJsonObject(left) : {}),
    ...(right ? cloneJsonObject(right) : {}),
  };
}

function cloneJsonObject(value: JsonObject): JsonObject {
  return cloneJsonValue(value) as JsonObject;
}

function cloneJsonValue(value: JsonValue): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function isEvidenceArray(
  value: unknown,
): value is LlmResponseComposerEvidence[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        isPlainObject(item) &&
        typeof item.id === "string" &&
        typeof item.sourceType === "string" &&
        typeof item.summary === "string",
    )
  );
}

function isCitationArray(
  value: unknown,
): value is LlmResponseComposerCitation[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        isPlainObject(item) &&
        typeof item.id === "string" &&
        typeof item.label === "string" &&
        typeof item.sourceType === "string",
    )
  );
}

function isResponseType(value: unknown): value is ResponseType {
  return (
    value === "deterministic_summary" ||
    value === "placeholder" ||
    value === "fallback_message"
  );
}

function isSourceKind(value: unknown): value is LlmResponseComposerSourceKind {
  return (
    value === "selected_mark_explanation" ||
    value === "metadata_discovery" ||
    value === "clarification" ||
    value === "fallback" ||
    value === "unknown"
  );
}

function dedupeStrings(values: readonly string[]): string[] {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean)),
  );
}

function resolveSourceKind(
  intentId: string | undefined,
  deterministicResult: ResponseComposerResult,
): LlmResponseComposerSourceKind {
  if (intentId === "selected_mark_explanation") {
    return "selected_mark_explanation";
  }

  if (intentId === "metadata_discovery") {
    return "metadata_discovery";
  }

  if (deterministicResult.responseType === "fallback_message") {
    return "fallback";
  }

  return "unknown";
}

function isPlainObject(value: unknown): value is JsonObject {
  if (!value || typeof value !== "object") {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return promise;
  }

  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new TimeoutError("LLM composer timed out."));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timeout);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeout);
        reject(error);
      });
  });
}

function isTimeoutError(error: unknown): boolean {
  return error instanceof TimeoutError;
}

class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimeoutError";
  }
}
