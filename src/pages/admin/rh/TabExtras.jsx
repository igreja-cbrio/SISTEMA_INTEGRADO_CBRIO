import { useState, useEffect } from 'react';
import { rh } from '../../../api';
import { Button } from '../../../components/ui/button';
import { Plus, X, Clock, Settings, Trash2, CalendarDays } from 'lucide-react';

const C = {
  primary: '#00B39D', primaryBg: '#00B39D18',
  text: 'var(--cbrio-text)', text2: 'var(--cbrio-text2)', text3: 'var(--cbrio-text3)',
  border: 'var(--cbrio-border)', card: 'var(--cbrio-card)',
  green: '#10b981', greenBg: '#10b98118',
  red: '#ef4444', redBg: '#ef444418', amber: '#f59e0b', amberBg: '#f59e0b18',
  blue: '#3b82f6', blueBg: '#3b82f618',
};

const STATUS_MAP = {
  agendado: { c: C.blue, bg: C.blueBg, label: 'Agendado' },
  confirmado: { c: C.amber, bg: C.amberBg, label: 'Confirmado' },
  realizado: { c: C.green, bg: C.greenBg, label: 'Realizado' },
  cancelado: { c: C.red, bg: C.redBg, label: 'Cancelado' },
};

const inputStyle = { width: '100%', padding: '10px 12px', background: 'var(--cbrio-input-bg)', border: '1px solid var(--cbrio-border)', borderRadius: 8, color: 'var(--cbrio-text)', fontSize: 13, outline: 'none' };

