import { env } from "../env";
import type { AuthSession } from "../types/auth";

const sessionKey = "tableau-chat.auth.session";
const verifierKeyPrefix = "tableau-chat.auth.pkce.verifier.";
const authMessageType = "tableau-chat.auth.complete";
const authCompleteAckMessageType = "tableau-chat.auth.complete-ack";
const authCodeMessageType = "tableau-chat.auth.code";
const authCodeAckMessageType = "tableau-chat.auth.code-ack";
const authBroadcastChannelName = "tableau-chat.auth";
const parentHandledStatePrefix = "parent.";

export type AuthCompleteMessage = {
  type: typeof authMessageType;
  session: AuthSession;
};

export type AuthCompleteAckMessage = {
  type: typeof authCompleteAckMessageType;
};

export type AuthCodeMessage = {
  type: typeof authCodeMessageType;
  url: string;
};

export type AuthCodeAckMessage = {
  type: typeof authCodeAckMessageType;
};

export { authBroadcastChannelName, authMessageType, sessionKey };

export function getStoredSession(): AuthSession | null {
  const raw = localStorage.getItem(sessionKey);
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
  const session = await completeLoginFromUrl(window.location.href);
  const url = new URL(window.location.href);
  url.searchParams.delete("code");
  url.searchParams.delete("state");
  url.searchParams.delete("auth_action");
  window.history.replaceState({}, document.title, url.toString());
  return session;
}

export async function completeLoginFromUrl(urlValue: string): Promise<AuthSession | null> {
  const url = new URL(urlValue);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code) {
    return getStoredSession();
  }

  if (!state) {
    throw new Error("サインイン状態を確認できませんでした。もう一度サインインしてください。");
  }

  const verifier = localStorage.getItem(getVerifierKey(state));
  if (!verifier) {
    throw new Error("サインインセッションの期限が切れました。もう一度サインインしてください。");
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
    throw new Error("Cognito サインインに失敗しました。");
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
    ...decodeClaims(body.id_token),
  };

  storeSession(session);
  localStorage.removeItem(getVerifierKey(state));
  publishAuthSession(session);
  return session;
}

export async function startLogin(): Promise<void> {
  const loginUrl = await createLoginUrl();
  window.location.assign(loginUrl);
}

export async function startLoginPopup(): Promise<Window> {
  const popup = window.open(getPopupStartUrl(), "tableau-chat-cognito-login", "popup,width=520,height=720");
  if (!popup) {
    throw new Error("サインインウィンドウを開けませんでした。このサイトのポップアップを許可してください。");
  }

  popup.focus();
  return popup;
}

export function isAuthRedirect(): boolean {
  return new URL(window.location.href).searchParams.has("code");
}

export function isAuthPopupStart(): boolean {
  return new URL(window.location.href).searchParams.get("auth_action") === "login_popup";
}

export function isAuthCompleteMessage(message: MessageEvent): message is MessageEvent<AuthCompleteMessage> {
  return message.origin === window.location.origin && isAuthCompletePayload(message.data);
}

export function isAuthCompletePayload(payload: unknown): payload is AuthCompleteMessage {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "type" in payload &&
    "session" in payload &&
    (payload as AuthCompleteMessage).type === authMessageType &&
    Boolean((payload as AuthCompleteMessage).session)
  );
}

export function isAuthCompleteAckMessage(message: MessageEvent): message is MessageEvent<AuthCompleteAckMessage> {
  return message.origin === window.location.origin && isAuthCompleteAckPayload(message.data);
}

export function isAuthCompleteAckPayload(payload: unknown): payload is AuthCompleteAckMessage {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "type" in payload &&
    (payload as AuthCompleteAckMessage).type === authCompleteAckMessageType
  );
}

export function isAuthCodeMessage(message: MessageEvent): message is MessageEvent<AuthCodeMessage> {
  return message.origin === window.location.origin && isAuthCodePayload(message.data);
}

export function isAuthCodePayload(payload: unknown): payload is AuthCodeMessage {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "type" in payload &&
    "url" in payload &&
    (payload as AuthCodeMessage).type === authCodeMessageType &&
    typeof (payload as AuthCodeMessage).url === "string"
  );
}

export function isAuthCodeAckMessage(message: MessageEvent): message is MessageEvent<AuthCodeAckMessage> {
  return message.origin === window.location.origin && isAuthCodeAckPayload(message.data);
}

