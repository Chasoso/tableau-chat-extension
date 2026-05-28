import { describe, expect, it } from "vitest";
import { classifyQuestionIntent, parseToolPlanResponse, resolveAllowedToolNames } from "../src/services/tableauMcpToolPlanner";

describe("tableauMcpToolPlanner", () => {
  it("parses planned MCP tool calls from fenced JSON", () => {
    const plan = parseToolPlanResponse(`
\`\`\`json
{
  "intent": "data_analysis",
  "confidence": 0.9,
  "answerableFromDashboardContext": false,
  "needsMcp": true,
  "reasonBrief": "Need datasource metadata and aggregate query.",
  "maxToolCalls": 4,
  "toolCalls": [
    {
      "toolName": "list-datasources",
      "purpose": "Find datasource IDs for this workbook.",
      "arguments": {},
      "reason": "Find datasources used by the workbook."
    },
    {
      "tool": "query-datasource",
      "arguments": {
        "datasourceLuid": "abc",
        "query": { "fields": [{ "fieldCaption": "Views", "function": "SUM" }] },
        "authorization": "Bearer unsafe"
      }
    }
  ]
}
\`\`\`
`);

    expect(plan?.toolCalls).toEqual([
      {
        toolName: "list-datasources",
        purpose: "Find datasource IDs for this workbook.",
        reason: "Find datasources used by the workbook.",
      },
      {
        toolName: "query-datasource",
        arguments: {
          datasourceLuid: "abc",
          query: { fields: [{ fieldCaption: "Views", function: "SUM" }] },
        },
      },
    ]);
    expect(plan?.intent).toBe("data_analysis");
    expect(plan?.needsMcp).toBe(true);
  });

  it("intersects default planner tools with tools exposed by MCP", () => {
    const allowed = resolveAllowedToolNames(
      [
        { name: "list-workbooks" },
        { name: "query-datasource" },
        { name: "delete-everything" },
      ],
      [],
    );

    expect(allowed).toEqual(["list-workbooks", "query-datasource"]);
  });

  it("classifies filter question intent", () => {
    const intent = classifyQuestionIntent(
      "今のフィルター状態を説明して",
      {
        dashboardName: "Dashboard",
        worksheets: [{ name: "Sheet 1" }],
        filters: [{ fieldName: "Region", appliedValues: ["West"] }],
        parameters: [],
        capturedAt: "2026-05-28T00:00:00.000Z",
      },
      ["list-views"],
    );

    expect(intent.intent).toBe("filter_or_selection_state");
    expect(intent.needsMcp).toBe(false);
  });
});
