import { CognitoPopupAuthService } from "../auth/cognitoPopupAuthService";
import { getConfig } from "../config";
import { logInfo, logWarn, safeErrorDetails, safeHash } from "../logging";
import type { ApiGatewayProxyEvent, ApiGatewayProxyResult } from "../types/api";
import type { CognitoPopupStartRequest } from "../types/cognitoPopupAuth";

const service = new CognitoPopupAuthService();

export async function handleCognitoPopupAuthRoute(
  event: ApiGatewayProxyEvent,
): Promise<ApiGatewayProxyResult> {
  const path = event.rawPath ?? event.path ?? "";
  const method =
    event.httpMethod ?? event.requestContext?.http?.method ?? "GET";

  try {
    if (path === "/auth/cognito/popup/start" && method === "POST") {
      const payload = parseStartRequest(event.body);
      logInfo("auth.popup.start.requested", {
        hasRedirectAfter: Boolean(payload.redirectAfter),
      });
      const response = await service.startPopupAuth(payload);
      return jsonResponse(200, response);
    }

    if (path === "/auth/cognito/callback" && method === "GET") {
      const code = event.queryStringParameters?.code;
      const state = event.queryStringParameters?.state;
      const { redirectAfter } = await service.handlePopupCallback({
        code,
        state,
      });
      return htmlResponse(
        200,
        renderPopupCallbackHtml({
          success: true,
          redirectAfter,
        }),
      );
    }

    if (path === "/auth/cognito/popup/status" && method === "GET") {
      const transactionId = event.queryStringParameters?.transactionId ?? "";
      const pollToken = getHeader(event.headers, "x-auth-poll-token");
      const response = await service.getPopupAuthStatus({
        transactionId,
        pollToken,
      });
      return jsonResponse(response.status === "failed" ? 400 : 200, response);
    }

    return jsonResponse(404, { message: "Not found." });
  } catch (error) {
    if (path === "/auth/cognito/callback") {
      logWarn("auth.popup.callback.route_failed", safeErrorDetails(error));
      return htmlResponse(
        500,
        renderPopupCallbackHtml({
          success: false,
          message:
            "サインインの完了処理に失敗しました。このウィンドウを閉じて、もう一度お試しください。",
        }),
      );
    }

    logWarn("auth.popup.route_failed", {
      path,
      method,
      transactionIdHash: safeHash(event.queryStringParameters?.transactionId),
      ...safeErrorDetails(error),
    });
    return jsonResponse(500, {
      message:
        error instanceof Error
          ? error.message
          : "Authentication request failed.",
    });
  }
}

function parseStartRequest(
  body: string | null | undefined,
): CognitoPopupStartRequest {
  if (!body) {
    return {};
  }

  const parsed = JSON.parse(body) as CognitoPopupStartRequest;
  return {
    redirectAfter: parsed.redirectAfter,
  };
}

function jsonResponse(
  statusCode: number,
  payload: unknown,
): ApiGatewayProxyResult {
  const config = getConfig();
  return {
    statusCode,
    headers: {
      "Access-Control-Allow-Origin": config.corsAllowedOrigin,
      "Access-Control-Allow-Headers":
        "Content-Type,Authorization,X-Auth-Poll-Token",
      "Access-Control-Allow-Methods": "OPTIONS,POST,GET",
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  };
}

function htmlResponse(statusCode: number, html: string): ApiGatewayProxyResult {
  const config = getConfig();
  return {
    statusCode,
    headers: {
      "Access-Control-Allow-Origin": config.corsAllowedOrigin,
      "Access-Control-Allow-Headers":
        "Content-Type,Authorization,X-Auth-Poll-Token",
      "Access-Control-Allow-Methods": "OPTIONS,POST,GET",
      "Cache-Control": "no-store",
      "Content-Type": "text/html; charset=utf-8",
    },
    body: html,
  };
}

function renderPopupCallbackHtml(input: {
  success: boolean;
  redirectAfter?: string;
  message?: string;
}): string {
  const message = input.message
    ? escapeHtml(input.message)
    : input.success
      ? "サインインが完了しました。このウィンドウはまもなく閉じます。"
      : "サインインに失敗しました。このウィンドウを閉じて、もう一度お試しください。";
  const redirectAfter = input.redirectAfter
    ? escapeHtml(input.redirectAfter)
    : "/";

  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Tableau Assistant</title>
    <style>
      body { font-family: sans-serif; background: #f6f7f9; color: #1f2937; display:flex; min-height:100vh; align-items:center; justify-content:center; margin:0; }
      .card { background:#fff; border:1px solid #d5d9e0; border-radius:16px; padding:24px; width:min(420px, 92vw); box-shadow:0 16px 36px rgba(15, 23, 42, 0.12); text-align:center; }
      h1 { margin:0 0 12px; font-size:28px; }
      p { margin:0; line-height:1.7; }
      a { color:#0f172a; }
    </style>
  </head>
  <body>
    <section class="card">
      <h1>Tableau Assistant</h1>
      <p>${message}</p>
      <p style="margin-top:12px;font-size:13px;color:#6b7280;">閉じない場合は、このウィンドウを手動で閉じて元の画面に戻ってください。</p>
      <p style="margin-top:8px;font-size:12px;color:#94a3b8;">redirectAfter: ${redirectAfter}</p>
    </section>
    <script>
      window.setTimeout(function () {
        window.close();
      }, 1200);
    </script>
  </body>
</html>`;
}

function getHeader(
  headers: Record<string, string | undefined> | undefined,
  name: string,
): string | undefined {
  const entry = Object.entries(headers ?? {}).find(
    ([key]) => key.toLowerCase() === name.toLowerCase(),
  );
  return entry?.[1];
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
