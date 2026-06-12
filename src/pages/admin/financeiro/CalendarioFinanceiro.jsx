import { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Loader2, X, ExternalLink, CalendarDays } from 'lucide-react';
import { Card, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { financeiro } from '../../../api';

const fmtMoney = (v) => v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDateShort = (iso) => iso ? new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
const isoDate = (d) => d.toISOString().slice(0, 10);

const TIPO_INFO = {
  conta_pagar:        { cor: '#ef4444', label: 'Conta a pagar', emoji: '🟥' },
  recorrente:         { cor: '#3b82f6', label: 'Recorrente',     emoji: '🟦' },
  receita_realizada:  { cor: '#10b981', label: 'Receita',        emoji: '🟩' },
  despesa_realizada:  { cor: '#9ca3af', label: 'Despesa paga',   emoji: '⬜' },
};

const STATUS_CORES = {
  vencido:   '#ef4444',
  urgente:   '#f59e0b',
  pendente:  '#3b82f6',
  pago:      '#10b981',
  previsto:  '#8b5cf6',
  realizado: '#6b7280',
};

const DOW = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export default function CalendarioFinanceiro() {
  const [mesRef, setMesRef] = useState(() => {
    const d = new Date(); d.setDate(1); return d;
  });
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [diaSelecionado, setDiaSelecionado] = useState(null);

  const inicio = useMemo(() => {
    const d = new Date(mesRef); d.setDate(1); return d;
  }, [mesRef]);
  const fim = useMemo(() => {
    const d = new Date(mesRef); d.setMonth(d.getMonth() + 1); d.setDate(0); return d;
  }, [mesRef]);

  useEffect(() => {
    setLoading(true);
    financeiro.calendario({ inicio: isoDate(inicio), fim: isoDate(fim) })
      .then(r => setEvents(Array.isArray(r) ? r : []))
      .finally(() => setLoading(false));
  }, [inicio.getTime(), fim.getTime()]);

  // Agrupa por dia
  const porDia = useMemo(() => {
    const m = new Map();
    for (const e of events) {
      const k = e.data;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(e);
    }
    return m;
  }, [events]);

  // Gera grid (semanas × dias)
  const grid = useMemo(() => {
    const cells = [];
    const dow1 = inicio.getDay();
    // Espacos vazios antes do dia 1
    for (let i = 0; i < dow1; i++) cells.push(null);
    // Dias do mês
    for (let d = 1; d <= fim.getDate(); d++) {
      const dt = new Date(inicio); dt.setDate(d);
      cells.push(dt);
    }
    return cells;
  }, [inicio.getTime(), fim.getTime()]);

  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);

  // Totais do mês
  const totais = useMemo(() => {
    return events.reduce((acc, e) => {
      const v = Number(e.valor || 0);
      if (e.tipo === 'conta_pagar' || e.tipo === 'recorrente' || e.tipo === 'despesa_realizada') {
        acc.saida += Math.abs(v);
      } else if (e.tipo === 'receita_realizada') {
        acc.entrada += v;
      }
      return acc;
    }, { entrada: 0, saida: 0 });
  }, [events]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            Calendário Financeiro
          </h2>
          <p className="text-xs text-muted-foreground">
            Visualização mensal de contas a pagar, recorrências previstas e transações realizadas
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => {
            const d = new Date(mesRef); d.setMonth(d.getMonth() - 1); setMesRef(d);
          }}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-sm font-semibold tabular-nums w-32 text-center capitalize">
            {mesRef.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
          </div>
          <Button size="sm" variant="ghost" onClick={() => {
            const d = new Date(mesRef); d.setMonth(d.getMonth() + 1); setMesRef(d);
          }}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={() => {
            const d = new Date(); d.setDate(1); setMesRef(d);
          }}>Hoje</Button>
        </div>
      </div>

      {/* Stats do mês */}
      <div className="grid grid-cols-3 gap-2">
        <div className="border border-emerald-500/30 bg-emerald-500/5 rounded-lg p-3">
          <div className="text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Entradas no mês</div>
          <div className="text-xl font-bold tabular-nums">{fmtMoney(totais.entrada)}</div>
        </div>
        <div className="border border-rose-500/30 bg-rose-500/5 rounded-lg p-3">
          <div className="text-[10px] uppercase tracking-wider text-rose-700 dark:text-rose-400">Saídas no mês</div>
          <div className="text-xl font-bold tabular-nums">{fmtMoney(totais.saida)}</div>
        </div>
        <div className="border border-border bg-muted/20 rounded-lg p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Resultado</div>
          <div className={`text-xl font-bold tabular-nums ${totais.entrada - totais.saida >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {fmtMoney(totais.entrada - totais.saida)}
          </div>
        </div>
      </div>

      {/* Legenda */}
      <div className="flex gap-3 text-[11px] flex-wrap text-muted-foreground">
        {Object.entries(TIPO_INFO).map(([k, v]) => (
          <span key={k} className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm" style={{ background: v.cor }} /> {v.label}
          </span>
        ))}
      </div>

      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="py-12 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
          ) : (
            <>
              {/* Header dias da semana */}
              <div className="grid grid-cols-7 gap-1 mb-1">
                {DOW.map(d => (
                  <div key={d} className="text-[10px] uppercase text-center font-semibold text-muted-foreground py-1">{d}</div>
                ))}
              </div>
              {/* Grid */}
              <div className="grid grid-cols-7 gap-1">
                {grid.map((dt, i) => {
                  if (!dt) return <div key={i} />;
                  const dayKey = isoDate(dt);
                  const evs = porDia.get(dayKey) || [];
                  const isHoje = dt.toDateString() === hoje.toDateString();
                  const totDia = evs.reduce((s, e) => s + Number(e.valor || 0), 0);
                  return (
                    <motion.button
                      key={i}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.005 }}
                      onClick={() => evs.length > 0 && setDiaSelecionado(dayKey)}
                      className={`relative min-h-[88px] p-1.5 border rounded text-left transition-colors ${
                        isHoje ? 'border-primary border-2 bg-primary/5' : 'border-border hover:bg-muted/30'
                      } ${evs.length > 0 ? 'cursor-pointer' : 'cursor-default'}`}
                    >
                      <div className={`text-xs font-semibold ${isHoje ? 'text-primary' : ''}`}>{dt.getDate()}</div>
                      <div className="space-y-0.5 mt-1">
                        {evs.slice(0, 3).map(e => {
                          const ti = TIPO_INFO[e.tipo];
                          const sc = STATUS_CORES[e.status_visual] || ti?.cor || '#6b7280';
                          return (
                            <div key={e.id} className="text-[9px] truncate px-1 rounded" style={{
                              background: sc + '20', color: sc, fontWeight: 600,
                            }}>
                              {fmtMoney(Math.abs(Number(e.valor)))} · {e.titulo}
                            </div>
                          );
                        })}
                        {evs.length > 3 && (
                          <div className="text-[9px] text-muted-foreground">+{evs.length - 3} mais</div>
                        )}
                      </div>
                      {totDia !== 0 && evs.length > 3 && (
                        <div className={`absolute bottom-1 right-1 text-[9px] font-bold tabular-nums ${totDia >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {totDia >= 0 ? '+' : ''}{fmtMoney(totDia).replace('R$', '')}
                        </div>
                      )}
                    </motion.button>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {diaSelecionado && (
        <DiaDialog
          data={diaSelecionado}
          events={porDia.get(diaSelecionado) || []}
          onClose={() => setDiaSelecionado(null)}
        />
      )}
    </div>
  );
}

