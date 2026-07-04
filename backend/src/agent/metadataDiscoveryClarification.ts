import type { JsonObject } from "./types";
import type {
  MetadataDiscoveryAmbiguityState,
  MetadataDiscoveryIntentDecision,
  MetadataDiscoveryIntentId,
  MetadataDiscoveryPreconditionId,
  MetadataDiscoveryTargetType,
} from "./metadataDiscoveryIntent";

export type MetadataDiscoveryClarificationReasonCode =
  | "missing_target"
  | "ambiguous_target_type"
  | "missing_identifier"
  | "multiple_target_candidates"
  | "target_not_resolvable_from_context"
  | "unsafe_data_access_request"
  | "unsupported_write_request"
  | "metadata_query_boundary_conflict"
  | "unsupported_discovery_request";

export type MetadataDiscoveryClarificationAction =
  | "specify_target_type"
  | "choose_datasource"
  | "choose_workbook"
  | "choose_view"
  | "provide_identifier"
  | "restate_request"
  | "cancel";

export type MetadataDiscoveryClarificationOption = {
  action: MetadataDiscoveryClarificationAction;
  label: string;
  description: string;
  targetType?: MetadataDiscoveryTargetType;
  requiredFields?: readonly MetadataDiscoveryClarificationResumeField[];
};

export type MetadataDiscoveryClarificationResumeField =
  | "targetType"
  | "identifier"
  | "candidateTargetTypes";

export type MetadataDiscoveryClarificationResumeContract = {
  canReenter: boolean;
  nextIntentId: MetadataDiscoveryIntentId;
  reenterMode: "reclassify";
  requiredFields: readonly MetadataDiscoveryClarificationResumeField[];
  allowedTargetTypes: readonly Exclude<
    MetadataDiscoveryTargetType,
    "unknown"
  >[];
  instructions: string;
};

export type MetadataDiscoveryClarificationResponseKind =
  | "clarification_required"
  | "unsupported";

export type MetadataDiscoveryClarificationResponse = {
  kind: MetadataDiscoveryClarificationResponseKind;
  intentId: MetadataDiscoveryIntentId;
  requiresClarification: boolean;
  canExecute: boolean;
  targetType: MetadataDiscoveryTargetType;
  candidateTargetTypes: readonly Exclude<
    MetadataDiscoveryTargetType,
    "unknown"
  >[];
  ambiguityState: MetadataDiscoveryAmbiguityState;
  missingPreconditions: readonly MetadataDiscoveryPreconditionId[];
  reasonCode: MetadataDiscoveryClarificationReasonCode;
  safeMessage: string;
  clarificationQuestion: string;
  allowedResponses: readonly MetadataDiscoveryClarificationAction[];
  options: readonly MetadataDiscoveryClarificationOption[];
  resumeHint: string;
  resumeContract: MetadataDiscoveryClarificationResumeContract;
  fallbackRecommended: boolean;
  unsupportedReason?: string;
  clarificationReason?: string;
};

export function buildMetadataDiscoveryClarificationResponse(
  decision: MetadataDiscoveryIntentDecision,
): MetadataDiscoveryClarificationResponse | undefined {
  if (decision.kind === "execute_candidate") {
    return undefined;
  }

  const reasonCode = resolveClarificationReasonCode(decision);
  const options = buildClarificationOptions(decision, reasonCode);
  const allowedResponses = options.map((option) => option.action);
  const requiresClarification = decision.kind === "clarification_candidate";
  const fallbackRecommended = decision.kind !== "clarification_candidate";
  const targetType = resolveTargetType(decision);
  const requiredFields = resolveRequiredFields(reasonCode, targetType);
  const resumeContract: MetadataDiscoveryClarificationResumeContract = {
    canReenter: true,
    nextIntentId: "metadata_discovery",
    reenterMode: "reclassify",
    requiredFields,
    allowedTargetTypes: resolveAllowedTargetTypes(decision),
    instructions: buildResumeInstructions(reasonCode),
  };

  return {
    kind: requiresClarification ? "clarification_required" : "unsupported",
    intentId: decision.intentId,
    requiresClarification,
    canExecute: false,
    targetType,
    candidateTargetTypes: [...decision.candidateTargetTypes],
    ambiguityState: decision.ambiguityState,
    missingPreconditions: [...decision.missingPreconditions],
    reasonCode,
    safeMessage: buildSafeMessage(reasonCode, decision),
    clarificationQuestion: buildClarificationQuestion(reasonCode, targetType),
    allowedResponses,
    options,
    resumeHint: buildResumeHint(reasonCode),
    resumeContract,
    fallbackRecommended,
    ...(decision.unsupportedReason
      ? { unsupportedReason: decision.unsupportedReason }
      : {}),
    ...(decision.clarificationReason
      ? { clarificationReason: decision.clarificationReason }
      : {}),
  };
}

