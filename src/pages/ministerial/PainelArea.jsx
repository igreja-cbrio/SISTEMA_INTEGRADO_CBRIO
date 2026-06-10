// ============================================================================
// PainelArea v4 · visualização de culto + KPIs agrupados por valor da Jornada
// ============================================================================
// Mudanças v4 (2026-06-10 · pedido do Marcos · "UI/UX podem ser melhor"):
//   - Aba Cultos: cards de resumo com MÉDIA POR CULTO + tendência vs mês
//     anterior, gráfico mensal (barras de frequência média + linha de
//     decisões · serie_cultos do backend) e tabela de cultos com barra
//     comparativa (de relance: acima/abaixo da média)
//   - Aba Indicadores: filtro de pills REMOVIDO · KPIs agrupados em seções
//     por valor da Jornada, em cards com cor de status + progresso vs meta
//   - NPS destacado: nota grande em escala 0-10 visual
//   - Aba Dados: mesmo agrupamento por valor (sem pills)
// ============================================================================

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { painelArea as api } from '../../api';
import { Card } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { ArrowLeft, ChevronRight, Plus, TrendingUp, TrendingDown, Minus, Users, Sparkles, CalendarDays, Trophy } from 'lucide-react';
import { toast } from 'sonner';
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis,
  Tooltip as RTooltip, CartesianGrid, Legend,
} from 'recharts';
import JornadaConvertidos from '../../components/JornadaConvertidos';

const AREA_META = {
  kids: {
    nome: 'Kids',
    descricao: 'Indicadores do ministério infantil',
    accent: '#EC4899',
    accentSoft: 'rgba(236, 72, 153, 0.08)',
    accentBorder: 'rgba(236, 72, 153, 0.30)',
  },
  ami: {
    nome: 'AMI',
    descricao: 'Indicadores do culto AMI (adolescentes e jovens)',
    accent: '#8B5CF6',
    accentSoft: 'rgba(139, 92, 246, 0.08)',
    accentBorder: 'rgba(139, 92, 246, 0.30)',
  },
  bridge: {
    nome: 'Bridge',
    descricao: 'Indicadores do culto Bridge (transição entre AMI e Sede)',
    accent: '#3B82F6',
    accentSoft: 'rgba(59, 130, 246, 0.08)',
    accentBorder: 'rgba(59, 130, 246, 0.30)',
  },
  online: {
    nome: 'Online',
    descricao: 'Indicadores do culto Online (YouTube)',
    accent: '#EF4444',
    accentSoft: 'rgba(239, 68, 68, 0.08)',
    accentBorder: 'rgba(239, 68, 68, 0.30)',
  },
};

const VALOR_LABELS = {
  seguir: 'Seguir a Jesus',
  conectar: 'Conectar com Pessoas',
  investir: 'Investir Tempo com Deus',
  servir: 'Servir em Comunidade',
  generosidade: 'Viver Generosamente',
};

const VALOR_CORES = {
  seguir: '#8B5CF6',
  conectar: '#3B82F6',
  investir: '#F59E0B',
  servir: '#10B981',
  generosidade: '#EC4899',
};

const ORDEM_VALORES = ['seguir', 'conectar', 'investir', 'servir', 'generosidade'];

