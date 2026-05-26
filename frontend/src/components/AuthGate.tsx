import { useEffect, useRef, useState } from "react";
import type React from "react";
import {
  authBroadcastChannelName,
  completeLoginFromRedirect,
  getStoredSession,
  isAuthCompleteMessage,
  isAuthCompletePayload,
  sessionKey,
  startLoginPopup,
  storeSession,
} from "../auth/cognitoAuth";
import type { AuthSession } from "../types/auth";

type Props = {
  children: (session: AuthSession) => React.ReactNode;
};

export default function AuthGate({ children }: Props) {
  const mountedRef = useRef(false);
  const sessionPollerRef = useRef<number | undefined>(undefined);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);

  function acceptSession(nextSession: AuthSession): void {
    storeSession(nextSession);
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

  function startSessionPolling(durationMs = 15_000) {
    if (sessionPollerRef.current) {
      window.clearInterval(sessionPollerRef.current);
    }

    const startedAt = Date.now();
    sessionPollerRef.current = window.setInterval(() => {
      if (!mountedRef.current || acceptStoredSession() || Date.now() - startedAt > durationMs) {
        if (sessionPollerRef.current) {
          window.clearInterval(sessionPollerRef.current);
          sessionPollerRef.current = undefined;
        }
      }
    }, 250);
  }

  useEffect(() => {
    mountedRef.current = true;

    function handleMessage(message: MessageEvent) {
      if (!isAuthCompleteMessage(message)) {
        return;
      }

      acceptSession(message.data.session);
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
    }

    let channel: BroadcastChannel | undefined;
    if (typeof BroadcastChannel !== "undefined") {
      channel = new BroadcastChannel(authBroadcastChannelName);
      channel.addEventListener("message", (event: MessageEvent) => {
        if (isAuthCompletePayload(event.data)) {
          acceptSession(event.data.session);
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
      const popup = await startLoginPopup();
      const startedAt = Date.now();
      startSessionPolling(120_000);
      const timer = window.setInterval(() => {
        if (acceptStoredSession()) {
          window.clearInterval(timer);
          return;
        }

        if (popup.closed || Date.now() - startedAt > 120_000) {
          window.clearInterval(timer);
          startSessionPolling(8_000);
          window.setTimeout(() => {
            if (!getStoredSession()) {
              setIsSigningIn(false);
              setError("サインイン結果を受け取れませんでした。もう一度サインインを押してください。");
            }
          }, 8_500);
        }
      }, 500);
    } catch (unknownError) {
      setIsSigningIn(false);
      setError(unknownError instanceof Error ? unknownError.message : "サインインを開始できませんでした。");
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
          {isSigningIn ? "サインインを待機中..." : "Cognitoでサインイン"}
        </button>
      </section>
    </div>
  );
}
