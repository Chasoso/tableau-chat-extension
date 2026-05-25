import { useEffect, useState } from "react";
import { completeLoginFromRedirect } from "../auth/cognitoAuth";

export default function AuthCallback() {
  const [message, setMessage] = useState("Completing sign-in...");

  useEffect(() => {
    completeLoginFromRedirect()
      .then((session) => {
        if (!session) {
          setMessage("No sign-in response was found.");
          return;
        }

        setMessage("Sign-in completed. You can close this window.");
        window.setTimeout(() => window.close(), 500);
      })
      .catch(() => {
        setMessage("Sign-in failed. Please close this window and try again.");
      });
  }, []);

  return (
    <div className="app-shell auth-state">
      <section className="auth-card">
        <h1>Tableau Assistant</h1>
        <p>{message}</p>
      </section>
    </div>
  );
}

