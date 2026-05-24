import type { DashboardContext, TableauAdditionalContext } from "../types/tableau";

export type GetAdditionalContextInput = {
  dashboardContext: DashboardContext;
  question: string;
};

export interface TableauContextProvider {
  readonly name: TableauAdditionalContext["provider"];
  getAdditionalContext(input: GetAdditionalContextInput): Promise<TableauAdditionalContext>;
}

