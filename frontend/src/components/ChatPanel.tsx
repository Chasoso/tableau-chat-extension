import { useEffect, useRef, useState } from "react";
import { env } from "../env";
import { sendChatQuestion } from "../api/chatApi";
import { enrichDashboardContext } from "../api/contextApi";
import type { ChatMessage } from "../types/chat";
import type { DashboardContext } from "../types/tableau";
import MessageInput from "./MessageInput";
import MessageList from "./MessageList";

type Props = {
  dashboardContext: DashboardContext;
  authToken?: string;
  userDisplayName?: string;
  onDashboardContextPatch?: (patch: Partial<Pick<DashboardContext, "workbookName">>) => void;
};

const exampleQuestions = ["概要を教えて", "傾向を教えて", "この数値の意味は？", "さらに見るべき観点は？"];

export default function ChatPanel({ dashboardContext, authToken, userDisplayName, onDashboardContextPatch }: Props) {
  const enrichmentStartedKey = useRef<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
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
        // Keep the UI focused on asking questions. Missing enrichment is handled in chat answers.
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
      setError(unknownError instanceof Error ? unknownError.message : "質問の送信に失敗しました。");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="chat-panel" aria-label="ダッシュボード質問パネル">
      <header className="chat-header">
        <div>
          <h1>質問</h1>
          <p>表示中のダッシュボードについて聞けます</p>
        </div>
        {userDisplayName ? <span className="user-pill">{userDisplayName}</span> : null}
      </header>

      <div className={messages.length === 0 ? "chat-body has-starters" : "chat-body no-starters"}>
        {messages.length === 0 ? (
          <section className="question-starters" aria-label="質問例">
            <p>たとえば、こんな質問ができます。</p>
            <div className="starter-chip-row">
              {exampleQuestions.map((question) => (
                <button
                  key={question}
                  disabled={isLoading}
                  type="button"
                  onClick={() => void handleSend(question)}
                >
                  {question}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <MessageList messages={messages} isLoading={isLoading} />
      </div>

      <div className="chat-footer">
        {error ? <div className="error-banner">{error}</div> : null}
        <MessageInput disabled={isLoading} onSend={handleSend} />
      </div>
    </section>
  );
}
