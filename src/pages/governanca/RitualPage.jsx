// ============================================================================
// /governanca/:sigla — página de UM ritual (OKR · DRE · KPI · CC · DE · AG)
// ============================================================================
// Estrutura (desenho travado com o Marcos em 2026-07-06):
//   1. Instruções — o que é a reunião (material institucional dos rituais)
//   2. Próxima reunião — data/status + abrir o detalhe (pauta/docs/ata)
//   3. Painel do ritual — OKR: a cabeça do Juninho (NSM + 9 OKRs em 3 blocos,
//      filtro Ministerial/Criativo/Operações/Todos) com valores vivos; a
//      reunião SÓ LÊ a vitrine (nada volta pro sistema). DRE/KPI/CC: em
//      definição (chegam nas próximas entregas).
//   4. Atas e deliberações anteriores — linha do tempo do período selecionado
//   5. Evolução — gráfico dos retratos (snapshots) salvos a cada reunião
//   + Memória do tema (IA) e pendências em aberto.
//
// O "retrato" congela os números vistos na data da reunião em
// governance_meetings.snapshot (jsonb) — é ele que alimenta o gráfico de
// evolução nos períodos longos (a vitrine calcula sempre "agora", não retroage).
// ============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ChevronDown, Loader2, CalendarDays, Camera, Info, BookOpen,
  ClipboardList, TrendingUp, Gavel,
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { toast } from 'sonner';
import { governanca as gov, painel as painelApi } from '../../api';
import { formatErro } from '../../lib/formatErro';
import { useAuth } from '../../contexts/AuthContext';
import { C, STATUS_MEETING, ymd, fmtData, diaSemana, inputStyle, DetalheReuniao, BlocoMarkdownEditavel } from './compartilhado';
import { RITUAIS, PERIODOS, ESCOPOS_OKR } from './rituais';
import {
  NSM, BLOCOS, avaliar, valorTopoOkr, valorTatico, retratoIndicadores, fmt,
  VERDE, VERMELHO, CINZA,
} from '../../lib/monitoramentoOkrEstrutura';

const COR_RITUAL = { OKR: '#3b82f6', DRE: '#10b981', KPI: '#f59e0b', CC: '#8b5cf6', DE: '#ef4444', AG: '#06b6d4' };

// Rótulos das chaves vivas (pro seletor do gráfico de evolução).
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
  const [pendencias, setPendencias] = useState([]);
  const [memoria, setMemoria] = useState(null);
  const [okrData, setOkrData] = useState(null); // { nsm, metricas } (só sigla OKR)
  const [loading, setLoading] = useState(true);
  const [okrLoading, setOkrLoading] = useState(sigla === 'OKR');
  const [salvandoRetrato, setSalvandoRetrato] = useState(false);
  const [gerandoMemoria, setGerandoMemoria] = useState(false);
  const [openId, setOpenId] = useState(null);

  const tipo = useMemo(() => tipos.find(t => t.sigla === sigla) || null, [tipos, sigla]);
  const cor = tipo?.cor || COR_RITUAL[sigla] || C.primary;
  const hojeStr = ymd(new Date());

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const from = ymd(new Date(Date.now() - periodo * 86400000));
      const to = ymd(new Date(Date.now() + 120 * 86400000)); // inclui as próximas agendadas
      const [tps, mtgs, ana, mem] = await Promise.all([
        gov.types.list(),
        gov.meetings.list({ sigla, from, to }),
        gov.analise(sigla, anoAtual).catch(() => null),
        gov.memoria.get(sigla, anoAtual).catch(() => null),
      ]);
      setTipos(Array.isArray(tps) ? tps : []);
      setReunioes(Array.isArray(mtgs) ? mtgs : []);
      setPendencias(ana?.pendencias_abertas || []);
      setMemoria(mem);
    } catch (e) { toast.error(formatErro(e)); }
    finally { setLoading(false); }
  }, [sigla, periodo, anoAtual]);

  useEffect(() => { carregar(); }, [carregar]);

  // Métricas vivas da cabeça do Juninho (só na reunião de OKR · read-only).
  useEffect(() => {
    if (sigla !== 'OKR') return;
    let ativo = true;
    setOkrLoading(true);
    painelApi.monitoramentoOkr()
      .then(r => { if (ativo) setOkrData(r); })
      .catch(e => toast.error(formatErro(e, 'Monitoramento OKR')))
      .finally(() => { if (ativo) setOkrLoading(false); });
    return () => { ativo = false; };
  }, [sigla]);

  const naoCanceladas = useMemo(() => reunioes.filter(m => m.status !== 'cancelada'), [reunioes]);
  const proxima = useMemo(() => naoCanceladas.find(m => m.date && m.date >= hojeStr) || null, [naoCanceladas, hojeStr]);
  const passadas = useMemo(
    () => naoCanceladas.filter(m => m.date && m.date < hojeStr).sort((a, b) => (a.date < b.date ? 1 : -1)),
    [naoCanceladas, hojeStr]
  );
  // Alvo do retrato: a reunião do ciclo corrente (a mais recente já ocorrida/de hoje; senão a próxima).
  const alvoRetrato = useMemo(() => {
    const passadaRecente = naoCanceladas.filter(m => m.date && m.date <= hojeStr).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    return passadaRecente || proxima || null;
  }, [naoCanceladas, hojeStr, proxima]);

  async function salvarRetrato() {
    if (!alvoRetrato || !okrData || salvandoRetrato) return;
    if (!window.confirm(`Salvar o retrato dos indicadores na reunião de ${fmtData(alvoRetrato.date)}? Ele congela os números de hoje e alimenta o gráfico de evolução.`)) return;
    setSalvandoRetrato(true);
    try {
      const metricas = okrData.metricas || {};
      const snapshot = {
        sigla: 'OKR',
        capturado_em: new Date().toISOString(),
        nsm: okrData.nsm ? {
          percentual: okrData.nsm.percentual, meta: okrData.nsm.meta,
          engajados: okrData.nsm.engajados, totalConvertidos: okrData.nsm.totalConvertidos,
        } : null,
        metricas: Object.fromEntries(Object.entries(metricas).map(([k, v]) => [k, { valor: v.valor, unidade: v.unidade }])),
        indicadores: retratoIndicadores(metricas),
      };
      await gov.meetings.update(alvoRetrato.id, { snapshot });
      toast.success('Retrato salvo na reunião');
      await carregar();
    } catch (e) { toast.error(formatErro(e)); }
    finally { setSalvandoRetrato(false); }
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
      <div className="max-w-5xl">
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
          <button onClick={() => navigate('/governanca?view=agenda')} className="text-sm px-3 py-2 rounded-lg inline-flex items-center gap-1.5"
            style={{ border: `1px solid ${C.border}`, color: C.t2 }}>
            <CalendarDays size={15} /> Gerenciar prazos
          </button>
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
              <div className="text-sm" style={{ color: C.t2 }}>Nenhuma agendada — gere o ciclo do mês na aba Agenda.</div>
            )}
          </div>
          {proxima && (
            <button onClick={() => setOpenId(proxima.id)} className="text-sm px-3 py-2 rounded-lg text-white" style={{ background: cor }}>
              Abrir reunião
            </button>
          )}
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
            loading={okrLoading}
            canEdit={canEdit}
            alvoRetrato={alvoRetrato}
            salvando={salvandoRetrato}
            onSalvarRetrato={salvarRetrato}
          />
        ) : (
          <PainelEmDefinicao sigla={sigla} tipo={tipo} />
        )}

        {/* 5 · Evolução (retratos por reunião) */}
        <EvolucaoRetratos reunioes={naoCanceladas} cor={cor} />

        {/* 4 · Atas e deliberações anteriores */}
        <LinhaDoTempo passadas={passadas} periodo={periodo} cor={cor} onAbrir={setOpenId} />

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

