import { describe, expect, it, vi } from "vitest";
import type { ToolDefinition } from "../src/agent";
import { InMemoryToolRegistry } from "../src/agent";

function createToolDefinition(
  overrides: Partial<ToolDefinition> = {},
): ToolDefinition {
  return {
    name: "context.selectedMarks",
    description: "Reads selected mark summaries from the current context.",
    category: "context",
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
    inputSchema: { kind: "typescript_contract" },
    outputSchema: { kind: "typescript_contract" },
    metadata: {
      source: "context_preview",
    },
    traceMetadata: {
      toolKind: "context.selectedMarks",
    },
    ...overrides,
  };
}

describe("ToolRegistry contract", () => {
  it("registers, looks up and lists tools", () => {
    const registry = new InMemoryToolRegistry();
    const definition = createToolDefinition();

    const registerResult = registry.register(definition);
    const lookupResult = registry.lookup("context.selectedMarks");
    const availabilityResult = registry.availability("context.selectedMarks");
    const listResult = registry.list();

    expect(registerResult.status).toBe("registered");
    expect(lookupResult.status).toBe("found");
    expect(lookupResult.tool?.name).toBe("context.selectedMarks");
    expect(availabilityResult.status).toBe("available");
    expect(listResult.totalCount).toBe(1);
    expect(listResult.tools[0]?.name).toBe("context.selectedMarks");

    expect(JSON.parse(JSON.stringify(registerResult))).toEqual(registerResult);
    expect(JSON.parse(JSON.stringify(lookupResult))).toEqual(lookupResult);
    expect(JSON.parse(JSON.stringify(availabilityResult))).toEqual(
      availabilityResult,
    );
    expect(JSON.parse(JSON.stringify(listResult))).toEqual(listResult);
  });

  it("distinguishes missing, unavailable and disallowed lookups", () => {
    const registry = new InMemoryToolRegistry([
      createToolDefinition({
        name: "context.summaryDataPreview",
        capabilities: ["read_context", "read_summary_data"],
        safety: {
          level: "read_only",
          safeForPreview: true,
          requiresExplicitAction: false,
          externalAccess: false,
          mayAccessSummaryData: true,
        },
        availability: {
          status: "unavailable",
          reason: "Preview not collected.",
        },
      }),
    ]);

    const missing = registry.lookup("context.filters");
    const unavailable = registry.lookup("context.summaryDataPreview");
    const disallowed = registry.lookup("context.summaryDataPreview", {
      disallowedTools: ["context.summaryDataPreview"],
    });

    expect(missing.status).toBe("missing");
    expect(unavailable.status).toBe("unavailable");
    expect(disallowed.status).toBe("disallowed");
    expect(disallowed.reason).toContain("disallowed");
  });

  it("applies allowlists and disallowed precedence", () => {
    const registry = new InMemoryToolRegistry([
      createToolDefinition({
        name: "context.filters",
        capabilities: ["read_context", "read_filters"],
      }),
    ]);

    const blockedByAllowlist = registry.lookup("context.filters", {
      allowedTools: ["context.selectedMarks"],
    });
    const blockedByDisallowed = registry.lookup("context.filters", {
      allowedTools: ["context.filters"],
      disallowedTools: ["context.filters"],
    });
    const allowed = registry.lookup("context.filters", {
      allowedTools: ["context.filters"],
    });

    expect(blockedByAllowlist.status).toBe("disallowed");
    expect(blockedByDisallowed.status).toBe("disallowed");
    expect(allowed.status).toBe("found");
  });

  it("filters list results by category, capability and safety flags", () => {
    const registry = new InMemoryToolRegistry([
      createToolDefinition({
        name: "context.selectedMarks",
        capabilities: ["read_context", "read_selected_marks"],
      }),
      createToolDefinition({
        name: "context.summaryDataPreview",
        capabilities: ["read_context", "read_summary_data"],
      }),
      createToolDefinition({
        name: "tableau.metadata",
        category: "tableau_mcp",
        capabilities: ["read_tableau_metadata"],
        safety: {
          level: "read_only",
          safeForPreview: false,
          requiresExplicitAction: false,
          requiresAuthentication: true,
          externalAccess: true,
          mayCallMcp: true,
        },
      }),
      createToolDefinition({
        name: "notion.createPage",
        category: "notion",
        capabilities: ["write_external_service"],
        safety: {
          level: "write_capable",
          safeForPreview: false,
          requiresExplicitAction: true,
          requiresAuthentication: true,
          externalAccess: true,
          mayCallMcp: true,
        },
      }),
    ]);

    const contextTools = registry.list({ category: "context" });
    const summaryTools = registry.list({ capability: "read_summary_data" });
    const previewSafeTools = registry.list({ safeForPreviewOnly: true });
    const nonExplicitActionTools = registry.list({
      requiresExplicitActionAllowed: false,
    });

    expect(contextTools.tools.map((tool) => tool.name)).toEqual([
      "context.selectedMarks",
      "context.summaryDataPreview",
    ]);
    expect(summaryTools.tools.map((tool) => tool.name)).toEqual([
      "context.summaryDataPreview",
    ]);
    expect(previewSafeTools.tools.map((tool) => tool.name)).toEqual([
      "context.selectedMarks",
      "context.summaryDataPreview",
    ]);
    expect(nonExplicitActionTools.tools.map((tool) => tool.name)).toEqual([
      "context.selectedMarks",
      "context.summaryDataPreview",
      "tableau.metadata",
    ]);
  });

  it("returns availability results and keeps unavailable tools visible when requested", () => {
    const registry = new InMemoryToolRegistry([
      createToolDefinition({
        name: "context.summaryDataPreview",
        capabilities: ["read_context", "read_summary_data"],
        availability: {
          status: "unavailable",
          reason: "Summary preview has not been collected yet.",
        },
      }),
    ]);

    const hidden = registry.list({ includeUnavailable: false });
    const visible = registry.list({ includeUnavailable: true });
    const availability = registry.availability("context.summaryDataPreview");

    expect(hidden.totalCount).toBe(0);
    expect(visible.totalCount).toBe(1);
    expect(availability.status).toBe("unavailable");
    expect(availability.reason).toContain("Summary preview");
  });

  it("rejects duplicate registrations unless overwrite is explicit", () => {
    const registry = new InMemoryToolRegistry();
    const definition = createToolDefinition();
    const duplicateDefinition = createToolDefinition({
      description: "Updated description.",
    });

    const initial = registry.register(definition);
    const duplicate = registry.register(duplicateDefinition);
    const overwritten = registry.register(duplicateDefinition, {
      overwrite: true,
    });

    expect(initial.status).toBe("registered");
    expect(duplicate.status).toBe("duplicate");
    expect(overwritten.status).toBe("overwritten");
    expect(registry.lookup("context.selectedMarks").tool?.description).toBe(
      "Updated description.",
    );
  });

  it("unregisters tools and reports missing lookups afterward", () => {
    const registry = new InMemoryToolRegistry([createToolDefinition()]);

    const removed = registry.unregister("context.selectedMarks");
    const afterRemoval = registry.lookup("context.selectedMarks");

    expect(removed.status).toBe("removed");
    expect(afterRemoval.status).toBe("missing");
  });

  it("can represent selected_mark_explanation context tools and stays execution-free", () => {
    const executeSpy = vi.fn();
    const registry = new InMemoryToolRegistry();

    const invalidResult = registry.register({
      ...createToolDefinition({ name: "context.selectedMarks" }),
      execute: executeSpy,
    } as ToolDefinition & { execute: typeof executeSpy });

    expect(invalidResult.status).toBe("invalid");
    expect(executeSpy).not.toHaveBeenCalled();

    const selectedMarks = registry.register(createToolDefinition());
    const summaryDataPreview = registry.register(
      createToolDefinition({
        name: "context.summaryDataPreview",
        capabilities: ["read_context", "read_summary_data"],
        safety: {
          level: "read_only",
          safeForPreview: true,
          requiresExplicitAction: false,
          externalAccess: false,
          mayAccessSummaryData: true,
        },
      }),
    );

    expect(selectedMarks.status).toBe("registered");
    expect(summaryDataPreview.status).toBe("registered");
    expect(JSON.stringify(registry.lookup("context.selectedMarks"))).toContain(
      "context.selectedMarks",
    );
    expect(
      JSON.stringify(registry.lookup("context.summaryDataPreview")),
    ).toContain("context.summaryDataPreview");
  });
});
