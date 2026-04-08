import { useState, useEffect } from 'react';
import { Button } from '../../../components/ui/button';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const s = {
  toolbar:  { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  grid:     { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 },
  card:     { background: 'var(--cbrio-card)', borderRadius: 12, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.2)' },
  cardTitle:{ fontWeight: 700, fontSize: 15, color: 'var(--cbrio-text)', marginBottom: 6 },
  cardMeta: { fontSize: 12, color: 'var(--cbrio-text2)', marginBottom: 4 },
  badge:    { display: 'inline-block', background: '#f59e0b18', color: '#f59e0b', borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 600 },
  empty:    { textAlign: 'center', padding: '48px 0', color: 'var(--cbrio-text3)', fontSize: 14 },
};

async function getToken() {
  const { supabase } = await import('../../../supabaseClient');
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token;
}

export default function TabTreinamentos() {
  const [treinamentos, setTreinamentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [form, setForm] = useState({ titulo: '', data_inicio: '', data_fim: '', instrutor: '', obrigatorio: false });
  const [formError, setFormError] = useState('');

  async function fetchTreinamentos() {
    setLoading(true);
    const token = await getToken();
    const res = await fetch(`${API}/api/rh/treinamentos`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    setTreinamentos(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  useEffect(() => { fetchTreinamentos(); }, []);

  async function handleSalvar(e) {
    e.preventDefault();
    const token = await getToken();
    const res = await fetch(`${API}/api/rh/treinamentos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(form),
    });
    if (res.ok) { setMostrarForm(false); setForm({ titulo: '', data_inicio: '', data_fim: '', instrutor: '', obrigatorio: false }); fetchTreinamentos(); }
    else { const d = await res.json(); setFormError(d.error); }
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  return (
    <div>
      <div style={s.toolbar}>
        <span style={{ fontSize: 14, color: 'var(--cbrio-text2)' }}>{treinamentos.length} treinamento(s)</span>
        <Button onClick={() => setMostrarForm(!mostrarForm)}>
          {mostrarForm ? 'Cancelar' : '+ Novo Treinamento'}
        </Button>
      </div>

      {mostrarForm && (
        <form onSubmit={handleSalvar} style={{ background: 'var(--cbrio-card)', borderRadius: 12, padding: 20, marginBottom: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 5 }}>Título *</label>
              <input required value={form.titulo} onChange={set('titulo')} style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--cbrio-border)', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }} />
            </div>
            {[['data_inicio','Data início *','date',true],['data_fim','Data fim','date',false],['instrutor','Instrutor','text',false]].map(([k,l,t,r]) => (
              <div key={k}>
                <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 5, marginTop: 12 }}>{l}</label>
                <input type={t} required={r} value={form[k]} onChange={set(k)} style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--cbrio-border)', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }} />
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 20 }}>
              <input type="checkbox" id="obrig" checked={form.obrigatorio} onChange={set('obrigatorio')} />
              <label htmlFor="obrig" style={{ fontSize: 13, fontWeight: 600 }}>Treinamento obrigatório</label>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <Button type="submit">Salvar Treinamento</Button>
          </div>
        </form>
      )}

      {loading ? (
        <div style={s.empty}>Carregando...</div>
      ) : treinamentos.length === 0 ? (
        <div style={s.empty}>Nenhum treinamento cadastrado.</div>
      ) : (
        <div style={s.grid}>
          {treinamentos.map((t) => {
            const inscritos = t.rh_treinamentos_funcionarios?.length ?? 0;
            const concluidos = t.rh_treinamentos_funcionarios?.filter((x) => x.status === 'concluido').length ?? 0;
            return (
              <div key={t.id} style={s.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div style={s.cardTitle}>{t.titulo}</div>
                  {t.obrigatorio && <span style={s.badge}>Obrigatório</span>}
                </div>
                <div style={s.cardMeta}>📅 {new Date(t.data_inicio).toLocaleDateString('pt-BR')}{t.data_fim ? ` – ${new Date(t.data_fim).toLocaleDateString('pt-BR')}` : ''}</div>
                {t.instrutor && <div style={s.cardMeta}>👤 {t.instrutor}</div>}
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--cbrio-border)', fontSize: 13, color: 'var(--cbrio-text)' }}>
                  <span>{inscritos} inscritos</span> · <span style={{ color: '#16a34a' }}>{concluidos} concluídos</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
