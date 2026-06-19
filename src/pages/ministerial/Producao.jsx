// ============================================================================
// Produção de Culto — aba da área de Produção
// ============================================================================
// Espelha a Integração: semana de cultos + preenchimento por culto.
// Sub-abas:
//   - Preenchimento (semana · calendário + modal com cronograma por etapas)
//   - Acumulado (totais do período · previsto × executado · aderência)
//   - Detalhado (por tipo de culto + estouro por etapa)
//   - Modelos (roteiro do culto + duração-alvo + checklist · admin nível 3)
//   - Solicitações (fila da Produção · andamento direto)
//   - Desempenho (KPIs próprios + SLA + NPS vs outras áreas criativas)
//
// Cronograma (2026-06-16): a equipe lança o tempo POR MOMENTO (mm:ss) e a soma
// dos executados é o tempo do culto — como na planilha "Cronograma Culto".
// "Previsto" vem do roteiro padrão; "Executado" a equipe preenche.
// ============================================================================

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Calendar, ChevronLeft, ChevronRight, CheckCircle2, AlertCircle, X, Save,
  Clock, ShieldAlert, ListChecks, FileText, Plus, Trash2,
  Inbox, Gauge, Activity,
} from 'lucide-react';
import { toast } from 'sonner';
import { producao as prodApi, solicitacoes as solicApi } from '../../api';
import { formatErro } from '../../lib/formatErro';
import useConfirmarSaida from '../../hooks/useConfirmarSaida';

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', text: 'var(--cbrio-text)',
  t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)', border: 'var(--cbrio-border)',
  inputBg: 'var(--cbrio-input-bg)', modalBg: 'var(--cbrio-modal-bg)', overlay: 'var(--cbrio-overlay)',
  primary: '#6366F1', primaryBg: '#6366F118', // indigo · cor da área Produção (voluntariado seed)
};
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const MESES_CURTO = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const DIAS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

