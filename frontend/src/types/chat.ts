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

export type ChatResponse = {
  answer: string;
  sessionId: string;
  messageId: string;
  dashboardContextPatch?: Partial<Pick<DashboardContext, "workbookName">>;
  debug?: {
    usedMock?: boolean;
    tableauContextProvider?: string;
  };
};
