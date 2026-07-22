import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { dashboardSemanal as api } from '../../api';
import KpiPorValor from './KpiPorValor';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Badge } from '../ui/badge';
import { Loader2, Search, TrendingUp, TrendingDown, Target, User } from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend,
} from 'recharts';

// Mesma paleta dos outros gráficos do dashboard
const COR_LINHA = '#00B39D';
const COR_META = '#E97A3F';

const VALORES_JORNADA = [
  { key: 'seguir', label: 'Seguir' },
  { key: 'conectar', label: 'Conectar' },
  { key: 'investir', label: 'Investir' },
  { key: 'servir', label: 'Servir' },
  { key: 'generosidade', label: 'Generosidade' },
];

const PERIODICIDADES = ['semanal', 'mensal', 'trimestral', 'semestral', 'anual'];

function statusCor(status) {
  if (status === 'no_alvo' || status === 'verde') return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30';
  if (status === 'atras' || status === 'amarelo') return 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30';
  if (status === 'critico' || status === 'vermelho') return 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30';
  return 'bg-muted text-muted-foreground border-border';
}

function statusDot(status) {
  if (status === 'no_alvo' || status === 'verde') return 'bg-emerald-500';
  if (status === 'atras' || status === 'amarelo') return 'bg-amber-500';
  if (status === 'critico' || status === 'vermelho') return 'bg-rose-500';
  return 'bg-muted-foreground/40';
}

function statusLabel(status) {
  const map = {
    no_alvo: 'No alvo', verde: 'No alvo',
    atras: 'Atrasado', amarelo: 'Atrasado',
    critico: 'Crítico', vermelho: 'Crítico',
    sem_dado: 'Sem dado',
  };
  return map[status] || status || 'Sem status';
}