function pad(n) { return String(n).padStart(2, '0'); }
function toISO(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function inicioSemana(d) {
  const c = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = c.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  c.setDate(c.getDate() + diff);
  return c;
}
function getISOWeek(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  return 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 864e5));
}
function rangeSemana(segunda) {
  const fim = new Date(segunda); fim.setDate(fim.getDate() + 6);
  return { inicio: toISO(segunda), fim: toISO(fim) };
}
function diasDaSemana(segunda) {
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(segunda); d.setDate(d.getDate() + i); return d; });
}
function mesmoDia(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
function formataDataCurta(dataStr) {
  const [y, m, d] = dataStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return { dia: dt.getDate(), diaSemana: DIAS[dt.getDay()] };
}

// ── Tempo mm:ss ↔ segundos ────────────────────────────────────────────────────
const rid = () => Math.random().toString(36).slice(2, 9);
function fmtMMSS(seg) {
  if (seg == null || seg === '' || Number.isNaN(Number(seg))) return '';
  const s = Math.max(0, Math.round(Number(seg)));
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
}
function fmtMMSSdash(seg) { return seg == null ? '—' : fmtMMSS(seg); }
function fmtDesvio(seg) {
  if (seg == null) return '—';
  const sinal = seg > 0 ? '+' : seg < 0 ? '−' : '';
  return `${sinal}${fmtMMSS(Math.abs(seg))}`;
}
// Máscara mm:ss preenchendo da DIREITA (estilo app de banco): os 2 últimos
// dígitos são sempre os segundos. Só dígitos, no máximo 4.
// Ex.: "100" → "1:00" · "545" → "5:45" · "5" → "0:05" · "3000" → "30:00".
function maskMMSS(raw) {
  const d = String(raw || '').replace(/\D/g, '').slice(0, 4);
  if (!d) return '';
  const p = d.padStart(3, '0');
  return `${parseInt(p.slice(0, -2), 10)}:${p.slice(-2)}`;
}
// "5:45" → 345 · "0:30" → 30 · número puro = minutos ("30" → 1800, "5.5" → 330)
function parseMMSS(str) {
  if (str == null) return null;
  const s = String(str).trim();
  if (!s) return null;
  if (s.includes(':')) {
    const [mm, ss] = s.split(':');
    const m = parseInt(mm, 10) || 0;
    const sec = parseInt(ss, 10) || 0;
    if (m < 0 || sec < 0) return null;
    return m * 60 + sec;
  }
  const n = parseFloat(s.replace(',', '.'));
  if (Number.isNaN(n) || n < 0) return null;
  return Math.round(n * 60);
}
// soma { exec, prev } (seg) de uma seção das etapas · null se não há valor
function somaSecao(etapas, secao) {
  let exec = 0, hasE = false, prev = 0, hasP = false;
  for (const e of etapas) {
    if ((e.secao || 'culto') !== secao) continue;
    const x = parseMMSS(e.executado_str); if (x != null) { exec += x; hasE = true; }
    const p = parseMMSS(e.previsto_str); if (p != null) { prev += p; hasP = true; }
  }
  return { exec: hasE ? exec : null, prev: hasP ? prev : null };
}
function serializeEtapas(etapas) {
  return JSON.stringify((etapas || []).map(e => ({ t: e.titulo, p: e.previsto_str, x: e.executado_str, o: e.observacao, s: e.secao, ti: e.tipo, c: e.categoria_especial })));
}

const ABAS = [
  { key: 'semana',       label: 'Preenchimento', icon: Calendar },
  { key: 'detalhado',    label: 'Detalhado',     icon: Activity },
  { key: 'checklists',   label: 'Modelos',       icon: ListChecks },
  { key: 'solicitacoes', label: 'Solicitações',  icon: Inbox },
  { key: 'desempenho',   label: 'Desempenho',    icon: Gauge },
];

export default function Producao() {
  const [aba, setAba] = useState('semana');
  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: '0 auto' }}>
      <header style={{ marginBottom: 16, borderLeft: `4px solid ${C.primary}`, paddingLeft: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: C.text }}>Produção de Culto</h1>
        <p style={{ fontSize: 13, color: C.t3, margin: '4px 0 0' }}>
          Cronograma e indicadores técnicos por culto · solicitações da Produção · desempenho da área
        </p>
      </header>

      <nav style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${C.border}`, marginBottom: 18, flexWrap: 'wrap' }}>
        {ABAS.map(t => {
          const sel = aba === t.key; const Icon = t.icon;
          return (
            <button key={t.key} onClick={() => setAba(t.key)} style={{
              padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              background: 'none', border: 'none', borderBottom: `2px solid ${sel ? C.primary : 'transparent'}`,
              color: sel ? C.primary : C.t2, display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
      </nav>

      {aba === 'semana'       && <AbaSemana />}
      {aba === 'detalhado'    && <AbaDetalhado />}
      {aba === 'checklists'   && <AbaModelos />}
      {aba === 'solicitacoes' && <AbaSolicitacoes />}
      {aba === 'desempenho'   && <AbaDesempenho />}
    </div>
  );
}

// ── Aba Preenchimento (semana) ───────────────────────────────────────────────
function AbaSemana() {
  const hoje = new Date();
  // Abre na semana atual por padrão (setas navegam pra semanas anteriores).
  const [semanaInicio, setSemanaInicio] = useState(() => inicioSemana(hoje));
  const [cultos, setCultos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState(null);

  const dias = useMemo(() => diasDaSemana(semanaInicio), [semanaInicio]);
  const ehSemanaAtual = mesmoDia(semanaInicio, inicioSemana(hoje));

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const { inicio, fim } = rangeSemana(semanaInicio);
      const data = await prodApi.semana(inicio, fim);
      setCultos(Array.isArray(data) ? data : []);
    } catch (e) { toast.error(formatErro(e, 'produção')); setCultos([]); }
    finally { setLoading(false); }
  }, [semanaInicio]);
  useEffect(() => { carregar(); }, [carregar]);

  const irSemana = (delta) => { const n = new Date(semanaInicio); n.setDate(n.getDate() + delta * 7); setSemanaInicio(n); };
  const voltarHoje = () => setSemanaInicio(inicioSemana(new Date()));

  const ultimoDia = dias[6];
  const labelDatas = semanaInicio.getMonth() === ultimoDia.getMonth()
    ? `${semanaInicio.getDate()} – ${ultimoDia.getDate()} ${MESES[semanaInicio.getMonth()]} ${semanaInicio.getFullYear()}`
    : `${semanaInicio.getDate()} ${MESES_CURTO[semanaInicio.getMonth()]} – ${ultimoDia.getDate()} ${MESES_CURTO[ultimoDia.getMonth()]} ${ultimoDia.getFullYear()}`;

  const porDia = useMemo(() => {
    const map = new Map();
    dias.forEach(d => map.set(toISO(d), []));
    cultos.forEach(c => { if (map.has(c.data)) map.get(c.data).push(c); });
    for (const arr of map.values()) arr.sort((a, b) => (a.hora || '').localeCompare(b.hora || ''));
    return map;
  }, [dias, cultos]);

  const { preenchidos, pendentes } = useMemo(() => {
    let p = 0, n = 0; cultos.forEach(c => c.producao_preenchido ? p++ : n++); return { preenchidos: p, pendentes: n };
  }, [cultos]);

  return (
    <section>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: 0.6 }}>
          <Calendar size={11} style={{ color: C.primary }} /> Cultos da semana
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => irSemana(-1)} style={btnNav}><ChevronLeft size={14} /></button>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, minWidth: 200, textAlign: 'center' }}>
            Semana {getISOWeek(semanaInicio)} · {labelDatas}
          </div>
          <button onClick={() => irSemana(1)} style={btnNav}><ChevronRight size={14} /></button>
          {!ehSemanaAtual && <button onClick={voltarHoje} style={{ ...btnNav, padding: '6px 12px', fontSize: 11, fontWeight: 600, color: C.primary, borderColor: C.primary }}>Hoje</button>}
        </div>
      </header>

      {!loading && cultos.length > 0 && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 10, fontSize: 11, color: C.t3 }}>
          <span><strong style={{ color: '#10B981' }}>{preenchidos}</strong> preenchidos</span>
          <span><strong style={{ color: '#F59E0B' }}>{pendentes}</strong> pendentes</span>
        </div>
      )}

      {loading ? (
        <div style={loadingBox}>Carregando cultos da semana…</div>
      ) : (
        <div style={{ overflowX: 'auto', marginLeft: -4, marginRight: -4, paddingLeft: 4, paddingRight: 4 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(100px, 1fr))', gap: 6 }}>
            {dias.map(d => {
              const iso = toISO(d); const arr = porDia.get(iso) || [];
              const ehHoje = mesmoDia(d, hoje); const ehFds = d.getDay() === 0 || d.getDay() === 6;
              return (
                <div key={iso} style={{ background: ehHoje ? C.primaryBg : C.card, border: `1px solid ${ehHoje ? C.primary : C.border}`, borderRadius: 8, padding: 8, minHeight: 140, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ textAlign: 'center', borderBottom: `1px dashed ${C.border}`, paddingBottom: 6 }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: ehHoje ? C.primary : C.t3, textTransform: 'uppercase' }}>{DIAS[d.getDay()]}</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: ehHoje ? C.primary : C.text, lineHeight: 1 }}>{d.getDate()}</div>
                  </div>
                  {arr.length === 0 ? (
                    <div style={{ fontSize: 10, color: C.t3, textAlign: 'center', padding: 14, fontStyle: 'italic' }}>{ehFds || d.getDay() === 3 ? '—' : 'sem culto'}</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {arr.map(c => <MiniCard key={c.id} culto={c} onClick={() => setEditando(c)} />)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {editando && <ModalProducao culto={editando} onClose={() => setEditando(null)} onSaved={() => { setEditando(null); carregar(); }} />}
    </section>
  );
}

function MiniCard({ culto, onClick }) {
  const ok = culto.producao_preenchido;
  const cor = culto.service_type_color || C.primary;
  const dur = culto.producao?.duracao_minutos;
  const prev = culto.producao?.duracao_prevista_min;
  const meta = culto.producao?.meta_duracao_min ?? 60;
  const atrasou = dur != null && dur > meta;
  const ocorr = (culto.ocorrencias?.tecnica || 0) + (culto.ocorrencias?.estrutura || 0);
  return (
    <button onClick={onClick} style={{
      textAlign: 'left', padding: '6px 8px', borderRadius: 6, cursor: 'pointer',
      background: ok ? `${cor}10` : C.inputBg, border: `1px solid ${ok ? cor : C.border}`, borderLeft: `3px solid ${cor}`,
      display: 'flex', flexDirection: 'column', gap: 2,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: cor }}>{culto.hora?.slice(0, 5) || '--:--'}</span>
        {ok ? <CheckCircle2 size={11} style={{ color: '#10B981' }} /> : <AlertCircle size={11} style={{ color: '#F59E0B' }} />}
      </div>
      <span style={{ fontSize: 10, color: C.text, fontWeight: 600, lineHeight: 1.2 }}>{culto.service_type_name || culto.nome}</span>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 1 }}>
        {dur != null && <span style={{ fontSize: 9, color: atrasou ? '#EF4444' : C.t3 }}>{dur}min{prev != null ? <span style={{ color: C.t3 }}>/{prev}</span> : ''}</span>}
        {(culto.checklist?.total || 0) > 0 && <span style={{ fontSize: 9, color: C.t3 }}>· {culto.checklist.feitos}/{culto.checklist.total} ✓</span>}
        {ocorr > 0 && <span style={{ fontSize: 9, color: '#EF4444' }}>· {ocorr} ⚠</span>}
      </div>
    </button>
  );
}

// ── Editor de etapas (cronograma · momentos do culto) ─────────────────────────
const CATS_ESP = [
  { v: 'ceia', label: 'Ceia' },
  { v: 'batismo', label: 'Batismo' },
  { v: 'apresentacao_bebes', label: 'Apresentação de bebês' },
  { v: 'outros', label: 'Outros' },
];
const labelCatEsp = (v) => (CATS_ESP.find(c => c.v === v)?.label) || 'Especial';

function EtapasEditor({ etapas, setEtapas }) {
  const setRow = (key, patch) => setEtapas(arr => arr.map(e => e.key === key ? { ...e, ...patch } : e));
  const removeRow = (key) => setEtapas(arr => arr.filter(e => e.key !== key));
  const [novaEsp, setNovaEsp] = useState(null); // { categoria, nome, executado_str, aposKey }

  const culto = somaSecao(etapas, 'culto');     // inclui as especiais (estão na seção culto)
  const pos = somaSecao(etapas, 'pos_culto');
  const estourouCulto = culto.exec != null && culto.prev != null && culto.exec > culto.prev;
  const especiais = etapas.filter(e => e.tipo === 'especial');
  const ancoras = etapas.filter(e => (e.secao || 'culto') === 'culto'); // pra "entrou após"

  const colGrid = '22px 1fr 54px 54px minmax(72px,1fr) 22px';

  let nStd = 0;
  const linhas = etapas.map(e => {
    const ehPos = (e.secao || 'culto') === 'pos_culto';
    const ehEsp = e.tipo === 'especial';
    const num = ehPos ? '·' : ehEsp ? '★' : (++nStd);
    return { e, ehPos, ehEsp, num };
  });

  const adicionarEspecial = () => {
    const cat = novaEsp.categoria;
    const nome = (novaEsp.nome || '').trim() || labelCatEsp(cat);
    const nova = { key: rid(), titulo: nome, previsto_str: '', executado_str: novaEsp.executado_str || '', observacao: '', secao: 'culto', tipo: 'especial', categoria_especial: cat };
    setEtapas(arr => {
      const copy = [...arr];
      if (novaEsp.aposKey === '__inicio__') { copy.unshift(nova); return copy; }
      const idx = copy.findIndex(x => x.key === novaEsp.aposKey);
      if (idx < 0) {
        const posIdx = copy.findIndex(x => (x.secao || 'culto') === 'pos_culto');
        if (posIdx < 0) copy.push(nova); else copy.splice(posIdx, 0, nova);
      } else copy.splice(idx + 1, 0, nova);
      return copy;
    });
    setNovaEsp(null);
  };

  return (
    <div>
      <p style={{ fontSize: 11, color: C.t3, margin: '0 0 8px' }}>
        Lance o <strong>tempo executado</strong> de cada momento em <strong>mm:ss</strong> (ex.: 5:45). Nomes e previsto seguem o roteiro (aba “Modelos”). Use <strong>+ Atividade especial</strong> pra registrar ceia, batismo, etc.
      </p>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 400 }}>
          {/* cabeçalho */}
          <div style={{ display: 'grid', gridTemplateColumns: colGrid, gap: 6, padding: '0 2px 4px', fontSize: 9, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: 0.4 }}>
            <span>#</span><span>Momento</span><span style={{ textAlign: 'center' }}>Prev.</span><span style={{ textAlign: 'center' }}>Exec.</span><span>Obs.</span><span />
          </div>
          {etapas.length === 0 && (
            <div style={{ fontSize: 11, color: C.t3, fontStyle: 'italic', padding: '8px 2px' }}>
              Nenhum momento no roteiro. Configure o roteiro na aba “Modelos”.
            </div>
          )}
          {linhas.map(({ e, ehPos, ehEsp, num }, i) => {
            const exSeg = parseMMSS(e.executado_str);
            const prSeg = parseMMSS(e.previsto_str);
            const estourouEtapa = !ehEsp && exSeg != null && prSeg != null && exSeg > prSeg;
            const bg = ehEsp ? '#F59E0B14' : ehPos ? `${C.primary}08` : 'transparent';
            return (
              <div key={e.key} style={{ display: 'grid', gridTemplateColumns: colGrid, gap: 6, alignItems: 'center', padding: '3px 2px', borderTop: i === 0 ? 'none' : `1px dashed ${C.border}`, background: bg }}>
                <span style={{ fontSize: 10, color: ehEsp ? '#B45309' : C.t3, textAlign: 'center' }}>{num}</span>
                {ehEsp ? (
                  <input value={e.titulo} onChange={ev => setRow(e.key, { titulo: ev.target.value })} placeholder="Atividade especial" title={`Atividade especial · ${labelCatEsp(e.categoria_especial)}`} style={{ ...inpSm, padding: '4px 6px' }} />
                ) : (
                  <span style={{ fontSize: 12, color: C.text, fontWeight: 600, lineHeight: 1.2 }}>{e.titulo}{ehPos && <span style={{ fontSize: 8, color: C.t3, fontWeight: 700, marginLeft: 5 }}>PÓS</span>}</span>
                )}
                <span style={{ fontSize: 11, color: C.t3, textAlign: 'center' }}>{ehEsp ? '—' : fmtMMSSdash(prSeg)}</span>
                <input value={e.executado_str} onChange={ev => setRow(e.key, { executado_str: maskMMSS(ev.target.value) })} inputMode="numeric" maxLength={5} placeholder="mm:ss" style={{ ...inpSm, textAlign: 'center', color: estourouEtapa ? '#EF4444' : C.text, fontWeight: 600 }} />
                <input value={e.observacao} onChange={ev => setRow(e.key, { observacao: ev.target.value })} placeholder={ehEsp ? 'obs' : 'ex.: pregador'} style={{ ...inpSm }} />
                {ehEsp
                  ? <button onClick={() => removeRow(e.key)} title="Remover atividade especial" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', padding: 2, justifySelf: 'center' }}><Trash2 size={12} /></button>
                  : <span />}
              </div>
            );
          })}
        </div>
      </div>

      {/* adicionar atividade especial */}
      {!novaEsp ? (
        <button onClick={() => setNovaEsp({ categoria: 'ceia', nome: '', executado_str: '', aposKey: ancoras.length ? ancoras[ancoras.length - 1].key : '__inicio__' })} style={{ ...chip, marginTop: 8, color: '#B45309', borderColor: '#F59E0B66' }}>
          <Plus size={11} /> Atividade especial
        </button>
      ) : (
        <div style={{ marginTop: 8, padding: 10, background: '#F59E0B0E', border: '1px solid #F59E0B44', borderRadius: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#B45309', marginBottom: 6 }}>Nova atividade especial</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <select value={novaEsp.categoria} onChange={ev => setNovaEsp(s => ({ ...s, categoria: ev.target.value }))} style={{ ...inpSm, width: 'auto' }}>
              {CATS_ESP.map(c => <option key={c.v} value={c.v}>{c.label}</option>)}
            </select>
            {novaEsp.categoria === 'outros' && (
              <input value={novaEsp.nome} onChange={ev => setNovaEsp(s => ({ ...s, nome: ev.target.value }))} placeholder="Qual atividade?" style={{ ...inpSm, width: 140 }} />
            )}
            <input value={novaEsp.executado_str} onChange={ev => setNovaEsp(s => ({ ...s, executado_str: maskMMSS(ev.target.value) }))} inputMode="numeric" maxLength={5} placeholder="mm:ss" style={{ ...inpSm, width: 64, textAlign: 'center' }} />
            <span style={{ fontSize: 11, color: C.t3 }}>após:</span>
            <select value={novaEsp.aposKey} onChange={ev => setNovaEsp(s => ({ ...s, aposKey: ev.target.value }))} style={{ ...inpSm, width: 'auto' }}>
              <option value="__inicio__">(início do culto)</option>
              {ancoras.map(a => <option key={a.key} value={a.key}>{a.titulo}</option>)}
            </select>
            <button onClick={adicionarEspecial} style={{ ...btnPrimary, background: '#F59E0B', padding: '6px 12px' }}><Plus size={12} /> Adicionar</button>
            <button onClick={() => setNovaEsp(null)} style={{ ...btnGhost, padding: '6px 12px' }}>Cancelar</button>
          </div>
        </div>
      )}

      {/* somatório · culto e pós-culto SEPARADOS (não somam) */}
      <div style={{ marginTop: 10, padding: 10, background: C.inputBg, borderRadius: 8, fontSize: 12, display: 'flex', flexDirection: 'column', gap: 5 }}>
        <LinhaSoma label="Tempo de culto" exec={culto.exec} prev={culto.prev} corExec={estourouCulto ? '#EF4444' : C.text} bold />
        {especiais.length > 0 && (
          <div style={{ fontSize: 10, color: '#B45309', paddingLeft: 2 }}>
            ↳ inclui especiais: {especiais.map(e => `${labelCatEsp(e.categoria_especial)} ${fmtMMSSdash(parseMMSS(e.executado_str))}`).join(' · ')}
          </div>
        )}
        <LinhaSoma label="Tempo de pós-culto" exec={pos.exec} prev={pos.prev} />
      </div>
    </div>
  );
}
function LinhaSoma({ label, exec, prev, corExec, bold }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, fontWeight: bold ? 700 : 500 }}>
      <span style={{ color: C.t2 }}>{label}</span>
      <span>
        <span style={{ color: corExec || C.text, fontWeight: 700 }}>{fmtMMSSdash(exec)}</span>
        <span style={{ color: C.t3, fontSize: 11 }}> / prev {fmtMMSSdash(prev)}</span>
      </span>
    </div>
  );
}
// Barra de duração média · cor verde (dentro do alvo) / vermelha (passou) +
// marcador vertical no alvo. Mostra na hora se o culto extrapola o tempo.
function BarraImpacto({ label, min, alvo, max }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
      <span style={{ fontSize: 11, color: C.t2, width: 132, flexShrink: 0 }}>{label}</span>
      {min == null ? (
        <span style={{ fontSize: 11, color: C.t3 }}>—</span>
      ) : (() => {
        const cor = min > alvo ? '#EF4444' : '#10B981';
        const w = `${Math.max(2, Math.round((min / (max || 1)) * 100))}%`;
        const markPos = `${Math.round((alvo / (max || 1)) * 100)}%`;
        return (
          <>
            <div style={{ flex: 1, position: 'relative', height: 16, background: C.inputBg, borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ width: w, height: '100%', background: cor, opacity: 0.85 }} />
              <div style={{ position: 'absolute', left: markPos, top: 0, bottom: 0, width: 2, background: C.text, opacity: 0.5 }} title={`alvo ${alvo} min`} />
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: cor, width: 56, flexShrink: 0, textAlign: 'right' }}>{min} min</span>
          </>
        );
      })()}
    </div>
  );
}

// ── Modal de preenchimento da Produção ───────────────────────────────────────
function ModalProducao({ culto, onClose, onSaved }) {
  const [det, setDet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [etapas, setEtapas] = useState([]);
  const [form, setForm] = useState({ pontualidade_obs: '', observacoes: '' });
  const [marks, setMarks] = useState({}); // item_id -> {feito, observação}
  const [novaOcorr, setNovaOcorr] = useState({ tipo: 'tecnica', severidade: 'media', momento: '', descricao: '' });
  const inicialRef = useRef(null); // snapshot do estado carregado · detecta alterações não salvas

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const d = await prodApi.culto(culto.id);
      setDet(d);
      const formInicial = {
        pontualidade_obs: d.producao?.pontualidade_obs ?? '',
        observacoes: d.producao?.observacoes ?? '',
      };
      setForm(formInicial);
      // etapas do culto, ou pré-carrega do roteiro padrão se ainda não houver
      const base = (d.etapas && d.etapas.length)
        ? d.etapas.map(e => ({ key: rid(), titulo: e.titulo || '', previsto_str: fmtMMSS(e.previsto_seg), executado_str: fmtMMSS(e.executado_seg), observacao: e.observacao || '', secao: e.secao || 'culto', tipo: e.tipo || 'padrao', categoria_especial: e.categoria_especial || null }))
        : (d.roteiro || []).map(r => ({ key: rid(), titulo: r.titulo || '', previsto_str: fmtMMSS(r.previsto_seg), executado_str: '', observacao: '', secao: r.secao || 'culto', tipo: 'padrao', categoria_especial: null }));
      // pós-culto sempre por último (sort estável preserva a ordem dentro de cada seção)
      base.sort((a, b) => (a.secao === 'pos_culto' ? 1 : 0) - (b.secao === 'pos_culto' ? 1 : 0));
      setEtapas(base);
      const m = {};
      (d.checklist || []).forEach(it => { m[it.item_id] = { feito: it.feito, observacao: it.observacao || '' }; });
      setMarks(m);
      inicialRef.current = JSON.stringify({ etapas: serializeEtapas(base), form: formInicial, marks: m });
    } catch (e) { toast.error(formatErro(e)); }
    finally { setLoading(false); }
  }, [culto.id]);
  useEffect(() => { carregar(); }, [carregar]);

  const temAlteracoes =
    (inicialRef.current !== null && JSON.stringify({ etapas: serializeEtapas(etapas), form, marks }) !== inicialRef.current) ||
    novaOcorr.descricao.trim() !== '' || novaOcorr.momento.trim() !== '';
  const { tentarFechar, backdropProps } = useConfirmarSaida(temAlteracoes, onClose);

  const addOcorrencia = async () => {
    if (!novaOcorr.descricao.trim() || novaOcorr.descricao.trim().length < 3) {
      toast.error('Descreva a ocorrência (o rastro do erro)'); return;
    }
    try {
      await prodApi.addOcorrencia(culto.id, novaOcorr);
      setNovaOcorr({ tipo: 'tecnica', severidade: 'media', momento: '', descricao: '' });
      const d = await prodApi.culto(culto.id); setDet(d);
      toast.success('Ocorrência registrada');
    } catch (e) { toast.error(formatErro(e)); }
  };
  const removerOcorrencia = async (id) => {
    if (!window.confirm('Remover esta ocorrência?')) return;
    try { await prodApi.removerOcorrencia(id); const d = await prodApi.culto(culto.id); setDet(d); }
    catch (e) { toast.error(formatErro(e)); }
  };

  const submit = async () => {
    setSaving(true);
    try {
      const etapasPayload = etapas
        .filter(e => String(e.titulo || '').trim())
        .map((e, i) => ({
          ordem: i + 1,
          titulo: e.titulo.trim(),
          previsto_seg: parseMMSS(e.previsto_str),
          executado_seg: parseMMSS(e.executado_str),
          observacao: e.observacao?.trim() || null,
          secao: e.secao || 'culto',
          tipo: e.tipo || 'padrao',
          categoria_especial: e.categoria_especial || null,
        }));
      await prodApi.salvarEtapas(culto.id, etapasPayload);
      await prodApi.salvarCulto(culto.id, {
        pontualidade_obs: form.pontualidade_obs?.trim() || null,
        observacoes: form.observacoes?.trim() || null,
      });
      const marksArr = Object.entries(marks).map(([item_id, v]) => ({ item_id, feito: v.feito, observacao: v.observacao }));
      if (marksArr.length) await prodApi.salvarChecklist(culto.id, marksArr);
      toast.success('Produção do culto salva');
      onSaved?.();
    } catch (e) { toast.error(formatErro(e)); }
    finally { setSaving(false); }
  };

  const { dia, diaSemana } = formataDataCurta(culto.data);
  const checklistFeitos = Object.values(marks).filter(m => m.feito).length;
  const checklistTotal = det?.checklist?.length || 0;

  return (
    <div
      {...backdropProps}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: C.overlay, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--panel)', WebkitBackdropFilter: 'blur(18px) saturate(140%)', backdropFilter: 'blur(18px) saturate(140%)', border: '1px solid var(--hairline)', borderRadius: 16, maxWidth: 680, width: '100%', maxHeight: '92vh', overflow: 'auto', boxShadow: 'var(--shadow-hover), var(--hi)' }}>
        <header style={{ padding: 16, borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: C.text }}>{culto.nome || culto.service_type_name}</h2>
            <p style={{ fontSize: 11, color: C.t3, margin: '4px 0 0', textTransform: 'capitalize' }}>
              {diaSemana} · {dia} {MESES[Number(culto.data.split('-')[1]) - 1]} {culto.data.split('-')[0]}
              {culto.hora && <> · {culto.hora.slice(0, 5)}</>}
            </p>
          </div>
          <button onClick={tentarFechar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.t3, padding: 4 }}><X size={18} /></button>
        </header>

        {loading ? <div style={{ ...loadingBox, margin: 16 }}>Carregando…</div> : (
        <div style={{ padding: 16 }}>
          {/* Cronograma · tempo por momento */}
          <SecaoTitulo icone={Clock} cor="#0EA5E9" titulo="Cronograma · tempo por momento" />
          <EtapasEditor etapas={etapas} setEtapas={setEtapas} />
          <div style={{ marginTop: 10, marginBottom: 16 }}>
            <Field label="Observação da pontualidade (opcional, mesmo passando do tempo)">
              <input type="text" value={form.pontualidade_obs} onChange={e => setForm(f => ({ ...f, pontualidade_obs: e.target.value }))} style={inp} placeholder="Ex.: ministração estendida, batismos…" />
            </Field>
          </div>

          {/* Ocorrências */}
          <SecaoTitulo icone={ShieldAlert} cor="#EF4444" titulo="Ocorrências · falhas técnicas e instabilidade" />
          <div style={{ marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {(det?.ocorrencias || []).length === 0 && <div style={{ fontSize: 11, color: C.t3, fontStyle: 'italic' }}>Nenhuma ocorrência registrada neste culto.</div>}
            {(det?.ocorrencias || []).map(o => (
              <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: C.card, border: `1px solid ${C.border}`, borderLeft: `3px solid ${o.tipo === 'tecnica' ? '#EF4444' : '#F59E0B'}`, borderRadius: 4, fontSize: 11 }}>
                <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 99, background: C.inputBg, color: C.t2, fontWeight: 700 }}>{o.tipo === 'tecnica' ? 'TÉCNICA' : 'ESTRUTURA'}</span>
                <span style={{ fontSize: 9, color: sevCor(o.severidade), fontWeight: 700 }}>{o.severidade}</span>
                <span style={{ flex: 1, color: C.text }}>{o.descricao}{o.momento ? ` · ${o.momento}` : ''}</span>
                <button onClick={() => removerOcorrencia(o.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', padding: 2 }}><Trash2 size={12} /></button>
              </div>
            ))}
          </div>
          <div style={{ background: C.inputBg, borderRadius: 8, padding: 10, marginBottom: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
              <select value={novaOcorr.tipo} onChange={e => setNovaOcorr(o => ({ ...o, tipo: e.target.value }))} style={{ ...inp, padding: '6px 8px' }}>
                <option value="tecnica">Falha técnica</option>
                <option value="estrutura">Instabilidade estrutura</option>
              </select>
              <select value={novaOcorr.severidade} onChange={e => setNovaOcorr(o => ({ ...o, severidade: e.target.value }))} style={{ ...inp, padding: '6px 8px' }}>
                <option value="baixa">Baixa</option><option value="media">Média</option>
                <option value="alta">Alta</option><option value="critica">Crítica</option>
              </select>
              <input type="text" value={novaOcorr.momento} onChange={e => setNovaOcorr(o => ({ ...o, momento: e.target.value }))} style={{ ...inp, padding: '6px 8px' }} placeholder="Momento (louvor…)" />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="text" value={novaOcorr.descricao} onChange={e => setNovaOcorr(o => ({ ...o, descricao: e.target.value }))} style={{ ...inp, flex: 1 }} placeholder="Descreva o erro (o rastro) *" onKeyDown={e => { if (e.key === 'Enter') addOcorrencia(); }} />
              <button onClick={addOcorrencia} style={{ ...btnPrimary, background: '#EF4444' }}><Plus size={13} /> Adicionar</button>
            </div>
          </div>

          {/* Checklist */}
          <SecaoTitulo icone={ListChecks} cor="#10B981" titulo={`Checklist técnico · ${checklistFeitos}/${checklistTotal} executados`} />
          {checklistTotal === 0 ? (
            <div style={{ fontSize: 11, color: C.t3, fontStyle: 'italic', marginBottom: 16 }}>
              Nenhum item de checklist cadastrado. Cadastre na aba “Modelos”.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 16 }}>
              {(det?.checklist || []).map(it => {
                const m = marks[it.item_id] || { feito: false, observacao: '' };
                return (
                  <label key={it.item_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: m.feito ? '#10B98110' : C.card, border: `1px solid ${m.feito ? '#10B981' : C.border}`, borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
                    <input type="checkbox" checked={m.feito} onChange={e => setMarks(s => ({ ...s, [it.item_id]: { ...m, feito: e.target.checked } }))} />
                    <span style={{ flex: 1, color: C.text, fontWeight: 600 }}>{it.titulo}{it.descricao && <span style={{ fontWeight: 400, color: C.t3 }}> · {it.descricao}</span>}</span>
                  </label>
                );
              })}
            </div>
          )}

          {/* Observações */}
          <SecaoTitulo icone={FileText} cor="#64748B" titulo="Observações gerais" />
          <textarea value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} rows={3} style={{ ...inp, width: '100%', minHeight: 64, resize: 'vertical' }} placeholder="Notas livres sobre a produção deste culto." />
        </div>
        )}

        <footer style={{ padding: 14, borderTop: `1px solid ${C.border}`, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={tentarFechar} disabled={saving} style={btnGhost}>Cancelar</button>
          <button onClick={submit} disabled={saving || loading} style={{ ...btnPrimary, opacity: (saving || loading) ? 0.5 : 1 }}>
            <Save size={13} /> {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </footer>
      </div>
    </div>
  );
}

// ── Aba Acumulado / Detalhado ─────────────────────────────────────────────────
function AbaDetalhado() {
  const [periodo, setPeriodo] = useState('90');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const hoje = new Date(); const ate = toISO(hoje);
        const d = new Date(hoje); d.setDate(d.getDate() - Number(periodo));
        const res = await prodApi.acumulado({ inicio: toISO(d), fim: ate });
        if (alive) setData(res);
      } catch (e) { toast.error(formatErro(e)); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [periodo]);

  const aderCor = (v) => v == null ? C.primary : v >= 90 ? '#10B981' : v >= 75 ? '#F59E0B' : '#EF4444';

  return (
    <section>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {['30', '90', '180', '365'].map(p => (
          <button key={p} onClick={() => setPeriodo(p)} style={{ ...chip, ...(periodo === p ? chipSel : {}) }}>{p}d</button>
        ))}
      </div>
      {loading ? <div style={loadingBox}>Carregando…</div> : !data ? null : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ overflowX: 'auto' }}>
            <h3 style={subTit}>Por tipo de culto</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ color: C.t3, textAlign: 'left', borderBottom: `1px solid ${C.border}` }}>
                  {['Tipo de culto', 'Cultos', 'Preench.', 'Pontual.', 'Aderência', 'Dur. média', 'Prev. média', 'Checklist', 'Falhas', 'Estrutura'].map(h => <th key={h} style={{ padding: '8px 10px', fontWeight: 700 }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {data.detalhado.map(t => (
                  <tr key={t.tipo} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: '8px 10px', fontWeight: 600, color: C.text }}>{t.tipo}</td>
                    <td style={td}>{t.cultos}</td>
                    <td style={td}>{t.preenchidos}</td>
                    <td style={td}>{t.pontualidade_pct == null ? '—' : `${t.pontualidade_pct}%`}</td>
                    <td style={{ ...td, color: aderCor(t.aderencia_pct) }}>{t.aderencia_pct == null ? '—' : `${t.aderencia_pct}%`}</td>
                    <td style={td}>{t.duracao_media_min == null ? '—' : `${t.duracao_media_min}min`}</td>
                    <td style={td}>{t.duracao_prevista_media_min == null ? '—' : `${t.duracao_prevista_media_min}min`}</td>
                    <td style={td}>{t.checklist_pct == null ? '—' : `${t.checklist_pct}%`}</td>
                    <td style={{ ...td, color: t.falhas_tecnicas > 0 ? '#EF4444' : C.t3 }}>{t.falhas_tecnicas}</td>
                    <td style={{ ...td, color: t.ocorrencias_estrutura > 0 ? '#F59E0B' : C.t3 }}>{t.ocorrencias_estrutura}</td>
                  </tr>
                ))}
                {data.detalhado.length > 0 && (
                  <tr style={{ borderTop: `2px solid ${C.border}`, fontWeight: 700, background: C.inputBg }}>
                    <td style={{ padding: '8px 10px', color: C.text }}>Acumulado geral</td>
                    <td style={td}>{data.totais.cultos_no_periodo}</td>
                    <td style={td}>{data.totais.cultos_preenchidos}</td>
                    <td style={td}>{data.totais.pontualidade_pct == null ? '—' : `${data.totais.pontualidade_pct}%`}</td>
                    <td style={{ ...td, color: aderCor(data.totais.aderencia_pct) }}>{data.totais.aderencia_pct == null ? '—' : `${data.totais.aderencia_pct}%`}</td>
                    <td style={td}>{data.totais.duracao_media_min == null ? '—' : `${data.totais.duracao_media_min}min`}</td>
                    <td style={td}>{data.totais.duracao_prevista_media_min == null ? '—' : `${data.totais.duracao_prevista_media_min}min`}</td>
                    <td style={td}>{data.totais.checklist_pct == null ? '—' : `${data.totais.checklist_pct}%`}</td>
                    <td style={td}>{data.totais.falhas_tecnicas}</td>
                    <td style={td}>{data.totais.ocorrencias_estrutura}</td>
                  </tr>
                )}
                {data.detalhado.length === 0 && <tr><td colSpan={10} style={{ padding: 20, textAlign: 'center', color: C.t3 }}>Sem dados no período.</td></tr>}
              </tbody>
            </table>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <h3 style={subTit}>Estouro por etapa (previsto × executado)</h3>
            <p style={{ fontSize: 12, color: C.t3, margin: '0 0 10px' }}>Onde o tempo mais foge do cronograma. Ordenado pelo maior estouro médio.</p>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ color: C.t3, textAlign: 'left', borderBottom: `1px solid ${C.border}` }}>
                  {['Momento', 'Cultos', 'Previsto', 'Executado', 'Desvio médio', '% que estourou'].map(h => <th key={h} style={{ padding: '8px 10px', fontWeight: 700 }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {(data.por_etapa || []).map(e => (
                  <tr key={e.titulo} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: '8px 10px', fontWeight: 600, color: C.text }}>
                      {e.titulo}{e.secao === 'pos_culto' && <span style={{ fontSize: 9, color: C.t3, fontWeight: 700, marginLeft: 6 }}>PÓS</span>}
                    </td>
                    <td style={td}>{e.ocorrencias}</td>
                    <td style={td}>{fmtMMSSdash(e.previsto_medio_seg)}</td>
                    <td style={td}>{fmtMMSSdash(e.executado_medio_seg)}</td>
                    <td style={{ ...td, color: e.desvio_medio_seg == null ? C.t3 : e.desvio_medio_seg > 0 ? '#EF4444' : e.desvio_medio_seg < 0 ? '#10B981' : C.t2, fontWeight: 600 }}>{fmtDesvio(e.desvio_medio_seg)}</td>
                    <td style={td}>{e.estouro_pct == null ? '—' : `${e.estouro_pct}%`}</td>
                  </tr>
                ))}
                {(data.por_etapa || []).length === 0 && <tr><td colSpan={6} style={{ padding: 20, textAlign: 'center', color: C.t3 }}>Sem etapas lançadas no período.</td></tr>}
              </tbody>
            </table>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <h3 style={subTit}>Atividades especiais (por que o culto passa de 60)</h3>
            <p style={{ fontSize: 12, color: C.t3, margin: '0 0 10px' }}>
              {data.especiais
                ? `${data.especiais.cultos_com_especial} de ${data.especiais.cultos_no_periodo} cultos tiveram atividade especial · rotina (ceia/batismo/apresentação): ${data.especiais.cultos_rotina} · outros: ${data.especiais.cultos_outros}.`
                : ''}
            </p>

            {data.especiais && data.especiais.cultos_com_especial > 0 && (() => {
              const esp = data.especiais;
              const com = esp.duracao_media_com_min, sem = esp.duracao_media_sem_min;
              const ALVO = 60;
              const maxMin = Math.max(com || 0, sem || 0, ALVO, 1);
              const diff = (com != null && sem != null) ? com - sem : null;
              return (
                <div style={{ marginBottom: 16, padding: 12, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10 }}>
                  <div style={{ fontSize: 12, color: C.text, marginBottom: 10 }}>
                    Impacto na duração (médias):{' '}
                    {diff == null ? (
                      <span style={{ color: C.t3 }}>precisa de cultos com e sem atividade especial no período pra comparar.</span>
                    ) : diff < 0 ? (
                      <>cultos <strong>com</strong> atividade especial duram <strong style={{ color: '#10B981' }}>{Math.abs(diff)} min a menos</strong> que os sem.</>
                    ) : diff > 0 ? (
                      <>cultos <strong>com</strong> atividade especial duram <strong style={{ color: '#EF4444' }}>{diff} min a mais</strong> que os sem.</>
                    ) : (
                      <>cultos com e sem atividade especial duram praticamente o mesmo tempo.</>
                    )}
                  </div>
                  <BarraImpacto label="Culto sem especial" min={sem} alvo={ALVO} max={maxMin} />
                  <BarraImpacto label="Culto com especial" min={com} alvo={ALVO} max={maxMin} />
                  <div style={{ fontSize: 10, color: C.t3, marginTop: 8 }}>
                    Verde = dentro do alvo ({ALVO} min) · vermelho = passou do alvo · a linha marca o alvo.
                  </div>
                </div>
              );
            })()}

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ color: C.t3, textAlign: 'left', borderBottom: `1px solid ${C.border}` }}>
                  {['Atividade', 'Tipo', 'Ocorrências', 'Duração', '% do culto'].map(h => <th key={h} style={{ padding: '8px 10px', fontWeight: 700 }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {(data.especiais?.por_categoria || []).map(c => (
                  <tr key={c.categoria} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: '8px 10px', fontWeight: 600, color: C.text }}>{c.label}</td>
                    <td style={{ ...td, color: c.rotina ? C.t2 : '#B45309', fontWeight: c.rotina ? 400 : 700 }}>{c.rotina ? 'Rotina' : 'Outros'}</td>
                    <td style={td}>{c.ocorrencias}</td>
                    <td style={{ ...td, color: C.text, fontWeight: 600 }}>{c.duracao_media_seg == null ? '—' : fmtMMSS(c.duracao_media_seg)}</td>
                    <td style={td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 36, flexShrink: 0 }}>{c.impacto_pct == null ? '—' : `${c.impacto_pct}%`}</span>
                        {c.impacto_pct != null && (
                          <div style={{ flex: 1, minWidth: 40, height: 8, background: C.inputBg, borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ width: `${Math.min(100, c.impacto_pct)}%`, height: '100%', background: '#F59E0B' }} />
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {(data.especiais?.por_categoria || []).length === 0 && <tr><td colSpan={5} style={{ padding: 20, textAlign: 'center', color: C.t3 }}>Nenhuma atividade especial no período.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

// ── Aba Modelos (roteiro + duração-alvo + checklist · admin) ──────────────────
function AbaModelos() {
  const [itens, setItens] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [novo, setNovo] = useState({ titulo: '', descricao: '', service_type_id: '' });
  const [metas, setMetas] = useState({}); // service_type_id -> valor em edição

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [its, sts] = await Promise.all([prodApi.checklistItens.list(), prodApi.serviceTypes()]);
      setItens(its); setTipos(sts);
      const m = {}; (sts || []).forEach(s => { m[s.id] = s.meta_duracao_min ?? 60; });
      setMetas(m);
    } catch (e) { toast.error(formatErro(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const tipoNome = (id) => tipos.find(t => t.id === id)?.name || 'tipo';

  const criar = async () => {
    if (!novo.titulo.trim()) { toast.error('Título obrigatório'); return; }
    try {
      const ordem = (itens.reduce((a, i) => Math.max(a, i.ordem || 0), 0)) + 1;
      await prodApi.checklistItens.create({
        titulo: novo.titulo, descricao: novo.descricao,
        service_type_id: novo.service_type_id || null, ordem,
      });
      setNovo({ titulo: '', descricao: '', service_type_id: '' }); carregar(); toast.success('Item criado');
    } catch (e) { toast.error(formatErro(e)); }
  };
  const toggle = async (it) => { try { await prodApi.checklistItens.update(it.id, { ativo: !it.ativo }); carregar(); } catch (e) { toast.error(formatErro(e)); } };
  const remover = async (id) => { if (!window.confirm('Remover item do checklist?')) return; try { await prodApi.checklistItens.remove(id); carregar(); } catch (e) { toast.error(formatErro(e)); } };
  const salvarMeta = async (id) => {
    try { await prodApi.salvarMetaTipo(id, Number(metas[id])); toast.success('Duração-alvo salva'); }
    catch (e) { toast.error(formatErro(e)); }
  };

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Roteiro do culto (cronograma · Previsto de cada momento) */}
      <RoteiroEditor tipos={tipos} />

      {/* Duração-alvo por tipo de culto (pontualidade) */}
      <div>
        <h3 style={subTit}>Duração-alvo por tipo de culto (pontualidade)</h3>
        <p style={{ fontSize: 12, color: C.t3, margin: '0 0 10px' }}>
          Acima desse tempo o culto conta como “fora do horário”. Padrão 60 min.
        </p>
        {loading ? <div style={loadingBox}>Carregando…</div> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
            {tipos.map(t => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 8 }}>
                <span style={{ flex: 1, fontWeight: 600, color: C.text, fontSize: 13 }}>{t.name}</span>
                <input type="number" min="1" max="600" value={metas[t.id] ?? ''} onChange={e => setMetas(m => ({ ...m, [t.id]: e.target.value }))} style={{ ...inp, width: 70, padding: '6px 8px' }} />
                <span style={{ fontSize: 11, color: C.t3 }}>min</span>
                <button onClick={() => salvarMeta(t.id)} style={{ ...chip, ...chipSel }}>Salvar</button>
              </div>
            ))}
            {tipos.length === 0 && <div style={{ fontSize: 12, color: C.t3, fontStyle: 'italic' }}>Nenhum tipo de culto ativo.</div>}
          </div>
        )}
      </div>

      {/* Itens do checklist técnico */}
      <div>
        <h3 style={subTit}>Itens do checklist técnico</h3>
        <p style={{ fontSize: 12, color: C.t3, margin: '0 0 12px' }}>
          A equipe marca estes itens em cada culto. O “% executado” é derivado deles.
          Itens “gerais” valem para todos os cultos; itens por tipo só aparecem no culto daquele tipo.
        </p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <input type="text" value={novo.titulo} onChange={e => setNovo(n => ({ ...n, titulo: e.target.value }))} style={{ ...inp, flex: 2, minWidth: 160 }} placeholder="Novo item (ex: Áudio testado)" />
          <input type="text" value={novo.descricao} onChange={e => setNovo(n => ({ ...n, descricao: e.target.value }))} style={{ ...inp, flex: 2, minWidth: 140 }} placeholder="Descrição (opcional)" />
          <select value={novo.service_type_id} onChange={e => setNovo(n => ({ ...n, service_type_id: e.target.value }))} style={{ ...inp, flex: 1, minWidth: 130 }}>
            <option value="">Geral (todos)</option>
            {tipos.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <button onClick={criar} style={btnPrimary}><Plus size={13} /> Adicionar</button>
        </div>
        {loading ? <div style={loadingBox}>Carregando…</div> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {itens.map(it => (
              <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, opacity: it.ativo ? 1 : 0.5 }}>
                <span style={{ flex: 1, fontWeight: 600, color: C.text, fontSize: 13 }}>{it.titulo}{it.descricao && <span style={{ fontWeight: 400, color: C.t3, fontSize: 11 }}> · {it.descricao}</span>}</span>
                <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 99, background: C.inputBg, color: it.service_type_id ? C.primary : C.t3, fontWeight: 700 }}>
                  {it.service_type_id ? tipoNome(it.service_type_id) : 'Geral'}
                </span>
                <button onClick={() => toggle(it)} style={{ ...chip, ...(it.ativo ? chipSel : {}) }}>{it.ativo ? 'Ativo' : 'Inativo'}</button>
                <button onClick={() => remover(it.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', padding: 4 }}><Trash2 size={14} /></button>
              </div>
            ))}
            {itens.length === 0 && <div style={{ fontSize: 12, color: C.t3, fontStyle: 'italic' }}>Nenhum item cadastrado ainda.</div>}
          </div>
        )}
      </div>
    </section>
  );
}

// ── Roteiro padrão (cronograma) · admin ───────────────────────────────────────
function RoteiroEditor({ tipos }) {
  const [roteiro, setRoteiro] = useState([]);
  const [loading, setLoading] = useState(true);
  const [escopo, setEscopo] = useState(''); // '' = geral (service_type_id null)
  const [novo, setNovo] = useState({ titulo: '', previsto_str: '', secao: 'culto' });

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const r = await prodApi.roteiroEtapas.list();
      setRoteiro((r || []).map(e => ({ ...e, previsto_str: fmtMMSS(e.previsto_seg) })));
    } catch (e) { toast.error(formatErro(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const filtradas = useMemo(() => roteiro
    .filter(r => escopo === '' ? r.service_type_id == null : r.service_type_id === escopo)
    .sort((a, b) => (a.ordem || 0) - (b.ordem || 0)), [roteiro, escopo]);

  const soma = useMemo(() => {
    const s = { culto: 0, pos: 0 };
    filtradas.forEach(r => { if (r.secao === 'pos_culto') s.pos += (r.previsto_seg || 0); else s.culto += (r.previsto_seg || 0); });
    return s;
  }, [filtradas]);

  const setLocal = (id, patch) => setRoteiro(arr => arr.map(r => r.id === id ? { ...r, ...patch } : r));

  const salvarCampo = async (id, campo, valor) => {
    try { await prodApi.roteiroEtapas.update(id, { [campo]: valor }); }
    catch (e) { toast.error(formatErro(e)); carregar(); }
  };
  const salvarPrevisto = async (r) => {
    const seg = parseMMSS(r.previsto_str) ?? 0;
    setLocal(r.id, { previsto_seg: seg, previsto_str: fmtMMSS(seg) });
    await salvarCampo(r.id, 'previsto_seg', seg);
  };
  const criar = async () => {
    if (!novo.titulo.trim()) { toast.error('Nome do momento obrigatório'); return; }
    try {
      const ordem = (filtradas.reduce((a, r) => Math.max(a, r.ordem || 0), 0)) + 1;
      await prodApi.roteiroEtapas.create({
        titulo: novo.titulo.trim(),
        previsto_seg: parseMMSS(novo.previsto_str) ?? 0,
        service_type_id: escopo || null,
        secao: novo.secao,
        ordem,
      });
      setNovo({ titulo: '', previsto_str: '', secao: 'culto' });
      carregar(); toast.success('Momento adicionado');
    } catch (e) { toast.error(formatErro(e)); }
  };
  const remover = async (id) => {
    if (!window.confirm('Remover este momento do roteiro?')) return;
    try { await prodApi.roteiroEtapas.remove(id); carregar(); } catch (e) { toast.error(formatErro(e)); }
  };

  return (
    <div>
      <h3 style={subTit}>Roteiro do culto (cronograma · tempo previsto)</h3>
      <p style={{ fontSize: 12, color: C.t3, margin: '0 0 10px' }}>
        O “Previsto” de cada momento. Pré-carrega o modal de preenchimento. O “Geral” vale para qualquer tipo sem roteiro próprio.
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: C.t3 }}>Roteiro de:</span>
        <select value={escopo} onChange={e => setEscopo(e.target.value)} style={{ ...inp, width: 'auto', minWidth: 180, padding: '6px 10px' }}>
          <option value="">Geral (todos os tipos)</option>
          {tipos.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <span style={{ fontSize: 11, color: C.t2 }}>
          Tempo previsto: <strong>{fmtMMSS(soma.culto) || '0:00'}</strong>{soma.pos > 0 ? <> · + pós {fmtMMSS(soma.pos)}</> : ''}
        </span>
      </div>

      {loading ? <div style={loadingBox}>Carregando…</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filtradas.map(r => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, opacity: r.ativo ? 1 : 0.5 }}>
              <span style={{ fontSize: 10, color: C.t3, width: 18, textAlign: 'center' }}>{r.ordem}</span>
              <input value={r.titulo} onChange={e => setLocal(r.id, { titulo: e.target.value })} onBlur={e => salvarCampo(r.id, 'titulo', e.target.value.trim())} style={{ ...inp, flex: 1, padding: '6px 8px' }} />
              <input value={r.previsto_str} onChange={e => setLocal(r.id, { previsto_str: maskMMSS(e.target.value) })} onBlur={() => salvarPrevisto(r)} inputMode="numeric" maxLength={5} placeholder="mm:ss" style={{ ...inp, width: 70, padding: '6px 8px', textAlign: 'center' }} />
              <select value={r.secao} onChange={e => { setLocal(r.id, { secao: e.target.value }); salvarCampo(r.id, 'secao', e.target.value); }} style={{ ...inp, width: 'auto', padding: '6px 8px' }}>
                <option value="culto">Culto</option>
                <option value="pos_culto">Pós-culto</option>
              </select>
              <button onClick={() => { setLocal(r.id, { ativo: !r.ativo }); salvarCampo(r.id, 'ativo', !r.ativo); }} style={{ ...chip, ...(r.ativo ? chipSel : {}) }}>{r.ativo ? 'Ativo' : 'Inativo'}</button>
              <button onClick={() => remover(r.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', padding: 4 }}><Trash2 size={14} /></button>
            </div>
          ))}
          {filtradas.length === 0 && <div style={{ fontSize: 12, color: C.t3, fontStyle: 'italic' }}>Nenhum momento neste roteiro. Adicione abaixo.</div>}

          <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <input type="text" value={novo.titulo} onChange={e => setNovo(n => ({ ...n, titulo: e.target.value }))} style={{ ...inp, flex: 2, minWidth: 160 }} placeholder="Novo momento (ex.: Música 1)" />
            <input type="text" value={novo.previsto_str} onChange={e => setNovo(n => ({ ...n, previsto_str: maskMMSS(e.target.value) }))} inputMode="numeric" maxLength={5} style={{ ...inp, width: 80 }} placeholder="mm:ss" />
            <select value={novo.secao} onChange={e => setNovo(n => ({ ...n, secao: e.target.value }))} style={{ ...inp, width: 'auto' }}>
              <option value="culto">Culto</option>
              <option value="pos_culto">Pós-culto</option>
            </select>
            <button onClick={criar} style={btnPrimary}><Plus size={13} /> Adicionar</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Aba Solicitações (fila da Produção · andamento) ───────────────────────────
const STATUS_PROD = ['pendente', 'em_analise', 'em_atendimento', 'aguardando_entrega', 'concluido', 'rejeitado'];
const STATUS_LABEL = {
  pendente: 'Pendente', em_analise: 'Em análise', em_atendimento: 'Em atendimento',
  aguardando_entrega: 'Aguardando entrega', concluido: 'Concluído', rejeitado: 'Rejeitado',
  aguardando_aprovacao_financeira: 'Aprov. financeira', aguardando_aprovacao_origem: 'Aprov. diretor', avaliado: 'Avaliado',
};
function AbaSolicitacoes() {
  const [itens, setItens] = useState([]);
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const data = await solicApi.list({ aba: 'atender' });
      const arr = (Array.isArray(data) ? data : (data?.items || []))
        .filter(s => s.area_responsavel === 'producao');
      setItens(arr);
    } catch (e) { toast.error(formatErro(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const mudarStatus = async (id, status) => {
    try { await solicApi.update(id, { status }); toast.success('Status atualizado'); carregar(); }
    catch (e) { toast.error(formatErro(e)); }
  };

  return (
    <section>
      <p style={{ fontSize: 12, color: C.t3, marginBottom: 12 }}>
        Solicitações direcionadas à Produção. Dê andamento mudando o status. Para o fluxo completo, use o módulo Solicitações.
      </p>
      {loading ? <div style={loadingBox}>Carregando…</div> : itens.length === 0 ? (
        <div style={{ ...loadingBox, color: C.t3 }}>Nenhuma solicitação para a Produção no momento.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {itens.map(s => (
            <div key={s.id} style={{ padding: 12, background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontWeight: 700, color: C.text, fontSize: 13 }}>{s.titulo}</div>
                <div style={{ fontSize: 11, color: C.t3, marginTop: 2 }}>
                  {s.categoria}{s.eh_urgente ? ' · 🚩 urgente' : ''}{s.data_necessaria ? ` · até ${s.data_necessaria}` : ''}
                </div>
              </div>
              <select value={STATUS_PROD.includes(s.status) ? s.status : ''} onChange={e => mudarStatus(s.id, e.target.value)} style={{ ...inp, width: 'auto', padding: '6px 10px' }}>
                {!STATUS_PROD.includes(s.status) && <option value="">{STATUS_LABEL[s.status] || s.status}</option>}
                {STATUS_PROD.map(st => <option key={st} value={st}>{STATUS_LABEL[st]}</option>)}
              </select>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ── Aba Desempenho (KPIs próprios + SLA + NPS comparativo) ────────────────────
function AbaDesempenho() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => { try { setData(await prodApi.desempenho()); } catch (e) { toast.error(formatErro(e)); } finally { setLoading(false); } })();
  }, []);

  if (loading) return <div style={loadingBox}>Carregando…</div>;
  if (!data) return null;
  const fmt = (k) => k?.valor == null ? '—' : `${k.valor}${k.unidade === '%' ? '%' : k.unidade === 'nota' ? '/10' : ''}`;

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div>
        <h3 style={subTit}>Indicadores técnicos por culto (específicos · não cascateiam)</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
          {data.especificos.map(k => (
            <Kpi key={k.id} titulo={k.indicador} valor={fmt(k)} sub={`meta ${k.meta_descricao || '—'} · ${k.periodo || 'sem período'}`} cor={statusCor(k.status)} />
          ))}
        </div>
      </div>
      <div>
        <h3 style={subTit}>SLA das solicitações da Produção</h3>
        <Kpi titulo={data.sla?.indicador || '% atendidas no SLA'} valor={fmt(data.sla)} sub={`meta ${data.sla?.meta_descricao || '≥85%'}`} cor={statusCor(data.sla?.status)} />
      </div>
      <div>
        <h3 style={subTit}>NPS interno · Produção vs outras áreas criativas</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
          {data.nps_comparativo.map(n => (
            <div key={n.area} style={{ position: 'relative', overflow: 'hidden', padding: 14, borderRadius: 16, background: 'var(--panel)', WebkitBackdropFilter: 'blur(14px) saturate(140%)', backdropFilter: 'blur(14px) saturate(140%)', border: '1px solid var(--hairline)', boxShadow: 'var(--shadow), var(--hi)' }}>
              {n.destaque && <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(135deg, ${C.primary}22, transparent 58%)`, pointerEvents: 'none' }} />}
              {n.destaque && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: C.primary, opacity: 0.9 }} />}
              <div style={{ position: 'relative', zIndex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: n.destaque ? C.primary : 'var(--cbrio-text2)' }}>{n.area}{n.destaque ? ' (você)' : ''}</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--cbrio-text)' }}>{n.valor == null ? '—' : `${n.valor}`}<span style={{ fontSize: 13, color: 'var(--cbrio-text2)' }}>/10</span></div>
                <div style={{ fontSize: 10, color: 'var(--cbrio-text2)' }}>{n.periodo || 'sem período'}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Bits compartilhados ───────────────────────────────────────────────────────
