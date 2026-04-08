import { useState, useEffect } from 'react';

export default function TaskFormModal({ task, onSave, onClose }) {
  const [f, setF] = useState({
    name: '', responsible: '', area: '', start_date: '', deadline: '',
    status: 'pendente', priority: 'media', is_milestone: false, description: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (task) {
      setF({
        name: task.name || '', responsible: task.responsible || '', area: task.area || '',
        start_date: task.start_date?.slice(0, 10) || '', deadline: task.deadline?.slice(0, 10) || '',
        status: task.status || 'pendente', priority: task.priority || 'media',
        is_milestone: task.is_milestone || false, description: task.description || '',
      });
    }
  }, [task]);

  const upd = (key, val) => setF(prev => ({ ...prev, [key]: val }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!f.name) { setError('Nome é obrigatório'); return; }
    setSaving(true);
    try {
      await onSave(f);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--cbrio-text)', margin: 0 }}>
            {task ? 'Editar Tarefa' : 'Nova Tarefa'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--cbrio-text2)' }}>×</button>
        </div>

        {error && <div style={errBox}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <Field label="Nome *" value={f.name} onChange={v => upd('name', v)} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Field label="Responsável" value={f.responsible} onChange={v => upd('responsible', v)} style={{ flex: 1 }} />
            <Field label="Área" value={f.area} onChange={v => upd('area', v)} style={{ flex: 1 }} />
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Field label="Data início" type="date" value={f.start_date} onChange={v => upd('start_date', v)} style={{ flex: 1 }} />
            <Field label="Prazo" type="date" value={f.deadline} onChange={v => upd('deadline', v)} style={{ flex: 1 }} />
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, marginBottom: 12 }}>
              <label style={labelStyle}>Status</label>
              <select value={f.status} onChange={e => upd('status', e.target.value)} style={inputStyle}>
                <option value="pendente">Pendente</option>
                <option value="em-andamento">Em andamento</option>
                <option value="concluida">Concluída</option>
              </select>
            </div>
            <div style={{ flex: 1, marginBottom: 12 }}>
              <label style={labelStyle}>Prioridade</label>
              <select value={f.priority} onChange={e => upd('priority', e.target.value)} style={inputStyle}>
                <option value="baixa">Baixa</option>
                <option value="media">Média</option>
                <option value="alta">Alta</option>
                <option value="urgente">Urgente</option>
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={f.is_milestone} onChange={e => upd('is_milestone', e.target.checked)} />
            <label style={{ fontSize: 13, color: 'var(--cbrio-text)' }}>É marco (milestone)</label>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Descrição</label>
            <textarea value={f.description} onChange={e => upd('description', e.target.value)}
              rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <button type="button" onClick={onClose} style={cancelBtn}>Cancelar</button>
            <button type="submit" disabled={saving} style={{ ...saveBtn, opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Salvando...' : task ? 'Atualizar' : 'Criar Tarefa'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', style = {} }) {
  return (
    <div style={{ marginBottom: 12, ...style }}>
      <label style={labelStyle}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} style={inputStyle} />
    </div>
  );
}

const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 };
const modal = { background: 'var(--cbrio-card)', borderRadius: 12, padding: '24px 28px', width: '100%', maxWidth: 500, maxHeight: '90vh', overflowY: 'auto' };
const labelStyle = { fontSize: 12, fontWeight: 600, color: 'var(--cbrio-text2)', display: 'block', marginBottom: 4 };
const inputStyle = { width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--cbrio-border)', fontSize: 13, color: 'var(--cbrio-text)', outline: 'none' };
const errBox = { background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', padding: '8px 12px', borderRadius: 8, fontSize: 12, marginBottom: 12 };
const cancelBtn = { padding: '8px 16px', borderRadius: 8, border: '1px solid var(--cbrio-border)', background: 'var(--cbrio-card)', color: 'var(--cbrio-text2)', cursor: 'pointer', fontSize: 13, fontWeight: 600 };
const saveBtn = { padding: '8px 18px', borderRadius: 8, border: 'none', background: '#00B39D', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 };