export default function TabExtras({ funcionarios, onRefresh }) {
  const [extras, setExtras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [valorPadrao, setValorPadrao] = useState('150.00');
  const [showConfig, setShowConfig] = useState(false);
  const [form, setForm] = useState({
    funcionario_id: '', titulo: '', descricao: '', data: '',
    horario_inicio: '08:00', horario_fim: '17:00', valor: '', observacoes: '',
  });

  useEffect(() => { load(); loadConfig(); }, []);

  async function load() {
    try {
      setError('');
      const data = await rh.extras.list();
      setExtras(data);
    } catch (e) {
      setError(e.message || 'Erro ao buscar extras');
    } finally { setLoading(false); }
  }

  async function loadConfig() {
    try {
      const cfg = await rh.config.get();
      if (cfg.valor_extra_padrao) setValorPadrao(cfg.valor_extra_padrao);
    } catch { }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (form.horario_fim && form.horario_inicio && form.horario_fim <= form.horario_inicio) {
      setError('O horário de fim deve ser posterior ao horário de início.');
      return;
    }
    try {
      await rh.extras.create({ ...form, valor: form.valor || valorPadrao });
      setShowModal(false);
      setForm({ funcionario_id: '', titulo: '', descricao: '', data: '', horario_inicio: '08:00', horario_fim: '17:00', valor: '', observacoes: '' });
      load();
      onRefresh?.();
    } catch (err) { setError(err.message); }
  }

  async function updateStatus(id, status) {
    try { await rh.extras.update(id, { status }); load(); } catch { }
  }

  async function remove(id) {
    try { await rh.extras.remove(id); load(); } catch { }
  }

  async function saveValorPadrao() {
    try { await rh.config.set('valor_extra_padrao', valorPadrao); setShowConfig(false); } catch { }
  }

  return (
    <div style={{ minHeight: 200 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: C.text2 }}>Valor padrão: <strong style={{ color: C.primary }}>R$ {Number(valorPadrao).toFixed(2)}</strong></span>
          <Button variant="ghost" size="icon-xs" onClick={() => setShowConfig(!showConfig)}><Settings className="h-3.5 w-3.5" /></Button>
        </div>
        <Button className="gap-1.5" onClick={() => { setForm(f => ({ ...f, valor: valorPadrao })); setShowModal(true); }}>
          <Plus className="h-4 w-4" /> Nova Escala
        </Button>
      </div>

      {showConfig && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, padding: '12px 16px', background: 'var(--cbrio-input-bg)', borderRadius: 10, border: `1px solid ${C.border}` }}>
          <label style={{ fontSize: 13, color: C.text2 }}>Valor padrão R$</label>
          <input type="number" step="0.01" value={valorPadrao} onChange={e => setValorPadrao(e.target.value)} style={{ ...inputStyle, width: 100 }} />
          <Button size="xs" onClick={saveValorPadrao}>Salvar</Button>
        </div>
      )}

      {error && (
        <div style={{ color: C.red, background: C.redBg, border: `1px solid ${C.red}`, borderRadius: 8, padding: '10px 16px', marginBottom: 16, fontSize: 13, fontWeight: 500 }}>
          {error}
        </div>
      )}

      <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
          <thead>
            <tr>
              {['Data', 'Colaborador', 'Serviço', 'Horário', 'Valor', 'Status', ''].map((h, i) => (
                <th key={i} style={{ textAlign: 'left', padding: '12px 16px', fontSize: 11, fontWeight: 600, color: C.text3, textTransform: 'uppercase', letterSpacing: 0.5, background: 'var(--cbrio-table-header)', borderBottom: `1px solid ${C.border}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: C.text3 }}>Carregando...</td></tr>
            ) : extras.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: C.text3 }}>Nenhuma escala de extra.</td></tr>
            ) : extras.map(ex => {
              const st = STATUS_MAP[ex.status] || STATUS_MAP.agendado;
              return (
                <tr key={ex.id}>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: C.text, borderBottom: `1px solid ${C.border}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <CalendarDays style={{ width: 14, height: 14, color: C.text3 }} />
                      {new Date(ex.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })}
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 500, color: C.text, borderBottom: `1px solid ${C.border}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {ex.funcionario?.foto_url ? (
                        <img src={ex.funcionario.foto_url} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#00B39D18', color: '#00B39D', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                          {(ex.funcionario?.nome || '?')[0].toUpperCase()}
                        </div>
                      )}
                      {ex.funcionario?.nome || '—'}
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}` }}>
                    <div style={{ fontSize: 13, color: C.text }}>{ex.titulo}</div>
                    {ex.descricao && <div style={{ fontSize: 11, color: C.text3, marginTop: 2 }}>{ex.descricao}</div>}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: C.text2, borderBottom: `1px solid ${C.border}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Clock style={{ width: 12, height: 12 }} />{ex.horario_inicio?.slice(0, 5)} - {ex.horario_fim?.slice(0, 5)}</div>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: C.primary, borderBottom: `1px solid ${C.border}` }}>R$ {Number(ex.valor).toFixed(2)}</td>
                  <td style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}` }}>
                    <select value={ex.status} onChange={e => updateStatus(ex.id, e.target.value)}
                      style={{ padding: '4px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, color: st.c, background: st.bg, border: 'none', cursor: 'pointer' }}>
                      {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}` }}>
                    <Button variant="ghost" size="icon-xs" onClick={() => remove(ex.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex' }}>
          <div style={{ flex: 1, background: 'rgba(0,0,0,0.5)' }} onClick={() => setShowModal(false)} />
          <div style={{ width: '45%', minWidth: 400, maxWidth: 520, background: 'var(--cbrio-modal-bg)', overflowY: 'auto', boxShadow: '-8px 0 30px rgba(0,0,0,0.3)', animation: 'slideInRight 0.25s ease-out' }}>
            <div style={{ padding: '20px 24px 12px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: 0 }}>Nova Escala de Extra</h3>
              <Button variant="ghost" size="icon-xs" onClick={() => setShowModal(false)}><X className="h-4 w-4" /></Button>
            </div>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '16px 24px 24px' }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: C.text2, display: 'block', marginBottom: 4 }}>Colaborador *</label>
                <select required value={form.funcionario_id} onChange={e => setForm(f => ({ ...f, funcionario_id: e.target.value }))} style={inputStyle}>
                  <option value="">Selecione...</option>
                  {funcionarios.filter(f => f.status === 'ativo').map(f => <option key={f.id} value={f.id}>{f.nome} — {f.cargo}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: C.text2, display: 'block', marginBottom: 4 }}>Título do serviço *</label>
                <input required value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} placeholder="Ex: Plantão Domingo Páscoa" style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: C.text2, display: 'block', marginBottom: 4 }}>Descrição</label>
                <textarea value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: C.text2, display: 'block', marginBottom: 4 }}>Data *</label>
                  <input required type="date" value={form.data} onChange={e => setForm(f => ({ ...f, data: e.target.value }))} style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: C.text2, display: 'block', marginBottom: 4 }}>Início *</label>
                  <input required type="time" value={form.horario_inicio} onChange={e => setForm(f => ({ ...f, horario_inicio: e.target.value }))} style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: C.text2, display: 'block', marginBottom: 4 }}>Fim *</label>
                  <input required type="time" value={form.horario_fim} onChange={e => setForm(f => ({ ...f, horario_fim: e.target.value }))} style={inputStyle} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: C.text2, display: 'block', marginBottom: 4 }}>Valor R$ *</label>
                <input required type="number" step="0.01" value={form.valor} onChange={e => setForm(f => ({ ...f, valor: e.target.value }))} placeholder={valorPadrao} style={inputStyle} />
              </div>
              <Button type="submit" className="w-full mt-1">Escalar Colaborador</Button>
              <p style={{ fontSize: 11, color: C.text3, textAlign: 'center', margin: 0 }}>O colaborador receberá uma notificação com os detalhes.</p>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
