import { COLORS, FONT } from "../theme";

// Mostrado quando o screenshot real ainda não foi capturado (captured:false).
// Simula um esqueleto da UI pra dar ideia do layout.
export const ScreenPlaceholder: React.FC<{ label: string }> = ({ label }) => {
  const bar = (w: number, h = 18, o = 0.1) => (
    <div
      style={{
        width: w,
        height: h,
        borderRadius: 6,
        background: `rgba(255,255,255,${o})`,
      }}
    />
  );

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background:
          "linear-gradient(135deg, #07302b 0%, #0a201d 100%)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* topbar fake */}
      <div
        style={{
          height: "11%",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          display: "flex",
          alignItems: "center",
          padding: "0 40px",
          gap: 24,
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: COLORS.primary,
            opacity: 0.8,
          }}
        />
        {bar(180, 16, 0.16)}
        <div style={{ flex: 1 }} />
        {bar(90, 16)}
        {bar(90, 16)}
      </div>
      {/* corpo fake: sidebar + cards */}
      <div style={{ flex: 1, display: "flex" }}>
        <div
          style={{
            width: "16%",
            borderRight: "1px solid rgba(255,255,255,0.06)",
            padding: 28,
            display: "flex",
            flexDirection: "column",
            gap: 18,
          }}
        >
          {[0, 1, 2, 3, 4, 5].map((i) => bar(160 - i * 6, 14, 0.09))}
        </div>
        <div
          style={{
            flex: 1,
            padding: 40,
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gridAutoRows: "minmax(120px, auto)",
            gap: 24,
          }}
        >
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              style={{
                borderRadius: 14,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(63,217,197,0.12)",
                padding: 22,
                display: "flex",
                flexDirection: "column",
                gap: 14,
              }}
            >
              {bar(70, 12, 0.18)}
              <div
                style={{
                  fontFamily: FONT,
                  fontSize: 34,
                  fontWeight: 800,
                  color: COLORS.primaryLight,
                  opacity: 0.55,
                }}
              >
                ▦
              </div>
              {bar(120, 12)}
            </div>
          ))}
        </div>
      </div>
      {/* selo */}
      <div
        style={{
          position: "absolute",
          fontFamily: FONT,
          fontSize: 15,
          color: COLORS.textMuted,
          padding: "10px 16px",
          bottom: 18,
          right: 22,
          borderRadius: 8,
          background: "rgba(0,0,0,0.4)",
        }}
      >
        prévia de {label} · rode “npm run capture:screens”
      </div>
    </div>
  );
};
