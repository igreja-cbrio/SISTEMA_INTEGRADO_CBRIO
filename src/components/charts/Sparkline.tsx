import * as React from "react";

/**
 * Mini gráfico de barras (sparkline) no estilo "Vidro" — última barra em
 * destaque (cor de acento), as demais discretas (currentColor). Sem deps de
 * recharts. Use em cards de KPI/estatística.
 */
export function Sparkline({
  data,
  color = "#00B39D",
  height = 28,
}: {
  data: number[];
  color?: string;
  height?: number;
}) {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data, 1);
  const n = data.length;
  const gap = 2;
  const W = 100; // unidades do viewBox (escala via preserveAspectRatio)
  const bw = (W - gap * (n - 1)) / n;
  return (
    <svg
      viewBox={`0 0 ${W} ${height}`}
      preserveAspectRatio="none"
      width="100%"
      height={height}
      aria-hidden="true"
      style={{ display: "block" }}
    >
      {data.map((v, i) => {
        const h = Math.max(2, (Math.max(0, v) / max) * height);
        const x = i * (bw + gap);
        const last = i === n - 1;
        return (
          <rect
            key={i}
            x={x}
            y={height - h}
            width={bw}
            height={h}
            rx={1}
            fill={last ? color : "currentColor"}
            opacity={last ? 1 : 0.22}
          />
        );
      })}
    </svg>
  );
}

export default Sparkline;
