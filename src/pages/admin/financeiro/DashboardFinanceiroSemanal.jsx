import { useEffect, useState, useRef, useMemo } from 'react';
import { motion, AnimatePresence, useSpring, useTransform, animate } from 'framer-motion';
import {
  ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Users, Banknote,
  Sparkles, ArrowUp, ArrowDown, Minus, Award, Calendar,
  BarChart3, Activity, Target, FileText,
} from 'lucide-react';
import { Card, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { financeiroV2 } from '../../../api';
import {
  ComposedChart, Line, Bar, Area, AreaChart, BarChart, XAxis, YAxis, CartesianGrid,
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
const SLIDES = [
  { key: 'resumo',       label: 'Resumo',         icon: Sparkles,   desc: 'KPIs · cultos · top contribuintes' },
  { key: 'por_culto',    label: 'Por Culto',      icon: Calendar,   desc: 'Quarta · domingo · outros · acumulada' },
  { key: 'tendencias',   label: 'Tendências',     icon: TrendingUp, desc: 'Histórico semanal e mensal' },
  { key: 'comparativos', label: 'Comparativos',   icon: BarChart3,  desc: 'YTD · YoY · decêndio' },
  { key: 'performance',  label: 'Performance',    icon: Activity,   desc: 'Frequência × receita · melhores' },
  { key: 'controle',     label: 'Saídas & Metas', icon: Target,     desc: 'Despesas detalhadas · metas' },
];

export default function DashboardSemanal() {
  const [data, setData] = useState(null);
  const [completo, setCompleto] = useState(null);
  const [melhorSemana, setMelhorSemana] = useState(null);
  const [saidas, setSaidas] = useState(null);
  const [metas, setMetas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refData, setRefData] = useState(new Date().toISOString().slice(0, 10));
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
    const d = new Date(refData);
    d.setDate(d.getDate() + delta * 7);
    setRefData(d.toISOString().slice(0, 10));
  };

  if (loading || !data) return <LoadingPretty />;
  if (data.erro) return <div className="text-sm text-muted-foreground">Erro: {data.erro}</div>;

  const { semana, kpis, cultos, buckets, historico, top_contribuintes } = data;

  return (
    <div className="space-y-4">
      {/* HEADER · navegação semana (sticky · sempre visível) */}
      <div className="sticky top-0 z-20 pb-2 -mx-1 px-1 bg-gradient-to-b from-background via-background to-transparent backdrop-blur-sm">
        <Card className="overflow-hidden border-primary/30">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-primary/5 pointer-events-none" />
          <CardContent className="pt-4 pb-4 flex items-center justify-between flex-wrap gap-3 relative">
            <Button variant="outline" size="sm" onClick={() => navegar(-1)}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Semana anterior
            </Button>
            <div className="text-center">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Semana qua-ter</div>
              <div className="text-lg font-bold text-foreground capitalize">{semana.label}</div>
              <div className="text-[10px] text-muted-foreground">
                {semana.inicio} a {semana.fim}
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => navegar(1)}>
              Próxima semana <ChevronRight className="h-4 w-4 ml-1" />
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
  return (
    <>
      {/* Tendência 12 semanas */}
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
                  formatter={(v, n) => n === 'Presença' ? [fmtInt(v), n] : [fmtMoney(v), n]}
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
      {completo && <FreqVsReceitaChart dados={completo.freq_vs_receita} />}
      {melhorSemana && (melhorSemana.melhor_do_mes || melhorSemana.melhor_do_ano) && (
        <MelhorSemanaCards melhor={melhorSemana} />
      )}
      {!completo && !melhorSemana && (
        <div className="text-sm text-muted-foreground text-center py-10">Sem dados de performance ainda</div>
      )}
    </>
  );
}

function Slide5Controle({ saidas, metas, onMetasChange }) {
  return (
    <>
      {saidas && <SaidasDetalhadas saidas={saidas} />}
      <MetasFinanceiras metas={metas} onChange={onMetasChange} />
    </>
  );
}

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

      {/* ============================================================
          PR A · Novas seções: Mensal · Semanal · Decêndio · YTD · YoY · Freq×Receita
          ============================================================ */}
      {completo && (
        <>
          {/* YTD card destacado */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.5 }}
          >
            <YtdCard ytd={completo.ytd} />
          </motion.div>

          {/* Arrecadação mensal (12 meses) */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.65, duration: 0.5 }}
          >
            <ArrecadacaoMensalChart dados={completo.mensal} />
          </motion.div>

          {/* Arrecadação semanal + Decêndio (grid 2 colunas) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.7, duration: 0.5 }}
              className="lg:col-span-2"
            >
              <ArrecadacaoSemanalChart dados={completo.semanal} anoAtual={completo.ano_atual} />
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.75, duration: 0.5 }}
            >
              <DecendioCard dados={completo.decendio} mes={completo.mes_atual} />
            </motion.div>
          </div>

          {/* YoY Semanal */}
          {completo.yoy_semanal?.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8, duration: 0.5 }}
            >
              <YoYSemanalChart dados={completo.yoy_semanal} anoAtual={completo.ano_atual} anoAnterior={completo.ano_anterior} />
            </motion.div>
          )}

          {/* Frequência vs Arrecadação */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.85, duration: 0.5 }}
          >
            <FreqVsReceitaChart dados={completo.freq_vs_receita} />
          </motion.div>
        </>
      )}

      {/* ============================================================
          PR B · Melhor semana + Saidas detalhadas + Metas
          ============================================================ */}
      {melhorSemana && (melhorSemana.melhor_do_mes || melhorSemana.melhor_do_ano) && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9, duration: 0.5 }}
        >
          <MelhorSemanaCards melhor={melhorSemana} />
        </motion.div>
      )}

      {saidas && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.95, duration: 0.5 }}
        >
          <SaidasDetalhadas saidas={saidas} />
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.0, duration: 0.5 }}
      >
        <MetasFinanceiras metas={metas} onChange={reloadMetas} />
      </motion.div>
    </motion.div>
  );
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
  // Usa Recharts.PieChart via Pie · simples
  const PieChart = require('recharts').PieChart;
  const Pie = require('recharts').Pie;
  const Cell = require('recharts').Cell;
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

