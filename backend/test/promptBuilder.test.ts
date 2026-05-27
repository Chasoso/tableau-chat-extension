import { describe, expect, it } from "vitest";
import { buildPrompt } from "../src/services/promptBuilder";
import type { ChatHistoryRecord, ChatRequest } from "../src/types/chat";

const request: ChatRequest = {
  question: "What drove sales growth?",
  dashboardContext: {
    dashboardName: "Sales Dashboard",
    workbookName: "Executive Workbook",
    worksheets: [{ name: "Sales Trend" }],
    filters: [{ fieldName: "Region", appliedValues: ["West"] }],
    parameters: [{ name: "Metric", currentValue: "Sales" }],
    capturedAt: new Date().toISOString(),
  },
};

describe("buildPrompt", () => {
  it("includes the dashboard context and question", () => {
    const prompt = buildPrompt(request, {
      provider: "mock",
    });

    expect(prompt).toContain("What drove sales growth?");
    expect(prompt).toContain("Sales Dashboard");
    expect(prompt).toContain("Executive Workbook");
    expect(prompt).toContain("Sales Trend");
    expect(prompt).toContain("Region: West");
  });

  it("includes recent session history when provided", () => {
    const recentHistory: ChatHistoryRecord[] = [
      {
        sessionId: "session-1",
        messageId: "message-1",
        ownerUserId: "user-1",
        question: "What changed last week?",
        answer: "Views declined compared with the prior week.",
        dashboardName: "Sales Dashboard",
        workbookName: "Executive Workbook",
        worksheetNames: ["Sales Trend"],
        createdAt: new Date().toISOString(),
        source: "tableau-extension",
      },
    ];

    const prompt = buildPrompt(
      request,
      {
        provider: "mock",
      },
      recentHistory,
    );

    expect(prompt).toContain("Recent conversation in the same authenticated session:");
    expect(prompt).toContain("Turn 1 user: What changed last week?");
    expect(prompt).toContain("Turn 1 assistant: Views declined compared with the prior week.");
  });
});
