import { motion } from 'framer-motion';

export default function OcupacaoGauge({ taxa }) {
  const valor = Math.max(0, Math.min(200, Number(taxa) || 0));
  const pct = Math.min(100, valor);
  const cor = valor >= 100 ? '#ef4444' : valor >= 70 ? '#10b981' : '#3b82f6';

  // arco semicircular SVG · 180 graus
  const r = 56;
  const cx = 70, cy = 70;
  const startAngle = 180;
  const endAngle = 360;
  const arc = (a) => {
    const rad = (a * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  };
  const start = arc(startAngle);
  const end = arc(endAngle);
  const bgPath = `M ${start.x} ${start.y} A ${r} ${r} 0 0 1 ${end.x} ${end.y}`;
  const targetAngle = startAngle + (pct / 100) * (endAngle - startAngle);

  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
        Taxa de ocupação
      </p>
      <div className="flex flex-col items-center">
        <svg width="140" height="90" viewBox="0 0 140 90">
          <path d={bgPath} stroke="#e5e7eb" strokeWidth={12} fill="none" strokeLinecap="round" />
          <motion.path
            d={bgPath}
            stroke={cor}
            strokeWidth={12}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={Math.PI * r}
            initial={{ strokeDashoffset: Math.PI * r }}
            animate={{
              strokeDashoffset: Math.PI * r - (Math.PI * r * pct) / 100,
            }}
            transition={{ duration: 1.1, ease: 'easeOut' }}
          />
        </svg>
        <div className="text-center -mt-3">
          <motion.div
            className="text-2xl font-bold"
            style={{ color: cor }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
          >
            {valor}%
          </motion.div>
          <div className="text-[10px] text-muted-foreground">
            de 1.200 lugares
          </div>
        </div>
      </div>
      <div className="flex justify-between mt-2 text-[10px] text-muted-foreground">
        <span>0%</span>
        <span>100%</span>
      </div>
    </div>
  );
}
