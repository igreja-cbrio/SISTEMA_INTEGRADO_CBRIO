// ============================================================================
// MandalaSlide — uma mandala do carrossel do /painel
//
// Modos:
//   - geral: 5 petalas (valores), centro mostra "5 valores"
//   - por_valor: 6 petalas (areas), centro mostra % geral do valor
//
// Cada petala tem cor base do valor (no modo geral, cor propria de cada valor;
// no modo por_valor, cor unica do valor com opacidade variando por status).
// Status: verde (≥70%), amarelo (40-69%), vermelho (<40%), sem_dado (0 avaliados)
// ============================================================================

import { useMemo } from 'react';

const STATUS_OPACITY = {
  verde:    1.0,
  amarelo:  0.65,
  vermelho: 0.35,
  sem_dado: 0.15,
};

const STATUS_LABEL = {
  verde:    'Em dia',
  amarelo:  'Atencao',
  vermelho: 'Critico',
  sem_dado: 'Sem dado',
};

// Geometria do circulo completo
const SIZE = 380;
const CX = SIZE / 2;
const CY = SIZE / 2;
const R_OUTER = 165;
const R_INNER = 70;

function annularSector(rOuter, rInner, startAngle, endAngle) {
  const toRad = (a) => (a * Math.PI) / 180;
  const x1 = CX + rOuter * Math.cos(toRad(startAngle));
  const y1 = CY + rOuter * Math.sin(toRad(startAngle));
  const x2 = CX + rOuter * Math.cos(toRad(endAngle));
  const y2 = CY + rOuter * Math.sin(toRad(endAngle));
  const x3 = CX + rInner * Math.cos(toRad(endAngle));
  const y3 = CY + rInner * Math.sin(toRad(endAngle));
  const x4 = CX + rInner * Math.cos(toRad(startAngle));
  const y4 = CY + rInner * Math.sin(toRad(startAngle));
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${rInner} ${rInner} 0 ${largeArc} 0 ${x4} ${y4} Z`;
}

/**
 * Props:
 *   modo: 'geral' | 'por_valor'
 *   data: dados da mandala (depende do modo)
 *   onPetalClick?: (item) => void
 */
export default function MandalaSlide({ modo, data, onPetalClick }) {
  const isGeral = modo === 'geral';

  // Petalas: 5 (valores) ou 6 (areas) ou N
  const items = isGeral ? data.valores : data.areas;
  const n = items.length;

  const slices = useMemo(() => {
    if (!n) return [];
    const startBase = -90; // comeca no topo (12h)
    const total = 360;
    const sliceAngle = total / n;
    const gap = 1.5;

    return items.map((item, i) => {
      const start = startBase + i * sliceAngle + gap / 2;
      const end = start + sliceAngle - gap;
      const mid = (start + end) / 2;
      const toRad = (a) => (a * Math.PI) / 180;
      const labelR = (R_OUTER + R_INNER) / 2;
      const lx = CX + labelR * Math.cos(toRad(mid));
      const ly = CY + labelR * Math.sin(toRad(mid));

      const corBase = isGeral ? item.cor : data.cor;
      const opacity = STATUS_OPACITY[item.status] || 0.15;

      return {
        ...item,
        d: annularSector(R_OUTER, R_INNER, start, end),
        labelX: lx,
        labelY: ly,
        corBase,
        opacity,
      };
    });
  }, [items, isGeral, data.cor, n]);

  if (!n) {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: 'var(--cbrio-text3)', fontSize: 13 }}>
        Sem KPIs nesta categoria.
      </div>
    );
  }

  // Centro: depende do modo
  const centroLabel = isGeral ? 'CBRio · 5 Valores' : data.label;
  const centroValor = isGeral
    ? `${items.length}`
    : data.tem_dados ? `${data.percentual_geral}%` : '—';
  const centroSub = isGeral
    ? 'valores monitorados'
    : data.tem_dados ? `${data.em_dia} de ${data.total_kpis} em dia` : 'aguardando dados';

  return (
    <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        style={{ width: '100%', maxWidth: 460, height: 'auto', display: 'block' }}
        role="img"
        aria-label={isGeral ? 'Mandala dos 5 valores' : `Mandala focada em ${data.label}`}
      >
        <defs>
          <filter id={`petal-shadow-${modo}`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="3" />
            <feOffset dx="0" dy="2" result="offsetblur" />
            <feComponentTransfer><feFuncA type="linear" slope="0.18" /></feComponentTransfer>
            <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* Petalas */}
        {slices.map((s, i) => (
          <g
            key={s.key || s.id || i}
            style={{ cursor: onPetalClick ? 'pointer' : 'default' }}
            onClick={() => onPetalClick?.(s)}
          >
            <path
              d={s.d}
              fill={s.corBase}
              fillOpacity={s.opacity}
              stroke="white"
              strokeWidth="2"
              filter={`url(#petal-shadow-${modo})`}
            />
            <foreignObject
              x={s.labelX - 50}
              y={s.labelY - 26}
              width="100"
              height="52"
              style={{ pointerEvents: 'none' }}
            >
              <div style={{
                height: '100%', width: '100%',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                color: s.opacity > 0.45 ? 'white' : '#1f2937',
                textAlign: 'center', padding: '0 4px',
              }}>
                <div style={{
                  fontSize: 9.5, fontWeight: 700, lineHeight: 1.15,
                  marginBottom: 1.5,
                  textShadow: s.opacity > 0.45 ? '0 1px 2px rgba(0,0,0,0.18)' : 'none',
                }}>
                  {(s.label || s.nome || '').replace(/\s+/g, ' ').slice(0, 16)}
                </div>
                <div style={{
                  fontSize: 14, fontWeight: 800, lineHeight: 1,
                  fontVariantNumeric: 'tabular-nums',
                  textShadow: s.opacity > 0.45 ? '0 1px 2px rgba(0,0,0,0.2)' : 'none',
                }}>
                  {s.tem_dados ? `${s.percentual}%` : '—'}
                </div>
              </div>
            </foreignObject>
          </g>
        ))}

        {/* Centro */}
        <circle
          cx={CX} cy={CY} r={R_INNER - 4}
          fill="var(--cbrio-card)"
          stroke="var(--cbrio-border)"
          strokeWidth="1.5"
        />
        <foreignObject
          x={CX - R_INNER + 8}
          y={CY - 40}
          width={(R_INNER - 8) * 2}
          height={80}
          style={{ pointerEvents: 'none' }}
        >
          <div style={{
            height: '100%', width: '100%',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', textAlign: 'center',
          }}>
            <div style={{
              fontSize: 8.5, fontWeight: 700, letterSpacing: 0.5,
              color: 'var(--cbrio-text3)', textTransform: 'uppercase',
              marginBottom: 4,
            }}>
              {centroLabel.length > 24 ? centroLabel.slice(0, 22) + '...' : centroLabel}
            </div>
            <div style={{
              fontSize: 24, fontWeight: 800,
              color: isGeral ? 'var(--cbrio-text)' : (data.cor || 'var(--cbrio-text)'),
              lineHeight: 1, fontVariantNumeric: 'tabular-nums',
            }}>
              {centroValor}
            </div>
            <div style={{
              fontSize: 9, color: 'var(--cbrio-text3)',
              marginTop: 4, lineHeight: 1.2,
            }}>
              {centroSub}
            </div>
          </div>
        </foreignObject>
      </svg>
    </div>
  );
}

export { STATUS_LABEL };
