import { useState, useMemo } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { dashboardSemanal as api } from '../../api';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Loader2, TrendingUp, TrendingDown, Users, GitCompare, Check } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LabelList, Cell,
} from 'recharts';
import { INDICADORES } from '../../pages/DashboardSemanal';
import KpiCard from './KpiCard';
import OcupacaoGauge from './OcupacaoGauge';

const C = { primary: '#00B39D', media: '#7BAEC2', taxa: '#E97A3F' };

// Paleta para comparar múltiplos indicadores simultaneamente
const PALETA_MULTI = [
  '#00B39D', '#3b82f6', '#8b5cf6', '#ec4899',
  '#f59e0b', '#10b981', '#ef4444', '#06b6d4',
];

function isoWeekOf(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return { ano: d.getUTCFullYear(), semana: week };
}

export default function DashSemanalAba() {
  const hoje = new Date();
  const { ano: anoAtual, semana: semanaAtual } = isoWeekOf(hoje);
  const semanaAnterior = semanaAtual - 1 > 0 ? semanaAtual - 1 : 52;
  const anoSemAnterior = semanaAtual - 1 > 0 ? anoAtual : anoAtual - 1;

  const [ano, setAno] = useState(anoSemAnterior);
  const [semana, setSemana] = useState(semanaAnterior);
  // Multi-select: array de slugs dos indicadores selecionados
  const [indicadoresSel, setIndicadoresSel] = useState(['frequencia']);
  const [culto, setCulto] = useState('todos');

  const { data: cultos } = useQuery({
    queryKey: ['dash-sem', 'cultos'],
    queryFn: () => api.cultos(),
    staleTime: 30 * 60_000,
  });

  const { data: semanasDisp } = useQuery({
    queryKey: ['dash-sem', 'semanas', ano],
    queryFn: () => api.semanasDisponiveis(ano),
    staleTime: 5 * 60_000,
  });

  // Fetch paralelo · 1 query por indicador selecionado · sempre busca TODOS os
  // cultos (o filtro `culto` é aplicado client-side nos cards/taxa pra manter o
  // chart com todas as barras visíveis · click numa barra alterna o filtro).
  const results = useQueries({
    queries: indicadoresSel.map(ind => ({
      queryKey: ['dash-sem', 'semanal', ano, semana, ind],
      queryFn: () => api.semanal({ ano, semana, indicador: ind, culto: 'todos' }),
      staleTime: 60_000,
    })),
  });

  const isLoading = results.some(r => r.isLoading);
  const isFetching = results.some(r => r.isFetching);

  // Recalcula resumo client-side aplicando o filtro `culto`
  const datasets = results.map((r, i) => {
    const indDef = INDICADORES.find(x => x.key === indicadoresSel[i]);
    if (!r.data) return null;
    const itemsFiltrados = culto === 'todos'
      ? r.data.items
      : (r.data.items || []).filter(it => it.service_type_id === culto);

    const total = itemsFiltrados.reduce((s, it) => s + (it.valor_absoluto || 0), 0);
    const sumMedias = itemsFiltrados.reduce((s, it) => s + (it.media || 0), 0);
    const mediaGeral = itemsFiltrados.length ? Math.round(sumMedias / itemsFiltrados.length) : 0;
    const variacao_pct = mediaGeral > 0 ? Math.round(((total - mediaGeral) / mediaGeral) * 100) : 0;
    const totalPresencial = itemsFiltrados.reduce((s, it) => s + (it.total_presencial || 0), 0);
    const taxa_ocupacao_geral = indDef?.usa_ocupacao
      ? Math.round((total / 1200) * 1000) / 10
      : Math.round((totalPresencial / 1200) * 1000) / 10;

    return {
      indicador: indicadoresSel[i],
      indDef,
      data: {
        ...r.data,
        resumo: { total, media_geral: mediaGeral, variacao_pct, taxa_ocupacao_geral },
      },
      cor: PALETA_MULTI[i % PALETA_MULTI.length],
    };
  }).filter(Boolean);

  const isMulti = indicadoresSel.length > 1;
  const isSingle = indicadoresSel.length === 1;
  const isEmpty = indicadoresSel.length === 0;
  const primario = datasets[0];

  // Nome do culto selecionado (pra mostrar nos titulos quando filtrado)
  const cultoSelInfo = useMemo(() => {
    if (culto === 'todos') return null;
    return (cultos || []).find(c => c.id === culto) || null;
  }, [culto, cultos]);

  // Quando 1 indicador: estrutura atual (valor_absoluto + media + taxa)
  // Quando 2+ indicadores: combina por culto · uma chave por indicador
  const chartData = useMemo(() => {
    if (!datasets.length) return [];
    if (isSingle) {
      return (primario.data.items || []).map(i => ({
        nome: shortLabel(i.nome, i.recurrence_day, i.recurrence_time),
        service_type_id: i.service_type_id,
        valor_absoluto: i.valor_absoluto,
        media: i.media,
        taxa: i.taxa_ocupacao,
      }));
    }
    // Multi · merge por nome do culto
    const mapPorNome = new Map();
    datasets.forEach(d => {
      (d.data.items || []).forEach(i => {
        const k = shortLabel(i.nome, i.recurrence_day, i.recurrence_time);
        const row = mapPorNome.get(k) || {
          nome: k,
          service_type_id: i.service_type_id,
          _order: i.recurrence_day * 100 + parseInt((i.recurrence_time || '0').slice(0, 2), 10),
        };
        row[d.indicador] = i.valor_absoluto;
        mapPorNome.set(k, row);
      });
    });
    return Array.from(mapPorNome.values()).sort((a, b) => (a._order || 0) - (b._order || 0));
  }, [datasets, isSingle, primario]);

  const anos = useMemo(() => {
    const arr = [];
    for (let y = anoAtual; y >= 2020; y--) arr.push(y);
    return arr;
  }, [anoAtual]);

  const toggleIndicador = (key) => {
    setIndicadoresSel(prev => {
      if (prev.includes(key)) return prev.filter(k => k !== key);
      return [...prev, key];
    });
  };

  // Click numa barra do chart · filtra culto. Click no mesmo culto reseta.
  const onClickBarra = (entry) => {
    if (!entry?.service_type_id) return;
    setCulto(prev => prev === entry.service_type_id ? 'todos' : entry.service_type_id);
  };

  return (
    <div className="grid grid-cols-12 gap-4">
      {/* Sidebar com botões de indicador */}
      <div className="col-span-12 lg:col-span-2 space-y-2">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
            Indicadores
          </h3>
          {isMulti && (
            <span className="inline-flex items-center gap-1 text-[10px] text-[#00B39D] font-medium">
              <GitCompare className="h-3 w-3" />
              {indicadoresSel.length}
            </span>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground -mt-1 mb-1">
          Clique pra alternar · vários ao mesmo tempo viram modo comparativo.
        </p>
        <div className="grid grid-cols-2 lg:grid-cols-1 gap-2">
          {INDICADORES.map(ind => {
            const ativo = indicadoresSel.includes(ind.key);
            const idx = indicadoresSel.indexOf(ind.key);
            const cor = idx >= 0 ? PALETA_MULTI[idx % PALETA_MULTI.length] : null;
            return (
              <button
                key={ind.key}
                onClick={() => toggleIndicador(ind.key)}
                className={`relative px-3 py-2.5 text-xs font-medium rounded-lg border transition-all text-left ${
                  ativo
                    ? 'text-white border-transparent shadow-sm'
                    : 'bg-card text-foreground border-border hover:border-[#00B39D]/40'
                }`}
                style={ativo ? { background: cor || '#00B39D', borderColor: cor || '#00B39D' } : undefined}
              >
                {ativo && (
                  <Check className="absolute top-1.5 right-1.5 h-3 w-3 opacity-80" />
                )}
                {ind.label}
              </button>
            );
          })}
        </div>

        <div className="pt-4 space-y-2">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Culto</label>
            <Select value={culto} onValueChange={setCulto}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {(cultos || []).map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {isSingle && primario?.indDef?.usa_ocupacao && primario.data && (
          <div className="pt-4">
            <OcupacaoGauge taxa={primario.data.resumo.taxa_ocupacao_geral} />
          </div>
        )}
      </div>

      {/* Main */}
      <div className="col-span-12 lg:col-span-10 space-y-4">
        {/* Filtros topo */}
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Semana</label>
            <Select value={String(semana)} onValueChange={v => setSemana(Number(v))}>
              <SelectTrigger className="w-[260px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(semanasDisp || []).map(s => (
                  <SelectItem key={s.semana} value={String(s.semana)}>{s.label}</SelectItem>
                ))}
                {!semanasDisp?.length && (
                  <SelectItem value={String(semana)}>Semana {semana}</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Ano</label>
            <Select value={String(ano)} onValueChange={v => setAno(Number(v))}>
              <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {anos.map(a => (
                  <SelectItem key={a} value={String(a)}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {isFetching && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground ml-2" />
          )}
        </div>

        {/* Aviso quando culto está filtrado (via dropdown ou click na barra) */}
        {cultoSelInfo && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex items-center justify-between gap-3 rounded-lg border border-[#00B39D]/40 bg-[#00B39D]/5 px-3 py-2 text-xs"
          >
            <span className="text-foreground">
              Filtrado por culto: <span className="font-semibold text-[#00B39D]">{cultoSelInfo.name}</span>
              {' · '}
              <span className="text-muted-foreground">cards e taxa de ocupação refletem apenas esse culto</span>
            </span>
            <button
              onClick={() => setCulto('todos')}
              className="px-2 py-1 rounded text-[11px] font-medium border border-border hover:border-[#00B39D] text-muted-foreground hover:text-[#00B39D] transition-colors"
            >
              Limpar filtro
            </button>
          </motion.div>
        )}

        {/* KPI cards · modo single mostra os 3 cards · modo multi mostra um por indicador */}
        <AnimatePresence mode="wait">
          {isEmpty ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="rounded-xl border border-dashed border-border bg-card p-8 text-center"
            >
              <p className="text-sm text-muted-foreground">
                Nenhum indicador selecionado. Clique em um ou mais indicadores na barra lateral pra montar o painel.
              </p>
            </motion.div>
          ) : isSingle ? (
            <motion.div
              key={`single-${ano}-${semana}-${indicadoresSel[0]}-${culto}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="grid grid-cols-1 md:grid-cols-3 gap-3"
            >
              <KpiCard
                titulo="Total Absoluto"
                valor={primario?.data?.resumo.total ?? 0}
                loading={isLoading}
                icon={Users}
                cor={C.primary}
              />
              <KpiCard
                titulo="Média Histórica"
                valor={primario?.data?.resumo.media_geral ?? 0}
                loading={isLoading}
                cor={C.media}
                subtitulo="Média semanal das últimas 52 semanas"
              />
              <KpiCard
                titulo="Variação %"
                valor={primario?.data?.resumo.variacao_pct ?? 0}
                loading={isLoading}
                sufixo="%"
                icon={(primario?.data?.resumo.variacao_pct ?? 0) >= 0 ? TrendingUp : TrendingDown}
                cor={(primario?.data?.resumo.variacao_pct ?? 0) >= 0 ? '#10b981' : '#ef4444'}
                destaque
              />
            </motion.div>
          ) : (
            <motion.div
              key={`multi-${ano}-${semana}-${indicadoresSel.join(',')}-${culto}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className={`grid gap-3 ${
                datasets.length <= 2 ? 'grid-cols-1 md:grid-cols-2'
                : datasets.length <= 4 ? 'grid-cols-2 md:grid-cols-4'
                : 'grid-cols-2 md:grid-cols-4'
              }`}
            >
              {datasets.map(d => (
                <KpiCard
                  key={d.indicador}
                  titulo={d.indDef?.label}
                  valor={d.data?.resumo.total ?? 0}
                  loading={isLoading}
                  cor={d.cor}
                  subtitulo={`Var ${(d.data?.resumo.variacao_pct ?? 0) >= 0 ? '+' : ''}${d.data?.resumo.variacao_pct ?? 0}% vs média`}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bar chart principal · só renderiza com indicador selecionado */}
        {!isEmpty && (
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle className="text-sm font-medium">
              {isSingle
                ? `${primario?.indDef?.label} por culto · ${primario?.data?.inicio && primario?.data?.fim ? `${formatBr(primario.data.inicio)} a ${formatBr(primario.data.fim)}` : '—'}`
                : `Comparativo · ${datasets.map(d => d.indDef?.label).join(' / ')}`}
            </CardTitle>
            {isMulti && (
              <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1.5">
                <GitCompare className="h-3.5 w-3.5" />Modo comparativo · só valores absolutos
              </span>
            )}
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-[420px] flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : chartData.length === 0 ? (
              <div className="h-[420px] flex items-center justify-center text-sm text-muted-foreground">
                Sem dados pra essa semana. Confira se os cultos foram preenchidos em /ministerial/integracao.
              </div>
            ) : (
              <div className="h-[420px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    margin={{ top: 24, right: 20, left: 0, bottom: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                    <XAxis dataKey="nome" tick={{ fontSize: 12 }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 11 }} allowDecimals={false} />
                    {isSingle && primario?.indDef?.usa_ocupacao && (
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        tick={{ fontSize: 11 }}
                        unit="%"
                        domain={[0, 'auto']}
                      />
                    )}
                    <Tooltip
                      cursor={{ fill: 'rgba(0,179,157,0.06)' }}
                      contentStyle={{ borderRadius: 8, fontSize: 12 }}
                      formatter={(v, name) => {
                        if (name === 'Taxa de ocupação') return [`${v}%`, name];
                        return [Number(v).toLocaleString('pt-BR'), name];
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />

                    {isSingle ? (
                      <>
                        <Bar
                          yAxisId="left"
                          dataKey="valor_absoluto"
                          name="Valor Absoluto"
                          radius={[6, 6, 0, 0]}
                          animationDuration={900}
                          onClick={onClickBarra}
                          style={{ cursor: 'pointer' }}
                        >
                          {chartData.map((e, i) => (
                            <Cell
                              key={`va-${i}`}
                              fill={C.primary}
                              opacity={culto === 'todos' || culto === e.service_type_id ? 1 : 0.35}
                            />
                          ))}
                          <LabelList dataKey="valor_absoluto" position="top" style={{ fontSize: 11, fontWeight: 600 }} />
                        </Bar>
                        <Bar
                          yAxisId="left"
                          dataKey="media"
                          name="Média Histórica"
                          radius={[6, 6, 0, 0]}
                          animationDuration={1100}
                          onClick={onClickBarra}
                          style={{ cursor: 'pointer' }}
                        >
                          {chartData.map((e, i) => (
                            <Cell
                              key={`md-${i}`}
                              fill={C.media}
                              opacity={culto === 'todos' || culto === e.service_type_id ? 1 : 0.35}
                            />
                          ))}
                          <LabelList dataKey="media" position="top" style={{ fontSize: 11, fontWeight: 600, fill: '#7BAEC2' }} />
                        </Bar>
                        {primario?.indDef?.usa_ocupacao && (
                          <Bar
                            yAxisId="right"
                            dataKey="taxa"
                            name="Taxa de ocupação"
                            radius={[6, 6, 0, 0]}
                            animationDuration={1300}
                            onClick={onClickBarra}
                            style={{ cursor: 'pointer' }}
                          >
                            {chartData.map((e, i) => (
                              <Cell
                                key={`tx-${i}`}
                                fill={C.taxa}
                                opacity={culto === 'todos' || culto === e.service_type_id ? 1 : 0.35}
                              />
                            ))}
                            <LabelList
                              dataKey="taxa"
                              position="top"
                              formatter={v => (v != null ? `${v}%` : '')}
                              style={{ fontSize: 11, fontWeight: 600, fill: '#E97A3F' }}
                            />
                          </Bar>
                        )}
                      </>
                    ) : (
                      datasets.map((d, idx) => (
                        <Bar
                          key={d.indicador}
                          yAxisId="left"
                          dataKey={d.indicador}
                          name={d.indDef?.label}
                          radius={[6, 6, 0, 0]}
                          animationDuration={800 + idx * 150}
                          onClick={onClickBarra}
                          style={{ cursor: 'pointer' }}
                        >
                          {chartData.map((e, i) => (
                            <Cell
                              key={`m-${idx}-${i}`}
                              fill={d.cor}
                              opacity={culto === 'todos' || culto === e.service_type_id ? 1 : 0.35}
                            />
                          ))}
                          {datasets.length <= 3 && (
                            <LabelList
                              dataKey={d.indicador}
                              position="top"
                              style={{ fontSize: 10, fontWeight: 600, fill: d.cor }}
                              formatter={v => (v > 0 ? v : '')}
                            />
                          )}
                        </Bar>
                      ))
                    )}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
        )}

        {/* Meta · só aparece em modo single */}
        {isSingle && primario?.data?.meta && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Meta semanal de {primario.data.rotulo}</CardTitle>
            </CardHeader>
            <CardContent>
              <MetaProgresso atual={primario.data.resumo.total} meta={primario.data.meta.meta_valor} />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function shortLabel(nome, day, time) {
  if (!nome) return '—';
  if (/domingo/i.test(nome)) {
    const h = (time || '').slice(0, 2);
    return `D${h}`;
  }
  if (/quarta/i.test(nome)) return 'Quarta';
  return nome;
}

function formatBr(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function MetaProgresso({ atual, meta }) {
  const pct = Math.min(200, Math.round((atual / meta) * 100));
  const cor = pct >= 100 ? '#10b981' : pct >= 70 ? '#f59e0b' : '#ef4444';
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <div className="text-2xl font-bold">{atual.toLocaleString('pt-BR')}</div>
        <div className="text-sm text-muted-foreground">/ meta {meta.toLocaleString('pt-BR')}</div>
      </div>
      <div className="h-3 rounded-full bg-muted overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ background: cor }}
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(100, pct)}%` }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
        />
      </div>
      <div className="text-xs text-muted-foreground mt-1">{pct}% da meta semanal</div>
    </div>
  );
}
