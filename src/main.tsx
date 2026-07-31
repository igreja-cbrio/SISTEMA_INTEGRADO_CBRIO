import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initSentry, Sentry } from "./lib/sentry";
import { useState } from "react";
import { reloadForAppUpdate } from "./lib/appUpdate";
import { initWebVitals } from "./lib/webVitals";

initSentry();
initWebVitals();

function FallbackError() {
  const [updating, setUpdating] = useState(false);

  return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", padding: 24,
      background: "var(--cbrio-bg, #0a0a0a)", color: "var(--cbrio-text, #e5e5e5)",
      textAlign: "center", fontFamily: "Inter, sans-serif",
    }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>
        Algo deu errado
      </h1>
      <p style={{ fontSize: 14, color: "var(--cbrio-text2, #a3a3a3)", marginBottom: 20, maxWidth: 480 }}>
        Não foi possível abrir esta página. Tente novamente; seu acesso e o endereço atual serão mantidos.
      </p>
      <button
        disabled={updating}
        onClick={() => {
          setUpdating(true);
          void reloadForAppUpdate({ resetRetries: true });
        }}
        style={{
          padding: "10px 24px", borderRadius: 8, background: "#00B39D",
          color: "#fff", border: "none", fontWeight: 700,
          cursor: updating ? "wait" : "pointer", opacity: updating ? 0.75 : 1,
        }}
      >
        {updating ? "Atualizando…" : "Tentar novamente"}
      </button>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <Sentry.ErrorBoundary fallback={<FallbackError />} showDialog={false}>
    <App />
  </Sentry.ErrorBoundary>
);
