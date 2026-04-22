import { motion } from 'framer-motion';
import { useMemo } from 'react';
import { NumberTicker } from '@/components/ui/number-ticker';

// Geometria: meio-círculo com 5 setores, raio externo grande, centro vazado
const TEAL = '#00B39D';
const TEAL_LIGHT = '#33C2B0';
const TEAL_DARK = '#008B7A';
const BLUE = '#3B82F6';
const BLUE_LIGHT = '#60A5FA';

const PETALS = [
  { key: 'seguir',     label: 'Seguir a Jesus',         color: BLUE,      colorLight: BLUE_LIGHT },
  { key: 'conectar',   label: 'Conectar-se com Pessoas', color: TEAL,      colorLight: TEAL_LIGHT },
  { key: 'investir',   label: 'Investir Tempo com Deus', color: TEAL_DARK, colorLight: TEAL },
  { key: 'servir',     label: 'Servir em Comunidade',    color: TEAL,      colorLight: TEAL_LIGHT },
  { key: 'generosidade', label: 'Generosidade',          color: BLUE,      colorLight: BLUE_LIGHT },
];

// Constrói o path SVG de um setor anelar (donut slice)
function annularSector(cx, cy, rOuter, rInner, startAngle, endAngle) {
  const toRad = (a) => (a * Math.PI) / 180;
  const x1 = cx + rOuter * Math.cos(toRad(startAngle));
  const y1 = cy + rOuter * Math.sin(toRad(startAngle));
  const x2 = cx + rOuter * Math.cos(toRad(endAngle));
  const y2 = cy + rOuter * Math.sin(toRad(endAngle));
  const x3 = cx + rInner * Math.cos(toRad(endAngle));
  const y3 = cy + rInner * Math.sin(toRad(endAngle));
  const x4 = cx + rInner * Math.cos(toRad(startAngle));
  const y4 = cy + rInner * Math.sin(toRad(startAngle));
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `
    M ${x1} ${y1}
    A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${x2} ${y2}
    L ${x3} ${y3}
    A ${rInner} ${rInner} 0 ${largeArc} 0 ${x4} ${y4}
    Z
  `;
}

function formatNumber(n) {
  if (n == null) return '—';
  return Intl.NumberFormat('pt-BR').format(n);
}

/**
 * Renderiza valor primário da pétala em texto curto (sem componente animado dentro do SVG).
 */
function petalValueText(key, data) {
  if (!data) return '—';
  switch (key) {
    case 'seguir': {
      const p = data.seguir_jesus?.presencial;
      const o = data.seguir_jesus?.online;
      if (p == null && o == null) return '—';
      return `${formatNumber(p ?? 0)} / ${formatNumber(o ?? 0)}`;
    }
    case 'conectar':     return formatNumber(data.conectar_pessoas);
    case 'investir':     return formatNumber(data.investir_deus);
    case 'servir':       return formatNumber(data.servir_comunidade);
    case 'generosidade': {
      const d = data.generosidade?.dizimistas;
      const o = data.generosidade?.ofertantes;
      if (d == null && o == null) return '—';
      return `${formatNumber(d ?? 0)} / ${formatNumber(o ?? 0)}`;
    }
    default: return '—';
  }
}

function petalSubLabel(key) {
  switch (key) {
    case 'seguir':       return 'Pres / Online (sem)';
    case 'conectar':     return 'em grupos';
    case 'investir':     return 'views/dia (PENSE)';
    case 'servir':       return 'voluntários (90d)';
    case 'generosidade': return 'dizim / ofert';
    default: return '';
  }
}

