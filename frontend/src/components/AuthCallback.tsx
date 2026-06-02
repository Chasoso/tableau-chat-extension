import { useEffect, useState } from "react";
import {
  completeLoginFromRedirect,
  isAuthCompleteAckMessage,
  publishAuthSession,
} from "../auth/cognitoAuth";

const popupAutoCloseTimeoutMs = 15_000;

export default function AuthCallback() {
  const [message, setMessage] = useState("サインイン結果を確認しています…");

  useEffect(() => {
    let interval: number | undefined;
    let closeTimer: number | undefined;

    const handleAck = (event: MessageEvent) => {
      if (!isAuthCompleteAckMessage(event)) {
        return;
      }

      if (interval) {
        window.clearInterval(interval);
      }
      if (closeTimer) {
        window.clearTimeout(closeTimer);
      }
      window.close();
    };

    window.addEventListener("message", handleAck);

    void completeLoginFromRedirect()
      .then((session) => {
        if (!session) {
          setMessage("サインイン結果を確認できませんでした。このウィンドウを閉じて、もう一度お試しください。");
          return;
        }

        setMessage("サインインが完了しました。元の画面に戻しています…");
        interval = window.setInterval(() => publishAuthSession(session), 250);
        publishAuthSession(session);
        closeTimer = window.setTimeout(() => {
          if (interval) {
            window.clearInterval(interval);
          }
          window.close();
        }, popupAutoCloseTimeoutMs);
      })
      .catch(() => {
        setMessage("サインインに失敗しました。このウィンドウを閉じて、もう一度お試しください。");
      });

    return () => {
      window.removeEventListener("message", handleAck);
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
