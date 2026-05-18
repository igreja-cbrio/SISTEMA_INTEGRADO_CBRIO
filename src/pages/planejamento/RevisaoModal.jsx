/**
 * RevisaoModal — tela usada pelo diretor de setor e diretoria geral pra
 * revisar uma proposta. Permite aprovar, rejeitar, ou aprovar editando
 * campos. Quando há edição, vira automaticamente "aprovado_com_ressalvas".
 *
 * Props:
 *  - proposta (obj completo retornado do backend)
 *  - etapa: 'diretor' | 'diretoria'
 *  - onClose()
 *  - onDecided() — chamado após decisão pra reload
 */
import { useState, useEffect } from 'react';
import { planejamento as planApi } from '../../api';

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', primary: '#00B39D',
  text: 'var(--cbrio-text)', t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)',
  border: 'var(--cbrio-border)', green: '#10b981', amber: '#f59e0b', red: '#ef4444',
};

const FIELD_LABELS = {
  nome: 'Nome',
  descricao: 'Descrição',
  data: 'Data',
  responsavel: 'Responsável',
  budget_planned: 'Orçamento previsto (R$)',
  expected_attendance: 'Público esperado',
  recorrencia: 'Recorrência',
  objetivos: 'Objetivos',
  entregas: 'Entregas previstas',
  local: 'Local',
};

