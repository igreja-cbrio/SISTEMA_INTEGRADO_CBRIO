import { useState, useEffect } from 'react';
import { Button } from '../../../components/ui/button';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const TIPO_LABEL = { ferias: '🏖️ Férias', licenca_medica: '🏥 Licença Médica', licenca_maternidade: '👶 Maternidade', licenca_paternidade: '👨‍👦 Paternidade', outro: '📋 Outro' };
const STATUS_COLOR = { pendente: '#d97706', aprovado: '#16a34a', rejeitado: '#dc2626' };

const s = {
  toolbar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  table:   { width: '100%', background: 'var(--cbrio-card)', borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.2)', borderCollapse: 'collapse', overflow: 'hidden' },
  th:      { textAlign: 'left', padding: '12px 16px', fontSize: 12, fontWeight: 600, color: 'var(--cbrio-text2)', textTransform: 'uppercase', background: 'var(--cbrio-table-header)', borderBottom: '1px solid var(--cbrio-border)' },
  td:      { padding: '12px 16px', fontSize: 14, color: 'var(--cbrio-text)', borderBottom: '1px solid var(--cbrio-border)' },
  badge:   { display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600 },
  empty:   { textAlign: 'center', padding: '48px 0', color: 'var(--cbrio-text3)', fontSize: 14 },
  input:   { width: '100%', padding: '9px 12px', border: '1px solid var(--cbrio-border)', borderRadius: 8, fontSize: 14, boxSizing: 'border-box', background: 'var(--cbrio-input-bg)', color: 'var(--cbrio-text)', outline: 'none' },
  label:   { fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 5, color: 'var(--cbrio-text)' },
};

async function getToken() {
  const { supabase } = await import('../../../supabaseClient');
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token;
}

function calcSaldoFerias(func, feriasAprovadas) {
  if (!func.data_admissao) return null;
  const admissao = new Date(func.data_admissao + 'T12:00:00');
  const hoje = new Date();
  const mesesTrab = Math.floor((hoje - admissao) / (30.44 * 86400000));
  const periodos = Math.floor(mesesTrab / 12);
  const diasAdquiridos = periodos * 30;
  const diasUsados = (feriasAprovadas || [])
    .filter(f => f.funcionario_id === func.id && f.tipo === 'ferias' && f.status === 'aprovado')
    .reduce((sum, f) => sum + Math.ceil((new Date(f.data_fim) - new Date(f.data_inicio)) / 86400000), 0);
  const saldo = diasAdquiridos - diasUsados;
  const mesesProxPeriodo = 12 - (mesesTrab % 12);
  // CLT: férias devem ser gozadas dentro de 12 meses após o período aquisitivo.
  // Se saldo > 30, há mais de 1 período acumulado → risco de prescrição.
  const prescricao = saldo > 30;
  // Férias vencidas: saldo de período anterior ao atual que não foi usado
  const diasVencidos = Math.max(0, saldo - 30);
  return { mesesTrab, periodos, diasAdquiridos, diasUsados, saldo, mesesProxPeriodo, prescricao, diasVencidos };
}

