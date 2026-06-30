import type {
  ToolCapability,
  ToolCategory,
  ToolDefinition,
  ToolDefinitionSummary,
} from "./toolDefinition";
import {
  createToolDefinitionSummary,
  isToolDefinitionJsonSafe,
} from "./toolDefinition";
import type { JsonObject } from "./types";

export type ToolLookupStatus =
  | "found"
  | "missing"
  | "unavailable"
  | "disallowed";

export type ToolAvailabilityStatus =
  | "available"
  | "missing"
  | "unavailable"
  | "disallowed";

export type ToolPolicy = {
  allowedTools?: readonly string[];
  disallowedTools?: readonly string[];
  safeForPreviewOnly?: boolean;
  requiresExplicitActionAllowed?: boolean;
};

export type ToolListOptions = ToolPolicy & {
  category?: ToolCategory;
  capability?: ToolCapability;
  includeUnavailable?: boolean;
};

export type ToolLookupResult = {
  status: ToolLookupStatus;
  toolName: string;
  tool?: ToolDefinitionSummary;
  reason?: string;
  warnings?: string[];
  metadata?: JsonObject;
  traceMetadata?: JsonObject;
};

export type ToolAvailabilityResult = {
  status: ToolAvailabilityStatus;
  toolName: string;
  tool?: ToolDefinitionSummary;
  reason?: string;
  warnings?: string[];
  metadata?: JsonObject;
  traceMetadata?: JsonObject;
};

export type ToolListResult = {
  tools: ToolDefinitionSummary[];
  totalCount: number;
  warnings?: string[];
  metadata?: JsonObject;
};

export type ToolRegistrationStatus =
  | "registered"
  | "overwritten"
  | "duplicate"
  | "invalid";

export type ToolRegistrationResult = {
  status: ToolRegistrationStatus;
  toolName: string;
  tool?: ToolDefinitionSummary;
  reason?: string;
  warnings?: string[];
  metadata?: JsonObject;
};

export type ToolUnregistrationStatus = "removed" | "missing" | "invalid";

export type ToolUnregistrationResult = {
  status: ToolUnregistrationStatus;
  toolName: string;
  tool?: ToolDefinitionSummary;
  reason?: string;
  warnings?: string[];
  metadata?: JsonObject;
};

export interface ToolRegistry {
  register(
    definition: ToolDefinition,
    options?: { overwrite?: boolean },
  ): ToolRegistrationResult;
  unregister(name: string): ToolUnregistrationResult;
  lookup(name: string, policy?: ToolPolicy): ToolLookupResult;
  availability(name: string, policy?: ToolPolicy): ToolAvailabilityResult;
  list(options?: ToolListOptions): ToolListResult;
}

type ToolRegistryEntry = {
  definition: ToolDefinition;
  summary: ToolDefinitionSummary;
};

export class InMemoryToolRegistry implements ToolRegistry {
  private readonly entries = new Map<string, ToolRegistryEntry>();

  constructor(initialDefinitions: readonly ToolDefinition[] = []) {
    for (const definition of initialDefinitions) {
      const normalizedName = normalizeToolName(definition.name);
      if (!normalizedName) {
        continue;
      }
      this.entries.set(normalizedName, {
        definition,
        summary: createToolDefinitionSummary(definition),
      });
    }
  }

  register(
    definition: ToolDefinition,
    options: { overwrite?: boolean } = {},
  ): ToolRegistrationResult {
    const toolName = normalizeToolName(definition.name);
    if (!toolName) {
      return {
        status: "invalid",
        toolName: definition.name ?? "",
        reason: "Tool name must be a non-empty string.",
        warnings: ["invalid_tool_name"],
      };
    }

    if (!isToolDefinitionJsonSafe(definition)) {
      return {
        status: "invalid",
        toolName,
        reason: "Tool definition must be JSON-safe.",
        warnings: ["tool_definition_not_json_safe"],
      };
    }

    const existing = this.entries.get(toolName);
    const summary = createToolDefinitionSummary(definition);

    if (existing && !options.overwrite) {
      return {
        status: "duplicate",
        toolName,
        tool: createToolDefinitionSummary(existing.definition),
        reason: `Tool '${toolName}' is already registered.`,
        warnings: ["duplicate_tool_registration"],
      };
    }

    this.entries.set(toolName, {
      definition,
      summary,
    });

    return {
      status: existing ? "overwritten" : "registered",
      toolName,
      tool: createToolDefinitionSummary(definition),
      ...(existing
        ? { reason: `Tool '${toolName}' was overwritten.` }
        : { reason: `Tool '${toolName}' was registered.` }),
    };
  }

