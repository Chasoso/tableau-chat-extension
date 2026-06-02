import { useEffect, useRef, useState } from "react";
import type React from "react";
import {
  authBroadcastChannelName,
  completeLoginFromRedirect,
  completeLoginFromUrl,
  getStoredSession,
  isAuthCodePayload,
  isAuthCompleteMessage,
  isAuthCompletePayload,
  publishAuthCodeAck,
  publishAuthCompleteAck,
  sessionKey,
  startLoginPopup,
  storeSession,
} from "../auth/cognitoAuth";
import type { AuthSession } from "../types/auth";

const popupWaitTimeoutMs = 5 * 60 * 1000;
const popupCloseGracePeriodMs = 4_000;
const popupOpenSettlingMs = 2_000;

export type AuthGateRenderState = {
  session: AuthSession | null;
  isLoading: boolean;
  isSigningIn: boolean;
  error: string | null;
  startSignIn: () => Promise<void>;
};

type Props = {
  children: (state: AuthGateRenderState) => React.ReactNode;
};

function asWindow(source: MessageEventSource | null): Window | null {
  if (source && typeof (source as Window).postMessage === "function") {
    return source as Window;
  }

  return null;
}

export default function AuthGate({ children }: Props) {
  const mountedRef = useRef(false);
  const popupRef = useRef<Window | null>(null);
  const popupOpenedAtRef = useRef(0);
  const popupClosedAtRef = useRef(0);
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

  function resetPopupTracking(): void {
    popupRef.current = null;
    popupOpenedAtRef.current = 0;
    popupClosedAtRef.current = 0;
  }

  function stopSignInWaiting(message?: string): void {
    clearSignInTimer();
    resetPopupTracking();
    setIsSigningIn(false);
    if (message) {
      setError(message);
    }
  }

  function acceptSession(nextSession: AuthSession, sourceWindow: Window | null = null): void {
    if (sourceWindow) {
      publishAuthCompleteAck(sourceWindow);
    }

    storeSession(nextSession);
    clearSignInTimer();
    resetPopupTracking();
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

    return acceptAuthCodeUrl(popupUrl, popup);
  }

  async function acceptAuthCodeUrl(urlValue: string, sourceWindow: Window | null = null): Promise<boolean> {
    if (authCodeExchangeRef.current) {
      return false;
    }

    authCodeExchangeRef.current = true;
    try {
      const nextSession = await completeLoginFromUrl(urlValue);
      if (!nextSession) {
        return acceptStoredSession();
      }

      sourceWindow?.close();
      acceptSession(nextSession, sourceWindow);
      return true;
    } catch {
      return acceptStoredSession();
    } finally {
      authCodeExchangeRef.current = false;
    }
  }

  function checkClosedPopupDuringSignIn(): void {
    if (!isSigningIn) {
      return;
    }

    const popup = popupRef.current;
    if (!popup) {
      return;
    }

    if (!popup.closed) {
      popupClosedAtRef.current = 0;
      return;
    }

    if (acceptStoredSession()) {
      return;
    }

    if (popupOpenedAtRef.current && Date.now() - popupOpenedAtRef.current < popupOpenSettlingMs) {
      return;
    }

    if (!popupClosedAtRef.current) {
      popupClosedAtRef.current = Date.now();
      return;
    }

    if (Date.now() - popupClosedAtRef.current < popupCloseGracePeriodMs) {
      return;
    }

    stopSignInWaiting("サインイン画面を閉じました。もう一度サインインしてください。");
  }

  useEffect(() => {
    mountedRef.current = true;

    function handleMessage(event: MessageEvent) {
      if (isAuthCompleteMessage(event)) {
        acceptSession(event.data.session, asWindow(event.source));
        return;
      }

      if (isAuthCodePayload(event.data)) {
        publishAuthCodeAck(asWindow(event.source));
        void acceptAuthCodeUrl(event.data.url, asWindow(event.source));
      }
    }

    function handleStorage(event: StorageEvent) {
      if (event.key !== sessionKey) {
        return;
      }

      acceptStoredSession();
    }

    function handleFocus() {
      if (!isSigningIn && !popupRef.current) {
        return;
      }

      acceptStoredSession();
      void acceptPopupRedirectSession();
      checkClosedPopupDuringSignIn();
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        handleFocus();
      }
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
    document.addEventListener("visibilitychange", handleVisibilityChange);

    void completeLoginFromRedirect()
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
      clearSignInTimer();
      channel?.close();
      window.removeEventListener("message", handleMessage);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isSigningIn]);

  async function handleSignIn() {
    setIsSigningIn(true);
    setError(null);
    popupClosedAtRef.current = 0;

    try {
      popupRef.current = await startLoginPopup();
      popupOpenedAtRef.current = Date.now();
      const startedAt = Date.now();

      clearSignInTimer();
      signInTimerRef.current = window.setInterval(() => {
        if (acceptStoredSession()) {
          return;
        }

        void acceptPopupRedirectSession();
        checkClosedPopupDuringSignIn();

        if (Date.now() - startedAt > popupWaitTimeoutMs) {
          stopSignInWaiting("サインインがタイムアウトしました。もう一度サインインしてください。");
        }
      }, 500);
    } catch (unknownError) {
      stopSignInWaiting(unknownError instanceof Error ? unknownError.message : "サインインを開始できませんでした。");
    }
  }

  return (
    <>
      {children({
        session,
        isLoading,
        isSigningIn,
        error,
        startSignIn: handleSignIn,
      })}
    </>
  );
}
