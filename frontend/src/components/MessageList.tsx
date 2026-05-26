import type { ChatMessage } from "../types/chat";

type Props = {
  messages: ChatMessage[];
  isLoading: boolean;
};

export default function MessageList({ messages, isLoading }: Props) {
  return (
    <div className="message-list" aria-live="polite">
      {messages.map((message) => (
        <article key={message.id} className={`message-bubble ${message.role}`}>
          <span>{message.role === "user" ? "あなた" : "アシスタント"}</span>
          <p>{message.content}</p>
        </article>
      ))}
      {isLoading ? (
        <article className="message-bubble assistant loading">
          <span>アシスタント</span>
          <p>ダッシュボードを確認しています...</p>
        </article>
      ) : null}
    </div>
  );
}