  unregister(name: string): ToolUnregistrationResult {
    const toolName = normalizeToolName(name);
    if (!toolName) {
      return {
        status: "invalid",
        toolName: name ?? "",
        reason: "Tool name must be a non-empty string.",
        warnings: ["invalid_tool_name"],
      };
    }

    const existing = this.entries.get(toolName);
    if (!existing) {
      return {
        status: "missing",
        toolName,
        reason: `Tool '${toolName}' is missing from the registry.`,
        warnings: ["missing_tool"],
      };
    }

    this.entries.delete(toolName);

    return {
      status: "removed",
      toolName,
      tool: createToolDefinitionSummary(existing.definition),
      reason: `Tool '${toolName}' was unregistered.`,
    };
  }

  lookup(name: string, policy: ToolPolicy = {}): ToolLookupResult {
    const availability = this.resolveAvailability(name, policy);
    if (availability.status !== "available") {
      return {
        status: availability.status,
        toolName: availability.toolName,
        ...(availability.tool ? { tool: availability.tool } : {}),
        ...(availability.reason ? { reason: availability.reason } : {}),
        ...(availability.warnings
          ? { warnings: [...availability.warnings] }
          : {}),
        ...(availability.metadata
          ? { metadata: { ...availability.metadata } }
          : {}),
        ...(availability.traceMetadata
          ? { traceMetadata: { ...availability.traceMetadata } }
          : {}),
      };
    }

    const entry = this.entries.get(availability.toolName);

    return {
      status: "found",
      toolName: availability.toolName,
      tool: entry
        ? createToolDefinitionSummary(entry.definition)
        : availability.tool,
      reason: availability.reason,
      warnings: availability.warnings ? [...availability.warnings] : undefined,
      metadata: availability.metadata
        ? { ...availability.metadata }
        : undefined,
      traceMetadata: availability.traceMetadata
        ? { ...availability.traceMetadata }
        : undefined,
    };
  }

  availability(name: string, policy: ToolPolicy = {}): ToolAvailabilityResult {
    const result = this.resolveAvailability(name, policy);
    return {
      status: result.status,
      toolName: result.toolName,
      ...(result.tool ? { tool: result.tool } : {}),
      ...(result.reason ? { reason: result.reason } : {}),
      ...(result.warnings ? { warnings: [...result.warnings] } : {}),
      ...(result.metadata ? { metadata: { ...result.metadata } } : {}),
      ...(result.traceMetadata
        ? { traceMetadata: { ...result.traceMetadata } }
        : {}),
    };
  }

  list(options: ToolListOptions = {}): ToolListResult {
    const tools: ToolDefinitionSummary[] = [];

    for (const { definition } of this.entries.values()) {
      if (!this.matchesListFilters(definition, options)) {
        continue;
      }

      if (
        definition.availability.status === "unavailable" &&
        !options.includeUnavailable
      ) {
        continue;
      }

      tools.push(createToolDefinitionSummary(definition));
    }

    tools.sort((left, right) => left.name.localeCompare(right.name));

    return {
      tools,
      totalCount: tools.length,
    };
  }