function MetasFinanceiras({ metas, onChange }) {
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const tiposLabel = {
    receita_mensal: 'Receita mensal',
    receita_anual: 'Receita anual',
    despesa_max_mensal: 'Teto despesa mensal',
    saldo_minimo: 'Saldo mínimo',
    pct_categoria: '% por categoria',
    meta_centro_custo: 'Meta centro de custo',
  };

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
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-base font-semibold">Metas Financeiras</h3>
            <p className="text-xs text-muted-foreground">{metas.length} metas ativas</p>
          </div>
          <Button size="sm" onClick={() => { setEditing(null); setShowForm(true); }}>
            + Nova meta
          </Button>
        </div>

        {metas.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma meta cadastrada · crie a primeira pra ver progresso
          </div>
        ) : (
          <div className="space-y-2">
            {metas.map((m, i) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-[10px]">{tiposLabel[m.tipo] || m.tipo}</Badge>
                    <span className="text-sm font-semibold">{m.descricao || tiposLabel[m.tipo]}</span>
                  </div>
                  {(m.plano || m.centro) && (
                    <div className="text-[11px] text-muted-foreground mt-1">
                      {m.plano && `Conta: ${m.plano.codigo} ${m.plano.nome}`}
                      {m.centro && ` · Centro: ${m.centro.codigo} ${m.centro.nome}`}
                    </div>
                  )}
                  {m.observacao && <div className="text-[11px] text-muted-foreground mt-0.5">{m.observacao}</div>}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <div className="text-base font-bold tabular-nums">{fmtMoney(m.valor)}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {m.tipo.includes('mensal') ? '/mês' : m.tipo.includes('anual') ? '/ano' : ''}
                      {m.ano && ` · ${m.ano}`}
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => { setEditing(m); setShowForm(true); }}>
                    Editar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remover(m.id)}>
                    🗑
                  </Button>
                </div>
              </motion.div>
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

function MetaForm({ inicial, onCancel, onSave }) {
  const [form, setForm] = useState({
    tipo: inicial.tipo || 'receita_mensal',
    descricao: inicial.descricao || '',
    valor: inicial.valor || '',
    ano: inicial.ano || new Date().getFullYear(),
    mes_inicio: inicial.mes_inicio || 1,
    mes_fim: inicial.mes_fim || 12,
    observacao: inicial.observacao || '',
    ativa: inicial.ativa !== false,
    id: inicial.id,
  });
  const tipos = [
    { v: 'receita_mensal', l: 'Receita mensal' },
    { v: 'receita_anual', l: 'Receita anual' },
    { v: 'despesa_max_mensal', l: 'Teto despesa mensal' },
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
        <Button size="sm" onClick={() => onSave({ ...form, valor: Number(form.valor) })}>
          {form.id ? 'Salvar' : 'Criar meta'}
        </Button>
      </div>
    </motion.div>
  );
}
