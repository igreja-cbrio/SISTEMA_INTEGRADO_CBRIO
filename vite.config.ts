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
  // ⚠️⚠️ NÃO REINTRODUZIR `experimental.renderBuiltUrl` COM `?dpl=` AQUI.
  // Ligado em 21/08/2026 para o Skew Protection da Vercel, ele quebrou o
  // sistema inteiro em silêncio: o Vite aplica a query no HTML e nos
  // `modulepreload`, mas os `import()` internos do rollup continuam apontando
  // para o caminho SEM a query — então o navegador baixa CADA chunk por DUAS
  // URLs e instancia CADA módulo DUAS VEZES.
  //
  // Medido no navegador em 23/08/2026, na porta pública de inscrição em grupos:
  // 42 requisições para 21 arquivos, TODOS em dobro. Com dois módulos do React
  // vivos, todo componente de tela `lazy` estoura
  // `Minified React error #321 (Invalid hook call)` e, na sequência,
  // `NotFoundError: removeChild` — que derruba a árvore. O sintoma visível era
  // mapa sem pino nenhum (Membresia e Grupos), mas o alcance é toda tela lazy.
  //
  // Se o Skew Protection voltar à mesa, a versão precisa garantir UMA URL por
  // módulo (nome de arquivo versionado, não query) e ser conferida no navegador
  // contando `performance.getEntriesByType('resource')` — o build e o typecheck
  // passam limpos com o defeito presente.
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
