import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

declare global {
  interface Window {
    YaAuthSuggest?: any;
  }
}

export default function Login() {
  const sdkInitialized = useRef(false);
  const [sdkError, setSdkError] = useState(false);

  const { user, isLoading, setTokenAndUser } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    if (!isLoading && user) {
      navigate("/dashboard");
    }
  }, [user, isLoading, navigate]);

  // Receive token from Yandex popup via localStorage event
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "yandex_auth_token" && e.newValue) {
        localStorage.removeItem("yandex_auth_token");
        setTokenAndUser(e.newValue).then(() => navigate("/dashboard"));
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  useEffect(() => {
    if (isLoading || user || sdkInitialized.current) return;

    fetch("/api/auth/config")
      .then((r) => r.json())
      .then(({ yandexClientId, yandexTokenPageOrigin, yandexRedirectUri }) => {
        if (!yandexClientId) return;

        const tryInit = () => {
          if (!window.YaAuthSuggest) { setTimeout(tryInit, 100); return; }
          if (sdkInitialized.current) return;
          sdkInitialized.current = true;

          window.YaAuthSuggest.init(
            {
              client_id: yandexClientId,
              response_type: "token",
              redirect_uri: yandexRedirectUri,
            },
            yandexTokenPageOrigin,
            {
              view: "button",
              parentId: "ya-button-container",
              buttonView: "main",
              buttonTheme: "light",
              buttonSize: "xl",
              buttonBorderRadius: 8,
            }
          )
            .then(({ handler }: any) => handler())
            .then(async (data: any) => {
              const res = await fetch("/api/auth/yandex/token", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ access_token: data.access_token }),
              });
              const result = await res.json();
              if (!res.ok) throw new Error(result.message || "Ошибка авторизации");
              await setTokenAndUser(result.token);
              navigate("/dashboard");
            })
            .catch((err: any) => {
              if (err?.type === "authorizationFailed" || err?.code === "access_denied") return;
              console.error("Yandex auth error:", err);
              setSdkError(true);
              toast({
                title: "Ошибка входа через Яндекс",
                description: err?.message || "Попробуйте снова",
                variant: "destructive",
              });
              sdkInitialized.current = false;
            });
        };

        tryInit();
      });
  }, [isLoading, user]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#FC3F1D]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
      {/* Logo */}
      <div className="mb-10 text-center">
        <h1 className="text-4xl font-bold text-gray-900 tracking-tight">ERP: Yandex Factory</h1>
        <p className="text-gray-500 mt-2 text-base">Управление маркетплейсами</p>
      </div>

      {/* Yandex button card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 px-10 py-10 flex flex-col items-center gap-6 w-full max-w-sm">
        <p className="text-gray-700 text-base font-medium">Войдите с аккаунтом Яндекса</p>

        {/* SDK рендерит кнопку сюда */}
        <div id="ya-button-container" className="w-full flex justify-center min-h-[56px]">
          {!sdkError && (
            <div className="h-14 w-full rounded-lg bg-gray-100 animate-pulse" />
          )}
        </div>

        {sdkError && (
          <button
            className="text-sm text-gray-500 underline"
            onClick={() => { sdkInitialized.current = false; setSdkError(false); }}
          >
            Попробовать снова
          </button>
        )}
      </div>
    </div>
  );
}
