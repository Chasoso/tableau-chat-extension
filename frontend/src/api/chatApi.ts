import { env } from "../env";
import type { ChatRequest, ChatResponse } from "../types/chat";

export async function sendChatQuestion(request: ChatRequest, accessToken?: string): Promise<ChatResponse> {
  const response = await fetch(`${env.apiBaseUrl.replace(/\/$/, "")}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: `Request failed with status ${response.status}` }));
    throw new Error(body.message ?? `Request failed with status ${response.status}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error(
      "Chat API returned a non-JSON response. Check VITE_API_BASE_URL and ensure it points to API Gateway or /api.",
    );
  }

  return response.json() as Promise<ChatResponse>;
}
