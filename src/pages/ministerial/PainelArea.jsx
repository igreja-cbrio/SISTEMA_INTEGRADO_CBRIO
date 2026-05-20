// ============================================================================
// PainelArea · drill-down read-only de KPIs por area de culto (kids/ami/bridge/online)
// ============================================================================
// Marcos (2026-05-20): "criar Kids, AMI e Bridge no padrao do Online · visualizar
// todos os indicadores ligados a area". Preenchimento continua em /integracao.
//
// Visual sem icones · cores temáticas suaves · NPS de culto destacado no topo
// quando existir · botao "Preencher dados" so pra coordenador/admin.
// ============================================================================

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { painelArea as api } from '../../api';
import { Card } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/tabs';
import { toast } from 'sonner';

const AREA_META = {
  kids: {
    nome: 'Kids',
    descricao: 'Indicadores do ministério infantil',
    accent: '#EC4899',
    accentBg: 'rgba(236, 72, 153, 0.08)',
    accentBorder: 'rgba(236, 72, 153, 0.25)',
  },
  ami: {
    nome: 'AMI',
    descricao: 'Indicadores do culto AMI (adolescentes e jovens)',
    accent: '#8B5CF6',
    accentBg: 'rgba(139, 92, 246, 0.08)',
    accentBorder: 'rgba(139, 92, 246, 0.25)',
  },
  bridge: {
    nome: 'Bridge',
    descricao: 'Indicadores do culto Bridge (transição entre AMI e Sede)',
    accent: '#3B82F6',
    accentBg: 'rgba(59, 130, 246, 0.08)',
    accentBorder: 'rgba(59, 130, 246, 0.25)',
  },
  online: {
    nome: 'Online',
    descricao: 'Indicadores do culto Online (YouTube)',
    accent: '#EF4444',
    accentBg: 'rgba(239, 68, 68, 0.08)',
    accentBorder: 'rgba(239, 68, 68, 0.25)',
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
  no_alvo:   { label: 'No alvo',  color: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
  atrasado:  { label: 'Atrasado', color: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  critico:   { label: 'Crítico',  color: 'bg-red-500/15 text-red-700 dark:text-red-400' },
  sem_dado:  { label: 'Sem dado', color: 'bg-muted text-muted-foreground' },
};

function statusKey(traj) {
  if (!traj || traj.ultimo_valor == null) return 'sem_dado';
  return traj.status_trajetoria || 'sem_dado';
}

export default function PainelArea({ area }) {
  const navigate = useNavigate();
  const { isAdmin, getAccessLevel } = useAuth();
  const meta = AREA_META[area] || AREA_META.online;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [valorFiltro, setValorFiltro] = useState('todos');

  // Botao "Preencher dados" so pra coordenador da area ou admin
  const podePreencher = isAdmin || (getAccessLevel?.([area]) ?? 0) >= 3;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.get(area)
      .then(d => { if (!cancelled) setData(d); })
      .catch(e => { if (!cancelled) toast.error(e.message || 'Erro ao carregar área'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [area]);

  // NPS de culto destacado no topo · KPIs com id começando em CULTO-NPS-*
  const npsDestaque = useMemo(() => {
    if (!data?.kpis) return [];
    return data.kpis.filter(k => /^CULTO-NPS-/i.test(k.id));
  }, [data]);

  const kpisRegulares = useMemo(() => {
    if (!data?.kpis) return [];
    const naoNps = data.kpis.filter(k => !/^CULTO-NPS-/i.test(k.id));
    if (valorFiltro === 'todos') return naoNps;
    if (valorFiltro === 'sem-valor') {
      return naoNps.filter(k => !Array.isArray(k.valores) || k.valores.length === 0);
    }
    return naoNps.filter(k => Array.isArray(k.valores) && k.valores.includes(valorFiltro));
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
  const valoresComKpis = data.por_valor
    ? Object.keys(data.por_valor).filter(v => (data.por_valor[v] || []).length > 0)
    : [];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header limpo · barra de cor lateral só */}
      <div
        className="rounded-lg p-5 border"
        style={{
          background: meta.accentBg,
          borderColor: meta.accentBorder,
          borderLeftWidth: 4,
          borderLeftColor: meta.accent,
        }}
      >
        <div className="flex items-start justify-between gap-4 flex-wrap">
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
          {podePreencher && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/ministerial/integracao?aba=cultos')}
            >
              Preencher dados
            </Button>
          )}
        </div>
      </div>

      {/* Cards de stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total de indicadores" value={data.total} />
        <StatCard label="No alvo" value={stats.no_alvo} color="text-emerald-600 dark:text-emerald-400" />
        <StatCard label="Atrasados" value={stats.atrasado} color="text-amber-600 dark:text-amber-400" />
        <StatCard label="Críticos" value={stats.critico} color="text-red-600 dark:text-red-400" />
      </div>

      {/* NPS do culto destacado no topo */}
      {npsDestaque.length > 0 && (
        <Card
          className="overflow-hidden"
          style={{ borderColor: meta.accentBorder, borderWidth: 2 }}
        >
          <div className="p-4 border-b border-border" style={{ background: meta.accentBg }}>
            <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: meta.accent }}>
              NPS do culto · avaliação dos participantes
            </h2>
          </div>
          <div className="divide-y divide-border">
            {npsDestaque.map(k => (
              <KpiRow key={k.id} kpi={k} onClick={() => navigate(`/painel/kpi/${k.id}`)} />
            ))}
          </div>
        </Card>
      )}

      {data.total === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Nenhum KPI ativo cadastrado para esta área ainda.
        </Card>
      ) : (
        <>
          {/* Filtro por valor da Jornada */}
          <Tabs value={valorFiltro} onValueChange={setValorFiltro}>
            <TabsList className="flex flex-wrap h-auto">
              <TabsTrigger value="todos">Todos ({kpisRegulares.length})</TabsTrigger>
              {valoresComKpis.map(v => {
                const count = (data.por_valor[v] || []).filter(k => !/^CULTO-NPS-/i.test(k.id)).length;
                if (count === 0) return null;
                return (
                  <TabsTrigger key={v} value={v}>
                    {VALOR_LABELS[v] || v} ({count})
                  </TabsTrigger>
                );
              })}
              {(data.sem_valor || []).length > 0 && (
                <TabsTrigger value="sem-valor">
                  Sem valor ({data.sem_valor.length})
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value={valorFiltro} className="mt-4">
              <Card className="divide-y divide-border">
                {kpisRegulares.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    Nenhum indicador neste filtro.
                  </div>
                ) : (
                  kpisRegulares.map(k => (
                    <KpiRow key={k.id} kpi={k} onClick={() => navigate(`/painel/kpi/${k.id}`)} />
                  ))
                )}
              </Card>
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
  const traj = kpi.trajetoria || {};
  const valor = traj.ultimo_valor;
  const meta = traj.checkpoint_meta;
  const pct = traj.percentual_meta;

  return (
    <div
      className="p-4 hover:bg-accent/30 transition-colors cursor-pointer flex items-start justify-between gap-3"
      onClick={onClick}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-mono text-muted-foreground">{kpi.id}</span>
          {kpi.is_okr && <Badge variant="secondary" className="text-[10px]">OKR</Badge>}
          <Badge className={`text-[10px] ${sMeta.color}`}>{sMeta.label}</Badge>
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
            <p className="text-lg font-bold">
              {Number(valor).toLocaleString('pt-BR')}
              {kpi.unidade && kpi.unidade !== 'unidade' ? ` ${kpi.unidade}` : ''}
            </p>
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
    </div>
  );
}
