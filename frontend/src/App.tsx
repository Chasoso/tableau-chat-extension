import { useEffect, useState } from "react";
import { env } from "./env";
import { isAuthPopupStart, isAuthRedirect } from "./auth/cognitoAuth";
import AIContextPreviewPanel from "./components/AIContextPreviewPanel";
import AuthCallback from "./components/AuthCallback";
import AuthGate from "./components/AuthGate";
import AuthPopupStart from "./components/AuthPopupStart";
import ChatPanel from "./components/ChatPanel";
import { initializeTableauExtension } from "./tableau/tableauExtension";
import { buildContextPreviewModel } from "./tableau/contextPreview";
import { getDashboardContext } from "./tableau/dashboardContext";
import { registerMarkSelectionChangedListeners } from "./tableau/markSelectionListener";
import type { ContextPreviewLastChangedWorksheet } from "./tableau/contextPreview";
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
  const [dashboardContext, setDashboardContext] =
    useState<DashboardContext | null>(null);
  const [contextPreview, setContextPreview] = useState<ReturnType<
    typeof buildContextPreviewModel
  > | null>(null);
  const [questionPrefill, setQuestionPrefill] = useState<{
    requestId: string;
    text: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    let cleanupListeners = () => {};

    const applyDashboardContext = (
      nextContext: DashboardContext,
      lastChangedWorksheet?: ContextPreviewLastChangedWorksheet,
    ) => {
      setDashboardContext(nextContext);
      setContextPreview(
        buildContextPreviewModel(nextContext, {
          lastChangedWorksheet,
        }),
      );
    };

    const refreshDashboardContext = async (
      lastChangedWorksheet?: ContextPreviewLastChangedWorksheet,
    ) => {
      const tableau = window.tableau?.extensions;
      const dashboard = tableau?.dashboardContent?.dashboard;

      if (!tableau?.initializeAsync || !dashboard) {
        return;
      }

      const nextContext = await getDashboardContext(dashboard as never, {
        workbook: tableau.workbook,
        referrer: document.referrer,
      });

      if (!isMounted) {
        return;
      }

      applyDashboardContext(nextContext, lastChangedWorksheet);
    };

    initializeTableauExtension()
      .then((context) => {
        if (isMounted) {
          applyDashboardContext(context);

          const tableauDashboard =
            window.tableau?.extensions?.dashboardContent?.dashboard;
          cleanupListeners = registerMarkSelectionChangedListeners(
            tableauDashboard,
            {
              onSelectionChanged: (selectionContext) =>
                refreshDashboardContext(
                  selectionContext.worksheetName
                    ? {
                        worksheetName: selectionContext.worksheetName,
                        worksheetId: selectionContext.worksheetId,
                        changedAt: selectionContext.changedAt,
                        source: "selection",
                      }
                    : null,
                ),
              onError: (listenerError) => {
                console.warn(
                  "Failed to register MarkSelectionChanged listener.",
                  listenerError,
                );
              },
            },
          );
        }
      })
      .catch((unknownError) => {
        if (isMounted) {
          setError(
            unknownError instanceof Error
              ? unknownError.message
              : "Tableau初期化に失敗しました。",
          );
        }
      });

    return () => {
      isMounted = false;
      cleanupListeners();
    };
  }, []);

  if (error) {
    return <div className="app-shell error-state">{error}</div>;
  }

  if (!dashboardContext) {
    return (
      <div className="app-shell loading-state">
        ダッシュボード情報を読み込んでいます…
      </div>
    );
  }

  const renderPanel = ({
    authToken,
    userDisplayName,
    isAuthenticated,
    isAuthLoading,
    isSigningIn,
    authError,
    onSignIn,
  }: {
    authToken?: string;
    userDisplayName?: string;
    isAuthenticated: boolean;
    isAuthLoading?: boolean;
    isSigningIn?: boolean;
    authError?: string | null;
    onSignIn?: () => Promise<void>;
  }) => (
    <div className="app-shell">
      <AIContextPreviewPanel
        preview={contextPreview}
        onActionSuggestionClick={(suggestion) => {
          if (!suggestion.enabled || !suggestion.prompt) {
            return;
          }

          setQuestionPrefill({
            requestId: crypto.randomUUID(),
            text: suggestion.prompt,
          });
        }}
      />
      <ChatPanel
        dashboardContext={dashboardContext}
        authToken={authToken}
        userDisplayName={userDisplayName}
        isAuthenticated={isAuthenticated}
        isAuthLoading={Boolean(isAuthLoading)}
        authOverlay={
          env.authRequired
            ? {
                isSigningIn: Boolean(isSigningIn),
                error: authError ?? null,
                onSignIn: onSignIn ?? (() => Promise.resolve()),
              }
            : undefined
        }
        questionPrefill={questionPrefill}
        onDashboardContextPatch={(patch) => {
          setDashboardContext((current) => {
            if (!current) {
              return current;
            }

            const nextContext = { ...current, ...patch };
            setContextPreview((currentPreview) =>
              buildContextPreviewModel(nextContext, {
                lastChangedWorksheet:
                  currentPreview?.lastChangedWorksheet ?? null,
              }),
            );
            return nextContext;
          });
        }}
      />
    </div>
  );

  if (env.authRequired) {
    return (
      <AuthGate>
        {({ session, isLoading, isSigningIn, error: authError, startSignIn }) =>
          renderPanel({
            authToken: session?.idToken,
            userDisplayName: session?.nickname,
            isAuthenticated: Boolean(session),
            isAuthLoading: isLoading,
            isSigningIn,
            authError,
            onSignIn: startSignIn,
          })
        }
      </AuthGate>
    );
  }

  return renderPanel({ isAuthenticated: true });
}
