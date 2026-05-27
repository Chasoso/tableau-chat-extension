import { useEffect, useState } from "react";
import {
  completeLoginFromRedirect,
  isParentHandledAuthRedirect,
  publishAuthCode,
  publishAuthSession,
} from "../auth/cognitoAuth";

export default function AuthCallback() {
  const [message, setMessage] = useState("サインインを完了しています...");

  useEffect(() => {
    let interval: number | undefined;
    let closeTimer: number | undefined;

    if (isParentHandledAuthRedirect()) {
      setMessage("サインイン結果を元の画面へ渡しています。このウィンドウは自動で閉じます。");
      interval = window.setInterval(() => publishAuthCode(), 250);
      closeTimer = window.setTimeout(() => {
        if (interval) {
          window.clearInterval(interval);
        }
        window.close();
      }, 4_000);
      return () => {
        if (interval) {
          window.clearInterval(interval);
        }
        if (closeTimer) {
          window.clearTimeout(closeTimer);
        }
      };
    }

    completeLoginFromRedirect()
      .then((session) => {
        if (!session) {
          setMessage("サインイン結果が見つかりませんでした。");
          return;
        }

        setMessage("サインイン結果を元の画面へ渡しています。このウィンドウは自動で閉じます。");

        // Tableau Cloud iframe can miss a one-shot popup message, so repeat the
        // same-origin handoff briefly before closing the popup.
        interval = window.setInterval(() => publishAuthSession(session), 250);
        closeTimer = window.setTimeout(() => {
          if (interval) {
            window.clearInterval(interval);
          }
          window.close();
        }, 2_000);
      })
      .catch(() => {
        setMessage("サインインに失敗しました。このウィンドウを閉じて、もう一度お試しください。");
      });

    return () => {
      if (interval) {
        window.clearInterval(interval);
      }
      if (closeTimer) {
        window.clearTimeout(closeTimer);
      }
    };
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
