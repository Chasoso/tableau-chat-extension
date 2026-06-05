import type { DashboardContext } from "./tableau";

export type ChatRole = "user" | "assistant" | "system";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
};

export type ChatRequest = {
  question: string;
  dashboardContext: DashboardContext;
  clientContext: {
    source: "tableau-extension";
    appVersion: string;
  };
  sessionId?: string;
};

export type ContextRequest = {
  dashboardContext: DashboardContext;
  clientContext: {
    source: "tableau-extension";
    appVersion: string;
  };
};

export type DashboardContextPatch = Partial<
  Pick<DashboardContext, "workbookName">
>;

export type ChatResponse = {
  answer: string;
  sessionId: string;
  messageId: string;
  notionPostIdeaDraft?: {
    title: string;
    draftKind?: "analysis_memo" | "post_idea";
    reason: string;
    suggestedPostText: string;
    summary?: string;
    analysisBody?: string;
    datasourceName?: string;
    periodLabel?: string;
    rankingItems?: Array<{
      label: string;
      value?: string | number | null;
    }>;
    metricSummary?: {
      impressions?: number;
      engagementRate?: number;
      bookmarkRate?: number;
      profileVisitRate?: number;
    };
    referencePostUrl?: string;
    source?: string;
    tags?: string[];
  };
  dashboardContextPatch?: DashboardContextPatch;
  debug?: {
    usedMock?: boolean;
    tableauContextProvider?: string;
    agentExecutionDebug?: {
      enabled: boolean;
      planSource: "bedrock" | "heuristic";
      passCount: number;
    };
  };
};

export type ContextResponse = {
  dashboardContextPatch?: DashboardContextPatch;
  debug?: {
    tableauContextProvider?: string;
  };
};
