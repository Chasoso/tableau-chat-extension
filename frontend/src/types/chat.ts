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

export type DashboardContextPatch = Partial<Pick<DashboardContext, "workbookName">>;

export type ChatResponse = {
  answer: string;
  sessionId: string;
  messageId: string;
  dashboardContextPatch?: DashboardContextPatch;
  debug?: {
    usedMock?: boolean;
    tableauContextProvider?: string;
  };
};

export type ContextResponse = {
  dashboardContextPatch?: DashboardContextPatch;
  debug?: {
    tableauContextProvider?: string;
  };
};
