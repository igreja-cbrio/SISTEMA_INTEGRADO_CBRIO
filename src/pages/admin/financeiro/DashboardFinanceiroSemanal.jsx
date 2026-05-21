import { useEffect, useState, useRef, useMemo } from 'react';
import { motion, AnimatePresence, useSpring, useTransform, animate } from 'framer-motion';
import {
  ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Users, Banknote,
  Sparkles, ArrowUp, ArrowDown, Minus, Award, Calendar,
} from 'lucide-react';
import { Card, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { financeiroV2 } from '../../../api';
import {
  ComposedChart, Line, Bar, Area, AreaChart, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

const C = {
  primary: '#00B39D',
  primarySoft: 'rgba(0,179,157,0.12)',
  green: '#10b981',
  red: '#ef4444',
  amber: '#f59e0b',
  blue: '#3b82f6',
  purple: '#8b5cf6',
  pink: '#ec4899',
};

const fmtMoney = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtCompact = (v) => {
  const n = Math.abs(Number(v || 0));
  if (n >= 1_000_000) return `R$ ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `R$ ${(n / 1000).toFixed(0)}k`;
  return fmtMoney(v);
};
const fmtPct = (v) => v === null || v === undefined ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
const fmtInt = (v) => Number(v || 0).toLocaleString('pt-BR');

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

// ============================================================
// COUNT-UP animado
// ============================================================
function CountUp({ value, format = fmtMoney, duration = 1.2 }) {
  const [display, setDisplay] = useState(value);
  const previous = useRef(value);
  useEffect(() => {
    const controls = animate(previous.current, value, {
      duration,
      ease: 'easeOut',
      onUpdate: (v) => setDisplay(v),
    });
    previous.current = value;
    return () => controls.stop();
  }, [value, duration]);
  return <>{format(display)}</>;
}

// ============================================================
// MAIN
// ============================================================
export default function DashboardSemanal() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refData, setRefData] = useState(new Date().toISOString().slice(0, 10));

  useEffect(() => {
    setLoading(true);
    financeiroV2.dashboard.semanaCompleta?.(refData)
      ?.then(setData)
      ?.finally(() => setLoading(false));
  }, [refData]);

  const navegar = (delta) => {
    const d = new Date(refData);
    d.setDate(d.getDate() + delta * 7);
    setRefData(d.toISOString().slice(0, 10));
  };

  if (loading || !data) return <LoadingPretty />;
  if (data.erro) return <div className="text-sm text-muted-foreground">Erro: {data.erro}</div>;

  const { semana, kpis, cultos, buckets, historico, top_contribuintes } = data;

  return (
    <motion.div
      className="space-y-6"
      initial="hidden"
      animate="visible"
      variants={{ visible: { transition: { staggerChildren: 0.08 } } }}
    >
      {/* HEADER · navegação semana */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <Card className="overflow-hidden border-primary/30">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-primary/5 pointer-events-none" />
          <CardContent className="pt-5 pb-5 flex items-center justify-between flex-wrap gap-3 relative">
            <Button variant="outline" size="sm" onClick={() => navegar(-1)}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Semana anterior
            </Button>
            <div className="text-center">
              <div className="text-xs text-muted-foreground uppercase tracking-wider">Semana qua-ter</div>
              <div className="text-xl font-bold text-foreground capitalize">{semana.label}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {semana.inicio} a {semana.fim}
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => navegar(1)}>
              Próxima semana <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </CardContent>
        </Card>
      </motion.div>

      {/* 4 KPIs principais com count-up + comparativos */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiBig
          custom={0}
          icon={Banknote}
          accent={C.green}
          label="Receita da semana"
          valor={kpis.receita}
          delta={kpis.receita_delta_wow}
          sub="vs semana anterior"
          yoy={kpis.receita_yoy ? `YoY: ${fmtCompact(kpis.receita_yoy)} (${fmtPct(kpis.receita_delta_yoy)})` : null}
        />
        <KpiBig
          custom={1}
          icon={Users}
          accent={C.blue}
          label="Presença total"
          valor={kpis.presencial + kpis.online}
          format={fmtInt}
          delta={kpis.presencial_delta_wow}
          sub={`${fmtInt(kpis.presencial)} presencial · ${fmtInt(kpis.online)} online`}
        />
        <KpiBig
          custom={2}
          icon={Sparkles}
          accent={C.purple}
          label="Ticket médio"
          valor={kpis.ticket_medio}
          delta={kpis.ticket_delta_wow}
          sub="R$ por presente"
        />
        <KpiBig
          custom={3}
          icon={Award}
          accent={C.amber}
          label="Cultos"
          valor={cultos.filter(c => c.receita_total > 0 || c.total_presencial > 0).length}
          format={fmtInt}
          sub={`${cultos.length} cadastrados na semana`}
        />
      </div>

      {/* 4 Buckets estilo Power BI · Quarta · Final de Semana · Outros · Acumulada */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BucketCard custom={0} bucket={buckets.quarta} color={C.blue} />
        <BucketCard custom={1} bucket={buckets.domingo} color={C.primary} />
        <BucketCard custom={2} bucket={buckets.outros} color={C.amber} />
        <BucketCard custom={3} bucket={buckets.acumulada} color={C.purple} isAcumulado />
      </div>

      {/* Tabela de cultos × frequência */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.5 }}
      >
        <Card>
          <CardContent className="pt-6">
            <h3 className="text-base font-semibold mb-1">Cultos da semana</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Receita classificada × frequência presencial + online · ticket médio por presente
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-3 text-xs uppercase text-muted-foreground font-medium">Culto</th>
                    <th className="text-left py-2 px-3 text-xs uppercase text-muted-foreground font-medium">Data</th>
                    <th className="text-right py-2 px-3 text-xs uppercase text-muted-foreground font-medium">Presencial</th>
                    <th className="text-right py-2 px-3 text-xs uppercase text-muted-foreground font-medium">Online</th>
                    <th className="text-right py-2 px-3 text-xs uppercase text-muted-foreground font-medium">Receita</th>
                    <th className="text-right py-2 px-3 text-xs uppercase text-muted-foreground font-medium">Ticket</th>
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence>
                    {cultos.map((c, i) => (
                      <motion.tr
                        key={c.culto_id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.5 + i * 0.04 }}
                        className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                      >
                        <td className="py-2.5 px-3 font-medium">{c.culto_nome}</td>
                        <td className="py-2.5 px-3 text-xs text-muted-foreground">
                          {DIAS[c.dia_semana]} · {c.culto_data?.slice(8, 10)}/{c.culto_data?.slice(5, 7)}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums">
                          {c.total_presencial > 0 ? (
                            <>
                              <strong>{fmtInt(c.total_presencial)}</strong>
                              {c.presencial_kids > 0 && (
                                <span className="text-[10px] text-muted-foreground ml-1">
                                  ({fmtInt(c.presencial_kids)} kids)
                                </span>
                              )}
                            </>
                          ) : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums text-muted-foreground">
                          {c.online_pico > 0 ? fmtInt(c.online_pico) : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums font-semibold" style={{ color: C.green }}>
                          {c.receita_total > 0 ? fmtMoney(c.receita_total) : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums">
                          {c.ticket > 0 ? (
                            <span style={{ color: C.purple }}>{fmtMoney(c.ticket)}</span>
                          ) : '—'}
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Tendência 12 semanas · receita × frequência × ticket */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.5 }}
      >
        <Card>
          <CardContent className="pt-6">
            <h3 className="text-base font-semibold mb-1">Tendência das últimas 12 semanas</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Receita (barras verdes) · presença (linha azul) · ticket médio (linha roxa pontilhada)
            </p>
            <div style={{ width: '100%', height: 320 }}>
              <ResponsiveContainer>
                <ComposedChart data={historico}>
                  <defs>
                    <linearGradient id="gradReceita" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.green} stopOpacity={0.9} />
                      <stop offset="100%" stopColor={C.green} stopOpacity={0.4} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="semana_label" tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 10 }} tickFormatter={(v) => fmtCompact(v).replace('R$ ', '')} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} />
                  <Tooltip
                    formatter={(v, n) => {
                      if (n === 'Presença') return [fmtInt(v), n];
                      return [fmtMoney(v), n];
                    }}
                    contentStyle={{ borderRadius: 8, fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar yAxisId="left" dataKey="receita" name="Receita" fill="url(#gradReceita)" radius={[4, 4, 0, 0]} />
                  <Line yAxisId="right" type="monotone" dataKey="presencial" name="Presença" stroke={C.blue} strokeWidth={2.5} dot={{ r: 3 }} />
                  <Line yAxisId="left" type="monotone" dataKey="ticket" name="Ticket médio" stroke={C.purple} strokeWidth={2} strokeDasharray="5 5" dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Top contribuintes */}
      {top_contribuintes && top_contribuintes.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.5 }}
        >
          <Card>
            <CardContent className="pt-6">
              <h3 className="text-base font-semibold mb-4 flex items-center gap-2">
                <Award className="h-4 w-4" style={{ color: C.amber }} />
                Top contribuintes da semana
              </h3>
              <div className="space-y-2">
                {top_contribuintes.map((t, i) => (
                  <motion.div
                    key={t.membro_id || i}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.7 + i * 0.05 }}
                    className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold"
                        style={{
                          background: i === 0 ? '#fef3c7' : i === 1 ? '#e5e7eb' : i === 2 ? '#fed7aa' : C.primarySoft,
                          color: i < 3 ? '#000' : C.primary,
                        }}
                      >
                        {i + 1}
                      </div>
                      <div>
                        <div className="text-sm font-medium">{t.membro_nome || 'Anônimo'}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {t.qtd_doacoes} {t.qtd_doacoes === 1 ? 'doação' : 'doações'}
                        </div>
                      </div>
                    </div>
                    <div className="text-base font-bold tabular-nums" style={{ color: C.green }}>
                      {fmtMoney(t.total_doado)}
                    </div>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </motion.div>
  );
}

// ============================================================
// Sub-componentes
// ============================================================
function KpiBig({ custom, icon: Icon, accent, label, valor, format = fmtMoney, delta, sub, yoy }) {
  let DeltaIcon = Minus;
  let deltaColor = 'text-muted-foreground';
  if (delta !== null && delta !== undefined) {
    if (Math.abs(delta) < 1) { DeltaIcon = Minus; deltaColor = 'text-muted-foreground'; }
    else if (delta > 0) { DeltaIcon = ArrowUp; deltaColor = 'text-emerald-600'; }
    else { DeltaIcon = ArrowDown; deltaColor = 'text-rose-600'; }
  }

  return (
    <motion.div
      custom={custom}
      variants={{
        hidden: { opacity: 0, y: 24 },
        visible: (i) => ({
          opacity: 1, y: 0,
          transition: { delay: i * 0.1, duration: 0.5, ease: 'easeOut' },
        }),
      }}
      whileHover={{ y: -3, transition: { duration: 0.2 } }}
    >
      <Card className="relative overflow-hidden border-border hover:shadow-lg transition-shadow">
        <div className="absolute top-0 left-0 right-0 h-1" style={{ background: accent }} />
        <div className="absolute top-2 right-2 h-20 w-20 rounded-full opacity-10" style={{ background: accent, filter: 'blur(30px)' }} />
        <CardContent className="pt-5 pb-5 relative">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {label}
            </div>
            <div className="h-9 w-9 rounded-lg flex items-center justify-center" style={{ background: accent + '20', color: accent }}>
              <Icon className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl font-bold tabular-nums" style={{ color: accent }}>
            <CountUp value={valor || 0} format={format} />
          </div>
          <div className="flex items-center gap-2 mt-2">
            {delta !== null && delta !== undefined && (
              <div className={`flex items-center gap-1 text-xs font-medium ${deltaColor}`}>
                <DeltaIcon className="h-3 w-3" />
                {fmtPct(delta)}
              </div>
            )}
            {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
          </div>
          {yoy && (
            <div className="text-[10px] text-muted-foreground mt-1.5 pt-1.5 border-t border-border/50">
              {yoy}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

function BucketCard({ custom, bucket, color, isAcumulado }) {
  if (!bucket) return null;

  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0, transition: { delay: 0.2 + custom * 0.08, duration: 0.5 } },
      }}
      whileHover={{ y: -2 }}
    >
      <Card className={`relative overflow-hidden ${isAcumulado ? 'border-primary/40 bg-primary/5' : ''}`}>
        <div className="absolute top-0 left-0 bottom-0 w-1" style={{ background: color }} />
        <CardContent className="pt-5 pb-5 pl-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h4 className="text-base font-bold" style={{ color }}>{bucket.nome}</h4>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                {isAcumulado ? 'Soma da semana' : 'Categorias'}
              </div>
            </div>
            <div className="text-xl font-bold tabular-nums">
              <CountUp value={bucket.total} duration={1} />
            </div>
          </div>
          {bucket.categorias.length === 0 ? (
            <div className="text-xs text-muted-foreground py-3 text-center">
              Sem receita classificada
            </div>
          ) : (
            <div className="space-y-2 mt-2">
              {bucket.categorias.map((c, i) => (
                <motion.div
                  key={c.categoria}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4 + custom * 0.08 + i * 0.04 }}
                  className="space-y-1"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium truncate">{c.categoria}</span>
                    <div className="flex items-center gap-2 tabular-nums shrink-0">
                      <span className="text-muted-foreground">{c.pct.toFixed(1)}%</span>
                      <span className="font-semibold" style={{ color }}>{fmtMoney(c.valor)}</span>
                    </div>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: color }}
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, c.pct)}%` }}
                      transition={{ delay: 0.5 + custom * 0.08 + i * 0.04, duration: 0.7 }}
                    />
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

function LoadingPretty() {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <motion.div
        className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent"
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
      />
      <div className="text-sm text-muted-foreground">Montando dashboard semanal...</div>
    </div>
  );
}
