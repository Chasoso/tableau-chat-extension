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
  const observationCount = additionalContext.mcpObservations?.length ?? 0;
  const executionDebug = additionalContext.mcpExecutionDebug;

  return [
    "You are a Tableau dashboard assistant.",
    "Answer directly to the user's question using dashboard context and MCP observations.",
    "Use evidence from the provided context. Do not make claims beyond obtained data.",
    "If information is missing, explain what is missing instead of guessing.",
    "Do not infer confidential row-level details that were not provided.",
    "Avoid generic Tableau theory unless the user explicitly asks how-to guidance.",
    "When answering, clarify scope with phrases like 'In this dashboard context' or 'From retrieved Tableau Cloud information'.",
    observationCount
      ? "You received MCP observations. Prioritize them as evidence over assumptions."
      : "No MCP observations were collected. Rely only on dashboard context and clearly mention limitations.",
    "Respond in the same language as the user's question when practical.",
    executionDebug
      ? `Execution summary: intent=${executionDebug.intent}, needsMcp=${String(executionDebug.needsMcp)}, toolCalls=${executionDebug.toolCallCount}, replanUsed=${String(executionDebug.replanUsed)}`
      : "",
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
