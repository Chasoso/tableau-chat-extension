import { describe, expect, it } from "vitest";
import { parseToolPlanResponse, resolveAllowedToolNames } from "../src/services/tableauMcpToolPlanner";

describe("tableauMcpToolPlanner", () => {
  it("parses planned MCP tool calls from fenced JSON", () => {
    const plan = parseToolPlanResponse(`
\`\`\`json
{
  "toolCalls": [
    {
      "toolName": "list-datasources",
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
});
