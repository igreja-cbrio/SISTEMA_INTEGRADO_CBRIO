import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { sentryVitePlugin } from "@sentry/vite-plugin";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const release = process.env.SENTRY_RELEASE
    || process.env.VERCEL_GIT_COMMIT_SHA
    || process.env.APP_RELEASE
    || "";
  const environment = process.env.SENTRY_ENV || process.env.VERCEL_ENV || mode;

  // ── Skew Protection do Vercel (2026-08-21 · pedido do Marcos) ──
  // O projeto tem Skew Protection LIGADO no painel (12h), mas pra Vite ele só
  // funciona se cada asset construído carregar o id do deployment (`?dpl=`):
  // é ele que faz o Vercel servir o chunk da versão ANTIGA pra quem está com a
  // aba aberta durante/depois de um deploy — em vez do 404 que joga a pessoa
  // na tela "uma atualização está sendo publicada" do ErrorBoundary.
  // ⚠️ GUARDADO: sem a env (build local, CI de teste), o build sai IDÊNTICO ao
  // de hoje — nunca anexar `?dpl=undefined`, que quebraria todo asset.
  const deploymentId = process.env.VERCEL_DEPLOYMENT_ID || "";
  const sentryUploadEnabled = Boolean(
    process.env.SENTRY_AUTH_TOKEN
    && process.env.SENTRY_ORG
    && process.env.SENTRY_PROJECT_FRONTEND
    && release,
  );

  return {
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  define: {
    __APP_RELEASE__: JSON.stringify(release),
    __APP_ENVIRONMENT__: JSON.stringify(environment),
  },
  build: {
    sourcemap: sentryUploadEnabled ? "hidden" : false,
  },
  experimental: deploymentId ? {
    // Anexa `?dpl=<deployment>` a TODA URL construída (script do index, chunks
    // dinâmicos, CSS). O Vercel usa o parâmetro pra rotear o pedido ao
    // deployment de ORIGEM da página, pela janela do Skew Protection.
    renderBuiltUrl(filename: string) {
      return `/${filename}?dpl=${deploymentId}`;
    },
  } : undefined,
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    sentryUploadEnabled && sentryVitePlugin({
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT_FRONTEND,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      telemetry: false,
      release: { name: release },
      sourcemaps: {
        assets: "./dist/assets/**",
        filesToDeleteAfterUpload: "./dist/**/*.map",
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
  };
});
