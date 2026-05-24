import type { DashboardContext, TableauAdditionalContext } from "../types/tableau";
import type { AuthenticatedUser } from "../types/auth";

export type GetAdditionalContextInput = {
  dashboardContext: DashboardContext;
  question: string;
  authenticatedUser?: AuthenticatedUser;
  tableauSubject?: string;
};

export interface TableauContextProvider {
  readonly name: TableauAdditionalContext["provider"];
  getAdditionalContext(input: GetAdditionalContextInput): Promise<TableauAdditionalContext>;
}
