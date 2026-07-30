import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { kpis } from '@/api';
import MandalaSVG from './MandalaSVG';
import PetalDetailDialog from './PetalDetailDialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
  const [decisoesOpen, setDecisoesOpen] = useState(false);

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    kpis.cultura(mes)
      .then((r) => { if (!cancelled) setData(r); })
      .catch((e) => { if (!cancelled) setError(e?.message || 'Não foi possível carregar a Mandala.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [mes, reloadKey]);

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
              className="flex flex-col items-center gap-3 py-12"
            >
              <p className="text-sm text-destructive text-center max-w-sm">
                {error || 'Não foi possível carregar a Mandala.'}
              </p>
              <button
                type="button"
                onClick={() => setReloadKey((k) => k + 1)}
                className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent transition-colors"
              >
                Tentar novamente
              </button>
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
                onCenterClick={() => setDecisoesOpen(true)}
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

      <DecisoesDetalheDialog
        open={decisoesOpen}
        onClose={() => setDecisoesOpen(false)}
        data={data}
      />
    </Card>
  );
}

// Detalhe do card central "Decisões" — o que está sendo contabilizado:
// presencial + online + kids (kids passou a entrar · pedido do Matheus).
function DecisoesDetalheDialog({ open, onClose, data }) {
  const d = data?.decisoes_detalhe || {};
  const linhas = [
    { label: 'Presencial', valor: d.presencial, cor: '#00B39D' },
    { label: 'Online', valor: d.online, cor: '#3b82f6' },
    { label: 'Kids', valor: d.kids, cor: '#ec4899' },
  ];
  const total = data?.decisoes ?? d.soma_ambientes ?? 0;
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Decisões · o que está sendo contado</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Total de decisões no período, somando os três ambientes:
          </p>
          <div className="space-y-1.5">
            {linhas.map((l) => (
              <div key={l.label} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                <span className="flex items-center gap-2 text-sm">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: l.cor }} />
                  {l.label}
                </span>
                <span className="font-bold tabular-nums">{Number(l.valor || 0).toLocaleString('pt-BR')}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between border-t border-border pt-2 mt-1">
            <span className="text-sm font-semibold">Total</span>
            <span className="text-lg font-extrabold tabular-nums text-primary">{Number(total).toLocaleString('pt-BR')}</span>
          </div>
          {d.fonte === 'manual' && (
            <p className="text-[11px] text-amber-600">
              O total foi lançado manualmente (cultura mensal), então pode diferir da soma dos ambientes ({Number(d.soma_ambientes || 0).toLocaleString('pt-BR')}).
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
