// ============================================================================
// Governança — Rituais Mensais de Gestão Estratégica
// ============================================================================
// Home do módulo: os 4 rituais do ciclo executivo do mês (OKR → DRE → KPI →
// Conselho) como quadrados clicáveis (reproduzindo o material institucional),
// cada um levando à página do ritual (/governanca/:sigla) com instruções,
// próxima reunião, atas anteriores, deliberações e relatório do período.
// A aba Agenda gerencia as datas/prazos (ciclo do mês · gerar ano · avulsas);
// a aba Tipos edita o catálogo de reuniões.
// ============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ChevronLeft, ChevronRight, Plus, Loader2, CalendarDays, Settings2, Landmark,
} from 'lucide-react';
import { toast } from 'sonner';
import { governanca as gov } from '../../api';
import { formatErro } from '../../lib/formatErro';
import { useAuth } from '../../contexts/AuthContext';
import {
  C, MESES, STATUS_MEETING, pad, ymd, fmtData, diaSemana, inputStyle,
  DetalheReuniao, NovaReuniaoModal,
} from './compartilhado';
import { RITUAIS, ORDEM_RITUAIS, SEQUENCIA_LOGICA, REGRA_DE_OURO, COMO_CONDUZIMOS } from './rituais';

// Cores institucionais dos rituais (mesmas dos tipos seedados no banco).
const COR_RITUAL = { OKR: '#3b82f6', DRE: '#10b981', KPI: '#f59e0b', CC: '#8b5cf6', DE: '#ef4444', AG: '#06b6d4' };

