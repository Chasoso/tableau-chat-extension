import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type {
  ChatJobDisplayState,
  ChatJobProgressMessage,
  ChatMessage,
} from "../types/chat";

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
  job?: ChatJobDisplayState | null;
  notionCompletion?: NotionCompletion | null;
  onToggleNotionCompletion?: () => void;
};

export default function MessageList({
  messages,
  isLoading,
  loadingText = "データを確認しています…",
  job,
  notionCompletion,
  onToggleNotionCompletion,
}: Props) {
  const progressMessages = job?.progressMessages ?? [];
  const recentProgressMessages = progressMessages.slice(-5);
  const latestProgressMessage =
    recentProgressMessages[recentProgressMessages.length - 1] ??
    getLastProgressMessage(progressMessages);

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

      {job ? (
        <section
          className={`job-progress-card ${job.status}`}
          aria-label="分析の進捗"
        >
          <div className="job-progress-header">
            <div>
              <p className="job-progress-status">
                {formatStatusLabel(job.status)}
              </p>
              <h2>{formatStageLabel(job.stage)}</h2>
            </div>
            <span className="job-progress-pill">
              {job.progressMessages.length}件
            </span>
          </div>

          {latestProgressMessage ? (
            <p className="job-progress-current">
              {latestProgressMessage.message}
            </p>
          ) : null}

          {job.status === "failed" && job.error ? (
            <p className="job-progress-error">{job.error.message}</p>
          ) : null}

          {recentProgressMessages.length ? (
            <ul className="job-progress-list">
              {recentProgressMessages.map((progressMessage) => (
                <li key={`${progressMessage.at}-${progressMessage.stage}`}>
                  <div className="job-progress-list-row">
                    <span className="job-progress-stage">
                      {formatStageLabel(progressMessage.stage)}
                    </span>
                    {progressMessage.toolName ? (
                      <span className="job-progress-tool">
                        ツール: {progressMessage.toolName}
                      </span>
                    ) : null}
                  </div>
                  <p>{progressMessage.message}</p>
                  {formatDebugEntries(progressMessage).length ? (
                    <div className="job-progress-meta">
                      {formatDebugEntries(progressMessage).map((entry) => (
                        <span key={entry} className="job-progress-meta-item">
                          {entry}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {notionCompletion ? (
        <section className="notion-completion-row" aria-label="Notion完了">
          <button
            type="button"
            className="notion-completion-toggle"
            onClick={onToggleNotionCompletion}
            aria-expanded={notionCompletion.expanded}
            aria-label="Notion完了メッセージを切り替え"
          >
            <span
              className={`toggle-icon ${notionCompletion.expanded ? "open" : ""}`}
              aria-hidden
            >
              ▶
            </span>
            <span>Notionに保存しました</span>
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

      {isLoading && !job ? (
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

function formatStatusLabel(status: ChatJobDisplayState["status"]): string {
  switch (status) {
    case "queued":
      return "キュー待ち";
    case "running":
      return "実行中";
    case "finalizing":
      return "最終化中";
    case "completed":
      return "完了";
    case "failed":
      return "失敗";
    case "cancel_requested":
      return "キャンセル要求済み";
    default:
      return status;
  }
}

function formatStageLabel(stage: ChatJobDisplayState["stage"]): string {
  switch (stage) {
    case "queued":
      return "待機中";
    case "loading_history":
      return "履歴を読み込み中";
    case "loading_dashboard_context":
      return "ダッシュボード情報を確認中";
    case "planning":
      return "計画中";
    case "running_mcp_tools":
      return "MCPツールを実行中";
    case "generating_answer":
      return "回答を生成中";
    case "finalizing":
      return "最終調整中";
    case "completed":
      return "完了";
    case "failed":
      return "失敗";
    default:
      return stage;
  }
}

function formatDebugEntries(message: ChatJobProgressMessage): string[] {
  const entries: string[] = [];
  const debug = message.debug ?? {};

  if (typeof debug.passCount === "number") {
    entries.push(`pass ${debug.passCount}`);
  }
  if (typeof debug.toolCallCount === "number") {
    entries.push(`tools ${debug.toolCallCount}`);
  }
  if (typeof debug.replanUsed === "boolean") {
    entries.push(`replan ${debug.replanUsed ? "yes" : "no"}`);
  }
  if (typeof debug.fallbackReason === "string" && debug.fallbackReason) {
    entries.push(`fallback ${debug.fallbackReason}`);
  }
  if (typeof debug.provider === "string" && debug.provider) {
    entries.push(`provider ${debug.provider}`);
  }
  if (typeof debug.intent === "string" && debug.intent) {
    entries.push(`intent ${debug.intent}`);
  }

  return entries.slice(0, 5);
}

function getLastProgressMessage(
  progressMessages?: ChatJobProgressMessage[],
): ChatJobProgressMessage | undefined {
  if (!progressMessages || progressMessages.length === 0) {
    return undefined;
  }

  return progressMessages[progressMessages.length - 1];
}
