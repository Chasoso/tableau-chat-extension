import type { DashboardContext, TableauAdditionalContext } from "./tableau";

export type ClientContext = {
  source?: string;
  appVersion?: string;
};

export type ChatRequest = {
  question: string;
  dashboardContext: DashboardContext;
  clientContext?: ClientContext;
  sessionId?: string;
};

export type ChatResponse = {
  answer: string;
  sessionId: string;
  messageId: string;
  dashboardContextPatch?: Partial<Pick<DashboardContext, "workbookName">>;
  debug?: {
    usedMock: boolean;
    tableauContextProvider: TableauAdditionalContext["provider"];
  };
};

export type ChatHistoryRecord = {
  sessionId: string;
  messageId: string;
  question: string;
  answer: string;
  dashboardName: string;
  workbookName?: string | null;
  worksheetNames: string[];
  createdAt: string;
  source?: string;
};