export default function TabFerias() {
  const [ferias, setFerias] = useState([]);
  const [allFerias, setAllFerias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState('pendente');
  const [mostrarForm, setMostrarForm] = useState(false);
  const [funcionarios, setFuncionarios] = useState([]);
  const [showSaldos, setShowSaldos] = useState(false);
  const [localError, setLocalError] = useState('');
  const [form, setForm] = useState({ funcionario_id: '', tipo: 'ferias', data_inicio: '', data_fim: '', observacoes: '' });

  async function fetchFerias() {
    setLoading(true);
    const token = await getToken();
    const params = filtroStatus ? `?status=${filtroStatus}` : '';
    const res = await fetch(`${API}/api/rh/ferias${params}`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    setFerias(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  async function fetchFuncionarios() {
    const token = await getToken();
    const res = await fetch(`${API}/api/rh/funcionarios?status=ativo`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    setFuncionarios(Array.isArray(data) ? data : []);
  }

  async function fetchAllAprovadas() {
    const token = await getToken();
    const res = await fetch(`${API}/api/rh/ferias?status=aprovado`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    setAllFerias(Array.isArray(data) ? data : []);
  }

  useEffect(() => { fetchFerias(); }, [filtroStatus]);
  useEffect(() => { fetchFuncionarios(); fetchAllAprovadas(); }, []);

  async function handleSalvar(e) {
    e.preventDefault();
    if (form.data_inicio && form.data_fim && form.data_fim < form.data_inicio) {
      setLocalError('A data de fim deve ser igual ou posterior à data de início.');
      return;
    }
    setLocalError('');
    const token = await getToken();
    const res = await fetch(`${API}/api/rh/ferias`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(form),
    });
    if (res.ok) { setMostrarForm(false); fetchFerias(); }
    else { const d = await res.json(); setLocalError(d.error); }
  }

  async function handleAprovar(id, status) {
    const token = await getToken();
    await fetch(`${API}/api/rh/ferias/${id}/aprovar`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status }),
    });
    fetchFerias();
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div>
      <div style={s.toolbar}>
        <div style={{ display: 'flex', gap: 8 }}>
          {['pendente', 'aprovado', 'rejeitado', ''].map((st) => (
            <Button
              key={st || 'todos'}
              variant={filtroStatus === st ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFiltroStatus(st)}
              className="rounded-full"
            >
              {st || 'Todos'}
            </Button>
          ))}
        </div>
        <Button onClick={() => setMostrarForm(!mostrarForm)}>
          {mostrarForm ? 'Cancelar' : '+ Solicitar'}
        </Button>
      </div>

      {/* Saldo de Férias */}
      <Button
        variant="ghost"
        className="w-full justify-between mb-4 text-left"
        style={{ background: 'var(--cbrio-input-bg)', border: '1px solid var(--cbrio-border)' }}
        onClick={() => setShowSaldos(!showSaldos)}
      >
        <span>📊 Saldo de Férias por Colaborador (CLT)</span>
        <span style={{ fontSize: 12, transform: showSaldos ? 'rotate(180deg)' : '', transition: 'transform 0.2s', display: 'inline-block' }}>▼</span>
      </Button>
      {showSaldos && (
        <div style={{ background: 'var(--cbrio-card)', borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.2)', marginBottom: 20, overflow: 'hidden' }}>
          <table style={s.table}>
            <thead><tr>
              <th style={s.th}>Colaborador</th>
              <th style={s.th}>Meses Trab.</th>
              <th style={s.th}>Períodos</th>
              <th style={s.th}>Adquiridos</th>
              <th style={s.th}>Usados</th>
              <th style={s.th}>Saldo</th>
              <th style={s.th}>Próx. Período</th>
            </tr></thead>
            <tbody>
              {funcionarios
                .filter(f => f.tipo_contrato === 'clt' && f.status === 'ativo')
                .map(func => {
                  const sal = calcSaldoFerias(func, allFerias);
                  if (!sal) return null;
                  const saldoColor = sal.saldo > 20 ? '#ef4444' : sal.saldo > 0 ? '#f59e0b' : '#10b981';
                  return (
                    <tr key={func.id}>
                      <td style={s.td}>
                        <div style={{ fontWeight: 600 }}>{func.nome}</div>
                        <div style={{ fontSize: 12, color: 'var(--cbrio-text3)' }}>{func.cargo}</div>
                      </td>
                      <td style={s.td}>{sal.mesesTrab}</td>
                      <td style={s.td}>{sal.periodos}</td>
                      <td style={s.td}>{sal.diasAdquiridos} dias</td>
                      <td style={s.td}>{sal.diasUsados} dias</td>
                      <td style={{ ...s.td, fontWeight: 700, color: saldoColor }}>
                        {sal.saldo} dias
                        {sal.prescricao && <span style={{ display: 'block', fontSize: 10, color: '#ef4444', fontWeight: 600 }}>⚠ {sal.diasVencidos}d em prescrição</span>}
                      </td>
                      <td style={s.td}><span style={{ fontSize: 12, color: 'var(--cbrio-text3)' }}>em {sal.mesesProxPeriodo} meses</span></td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}

      {localError && <div style={{ color: '#ef4444', background: '#ef444418', border: '1px solid #ef444450', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 13 }}>{localError}</div>}

      {mostrarForm && (
        <form onSubmit={handleSalvar} style={{ background: 'var(--cbrio-card)', borderRadius: 12, padding: 20, marginBottom: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={s.label}>Colaborador *</label>
              <select required value={form.funcionario_id} onChange={set('funcionario_id')} style={s.input}>
                <option value="">Selecione...</option>
                {funcionarios.map((f) => <option key={f.id} value={f.id}>{f.nome} — {f.cargo}</option>)}
              </select>
            </div>
            <div>
              <label style={{ ...s.label, marginTop: 12 }}>Tipo</label>
              <select value={form.tipo} onChange={set('tipo')} style={s.input}>
                {Object.entries(TIPO_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            {[['data_inicio','Início *',true],['data_fim','Fim *',true]].map(([k,l,r]) => (
              <div key={k}>
                <label style={{ ...s.label, marginTop: 12 }}>{l}</label>
                <input type="date" required={r} value={form[k]} onChange={set(k)} style={s.input} />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <Button type="submit">Registrar Solicitação</Button>
          </div>
        </form>
      )}

      {loading ? (
        <div style={s.empty}>Carregando...</div>
      ) : ferias.length === 0 ? (
        <div style={s.empty}>Nenhum registro encontrado.</div>
      ) : (
        <table style={s.table}>
          <thead>
            <tr>{['Colaborador', 'Tipo', 'Início', 'Fim', 'Dias', 'Status', ''].map(h => <th key={h} style={s.th}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {ferias.map((f) => {
              const dias = Math.ceil((new Date(f.data_fim) - new Date(f.data_inicio)) / 86400000);
              return (
                <tr key={f.id}>
                  <td style={s.td}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {f.rh_funcionarios?.foto_url ? (
                        <img src={f.rh_funcionarios.foto_url} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#00B39D18', color: '#00B39D', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
                          {(f.rh_funcionarios?.nome || '?')[0].toUpperCase()}
                        </div>
                      )}
                      <div>
                        <div style={{ fontWeight: 600 }}>{f.rh_funcionarios?.nome}</div>
                        <div style={{ fontSize: 12, color: 'var(--cbrio-text3)' }}>{f.rh_funcionarios?.cargo}</div>
                      </div>
                    </div>
                  </td>
                  <td style={s.td}>{TIPO_LABEL[f.tipo] ?? f.tipo}</td>
                  <td style={s.td}>{new Date(f.data_inicio).toLocaleDateString('pt-BR')}</td>
                  <td style={s.td}>{new Date(f.data_fim).toLocaleDateString('pt-BR')}</td>
                  <td style={s.td}>{dias}</td>
                  <td style={s.td}>
                    <span style={{ ...s.badge, color: STATUS_COLOR[f.status], background: STATUS_COLOR[f.status] + '18' }}>
                      {f.status.charAt(0).toUpperCase() + f.status.slice(1)}
                    </span>
                  </td>
                  <td style={s.td}>
                    {f.status === 'pendente' && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <Button variant="success" size="xs" onClick={() => handleAprovar(f.id, 'aprovado')}>Aprovar</Button>
                        <Button variant="destructive" size="xs" onClick={() => handleAprovar(f.id, 'rejeitado')}>Rejeitar</Button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