  private resolveAvailability(
    name: string,
    policy: ToolPolicy,
  ): ToolAvailabilityResult {
    const toolName = normalizeToolName(name);
    if (!toolName) {
      return {
        status: "missing",
        toolName: name ?? "",
        reason: "Tool name must be a non-empty string.",
        warnings: ["invalid_tool_name"],
      };
    }

    const entry = this.entries.get(toolName);
    if (!entry) {
      return {
        status: "missing",
        toolName,
        reason: `Tool '${toolName}' is missing from the registry.`,
        warnings: ["missing_tool"],
      };
    }

    const policyFailure = evaluatePolicy(toolName, entry.definition, policy);
    if (policyFailure) {
      return {
        status: "disallowed",
        toolName,
        tool: createToolDefinitionSummary(entry.definition),
        reason: policyFailure,
        warnings: ["tool_disallowed_by_policy"],
        metadata: buildToolMetadata(entry.definition),
        traceMetadata: buildToolTraceMetadata(entry.definition),
      };
    }

    if (entry.definition.availability.status === "unavailable") {
      return {
        status: "unavailable",
        toolName,
        tool: createToolDefinitionSummary(entry.definition),
        reason:
          entry.definition.availability.reason ??
          `Tool '${toolName}' is unavailable.`,
        warnings: ["tool_unavailable"],
        metadata: buildToolMetadata(entry.definition),
        traceMetadata: buildToolTraceMetadata(entry.definition),
      };
    }

    return {
      status: "available",
      toolName,
      tool: createToolDefinitionSummary(entry.definition),
      reason:
        entry.definition.availability.reason ??
        `Tool '${toolName}' is available.`,
      metadata: buildToolMetadata(entry.definition),
      traceMetadata: buildToolTraceMetadata(entry.definition),
    };
  }

  private matchesListFilters(
    definition: ToolDefinition,
    options: ToolListOptions,
  ): boolean {
    if (options.category && definition.category !== options.category) {
      return false;
    }

    if (options.capability) {
      const hasCapability = definition.capabilities.includes(
        options.capability,
      );
      if (!hasCapability) {
        return false;
      }
    }

    if (options.safeForPreviewOnly && !definition.safety.safeForPreview) {
      return false;
    }

    if (
      options.requiresExplicitActionAllowed === false &&
      definition.safety.requiresExplicitAction
    ) {
      return false;
    }

    if (
      options.allowedTools &&
      options.allowedTools.length > 0 &&
      !options.allowedTools.includes(definition.name)
    ) {
      return false;
    }

    if (
      options.disallowedTools &&
      options.disallowedTools.includes(definition.name)
    ) {
      return false;
    }

    return true;
  }
}

export function createToolRegistry(
  initialDefinitions: readonly ToolDefinition[] = [],
): ToolRegistry {
  return new InMemoryToolRegistry(initialDefinitions);
}

function evaluatePolicy(
  toolName: string,
  definition: ToolDefinition,
  policy: ToolPolicy,
): string | undefined {
  if (policy.disallowedTools && policy.disallowedTools.includes(toolName)) {
    return `Tool '${toolName}' is disallowed by policy.`;
  }

  if (
    policy.allowedTools &&
    policy.allowedTools.length > 0 &&
    !policy.allowedTools.includes(toolName)
  ) {
    return `Tool '${toolName}' is not present in the allowlist.`;
  }

  if (policy.safeForPreviewOnly && !definition.safety.safeForPreview) {
    return `Tool '${toolName}' is not safe for preview.`;
  }

  if (
    policy.requiresExplicitActionAllowed === false &&
    definition.safety.requiresExplicitAction
  ) {
    return `Tool '${toolName}' requires an explicit user action.`;
  }

  return undefined;
}

function buildToolMetadata(definition: ToolDefinition): JsonObject | undefined {
  if (!definition.metadata) {
    return undefined;
  }

  return { ...definition.metadata };
}

function buildToolTraceMetadata(
  definition: ToolDefinition,
): JsonObject | undefined {
  if (!definition.traceMetadata) {
    return undefined;
  }

  return { ...definition.traceMetadata };
}

function normalizeToolName(name: string | undefined): string | undefined {
  const normalized = name?.trim();
  return normalized ? normalized : undefined;
}
