import { useEffect, useState } from "react";
import { env } from "./env";
import { isAuthPopupStart, isAuthRedirect } from "./auth/cognitoAuth";
import AIContextPreviewPanel from "./components/AIContextPreviewPanel";
import AuthCallback from "./components/AuthCallback";
import AuthGate from "./components/AuthGate";
import AuthPopupStart from "./components/AuthPopupStart";
import ChatPanel from "./components/ChatPanel";
import { runSelectedMarkExplanationOrchestration } from "./api/orchestrationApi";
import { initializeTableauExtension } from "./tableau/tableauExtension";
import { buildContextPreviewModel } from "./tableau/contextPreview";
import { getDashboardContext } from "./tableau/dashboardContext";
import { registerMarkSelectionChangedListeners } from "./tableau/markSelectionListener";
import type { ContextPreviewLastChangedWorksheet } from "./tableau/contextPreview";
import type { DashboardContext } from "./types/tableau";
import type {
  ResolveIntentRequest,
  ResolveIntentResponse,
  SelectedMarkOrchestrationResponse,
} from "./types/orchestration";

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
  const [lastIntentResolution, setLastIntentResolution] = useState<
    ResolveIntentResponse["result"] | null
  >(null);
  const [lastOrchestrationResult, setLastOrchestrationResult] =
    useState<SelectedMarkOrchestrationResponse | null>(null);
  const [isResolvingIntent, setIsResolvingIntent] = useState(false);
  const [intentResolutionError, setIntentResolutionError] = useState<
    string | null
  >(null);
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
      {isResolvingIntent ? (
        <div className="operation-status" aria-live="polite">
          Running selected-mark orchestration...
        </div>
      ) : null}
      {lastIntentResolution ? (
        <div className="operation-status" aria-live="polite">
          Resolved intent: {lastIntentResolution.resolvedIntentId} (
          {lastIntentResolution.status}, confidence{" "}
          {lastIntentResolution.confidence.toFixed(2)})
        </div>
      ) : null}
      {lastOrchestrationResult ? (
        <>
          <div className="operation-status" aria-live="polite">
            Orchestration: {lastOrchestrationResult.status}
            {lastOrchestrationResult.planSelection?.selectedPlan?.id ? (
              <>
                {" "}
                / Plan: {lastOrchestrationResult.planSelection.selectedPlan.id}
              </>
            ) : null}
            {lastOrchestrationResult.execution?.status ? (
              <> / Execution: {lastOrchestrationResult.execution.status}</>
            ) : null}
          </div>
          <div className="operation-status" aria-live="polite">
            {lastOrchestrationResult.placeholderResponse}
          </div>
        </>
      ) : null}
      {intentResolutionError ? (
        <div className="error-banner" aria-live="polite">
          {intentResolutionError}
        </div>
      ) : null}
      <AIContextPreviewPanel
        preview={contextPreview}
        onActionSuggestionClick={async (suggestion) => {
          if (!suggestion.enabled || !suggestion.prompt || !contextPreview) {
            return;
          }

          setIsResolvingIntent(true);
          setIntentResolutionError(null);
          setLastIntentResolution(null);
          setLastOrchestrationResult(null);

          const request: ResolveIntentRequest = {
            actionId: suggestion.id,
            requestedIntent: suggestion.intent,
            message: suggestion.prompt,
            clientTimestamp: new Date().toISOString(),
            contextSummary: {
              dashboardName: contextPreview.dashboard.name,
              workbookName: contextPreview.workbook.name ?? undefined,
              viewName: contextPreview.view.name ?? undefined,
              hasSelectedMarks: contextPreview.selectedMarks.totalCount > 0,
              selectedMarkCount: contextPreview.selectedMarks.totalCount,
              worksheetNames: contextPreview.selectedMarks.items.map(
                (item) => item.worksheetName,
              ),
              summaryDataPreview:
                contextPreview.summaryDataPreview.status === "available"
                  ? {
                      available: true,
                      rowCount: contextPreview.summaryDataPreview.items.reduce(
                        (total, item) => total + item.totalRowCount,
                        0,
                      ),
                      columnCount:
                        contextPreview.summaryDataPreview.items.reduce(
                          (total, item) => total + item.totalColumnCount,
                          0,
                        ),
                      columnNames: Array.from(
                        new Set(
                          contextPreview.summaryDataPreview.items.flatMap(
                            (item) =>
                              item.columns
                                .map((column) => column.name)
                                .filter((name): name is string =>
                                  Boolean(name),
                                ),
                          ),
                        ),
                      ),
                      truncated: contextPreview.summaryDataPreview.truncated,
                    }
                  : {
                      available: false,
                      truncated: contextPreview.summaryDataPreview.truncated,
                    },
              filters:
                contextPreview.filters.length > 0
                  ? {
                      count: contextPreview.filters.length,
                      names: contextPreview.filters.map(
                        (filter) => filter.fieldName,
                      ),
                    }
                  : {
                      count: 0,
                      names: [],
                    },
              parameters:
                contextPreview.parameters.length > 0
                  ? {
                      count: contextPreview.parameters.length,
                      names: contextPreview.parameters.map(
                        (parameter) => parameter.name,
                      ),
                    }
                  : {
                      count: 0,
                      names: [],
                    },
            },
            metadata: {
              sourceKind: contextPreview.metadata.sourceKind,
              sourceVersion: contextPreview.metadata.sourceVersion,
              previewVersion: contextPreview.previewVersion,
              generatedAt: contextPreview.generatedAt,
              lastChangedWorksheet: contextPreview.lastChangedWorksheet,
              selectedMarksTruncated: contextPreview.selectedMarks.truncated,
            },
          };

          try {
            const response = await runSelectedMarkExplanationOrchestration(
              request,
              authToken,
            );
            setLastIntentResolution(response.result);
            setLastOrchestrationResult(response.orchestration ?? null);
          } catch (unknownError) {
            setLastIntentResolution(null);
            setLastOrchestrationResult(null);
            setIntentResolutionError(
              unknownError instanceof Error
                ? unknownError.message
                : "Selected-mark orchestration failed.",
            );
          } finally {
            setIsResolvingIntent(false);
          }
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
