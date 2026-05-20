// ============================================================================
// PainelArea v2 · drill-down de KPIs + DADOS BRUTOS + saude por area
// ============================================================================
// Marcos (2026-05-20): "torne mais bonito · separe dado de indicador · adicione
// visualizacao de saude da area que filtre/passe pro lado".
//
// Estrutura: header com score + 3 tabs (Saude · Dados · Indicadores) + NPS
// destacado no topo.
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

const STATUS_META = {
  no_alvo:   { label: 'No alvo',  className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
  atrasado:  { label: 'Atrasado', className: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  critico:   { label: 'Crítico',  className: 'bg-red-500/15 text-red-700 dark:text-red-400' },
  sem_dado:  { label: 'Sem dado', className: 'bg-muted text-muted-foreground' },
};

const SAUDE_META = {
  saudavel: { label: 'Saudável', color: '#10b981', bg: '#10b98115' },
  atencao:  { label: 'Atenção',  color: '#f59e0b', bg: '#f59e0b15' },
  risco:    { label: 'Em risco', color: '#ef4444', bg: '#ef444415' },
  critico:  { label: 'Crítico',  color: '#dc2626', bg: '#dc262615' },
};

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

export default function PainelArea({ area }) {
  const navigate = useNavigate();
  const { isAdmin, getAccessLevel } = useAuth();
  const meta = AREA_META[area] || AREA_META.online;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

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

  const npsDestaque = useMemo(() => {
    if (!data?.kpis) return [];
    return data.kpis.filter(k => /^CULTO-NPS-/i.test(k.id));
  }, [data]);

  const kpisRegulares = useMemo(() => {
    if (!data?.kpis) return [];
    return data.kpis.filter(k => !/^CULTO-NPS-/i.test(k.id));
  }, [data]);

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

  const saude = data.saude || {};
  const saudeMeta = SAUDE_META[saude.diagnostico] || SAUDE_META.atencao;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
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
          <div className="flex items-center gap-2 mt-3 text-xs">
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
            className="w-32 h-32 rounded-full flex flex-col items-center justify-center border-4"
            style={{
              borderColor: saudeMeta.color,
              background: saudeMeta.bg,
            }}
          >
            <span className="text-3xl font-bold" style={{ color: saudeMeta.color }}>
              {saude.score ?? 0}
            </span>
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Score
            </span>
          </div>
          <div>
            <div className="text-sm font-semibold" style={{ color: saudeMeta.color }}>
              {saudeMeta.label}
            </div>
            <div className="text-xs text-muted-foreground mt-1 max-w-[150px]">
              {saude.pct_no_alvo ?? 0}% dos indicadores no alvo
            </div>
          </div>
        </div>
      </div>

      {/* ─────────────────────── NPS DESTACADO ─────────────────────── */}
      {npsDestaque.length > 0 && (
        <Card
          className="overflow-hidden"
          style={{ borderColor: meta.accentBorder, borderWidth: 2 }}
        >
          <div className="p-4 border-b border-border" style={{ background: meta.accentSoft }}>
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

      {/* ─────────────────────── TABS PRINCIPAIS ─────────────────────── */}
      <Tabs defaultValue="saude">
        <TabsList className="grid grid-cols-3 w-full max-w-md">
          <TabsTrigger value="saude">Saúde</TabsTrigger>
          <TabsTrigger value="dados">
            Dados {data.dados?.length > 0 && <span className="ml-1 opacity-60">({data.dados.length})</span>}
          </TabsTrigger>
          <TabsTrigger value="indicadores">
            Indicadores {kpisRegulares.length > 0 && <span className="ml-1 opacity-60">({kpisRegulares.length})</span>}
          </TabsTrigger>
        </TabsList>

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

        {/* ──────── ABA DADOS ──────── */}
        <TabsContent value="dados" className="mt-6">
          {data.dados?.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              Nenhum dado bruto registrado pra esta área ainda.
            </Card>
          ) : (
            <DadosPorValor dados={data.dados || []} accent={meta.accent} />
          )}
          <p className="text-xs text-muted-foreground mt-3">
            Dados brutos são os números preenchidos diretamente em <span className="font-mono">/integracao</span>.
            Os indicadores (aba ao lado) são calculados automaticamente a partir desses dados.
            Cada dado pode alimentar KPIs de um ou mais <strong>valores da Jornada</strong>.
          </p>
        </TabsContent>

        {/* ──────── ABA INDICADORES ──────── */}
        <TabsContent value="indicadores" className="mt-6">
          {kpisRegulares.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              Nenhum indicador cadastrado pra esta área ainda.
            </Card>
          ) : (
            <IndicadoresPorValor kpis={kpisRegulares} porValor={data.por_valor} semValor={data.sem_valor} navigate={navigate} accent={meta.accent} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─────────────────────────── COMPONENTES ───────────────────────────

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

function DadoRow({ dado, accent }) {
  const variacao = dado.variacao_mes_pct;
  const variacaoTexto = variacao == null
    ? null
    : `${variacao >= 0 ? '+' : ''}${Math.round(variacao)}% vs mês anterior`;
  const variacaoColor = variacao == null
    ? 'text-muted-foreground'
    : variacao >= 10 ? 'text-emerald-600 dark:text-emerald-400'
    : variacao <= -10 ? 'text-red-600 dark:text-red-400'
    : 'text-muted-foreground';

  // Mini sparkline
  const valoresHist = dado.historico_6.map(h => h.valor);
  const maxV = Math.max(...valoresHist, 1);
  const minV = Math.min(...valoresHist, 0);
  const range = maxV - minV || 1;

  // Valores da Jornada que esse dado alimenta
  const valoresJornada = dado.valores_jornada || [];

  return (
    <div className="p-4 flex items-start gap-4 flex-wrap">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{dado.tipo_nome}</p>
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
          <span className="text-muted-foreground">
            · {dado.total_registros} registros (180d)
          </span>
        </div>
        {valoresJornada.length > 0 && (
          <div className="flex items-center gap-1 mt-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Alimenta:</span>
            {valoresJornada.map(v => (
              <span
                key={v}
                className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                style={{
                  background: (VALOR_CORES[v] || '#94a3b8') + '20',
                  color: VALOR_CORES[v] || '#475569',
                }}
              >
                {VALOR_LABELS[v]?.split(' ')[0] || v}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Sparkline mini */}
      {valores.length > 1 && (
        <svg width="80" height="32" className="shrink-0">
          <polyline
            fill="none"
            stroke={accent}
            strokeWidth="2"
            points={valores.map((v, i) => {
              const x = (i / (valores.length - 1)) * 78 + 1;
              const y = 30 - ((v - minV) / range) * 28;
              return `${x},${y}`;
            }).join(' ')}
          />
        </svg>
      )}

      <div className="text-right shrink-0 min-w-[100px]">
        <p className="text-2xl font-bold text-foreground">{formatNum(dado.ultimo_valor)}</p>
        <p className="text-[10px] text-muted-foreground">{dado.unidade}</p>
        {variacaoTexto && (
          <p className={`text-[11px] mt-1 ${variacaoColor}`}>{variacaoTexto}</p>
        )}
      </div>
    </div>
  );
}

function DadosPorValor({ dados, accent }) {
  const [filtro, setFiltro] = useState('todos');

  // Conta dados por valor (dado pode alimentar varios valores)
  const contagem = useMemo(() => {
    const c = { todos: dados.length, sem_valor: 0 };
    for (const d of dados) {
      const vals = d.valores_jornada || [];
      if (vals.length === 0) c.sem_valor++;
      for (const v of vals) c[v] = (c[v] || 0) + 1;
    }
    return c;
  }, [dados]);

  const valoresDisp = useMemo(
    () => Object.keys(contagem).filter(v => v !== 'todos' && v !== 'sem_valor' && contagem[v] > 0),
    [contagem]
  );

  const dadosFiltrados = useMemo(() => {
    if (filtro === 'todos') return dados;
    if (filtro === 'sem-valor') return dados.filter(d => !d.valores_jornada || d.valores_jornada.length === 0);
    return dados.filter(d => (d.valores_jornada || []).includes(filtro));
  }, [filtro, dados]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <FilterPill active={filtro === 'todos'} onClick={() => setFiltro('todos')} accent={accent}>
          Todos ({contagem.todos})
        </FilterPill>
        {valoresDisp.map(v => (
          <FilterPill key={v} active={filtro === v} onClick={() => setFiltro(v)} accent={VALOR_CORES[v] || accent}>
            {VALOR_LABELS[v] || v} ({contagem[v]})
          </FilterPill>
        ))}
        {contagem.sem_valor > 0 && (
          <FilterPill active={filtro === 'sem-valor'} onClick={() => setFiltro('sem-valor')} accent={accent}>
            Sem valor ({contagem.sem_valor})
          </FilterPill>
        )}
      </div>

      <Card className="divide-y divide-border">
        {dadosFiltrados.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            Nenhum dado neste filtro.
          </div>
        ) : (
          dadosFiltrados.map(d => (
            <DadoRow key={d.tipo_id} dado={d} accent={accent} />
          ))
        )}
      </Card>
    </div>
  );
}

function IndicadoresPorValor({ kpis, porValor, semValor, navigate, accent }) {
  const [filtro, setFiltro] = useState('todos');

  const kpisFiltrados = useMemo(() => {
    if (filtro === 'todos') return kpis;
    if (filtro === 'sem-valor') return semValor.filter(k => !/^CULTO-NPS-/i.test(k.id));
    return (porValor?.[filtro] || []).filter(k => !/^CULTO-NPS-/i.test(k.id));
  }, [filtro, kpis, porValor, semValor]);

  const valoresDisp = porValor
    ? Object.keys(porValor).filter(v => (porValor[v] || []).some(k => !/^CULTO-NPS-/i.test(k.id)))
    : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <FilterPill active={filtro === 'todos'} onClick={() => setFiltro('todos')} accent={accent}>
          Todos ({kpis.length})
        </FilterPill>
        {valoresDisp.map(v => {
          const count = (porValor[v] || []).filter(k => !/^CULTO-NPS-/i.test(k.id)).length;
          return (
            <FilterPill key={v} active={filtro === v} onClick={() => setFiltro(v)} accent={VALOR_CORES[v] || accent}>
              {VALOR_LABELS[v] || v} ({count})
            </FilterPill>
          );
        })}
      </div>

      <Card className="divide-y divide-border">
        {kpisFiltrados.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            Nenhum indicador neste filtro.
          </div>
        ) : (
          kpisFiltrados.map(k => (
            <KpiRow key={k.id} kpi={k} onClick={() => navigate(`/painel/kpi/${k.id}`)} />
          ))
        )}
      </Card>
    </div>
  );
}

function FilterPill({ active, onClick, accent, children }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1.5 rounded-full text-xs font-medium border transition-colors"
      style={
        active
          ? { background: accent, color: '#fff', borderColor: accent }
          : { background: 'transparent', color: 'inherit', borderColor: 'rgb(226, 232, 240)' }
      }
    >
      {children}
    </button>
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
          <Badge className={`text-[10px] ${sMeta.className}`}>{sMeta.label}</Badge>
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
              {formatNum(valor)}
              {kpi.unidade && kpi.unidade !== 'unidade' ? ` ${kpi.unidade}` : ''}
            </p>
            {meta != null && (
              <p className="text-[11px] text-muted-foreground">
                meta {formatNum(meta)}
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
