// ============================================================================
// PainelArea · drill-down read-only de KPIs por area de culto (kids/ami/bridge/online)
// ============================================================================
// Marcos (2026-05-20): "criar Kids, AMI e Bridge no padrao do Online · visualizar
// todos os indicadores ligados a area". Preenchimento continua em /integracao.
// ============================================================================

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { painelArea as api } from '../../api';
import { Card } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/tabs';
import {
  Baby, GraduationCap, ArrowRightLeft as BridgeIcon, Youtube,
  TrendingUp, AlertCircle, CheckCircle2, Info, Pencil, ArrowRight,
} from 'lucide-react';
import { toast } from 'sonner';

// Metadata por area · cor + icone + descricao curta
const AREA_META = {
  kids: {
    nome: 'CBKids',
    descricao: 'Indicadores do ministério infantil',
    cor: '#EC4899', corBg: 'bg-pink-500/10', corBorder: 'border-pink-500/30', corText: 'text-pink-700 dark:text-pink-400',
    icon: Baby,
  },
  ami: {
    nome: 'AMI',
    descricao: 'Indicadores do culto AMI (adolescentes/jovens)',
    cor: '#8B5CF6', corBg: 'bg-violet-500/10', corBorder: 'border-violet-500/30', corText: 'text-violet-700 dark:text-violet-400',
    icon: GraduationCap,
  },
  bridge: {
    nome: 'Bridge',
    descricao: 'Indicadores do culto Bridge (transição)',
    cor: '#3B82F6', corBg: 'bg-blue-500/10', corBorder: 'border-blue-500/30', corText: 'text-blue-700 dark:text-blue-400',
    icon: BridgeIcon,
  },
  online: {
    nome: 'Online',
    descricao: 'Indicadores do culto Online (YouTube)',
    cor: '#EF4444', corBg: 'bg-red-500/10', corBorder: 'border-red-500/30', corText: 'text-red-700 dark:text-red-400',
    icon: Youtube,
  },
};

const VALOR_LABELS = {
  seguir: 'Seguir a Jesus',
  conectar: 'Conectar com Pessoas',
  investir: 'Investir Tempo com Deus',
  servir: 'Servir em Comunidade',
  generosidade: 'Viver Generosamente',
};

