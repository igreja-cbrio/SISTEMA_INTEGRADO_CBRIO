// ============================================================================
// Governança — Rituais Mensais de Gestão Estratégica
// ============================================================================
// Home do módulo: os 4 rituais do ciclo executivo do mês (OKR → DRE → KPI →
// Conselho) como quadrados clicáveis, com o PRÓXIMO da agenda em evidência.
// Toda a gestão de cada reunião acontece DENTRO da página do ritual
// (/governanca/:sigla) — a antiga aba Agenda foi aposentada (decisão do
// Marcos 2026-07-08). Aqui ficam só: gerar a agenda do ano (idempotente),
// criar reunião avulsa e editar o catálogo de tipos.
// ============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ChevronRight, Plus, Loader2, CalendarDays, Settings2, Landmark,
} from 'lucide-react';
import { toast } from 'sonner';
import { governanca as gov } from '../../api';
import { formatErro } from '../../lib/formatErro';
import { useAuth } from '../../contexts/AuthContext';
import {
  C, MESES, ymd, fmtData, diaSemana, inputStyle, NovaReuniaoModal,
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

  const [types, setTypes] = useState([]);
  const [proximas, setProximas] = useState([]); // reuniões futuras (todas as siglas)
  const [loading, setLoading] = useState(true);
  const [gerando, setGerando] = useState(false);
  const [novaOpen, setNovaOpen] = useState(false);
  const view = searchParams.get('view') === 'tipos' ? 'tipos' : 'rituais';
  const setView = (v) => setSearchParams(v === 'rituais' ? {} : { view: v }, { replace: true });

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const hoje = ymd(new Date());
      const [tps, prox] = await Promise.all([
        gov.types.list(),
        gov.meetings.list({ from: hoje }),
      ]);
      setTypes(Array.isArray(tps) ? tps : []);
      setProximas(Array.isArray(prox) ? prox : []);
    } catch (e) { toast.error(formatErro(e)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // Gera a agenda das reuniões mensais do mês atual até dezembro (idempotente ·
  // meses/ciclos já gerados são pulados).
  async function gerarAgenda() {
    if (gerando) return;
    const agora = new Date();
    const anoA = agora.getFullYear(), mesA = agora.getMonth() + 1;
    if (!window.confirm(`Gerar a agenda das reuniões mensais de ${MESES[mesA - 1]} a Dezembro de ${anoA}? Meses já gerados são pulados.`)) return;
    setGerando(true);
    try {
      const r = await gov.cycles.generateYear(anoA, mesA);
      toast.success(`${r?.reunioes_criadas || 0} reunião(ões) gerada(s) em ${r?.ciclos_criados || 0} mês(es)`);
      await carregar();
    } catch (e) { toast.error(formatErro(e)); }
    finally { setGerando(false); }
  }

  const naoCanceladas = useMemo(() => proximas.filter(m => m.status !== 'cancelada' && m.date), [proximas]);

  // Próxima reunião (não cancelada) por sigla · alimenta os quadrados.
  const proximaPorSigla = useMemo(() => {
    const map = {};
    for (const m of naoCanceladas) {
      const s = m.governance_meeting_types?.sigla;
      if (!s) continue;
      if (!map[s]) map[s] = m;
    }
    return map;
  }, [naoCanceladas]);

  // A PRÓXIMA da agenda (entre todos os rituais) · ganha evidência na home.
  const proximaGlobal = useMemo(() => {
    const m = naoCanceladas[0]; // lista já vem ordenada por data
    return m ? { sigla: m.governance_meeting_types?.sigla, date: m.date } : null;
  }, [naoCanceladas]);

  const tipoPorSigla = useMemo(() => {
    const map = {};
    for (const t of types) map[t.sigla] = t;
    return map;
  }, [types]);

  return (
    <div style={{ background: C.bg, minHeight: '100%', color: C.text }} className="p-4 md:p-6">
      <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <span style={{ color: C.primary }}><Landmark size={24} /></span>
            Governança
          </h1>
          <p style={{ color: C.t2 }} className="text-sm">Rituais mensais de gestão estratégica · reuniões, atas e deliberações</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {[['rituais', 'Rituais', Landmark], ['tipos', 'Tipos', Settings2]].map(([v, label, Icon]) => (
            <button key={v} onClick={() => setView(v)}
              className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg"
              style={{ border: `1px solid ${C.border}`, color: view === v ? C.primary : C.t2, background: view === v ? C.primaryBg : 'transparent' }}>
              <Icon size={15} /> {label}
            </button>
          ))}
          {canEdit && (
            <>
              <button onClick={gerarAgenda} disabled={gerando} title="Cria as 4 reuniões mensais deste mês até dezembro (pula o que já existe)"
                className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg"
                style={{ border: `1px solid ${C.border}`, color: C.primary, opacity: gerando ? 0.6 : 1 }}>
                {gerando ? <Loader2 className="animate-spin" size={15} /> : <CalendarDays size={15} />} Gerar agenda
              </button>
              <button onClick={() => setNovaOpen(true)} className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg text-white"
                style={{ background: C.primary }}><Plus size={15} /> Reunião avulsa</button>
            </>
          )}
        </div>
      </div>

      {view === 'tipos' ? (
        <TiposPanel types={types} canEdit={canEdit} onChange={carregar} />
      ) : (
        <RituaisHome
          loading={loading}
          tipoPorSigla={tipoPorSigla}
          proximaPorSigla={proximaPorSigla}
          proximaGlobal={proximaGlobal}
          onAbrir={(sigla) => navigate(`/governanca/${sigla.toLowerCase()}`)}
        />
      )}

      {novaOpen && <NovaReuniaoModal types={types} dataPadrao={ymd(new Date())} onClose={() => setNovaOpen(false)} onSaved={() => { setNovaOpen(false); carregar(); }} />}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Home dos rituais: o ciclo executivo do mês em 4 quadrados (o próximo da
// agenda em evidência) + as reuniões não-mensais como cards menores.
function RituaisHome({ loading, tipoPorSigla, proximaPorSigla, proximaGlobal, onAbrir }) {
  const extras = ['DE', 'AG'].filter(s => tipoPorSigla[s] && tipoPorSigla[s].ativo !== false);
  const temAgenda = Object.keys(proximaPorSigla).length > 0;
  return (
    <div>
      {/* Faixa do ciclo */}
      <div className="rounded-xl p-4 mb-4" style={{ background: `linear-gradient(135deg, ${C.primary}14, ${C.card})`, border: `1px solid ${C.border}` }}>
        <div className="text-xs font-bold uppercase tracking-wide" style={{ color: C.primary }}>Ciclo executivo do mês</div>
        <div className="text-sm font-medium mt-1" style={{ color: C.text }}>{SEQUENCIA_LOGICA}</div>
        <div className="text-sm mt-2" style={{ color: C.t2 }}>
          <b style={{ color: C.text }}>Regra de ouro:</b> {REGRA_DE_OURO}
        </div>
      </div>

      {!loading && !temAgenda && (
        <div className="rounded-xl p-3 mb-4 text-sm" style={{ border: `1px dashed ${C.border}`, color: C.t2 }}>
          Nenhuma reunião agendada daqui pra frente — use o botão <b style={{ color: C.text }}>Gerar agenda</b> acima pra criar o calendário do ano.
        </div>
      )}

      {/* 4 quadrados */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {ORDEM_RITUAIS.map((sigla, i) => {
          const r = RITUAIS[sigla];
          const cor = tipoPorSigla[sigla]?.cor || COR_RITUAL[sigla];
          const prox = proximaPorSigla[sigla];
          const emEvidencia = proximaGlobal?.sigla === sigla;
          return (
            <button key={sigla} onClick={() => onAbrir(sigla)}
              className="text-left rounded-2xl p-4 transition hover:opacity-95 relative"
              style={{
                background: emEvidencia ? `linear-gradient(160deg, ${cor}10, ${C.card})` : C.card,
                border: `1px solid ${emEvidencia ? cor : C.border}`,
                borderTop: `4px solid ${cor}`,
                boxShadow: emEvidencia ? `0 0 0 2px ${cor}55, var(--shadow, 0 1px 3px rgba(0,0,0,0.06))` : 'var(--shadow, 0 1px 3px rgba(0,0,0,0.06))',
              }}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest px-2 py-1 rounded-full" style={{ background: `${cor}1c`, color: cor }}>
                    {r.semanaLabel} · quarta
                  </span>
                  {emEvidencia && (
                    <span className="text-[10px] font-extrabold uppercase tracking-widest px-2 py-1 rounded-full text-white" style={{ background: cor }}>
                      Próxima do ciclo
                    </span>
                  )}
                </div>
                <span className="text-xs font-bold" style={{ color: C.t3 }}>{i + 1}/4</span>
              </div>
              <div className="text-lg font-bold mt-2" style={{ color: C.text }}>{r.titulo}</div>
              <p className="text-sm mt-1 leading-relaxed" style={{ color: C.t2 }}>{r.objetivo}</p>
              <div className="flex items-center justify-between gap-2 mt-3 pt-3" style={{ borderTop: `1px solid ${C.border}` }}>
                <span className="text-xs" style={{ color: C.t3 }}>
                  {loading ? '…' : prox
                    ? <>Próxima: <b style={{ color: emEvidencia ? cor : C.t2 }}>{diaSemana(prox.date)} {fmtData(prox.date)}</b></>
                    : 'Sem reunião agendada'}
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
            const emEvidencia = proximaGlobal?.sigla === sigla;
            return (
              <button key={sigla} onClick={() => onAbrir(sigla)}
                className="text-left rounded-xl p-3 flex items-center gap-3 transition hover:opacity-95"
                style={{ background: C.card, border: `1px solid ${emEvidencia ? cor : C.border}`, boxShadow: emEvidencia ? `0 0 0 2px ${cor}55` : 'none' }}>
                <span style={{ width: 10, height: 10, borderRadius: 99, background: cor, flexShrink: 0 }} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate" style={{ color: C.text }}>
                    {t.nome}
                    {emEvidencia && <span className="text-[10px] font-extrabold uppercase tracking-widest px-1.5 py-0.5 rounded-full text-white ml-2" style={{ background: cor }}>Próxima</span>}
                  </div>
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
    <div className="max-w-3xl mx-auto">
      <p className="text-sm mb-3" style={{ color: C.t2 }}>Tipos de reunião do ciclo. Os marcados como <b>mensal</b> são criados automaticamente ao gerar a agenda (na semana indicada).</p>
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