const STATUS_META = {
  no_alvo:   { label: 'No alvo',  color: '#10b981', className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
  atrasado:  { label: 'Atrasado', color: '#f59e0b', className: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  critico:   { label: 'Crítico',  color: '#ef4444', className: 'bg-red-500/15 text-red-700 dark:text-red-400' },
  sem_dado:  { label: 'Sem dado', color: '#94a3b8', className: 'bg-muted text-muted-foreground' },
};

const SAUDE_META = {
  saudavel: { label: 'Saudável', color: '#10b981', bg: '#10b98115' },
  atencao:  { label: 'Atenção',  color: '#f59e0b', bg: '#f59e0b15' },
  risco:    { label: 'Em risco', color: '#ef4444', bg: '#ef444415' },
  critico:  { label: 'Crítico',  color: '#dc2626', bg: '#dc262615' },
};

const PERIODOS = [
  { id: '30d',  label: '30 dias' },
  { id: '90d',  label: '90 dias' },
  { id: '180d', label: '6 meses' },
  { id: '365d', label: '1 ano' },
];

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

function statusKey(traj) {
  if (!traj || traj.ultimo_valor == null) return 'sem_dado';
  return traj.status_trajetoria || 'sem_dado';
}

function formatNum(v) {
  if (v == null) return '—';
  return Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

function formatData(d) {
  if (!d) return '';
  try {
    const parts = d.split('-');
    return `${parts[2]}/${parts[1]}`;
  } catch { return d; }
}

function formatDataCompleta(d) {
  if (!d) return '';
  try {
    const [a, m, dia] = d.split('-');
    return `${dia}/${m}/${a}`;
  } catch { return d; }
}

function formatMes(mes) {
  if (!mes) return '';
  try {
    const [a, m] = mes.split('-');
    return `${MESES_CURTOS[Number(m) - 1]}/${a.slice(2)}`;
  } catch { return mes; }
}

function diaSemana(d) {
  try {
    const dt = new Date(`${d}T12:00:00`);
    return DIAS_SEMANA[dt.getDay()];
  } catch { return ''; }
}

// Frequência/decisões "da área" pra um culto (mesma regra do backend)
function freqDoCulto(c, area) {
  if (area === 'kids') return c.presencial_kids;
  if (area === 'online') return c.online_pico;
  return c.presencial_adulto;
}
function decisoesDoCulto(c, area) {
  if (area === 'kids') return c.decisoes_kids ?? 0;
  if (area === 'online') return c.decisoes_online ?? 0;
  return (c.decisoes_presenciais ?? 0) + (c.decisoes_online ?? 0);
}

export default function PainelArea({ area }) {
  const navigate = useNavigate();
  const { isAdmin, getAccessLevel } = useAuth();
  const meta = AREA_META[area] || AREA_META.online;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState('90d');

  const podePreencher = isAdmin || (getAccessLevel?.([area]) ?? 0) >= 3;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.get(area, { periodo })
      .then(d => { if (!cancelled) setData(d); })
      .catch(e => { if (!cancelled) toast.error(e.message || 'Erro ao carregar área'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [area, periodo]);

  const npsDestaque = useMemo(() => {
    if (!data?.kpis) return [];
    return data.kpis.filter(k => /^CULTO-NPS-/i.test(k.id));
  }, [data]);

  const kpisRegulares = useMemo(() => {
    if (!data?.kpis) return [];
    return data.kpis.filter(k => !/^CULTO-NPS-/i.test(k.id));
  }, [data]);

  if (loading && !data) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6">
        <Card className="p-8 text-center text-muted-foreground">
          Não foi possível carregar os dados.
        </Card>
      </div>
    );
  }

  const saude = data.saude || {};
  const saudeMeta = SAUDE_META[saude.diagnostico] || SAUDE_META.atencao;
  const cultos = data.cultos_recentes || [];
  const totaisCultos = data.totais_cultos;
  const serieCultos = data.serie_cultos || [];
  const temCultos = cultos.length > 0;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* ─────────────────────────── BREADCRUMB ─────────────────────────── */}
      <button
        onClick={() => navigate('/painel')}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Painel CBRio
        <ChevronRight className="h-3 w-3 opacity-50" />
        <span className="text-foreground font-medium">{meta.nome}</span>
      </button>

      {/* ─────────────────────────── HEADER ─────────────────────────── */}
      <div
        className="rounded-xl p-6 border-l-4 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6 items-center"
        style={{
          background: meta.accentSoft,
          borderColor: meta.accentBorder,
          borderLeftColor: meta.accent,
        }}
      >
        <div>
          <h1 className="text-3xl font-bold text-foreground">{meta.nome}</h1>
          <p className="text-sm text-muted-foreground mt-1">{meta.descricao}</p>
          <div className="flex items-center gap-2 mt-3 text-xs flex-wrap">
            <Badge variant="outline">Somente leitura</Badge>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">
              Preenchimento via <span className="font-mono">/integracao</span>
            </span>
            {podePreencher && (
              <>
                <span className="text-muted-foreground">·</span>
                <button
                  onClick={() => navigate('/ministerial/integracao?aba=cultos')}
                  className="font-semibold hover:underline"
                  style={{ color: meta.accent }}
                >
                  Preencher dados →
                </button>
              </>
            )}
          </div>
        </div>

        {/* Score de saúde */}
        <div className="flex items-center gap-4">
          <div
            className="w-28 h-28 rounded-full flex flex-col items-center justify-center border-4"
            style={{
              borderColor: saudeMeta.color,
              background: saudeMeta.bg,
            }}
          >
            <span className="text-3xl font-bold leading-none" style={{ color: saudeMeta.color }}>
              {saude.score ?? 0}
            </span>
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1">
              Score
            </span>
          </div>
          <div>
            <div className="text-lg font-bold leading-tight" style={{ color: saudeMeta.color }}>
              {saudeMeta.label}
            </div>
            <div className="text-xs text-muted-foreground mt-1 max-w-[160px]">
              {saude.pct_no_alvo ?? 0}% dos indicadores no alvo · {saude.kpis_total ?? 0} KPIs
            </div>
          </div>
        </div>
      </div>

      {/* ─────────────────── FILTRO DE PERÍODO ─────────────────── */}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground">Período:</span>
        {PERIODOS.map(p => (
          <button
            key={p.id}
            onClick={() => setPeriodo(p.id)}
            disabled={loading}
            className="px-3 py-1.5 rounded-full border font-medium transition-colors disabled:opacity-50"
            style={
              periodo === p.id
                ? { background: meta.accent, color: '#fff', borderColor: meta.accent }
                : { background: 'transparent', borderColor: 'var(--cbrio-border, rgb(226, 232, 240))' }
            }
          >
            {p.label}
          </button>
        ))}
        {data.periodo && (
          <span className="text-muted-foreground ml-auto hidden sm:inline">
            {formatDataCompleta(data.periodo.desde)} → {formatDataCompleta(data.periodo.ate)}
          </span>
        )}
      </div>

      {/* ─────────────────────── NPS DESTACADO ─────────────────────── */}
      {npsDestaque.length > 0 && (
        <NpsDestaque
          kpis={npsDestaque}
          meta={meta}
          area={area}
          podePreencher={podePreencher}
          onSaved={() => api.get(area, { periodo }).then(setData)}
          onOpenKpi={(id) => navigate(`/painel/kpi/${id}`)}
        />
      )}

      {/* ─────────────────────── TABS PRINCIPAIS ─────────────────────── */}
      <Tabs defaultValue={temCultos ? 'cultos' : 'indicadores'}>
        <TabsList className={`grid w-full max-w-3xl ${temCultos ? 'grid-cols-5' : 'grid-cols-4'}`}>
          {temCultos && (
            <TabsTrigger value="cultos">
              Cultos <span className="ml-1 opacity-60">({cultos.length})</span>
            </TabsTrigger>
          )}
          <TabsTrigger value="indicadores">
            Indicadores {kpisRegulares.length > 0 && <span className="ml-1 opacity-60">({kpisRegulares.length})</span>}
          </TabsTrigger>
          <TabsTrigger value="dados">
            Dados {data.dados?.length > 0 && <span className="ml-1 opacity-60">({data.dados.length})</span>}
          </TabsTrigger>
          <TabsTrigger value="saude">Saúde</TabsTrigger>
          <TabsTrigger value="novos-convertidos">Novos convertidos</TabsTrigger>
        </TabsList>

        {/* ──────── ABA NOVOS CONVERTIDOS ──────── */}
        <TabsContent value="novos-convertidos" className="mt-6 space-y-4">
          <p className="text-sm text-muted-foreground">Os primeiros 90 dias de quem se converteu nesta área: contato pastoral (3 dias), batismo e Next (90 dias). Atrasados em vermelho.</p>
          <JornadaConvertidos area={area} />
        </TabsContent>

        {/* ──────── ABA CULTOS ──────── */}
        {temCultos && (
          <TabsContent value="cultos" className="mt-6 space-y-4">
            {totaisCultos && (
              <CultosResumo totais={totaisCultos} serie={serieCultos} cultos={cultos} area={area} accent={meta.accent} />
            )}
            {serieCultos.length > 1 && (
              <GraficoCultos serie={serieCultos} area={area} accent={meta.accent} />
            )}
            <CultosTabela cultos={cultos} area={area} accent={meta.accent} />
          </TabsContent>
        )}

        {/* ──────── ABA INDICADORES ──────── */}
        <TabsContent value="indicadores" className="mt-6">
          {kpisRegulares.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              Nenhum indicador cadastrado pra esta área ainda.
            </Card>
          ) : (
            <IndicadoresAgrupados kpis={kpisRegulares} navigate={navigate} />
          )}
        </TabsContent>

        {/* ──────── ABA DADOS ──────── */}
        <TabsContent value="dados" className="mt-6">
          {data.dados?.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              Nenhum tipo de dado bruto esperado nesta área ainda. KPIs simples
              usam só os números dos cultos (aba "Cultos").
            </Card>
          ) : (
            <DadosAgrupados dados={data.dados || []} accent={meta.accent} />
          )}
          <p className="text-xs text-muted-foreground mt-3">
            <strong>Dados brutos</strong> são números preenchidos por área em <span className="font-mono">/dados-brutos</span>
            {' '}(voluntários, grupos, devocionais etc). Os <strong>cultos</strong> (frequência, decisões, batismos)
            vivem em tabela própria e aparecem na aba ao lado.
          </p>
        </TabsContent>

        {/* ──────── ABA SAÚDE ──────── */}
        <TabsContent value="saude" className="mt-6 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              label="Indicadores totais"
              value={saude.kpis_total ?? 0}
              hint="cadastrados pra essa área"
            />
            <StatCard
              label="No alvo"
              value={saude.kpis_no_alvo ?? 0}
              color="text-emerald-600 dark:text-emerald-400"
              hint={`de ${saude.kpis_total ?? 0} (${saude.pct_no_alvo ?? 0}%)`}
            />
            <StatCard
              label="Atrasados"
              value={saude.kpis_atrasado ?? 0}
              color="text-amber-600 dark:text-amber-400"
              hint="precisam de atenção"
            />
            <StatCard
              label="Críticos"
              value={saude.kpis_critico ?? 0}
              color="text-red-600 dark:text-red-400"
              hint="abaixo do limite"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Card className="p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Cobertura de KPIs</p>
              <p className="text-2xl font-bold text-foreground mt-1">{saude.pct_cobertos ?? 0}%</p>
              <p className="text-[11px] text-muted-foreground mt-1">
                {(saude.kpis_total ?? 0) - (saude.kpis_sem_dado ?? 0)} de {saude.kpis_total ?? 0} têm dado preenchido
              </p>
              <Progress pct={saude.pct_cobertos ?? 0} color={meta.accent} />
            </Card>

            <Card className="p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Dados recentes</p>
              <p className="text-2xl font-bold text-foreground mt-1">{saude.pct_dados_recentes ?? 0}%</p>
              <p className="text-[11px] text-muted-foreground mt-1">
                {saude.dados_recentes_30d ?? 0} de {saude.tipos_dado ?? 0} tipos com registro nos últimos 30 dias
              </p>
              <Progress pct={saude.pct_dados_recentes ?? 0} color={meta.accent} />
            </Card>

            <Card className="p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Indicadores no alvo</p>
              <p className="text-2xl font-bold text-foreground mt-1">{saude.pct_no_alvo ?? 0}%</p>
              <p className="text-[11px] text-muted-foreground mt-1">
                {saude.kpis_no_alvo ?? 0} de {saude.kpis_total ?? 0} acima da meta
              </p>
              <Progress pct={saude.pct_no_alvo ?? 0} color={meta.accent} />
            </Card>
          </div>

          <Card className="p-4">
            <h3 className="text-sm font-semibold text-foreground mb-2">Como o score é calculado</h3>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>· 50% · % de indicadores no alvo</li>
              <li>· 30% · % de KPIs com dado preenchido (cobertura)</li>
              <li>· 20% · % de tipos de dado com registro nos últimos 30 dias</li>
            </ul>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─────────────────────────── COMPONENTES ───────────────────────────

// Seta de tendência (compara dois valores · ex.: média do mês vs mês anterior)
function Tendencia({ atual, anterior, sufixo = 'vs mês anterior' }) {
  if (atual == null || anterior == null || anterior === 0) return null;
  const pct = ((atual - anterior) / anterior) * 100;
  const Icon = pct > 2 ? TrendingUp : pct < -2 ? TrendingDown : Minus;
  const cor = pct > 2 ? 'text-emerald-600 dark:text-emerald-400'
    : pct < -2 ? 'text-red-600 dark:text-red-400'
    : 'text-muted-foreground';
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${cor}`}>
      <Icon className="h-3 w-3" />
      {pct >= 0 ? '+' : ''}{Math.round(pct)}% {sufixo}
    </span>
  );
}

// Cards de resumo da aba Cultos · média por culto é o número que importa
function CultosResumo({ totais, serie, cultos, area, accent }) {
  const freqTotal = area === 'kids' ? totais.presencial_kids
    : area === 'online' ? totais.online_pico_total
    : totais.presencial_adulto;
  const decTotal = area === 'kids' ? totais.decisoes_kids
    : area === 'online' ? totais.decisoes_online
    : totais.decisoes_total;
  const n = totais.total_cultos || 0;
  const mediaFreq = n > 0 ? Math.round(freqTotal / n) : 0;
  const mediaDec = n > 0 ? (decTotal / n) : 0;

  // Tendência: média por culto do último mês da série vs mês anterior
  // (média é robusta a mês parcial · total não seria)
  const ultimo = serie[serie.length - 1];
  const penultimo = serie[serie.length - 2];

  // Melhor culto do período (entre os recentes carregados)
  const melhor = cultos.reduce((best, c) => {
    const f = Number(freqDoCulto(c, area)) || 0;
    return (!best || f > best.f) ? { c, f } : best;
  }, null);

  const labelFreq = area === 'online' ? 'Pico médio por culto' : 'Frequência média por culto';

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Card className="p-4" style={{ borderLeft: `3px solid ${accent}` }}>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground uppercase tracking-wide font-semibold">
          <Users className="h-3.5 w-3.5" /> {labelFreq}
        </div>
        <p className="text-3xl font-bold text-foreground mt-1">{formatNum(mediaFreq)}</p>
        <div className="mt-1 flex flex-col gap-0.5">
          <Tendencia atual={ultimo?.media_freq} anterior={penultimo?.media_freq} />
          <span className="text-[11px] text-muted-foreground">{formatNum(freqTotal)} no período</span>
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground uppercase tracking-wide font-semibold">
          <Sparkles className="h-3.5 w-3.5" /> Decisões no período
        </div>
        <p className="text-3xl font-bold text-foreground mt-1">{formatNum(decTotal)}</p>
        <div className="mt-1 flex flex-col gap-0.5">
          <Tendencia atual={ultimo?.decisoes} anterior={penultimo?.decisoes} />
          <span className="text-[11px] text-muted-foreground">
            {mediaDec.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} por culto
          </span>
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground uppercase tracking-wide font-semibold">
          <CalendarDays className="h-3.5 w-3.5" /> Cultos realizados
        </div>
        <p className="text-3xl font-bold text-foreground mt-1">{formatNum(n)}</p>
        <span className="text-[11px] text-muted-foreground">no período selecionado</span>
      </Card>

      <Card className="p-4">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground uppercase tracking-wide font-semibold">
          <Trophy className="h-3.5 w-3.5" /> Melhor culto
        </div>
        {melhor && melhor.f > 0 ? (
          <>
            <p className="text-3xl font-bold mt-1" style={{ color: accent }}>{formatNum(melhor.f)}</p>
            <span className="text-[11px] text-muted-foreground">
              {formatDataCompleta(melhor.c.data)} · {melhor.c.nome}
            </span>
          </>
        ) : (
          <p className="text-sm text-muted-foreground mt-2 italic">sem dado ainda</p>
        )}
      </Card>
    </div>
  );
}

// Gráfico mensal · barras = frequência média por culto · linha = decisões
function GraficoCultos({ serie, area, accent }) {
  const dataChart = serie.map(m => ({
    label: formatMes(m.mes),
    media: m.media_freq,
    decisoes: m.decisoes,
    cultos: m.cultos,
  }));
  const labelFreq = area === 'online' ? 'Pico médio' : 'Frequência média';

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">Evolução mensal</h3>
        <span className="text-[11px] text-muted-foreground">
          barras = {labelFreq.toLowerCase()} por culto · linha = decisões no mês
        </span>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={dataChart} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--cbrio-border, #e2e8f0)" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis yAxisId="freq" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis yAxisId="dec" orientation="right" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={36} />
          <RTooltip
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
            formatter={(value, name, props) => {
              if (name === labelFreq) {
                return [`${formatNum(value)} (${props.payload.cultos} culto${props.payload.cultos !== 1 ? 's' : ''})`, name];
              }
              return [formatNum(value), name];
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar yAxisId="freq" dataKey="media" name={labelFreq} fill={accent} radius={[4, 4, 0, 0]} maxBarSize={48} fillOpacity={0.85} />
          <Line yAxisId="dec" dataKey="decisoes" name="Decisões" stroke="#F59E0B" strokeWidth={2.5} dot={{ r: 3 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </Card>
  );
}

// Tabela de cultos com barra comparativa · de relance: acima/abaixo da média
function CultosTabela({ cultos, area, accent }) {
  const freqs = cultos.map(c => Number(freqDoCulto(c, area)) || 0);
  const maxFreq = Math.max(...freqs, 1);
  const comDado = freqs.filter(f => f > 0);
  const media = comDado.length > 0 ? comDado.reduce((a, b) => a + b, 0) / comDado.length : 0;
  const labelFreq = area === 'online' ? 'Pico' : area === 'kids' ? 'Crianças' : 'Presentes';

  return (
    <Card>
      <div className="p-4 border-b border-border flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-foreground">Culto a culto</h3>
        <span className="text-xs text-muted-foreground">
          média do período: <strong className="text-foreground">{formatNum(Math.round(media))}</strong> · mais recentes primeiro
        </span>
      </div>

      {/* Cabeçalho (só desktop) */}
      <div className="hidden md:grid grid-cols-[150px_1fr_90px] gap-4 px-4 py-2 border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        <span>Culto</span>
        <span>{labelFreq}</span>
        <span className="text-right">Decisões</span>
      </div>

      <div className="divide-y divide-border">
        {cultos.map(c => {
          const f = Number(freqDoCulto(c, area)) || 0;
          const dec = Number(decisoesDoCulto(c, area)) || 0;
          const semDado = freqDoCulto(c, area) == null || (f === 0 && dec === 0);
          const pct = Math.round((f / maxFreq) * 100);
          const acimaDaMedia = media > 0 && f >= media;
          return (
            <div key={c.id} className={`px-4 py-3 grid grid-cols-1 md:grid-cols-[150px_1fr_90px] gap-2 md:gap-4 items-center ${semDado ? 'opacity-60' : ''}`}>
              {/* Data + nome */}
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {formatData(c.data)} <span className="text-muted-foreground font-normal">· {diaSemana(c.data)}</span>
                </p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {c.nome}{c.hora ? ` · ${c.hora.slice(0, 5)}` : ''}
                </p>
              </div>

              {/* Barra de frequência comparativa */}
              <div className="flex items-center gap-2 min-w-0">
                {semDado ? (
                  <span className="text-xs text-muted-foreground italic">sem dado lançado</span>
                ) : (
                  <>
                    <div className="flex-1 h-5 bg-muted/60 rounded overflow-hidden">
                      <div
                        className="h-full rounded transition-all"
                        style={{
                          width: `${Math.max(pct, 2)}%`,
                          background: accent,
                          opacity: acimaDaMedia ? 0.9 : 0.45,
                        }}
                      />
                    </div>
                    <span className="text-sm font-bold tabular-nums w-14 text-right" style={{ color: acimaDaMedia ? accent : undefined }}>
                      {formatNum(f)}
                    </span>
                  </>
                )}
              </div>

              {/* Decisões */}
              <div className="md:text-right">
                {dec > 0 ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400">
                    <Sparkles className="h-3 w-3" /> {dec}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="px-4 py-2 border-t border-border text-[11px] text-muted-foreground">
        Barra cheia = melhor culto do período · barra clara = abaixo da média
      </div>
    </Card>
  );
}

// ─────────────── NPS DESTACADO · nota grande em escala 0-10 ───────────────

function NpsDestaque({ kpis, meta, area, podePreencher, onSaved, onOpenKpi }) {
  return (
    <Card className="overflow-hidden" style={{ borderColor: meta.accentBorder, borderWidth: 2 }}>
      <div className="p-4 border-b border-border flex items-center justify-between" style={{ background: meta.accentSoft }}>
        <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: meta.accent }}>
          NPS do culto · avaliação dos participantes
        </h2>
        {podePreencher && (
          <NpsRegistrarButton area={area} accent={meta.accent} onSaved={onSaved} />
        )}
      </div>
      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
        {kpis.map(k => {
          const traj = k.trajetoria || {};
          const valor = traj.ultimo_valor;
          const metaNps = traj.checkpoint_meta ?? k.meta_valor;
          const corNota = valor == null ? '#94a3b8'
            : metaNps != null
              ? (valor >= metaNps ? '#10b981' : valor >= metaNps * 0.85 ? '#f59e0b' : '#ef4444')
              : meta.accent;
          return (
            <button
              key={k.id}
              onClick={() => onOpenKpi(k.id)}
              className="text-left rounded-lg border border-border p-4 hover:bg-accent/30 transition-colors"
            >
              <p className="text-xs text-muted-foreground">{k.indicador}</p>
              <div className="flex items-end gap-1.5 mt-1">
                {valor == null ? (
                  <span className="text-sm text-muted-foreground italic">sem avaliação ainda</span>
                ) : (
                  <>
                    <span className="text-4xl font-bold leading-none" style={{ color: corNota }}>
                      {Number(valor).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}
                    </span>
                    <span className="text-sm text-muted-foreground mb-0.5">/ 10</span>
                  </>
                )}
              </div>
              {/* Escala 0-10 com marcador de meta */}
              <div className="relative mt-3 h-2 bg-muted rounded-full overflow-visible">
                <div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ width: `${Math.max(0, Math.min(100, (Number(valor) || 0) * 10))}%`, background: corNota }}
                />
                {metaNps != null && (
                  <div
                    className="absolute -top-1 h-4 w-0.5 bg-foreground/60 rounded"
                    style={{ left: `${Math.max(0, Math.min(100, Number(metaNps) * 10))}%` }}
                    title={`Meta: ${formatNum(metaNps)}`}
                  />
                )}
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">
                {metaNps != null ? `meta ${formatNum(metaNps)}` : 'sem meta definida'}
                {traj.ultimo_periodo ? ` · referência ${traj.ultimo_periodo}` : ''}
              </p>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function NpsRegistrarButton({ area, accent, onSaved }) {
  const [open, setOpen] = useState(false);
  const [nota, setNota] = useState('');
  const [qtd, setQtd] = useState('');
  const [mes, setMes] = useState(() => new Date().toISOString().slice(0, 7));
  const [obs, setObs] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const notaNum = Number(nota);
    if (!Number.isFinite(notaNum) || notaNum < 0 || notaNum > 10) {
      toast.error('Nota deve ser entre 0 e 10');
      return;
    }
    setSaving(true);
    try {
      await api.registrarNps(area, {
        nota: notaNum,
        mes,
        qtd_respostas: qtd ? Number(qtd) : null,
        observacao: obs.trim() || null,
      });
      toast.success(`NPS de ${mes} registrado · trigger recalculou o KPI`);
      setOpen(false);
      setNota(''); setQtd(''); setObs('');
      onSaved?.();
    } catch (e) {
      toast.error(e.message || 'Erro ao registrar NPS');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          className="text-xs font-semibold flex items-center gap-1 hover:underline"
          style={{ color: accent }}
        >
          <Plus className="h-3.5 w-3.5" /> Registrar nota
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar NPS · {area}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-xs text-muted-foreground">
            Nota média (0-10) das avaliações pós-culto do mês selecionado.
            Substitui registro existente · idempotente.
          </p>
          <div>
            <Label htmlFor="nps-mes">Mês de referência</Label>
            <Input id="nps-mes" type="month" value={mes} onChange={e => setMes(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="nps-nota">Nota média (0-10) *</Label>
              <Input
                id="nps-nota"
                type="number"
                min="0"
                max="10"
                step="0.1"
                value={nota}
                onChange={e => setNota(e.target.value)}
                placeholder="ex: 8.7"
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="nps-qtd">Qtd avaliações</Label>
              <Input
                id="nps-qtd"
                type="number"
                min="0"
                value={qtd}
                onChange={e => setQtd(e.target.value)}
                placeholder="ex: 24"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="nps-obs">Observação (opcional)</Label>
            <Input
              id="nps-obs"
              value={obs}
              onChange={e => setObs(e.target.value)}
              placeholder="contexto da avaliação"
              maxLength={500}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || !nota} style={{ background: accent }}>
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────── INDICADORES · agrupados por valor da Jornada (sem pills) ───────────

function agruparPorValor(items, getValores) {
  const grupos = ORDEM_VALORES
    .map(v => ({ valor: v, items: items.filter(i => (getValores(i) || []).includes(v)) }))
    .filter(g => g.items.length > 0);
  const semValor = items.filter(i => (getValores(i) || []).length === 0);
  if (semValor.length > 0) grupos.push({ valor: null, items: semValor });
  return grupos;
}

function GrupoHeader({ valor, count, sufixo }) {
  const cor = valor ? (VALOR_CORES[valor] || '#94a3b8') : '#94a3b8';
  const label = valor ? (VALOR_LABELS[valor] || valor) : 'Outros indicadores';
  return (
    <div className="flex items-center gap-2">
      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: cor }} />
      <h3 className="text-sm font-semibold text-foreground">{label}</h3>
      <span className="text-xs text-muted-foreground">
        {count} {sufixo}{count !== 1 ? 's' : ''}
      </span>
      <div className="flex-1 h-px bg-border ml-1" />
    </div>
  );
}

function IndicadoresAgrupados({ kpis, navigate }) {
  const grupos = useMemo(
    () => agruparPorValor(kpis, k => k.valores),
    [kpis]
  );

  return (
    <div className="space-y-6">
      {grupos.map(g => (
        <div key={g.valor || 'outros'} className="space-y-3">
          <GrupoHeader valor={g.valor} count={g.items.length} sufixo="indicador" />
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {g.items.map(k => (
              <KpiCard key={`${g.valor}-${k.id}`} kpi={k} onClick={() => navigate(`/painel/kpi/${k.id}`)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function KpiCard({ kpi, onClick }) {
  const sKey = statusKey(kpi.trajetoria);
  const sMeta = STATUS_META[sKey];
  const traj = kpi.trajetoria || {};
  const valor = traj.ultimo_valor;
  const metaV = traj.checkpoint_meta;
  const pct = traj.percentual_meta;

  return (
    <Card
      className="p-4 cursor-pointer hover:shadow-md transition-shadow border-l-4 flex flex-col"
      style={{ borderLeftColor: sMeta.color }}
      onClick={onClick}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-mono text-muted-foreground truncate">{kpi.id}</span>
        <div className="flex items-center gap-1 shrink-0">
          {kpi.is_okr && <Badge variant="secondary" className="text-[9px] px-1.5">OKR</Badge>}
          <Badge className={`text-[10px] ${sMeta.className}`}>{sMeta.label}</Badge>
        </div>
      </div>

      <p className="text-sm font-medium text-foreground mt-2 line-clamp-2 flex-1">{kpi.indicador}</p>

      <div className="mt-3 flex items-end justify-between gap-2">
        {valor != null ? (
          <span className="text-2xl font-bold leading-none text-foreground">
            {formatNum(valor)}
            {kpi.unidade && kpi.unidade !== 'unidade' && (
              <span className="text-xs font-normal text-muted-foreground ml-1">{kpi.unidade}</span>
            )}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground italic">sem dado</span>
        )}
        {metaV != null && (
          <span className="text-[11px] text-muted-foreground text-right">
            meta {formatNum(metaV)}
            {pct != null && (
              <span
                className="block font-semibold"
                style={{ color: pct >= 100 ? '#10b981' : pct >= 70 ? '#f59e0b' : '#ef4444' }}
              >
                {Math.round(pct)}% da meta
              </span>
            )}
          </span>
        )}
      </div>

      {/* Barra de progresso vs meta */}
      {valor != null && metaV != null && pct != null && (
        <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.max(2, Math.min(100, pct))}%`,
              background: pct >= 100 ? '#10b981' : pct >= 70 ? '#f59e0b' : '#ef4444',
            }}
          />
        </div>
      )}

      <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{kpi.periodicidade || ''}</span>
        {kpi.lider?.nome && <span className="truncate ml-2">Líder: {kpi.lider.nome}</span>}
      </div>
    </Card>
  );
}