const STATUS_META = {
  no_alvo:   { label: 'No alvo', color: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400', icon: CheckCircle2 },
  atrasado:  { label: 'Atrasado', color: 'bg-amber-500/15 text-amber-700 dark:text-amber-400', icon: AlertCircle },
  critico:   { label: 'Crítico', color: 'bg-red-500/15 text-red-700 dark:text-red-400', icon: AlertCircle },
  sem_dado:  { label: 'Sem dado', color: 'bg-muted text-muted-foreground', icon: Info },
};

function statusKey(traj) {
  if (!traj || traj.ultimo_valor == null) return 'sem_dado';
  return traj.status_trajetoria || 'sem_dado';
}

export default function PainelArea({ area }) {
  const navigate = useNavigate();
  const meta = AREA_META[area] || AREA_META.online;
  const Icon = meta.icon || Info;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [valorFiltro, setValorFiltro] = useState('todos');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.get(area)
      .then(d => { if (!cancelled) setData(d); })
      .catch(e => { if (!cancelled) toast.error(e.message || 'Erro ao carregar área'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [area]);

  const kpisFiltrados = useMemo(() => {
    if (!data?.kpis) return [];
    if (valorFiltro === 'todos') return data.kpis;
    if (valorFiltro === 'sem-valor') return data.sem_valor || [];
    return (data.por_valor?.[valorFiltro] || []);
  }, [data, valorFiltro]);

  if (loading) {
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

  const stats = data.stats || { com_meta: 0, no_alvo: 0, atrasado: 0, critico: 0 };
  const valoresComKpis = Object.keys(data.por_valor || {}).filter(v => (data.por_valor[v] || []).length > 0);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className={`rounded-lg border-2 ${meta.corBorder} ${meta.corBg} p-5`}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            <div className={`rounded-lg p-2.5 ${meta.corBg} border ${meta.corBorder}`}>
              <Icon className={`h-7 w-7 ${meta.corText}`} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">{meta.nome}</h1>
              <p className="text-sm text-muted-foreground mt-1">{meta.descricao}</p>
              <div className="flex items-center gap-2 mt-2 text-xs">
                <Badge variant="outline">Somente leitura</Badge>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground">
                  Preenchimento via <span className="font-mono">/integracao</span>
                </span>
              </div>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/ministerial/integracao?aba=cultos')}
            className="gap-1.5"
          >
            <Pencil className="h-3.5 w-3.5" /> Preencher dados
          </Button>
        </div>
      </div>

      {/* Cards de stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total de indicadores" value={data.total} />
        <StatCard label="No alvo" value={stats.no_alvo} color="text-emerald-600 dark:text-emerald-400" />
        <StatCard label="Atrasados" value={stats.atrasado} color="text-amber-600 dark:text-amber-400" />
        <StatCard label="Críticos" value={stats.critico} color="text-red-600 dark:text-red-400" />
      </div>

      {data.total === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Nenhum KPI ativo cadastrado para esta área ainda.
        </Card>
      ) : (
        <>
          {/* Filtro por valor da Jornada */}
          <Tabs value={valorFiltro} onValueChange={setValorFiltro}>
            <TabsList className="flex flex-wrap h-auto">
              <TabsTrigger value="todos">Todos ({data.total})</TabsTrigger>
              {valoresComKpis.map(v => (
                <TabsTrigger key={v} value={v}>
                  {VALOR_LABELS[v] || v} ({data.por_valor[v].length})
                </TabsTrigger>
              ))}
              {(data.sem_valor || []).length > 0 && (
                <TabsTrigger value="sem-valor">
                  Sem valor ({data.sem_valor.length})
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value={valorFiltro} className="mt-4 space-y-3">
              {kpisFiltrados.map(k => (
                <KpiRow key={k.id} kpi={k} onClick={() => navigate(`/painel/kpi/${k.id}`)} />
              ))}
              {kpisFiltrados.length === 0 && (
                <Card className="p-6 text-center text-sm text-muted-foreground">
                  Nenhum indicador neste filtro.
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, color = '' }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color || 'text-foreground'}`}>{value}</p>
    </Card>
  );
}

function KpiRow({ kpi, onClick }) {
  const sKey = statusKey(kpi.trajetoria);
  const sMeta = STATUS_META[sKey];
  const SIcon = sMeta.icon;
  const traj = kpi.trajetoria || {};
  const valor = traj.ultimo_valor;
  const meta = traj.checkpoint_meta;
  const pct = traj.percentual_meta;

  return (
    <Card className="p-4 hover:bg-accent/30 transition-colors cursor-pointer" onClick={onClick}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono text-muted-foreground">{kpi.id}</span>
            {kpi.is_okr && <Badge variant="secondary" className="text-[10px]">OKR</Badge>}
            <Badge className={`text-[10px] gap-1 ${sMeta.color}`}>
              <SIcon className="h-3 w-3" />
              {sMeta.label}
            </Badge>
            {kpi.periodicidade && (
              <span className="text-[10px] text-muted-foreground">{kpi.periodicidade}</span>
            )}
          </div>
          <p className="text-sm font-medium text-foreground mt-1">{kpi.indicador}</p>
          {kpi.descricao && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{kpi.descricao}</p>
          )}
          {kpi.lider?.nome && (
            <p className="text-[11px] text-muted-foreground mt-1">
              <span className="opacity-70">Líder:</span> {kpi.lider.nome}
            </p>
          )}
        </div>
        <div className="text-right shrink-0">
          {valor != null ? (
            <>
              <p className="text-lg font-bold">{Number(valor).toLocaleString('pt-BR')}{kpi.unidade && kpi.unidade !== 'unidade' ? ` ${kpi.unidade}` : ''}</p>
              {meta != null && (
                <p className="text-[11px] text-muted-foreground">
                  meta {Number(meta).toLocaleString('pt-BR')}
                  {pct != null && (
                    <span className={pct >= 100 ? 'text-emerald-600 ml-1' : pct >= 70 ? 'text-amber-600 ml-1' : 'text-red-600 ml-1'}>
                      ({Math.round(pct)}%)
                    </span>
                  )}
                </p>
              )}
            </>
          ) : (
            <span className="text-xs text-muted-foreground italic">sem dado</span>
          )}
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
      </div>
    </Card>
  );
}
