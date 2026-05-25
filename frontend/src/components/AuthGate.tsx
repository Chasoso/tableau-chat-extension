import { useEffect, useState } from "react";
import type React from "react";
import {
  completeLoginFromRedirect,
  isAuthCompleteMessage,
  startLoginPopup,
  storeSession,
} from "../auth/cognitoAuth";
import type { AuthSession } from "../types/auth";

type Props = {
  children: (session: AuthSession) => React.ReactNode;
};

export default function AuthGate({ children }: Props) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    function handleMessage(message: MessageEvent) {
      if (!isAuthCompleteMessage(message)) {
        return;
      }

      storeSession(message.data.session);
      setSession(message.data.session);
      setError(null);
    }

    window.addEventListener("message", handleMessage);
    completeLoginFromRedirect()
      .then((nextSession) => {
        if (mounted) {
          setSession(nextSession);
        }
      })
      .catch((unknownError) => {
        if (mounted) {
          setError(unknownError instanceof Error ? unknownError.message : "Sign-in failed.");
        }
      })
      .finally(() => {
        if (mounted) {
          setIsLoading(false);
        }
      });

    return () => {
      mounted = false;
      window.removeEventListener("message", handleMessage);
    };
  }, []);

  if (isLoading) {
    return <div className="app-shell loading-state">Checking sign-in...</div>;
  }

  if (session) {
    return <>{children(session)}</>;
  }

  return (
    <div className="app-shell auth-state">
      <section className="auth-card">
        <h1>Tableau Assistant</h1>
        <p>Sign in to ask questions about this dashboard.</p>
        {error ? <div className="error-banner">{error}</div> : null}
        <button
          type="button"
          onClick={() => {
            startLoginPopup().catch((unknownError) => {
              setError(unknownError instanceof Error ? unknownError.message : "Failed to start sign-in.");
            });
          }}
        >
          Sign in
        </button>
      </section>
    </div>
  );
}
