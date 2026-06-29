import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveIntent } from "./orchestrationApi";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

describe("orchestrationApi", () => {
  it("posts selected-mark intent resolution requests with the bearer token", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        result: {
          agentRunId: "agent-run-1",
          status: "resolved",
          resolvedIntentId: "selected_mark_explanation",
          confidence: 0.99,
          source: "ui_action",
          warnings: [],
          evidence: [],
        },
      }),
    );

    await expect(
      resolveIntent(
        {
          actionId: "explain_selection",
          requestedIntent: "selected_mark_explanation",
          message: "Explain this selection.",
          contextSummary: {
            hasSelectedMarks: true,
            selectedMarkCount: 3,
            worksheetNames: ["Sales Trend"],
            dashboardName: "Executive Overview",
            workbookName: "Sales Workbook",
            viewName: "Executive Overview",
          },
          clientTimestamp: "2026-06-30T00:00:00.000Z",
          metadata: {
            sourceKind: "tableau-extension",
          },
        },
        "token-1",
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        result: expect.objectContaining({
          resolvedIntentId: "selected_mark_explanation",
        }),
      }),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/intent/resolve",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer token-1",
        }),
      }),
    );
  });

  it("rejects non-json responses", async () => {
    fetchMock.mockResolvedValue(
      new Response("plain text", {
        status: 200,
        headers: { "content-type": "text/plain" },
      }),
    );

    await expect(
      resolveIntent({ actionId: "explain_selection" } as never),
    ).rejects.toThrow("non-JSON response");
  });
});
