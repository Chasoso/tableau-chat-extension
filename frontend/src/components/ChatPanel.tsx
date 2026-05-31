import { useEffect, useRef, useState } from "react";
import { sendChatQuestion } from "../api/chatApi";
import { enrichDashboardContext } from "../api/contextApi";
import {
  disconnectNotion,
  getNotionStatus,
  savePostIdeaToNotion,
  startNotionConnect,
  type NotionPostIdeaDraft,
  type NotionStatusResponse,
} from "../api/notionApi";
import { env } from "../env";
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

const exampleQuestions = [
  "このダッシュボードのポイントを教えてください",
  "フィルター状態を要約してください",
  "使われているデータソースを教えてください",
  "次に見るべき指標は何ですか",
];

export default function ChatPanel({ dashboardContext, authToken, userDisplayName, onDashboardContextPatch }: Props) {
  const enrichmentStartedKey = useRef<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notionStatus, setNotionStatus] = useState<NotionStatusResponse | null>(null);
  const [notionLoading, setNotionLoading] = useState(false);
  const [notionDraft, setNotionDraft] = useState<NotionPostIdeaDraft | null>(null);
  const [notionSavedUrl, setNotionSavedUrl] = useState<string | null>(null);

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
    enrichDashboardContext(
      {
        dashboardContext,
        clientContext: {
          source: "tableau-extension",
          appVersion: env.appVersion,
        },
      },
      authToken,
    )
      .then((response) => {
        if (response.dashboardContextPatch?.workbookName) {
          onDashboardContextPatch?.(response.dashboardContextPatch);
        }
      })
      .catch(() => {
        // Keep chat usable even when context enrichment fails.
      });
  }, [authToken, dashboardContext, onDashboardContextPatch]);

  useEffect(() => {
    if (env.authRequired && !authToken) {
      return;
    }

    getNotionStatus(authToken)
      .then((status) => setNotionStatus(status))
      .catch(() => {
        setNotionStatus({
          connected: false,
          status: "disconnected",
          targetParentPageIdConfigured: false,
          targetDatabaseIdConfigured: false,
        });
      });
  }, [authToken]);

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
    setNotionSavedUrl(null);

    try {
      const response = await sendChatQuestion(
        {
          question: trimmedQuestion,
          dashboardContext,
          clientContext: {
            source: "tableau-extension",
            appVersion: env.appVersion,
          },
          sessionId,
        },
        authToken,
      );

      setSessionId(response.sessionId);
      if (response.dashboardContextPatch) {
        onDashboardContextPatch?.(response.dashboardContextPatch);
      }
      if (response.notionPostIdeaDraft) {
        setNotionDraft(response.notionPostIdeaDraft);
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
      setError(unknownError instanceof Error ? unknownError.message : "回答の取得に失敗しました。");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleConnectNotion() {
    try {
      setNotionLoading(true);
      const authorizationUrl = await startNotionConnect(
        {
          redirectAfter: window.location.href,
        },
        authToken,
      );
      window.location.href = authorizationUrl;
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : "Notion接続に失敗しました。");
    } finally {
      setNotionLoading(false);
    }
  }

  async function handleDisconnectNotion() {
    try {
      setNotionLoading(true);
      await disconnectNotion(authToken);
      setNotionStatus({
        connected: false,
        status: "disconnected",
        targetParentPageIdConfigured: notionStatus?.targetParentPageIdConfigured ?? false,
        targetDatabaseIdConfigured: notionStatus?.targetDatabaseIdConfigured ?? false,
      });
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : "Notion切断に失敗しました。");
    } finally {
      setNotionLoading(false);
    }
  }

  async function handleSaveToNotion() {
    if (!notionDraft) {
      return;
    }

    try {
      setNotionLoading(true);
      const saved = await savePostIdeaToNotion(notionDraft, authToken);
      setNotionSavedUrl(saved.pageUrl ?? null);
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : "Notion保存に失敗しました。");
    } finally {
      setNotionLoading(false);
    }
  }

  return (
    <section className="chat-panel" aria-label="Tableau Chat Panel">
      <header className="chat-header">
        <div>
          <h1>Tableau Assistant</h1>
          <p>ダッシュボード文脈を使って質問に答えます。</p>
        </div>
        {userDisplayName ? <span className="user-pill">{userDisplayName}</span> : null}
      </header>

      <section className="notion-status-panel" aria-label="Notion integration status">
        <div>
          <strong>Notion</strong>
          <p>
            {notionStatus?.connected
              ? `Connected: ${notionStatus.workspaceName ?? "workspace"}`
              : "Not connected"}
          </p>
        </div>
        <div className="notion-status-actions">
          {notionStatus?.connected ? (
            <button type="button" disabled={notionLoading} onClick={() => void handleDisconnectNotion()}>
              Disconnect
            </button>
          ) : (
            <button type="button" disabled={notionLoading} onClick={() => void handleConnectNotion()}>
              Connect Notion
            </button>
          )}
        </div>
      </section>

      <div className={messages.length === 0 ? "chat-body has-starters" : "chat-body no-starters"}>
        {messages.length === 0 ? (
          <section className="question-starters" aria-label="suggested questions">
            <p>たとえば、次の質問ができます。</p>
            <div className="starter-chip-row">
              {exampleQuestions.map((question) => (
                <button key={question} disabled={isLoading} type="button" onClick={() => void handleSend(question)}>
                  {question}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <MessageList messages={messages} isLoading={isLoading} />
      </div>

      <div className="chat-footer">
        {notionDraft ? (
          <section className="notion-draft-card" aria-label="Notion post idea preview">
            <h2>Notion保存プレビュー</h2>
            <p className="draft-title">{notionDraft.title}</p>
            <p>{notionDraft.reason}</p>
            <button
              type="button"
              className="notion-save-button"
              disabled={notionLoading || !notionStatus?.connected}
              onClick={() => void handleSaveToNotion()}
            >
              Notionに保存
            </button>
            {!notionStatus?.connected ? <p className="draft-note">保存するには先にNotion接続が必要です。</p> : null}
            {notionSavedUrl ? (
              <p className="draft-note">
                保存完了:{" "}
                <a href={notionSavedUrl} target="_blank" rel="noreferrer">
                  Notionページを開く
                </a>
              </p>
            ) : null}
          </section>
        ) : null}
        {error ? <div className="error-banner">{error}</div> : null}
        <MessageInput disabled={isLoading} onSend={handleSend} />
      </div>
    </section>
  );
}
