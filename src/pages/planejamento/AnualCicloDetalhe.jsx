/**
 * Planejamento Anual — detalhe do ciclo
 *
 * - Mostra info do ciclo
 * - Lista propostas do usuário (mine=1)
 * - Botão "+ Nova proposta" → form modal (em memória, alerta de saída)
 *
 * PR-A: apenas criar/visualizar próprias propostas. PR-B traz filas de
 * aprovação e ações de aprovar/rejeitar.
 */
import { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { planejamento as planApi } from '../../api';

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', primary: '#00B39D',
  text: 'var(--cbrio-text)', t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)',
  border: 'var(--cbrio-border)', green: '#10b981', amber: '#f59e0b', red: '#ef4444', blue: '#3b82f6',
};

const STATUS_LABEL = {
  pendente_diretor:        { label: 'Aguarda diretor do setor', color: C.amber },
  pendente_diretoria:      { label: 'Aguarda diretoria geral', color: C.blue },
  aprovado:                { label: 'Aprovado', color: C.green },
  aprovado_com_ressalvas:  { label: 'Aprovado com ressalvas', color: C.green },
  rejeitado:               { label: 'Rejeitado', color: C.red },
};

const TIPO_LABEL = {
  evento: 'Evento',
  serie: 'Série',
  projeto: 'Projeto',
};

