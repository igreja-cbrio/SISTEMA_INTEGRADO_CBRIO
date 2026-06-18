import * as React from "react";

/**
 * Gradientes reutilizáveis para gráficos (recharts) no tema "Vidro".
 * Uso:
 *   <BarChart ...>
 *     <ChartGradients colors={[C.primary, C.media, C.taxa]} />
 *     <Bar fill={C.primary}>           // cor sólida na legenda
 *       {data.map(...) => <Cell fill={gradFill(C.primary)} />}  // gradiente nas barras
 *     </Bar>
 *   </BarChart>
 *
 * Para área/linha: stroke fica na cor sólida; fill={gradFill(cor)} no <Area>.
 */

/** id estável de gradiente a partir da cor (hex/rgb). */
export function gradId(color: string): string {
  return "cg-" + String(color).replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

/** Referência usável em fill/stroke: url(#...). */
export function gradFill(color: string): string {
  return `url(#${gradId(color)})`;
}

type Props = {
  colors: string[];
  /** vertical (padrão, p/ barras) ou horizontal. */
  vertical?: boolean;
  /** opacidade no topo e na base do gradiente. */
  from?: number;
  to?: number;
};

/** <defs> com gradientes verticais (vivo no topo → suave na base). Renderize
 *  como filho direto de um chart recharts. Cores repetidas são deduplicadas. */
export function ChartGradients({ colors, vertical = true, from = 0.95, to = 0.32 }: Props) {
  const uniq = Array.from(new Set((colors || []).filter(Boolean)));
  return (
    <defs>
      {uniq.map((c) => (
        <linearGradient
          key={c}
          id={gradId(c)}
          x1="0"
          y1="0"
          x2={vertical ? "0" : "1"}
          y2={vertical ? "1" : "0"}
        >
          <stop offset="0%" stopColor={c} stopOpacity={from} />
          <stop offset="100%" stopColor={c} stopOpacity={to} />
        </linearGradient>
      ))}
    </defs>
  );
}

export default ChartGradients;
