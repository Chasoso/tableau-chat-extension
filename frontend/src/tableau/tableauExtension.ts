import { env } from "../env";
import type { DashboardContext } from "../types/tableau";
import { createMockDashboardContext, getDashboardContext } from "./dashboardContext";

type TableauExtensionsGlobal = {
  extensions?: {
    initializeAsync: () => Promise<void>;
    dashboardContent?: {
      dashboard?: unknown;
    };
  };
};

declare global {
  interface Window {
    tableau?: TableauExtensionsGlobal;
  }
}

export async function initializeTableauExtension(): Promise<DashboardContext> {
  if (env.useMockTableau) {
    return createMockDashboardContext();
  }

  const tableau = window.tableau?.extensions;
  if (!tableau?.initializeAsync) {
    return createMockDashboardContext();
  }

  try {
    await tableau.initializeAsync();
    const dashboard = tableau.dashboardContent?.dashboard;
    if (!dashboard) {
      return createMockDashboardContext();
    }

    return getDashboardContext(dashboard);
  } catch (error) {
    console.warn("Falling back to mock Tableau context. Tableau initialization failed.", error);
    return createMockDashboardContext();
  }
}

