import { COLORS, FONT } from "../theme";

// Janela de navegador estilizada que emoldura cada screenshot.
export const BrowserFrame: React.FC<{
  url: string;
  children: React.ReactNode;
}> = ({ url, children }) => {
  return (
    <div
      style={{
        width: 1500,
        borderRadius: 18,
        overflow: "hidden",
        background: "#0b1f1c",
        boxShadow: "0 40px 120px rgba(0,0,0,0.55)",
        border: `1px solid rgba(63,217,197,0.25)`,
      }}
    >
      {/* barra superior */}
      <div
        style={{
          height: 52,
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "0 20px",
          background: "rgba(255,255,255,0.04)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div style={{ display: "flex", gap: 9 }}>
          {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
            <div
              key={c}
              style={{ width: 13, height: 13, borderRadius: "50%", background: c }}
            />
          ))}
        </div>
        <div
          style={{
            flex: 1,
            height: 30,
            borderRadius: 8,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            padding: "0 16px",
            gap: 10,
            fontFamily: FONT,
            fontSize: 17,
            color: COLORS.textMuted,
          }}
        >
          <span style={{ color: COLORS.primaryLight }}>●</span>
          cbrio.com.br{url}
        </div>
      </div>
      {/* conteúdo */}
      <div style={{ width: "100%", aspectRatio: "1920 / 1080", overflow: "hidden" }}>
        {children}
      </div>
    </div>
  );
};
