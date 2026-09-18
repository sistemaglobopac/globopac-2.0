/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
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
  plugins: [react(), buildMetaPlugin()],
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
