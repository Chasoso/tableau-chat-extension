import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage } from "../types/chat";

export type NotionCompletion = {
  title: string;
  summary: string;
  pageUrl?: string | null;
  expanded: boolean;
};

type Props = {
  messages: ChatMessage[];
  isLoading: boolean;
  loadingText?: string;
  notionCompletion?: NotionCompletion | null;
  onToggleNotionCompletion?: () => void;
};

export default function MessageList({
  messages,
  isLoading,
  loadingText = "データを確認しています…",
  notionCompletion,
  onToggleNotionCompletion,
}: Props) {
  return (
    <div className="message-list" aria-live="polite">
      {messages.map((message) => (
        <article
          key={message.id}
          className={`message-bubble ${message.role}${message.role === "assistant" ? " assistant-reply" : ""}`}
        >
          {message.role === "assistant" ? (
            <div className="markdown-content">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {message.content}
              </ReactMarkdown>
            </div>
          ) : (
            <p>{message.content}</p>
          )}
        </article>
      ))}

      {notionCompletion ? (
        <section className="notion-completion-row" aria-label="Notion保存完了">
          <button
            type="button"
            className="notion-completion-toggle"
            onClick={onToggleNotionCompletion}
            aria-expanded={notionCompletion.expanded}
            aria-label="Notion保存完了メッセージを開閉"
          >
            <span
              className={`toggle-icon ${notionCompletion.expanded ? "open" : ""}`}
              aria-hidden
            >
              ▶
            </span>
            <span>Notionに情報を登録しました。</span>
          </button>
          {notionCompletion.expanded ? (
            <div className="notion-completion-body">
              <p>
                <strong>保存タイトル:</strong> {notionCompletion.title}
              </p>
              <p>
                <strong>保存内容の要約:</strong> {notionCompletion.summary}
              </p>
              {notionCompletion.pageUrl ? (
                <p>
                  <a
                    href={notionCompletion.pageUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Notionページを開く
                  </a>
                </p>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {isLoading ? (
        <article className="message-bubble assistant loading">
          <p>
            <span className="spinner" aria-hidden />
            {loadingText}
          </p>
        </article>
      ) : null}
    </div>
  );
}