export default function MandalaSVG({ data, loading, onPetalClick }) {
  // Viewbox: meio-círculo virado para cima — 800x440
  const W = 800, H = 440;
  const cx = W / 2, cy = H - 30;
  const rOuter = 380;
  const rInner = 130;
  const startBase = 180; // esquerda
  const endBase = 360;   // direita
  const total = endBase - startBase; // 180°
  const sliceAngle = total / PETALS.length; // 36°
  const gap = 1.5; // grau de gap entre pétalas

  const slices = useMemo(() => PETALS.map((p, i) => {
    const start = startBase + i * sliceAngle + gap / 2;
    const end = start + sliceAngle - gap;
    const mid = (start + end) / 2;
    const toRad = (a) => (a * Math.PI) / 180;
    const labelR = (rOuter + rInner) / 2;
    const lx = cx + labelR * Math.cos(toRad(mid));
    const ly = cy + labelR * Math.sin(toRad(mid));
    return {
      ...p,
      d: annularSector(cx, cy, rOuter, rInner, start, end),
      labelX: lx,
      labelY: ly,
      mid,
    };
  }), []);

  const decisoes = data?.decisoes ?? null;

  return (
    <div className="relative w-full max-w-[860px] mx-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto block"
        role="img"
        aria-label="Mandala da Cultura CBRio"
      >
        <defs>
          {PETALS.map((p) => (
            <radialGradient key={`g-${p.key}`} id={`grad-${p.key}`} cx="50%" cy="100%" r="100%">
              <stop offset="0%" stopColor={p.colorLight} stopOpacity="0.95" />
              <stop offset="100%" stopColor={p.color} stopOpacity="1" />
            </radialGradient>
          ))}
          <filter id="petal-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="4" />
            <feOffset dx="0" dy="3" result="offsetblur" />
            <feComponentTransfer><feFuncA type="linear" slope="0.25" /></feComponentTransfer>
            <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* Pétalas */}
        {slices.map((s, i) => (
          <motion.g
            key={s.key}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.08 * i, duration: 0.45, ease: 'easeOut' }}
            style={{ transformOrigin: `${cx}px ${cy}px`, cursor: 'pointer' }}
            whileHover={{ scale: 1.03 }}
            onClick={() => onPetalClick?.(s.key)}
          >
            <path d={s.d} fill={`url(#grad-${s.key})`} filter="url(#petal-shadow)" />
            {/* Label da pétala */}
            <foreignObject
              x={s.labelX - 70}
              y={s.labelY - 36}
              width="140"
              height="72"
              style={{ pointerEvents: 'none' }}
            >
              <div className="h-full w-full flex flex-col items-center justify-center text-center text-white px-1">
                <div className="text-[11px] font-semibold leading-tight opacity-95 drop-shadow">
                  {s.label}
                </div>
                <div className="text-[15px] font-bold mt-1 tabular-nums drop-shadow">
                  {loading ? '…' : petalValueText(s.key, data)}
                </div>
                <div className="text-[9px] opacity-80 leading-tight">
                  {petalSubLabel(s.key)}
                </div>
              </div>
            </foreignObject>
          </motion.g>
        ))}

        {/* Centro - Decisões */}
        <motion.g
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.5, duration: 0.5 }}
        >
          <circle cx={cx} cy={cy} r={rInner - 6} fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="1.5" />
          <motion.circle
            cx={cx} cy={cy} r={rInner - 6}
            fill="none" stroke={TEAL} strokeWidth="2"
            initial={{ opacity: 0.4 }}
            animate={{ opacity: [0.4, 0.9, 0.4], scale: [1, 1.02, 1] }}
            transition={{ repeat: Infinity, duration: 2.6, ease: 'easeInOut' }}
            style={{ transformOrigin: `${cx}px ${cy}px` }}
          />
          <foreignObject x={cx - 110} y={cy - 70} width="220" height="120" style={{ pointerEvents: 'none' }}>
            <div className="h-full w-full flex flex-col items-center justify-center">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
                Decisões
              </div>
              <div className="text-4xl font-extrabold text-foreground mt-1">
                {loading || decisoes == null ? (
                  <span className="text-muted-foreground/50">—</span>
                ) : (
                  <NumberTicker value={decisoes} className="text-4xl font-extrabold" />
                )}
              </div>
              <div className="text-[10px] text-muted-foreground mt-1">no mês</div>
            </div>
          </foreignObject>
        </motion.g>
      </svg>
    </div>
  );
}
