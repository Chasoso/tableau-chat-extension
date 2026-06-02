import { useEffect, useState } from "react";
import {
  completeLoginFromRedirect,
  isAuthCodeAckMessage,
  isParentHandledAuthRedirect,
  publishAuthCode,
  publishAuthSession,
} from "../auth/cognitoAuth";

const popupAutoCloseTimeoutMs = 15_000;

export default function AuthCallback() {
  const [message, setMessage] = useState("サインイン結果を確認しています...");

  useEffect(() => {
    let interval: number | undefined;
    let closeTimer: number | undefined;

    if (isParentHandledAuthRedirect()) {
      setMessage("サインイン結果を親画面へ送信しています。このウィンドウは自動で閉じます。");

      const handleAck = (event: MessageEvent) => {
        if (!isAuthCodeAckMessage(event)) {
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
      interval = window.setInterval(() => publishAuthCode(), 250);
      closeTimer = window.setTimeout(() => {
        if (interval) {
          window.clearInterval(interval);
        }
        window.close();
      }, popupAutoCloseTimeoutMs);

      return () => {
        window.removeEventListener("message", handleAck);
        if (interval) {
          window.clearInterval(interval);
        }
        if (closeTimer) {
          window.clearTimeout(closeTimer);
        }
      };
    }

    void completeLoginFromRedirect()
      .then((session) => {
        if (!session) {
          setMessage("サインイン結果を確認できませんでした。");
          return;
        }

        setMessage("サインイン結果を親画面へ送信しています。このウィンドウは自動で閉じます。");

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
