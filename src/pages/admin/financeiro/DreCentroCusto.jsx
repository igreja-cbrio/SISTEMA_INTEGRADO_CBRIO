import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Loader2, RefreshCw, TrendingUp, TrendingDown, Building2, X,
  ArrowUp, ArrowDown, Minus,
} from 'lucide-react';
import { Card, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { financeiro } from '../../../api';

const fmtMoney = (v) => v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtMoneyShort = (v) => {
  const n = Number(v || 0);
  if (Math.abs(n) >= 1_000_000) return `R$ ${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `R$ ${(n / 1_000).toFixed(0)}k`;
  return `R$ ${n.toFixed(0)}`;
};
const fmtMes = (iso) => iso ? new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }) : '';

export default function DreCentroCusto() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selecionado, setSelecionado] = useState(null);
  const [filtroCampus, setFiltroCampus] = useState('');

  const reload = () => {
    setLoading(true);
    financeiro.dreCentroAtual()
      .then(r => setItems(Array.isArray(r) ? r : []))
      .finally(() => setLoading(false));
  };
  useEffect(() => { reload(); }, []);

  const campusUnicos = [...new Set(items.map(i => i.campus).filter(Boolean))];
  const filtrados = filtroCampus ? items.filter(i => i.campus === filtroCampus) : items;

  const totalReceita = filtrados.reduce((s, i) => s + Number(i.receita || 0), 0);
  const totalDespesa = filtrados.reduce((s, i) => s + Number(i.despesa || 0), 0);
  const maxMov = Math.max(...filtrados.map(i => i.total_movimentado), 1);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            DRE por Centro de Custo
          </h2>
          <p className="text-xs text-muted-foreground">
            Quanto cada área da igreja movimentou no mês · comparação com mês anterior
          </p>
        </div>
        <div className="flex items-center gap-2">
          {campusUnicos.length > 1 && (
            <select
              value={filtroCampus}
              onChange={(e) => setFiltroCampus(e.target.value)}
              className="px-3 py-1.5 text-xs rounded-md border border-border bg-background"
            >
              <option value="">Todos os campus</option>
              {campusUnicos.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          <Button size="sm" variant="ghost" onClick={reload} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </Button>
        </div>
      </div>

      {/* Stats consolidado */}
      <div className="grid grid-cols-3 gap-3">
        <div className="border border-emerald-500/30 bg-emerald-500/5 rounded-lg p-3">
          <div className="text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
            <TrendingUp className="h-3 w-3" /> Receita consolidada
          </div>
          <div className="text-xl font-bold tabular-nums mt-1">{fmtMoney(totalReceita)}</div>
        </div>
        <div className="border border-rose-500/30 bg-rose-500/5 rounded-lg p-3">
          <div className="text-[10px] uppercase tracking-wider text-rose-700 dark:text-rose-400 flex items-center gap-1">
            <TrendingDown className="h-3 w-3" /> Despesa consolidada
          </div>
          <div className="text-xl font-bold tabular-nums mt-1">{fmtMoney(totalDespesa)}</div>
        </div>
        <div className={`border rounded-lg p-3 ${totalReceita - totalDespesa >= 0 ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-rose-500/30 bg-rose-500/5'}`}>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Resultado</div>
          <div className={`text-xl font-bold tabular-nums mt-1 ${totalReceita - totalDespesa >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {fmtMoney(totalReceita - totalDespesa)}
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <h3 className="text-sm font-semibold mb-3">
            Centros · ordenados por movimento
            {items.length > 0 && <span className="text-muted-foreground font-normal ml-2">({filtrados.length})</span>}
          </h3>

          {loading ? (
            <div className="py-12 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
          ) : filtrados.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              <Building2 className="h-10 w-10 mx-auto mb-2 opacity-40" />
              Nenhum centro com movimento no mês atual
            </div>
          ) : (
            <div className="space-y-2">
              {filtrados.map((c, i) => {
                const widthPct = (c.total_movimentado / maxMov) * 100;
                const variacao = c.resultado_anterior !== 0
                  ? ((c.resultado - c.resultado_anterior) / Math.abs(c.resultado_anterior)) * 100
                  : null;
                return (
                  <motion.div
                    key={c.centro_custo_id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: Math.min(i * 0.02, 0.3) }}
                    onClick={() => setSelecionado(c)}
                    className="border border-border rounded-lg p-3 hover:bg-muted/30 cursor-pointer"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Badge variant="outline" className="text-[10px] font-mono shrink-0">{c.codigo}</Badge>
                        <div className="text-sm font-medium truncate">{c.centro_nome}</div>
                        {c.campus && <Badge variant="outline" className="text-[10px] shrink-0">{c.campus}</Badge>}
                      </div>
                      <div className={`text-sm font-bold tabular-nums ${c.resultado >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {fmtMoney(c.resultado)}
                      </div>
                    </div>

                    {/* Barras receita/despesa */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="text-[10px] flex justify-between text-muted-foreground mb-0.5">
                          <span>Receita</span><span className="tabular-nums">{fmtMoneyShort(c.receita)}</span>
                        </div>
                        <div className="h-1.5 bg-muted/30 rounded overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded" style={{ width: `${(c.receita / maxMov) * 100}%` }} />
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] flex justify-between text-muted-foreground mb-0.5">
                          <span>Despesa</span><span className="tabular-nums">{fmtMoneyShort(c.despesa)}</span>
                        </div>
                        <div className="h-1.5 bg-muted/30 rounded overflow-hidden">
                          <div className="h-full bg-rose-500 rounded" style={{ width: `${(c.despesa / maxMov) * 100}%` }} />
                        </div>
                      </div>
                    </div>

                    {/* Comparacao com mês anterior */}
                    {variacao !== null && Math.abs(variacao) > 5 && (
                      <div className="text-[10px] mt-1.5 text-muted-foreground flex items-center gap-1">
                        {variacao >= 0
                          ? <ArrowUp className="h-2.5 w-2.5 text-emerald-500" />
                          : <ArrowDown className="h-2.5 w-2.5 text-rose-500" />}
                        {Math.abs(variacao).toFixed(0)}% {variacao >= 0 ? 'acima' : 'abaixo'} do mês anterior
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <AnimatePresence>
        {selecionado && <CentroDetalheDialog centro={selecionado} onClose={() => setSelecionado(null)} />}
      </AnimatePresence>
    </div>
  );
}

function CentroDetalheDialog({ centro, onClose }) {
  const [historico, setHistorico] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    financeiro.dreCentroHistorico(centro.centro_custo_id)
      .then(r => setHistorico(Array.isArray(r) ? r : []))
      .finally(() => setLoading(false));
  }, [centro.centro_custo_id]);

  const maxV = Math.max(...historico.flatMap(m => [m.receita, m.despesa]), 1);

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}
        className="bg-card rounded-lg shadow-xl max-w-2xl w-full p-5 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className="text-[10px] font-mono">{centro.codigo}</Badge>
              {centro.campus && <Badge variant="outline" className="text-[10px]">{centro.campus}</Badge>}
            </div>
            <h3 className="text-base font-bold">{centro.centro_nome}</h3>
          </div>
          <button onClick={onClose}><X className="h-5 w-5" /></button>
        </div>

        {/* Stats do mês atual */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="text-center bg-emerald-500/10 border border-emerald-500/30 rounded p-2">
            <div className="text-[9px] uppercase text-emerald-700 dark:text-emerald-400">Receita</div>
            <div className="text-sm font-bold tabular-nums">{fmtMoney(centro.receita)}</div>
          </div>
          <div className="text-center bg-rose-500/10 border border-rose-500/30 rounded p-2">
            <div className="text-[9px] uppercase text-rose-700 dark:text-rose-400">Despesa</div>
            <div className="text-sm font-bold tabular-nums">{fmtMoney(centro.despesa)}</div>
          </div>
          <div className="text-center border border-border bg-muted/20 rounded p-2">
            <div className="text-[9px] uppercase text-muted-foreground">Resultado</div>
            <div className={`text-sm font-bold tabular-nums ${centro.resultado >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {fmtMoney(centro.resultado)}
            </div>
          </div>
        </div>

        {/* Histórico 12 meses */}
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Histórico · últimos 12 meses
        </h4>
        {loading ? (
          <div className="py-6 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></div>
        ) : historico.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground">Sem histórico</div>
        ) : (
          <div className="space-y-1.5">
            {historico.map(m => (
              <div key={m.mes} className="flex items-center gap-2">
                <div className="text-[10px] uppercase text-muted-foreground w-14 tabular-nums shrink-0">{fmtMes(m.mes)}</div>
                <div className="flex-1 grid grid-cols-2 gap-1">
                  <div className="relative h-4 bg-muted/30 rounded overflow-hidden">
                    <div className="absolute right-0 top-0 h-full bg-emerald-500" style={{ width: `${(m.receita / maxV) * 100}%` }} />
                    {m.receita > 0 && (
                      <div className="absolute right-1 top-0 h-full flex items-center text-[9px] font-semibold text-white">
                        {fmtMoneyShort(m.receita)}
                      </div>
                    )}
                  </div>
                  <div className="relative h-4 bg-muted/30 rounded overflow-hidden">
                    <div className="absolute left-0 top-0 h-full bg-rose-500" style={{ width: `${(m.despesa / maxV) * 100}%` }} />
                    {m.despesa > 0 && (
                      <div className="absolute left-1 top-0 h-full flex items-center text-[9px] font-semibold text-white">
                        {fmtMoneyShort(m.despesa)}
                      </div>
                    )}
                  </div>
                </div>
                <div className={`text-xs font-semibold tabular-nums w-20 text-right ${m.resultado >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {fmtMoney(m.resultado)}
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
