import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function KpiCard({ titulo, valor, loading, icon: Icon, cor = '#00B39D', sufixo, subtitulo, destaque }) {
  return (
    <div
      className={`rounded-xl border bg-card p-5 relative overflow-hidden transition-shadow hover:shadow-md ${
        destaque ? 'ring-1 ring-offset-1' : ''
      }`}
      style={destaque ? { borderColor: cor } : undefined}
    >
      <div
        className="absolute top-0 left-0 right-0 h-1"
        style={{ background: cor }}
      />
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            {titulo}
          </p>
          <div className="mt-1.5 flex items-baseline gap-1">
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : (
              <AnimatedNumber value={valor || 0} cor={cor} />
            )}
            {!loading && sufixo && (
              <span className="text-2xl font-bold" style={{ color: cor }}>
                {sufixo}
              </span>
            )}
          </div>
          {subtitulo && (
            <p className="text-[11px] text-muted-foreground mt-1.5">{subtitulo}</p>
          )}
        </div>
        {Icon && (
          <div className="rounded-lg p-2" style={{ background: `${cor}1a` }}>
            <Icon className="h-5 w-5" style={{ color: cor }} />
          </div>
        )}
      </div>
    </div>
  );
}

function AnimatedNumber({ value, cor }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    let raf;
    const start = display;
    const end = value;
    const duration = 700;
    const startTs = performance.now();
    const step = (ts) => {
      const t = Math.min(1, (ts - startTs) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out-cubic
      setDisplay(Math.round(start + (end - start) * eased));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <motion.span
      className="text-3xl font-bold tabular-nums"
      style={{ color: cor }}
    >
      {display.toLocaleString('pt-BR')}
    </motion.span>
  );
}
