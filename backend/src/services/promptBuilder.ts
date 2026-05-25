import type { ChatRequest } from "../types/chat";
import type { TableauAdditionalContext } from "../types/tableau";
import { compressDashboardContext, renderCompressedContext } from "./contextCompressor";

export function buildPrompt(request: ChatRequest, additionalContext: TableauAdditionalContext): string {
  const compressedContext = compressDashboardContext(request, additionalContext);

  return [
    "You are a Tableau dashboard assistant.",
    "Answer using only the provided dashboard metadata and additional Tableau context.",
    "Do not infer confidential row-level details that were not provided.",
    "If the answer is not available from the context, say so clearly.",
    "Respond in the same language as the user's question when practical.",
    `Question: ${request.question}`,
    "Context:",
    renderCompressedContext(compressedContext),
  ].join("\n");
}
