import { useEffect, useState } from "react";
import { startLogin } from "../auth/cognitoAuth";

export default function AuthPopupStart() {
  const [message, setMessage] = useState("Cognitoサインインを開いています...");

  useEffect(() => {
    startLogin().catch(() => {
      setMessage("Cognitoサインインを開けませんでした。このウィンドウを閉じて再度お試しください。");
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
