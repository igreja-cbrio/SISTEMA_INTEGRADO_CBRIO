/**
 * Calendario semanal de tarefas por area.
 * Mostra Seg-Dom com KPIs agendados + tarefas pessoais.
 * Navega entre semanas com setas. Abre na semana/dia atual.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { processos as api } from '../api';
import { INDICADORES, getAreaNome } from '../data/indicadores';

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', text: 'var(--cbrio-text)',
  t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)', border: 'var(--cbrio-border)',
  inputBg: 'var(--cbrio-input-bg)', primary: '#00B39D', primaryBg: '#e6f7f5',
  green: '#10b981', greenBg: '#d1fae5', red: '#ef4444', redBg: '#fee2e2',
  amber: '#f59e0b', blue: '#3b82f6', blueBg: '#dbeafe',
};
const inp = { padding: '6px 10px', borderRadius: 8, border: '1px solid var(--cbrio-border)', background: 'var(--cbrio-input-bg)', color: 'var(--cbrio-text)', fontSize: 13, boxSizing: 'border-box', fontFamily: 'inherit' };

const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom'];

function getMonday(d) {
  const dt = new Date(d);
  const day = dt.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  dt.setDate(dt.getDate() + diff);
  dt.setHours(0, 0, 0, 0);
  return dt;
}
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function fmtDate(d) { return d.toISOString().slice(0, 10); }
function fmtShort(d) { return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`; }

export default function ProcessosTarefas({ area }) {
  const { isAdmin, isDiretor } = useAuth();
  const canWrite = isAdmin || isDiretor;

  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [processos, setProcessos] = useState([]);
  const [agenda, setAgenda] = useState([]);
  const [registros, setRegistros] = useState([]);
  const [tarefas, setTarefas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addingDay, setAddingDay] = useState(null);
  const [newTarefa, setNewTarefa] = useState('');
  const [fillTarget, setFillTarget] = useState(null);
  const [fillVal, setFillVal] = useState('');
  const [saving, setSaving] = useState(false);

  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const weekEnd = weekDates[6];
  const todayStr = fmtDate(new Date());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const di = fmtDate(weekStart);
      const df = fmtDate(weekEnd);
      const [procs, ag, regs, tars] = await Promise.all([
        api.list({ area, status: 'ativo' }),
        api.agenda.list({ area }).catch(() => []),
        api.registros.list({ data_inicio: di, data_fim: df }).catch(() => []),
        api.tarefas.list({ area, data_inicio: di, data_fim: df }).catch(() => []),
      ]);
      setProcessos(procs);
      setAgenda(ag);
      setRegistros(regs);
      setTarefas(tars);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [area, weekStart, weekEnd]);

  useEffect(() => { load(); }, [load]);

  const agendaMap = useMemo(() => {
    const m = {};
    agenda.forEach(a => { m[a.indicador_id] = a.dia_semana; });
    return m;
  }, [agenda]);

  const fillMap = useMemo(() => {
    const m = {};
    registros.forEach(r => { m[`${r.indicador_id}|${r.data_preenchimento}`] = r; });
    return m;
  }, [registros]);

  // Para cada dia do grid (0=seg..6=dom), montar KPIs agendados
  const dayKpis = useMemo(() => {
    return weekDates.map((date, gi) => {
      // gi: 0=seg..6=dom no grid. banco: 0=dom,1=seg..6=sab
      const bankDay = gi === 6 ? 0 : gi + 1;
      const dateStr = fmtDate(date);
      const items = [];
      processos.forEach(p => {
        (p.indicador_ids || []).forEach(indId => {
          if (agendaMap[indId] === bankDay) {
            const kpi = INDICADORES.find(k => k.id === indId);
            if (kpi) {
              items.push({
                processoId: p.id, processoNome: p.nome,
                indicadorId: indId, kpiNome: kpi.nome, date: dateStr,
                filled: !!fillMap[`${indId}|${dateStr}`],
                valor: fillMap[`${indId}|${dateStr}`]?.valor,
              });
            }
          }
        });
      });
      return items;
    });
  }, [weekDates, processos, agendaMap, fillMap]);

  const dayTarefas = useMemo(() => {
    return weekDates.map(date => {
      const ds = fmtDate(date);
      return tarefas.filter(t => t.data === ds);
    });
  }, [weekDates, tarefas]);

  const prevWeek = () => setWeekStart(addDays(weekStart, -7));
  const nextWeek = () => setWeekStart(addDays(weekStart, 7));
  const goToday = () => setWeekStart(getMonday(new Date()));

  const addTarefa = async (gi) => {
    if (!newTarefa.trim()) return;
    setSaving(true);
    try {
      await api.tarefas.create({ titulo: newTarefa.trim(), data: fmtDate(weekDates[gi]), area });
      setNewTarefa(''); setAddingDay(null); load();
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const toggleTarefa = async (id, done) => {
    try { await api.tarefas.toggle(id, !done); load(); } catch (e) { console.error(e); }
  };

  const removeTarefa = async (id) => {
    try { await api.tarefas.remove(id); load(); } catch (e) { console.error(e); }
  };

  const submitFill = async () => {
    if (!fillTarget || !fillVal) return;
    setSaving(true);
    try {
      await api.registros.create({
        processo_id: fillTarget.processoId, indicador_id: fillTarget.indicadorId,
        valor: Number(fillVal), data_preenchimento: fillTarget.date,
      });
      setFillTarget(null); setFillVal(''); load();
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: C.t3 }}>Carregando...</div>;

  return (
    <div>
      {/* Header com navegacao de semana */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: C.text }}>
          Tarefas - {getAreaNome(area)}
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={prevWeek} style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 18, color: C.t2, lineHeight: 1 }}>{'\u2039'}</button>
          <button onClick={goToday} style={{ background: C.primaryBg, border: `1px solid ${C.primary}40`, borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: C.primary }}>Hoje</button>
          <span style={{ fontSize: 14, fontWeight: 600, color: C.text, minWidth: 140, textAlign: 'center' }}>
            {fmtShort(weekStart)} - {fmtShort(weekEnd)}
          </span>
          <button onClick={nextWeek} style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 18, color: C.t2, lineHeight: 1 }}>{'\u203a'}</button>
        </div>
      </div>

      {/* Grid 7 colunas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
        {weekDates.map((date, gi) => {
          const dateStr = fmtDate(date);
          const isToday = dateStr === todayStr;
          const kpis = dayKpis[gi];
          const tasks = dayTarefas[gi];
          const totalK = kpis.length;
          const filledK = kpis.filter(k => k.filled).length;

          return (
            <div key={gi} style={{
              background: C.card, border: `2px solid ${isToday ? C.primary : C.border}`,
              borderRadius: 12, minHeight: 200, display: 'flex', flexDirection: 'column',
            }}>
              {/* Day header */}
              <div style={{
                padding: '8px 10px', borderBottom: `1px solid ${C.border}`,
                background: isToday ? C.primaryBg : 'transparent', borderRadius: '10px 10px 0 0',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: isToday ? C.primary : C.t3, textTransform: 'uppercase' }}>{DIAS[gi]}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: isToday ? C.primary : C.text }}>{date.getDate()}</div>
                </div>
                {totalK > 0 && (
                  <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 8, background: filledK === totalK ? C.greenBg : C.bg, color: filledK === totalK ? C.green : C.t3 }}>
                    {filledK}/{totalK}
                  </span>
                )}
              </div>

              {/* Day content */}
              <div style={{ padding: 6, flex: 1, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, overflow: 'auto' }}>
                {/* KPIs agendados */}
                {kpis.map((k, ki) => {
                  const isFilling = fillTarget?.indicadorId === k.indicadorId && fillTarget?.date === k.date;
                  return (
                    <div key={ki} style={{
                      padding: '5px 7px', borderRadius: 6, cursor: k.filled || !canWrite ? 'default' : 'pointer',
                      background: k.filled ? C.greenBg : C.blueBg,
                      border: `1px solid ${k.filled ? C.green + '30' : C.blue + '30'}`,
                    }}
                      onClick={() => !k.filled && canWrite && setFillTarget(isFilling ? null : k)}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 600, color: k.filled ? C.green : C.blue, fontSize: 11 }}>{k.indicadorId}</span>
                        {k.filled && <span style={{ fontSize: 10, color: C.green, fontWeight: 700 }}>{'\u2713'} {k.valor}</span>}
                      </div>
                      <div style={{ fontSize: 10, color: k.filled ? C.green : C.t2, marginTop: 1, lineHeight: 1.2 }}>{k.processoNome}</div>
                      {isFilling && !k.filled && (
                        <div style={{ marginTop: 4, display: 'flex', gap: 3 }} onClick={e => e.stopPropagation()}>
                          <input type="number" value={fillVal} onChange={e => setFillVal(e.target.value)} placeholder="Valor"
                            style={{ ...inp, width: '100%', fontSize: 11, padding: '3px 6px' }} autoFocus
                            onKeyDown={e => e.key === 'Enter' && submitFill()} />
                          <button onClick={submitFill} disabled={saving || !fillVal}
                            style={{ background: C.primary, color: '#fff', border: 'none', borderRadius: 6, padding: '3px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer', opacity: !fillVal ? 0.5 : 1 }}>
                            OK
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Tarefas pessoais */}
                {tasks.map(t => (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 6px', borderRadius: 6, background: C.bg, border: `1px solid ${C.border}` }}>
                    <input type="checkbox" checked={t.done} onChange={() => toggleTarefa(t.id, t.done)} style={{ margin: 0, cursor: 'pointer' }} />
                    <span style={{ flex: 1, fontSize: 11, color: t.done ? C.t3 : C.text, textDecoration: t.done ? 'line-through' : 'none' }}>{t.titulo}</span>
                    <button onClick={() => removeTarefa(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.t3, fontSize: 13, padding: 0, lineHeight: 1 }}>&times;</button>
                  </div>
                ))}

                {/* Add task inline */}
                <div style={{ marginTop: 'auto' }}>
                  {addingDay === gi ? (
                    <div style={{ display: 'flex', gap: 3 }}>
                      <input value={newTarefa} onChange={e => setNewTarefa(e.target.value)} placeholder="Tarefa..."
                        onKeyDown={e => { if (e.key === 'Enter') addTarefa(gi); if (e.key === 'Escape') { setAddingDay(null); setNewTarefa(''); } }}
                        style={{ ...inp, width: '100%', fontSize: 11, padding: '3px 6px' }} autoFocus />
                      <button onClick={() => addTarefa(gi)} disabled={saving || !newTarefa.trim()}
                        style={{ background: C.primary, color: '#fff', border: 'none', borderRadius: 6, padding: '2px 8px', fontSize: 11, cursor: 'pointer' }}>+</button>
                    </div>
                  ) : (
                    <button onClick={() => { setAddingDay(gi); setNewTarefa(''); }}
                      style={{ width: '100%', background: 'none', border: `1px dashed ${C.border}`, borderRadius: 6, padding: '4px', cursor: 'pointer', color: C.t3, fontSize: 11 }}>
                      + Adicionar
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
