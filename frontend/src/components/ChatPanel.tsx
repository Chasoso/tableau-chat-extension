import { useEffect, useRef, useState } from "react";
import { env } from "../env";
import { sendChatQuestion } from "../api/chatApi";
import { enrichDashboardContext } from "../api/contextApi";
import type { ChatMessage } from "../types/chat";
import type { DashboardContext } from "../types/tableau";
import DashboardContextPanel from "./DashboardContextPanel";
import MessageInput from "./MessageInput";
import MessageList from "./MessageList";

type Props = {
  dashboardContext: DashboardContext;
  authToken?: string;
  userDisplayName?: string;
  onDashboardContextPatch?: (patch: Partial<Pick<DashboardContext, "workbookName">>) => void;
};

export default function ChatPanel({ dashboardContext, authToken, userDisplayName, onDashboardContextPatch }: Props) {
  const enrichmentStartedKey = useRef<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "このダッシュボードについて質問してください。取得できるTableauコンテキストを使って回答します。",
      createdAt: new Date().toISOString(),
    },
  ]);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (dashboardContext.workbookName) {
      return;
    }

    if (env.authRequired && !authToken) {
      return;
    }

    const enrichmentKey = `${dashboardContext.dashboardName}:${dashboardContext.capturedAt}`;
    if (enrichmentStartedKey.current === enrichmentKey) {
      return;
    }

    enrichmentStartedKey.current = enrichmentKey;
    enrichDashboardContext({
      dashboardContext,
      clientContext: {
        source: "tableau-extension",
        appVersion: env.appVersion,
      },
    }, authToken)
      .then((response) => {
        if (response.dashboardContextPatch?.workbookName) {
          onDashboardContextPatch?.(response.dashboardContextPatch);
        }
      })
      .catch(() => {
        // Keep the UI usable; chat responses can still explain missing context.
      });
  }, [authToken, dashboardContext, onDashboardContextPatch]);

  async function handleSend(question: string) {
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion || isLoading) {
      return;
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmedQuestion,
      createdAt: new Date().toISOString(),
    };

    setMessages((current) => [...current, userMessage]);
    setIsLoading(true);
    setError(null);

    try {
      const response = await sendChatQuestion({
        question: trimmedQuestion,
        dashboardContext,
        clientContext: {
          source: "tableau-extension",
          appVersion: env.appVersion,
        },
        sessionId,
      }, authToken);

      setSessionId(response.sessionId);
      if (response.dashboardContextPatch) {
        onDashboardContextPatch?.(response.dashboardContextPatch);
      }
      setMessages((current) => [
        ...current,
        {
          id: response.messageId,
          role: "assistant",
          content: response.answer,
          createdAt: new Date().toISOString(),
        },
      ]);
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : "Failed to send the question.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="chat-panel" aria-label="Tableau Assistant chat panel">
      <header className="chat-header">
        <div>
          <h1>Tableau Assistant</h1>
          <p>ダッシュボードについて質問できます</p>
        </div>
      </header>
      {userDisplayName ? <div className="user-strip">ログイン中: {userDisplayName}</div> : null}

      <DashboardContextPanel dashboardContext={dashboardContext} />
      <MessageList messages={messages} isLoading={isLoading} />

      {error ? <div className="error-banner">{error}</div> : null}

      <MessageInput disabled={isLoading} onSend={handleSend} />
    </section>
  );
}
