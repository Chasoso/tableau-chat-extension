import { describe, expect, it } from "vitest";
import { buildPrompt } from "../src/services/promptBuilder";
import type { ChatRequest } from "../src/types/chat";

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
});