// ─────────── DADOS BRUTOS · mesmo agrupamento por valor (sem pills) ───────────

function DadosAgrupados({ dados, accent }) {
  const grupos = useMemo(
    () => agruparPorValor(dados, d => d.valores_jornada),
    [dados]
  );

  return (
    <div className="space-y-6">
      {grupos.map(g => (
        <div key={g.valor || 'outros'} className="space-y-3">
          <GrupoHeader valor={g.valor} count={g.items.length} sufixo="tipo de dado" />
          <Card className="divide-y divide-border">
            {g.items.map(d => (
              <DadoRow key={`${g.valor}-${d.tipo_id}`} dado={d} accent={accent} />
            ))}
          </Card>
        </div>
      ))}
    </div>
  );
}

function StatCard({ label, value, color = '', hint }) {
  return (
    <Card className="p-4">
      <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${color || 'text-foreground'}`}>{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>}
    </Card>
  );
}

function Progress({ pct, color }) {
  return (
    <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
      <div
        className="h-full transition-all"
        style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }}
      />
    </div>
  );
}

function Sparkline({ historico, accent }) {
  const [hover, setHover] = useState(null);
  if (!historico || historico.length < 2) {
    return (
      <div className="w-[100px] h-[36px] shrink-0 rounded bg-muted/40 flex items-center justify-center">
        <span className="text-[9px] text-muted-foreground">sem histórico</span>
      </div>
    );
  }
  const valoresHist = historico.map(h => h.valor);
  const maxV = Math.max(...valoresHist, 1);
  const minV = Math.min(...valoresHist, 0);
  const range = maxV - minV || 1;
  const W = 100, H = 36;
  const pts = valoresHist.map((v, i) => {
    const x = (i / (valoresHist.length - 1)) * (W - 4) + 2;
    const y = (H - 4) - ((v - minV) / range) * (H - 8);
    return { x, y, v, data: historico[i].data };
  });
  return (
    <div className="relative" onMouseLeave={() => setHover(null)}>
      <svg width={W} height={H} className="shrink-0">
        <polyline
          fill="none"
          stroke={accent}
          strokeWidth="2"
          points={pts.map(p => `${p.x},${p.y}`).join(' ')}
        />
        {pts.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r="6"
            fill="transparent"
            onMouseEnter={() => setHover(p)}
            style={{ cursor: 'crosshair' }}
          />
        ))}
        {hover && (
          <circle cx={hover.x} cy={hover.y} r="3" fill={accent} stroke="#fff" strokeWidth="1.5" />
        )}
      </svg>
      {hover && (
        <div
          className="absolute z-10 px-2 py-1 rounded-md text-[10px] bg-popover border border-border shadow-md pointer-events-none whitespace-nowrap"
          style={{ left: Math.min(hover.x, W - 70), top: -28 }}
        >
          <strong>{formatNum(hover.v)}</strong> · {formatData(hover.data)}
        </div>
      )}
    </div>
  );
}

function DadoRow({ dado, accent }) {
  const vazio = dado.vazio || dado.total_registros === 0;

  const variacao = dado.variacao_mes_pct;
  const variacaoTexto = variacao == null
    ? null
    : `${variacao >= 0 ? '+' : ''}${Math.round(variacao)}% vs mês anterior`;
  const variacaoColor = variacao == null
    ? 'text-muted-foreground'
    : variacao >= 10 ? 'text-emerald-600 dark:text-emerald-400'
    : variacao <= -10 ? 'text-red-600 dark:text-red-400'
    : 'text-muted-foreground';

  return (
    <div className={`p-4 flex items-start gap-4 flex-wrap ${vazio ? 'opacity-75' : ''}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-foreground">{dado.tipo_nome}</p>
          {vazio && (
            <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-muted text-muted-foreground border border-border">
              aguardando dado
            </span>
          )}
        </div>
        {dado.descricao && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{dado.descricao}</p>
        )}
        <div className="flex items-center gap-2 mt-2 text-xs flex-wrap">
          <span className="text-muted-foreground">
            {dado.granularidade} · {dado.agregacao}
          </span>
          {dado.ultima_data && (
            <span className="text-muted-foreground">
              · último em {formatData(dado.ultima_data)}
            </span>
          )}
          {dado.total_registros > 0 && (
            <span className="text-muted-foreground">
              · {dado.total_registros} registros
            </span>
          )}
        </div>
      </div>

      <Sparkline historico={dado.historico_6} accent={accent} />

      <div className="text-right shrink-0 min-w-[100px]">
        {vazio ? (
          <p className="text-sm text-muted-foreground italic">sem dado</p>
        ) : (
          <>
            <p className="text-2xl font-bold text-foreground">{formatNum(dado.ultimo_valor)}</p>
            <p className="text-[10px] text-muted-foreground">{dado.unidade}</p>
            {variacaoTexto && (
              <p className={`text-[11px] mt-1 ${variacaoColor}`}>{variacaoTexto}</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
