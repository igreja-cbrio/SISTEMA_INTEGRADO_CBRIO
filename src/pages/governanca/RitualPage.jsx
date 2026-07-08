// ============================================================================
// /governanca/:sigla — página de UM ritual (OKR · DRE · KPI · CC · DE · AG)
// ============================================================================
// Estrutura (desenho travado com o Marcos em 2026-07-06):
//   1. Instruções — o que é a reunião (material institucional dos rituais)
//   2. Próxima reunião — data/status + abrir o detalhe (pauta/docs/ata)
//   3. Painel do ritual:
//      · OKR — a cabeça do Juninho (NSM + 9 OKRs em 3 blocos, filtro
//        Ministerial/Criativo/Operações/Todos) com valores vivos; a reunião
//        SÓ LÊ a vitrine (nada volta pro sistema).
//      · KPI — os ~30 objetivos gerais do sistema real como indicadores de
//        processo POR VALOR da Jornada, com a matriz objetivo × área de culto
//        e a série mensal do histórico real.
//      · CC — curadoria: o condutor seleciona quais relatórios das outras
//        reuniões (retratos do ciclo) leva ao conselho + tema extra.
//      · DRE — aguardando a versão oficial do financeiro.
//   4. Deliberações rastreáveis (extraídas do Plaud, confirmadas por humano) —
//      o conselho marca executada/não executada.
//   5. Atas e deliberações anteriores — linha do tempo do período selecionado
//   6. Evolução — gráfico dos retratos (snapshots) salvos a cada reunião
//   + Memória do tema (IA) e pendências em aberto.
//
// O "retrato" congela os números vistos na data da reunião em
// governance_meetings.snapshot (jsonb) — é ele que alimenta o gráfico de
// evolução (OKR) e a composição do Conselho (a vitrine calcula sempre
// "agora", não retroage).
// ============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ChevronDown, Loader2, CalendarDays, Camera, Info, BookOpen,
  ClipboardList, TrendingUp, Gavel, CheckCircle2, XCircle,
} from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { toast } from 'sonner';
import { governanca as gov, painel as painelApi } from '../../api';
import { formatErro } from '../../lib/formatErro';
import { useAuth } from '../../contexts/AuthContext';
import { C, MESES, STATUS_MEETING, ymd, fmtData, diaSemana, inputStyle, DetalheReuniao, NovaReuniaoModal, BlocoMarkdownEditavel } from './compartilhado';
import { RITUAIS, PERIODOS, ESCOPOS_OKR, ORDEM_RITUAIS } from './rituais';
import {
  NSM, BLOCOS, avaliar, valorTopoOkr, valorTatico, retratoIndicadores, fmt,
  VERDE, VERMELHO, CINZA,
} from '../../lib/monitoramentoOkrEstrutura';

const COR_RITUAL = { OKR: '#3b82f6', DRE: '#10b981', KPI: '#f59e0b', CC: '#8b5cf6', DE: '#ef4444', AG: '#06b6d4' };
const AMARELO = '#F59E0B';

// Rótulos das chaves vivas (pro seletor do gráfico de evolução do OKR).
const LIVE_LABELS = (() => {
  const m = { nsm: 'NSM · % de convertidos engajados em 60d' };
  for (const b of BLOCOS) {
    for (const o of b.okrs) {
      if (o.live && !m[o.live]) m[o.live] = o.nome;
      for (const t of o.taticos) if (t.live && !m[t.live]) m[t.live] = t.ind;
    }
  }
  return m;
})();

// Valores da Jornada (reunião de KPI · "indicadores de processo por valor").
const VALOR_LABEL = { seguir: 'Seguir a Jesus', conectar: 'Conectar', investir: 'Investir tempo', servir: 'Servir', generosidade: 'Generosidade' };
const VALOR_COR = { seguir: '#3B82F6', conectar: '#10B981', investir: '#F59E0B', servir: '#EF4444', generosidade: '#8B5CF6' };
// Áreas de culto na ordem canônica (outras áreas entram depois, se existirem).
const AREAS_CULTO = [['sede', 'Sede'], ['kids', 'Kids'], ['ami', 'AMI'], ['bridge', 'Bridge'], ['online', 'Online'], ['cba', 'CBA']];

const corPct = (p) => (p == null ? CINZA : p >= 100 ? VERDE : p >= 90 ? AMARELO : VERMELHO);
const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const mesCurto = (ym) => { const m = parseInt(String(ym).slice(5, 7), 10); return `${MESES_CURTOS[m - 1] || ym}/${String(ym).slice(2, 4)}`; };

