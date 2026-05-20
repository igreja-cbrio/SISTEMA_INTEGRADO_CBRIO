import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

/**
 * Gauge semicircular com ponteiro animado.
 * - Arco de fundo cinza (0 → 100%)
 * - Arco preenchido colorido conforme % atingido
 * - Ponteiro (needle) que gira do canto esquerdo até o ângulo correspondente
 *
 * Props:
 *   atual · valor atual
 *   meta · valor da meta
 *   anim · key pra forçar re-animação (mudar pra animar de novo)
 */
export default function MetaGauge({ atual, meta, anim }) {
  const valor = Math.max(0, Number(atual) || 0);
  const metaNum = Math.max(1, Number(meta) || 1);
  const pct = Math.min(150, (valor / metaNum) * 100);
  const pctClamp = Math.min(100, pct);
  const cor = pct >= 100 ? '#10b981' : pct >= 70 ? '#f59e0b' : '#ef4444';

  // Geometria
  const W = 220, H = 130;
  const cx = W / 2, cy = H - 16;
  const r = 88;
  const startAngle = 180; // esquerda
  const endAngle = 360;   // direita
  const sweep = endAngle - startAngle;

  const arc = (a) => {
    const rad = (a * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  };
  const start = arc(startAngle);
  const end = arc(endAngle);
  const pathBg = `M ${start.x} ${start.y} A ${r} ${r} 0 0 1 ${end.x} ${end.y}`;

  // Comprimento do arco preenchido em % do total
  const arcoTotal = Math.PI * r; // ~276
  const arcoPreenchido = arcoTotal * (pctClamp / 100);

  // Ângulo do ponteiro (0% = 180°, 100% = 360°)
  const ponteiroAngulo = startAngle + (pctClamp / 100) * sweep;
  const ponteiroFim = arc(ponteiroAngulo);
  const ponteiroBase = { x: cx, y: cy };

  // Animação do ponteiro: começa em 180° (esquerda)
  const [animKey, setAnimKey] = useState(0);
  useEffect(() => { setAnimKey(k => k + 1); }, [anim, atual, meta]);

  return (
    <div className="flex flex-col items-center">
      <svg width={W} height={H + 24} viewBox={`0 0 ${W} ${H + 24}`}>
        <defs>
          <linearGradient id={`grad-${animKey}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ef4444" />
            <stop offset="50%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#10b981" />
          </linearGradient>
        </defs>

        {/* Arco de fundo */}
        <path
          d={pathBg}
          stroke="#e5e7eb"
          strokeWidth={14}
          fill="none"
          strokeLinecap="round"
        />

        {/* Arco preenchido animado */}
        <motion.path
          key={`fill-${animKey}`}
          d={pathBg}
          stroke={cor}
          strokeWidth={14}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={arcoTotal}
          initial={{ strokeDashoffset: arcoTotal }}
          animate={{ strokeDashoffset: arcoTotal - arcoPreenchido }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
        />

        {/* Marcadores de tick (0%, 50%, 100%) */}
        {[0, 25, 50, 75, 100].map(p => {
          const a = startAngle + (p / 100) * sweep;
          const inner = arc(a);
          const rad = (a * Math.PI) / 180;
          const outer = { x: cx + (r + 10) * Math.cos(rad), y: cy + (r + 10) * Math.sin(rad) };
          return (
            <line
              key={p}
              x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y}
              stroke="#9ca3af" strokeWidth={1.5}
            />
          );
        })}

        {/* Labels 0% / 50% / 100% */}
        <text x={cx - r - 6} y={cy + 4} fontSize={10} fill="#9ca3af" textAnchor="end">0%</text>
        <text x={cx} y={cy - r - 8} fontSize={10} fill="#9ca3af" textAnchor="middle">50%</text>
        <text x={cx + r + 6} y={cy + 4} fontSize={10} fill="#9ca3af" textAnchor="start">100%</text>

        {/* Ponteiro animado */}
        <motion.line
          key={`needle-${animKey}`}
          x1={cx} y1={cy}
          x2={arc(startAngle).x} y2={arc(startAngle).y}
          stroke="#1f2937"
          strokeWidth={3}
          strokeLinecap="round"
          initial={false}
          animate={{ x2: ponteiroFim.x, y2: ponteiroFim.y }}
          transition={{ duration: 1.2, ease: 'easeOut', type: 'spring', damping: 12, stiffness: 80 }}
        />

        {/* Base do ponteiro */}
        <circle cx={cx} cy={cy} r={7} fill="#1f2937" />
        <circle cx={cx} cy={cy} r={3} fill="#fff" />

        {/* Valor central */}
        <motion.text
          key={`val-${animKey}`}
          x={cx} y={cy + 20}
          fontSize={20} fontWeight={700}
          textAnchor="middle"
          fill={cor}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.4 }}
        >
          {Math.round(pct)}%
        </motion.text>
      </svg>
    </div>
  );
}
