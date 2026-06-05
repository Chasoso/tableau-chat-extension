import { describe, expect, it } from "vitest";
import { interpretQuestion } from "../src/services/questionInterpretation";

describe("questionInterpretation", () => {
  it("prefers the user-requested period over a datasource literal mention", () => {
    const interpretation = interpretQuestion({
      question:
        "Tableau Public Per Day(2025/04-)を使って、2026年4月に最もView数を集めたVizをランキング形式で教えてください。",
      dashboardContext: {
        dashboardName: "Statistics",
        workbookName: "Tableau Public Insights",
        worksheets: [{ name: "Views" }],
        filters: [],
        parameters: [],
        dataSources: [{ name: "Tableau Public Per Day(2025/04-)" }],
        capturedAt: "2026-06-04T00:00:00.000Z",
      },
    });

    expect(interpretation.datasourceName).toBe(
      "Tableau Public Per Day(2025/04-)",
    );
    expect(interpretation.metricIntent).toBe("views");
    expect(interpretation.asksForRanking).toBe(true);
    expect(interpretation.period).toEqual({
      kind: "month",
      label: "2026年4月",
      startDate: "2026-04-01",
      endDate: "2026-04-30",
      raw: "2026年4月",
      warnings: [],
    });
  });
});
