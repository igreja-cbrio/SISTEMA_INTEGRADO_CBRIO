// ============================================================================
// /grupos/supervisao · tela hierarquica de supervisao
//
// Marcos: "caso você seja supervisor você ve todos os grupos que acompanha e
// pode deixar observações mensais la e va colocando as datas que você
// visitou, se for coordenador, ve todos os supervisores e como eles estão
// mexendo e também todos os grupos abaixo, como se fosse expansivel e os
// funcionários cadastrados como admin nesse módulo veem a organização geral"
//
// Permissão (vem do backend GET /api/grupos/supervisao/me):
//   - admin           · ve todos os supervisores e grupos
//   - coordenador     · ve todos os supervisores e grupos
//   - supervisor      · ve apenas seus grupos
// ============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { grupos as gruposApi } from '../../api';
import useConfirmarSaida from '../../hooks/useConfirmarSaida';
import { toast } from 'sonner';
import {
  ChevronDown, ChevronRight, Calendar, MessageSquare, Plus, X,
  Users, CheckCircle2, AlertCircle, Activity,
} from 'lucide-react';

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', text: 'var(--cbrio-text)',
  t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)', border: 'var(--cbrio-border)',
  inputBg: 'var(--cbrio-input-bg)', modalBg: 'var(--cbrio-modal-bg)', overlay: 'var(--cbrio-overlay)',
  primary: '#00B39D', primaryBg: '#00B39D18', primaryDark: '#008376',
  green: '#10b981', greenBg: '#10b98120',
  amber: '#f59e0b', amberBg: '#f59e0b20',
  red: '#ef4444', redBg: '#ef444420',
};

const PAPEL_LABEL = {
  admin: 'Admin',
  coordenador: 'Coordenador',
  supervisor: 'Supervisor',
};

function periodoAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatDate(s) {
  if (!s) return '—';
  return new Date(s + 'T12:00:00').toLocaleDateString('pt-BR');
}

export default function GruposSupervisao() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [expandSup, setExpandSup] = useState(new Set());
  const [grupoAberto, setGrupoAberto] = useState(null);
  const [erro, setErro] = useState(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const r = await gruposApi.supervisaoMe();
      setData(r);
      // Auto-expande se for supervisor (so 1 grupo de supervisor)
      if (r.papel === 'supervisor' && r.supervisores.length > 0) {
        setExpandSup(new Set([r.supervisores[0].supervisor_id]));
      }
    } catch (e) {
      setErro(e?.message || 'Erro ao carregar');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const toggleSupervisor = (id) => setExpandSup(prev => {
    const novo = new Set(prev);
    if (novo.has(id)) novo.delete(id); else novo.add(id);
    return novo;
  });

  if (loading) {
    return <div style={{ padding: 60, textAlign: 'center', color: C.t3 }}>Carregando supervisão...</div>;
  }

  if (erro) {
    return (
      <div style={{ padding: 60, textAlign: 'center' }}>
        <AlertCircle size={32} style={{ color: C.red, marginBottom: 12 }} />
        <p style={{ color: C.t2 }}>{erro}</p>
      </div>
    );
  }

  if (!data || !data.papel) return null;

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1100, margin: '0 auto' }}>
      <header style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Users size={22} style={{ color: C.primary }} /> Supervisão de Grupos
        </h1>
        <p style={{ fontSize: 13, color: C.t3, marginTop: 6 }}>
          {data.papel === 'admin' && 'Você vê todos os supervisores e grupos da igreja.'}
          {data.papel === 'coordenador' && 'Você coordena os supervisores listados abaixo.'}
          {data.papel === 'supervisor' && 'Os grupos abaixo estão sob sua supervisão.'}
          {' · '}
          <strong style={{ color: C.primary }}>{PAPEL_LABEL[data.papel]}</strong>
          {' · '}
          {data.total_grupos} grupo{data.total_grupos !== 1 ? 's' : ''}
        </p>
      </header>

      {data.supervisores.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center', color: C.t3, background: C.card, borderRadius: 16, border: '1px dashed var(--hairline)', boxShadow: 'var(--shadow)' }}>
          Nenhum grupo encontrado.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {data.supervisores.map(s => (
            <SupervisorBloco
              key={s.supervisor_id || 'sem'}
              supervisor={s}
              expanded={expandSup.has(s.supervisor_id)}
              onToggle={() => toggleSupervisor(s.supervisor_id)}
              onAbrirGrupo={setGrupoAberto}
            />
          ))}
        </div>
      )}

      {grupoAberto && (
        <ModalGrupo
          grupo={grupoAberto}
          papel={data.papel}
          onClose={() => setGrupoAberto(null)}
          onChanged={carregar}
        />
      )}
    </div>
  );
}

