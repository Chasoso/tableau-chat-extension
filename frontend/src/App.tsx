import { useEffect, useState } from "react";
import ChatPanel from "./components/ChatPanel";
import { initializeTableauExtension } from "./tableau/tableauExtension";
import type { DashboardContext } from "./types/tableau";

export default function App() {
  const [dashboardContext, setDashboardContext] = useState<DashboardContext | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    initializeTableauExtension()
      .then((context) => {
        if (isMounted) {
          setDashboardContext(context);
        }
      })
      .catch((unknownError) => {
        if (isMounted) {
          setError(unknownError instanceof Error ? unknownError.message : "Failed to initialize Tableau extension.");
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  if (error) {
    return <div className="app-shell error-state">{error}</div>;
  }

  if (!dashboardContext) {
    return <div className="app-shell loading-state">Loading dashboard context...</div>;
  }

  return (
    <div className="app-shell">
      <ChatPanel dashboardContext={dashboardContext} />
    </div>
  );
}

