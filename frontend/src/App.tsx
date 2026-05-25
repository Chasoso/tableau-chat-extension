import { useEffect, useState } from "react";
import { env } from "./env";
import { isAuthPopupStart, isAuthRedirect } from "./auth/cognitoAuth";
import AuthCallback from "./components/AuthCallback";
import AuthGate from "./components/AuthGate";
import AuthPopupStart from "./components/AuthPopupStart";
import ChatPanel from "./components/ChatPanel";
import { initializeTableauExtension } from "./tableau/tableauExtension";
import type { AuthSession } from "./types/auth";
import type { DashboardContext } from "./types/tableau";

export default function App() {
  if (env.authRequired && isAuthPopupStart()) {
    return <AuthPopupStart />;
  }

  if (env.authRequired && isAuthRedirect()) {
    return <AuthCallback />;
  }

  return <DashboardExtensionApp />;
}

function DashboardExtensionApp() {
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

  const renderPanel = (session?: AuthSession) => (
    <div className="app-shell">
      <ChatPanel
        dashboardContext={dashboardContext}
        authToken={session?.idToken}
        userEmail={session?.email}
        onDashboardContextPatch={(patch) => {
          setDashboardContext((current) => (current ? { ...current, ...patch } : current));
        }}
      />
    </div>
  );

  if (env.authRequired) {
    return <AuthGate>{(session) => renderPanel(session)}</AuthGate>;
  }

  return renderPanel();
}