export function buildMetadataDiscoveryClarificationTraceMetadata(
  response: MetadataDiscoveryClarificationResponse,
): JsonObject {
  return {
    kind: response.kind,
    intentId: response.intentId,
    requiresClarification: response.requiresClarification,
    canExecute: response.canExecute,
    targetType: response.targetType,
    candidateTargetTypes: [...response.candidateTargetTypes],
    ambiguityState: response.ambiguityState,
    missingPreconditions: [...response.missingPreconditions],
    reasonCode: response.reasonCode,
    safeMessage: response.safeMessage,
    clarificationQuestion: response.clarificationQuestion,
    allowedResponses: [...response.allowedResponses],
    options: response.options.map((option) => ({
      action: option.action,
      label: option.label,
      description: option.description,
      ...(option.targetType ? { targetType: option.targetType } : {}),
      ...(option.requiredFields
        ? { requiredFields: [...option.requiredFields] }
        : {}),
    })),
    resumeHint: response.resumeHint,
    resumeContract: {
      canReenter: response.resumeContract.canReenter,
      nextIntentId: response.resumeContract.nextIntentId,
      reenterMode: response.resumeContract.reenterMode,
      requiredFields: [...response.resumeContract.requiredFields],
      allowedTargetTypes: [...response.resumeContract.allowedTargetTypes],
      instructions: response.resumeContract.instructions,
    },
    fallbackRecommended: response.fallbackRecommended,
    ...(response.unsupportedReason
      ? { unsupportedReason: response.unsupportedReason }
      : {}),
    ...(response.clarificationReason
      ? { clarificationReason: response.clarificationReason }
      : {}),
  };
}

function resolveClarificationReasonCode(
  decision: MetadataDiscoveryIntentDecision,
): MetadataDiscoveryClarificationReasonCode {
  if (decision.kind === "unsupported") {
    if (
      hasSignal(decision, "write") ||
      hasSignal(decision, "insert") ||
      hasSignal(decision, "update") ||
      hasSignal(decision, "delete")
    ) {
      return "unsupported_write_request";
    }
    if (
      hasSignal(decision, "query") ||
      hasSignal(decision, "sql") ||
      hasSignal(decision, "row data") ||
      hasSignal(decision, "field values") ||
      hasSignal(decision, "underlying data")
    ) {
      return "metadata_query_boundary_conflict";
    }
    if (hasSignal(decision, "raw mcp") || hasSignal(decision, "mcp tool")) {
      return "unsupported_discovery_request";
    }
    return "unsafe_data_access_request";
  }

  switch (decision.ambiguityState) {
    case "unknown_target":
      return "missing_target";
    case "ambiguous_target":
      return decision.candidateTargetTypes.length > 1
        ? "multiple_target_candidates"
        : "ambiguous_target_type";
    case "missing_identifier":
      return "missing_identifier";
    case "target_not_supported":
      return "target_not_resolvable_from_context";
    case "unsupported":
      return "unsupported_discovery_request";
    case "ready":
      return "missing_target";
  }
}

