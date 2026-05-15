// ============================================================================
// /minha-area — Hub do lider · visualizador de KPIs (refator 2026-05-14)
//
// Marcos: "essa aba de edicao e visualizacao de indicadores nao esta boa".
//
// Nova arquitetura:
// - Lista plana com filtros pinned (busca + Pilar + Valor + Area + Status + OKR)
// - Cards densos: valor grande + sparkline 12 periodos + % meta + delta
// - Drilldown inline ao clicar (sem modal · expande detalhe abaixo do card)
// - Status vem da view vw_kpi_taticos_status (mesma usada no /painel) ·
//   sai a logica local "se preencheu vira no_alvo" que estava errada
// - Toggle de agrupamento: Pilar | Valor | Area | Lista plana
// - Edicao de meta + revisao OKR continuam abrindo modal (raro · tudo bem)
// ============================================================================

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { kpis as kpisApi } from '../api';
import { useMyKpiAreas } from '../hooks/useMyKpiAreas';
import OkrRevisaoModal from '../components/OkrRevisaoModal';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent } from '../components/ui/card';
import {
  Search, ChevronDown, ChevronRight, Activity, TrendingUp, TrendingDown,
  Minus, ExternalLink, ClipboardCheck, X, Layers,
} from 'lucide-react';
import { toast } from 'sonner';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

// ── Catalogos ──
const VALORES = [
  { key: 'seguir',       label: 'Seguir a Jesus',         cor: '#8B5CF6' },
  { key: 'conectar',     label: 'Conectar com Pessoas',   cor: '#3B82F6' },
  { key: 'investir',     label: 'Investir Tempo c/ Deus', cor: '#F59E0B' },
  { key: 'servir',       label: 'Servir em Comunidade',   cor: '#10B981' },
  { key: 'generosidade', label: 'Viver Generosamente',    cor: '#EC4899' },
];

const STATUS_OPTS = [
  { key: 'verde',    label: 'No alvo',  cor: '#10B981' },
  { key: 'amarelo',  label: 'Atrás',    cor: '#F59E0B' },
  { key: 'vermelho', label: 'Crítico',  cor: '#EF4444' },
  { key: 'sem_dado', label: 'Sem dado', cor: '#9CA3AF' },
];

const STATUS_COR = Object.fromEntries(STATUS_OPTS.map(s => [s.key, s.cor]));

// Modulo onde preencher · usado no drilldown
const MODULO_POR_DADO_TIPO = {
  conversoes:                          { titulo: 'Integração',     path: '/ministerial/integracao?tab=frequencia' },
  batismos:                            { titulo: 'Batismos',       path: '/ministerial/integracao?tab=batismos' },
  frequencia_culto:                    { titulo: 'Integração',     path: '/ministerial/integracao?tab=frequencia' },
  frequencia_kids:                     { titulo: 'Integração',     path: '/ministerial/integracao?tab=frequencia' },
  frequencia_grupos:                   { titulo: 'Grupos',         path: '/grupos' },
  frequencia_next:                     { titulo: 'NEXT',           path: '/ministerial/next' },
  doacoes_valor:                       { titulo: 'Financeiro',     path: '/admin/financeiro' },
  doacoes_qualidade:                   { titulo: 'Financeiro',     path: '/admin/financeiro' },
  doadores_count:                      { titulo: 'Financeiro',     path: '/admin/financeiro' },
  doadores_recorrentes:                { titulo: 'Financeiro',     path: '/admin/financeiro' },
  voluntarios_ativos:                  { titulo: 'Voluntariado',   path: '/ministerial/voluntariado' },
  voluntarios_checkin:                 { titulo: 'Voluntariado',   path: '/ministerial/voluntariado' },
  voluntarios_treinamento:             { titulo: 'Voluntariado',   path: '/ministerial/voluntariado' },
  lideres_grupos:                      { titulo: 'Grupos',         path: '/grupos' },
  lideres_treinados:                   { titulo: 'Grupos',         path: '/grupos' },
  lideres_acompanhados:                { titulo: 'Grupos',         path: '/grupos/supervisao' },
  grupos_ativos:                       { titulo: 'Grupos',         path: '/grupos' },
  inscricoes_jornada180:               { titulo: 'Cuidados',       path: '/ministerial/cuidados?tab=agregado' },
  novos_convertidos_atend:             { titulo: 'Cuidados',       path: '/ministerial/cuidados?tab=agregado' },
  devocional:                          { titulo: 'Cuidados',       path: '/ministerial/cuidados?tab=agregado' },
  capelania:                           { titulo: 'Cuidados',       path: '/ministerial/cuidados?tab=agregado' },
  aconselhamento:                      { titulo: 'Cuidados',       path: '/ministerial/cuidados?tab=agregado' },
  nps_geral:                           { titulo: 'NPS',            path: '/nps' },
  nps_next:                            { titulo: 'NPS',            path: '/nps' },
  nps_lideres:                         { titulo: 'NPS',            path: '/nps' },
  nps_voluntarios:                     { titulo: 'NPS',            path: '/nps' },
  nps_culto:                           { titulo: 'NPS',            path: '/nps' },
};

