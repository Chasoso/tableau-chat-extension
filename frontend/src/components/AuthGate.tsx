import { useEffect, useRef, useState } from "react";
import type React from "react";
import {
  authBroadcastChannelName,
  completeLoginFromUrl,
  completeLoginFromRedirect,
  getStoredSession,
  isAuthCodeMessage,
  isAuthCodePayload,
  isAuthCompleteMessage,
  isAuthCompletePayload,
  sessionKey,
  startLoginPopup,
  storeSession,
} from "../auth/cognitoAuth";
import type { AuthSession } from "../types/auth";

const popupWaitTimeoutMs = 5 * 60 * 1000;

type Props = {
  children: (session: AuthSession) => React.ReactNode;
};

export default function AuthGate({ children }: Props) {
  const mountedRef = useRef(false);
  const popupRef = useRef<Window | null>(null);
  const sessionPollerRef = useRef<number | undefined>(undefined);
  const signInTimerRef = useRef<number | undefined>(undefined);
  const authCodeExchangeRef = useRef(false);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);

  function clearSignInTimer(): void {
    if (signInTimerRef.current) {
      window.clearInterval(signInTimerRef.current);
      signInTimerRef.current = undefined;
    }
  }

  function stopSignInWaiting(message?: string): void {
    clearSignInTimer();
    popupRef.current = null;
    setIsSigningIn(false);
    if (message) {
      setError(message);
    }
  }

  function acceptSession(nextSession: AuthSession): void {
    storeSession(nextSession);
    clearSignInTimer();
    popupRef.current = null;
    setSession(nextSession);
    setError(null);
    setIsSigningIn(false);
  }

  function acceptStoredSession(): boolean {
    const storedSession = getStoredSession();
    if (!storedSession) {
      return false;
    }

    acceptSession(storedSession);
    return true;
  }

  async function acceptPopupRedirectSession(): Promise<boolean> {
    const popup = popupRef.current;
    if (!popup || popup.closed) {
      return false;
    }

    let popupUrl: string;
    try {
      popupUrl = popup.location.href;
    } catch {
      return false;
    }

    if (!popupUrl.startsWith(window.location.origin)) {
      return false;
    }

    const url = new URL(popupUrl);
    if (!url.searchParams.has("code")) {
      return false;
    }

    return acceptAuthCodeUrl(popupUrl);
  }

  async function acceptAuthCodeUrl(urlValue: string): Promise<boolean> {
    if (authCodeExchangeRef.current) {
      return false;
    }

    authCodeExchangeRef.current = true;
    try {
      const nextSession = await completeLoginFromUrl(urlValue);
      if (!nextSession) {
        return acceptStoredSession();
      }

      popupRef.current?.close();
      acceptSession(nextSession);
      return true;
    } catch {
      return acceptStoredSession();
    } finally {
      authCodeExchangeRef.current = false;
    }
  }

  function startSessionPolling(durationMs = 15_000): void {
    if (sessionPollerRef.current) {
      window.clearInterval(sessionPollerRef.current);
    }

    const startedAt = Date.now();
    sessionPollerRef.current = window.setInterval(() => {
      void acceptPopupRedirectSession();
      if (!mountedRef.current || acceptStoredSession() || Date.now() - startedAt > durationMs) {
        if (sessionPollerRef.current) {
          window.clearInterval(sessionPollerRef.current);
          sessionPollerRef.current = undefined;
        }
      }
    }, 250);
  }

  function checkClosedPopupAfterFocus(): void {
    const popup = popupRef.current;
    if (!popup?.closed) {
      return;
    }

    window.setTimeout(() => {
      if (acceptStoredSession()) {
        return;
      }

      if (popupRef.current?.closed) {
        stopSignInWaiting("サインイン結果を受け取れませんでした。もう一度サインインを押してください。");
      }
    }, 3_000);
  }

  useEffect(() => {
    mountedRef.current = true;

    function handleMessage(message: MessageEvent) {
      if (isAuthCompleteMessage(message)) {
        acceptSession(message.data.session);
        return;
      }

      if (isAuthCodeMessage(message)) {
        void acceptAuthCodeUrl(message.data.url);
      }
    }

    function handleStorage(event: StorageEvent) {
      if (event.key !== sessionKey) {
        return;
      }

      acceptStoredSession();
    }

    function handleFocus() {
      acceptStoredSession();
      startSessionPolling(5_000);
      checkClosedPopupAfterFocus();
    }

    let channel: BroadcastChannel | undefined;
    if (typeof BroadcastChannel !== "undefined") {
      channel = new BroadcastChannel(authBroadcastChannelName);
      channel.addEventListener("message", (event: MessageEvent) => {
        if (isAuthCompletePayload(event.data)) {
          acceptSession(event.data.session);
          return;
        }

        if (isAuthCodePayload(event.data)) {
          void acceptAuthCodeUrl(event.data.url);
        }
      });
    }

    window.addEventListener("message", handleMessage);
    window.addEventListener("storage", handleStorage);
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleFocus);
    completeLoginFromRedirect()
      .then((nextSession) => {
        if (mountedRef.current && nextSession) {
          acceptSession(nextSession);
        }
      })
      .catch((unknownError) => {
        if (mountedRef.current) {
          setError(unknownError instanceof Error ? unknownError.message : "サインインに失敗しました。");
        }
      })
      .finally(() => {
        if (mountedRef.current) {
          setIsLoading(false);
        }
      });

    return () => {
      mountedRef.current = false;
      if (sessionPollerRef.current) {
        window.clearInterval(sessionPollerRef.current);
      }
      clearSignInTimer();
      channel?.close();
      window.removeEventListener("message", handleMessage);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleFocus);
    };
  }, []);

  async function handleSignIn() {
    setIsSigningIn(true);
    setError(null);

    try {
      popupRef.current = await startLoginPopup();
      const startedAt = Date.now();
      startSessionPolling(popupWaitTimeoutMs);

      signInTimerRef.current = window.setInterval(() => {
        if (acceptStoredSession()) {
          return;
        }

        void acceptPopupRedirectSession();

        // popup.closed can be unreliable while Cognito moves between Hosted UI
        // steps. A hard timeout is still useful for abandoned sign-in attempts.
        if (Date.now() - startedAt > popupWaitTimeoutMs) {
          stopSignInWaiting("サインインがタイムアウトしました。もう一度サインインを押してください。");
        }
      }, 500);
    } catch (unknownError) {
      stopSignInWaiting(unknownError instanceof Error ? unknownError.message : "サインインを開始できませんでした。");
    }
  }

  if (isLoading) {
    return <div className="app-shell loading-state">サインイン状態を確認しています...</div>;
  }

  if (session) {
    return <>{children(session)}</>;
  }

  return (
    <div className="app-shell auth-state">
      <section className="auth-card">
        <h1>Tableau Assistant</h1>
        <p>Tableau 内では Cognito を直接表示できないため、別ウィンドウでサインインします。</p>
        {error ? <div className="error-banner">{error}</div> : null}
        <button type="button" disabled={isSigningIn} onClick={handleSignIn}>
          {isSigningIn ? "サインイン完了を待機中..." : "Cognitoでサインイン"}
        </button>
      </section>
    </div>
  );
}