// ────────────────────────────────────────────────────────────────────────
export default function Governanca() {
  const { getAccessLevel } = useAuth();
  const canEdit = getAccessLevel(['governanca']) >= 3;
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [ref, setRef] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1); });
  const [meetings, setMeetings] = useState([]);
  const [proximas, setProximas] = useState([]); // próximas reuniões (todas as siglas · pros quadrados)
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [criando, setCriando] = useState(false);
  const [gerandoAno, setGerandoAno] = useState(false);
  const view = searchParams.get('view') || 'rituais'; // 'rituais' | 'agenda' | 'tipos'
  const setView = (v) => setSearchParams(v === 'rituais' ? {} : { view: v }, { replace: true });
  const [openId, setOpenId] = useState(null);
  const [novaOpen, setNovaOpen] = useState(false);

  const ano = ref.getFullYear(), mes = ref.getMonth() + 1;
  const from = `${ano}-${pad(mes)}-01`;
  const to = ymd(new Date(ano, mes, 0));

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const hoje = ymd(new Date());
      const [mtgs, tps, prox] = await Promise.all([
        gov.meetings.list({ from, to }),
        gov.types.list(),
        gov.meetings.list({ from: hoje }),
      ]);
      setMeetings(Array.isArray(mtgs) ? mtgs : []);
      setTypes(Array.isArray(tps) ? tps : []);
      setProximas(Array.isArray(prox) ? prox : []);
    } catch (e) { toast.error(formatErro(e)); }
    finally { setLoading(false); }
  }, [from, to]);

  useEffect(() => { carregar(); }, [carregar]);

  async function criarCiclo() {
    if (criando) return;
    setCriando(true);
    try {
      const r = await gov.cycles.create(ano, mes);
      toast.success(r?.reunioes_criadas ? `Ciclo criado · ${r.reunioes_criadas} reuniões geradas` : 'Ciclo do mês pronto');
      await carregar();
    } catch (e) { toast.error(formatErro(e)); }
    finally { setCriando(false); }
  }

  // Gera as reuniões mensais do ano (do próximo mês até dezembro, no ano atual).
  async function gerarAno() {
    if (gerandoAno) return;
    const thisYear = new Date().getFullYear();
    const fromMonth = ano === thisYear ? new Date().getMonth() + 2 : 1; // ano atual: próximo mês; senão janeiro
    if (fromMonth > 12) { toast.info('O ano já está no fim — use "Criar ciclo do mês".'); return; }
    if (!window.confirm(`Gerar as 4 reuniões mensais de ${MESES[fromMonth - 1]} a Dezembro de ${ano}?`)) return;
    setGerandoAno(true);
    try {
      const r = await gov.cycles.generateYear(ano, fromMonth);
      toast.success(`${r?.reunioes_criadas || 0} reuniões geradas em ${r?.ciclos_criados || 0} mês(es)`);
      await carregar();
    } catch (e) { toast.error(formatErro(e)); }
    finally { setGerandoAno(false); }
  }

  const irMes = (delta) => setRef(new Date(ano, mes - 1 + delta, 1));
  const irHoje = () => { const n = new Date(); setRef(new Date(n.getFullYear(), n.getMonth(), 1)); };

  // Próxima reunião (não cancelada) por sigla · alimenta os quadrados.
  const proximaPorSigla = useMemo(() => {
    const map = {};
    for (const m of proximas) {
      const s = m.governance_meeting_types?.sigla;
      if (!s || m.status === 'cancelada') continue;
      if (!map[s]) map[s] = m;
    }
    return map;
  }, [proximas]);

  const tipoPorSigla = useMemo(() => {
    const map = {};
    for (const t of types) map[t.sigla] = t;
    return map;
  }, [types]);

  return (
    <div style={{ background: C.bg, minHeight: '100%', color: C.text }} className="p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <span style={{ color: C.primary }}><Landmark size={24} /></span>
            Governança
          </h1>
          <p style={{ color: C.t2 }} className="text-sm">Rituais mensais de gestão estratégica · reuniões, atas e deliberações</p>
        </div>
        <div className="flex items-center gap-2">
          {[['rituais', 'Rituais', Landmark], ['agenda', 'Agenda', CalendarDays], ['tipos', 'Tipos', Settings2]].map(([v, label, Icon]) => (
            <button key={v} onClick={() => setView(v)}
              className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg"
              style={{ border: `1px solid ${C.border}`, color: view === v ? C.primary : C.t2, background: view === v ? C.primaryBg : 'transparent' }}>
              <Icon size={15} /> {label}
            </button>
          ))}
          {canEdit && view === 'agenda' && (
            <button onClick={() => setNovaOpen(true)} className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg text-white"
              style={{ background: C.primary }}><Plus size={15} /> Reunião</button>
          )}
        </div>
      </div>

      {view === 'tipos' ? (
        <TiposPanel types={types} canEdit={canEdit} onChange={carregar} />
      ) : view === 'agenda' ? (
        <>
          {/* Navegação de mês */}
          <div className="flex items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2">
              <button onClick={() => irMes(-1)} className="p-2 rounded-lg" style={{ border: `1px solid ${C.border}`, color: C.t2 }}><ChevronLeft size={16} /></button>
              <div className="text-lg font-semibold min-w-[170px] text-center">{MESES[mes - 1]} {ano}</div>
              <button onClick={() => irMes(1)} className="p-2 rounded-lg" style={{ border: `1px solid ${C.border}`, color: C.t2 }}><ChevronRight size={16} /></button>
              <button onClick={irHoje} className="text-sm px-3 py-2 rounded-lg" style={{ border: `1px solid ${C.border}`, color: C.t2 }}>Hoje</button>
              {canEdit && (
                <button onClick={gerarAno} disabled={gerandoAno} title="Cria as 4 reuniões mensais até dezembro"
                  className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg" style={{ border: `1px solid ${C.border}`, color: C.primary, opacity: gerandoAno ? 0.6 : 1 }}>
                  {gerandoAno ? <Loader2 className="animate-spin" size={15} /> : <CalendarDays size={15} />} Gerar ano
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 py-10 justify-center" style={{ color: C.t3 }}><Loader2 className="animate-spin" size={18} /> Carregando…</div>
          ) : meetings.length === 0 ? (
            <div className="text-center py-12 rounded-xl" style={{ border: `1px dashed ${C.border}`, color: C.t2 }}>
              <CalendarDays size={28} className="mx-auto mb-2" style={{ color: C.t3 }} />
              <p className="mb-1">Nenhuma reunião em {MESES[mes - 1]} {ano}.</p>
              <p className="text-sm mb-4" style={{ color: C.t3 }}>Crie o ciclo do mês pra gerar as reuniões padrão, ou adicione uma reunião avulsa.</p>
              {canEdit && (
                <button onClick={criarCiclo} disabled={criando}
                  className="inline-flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg text-white" style={{ background: C.primary, opacity: criando ? 0.6 : 1 }}>
                  {criando ? <Loader2 className="animate-spin" size={15} /> : <Plus size={15} />} Criar ciclo do mês
                </button>
              )}
            </div>
          ) : (
            <div className="grid gap-2">
              {meetings.map(m => (
                <CardReuniao key={m.id} m={m} onClick={() => setOpenId(m.id)} />
              ))}
            </div>
          )}
        </>
      ) : (
        <RituaisHome
          loading={loading}
          tipoPorSigla={tipoPorSigla}
          proximaPorSigla={proximaPorSigla}
          onAbrir={(sigla) => navigate(`/governanca/${sigla.toLowerCase()}`)}
        />
      )}

      {openId && <DetalheReuniao id={openId} canEdit={canEdit} onClose={() => setOpenId(null)} onChange={carregar} />}
      {novaOpen && <NovaReuniaoModal types={types} dataPadrao={`${ano}-${pad(mes)}-01`} onClose={() => setNovaOpen(false)} onSaved={() => { setNovaOpen(false); carregar(); }} />}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Home dos rituais: o ciclo executivo do mês em 4 quadrados + as reuniões
// não-mensais (Diretoria Estatutária · Assembleia) como cards menores.
function RituaisHome({ loading, tipoPorSigla, proximaPorSigla, onAbrir }) {
  const extras = ['DE', 'AG'].filter(s => tipoPorSigla[s] && tipoPorSigla[s].ativo !== false);
  return (
    <div className="max-w-5xl">
      {/* Faixa do ciclo */}
      <div className="rounded-xl p-4 mb-4" style={{ background: `linear-gradient(135deg, ${C.primary}14, ${C.card})`, border: `1px solid ${C.border}` }}>
        <div className="text-xs font-bold uppercase tracking-wide" style={{ color: C.primary }}>Ciclo executivo do mês</div>
        <div className="text-sm font-medium mt-1" style={{ color: C.text }}>{SEQUENCIA_LOGICA}</div>
        <div className="text-sm mt-2" style={{ color: C.t2 }}>
          <b style={{ color: C.text }}>Regra de ouro:</b> {REGRA_DE_OURO}
        </div>
      </div>

      {/* 4 quadrados */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {ORDEM_RITUAIS.map((sigla, i) => {
          const r = RITUAIS[sigla];
          const cor = tipoPorSigla[sigla]?.cor || COR_RITUAL[sigla];
          const prox = proximaPorSigla[sigla];
          return (
            <button key={sigla} onClick={() => onAbrir(sigla)}
              className="text-left rounded-2xl p-4 transition hover:opacity-95"
              style={{ background: C.card, border: `1px solid ${C.border}`, borderTop: `4px solid ${cor}`, boxShadow: 'var(--shadow, 0 1px 3px rgba(0,0,0,0.06))' }}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-extrabold uppercase tracking-widest px-2 py-1 rounded-full" style={{ background: `${cor}1c`, color: cor }}>
                  {r.semanaLabel} · quarta
                </span>
                <span className="text-xs font-bold" style={{ color: C.t3 }}>{i + 1}/4</span>
              </div>
              <div className="text-lg font-bold mt-2" style={{ color: C.text }}>{r.titulo}</div>
              <p className="text-sm mt-1 leading-relaxed" style={{ color: C.t2 }}>{r.objetivo}</p>
              <div className="flex items-center justify-between gap-2 mt-3 pt-3" style={{ borderTop: `1px solid ${C.border}` }}>
                <span className="text-xs" style={{ color: C.t3 }}>
                  {loading ? '…' : prox ? <>Próxima: <b style={{ color: C.t2 }}>{diaSemana(prox.date)} {fmtData(prox.date)}</b></> : 'Sem reunião agendada'}
                </span>
                <span className="text-xs font-semibold inline-flex items-center gap-1" style={{ color: cor }}>Abrir <ChevronRight size={13} /></span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Reuniões não-mensais */}
      {extras.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          {extras.map(sigla => {
            const t = tipoPorSigla[sigla];
            const cor = t?.cor || COR_RITUAL[sigla];
            const prox = proximaPorSigla[sigla];
            return (
              <button key={sigla} onClick={() => onAbrir(sigla)}
                className="text-left rounded-xl p-3 flex items-center gap-3 transition hover:opacity-95"
                style={{ background: C.card, border: `1px solid ${C.border}` }}>
                <span style={{ width: 10, height: 10, borderRadius: 99, background: cor, flexShrink: 0 }} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate" style={{ color: C.text }}>{t.nome}</div>
                  <div className="text-xs" style={{ color: C.t3 }}>
                    {t.recorrencia}{prox ? ` · próxima ${fmtData(prox.date)}` : ' · sem reunião agendada'}
                  </div>
                </div>
                <ChevronRight size={15} style={{ color: C.t3, flexShrink: 0 }} />
              </button>
            );
          })}
        </div>
      )}

      <p className="text-xs mt-4 leading-relaxed" style={{ color: C.t3 }}>
        <b style={{ color: C.t2 }}>Como conduzimos estas reuniões:</b> {COMO_CONDUZIMOS}
      </p>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
function CardReuniao({ m, onClick }) {
  const tipo = m.governance_meeting_types || {};
  const st = STATUS_MEETING[m.status] || STATUS_MEETING.agendada;
  const cor = tipo.cor || C.primary;
  return (
    <button onClick={onClick} className="w-full text-left rounded-xl flex items-stretch overflow-hidden transition hover:opacity-90"
      style={{ background: C.card, border: `1px solid ${C.border}` }}>
      <div style={{ width: 5, background: cor, flexShrink: 0 }} />
      <div className="flex-1 p-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        <div className="flex-1 min-w-[160px]">
          <div className="font-semibold">{tipo.nome || 'Reunião'} {tipo.sigla ? <span style={{ color: C.t3 }}>· {tipo.sigla}</span> : null}</div>
          <div className="text-sm" style={{ color: C.t2 }}>{diaSemana(m.date)} {fmtData(m.date)}{m.local ? ` · ${m.local}` : ''}</div>
        </div>
        <span className="text-xs px-2 py-1 rounded-full font-medium" style={{ background: `${st.cor}22`, color: st.cor }}>{st.label}</span>
      </div>
    </button>
  );
}

// ────────────────────────────────────────────────────────────────────────
function TiposPanel({ types, canEdit, onChange }) {
  const [novo, setNovo] = useState({ nome: '', sigla: '', semana: 1, recorrencia: 'mensal' });
  const [saving, setSaving] = useState(false);

  async function criar() {
    if (!novo.nome.trim() || !novo.sigla.trim()) { toast.error('Nome e sigla são obrigatórios'); return; }
    setSaving(true);
    try { await gov.types.create({ ...novo, sigla: novo.sigla.trim(), nome: novo.nome.trim() }); setNovo({ nome: '', sigla: '', semana: 1, recorrencia: 'mensal' }); toast.success('Tipo criado'); onChange?.(); }
    catch (e) { toast.error(formatErro(e)); }
    finally { setSaving(false); }
  }
  async function toggleAtivo(t) {
    try { await gov.types.update(t.id, { ativo: !(t.ativo !== false) }); onChange?.(); } catch (e) { toast.error(formatErro(e)); }
  }

  return (
    <div className="max-w-3xl">
      <p className="text-sm mb-3" style={{ color: C.t2 }}>Tipos de reunião do ciclo. Os marcados como <b>mensal</b> são criados automaticamente ao gerar o ciclo do mês (na semana indicada).</p>
      <div className="grid gap-2 mb-5">
        {(types || []).map(t => (
          <div key={t.id} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: C.card, border: `1px solid ${C.border}`, opacity: t.ativo === false ? 0.55 : 1 }}>
            <span style={{ width: 10, height: 10, borderRadius: 99, background: t.cor || C.primary }} />
            <div className="flex-1">
              <div className="font-medium" style={{ color: C.text }}>{t.nome} <span style={{ color: C.t3 }}>· {t.sigla}</span></div>
              <div className="text-xs" style={{ color: C.t3 }}>{t.recorrencia} · {t.semana}ª semana</div>
            </div>
            {canEdit && <button onClick={() => toggleAtivo(t)} className="text-xs px-2.5 py-1.5 rounded-lg" style={{ border: `1px solid ${C.border}`, color: C.t2 }}>{t.ativo === false ? 'Ativar' : 'Desativar'}</button>}
          </div>
        ))}
        {(types || []).length === 0 && <p className="text-sm" style={{ color: C.t3 }}>Nenhum tipo cadastrado.</p>}
      </div>

      {canEdit && (
        <div className="p-3 rounded-xl" style={{ border: `1px solid ${C.border}` }}>
          <div className="text-sm font-semibold mb-2" style={{ color: C.text }}>Novo tipo</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input value={novo.nome} onChange={e => setNovo(n => ({ ...n, nome: e.target.value }))} placeholder="Nome (ex: Conselho Consultivo)" style={inputStyle} />
            <input value={novo.sigla} onChange={e => setNovo(n => ({ ...n, sigla: e.target.value }))} placeholder="Sigla (ex: CC)" style={inputStyle} />
            <select value={novo.recorrencia} onChange={e => setNovo(n => ({ ...n, recorrencia: e.target.value }))} style={inputStyle}>
              <option value="mensal">Mensal</option>
              <option value="quadrimestral">Quadrimestral</option>
              <option value="semestral">Semestral</option>
            </select>
            <select value={novo.semana} onChange={e => setNovo(n => ({ ...n, semana: Number(e.target.value) }))} style={inputStyle}>
              {[1, 2, 3, 4, 5].map(s => <option key={s} value={s}>{s}ª semana (quarta)</option>)}
            </select>
          </div>
          <div className="flex justify-end mt-2">
            <button onClick={criar} disabled={saving} className="text-sm px-4 py-2 rounded-lg text-white" style={{ background: C.primary, opacity: saving ? 0.6 : 1 }}>{saving ? 'Criando…' : 'Criar tipo'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
