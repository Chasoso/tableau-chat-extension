import type { ChatHistoryRecord, ChatRequest } from "../types/chat";
import type { TableauAdditionalContext } from "../types/tableau";
import { compressDashboardContext, renderCompressedContext } from "./contextCompressor";

const MAX_HISTORY_QUESTION_CHARS = 300;
const MAX_HISTORY_ANSWER_CHARS = 700;

export function buildPrompt(
  request: ChatRequest,
  additionalContext: TableauAdditionalContext,
  recentHistory: ChatHistoryRecord[] = [],
): string {
  const compressedContext = compressDashboardContext(request, additionalContext);

  return [
    "You are a Tableau dashboard assistant.",
    "Answer using only the provided dashboard metadata and additional Tableau context.",
    "Do not infer confidential row-level details that were not provided.",
    "If the answer is not available from the context, say so clearly.",
    "Respond in the same language as the user's question when practical.",
    recentHistory.length
      ? [
          "Recent conversation in the same authenticated session:",
          ...recentHistory.flatMap((record, index) => [
            `Turn ${index + 1} user: ${truncateText(record.question, MAX_HISTORY_QUESTION_CHARS)}`,
            `Turn ${index + 1} assistant: ${truncateText(record.answer, MAX_HISTORY_ANSWER_CHARS)}`,
          ]),
          "Use the recent conversation only when it is relevant to the current question.",
        ].join("\n")
      : "",
    `Question: ${request.question}`,
    "Context:",
    renderCompressedContext(compressedContext),
  ].join("\n");
}

function truncateText(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, maxChars).trimEnd()}...`;
}
