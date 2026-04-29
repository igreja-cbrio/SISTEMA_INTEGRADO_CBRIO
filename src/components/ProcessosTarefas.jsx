/**
 * Componente compartilhado de tarefas/processos.
 * Mostra processos da area como to-do list + permite preencher KPIs.
 * Usa em qualquer modulo ministerial via <ProcessosTarefas area="Cuidados" />
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { processos as api } from '../api';
import { INDICADORES, getIndicadoresByArea, getAreaNome } from '../data/indicadores';

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', text: 'var(--cbrio-text)',
  t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)', border: 'var(--cbrio-border)',
  inputBg: 'var(--cbrio-input-bg)', primary: '#00B39D', primaryBg: '#e6f7f5',
  green: '#10b981', greenBg: '#d1fae5', amber: '#f59e0b', amberBg: '#fef3c7',
  blue: '#3b82f6', blueBg: '#dbeafe', purple: '#8b5cf6', purpleBg: '#ede9fe',
};

const inp = { width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid var(--cbrio-border)`, background: 'var(--cbrio-input-bg)', color: 'var(--cbrio-text)', fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit' };

export default function ProcessosTarefas({ area }) {
  const { isAdmin, isDiretor, profile } = useAuth();
  const canWrite = isAdmin || isDiretor;

  const [processos, setProcessos] = useState([]);
  const [registros, setRegistros] = useState([]);
  const [agenda, setAgenda] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fillId, setFillId] = useState(null); // processo id being filled
  const [fillForm, setFillForm] = useState({ indicador_id: '', valor: '', periodo: '', observacoes: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [procs, regs, ag] = await Promise.all([
        api.list({ area, status: 'ativo' }),
        api.registros.list({ indicador_id: '' }).catch(() => []),
        api.agenda.list({ area }).catch(() => []),
      ]);
      setProcessos(procs);
      setRegistros(regs);
      setAgenda(ag);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [area]);

  useEffect(() => { load(); }, [load]);

  // Map: indicador_id -> last registro date
  const lastFill = useMemo(() => {
    const m = {};
    registros.forEach(r => {
      if (!m[r.indicador_id] || r.data_preenchimento > m[r.indicador_id].data_preenchimento) {
        m[r.indicador_id] = r;
      }
    });
    return m;
  }, [registros]);

  // Map: indicador_id -> dia_semana from agenda
  const agendaMap = useMemo(() => {
    const m = {};
    agenda.forEach(a => { m[a.indicador_id] = a.dia_semana; });
    return m;
  }, [agenda]);

  const today = new Date().getDay(); // 0=dom, 6=sab
  const todayStr = new Date().toISOString().slice(0, 10);

  // Sort: today's tasks first, then by name
  const sorted = useMemo(() => {
    return [...processos].sort((a, b) => {
      const aToday = (a.indicador_ids || []).some(id => agendaMap[id] === today);
      const bToday = (b.indicador_ids || []).some(id => agendaMap[id] === today);
      if (aToday && !bToday) return -1;
      if (!aToday && bToday) return 1;
      return (a.nome || '').localeCompare(b.nome || '');
    });
  }, [processos, agendaMap, today]);

  const submitFill = async () => {
    if (!fillForm.indicador_id || !fillForm.valor) return;
    setSaving(true);
    try {
      await api.registros.create({
        processo_id: fillId,
        indicador_id: fillForm.indicador_id,
        valor: Number(fillForm.valor),
        periodo: fillForm.periodo || null,
        observacoes: fillForm.observacoes || null,
      });
      setFillId(null);
      setFillForm({ indicador_id: '', valor: '', periodo: '', observacoes: '' });
      load();
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const DIAS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: C.t3 }}>Carregando tarefas...</div>;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: C.text }}>
            Tarefas - {getAreaNome(area)}
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: C.t3 }}>
            {sorted.length} processos | Hoje: {DIAS_SHORT[today]}
          </p>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: C.t3, background: C.card, borderRadius: 12, border: `1px solid ${C.border}` }}>
          Nenhum processo cadastrado para esta area
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {sorted.map(p => {
            const kpis = (p.indicador_ids || []).map(id => INDICADORES.find(k => k.id === id)).filter(Boolean);
            const isToday = kpis.some(k => agendaMap[k.id] === today);
            const allFilled = kpis.length > 0 && kpis.every(k => lastFill[k.id]?.data_preenchimento === todayStr);
            const isFilling = fillId === p.id;

            return (
              <div key={p.id} style={{
                background: C.card, border: `1px solid ${isToday ? C.primary : C.border}`,
                borderRadius: 12, padding: 14, borderLeft: `4px solid ${allFilled ? C.green : isToday ? C.primary : C.border}`,
              }}>
                {/* Task header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {/* Check icon */}
                    <div style={{
                      width: 24, height: 24, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: allFilled ? C.green : 'transparent',
                      border: allFilled ? 'none' : `2px solid ${C.border}`,
                      color: '#fff', fontSize: 14, fontWeight: 700,
                    }}>
                      {allFilled ? '\u2713' : ''}
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: allFilled ? C.t3 : C.text, textDecoration: allFilled ? 'line-through' : 'none' }}>
                        {p.nome}
                      </div>
                      {p.descricao && <div style={{ fontSize: 12, color: C.t3, marginTop: 2 }}>{p.descricao}</div>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {isToday && !allFilled && (
                      <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: C.primaryBg, color: C.primary }}>Hoje</span>
                    )}
                    {kpis.map(k => {
                      const dia = agendaMap[k.id];
                      return dia !== undefined ? (
                        <span key={k.id} style={{ padding: '2px 6px', borderRadius: 8, fontSize: 10, background: dia === today ? C.primaryBg : `${C.border}`, color: dia === today ? C.primary : C.t3 }}>
                          {DIAS_SHORT[dia]}
                        </span>
                      ) : null;
                    })}
                    {canWrite && !allFilled && (
                      <button onClick={() => { setFillId(isFilling ? null : p.id); setFillForm({ indicador_id: kpis[0]?.id || '', valor: '', periodo: '', observacoes: '' }); }}
                        style={{ background: isFilling ? C.primary : 'transparent', color: isFilling ? '#fff' : C.primary, border: `1px solid ${C.primary}`, borderRadius: 8, padding: '4px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                        {isFilling ? 'Fechar' : 'Preencher'}
                      </button>
                    )}
                  </div>
                </div>

                {/* KPI badges */}
                {kpis.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
                    {kpis.map(k => {
                      const filled = lastFill[k.id]?.data_preenchimento === todayStr;
                      return (
                        <span key={k.id} style={{
                          padding: '2px 8px', borderRadius: 8, fontSize: 11,
                          background: filled ? C.greenBg : C.bg,
                          color: filled ? C.green : C.t3,
                          border: `1px solid ${filled ? C.green + '40' : C.border}`,
                        }}>
                          {k.id} {filled ? '\u2713' : ''}
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Fill form */}
                {isFilling && (
                  <div style={{ marginTop: 12, padding: 12, background: C.bg, borderRadius: 8, border: `1px solid ${C.border}` }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 600, color: C.t3, display: 'block', marginBottom: 2 }}>Indicador</label>
                        <select value={fillForm.indicador_id} onChange={e => setFillForm(f => ({ ...f, indicador_id: e.target.value }))} style={{ ...inp, fontSize: 12, padding: '6px 8px' }}>
                          {kpis.map(k => <option key={k.id} value={k.id}>{k.id}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 600, color: C.t3, display: 'block', marginBottom: 2 }}>Valor *</label>
                        <input type="number" value={fillForm.valor} onChange={e => setFillForm(f => ({ ...f, valor: e.target.value }))} placeholder="0" style={{ ...inp, fontSize: 12, padding: '6px 8px' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 600, color: C.t3, display: 'block', marginBottom: 2 }}>{'Per\u00edodo'}</label>
                        <input value={fillForm.periodo} onChange={e => setFillForm(f => ({ ...f, periodo: e.target.value }))} placeholder="Semana 18" style={{ ...inp, fontSize: 12, padding: '6px 8px' }} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
                      <input value={fillForm.observacoes} onChange={e => setFillForm(f => ({ ...f, observacoes: e.target.value }))} placeholder="Obs (opcional)" style={{ ...inp, fontSize: 12, padding: '6px 8px', flex: 1 }} />
                      <button onClick={submitFill} disabled={saving || !fillForm.valor}
                        style={{ background: C.primary, color: '#fff', border: 'none', borderRadius: 8, padding: '6px 16px', fontSize: 12, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving || !fillForm.valor ? 0.5 : 1, whiteSpace: 'nowrap' }}>
                        {saving ? '...' : 'Registrar'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
