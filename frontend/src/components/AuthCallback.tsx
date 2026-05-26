import { useEffect, useState } from "react";
import { completeLoginFromRedirect } from "../auth/cognitoAuth";

export default function AuthCallback() {
  const [message, setMessage] = useState("サインインを完了しています...");

  useEffect(() => {
    completeLoginFromRedirect()
      .then((session) => {
        if (!session) {
          setMessage("サインイン結果が見つかりませんでした。");
          return;
        }

        setMessage("サインインが完了しました。このウィンドウは閉じられます。");
        window.setTimeout(() => window.close(), 500);
      })
      .catch(() => {
        setMessage("サインインに失敗しました。このウィンドウを閉じて再度お試しください。");
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
