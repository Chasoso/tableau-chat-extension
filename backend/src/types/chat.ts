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

export type ContextRequest = {
  dashboardContext: DashboardContext;
  clientContext?: ClientContext;
};

export type DashboardContextPatch = Partial<Pick<DashboardContext, "workbookName">>;

export type ChatResponse = {
  answer: string;
  sessionId: string;
  messageId: string;
  dashboardContextPatch?: DashboardContextPatch;
  debug?: {
    usedMock: boolean;
    tableauContextProvider: TableauAdditionalContext["provider"];
    mcpExecutionDebug?: TableauAdditionalContext["mcpExecutionDebug"];
    mcpObservations?: TableauAdditionalContext["mcpObservations"];
  };
};

export type ContextResponse = {
  dashboardContextPatch?: DashboardContextPatch;
  debug?: {
    tableauContextProvider: TableauAdditionalContext["provider"];
  };
};

export type ChatHistoryRecord = {
  sessionId: string;
  messageId: string;
  ownerUserId?: string | null;
  question: string;
  answer: string;
  dashboardName: string;
  workbookName?: string | null;
  worksheetNames: string[];
  createdAt: string;
  source?: string;
};
