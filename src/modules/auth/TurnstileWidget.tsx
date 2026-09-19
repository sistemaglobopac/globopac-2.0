import { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: { sitekey: string; callback: (token: string) => void; "error-callback"?: () => void }
      ) => string;
      remove: (widgetId: string) => void;
    };
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js";
let scriptPromise: Promise<void> | null = null;

function carregarScriptTurnstile(): Promise<void> {
  scriptPromise ??= new Promise((resolve, reject) => {
    if (window.turnstile) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("falha ao carregar o desafio de verificação"));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/** Widget de "comprovação humana" (Cloudflare Turnstile), exibido pelo LoginPage só depois de
 * 5 tentativas de login malsucedidas do mesmo IP — nunca no primeiro acesso (ver ADR 0015).
 * Sem VITE_TURNSTILE_SITE_KEY configurada, mostra um aviso em vez de travar o formulário
 * silenciosamente: útil para diagnosticar um ambiente mal configurado (produção sempre precisa
 * da chave real; local/CI usam as chaves de teste públicas da Cloudflare, que sempre passam —
 * ver .env.example). */
export function TurnstileWidget({ onToken }: { onToken: (token: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

  useEffect(() => {
    if (!siteKey || !containerRef.current) return;
    let montado = true;

    carregarScriptTurnstile()
      .then(() => {
        if (!montado || !containerRef.current || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          callback: onToken,
        });
      })
      .catch(() => {
        /* erro de rede ao carregar o script — o formulário fica sem captcha disponível; o
         * botão "Entrar" permanece desabilitado até o usuário recarregar a página. */
      });

    return () => {
      montado = false;
      if (widgetIdRef.current && window.turnstile) window.turnstile.remove(widgetIdRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onToken é estável o bastante (setState do pai)
  }, [siteKey]);

  if (!siteKey) {
    return (
      <p className="rounded-md border border-warning bg-warning/10 p-2 text-xs text-warning">
        VITE_TURNSTILE_SITE_KEY não configurada — verificação humana indisponível neste ambiente.
      </p>
    );
  }

  return <div ref={containerRef} />;
}