export default function AnualCicloDetalhe() {
  const { id: cicloId } = useParams();
  const navigate = useNavigate();
  const [ciclo, setCiclo] = useState(null);
  const [propostas, setPropostas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [c, p] = await Promise.all([
        planApi.getCiclo(cicloId),
        planApi.listPropostas({ ciclo_id: cicloId, mine: true }),
      ]);
      setCiclo(c);
      setPropostas(Array.isArray(p) ? p : []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [cicloId]);

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: C.t3 }}>Carregando...</div>;
  if (!ciclo) return <div style={{ padding: 40, textAlign: 'center', color: C.red }}>Ciclo não encontrado.</div>;

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1200, margin: '0 auto' }}>
      <Link to="/planejamento/anual" style={{ fontSize: 12, color: C.t2, textDecoration: 'none' }}>← Todos os ciclos</Link>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 8, marginBottom: 4 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: C.text }}>Planejamento {ciclo.year}</h1>
        <span style={{ padding: '4px 12px', borderRadius: 99, fontSize: 11, fontWeight: 600,
          background: ciclo.status === 'aberto' ? `${C.green}20` : `${C.t3}20`,
          color: ciclo.status === 'aberto' ? C.green : C.t3 }}>
          {ciclo.status === 'aberto' ? 'Aberto' : 'Fechado'}
        </span>
      </div>
      {ciclo.description && <p style={{ fontSize: 13, color: C.t2, marginBottom: 20 }}>{ciclo.description}</p>}

      {error && (
        <div style={{ padding: '10px 14px', background: '#fee2e2', color: C.red, borderRadius: 8, fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Minhas propostas</h2>
        {ciclo.status === 'aberto' && (
          <button onClick={() => setShowForm(true)}
            style={{ padding: '8px 14px', background: C.primary, color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            + Nova proposta
          </button>
        )}
      </div>

      {propostas.length === 0 ? (
        <div style={{ background: C.card, border: `1px dashed ${C.border}`, borderRadius: 12, padding: 32, textAlign: 'center', color: C.t3, fontSize: 13 }}>
          Nenhuma proposta enviada por você neste ciclo.
        </div>
      ) : (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
          {propostas.map((p, i) => {
            const meta = STATUS_LABEL[p.status] || { label: p.status, color: C.t3 };
            const titulo = p.payload_atual?.nome || p.payload_atual?.titulo || '(sem nome)';
            return (
              <div key={p.id} style={{ padding: '14px 18px', borderTop: i > 0 ? `1px solid ${C.border}` : 'none', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{titulo}</div>
                  <div style={{ fontSize: 11, color: C.t3, marginTop: 2 }}>
                    {TIPO_LABEL[p.tipo] || p.tipo} · {p.area} · {p.setor?.nome || '—'}
                    {p.diretor_comentario && <span style={{ marginLeft: 8, color: C.amber }}>· Diretor: {p.diretor_comentario.slice(0, 60)}</span>}
                    {p.diretoria_comentario && <span style={{ marginLeft: 8, color: C.blue }}>· Diretoria: {p.diretoria_comentario.slice(0, 60)}</span>}
                  </div>
                </div>
                <span style={{ padding: '4px 10px', borderRadius: 99, fontSize: 10, fontWeight: 600, background: `${meta.color}20`, color: meta.color, whiteSpace: 'nowrap' }}>
                  {meta.label}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <PropostaFormModal
          cicloId={cicloId}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); }}
        />
      )}
    </div>
  );
}

// ─── Modal de form de proposta ─────────────────────────────────────────
// Em memória — não salva no banco até clicar Enviar. beforeunload alerta.

function PropostaFormModal({ cicloId, onClose, onSaved }) {
  const [tipo, setTipo] = useState('projeto');
  const [area, setArea] = useState('');
  const [areasSetor, setAreasSetor] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');

  // Campos do form em memória (compartilhados entre tipos; renderiza condicional)
  const [form, setForm] = useState({
    nome: '', descricao: '',
    data: '', responsavel: '',
    budget_planned: '', expected_attendance: '',
    recorrencia: 'unico',
    objetivos: '', entregas: '',
  });
  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  // Detecta sujidade pra alertar saída
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    const v = Object.values(form).some(x => (typeof x === 'string' ? x.trim() : x) !== '');
    setDirty(v || !!area);
  }, [form, area]);

  useEffect(() => {
    const beforeUnload = (e) => {
      if (dirty) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);

  useEffect(() => {
    planApi.listAreasSetor()
      .then(d => setAreasSetor(Array.isArray(d) ? d : []))
      .catch(() => setAreasSetor([]));
  }, []);

  const handleClose = () => {
    if (dirty && !window.confirm('Os dados preenchidos não foram salvos. Deseja descartar?')) return;
    onClose();
  };

  const handleSubmit = async () => {
    setErr('');
    if (!form.nome.trim()) { setErr('Nome é obrigatório'); return; }
    if (!area) { setErr('Selecione uma área'); return; }
    setSubmitting(true);

    // Monta payload conforme tipo. Frontend mantém shape flexível — backend só
    // valida estrutura mínima. Campos extras vão no payload jsonb.
    const payload = {
      nome: form.nome.trim(),
      descricao: form.descricao.trim() || null,
      data: form.data || null,
      responsavel: form.responsavel.trim() || null,
      budget_planned: form.budget_planned ? parseFloat(form.budget_planned) : null,
    };
    if (tipo === 'evento' || tipo === 'serie') {
      payload.expected_attendance = form.expected_attendance ? parseInt(form.expected_attendance, 10) : null;
      payload.recorrencia = form.recorrencia;
    }
    if (tipo === 'projeto') {
      payload.objetivos = form.objetivos.trim() || null;
      payload.entregas = form.entregas.trim() || null;
    }

    try {
      await planApi.createProposta({ ciclo_id: cicloId, tipo, area, payload });
      setDirty(false);
      onSaved();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div onClick={handleClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 900 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '95%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto', background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, zIndex: 901 }}>
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Nova proposta</span>
          <button onClick={handleClose} style={{ background: 'none', border: 'none', fontSize: 18, color: C.t3, cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ padding: 20 }}>
          {/* Tipo */}
          <Field label="Tipo">
            <div style={{ display: 'flex', gap: 8 }}>
              {['projeto', 'evento', 'serie'].map(t => (
                <button key={t} onClick={() => setTipo(t)} type="button"
                  style={{ flex: 1, padding: '8px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    background: tipo === t ? C.primary : 'transparent',
                    color: tipo === t ? '#fff' : C.t2,
                    border: tipo === t ? 'none' : `1px solid ${C.border}` }}>
                  {TIPO_LABEL[t]}
                </button>
              ))}
            </div>
          </Field>

          {/* Área */}
          <Field label="Área">
            <select value={area} onChange={e => setArea(e.target.value)} style={inputStyle}>
              <option value="">— Selecione —</option>
              {areasSetor.map(a => (
                <option key={a.area} value={a.area}>{a.area} ({a.planejamento_setores?.nome || '?'})</option>
              ))}
            </select>
          </Field>

          {/* Nome */}
          <Field label="Nome / Título">
            <input value={form.nome} onChange={e => set('nome', e.target.value)} style={inputStyle} placeholder={tipo === 'projeto' ? 'Ex: Reforma do palco' : 'Ex: Conferência de Casais'} />
          </Field>

          <Field label="Descrição">
            <textarea value={form.descricao} onChange={e => set('descricao', e.target.value)} style={{ ...inputStyle, minHeight: 70 }} placeholder="Resumo do que será feito" />
          </Field>

          <div style={{ display: 'flex', gap: 12 }}>
            <Field label={tipo === 'projeto' ? 'Prazo final' : 'Data principal'} style={{ flex: 1 }}>
              <input type="date" value={form.data} onChange={e => set('data', e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Responsável sugerido" style={{ flex: 1 }}>
              <input value={form.responsavel} onChange={e => set('responsavel', e.target.value)} style={inputStyle} placeholder="Nome" />
            </Field>
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <Field label="Orçamento previsto (R$)" style={{ flex: 1 }}>
              <input type="number" min="0" step="0.01" value={form.budget_planned} onChange={e => set('budget_planned', e.target.value)} style={inputStyle} />
            </Field>
            {(tipo === 'evento' || tipo === 'serie') && (
              <Field label="Público esperado" style={{ flex: 1 }}>
                <input type="number" min="0" value={form.expected_attendance} onChange={e => set('expected_attendance', e.target.value)} style={inputStyle} />
              </Field>
            )}
          </div>

          {(tipo === 'evento' || tipo === 'serie') && (
            <Field label="Recorrência">
              <select value={form.recorrencia} onChange={e => set('recorrencia', e.target.value)} style={inputStyle}>
                <option value="unico">Único (data específica)</option>
                <option value="semanal">Semanal</option>
                <option value="mensal">Mensal</option>
                <option value="anual">Anual</option>
              </select>
            </Field>
          )}

          {tipo === 'projeto' && (
            <>
              <Field label="Objetivos">
                <textarea value={form.objetivos} onChange={e => set('objetivos', e.target.value)} style={{ ...inputStyle, minHeight: 60 }} placeholder="Quais resultados se espera ao final" />
              </Field>
              <Field label="Entregas previstas">
                <textarea value={form.entregas} onChange={e => set('entregas', e.target.value)} style={{ ...inputStyle, minHeight: 60 }} placeholder="O que será concretamente entregue" />
              </Field>
            </>
          )}

          {err && (
            <div style={{ padding: '8px 12px', background: '#fee2e2', color: C.red, borderRadius: 6, fontSize: 12, marginTop: 12 }}>{err}</div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
            <button onClick={handleClose} type="button"
              style={{ padding: '8px 16px', background: 'transparent', color: C.t2, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>
              Cancelar
            </button>
            <button onClick={handleSubmit} disabled={submitting}
              style={{ padding: '8px 20px', background: C.primary, color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: submitting ? 'wait' : 'pointer', opacity: submitting ? 0.6 : 1 }}>
              {submitting ? 'Enviando...' : 'Enviar proposta'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

const inputStyle = {
  width: '100%', padding: 8, borderRadius: 6, border: `1px solid ${C.border}`,
  background: 'var(--cbrio-input-bg, var(--cbrio-bg))', color: C.text, fontSize: 13, boxSizing: 'border-box',
};

function Field({ label, children, style }) {
  return (
    <div style={{ marginBottom: 12, ...style }}>
      <label style={{ display: 'block', fontSize: 11, color: C.t3, marginBottom: 4, fontWeight: 600 }}>{label}</label>
      {children}
    </div>
  );
}
