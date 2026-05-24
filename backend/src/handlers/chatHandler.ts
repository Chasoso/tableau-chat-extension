import { getConfig } from "../config";
import { authenticateRequest } from "../auth/cognitoAuth";
import { createChatService } from "../services/chatService";
import type { ApiGatewayProxyEvent, ApiGatewayProxyResult } from "../types/api";
import type { ChatRequest } from "../types/chat";

export async function handler(event: ApiGatewayProxyEvent): Promise<ApiGatewayProxyResult> {
  if (event.httpMethod === "OPTIONS") {
    return jsonResponse(204, {});
  }

  try {
    const authResult = await authenticateRequest(event.headers);
    if (!authResult.ok) {
      return jsonResponse(authResult.statusCode, { message: authResult.message });
    }

    const request = parseRequest(event.body);
    const validationError = validateRequest(request);
    if (validationError) {
      return jsonResponse(400, { message: validationError });
    }

    const response = await createChatService().generateAnswer(request, authResult.user);
    return jsonResponse(200, response);
  } catch (error) {
    console.error("Failed to handle chat request.", safeError(error));
    return jsonResponse(500, { message: "Failed to generate an answer." });
  }
}

function parseRequest(body: string | null | undefined): ChatRequest {
  if (!body) {
    throw new Error("Request body is required.");
  }

  return JSON.parse(body) as ChatRequest;
}

function validateRequest(request: ChatRequest): string | null {
  if (!request.question?.trim()) {
    return "question is required.";
  }

  if (!request.dashboardContext) {
    return "dashboardContext is required.";
  }

  if (!Array.isArray(request.dashboardContext.worksheets)) {
    return "dashboardContext.worksheets must be an array.";
  }

  return null;
}

function jsonResponse(statusCode: number, payload: unknown): ApiGatewayProxyResult {
  const config = getConfig();
  return {
    statusCode,
    headers: {
      "Access-Control-Allow-Origin": config.corsAllowedOrigin,
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
      "Access-Control-Allow-Methods": "OPTIONS,POST,GET",
      "Content-Type": "application/json",
    },
    body: statusCode === 204 ? "" : JSON.stringify(payload),
  };
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}
