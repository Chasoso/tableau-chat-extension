import { describe, expect, it } from "vitest";
import {
  detectMetricIntent,
  detectRankingIntent,
  inferRequestedTopN,
  interpretQuestion,
} from "../src/services/questionInterpretation";
import type { DashboardContext } from "../src/types/tableau";

const datasourceName = "Tableau Public Per Day(2025/04-)";
const dashboardContext: DashboardContext = {
  dashboardName: "Statistics",
  workbookName: "Tableau Public Insights",
  worksheets: [{ name: "Views" }],
  filters: [],
  parameters: [],
  dataSources: [{ name: datasourceName }],
  capturedAt: "2026-06-04T00:00:00.000Z",
};

const mayViewsRankingQuestion =
  "Tableau Public Per Day(2025/04-)\u3092\u4f7f\u3063\u3066\u30012026\u5e745\u6708\u306b\u6700\u3082View\u6570\u304c\u591a\u304b\u3063\u305fViz\u3092\u30e9\u30f3\u30ad\u30f3\u30b0\u5f62\u5f0f\u3067\u6559\u3048\u3066\u304f\u3060\u3055\u3044\u3002";
const mayViewsTop10Question =
  "2026\u5e745\u6708\u306bView\u6570\u304c\u591a\u304b\u3063\u305fViz\u3092\u30e9\u30f3\u30ad\u30f3\u30b0\u5f62\u5f0f\u3067Top10\u307e\u3067\u6559\u3048\u3066\u304f\u3060\u3055\u3044\u3002";
const mayViewsRankingOnlyQuestion =
  "2026\u5e745\u6708\u306e\u30d3\u30e5\u30fc\u6570\u30e9\u30f3\u30ad\u30f3\u30b0\u3092\u6559\u3048\u3066";
const mayViewsTop10OnlyQuestion =
  "2026\u5e745\u6708\u306eView\u6570\u3092Top10\u307e\u3067\u6559\u3048\u3066\u304f\u3060\u3055\u3044\u3002";
const datasourceInventoryQuestion =
  "\u4f7f\u308f\u308c\u3066\u3044\u308b\u30c7\u30fc\u30bf\u30bd\u30fc\u30b9\u3092\u6559\u3048\u3066\u304f\u3060\u3055\u3044";
const fieldInventoryQuestion =
  "X Account Analytics Contents\u306e\u30d5\u30a3\u30fc\u30eb\u30c9\u306b\u3064\u3044\u3066\u6559\u3048\u3066\u304f\u3060\u3055\u3044\u3002";

describe("questionInterpretation", () => {
  it("prefers the user-requested month over a datasource literal mention", () => {
    const interpretation = interpretQuestion({
      question: mayViewsRankingQuestion,
      dashboardContext,
    });

    expect(interpretation.datasourceName).toBe(datasourceName);
    expect(interpretation.metricIntent).toBe("views");
    expect(interpretation.asksForRanking).toBe(true);
    expect(interpretation.topN).toBe(10);
    expect(interpretation.groupingIntent).toBe("viz");
    expect(interpretation.period).toEqual({
      kind: "month",
      label: "2026\u5e745\u6708",
      startDate: "2026-05-01",
      endDate: "2026-05-31",
      raw: "2026\u5e745\u6708",
      warnings: [],
    });
  });

  it("detects explicit TopN and keeps ranking intent in Japanese", () => {
    const interpretation = interpretQuestion({
      question: mayViewsTop10Question,
      dashboardContext,
    });

    expect(interpretation.metricIntent).toBe("views");
    expect(interpretation.asksForRanking).toBe(true);
    expect(interpretation.topN).toBe(10);
    expect(interpretation.topNExplicitlyRequested).toBe(true);
  });

  it("treats an explicit TopN request as a ranking question", () => {
    const interpretation = interpretQuestion({
      question: mayViewsTop10OnlyQuestion,
      dashboardContext,
    });

    expect(interpretation.metricIntent).toBe("views");
    expect(interpretation.asksForRanking).toBe(true);
    expect(interpretation.topN).toBe(10);
    expect(interpretation.topNExplicitlyRequested).toBe(true);
  });

  it("recognizes ranking keywords without an explicit top count", () => {
    expect(detectRankingIntent(mayViewsRankingOnlyQuestion)).toBe(true);
    expect(inferRequestedTopN(mayViewsRankingOnlyQuestion, true)).toBe(10);
  });

  it("detects metric intent from Japanese synonyms", () => {
    expect(
      detectMetricIntent(
        "2026\u5e745\u6708\u306e\u30d3\u30e5\u30fc\u6570\u304c\u591a\u3044Viz",
      ),
    ).toBe("views");
    expect(
      detectMetricIntent(
        "\u304a\u6c17\u306b\u5165\u308a\u6570\u304c\u591a\u3044Viz",
      ),
    ).toBe("favorites");
    expect(
      detectMetricIntent(
        "\u30d6\u30c3\u30af\u30de\u30fc\u30af\u6570\u304c\u591a\u3044Viz",
      ),
    ).toBe("bookmarks");
  });

  it("classifies datasource inventory questions as a lightweight request type", () => {
    const interpretation = interpretQuestion({
      question: datasourceInventoryQuestion,
      dashboardContext,
    });

    expect(interpretation.requestType).toBe("datasource_inventory");
    expect(interpretation.metricIntent).toBe("unknown");
    expect(interpretation.asksForRanking).toBe(false);
  });

  it("classifies datasource field questions as field inventory requests", () => {
    const interpretation = interpretQuestion({
      question: fieldInventoryQuestion,
      dashboardContext: {
        ...dashboardContext,
        dataSources: [{ name: "X Account Analytics Contents" }],
      },
    });

    expect(interpretation.requestType).toBe("field_inventory");
    expect(interpretation.metricIntent).toBe("unknown");
    expect(interpretation.asksForRanking).toBe(false);
  });
});