export function isAuthCodeAckPayload(payload: unknown): payload is AuthCodeAckMessage {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "type" in payload &&
    (payload as AuthCodeAckMessage).type === authCodeAckMessageType
  );
}

export function storeSession(session: AuthSession): void {
  localStorage.setItem(sessionKey, JSON.stringify(session));
}

export function publishAuthSession(session: AuthSession): void {
  notifyOpener(session);
  notifyBroadcastChannel(session);
}

export function isParentHandledAuthRedirect(urlValue = window.location.href): boolean {
  const url = new URL(urlValue);
  const state = url.searchParams.get("state");
  return Boolean(url.searchParams.get("code") && state?.startsWith(parentHandledStatePrefix));
}

export function publishAuthCode(urlValue = window.location.href): void {
  notifyOpenerAuthCode(urlValue);
  notifyBroadcastChannelAuthCode(urlValue);
}

export function publishAuthCodeAck(targetWindow: Window | null = window.opener): void {
  notifyPopupAuthCodeAck(targetWindow);
}

export function publishAuthCompleteAck(targetWindow: Window | null = window.opener): void {
  notifyPopupAuthCompleteAck(targetWindow);
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
    throw new Error("Cognito Hosted UI が設定されていません。");
  }
}

async function createLoginUrl(): Promise<string> {
  assertAuthConfigured();
  const verifier = randomBase64Url(32);
  const state = randomBase64Url(16);
  const challenge = await sha256Base64Url(verifier);
  localStorage.setItem(getVerifierKey(state), verifier);

  const authUrl = new URL(`${getCognitoDomain()}/oauth2/authorize`);
  authUrl.searchParams.set("client_id", env.cognito.clientId);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("redirect_uri", getRedirectUri());
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("code_challenge", challenge);
  return authUrl.toString();
}

function clearSession(): void {
  localStorage.removeItem(sessionKey);
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith(verifierKeyPrefix)) {
      localStorage.removeItem(key);
    }
  }
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

function getPopupStartUrl(): string {
  const url = new URL(getRedirectUri());
  url.searchParams.set("auth_action", "login_popup");
  return url.toString();
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

function notifyOpenerAuthCode(urlValue: string): void {
  if (!window.opener) {
    return;
  }

  window.opener.postMessage(
    {
      type: authCodeMessageType,
      url: urlValue,
    } satisfies AuthCodeMessage,
    window.location.origin,
  );
}

function notifyBroadcastChannel(session: AuthSession): void {
  if (typeof BroadcastChannel === "undefined") {
    return;
  }

  const channel = new BroadcastChannel(authBroadcastChannelName);
  channel.postMessage({
    type: authMessageType,
    session,
  } satisfies AuthCompleteMessage);
  channel.close();
}

function notifyBroadcastChannelAuthCode(urlValue: string): void {
  if (typeof BroadcastChannel === "undefined") {
    return;
  }

  const channel = new BroadcastChannel(authBroadcastChannelName);
  channel.postMessage({
    type: authCodeMessageType,
    url: urlValue,
  } satisfies AuthCodeMessage);
  channel.close();
}

function notifyPopupAuthCodeAck(targetWindow: Window | null): void {
  if (!targetWindow) {
    return;
  }

  targetWindow.postMessage(
    {
      type: authCodeAckMessageType,
    } satisfies AuthCodeAckMessage,
    window.location.origin,
  );
}

function notifyPopupAuthCompleteAck(targetWindow: Window | null): void {
  if (!targetWindow) {
    return;
  }

  targetWindow.postMessage(
    {
      type: authCompleteAckMessageType,
    } satisfies AuthCompleteAckMessage,
    window.location.origin,
  );
}

function getVerifierKey(state: string): string {
  return `${verifierKeyPrefix}${state}`;
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

function decodeClaims(token: string): Pick<AuthSession, "email" | "nickname"> {
  const [, payload] = token.split(".");
  if (!payload) {
    return {};
  }

  try {
    const normalized = addBase64Padding(payload.replaceAll("-", "+").replaceAll("_", "/"));
    const decoded = JSON.parse(atob(normalized)) as { email?: string; nickname?: string };
    return {
      email: decoded.email,
      nickname: decoded.nickname,
    };
  } catch {
    return {};
  }
}

function addBase64Padding(value: string): string {
  return value.padEnd(value.length + ((4 - (value.length % 4)) % 4), "=");
}