function buildClarificationOptions(
  decision: MetadataDiscoveryIntentDecision,
  reasonCode: MetadataDiscoveryClarificationReasonCode,
): readonly MetadataDiscoveryClarificationOption[] {
  const candidateTargetTypes = [...decision.candidateTargetTypes];

  switch (reasonCode) {
    case "missing_target":
      return [
        option({
          action: "choose_datasource",
          label: "Use a datasource",
          description:
            "Provide a datasource target so metadata discovery can continue.",
          targetType: "datasource",
          requiredFields: ["targetType", "identifier"],
        }),
        option({
          action: "choose_workbook",
          label: "Use a workbook",
          description:
            "Provide a workbook target so the request can be clarified.",
          targetType: "workbook",
          requiredFields: ["targetType"],
        }),
        option({
          action: "choose_view",
          label: "Use a view",
          description: "Provide a view target so the request can be clarified.",
          targetType: "view",
          requiredFields: ["targetType"],
        }),
        option({
          action: "cancel",
          label: "Cancel",
          description: "Stop this metadata discovery request.",
        }),
      ];
    case "ambiguous_target_type":
    case "multiple_target_candidates":
      return [
        ...candidateTargetTypes.map((targetType) =>
          option({
            action: actionForTargetType(targetType),
            label: `Use ${targetType}`,
            description: `Choose ${targetType} to continue the safe metadata discovery path.`,
            targetType,
            requiredFields:
              targetType === "datasource"
                ? ["targetType", "identifier"]
                : ["targetType"],
          }),
        ),
        option({
          action: "cancel",
          label: "Cancel",
          description: "Stop this metadata discovery request.",
        }),
      ];
    case "missing_identifier":
      return [
        option({
          action: "provide_identifier",
          label: "Provide an identifier",
          description:
            "Share the datasource name or LUID so execution can remain safe.",
          targetType: "datasource",
          requiredFields: ["targetType", "identifier"],
        }),
        option({
          action: "cancel",
          label: "Cancel",
          description: "Stop this metadata discovery request.",
        }),
      ];
    case "target_not_resolvable_from_context":
      return [
        option({
          action: "specify_target_type",
          label: "Specify the target",
          description:
            "Restate the request with an explicit datasource target and identifier.",
          targetType: "datasource",
          requiredFields: ["targetType", "identifier"],
        }),
        option({
          action: "restate_request",
          label: "Restate the request",
          description:
            "Rephrase the request with a single safe datasource target.",
        }),
        option({
          action: "cancel",
          label: "Cancel",
          description: "Stop this metadata discovery request.",
        }),
      ];
    case "unsafe_data_access_request":
    case "unsupported_write_request":
    case "metadata_query_boundary_conflict":
    case "unsupported_discovery_request":
      return [
        option({
          action: "restate_request",
          label: "Rephrase as metadata",
          description:
            "Rephrase the request as read-only metadata discovery without rows, values, or writes.",
        }),
        option({
          action: "cancel",
          label: "Cancel",
          description: "Stop this request.",
        }),
      ];
  }
}

function buildResumeHint(
  reasonCode: MetadataDiscoveryClarificationReasonCode,
): string {
  switch (reasonCode) {
    case "missing_target":
      return "Re-run metadata_discovery with targetContext.targetType set.";
    case "ambiguous_target_type":
    case "multiple_target_candidates":
      return "Re-run metadata_discovery after choosing a single target type.";
    case "missing_identifier":
      return "Re-run metadata_discovery with targetContext.targetType and targetContext.identifier.";
    case "target_not_resolvable_from_context":
      return "Re-run metadata_discovery with an explicit datasource target and identifier.";
    case "unsafe_data_access_request":
    case "unsupported_write_request":
    case "metadata_query_boundary_conflict":
    case "unsupported_discovery_request":
      return "Do not resume as an execution request; restate the request as safe metadata discovery if needed.";
  }
}

function buildResumeInstructions(
  reasonCode: MetadataDiscoveryClarificationReasonCode,
): string {
  const base = buildResumeHint(reasonCode);
  return `${base} The caller should provide the missing fields and re-run metadata_discovery.`;
}

