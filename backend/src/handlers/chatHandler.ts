import { getConfig } from "../config";
import { authenticateRequest } from "../auth/cognitoAuth";
import { logError, logInfo, logWarn, safeErrorDetails, safeHash } from "../logging";
import { createChatService } from "../services/chatService";
import type { ApiGatewayProxyEvent, ApiGatewayProxyResult } from "../types/api";
import type { ChatRequest, ContextRequest } from "../types/chat";

export async function handler(event: ApiGatewayProxyEvent): Promise<ApiGatewayProxyResult> {
  const requestId = event.requestContext?.requestId;
  const method = event.httpMethod ?? event.requestContext?.http?.method;

  if (method === "OPTIONS") {
    return jsonResponse(204, {});
  }

  try {
    logInfo("chat.request.received", { requestId, method });
    const authResult = await authenticateRequest(event.headers);
    if (!authResult.ok) {
      logWarn("chat.auth.rejected", { requestId, statusCode: authResult.statusCode });
      return jsonResponse(authResult.statusCode, { message: authResult.message });
    }
    logInfo("chat.auth.accepted", {
      requestId,
      userHash: safeHash(authResult.user?.userId),
      emailHash: safeHash(authResult.user?.email),
      tableauSubjectHash: safeHash(authResult.user?.tableauSubject),
      tokenUse: authResult.user?.tokenUse,
    });

    const routePath = getRoutePath(event);
    const request = parseRequest(event.body);

    if (routePath === "/context") {
      const contextRequest = request as ContextRequest;
      const validationError = validateContextRequest(contextRequest);
      if (validationError) {
        logWarn("chat.context_request.invalid", { requestId, validationError });
        return jsonResponse(400, { message: validationError });
      }

      const response = await createChatService().getDashboardContextPatch(contextRequest, authResult.user);
      logInfo("chat.context_request.completed", {
        requestId,
        provider: response.debug?.tableauContextProvider,
        patchedFields: response.dashboardContextPatch?.workbookName ? ["workbookName"] : [],
      });
      return jsonResponse(200, response);
    }

    const chatRequest = request as ChatRequest;
    const validationError = validateRequest(chatRequest);
    if (validationError) {
      logWarn("chat.request.invalid", { requestId, validationError });
      return jsonResponse(400, { message: validationError });
    }

    const response = await createChatService().generateAnswer(chatRequest, authResult.user);
    logInfo("chat.request.completed", {
      requestId,
      provider: response.debug?.tableauContextProvider,
      sessionId: response.sessionId,
      messageId: response.messageId,
    });
    return jsonResponse(200, response);
  } catch (error) {
    logError("chat.request.failed", { requestId, ...safeErrorDetails(error) });
    return jsonResponse(500, { message: "Failed to generate an answer." });
  }
}

function parseRequest(body: string | null | undefined): unknown {
  if (!body) {
    throw new Error("Request body is required.");
  }

  return JSON.parse(body) as unknown;
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

function validateContextRequest(request: ContextRequest): string | null {
  if (!request.dashboardContext) {
    return "dashboardContext is required.";
  }

  if (!Array.isArray(request.dashboardContext.worksheets)) {
    return "dashboardContext.worksheets must be an array.";
  }

  return null;
}

function getRoutePath(event: ApiGatewayProxyEvent): string {
  return event.rawPath ?? event.path ?? "";
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