function DiaDialog({ data, events, onClose }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        className="bg-card rounded-lg shadow-xl max-w-lg w-full p-5 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold">{fmtDateShort(data)} · {events.length} evento{events.length === 1 ? '' : 's'}</h3>
          <button onClick={onClose}><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-2">
          {events.map(e => {
            const ti = TIPO_INFO[e.tipo];
            const sc = STATUS_CORES[e.status_visual] || ti?.cor || '#6b7280';
            return (
              <div key={e.id} className="border border-border rounded-lg p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <Badge style={{ background: ti?.cor + '20', color: ti?.cor }} className="text-[10px]">
                        {ti?.label}
                      </Badge>
                      {e.status_visual !== 'realizado' && e.status_visual !== 'previsto' && (
                        <Badge style={{ background: sc + '20', color: sc }} className="text-[10px] uppercase">
                          {e.status_visual}
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm font-semibold">{e.titulo}</div>
                    {e.subtitulo && <div className="text-xs text-muted-foreground">{e.subtitulo}</div>}
                  </div>
                  <div className={`text-base font-bold tabular-nums shrink-0 ${Number(e.valor) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {Number(e.valor) >= 0 ? '+' : ''}{fmtMoney(Math.abs(Number(e.valor)))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </motion.div>
    </motion.div>
  );
}