function buildClarificationQuestion(
  reasonCode: MetadataDiscoveryClarificationReasonCode,
  targetType: MetadataDiscoveryTargetType,
): string {
  switch (reasonCode) {
    case "missing_target":
      return "Which Tableau target should I inspect: datasource, workbook, or view?";
    case "ambiguous_target_type":
    case "multiple_target_candidates":
      return "Which single target type should I use?";
    case "missing_identifier":
      return "Which datasource should I inspect?";
    case "target_not_resolvable_from_context":
      return "Please provide a clear datasource target and identifier.";
    case "unsafe_data_access_request":
      return "Please rephrase this as read-only metadata discovery.";
    case "unsupported_write_request":
      return "Write requests are out of scope here. Please rephrase as metadata discovery.";
    case "metadata_query_boundary_conflict":
      return "This looks like a data query. Please rephrase it as metadata discovery.";
    case "unsupported_discovery_request":
      return `I can only continue with safe ${targetType} metadata discovery.`;
  }
}

function buildSafeMessage(
  reasonCode: MetadataDiscoveryClarificationReasonCode,
  decision: MetadataDiscoveryIntentDecision,
): string {
  if (decision.kind === "unsupported") {
    return "This request cannot continue as a structured metadata discovery execution candidate.";
  }
  return buildClarificationQuestion(reasonCode, decision.targetTypeCandidate);
}

function resolveRequiredFields(
  reasonCode: MetadataDiscoveryClarificationReasonCode,
  targetType: MetadataDiscoveryTargetType,
): readonly MetadataDiscoveryClarificationResumeField[] {
  switch (reasonCode) {
    case "missing_target":
      return ["targetType"];
    case "ambiguous_target_type":
    case "multiple_target_candidates":
      return ["targetType"];
    case "missing_identifier":
      return targetType === "datasource"
        ? ["targetType", "identifier"]
        : ["targetType"];
    case "target_not_resolvable_from_context":
      return ["targetType", "identifier"];
    case "unsafe_data_access_request":
    case "unsupported_write_request":
    case "metadata_query_boundary_conflict":
    case "unsupported_discovery_request":
      return ["targetType"];
  }
}

function resolveAllowedTargetTypes(
  decision: MetadataDiscoveryIntentDecision,
): readonly Exclude<MetadataDiscoveryTargetType, "unknown">[] {
  if (decision.candidateTargetTypes.length > 0) {
    return [...decision.candidateTargetTypes];
  }
  if (decision.targetTypeCandidate !== "unknown") {
    return [decision.targetTypeCandidate];
  }
  return ["datasource", "workbook", "view"];
}

function resolveTargetType(
  decision: MetadataDiscoveryIntentDecision,
): MetadataDiscoveryTargetType {
  if (decision.targetTypeCandidate !== "unknown") {
    return decision.targetTypeCandidate;
  }
  const firstCandidate = decision.candidateTargetTypes[0];
  return firstCandidate ?? "unknown";
}

function actionForTargetType(
  targetType: Exclude<MetadataDiscoveryTargetType, "unknown">,
): MetadataDiscoveryClarificationAction {
  switch (targetType) {
    case "datasource":
      return "choose_datasource";
    case "workbook":
      return "choose_workbook";
    case "view":
      return "choose_view";
  }
}

function option(
  value: MetadataDiscoveryClarificationOption,
): MetadataDiscoveryClarificationOption {
  return {
    action: value.action,
    label: value.label,
    description: value.description,
    ...(value.targetType ? { targetType: value.targetType } : {}),
    ...(value.requiredFields
      ? { requiredFields: [...value.requiredFields] }
      : {}),
  };
}

function hasSignal(
  decision: MetadataDiscoveryIntentDecision,
  needle: string,
): boolean {
  const normalizedNeedle = needle.toLowerCase();
  return decision.signals.some((signal) =>
    signal.toLowerCase().includes(normalizedNeedle),
  );
}
