import { useEffect, useState } from "react";
import { startLogin } from "../auth/cognitoAuth";

export default function AuthPopupStart() {
  const [message, setMessage] = useState("Opening Cognito sign-in...");

  useEffect(() => {
    startLogin().catch(() => {
      setMessage("Failed to open Cognito sign-in. Please close this window and try again.");
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

