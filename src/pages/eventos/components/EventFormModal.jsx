import { useState, useEffect, useMemo } from 'react';

const C = { dark: 'var(--cbrio-text)', t2: 'var(--cbrio-text2)', border: 'var(--cbrio-border)', accent: '#00B39D' };

const RECURRENCES = [
  { value: 'unico', label: 'Único' },
  { value: 'semanal', label: 'Semanal' },
  { value: 'quinzenal', label: 'Quinzenal' },
  { value: 'mensal', label: 'Mensal' },
  { value: 'bimestral', label: 'Bimestral' },
  { value: 'trimestral', label: 'Trimestral' },
  { value: 'semestral', label: 'Semestral' },
  { value: 'anual', label: 'Anual' },
];

const STATUS_OPTIONS = [
  { value: 'no-prazo', label: 'No prazo' },
  { value: 'em-risco', label: 'Em risco' },
  { value: 'atrasado', label: 'Atrasado' },
  { value: 'concluido', label: 'Concluído' },
];

function calcOccurrences(date, recurrence) {
  if (!date || recurrence === 'unico') return [];
  const start = new Date(date + 'T12:00:00');
  const intervals = { semanal: 7, quinzenal: 14, mensal: 30, bimestral: 60, trimestral: 90, semestral: 180, anual: 365 };
  const days = intervals[recurrence] || 30;
  const dates = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(start.getTime() + i * days * 86400000);
    if (d.getFullYear() <= start.getFullYear() + 1) dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

export default function EventFormModal({ event, categories, onSave, onClose }) {
  const [f, setF] = useState({
    name: '', date: '', category_id: '', description: '', location: '', responsible: '',
    recurrence: 'unico', budget_planned: '', expected_attendance: '', status: 'no-prazo',
    notes: '', ativar_ciclo: false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (event) {
      setF({
        name: event.name || '', date: event.date?.slice(0, 10) || '',
        category_id: event.category_id || '', description: event.description || '',
        location: event.location || '', responsible: event.responsible || '',
        recurrence: event.recurrence || 'unico', budget_planned: event.budget_planned || '',
        expected_attendance: event.expected_attendance || '', status: event.status || 'no-prazo',
        notes: event.notes || '',
      });
    }
  }, [event]);

  const occurrences = useMemo(() => calcOccurrences(f.date, f.recurrence), [f.date, f.recurrence]);

  const upd = (key, val) => setF(prev => ({ ...prev, [key]: val }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!f.name || !f.date) { setError('Nome e data são obrigatórios'); return; }
    setSaving(true);
    setError('');
    try {
      const data = { ...f };
      if (data.budget_planned) data.budget_planned = parseFloat(data.budget_planned);
      if (data.expected_attendance) data.expected_attendance = parseInt(data.expected_attendance);
      if (!data.category_id) delete data.category_id;
      if (occurrences.length > 0) data.occurrence_dates = occurrences;
      await onSave(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} data-modal onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: C.dark, margin: 0 }}>
            {event ? 'Editar Evento' : 'Novo Evento'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: C.t2 }}>×</button>
        </div>

        {error && <div style={errBox}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <Field label="Nome *" value={f.name} onChange={v => upd('name', v)} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Field label="Data *" type="date" value={f.date} onChange={v => upd('date', v)} style={{ flex: 1 }} />
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Categoria</label>
              <select value={f.category_id} onChange={e => upd('category_id', e.target.value)} style={inputStyle}>
                <option value="">Sem categoria</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Status</label>
              <select value={f.status} onChange={e => upd('status', e.target.value)} style={inputStyle}>
                {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Recorrência</label>
              <select value={f.recurrence} onChange={e => upd('recurrence', e.target.value)} style={inputStyle}>
                {RECURRENCES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
          </div>

          {occurrences.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.t2, marginBottom: 4 }}>OCORRÊNCIAS ({occurrences.length})</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {occurrences.map(d => (
                  <span key={d} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, background: 'var(--cbrio-bg)', border: `1px solid ${C.border}` }}>
                    {new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')}
                  </span>
                ))}
              </div>
            </div>
          )}

          <Field label="Local" value={f.location} onChange={v => upd('location', v)} />
          <Field label="Responsável" value={f.responsible} onChange={v => upd('responsible', v)} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Field label="Orçamento R$" type="number" value={f.budget_planned} onChange={v => upd('budget_planned', v)} style={{ flex: 1 }} />
            <Field label="Público esperado" type="number" value={f.expected_attendance} onChange={v => upd('expected_attendance', v)} style={{ flex: 1 }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Descrição</label>
            <textarea value={f.description} onChange={e => upd('description', e.target.value)}
              rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Observações</label>
            <textarea value={f.notes} onChange={e => upd('notes', e.target.value)}
              rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
          </div>

          {!event && (
            <div style={{ marginBottom: 12, padding: '10px 12px', background: '#f3e8ff', borderRadius: 8, border: '1px solid #e9d5ff', display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={f.ativar_ciclo} onChange={e => upd('ativar_ciclo', e.target.checked)} id="ciclo" />
              <label htmlFor="ciclo" style={{ fontSize: 13, color: '#00B39D', fontWeight: 600, cursor: 'pointer' }}>
                Ativar Ciclo Criativo
              </label>
              <span style={{ fontSize: 11, color: 'var(--cbrio-text2)' }}>— ativa as 11 fases de produção + trilha administrativa</span>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <button type="button" onClick={onClose} style={cancelBtn}>Cancelar</button>
            <button type="submit" disabled={saving} style={{ ...saveBtn, opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Salvando...' : event ? 'Atualizar' : 'Criar Evento'}
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

const overlay = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex',
  alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16,
};
const modal = {
  background: 'var(--cbrio-card)', borderRadius: 12, padding: '24px 28px', width: '100%',
  maxWidth: 560, maxHeight: '90vh', overflowY: 'auto',
};
const labelStyle = { fontSize: 12, fontWeight: 600, color: 'var(--cbrio-text2)', display: 'block', marginBottom: 4 };
const inputStyle = {
  width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--cbrio-border)',
  fontSize: 13, color: 'var(--cbrio-text)', outline: 'none',
};
const errBox = {
  background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626',
  padding: '8px 12px', borderRadius: 8, fontSize: 12, marginBottom: 12,
};
const cancelBtn = {
  padding: '8px 16px', borderRadius: 8, border: '1px solid var(--cbrio-border)',
  background: 'var(--cbrio-card)', color: 'var(--cbrio-text2)', cursor: 'pointer', fontSize: 13, fontWeight: 600,
};
const saveBtn = {
  padding: '8px 18px', borderRadius: 8, border: 'none',
  background: '#00B39D', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600,
};