// ────────────────────────────────────────────────────────────────────────
// 3 · Painel da reunião de OKR — a cabeça do Juninho (leitura da vitrine).
function OkrPainel({ escopo, data, loading, canEdit, alvoRetrato, salvando, onSalvarRetrato }) {
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
        </span>
        {canEdit && (
          <button onClick={onSalvarRetrato} disabled={!alvoRetrato || salvando}
            title={alvoRetrato ? `Congela os números de hoje na reunião de ${fmtData(alvoRetrato.date)} (alimenta o gráfico de evolução)` : 'Sem reunião no período pra receber o retrato'}
            className="text-xs px-3 py-2 rounded-lg inline-flex items-center gap-1.5 text-white"
            style={{ background: C.primary, opacity: (!alvoRetrato || salvando) ? 0.55 : 1 }}>
            {salvando ? <Loader2 className="animate-spin" size={13} /> : <Camera size={13} />}
            {salvando ? 'Salvando…' : alvoRetrato ? `Salvar retrato na reunião de ${fmtData(alvoRetrato.date)}` : 'Salvar retrato'}
          </button>
        )}
      </div>

      {/* Blocos */}
      {blocos.map(bloco => (
        <div key={bloco.area} className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-sm font-extrabold" style={{ color: C.text }}>{bloco.area}</h2>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: C.primaryBg, color: C.primary }}>{bloco.papel}</span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3" style={{ gridAutoRows: 'min-content' }}>
            {bloco.okrs.map(okr => <OkrCardCompacto key={okr.nome} okr={okr} metricas={metricas} />)}
          </div>
        </div>
      ))}
    </section>
  );
}

function OkrCardCompacto({ okr, metricas }) {
  const topo = valorTopoOkr(okr, metricas);
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: C.card, border: `1px solid ${C.border}` }}>
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
function PainelEmDefinicao({ sigla, tipo }) {
  const msg = {
    DRE: 'Os números desta reunião serão ligados à versão oficial do DRE gerencial (aguardando o modelo do financeiro).',
    KPI: 'Próxima entrega: os 30 objetivos gerais avaliados como indicadores de processo, com a visão por área de culto.',
    CC: 'Próxima entrega: composição dos relatórios das outras reuniões (o condutor seleciona quais temas leva ao conselho).',
  }[sigla] || tipo?.descricao || 'O painel de dados desta reunião ainda será desenhado.';
  return (
    <div className="rounded-xl p-4 mb-5 flex items-start gap-2.5" style={{ border: `1px dashed ${C.border}`, color: C.t2 }}>
      <Info size={16} style={{ color: C.t3, flexShrink: 0, marginTop: 2 }} />
      <p className="text-sm leading-relaxed">{msg} As atas, deliberações e a memória do tema já funcionam abaixo.</p>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// 5 · Evolução — gráfico dos retratos salvos nas reuniões (períodos longos).
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
// 4 · Atas e deliberações anteriores — linha do tempo do período.
function LinhaDoTempo({ passadas, periodo, cor, onAbrir }) {
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
                  {m.deliberacoes && (
                    <div className="text-sm mt-2 rounded-lg p-2" style={{ background: `${cor}0f`, border: `1px solid ${cor}33`, color: C.t2 }}>
                      <b style={{ color: C.text }}>Deliberações:</b> {m.deliberacoes}
                    </div>
                  )}
                  {m.ata && <p className="text-sm mt-2" style={{ color: C.t2 }}><b style={{ color: C.text }}>Ata:</b> {m.ata}</p>}
                  {!m.ata && !m.deliberacoes && (
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
