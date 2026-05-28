import { useEffect, useState, useRef, useMemo } from 'react';
import { motion, AnimatePresence, useSpring, useTransform, animate } from 'framer-motion';
import {
  ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Users, Banknote,
  Sparkles, ArrowUp, ArrowDown, Minus, Award, Calendar,
  BarChart3, Activity, Target, FileText, Loader2, Filter, X, MousePointer2,
} from 'lucide-react';
import { Card, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { financeiroV2 } from '../../../api';
import MetaGauge from '../../../components/dashboard-semanal/MetaGauge';
import {
  ComposedChart, Line, Bar, Area, AreaChart, BarChart, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell,
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
// SEMANAS QUA-TER · gera lista das ultimas N semanas
// Numeracao: 1 = primeira semana qua-ter cuja quarta-feira cai em
// ou apos 01/01 do ano. Pode dar W53 em anos com 53 semanas qua-ter.
// ============================================================
function numeroSemanaQuaTer(quarta) {
  const ano = quarta.getFullYear();
  const jan1 = new Date(ano, 0, 1);
  const dowJan1 = jan1.getDay(); // 0=Dom ... 3=Qua
  const diasAteQuarta = (3 - dowJan1 + 7) % 7;
  const primeiraQuarta = new Date(ano, 0, 1 + diasAteQuarta);
  const dias = Math.round((quarta - primeiraQuarta) / 86400000);
  return Math.floor(dias / 7) + 1;
}

function gerarSemanasQuaTer(qtd = 26) {
  const hoje = new Date();
  const dow = hoje.getDay(); // 0=Dom ... 3=Qua ... 6=Sab
  // dias para voltar ate a quarta da semana atual qua-ter
  // qua=0, qui=1, sex=2, sab=3, dom=4, seg=5, ter=6
  const diasParaQuarta = (dow + 4) % 7;
  const quartaAtual = new Date(hoje);
  quartaAtual.setHours(0, 0, 0, 0);
  quartaAtual.setDate(hoje.getDate() - diasParaQuarta);

  const out = [];
  for (let i = 0; i < qtd; i++) {
    const inicio = new Date(quartaAtual);
    inicio.setDate(quartaAtual.getDate() - i * 7);
    const fim = new Date(inicio);
    fim.setDate(inicio.getDate() + 6);
    const fmt = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    const num = numeroSemanaQuaTer(inicio);
    const numStr = String(num).padStart(2, '0');
    out.push({
      ref: inicio.toISOString().slice(0, 10),
      inicio: inicio.toISOString().slice(0, 10),
      fim: fim.toISOString().slice(0, 10),
      numero: num,
      ano: inicio.getFullYear(),
      label: `Semana ${numStr} · ${fmt(inicio)}–${fmt(fim)}${i === 0 ? ' (atual)' : ''}`,
      labelCurto: `Semana ${numStr}/${inicio.getFullYear()}`,
    });
  }
  return out;
}

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
const SLIDES = [
  { key: 'resumo',       label: 'Resumo',         icon: Sparkles,   desc: 'KPIs · cultos · top contribuintes' },
  { key: 'por_culto',    label: 'Por Culto',      icon: Calendar,   desc: 'Quarta · domingo · outros · acumulada' },
  { key: 'tendencias',   label: 'Tendências',     icon: TrendingUp, desc: 'Últimos 3 meses · histórico mensal' },
  { key: 'comparativos', label: 'Comparativos',   icon: BarChart3,  desc: 'YTD · YoY · decêndio' },
  { key: 'performance',  label: 'Performance',    icon: Activity,   desc: 'Freq × Arrecadação semanal · cards interativos' },
  { key: 'controle',     label: 'Saídas',         icon: Target,     desc: 'Despesas detalhadas por categoria' },
  { key: 'metas',        label: 'Metas',          icon: Award,      desc: 'Metas financeiras com filtros ano/mês/semana' },
];

export default function DashboardSemanal() {
  const [data, setData] = useState(null);
  const [completo, setCompleto] = useState(null);
  const [melhorSemana, setMelhorSemana] = useState(null);
  const [saidas, setSaidas] = useState(null);
  const [metas, setMetas] = useState([]);
  const [loading, setLoading] = useState(true);
  const semanas = useMemo(() => gerarSemanasQuaTer(26), []);
  const [refData, setRefData] = useState(semanas[0].ref);
  const [slide, setSlide] = useState(0);

  // Navegação por teclado · ← → entre slides
  useEffect(() => {
    const handler = (e) => {
      // ignora se está digitando em input/textarea
      if (e.target?.tagName === 'INPUT' || e.target?.tagName === 'TEXTAREA' || e.target?.tagName === 'SELECT') return;
      if (e.key === 'ArrowRight') setSlide(i => Math.min(i + 1, SLIDES.length - 1));
      else if (e.key === 'ArrowLeft') setSlide(i => Math.max(i - 1, 0));
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const failsafe = (label) => (e) => { console.warn(`[Dashboard FinSemanal] ${label}:`, e.message); return null; };
    Promise.all([
      financeiroV2.dashboard.semanaCompleta?.(refData)?.catch(failsafe('semanaCompleta')),
      financeiroV2.dashboard.financeiroCompleto?.()?.catch(failsafe('financeiroCompleto')),
      financeiroV2.dashboard.melhorSemana?.()?.catch(failsafe('melhorSemana')),
      financeiroV2.dashboard.saidasDetalhadas?.()?.catch(failsafe('saidasDetalhadas')),
      financeiroV2.metas?.list?.({ ativa: 'true' })?.catch(failsafe('metas')),
    ]).then(([s, c, m, sd, mt]) => {
      if (cancelled) return;
      setData(s);
      setCompleto(c);
      setMelhorSemana(m);
      setSaidas(sd);
      setMetas(mt || []);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [refData]);

  const reloadMetas = () => {
    financeiroV2.metas?.list?.({ ativa: 'true' }).then(setMetas).catch(() => {});
  };

  const navegar = (delta) => {
    const idx = semanas.findIndex(s => s.ref === refData);
    const base = idx === -1 ? 0 : idx;
    const novoIdx = Math.max(0, Math.min(semanas.length - 1, base + delta));
    setRefData(semanas[novoIdx].ref);
  };

  // Stale-while-revalidate · so bloqueia tela no carregamento INICIAL.
  // Trocas de semana mantem UI anterior visivel + spinner sutil no header.
  if (!data) return <LoadingPretty />;
  if (data.erro) return <div className="text-sm text-muted-foreground">Erro: {data.erro}</div>;

  const { semana, kpis, cultos, buckets, historico, top_contribuintes } = data;

  return (
    <div className={`space-y-4 transition-opacity ${loading ? 'opacity-60' : 'opacity-100'}`}>
      {/* HEADER · navegação semana (sticky · sempre visível) */}
      <div className="sticky top-0 z-20 pb-2 -mx-1 px-1 bg-gradient-to-b from-background via-background to-transparent backdrop-blur-sm">
        <Card className="overflow-hidden border-primary/30">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-primary/5 pointer-events-none" />
          <CardContent className="pt-4 pb-4 flex items-center justify-between flex-wrap gap-3 relative">
            <Button variant="outline" size="sm" onClick={() => navegar(1)} disabled={semanas.findIndex(s => s.ref === refData) >= semanas.length - 1 || loading}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
            </Button>

            <div className="flex flex-col items-center flex-1 min-w-[240px]">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1">
                Semana qua-ter
                {loading && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
              </div>
              <select
                value={refData}
                onChange={(e) => setRefData(e.target.value)}
                disabled={loading}
                className="text-sm font-bold text-foreground bg-background border border-border rounded-md px-3 py-1.5 hover:border-primary/50 transition-colors cursor-pointer tabular-nums min-w-[240px] text-center disabled:opacity-60"
              >
                {semanas.map(s => (
                  <option key={s.ref} value={s.ref}>{s.label}</option>
                ))}
              </select>
              <div className="text-[10px] text-muted-foreground mt-1 tabular-nums">
                {(() => {
                  const s = semanas.find(x => x.ref === refData);
                  return s ? `${s.labelCurto} · ${semana.inicio} a ${semana.fim}` : `${semana.inicio} a ${semana.fim}`;
                })()}
              </div>
            </div>

            <Button variant="outline" size="sm" onClick={() => navegar(-1)} disabled={semanas.findIndex(s => s.ref === refData) <= 0 || loading}>
              Próxima <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </CardContent>
        </Card>

        {/* SlideNav · botões de navegação entre slides */}
        <SlideNav current={slide} onChange={setSlide} />
      </div>

      {/* CONTENT · slides animados com AnimatePresence */}
      <AnimatePresence mode="wait">
        <motion.div
          key={SLIDES[slide].key}
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -30 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="space-y-6"
        >
          {slide === 0 && (
            <Slide0Resumo
              kpis={kpis} cultos={cultos} top_contribuintes={top_contribuintes}
              historico={historico}
            />
          )}
          {slide === 1 && (
            <Slide1PorCulto
              buckets={buckets}
              melhorSemana={melhorSemana}
            />
          )}
          {slide === 2 && (
            <Slide2Tendencias
              historico={historico}
              completo={completo}
            />
          )}
          {slide === 3 && (
            <Slide3Comparativos
              completo={completo}
            />
          )}
          {slide === 4 && (
            <Slide4Performance
              completo={completo}
              melhorSemana={melhorSemana}
            />
          )}
          {slide === 5 && (
            <Slide5Controle
              saidas={saidas}
            />
          )}
          {slide === 6 && (
            <Slide6Metas
              metas={metas}
              onMetasChange={reloadMetas}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Footer · atalhos */}
      <div className="text-center text-[10px] text-muted-foreground">
        Use ← → no teclado pra navegar entre slides · {slide + 1} de {SLIDES.length}
      </div>
    </div>
  );
}

// ============================================================
// SLIDE NAVIGATION · botões em pílula sticky
// ============================================================
function SlideNav({ current, onChange }) {
  return (
    <div className="flex items-center gap-2 mt-3 overflow-x-auto pb-1">
      {SLIDES.map((s, i) => {
        const active = i === current;
        const Icon = s.icon;
        return (
          <motion.button
            key={s.key}
            onClick={() => onChange(i)}
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.97 }}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all shrink-0 ${
              active
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-card border border-border hover:border-primary/50 text-foreground'
            }`}
            title={s.desc}
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{s.label}</span>
            {active && (
              <motion.span
                layoutId="slide-active-indicator"
                className="absolute inset-0 rounded-lg pointer-events-none"
                style={{ background: 'transparent' }}
              />
            )}
          </motion.button>
        );
      })}
    </div>
  );
}

// ============================================================
// SLIDES · conteudo de cada aba
// ============================================================

function Slide0Resumo({ kpis, cultos, top_contribuintes, historico }) {
  return (
    <>
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

      {/* Tabela cultos */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.4 }}>
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
                  {cultos.map((c, i) => (
                    <motion.tr
                      key={c.culto_id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.3 + i * 0.04 }}
                      className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                    >
                      <td className="py-2.5 px-3 font-medium">{c.culto_nome}</td>
                      <td className="py-2.5 px-3 text-xs text-muted-foreground">
                        {DIAS[c.dia_semana]} · {c.culto_data?.slice(8, 10)}/{c.culto_data?.slice(5, 7)}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums">
                        {c.total_presencial > 0 ? <strong>{fmtInt(c.total_presencial)}</strong> : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-muted-foreground">
                        {c.online_pico > 0 ? fmtInt(c.online_pico) : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums font-semibold" style={{ color: C.green }}>
                        {c.receita_total > 0 ? fmtMoney(c.receita_total) : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums">
                        {c.ticket > 0 ? <span style={{ color: C.purple }}>{fmtMoney(c.ticket)}</span> : '—'}
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Top contribuintes */}
      {top_contribuintes && top_contribuintes.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.4 }}>
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
                    transition={{ delay: 0.4 + i * 0.05 }}
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
    </>
  );
}

function Slide1PorCulto({ buckets, melhorSemana }) {
  return (
    <>
      {/* 4 Buckets estilo Power BI */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BucketCard custom={0} bucket={buckets.quarta} color={C.blue} />
        <BucketCard custom={1} bucket={buckets.domingo} color={C.primary} />
        <BucketCard custom={2} bucket={buckets.outros} color={C.amber} />
        <BucketCard custom={3} bucket={buckets.acumulada} color={C.purple} isAcumulado />
      </div>

      {/* Melhor semana */}
      {melhorSemana && (melhorSemana.melhor_do_mes || melhorSemana.melhor_do_ano) && (
        <MelhorSemanaCards melhor={melhorSemana} />
      )}
    </>
  );
}

function Slide2Tendencias({ historico, completo }) {
  // Últimos 3 meses (~13 semanas qua-ter) · suporta dados ausentes
  const ultimas13 = useMemo(() => {
    if (!Array.isArray(historico)) return [];
    return historico.slice(-13);
  }, [historico]);

  const temDados = ultimas13.some(d => Number(d.receita || 0) > 0 || Number(d.presencial || 0) > 0);

  return (
    <>
      {/* Tendência últimos 3 meses (~13 semanas) */}
      <Card>
        <CardContent className="pt-6">
          <h3 className="text-base font-semibold mb-1">Tendência dos últimos 3 meses</h3>
          <p className="text-xs text-muted-foreground mb-4">
            Receita (barras verdes) · presença (linha azul) · ticket médio (linha roxa pontilhada) ·
            13 semanas qua-ter
          </p>
          {!temDados ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Sem dados nos últimos 3 meses · importe lançamentos pra ver a tendência
            </div>
          ) : (
            <div style={{ width: '100%', height: 320 }}>
              <ResponsiveContainer>
                <ComposedChart data={ultimas13}>
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
                    formatter={(v, n) => n === 'Presença' ? [fmtInt(v), n] : [fmtMoney(v), n]}
                    contentStyle={{ borderRadius: 8, fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar yAxisId="left" dataKey="receita" name="Receita" fill="url(#gradReceita)" radius={[4, 4, 0, 0]} animationDuration={1200} />
                  <Line yAxisId="right" type="monotone" dataKey="presencial" name="Presença" stroke={C.blue} strokeWidth={2.5} dot={{ r: 3 }} animationDuration={1400} />
                  <Line yAxisId="left" type="monotone" dataKey="ticket" name="Ticket médio" stroke={C.purple} strokeWidth={2} strokeDasharray="5 5" dot={false} animationDuration={1600} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* PR A · Mensal + Semanal */}
      {completo && (
        <>
          <ArrecadacaoMensalChart dados={completo.mensal} />
          <ArrecadacaoSemanalChart dados={completo.semanal} anoAtual={completo.ano_atual} />
        </>
      )}
    </>
  );
}

function Slide3Comparativos({ completo }) {
  if (!completo) {
    return <div className="text-sm text-muted-foreground text-center py-10">Sem dados de comparativos · aplicar migrations e classificar transações</div>;
  }
  return (
    <>
      <YtdCard ytd={completo.ytd} />
      <DecendioCard dados={completo.decendio} mes={completo.mes_atual} />
      {completo.yoy_semanal?.length > 0 && (
        <YoYSemanalChart dados={completo.yoy_semanal} anoAtual={completo.ano_atual} anoAnterior={completo.ano_anterior} />
      )}
    </>
  );
}

function Slide4Performance({ completo, melhorSemana }) {
  return (
    <>
      <FreqVsArrecadacaoSemanal />
      {completo && <FreqVsReceitaChart dados={completo.freq_vs_receita} />}
      {melhorSemana && (melhorSemana.melhor_do_mes || melhorSemana.melhor_do_ano) && (
        <MelhorSemanaCards melhor={melhorSemana} />
      )}
    </>
  );
}

function Slide5Controle({ saidas }) {
  return (
    <>
      {saidas
        ? <SaidasDetalhadas saidas={saidas} />
        : <div className="text-sm text-muted-foreground text-center py-10">Sem dados de despesas ainda</div>}
    </>
  );
}

function Slide6Metas({ metas, onMetasChange }) {
  return <MetasFinanceirasComFiltros metas={metas} onMetasChange={onMetasChange} />;
}

// ============================================================
// CALCULA "valor atual" da meta usando dados ja carregados
// ============================================================
function calcularAtualMeta(meta, ctx) {
  const { completo, receitaSemana } = ctx;
  if (!meta) return null;
  const mensal = completo?.mensal || [];
  const mesAtual = mensal[mensal.length - 1] || {};
  const ytd = completo?.ytd?.ano_atual || {};

  switch (meta.tipo) {
    case 'receita_mensal':       return Number(mesAtual.receita || 0);
    case 'receita_anual':        return Number(ytd.receita || 0);
    case 'despesa_max_mensal':   return Number(mesAtual.despesa || 0);
    case 'saldo_minimo':         return Number(ytd.resultado || 0);
    case 'pct_categoria':        return null;
    case 'meta_centro_custo':    return null;
    default:                     return null;
  }
}

function labelPeriodoMeta(tipo) {
  if (tipo?.includes('anual'))   return 'no ano';
  if (tipo === 'saldo_minimo')   return 'resultado YTD';
  if (tipo?.includes('semanal')) return 'na semana';
  if (tipo?.includes('mensal'))  return 'no mês';
  return '';
}

function periodicidadeDoTipo(tipo) {
  if (!tipo) return 'mensal';
  if (tipo.includes('semanal')) return 'semanal';
  if (tipo.includes('anual'))   return 'anual';
  return 'mensal';
}

// ============================================================
// PR A · COMPONENTES NOVOS
// ============================================================

function YtdCard({ ytd }) {
  const at = ytd.ano_atual;
  const an = ytd.ano_anterior;
  const delta = ytd.delta_pct;
  const positive = delta !== null && delta > 0;
  return (
    <Card className="relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-blue-500 to-purple-500" />
      <div className="absolute top-2 right-4 h-24 w-24 rounded-full opacity-10 bg-primary blur-2xl" />
      <CardContent className="pt-6 pb-6 relative">
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="h-4 w-4 text-primary" />
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Ano acumulado · {at.ano}
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <div className="text-xs text-muted-foreground">Receita YTD</div>
            <div className="text-2xl font-bold tabular-nums" style={{ color: COL.green }}>
              <CountUp value={at.receita} />
            </div>
            {delta !== null && (
              <div className={`text-xs flex items-center gap-1 mt-1 ${positive ? 'text-emerald-600' : 'text-rose-600'}`}>
                {positive ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                {delta >= 0 ? '+' : ''}{delta.toFixed(1)}% vs {an.ano}
              </div>
            )}
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Despesa YTD</div>
            <div className="text-2xl font-bold tabular-nums" style={{ color: COL.red }}>
              <CountUp value={at.despesa} />
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              vs {an.ano}: {fmtMoney(an.despesa)}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Resultado YTD</div>
            <div className={`text-2xl font-bold tabular-nums ${at.resultado >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              <CountUp value={at.resultado} />
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              vs {an.ano}: {fmtMoney(an.resultado)}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ArrecadacaoMensalChart({ dados }) {
  const formatado = dados.map(d => ({
    label: monthShort(d.mes),
    Receita: d.receita,
    Despesa: d.despesa,
    Resultado: d.resultado,
  }));
  return (
    <Card>
      <CardContent className="pt-6">
        <h3 className="text-base font-semibold mb-1">Arrecadação Mensal · últimos 12 meses</h3>
        <p className="text-xs text-muted-foreground mb-4">Linha de receita, despesa e resultado</p>
        <div style={{ width: '100%', height: 280 }}>
          <ResponsiveContainer>
            <ComposedChart data={formatado}>
              <defs>
                <linearGradient id="gradReceitaMes" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COL.green} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={COL.green} stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => fmtKbrl(v)} />
              <Tooltip
                formatter={(v) => fmtMoney(v)}
                contentStyle={{ borderRadius: 8, fontSize: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="Receita" stroke={COL.green} fill="url(#gradReceitaMes)" strokeWidth={2.5} animationDuration={1200} />
              <Line type="monotone" dataKey="Despesa" stroke={COL.red} strokeWidth={2} dot={{ r: 3 }} animationDuration={1400} />
              <Line type="monotone" dataKey="Resultado" stroke={COL.purple} strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3 }} animationDuration={1600} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function ArrecadacaoSemanalChart({ dados, anoAtual }) {
  const filtrado = dados
    .filter(d => d.ano === anoAtual)
    .map(d => ({
      label: d.semana_label,
      Receita: d.receita,
    }));
  return (
    <Card>
      <CardContent className="pt-6">
        <h3 className="text-base font-semibold mb-1">Arrecadação Semanal · {anoAtual}</h3>
        <p className="text-xs text-muted-foreground mb-4">{filtrado.length} semanas qua-ter</p>
        <div style={{ width: '100%', height: 280 }}>
          <ResponsiveContainer>
            <BarChart data={filtrado}>
              <defs>
                <linearGradient id="gradSemanal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COL.primary} stopOpacity={0.95} />
                  <stop offset="100%" stopColor={COL.primary} stopOpacity={0.5} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={Math.floor(filtrado.length / 12)} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => fmtKbrl(v)} />
              <Tooltip
                formatter={(v) => fmtMoney(v)}
                contentStyle={{ borderRadius: 8, fontSize: 12 }}
              />
              <Bar dataKey="Receita" fill="url(#gradSemanal)" radius={[3, 3, 0, 0]} animationDuration={1200} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function DecendioCard({ dados, mes }) {
  const total = dados.reduce((s, d) => s + Number(d.receita), 0);
  return (
    <Card>
      <CardContent className="pt-6">
        <h3 className="text-base font-semibold mb-1">Decêndio · {monthShort(mes)}</h3>
        <p className="text-xs text-muted-foreground mb-4">10 em 10 dias do mês</p>
        <div className="space-y-3">
          {[1, 2, 3].map((d, i) => {
            const item = dados.find(x => x.decendio === d) || { receita: 0, despesa: 0, decendio_label: ['1-10', '11-20', '21-fim'][i] };
            const pct = total > 0 ? (Number(item.receita) / total) * 100 : 0;
            return (
              <motion.div
                key={d}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.8 + i * 0.1 }}
              >
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="font-medium">Dias {item.decendio_label}</span>
                  <span className="tabular-nums" style={{ color: COL.green }}>
                    {fmtMoney(item.receita)}
                  </span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: COL.green }}
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ delay: 0.9 + i * 0.1, duration: 0.8 }}
                  />
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
                  {pct.toFixed(1)}% do mês
                </div>
              </motion.div>
            );
          })}
        </div>
        <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Total do mês</span>
          <span className="font-bold tabular-nums">{fmtMoney(total)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function YoYSemanalChart({ dados, anoAtual, anoAnterior }) {
  const formatado = dados.map(d => ({
    label: d.semana_label,
    [`${anoAtual}`]: d.receita_atual,
    [`${anoAnterior}`]: d.receita_ano_anterior,
  }));
  return (
    <Card>
      <CardContent className="pt-6">
        <h3 className="text-base font-semibold mb-1">Comparativo Ano a Ano · Semanal</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Mesma semana qua-ter de {anoAtual} vs {anoAnterior}
        </p>
        <div style={{ width: '100%', height: 280 }}>
          <ResponsiveContainer>
            <ComposedChart data={formatado}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={Math.floor(formatado.length / 12)} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => fmtKbrl(v)} />
              <Tooltip formatter={(v) => fmtMoney(v)} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey={`${anoAtual}`} fill={COL.primary} radius={[3, 3, 0, 0]} animationDuration={1000} />
              <Line type="monotone" dataKey={`${anoAnterior}`} stroke={COL.amber} strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3 }} animationDuration={1400} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function FreqVsReceitaChart({ dados }) {
  const formatado = dados.map(d => ({
    label: monthShort(d.mes),
    Frequência: Number(d.presencial),
    Receita: Number(d.receita),
    'Δ Freq %': d.delta_freq_pct,
    'Δ Receita %': d.delta_receita_pct,
    Elasticidade: d.elasticidade,
  }));
  // Cálculo agregado · qual cresce mais
  const ult = dados[dados.length - 1] || {};
  const elasticidadeMedia = dados
    .filter(d => d.elasticidade !== null && Number.isFinite(d.elasticidade))
    .reduce((s, d, _, arr) => s + d.elasticidade / arr.length, 0);

  return (
    <Card>
      <CardContent className="pt-6">
        <h3 className="text-base font-semibold mb-1">Frequência vs Arrecadação</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Crescimento % mês a mês · elasticidade média {elasticidadeMedia.toFixed(2)}
          {elasticidadeMedia > 1.1 && ' · receita cresce mais que frequência ✓'}
          {elasticidadeMedia < 0.9 && elasticidadeMedia > 0 && ' · receita cresce menos que frequência ⚠'}
        </p>
        <div style={{ width: '100%', height: 280 }}>
          <ResponsiveContainer>
            <ComposedChart data={formatado}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis yAxisId="left" tick={{ fontSize: 10 }} tickFormatter={(v) => fmtKbrl(v)} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v || 0).toFixed(0)}%`} />
              <Tooltip
                formatter={(v, name) => {
                  if (name === 'Receita') return [fmtMoney(v), name];
                  if (name === 'Frequência') return [v?.toLocaleString('pt-BR'), name];
                  if (typeof v === 'number') return [`${v.toFixed(1)}%`, name];
                  return [v, name];
                }}
                contentStyle={{ borderRadius: 8, fontSize: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar yAxisId="left" dataKey="Receita" fill={COL.green} fillOpacity={0.7} radius={[3, 3, 0, 0]} animationDuration={1200} />
              <Line yAxisId="right" type="monotone" dataKey="Δ Freq %" stroke={COL.blue} strokeWidth={2} dot={{ r: 3 }} animationDuration={1400} />
              <Line yAxisId="right" type="monotone" dataKey="Δ Receita %" stroke={COL.purple} strokeWidth={2} dot={{ r: 3 }} animationDuration={1600} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

// Helpers compartilhados (poderia extrair, mas inline ok pra essa PR)
const COL = {
  primary: '#00B39D',
  green: '#10b981',
  red: '#ef4444',
  amber: '#f59e0b',
  blue: '#3b82f6',
  purple: '#8b5cf6',
};

function monthShort(yyyymm) {
  if (!yyyymm) return '';
  const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const [y, m] = yyyymm.split('-');
  return `${meses[parseInt(m, 10) - 1]}/${y.slice(2)}`;
}

function fmtKbrl(v) {
  const n = Math.abs(Number(v || 0));
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}k`;
  return String(n);
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

// ============================================================
// PR B · COMPONENTES NOVOS
// ============================================================

function MelhorSemanaCards({ melhor }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <DestaqueCard
        titulo="🏆 Melhor semana do mês"
        semana={melhor.melhor_do_mes}
        gradient="from-amber-500 to-orange-500"
        bgClass="bg-amber-500/10"
      />
      <DestaqueCard
        titulo="👑 Melhor semana do ano"
        semana={melhor.melhor_do_ano}
        gradient="from-purple-500 to-pink-500"
        bgClass="bg-purple-500/10"
      />
    </div>
  );
}

function DestaqueCard({ titulo, semana, gradient, bgClass }) {
  if (!semana) {
    return (
      <Card>
        <CardContent className="pt-6 pb-6 text-center">
          <div className="text-xs text-muted-foreground uppercase tracking-wide mb-2">{titulo}</div>
          <div className="text-sm text-muted-foreground">Sem dados ainda</div>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="relative overflow-hidden">
      <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${gradient}`} />
      <div className={`absolute -top-8 -right-8 h-32 w-32 rounded-full opacity-20 ${bgClass} blur-2xl`} />
      <CardContent className="pt-6 pb-6 relative">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
          {titulo}
        </div>
        <div className="text-2xl font-bold tabular-nums mb-1" style={{ color: COL.green }}>
          <CountUp value={semana.receita} />
        </div>
        <div className="text-sm font-semibold">{semana.semana_label}</div>
        <div className="text-xs text-muted-foreground mt-1">
          {semana.semana_inicio} a {semana.semana_fim}
        </div>
      </CardContent>
    </Card>
  );
}

function SaidasDetalhadas({ saidas }) {
  const [view, setView] = useState('categoria');
  const dados = saidas[view];

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
          <div>
            <h3 className="text-base font-semibold">Saídas detalhadas · {saidas.mes}</h3>
            <p className="text-xs text-muted-foreground">
              Total: <strong>{fmtMoney(dados.total)}</strong>
            </p>
          </div>
          <div className="flex gap-1">
            {[
              { key: 'categoria', label: 'Por categoria' },
              { key: 'plano', label: 'Por plano' },
              { key: 'centro', label: 'Por centro' },
            ].map(t => (
              <Button
                key={t.key}
                size="sm"
                variant={view === t.key ? 'default' : 'outline'}
                onClick={() => setView(t.key)}
              >
                {t.label}
              </Button>
            ))}
          </div>
        </div>

        {dados.linhas.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Sem despesas classificadas no mês
          </div>
        ) : view === 'categoria' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Donut + lista */}
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer>
                <PieChartLite linhas={dados.linhas} />
              </ResponsiveContainer>
            </div>
            <SaidasList linhas={dados.linhas} labelKey="categoria_nome" />
          </div>
        ) : (
          <SaidasList linhas={dados.linhas} labelKey={view === 'plano' ? 'plano_nome' : 'centro_nome'} extraKey={view === 'plano' ? 'plano_codigo' : 'centro_codigo'} />
        )}
      </CardContent>
    </Card>
  );
}

// Componente leve · pie chart com cores rotativas
function PieChartLite({ linhas }) {
  const COLORS_PIE = ['#00B39D', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#10b981', '#ef4444', '#06b6d4'];
  const data = linhas.slice(0, 8).map((l, i) => ({
    name: l.categoria_nome || l.plano_nome || l.centro_nome,
    value: Number(l.total),
    color: COLORS_PIE[i % COLORS_PIE.length],
  }));
  return (
    <PieChart>
      <Pie data={data} cx="50%" cy="50%" outerRadius={90} innerRadius={50} dataKey="value" paddingAngle={2}>
        {data.map((d, i) => <Cell key={i} fill={d.color} />)}
      </Pie>
      <Tooltip formatter={(v) => fmtMoney(v)} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
    </PieChart>
  );
}

function SaidasList({ linhas, labelKey, extraKey }) {
  const max = Math.max(...linhas.map(l => Number(l.total)), 1);
  return (
    <div className="space-y-2">
      {linhas.slice(0, 12).map((l, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.03 }}
        >
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="truncate" title={l[labelKey]}>
              {extraKey && <span className="font-mono opacity-50 text-xs mr-2">{l[extraKey]}</span>}
              {l[labelKey]}
            </span>
            <div className="flex items-center gap-2 tabular-nums shrink-0">
              <span className="text-xs text-muted-foreground">{l.pct?.toFixed(1)}%</span>
              <span className="font-semibold" style={{ color: COL.red }}>{fmtMoney(l.total)}</span>
            </div>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{ background: COL.red }}
              initial={{ width: 0 }}
              animate={{ width: `${(Number(l.total) / max) * 100}%` }}
              transition={{ duration: 0.7, delay: i * 0.03 }}
            />
          </div>
        </motion.div>
      ))}
    </div>
  );
}

const TIPO_META_LABEL = {
  receita_semanal: 'Receita semanal',
  receita_mensal: 'Receita mensal',
  receita_anual: 'Receita anual',
  despesa_max_semanal: 'Teto despesa semanal',
  despesa_max_mensal: 'Teto despesa mensal',
  despesa_max_anual: 'Teto despesa anual',
  saldo_minimo: 'Saldo mínimo',
  pct_categoria: '% por categoria',
  meta_centro_custo: 'Meta centro de custo',
};

function MetasFinanceiras({ metas, onChange, completo, receitaSemana }) {
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const salvar = async (payload) => {
    try {
      if (payload.id) await financeiroV2.metas.update(payload.id, payload);
      else await financeiroV2.metas.create(payload);
      setEditing(null);
      setShowForm(false);
      onChange?.();
    } catch (e) {
      alert(`Erro: ${e.message}`);
    }
  };

  const remover = async (id) => {
    if (!confirm('Remover esta meta?')) return;
    await financeiroV2.metas.remove(id);
    onChange?.();
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-semibold">Metas Financeiras</h3>
            <p className="text-xs text-muted-foreground">{metas.length} metas ativas · gauge ou barra de progresso</p>
          </div>
          <Button size="sm" onClick={() => { setEditing(null); setShowForm(true); }}>
            + Nova meta
          </Button>
        </div>

        {metas.length === 0 ? (
          <div className="py-12 text-center">
            <Target className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">Nenhuma meta cadastrada</p>
            <Button size="sm" className="mt-3" onClick={() => { setEditing(null); setShowForm(true); }}>
              + Criar primeira meta
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {metas.map((m, i) => (
              <MetaCardFin
                key={m.id}
                meta={m}
                idx={i}
                ctx={{ completo, receitaSemana }}
                onEdit={() => { setEditing(m); setShowForm(true); }}
                onDelete={() => remover(m.id)}
              />
            ))}
          </div>
        )}

        {showForm && (
          <MetaForm
            inicial={editing || {}}
            onCancel={() => { setEditing(null); setShowForm(false); }}
            onSave={salvar}
          />
        )}
      </CardContent>
    </Card>
  );
}

function MetaCardFin({ meta, idx, ctx, onEdit, onDelete }) {
  const atualBruto = calcularAtualMeta(meta, ctx);
  const atual = atualBruto === null ? 0 : Math.max(0, Number(atualBruto));
  const metaValor = Number(meta.valor) || 1;
  const semDado = atualBruto === null;

  // Para despesa_max_mensal · meta = teto · pct invertido (quanto MAIOR atual, PIOR)
  const isInverso = meta.tipo === 'despesa_max_mensal';
  const pct = isInverso
    ? Math.min(200, Math.round((atual / metaValor) * 100))
    : Math.min(200, Math.round((atual / metaValor) * 100));
  const cor = isInverso
    ? (pct <= 80 ? '#10b981' : pct <= 100 ? '#f59e0b' : '#ef4444')
    : (pct >= 100 ? '#10b981' : pct >= 70 ? '#f59e0b' : '#ef4444');

  const tipoGrafico = meta.tipo_grafico || 'gauge';
  const tipoLabel = TIPO_META_LABEL[meta.tipo] || meta.tipo;
  const periodoTxt = labelPeriodoMeta(meta.tipo);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: idx * 0.05, ease: 'easeOut' }}
    >
      <Card className={`relative overflow-hidden ${!meta.ativa ? 'opacity-60' : ''}`}>
        <div className="absolute top-0 left-0 right-0 h-1" style={{ background: cor }} />
        <CardContent className="pt-5 pb-4">
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="min-w-0 flex-1">
              <Badge variant="outline" className="text-[10px] mb-1">{tipoLabel}</Badge>
              <h4 className="text-sm font-semibold leading-tight truncate" title={meta.descricao || tipoLabel}>
                {meta.descricao || tipoLabel}
              </h4>
              {(meta.plano || meta.centro) && (
                <div className="text-[10px] text-muted-foreground mt-1 truncate">
                  {meta.plano && `${meta.plano.codigo} ${meta.plano.nome}`}
                  {meta.centro && ` · ${meta.centro.codigo} ${meta.centro.nome}`}
                </div>
              )}
            </div>
            <div className="flex gap-0.5 shrink-0">
              <button
                onClick={onEdit}
                className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                title="Editar"
              >
                <FileText className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={onDelete}
                className="p-1.5 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors"
                title="Remover"
              >
                <span className="text-sm leading-none">×</span>
              </button>
            </div>
          </div>

          {semDado ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              Cálculo automático ainda não disponível para este tipo
            </div>
          ) : tipoGrafico === 'gauge' ? (
            <div className="-mt-2">
              <MetaGauge
                atual={atual}
                meta={metaValor}
                anim={`${meta.id}-${atual}`}
                size={200}
                label={`${pct}% ${isInverso ? 'consumido' : 'atingido'}`}
                showLabels={false}
              />
              <div className="text-center text-[11px] text-muted-foreground -mt-2">
                <span className="tabular-nums font-medium" style={{ color: cor }}>{fmtCompact(atual)}</span>
                <span className="mx-1">de</span>
                <span className="tabular-nums">{fmtCompact(metaValor)}</span>
                {periodoTxt && <span className="ml-1">· {periodoTxt}</span>}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-baseline justify-between">
                <motion.div
                  key={`val-${meta.id}-${atual}`}
                  initial={{ scale: 0.85, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.4 }}
                  className="text-2xl font-bold tabular-nums"
                  style={{ color: cor }}
                >
                  <CountUp value={atual} format={fmtCompact} />
                </motion.div>
                <div className="text-xs text-muted-foreground tabular-nums">
                  / {fmtCompact(metaValor)}
                </div>
              </div>
              <div className="h-3 rounded-full bg-muted overflow-hidden">
                <motion.div
                  key={`bar-${meta.id}-${pct}`}
                  className="h-full rounded-full"
                  style={{ background: cor }}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, pct)}%` }}
                  transition={{ duration: 1.0, ease: 'easeOut' }}
                />
              </div>
              <div className="flex items-baseline justify-between text-[11px]">
                <span className="font-semibold tabular-nums" style={{ color: cor }}>{pct}%</span>
                <span className="text-muted-foreground">{periodoTxt}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

function MetaForm({ inicial, onCancel, onSave }) {
  const [form, setForm] = useState({
    tipo: inicial.tipo || 'receita_mensal',
    descricao: inicial.descricao || '',
    valor: inicial.valor || '',
    ano: inicial.ano || new Date().getFullYear(),
    mes_inicio: inicial.mes_inicio || 1,
    mes_fim: inicial.mes_fim || 12,
    observacao: inicial.observacao || '',
    tipo_grafico: inicial.tipo_grafico || 'gauge',
    ativa: inicial.ativa !== false,
    id: inicial.id,
  });
  const tipos = [
    { v: 'receita_semanal', l: 'Receita semanal' },
    { v: 'receita_mensal', l: 'Receita mensal' },
    { v: 'receita_anual', l: 'Receita anual' },
    { v: 'despesa_max_semanal', l: 'Teto despesa semanal' },
    { v: 'despesa_max_mensal', l: 'Teto despesa mensal' },
    { v: 'despesa_max_anual', l: 'Teto despesa anual' },
    { v: 'saldo_minimo', l: 'Saldo mínimo' },
    { v: 'pct_categoria', l: '% por categoria' },
    { v: 'meta_centro_custo', l: 'Meta centro de custo' },
  ];
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      className="mt-4 p-4 border border-border rounded-lg bg-muted/30"
    >
      <h4 className="text-sm font-semibold mb-3">{form.id ? 'Editar' : 'Nova'} meta</h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">Tipo</label>
          <select
            value={form.tipo}
            onChange={(e) => setForm({ ...form, tipo: e.target.value })}
            className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background"
          >
            {tipos.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">Valor (R$)</label>
          <input
            type="number"
            step="0.01"
            value={form.valor}
            onChange={(e) => setForm({ ...form, valor: e.target.value })}
            className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background tabular-nums"
            placeholder="0.00"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">Descrição</label>
          <input
            type="text"
            value={form.descricao}
            onChange={(e) => setForm({ ...form, descricao: e.target.value })}
            className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background"
            placeholder="Ex: Receita mínima de janeiro"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">Ano</label>
          <input
            type="number"
            value={form.ano}
            onChange={(e) => setForm({ ...form, ano: parseInt(e.target.value) || 2026 })}
            className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background tabular-nums"
          />
        </div>
        <div className="md:col-span-2">
          <label className="text-xs font-medium text-muted-foreground block mb-1">Visualização</label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { v: 'gauge', l: 'Gauge (meia-lua)', icon: Activity },
              { v: 'barra', l: 'Barra de progresso', icon: BarChart3 },
            ].map(t => {
              const ativo = form.tipo_grafico === t.v;
              const Icone = t.icon;
              return (
                <button
                  key={t.v}
                  type="button"
                  onClick={() => setForm({ ...form, tipo_grafico: t.v })}
                  className={`p-2 rounded-lg border text-xs font-medium transition-all flex items-center gap-2 ${
                    ativo
                      ? 'bg-primary/10 border-primary text-primary'
                      : 'border-border text-muted-foreground hover:border-foreground/30'
                  }`}
                >
                  <Icone className="h-4 w-4" />
                  {t.l}
                </button>
              );
            })}
          </div>
        </div>
        <div className="md:col-span-2">
          <label className="text-xs font-medium text-muted-foreground block mb-1">Observação</label>
          <input
            type="text"
            value={form.observacao}
            onChange={(e) => setForm({ ...form, observacao: e.target.value })}
            className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <Button size="sm" variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button size="sm" onClick={() => onSave({ ...form, valor: Number(form.valor), periodicidade: periodicidadeDoTipo(form.tipo) })}>
          {form.id ? 'Salvar' : 'Criar meta'}
        </Button>
      </div>
    </motion.div>
  );
}

// ============================================================
// NOVO · Freq × Arrecadação SEMANAL com click-to-select cards
// ============================================================
function FreqVsArrecadacaoSemanal() {
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedIdx, setSelectedIdx] = useState(null);
  const [semanasJanela, setSemanasJanela] = useState(20);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    financeiroV2.freqArrecadacaoSemanal(semanasJanela)
      .then((r) => {
        if (cancelled) return;
        setDados(r);
        // Seleciona última por padrão
        const arr = r?.semanas || [];
        setSelectedIdx(arr.length > 0 ? arr.length - 1 : null);
      })
      .catch((e) => console.warn('[FreqArrec] erro:', e?.message))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [semanasJanela]);

  const semanas = dados?.semanas || [];
  const formatado = useMemo(() => semanas.map((s, i) => ({
    idx: i,
    label: s.semana_label || s.semana_inicio?.slice(5) || `S${i}`,
    semana_inicio: s.semana_inicio,
    Receita: Number(s.receita || 0),
    Presença: Number(s.presencial || 0),
    'Ticket médio': Number(s.ticket_medio_presencial || 0),
    Decisões: Number(s.decisoes || 0),
    receita: Number(s.receita || 0),
    presencial: Number(s.presencial || 0),
    online: Number(s.online || 0),
    ticket: Number(s.ticket_medio_presencial || 0),
    decisoes: Number(s.decisoes || 0),
    qtd_cultos: Number(s.qtd_cultos || 0),
    resultado: Number(s.resultado || 0),
    despesa: Number(s.despesa || 0),
  })), [semanas]);

  const sel = selectedIdx !== null ? formatado[selectedIdx] : null;
  const semAnterior = selectedIdx !== null && selectedIdx > 0 ? formatado[selectedIdx - 1] : null;

  const dRec = sel && semAnterior && semAnterior.receita > 0
    ? ((sel.receita - semAnterior.receita) / semAnterior.receita) * 100
    : null;
  const dFreq = sel && semAnterior && semAnterior.presencial > 0
    ? ((sel.presencial - semAnterior.presencial) / semAnterior.presencial) * 100
    : null;
  const dTicket = sel && semAnterior && semAnterior.ticket > 0
    ? ((sel.ticket - semAnterior.ticket) / semAnterior.ticket) * 100
    : null;

  const onBarClick = (data) => {
    if (data && data.activePayload?.[0]) {
      const payload = data.activePayload[0].payload;
      if (typeof payload.idx === 'number') setSelectedIdx(payload.idx);
    }
  };

  const temDados = semanas.some(s => Number(s.receita || 0) > 0 || Number(s.presencial || 0) > 0);

  return (
    <Card className="overflow-hidden">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
          <div>
            <h3 className="text-base font-semibold flex items-center gap-2">
              Frequência × Arrecadação semanal
              <Badge variant="outline" className="text-[10px] font-normal">
                <MousePointer2 className="h-2.5 w-2.5 mr-1" />
                clique numa semana
              </Badge>
            </h3>
            <p className="text-xs text-muted-foreground">
              Semanas qua-ter · empréstimos excluídos · cards abaixo refletem a semana selecionada
            </p>
          </div>
          <div className="flex gap-1">
            {[12, 20, 52].map(n => (
              <button
                key={n}
                onClick={() => setSemanasJanela(n)}
                className={`px-2.5 py-1 text-[11px] rounded-md font-medium transition ${
                  semanasJanela === n
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {n}sem
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="py-16 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : !temDados ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            Sem dados semanais · importe lançamentos pra ver
          </div>
        ) : (
          <>
            <div style={{ width: '100%', height: 360 }} className="mt-3">
              <ResponsiveContainer>
                <ComposedChart data={formatado} onClick={onBarClick} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradReceitaSem" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.primary} stopOpacity={0.95} />
                      <stop offset="100%" stopColor={C.primary} stopOpacity={0.45} />
                    </linearGradient>
                    <linearGradient id="gradReceitaSel" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.amber} stopOpacity={1} />
                      <stop offset="100%" stopColor={C.amber} stopOpacity={0.55} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.18} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} angle={-22} textAnchor="end" height={50} interval="preserveStartEnd" />
                  <YAxis yAxisId="left" tick={{ fontSize: 10 }} tickFormatter={(v) => fmtCompact(v).replace('R$ ', '')} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} tickFormatter={(v) => fmtInt(v)} />
                  <Tooltip
                    cursor={{ fill: 'rgba(0,179,157,0.08)' }}
                    contentStyle={{ borderRadius: 10, fontSize: 12, border: '1px solid var(--cbrio-border)' }}
                    formatter={(v, n) => {
                      if (n === 'Presença' || n === 'Decisões') return [fmtInt(v), n];
                      return [fmtMoney(v), n];
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} />
                  <Bar
                    yAxisId="left"
                    dataKey="Receita"
                    radius={[6, 6, 0, 0]}
                    animationDuration={1400}
                    cursor="pointer"
                  >
                    {formatado.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={i === selectedIdx ? 'url(#gradReceitaSel)' : 'url(#gradReceitaSem)'}
                        stroke={i === selectedIdx ? C.amber : 'transparent'}
                        strokeWidth={i === selectedIdx ? 2 : 0}
                      />
                    ))}
                  </Bar>
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="Presença"
                    stroke={C.blue}
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                    activeDot={{ r: 6, stroke: C.blue, strokeWidth: 2, fill: '#fff' }}
                    animationDuration={1700}
                  />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="Ticket médio"
                    stroke={C.purple}
                    strokeDasharray="5 5"
                    strokeWidth={2}
                    dot={false}
                    animationDuration={2000}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* CARDS interativos · refletem a semana selecionada */}
            <AnimatePresence mode="wait">
              {sel && (
                <motion.div
                  key={`sel-${sel.idx}`}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                  className="mt-5 pt-4 border-t border-border"
                >
                  <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                    <div className="text-xs text-muted-foreground">
                      Semana selecionada
                    </div>
                    <div className="text-sm font-semibold flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 tabular-nums">
                        {sel.label}
                      </span>
                      <span className="text-muted-foreground text-xs tabular-nums">
                        {sel.semana_inicio}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <SemanaCard
                      label="Arrecadação"
                      icon={Banknote}
                      accent={C.green}
                      valor={fmtMoney(sel.receita)}
                      delta={dRec}
                      sub={`vs anterior · ${sel.qtd_cultos} culto(s)`}
                      anim={`r-${sel.idx}`}
                    />
                    <SemanaCard
                      label="Presença total"
                      icon={Users}
                      accent={C.blue}
                      valor={`${fmtInt(sel.presencial + sel.online)}`}
                      delta={dFreq}
                      sub={`${fmtInt(sel.presencial)} presencial · ${fmtInt(sel.online)} online`}
                      anim={`p-${sel.idx}`}
                    />
                    <SemanaCard
                      label="Ticket médio"
                      icon={Sparkles}
                      accent={C.purple}
                      valor={fmtMoney(sel.ticket)}
                      delta={dTicket}
                      sub="R$ por presencial"
                      anim={`t-${sel.idx}`}
                    />
                    <SemanaCard
                      label="Decisões"
                      icon={Award}
                      accent={C.pink}
                      valor={fmtInt(sel.decisoes)}
                      delta={null}
                      sub="presencial + online + kids"
                      anim={`d-${sel.idx}`}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function SemanaCard({ label, icon: Icon, accent, valor, delta, sub, anim }) {
  let DeltaIcon = Minus, deltaColor = 'text-muted-foreground';
  if (delta !== null && delta !== undefined && Number.isFinite(delta)) {
    if (Math.abs(delta) < 1) { DeltaIcon = Minus; deltaColor = 'text-muted-foreground'; }
    else if (delta > 0) { DeltaIcon = ArrowUp; deltaColor = 'text-emerald-600'; }
    else { DeltaIcon = ArrowDown; deltaColor = 'text-rose-600'; }
  }
  return (
    <motion.div
      key={anim}
      initial={{ opacity: 0, scale: 0.92, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className="relative overflow-hidden rounded-xl border border-border bg-card p-3"
    >
      <div className="absolute top-0 left-0 right-0 h-1" style={{ background: accent }} />
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</span>
        <div
          className="h-7 w-7 rounded-lg flex items-center justify-center"
          style={{ background: `${accent}1f`, color: accent }}
        >
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
      <div className="text-xl md:text-2xl font-bold tabular-nums leading-tight" style={{ color: accent }}>
        {valor}
      </div>
      <div className="flex items-center justify-between mt-1">
        {delta !== null && delta !== undefined && Number.isFinite(delta) ? (
          <div className={`text-[11px] font-semibold flex items-center ${deltaColor} tabular-nums`}>
            <DeltaIcon className="h-3 w-3 mr-0.5" />
            {Math.abs(delta).toFixed(1)}%
          </div>
        ) : <div />}
        <div className="text-[10px] text-muted-foreground truncate">{sub}</div>
      </div>
    </motion.div>
  );
}

// ============================================================
// NOVO · Metas Financeiras com filtros (Ano / Mês / Semana / Por meta)
// ============================================================
function MetasFinanceirasComFiltros({ metas: metasIniciais, onMetasChange }) {
  const [metas, setMetas] = useState(metasIniciais || []);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [progresso, setProgresso] = useState({});
  const [loadingProg, setLoadingProg] = useState(false);

  // Filtros globais (afetam todas as metas que tiverem "global")
  const hoje = new Date();
  const anoAtual = hoje.getFullYear();
  const semanasOpcoes = useMemo(() => gerarSemanasQuaTer(52), []);

  const [filtroAno, setFiltroAno] = useState(anoAtual);
  const [filtroMes, setFiltroMes] = useState(''); // '' = todos / 1-12
  const [filtroSemana, setFiltroSemana] = useState(''); // '' = nenhuma / YYYY-MM-DD da quarta
  const [perMetaPeriod, setPerMetaPeriod] = useState({}); // metaId -> 'auto' | 'semana' | 'mes' | 'ano'
  const [filtroTipo, setFiltroTipo] = useState('todos'); // 'todos' | 'receita' | 'despesa' | 'saldo'

  useEffect(() => { setMetas(metasIniciais || []); }, [metasIniciais]);

  // Carrega progresso por meta · usa filtro global como default
  useEffect(() => {
    let cancelled = false;
    setLoadingProg(true);
    const params = {};
    if (filtroSemana) params.semana_inicio = filtroSemana;
    else if (filtroAno && filtroMes) { params.ano = filtroAno; params.mes = filtroMes; }
    else if (filtroAno) params.ano = filtroAno;

    financeiroV2.metas.progresso(params)
      .then(r => {
        if (cancelled) return;
        const map = {};
        (r?.metas || []).forEach(m => { map[m.meta_id] = m; });
        setProgresso(map);
      })
      .catch(e => console.warn('[Metas progresso]:', e?.message))
      .finally(() => !cancelled && setLoadingProg(false));
    return () => { cancelled = true; };
  }, [filtroAno, filtroMes, filtroSemana, metas]);

  const salvar = async (payload) => {
    try {
      if (payload.id) await financeiroV2.metas.update(payload.id, payload);
      else await financeiroV2.metas.create(payload);
      setEditing(null);
      setShowForm(false);
      onMetasChange?.();
    } catch (e) { alert(`Erro: ${e.message}`); }
  };

  const remover = async (id) => {
    if (!confirm('Remover esta meta?')) return;
    await financeiroV2.metas.remove(id);
    onMetasChange?.();
  };

  const metasFiltradas = useMemo(() => {
    return metas.filter(m => {
      if (filtroTipo === 'todos') return true;
      if (filtroTipo === 'receita') return m.tipo?.startsWith('receita_');
      if (filtroTipo === 'despesa') return m.tipo?.startsWith('despesa_');
      if (filtroTipo === 'saldo') return m.tipo === 'saldo_minimo';
      return true;
    });
  }, [metas, filtroTipo]);

  // Resumo geral
  const totalNoAlvo = metasFiltradas.filter(m => {
    const p = progresso[m.id];
    if (!p) return false;
    const isInverso = m.tipo?.startsWith('despesa_');
    return isInverso ? p.pct <= 100 : p.pct >= 100;
  }).length;
  const totalAtras = metasFiltradas.length - totalNoAlvo;

  return (
    <>
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div>
              <h3 className="text-base font-semibold flex items-center gap-2">
                <Award className="h-4 w-4 text-amber-500" />
                Metas Financeiras
              </h3>
              <p className="text-xs text-muted-foreground">
                {metasFiltradas.length} meta(s) · {totalNoAlvo} no alvo · {totalAtras} fora do alvo
                {loadingProg && <Loader2 className="inline h-3 w-3 ml-2 animate-spin" />}
              </p>
            </div>
            <Button size="sm" onClick={() => { setEditing(null); setShowForm(true); }}>
              + Nova meta
            </Button>
          </div>

          {/* FILTROS */}
          <div className="bg-muted/40 rounded-xl p-3 mb-4 grid grid-cols-1 md:grid-cols-5 gap-2">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium block mb-1">Ano</label>
              <select
                value={filtroAno}
                onChange={(e) => { setFiltroAno(Number(e.target.value)); setFiltroSemana(''); }}
                className="w-full px-2 py-1.5 text-sm rounded-md border border-border bg-background"
              >
                {[anoAtual, anoAtual - 1, anoAtual - 2, anoAtual - 3, anoAtual - 4].map(a => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium block mb-1">Mês</label>
              <select
                value={filtroMes}
                onChange={(e) => { setFiltroMes(e.target.value); setFiltroSemana(''); }}
                className="w-full px-2 py-1.5 text-sm rounded-md border border-border bg-background"
              >
                <option value="">Todos</option>
                {['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'].map((m,i)=>(
                  <option key={i+1} value={i+1}>{m}</option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium block mb-1">Semana (qua-ter)</label>
              <select
                value={filtroSemana}
                onChange={(e) => setFiltroSemana(e.target.value)}
                className="w-full px-2 py-1.5 text-sm rounded-md border border-border bg-background"
              >
                <option value="">Usar ano/mês acima</option>
                {semanasOpcoes
                  .filter(s => s.ano === filtroAno || filtroAno === anoAtual)
                  .slice(0, 30)
                  .map(s => (
                    <option key={s.ref} value={s.ref}>{s.labelCurto} · {s.label.replace(' (atual)', '')}</option>
                  ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium block mb-1">Tipo</label>
              <select
                value={filtroTipo}
                onChange={(e) => setFiltroTipo(e.target.value)}
                className="w-full px-2 py-1.5 text-sm rounded-md border border-border bg-background"
              >
                <option value="todos">Todos</option>
                <option value="receita">Receita</option>
                <option value="despesa">Despesa</option>
                <option value="saldo">Saldo</option>
              </select>
            </div>
          </div>

          {(filtroAno !== anoAtual || filtroMes || filtroSemana || filtroTipo !== 'todos') && (
            <div className="flex items-center gap-2 mb-3 text-[11px]">
              <Filter className="h-3 w-3 text-muted-foreground" />
              <span className="text-muted-foreground">Filtros ativos</span>
              <button
                onClick={() => { setFiltroAno(anoAtual); setFiltroMes(''); setFiltroSemana(''); setFiltroTipo('todos'); }}
                className="px-2 py-0.5 rounded bg-muted hover:bg-muted/80 text-foreground flex items-center gap-1"
              >
                <X className="h-3 w-3" /> Limpar
              </button>
            </div>
          )}

          {metasFiltradas.length === 0 ? (
            <div className="py-12 text-center">
              <Target className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">Nenhuma meta nesta visão</p>
              <Button size="sm" className="mt-3" onClick={() => { setEditing(null); setShowForm(true); }}>
                + Criar nova meta
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {metasFiltradas.map((m, i) => (
                <MetaCardFiltrado
                  key={m.id}
                  meta={m}
                  idx={i}
                  prog={progresso[m.id]}
                  periodOverride={perMetaPeriod[m.id]}
                  onPeriodChange={(p) => setPerMetaPeriod(prev => ({ ...prev, [m.id]: p }))}
                  onEdit={() => { setEditing(m); setShowForm(true); }}
                  onDelete={() => remover(m.id)}
                />
              ))}
            </div>
          )}

          {showForm && (
            <MetaForm
              inicial={editing || {}}
              onCancel={() => { setEditing(null); setShowForm(false); }}
              onSave={salvar}
            />
          )}
        </CardContent>
      </Card>
    </>
  );
}

function MetaCardFiltrado({ meta, idx, prog, periodOverride, onPeriodChange, onEdit, onDelete }) {
  const atual = Number(prog?.valor_atual || 0);
  const valorMeta = Number(meta.valor) || 1;
  const isInverso = meta.tipo?.startsWith('despesa_');
  const pct = Math.min(200, Math.round((atual / valorMeta) * 100));
  const cor = isInverso
    ? (pct <= 80 ? C.green : pct <= 100 ? C.amber : C.red)
    : (pct >= 100 ? C.green : pct >= 70 ? C.amber : C.red);

  const tipoLabel = TIPO_META_LABEL[meta.tipo] || meta.tipo;
  const periodicidade = meta.periodicidade || periodicidadeDoTipo(meta.tipo);
  const tipoGrafico = meta.tipo_grafico || 'gauge';
  const semDado = !prog;

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: idx * 0.04, ease: 'easeOut' }}
    >
      <Card className={`relative overflow-hidden ${!meta.ativa ? 'opacity-60' : ''}`}>
        <div className="absolute top-0 left-0 right-0 h-1" style={{ background: cor }} />
        <CardContent className="pt-5 pb-4">
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap gap-1 mb-1">
                <Badge variant="outline" className="text-[10px]">{tipoLabel}</Badge>
                <Badge variant="outline" className="text-[10px] capitalize" style={{ borderColor: cor, color: cor }}>
                  {periodicidade}
                </Badge>
              </div>
              <h4 className="text-sm font-semibold leading-tight truncate" title={meta.descricao || tipoLabel}>
                {meta.descricao || tipoLabel}
              </h4>
              {(meta.plano || meta.centro) && (
                <div className="text-[10px] text-muted-foreground mt-1 truncate">
                  {meta.plano && `${meta.plano.codigo} ${meta.plano.nome}`}
                  {meta.centro && ` · ${meta.centro.codigo} ${meta.centro.nome}`}
                </div>
              )}
            </div>
            <div className="flex gap-0.5 shrink-0">
              <button onClick={onEdit} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition" title="Editar">
                <FileText className="h-3.5 w-3.5" />
              </button>
              <button onClick={onDelete} className="p-1.5 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition" title="Remover">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {semDado ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              {prog === undefined ? 'Calculando...' : 'Sem dado no período'}
            </div>
          ) : tipoGrafico === 'gauge' ? (
            <div className="-mt-2">
              <MetaGauge
                atual={atual}
                meta={valorMeta}
                anim={`${meta.id}-${atual}-${prog?.periodo_inicio || 'x'}`}
                size={200}
                label={`${pct}% ${isInverso ? 'consumido' : 'atingido'}`}
                showLabels={false}
              />
              <div className="text-center text-[11px] text-muted-foreground -mt-2">
                <span className="tabular-nums font-medium" style={{ color: cor }}>{fmtCompact(atual)}</span>
                <span className="mx-1">de</span>
                <span className="tabular-nums">{fmtCompact(valorMeta)}</span>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-baseline justify-between">
                <motion.div
                  key={`val-${meta.id}-${atual}`}
                  initial={{ scale: 0.85, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.4 }}
                  className="text-2xl font-bold tabular-nums"
                  style={{ color: cor }}
                >
                  <CountUp value={atual} format={fmtCompact} />
                </motion.div>
                <div className="text-xs text-muted-foreground tabular-nums">
                  / {fmtCompact(valorMeta)}
                </div>
              </div>
              <div className="h-3 rounded-full bg-muted overflow-hidden">
                <motion.div
                  key={`bar-${meta.id}-${pct}`}
                  className="h-full rounded-full"
                  style={{ background: cor }}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, pct)}%` }}
                  transition={{ duration: 1.0, ease: 'easeOut' }}
                />
              </div>
              <div className="flex items-baseline justify-between text-[11px]">
                <span className="font-semibold tabular-nums" style={{ color: cor }}>{pct}%</span>
              </div>
            </div>
          )}

          {prog?.periodo_inicio && prog?.periodo_fim && (
            <div className="mt-3 pt-2 border-t border-border/50 text-[10px] text-muted-foreground text-center tabular-nums">
              {prog.periodo_inicio.slice(5)} → {prog.periodo_fim.slice(5)}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