export default function DashKpisAba() {
  const [busca, setBusca] = useState('');
  const [areaFiltro, setAreaFiltro] = useState('todas');
  const [valorFiltro, setValorFiltro] = useState('todos');
  const [periodicidadeFiltro, setPeriodicidadeFiltro] = useState('todas');
  const [dadosFiltro, setDadosFiltro] = useState('todos'); // todos | com | sem
  const [kpiSel, setKpiSel] = useState(null);
  const [modo, setModo] = useState('valor'); // valor | lista

  const { data: kpis = [], isLoading: loadingList } = useQuery({
    queryKey: ['dash-sem', 'kpis-taticos'],
    queryFn: () => api.kpisTaticos(),
    staleTime: 60_000,
  });

  // Filtros client-side
  const kpisFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return kpis.filter(k => {
      if (k.ativo === false) return false;
      if (areaFiltro !== 'todas' && k.area !== areaFiltro) return false;
      if (periodicidadeFiltro !== 'todas' && k.periodicidade !== periodicidadeFiltro) return false;
      if (valorFiltro !== 'todos') {
        const valores = Array.isArray(k.valores) ? k.valores : [];
        if (!valores.includes(valorFiltro)) return false;
      }
      if (dadosFiltro === 'com' && k.ultimo_valor == null) return false;
      if (dadosFiltro === 'sem' && k.ultimo_valor != null) return false;
      if (termo) {
        const hay = `${k.indicador || ''} ${k.descricao || ''} ${k.area || ''}`.toLowerCase();
        if (!hay.includes(termo)) return false;
      }
      return true;
    });
  }, [kpis, busca, areaFiltro, valorFiltro, periodicidadeFiltro, dadosFiltro]);

  // Default · 1º KPI da lista filtrada quando muda o filtro/lista
  useEffect(() => {
    if (!kpisFiltrados.length) { setKpiSel(null); return; }
    setKpiSel(prev => {
      if (prev && kpisFiltrados.some(k => k.id === prev)) return prev;
      return kpisFiltrados[0].id;
    });
  }, [kpisFiltrados]);

  // Lista de áreas distintas do dataset (pra popular o filtro com o que existe)
  const areasDistintas = useMemo(() => {
    const set = new Set();
    kpis.forEach(k => k.area && set.add(k.area));
    return [...set].sort();
  }, [kpis]);

  return (
    <div className="space-y-3">
      {/* Toggle de visão */}
      <div className="inline-flex rounded-lg border border-border p-0.5 text-sm">
        {[['valor', 'Por valor'], ['lista', 'Lista']].map(([k, l]) => (
          <button key={k} onClick={() => setModo(k)}
            className={`rounded-md px-3 py-1.5 font-medium transition-colors ${modo === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>
            {l}
          </button>
        ))}
      </div>

      {modo === 'valor' ? <KpiPorValor /> : (
    <div className="grid grid-cols-12 gap-4">
      {/* Sidebar · lista de KPIs */}
      <div className="col-span-12 lg:col-span-4 space-y-3">
        <Card>
          <CardContent className="p-3 space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Buscar KPI por nome, descrição ou área"
                className="pl-8 h-9 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Select value={areaFiltro} onValueChange={setAreaFiltro}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Área" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas as áreas</SelectItem>
                  {areasDistintas.map(a => (
                    <SelectItem key={a} value={a} className="capitalize">{a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={dadosFiltro} onValueChange={setDadosFiltro}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Dados" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="com">Com dados</SelectItem>
                  <SelectItem value="sem">Sem dados</SelectItem>
                </SelectContent>
              </Select>
              <Select value={valorFiltro} onValueChange={setValorFiltro}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Valor" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos valores</SelectItem>
                  {VALORES_JORNADA.map(v => (
                    <SelectItem key={v.key} value={v.key}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={periodicidadeFiltro} onValueChange={setPeriodicidadeFiltro}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Período" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todos períodos</SelectItem>
                  {PERIODICIDADES.map(p => (
                    <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="text-[11px] text-muted-foreground pt-1">
              {loadingList ? 'Carregando…' : `${kpisFiltrados.length} de ${kpis.length} KPIs`}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-1.5 max-h-[640px] overflow-y-auto pr-1">
          {loadingList ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : kpisFiltrados.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
              Nenhum KPI bate com os filtros.
            </div>
          ) : (
            kpisFiltrados.map(k => {
              const ativo = k.id === kpiSel;
              return (
                <button
                  key={k.id}
                  onClick={() => setKpiSel(k.id)}
                  className={`w-full text-left rounded-lg border px-3 py-2 transition-colors ${
                    ativo
                      ? 'border-[#00B39D] bg-[#00B39D]/5'
                      : 'border-border bg-card hover:border-[#00B39D]/40'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${statusDot(k.status)}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium leading-snug line-clamp-2">{k.indicador}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        {k.area && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground capitalize">
                            {k.area}
                          </span>
                        )}
                        {k.periodicidade && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground capitalize">
                            {k.periodicidade}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Detalhe do KPI selecionado */}
      <div className="col-span-12 lg:col-span-8">
        {kpiSel ? <KpiDetalhe key={kpiSel} id={kpiSel} resumo={kpis.find(k => k.id === kpiSel)} /> : (
          <Card>
            <CardContent className="py-16 text-center text-sm text-muted-foreground">
              Selecione um KPI à esquerda pra ver o gráfico e os detalhes.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
      )}
    </div>
  );
}

function KpiDetalhe({ id, resumo }) {
  const { data, isLoading } = useQuery({
    queryKey: ['dash-sem', 'kpi-detalhe', id],
    queryFn: () => api.kpiDetalhe(id),
    staleTime: 60_000,
  });

  // HOOKS · todas antes de qualquer early return (regra dos hooks · React #310).
  // O default do tipo de chart depende de resumo.tipo_calculo (prop estavel,
  // não precisa de data). Como o componente esta keyed por id no pai, o
  // useState reseta ao trocar de KPI.
  const tipoCalculo = resumo?.tipo_calculo;
  const ehDelta = tipoCalculo === 'delta_pct' || tipoCalculo === 'delta_abs';
  const [tipoChart, setTipoChart] = useState(ehDelta ? 'barra' : 'linha');

  // Série pro gráfico · usa data?.histórico de forma segura (data pode ainda
  // estar carregando). Corta zeros/null no FIM (semanas não fechadas) · mesmo
  // padrão do /media-movel e /mensal pra linha parar no último ponto real.
  const serie = useMemo(() => {
    const historico = data?.historico || [];
    const arr = historico.map(h => ({
      periodo: h.periodo_referencia,
      valor: h.valor_realizado != null ? Number(h.valor_realizado) : null,
    }));
    let fim = arr.length;
    while (fim > 0 && (arr[fim - 1].valor == null || arr[fim - 1].valor === 0)) fim--;
    return arr.slice(0, fim);
  }, [data]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-16 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }
  if (!data?.kpi) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Não foi possível carregar o KPI.
        </CardContent>
      </Card>
    );
  }

  const { kpi, checkpoints = [], lider, trajetoria_atual, historico = [] } = data;
  const status = trajetoria_atual?.status_trajetoria || resumo?.status;
  const meta = resumo?.meta_periodo ?? resumo?.meta_efetiva ?? kpi.meta_valor;
  const valores = Array.isArray(kpi.valores) ? kpi.valores : [];

  const corBarra = (v) => {
    if (!ehDelta) return COR_LINHA;
    if (v == null) return '#94a3b8';
    return v >= 0 ? '#10b981' : '#ef4444';
  };

  // Delta vs período anterior (mesmo na série)
  const ultimo = serie[serie.length - 1];
  const penultimo = serie[serie.length - 2];
  let deltaPct = null;
  if (ultimo && penultimo && penultimo.valor != null && penultimo.valor !== 0 && ultimo.valor != null) {
    deltaPct = ((ultimo.valor - penultimo.valor) / penultimo.valor) * 100;
  }

  return (
    <div className="space-y-3">
      {/* Header do KPI */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <CardTitle className="text-base leading-snug">{kpi.indicador}</CardTitle>
              {kpi.descricao && (
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{kpi.descricao}</p>
              )}
            </div>
            <Badge variant="outline" className={`shrink-0 ${statusCor(status)}`}>
              {statusLabel(status)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
            {kpi.area && (
              <span className="capitalize"><span className="text-muted-foreground">Área:</span>{' '}<strong>{kpi.area}</strong></span>
            )}
            {kpi.periodicidade && (
              <span className="capitalize"><span className="text-muted-foreground">Período:</span>{' '}<strong>{kpi.periodicidade}</strong></span>
            )}
            {kpi.unidade && (
              <span><span className="text-muted-foreground">Unidade:</span>{' '}<strong>{kpi.unidade}</strong></span>
            )}
            {meta != null && (
              <span className="inline-flex items-center gap-1">
                <Target className="h-3 w-3 text-[#E97A3F]" />
                <span className="text-muted-foreground">Meta:</span>{' '}<strong>{Number(meta).toLocaleString('pt-BR')}</strong>
              </span>
            )}
            {lider && (
              <span className="inline-flex items-center gap-1">
                <User className="h-3 w-3 text-muted-foreground" />
                <span className="text-muted-foreground">Líder:</span>{' '}<strong>{lider.nome}</strong>
              </span>
            )}
          </div>
          {valores.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {valores.map(v => (
                <span key={v} className="text-[10px] px-1.5 py-0.5 rounded bg-[#00B39D]/10 text-[#00B39D] capitalize">
                  {v}
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Mini stats: último valor, período, delta */}
      {ultimo && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="text-[11px] text-muted-foreground">Último valor</div>
            <div className="text-2xl font-bold tabular-nums">
              {ultimo.valor != null ? Number(ultimo.valor).toLocaleString('pt-BR') : '—'}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">{ultimo.periodo}</div>
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="text-[11px] text-muted-foreground">Meta do período</div>
            <div className="text-2xl font-bold tabular-nums">
              {meta != null ? Number(meta).toLocaleString('pt-BR') : '—'}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {kpi.meta_descricao || (kpi.periodicidade ? `por ${kpi.periodicidade}` : '')}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="text-[11px] text-muted-foreground">Variação vs anterior</div>
            {deltaPct != null ? (
              <div className={`text-2xl font-bold inline-flex items-center gap-1 ${
                deltaPct >= 0 ? 'text-emerald-600' : 'text-rose-600'
              }`}>
                {deltaPct >= 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
                {deltaPct >= 0 ? '+' : ''}{deltaPct.toFixed(1)}%
              </div>
            ) : (
              <div className="text-2xl font-bold text-muted-foreground">—</div>
            )}
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {penultimo ? `vs ${penultimo.periodo}` : 'sem ponto anterior'}
            </div>
          </div>
        </div>
      )}

      {/* Gráfico · histórico · linha (default) ou barra (delta) */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-sm font-medium">
            Histórico {kpi.periodicidade ? `(${kpi.periodicidade})` : ''} · últimos {serie.length} registros
          </CardTitle>
          <div className="inline-flex rounded-lg border p-0.5">
            {['linha', 'barra'].map(t => (
              <button
                key={t}
                onClick={() => setTipoChart(t)}
                className={`px-2.5 py-0.5 text-[11px] font-medium rounded capitalize transition-colors ${
                  tipoChart === t ? 'bg-[#00B39D] text-white' : 'text-muted-foreground hover:text-foreground'
                }`}
                title={ehDelta && t === 'barra' ? 'Sugerido pra KPIs de variação (positivo/negativo em verde/vermelho)' : undefined}
              >
                {t}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {serie.length === 0 ? (
            <div className="h-[320px] flex items-center justify-center text-sm text-muted-foreground">
              Sem registros históricos pra esse KPI ainda.
            </div>
          ) : (
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                {tipoChart === 'barra' ? (
                  <BarChart data={serie} margin={{ top: 16, right: 20, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                    <XAxis dataKey="periodo" tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={20} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip
                      cursor={{ fill: 'rgba(0,179,157,0.06)' }}
                      contentStyle={{ borderRadius: 8, fontSize: 12 }}
                      formatter={v => (v == null ? '—' : Number(v).toLocaleString('pt-BR'))}
                    />
                    <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                    {meta != null && !ehDelta && (
                      <ReferenceLine y={Number(meta)} stroke={COR_META} strokeDasharray="4 4" strokeWidth={1.5}
                        label={{ value: 'Meta', position: 'right', fontSize: 10, fill: COR_META }} />
                    )}
                    {ehDelta && (
                      <ReferenceLine y={0} stroke="#94a3b8" strokeWidth={1} />
                    )}
                    <Bar dataKey="valor" name={kpi.indicador} radius={[4, 4, 0, 0]}>
                      {serie.map((d, i) => (
                        <Cell key={i} fill={corBarra(d.valor)} />
                      ))}
                    </Bar>
                  </BarChart>
                ) : (
                <LineChart data={serie} margin={{ top: 16, right: 20, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                  <XAxis dataKey="periodo" tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={20} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, fontSize: 12 }}
                    formatter={v => (v == null ? '—' : Number(v).toLocaleString('pt-BR'))}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                  {meta != null && !ehDelta && (
                    <ReferenceLine y={Number(meta)} stroke={COR_META} strokeDasharray="4 4" strokeWidth={1.5}
                      label={{ value: 'Meta', position: 'right', fontSize: 10, fill: COR_META }} />
                  )}
                  {ehDelta && (
                    <ReferenceLine y={0} stroke="#94a3b8" strokeWidth={1} />
                  )}
                  <Line
                    type="monotone"
                    dataKey="valor"
                    name={kpi.indicador}
                    stroke={COR_LINHA}
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                    connectNulls={false}
                  />
                </LineChart>
                )}
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Trajetoria de checkpoints · só se houver */}
      {checkpoints.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Trajetória planejada · {checkpoints.length} checkpoints</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-1.5 px-2 font-medium text-muted-foreground">Período</th>
                    <th className="text-right py-1.5 px-2 font-medium text-muted-foreground">Meta planejada</th>
                    <th className="text-right py-1.5 px-2 font-medium text-muted-foreground">Realizado</th>
                    <th className="text-left py-1.5 px-2 font-medium text-muted-foreground">Obs</th>
                  </tr>
                </thead>
                <tbody>
                  {checkpoints.map(cp => {
                    const real = historico.find(h => h.periodo_referencia === cp.periodo_referencia);
                    return (
                      <tr key={cp.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="py-1.5 px-2 tabular-nums">{cp.periodo_referencia}</td>
                        <td className="text-right py-1.5 px-2 tabular-nums">
                          {cp.meta_valor != null ? Number(cp.meta_valor).toLocaleString('pt-BR') : (cp.meta_texto || '—')}
                        </td>
                        <td className="text-right py-1.5 px-2 tabular-nums">
                          {real?.valor_realizado != null ? Number(real.valor_realizado).toLocaleString('pt-BR') : '—'}
                        </td>
                        <td className="py-1.5 px-2 text-muted-foreground">{cp.observacao || ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
