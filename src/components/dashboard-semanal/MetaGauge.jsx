import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { useEffect } from 'react';
import { cn } from '@/lib/utils';

/**
 * Gauge semicircular com ponteiro animado · estilo "GoalGauge".
 * - Arco base cinza com gradiente vertical sutil
 * - Arco preenchido com cor que transiciona de vermelho → amarelo → teal
 * - Ponteiro circular branco + linha colorida saindo da ponta
 * - Glow filter no arco preenchido · drop-shadow no ponteiro
 * - Animação inicial (0 → percentual) de duracao `duration`
 *
 * Props:
 *   atual    · valor atual
 *   meta     · valor da meta
 *   size     · tamanho em px (default 240)
 *   label    · texto sob o número (default "Meta")
 *   duration · duração da animação em segundos (default 1.6)
 *   anim     · key opcional · mudar pra forçar re-animar
 */
export default function MetaGauge({
  atual = 0,
  meta = 1,
  size = 240,
  className,
  label = 'Meta',
  duration = 1.6,
  anim,
  showLabels = true,
}) {
  const value = Math.max(0, Number(atual) || 0);
  const goal = Math.max(1, Number(meta) || 1);

  const strokeWidth = Math.max(14, size * 0.06);
  const radius = size * 0.35;
  const center = size / 2;
  const circumference = Math.PI * radius;

  const percentage = Math.min((value / goal) * 100, 100);

  const animatedValue = useMotionValue(0);
  const offset = useTransform(animatedValue, [0, 100], [circumference, 0]);
  const progressAngle = useTransform(animatedValue, [0, 100], [-Math.PI, 0]);
  const innerRadius = radius - strokeWidth / 2;
  const pointerLength = strokeWidth * 1.8;

  const gaugeColor = useTransform(animatedValue, [0, 50, 100], [
    '#ef4444', // vermelho
    '#eab308', // amarelo
    '#14b8a6', // teal
  ]);

  const ponteiroX = useTransform(progressAngle, (angle) => center + Math.cos(angle) * innerRadius);
  const ponteiroY = useTransform(progressAngle, (angle) => center + Math.sin(angle) * innerRadius);
  const linhaX2 = useTransform(progressAngle, (angle) => -Math.cos(angle) * pointerLength);
  const linhaY2 = useTransform(progressAngle, (angle) => -Math.sin(angle) * pointerLength);
  const valorDisplay = useTransform(animatedValue, (latest) => Math.round((latest / 100) * goal));

  useEffect(() => {
    animatedValue.set(0);
    const controls = animate(animatedValue, percentage, { duration, ease: 'easeOut' });
    return controls.stop;
    // anim na deps re-anima quando muda
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [percentage, duration, anim]);

  const fontSize = Math.max(20, size * 0.11);
  const labelFontSize = Math.max(11, size * 0.04);
  const unitFontSize = Math.max(13, size * 0.05);

  // ids únicos por instância pra defs SVG não colidirem
  const gid = `gauge-${size}-${Math.round(goal)}`;

  return (
    <div className={cn('relative mx-auto', className)} style={{ width: size, height: size * 0.7 }}>
      <svg width={size} height={size * 0.7} viewBox={`0 0 ${size} ${size * 0.7}`} className="overflow-visible">
        <defs>
          <linearGradient id={`base-${gid}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#e5e7eb" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#9ca3af" stopOpacity="0.3" />
          </linearGradient>
          <filter id={`glow-${gid}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id={`shadow-${gid}`} x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="#000000" floodOpacity="0.18" />
          </filter>
        </defs>

        {/* Arco base */}
        <path
          d={`M ${center - radius} ${center} A ${radius} ${radius} 0 0 1 ${center + radius} ${center}`}
          fill="none"
          stroke={`url(#base-${gid})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          opacity={0.5}
        />

        {/* Arco preenchido animado */}
        <motion.path
          d={`M ${center - radius} ${center} A ${radius} ${radius} 0 0 1 ${center + radius} ${center}`}
          fill="none"
          stroke={gaugeColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          filter={`url(#glow-${gid})`}
        />

        {/* Ponteiro: círculo branco + linha colorida */}
        <motion.g style={{ x: ponteiroX, y: ponteiroY }}>
          <motion.circle r={strokeWidth * 0.4} fill="white" filter={`url(#shadow-${gid})`} />
          <motion.line
            x1={0}
            y1={0}
            x2={linhaX2}
            y2={linhaY2}
            stroke={gaugeColor}
            strokeWidth={strokeWidth * 0.18}
            strokeLinecap="round"
            filter={`url(#shadow-${gid})`}
          />
        </motion.g>
      </svg>

      {/* Numero central */}
      <div
        className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
        style={{ marginTop: size * 0.15 }}
      >
        <motion.div
          className="font-bold tracking-tight text-foreground"
          style={{ fontSize: `${fontSize}px` }}
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: duration * 0.7 }}
        >
          <motion.span className="tabular-nums">{valorDisplay}</motion.span>
          <span className="text-muted-foreground" style={{ fontSize: `${unitFontSize}px` }}>
            /{goal.toLocaleString('pt-BR')}
          </span>
        </motion.div>
        <motion.div
          className="text-muted-foreground font-medium mt-1"
          style={{ fontSize: `${labelFontSize}px` }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: duration * 0.8 }}
        >
          {label}
        </motion.div>
      </div>

      {/* Labels 0 e meta */}
      {showLabels && (
        <>
          <motion.div
            className="absolute text-muted-foreground font-medium"
            style={{
              fontSize: `${labelFontSize}px`,
              left: center - radius - 8,
              top: center + strokeWidth / 2 + 4,
            }}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: duration * 0.25 }}
          >
            0
          </motion.div>
          <motion.div
            className="absolute text-muted-foreground font-medium tabular-nums"
            style={{
              fontSize: `${labelFontSize}px`,
              right: center - radius - 8,
              top: center + strokeWidth / 2 + 4,
            }}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: duration * 0.25 }}
          >
            {goal.toLocaleString('pt-BR')}
          </motion.div>
        </>
      )}
    </div>
  );
}
