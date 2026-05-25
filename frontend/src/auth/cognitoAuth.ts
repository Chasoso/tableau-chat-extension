import { env } from "../env";
import type { AuthSession } from "../types/auth";

const sessionKey = "tableau-chat.auth.session";
const verifierKey = "tableau-chat.auth.pkce.verifier";
const authMessageType = "tableau-chat.auth.complete";

export type AuthCompleteMessage = {
  type: typeof authMessageType;
  session: AuthSession;
};

export function getStoredSession(): AuthSession | null {
  const raw = sessionStorage.getItem(sessionKey);
  if (!raw) {
    return null;
  }

  const session = JSON.parse(raw) as AuthSession;
  if (session.expiresAt <= Date.now() + 30_000) {
    clearSession();
    return null;
  }

  return session;
}

export async function completeLoginFromRedirect(): Promise<AuthSession | null> {
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  if (!code) {
    return getStoredSession();
  }

  const verifier = sessionStorage.getItem(verifierKey);
  if (!verifier) {
    throw new Error("Login session expired. Please sign in again.");
  }

  const tokenResponse = await fetch(`${getCognitoDomain()}/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: env.cognito.clientId,
      code,
      redirect_uri: getRedirectUri(),
      code_verifier: verifier,
    }),
  });

  if (!tokenResponse.ok) {
    throw new Error("Cognito sign-in failed.");
  }

  const body = (await tokenResponse.json()) as {
    access_token: string;
    id_token: string;
    expires_in: number;
  };

  const session: AuthSession = {
    accessToken: body.access_token,
    idToken: body.id_token,
    expiresAt: Date.now() + body.expires_in * 1000,
    email: decodeEmail(body.id_token),
  };

  sessionStorage.setItem(sessionKey, JSON.stringify(session));
  sessionStorage.removeItem(verifierKey);
  notifyOpener(session);
  url.searchParams.delete("code");
  url.searchParams.delete("state");
  window.history.replaceState({}, document.title, url.toString());
  return session;
}

export async function startLogin(): Promise<void> {
  const loginUrl = await createLoginUrl();
  window.location.assign(loginUrl);
}

export async function startLoginPopup(): Promise<void> {
  const loginUrl = await createLoginUrl();
  const popup = window.open(loginUrl, "tableau-chat-cognito-login", "popup,width=520,height=720");
  if (!popup) {
    throw new Error("Unable to open the sign-in window. Please allow pop-ups for this site.");
  }
  popup.focus();
}

export function isAuthRedirect(): boolean {
  return new URL(window.location.href).searchParams.has("code");
}

export function isAuthCompleteMessage(message: MessageEvent): message is MessageEvent<AuthCompleteMessage> {
  return message.origin === window.location.origin && message.data?.type === authMessageType && Boolean(message.data.session);
}

export function storeSession(session: AuthSession): void {
  sessionStorage.setItem(sessionKey, JSON.stringify(session));
}

async function createLoginUrl(): Promise<string> {
  assertAuthConfigured();
  const verifier = randomBase64Url(32);
  const challenge = await sha256Base64Url(verifier);
  sessionStorage.setItem(verifierKey, verifier);

  const authUrl = new URL(`${getCognitoDomain()}/oauth2/authorize`);
  authUrl.searchParams.set("client_id", env.cognito.clientId);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("redirect_uri", getRedirectUri());
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("code_challenge", challenge);
  return authUrl.toString();
}

export function signOut(): void {
  clearSession();

  if (!env.cognito.domain || !env.cognito.clientId) {
    return;
  }

  const logoutUrl = new URL(`${getCognitoDomain()}/logout`);
  logoutUrl.searchParams.set("client_id", env.cognito.clientId);
  logoutUrl.searchParams.set("logout_uri", getLogoutUri());
  window.location.assign(logoutUrl.toString());
}

export function assertAuthConfigured(): void {
  if (!env.cognito.clientId || !env.cognito.domain) {
    throw new Error("Cognito Hosted UI is not configured.");
  }
}

function clearSession(): void {
  sessionStorage.removeItem(sessionKey);
  sessionStorage.removeItem(verifierKey);
}

function getCognitoDomain(): string {
  return env.cognito.domain.replace(/\/$/, "");
}

function getRedirectUri(): string {
  if (env.cognito.redirectUri) {
    return env.cognito.redirectUri;
  }

  return `${window.location.origin}${window.location.pathname}`;
}

function getLogoutUri(): string {
  return env.cognito.logoutUri || getRedirectUri();
}

function notifyOpener(session: AuthSession): void {
  if (!window.opener) {
    return;
  }

  window.opener.postMessage(
    {
      type: authMessageType,
      session,
    } satisfies AuthCompleteMessage,
    window.location.origin,
  );
}

function randomBase64Url(byteLength: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return base64Url(bytes);
}

async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return base64Url(new Uint8Array(digest));
}

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function decodeEmail(token: string): string | undefined {
  const [, payload] = token.split(".");
  if (!payload) {
    return undefined;
  }

  try {
    const normalized = addBase64Padding(payload.replaceAll("-", "+").replaceAll("_", "/"));
    const decoded = JSON.parse(atob(normalized)) as { email?: string };
    return decoded.email;
  } catch {
    return undefined;
  }
}

function addBase64Padding(value: string): string {
  return value.padEnd(value.length + ((4 - (value.length % 4)) % 4), "=");
}