// ============================================================================
// SupervisorBloco · header expansível com os grupos
// ============================================================================
function SupervisorBloco({ supervisor, expanded, onToggle, onAbrirGrupo }) {
  return (
    <div style={{ background: C.card, border: '1px solid var(--hairline)', boxShadow: 'var(--shadow)', borderRadius: 16, overflow: 'hidden' }}>
      <button onClick={onToggle} style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer',
        textAlign: 'left',
      }}>
        {expanded ? <ChevronDown size={16} color={C.t3} /> : <ChevronRight size={16} color={C.t3} />}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{supervisor.supervisor_nome}</div>
          <div style={{ fontSize: 11, color: C.t3, marginTop: 2 }}>
            {supervisor.total_grupos} grupo{supervisor.total_grupos !== 1 ? 's' : ''}
            {' · '}
            {supervisor.total_visitas_mes} visita{supervisor.total_visitas_mes !== 1 ? 's' : ''} este mês
          </div>
        </div>
      </button>

      {expanded && (
        <div style={{ borderTop: `1px solid ${C.border}`, padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {supervisor.grupos.map(g => (
            <LinhaGrupo key={g.id} grupo={g} onClick={() => onAbrirGrupo(g)} />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// LinhaGrupo · 1 grupo dentro do bloco supervisor
// ============================================================================
function LinhaGrupo({ grupo, onClick }) {
  const visitaStatus = useMemo(() => {
    if (!grupo.ultima_visita) {
      return { cor: C.red, bg: C.redBg, label: 'Nunca visitado', Icon: AlertCircle };
    }
    const dias = Math.floor((Date.now() - new Date(grupo.ultima_visita).getTime()) / 86400000);
    if (dias <= 30) return { cor: C.green, bg: C.greenBg, label: `Visitado há ${dias}d`, Icon: CheckCircle2 };
    if (dias <= 60) return { cor: C.amber, bg: C.amberBg, label: `${dias}d sem visita`, Icon: Activity };
    return { cor: C.red, bg: C.redBg, label: `${dias}d sem visita`, Icon: AlertCircle };
  }, [grupo.ultima_visita]);

  const SI = visitaStatus.Icon;

  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
      background: C.inputBg, border: `1px solid ${C.border}`, borderRadius: 8,
      cursor: 'pointer', textAlign: 'left', width: '100%',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{grupo.nome}</div>
        <div style={{ fontSize: 11, color: C.t3, marginTop: 2 }}>
          {grupo.lider_nome ? `Líder: ${grupo.lider_nome}` : 'Sem líder'}
          {grupo.bairro ? ` · ${grupo.bairro}` : ''}
          {' · '}
          {grupo.total_membros} membro{grupo.total_membros !== 1 ? 's' : ''}
          {grupo.total_lider_treinamento > 0 && (
            <span style={{ marginLeft: 6, color: C.primary, fontWeight: 600 }}>
              · {grupo.total_lider_treinamento} em treinamento
            </span>
          )}
        </div>
      </div>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        fontSize: 10, padding: '4px 10px', borderRadius: 99,
        background: visitaStatus.bg, color: visitaStatus.cor, fontWeight: 700,
      }}>
        <SI size={11} /> {visitaStatus.label}
      </span>
    </button>
  );
}

// ============================================================================
// ModalGrupo · detalhes do grupo + visitas + observação mensal
// ============================================================================
function ModalGrupo({ grupo, papel, onClose, onChanged }) {
  const [tab, setTab] = useState('visitas'); // visitas | observação | membros
  const [visitas, setVisitas] = useState([]);
  const [observacoes, setObservacoes] = useState([]);
  const [loading, setLoading] = useState(true);
  // Dirty levantado pelo filho (TabObservacao) · texto digitado e não salvo
  const [temAlteracoes, setTemAlteracoes] = useState(false);
  const { tentarFechar, backdropProps } = useConfirmarSaida(temAlteracoes, onClose);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [v, o] = await Promise.all([
        gruposApi.listVisitas(grupo.id),
        gruposApi.listObservacoes(grupo.id),
      ]);
      setVisitas(v || []);
      setObservacoes(o || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [grupo.id]);

  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') tentarFechar(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tentarFechar]);

  return (
    <div {...backdropProps} style={{
      position: 'fixed', inset: 0, zIndex: 1000, background: C.overlay,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--panel)',
        WebkitBackdropFilter: 'blur(18px) saturate(140%)', backdropFilter: 'blur(18px) saturate(140%)',
        border: '1px solid var(--hairline)', borderRadius: 16, maxWidth: 700, width: '100%',
        maxHeight: '90vh', overflow: 'auto', boxShadow: 'var(--shadow-hover), var(--hi)',
      }}>
        <header style={{ padding: '20px 24px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: 0 }}>{grupo.nome}</h3>
            <p style={{ fontSize: 12, color: C.t3, marginTop: 4 }}>
              {grupo.lider_nome ? `Líder ${grupo.lider_nome}` : 'Sem líder'}
              {' · '}
              Supervisor {grupo.supervisor_nome || '—'}
            </p>
          </div>
          <button onClick={tentarFechar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.t3 }}>
            <X size={20} />
          </button>
        </header>

        <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, padding: '0 24px' }}>
          {[
            { key: 'visitas', label: 'Visitas', icon: Calendar },
            { key: 'observacao', label: 'Observação mensal', icon: MessageSquare },
          ].map(t => {
            const Ic = t.icon;
            const sel = tab === t.key;
            return (
              <button key={t.key} onClick={() => setTab(t.key)} style={{
                padding: '12px 16px', background: 'none', border: 'none',
                borderBottom: sel ? `2px solid ${C.primary}` : '2px solid transparent',
                color: sel ? C.primary : C.t2, fontWeight: 600, fontSize: 12,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <Ic size={13} /> {t.label}
              </button>
            );
          })}
        </div>

        <div style={{ padding: 20 }}>
          {loading ? (
            <div style={{ padding: 30, textAlign: 'center', color: C.t3 }}>Carregando...</div>
          ) : tab === 'visitas' ? (
            <TabVisitas grupo={grupo} visitas={visitas} onChanged={() => { reload(); onChanged(); }} />
          ) : (
            <TabObservacao grupo={grupo} observacoes={observacoes} onChanged={() => { reload(); onChanged(); }} onDirtyChange={setTemAlteracoes} />
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// TabVisitas · lista de visitas + form pra adicionar
// ============================================================================
function TabVisitas({ grupo, visitas, onChanged }) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ data_visita: new Date().toISOString().slice(0, 10), observacao: '' });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!form.data_visita) { toast.error('Informe a data'); return; }
    setSaving(true);
    try {
      await gruposApi.addVisita(grupo.id, form);
      toast.success('Visita registrada');
      setAdding(false);
      setForm({ data_visita: new Date().toISOString().slice(0, 10), observacao: '' });
      onChanged();
    } catch (e) {
      toast.error(e?.message || 'Erro');
    } finally { setSaving(false); }
  };

  const remover = async (id) => {
    if (!window.confirm('Remover essa visita?')) return;
    try { await gruposApi.removeVisita(id); toast.success('Removida'); onChanged(); }
    catch (e) { toast.error(e?.message); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h4 style={{ fontSize: 12, fontWeight: 700, color: C.t3, margin: 0, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Histórico de visitas ({visitas.length})
        </h4>
        {!adding && (
          <button onClick={() => setAdding(true)} style={{
            padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600,
            background: C.primary, color: '#fff', border: 'none', cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}>
            <Plus size={12} /> Nova visita
          </button>
        )}
      </div>

      {adding && (
        <div style={{ padding: 12, background: C.inputBg, borderRadius: 8, marginBottom: 12, border: `1px solid ${C.border}` }}>
          <label style={{ display: 'block', fontSize: 11, color: C.t2, marginBottom: 4 }}>Data da visita</label>
          <input type="date" value={form.data_visita}
            onChange={e => setForm(f => ({ ...f, data_visita: e.target.value }))}
            style={inpStyle} />
          <label style={{ display: 'block', fontSize: 11, color: C.t2, marginTop: 8, marginBottom: 4 }}>Observação (opcional)</label>
          <textarea value={form.observacao}
            onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))}
            rows={3}
            placeholder="Como foi a visita? O que precisa ser acompanhado?"
            style={{ ...inpStyle, resize: 'vertical' }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'flex-end' }}>
            <button onClick={() => setAdding(false)} style={btnGhost}>Cancelar</button>
            <button onClick={submit} disabled={saving} style={btnPrimary}>{saving ? 'Salvando...' : 'Registrar'}</button>
          </div>
        </div>
      )}

      {visitas.length === 0 ? (
        <div style={{ padding: 30, textAlign: 'center', color: C.t3, fontSize: 12 }}>Nenhuma visita registrada ainda.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {visitas.map(v => (
            <div key={v.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', background: C.inputBg, borderRadius: 8, opacity: v.status === 'cancelada' ? 0.55 : 1 }}>
              <Calendar size={14} style={{ color: v.status === 'agendada' ? '#3b82f6' : C.primary, marginTop: 2, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.text, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {formatDate(v.data_visita)}
                  {v.status === 'agendada' && (
                    <span style={{ fontSize: 9, padding: '1px 8px', borderRadius: 99, background: '#3b82f620', color: '#3b82f6', fontWeight: 700, textTransform: 'uppercase' }}>Agendada</span>
                  )}
                  {v.status === 'cancelada' && (
                    <span style={{ fontSize: 9, padding: '1px 8px', borderRadius: 99, background: C.redBg, color: C.red, fontWeight: 700, textTransform: 'uppercase' }}>Cancelada</span>
                  )}
                </div>
                {v.responsavel_nome && <div style={{ fontSize: 10, color: C.t3, marginTop: 2 }}>{v.responsavel_nome}</div>}
                {v.observacao && <div style={{ fontSize: 11, color: C.t2, marginTop: 4, lineHeight: 1.4 }}>{v.observacao}</div>}
              </div>
              <button onClick={() => remover(v.id)} title="Remover" style={{ background: 'none', border: 'none', color: C.t3, cursor: 'pointer', padding: 2 }}>
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// TabObservacao · 1 textarea por mês (upsert)
// ============================================================================
function TabObservacao({ grupo, observacoes, onChanged, onDirtyChange }) {
  const periodo = periodoAtual();
  const atual = observacoes.find(o => o.periodo === periodo);
  const [texto, setTexto] = useState(atual?.observacao || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => { setTexto(atual?.observacao || ''); }, [atual?.observacao, atual?.periodo]);

  // Levanta o dirty pro pai (ModalGrupo) · compara contra o valor com que o
  // textarea foi populado (observação existente ou vazio). Abrir e fechar sem
  // digitar nada não dispara confirmação; salvar zera (reload traz o texto
  // salvo como novo valor inicial).
  const textoInicial = atual?.observacao || '';
  useEffect(() => {
    onDirtyChange?.(texto.trim() !== textoInicial.trim());
  }, [texto, textoInicial, onDirtyChange]);

  // Ao sair da aba (desmonte), o texto não salvo se perde · zera o dirty
  useEffect(() => () => { onDirtyChange?.(false); }, [onDirtyChange]);

  const submit = async () => {
    if (!texto.trim()) { toast.error('Escreva algo antes de salvar'); return; }
    setSaving(true);
    try {
      await gruposApi.setObservacao(grupo.id, periodo, texto);
      toast.success('Observação salva');
      onDirtyChange?.(false);
      onChanged();
    } catch (e) { toast.error(e?.message || 'Erro'); }
    finally { setSaving(false); }
  };

  return (
    <div>
      <h4 style={{ fontSize: 12, fontWeight: 700, color: C.t3, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        Observação do mês atual ({periodo})
      </h4>
      <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={6}
        placeholder="Como está o grupo este mês? Pontos de atenção, vitórias, próximos passos..."
        style={{ ...inpStyle, resize: 'vertical' }} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
        <button onClick={submit} disabled={saving} style={btnPrimary}>{saving ? 'Salvando...' : 'Salvar'}</button>
      </div>

      {observacoes.filter(o => o.periodo !== periodo).length > 0 && (
        <>
          <h4 style={{ fontSize: 12, fontWeight: 700, color: C.t3, margin: '20px 0 8px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Meses anteriores
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {observacoes.filter(o => o.periodo !== periodo).map(o => (
              <div key={o.id} style={{ padding: '10px 12px', background: C.inputBg, borderRadius: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.primary }}>{o.periodo}</div>
                <div style={{ fontSize: 11, color: C.t2, marginTop: 4, lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>{o.observacao}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const inpStyle = {
  width: '100%', padding: '8px 12px', borderRadius: 6,
  border: `1px solid ${C.border}`, background: C.inputBg, color: C.text,
  fontSize: 12, boxSizing: 'border-box',
};
const btnPrimary = {
  padding: '8px 16px', borderRadius: 6, fontSize: 12, fontWeight: 600,
  background: C.primary, color: '#fff', border: 'none', cursor: 'pointer',
};
const btnGhost = {
  padding: '8px 16px', borderRadius: 6, fontSize: 12, fontWeight: 600,
  background: 'transparent', color: C.t2, border: `1px solid ${C.border}`, cursor: 'pointer',
};