function SecaoTitulo({ icone: Icone, cor, titulo }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: cor, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}><Icone size={11} /> {titulo}</div>;
}
function Field({ label, children }) {
  return <div><label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: C.t3, marginBottom: 4 }}>{label}</label>{children}</div>;
}
function Kpi({ titulo, valor, sub, cor }) {
  return (
    <div style={{ position: 'relative', overflow: 'hidden', padding: 14, borderRadius: 16, background: 'var(--panel)', WebkitBackdropFilter: 'blur(14px) saturate(140%)', backdropFilter: 'blur(14px) saturate(140%)', border: '1px solid var(--hairline)', boxShadow: 'var(--shadow), var(--hi)' }}>
      <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(135deg, ${(cor || C.primary)}22, transparent 58%)`, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: cor || C.primary, opacity: 0.9 }} />
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--cbrio-text2)' }}>{titulo}</div>
        <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--cbrio-text)', marginTop: 2 }}>{valor}</div>
        {sub && <div style={{ fontSize: 10, color: 'var(--cbrio-text2)', marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}
function sevCor(s) { return { baixa: '#10B981', media: '#F59E0B', alta: '#EF4444', critica: '#B91C1C' }[s] || C.t3; }
function statusCor(s) { return { no_alvo: '#10B981', atrasado: '#F59E0B', critico: '#EF4444' }[s] || C.primary; }

const inp = { width: '100%', padding: '8px 12px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.inputBg, color: C.text, fontSize: 12, boxSizing: 'border-box', fontFamily: 'inherit' };
const inpSm = { width: '100%', padding: '5px 7px', borderRadius: 5, border: `1px solid ${C.border}`, background: C.inputBg, color: C.text, fontSize: 12, boxSizing: 'border-box', fontFamily: 'inherit' };
const btnNav = { padding: 6, borderRadius: 6, background: C.card, color: C.t2, border: `1px solid ${C.border}`, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' };
const btnPrimary = { padding: '8px 14px', borderRadius: 6, fontSize: 12, fontWeight: 700, background: C.primary, color: '#fff', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' };
const btnGhost = { padding: '8px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, background: 'transparent', color: C.t2, border: `1px solid ${C.border}`, cursor: 'pointer' };
const chip = { padding: '4px 10px', fontSize: 11, fontWeight: 600, borderRadius: 99, cursor: 'pointer', border: `1px solid ${C.border}`, background: 'transparent', color: C.t2, display: 'inline-flex', alignItems: 'center', gap: 4 };
const chipSel = { border: `1px solid ${C.primary}`, background: C.primaryBg, color: C.primary };
const td = { padding: '8px 10px', color: C.t2 };
const subTit = { fontSize: 12, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 10px' };
const loadingBox = { padding: 24, textAlign: 'center', color: C.t3, background: C.card, borderRadius: 10, border: `1px solid ${C.border}` };
