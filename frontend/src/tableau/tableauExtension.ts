import { env } from "../env";
import type { DashboardContext } from "../types/tableau";
import { createMockDashboardContext, getDashboardContext } from "./dashboardContext";

type TableauExtensionsGlobal = {
  extensions?: {
    initializeAsync: () => Promise<void>;
    workbook?: unknown;
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
    return createMockDashboardContext("VITE_USE_MOCK_TABLEAU=true is enabled.");
  }

  const tableau = window.tableau?.extensions;
  if (!tableau?.initializeAsync) {
    return createMockDashboardContext("Tableau Extensions API was not available in the browser window.");
  }

  try {
    await tableau.initializeAsync();
    const dashboard = tableau.dashboardContent?.dashboard;
    if (!dashboard) {
      return createMockDashboardContext("Tableau Extensions API initialized, but no active dashboard was available.");
    }

    return getDashboardContext(dashboard, {
      workbook: tableau.workbook,
      referrer: document.referrer,
    });
  } catch (error) {
    console.warn("Falling back to mock Tableau context. Tableau initialization failed.", error);
    return createMockDashboardContext("Tableau Extensions API initialization failed.");
  }
}
