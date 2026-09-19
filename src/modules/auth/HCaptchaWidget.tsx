import { useEffect, useRef } from "react";

declare global {
  interface Window {
    hcaptcha?: {
      render: (
        container: HTMLElement,
        options: { sitekey: string; callback: (token: string) => void; "error-callback"?: () => void }
      ) => string;
      remove: (widgetId: string) => void;
    };
  }
}

const SCRIPT_SRC = "https://js.hcaptcha.com/1/api.js";
let scriptPromise: Promise<void> | null = null;

function carregarScriptHCaptcha(): Promise<void> {
  scriptPromise ??= new Promise((resolve, reject) => {
    if (window.hcaptcha) {
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

/** Widget de "comprovação humana" (hCaptcha), exibido pelo LoginPage só depois de 5 tentativas
 * de login malsucedidas do mesmo IP — nunca no primeiro acesso (ver ADR 0015). Trocado do
 * Cloudflare Turnstile para hCaptcha por um bug de conta do lado da Cloudflare (toda sitekey
 * real retornava "400020 invalid sitekey", só a sitekey de teste funcionava — problema
 * confirmado e relatado por outros usuários no fórum da Cloudflare, não algo corrigível por
 * configuração). Sem VITE_HCAPTCHA_SITE_KEY configurada, mostra um aviso em vez de travar o
 * formulário silenciosamente; local/CI usam a sitekey de teste pública do hCaptcha, que sempre
 * passa — ver .env.example. */
export function HCaptchaWidget({ onToken }: { onToken: (token: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const siteKey = import.meta.env.VITE_HCAPTCHA_SITE_KEY as string | undefined;

  useEffect(() => {
    if (!siteKey || !containerRef.current) return;
    let montado = true;

    carregarScriptHCaptcha()
      .then(() => {
        if (!montado || !containerRef.current || !window.hcaptcha) return;
        widgetIdRef.current = window.hcaptcha.render(containerRef.current, {
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
      if (widgetIdRef.current && window.hcaptcha) window.hcaptcha.remove(widgetIdRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onToken é estável o bastante (setState do pai)
  }, [siteKey]);

  if (!siteKey) {
    return (
      <p className="rounded-md border border-warning bg-warning/10 p-2 text-xs text-warning">
        VITE_HCAPTCHA_SITE_KEY não configurada — verificação humana indisponível neste ambiente.
      </p>
    );
  }

  return <div ref={containerRef} className="flex justify-center" />;
}
