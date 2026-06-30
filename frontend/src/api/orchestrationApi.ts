import { env } from "../env";
import type {
  ResolveIntentRequest,
  ResolveIntentResponse,
} from "../types/orchestration";

const apiBaseUrl = () => env.apiBaseUrl.replace(/\/$/, "");

export async function resolveIntent(
  request: ResolveIntentRequest,
  accessToken?: string,
): Promise<ResolveIntentResponse> {
  const response = await fetch(`${apiBaseUrl()}/intent/resolve`, {
    method: "POST",
    headers: buildJsonHeaders(accessToken),
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw await toApiError(response);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error(
      "Intent resolution API returned a non-JSON response. Check VITE_API_BASE_URL and ensure it points to API Gateway or /api.",
    );
  }

  return response.json() as Promise<ResolveIntentResponse>;
}

export async function runSelectedMarkExplanationOrchestration(
  request: ResolveIntentRequest,
  accessToken?: string,
): Promise<ResolveIntentResponse> {
  return resolveIntent(
    {
      ...request,
      runMode: "resolve_and_execute_fixed_plan",
    },
    accessToken,
  );
}

function buildJsonHeaders(accessToken?: string) {
  return {
    "Content-Type": "application/json",
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };
}

async function toApiError(response: Response): Promise<Error> {
  const body = (await response.json().catch(() => ({
    message: `Request failed with status ${response.status}`,
  }))) as { message?: string };
  return new Error(
    body.message ?? `Request failed with status ${response.status}`,
  );
}
