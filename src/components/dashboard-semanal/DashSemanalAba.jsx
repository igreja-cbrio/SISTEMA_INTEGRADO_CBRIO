import { useState, useMemo, useRef } from 'react';
import { useQueries, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { dashboardSemanal as api } from '../../api';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Input } from '../ui/input';
import { Loader2, TrendingUp, TrendingDown, Users, GitCompare, Check, Calendar as CalIcon, Tv, Search, StickyNote, Plus, Trash2 } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LabelList, Cell,
  ComposedChart,
} from 'recharts';
import { INDICADORES } from '../../pages/DashboardSemanal';
import KpiCard from './KpiCard';
import OcupacaoGauge from './OcupacaoGauge';
import { ChartGradients, gradFill } from '../charts/ChartGradients';
import { ResumoSemanaCard } from './ResumoCards';

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
  const [volPessoasOpen, setVolPessoasOpen] = useState(false);

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

  // Ranking de semanas do ano filtrado · melhor (top 1) e pior (bottom 1).
  // Usa o indicador primário (1º selecionado) e respeita o filtro de culto.
  const indicadorRank = indicadoresSel[0] || null;
  const { data: ranking } = useQuery({
    queryKey: ['dash-sem', 'ranking', ano, indicadorRank, culto],
    queryFn: () => api.ranking({ ano, indicador: indicadorRank, culto }),
    enabled: !!indicadorRank,
    staleTime: 60_000,
  });

  // Comparativo YoY · mesma semana ISO no ano atual + 2 anos anteriores.
  // Respeita indicador primário + filtro de culto. Distingue "semana não
  // existe naquele ano" (W53) de "semana existe com valor 0".
  const anosComparados = useMemo(() => [ano - 2, ano - 1, ano], [ano]);
  const { data: yoy } = useQuery({
    queryKey: ['dash-sem', 'yoy', semana, indicadorRank, culto, anosComparados.join(',')],
    queryFn: () => api.yoy({ semana, indicador: indicadorRank, culto, anos: anosComparados.join(',') }),
    enabled: !!indicadorRank && !!semana,
    staleTime: 60_000,
  });

  // Cards comparativos · 1 por ano · valor + Δ% vs ano anterior comparado
  // que tem dado na mesma semana.
  const cardsYoy = useMemo(() => {
    if (!yoy?.resultados?.length) return [];
    const linhas = yoy.resultados; // ordem dos anos da query
    return linhas.map((r, idx) => {
      let deltaPct = null;
      let baseAno = null;
      if (r.tem_dado) {
        for (let j = idx - 1; j >= 0; j--) {
          const prev = linhas[j];
          if (prev.tem_dado && prev.total !== 0) {
            deltaPct = ((r.total - prev.total) / prev.total) * 100;
            baseAno = prev.ano;
            break;
          }
        }
      }
      return {
        ano: r.ano,
        valor: r.tem_dado ? r.total : null,
        deltaPct,
        baseAno,
        cor: PALETA_MULTI[idx % PALETA_MULTI.length],
        atual: r.ano === ano,
      };
    });
  }, [yoy, ano]);

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

  // Capacidade de assentos p/ o gauge geral. O Bridge acontece em outro espaço
  // (100 lugares); quando o filtro isola o Bridge, a ocupação usa essa base.
  const capacidadeFiltro = (() => {
    if (culto === 'todos') return 1050;
    const c = (cultos || []).find(x => x.id === culto);
    return c && /bridge/i.test(c.name || '') ? 100 : 1050;
  })();

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
      ? Math.round((total / capacidadeFiltro) * 1000) / 10
      : Math.round((totalPresencial / capacidadeFiltro) * 1000) / 10;

    return {
      indicador: indicadoresSel[i],
      indDef,
      data: {
        ...r.data,
        resumo: {
          total, media_geral: mediaGeral, variacao_pct, taxa_ocupacao_geral,
          // Voluntariado: pessoas únicas da semana + total de check-ins (do backend,
          // nível semana · não mudam com o filtro de culto).
          pessoas_unicas: r.data.resumo?.pessoas_unicas,
          checkins_total: r.data.resumo?.checkins_total,
          sem_identificacao: r.data.resumo?.sem_identificacao,
        },
      },
      cor: PALETA_MULTI[i % PALETA_MULTI.length],
    };
  }).filter(Boolean);

  const isMulti = indicadoresSel.length > 1;
  const isSingle = indicadoresSel.length === 1;
  const isEmpty = indicadoresSel.length === 0;
  const primario = datasets[0];

  // Nome do culto selecionado (pra mostrar nos títulos quando filtrado)
  const cultoSelInfo = useMemo(() => {
    if (culto === 'todos') return null;
    return (cultos || []).find(c => c.id === culto) || null;
  }, [culto, cultos]);

  // Quando 1 indicador: estrutura atual (valor_absoluto + media + taxa)
  // Quando 2+ indicadores: combina por culto · uma chave por indicador
  const chartData = useMemo(() => {
    if (!datasets.length) return [];
    if (isSingle) {
      return (primario.data.items || []).map(i => {
        // Variacao por culto = (atual - media) / media * 100
        const variacao = i.media > 0
          ? Math.round(((i.valor_absoluto - i.media) / i.media) * 1000) / 10
          : null;
        return {
          nome: shortLabel(i.nome, i.recurrence_day, i.recurrence_time),
          service_type_id: i.service_type_id,
          valor_absoluto: i.valor_absoluto,
          media: i.media,
          taxa: i.taxa_ocupacao,
          variacao,
          _order: ordemCulto(i.recurrence_day, i.recurrence_time),
        };
      }).sort((a, b) => a._order - b._order);
    }
    // Multi · merge por nome do culto
    const mapPorNome = new Map();
    datasets.forEach(d => {
      (d.data.items || []).forEach(i => {
        const k = shortLabel(i.nome, i.recurrence_day, i.recurrence_time);
        const row = mapPorNome.get(k) || {
          nome: k,
          service_type_id: i.service_type_id,
          _order: ordemCulto(i.recurrence_day, i.recurrence_time),
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

  // Modo DDUS completo: DDUS so fecha 7 dias depois do culto, então a semana
  // que estamos apresentando ainda não tem dados completos. Esse modo mostra
  // SO online_ddus + semana = (semana atual selecionada) - 1, garantindo
  // a janela completa.
  const [modoDdus, setModoDdus] = useState(false);
  const estadoSalvo = useRef(null);

  const toggleModoDdus = () => {
    if (modoDdus) {
      if (estadoSalvo.current) {
        setIndicadoresSel(estadoSalvo.current.indicadoresSel);
        setSemana(estadoSalvo.current.semana);
        setAno(estadoSalvo.current.ano);
      }
      estadoSalvo.current = null;
      setModoDdus(false);
    } else {
      estadoSalvo.current = { indicadoresSel: [...indicadoresSel], semana, ano };
      setIndicadoresSel(['online_ddus']);
      // Volta 1 semana · trata cruzamento de ano (semana 1 -> 52/53 do ano anterior)
      if (semana > 1) {
        setSemana(semana - 1);
      } else {
        setAno(ano - 1);
        setSemana(52);
      }
      setModoDdus(true);
    }
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
            <OcupacaoGauge taxa={primario.data.resumo.taxa_ocupacao_geral} capacidade={capacidadeFiltro} />
          </div>
        )}

        {isSingle && primario?.indicador === 'voluntariado' && primario.data && (
          <div className="pt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setVolPessoasOpen(true)}
              className="rounded-xl border bg-card p-4 text-center cursor-pointer transition-colors hover:border-primary/60 hover:bg-accent/40"
              title="Ver quem foram as pessoas da semana"
            >
              <p className="text-2xl font-bold" style={{ color: C.primary }}>
                {primario.data.resumo.pessoas_unicas ?? '—'}
              </p>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mt-1">
                Pessoas únicas
              </p>
              <p className="text-[10px] text-muted-foreground">
                na semana (sem repetir) · clique pra ver
                {primario.data.resumo.sem_identificacao > 0 && (
                  <span className="block text-amber-600 dark:text-amber-400">+{primario.data.resumo.sem_identificacao} check-ins sem identificação</span>
                )}
              </p>
            </button>
            <div className="rounded-xl border bg-card p-4 text-center">
              <p className="text-2xl font-bold" style={{ color: C.media }}>
                {primario.data.resumo.checkins_total ?? '—'}
              </p>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mt-1">
                Total de check-ins
              </p>
              <p className="text-[10px] text-muted-foreground">eventos na semana</p>
            </div>
          </div>
        )}

        {volPessoasOpen && (
          <VolPessoasDialog
            ano={ano}
            semana={semana}
            semIdentificacao={primario?.data?.resumo?.sem_identificacao || 0}
            onClose={() => setVolPessoasOpen(false)}
          />
        )}
      </div>

      {/* Main */}
      <div className="col-span-12 lg:col-span-10 space-y-4">
        {/* Resumo da semana · números consolidados */}
        <ResumoSemanaCard ano={ano} semana={semana} />

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

          {/* Melhor / Pior semana do ano filtrado · pula direto pra ela */}
          {!isEmpty && (
            <div className="flex items-end gap-2">
              <button
                onClick={() => ranking?.melhor && setSemana(ranking.melhor.semana)}
                disabled={!ranking?.melhor || modoDdus}
                title={ranking?.melhor
                  ? `Melhor semana de ${ranking.rotulo} em ${ano}: ${ranking.melhor.label} · ${ranking.melhor.total.toLocaleString('pt-BR')}`
                  : `Sem dados de ${ranking?.rotulo || 'indicador'} em ${ano}`}
                className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                  ranking?.melhor && semana === ranking.melhor.semana
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-card text-foreground border-border hover:border-emerald-500/50 hover:text-emerald-600'
                }`}
              >
                <TrendingUp className="h-3.5 w-3.5" />
                Melhor semana
              </button>
              <button
                onClick={() => ranking?.pior && setSemana(ranking.pior.semana)}
                disabled={!ranking?.pior || modoDdus}
                title={ranking?.pior
                  ? `Pior semana de ${ranking.rotulo} em ${ano}: ${ranking.pior.label} · ${ranking.pior.total.toLocaleString('pt-BR')}`
                  : `Sem dados de ${ranking?.rotulo || 'indicador'} em ${ano}`}
                className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                  ranking?.pior && semana === ranking.pior.semana
                    ? 'bg-rose-600 text-white border-rose-600'
                    : 'bg-card text-foreground border-border hover:border-rose-500/50 hover:text-rose-600'
                }`}
              >
                <TrendingDown className="h-3.5 w-3.5" />
                Pior semana
              </button>
            </div>
          )}

          {/* Botao DDUS completo · 1 semana antes da apresentada */}
          <button
            onClick={toggleModoDdus}
            className={`ml-auto inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
              modoDdus
                ? 'bg-purple-600 text-white border-purple-600'
                : 'bg-card text-foreground border-border hover:border-purple-500/40'
            }`}
            title="DDUS so fecha 7 dias depois do culto. Esse modo mostra a semana anterior com dados completos."
          >
            <Tv className="h-3.5 w-3.5" />
            {modoDdus ? 'Sair · DDUS completo' : 'DDUS completo (1 semana antes)'}
          </button>
        </div>

        {/* Dica · melhor e pior semana do ano (por indicador primário) */}
        {!isEmpty && !modoDdus && ranking?.melhor && (
          <p className="text-[11px] text-muted-foreground">
            {ranking.rotulo} em {ano}
            {culto !== 'todos' && cultoSelInfo ? ` · ${cultoSelInfo.name}` : ''}
            {' · melhor: '}
            <span className="font-semibold text-emerald-600">{ranking.melhor.label}</span>
            {` (${ranking.melhor.total.toLocaleString('pt-BR')})`}
            {' · pior: '}
            <span className="font-semibold text-rose-600">{ranking.pior.label}</span>
            {` (${ranking.pior.total.toLocaleString('pt-BR')})`}
          </p>
        )}

        {/* Banner explicativo quando modo DDUS esta ativo */}
        {modoDdus && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-3 rounded-lg border border-purple-500/40 bg-purple-500/5 px-3 py-2.5 text-xs"
          >
            <Tv className="h-4 w-4 text-purple-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="font-medium text-foreground">
                Modo DDUS completo · semana {semana}{ano !== anoSemAnterior && `/${ano}`}
              </p>
              <p className="text-muted-foreground mt-0.5">
                Online DDUS (views D+1 a D+7) só fecha 7 dias depois do culto. Pra ter
                dados completos, exibimos a semana anterior à da apresentação atual.
                Dados coletados automaticamente do YouTube via API.
              </p>
            </div>
          </motion.div>
        )}

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
                ? `${primario?.indDef?.label || INDICADORES.find(x => x.key === indicadoresSel[0])?.label || 'Indicador'} por culto · ${primario?.data?.inicio && primario?.data?.fim ? `${formatBr(primario.data.inicio)} a ${formatBr(primario.data.fim)}` : '—'}`
                : `Comparativo · ${datasets.map(d => d?.indDef?.label).filter(Boolean).join(' / ')}`}
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
              <div className="h-[420px]" style={{ cursor: 'pointer' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={chartData}
                    margin={{ top: 24, right: 20, left: 0, bottom: 20 }}
                    onClick={(state) => {
                      const payload = state?.activePayload?.[0]?.payload;
                      if (payload) onClickBarra(payload);
                    }}
                  >
                    <ChartGradients colors={[C.primary, C.media, C.taxa]} />
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
                        if (name === 'Taxa de ocupação' || name === 'Variação por culto') {
                          return [v != null ? `${v}%` : '—', name];
                        }
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
                          fill={C.primary}
                          radius={[6, 6, 0, 0]}
                          animationDuration={900}
                          style={{ cursor: 'pointer' }}
                        >
                          {chartData.map((e, i) => (
                            <Cell
                              key={`va-${i}`}
                              fill={gradFill(C.primary)}
                              opacity={culto === 'todos' || culto === e.service_type_id ? 1 : 0.35}
                            />
                          ))}
                          <LabelList dataKey="valor_absoluto" position="top" style={{ fontSize: 11, fontWeight: 600 }} />
                        </Bar>
                        <Bar
                          yAxisId="left"
                          dataKey="media"
                          name="Média Histórica"
                          fill={C.media}
                          radius={[6, 6, 0, 0]}
                          animationDuration={1100}
                          style={{ cursor: 'pointer' }}
                        >
                          {chartData.map((e, i) => (
                            <Cell
                              key={`md-${i}`}
                              fill={gradFill(C.media)}
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
                            fill={C.taxa}
                            radius={[6, 6, 0, 0]}
                            animationDuration={1300}
                            onClick={onClickBarra}
                            style={{ cursor: 'pointer' }}
                          >
                            {chartData.map((e, i) => (
                              <Cell
                                key={`tx-${i}`}
                                fill={gradFill(C.taxa)}
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
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
        )}

        {/* Observações da semana · explicam blocos zerados/atípicos */}
        <ObservacoesSemana ano={ano} semana={semana} blocos={primario?.data?.items || []} />

        {/* Comparativo entre anos · mesma semana ISO em anos anteriores */}
        {!isEmpty && yoy?.resultados?.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                Comparativo entre anos · Semana {semana}
                {culto !== 'todos' && cultoSelInfo ? ` · ${cultoSelInfo.name}` : ''}
                <span className="text-muted-foreground font-normal"> · {yoy.rotulo}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`grid gap-3 ${
                cardsYoy.length <= 2 ? 'grid-cols-2'
                : cardsYoy.length === 3 ? 'grid-cols-3'
                : 'grid-cols-2 md:grid-cols-4'
              }`}>
                {cardsYoy.map(c => (
                  <div
                    key={c.ano}
                    className={`rounded-lg border bg-card p-3 ${
                      c.atual ? 'border-[#00B39D]/60 ring-1 ring-[#00B39D]/30' : 'border-border'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.cor }} />
                      <span className="text-xs font-medium text-muted-foreground">
                        S{semana}/{c.ano}{c.atual ? ' · atual' : ''}
                      </span>
                    </div>
                    <div className="text-2xl font-bold tabular-nums">
                      {c.valor != null ? Number(c.valor).toLocaleString('pt-BR') : '—'}
                    </div>
                    {c.deltaPct != null ? (
                      <div className={`mt-1 inline-flex items-center gap-1 text-xs font-medium ${
                        c.deltaPct >= 0 ? 'text-emerald-600' : 'text-rose-600'
                      }`}>
                        {c.deltaPct >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                        {c.deltaPct >= 0 ? '+' : ''}{c.deltaPct.toFixed(1)}%
                        <span className="text-muted-foreground font-normal">vs {c.baseAno}</span>
                      </div>
                    ) : (
                      <div className="mt-1 text-xs text-muted-foreground">
                        {c.valor != null ? 'base' : 'sem dado'}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground mt-3">
                Total da mesma semana ISO em cada ano (respeita o filtro de culto e exclui
                cultos sem Kids quando o indicador é de kids). A variação % compara cada ano
                com o anterior que tem dado na mesma semana.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function shortLabel(nome, day, time) {
  if (!nome) return '—';
  const hhmm = (time || '').slice(0, 5);
  // Cultos por horário ("Domingo 08:30") encurtam pra "Dom 08:30". Blocos de
  // voluntariado ("Domingo Manhã"/"Domingo Noite") não têm horário no nome →
  // mantêm o nome do bloco.
  if (/domingo/i.test(nome)) return /\d/.test(nome) && hhmm ? `Dom ${hhmm}` : nome;
  if (/quarta/i.test(nome)) return 'Quarta';
  return nome;
}

// Ordem lógica dos cultos: Quarta -> Bridge/AMI (sábado) -> Domingos (por horario).
// Semana comecando na segunda (Seg=0..Dom=6) + minutos do dia desempata.
function ordemCulto(day, time) {
  const d = day === null || day === undefined ? 99 : ((Number(day) + 6) % 7);
  const [h, m] = String(time || '0:0').split(':').map(Number);
  return d * 10000 + (h || 0) * 100 + (m || 0);
}

function formatBr(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

// ── Dialog · quem foram as pessoas únicas do Voluntariado na semana ──────────
function VolPessoasDialog({ ano, semana, semIdentificacao = 0, onClose }) {
  const [busca, setBusca] = useState('');
  const [soSemEscala, setSoSemEscala] = useState(false);
  const { data: pessoas = [], isLoading } = useQuery({
    queryKey: ['dash-sem', 'vol-pessoas', ano, semana],
    queryFn: () => api.voluntariadoPessoas(ano, semana),
  });

  const totalSemEscala = pessoas.filter(p => p.sem_escala).length;
  const filtradas = pessoas.filter(p => {
    if (soSemEscala && !p.sem_escala) return false;
    const q = busca.trim().toLowerCase();
    return !q || (p.nome || '').toLowerCase().includes(q) || (p.blocos || '').toLowerCase().includes(q);
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" style={{ color: C.primary }} />
            Pessoas únicas · Semana {semana}/{ano} ({pessoas.length})
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-1">
          Voluntários que fizeram check-in na semana, sem repetir quem serviu em mais de um culto.
        </p>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou culto…" className="pl-9" />
          </div>
          <button
            type="button"
            onClick={() => setSoSemEscala(v => !v)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold border transition-colors ${
              soSemEscala
                ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/40'
                : 'text-muted-foreground border-border hover:bg-accent'
            }`}
            title="Mostrar só quem veio sem escala"
          >
            Sem escala ({totalSemEscala})
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto rounded-lg border border-border">
          {isLoading ? (
            <div className="py-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : filtradas.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma pessoa nesse filtro.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="py-2 px-3 font-medium">Nome</th>
                  <th className="py-2 px-3 font-medium">Cultos em que serviu</th>
                  <th className="py-2 px-3 font-medium text-right">Check-ins</th>
                </tr>
              </thead>
              <tbody>
                {semIdentificacao > 0 && !soSemEscala && !busca.trim() && (
                  <tr className="border-b border-dashed border-amber-400/40 bg-amber-500/5">
                    <td className="py-2 px-3 text-sm text-muted-foreground" colSpan={2}>
                      {semIdentificacao} check-in{semIdentificacao === 1 ? '' : 's'} sem identificação
                      <span className="block text-xs">registrados antes do sistema guardar o nome — sem como saber quem foram</span>
                    </td>
                    <td className="py-2 px-3 text-right text-muted-foreground">{semIdentificacao}</td>
                  </tr>
                )}
                {filtradas.map((p, i) => (
                  <tr key={`${p.nome}-${i}`} className="border-b border-border/60 last:border-0">
                    <td className="py-2 px-3 font-medium">
                      {p.nome}
                      {p.sem_escala && (
                        <span className="ml-2 inline-block rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 text-[10px] font-semibold px-2 py-0.5 align-middle">
                          sem escala
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-muted-foreground">{p.blocos || '—'}</td>
                    <td className="py-2 px-3 text-right">{p.checkins}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Observações da semana · explicam blocos zerados/atípicos ────────────────
// Ex.: "Domingo Noite · Não houve culto (jogo do Brasil)". Nota geral ou por
// bloco de culto; qualquer autenticado vê, quem edita o dashboard registra.
function ObservacoesSemana({ ano, semana, blocos }) {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [bloco, setBloco] = useState('semana');
  const [texto, setTexto] = useState('');

  const { data: notas = [] } = useQuery({
    queryKey: ['dash-sem', 'notas', ano, semana],
    queryFn: () => api.notasList(ano, semana),
  });

  const criarMut = useMutation({
    mutationFn: () => {
      const b = bloco !== 'semana' ? blocos.find(x => x.service_type_id === bloco) : null;
      return api.notaCreate({
        ano, semana,
        service_type_id: b?.service_type_id || null,
        // items do /semanal usam `nome` (não service_type_name)
        service_type_name: b?.nome || null,
        nota: texto,
      });
    },
    onSuccess: () => {
      toast.success('Observação registrada');
      setDialogOpen(false); setTexto(''); setBloco('semana');
      qc.invalidateQueries({ queryKey: ['dash-sem', 'notas', ano, semana] });
    },
    onError: (e) => toast.error(e.message || 'Erro ao salvar a observação'),
  });

  const excluirMut = useMutation({
    mutationFn: (id) => api.notaDelete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dash-sem', 'notas', ano, semana] }),
    onError: (e) => toast.error(e.message || 'Erro ao excluir'),
  });

  if (!notas.length && !blocos.length) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <StickyNote className="h-4 w-4 text-amber-500" />
            Observações da semana {semana}
          </span>
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <Plus className="h-3.5 w-3.5" /> Observação
          </button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {notas.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nenhuma observação nesta semana. Registre aqui quando um culto não acontecer (feriado, evento, jogo…) pra explicar números zerados.
          </p>
        ) : (
          <ul className="space-y-2">
            {notas.map(n => (
              <li key={n.id} className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm">
                <StickyNote className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="font-medium">{n.service_type_name || 'Semana toda'}:</span>{' '}
                  <span>{n.nota}</span>
                  <span className="block text-[11px] text-muted-foreground mt-0.5">
                    {n.criado_por_nome || '—'} · {new Date(n.created_at).toLocaleDateString('pt-BR')}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => excluirMut.mutate(n.id)}
                  className="text-muted-foreground hover:text-red-500 transition-colors"
                  title="Excluir observação"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <StickyNote className="h-5 w-5 text-amber-500" /> Nova observação · Semana {semana}/{ano}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Aplicar a</label>
              <Select value={bloco} onValueChange={setBloco}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="semana">Semana toda</SelectItem>
                  {blocos.map(b => (
                    <SelectItem key={b.service_type_id} value={b.service_type_id}>{b.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Observação</label>
              <Input
                value={texto}
                onChange={e => setTexto(e.target.value)}
                placeholder="Ex.: Não houve culto — jogo do Brasil"
                maxLength={500}
                onKeyDown={e => { if (e.key === 'Enter' && texto.trim()) criarMut.mutate(); }}
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDialogOpen(false)}
                className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!texto.trim() || criarMut.isPending}
                onClick={() => criarMut.mutate()}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                style={{ background: C.primary }}
              >
                {criarMut.isPending ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
