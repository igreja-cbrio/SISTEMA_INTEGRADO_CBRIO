import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { kpis } from '@/api';
import MandalaSVG from './MandalaSVG';
import PetalDetailDialog from './PetalDetailDialog';
import { Sparkles } from 'lucide-react';

const MONTH_LABELS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function buildLast12Months() {
  const out = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    out.push({ value, label: `${MONTH_LABELS[d.getMonth()]} ${d.getFullYear()}` });
  }
  return out;
}

export default function MandalaCultura() {
  const months = useMemo(buildLast12Months, []);
  const [mes, setMes] = useState(months[0].value);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openPetal, setOpenPetal] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    kpis.cultura(mes)
      .then((r) => { if (!cancelled) setData(r); })
      .catch((e) => { if (!cancelled) setError(e.message || 'Erro ao carregar'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [mes]);

  return (
    <Card className="p-5 md:p-6 overflow-hidden">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-2">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold text-foreground">Cultura CBRio</h2>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Os 5 valores em tempo real — clique em uma pétala para detalhar.
          </p>
        </div>
        <div className="w-full md:w-56">
          <Select value={mes} onValueChange={setMes}>
            <SelectTrigger>
              <SelectValue placeholder="Mês" />
            </SelectTrigger>
            <SelectContent className="z-[1001]">
              {months.map((m) => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="relative min-h-[320px] flex items-center justify-center">
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div
              key="skeleton"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="w-full max-w-[860px] mx-auto py-6"
            >
              <Skeleton className="w-full h-[360px] rounded-t-full" />
            </motion.div>
          ) : error ? (
            <motion.div
              key="error"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="text-sm text-destructive py-12"
            >
              {error}
            </motion.div>
          ) : (
            <motion.div
              key={mes}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.35 }}
              className="w-full"
            >
              <MandalaSVG
                data={data}
                loading={false}
                onPetalClick={(k) => setOpenPetal(k)}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <PetalDetailDialog
        open={!!openPetal}
        petalKey={openPetal}
        onClose={() => setOpenPetal(null)}
        data={data}
      />
    </Card>
  );
}