// ── Helpers ──
function pilarKey(p) {
  return (p || 'sem_pilar').toLowerCase();
}

function pilarLabel(p) {
  if (!p) return 'Sem pilar';
  return p;
}

function formatDelta(atual, anterior) {
  if (anterior == null || anterior === 0) return null;
  return Math.round(((atual - anterior) / anterior) * 100);
}

function dadoTipoLabel(kpi) {
  const dt = kpi.formula_config?.dado_tipo;
  return dt || null;
}

function moduloDoKpi(kpi) {
  const dt = dadoTipoLabel(kpi);
  if (dt && MODULO_POR_DADO_TIPO[dt]) return MODULO_POR_DADO_TIPO[dt];
  // Fallback por fonte_auto (cultos.*, batismos.*)
  if (kpi.fonte_auto?.startsWith('cultos.')) return { titulo: 'Integração', path: '/ministerial/integracao?tab=frequencia' };
  if (kpi.fonte_auto?.startsWith('batismos.')) return { titulo: 'Batismos', path: '/ministerial/integracao?tab=batismos' };
  return null;
}

// ============================================================================
// Componente principal
// ============================================================================
export default function MinhaArea() {
  const { profile } = useAuth();
  const { kpiAreas, isAdmin, ministerioId, ministerioPapel } = useMyKpiAreas();

  // Filtros
  const [busca, setBusca] = useState('');
  const [filtroPilar, setFiltroPilar] = useState([]);
  const [filtroValor, setFiltroValor] = useState([]);
  const [filtroArea, setFiltroArea] = useState([]);
  const [filtroStatus, setFiltroStatus] = useState([]);
  const [soOkr, setSoOkr] = useState(false);
  const [agrupamento, setAgrupamento] = useState('pilar');
  const [expandedId, setExpandedId] = useState(null);

  // Modal de revisao OKR (uso do lider · operacional, nao e configuracao).
  // Edicao/criacao de KPI/meta foi pra /gestao · /minha-area e so visualizacao.
  const [revisarKpi, setRevisarKpi] = useState(null);

  // Carga · 2 queries paralelas
  const { data: taticos = [], isLoading, refetch } = useQuery({
    queryKey: ['kpis', 'taticos-status'],
    queryFn: () => kpisApi.v2.taticos(),
    staleTime: 60_000,
  });

  const { data: registros = [] } = useQuery({
    queryKey: ['kpis', 'registros-recentes'],
    queryFn: () => kpisApi.v2.registros.list({ limit: 5000 }),
    staleTime: 60_000,
  });

  // Historico por KPI (12 ultimos periodos · cronologico)
  const historicoPorKpi = useMemo(() => {
    const m = new Map();
    registros.forEach(r => {
      if (!m.has(r.indicador_id)) m.set(r.indicador_id, []);
      m.get(r.indicador_id).push(r);
    });
    for (const arr of m.values()) {
      arr.sort((a, b) => (b.periodo_referencia || '').localeCompare(a.periodo_referencia || ''));
      arr.length = Math.min(arr.length, 12);
      arr.reverse(); // cronologico asc para sparkline
    }
    return m;
  }, [registros]);

  const kpisAtivos = useMemo(() => taticos.filter(k => k.ativo !== false), [taticos]);

  // Opcoes derivadas
  const pilaresDisponiveis = useMemo(() => {
    const set = new Map();
    kpisAtivos.forEach(k => {
      const key = pilarKey(k.pilar);
      if (!set.has(key)) set.set(key, pilarLabel(k.pilar));
    });
    return Array.from(set.entries()).map(([key, label]) => ({ key, label }));
  }, [kpisAtivos]);

  const areasDisponiveis = useMemo(() => {
    const set = new Set();
    kpisAtivos.forEach(k => { if (k.area) set.add(k.area); });
    return Array.from(set).sort().map(a => ({ key: a, label: a }));
  }, [kpisAtivos]);

  // Filtragem
  const kpisFiltrados = useMemo(() => {
    return kpisAtivos.filter(k => {
      if (busca) {
        const q = busca.toLowerCase();
        const hay = `${k.indicador || ''} ${k.id || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filtroPilar.length && !filtroPilar.includes(pilarKey(k.pilar))) return false;
      if (filtroValor.length && !filtroValor.some(v => (k.valores || []).includes(v))) return false;
      if (filtroArea.length && !filtroArea.includes(k.area)) return false;
      if (filtroStatus.length && !filtroStatus.includes(k.status || 'sem_dado')) return false;
      if (soOkr && !k.is_okr) return false;
      return true;
    });
  }, [kpisAtivos, busca, filtroPilar, filtroValor, filtroArea, filtroStatus, soOkr]);

  const stats = useMemo(() => {
    let verde = 0, amarelo = 0, vermelho = 0, sem_dado = 0;
    kpisFiltrados.forEach(k => {
      const s = k.status || 'sem_dado';
      if (s === 'verde') verde++;
      else if (s === 'amarelo') amarelo++;
      else if (s === 'vermelho') vermelho++;
      else sem_dado++;
    });
    return { total: kpisFiltrados.length, verde, amarelo, vermelho, sem_dado };
  }, [kpisFiltrados]);

  // Agrupamento
  const grupos = useMemo(() => {
    if (agrupamento === 'lista') return [{ key: 'todos', label: `Todos (${kpisFiltrados.length})`, kpis: kpisFiltrados }];

    const map = new Map();
    if (agrupamento === 'pilar') {
      kpisFiltrados.forEach(k => {
        const key = pilarKey(k.pilar);
        const label = pilarLabel(k.pilar);
        if (!map.has(key)) map.set(key, { key, label, kpis: [] });
        map.get(key).kpis.push(k);
      });
    } else if (agrupamento === 'valor') {
      // 1 KPI pode entrar em varios valores
      VALORES.forEach(v => map.set(v.key, { key: v.key, label: v.label, cor: v.cor, kpis: [] }));
      map.set('sem_valor', { key: 'sem_valor', label: 'Sem valor (operações)', kpis: [] });
      kpisFiltrados.forEach(k => {
        if (!k.valores?.length) {
          map.get('sem_valor').kpis.push(k);
        } else {
          k.valores.forEach(v => {
            if (map.has(v)) map.get(v).kpis.push(k);
          });
        }
      });
    } else if (agrupamento === 'area') {
      kpisFiltrados.forEach(k => {
        const key = k.area || 'sem_area';
        if (!map.has(key)) map.set(key, { key, label: key, kpis: [] });
        map.get(key).kpis.push(k);
      });
    }
    return Array.from(map.values()).filter(g => g.kpis.length > 0);
  }, [kpisFiltrados, agrupamento]);

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 max-w-[1400px] mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-12 bg-muted rounded" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-muted rounded" />)}
          </div>
          {[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-muted rounded" />)}
        </div>
      </div>
    );
  }

  const algumFiltro = busca || filtroPilar.length || filtroValor.length || filtroArea.length || filtroStatus.length || soOkr;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1400px] mx-auto">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Activity className="h-5 w-5 text-[#00B39D]" /> Minha Área
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Visualização dos KPIs · metas e estrutura editáveis em <a href="/gestao?aba=configurar" className="text-[#00B39D] hover:underline">/gestao</a>.
            {kpiAreas.length > 0 && <> Líder de <strong className="capitalize">{kpiAreas.join(', ')}</strong>.</>}
            {ministerioId && <> {ministerioPapel === 'lider' ? 'Líder' : 'Assistente'} de <strong>{ministerioId}</strong>.</>}
          </p>
        </div>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <StatBox label="Total" value={stats.total} cor="#737373" />
        <StatBox label="No alvo"  value={stats.verde}    cor={STATUS_COR.verde} />
        <StatBox label="Atrás"    value={stats.amarelo}  cor={STATUS_COR.amarelo} />
        <StatBox label="Crítico"  value={stats.vermelho} cor={STATUS_COR.vermelho} />
        <StatBox label="Sem dado" value={stats.sem_dado} cor={STATUS_COR.sem_dado} />
      </div>

      {/* Filtros · linha 1 · busca + agrupamento + clear */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8 h-9"
            placeholder="Buscar indicador ou ID..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
          />
        </div>
        <div className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Layers className="h-3.5 w-3.5" /> Agrupar:
        </div>
        <div className="inline-flex rounded-md border border-border p-0.5 bg-muted/30">
          {[
            { v: 'pilar', l: 'Pilar' },
            { v: 'valor', l: 'Valor' },
            { v: 'area',  l: 'Área' },
            { v: 'lista', l: 'Lista' },
          ].map(opt => (
            <button
              key={opt.v}
              onClick={() => setAgrupamento(opt.v)}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                agrupamento === opt.v ? 'bg-[#00B39D] text-white' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {opt.l}
            </button>
          ))}
        </div>
        {algumFiltro && (
          <Button
            variant="ghost" size="sm"
            onClick={() => {
              setBusca('');
              setFiltroPilar([]); setFiltroValor([]); setFiltroArea([]); setFiltroStatus([]); setSoOkr(false);
            }}
            className="h-8 text-xs gap-1"
          >
            <X className="h-3 w-3" /> Limpar filtros
          </Button>
        )}
      </div>

      {/* Filtros · linha 2 · chips multiselect */}
      <div className="space-y-1.5">
        <ChipsRow label="Pilar"  opts={pilaresDisponiveis} valor={filtroPilar}  setValor={setFiltroPilar} />
        <ChipsRow label="Valor"  opts={VALORES.map(v => ({ key: v.key, label: v.label, cor: v.cor }))} valor={filtroValor} setValor={setFiltroValor} />
        <ChipsRow label="Área"   opts={areasDisponiveis}   valor={filtroArea}   setValor={setFiltroArea} />
        <ChipsRow label="Status" opts={STATUS_OPTS.map(s => ({ key: s.key, label: s.label, cor: s.cor }))} valor={filtroStatus} setValor={setFiltroStatus} />
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Outros:</span>
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={soOkr} onChange={e => setSoOkr(e.target.checked)} className="cursor-pointer" />
            <span className={soOkr ? 'text-[#00B39D] font-semibold' : 'text-muted-foreground'}>Só OKR (is_okr=true)</span>
          </label>
        </div>
      </div>

      {/* Lista agrupada */}
      {kpisFiltrados.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Nenhum KPI bate com os filtros atuais.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {grupos.map(g => (
            <GrupoSecao
              key={g.key}
              grupo={g}
              historicoPorKpi={historicoPorKpi}
              expandedId={expandedId}
              setExpandedId={setExpandedId}
              onRevisar={setRevisarKpi}
            />
          ))}
        </div>
      )}

      {revisarKpi && (
        <OkrRevisaoModal
          open={!!revisarKpi} kpi={revisarKpi}
          onClose={() => setRevisarKpi(null)}
          onSaved={() => { setRevisarKpi(null); toast.success('Revisão registrada'); }}
        />
      )}
    </div>
  );
}

// ============================================================================
// Sub-componentes
// ============================================================================

function StatBox({ label, value, cor }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2.5 text-center">
      <div className="text-xl font-bold tabular-nums leading-none" style={{ color: cor }}>{value}</div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-1">{label}</div>
    </div>
  );
}

function ChipsRow({ label, opts, valor, setValor }) {
  if (!opts?.length) return null;
  return (
    <div className="flex items-center gap-1.5 flex-wrap text-xs">
      <span className="text-muted-foreground min-w-[44px]">{label}:</span>
      {opts.map(o => {
        const ativo = valor.includes(o.key);
        return (
          <button
            key={o.key}
            onClick={() => setValor(ativo ? valor.filter(v => v !== o.key) : [...valor, o.key])}
            className="px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors capitalize"
            style={ativo
              ? { background: `${o.cor || '#00B39D'}1a`, borderColor: o.cor || '#00B39D', color: o.cor || '#00B39D' }
              : { borderColor: 'var(--border)', color: 'var(--muted-foreground)' }
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function GrupoSecao({ grupo, historicoPorKpi, expandedId, setExpandedId, onRevisar }) {
  const [collapsed, setCollapsed] = useState(false);

  const stats = useMemo(() => {
    let v = 0, a = 0, r = 0, s = 0;
    grupo.kpis.forEach(k => {
      const st = k.status || 'sem_dado';
      if (st === 'verde') v++; else if (st === 'amarelo') a++; else if (st === 'vermelho') r++; else s++;
    });
    return { v, a, r, s };
  }, [grupo.kpis]);

  return (
    <section className="rounded-lg border bg-card overflow-hidden" style={grupo.cor ? { borderLeft: `3px solid ${grupo.cor}` } : undefined}>
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-muted/30 transition-colors text-left"
      >
        {collapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        <strong className="text-sm">{grupo.label}</strong>
        <span className="text-xs text-muted-foreground">{grupo.kpis.length} KPI{grupo.kpis.length === 1 ? '' : 's'}</span>
        <div className="flex items-center gap-1.5 ml-auto text-[10px] tabular-nums">
          {stats.v > 0 && <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 font-semibold">{stats.v} ok</span>}
          {stats.a > 0 && <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 font-semibold">{stats.a} atrás</span>}
          {stats.r > 0 && <span className="px-1.5 py-0.5 rounded bg-red-500/10 text-red-600 font-semibold">{stats.r} crítico</span>}
          {stats.s > 0 && <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-semibold">{stats.s} sem dado</span>}
        </div>
      </button>
      {!collapsed && (
        <div className="border-t divide-y">
          {grupo.kpis.map(kpi => (
            <KpiLinha
              key={kpi.id}
              kpi={kpi}
              historico={historicoPorKpi.get(kpi.id) || []}
              expanded={expandedId === kpi.id}
              onToggleExpand={() => setExpandedId(expandedId === kpi.id ? null : kpi.id)}
              onRevisar={() => onRevisar(kpi)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function KpiLinha({ kpi, historico, expanded, onToggleExpand, onRevisar }) {
  const status = kpi.status || 'sem_dado';
  const cor = STATUS_COR[status];
  const sparkData = historico.map(h => ({ x: h.periodo_referencia, y: h.valor_realizado ?? 0 }));
  const ultimoValor = kpi.ultimo_valor;
  const anteriorReg = sparkData.length >= 2 ? sparkData[sparkData.length - 2].y : null;
  const delta = ultimoValor != null && anteriorReg != null ? formatDelta(ultimoValor, anteriorReg) : null;
  const pctMeta = kpi.meta_valor && ultimoValor != null && kpi.meta_valor !== 0
    ? Math.round((ultimoValor / kpi.meta_valor) * 100)
    : null;
  const modulo = moduloDoKpi(kpi);
  const podeRevisar = kpi.is_okr && (status === 'vermelho' || status === 'amarelo');

  return (
    <div style={{ borderLeft: `3px solid ${cor}` }} className="bg-card hover:bg-muted/20 transition-colors">
      <button onClick={onToggleExpand} className="w-full px-3 py-2.5 flex items-center gap-3 text-left">
        {/* Valor + meta */}
        <div className="w-20 shrink-0 text-right">
          <div className="text-xl font-bold tabular-nums leading-tight" style={{ color: cor }}>
            {ultimoValor != null ? ultimoValor.toLocaleString('pt-BR') : '—'}
          </div>
          {kpi.meta_valor != null && (
            <div className="text-[9px] text-muted-foreground">meta {kpi.meta_valor}{kpi.unidade ? ` ${kpi.unidade}` : ''}</div>
          )}
        </div>

        {/* Sparkline */}
        <div className="w-24 h-9 shrink-0">
          {sparkData.length > 1 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sparkData} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
                <Area type="monotone" dataKey="y" stroke={cor} fill={cor} fillOpacity={0.18} strokeWidth={1.5} dot={false} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-[9px] text-muted-foreground">sem histórico</div>
          )}
        </div>

        {/* Info principal */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-medium text-sm truncate">{kpi.indicador}</span>
            {kpi.is_okr && <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 bg-amber-100 dark:bg-amber-950 border-amber-400 text-amber-700 dark:text-amber-300">OKR</Badge>}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-muted-foreground flex-wrap">
            <span className="font-mono">{kpi.id}</span>
            <span>·</span>
            <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 capitalize">{kpi.area}</Badge>
            {kpi.pilar && <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 capitalize">{kpi.pilar}</Badge>}
            {(kpi.valores || []).slice(0, 2).map(v => (
              <Badge key={v} variant="outline" className="text-[9px] px-1 py-0 h-4 capitalize">{v}</Badge>
            ))}
            <span>·</span>
            <span className="capitalize">{kpi.periodicidade}</span>
            {kpi.ultimo_periodo && <><span>·</span><span>{kpi.ultimo_periodo}</span></>}
          </div>
        </div>

        {/* Delta + pct + chevron */}
        <div className="text-right shrink-0 min-w-[80px]">
          {delta != null && (
            <div className={`text-[11px] font-semibold inline-flex items-center gap-0.5 ${delta > 0 ? 'text-emerald-600' : delta < 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
              {delta > 0 ? <TrendingUp className="h-3 w-3" /> : delta < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
              {delta > 0 ? '+' : ''}{delta}%
            </div>
          )}
          {pctMeta != null && (
            <div className="text-[9px] text-muted-foreground">{pctMeta}% da meta</div>
          )}
          {expanded ? <ChevronDown className="h-3.5 w-3.5 inline mt-1 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 inline mt-1 text-muted-foreground" />}
        </div>
      </button>

      {/* Drilldown inline */}
      {expanded && (
        <div className="border-t bg-muted/20 p-4 space-y-4">
          {/* Sparkline grande */}
          {sparkData.length > 1 ? (
            <div className="h-40 bg-card rounded p-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={sparkData} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                  <XAxis dataKey="x" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ fontSize: 11, borderRadius: 6 }}
                    formatter={v => [Number(v).toLocaleString('pt-BR'), kpi.unidade || 'valor']}
                  />
                  <Area type="monotone" dataKey="y" stroke={cor} fill={cor} fillOpacity={0.25} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="rounded border border-dashed bg-card p-6 text-center text-xs text-muted-foreground">
              Sem histórico para gerar gráfico. Quando houver pelo menos 2 períodos, aparece aqui.
            </div>
          )}

          {/* Como mede + Onde preencher */}
          <div className="grid md:grid-cols-2 gap-3">
            <div className="rounded border bg-card p-3 text-xs">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1">Como mede</div>
              <p className="text-foreground leading-relaxed">
                {kpi.apuracao || kpi.descricao || <em className="text-muted-foreground">Sem descrição registrada · clique em Editar meta pra adicionar.</em>}
              </p>
              {kpi.meta_descricao && (
                <div className="mt-2 pt-2 border-t border-dashed text-muted-foreground">
                  <strong className="text-foreground">Meta:</strong> {kpi.meta_descricao}
                </div>
              )}
            </div>
            <div className="rounded border bg-card p-3 text-xs space-y-2">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Onde preencher</div>
              {modulo ? (
                <a href={modulo.path} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#00B39D]/10 text-[#00B39D] font-semibold hover:bg-[#00B39D]/20 transition-colors">
                  Abrir {modulo.titulo} <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                <p className="text-muted-foreground">Sem módulo mapeado. Lançar em <a href="/dados-brutos" className="text-[#00B39D] underline">Dados Brutos</a>.</p>
              )}
              {kpi.lider_nome && (
                <div className="text-[11px] text-muted-foreground pt-1 border-t border-dashed">
                  <strong className="text-foreground">Líder:</strong> {kpi.lider_nome}{kpi.lider_cargo ? ` · ${kpi.lider_cargo}` : ''}
                </div>
              )}
            </div>
          </div>

          {/* Histórico tabular */}
          {historico.length > 0 && (
            <div className="rounded border bg-card p-3">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-2">Histórico · {historico.length} período{historico.length === 1 ? '' : 's'}</div>
              <div className="grid grid-cols-3 md:grid-cols-6 gap-2 text-xs">
                {[...historico].reverse().slice(0, 12).map(h => (
                  <div key={h.id || h.periodo_referencia} className="rounded border px-2 py-1.5 text-center">
                    <div className="text-[9px] text-muted-foreground">{h.periodo_referencia}</div>
                    <div className="font-mono tabular-nums font-semibold">{h.valor_realizado?.toLocaleString('pt-BR') ?? '—'}</div>
                    {h.origem && (
                      <div className="text-[8px] text-muted-foreground capitalize mt-0.5">{h.origem}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Acoes · /minha-area e so visualizacao · meta editavel em /gestao */}
          <div className="flex items-center gap-2 flex-wrap">
            {podeRevisar && (
              <Button size="sm" variant="outline" onClick={onRevisar} className="h-7 text-xs gap-1.5" style={{ borderColor: cor, color: cor }}>
                <ClipboardCheck className="h-3 w-3" /> Registrar revisão OKR
              </Button>
            )}
            {kpi.is_okr && !podeRevisar && (
              <span className="text-[10px] text-muted-foreground">Revisão OKR disponível quando status fica amarelo/vermelho.</span>
            )}
            <span className="text-[10px] text-muted-foreground ml-auto">
              Meta editável em <a href="/gestao?aba=configurar" className="text-[#00B39D] hover:underline">/gestao · Configurar</a>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
