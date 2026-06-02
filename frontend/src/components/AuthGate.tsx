import { useEffect, useRef, useState } from "react";
import type React from "react";
import {
  authBroadcastChannelName,
  completeLoginFromRedirect,
  completeLoginFromUrl,
  getStoredSession,
  isAuthCodeAckMessage,
  isAuthCodeMessage,
  isAuthCodePayload,
  isAuthCompleteMessage,
  isAuthCompletePayload,
  publishAuthCodeAck,
  sessionKey,
  startLoginPopup,
  storeSession,
} from "../auth/cognitoAuth";
import type { AuthSession } from "../types/auth";

const popupWaitTimeoutMs = 5 * 60 * 1000;
const popupCloseGracePeriodMs = 6_000;

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

export default function AuthGate({ children }: Props) {
  const mountedRef = useRef(false);
  const popupRef = useRef<Window | null>(null);
  const popupOpenedAtRef = useRef<number>(0);
  const sessionPollerRef = useRef<number | undefined>(undefined);
  const signInTimerRef = useRef<number | undefined>(undefined);
  const popupCloseGuardRef = useRef<number | undefined>(undefined);
  const authCodeExchangeRef = useRef(false);
  const authPopupHandoffObservedRef = useRef(false);
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

  function clearPopupCloseGuard(): void {
    if (popupCloseGuardRef.current) {
      window.clearTimeout(popupCloseGuardRef.current);
      popupCloseGuardRef.current = undefined;
    }
  }

  function resetPopupTracking(): void {
    popupRef.current = null;
    popupOpenedAtRef.current = 0;
    authPopupHandoffObservedRef.current = false;
    clearPopupCloseGuard();
  }

  function stopSignInWaiting(message?: string): void {
    clearSignInTimer();
    resetPopupTracking();
    setIsSigningIn(false);
    if (message) {
      setError(message);
    }
  }

  function acceptSession(nextSession: AuthSession): void {
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

    authPopupHandoffObservedRef.current = true;
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
    if (!isSigningIn) {
      return;
    }

    const popup = popupRef.current;
    if (!popup?.closed) {
      return;
    }

    clearPopupCloseGuard();
    popupCloseGuardRef.current = window.setTimeout(() => {
      if (acceptStoredSession()) {
        return;
      }

      if (popupOpenedAtRef.current && Date.now() - popupOpenedAtRef.current < 2_000) {
        return;
      }

      if (authCodeExchangeRef.current || authPopupHandoffObservedRef.current) {
        return;
      }

      if (popupRef.current?.closed) {
        stopSignInWaiting("サインイン画面を閉じました。もう一度サインインしてください。");
      }
    }, popupCloseGracePeriodMs);
  }

  useEffect(() => {
    mountedRef.current = true;

    function handleMessage(message: MessageEvent) {
      if (isAuthCompleteMessage(message)) {
        acceptSession(message.data.session);
        return;
      }

      if (isAuthCodeMessage(message)) {
        authPopupHandoffObservedRef.current = true;
        publishAuthCodeAck(popupRef.current);
        void acceptAuthCodeUrl(message.data.url);
        return;
      }

      if (isAuthCodeAckMessage(message)) {
        return;
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
      startSessionPolling(5_000);
      checkClosedPopupAfterFocus();
    }

    function handleVisibilityChange() {
      if (document.visibilityState !== "visible") {
        return;
      }

      handleFocus();
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
          authPopupHandoffObservedRef.current = true;
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
      if (sessionPollerRef.current) {
        window.clearInterval(sessionPollerRef.current);
      }
      clearSignInTimer();
      clearPopupCloseGuard();
      channel?.close();
      window.removeEventListener("message", handleMessage);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  async function handleSignIn() {
    setIsSigningIn(true);
    setError(null);
    authPopupHandoffObservedRef.current = false;
    clearPopupCloseGuard();

    try {
      popupRef.current = await startLoginPopup();
      popupOpenedAtRef.current = Date.now();
      const startedAt = Date.now();
      startSessionPolling(popupWaitTimeoutMs);

      signInTimerRef.current = window.setInterval(() => {
        if (acceptStoredSession()) {
          return;
        }

        void acceptPopupRedirectSession();

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
