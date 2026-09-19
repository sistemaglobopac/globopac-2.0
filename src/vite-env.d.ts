/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  // hCaptcha (CAPTCHA de "comprovação humana" pós 5 falhas de login) — opcional: sem ela,
  // HCaptchaWidget mostra um aviso em vez do desafio. Ver ADR 0015.
  readonly VITE_HCAPTCHA_SITE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __APP_BUILD_ID__: string;
