import { useEffect, useState } from "react";
import { startLogin } from "../auth/cognitoAuth";

export default function AuthPopupStart() {
  const [message, setMessage] = useState(
    "Cognito サインイン画面を開いています…",
  );

  useEffect(() => {
    startLogin().catch(() => {
      setMessage(
        "Cognito サインイン画面を開けませんでした。このウィンドウを閉じて、もう一度お試しください。",
      );
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