// ────────────────────────────────────────────────────────────────────────
export default function RitualPage() {
  const { sigla: siglaParam } = useParams();
  const sigla = String(siglaParam || '').toUpperCase();
  const navigate = useNavigate();
  const { getAccessLevel } = useAuth();
  const canEdit = getAccessLevel(['governanca']) >= 3;

  const ritual = RITUAIS[sigla] || null;
  const anoAtual = new Date().getFullYear();

  const [tipos, setTipos] = useState([]);
  const [periodo, setPeriodo] = useState(90);
  const [escopo, setEscopo] = useState('Todos');
  const [reunioes, setReunioes] = useState([]);
  const [delibs, setDelibs] = useState([]);
  const [pendencias, setPendencias] = useState([]);
  const [memoria, setMemoria] = useState(null);
  const [okrData, setOkrData] = useState(null); // { nsm, metricas } (sigla OKR)
  const [kpiData, setKpiData] = useState(null); // { objetivos, nota_serie } (sigla KPI)
  const [cicloMeetings, setCicloMeetings] = useState([]); // reuniões do mês corrente (sigla CC)
  const [loading, setLoading] = useState(true);
  const [painelLoading, setPainelLoading] = useState(sigla === 'OKR' || sigla === 'KPI');
  const [salvandoRetrato, setSalvandoRetrato] = useState(false);
  const [gerandoMemoria, setGerandoMemoria] = useState(false);
  const [gerandoAgenda, setGerandoAgenda] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [novaOpen, setNovaOpen] = useState(false);
  const [ultimasOutras, setUltimasOutras] = useState({}); // sigla → última reunião ocorrida
  const [retro, setRetro] = useState(null); // { sigla, meeting } · retrospecto da última reunião de outro ritual
  const [okrAberto, setOkrAberto] = useState(null); // { okr, bloco } · modal de gráficos de UM dos 9 OKRs

  const tipo = useMemo(() => tipos.find(t => t.sigla === sigla) || null, [tipos, sigla]);
  const cor = tipo?.cor || COR_RITUAL[sigla] || C.primary;
  const hojeStr = ymd(new Date());

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const from = ymd(new Date(Date.now() - periodo * 86400000));
      const to = ymd(new Date(Date.now() + 120 * 86400000)); // inclui as próximas agendadas
      const [tps, mtgs, dls, ana, mem] = await Promise.all([
        gov.types.list(),
        gov.meetings.list({ sigla, from, to }),
        gov.deliberacoes({ sigla, from, to }).catch(() => []),
        gov.analise(sigla, anoAtual).catch(() => null),
        gov.memoria.get(sigla, anoAtual).catch(() => null),
      ]);
      setTipos(Array.isArray(tps) ? tps : []);
      setReunioes(Array.isArray(mtgs) ? mtgs : []);
      setDelibs(Array.isArray(dls) ? dls : []);
      setPendencias(ana?.pendencias_abertas || []);
      setMemoria(mem);
    } catch (e) { toast.error(formatErro(e)); }
    finally { setLoading(false); }
  }, [sigla, periodo, anoAtual]);

  useEffect(() => { carregar(); }, [carregar]);

  // Painel vivo por sigla: OKR = vitrine do Juninho · KPI = objetivos gerais.
  // No KPI, o comparativo de 5 anos precisa de 60 meses de série (senão 12 bastam).
  const mesesFetchKpi = periodo >= 1825 ? 60 : 12;
  useEffect(() => {
    let ativo = true;
    if (sigla === 'OKR') {
      setPainelLoading(true);
      painelApi.monitoramentoOkr()
        .then(r => { if (ativo) setOkrData(r); })
        .catch(e => toast.error(formatErro(e, 'Monitoramento OKR')))
        .finally(() => { if (ativo) setPainelLoading(false); });
    } else if (sigla === 'KPI') {
      setPainelLoading(true);
      gov.kpiObjetivos(mesesFetchKpi)
        .then(r => { if (ativo) setKpiData(r); })
        .catch(e => toast.error(formatErro(e, 'Objetivos gerais')))
        .finally(() => { if (ativo) setPainelLoading(false); });
    }
    return () => { ativo = false; };
  }, [sigla, mesesFetchKpi]);

  const naoCanceladas = useMemo(() => reunioes.filter(m => m.status !== 'cancelada'), [reunioes]);
  const proxima = useMemo(() => naoCanceladas.find(m => m.date && m.date >= hojeStr) || null, [naoCanceladas, hojeStr]);
  const passadas = useMemo(
    () => naoCanceladas.filter(m => m.date && m.date < hojeStr).sort((a, b) => (a.date < b.date ? 1 : -1)),
    [naoCanceladas, hojeStr]
  );
  // Alvo do retrato/curadoria: a reunião do ciclo corrente (a mais recente já ocorrida/de hoje; senão a próxima).
  const alvoRetrato = useMemo(() => {
    const passadaRecente = naoCanceladas.filter(m => m.date && m.date <= hojeStr).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    return passadaRecente || proxima || null;
  }, [naoCanceladas, hojeStr, proxima]);

  // Reunião do Conselho: carrega as reuniões do mês do ciclo (todas as siglas)
  // pra compor os retratos dos temas selecionados.
  useEffect(() => {
    if (sigla !== 'CC') return;
    let ativo = true;
    const base = alvoRetrato?.date ? new Date(`${alvoRetrato.date}T00:00:00`) : new Date();
    const ini = ymd(new Date(base.getFullYear(), base.getMonth(), 1));
    const fim = ymd(new Date(base.getFullYear(), base.getMonth() + 1, 0));
    gov.meetings.list({ from: ini, to: fim })
      .then(ms => { if (ativo) setCicloMeetings(Array.isArray(ms) ? ms : []); })
      .catch(() => {});
    return () => { ativo = false; };
  }, [sigla, alvoRetrato?.date]);

  // Deliberações agrupadas por reunião (pra linha do tempo).
  const delibsPorMeeting = useMemo(() => {
    const map = {};
    for (const d of delibs) (map[d.meeting_id] ||= []).push(d);
    return map;
  }, [delibs]);

  // Última reunião ocorrida de CADA ritual (pro retrospecto cruzado):
  // 1 busca dos últimos 12 meses, agrupada por sigla no cliente.
  useEffect(() => {
    let ativo = true;
    const from = ymd(new Date(Date.now() - 370 * 86400000));
    gov.meetings.list({ from, to: hojeStr })
      .then(ms => {
        if (!ativo) return;
        const map = {};
        for (const m of (ms || [])) {
          const s = m.governance_meeting_types?.sigla;
          if (!s || m.status === 'cancelada' || !m.date) continue;
          if (!map[s] || m.date > map[s].date) map[s] = m;
        }
        setUltimasOutras(map);
      })
      .catch(() => {});
    return () => { ativo = false; };
  }, [sigla, hojeStr]);

  // Gera a agenda do ano (mês atual → dezembro · idempotente) direto da página.
  async function gerarAgenda() {
    if (gerandoAgenda) return;
    const agora = new Date();
    const anoA = agora.getFullYear(), mesA = agora.getMonth() + 1;
    if (!window.confirm(`Gerar a agenda das reuniões mensais de ${MESES[mesA - 1]} a Dezembro de ${anoA}? Meses já gerados são pulados.`)) return;
    setGerandoAgenda(true);
    try {
      const r = await gov.cycles.generateYear(anoA, mesA);
      toast.success(`${r?.reunioes_criadas || 0} reunião(ões) gerada(s)`);
      await carregar();
    } catch (e) { toast.error(formatErro(e)); }
    finally { setGerandoAgenda(false); }
  }

  function montarRetrato() {
    if (sigla === 'OKR' && okrData) {
      const metricas = okrData.metricas || {};
      return {
        sigla: 'OKR',
        capturado_em: new Date().toISOString(),
        nsm: okrData.nsm ? {
          percentual: okrData.nsm.percentual, meta: okrData.nsm.meta,
          engajados: okrData.nsm.engajados, totalConvertidos: okrData.nsm.totalConvertidos,
        } : null,
        metricas: Object.fromEntries(Object.entries(metricas).map(([k, v]) => [k, { valor: v.valor, unidade: v.unidade }])),
        indicadores: retratoIndicadores(metricas),
      };
    }
    if (sigla === 'KPI' && kpiData) {
      const objetivos = kpiData.objetivos || [];
      const pcts = objetivos.map(o => o.pct_medio).filter(v => v != null);
      return {
        sigla: 'KPI',
        capturado_em: new Date().toISOString(),
        resumo: {
          objetivos: objetivos.length,
          com_medicao: objetivos.filter(o => o.medidos > 0).length,
          pct_medio_geral: pcts.length ? Math.round((pcts.reduce((a, b) => a + b, 0) / pcts.length) * 10) / 10 : null,
        },
        objetivos: objetivos.map(o => ({
          id: o.id, nome: o.nome, valores: o.valores, pct_medio: o.pct_medio,
          medidos: o.medidos, total_taticos: o.total_taticos, areas: o.areas,
        })),
      };
    }
    return null;
  }

  async function salvarRetrato() {
    const snapshot = montarRetrato();
    if (!alvoRetrato || !snapshot || salvandoRetrato) return;
    if (!window.confirm(`Salvar o retrato dos indicadores na reunião de ${fmtData(alvoRetrato.date)}? Ele congela os números de hoje e alimenta a evolução e o Conselho.`)) return;
    setSalvandoRetrato(true);
    try {
      await gov.meetings.update(alvoRetrato.id, { snapshot });
      toast.success('Retrato salvo na reunião');
      await carregar();
    } catch (e) { toast.error(formatErro(e)); }
    finally { setSalvandoRetrato(false); }
  }

  async function marcarDelib(t, novo) {
    const status = t.status === novo ? 'pendente' : novo; // clicar de novo desfaz
    try {
      await gov.tasks.update(t.id, { status });
      setDelibs(ds => ds.map(d => d.id === t.id ? { ...d, status } : d));
    } catch (e) { toast.error(formatErro(e)); }
  }

  async function gerarMemoria() {
    if (gerandoMemoria) return;
    if (!window.confirm('Gerar/atualizar a memória do tema com IA (consolida transcrições, atas e dados do sistema)? Pode levar até 1 minuto.')) return;
    setGerandoMemoria(true);
    try { const m = await gov.memoria.gerar(sigla, anoAtual); setMemoria(m); toast.success('Memória atualizada'); }
    catch (e) { toast.error(formatErro(e)); }
    finally { setGerandoMemoria(false); }
  }

  const titulo = ritual?.titulo || tipo?.nome || sigla;

  return (
    <div style={{ background: C.bg, minHeight: '100%', color: C.text }} className="p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <button onClick={() => navigate('/governanca')} className="text-sm inline-flex items-center gap-1.5 mb-1" style={{ color: C.t2 }}>
              <ArrowLeft size={15} /> Governança
            </button>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <span style={{ width: 12, height: 12, borderRadius: 99, background: cor, display: 'inline-block' }} />
              {titulo}
            </h1>
            <p className="text-sm" style={{ color: C.t2 }}>
              {ritual ? `${ritual.semanaLabel} do mês · quarta-feira` : (tipo?.recorrencia || '')}
              {ritual?.termo ? <> · <span style={{ color: C.t3 }}>{ritual.termo}</span></> : null}
            </p>
          </div>
          {canEdit && tipo && (
            <button onClick={() => setNovaOpen(true)} className="text-sm px-3 py-2 rounded-lg inline-flex items-center gap-1.5"
              style={{ border: `1px solid ${C.border}`, color: C.t2 }}>
              <CalendarDays size={15} /> Nova reunião
            </button>
          )}
        </div>

        {/* 1 · Instruções */}
        {ritual && <InstrucoesCard ritual={ritual} cor={cor} />}

        {/* 2 · Próxima reunião */}
        <div className="rounded-xl p-3 mb-4 flex flex-wrap items-center gap-3" style={{ background: C.card, border: `1px solid ${C.border}` }}>
          <CalendarDays size={18} style={{ color: cor, flexShrink: 0 }} />
          <div className="flex-1 min-w-[200px]">
            <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: C.t3 }}>Próxima reunião</div>
            {loading ? (
              <div className="text-sm" style={{ color: C.t3 }}>Carregando…</div>
            ) : proxima ? (
              <div className="text-sm font-semibold" style={{ color: C.text }}>
                {diaSemana(proxima.date)} {fmtData(proxima.date)}
                {proxima.local ? <span style={{ color: C.t2 }}> · {proxima.local}</span> : null}
                <span className="text-xs px-2 py-0.5 rounded-full font-medium ml-2"
                  style={{ background: `${(STATUS_MEETING[proxima.status] || {}).cor || CINZA}22`, color: (STATUS_MEETING[proxima.status] || {}).cor || CINZA }}>
                  {(STATUS_MEETING[proxima.status] || {}).label || proxima.status}
                </span>
              </div>
            ) : (
              <div className="text-sm" style={{ color: C.t2 }}>Nenhuma agendada daqui pra frente.</div>
            )}
          </div>
          {proxima ? (
            <button onClick={() => setOpenId(proxima.id)} className="text-sm px-3 py-2 rounded-lg text-white" style={{ background: cor }}>
              Abrir reunião
            </button>
          ) : canEdit ? (
            <button onClick={gerarAgenda} disabled={gerandoAgenda} className="text-sm px-3 py-2 rounded-lg text-white inline-flex items-center gap-1.5"
              style={{ background: cor, opacity: gerandoAgenda ? 0.6 : 1 }}>
              {gerandoAgenda ? <Loader2 className="animate-spin" size={14} /> : <CalendarDays size={14} />}
              {gerandoAgenda ? 'Gerando…' : 'Gerar agenda do ano'}
            </button>
          ) : null}
        </div>

        {/* Filtros: período + escopo (OKR) */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: C.t3 }}>Período</span>
          {PERIODOS.map(p => (
            <button key={p.dias} onClick={() => setPeriodo(p.dias)}
              className="text-xs px-2.5 py-1.5 rounded-full font-medium"
              style={{
                border: `1px solid ${periodo === p.dias ? cor : C.border}`,
                color: periodo === p.dias ? '#fff' : C.t2,
                background: periodo === p.dias ? cor : 'transparent',
              }}>
              {p.label}
            </button>
          ))}
          {sigla === 'OKR' && (
            <>
              <span className="text-xs font-semibold uppercase tracking-wide ml-3" style={{ color: C.t3 }}>OKRs avaliados</span>
              {ESCOPOS_OKR.map(e => (
                <button key={e} onClick={() => setEscopo(e)}
                  className="text-xs px-2.5 py-1.5 rounded-full font-medium"
                  style={{
                    border: `1px solid ${escopo === e ? cor : C.border}`,
                    color: escopo === e ? '#fff' : C.t2,
                    background: escopo === e ? cor : 'transparent',
                  }}>
                  {e}
                </button>
              ))}
            </>
          )}
        </div>

        {/* 3 · Painel do ritual */}
        {sigla === 'OKR' ? (
          <OkrPainel
            escopo={escopo}
            data={okrData}
            loading={painelLoading}
            canEdit={canEdit}
            alvoRetrato={alvoRetrato}
            salvando={salvandoRetrato}
            onSalvarRetrato={salvarRetrato}
            onAbrirOkr={(okr, bloco) => setOkrAberto({ okr, bloco })}
          />
        ) : sigla === 'KPI' ? (
          <KpiPainel
            data={kpiData}
            loading={painelLoading}
            canEdit={canEdit}
            alvoRetrato={alvoRetrato}
            salvando={salvandoRetrato}
            onSalvarRetrato={salvarRetrato}
            cor={cor}
          />
        ) : sigla === 'CC' ? (
          <CcPainel
            ccMeeting={alvoRetrato}
            cicloMeetings={cicloMeetings}
            canEdit={canEdit}
            cor={cor}
            onAbrir={setOpenId}
            onSalvo={carregar}
          />
        ) : (
          <PainelEmDefinicao sigla={sigla} tipo={tipo} />
        )}

        {/* Comparativo por mês fechado (períodos ≥ 60 dias · pedido do Marcos:
            colunas por mês, não acumulado — ex.: 90d = Maio | Junho | Julho atual) */}
        {sigla === 'OKR' && periodo >= 60 && (
          <OkrComparativoMensal periodo={periodo} escopo={escopo} data={okrData} reunioes={naoCanceladas} cor={cor} />
        )}
        {sigla === 'KPI' && periodo >= 60 && (
          <KpiComparativoMensal periodo={periodo} objetivos={kpiData?.objetivos || []} cor={cor} />
        )}

        {/* Retrospecto cruzado: as outras reuniões do ciclo */}
        <OutrasReunioes atual={sigla} ultimas={ultimasOutras} onVer={(s, m) => setRetro({ sigla: s, meeting: m })} />

        {/* Evolução dos retratos (OKR) */}
        {sigla === 'OKR' && <EvolucaoRetratos reunioes={naoCanceladas} cor={cor} />}

        {/* 4 · Deliberações rastreáveis do período */}
        <DeliberacoesSection delibs={delibs} cor={cor} canEdit={canEdit} onMarcar={marcarDelib} />

        {/* 5 · Atas e deliberações anteriores */}
        <LinhaDoTempo passadas={passadas} periodo={periodo} cor={cor} onAbrir={setOpenId} delibsPorMeeting={delibsPorMeeting} />

        {/* Pendências em aberto do tema */}
        {pendencias.length > 0 && (
          <section className="mb-5">
            <div className="text-sm font-semibold mb-2 flex items-center gap-1.5" style={{ color: C.text }}>
              <ClipboardList size={15} style={{ color: cor }} /> Pendências em aberto ({pendencias.length})
            </div>
            <div className="space-y-1">
              {pendencias.map(t => (
                <div key={t.id} className="text-sm p-2 rounded-lg" style={{ border: `1px solid ${C.border}`, color: C.t2 }}>
                  {t.titulo}{t.responsavel ? ` · ${t.responsavel}` : ''}{t.prazo ? ` · prazo ${fmtData(t.prazo)}` : ''}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Memória do tema (IA) */}
        <section className="mb-8">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="text-sm font-semibold flex items-center gap-1.5" style={{ color: C.text }}>
              <BookOpen size={15} style={{ color: cor }} /> Memória do tema · {anoAtual}
            </div>
            {canEdit && (
              <button onClick={gerarMemoria} disabled={gerandoMemoria}
                className="text-xs px-2.5 py-1.5 rounded-lg inline-flex items-center gap-1.5 text-white"
                style={{ background: cor, opacity: gerandoMemoria ? 0.6 : 1 }}>
                {gerandoMemoria ? <Loader2 className="animate-spin" size={13} /> : null}
                {gerandoMemoria ? 'Gerando…' : 'Gerar/atualizar (IA)'}
              </button>
            )}
          </div>
          <BlocoMarkdownEditavel
            titulo={`Memória — ${sigla} ${anoAtual}`}
            conteudo={memoria?.conteudo_md ?? ''}
            canEdit={canEdit}
            vazioMsg='Sem memória ainda. A IA consolida transcrições (Plaud), atas e dados do sistema num histórico acumulado do tema.'
            onSalvar={async (md) => { const r = await gov.memoria.update(memoria.id, md); setMemoria(r); }}
          />
        </section>
      </div>

      {openId && <DetalheReuniao id={openId} canEdit={canEdit} onClose={() => setOpenId(null)} onChange={carregar} />}
      {novaOpen && tipo && (
        <NovaReuniaoModal types={[tipo]} dataPadrao={ymd(new Date())}
          onClose={() => setNovaOpen(false)} onSaved={() => { setNovaOpen(false); carregar(); }} />
      )}
      {retro && (
        <RetrospectoModal sigla={retro.sigla} meeting={retro.meeting}
          onClose={() => setRetro(null)}
          onIrParaRitual={() => { setRetro(null); navigate(`/governanca/${retro.sigla.toLowerCase()}`); }} />
      )}
      {okrAberto && (
        <OkrDetalheModal okr={okrAberto.okr} blocoArea={okrAberto.bloco}
          metricas={okrData?.metricas || {}} reunioes={naoCanceladas}
          onClose={() => setOkrAberto(null)} />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// 1 · Instruções (material institucional) — Termo/Objetivo sempre visíveis,
// Analisar/Por que importa/Saída esperada ao expandir.
function InstrucoesCard({ ritual, cor }) {
  const [aberto, setAberto] = useState(false);
  return (
    <section className="rounded-xl mb-4 overflow-hidden" style={{ background: C.card, border: `1px solid ${C.border}`, borderLeft: `4px solid ${cor}` }}>
      <button onClick={() => setAberto(o => !o)} className="w-full text-left p-3 flex items-start gap-2.5">
        <Info size={16} style={{ color: cor, flexShrink: 0, marginTop: 2 }} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold" style={{ color: C.text }}>Instruções · o que é esta reunião</div>
          <p className="text-sm mt-0.5" style={{ color: C.t2 }}><b style={{ color: C.text }}>Objetivo:</b> {ritual.objetivo}</p>
        </div>
        <ChevronDown size={16} style={{ color: C.t3, flexShrink: 0, transform: aberto ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>
      {aberto && (
        <div className="px-3 pb-3 grid grid-cols-1 sm:grid-cols-3 gap-3" style={{ marginLeft: 26 }}>
          {[['Analisar', ritual.analisar], ['Por que importa', ritual.porque], ['Saída esperada', ritual.saida]].map(([label, txt]) => (
            <div key={label}>
              <div className="text-[10px] font-extrabold uppercase tracking-widest" style={{ color: cor }}>{label}</div>
              <p className="text-sm mt-1 leading-relaxed" style={{ color: C.t2 }}>{txt}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// Botão "Salvar retrato" (compartilhado entre OKR e KPI).
function BotaoRetrato({ canEdit, alvoRetrato, salvando, onSalvar }) {
  if (!canEdit) return null;
  return (
    <button onClick={onSalvar} disabled={!alvoRetrato || salvando}
      title={alvoRetrato ? `Congela os números de hoje na reunião de ${fmtData(alvoRetrato.date)} (alimenta a evolução e o Conselho)` : 'Sem reunião no período pra receber o retrato'}
      className="text-xs px-3 py-2 rounded-lg inline-flex items-center gap-1.5 text-white"
      style={{ background: C.primary, opacity: (!alvoRetrato || salvando) ? 0.55 : 1 }}>
      {salvando ? <Loader2 className="animate-spin" size={13} /> : <Camera size={13} />}
      {salvando ? 'Salvando…' : alvoRetrato ? `Salvar retrato na reunião de ${fmtData(alvoRetrato.date)}` : 'Salvar retrato'}
    </button>
  );
}

// ────────────────────────────────────────────────────────────────────────
// 3a · Painel da reunião de OKR — a cabeça do Juninho (leitura da vitrine).
function OkrPainel({ escopo, data, loading, canEdit, alvoRetrato, salvando, onSalvarRetrato, onAbrirOkr }) {
  const metricas = data?.metricas || {};
  const nsm = data?.nsm || null;
  const blocos = escopo === 'Todos' ? BLOCOS : BLOCOS.filter(b => b.area === escopo);

  const semFonte = useMemo(() => {
    let n = 0;
    for (const b of blocos) for (const o of b.okrs) for (const t of o.taticos) if (!valorTatico(t, metricas)) n++;
    return n;
  }, [blocos, metricas]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 justify-center rounded-xl mb-5" style={{ border: `1px dashed ${C.border}`, color: C.t3 }}>
        <Loader2 className="animate-spin" size={18} /> Carregando os OKRs…
      </div>
    );
  }

  const corNsm = nsm?.percentual == null ? CINZA : nsm.percentual >= (nsm.meta ?? 50) ? VERDE : VERMELHO;

  return (
    <section className="mb-5">
      {/* NSM */}
      <div className="rounded-xl p-4 mb-3 flex flex-wrap items-center gap-4" style={{ background: `linear-gradient(135deg, ${C.primary}14, ${C.card})`, border: `1px solid ${C.border}` }}>
        <div className="flex-1 min-w-[240px]">
          <div className="text-[10px] font-extrabold uppercase tracking-widest" style={{ color: C.primary }}>Métrica Estrela do Norte</div>
          <div className="text-sm font-semibold mt-1 leading-snug" style={{ color: C.text }}>{NSM.texto}</div>
          {nsm && (
            <div className="text-xs mt-1" style={{ color: C.t3 }}>{nsm.engajados} de {nsm.totalConvertidos} convertidos engajados em ≤60 dias</div>
          )}
        </div>
        <div className="text-center">
          <div className="text-4xl font-extrabold leading-none" style={{ color: corNsm }}>
            {nsm?.percentual == null ? '—' : `${fmt(nsm.percentual)}%`}
          </div>
          <div className="text-xs mt-1" style={{ color: C.t3 }}>alvo <b style={{ color: C.t2 }}>{NSM.alvo}</b></div>
        </div>
      </div>

      {/* Ações + honestidade da medição */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <span className="text-xs" style={{ color: C.t3 }}>
          {semFonte > 0
            ? <><b style={{ color: C.t2 }}>{semFonte}</b> indicador(es) ainda sem fonte de dado — aparecem como "—" e entram no roadmap de medição.</>
            : 'Todos os indicadores do recorte têm número automático.'}
          {' '}Clique num OKR pra abrir os gráficos dele.
        </span>
        <BotaoRetrato canEdit={canEdit} alvoRetrato={alvoRetrato} salvando={salvando} onSalvar={onSalvarRetrato} />
      </div>

      {/* Blocos */}
      {blocos.map(bloco => (
        <div key={bloco.area} className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-sm font-extrabold" style={{ color: C.text }}>{bloco.area}</h2>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: C.primaryBg, color: C.primary }}>{bloco.papel}</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3" style={{ gridAutoRows: 'min-content' }}>
            {bloco.okrs.map(okr => (
              <OkrCardCompacto key={okr.nome} okr={okr} metricas={metricas}
                onClick={onAbrirOkr ? () => onAbrirOkr(okr, bloco.area) : undefined} />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

function OkrCardCompacto({ okr, metricas, onClick }) {
  const topo = valorTopoOkr(okr, metricas);
  return (
    <div className="rounded-xl overflow-hidden transition hover:opacity-95" onClick={onClick}
      title={onClick ? 'Ver os gráficos deste OKR' : undefined}
      style={{ background: C.card, border: `1px solid ${C.border}`, cursor: onClick ? 'pointer' : 'default' }}>
      <div className="p-3" style={{ borderBottom: `1px solid ${C.border}`, background: C.inputBg }}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold leading-snug" style={{ color: C.text }}>{okr.nome}</div>
            <div className="text-xs mt-0.5" style={{ color: C.t3 }}>Alvo: <b style={{ color: C.t2 }}>{okr.alvo}</b>{okr.envolvida ? ` · ${okr.envolvida}` : ''}</div>
          </div>
          {topo && (
            <div className="text-right flex-shrink-0">
              <div className="text-xl font-extrabold leading-none" style={{ color: topo.cor }}>{fmt(topo.valor, topo.casas)}{topo.unidade}</div>
              <div className="text-[9px] font-bold uppercase tracking-wide mt-0.5" style={{ color: C.t3 }}>{topo.label}</div>
            </div>
          )}
        </div>
      </div>
      <div>
        {okr.taticos.map(t => {
          const m = valorTatico(t, metricas);
          const aval = m ? avaliar(m.valor, t) : null;
          const corNum = !m ? CINZA : (aval.ok == null ? C.primary : aval.cor);
          return (
            <div key={t.ind} className="flex items-center gap-2 px-3 py-2" style={{ borderTop: `1px solid ${C.border}66` }}
              title={m?.detalhe || (!m && t.precisa ? `Para puxar automático, preciso de: ${t.precisa}` : undefined)}>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium leading-snug" style={{ color: C.text }}>{t.ind}</div>
                <div className="text-[10.5px]" style={{ color: C.t3 }}>Alvo: {t.alvo}</div>
              </div>
              <div className="text-base font-extrabold flex-shrink-0" style={{ color: corNum }}>
                {m ? `${fmt(m.valor, t.casas)}${m.unidade}` : '—'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// 3b · Painel da reunião de KPI — os objetivos gerais como indicadores de
// processo por valor da Jornada, desaguando nas áreas de culto.
function KpiPainel({ data, loading, canEdit, alvoRetrato, salvando, onSalvarRetrato, cor }) {
  const objetivos = data?.objetivos || [];
  const [abertoId, setAbertoId] = useState(null);

  // Colunas da matriz: áreas de culto na ordem canônica + outras encontradas.
  const colunas = useMemo(() => {
    const found = new Set();
    for (const o of objetivos) for (const a of Object.keys(o.areas || {})) found.add(a);
    const cols = AREAS_CULTO.filter(([slug]) => found.has(slug));
    const extras = Array.from(found)
      .filter(a => !AREAS_CULTO.some(([slug]) => slug === a) && a !== 'sem_area')
      .sort()
      .map(a => [a, a.charAt(0).toUpperCase() + a.slice(1)]);
    return [...cols, ...extras];
  }, [objetivos]);

  const comMedicao = objetivos.filter(o => o.medidos > 0);
  const pcts = objetivos.map(o => o.pct_medio).filter(v => v != null);
  const pctGeral = pcts.length ? Math.round((pcts.reduce((a, b) => a + b, 0) / pcts.length) * 10) / 10 : null;

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 justify-center rounded-xl mb-5" style={{ border: `1px dashed ${C.border}`, color: C.t3 }}>
        <Loader2 className="animate-spin" size={18} /> Carregando os objetivos gerais…
      </div>
    );
  }
  if (!objetivos.length) {
    return (
      <div className="rounded-xl p-4 mb-5 text-sm" style={{ border: `1px dashed ${C.border}`, color: C.t2 }}>
        Nenhum objetivo geral ativo encontrado no sistema.
      </div>
    );
  }

  return (
    <section className="mb-5">
      {/* Resumo */}
      <div className="rounded-xl p-4 mb-3 flex flex-wrap items-center gap-6" style={{ background: `linear-gradient(135deg, ${cor}14, ${C.card})`, border: `1px solid ${C.border}` }}>
        <div>
          <div className="text-[10px] font-extrabold uppercase tracking-widest" style={{ color: cor }}>Objetivos gerais</div>
          <div className="text-3xl font-extrabold leading-tight" style={{ color: C.text }}>{objetivos.length}</div>
          <div className="text-xs" style={{ color: C.t3 }}>indicadores de processo por valor</div>
        </div>
        <div>
          <div className="text-[10px] font-extrabold uppercase tracking-widest" style={{ color: C.t3 }}>Com medição</div>
          <div className="text-3xl font-extrabold leading-tight" style={{ color: comMedicao.length === objetivos.length ? VERDE : C.text }}>{comMedicao.length}</div>
          <div className="text-xs" style={{ color: C.t3 }}>{objetivos.length - comMedicao.length} sem fonte ainda</div>
        </div>
        <div>
          <div className="text-[10px] font-extrabold uppercase tracking-widest" style={{ color: C.t3 }}>% médio da meta</div>
          <div className="text-3xl font-extrabold leading-tight" style={{ color: corPct(pctGeral) }}>{pctGeral == null ? '—' : `${fmt(pctGeral)}%`}</div>
          <div className="text-xs" style={{ color: C.t3 }}>média dos objetivos medidos</div>
        </div>
        <div className="flex-1" />
        <BotaoRetrato canEdit={canEdit} alvoRetrato={alvoRetrato} salvando={salvando} onSalvar={onSalvarRetrato} />
      </div>

      {/* Matriz objetivo × área */}
      <div className="text-sm font-semibold mb-2" style={{ color: C.text }}>Objetivos × áreas de culto <span className="font-normal" style={{ color: C.t3 }}>· % da meta (verde ≥100 · âmbar ≥90 · vermelho &lt;90 · — sem medição) · clique pra ver os KPIs</span></div>
      <div className="rounded-xl overflow-x-auto mb-4" style={{ border: `1px solid ${C.border}` }}>
        <table className="w-full text-sm" style={{ minWidth: 720, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: C.inputBg }}>
              <th className="text-left p-2.5 text-xs font-bold" style={{ color: C.t2 }}>Objetivo</th>
              <th className="text-center p-2.5 text-xs font-bold" style={{ color: C.t2 }}>Valor</th>
              <th className="text-center p-2.5 text-xs font-bold" style={{ color: C.t2 }}>Geral</th>
              {colunas.map(([slug, label]) => (
                <th key={slug} className="text-center p-2.5 text-xs font-bold" style={{ color: C.t2 }}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {objetivos.map(o => {
              const aberto = abertoId === o.id;
              return (
                <FragmentoObjetivo key={o.id} o={o} colunas={colunas} aberto={aberto}
                  onToggle={() => setAbertoId(aberto ? null : o.id)} />
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Evolução mensal (histórico real) */}
      <KpiEvolucao objetivos={objetivos} nota={data?.nota_serie} cor={cor} />
    </section>
  );
}

function FragmentoObjetivo({ o, colunas, aberto, onToggle }) {
  const valor0 = (o.valores || [])[0];
  return (
    <>
      <tr onClick={onToggle} className="cursor-pointer hover:opacity-90" style={{ borderTop: `1px solid ${C.border}66`, background: aberto ? C.inputBg : 'transparent' }}>
        <td className="p-2.5">
          <div className="flex items-center gap-1.5">
            <ChevronDown size={13} style={{ color: C.t3, flexShrink: 0, transform: aberto ? 'rotate(0)' : 'rotate(-90deg)', transition: 'transform 0.15s' }} />
            <span className="font-medium" style={{ color: C.text }}>{o.nome}</span>
          </div>
          <div className="text-[10.5px] ml-5" style={{ color: C.t3 }}>{o.medidos}/{o.total_taticos} KPIs com medição</div>
        </td>
        <td className="p-2.5 text-center">
          {valor0 ? (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: `${VALOR_COR[valor0] || CINZA}1c`, color: VALOR_COR[valor0] || CINZA }}>
              {VALOR_LABEL[valor0] || valor0}
            </span>
          ) : <span style={{ color: C.t3 }}>—</span>}
        </td>
        <CelulaPct pct={o.pct_medio} forte />
        {colunas.map(([slug]) => {
          const cel = (o.areas || {})[slug];
          return <CelulaPct key={slug} pct={cel ? cel.pct : null} title={cel ? `${cel.medidos}/${cel.total} KPIs medidos` : 'Sem KPI desta área neste objetivo'} vazio={!cel} />;
        })}
      </tr>
      {aberto && (
        <tr style={{ background: C.inputBg }}>
          <td colSpan={3 + colunas.length} className="p-3">
            {o.descricao && <p className="text-xs mb-2" style={{ color: C.t2 }}>{o.descricao}</p>}
            {(o.taticos || []).length === 0 ? (
              <p className="text-xs" style={{ color: C.t3 }}>Nenhum KPI tático ligado a este objetivo ainda.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                {o.taticos.map(t => (
                  <div key={t.kpi_id} className="flex items-center gap-2 p-2 rounded-lg" style={{ background: C.card, border: `1px solid ${C.border}` }}>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate" style={{ color: C.text }} title={t.indicador}>{t.indicador}</div>
                      <div className="text-[10px]" style={{ color: C.t3 }}>
                        {(t.area || '—').toUpperCase()} · {t.periodicidade}{t.ultimo_periodo ? ` · último: ${t.ultimo_periodo}` : ''}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-sm font-extrabold" style={{ color: corPct(t.percentual_meta != null ? Number(t.percentual_meta) : null) }}>
                        {t.ultimo_valor == null ? '—' : fmt(Number(t.ultimo_valor))}
                        {t.meta_periodo != null && <span className="text-[10px] font-medium" style={{ color: C.t3 }}> / {fmt(Number(t.meta_periodo))}</span>}
                      </div>
                      <div className="text-[10px]" style={{ color: C.t3 }}>{t.percentual_meta != null ? `${fmt(Number(t.percentual_meta))}% da meta` : 'sem medição'}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function CelulaPct({ pct, title, forte, vazio }) {
  return (
    <td className="p-2.5 text-center" title={title}>
      {vazio ? (
        <span style={{ color: `${CINZA}66` }}>·</span>
      ) : (
        <span className={forte ? 'text-sm font-extrabold' : 'text-sm font-bold'} style={{ color: corPct(pct != null ? Number(pct) : null) }}>
          {pct == null ? '—' : `${fmt(Number(pct))}%`}
        </span>
      )}
    </td>
  );
}

// Evolução mensal dos objetivos (histórico real vs meta normalizada atual).
function KpiEvolucao({ objetivos, nota, cor }) {
  const comSerie = useMemo(() => objetivos.filter(o => (o.serie || []).length >= 2), [objetivos]);
  const [objId, setObjId] = useState(null);
  useEffect(() => {
    if (comSerie.length && !comSerie.some(o => o.id === objId)) setObjId(comSerie[0].id);
  }, [comSerie, objId]);

  if (!comSerie.length) return null;
  const obj = comSerie.find(o => o.id === objId) || comSerie[0];
  const serie = (obj.serie || []).map(s => ({ mes: mesCurto(s.mes), pct: s.pct }));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="text-sm font-semibold flex items-center gap-1.5" style={{ color: C.text }}>
          <TrendingUp size={15} style={{ color: cor }} /> Evolução mensal do objetivo <span className="font-normal" style={{ color: C.t3 }}>· % da meta</span>
        </div>
        <select value={obj.id} onChange={e => setObjId(e.target.value)} style={{ ...inputStyle, width: 'auto', fontSize: 12, padding: '6px 8px', maxWidth: 340 }}>
          {comSerie.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
        </select>
      </div>
      <div className="rounded-xl p-3" style={{ background: C.card, border: `1px solid ${C.border}` }}>
        <div style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={serie} margin={{ top: 10, right: 12, bottom: 0, left: -14 }}>
              <XAxis dataKey="mes" tick={{ fontSize: 10, fill: C.t3 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: C.t3 }} axisLine={false} tickLine={false} width={40} />
              <Tooltip
                contentStyle={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: C.t2 }}
                formatter={(v) => [`${fmt(v)}%`, '% da meta']}
              />
              <ReferenceLine y={100} stroke={C.t3} strokeDasharray="4 3" />
              <Line type="monotone" dataKey="pct" stroke={cor} strokeWidth={2.5} dot={{ r: 3.5, fill: cor }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
        {nota && <p className="text-[10.5px] mt-1" style={{ color: C.t3 }}>{nota}</p>}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// 3c · Painel do Conselho Consultivo — curadoria dos temas do mês.
// O condutor seleciona quais relatórios (retratos das reuniões do ciclo)
// leva ao conselho, ou um tema extra. A seleção fica gravada na reunião.
function CcPainel({ ccMeeting, cicloMeetings, canEdit, cor, onAbrir, onSalvo }) {
  const [selecionados, setSelecionados] = useState([]);
  const [extra, setExtra] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    const t = ccMeeting?.temas || {};
    setSelecionados(Array.isArray(t.selecionados) ? t.selecionados : []);
    setExtra(typeof t.extra === 'string' ? t.extra : '');
  }, [ccMeeting?.id, ccMeeting?.temas]);

  // Reunião do ciclo (mesmo mês) de cada tema.
  const reuniaoPorSigla = useMemo(() => {
    const map = {};
    for (const m of cicloMeetings) {
      const s = m.governance_meeting_types?.sigla;
      if (!s || s === 'CC' || m.status === 'cancelada') continue;
      if (!map[s] || (m.snapshot && !map[s].snapshot)) map[s] = m;
    }
    return map;
  }, [cicloMeetings]);

  const temas = ORDEM_RITUAIS.filter(s => s !== 'CC'); // OKR · DRE · KPI

  function toggle(s) {
    setSelecionados(sel => sel.includes(s) ? sel.filter(x => x !== s) : [...sel, s]);
  }

  async function salvarSelecao() {
    if (!ccMeeting || salvando) return;
    setSalvando(true);
    try {
      await gov.meetings.update(ccMeeting.id, { temas: { selecionados, extra: extra.trim() || null } });
      toast.success('Pauta do conselho salva');
      onSalvo?.();
    } catch (e) { toast.error(formatErro(e)); }
    finally { setSalvando(false); }
  }

  return (
    <section className="mb-5">
      {/* Curadoria */}
      <div className="rounded-xl p-4 mb-3" style={{ background: `linear-gradient(135deg, ${cor}14, ${C.card})`, border: `1px solid ${C.border}` }}>
        <div className="text-[10px] font-extrabold uppercase tracking-widest" style={{ color: cor }}>Curadoria do mês</div>
        <p className="text-sm mt-1" style={{ color: C.t2 }}>
          Quais temas vão ao conselho{ccMeeting?.date ? <> na reunião de <b style={{ color: C.text }}>{fmtData(ccMeeting.date)}</b></> : null}?
          O relatório compõe o <b style={{ color: C.text }}>retrato</b> salvo em cada reunião do ciclo — o conselho vê exatamente o que a diretoria viu.
        </p>
        <div className="flex flex-wrap items-center gap-2 mt-3">
          {temas.map(s => {
            const on = selecionados.includes(s);
            const corTema = COR_RITUAL[s];
            return (
              <button key={s} disabled={!canEdit} onClick={() => toggle(s)}
                className="text-xs px-3 py-1.5 rounded-full font-bold"
                style={{
                  border: `1px solid ${on ? corTema : C.border}`,
                  background: on ? corTema : 'transparent',
                  color: on ? '#fff' : C.t2,
                  opacity: canEdit ? 1 : 0.7,
                }}>
                {RITUAIS[s]?.titulo || s}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-end gap-2 mt-3">
          <div className="flex-1 min-w-[220px]">
            <label className="text-xs font-medium" style={{ color: C.t2 }}>Tema extra <span style={{ color: C.t3 }}>(opcional · ex.: cronograma de obras)</span></label>
            <input disabled={!canEdit} value={extra} onChange={e => setExtra(e.target.value)} style={inputStyle} placeholder="Assunto fora dos 3 relatórios…" />
          </div>
          {canEdit && (
            <button onClick={salvarSelecao} disabled={!ccMeeting || salvando}
              className="text-sm px-4 py-2 rounded-lg text-white" style={{ background: cor, opacity: (!ccMeeting || salvando) ? 0.55 : 1 }}>
              {salvando ? 'Salvando…' : 'Salvar pauta do conselho'}
            </button>
          )}
        </div>
        {!ccMeeting && <p className="text-xs mt-2" style={{ color: C.t3 }}>Sem reunião do Conselho no período — gere o ciclo do mês na aba Agenda.</p>}
      </div>

      {/* Composição dos temas selecionados */}
      {selecionados.length === 0 && !extra.trim() ? (
        <div className="rounded-xl p-4 flex items-start gap-2.5" style={{ border: `1px dashed ${C.border}`, color: C.t2 }}>
          <Info size={16} style={{ color: C.t3, flexShrink: 0, marginTop: 2 }} />
          <p className="text-sm">Nenhum tema selecionado ainda. Marque acima o que o conselho vai avaliar neste mês — ou registre um tema extra.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {selecionados.map(s => (
            <TemaComposto key={s} sigla={s} reuniao={reuniaoPorSigla[s]} onAbrir={onAbrir} />
          ))}
          {extra.trim() && (
            <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
              <div className="p-3 flex items-center gap-2" style={{ background: C.inputBg }}>
                <span style={{ width: 10, height: 10, borderRadius: 99, background: C.primary }} />
                <span className="text-sm font-bold" style={{ color: C.text }}>Tema extra</span>
              </div>
              <p className="text-sm p-3" style={{ color: C.t2 }}>{extra}</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// Card de um tema selecionado no Conselho: retrato + deliberações da reunião do ciclo.
function TemaComposto({ sigla, reuniao, onAbrir }) {
  const corTema = COR_RITUAL[sigla] || C.primary;
  const nome = RITUAIS[sigla]?.titulo || sigla;
  const snap = reuniao?.snapshot;
  return (
    <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
      <div className="p-3 flex flex-wrap items-center gap-2" style={{ background: C.inputBg }}>
        <span style={{ width: 10, height: 10, borderRadius: 99, background: corTema }} />
        <span className="text-sm font-bold flex-1" style={{ color: C.text }}>{nome}</span>
        {reuniao ? (
          <button onClick={() => onAbrir(reuniao.id)} className="text-xs px-2.5 py-1 rounded-lg" style={{ border: `1px solid ${C.border}`, color: C.t2 }}>
            Reunião de {fmtData(reuniao.date)} · abrir
          </button>
        ) : (
          <span className="text-xs" style={{ color: C.t3 }}>Sem reunião deste tema no ciclo</span>
        )}
      </div>
      <div className="p-3">
        {!reuniao ? (
          <p className="text-sm" style={{ color: C.t3 }}>Gere o ciclo do mês (aba Agenda) pra este tema ter reunião — e retrato.</p>
        ) : !snap ? (
          <p className="text-sm" style={{ color: C.t3 }}>
            {sigla === 'DRE'
              ? 'O DRE ainda não tem retrato — os números serão ligados quando a versão oficial do financeiro chegar.'
              : <>Sem retrato salvo nesta reunião ainda — abra a página do ritual ({nome}) e clique em "Salvar retrato" no dia da reunião.</>}
          </p>
        ) : (
          <ResumoRetrato snap={snap} />
        )}
        {reuniao?.deliberacoes && (
          <div className="text-sm mt-2 rounded-lg p-2" style={{ background: `${corTema}0f`, border: `1px solid ${corTema}33`, color: C.t2 }}>
            <b style={{ color: C.text }}>Deliberações:</b> {reuniao.deliberacoes}
          </div>
        )}
      </div>
    </div>
  );
}

// Resumo compacto de um retrato (por sigla · usado na composição do Conselho).
function ResumoRetrato({ snap }) {
  if (snap.sigla === 'OKR') {
    const inds = snap.indicadores || [];
    const ok = inds.filter(i => i.ok === true).length;
    const fora = inds.filter(i => i.ok === false).length;
    const sem = inds.filter(i => i.valor == null).length;
    const nsmPct = snap.nsm?.percentual;
    return (
      <div className="flex flex-wrap items-center gap-5">
        <div>
          <div className="text-[10px] font-extrabold uppercase tracking-widest" style={{ color: C.t3 }}>NSM</div>
          <div className="text-2xl font-extrabold" style={{ color: nsmPct == null ? CINZA : nsmPct >= (snap.nsm?.meta ?? 50) ? VERDE : VERMELHO }}>
            {nsmPct == null ? '—' : `${fmt(nsmPct)}%`}
          </div>
        </div>
        <div className="text-sm" style={{ color: C.t2 }}>
          <b style={{ color: VERDE }}>{ok}</b> no alvo · <b style={{ color: VERMELHO }}>{fora}</b> fora · <b style={{ color: CINZA }}>{sem}</b> sem medição
          <div className="text-xs" style={{ color: C.t3 }}>retrato de {snap.capturado_em ? new Date(snap.capturado_em).toLocaleDateString('pt-BR') : '—'}</div>
        </div>
      </div>
    );
  }
  if (snap.sigla === 'KPI') {
    const r = snap.resumo || {};
    const piores = (snap.objetivos || []).filter(o => o.pct_medio != null).sort((a, b) => a.pct_medio - b.pct_medio).slice(0, 3);
    return (
      <div>
        <div className="flex flex-wrap items-center gap-5">
          <div>
            <div className="text-[10px] font-extrabold uppercase tracking-widest" style={{ color: C.t3 }}>% médio da meta</div>
            <div className="text-2xl font-extrabold" style={{ color: corPct(r.pct_medio_geral) }}>{r.pct_medio_geral == null ? '—' : `${fmt(r.pct_medio_geral)}%`}</div>
          </div>
          <div className="text-sm" style={{ color: C.t2 }}>
            <b style={{ color: C.text }}>{r.com_medicao ?? '—'}</b> de <b style={{ color: C.text }}>{r.objetivos ?? '—'}</b> objetivos com medição
            <div className="text-xs" style={{ color: C.t3 }}>retrato de {snap.capturado_em ? new Date(snap.capturado_em).toLocaleDateString('pt-BR') : '—'}</div>
          </div>
        </div>
        {piores.length > 0 && (
          <div className="text-xs mt-2" style={{ color: C.t3 }}>
            Piores: {piores.map(p => `${p.nome} (${fmt(p.pct_medio)}%)`).join(' · ')}
          </div>
        )}
      </div>
    );
  }
  return <p className="text-sm" style={{ color: C.t2 }}>Retrato salvo em {snap.capturado_em ? new Date(snap.capturado_em).toLocaleDateString('pt-BR') : '—'}.</p>;
}

// ────────────────────────────────────────────────────────────────────────
function PainelEmDefinicao({ sigla, tipo }) {
  const msg = {
    DRE: 'Os números desta reunião serão ligados à versão oficial do DRE gerencial (aguardando o modelo do financeiro).',
    DE: 'Reunião quadrimestral (mês com 5ª quarta): análise de atrasos e prioridades dos projetos + obras — será desenhada em breve.',
  }[sigla] || tipo?.descricao || 'O painel de dados desta reunião ainda será desenhado.';
  return (
    <div className="rounded-xl p-4 mb-5 flex items-start gap-2.5" style={{ border: `1px dashed ${C.border}`, color: C.t2 }}>
      <Info size={16} style={{ color: C.t3, flexShrink: 0, marginTop: 2 }} />
      <p className="text-sm leading-relaxed">{msg} As atas, deliberações e a memória do tema já funcionam abaixo.</p>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Evolução — gráfico dos retratos salvos nas reuniões (OKR).
function EvolucaoRetratos({ reunioes, cor }) {
  const comRetrato = useMemo(
    () => reunioes.filter(m => m.snapshot && m.date).sort((a, b) => (a.date > b.date ? 1 : -1)),
    [reunioes]
  );
  const chaves = useMemo(() => {
    const set = new Set();
    for (const m of comRetrato) {
      if (m.snapshot?.nsm?.percentual != null) set.add('nsm');
      for (const k of Object.keys(m.snapshot?.metricas || {})) set.add(k);
    }
    return Array.from(set);
  }, [comRetrato]);
  const [chave, setChave] = useState('nsm');
  useEffect(() => { if (chaves.length && !chaves.includes(chave)) setChave(chaves[0]); }, [chaves, chave]);

  if (comRetrato.length === 0) return null;

  const serie = comRetrato.map(m => ({
    data: fmtData(m.date).slice(0, 5),
    dataFull: fmtData(m.date),
    valor: chave === 'nsm' ? (m.snapshot?.nsm?.percentual ?? null) : (m.snapshot?.metricas?.[chave]?.valor ?? null),
  }));
  const unidade = chave === 'nsm' ? '%' : (comRetrato.map(m => m.snapshot?.metricas?.[chave]?.unidade).find(u => u != null) || '');

  return (
    <section className="mb-5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="text-sm font-semibold flex items-center gap-1.5" style={{ color: C.text }}>
          <TrendingUp size={15} style={{ color: cor }} /> Evolução entre reuniões
        </div>
        <select value={chave} onChange={e => setChave(e.target.value)} style={{ ...inputStyle, width: 'auto', fontSize: 12, padding: '6px 8px' }}>
          {chaves.map(k => <option key={k} value={k}>{LIVE_LABELS[k] || k}</option>)}
        </select>
      </div>
      <div className="rounded-xl p-3" style={{ background: C.card, border: `1px solid ${C.border}` }}>
        {comRetrato.length < 2 ? (
          <p className="text-sm" style={{ color: C.t3 }}>
            1 retrato salvo ({serie[0]?.dataFull}) · a linha de evolução aparece a partir do segundo — salve um retrato a cada reunião.
          </p>
        ) : (
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={serie} margin={{ top: 10, right: 12, bottom: 0, left: -14 }}>
                <XAxis dataKey="data" tick={{ fontSize: 10, fill: C.t3 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: C.t3 }} axisLine={false} tickLine={false} width={40} />
                <Tooltip
                  contentStyle={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: C.t2 }}
                  formatter={(v) => [`${fmt(v)}${unidade}`, LIVE_LABELS[chave] || chave]}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.dataFull || ''}
                />
                {chave === 'nsm' && <ReferenceLine y={50} stroke={C.t3} strokeDasharray="4 3" />}
                <Line type="monotone" dataKey="valor" stroke={cor} strokeWidth={2.5} dot={{ r: 4, fill: cor }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────────
// 4 · Deliberações rastreáveis do período — o conselho marca a execução.
const STATUS_DELIB = {
  pendente: { label: 'Pendente', cor: '#F59E0B' },
  em_andamento: { label: 'Em andamento', cor: '#3B82F6' },
  concluida: { label: 'Executada', cor: '#10B981' },
  nao_executada: { label: 'Não executada', cor: '#EF4444' },
  cancelada: { label: 'Cancelada', cor: '#9CA3AF' },
};

function DeliberacoesSection({ delibs, cor, canEdit, onMarcar }) {
  if (!delibs.length) return null;
  return (
    <section className="mb-5">
      <div className="text-sm font-semibold mb-2 flex items-center gap-1.5" style={{ color: C.text }}>
        <CheckCircle2 size={15} style={{ color: cor }} /> Deliberações rastreáveis ({delibs.length})
        <span className="font-normal text-xs" style={{ color: C.t3 }}>· extraídas do Plaud e confirmadas · marque a execução</span>
      </div>
      <div className="space-y-1.5">
        {delibs.map(d => {
          const st = STATUS_DELIB[d.status] || STATUS_DELIB.pendente;
          return (
            <div key={d.id} className="flex flex-wrap items-center gap-2 p-2.5 rounded-lg" style={{ background: C.card, border: `1px solid ${C.border}` }}>
              <div className="flex-1 min-w-[220px]">
                <div className="text-sm" style={{ color: C.text, textDecoration: d.status === 'concluida' ? 'line-through' : 'none' }}>{d.titulo}</div>
                <div className="text-xs" style={{ color: C.t3 }}>
                  {[d.meeting_date ? `reunião de ${fmtData(d.meeting_date)}` : null, d.responsavel, d.prazo ? `prazo ${fmtData(d.prazo)}` : null].filter(Boolean).join(' · ')}
                </div>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: `${st.cor}22`, color: st.cor }}>{st.label}</span>
              {canEdit && (
                <div className="flex items-center gap-1">
                  <button onClick={() => onMarcar(d, 'concluida')} title="Marcar como executada"
                    className="p-1.5 rounded-lg" style={{ border: `1px solid ${C.border}`, color: d.status === 'concluida' ? VERDE : C.t3 }}>
                    <CheckCircle2 size={15} />
                  </button>
                  <button onClick={() => onMarcar(d, 'nao_executada')} title="Marcar como não executada"
                    className="p-1.5 rounded-lg" style={{ border: `1px solid ${C.border}`, color: d.status === 'nao_executada' ? VERMELHO : C.t3 }}>
                    <XCircle size={15} />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────────
// 5 · Atas e deliberações anteriores — linha do tempo do período.
function LinhaDoTempo({ passadas, periodo, cor, onAbrir, delibsPorMeeting }) {
  const label = PERIODOS.find(p => p.dias === periodo)?.label || `${periodo} dias`;
  return (
    <section className="mb-5">
      <div className="text-sm font-semibold mb-2 flex items-center gap-1.5" style={{ color: C.text }}>
        <Gavel size={15} style={{ color: cor }} /> Atas e deliberações anteriores <span style={{ color: C.t3 }}>· período: {label}</span>
      </div>
      {passadas.length === 0 ? (
        <p className="text-sm rounded-xl p-3" style={{ border: `1px dashed ${C.border}`, color: C.t3 }}>
          Nenhuma reunião deste tema no período selecionado.
        </p>
      ) : (
        <div style={{ borderLeft: `2px solid ${C.border}`, marginLeft: 7 }} className="space-y-3 pt-1">
          {passadas.map(m => {
            const st = STATUS_MEETING[m.status] || STATUS_MEETING.agendada;
            const dls = (delibsPorMeeting || {})[m.id] || [];
            return (
              <div key={m.id} className="relative pl-5">
                <span style={{ position: 'absolute', left: -7, top: 6, width: 12, height: 12, borderRadius: 99, background: st.cor, border: `2px solid ${C.bg}` }} />
                <div className="rounded-xl p-3" style={{ background: C.card, border: `1px solid ${C.border}` }}>
                  <div className="flex flex-wrap items-center gap-2">
                    <button onClick={() => onAbrir(m.id)} className="text-sm font-semibold hover:underline" style={{ color: C.text }}>
                      {diaSemana(m.date)} {fmtData(m.date)}
                    </button>
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: `${st.cor}22`, color: st.cor }}>{st.label}</span>
                    {m.snapshot && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium inline-flex items-center gap-1" style={{ background: `${C.primary}22`, color: C.primary }}>
                        <Camera size={11} /> retrato salvo
                      </span>
                    )}
                  </div>
                  {dls.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {dls.map(d => {
                        const sd = STATUS_DELIB[d.status] || STATUS_DELIB.pendente;
                        return (
                          <span key={d.id} className="text-xs px-2 py-1 rounded-lg" title={`${sd.label}${d.responsavel ? ' · ' + d.responsavel : ''}`}
                            style={{ background: `${sd.cor}14`, border: `1px solid ${sd.cor}44`, color: C.t2 }}>
                            <span style={{ color: sd.cor, fontWeight: 700 }}>●</span> {d.titulo}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {m.deliberacoes && (
                    <div className="text-sm mt-2 rounded-lg p-2" style={{ background: `${cor}0f`, border: `1px solid ${cor}33`, color: C.t2 }}>
                      <b style={{ color: C.text }}>Deliberações:</b> {m.deliberacoes}
                    </div>
                  )}
                  {m.ata && <p className="text-sm mt-2" style={{ color: C.t2 }}><b style={{ color: C.text }}>Ata:</b> {m.ata}</p>}
                  {!m.ata && !m.deliberacoes && dls.length === 0 && (
                    <p className="text-xs mt-1" style={{ color: C.t3 }}>Sem ata registrada — abra a reunião pra preencher.</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Retrospecto cruzado — dentro de um ritual, os OUTROS rituais do ciclo com
// a última reunião ocorrida de cada um; clicar abre a visão estática do que
// foi visto lá (retrato + decisões + pendências + resumo).
function OutrasReunioes({ atual, ultimas, onVer }) {
  const outras = ORDEM_RITUAIS.filter(s => s !== atual);
  return (
    <section className="mb-5">
      <div className="text-sm font-semibold mb-2 flex items-center gap-1.5" style={{ color: C.text }}>
        <BookOpen size={15} style={{ color: C.t3 }} /> As outras reuniões do ciclo
        <span className="font-normal text-xs" style={{ color: C.t3 }}>· o que foi visto na última de cada uma</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {outras.map(s => {
          const corTema = COR_RITUAL[s];
          const m = ultimas[s];
          return (
            <button key={s} disabled={!m} onClick={() => m && onVer(s, m)}
              className="text-left rounded-xl p-3 transition hover:opacity-95"
              style={{ background: C.card, border: `1px solid ${C.border}`, opacity: m ? 1 : 0.6, cursor: m ? 'pointer' : 'default' }}>
              <div className="flex items-center gap-2">
                <span style={{ width: 9, height: 9, borderRadius: 99, background: corTema, flexShrink: 0 }} />
                <span className="text-sm font-semibold flex-1 truncate" style={{ color: C.text }}>{RITUAIS[s]?.titulo || s}</span>
              </div>
              <div className="text-xs mt-1.5" style={{ color: C.t3 }}>
                {m ? (
                  <>
                    Última: <b style={{ color: C.t2 }}>{fmtData(m.date)}</b>
                    {m.snapshot && <span className="ml-1.5" style={{ color: C.primary }}>· retrato ✓</span>}
                    {m.ata && <span className="ml-1.5" style={{ color: C.t2 }}>· ata ✓</span>}
                  </>
                ) : 'Nenhuma reunião ocorrida ainda'}
              </div>
              {m && <div className="text-xs font-semibold mt-1.5 inline-flex items-center gap-1" style={{ color: corTema }}>Ver o que foi visto <ChevronDown size={12} style={{ transform: 'rotate(-90deg)' }} /></div>}
            </button>
          );
        })}
      </div>
    </section>
  );
}

// Visão estática da última reunião de um ritual: retrato + resumo do que foi
// discutido (ata) + deliberações com status + pendências. Read-only.
function RetrospectoModal({ sigla, meeting, onClose, onIrParaRitual }) {
  const corTema = COR_RITUAL[sigla] || C.primary;
  const nome = RITUAIS[sigla]?.titulo || sigla;
  const [full, setFull] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ativo = true;
    gov.meetings.get(meeting.id)
      .then(m => { if (ativo) setFull(m); })
      .catch(e => toast.error(formatErro(e)))
      .finally(() => { if (ativo) setLoading(false); });
    return () => { ativo = false; };
  }, [meeting.id]);

  const delibs = (full?.tasks || []).filter(t => t.origem === 'deliberacao');
  const pendencias = (full?.tasks || []).filter(t => t.origem !== 'deliberacao');
  const st = STATUS_MEETING[meeting.status] || STATUS_MEETING.agendada;

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: C.overlay, zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', overflowY: 'auto', padding: 16 }}>
      <div style={{ background: C.modalBg, border: `1px solid ${C.border}`, borderRadius: 14, width: '100%', maxWidth: 640, margin: '24px 0' }}>
        <div className="flex items-start justify-between gap-3 p-4" style={{ borderBottom: `1px solid ${C.border}` }}>
          <div className="flex items-center gap-2">
            <span style={{ width: 10, height: 10, borderRadius: 99, background: corTema, display: 'inline-block' }} />
            <div>
              <div className="font-semibold text-lg" style={{ color: C.text }}>{nome}</div>
              <div className="text-xs" style={{ color: C.t3 }}>
                Última reunião · {diaSemana(meeting.date)} {fmtData(meeting.date)} ·{' '}
                <span style={{ color: st.cor }}>{st.label}</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ color: C.t2 }}><XCircle size={20} /></button>
        </div>

        <div className="p-4 space-y-4">
          {/* Retrato (números congelados na data) */}
          <div>
            <div className="text-xs font-bold uppercase tracking-wide mb-1.5" style={{ color: corTema }}>O que os números mostravam</div>
            {meeting.snapshot ? (
              <div className="rounded-lg p-3" style={{ border: `1px solid ${C.border}` }}>
                <ResumoRetrato snap={meeting.snapshot} />
              </div>
            ) : (
              <p className="text-sm" style={{ color: C.t3 }}>Sem retrato salvo nesta reunião.</p>
            )}
          </div>

          {/* Resumo do que foi discutido */}
          <div>
            <div className="text-xs font-bold uppercase tracking-wide mb-1.5" style={{ color: corTema }}>Resumo do que foi discutido</div>
            {meeting.ata
              ? <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: C.t2 }}>{meeting.ata}</p>
              : <p className="text-sm" style={{ color: C.t3 }}>Sem ata registrada nesta reunião.</p>}
            {meeting.deliberacoes && (
              <div className="text-sm mt-2 rounded-lg p-2" style={{ background: `${corTema}0f`, border: `1px solid ${corTema}33`, color: C.t2 }}>
                <b style={{ color: C.text }}>Deliberações (texto):</b> {meeting.deliberacoes}
              </div>
            )}
          </div>

          {/* Decisões + pendências */}
          {loading ? (
            <div className="flex items-center gap-2 py-3 justify-center" style={{ color: C.t3 }}><Loader2 className="animate-spin" size={16} /> Carregando decisões…</div>
          ) : (
            <>
              <div>
                <div className="text-xs font-bold uppercase tracking-wide mb-1.5" style={{ color: corTema }}>Decisões ({delibs.length})</div>
                {delibs.length === 0 ? (
                  <p className="text-sm" style={{ color: C.t3 }}>Nenhuma deliberação rastreável registrada.</p>
                ) : (
                  <div className="space-y-1">
                    {delibs.map(t => {
                      const sd = STATUS_DELIB[t.status] || STATUS_DELIB.pendente;
                      return (
                        <div key={t.id} className="flex items-center gap-2 text-sm p-2 rounded-lg" style={{ border: `1px solid ${C.border}` }}>
                          <span className="flex-1" style={{ color: C.text }}>{t.titulo}</span>
                          <span className="text-xs flex-shrink-0" style={{ color: C.t3 }}>{t.responsavel || ''}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0" style={{ background: `${sd.cor}22`, color: sd.cor }}>{sd.label}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              {pendencias.length > 0 && (
                <div>
                  <div className="text-xs font-bold uppercase tracking-wide mb-1.5" style={{ color: corTema }}>Pendências ({pendencias.length})</div>
                  <div className="space-y-1">
                    {pendencias.map(t => (
                      <div key={t.id} className="text-sm p-2 rounded-lg" style={{ border: `1px solid ${C.border}`, color: C.t2, textDecoration: t.status === 'concluida' ? 'line-through' : 'none' }}>
                        {t.titulo}{t.responsavel ? ` · ${t.responsavel}` : ''}{t.prazo ? ` · prazo ${fmtData(t.prazo)}` : ''}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 p-4" style={{ borderTop: `1px solid ${C.border}` }}>
          <button onClick={onIrParaRitual} className="text-sm px-3 py-2 rounded-lg" style={{ border: `1px solid ${C.border}`, color: corTema }}>
            Ir pra página do ritual
          </button>
          <button onClick={onClose} className="text-sm px-4 py-2 rounded-lg text-white" style={{ background: corTema }}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Comparativo por mês fechado (pedido do Marcos 2026-07-08): período ≥ 60d
// mostra 1 coluna POR MÊS (ex.: 90d = Maio | Junho | Julho atual), não o
// acumulado. Em 5 anos as colunas viram ANUAIS (média dos meses com dado).
const COLS_MENSAIS = { 60: 2, 90: 3, 180: 6, 365: 12 };

function ultimosMeses(n) {
  const out = [];
  const base = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

// Colunas do comparativo: mensais (com "(atual)" no mês corrente) ou anuais (5a).
function colunasDoPeriodo(periodo) {
  const mesAtual = ultimosMeses(1)[0];
  if (periodo < 1825) {
    const n = COLS_MENSAIS[periodo] || 3;
    return ultimosMeses(n).map(mes => ({
      key: mes, meses: [mes],
      label: mes === mesAtual ? `${mesCurto(mes)} (atual)` : mesCurto(mes),
      atual: mes === mesAtual,
    }));
  }
  const anoAtual = new Date().getFullYear();
  const todos = ultimosMeses(60);
  return [4, 3, 2, 1, 0].map(off => {
    const ano = anoAtual - off;
    return {
      key: String(ano), meses: todos.filter(m => m.startsWith(String(ano))),
      label: off === 0 ? `${ano} (atual)` : String(ano),
      atual: off === 0,
    };
  });
}

const celulaSticky = { position: 'sticky', left: 0, background: C.card, zIndex: 1 };

// ── OKR: linhas = NSM + 9 OKRs + táticos · fonte do mês fechado = retrato da
// reunião do ciclo daquele mês; sem retrato, cai na série mensal viva do
// indicador (quando existe); senão "—". Mês corrente = valores de agora.
function OkrComparativoMensal({ periodo, escopo, data, reunioes, cor }) {
  const metricas = data?.metricas || {};
  const nsm = data?.nsm || null;
  const mesAtual = ultimosMeses(1)[0];

  const snapPorMes = useMemo(() => {
    const map = {};
    for (const m of reunioes) {
      if (!m.snapshot || !m.date) continue;
      const mes = String(m.date).slice(0, 7);
      const cur = map[mes];
      if (!cur || String(m.snapshot_em || '') > String(cur.snapshot_em || '')) map[mes] = m;
    }
    return map;
  }, [reunioes]);

  const blocos = escopo === 'Todos' ? BLOCOS : BLOCOS.filter(b => b.area === escopo);

  const linhas = useMemo(() => {
    const rows = [{ id: 'nsm', nivel: 'nsm', nome: 'NSM · % de convertidos engajados em 60d', cfg: { alvoNum: nsm?.meta ?? 50, cmp: 'gte' }, unidade: '%', casas: 1 }];
    for (const b of blocos) {
      rows.push({ id: `b:${b.area}`, nivel: 'bloco', nome: b.area });
      for (const o of b.okrs) {
        const topoVivo = valorTopoOkr(o, metricas);
        rows.push({ id: `o:${o.nome}`, nivel: 'okr', nome: o.nome, cfg: o, chave: o.live, casas: o.casas ?? 1, unidade: topoVivo?.unidade ?? (o.fixo?.unidade || '%') });
        for (const t of o.taticos) {
          const vivo = valorTatico(t, metricas);
          rows.push({ id: `t:${o.nome}:${t.ind}`, nivel: 'tatico', okrNome: o.nome, nome: t.ind, cfg: t, chave: t.live, casas: t.casas ?? 1, unidade: vivo?.unidade ?? (t.fixo?.unidade || '') });
        }
      }
    }
    return rows;
  }, [blocos, metricas, nsm]);

  const valorNoMes = (row, mesKey) => {
    if (mesKey === mesAtual) {
      if (row.nivel === 'nsm') return nsm?.percentual ?? null;
      if (row.nivel === 'okr') { const t = valorTopoOkr(row.cfg, metricas); return t && t.valor != null ? Number(t.valor) : null; }
      const m = valorTatico(row.cfg, metricas);
      return m && m.valor != null ? Number(m.valor) : null;
    }
    const snap = snapPorMes[mesKey]?.snapshot;
    if (snap) {
      if (row.nivel === 'nsm') { if (snap.nsm?.percentual != null) return Number(snap.nsm.percentual); }
      else {
        const hit = (snap.indicadores || []).find(i =>
          i.nivel === row.nivel && i.nome === row.nome && (row.nivel !== 'tatico' || i.okr === row.okrNome));
        if (hit && hit.valor != null) return Number(hit.valor);
      }
    }
    if (row.chave) {
      const s = metricas[row.chave]?.serie;
      const p = Array.isArray(s) ? s.find(x => x.mes === mesKey) : null;
      if (p && p.valor != null) return Number(p.valor);
    }
    return null;
  };

  const colunas = colunasDoPeriodo(periodo);
  const valorNaColuna = (row, col) => {
    const vals = col.meses.map(m => valorNoMes(row, m)).filter(v => v != null && Number.isFinite(v));
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  };
  const retratos = Object.keys(snapPorMes).length;

  return (
    <section className="mb-5">
      <div className="text-sm font-semibold mb-2 flex items-center gap-1.5" style={{ color: C.text }}>
        <TrendingUp size={15} style={{ color: cor }} /> Comparativo por mês fechado
        <span className="font-normal text-xs" style={{ color: C.t3 }}>· verde no alvo · vermelho fora · "—" sem dado no mês</span>
      </div>
      <div className="rounded-xl overflow-x-auto" style={{ border: `1px solid ${C.border}` }}>
        <table className="w-full text-sm" style={{ minWidth: 560 + colunas.length * 90, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: C.inputBg }}>
              <th className="text-left p-2.5 text-xs font-bold" style={{ ...celulaSticky, background: C.inputBg, color: C.t2, minWidth: 300 }}>Indicador</th>
              {colunas.map(col => (
                <th key={col.key} className="text-center p-2.5 text-xs font-bold" style={{ color: col.atual ? cor : C.t2 }}>{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map(row => {
              if (row.nivel === 'bloco') {
                return (
                  <tr key={row.id} style={{ background: C.inputBg }}>
                    <td colSpan={1 + colunas.length} className="px-2.5 py-1.5 text-xs font-extrabold uppercase tracking-wide" style={{ ...celulaSticky, background: C.inputBg, color: C.t2 }}>{row.nome}</td>
                  </tr>
                );
              }
              const destaque = row.nivel !== 'tatico';
              return (
                <tr key={row.id} style={{ borderTop: `1px solid ${C.border}66` }}>
                  <td className="p-2.5" style={{ ...celulaSticky, paddingLeft: row.nivel === 'tatico' ? 26 : 10 }}>
                    <span className={destaque ? 'text-xs font-bold' : 'text-xs'} style={{ color: destaque ? C.text : C.t2 }}>{row.nome}</span>
                    {row.cfg?.alvo && <span className="text-[10px] ml-1.5" style={{ color: C.t3 }}>alvo {row.cfg.alvo}</span>}
                  </td>
                  {colunas.map(col => {
                    const v = valorNaColuna(row, col);
                    const aval = v == null ? null : avaliar(v, row.cfg);
                    const corNum = v == null ? CINZA : (aval.ok == null ? C.primary : aval.cor);
                    return (
                      <td key={col.key} className="p-2.5 text-center">
                        <span className={destaque ? 'text-sm font-extrabold' : 'text-sm font-semibold'} style={{ color: corNum }}>
                          {v == null ? '—' : `${fmt(v, row.casas)}${row.unidade || ''}`}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[10.5px] mt-1.5 leading-relaxed" style={{ color: C.t3 }}>
        Mês fechado = retrato salvo na reunião daquele ciclo ({retratos} retrato(s) no período); sem retrato, uso a série mensal viva do indicador quando existe.
        Salve o retrato a cada reunião pra fechar todas as colunas daqui pra frente. Coluna "(atual)" = números de agora.
      </p>
    </section>
  );
}

// ── KPI: linhas = objetivos gerais · colunas = meses fechados (% da meta médio
// do mês, do histórico real) · em 5 anos vira média anual.
function KpiComparativoMensal({ periodo, objetivos, cor }) {
  const mesAtual = ultimosMeses(1)[0];
  const colunas = colunasDoPeriodo(periodo);
  if (!objetivos.length) return null;

  const valorNaColuna = (o, col) => {
    const sMap = Object.fromEntries((o.serie || []).map(s => [s.mes, s.pct]));
    const vals = col.meses.map(m => {
      let v = sMap[m];
      if (v == null && m === mesAtual) v = o.pct_medio; // mês corrente cai no vivo
      return v;
    }).filter(v => v != null && Number.isFinite(Number(v))).map(Number);
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  };

  return (
    <section className="mb-5">
      <div className="text-sm font-semibold mb-2 flex items-center gap-1.5" style={{ color: C.text }}>
        <TrendingUp size={15} style={{ color: cor }} /> Comparativo por mês fechado <span className="font-normal text-xs" style={{ color: C.t3 }}>· % da meta por objetivo</span>
      </div>
      <div className="rounded-xl overflow-x-auto" style={{ border: `1px solid ${C.border}` }}>
        <table className="w-full text-sm" style={{ minWidth: 420 + colunas.length * 90, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: C.inputBg }}>
              <th className="text-left p-2.5 text-xs font-bold" style={{ ...celulaSticky, background: C.inputBg, color: C.t2, minWidth: 280 }}>Objetivo</th>
              {colunas.map(col => (
                <th key={col.key} className="text-center p-2.5 text-xs font-bold" style={{ color: col.atual ? cor : C.t2 }}>{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {objetivos.map(o => (
              <tr key={o.id} style={{ borderTop: `1px solid ${C.border}66` }}>
                <td className="p-2.5" style={celulaSticky}>
                  <span className="text-xs font-medium" style={{ color: C.text }}>{o.nome}</span>
                  <span className="text-[10px] ml-1.5" style={{ color: C.t3 }}>{o.medidos}/{o.total_taticos} medidos</span>
                </td>
                {colunas.map(col => {
                  const v = valorNaColuna(o, col);
                  return (
                    <td key={col.key} className="p-2.5 text-center">
                      <span className="text-sm font-bold" style={{ color: corPct(v != null ? Number(v) : null) }}>
                        {v == null ? '—' : `${fmt(v)}%`}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10.5px] mt-1.5" style={{ color: C.t3 }}>
        % da meta médio dos KPIs medidos de cada objetivo, mês a mês (histórico real do sistema contra a meta normalizada atual). Coluna "(atual)" = mês corrente.
      </p>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Modal de UM dos 9 OKRs (clique no card): gráficos mensais dos táticos com
// série viva + evolução do OKR entre os retratos das reuniões. Read-only.
function OkrDetalheModal({ okr, blocoArea, metricas, reunioes, onClose }) {
  const topo = valorTopoOkr(okr, metricas);

  const serieRetratos = useMemo(() => (
    reunioes
      .filter(m => m.snapshot && m.date)
      .sort((a, b) => (a.date > b.date ? 1 : -1))
      .map(m => {
        const hit = (m.snapshot.indicadores || []).find(i => i.nivel === 'okr' && i.nome === okr.nome);
        return { data: fmtData(m.date).slice(0, 5), dataFull: fmtData(m.date), valor: hit && hit.valor != null ? Number(hit.valor) : null };
      })
      .filter(p => p.valor != null)
  ), [reunioes, okr]);

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: C.overlay, zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', overflowY: 'auto', padding: 16 }}>
      <div style={{ background: C.modalBg, border: `1px solid ${C.border}`, borderRadius: 14, width: '100%', maxWidth: 760, margin: '24px 0' }}>
        <div className="flex items-start justify-between gap-3 p-4" style={{ borderBottom: `1px solid ${C.border}` }}>
          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-extrabold uppercase tracking-widest px-2 py-0.5 rounded-full" style={{ background: C.primaryBg, color: C.primary }}>{blocoArea}</span>
            <div className="font-semibold text-lg mt-1.5" style={{ color: C.text }}>{okr.nome}</div>
            <div className="text-xs mt-0.5" style={{ color: C.t3 }}>Alvo: <b style={{ color: C.t2 }}>{okr.alvo}</b>{okr.envolvida ? ` · ${okr.envolvida}` : ''}</div>
          </div>
          <div className="flex items-start gap-3 flex-shrink-0">
            {topo && (
              <div className="text-right">
                <div className="text-3xl font-extrabold leading-none" style={{ color: topo.cor }}>{fmt(topo.valor, topo.casas)}{topo.unidade}</div>
                <div className="text-[9px] font-bold uppercase tracking-wide mt-1" style={{ color: C.t3 }}>{topo.label}</div>
              </div>
            )}
            <button onClick={onClose} style={{ color: C.t2 }}><XCircle size={20} /></button>
          </div>
        </div>

        <div className="p-4 space-y-4">
          <p className="text-sm leading-relaxed" style={{ color: C.t2 }}>{okr.objetivo}</p>

          {serieRetratos.length >= 2 && (
            <div>
              <div className="text-xs font-bold uppercase tracking-wide mb-1.5" style={{ color: C.primary }}>Evolução entre reuniões (retratos)</div>
              <div className="rounded-lg p-2" style={{ border: `1px solid ${C.border}` }}>
                <div style={{ height: 170 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={serieRetratos} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
                      <XAxis dataKey="data" tick={{ fontSize: 10, fill: C.t3 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: C.t3 }} axisLine={false} tickLine={false} width={36} />
                      <Tooltip
                        contentStyle={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }}
                        labelStyle={{ color: C.t2 }}
                        formatter={(v) => [`${fmt(v)}${topo?.unidade || ''}`, okr.nome]}
                        labelFormatter={(_, payload) => payload?.[0]?.payload?.dataFull || ''}
                      />
                      {okr.alvoNum != null && <ReferenceLine y={okr.alvoNum} stroke={C.t3} strokeDasharray="4 3" />}
                      <Line type="monotone" dataKey="valor" stroke={C.primary} strokeWidth={2.5} dot={{ r: 4, fill: C.primary }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          <div>
            <div className="text-xs font-bold uppercase tracking-wide mb-1.5" style={{ color: C.primary }}>Indicadores táticos</div>
            <div className="space-y-2">
              {okr.taticos.map(t => <TaticoDetalheModal key={t.ind} t={t} metricas={metricas} />)}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 p-4" style={{ borderTop: `1px solid ${C.border}` }}>
          <button onClick={onClose} className="text-sm px-4 py-2 rounded-lg text-white" style={{ background: C.primary }}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

function TaticoDetalheModal({ t, metricas }) {
  const m = valorTatico(t, metricas);
  const aval = m ? avaliar(m.valor, t) : null;
  const corNum = !m ? CINZA : (aval.ok == null ? C.primary : aval.cor);
  const serie = m && Array.isArray(m.serie) && m.serie.length > 0
    ? m.serie.map(s => ({ mes: mesCurto(s.mes), valor: s.valor }))
    : null;

  return (
    <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
      <div className="flex items-center gap-2 p-2.5" style={{ background: C.inputBg }}>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold leading-snug" style={{ color: C.text }}>{t.ind}</div>
          <div className="text-[10.5px]" style={{ color: C.t3 }}>Alvo: {t.alvo}</div>
        </div>
        <div className="text-lg font-extrabold flex-shrink-0" style={{ color: corNum }}>
          {m ? `${fmt(m.valor, t.casas)}${m.unidade}` : '—'}
        </div>
      </div>
      {serie ? (
        <div className="p-2" style={{ height: 150 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={serie} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
              <XAxis dataKey="mes" tick={{ fontSize: 10, fill: C.t3 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: C.t3 }} axisLine={false} tickLine={false} width={36} allowDecimals={false} />
              <Tooltip
                cursor={{ fill: C.inputBg }}
                contentStyle={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: C.t2 }}
                formatter={(v) => [`${fmt(v)}${m?.unidade || ''}`, 'valor']}
              />
              {t.alvoNum != null && <ReferenceLine y={t.alvoNum} stroke={C.t3} strokeDasharray="4 3" />}
              <Bar dataKey="valor" fill={corNum} radius={[3, 3, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="text-xs p-2.5" style={{ color: C.t3 }}>
          {m?.detalhe
            ? m.detalhe
            : m
              ? 'Sem série mensal ainda — este indicador mostra o número oficial/atual.'
              : t.precisa
                ? `Para puxar automático, preciso de: ${t.precisa}`
                : 'Sem fonte de dado ainda.'}
        </p>
      )}
    </div>
  );
}