export default function RevisaoModal({ proposta, etapa, onClose, onDecided }) {
  const [edited, setEdited] = useState({ ...proposta.payload_atual });
  const [comentario, setComentario] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');

  // Detecta sujidade pra mostrar "Aprovar com ressalvas" se diferente do original
  const hasChanges = Object.keys(edited).some(k => {
    return JSON.stringify(edited[k]) !== JSON.stringify(proposta.payload_atual?.[k]);
  });

  const set = (k, v) => setEdited(prev => ({ ...prev, [k]: v }));

  // Calcula só os campos alterados pra enviar (não manda payload inteiro)
  const computeAltered = () => {
    const out = {};
    Object.keys(edited).forEach(k => {
      if (JSON.stringify(edited[k]) !== JSON.stringify(proposta.payload_atual?.[k])) {
        out[k] = edited[k];
      }
    });
    return out;
  };

  const decide = async (decisao) => {
    setErr('');
    if (decisao === 'rejeitado' && !comentario.trim()) {
      setErr('Comentário é obrigatório ao rejeitar.');
      return;
    }
    setSubmitting(true);
    try {
      const body = { decisao, comentario: comentario.trim() || null };
      if (hasChanges && decisao !== 'rejeitado') body.payload_alterado = computeAltered();

      if (etapa === 'diretor') {
        await planApi.decidirDiretor(proposta.id, body);
      } else {
        await planApi.decidirDiretoria(proposta.id, body);
      }
      onDecided();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const titulo = proposta.payload_atual?.nome || proposta.payload_atual?.titulo || '(sem nome)';
  const fields = Object.keys(proposta.payload_atual || {}).filter(k => k in FIELD_LABELS);

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 950 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '95%', maxWidth: 720, maxHeight: '90vh', overflowY: 'auto', background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, zIndex: 951 }}>
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11, color: C.t3, marginBottom: 2 }}>
              {etapa === 'diretor' ? 'Decisão do diretor do setor' : 'Decisão final da diretoria'} · {proposta.setor?.nome}
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{titulo}</div>
            <div style={{ fontSize: 11, color: C.t3, marginTop: 2 }}>
              Proposto por {proposta.proposto?.name || '—'} · {proposta.tipo} · {proposta.area}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, color: C.t3, cursor: 'pointer' }}>✕</button>
        </div>

        {/* Devolutiva da 1ª etapa (se diretoria está revisando) */}
        {etapa === 'diretoria' && proposta.diretor_decisao && (
          <div style={{ padding: '12px 20px', background: 'var(--cbrio-bg)', borderBottom: `1px solid ${C.border}`, fontSize: 12 }}>
            <span style={{ fontWeight: 600, color: C.text }}>1º estágio: </span>
            <span style={{ color: proposta.diretor_decisao === 'rejeitado' ? C.red : C.green, fontWeight: 600 }}>
              {proposta.diretor_decisao}
            </span>
            {proposta.diretor_decisor?.name && <span style={{ color: C.t3 }}> por {proposta.diretor_decisor.name}</span>}
            {proposta.diretor_comentario && <div style={{ color: C.t2, marginTop: 4 }}>{proposta.diretor_comentario}</div>}
          </div>
        )}

        <div style={{ padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 12 }}>Campos da proposta</div>
          <div style={{ fontSize: 11, color: C.t3, marginBottom: 16 }}>
            Edite o que precisar. Campos alterados marcam a proposta como "aprovado com ressalvas" — o proponente recebe devolutiva com o diff.
          </div>

          {fields.map(k => {
            const orig = proposta.payload_atual?.[k];
            const cur = edited[k];
            const changed = JSON.stringify(orig) !== JSON.stringify(cur);
            const isTextarea = k === 'descricao' || k === 'objetivos' || k === 'entregas';
            const isNumber = k === 'budget_planned' || k === 'expected_attendance';
            const isDate = k === 'data';
            return (
              <div key={k} style={{ marginBottom: 14, padding: 10, borderRadius: 6, border: changed ? `1px solid ${C.amber}` : `1px solid ${C.border}`, background: changed ? `${C.amber}10` : 'transparent' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                  <label style={{ fontSize: 11, color: C.t3, fontWeight: 600 }}>{FIELD_LABELS[k]}</label>
                  {changed && <span style={{ fontSize: 10, color: C.amber, fontWeight: 600 }}>ALTERADO</span>}
                </div>
                {isTextarea ? (
                  <textarea value={cur || ''} onChange={e => set(k, e.target.value)}
                    style={{ width: '100%', padding: 8, borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 13, minHeight: 60, boxSizing: 'border-box' }} />
                ) : (
                  <input
                    type={isNumber ? 'number' : isDate ? 'date' : 'text'}
                    value={cur ?? ''} onChange={e => set(k, isNumber ? (e.target.value ? parseFloat(e.target.value) : null) : e.target.value)}
                    style={{ width: '100%', padding: 8, borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 13, boxSizing: 'border-box' }}
                  />
                )}
                {changed && (
                  <div style={{ fontSize: 10, color: C.t3, marginTop: 4 }}>
                    Original: <em>{orig === null || orig === undefined || orig === '' ? '—' : String(orig)}</em>
                  </div>
                )}
              </div>
            );
          })}

          <div style={{ marginTop: 16, marginBottom: 8 }}>
            <label style={{ fontSize: 11, color: C.t3, fontWeight: 600, display: 'block', marginBottom: 4 }}>
              Comentário {hasChanges || ' (opcional ao aprovar sem alterações; obrigatório ao rejeitar)'}
            </label>
            <textarea value={comentario} onChange={e => setComentario(e.target.value)}
              placeholder="Justifique alterações ou motivos da rejeição"
              style={{ width: '100%', padding: 8, borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 13, minHeight: 70, boxSizing: 'border-box' }} />
          </div>

          {err && (
            <div style={{ padding: '8px 12px', background: '#fee2e2', color: C.red, borderRadius: 6, fontSize: 12, marginTop: 8 }}>{err}</div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
            <button onClick={() => decide('rejeitado')} disabled={submitting}
              style={{ padding: '8px 16px', background: 'transparent', color: C.red, border: `1px solid ${C.red}`, borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: submitting ? 'wait' : 'pointer' }}>
              Rejeitar
            </button>
            <button onClick={() => decide(hasChanges ? 'aprovado_com_ressalvas' : 'aprovado')} disabled={submitting}
              style={{ padding: '8px 20px', background: C.green, color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: submitting ? 'wait' : 'pointer', opacity: submitting ? 0.6 : 1 }}>
              {submitting ? 'Salvando...' : (hasChanges ? 'Aprovar com ressalvas' : 'Aprovar')}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
