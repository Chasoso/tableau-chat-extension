import { env } from "../env";
import type { ChatRequest, ChatResponse } from "../types/chat";

export async function sendChatQuestion(request: ChatRequest): Promise<ChatResponse> {
  const response = await fetch(`${env.apiBaseUrl}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: "Request failed" }));
    throw new Error(body.message ?? `Request failed with status ${response.status}`);
  }

  return response.json() as Promise<ChatResponse>;
}

