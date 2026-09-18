/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";

// Identifica cada build para o UpdateNotifier detectar quando um novo deploy foi publicado.
const buildId = Date.now().toString();

function buildMetaPlugin(): Plugin {
  return {
    name: "build-meta",
    configureServer(server) {
      server.middlewares.use("/build-meta.json", (_req, res) => {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ buildId }));
      });
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "build-meta.json",
        source: JSON.stringify({ buildId }),
      });
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    buildMetaPlugin(),
    // PWA instalável (Fase 8, ADR 0014) — só o app shell é precacheado, NUNCA respostas de
    // API/Supabase (mostrar um monitoramento desatualizado como se fosse atual seria o tipo
    // de risco que este projeto existe para eliminar). registerType "autoUpdate": o service
    // worker se atualiza sozinho em segundo plano — quem avisa o usuário de uma nova versão
    // já é o UpdateNotifier (build-meta.json); duas UIs de "atualizar" seria confuso.
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      // Sem workbox.runtimeCaching: nenhuma chamada de rede (Supabase REST/Functions) é
      // interceptada pelo service worker — só os assets do próprio build (precache automático
      // do Workbox). navigateFallback (padrão do plugin) serve index.html para qualquer rota
      // offline, correto para uma SPA independente da tela.
      manifest: {
        name: "GloboPac 2.0",
        short_name: "GloboPac",
        description: "Controle de qualidade e auditoria — SIF 1606",
        theme_color: "#002060",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
        icons: [{ src: "/favicon.png", sizes: "916x915", type: "image/png", purpose: "any" }],
      },
    }),
  ],
  define: {
    __APP_BUILD_ID__: JSON.stringify(buildId),
  },
  server: {
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
    strictPort: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/unit/**/*.test.ts", "tests/component/**/*.test.tsx"],
  },
});
