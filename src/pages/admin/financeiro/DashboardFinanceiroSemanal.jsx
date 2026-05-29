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
import DoadoresListDialog from '../../../components/financeiro/DoadoresListDialog';
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
// FILTROS GLOBAIS · persistidos em localStorage
// ============================================================
const LS_FILTROS = 'fin_dashboard_filtros_v1';

function lerFiltrosGlobais() {
  try {
    const raw = localStorage.getItem(LS_FILTROS);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function salvarFiltrosGlobais(f) {
  try {
    localStorage.setItem(LS_FILTROS, JSON.stringify(f || {}));
    window.dispatchEvent(new CustomEvent('fin-filtros-changed', { detail: f }));
  } catch {}
}

function useFiltrosGlobais() {
  const [filtros, setFiltros] = useState(() => lerFiltrosGlobais());
  useEffect(() => {
    const handler = (e) => setFiltros(e.detail || {});
    window.addEventListener('fin-filtros-changed', handler);
    return () => window.removeEventListener('fin-filtros-changed', handler);
  }, []);
  return [filtros, (f) => { salvarFiltrosGlobais(f); setFiltros(f); }];
}

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
// ============================================================
// SLIDES · sequência narrativa pra apresentação de quarta
// ─────────────────────────────────────────────────────────────
// BLOCO 1 · MINISTERIAL — "como foi nossa semana?"
//   Resumo · Por Culto · Performance (freq × arrec)
// BLOCO 2 · ANO · FINANCEIRO ESTRATÉGICO — "como vamos no ano?"
//   Tendências · Saúde · Comparativos · Dízimo × Oferta
// BLOCO 3 · DESPESA + FUTURO — "pra onde vai o dinheiro?"
//   Saídas · Metas
// ============================================================
const SLIDES = [
  // Bloco 1 · semana ministerial
  { key: 'resumo',       label: 'Resumo',         icon: Sparkles,   desc: 'Foto da semana · receita · presença · ticket · decisões' },
  { key: 'por_culto',    label: 'Por Culto',      icon: Calendar,   desc: 'Quarta · final de semana · durante a semana · acumulada' },
  { key: 'performance',  label: 'Performance',    icon: Activity,   desc: 'Frequência × arrecadação semanal' },
  // Bloco 2 · ano · saúde financeira
  { key: 'tendencias',   label: 'Tendências',     icon: TrendingUp, desc: 'Arrecadação anual + acumulado mês a mês' },
  { key: 'saude',        label: 'Saúde',          icon: Activity,   desc: 'Resultado · folha · concentração de doadores' },
  { key: 'comparativos', label: 'Comparativos',   icon: BarChart3,  desc: 'YTD · YoY · decêndio' },
  { key: 'dizimo_oferta',label: 'Dízimo×Oferta',  icon: TrendingUp, desc: 'Proporção da base de contribuição' },
  // Bloco 3 · despesa + futuro
  { key: 'controle',     label: 'Saídas',         icon: Target,     desc: 'Despesas detalhadas · drilldown' },
  { key: 'metas',        label: 'Metas',          icon: Award,      desc: 'Alvos financeiros com filtros' },
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
        <FiltrosFinanceiroBar />
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
          {SLIDES[slide].key === 'resumo' && (
            <Slide0Resumo
              kpis={kpis} cultos={cultos} top_contribuintes={top_contribuintes}
              historico={historico}
            />
          )}
          {SLIDES[slide].key === 'saude' && <SlideSaudeFinanceira />}
          {SLIDES[slide].key === 'por_culto' && (
            <Slide1PorCulto
              buckets={buckets}
              melhorSemana={melhorSemana}
              semana={semana}
            />
          )}
          {SLIDES[slide].key === 'tendencias' && (
            <Slide2Tendencias />
          )}
          {SLIDES[slide].key === 'comparativos' && (
            <Slide3Comparativos
              completo={completo}
            />
          )}
          {SLIDES[slide].key === 'performance' && (
            <Slide4Performance
              completo={completo}
              melhorSemana={melhorSemana}
            />
          )}
          {SLIDES[slide].key === 'dizimo_oferta' && <SlideDizimoOferta />}
          {SLIDES[slide].key === 'controle' && (
            <Slide5Controle
              saidas={saidas}
            />
          )}
          {SLIDES[slide].key === 'metas' && (
            <Slide6Metas
              metas={metas}
              onMetasChange={reloadMetas}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Footer · atalhos + bloco narrativo atual */}
      <div className="text-center text-[10px] text-muted-foreground flex items-center justify-center gap-2 flex-wrap">
        {(() => {
          const bloco = SLIDE_BLOCO[SLIDES[slide].key] || {};
          return bloco.label ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full"
              style={{ background: `${bloco.color}1f`, color: bloco.color }}>
              Bloco {bloco.id} · {bloco.label}
            </span>
          ) : null;
        })()}
        <span>Use ← → no teclado · {slide + 1} de {SLIDES.length}</span>
      </div>
    </div>
  );
}

// ============================================================
// SLIDE NAVIGATION · botões em pílula sticky
// ============================================================
// Mapeia cada slide pro bloco narrativo da apresentação
const SLIDE_BLOCO = {
  resumo: { id: 1, label: 'Ministerial', color: '#00B39D' },
  por_culto: { id: 1, label: 'Ministerial', color: '#00B39D' },
  performance: { id: 1, label: 'Ministerial', color: '#00B39D' },
  tendencias: { id: 2, label: 'Ano', color: '#8b5cf6' },
  saude: { id: 2, label: 'Ano', color: '#8b5cf6' },
  comparativos: { id: 2, label: 'Ano', color: '#8b5cf6' },
  dizimo_oferta: { id: 2, label: 'Ano', color: '#8b5cf6' },
  controle: { id: 3, label: 'Despesa & Metas', color: '#f59e0b' },
  metas: { id: 3, label: 'Despesa & Metas', color: '#f59e0b' },
};

function SlideNav({ current, onChange }) {
  return (
    <div className="flex items-center gap-2 mt-3 overflow-x-auto pb-1">
      {SLIDES.map((s, i) => {
        const active = i === current;
        const Icon = s.icon;
        const bloco = SLIDE_BLOCO[s.key] || { id: 0, label: '', color: '#888' };
        const blocoAnterior = i > 0 ? SLIDE_BLOCO[SLIDES[i - 1].key]?.id : null;
        const showSep = blocoAnterior != null && blocoAnterior !== bloco.id;
        return (
          <span key={s.key} className="contents">
            {showSep && (
              <div className="flex flex-col items-center shrink-0 px-0.5">
                <span className="h-6 w-px bg-border" />
              </div>
            )}
            <motion.button
              onClick={() => onChange(i)}
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.97 }}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all shrink-0 relative ${
                active
                  ? 'text-primary-foreground shadow-sm'
                  : 'bg-card border border-border hover:border-primary/50 text-foreground'
              }`}
              style={active ? { background: bloco.color } : { borderLeftWidth: '3px', borderLeftColor: bloco.color }}
              title={`${bloco.label} · ${s.desc}`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{s.label}</span>
            </motion.button>
          </span>
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

function Slide1PorCulto({ buckets, melhorSemana, semana }) {
  return (
    <>
      {/* 4 Buckets estilo Power BI */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BucketCard custom={0} bucket={buckets.quarta} color={C.blue} semana={semana} />
        <BucketCard custom={1} bucket={buckets.domingo} color={C.primary} semana={semana} />
        <BucketCard custom={2} bucket={buckets.outros} color={C.amber} semana={semana} />
        <BucketCard custom={3} bucket={buckets.acumulada} color={C.purple} isAcumulado semana={semana} />
      </div>

      {/* Melhor semana */}
      {melhorSemana && (melhorSemana.melhor_do_mes || melhorSemana.melhor_do_ano) && (
        <MelhorSemanaCards melhor={melhorSemana} />
      )}
    </>
  );
}

function Slide2Tendencias() {
  return (
    <>
      <ArrecadacaoAnualChart />
      <SazonalidadeSemanalChart />
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
      <ReceitaVsSaidaMensal />
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

function SazonalidadeSemanalChart() {
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);
  const [semanaSel, setSemanaSel] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    financeiroV2.sazonalidadeSemanal()
      .then(r => {
        if (!cancelled) {
          setDados(r);
          setErro(null);
          // Selecionar a última semana do ano corrente que tem dado
          const anoAtual = new Date().getFullYear();
          const corrente = String(anoAtual);
          const ultimaComDado = [...(r.semanas || [])].reverse().find(s => Number(s[corrente]) > 0);
          if (ultimaComDado) setSemanaSel(ultimaComDado.num_semana);
        }
      })
      .catch(e => { if (!cancelled) setErro(e?.message || 'Erro ao carregar sazonalidade'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const anos = dados?.anos || [];
  const semanas = dados?.semanas || [];
  const anoAtual = new Date().getFullYear();
  const anoCorrenteStr = String(anoAtual);

  const corPorAno = (ano, idx) => {
    if (String(ano) === anoCorrenteStr) return COL.primary;
    const paleta = [COL.purple, COL.amber, COL.blue, COL.red, COL.green];
    return paleta[idx % paleta.length];
  };

  const semanaCorrente = useMemo(() => {
    const tmp = new Date();
    const date = new Date(Date.UTC(tmp.getFullYear(), tmp.getMonth(), tmp.getDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  }, []);

  const totaisPorAno = useMemo(() => {
    const out = {};
    anos.forEach(a => {
      const key = String(a);
      out[key] = semanas.reduce((s, m) => s + Number(m[key] || 0), 0);
    });
    return out;
  }, [anos, semanas]);

  const onClickBar = (e) => {
    const payload = e?.activePayload?.[0]?.payload;
    if (payload?.num_semana) setSemanaSel(payload.num_semana);
  };

  const slotSel = semanaSel ? semanas.find(s => s.num_semana === semanaSel) : null;

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between flex-wrap gap-2 mb-3">
          <div>
            <h3 className="text-base font-semibold flex items-center gap-2">
              Sazonalidade Semanal
              <Badge variant="outline" className="text-[10px] font-normal">
                <MousePointer2 className="h-2.5 w-2.5 mr-1" />
                clique numa semana
              </Badge>
            </h3>
            <p className="text-xs text-muted-foreground">
              Compara a mesma semana ISO ao longo dos anos · empréstimos excluídos
            </p>
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Carregando sazonalidade…
          </div>
        )}
        {erro && !loading && (
          <div className="text-sm text-red-500 py-6 text-center">{erro}</div>
        )}

        {!loading && !erro && semanas.length > 0 && (
          <>
            <div style={{ width: '100%', height: 280 }}>
              <ResponsiveContainer>
                <BarChart data={semanas} onClick={onClickBar} barGap={1} barCategoryGap="16%">
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis
                    dataKey="num_semana"
                    tick={{ fontSize: 9 }}
                    interval={3}
                    tickFormatter={(v) => `S${v}`}
                  />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => fmtKbrl(v)} />
                  <Tooltip
                    cursor={{ fill: 'rgba(0,179,157,0.08)' }}
                    formatter={(v, name) => [fmtMoney(v), name]}
                    labelFormatter={(label) => `Semana ${label}`}
                    contentStyle={{ borderRadius: 8, fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {anos.map((ano, idx) => (
                    <Bar
                      key={ano}
                      dataKey={String(ano)}
                      name={String(ano)}
                      fill={corPorAno(ano, idx)}
                      radius={[3, 3, 0, 0]}
                      cursor="pointer"
                      animationDuration={1000}
                    >
                      {semanas.map((s, i) => {
                        const ehSel = s.num_semana === semanaSel;
                        const ehAtual = String(ano) === anoCorrenteStr;
                        const dim = ehAtual && s.num_semana > semanaCorrente;
                        return (
                          <Cell
                            key={`c-${ano}-${i}`}
                            fill={corPorAno(ano, idx)}
                            fillOpacity={dim ? 0.18 : 1}
                            stroke={ehSel ? COL.amber : 'transparent'}
                            strokeWidth={ehSel ? 2 : 0}
                          />
                        );
                      })}
                    </Bar>
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Cards do ano completo */}
            <div className="mt-4 pt-4 border-t border-border">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2 font-medium">
                Acumulado anual
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {anos.map((ano, idx) => {
                  const total = totaisPorAno[String(ano)] || 0;
                  const anoAnt = anos[idx - 1];
                  const totalAnt = anoAnt ? (totaisPorAno[String(anoAnt)] || 0) : 0;
                  const delta = anoAnt && totalAnt > 0 ? ((total - totalAnt) / totalAnt) * 100 : null;
                  const ehAtual = String(ano) === anoCorrenteStr;
                  return (
                    <div
                      key={ano}
                      className="rounded-lg border p-2.5"
                      style={{ borderLeft: `3px solid ${corPorAno(ano, idx)}` }}
                    >
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                        {ano}
                        {ehAtual && <span className="text-[9px] px-1 rounded bg-primary/10 text-primary">em curso</span>}
                      </div>
                      <div className="text-sm font-semibold tabular-nums" style={{ color: corPorAno(ano, idx) }}>
                        {fmtCompact(total)}
                      </div>
                      {delta !== null && (
                        <div className={`text-[10px] mt-0.5 ${delta >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                          {fmtPct(delta)} vs {anoAnt}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Cards da semana selecionada · responsivos ao clique */}
            <AnimatePresence mode="wait">
              {slotSel && (
                <motion.div
                  key={`sem-${semanaSel}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.25 }}
                  className="mt-4 pt-4 border-t border-border"
                >
                  <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
                      Semana selecionada
                    </div>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300">
                      Semana {slotSel.num_semana}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    {anos.map((ano, idx) => {
                      const valor = Number(slotSel[String(ano)] || 0);
                      const label = slotSel[`${ano}_label`];
                      const anoAnt = anos[idx - 1];
                      const valorAnt = anoAnt ? Number(slotSel[String(anoAnt)] || 0) : 0;
                      const delta = anoAnt && valorAnt > 0 ? ((valor - valorAnt) / valorAnt) * 100 : null;
                      const ehAtual = String(ano) === anoCorrenteStr;
                      const ehFuturo = ehAtual && slotSel.num_semana > semanaCorrente;
                      return (
                        <div
                          key={ano}
                          className="rounded-lg border p-3"
                          style={{ borderLeft: `3px solid ${corPorAno(ano, idx)}` }}
                        >
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center justify-between">
                            <span>{ano}</span>
                            {label && <span className="text-[9px] normal-case tracking-normal">{label}</span>}
                          </div>
                          <div className="text-lg font-bold tabular-nums mt-0.5" style={{ color: corPorAno(ano, idx) }}>
                            {ehFuturo ? <span className="text-muted-foreground text-sm">— aguardando</span> : fmtMoney(valor)}
                          </div>
                          {delta !== null && !ehFuturo && (
                            <div className={`text-[11px] ${delta >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                              {fmtPct(delta)} vs {anoAnt}
                            </div>
                          )}
                        </div>
                      );
                    })}
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

function BucketCard({ custom, bucket, color, isAcumulado, semana }) {
  const [drilldown, setDrilldown] = useState(null); // { categoria, color }
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
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                {isAcumulado ? 'Soma da semana' : 'Categorias'}
                {bucket.categorias.length > 0 && (
                  <span className="text-[9px] opacity-60">· clique pra detalhar</span>
                )}
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
                <motion.button
                  key={c.categoria}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4 + custom * 0.08 + i * 0.04 }}
                  onClick={() => setDrilldown({ categoria: c.categoria, color, valor: c.valor })}
                  className="w-full text-left space-y-1 rounded-md p-1 -mx-1 hover:bg-muted/60 transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/30"
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
                </motion.button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {drilldown && semana && (
        <TransacoesDrilldownDialog
          open={!!drilldown}
          onClose={() => setDrilldown(null)}
          titulo={drilldown.categoria}
          subtitulo={`Receitas · ${bucket.nome} · ${semana.inicio} a ${semana.fim}`}
          color={drilldown.color}
          totalEsperado={drilldown.valor}
          fetcher={() => financeiroV2.categoriaTransacoes({
            categoria: drilldown.categoria,
            inicio: semana.inicio,
            fim: semana.fim,
          })}
        />
      )}
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

function SaidasDetalhadas({ saidas: saidasInicial }) {
  const hoje = new Date();
  const anoAtual = hoje.getFullYear();
  const anos = [2022, 2023, 2024, 2025, 2026, 2027].filter(a => a <= anoAtual + 1);
  const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

  // Estado do filtro · inicializa no mês do saidasInicial (ou mês atual)
  const mesInicial = saidasInicial?.mes || hoje.toISOString().slice(0, 7);
  const [ano, setAno] = useState(Number(mesInicial.split('-')[0]));
  const [mes, setMes] = useState(Number(mesInicial.split('-')[1]));
  const [view, setView] = useState('categoria');
  const [drilldown, setDrilldown] = useState(null);
  const [saidas, setSaidas] = useState(saidasInicial);
  const [loading, setLoading] = useState(false);

  const mesLabel = `${ano}-${String(mes).padStart(2, '0')}`;

  // Refetch quando ano/mes muda · usa o saidasInicial se bater com o mês inicial
  useEffect(() => {
    if (saidasInicial?.mes === mesLabel) { setSaidas(saidasInicial); return; }
    let cancelled = false;
    setLoading(true);
    financeiroV2.dashboard.saidasDetalhadas?.(mesLabel)
      .then(r => { if (!cancelled) setSaidas(r); })
      .catch(e => console.warn('[Saidas]:', e?.message))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesLabel]);

  const dados = saidas?.[view];

  const periodo = useMemo(() => {
    const last = new Date(ano, mes, 0).getDate();
    return {
      label: mesLabel,
      inicio: `${mesLabel}-01`,
      fim: `${mesLabel}-${String(last).padStart(2, '0')}`,
    };
  }, [ano, mes, mesLabel]);

  const COLORS_VIEW = {
    categoria: ['#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#10b981', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#f43f5e', '#a855f7'],
    plano: ['#3b82f6', '#06b6d4', '#10b981', '#84cc16', '#eab308', '#f59e0b'],
    centro: ['#8b5cf6', '#ec4899', '#f43f5e', '#a855f7'],
  };
  const palette = COLORS_VIEW[view];

  const onClickLinha = (linha) => {
    const params = { inicio: periodo.inicio, fim: periodo.fim };
    let titulo = '';
    if (view === 'categoria') {
      params.categoria_codigo = linha.categoria_codigo;
      titulo = linha.categoria_nome;
    } else if (view === 'plano') {
      params.plano_codigo = linha.plano_codigo;
      titulo = `${linha.plano_codigo} · ${linha.plano_nome}`;
    } else {
      params.centro_codigo = linha.centro_codigo;
      titulo = `${linha.centro_codigo} · ${linha.centro_nome}`;
    }
    setDrilldown({ titulo, params, valor: Number(linha.total) });
  };

  return (
    <Card className="relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-rose-500 via-amber-500 to-emerald-500" />
      <CardContent className="pt-6">
        <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
          <div>
            <h3 className="text-base font-semibold flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-rose-500" />
              Saídas detalhadas · {MESES[mes - 1]}/{ano}
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </h3>
            <p className="text-xs text-muted-foreground">
              Total: <strong className="text-rose-600 dark:text-rose-400">{fmtMoney(dados?.total || 0)}</strong>
              {dados?.linhas?.length > 0 && (
                <span className="ml-2 opacity-70">· clique numa linha pra ver lançamentos</span>
              )}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            {/* Filtro mês + ano */}
            <div className="flex gap-1.5">
              <select
                value={mes}
                onChange={(e) => setMes(Number(e.target.value))}
                className="px-2 py-1.5 text-xs rounded-md border border-border bg-background"
              >
                {MESES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
              </select>
              <select
                value={ano}
                onChange={(e) => setAno(Number(e.target.value))}
                className="px-2 py-1.5 text-xs rounded-md border border-border bg-background tabular-nums"
              >
                {anos.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            {/* Toggle de visão */}
            <div className="flex gap-1 bg-muted/40 p-1 rounded-lg">
              {[
                { key: 'categoria', label: 'Por categoria' },
                { key: 'plano', label: 'Por plano' },
                { key: 'centro', label: 'Por centro' },
              ].map(t => (
                <button
                  key={t.key}
                  onClick={() => setView(t.key)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${
                    view === t.key
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {!dados?.linhas?.length ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            {loading ? 'Carregando...' : 'Sem despesas classificadas neste mês'}
          </div>
        ) : view === 'categoria' ? (
          <div className="flex flex-col lg:flex-row gap-6">
            <div className="shrink-0 w-full lg:w-[300px] h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChartLite linhas={dados.linhas} colors={palette} />
              </ResponsiveContainer>
            </div>
            <div className="flex-1 min-w-0">
              <SaidasListModerna
                linhas={dados.linhas}
                labelKey="categoria_nome"
                extraKey="categoria_codigo"
                colors={palette}
                onClick={onClickLinha}
              />
            </div>
          </div>
        ) : (
          <SaidasListModerna
            linhas={dados.linhas}
            labelKey={view === 'plano' ? 'plano_nome' : 'centro_nome'}
            extraKey={view === 'plano' ? 'plano_codigo' : 'centro_codigo'}
            colors={palette}
            onClick={onClickLinha}
          />
        )}
      </CardContent>

      {drilldown && (
        <TransacoesDrilldownDialog
          open={!!drilldown}
          onClose={() => setDrilldown(null)}
          titulo={drilldown.titulo}
          subtitulo={`Despesas · ${periodo.inicio} a ${periodo.fim}`}
          color={C.red}
          totalEsperado={drilldown.valor}
          fetcher={() => financeiroV2.despesaTransacoes(drilldown.params)}
        />
      )}
    </Card>
  );
}

// ============================================================
// SaidasListModerna · linhas com barras coloridas + click + animação
// ============================================================
function SaidasListModerna({ linhas, labelKey, extraKey, colors, onClick }) {
  const max = Math.max(...linhas.map(l => Number(l.total)), 1);
  const total = linhas.reduce((s, l) => s + Number(l.total), 0);
  return (
    <div className="space-y-1.5">
      {linhas.slice(0, 15).map((l, i) => {
        const cor = colors[i % colors.length];
        const valor = Number(l.total);
        const pct = (valor / total) * 100;
        const barPct = (valor / max) * 100;
        return (
          <motion.button
            key={i}
            type="button"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.03 }}
            onClick={() => onClick?.(l)}
            className="w-full text-left rounded-lg p-2.5 hover:bg-muted/60 transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/30 group"
          >
            <div className="flex items-baseline justify-between gap-3 mb-1.5">
              <div className="flex items-center gap-2 min-w-0">
                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: cor }} />
                <span className="text-sm font-medium truncate group-hover:text-foreground">{l[labelKey] || '(sem nome)'}</span>
                {extraKey && l[extraKey] && (
                  <span className="text-[10px] text-muted-foreground tabular-nums shrink-0 font-mono">{l[extraKey]}</span>
                )}
              </div>
              <div className="flex items-center gap-3 tabular-nums shrink-0">
                <span className="text-[11px] text-muted-foreground w-12 text-right">{pct.toFixed(1)}%</span>
                <span className="text-sm font-semibold" style={{ color: cor }}>{fmtMoney(valor)}</span>
              </div>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{ background: cor }}
                initial={{ width: 0 }}
                animate={{ width: `${barPct}%` }}
                transition={{ duration: 0.7, delay: i * 0.03 }}
              />
            </div>
          </motion.button>
        );
      })}
      {linhas.length > 15 && (
        <div className="text-[10px] text-muted-foreground text-center pt-2">
          + {linhas.length - 15} categorias menores agrupadas
        </div>
      )}
    </div>
  );
}

// Componente leve · pie chart com cores rotativas
function PieChartLite({ linhas, colors }) {
  const COLORS_PIE = colors || ['#00B39D', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#10b981', '#ef4444', '#06b6d4'];
  const data = linhas.slice(0, 8).map((l, i) => ({
    name: l.categoria_nome || l.plano_nome || l.centro_nome,
    value: Number(l.total),
    color: COLORS_PIE[i % COLORS_PIE.length],
  }));
  return (
    <PieChart>
      <Pie data={data} cx="50%" cy="50%" outerRadius={95} innerRadius={55} dataKey="value" paddingAngle={3} animationDuration={1200}>
        {data.map((d, i) => <Cell key={i} fill={d.color} />)}
      </Pie>
      <Tooltip formatter={(v) => fmtMoney(v)} contentStyle={{ borderRadius: 10, fontSize: 12, border: '1px solid var(--cbrio-border)' }} />
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

// ============================================================
// NOVO · Arrecadação anual (Tendências) · filtro de ano + click → cards
// ============================================================
function ArrecadacaoAnualChart() {
  const anoAtual = new Date().getFullYear();
  const [ano, setAno] = useState(anoAtual);
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedIdx, setSelectedIdx] = useState(null);
  const [filtrosVersion, setFiltrosVersion] = useState(0);

  const anos = [2022, 2023, 2024, 2025, 2026, 2027].filter(a => a <= anoAtual + 1);

  useEffect(() => {
    const h = () => setFiltrosVersion(v => v + 1);
    window.addEventListener('fin-filtros-changed', h);
    return () => window.removeEventListener('fin-filtros-changed', h);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    financeiroV2.arrecadacaoAnual(ano, lerFiltrosGlobais())
      .then((r) => {
        if (cancelled) return;
        setDados(r);
        const meses = r?.meses || [];
        const ultimo = meses.reduceRight((acc, m, i) => acc !== null ? acc : (m.receita > 0 ? i : null), null);
        setSelectedIdx(ultimo);
      })
      .catch((e) => console.warn('[ArrecAnual]:', e?.message))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [ano, filtrosVersion]);

  const meses = dados?.meses || [];
  const total = dados?.total || 0;
  const sel = selectedIdx !== null ? meses[selectedIdx] : null;
  const ant = selectedIdx !== null && selectedIdx > 0 ? meses[selectedIdx - 1] : null;
  const dRec = sel && ant && ant.receita > 0 ? ((sel.receita - ant.receita) / ant.receita) * 100 : null;

  const onBarClick = (e) => {
    if (e?.activePayload?.[0]?.payload) {
      const p = e.activePayload[0].payload;
      if (typeof p.idx === 'number') setSelectedIdx(p.idx);
    }
  };

  const formatado = meses.map((m, i) => ({
    idx: i,
    label: m.mes_label,
    Receita: m.receita,
    Acumulado: m.acumulado,
    qtd: m.qtd,
  }));

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between flex-wrap gap-3 mb-3">
          <div>
            <h3 className="text-base font-semibold flex items-center gap-2">
              Arrecadação Anual · {ano}
              <Badge variant="outline" className="text-[10px] font-normal">
                <MousePointer2 className="h-2.5 w-2.5 mr-1" />
                clique num mês
              </Badge>
            </h3>
            <p className="text-xs text-muted-foreground">
              Total no ano: <strong>{fmtMoney(total)}</strong> · barras mensais + acumulado · empréstimos excluídos
            </p>
          </div>
          <div className="flex gap-1 flex-wrap">
            {anos.map(a => (
              <button
                key={a}
                onClick={() => setAno(a)}
                className={`px-2.5 py-1 text-[11px] rounded-md font-medium transition ${
                  ano === a ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {a}
              </button>
            ))}
          </div>
        </div>
        {loading ? (
          <div className="py-16 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : total === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Sem dados de {ano} · selecione outro ano</div>
        ) : (
          <>
            <div style={{ width: '100%', height: 320 }}>
              <ResponsiveContainer>
                <ComposedChart data={formatado} onClick={onBarClick} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradArrecAnual" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.primary} stopOpacity={0.9} />
                      <stop offset="100%" stopColor={C.primary} stopOpacity={0.4} />
                    </linearGradient>
                    <linearGradient id="gradArrecAnualSel" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.amber} stopOpacity={1} />
                      <stop offset="100%" stopColor={C.amber} stopOpacity={0.55} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 10 }} tickFormatter={(v) => fmtCompact(v).replace('R$ ', '')} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} tickFormatter={(v) => fmtCompact(v).replace('R$ ', '')} />
                  <Tooltip cursor={{ fill: 'rgba(0,179,157,0.08)' }} formatter={(v) => fmtMoney(v)} contentStyle={{ borderRadius: 10, fontSize: 12, border: '1px solid var(--cbrio-border)' }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} />
                  <Bar yAxisId="left" dataKey="Receita" radius={[6, 6, 0, 0]} animationDuration={1200} cursor="pointer">
                    {formatado.map((entry, i) => (
                      <Cell key={i} fill={i === selectedIdx ? 'url(#gradArrecAnualSel)' : 'url(#gradArrecAnual)'} stroke={i === selectedIdx ? C.amber : 'transparent'} strokeWidth={i === selectedIdx ? 2 : 0} />
                    ))}
                  </Bar>
                  <Line yAxisId="right" type="monotone" dataKey="Acumulado" stroke={C.purple} strokeWidth={2.5} dot={{ r: 3 }} animationDuration={1500} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <AnimatePresence mode="wait">
              {sel && (
                <motion.div
                  key={`anosel-${selectedIdx}`}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.4 }}
                  className="mt-4 pt-4 border-t border-border"
                >
                  <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                    <span className="text-xs text-muted-foreground">Mês selecionado</span>
                    <span className="text-sm font-semibold px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300">
                      {sel.mes_label}/{String(ano).slice(2)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <SemanaCard label="Arrecadação do mês" icon={Banknote} accent={C.green} valor={fmtMoney(sel.receita)} delta={dRec} sub="vs mês anterior" anim={`r-${selectedIdx}`} />
                    <SemanaCard label="Acumulado no ano" icon={TrendingUp} accent={C.purple} valor={fmtMoney(sel.acumulado)} delta={null} sub={`até ${sel.mes_label}`} anim={`a-${selectedIdx}`} />
                    <SemanaCard label="Lançamentos" icon={FileText} accent={C.blue} valor={fmtInt(sel.qtd)} delta={null} sub="no mês" anim={`q-${selectedIdx}`} />
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

// ============================================================
// NOVO · Receita vs Saída mensal (barras lado a lado · Performance)
// ============================================================
function ReceitaVsSaidaMensal() {
  const anoAtual = new Date().getFullYear();
  const [ano, setAno] = useState(anoAtual);
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedIdx, setSelectedIdx] = useState(null);
  const [filtrosVersion, setFiltrosVersion] = useState(0);

  const anos = [2022, 2023, 2024, 2025, 2026, 2027].filter(a => a <= anoAtual + 1);

  useEffect(() => {
    const h = () => setFiltrosVersion(v => v + 1);
    window.addEventListener('fin-filtros-changed', h);
    return () => window.removeEventListener('fin-filtros-changed', h);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    financeiroV2.arrecadacaoAnual(ano, lerFiltrosGlobais())
      .then((r) => {
        if (cancelled) return;
        setDados(r);
        const meses = r?.meses || [];
        const ultimo = meses.reduceRight((acc, m, i) => acc !== null ? acc : ((m.receita > 0 || m.despesa > 0) ? i : null), null);
        setSelectedIdx(ultimo);
      })
      .catch((e) => console.warn('[RecVsSai]:', e?.message))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [ano, filtrosVersion]);

  const meses = dados?.meses || [];
  const sel = selectedIdx !== null ? meses[selectedIdx] : null;

  const onBarClick = (e) => {
    if (e?.activePayload?.[0]?.payload) {
      const p = e.activePayload[0].payload;
      if (typeof p.idx === 'number') setSelectedIdx(p.idx);
    }
  };

  const formatado = meses.map((m, i) => ({
    idx: i, label: m.mes_label,
    Receita: m.receita, Despesa: m.despesa, Resultado: m.resultado,
  }));

  const totalReceita = meses.reduce((s, m) => s + m.receita, 0);
  const totalDespesa = meses.reduce((s, m) => s + m.despesa, 0);
  const resultadoAno = totalReceita - totalDespesa;

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between flex-wrap gap-3 mb-3">
          <div>
            <h3 className="text-base font-semibold flex items-center gap-2">
              Receita × Saída mensal · {ano}
              <Badge variant="outline" className="text-[10px] font-normal">
                <MousePointer2 className="h-2.5 w-2.5 mr-1" />
                clique num mês
              </Badge>
            </h3>
            <p className="text-xs text-muted-foreground">
              Resultado do ano: <strong className={resultadoAno >= 0 ? 'text-emerald-600' : 'text-rose-600'}>{fmtMoney(resultadoAno)}</strong>
              · empréstimos e transferências excluídos
            </p>
          </div>
          <div className="flex gap-1 flex-wrap">
            {anos.map(a => (
              <button key={a} onClick={() => setAno(a)} className={`px-2.5 py-1 text-[11px] rounded-md font-medium transition ${ano === a ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
                {a}
              </button>
            ))}
          </div>
        </div>
        {loading ? (
          <div className="py-16 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : meses.every(m => m.receita === 0 && m.despesa === 0) ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Sem dados de {ano}</div>
        ) : (
          <>
            <div style={{ width: '100%', height: 340 }}>
              <ResponsiveContainer>
                <BarChart data={formatado} onClick={onBarClick} barGap={4} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradMesReceita" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.green} stopOpacity={0.95} />
                      <stop offset="100%" stopColor={C.green} stopOpacity={0.5} />
                    </linearGradient>
                    <linearGradient id="gradMesDespesa" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.red} stopOpacity={0.95} />
                      <stop offset="100%" stopColor={C.red} stopOpacity={0.5} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => fmtCompact(v).replace('R$ ', '')} />
                  <Tooltip cursor={{ fill: 'rgba(0,179,157,0.06)' }} formatter={(v) => fmtMoney(v)} contentStyle={{ borderRadius: 10, fontSize: 12, border: '1px solid var(--cbrio-border)' }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} />
                  <Bar dataKey="Receita" radius={[6, 6, 0, 0]} animationDuration={1200} cursor="pointer">
                    {formatado.map((entry, i) => (
                      <Cell key={i} fill="url(#gradMesReceita)" stroke={i === selectedIdx ? C.amber : 'transparent'} strokeWidth={i === selectedIdx ? 2 : 0} />
                    ))}
                  </Bar>
                  <Bar dataKey="Despesa" radius={[6, 6, 0, 0]} animationDuration={1400} cursor="pointer">
                    {formatado.map((entry, i) => (
                      <Cell key={i} fill="url(#gradMesDespesa)" stroke={i === selectedIdx ? C.amber : 'transparent'} strokeWidth={i === selectedIdx ? 2 : 0} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <AnimatePresence mode="wait">
              {sel && (
                <motion.div
                  key={`rvs-${selectedIdx}`}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.4 }}
                  className="mt-4 pt-4 border-t border-border"
                >
                  <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                    <span className="text-xs text-muted-foreground">Mês selecionado</span>
                    <span className="text-sm font-semibold px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300">
                      {sel.mes_label}/{String(ano).slice(2)}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <SemanaCard label="Arrecadação" icon={Banknote} accent={C.green} valor={fmtMoney(sel.receita)} delta={null} sub="no mês" anim={`r-${selectedIdx}`} />
                    <SemanaCard label="Saídas" icon={TrendingDown} accent={C.red} valor={fmtMoney(sel.despesa)} delta={null} sub="no mês" anim={`d-${selectedIdx}`} />
                    <SemanaCard label="Resultado" icon={Activity} accent={sel.resultado >= 0 ? C.green : C.red} valor={fmtMoney(sel.resultado)} delta={null} sub="receita − despesa" anim={`res-${selectedIdx}`} />
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

// ============================================================
// TransacoesDrilldownDialog · modal compartilhado (categoria/despesa)
// ============================================================
function TransacoesDrilldownDialog({ open, onClose, titulo, subtitulo, color = C.primary, totalEsperado, fetcher }) {
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setBusca('');
    fetcher()
      .then(r => { if (!cancelled) setDados(r); })
      .catch(e => console.warn('[Drilldown]:', e?.message))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const transacoes = (dados?.transacoes || []).filter(t => {
    if (!busca) return true;
    const q = busca.toLowerCase();
    return (
      String(t.referencia || '').toLowerCase().includes(q) ||
      String(t.descricao || '').toLowerCase().includes(q) ||
      String(t.plano_contas_nome || '').toLowerCase().includes(q)
    );
  });

  const total = dados?.total || 0;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-4xl max-h-[88vh] bg-card rounded-2xl shadow-2xl overflow-hidden border border-border flex flex-col"
          >
            <div className="relative px-6 py-4 border-b border-border" style={{ background: `linear-gradient(135deg, ${color}15, transparent)` }}>
              <div className="absolute top-0 left-0 right-0 h-1" style={{ background: color }} />
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="text-lg font-bold truncate" style={{ color }}>{titulo}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{subtitulo}</p>
                </div>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition shrink-0"
                  aria-label="Fechar"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-4 mt-4">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</div>
                  <div className="text-xl font-bold tabular-nums" style={{ color }}>{fmtMoney(total)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Lançamentos</div>
                  <div className="text-xl font-bold tabular-nums">{fmtInt(dados?.qtd || 0)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Média</div>
                  <div className="text-xl font-bold tabular-nums">
                    {fmtMoney(dados?.qtd ? total / dados.qtd : 0)}
                  </div>
                </div>
              </div>
              {totalEsperado != null && Math.abs(total - totalEsperado) > 0.5 && !loading && (
                <div className="mt-2 text-[10px] text-amber-600 dark:text-amber-400">
                  Total esperado: {fmtMoney(totalEsperado)} · diff {fmtMoney(total - totalEsperado)}
                </div>
              )}
            </div>

            <div className="px-6 py-3 border-b border-border bg-muted/30">
              <input
                type="text"
                placeholder="Filtrar por nome, descrição, plano de contas..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              {loading ? (
                <div className="py-20 flex justify-center">
                  <Loader2 className="h-7 w-7 animate-spin text-primary" />
                </div>
              ) : transacoes.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  {busca ? 'Nenhum lançamento bate com a busca' : 'Sem lançamentos neste período'}
                </div>
              ) : (
                <div className="space-y-1">
                  {transacoes.slice(0, 200).map((t, i) => (
                    <motion.div
                      key={t.id || i}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(i * 0.01, 0.5) }}
                      className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg hover:bg-muted/50 transition border border-transparent hover:border-border"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium truncate">
                            {t.referencia || t.descricao || '(sem nome)'}
                          </span>
                          {t.plano_contas_codigo && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground tabular-nums">
                              {t.plano_contas_codigo}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {t.data_competencia} · {t.plano_contas_nome || t.descricao || '—'}
                          {t.centro_custo_nome && ` · ${t.centro_custo_nome}`}
                        </div>
                      </div>
                      <div className="text-sm font-semibold tabular-nums shrink-0" style={{ color }}>
                        {fmtMoney(t.valor)}
                      </div>
                    </motion.div>
                  ))}
                  {transacoes.length > 200 && (
                    <div className="text-[10px] text-muted-foreground text-center pt-3">
                      Mostrando 200 de {fmtInt(transacoes.length)} · refine a busca pra ver mais
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ============================================================
// FiltrosFinanceiroBar · filtros globais (Centro Custo + Plano Contas)
// Persistidos em localStorage · disparam evento global pra reload
// ============================================================
function FiltrosFinanceiroBar() {
  const [filtros, setFiltros] = useFiltrosGlobais();
  const [opcoes, setOpcoes] = useState({ planos: [], centros: [] });
  const [open, setOpen] = useState(false);
  const [buscaCentro, setBuscaCentro] = useState('');
  const [buscaPlano, setBuscaPlano] = useState('');

  useEffect(() => {
    financeiroV2.filtrosDisponiveis()
      .then(setOpcoes)
      .catch(() => {});
  }, []);

  const ativos = (filtros.centro_custo_id ? 1 : 0) + (filtros.plano_contas_id ? 1 : 0);
  const centroSel = opcoes.centros.find(c => c.id === filtros.centro_custo_id);
  const planoSel = opcoes.planos.find(p => p.id === filtros.plano_contas_id);

  const setCentro = (id) => setFiltros({ ...filtros, centro_custo_id: id || null });
  const setPlano = (id) => setFiltros({ ...filtros, plano_contas_id: id || null });
  const limpar = () => setFiltros({});

  const planosFiltrados = buscaPlano
    ? opcoes.planos.filter(p =>
        `${p.codigo} ${p.nome}`.toLowerCase().includes(buscaPlano.toLowerCase()))
    : opcoes.planos.slice(0, 50);
  const centrosFiltrados = buscaCentro
    ? opcoes.centros.filter(c =>
        `${c.codigo} ${c.nome}`.toLowerCase().includes(buscaCentro.toLowerCase()))
    : opcoes.centros.slice(0, 50);

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border text-xs hover:bg-muted transition"
      >
        <Filter className="h-3.5 w-3.5" />
        <span className="font-medium">Filtros globais</span>
        {ativos > 0 && (
          <span className="px-1.5 py-0.5 rounded bg-primary text-primary-foreground text-[10px] font-bold tabular-nums">
            {ativos}
          </span>
        )}
        {ativos === 0 && <span className="text-muted-foreground">· nenhum</span>}
      </button>

      {(ativos > 0 || open) && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center gap-2 ml-2 text-[11px]"
        >
          {centroSel && (
            <span className="px-2 py-1 rounded-md bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 inline-flex items-center gap-1">
              <span className="font-mono">{centroSel.codigo}</span>
              <span className="truncate max-w-[180px]">{centroSel.nome}</span>
              <button onClick={() => setCentro(null)} className="hover:opacity-70"><X className="h-3 w-3" /></button>
            </span>
          )}
          {planoSel && (
            <span className="px-2 py-1 rounded-md bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 inline-flex items-center gap-1">
              <span className="font-mono">{planoSel.codigo}</span>
              <span className="truncate max-w-[180px]">{planoSel.nome}</span>
              <button onClick={() => setPlano(null)} className="hover:opacity-70"><X className="h-3 w-3" /></button>
            </span>
          )}
          {ativos > 0 && (
            <button onClick={limpar} className="text-muted-foreground hover:text-foreground">
              limpar tudo
            </button>
          )}
        </motion.div>
      )}

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 overflow-hidden"
          >
            <Card>
              <CardContent className="p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2">
                  Centro de Custo
                </div>
                <input
                  type="text"
                  placeholder="Buscar centro..."
                  value={buscaCentro}
                  onChange={(e) => setBuscaCentro(e.target.value)}
                  className="w-full px-2 py-1 text-xs bg-background border border-border rounded-md mb-2"
                />
                <div className="max-h-48 overflow-y-auto space-y-0.5">
                  {centrosFiltrados.map(c => (
                    <button
                      key={c.id}
                      onClick={() => { setCentro(c.id); setOpen(false); setBuscaCentro(''); }}
                      className={`w-full text-left px-2 py-1 text-xs rounded hover:bg-muted transition ${
                        filtros.centro_custo_id === c.id ? 'bg-primary/15 text-primary font-semibold' : ''
                      }`}
                    >
                      <span className="font-mono mr-2 text-muted-foreground">{c.codigo}</span>
                      {c.nome}
                    </button>
                  ))}
                  {centrosFiltrados.length === 0 && (
                    <div className="text-[11px] text-muted-foreground py-2 text-center">Nada encontrado</div>
                  )}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2">
                  Plano de Contas
                </div>
                <input
                  type="text"
                  placeholder="Buscar plano..."
                  value={buscaPlano}
                  onChange={(e) => setBuscaPlano(e.target.value)}
                  className="w-full px-2 py-1 text-xs bg-background border border-border rounded-md mb-2"
                />
                <div className="max-h-48 overflow-y-auto space-y-0.5">
                  {planosFiltrados.map(p => (
                    <button
                      key={p.id}
                      onClick={() => { setPlano(p.id); setOpen(false); setBuscaPlano(''); }}
                      className={`w-full text-left px-2 py-1 text-xs rounded hover:bg-muted transition ${
                        filtros.plano_contas_id === p.id ? 'bg-primary/15 text-primary font-semibold' : ''
                      }`}
                    >
                      <span className="font-mono mr-2 text-muted-foreground">{p.codigo}</span>
                      {p.nome}
                    </button>
                  ))}
                  {planosFiltrados.length === 0 && (
                    <div className="text-[11px] text-muted-foreground py-2 text-center">Nada encontrado</div>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================================
// SlideSaudeFinanceira · resultado + folha + concentração doadores
// ============================================================
function SlideSaudeFinanceira() {
  const anoAtual = new Date().getFullYear();
  const [ano, setAno] = useState(anoAtual);
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showDoadores, setShowDoadores] = useState(false);
  const anos = [2022, 2023, 2024, 2025, 2026, 2027].filter(a => a <= anoAtual + 1);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    financeiroV2.saudeFinanceira(ano)
      .then(r => { if (!cancelled) setDados(r); })
      .catch(e => console.warn('[Saude]:', e?.message))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [ano]);

  if (loading && !dados) {
    return <div className="py-20 flex justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>;
  }
  if (!dados) return <div className="py-12 text-center text-sm text-muted-foreground">Sem dados</div>;

  const resMes = Number(dados.resultado_mes || 0);
  const resYtd = Number(dados.resultado_ytd || 0);
  const res12m = Number(dados.resultado_12m || 0);
  const pctFolha = Number(dados.pct_folha || 0);
  const top20 = Number(dados.concentracao_top20pct_pct || 0);
  const top10 = Number(dados.concentracao_top10_pct || 0);
  const mesesVermelho = Number(dados.meses_vermelho || 0);
  const mesesDado = Number(dados.meses_com_dado || 0);

  // Folha · faixa de saúde (verde ≤45 · âmbar ≤55 · vermelho >55)
  const folhaCor = pctFolha <= 45 ? C.green : pctFolha <= 55 ? C.amber : C.red;
  const folhaLabel = pctFolha <= 45 ? 'saudável' : pctFolha <= 55 ? 'atenção' : 'crítico';
  // Concentração · verde <60 · âmbar <80 · vermelho ≥80
  const concCor = top20 < 60 ? C.green : top20 < 80 ? C.amber : C.red;
  const concLabel = top20 < 60 ? 'base diluída' : top20 < 80 ? 'concentração média' : 'concentração alta';

  return (
    <>
      <Card className="relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-amber-500 to-rose-500" />
        <CardContent className="pt-6">
          <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
            <div>
              <h3 className="text-base font-semibold flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                Saúde Financeira · {ano}
              </h3>
              <p className="text-xs text-muted-foreground">
                Resultado operacional · comprometimento com folha · risco de concentração ·
                empréstimos e transferências excluídos
              </p>
            </div>
            <div className="flex gap-1 flex-wrap">
              {anos.map(a => (
                <button key={a} onClick={() => setAno(a)}
                  className={`px-2.5 py-1 text-[11px] rounded-md font-medium transition ${ano === a ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
                  {a}
                </button>
              ))}
            </div>
          </div>

          {/* Linha 1 · resultados */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <SaudeResultadoCard label="Resultado do mês" valor={resMes} sub={dados.mes_atual} />
            <SaudeResultadoCard label="Resultado no ano (YTD)" valor={resYtd} sub={`receita − despesa · ${ano}`} destaque />
            <SaudeResultadoCard label="Resultado 12 meses" valor={res12m} sub={`${mesesVermelho} de ${mesesDado} meses no vermelho`} />
          </div>

          {/* Linha 2 · folha + concentração */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Folha */}
            <div className="rounded-xl border border-border p-4 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1" style={{ background: folhaCor }} />
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Comprometimento com folha (RH)</span>
                <Users className="h-4 w-4" style={{ color: folhaCor }} />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold tabular-nums" style={{ color: folhaCor }}>{pctFolha.toFixed(1)}%</span>
                <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: `${folhaCor}1f`, color: folhaCor }}>{folhaLabel}</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden mt-3">
                <motion.div className="h-full rounded-full" style={{ background: folhaCor }}
                  initial={{ width: 0 }} animate={{ width: `${Math.min(100, pctFolha)}%` }} transition={{ duration: 1 }} />
              </div>
              <div className="text-[11px] text-muted-foreground mt-2 tabular-nums">
                {fmtMoney(dados.folha_ytd)} de {fmtMoney(dados.receita_ytd)} · benchmark saudável ≤ 45%
              </div>
            </div>

            {/* Concentração de doadores · clicável → abre lista completa */}
            <button
              type="button"
              onClick={() => setShowDoadores(true)}
              className="rounded-xl border border-border p-4 relative overflow-hidden text-left transition hover:border-primary/50 hover:shadow-md group"
            >
              <div className="absolute top-0 left-0 right-0 h-1" style={{ background: concCor }} />
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Concentração de doadores</span>
                <Award className="h-4 w-4" style={{ color: concCor }} />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold tabular-nums" style={{ color: concCor }}>{top20.toFixed(0)}%</span>
                <span className="text-xs text-muted-foreground">da arrecadação vem dos top 20% doadores</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden mt-3">
                <motion.div className="h-full rounded-full" style={{ background: concCor }}
                  initial={{ width: 0 }} animate={{ width: `${Math.min(100, top20)}%` }} transition={{ duration: 1 }} />
              </div>
              <div className="text-[11px] text-muted-foreground mt-2 tabular-nums flex items-center justify-between gap-2">
                <span>{fmtInt(dados.doadores_qtd)} doadores · top 10 pessoas = {top10.toFixed(1)}% · <span style={{ color: concCor }}>{concLabel}</span></span>
                <span className="text-[10px] text-primary opacity-0 group-hover:opacity-100 transition">ver lista →</span>
              </div>
            </button>
          </div>

          <DoadoresListDialog open={showDoadores} onClose={() => setShowDoadores(false)} ano={ano} />

          {resYtd < 0 && (
            <div className="mt-4 flex items-start gap-2 p-3 rounded-lg bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30">
              <TrendingDown className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
              <div className="text-xs text-rose-700 dark:text-rose-300">
                <strong>Atenção:</strong> a igreja está operando com déficit de {fmtMoney(Math.abs(resYtd))} no ano —
                gastando mais do que arrecada (excluindo empréstimos). Recomenda-se revisar despesas ou reforçar arrecadação.
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function SaudeResultadoCard({ label, valor, sub, destaque }) {
  const positivo = valor >= 0;
  const cor = positivo ? C.green : C.red;
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
      className={`rounded-xl border p-4 relative overflow-hidden ${destaque ? 'border-primary/40 bg-primary/5' : 'border-border'}`}
    >
      <div className="absolute top-0 left-0 right-0 h-1" style={{ background: cor }} />
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">{label}</div>
      <div className="text-2xl font-bold tabular-nums flex items-center gap-1" style={{ color: cor }}>
        {positivo ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
        {fmtMoney(Math.abs(valor))}
      </div>
      <div className="text-[11px] text-muted-foreground mt-1">{positivo ? 'superávit' : 'déficit'} · {sub}</div>
    </motion.div>
  );
}

// ============================================================
// SlideDizimoOferta · proporção dízimo/oferta mês a mês
// ============================================================
function SlideDizimoOferta() {
  const anoAtual = new Date().getFullYear();
  const [ano, setAno] = useState(anoAtual);
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(true);
  const anos = [2022, 2023, 2024, 2025, 2026, 2027].filter(a => a <= anoAtual + 1);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    financeiroV2.dizimoOferta(ano)
      .then(r => { if (!cancelled) setDados(r); })
      .catch(e => console.warn('[DizOf]:', e?.message))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [ano]);

  const meses = dados?.meses || [];
  const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const formatado = meses.map(m => ({
    label: MESES[(m.mes_num || 1) - 1],
    Dízimo: Number(m.dizimo || 0),
    Oferta: Number(m.oferta || 0),
    pct: Number(m.pct_dizimo || 0),
  }));

  const totalDiz = meses.reduce((s, m) => s + Number(m.dizimo || 0), 0);
  const totalOf = meses.reduce((s, m) => s + Number(m.oferta || 0), 0);
  const pctDizGeral = (totalDiz + totalOf) > 0 ? (totalDiz / (totalDiz + totalOf)) * 100 : 0;

  return (
    <Card className="relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-teal-500 to-sky-500" />
      <CardContent className="pt-6">
        <div className="flex items-start justify-between flex-wrap gap-3 mb-3">
          <div>
            <h3 className="text-base font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Dízimo × Oferta · {ano}
            </h3>
            <p className="text-xs text-muted-foreground">
              Proporção da base de contribuição · dízimo é recorrente, oferta é eventual ·
              ano: <strong>{pctDizGeral.toFixed(0)}% dízimo</strong> / {(100 - pctDizGeral).toFixed(0)}% oferta
            </p>
          </div>
          <div className="flex gap-1 flex-wrap">
            {anos.map(a => (
              <button key={a} onClick={() => setAno(a)}
                className={`px-2.5 py-1 text-[11px] rounded-md font-medium transition ${ano === a ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
                {a}
              </button>
            ))}
          </div>
        </div>
        {loading && !dados ? (
          <div className="py-16 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : formatado.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Sem dados de {ano}</div>
        ) : (
          <div style={{ width: '100%', height: 340 }}>
            <ResponsiveContainer>
              <ComposedChart data={formatado} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradDiz" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C.primary} stopOpacity={0.95} />
                    <stop offset="100%" stopColor={C.primary} stopOpacity={0.55} />
                  </linearGradient>
                  <linearGradient id="gradOf" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C.blue} stopOpacity={0.95} />
                    <stop offset="100%" stopColor={C.blue} stopOpacity={0.55} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 10 }} tickFormatter={(v) => fmtCompact(v).replace('R$ ', '')} />
                <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
                <Tooltip
                  formatter={(v, n) => n === '% dízimo' ? [`${Number(v).toFixed(1)}%`, n] : [fmtMoney(v), n]}
                  contentStyle={{ borderRadius: 10, fontSize: 12, border: '1px solid var(--cbrio-border)' }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} />
                <Bar yAxisId="left" dataKey="Dízimo" stackId="a" fill="url(#gradDiz)" radius={[0, 0, 0, 0]} animationDuration={1200} />
                <Bar yAxisId="left" dataKey="Oferta" stackId="a" fill="url(#gradOf)" radius={[6, 6, 0, 0]} animationDuration={1300} />
                <Line yAxisId="right" type="monotone" dataKey="pct" name="% dízimo" stroke={C.purple} strokeWidth={2.5} dot={{ r: 3 }} animationDuration={1600} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
