import { useState } from 'react';

export default function MeetingFormModal({ onSave, onClose }) {
  const [f, setF] = useState({
    title: '', date: '', participants: '', decisions: '', notes: '',
  });
  const [pendencies, setPendencies] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const upd = (key, val) => setF(prev => ({ ...prev, [key]: val }));

  const addPendency = () => {
    setPendencies(prev => [...prev, { description: '', responsible: '', area: '', deadline: '' }]);
  };

  const updPendency = (idx, key, val) => {
    setPendencies(prev => prev.map((p, i) => i === idx ? { ...p, [key]: val } : p));
  };

  const removePendency = (idx) => {
    setPendencies(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!f.title || !f.date) { setError('Título e data são obrigatórios'); return; }
    setSaving(true);
    try {
      const data = {
        title: f.title,
        date: f.date,
        participants: f.participants ? f.participants.split(',').map(p => p.trim()).filter(Boolean) : [],
        decisions: f.decisions,
        notes: f.notes,
        pendencies: pendencies.filter(p => p.description),
      };
      await onSave(data);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--cbrio-text)', margin: 0 }}>Nova Reunião</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--cbrio-text2)' }}>×</button>
        </div>

        {error && <div style={errBox}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <Field label="Título *" value={f.title} onChange={v => upd('title', v)} />
          <Field label="Data *" type="date" value={f.date} onChange={v => upd('date', v)} />
          <Field label="Participantes (separados por vírgula)" value={f.participants} onChange={v => upd('participants', v)} />
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Decisões tomadas</label>
            <textarea value={f.decisions} onChange={e => upd('decisions', e.target.value)}
              rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Observações</label>
            <textarea value={f.notes} onChange={e => upd('notes', e.target.value)}
              rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
          </div>

          {/* Pendências */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <label style={{ ...labelStyle, marginBottom: 0 }}>Pendências</label>
              <button type="button" onClick={addPendency} style={addBtn}>+ Adicionar</button>
            </div>
            {pendencies.map((p, i) => (
              <div key={i} style={{ background: 'var(--cbrio-table-header)', borderRadius: 8, padding: 10, marginBottom: 6, border: '1px solid var(--cbrio-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--cbrio-text2)' }}>Pendência {i + 1}</span>
                  <button type="button" onClick={() => removePendency(i)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 14 }}>×</button>
                </div>
                <input placeholder="Descrição" value={p.description} onChange={e => updPendency(i, 'description', e.target.value)}
                  style={{ ...inputStyle, marginBottom: 6 }} />
                <div style={{ display: 'flex', gap: 6 }}>
                  <input placeholder="Responsável" value={p.responsible} onChange={e => updPendency(i, 'responsible', e.target.value)}
                    style={{ ...inputStyle, flex: 1 }} />
                  <input placeholder="Área" value={p.area} onChange={e => updPendency(i, 'area', e.target.value)}
                    style={{ ...inputStyle, flex: 1 }} />
                  <input type="date" value={p.deadline} onChange={e => updPendency(i, 'deadline', e.target.value)}
                    style={{ ...inputStyle, flex: 1 }} />
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <button type="button" onClick={onClose} style={cancelBtn}>Cancelar</button>
            <button type="submit" disabled={saving} style={{ ...saveBtn, opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Salvando...' : 'Criar Reunião'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text' }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={labelStyle}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} style={inputStyle} />
    </div>
  );
}

const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 };
const modal = { background: 'var(--cbrio-card)', borderRadius: 12, padding: '24px 28px', width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' };
const labelStyle = { fontSize: 12, fontWeight: 600, color: 'var(--cbrio-text2)', display: 'block', marginBottom: 4 };
const inputStyle = { width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--cbrio-border)', fontSize: 13, color: 'var(--cbrio-text)', outline: 'none' };
const errBox = { background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', padding: '8px 12px', borderRadius: 8, fontSize: 12, marginBottom: 12 };
const cancelBtn = { padding: '8px 16px', borderRadius: 8, border: '1px solid var(--cbrio-border)', background: 'var(--cbrio-card)', color: 'var(--cbrio-text2)', cursor: 'pointer', fontSize: 13, fontWeight: 600 };
const saveBtn = { padding: '8px 18px', borderRadius: 8, border: 'none', background: '#00B39D', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 };
const addBtn = { background: 'none', border: 'none', color: '#00B39D', cursor: 'pointer', fontWeight: 600, fontSize: 12, padding: 0 };
