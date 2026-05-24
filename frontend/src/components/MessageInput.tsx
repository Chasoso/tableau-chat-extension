import { FormEvent, useState } from "react";

type Props = {
  disabled?: boolean;
  onSend: (question: string) => void;
};

export default function MessageInput({ disabled, onSend }: Props) {
  const [question, setQuestion] = useState("");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSend(question);
    setQuestion("");
  }

  return (
    <form className="message-input" onSubmit={handleSubmit}>
      <textarea
        aria-label="Question"
        disabled={disabled}
        placeholder="Ask about filters, worksheets, trends..."
        rows={3}
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
      />
      <button disabled={disabled || !question.trim()} type="submit">
        Send
      </button>
    </form>
  );
}

