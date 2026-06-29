import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MessageInput from "./MessageInput";

describe("MessageInput", () => {
  it("submits a trimmed question and clears the field", () => {
    const onSend = vi.fn();
    render(<MessageInput onSend={onSend} />);

    const textarea = screen.getByLabelText("質問");
    const submitButton = screen.getByRole("button", { name: "送信" });

    fireEvent.change(textarea, {
      target: { value: "  Tableauのポイントを教えて  " },
    });
    fireEvent.click(submitButton);

    expect(onSend).toHaveBeenCalledWith("Tableauのポイントを教えて");
    expect(textarea).toHaveValue("");
  });

  it("keeps the send button disabled for whitespace-only input", () => {
    render(<MessageInput onSend={() => undefined} />);

    const textarea = screen.getByLabelText("質問");
    const submitButton = screen.getByRole("button", { name: "送信" });

    fireEvent.change(textarea, { target: { value: "   " } });

    expect(submitButton).toBeDisabled();
  });

  it("submits on Enter but not on Shift+Enter", () => {
    const onSend = vi.fn();
    render(<MessageInput onSend={onSend} />);

    const textarea = screen.getByLabelText("質問");
    fireEvent.change(textarea, { target: { value: "選択マークを説明して" } });

    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();

    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
    expect(onSend).toHaveBeenCalledWith("選択マークを説明して");
  });

  it("prefills the textarea without auto submitting", () => {
    const onSend = vi.fn();
    const { rerender } = render(<MessageInput onSend={onSend} />);

    rerender(
      <MessageInput
        onSend={onSend}
        prefill={{
          requestId: "suggestion-1",
          text: "この選択を説明してください。",
        }}
      />,
    );

    const textarea = screen.getByLabelText("質問");
    const submitButton = screen.getByRole("button", { name: "送信" });

    expect(textarea).toHaveValue("この選択を説明してください。");
    expect(onSend).not.toHaveBeenCalled();
    expect(submitButton).not.toBeDisabled();
  });
});
