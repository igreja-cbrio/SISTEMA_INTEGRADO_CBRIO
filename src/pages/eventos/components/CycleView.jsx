import { useState, useEffect } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { cycles as api } from '../../../api';
import CompletionSection from '../../../components/CompletionSection';
import { Select as ShadSelect, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';

const C = { dark: 'var(--cbrio-text)', t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)', border: 'var(--cbrio-border)', accent: '#00B39D' };

const TASK_STATUS = {
  a_fazer:       { label: 'A fazer',       color: 'var(--cbrio-text3)' },
  em_andamento:  { label: 'Em andamento',  color: '#3b82f6' },
  concluida:     { label: 'Concluída',     color: '#10b981' },
};

const CAT = {
  marketing:   { label: 'Marketing',   color: '#00B39D', bg: '#d1fae5', border: '#5dcaa5' },
  compras:     { label: 'Compras',     color: '#3b82f6', bg: '#dbeafe', border: '#85b7eb' },
  financeiro:  { label: 'Financeiro',  color: '#10b981', bg: '#d1fae5', border: '#5dcaa5' },
  manutencao:  { label: 'Manutenção',  color: '#f59e0b', bg: '#fef3c7', border: '#ef9f27' },
  limpeza:     { label: 'Limpeza',     color: '#8b5cf6', bg: '#ede9fe', border: '#afa9ec' },
  cozinha:     { label: 'Cozinha',     color: '#ec4899', bg: '#fce7f3', border: '#f0997b' },
  producao:    { label: 'Produção',    color: '#6366f1', bg: '#e0e7ff', border: '#a5b4fc' },
  outros:      { label: 'Outros',      color: 'var(--cbrio-text3)', bg: 'var(--cbrio-bg)', border: 'var(--cbrio-border)' },
};

function normDate(d) { return d ? (typeof d === 'string' ? d.slice(0, 10) : '') : ''; }
function fmtDate(d) { const s = normDate(d); if (!s) return ''; const [y, m, day] = s.split('-'); return `${day}/${m}`; }
function sortByUrgency(tasks) {
  return [...tasks].sort((a, b) => {
    const pa = normDate(a.prazo); const pb = normDate(b.prazo);
    if (!pa && !pb) return 0; if (!pa) return 1; if (!pb) return -1;
    return pa.localeCompare(pb);
  });
}
function getCategory(task) { return (task.area || '').toLowerCase() || 'outros'; }

// Mapeamento setor → areas do ciclo criativo
const SETOR_AREAS = {
  'Gestão': ['compras', 'financeiro', 'manutencao', 'limpeza', 'cozinha'],
  'Gestao': ['compras', 'financeiro', 'manutencao', 'limpeza', 'cozinha'],
  'Criativo': ['marketing'],
};
function taskBelongsToSetor(task, setor) {
  const areas = SETOR_AREAS[setor];
  if (!areas) return false;
  return areas.includes(getCategory(task));
}

export default function CycleView({ eventId, eventName }) {
  const { profile, user } = useAuth();
  const userRole = profile?.role || '';
  const userArea = profile?.area || '';
  const userId = user?.id || '';
  const isPMO = ['diretor', 'admin'].includes(userRole);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);
  const [activePhase, setActivePhase] = useState(null);
  const [areaFilter, setAreaFilter] = useState('all');
  const [cycleViewMode, setCycleViewMode] = useState('pmo');
  const [viewMode, setViewMode] = useState('kanban');
  const [selectedTask, setSelectedTask] = useState(null);
  const [showNewPhase, setShowNewPhase] = useState(false);
  const [showNewTask, setShowNewTask] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newTaskSubs, setNewTaskSubs] = useState([]);
  const [editingTask, setEditingTask] = useState(false);
  const [editData, setEditData] = useState({});

  const load = async () => {
    try {
      const res = await api.get(eventId);
      setData(res);
      if (res?.phases?.length > 0 && !activePhase) {
        const first = res.phases.find(p => p.status !== 'concluida') || res.phases[0];
        setActivePhase(first.id);
      }
    } catch { setData(null); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [eventId]);

  const handleActivate = async () => {
    setActivating(true);
    try { await api.activate(eventId); load(); }
    catch (e) { alert(e.message); }
    finally { setActivating(false); }
  };

  const handlePhaseStatus = async (phaseId, status) => {
    await api.updatePhase(phaseId, { status });
    load();
  };

  const handleDeletePhase = async (phaseId) => {
    if (!window.confirm('Excluir esta fase e todas as suas tarefas?')) return;
    await api.deletePhase(phaseId);
    setActivePhase(null);
    load();
  };

  const handleDeleteTask = async (taskId) => {
    if (!window.confirm('Excluir esta tarefa?')) return;
    await api.deleteTask(taskId);
    load();
  };

  const handleCreatePhase = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const d = Object.fromEntries(fd.entries());
    const maxNum = Math.max(0, ...phases.map(p => p.numero_fase));
    await api.createPhase({ event_id: eventId, numero_fase: maxNum + 1, nome_fase: d.nome_fase, area: d.area, data_inicio_prevista: d.data_inicio || null, data_fim_prevista: d.data_fim || null });
    setShowNewPhase(false);
    load();
  };

  const handleCreateTask = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const d = Object.fromEntries(fd.entries());
    const phaseId = d.phase_id || activePhase;
    const task = await api.createTask({ event_phase_id: phaseId, event_id: eventId, titulo: d.titulo, area: d.area, prazo: d.prazo || null, responsavel_nome: d.responsavel || null, status: 'a_fazer', prioridade: 'normal' });
    if (task?.id && newTaskSubs.length > 0) {
      for (const name of newTaskSubs) {
        await api.createSubtask(task.id, name);
      }
    }
    setShowNewTask(false);
    setNewTaskSubs([]);
    load();
  };

  if (loading) return <div style={{ padding: 16, color: C.t2 }}>Carregando ciclo...</div>;
  if (!data?.cycle) return (
    <div style={{ padding: 24, textAlign: 'center' }}>
      <p style={{ color: C.t2, fontSize: 14, marginBottom: 12 }}>Este evento ainda não tem um ciclo criativo ativado.</p>
      <button onClick={handleActivate} disabled={activating} style={{ padding: '10px 24px', borderRadius: 8, border: 'none', cursor: 'pointer', background: C.accent, color: '#fff', fontWeight: 600, fontSize: 14, opacity: activating ? 0.6 : 1 }}>
        {activating ? 'Ativando...' : 'Ativar Ciclo Criativo'}
      </button>
    </div>
  );

  const { phases, tasks } = data;
  const phasesDone = phases.filter(p => p.status === 'concluida').length;
  const pctDone = phases.length > 0 ? Math.round((phasesDone / phases.length) * 100) : 0;
  const currentPhase = phases.find(p => p.id === activePhase);

  // Filtrar tarefas da fase + área
  let phaseTasks = currentPhase ? tasks.filter(t => t.event_phase_id === currentPhase.id) : [];
  if (areaFilter !== 'all') phaseTasks = phaseTasks.filter(t => getCategory(t) === areaFilter);
  // Filtro por visão
  if (cycleViewMode === 'area' && userArea) phaseTasks = phaseTasks.filter(t => taskBelongsToSetor(t, userArea));
  if (cycleViewMode === 'minhas') phaseTasks = phaseTasks.filter(t => t.responsavel_id === userId || t.responsavel_nome === profile?.name);

  return (
    <div>
      {/* Progresso */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: C.t2, marginBottom: 6 }}>
        <span>Progresso do Ciclo</span>
        <span>{phasesDone}/{phases.length} fases ({pctDone}%)</span>
      </div>
      <div style={{ height: 6, background: 'var(--cbrio-border)', borderRadius: 3, marginBottom: 16 }}>
        <div style={{ height: '100%', width: `${pctDone}%`, background: C.accent, borderRadius: 3, transition: 'width 0.3s' }} />
      </div>

      {/* ── Toggle visão ── */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: C.t2, fontWeight: 600 }}>Visão:</span>
        {[
          { key: 'pmo', label: 'Todas as tarefas' },
          ...(userArea ? [{ key: 'area', label: `${userArea}` }] : []),
          { key: 'minhas', label: 'Minhas' },
        ].map(v => (
          <button key={v.key} onClick={() => setCycleViewMode(v.key)} style={{
            padding: '4px 12px', borderRadius: 8, fontSize: 11, fontWeight: cycleViewMode === v.key ? 700 : 400, cursor: 'pointer',
            border: cycleViewMode === v.key ? `2px solid ${C.accent}` : `1px solid ${C.border}`,
            background: cycleViewMode === v.key ? `${C.accent}15` : 'transparent',
            color: cycleViewMode === v.key ? C.accent : C.t3,
          }}>{v.label}</button>
        ))}
      </div>

      {/* ── Filtro de área ── */}
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: C.t2, marginRight: 4 }}>Área:</span>
        {[{ key: 'all', label: 'Todas' }, ...Object.entries(CAT).filter(([k]) => k !== 'outros').map(([k, v]) => ({ key: k, label: v.label, color: v.color, bg: v.bg }))].map(f => (
          <button key={f.key} onClick={() => setAreaFilter(f.key)} style={{
            padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: areaFilter === f.key ? 600 : 400, cursor: 'pointer',
            border: areaFilter === f.key ? `2px solid ${f.color || C.accent}` : `1px solid ${C.border}`,
            background: areaFilter === f.key ? (f.bg || `${C.accent}15`) : 'transparent',
            color: areaFilter === f.key ? (f.color || C.accent) : C.t3,
          }}>{f.label}</button>
        ))}
      </div>

      {/* ── Faixa de fases (nível 1) ── */}
      <div style={{ overflowX: 'auto', marginBottom: 16, paddingBottom: 6 }}>
        <div style={{ display: 'flex', gap: 5, minWidth: 'max-content' }}>
          {phases.map((phase, i) => {
            const isActive = phase.id === activePhase;
            const pTasks = tasks.filter(t => t.event_phase_id === phase.id);
            const pDone = pTasks.filter(t => t.status === 'concluida').length;
            const pBlocked = 0;
            const isDone = pTasks.length > 0 && pDone === pTasks.length;
            const pPct = pTasks.length > 0 ? Math.round((pDone / pTasks.length) * 100) : 0;
            const progColor = isDone ? '#10b981' : pPct > 0 ? C.accent : 'var(--cbrio-border)';

            return (
              <div key={phase.id} style={{ display: 'flex', alignItems: 'center' }}>
                <div onClick={() => { setActivePhase(phase.id); setSelectedTask(null); }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = `${C.accent}08`; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = isDone ? 'var(--cbrio-bg)' : 'var(--cbrio-card)'; e.currentTarget.style.transform = ''; }}
                  style={{
                  borderRadius: 8, padding: '8px 10px', cursor: 'pointer', minWidth: 100, maxWidth: 120,
                  border: isActive ? `2px solid ${C.accent}` : `1px solid ${C.border}`,
                  background: isActive ? `${C.accent}10` : isDone ? 'var(--cbrio-bg)' : 'var(--cbrio-card)',
                  opacity: isDone && !isActive ? 0.7 : 1, transition: 'all .15s',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: C.t3, marginBottom: 3 }}>
                    <span>F{phase.numero_fase}</span>
                    {pBlocked > 0 && <span style={{ color: '#ef4444' }}>{pBlocked} bloq</span>}
                  </div>
                  <div style={{ fontSize: 10, fontWeight: isActive ? 700 : 500, color: isActive ? C.accent : C.dark, lineHeight: 1.3, marginBottom: 4 }}>
                    {phase.nome_fase}
                  </div>
                  {phase.momento_chave && <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 99, background: '#fef3c7', color: '#854f0b', fontWeight: 500 }}>chave</span>}
                  <div style={{ height: 3, borderRadius: 2, background: 'var(--cbrio-border)', marginTop: 4 }}>
                    <div style={{ height: 3, borderRadius: 2, width: `${pPct}%`, background: progColor, transition: 'width .3s' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: C.t3, marginTop: 3 }}>
                    <span>{pTasks.length > 0 ? (isDone ? 'concluída' : `${pTasks.length - pDone} pendente(s)`) : 'vazia'}</span>
                    <button onClick={e => { e.stopPropagation(); handleDeletePhase(phase.id); }}
                      style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 10, padding: 0, lineHeight: 1 }}>✕</button>
                  </div>
                </div>
                {i < phases.length - 1 && <div style={{ width: 12, height: 2, background: isDone ? '#10b981' : 'var(--cbrio-border)', flexShrink: 0 }} />}
              </div>
            );
          })}
          {/* Botão + Fase */}
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ width: 12, height: 2, background: 'var(--cbrio-border)', flexShrink: 0 }} />
            <button onClick={() => setShowNewPhase(true)} style={{
              borderRadius: 8, padding: '8px 10px', cursor: 'pointer', minWidth: 60,
              border: '2px dashed var(--cbrio-border)', background: 'transparent', color: C.accent,
              fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
            }}>+ Fase</button>
          </div>
        </div>
      </div>

      {/* ── Header fase + toggle vista ── */}
      {currentPhase && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.dark }}>
              Fase {currentPhase.numero_fase} — {currentPhase.nome_fase}
              {currentPhase.momento_chave && <span style={{ marginLeft: 8, color: '#f59e0b', fontSize: 12 }}>★ Momento-chave</span>}
            </div>
            <div style={{ fontSize: 11, color: C.t2, marginTop: 2 }}>
              {phaseTasks.filter(t => t.status !== 'concluida').length} pendente(s)
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button onClick={() => setShowNewTask(true)} style={{ padding: '4px 10px', fontSize: 11, border: 'none', cursor: 'pointer', fontWeight: 600, background: C.accent, color: '#fff', borderRadius: 6 }}>+ Tarefa</button>
            <div style={{ display: 'flex', borderRadius: 6, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
              <button onClick={() => setViewMode('kanban')} style={{ padding: '4px 10px', fontSize: 11, border: 'none', cursor: 'pointer', fontWeight: 600, background: viewMode === 'kanban' ? C.accent : 'transparent', color: viewMode === 'kanban' ? '#fff' : C.t3 }}>Kanban</button>
              <button onClick={() => setViewMode('lista')} style={{ padding: '4px 10px', fontSize: 11, border: 'none', cursor: 'pointer', fontWeight: 600, background: viewMode === 'lista' ? C.accent : 'transparent', color: viewMode === 'lista' ? '#fff' : C.t3 }}>Lista</button>
            </div>
            <ShadSelect value={currentPhase.status} onValueChange={v => handlePhaseStatus(currentPhase.id, v)}>
              <SelectTrigger className="w-[140px] h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="em_andamento">Em andamento</SelectItem>
                <SelectItem value="concluida">Concluída</SelectItem>
                <SelectItem value="atrasada">Atrasada</SelectItem>
                <SelectItem value="em_risco">Em risco</SelectItem>
              </SelectContent>
            </ShadSelect>
          </div>
        </div>
      )}

      {/* ── LISTA DE CARDS POR ÁREA ── */}
      {viewMode === 'kanban' && currentPhase && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {phaseTasks.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: C.t3, fontSize: 12 }}>Nenhuma tarefa nesta fase.</div>}
          {Object.entries(CAT).map(([catKey, catMeta]) => {
            const catTasks = sortByUrgency(phaseTasks.filter(t => getCategory(t) === catKey));
            if (catTasks.length === 0) return null;
            const done = catTasks.filter(t => t.status === 'concluida').length;
            const pct = Math.round((done / catTasks.length) * 100);
            return (
              <div key={catKey} style={{ background: 'var(--cbrio-card)', borderRadius: 10, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
                <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: catMeta.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.dark, flex: 1 }}>{catMeta.label}</span>
                  <span style={{ fontSize: 11, color: C.t3, fontWeight: 600 }}>{done}/{catTasks.length}</span>
                  <div style={{ width: 60, height: 4, borderRadius: 2, background: C.border, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? '#10b981' : catMeta.color, borderRadius: 2, transition: 'width 0.3s' }} />
                  </div>
                </div>
                {catTasks.map(task => {
                  const isDone = task.status === 'concluida';
                  const p = normDate(task.prazo);
                  const diff = p ? Math.ceil((new Date(p + 'T12:00:00') - new Date()) / 86400000) : null;
                  const dColor = diff === null || isDone ? null : diff < 0 ? '#ef4444' : diff <= 3 ? '#f59e0b' : '#10b981';
                  const dText = diff === null ? '' : diff < 0 ? `${Math.abs(diff)}d atrás` : diff === 0 ? 'Hoje' : `${diff}d`;
                  return (
                    <div key={task.id} onClick={() => setSelectedTask(task)}
                      style={{
                        padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10,
                        borderBottom: `1px solid ${C.border}`, cursor: 'pointer',
                        background: selectedTask?.id === task.id ? `${C.accent}08` : 'transparent',
                        opacity: isDone ? 0.65 : 1, transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => { if (!isDone) e.currentTarget.style.background = 'var(--cbrio-bg)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = selectedTask?.id === task.id ? `${C.accent}08` : 'transparent'; }}>
                      <div style={{
                        width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: isDone ? '#d1fae5' : 'var(--cbrio-bg)',
                        border: isDone ? '2px solid #10b981' : `2px solid ${C.border}`,
                        fontSize: 11, color: isDone ? '#10b981' : C.t3,
                      }}>
                        {isDone ? '✓' : ''}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: isDone ? 400 : 600, color: C.dark, textDecoration: isDone ? 'line-through' : 'none', lineHeight: 1.3 }}>{task.titulo}</div>
                        <div style={{ fontSize: 11, color: C.t3, marginTop: 2 }}>
                          {task.responsavel_nome || '—'}{p ? ` · ${fmtDate(p)}` : ''}
                        </div>
                      </div>
                      {dColor && !isDone && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: dColor, padding: '2px 8px', borderRadius: 8, background: `${dColor}15`, flexShrink: 0 }}>{dText}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* ── MODO LISTA (por categoria) ── */}
      {viewMode === 'lista' && currentPhase && (() => {
        const byCategory = {};
        phaseTasks.forEach(t => { const c = getCategory(t); if (!byCategory[c]) byCategory[c] = []; byCategory[c].push(t); });
        const cats = Object.keys(byCategory).sort((a, b) => {
          const order = ['marketing', 'compras', 'financeiro', 'manutencao', 'limpeza', 'cozinha', 'outros'];
          return order.indexOf(a) - order.indexOf(b);
        });

        return (
          <div>
            {phaseTasks.length === 0 && <div style={{ color: C.t3, fontSize: 13, padding: 24, textAlign: 'center' }}>Nenhuma tarefa nesta fase</div>}
            {cats.map(cat => {
              const catTasks = byCategory[cat];
              const catInfo = CAT[cat] || CAT.outros;
              const catDone = catTasks.filter(t => t.status === 'concluida').length;
              return (
                <div key={cat} style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: catInfo.color }} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.dark }}>{catInfo.label}</span>
                    <span style={{ fontSize: 11, color: C.t3 }}>({catDone}/{catTasks.length})</span>
                  </div>
                  {catTasks.map(task => {
                    const isOpen = selectedTask?.id === task.id;
                    const subs = task.subtasks || [];
                    const subsDone = subs.filter(s => s.done).length;
                    const ts = TASK_STATUS[task.status] || TASK_STATUS.a_fazer;
                    return (
                      <div key={task.id} style={{ background: 'var(--cbrio-card)', borderRadius: 8, padding: '8px 12px', border: selectedTask?.id === task.id ? `1.5px solid ${C.accent}` : `1px solid ${C.border}`, marginBottom: 3, cursor: 'pointer', transition: 'box-shadow .15s' }}
                        onClick={() => setSelectedTask(task)}
                        onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.05)'}
                        onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
                            <span style={{ color: C.t3, fontSize: 10 }}>{isOpen ? '▼' : '▶'}</span>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 12, color: C.dark }}>{task.titulo}</div>
                              <div style={{ fontSize: 10, color: C.t2, marginTop: 1 }}>
                                {task.responsavel_nome || 'Sem responsável'}{task.prazo && ` · ${fmtDate(task.prazo)}`}{subs.length > 0 && ` · ${subsDone}/${subs.length}`}
                              </div>
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                            <span style={{ fontSize: 9, fontWeight: 600, color: ts.color, padding: '2px 8px', borderRadius: 10, background: `${ts.color}15` }}>{ts.label}</span>
                            <button onClick={() => handleDeleteTask(task.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 11, padding: '0 2px' }}>✕</button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        );
      })()}

      <div style={{ height: 60 }} />

      {/* Modal: Nova Fase */}
      {showNewPhase && (
        <div style={modalOverlay} onClick={() => setShowNewPhase(false)}>
          <div style={modalBox} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: C.dark }}>Nova Fase</span>
              <button onClick={() => setShowNewPhase(false)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: C.t3 }}>✕</button>
            </div>
            <form onSubmit={handleCreatePhase}>
              <div style={{ marginBottom: 10 }}>
                <label style={lblStyle}>Nome da fase *</label>
                <input name="nome_fase" required style={inputStyle} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1, marginBottom: 10 }}>
                  <label style={lblStyle}>Área</label>
                  <ShadSelect name="area" defaultValue="ambos">
                    <SelectTrigger className="w-full h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ambos">Ambos</SelectItem>
                      <SelectItem value="marketing">Marketing</SelectItem>
                    </SelectContent>
                  </ShadSelect>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1, marginBottom: 10 }}><label style={lblStyle}>Data início</label><input type="date" name="data_inicio" style={inputStyle} /></div>
                <div style={{ flex: 1, marginBottom: 10 }}><label style={lblStyle}>Data fim</label><input type="date" name="data_fim" style={inputStyle} /></div>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowNewPhase(false)} style={{ padding: '6px 14px', borderRadius: 6, border: `1px solid ${C.border}`, background: 'transparent', cursor: 'pointer', fontSize: 12 }}>Cancelar</button>
                <button type="submit" style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: C.accent, color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Criar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Nova Tarefa */}
      {showNewTask && (
        <div style={modalOverlay} onClick={() => { setShowNewTask(false); setNewTaskSubs([]); }}>
          <div style={modalBox} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: C.dark }}>Nova Tarefa</span>
              <button onClick={() => { setShowNewTask(false); setNewTaskSubs([]); }} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: C.t3 }}>✕</button>
            </div>
            <form onSubmit={handleCreateTask}>
              <div style={{ marginBottom: 10 }}>
                <label style={lblStyle}>Fase</label>
                <ShadSelect name="phase_id" defaultValue={activePhase || ''}
                  onValueChange={v => {
                    const p = phases.find(ph => ph.id === v);
                    const form = document.querySelector('form');
                    const prazoInput = form?.querySelector('[name=prazo]');
                    if (p?.data_fim_prevista && prazoInput) prazoInput.value = p.data_fim_prevista;
                  }}>
                  <SelectTrigger className="w-full h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {phases.map(p => <SelectItem key={p.id} value={p.id}>F{p.numero_fase} — {p.nome_fase}</SelectItem>)}
                  </SelectContent>
                </ShadSelect>
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={lblStyle}>Título *</label>
                <input name="titulo" required style={inputStyle} placeholder="Nome da tarefa" />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1, marginBottom: 10 }}>
                  <label style={lblStyle}>Área</label>
                  <ShadSelect name="area" defaultValue="adm">
                    <SelectTrigger className="w-full h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="adm">Administrativo</SelectItem>
                      <SelectItem value="marketing">Marketing</SelectItem>
                      <SelectItem value="compras">Compras</SelectItem>
                      <SelectItem value="financeiro">Financeiro</SelectItem>
                      <SelectItem value="manutencao">Manutenção</SelectItem>
                      <SelectItem value="limpeza">Limpeza</SelectItem>
                      <SelectItem value="cozinha">Cozinha</SelectItem>
                      <SelectItem value="producao">Produção</SelectItem>
                    </SelectContent>
                  </ShadSelect>
                </div>
                <div style={{ flex: 1, marginBottom: 10 }}>
                  <label style={lblStyle}>Prazo</label>
                  <input type="date" name="prazo" defaultValue={currentPhase?.data_fim_prevista || ''} style={inputStyle} />
                </div>
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={lblStyle}>Responsável</label>
                <input name="responsavel" style={inputStyle} placeholder="Nome do responsável" />
              </div>
              {/* Subtarefas */}
              <div style={{ marginBottom: 10 }}>
                <label style={lblStyle}>Subtarefas</label>
                {newTaskSubs.map((s, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ flex: 1, fontSize: 12, color: C.dark, padding: '4px 8px', background: 'var(--cbrio-bg)', borderRadius: 4 }}>{s}</span>
                    <button type="button" onClick={() => setNewTaskSubs(prev => prev.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.t3, fontSize: 14 }}>✕</button>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 6 }}>
                  <input id="new-task-sub-input" type="text" placeholder="Nova subtarefa..." style={{ flex: 1, ...inputStyle, marginBottom: 0 }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); const v = e.target.value.trim(); if (v) { setNewTaskSubs(prev => [...prev, v]); e.target.value = ''; } }
                    }} />
                  <button type="button" onClick={() => {
                    const inp = document.getElementById('new-task-sub-input');
                    if (inp?.value.trim()) { setNewTaskSubs(prev => [...prev, inp.value.trim()]); inp.value = ''; }
                  }} style={{ padding: '5px 10px', borderRadius: 6, border: 'none', background: C.accent, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>+</button>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
                <button type="button" onClick={() => { setShowNewTask(false); setNewTaskSubs([]); }} style={{ padding: '6px 14px', borderRadius: 6, border: `1px solid ${C.border}`, background: 'transparent', cursor: 'pointer', fontSize: 12 }}>Cancelar</button>
                <button type="submit" style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: C.accent, color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Criar tarefa</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* ── PAINEL LATERAL — Detalhe da Tarefa ── */}
      {selectedTask && (() => {
        const task = selectedTask;
        const phase = phases.find(p => p.id === task.event_phase_id);
        const cat = CAT[getCategory(task)] || CAT.outros;
        const subs = task.subtasks || [];
        const subsDone = subs.filter(s => s.done).length;
        const subsPct = subs.length > 0 ? Math.round((subsDone / subs.length) * 100) : task.status === 'concluida' ? 100 : 0;
        const ts = TASK_STATUS[task.status] || TASK_STATUS.a_fazer;
        const p = normDate(task.prazo);
        const diff = p ? Math.ceil((new Date(p + 'T12:00:00') - new Date()) / 86400000) : null;
        const daysColor = diff === null || task.status === 'concluida' ? null : diff < 0 ? '#ef4444' : diff <= 7 ? '#f59e0b' : '#10b981';

        return (
          <>
            {/* Backdrop */}
            <div onClick={() => setSelectedTask(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 900, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 40 }} />
            {/* Modal centralizado */}
            <div style={{
              position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
              width: '95%', maxWidth: 600, maxHeight: '90vh',
              background: 'var(--cbrio-modal-bg, #fff)', zIndex: 901,
              borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflowY: 'auto',
              animation: 'fadeScaleIn 0.15s ease-out',
            }}>
              <style>{`@keyframes fadeScaleIn { from { opacity: 0; transform: translate(-50%, -50%) scale(0.96); } to { opacity: 1; transform: translate(-50%, -50%) scale(1); } }`}</style>

              {/* Header */}
              <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--cbrio-border)', position: 'sticky', top: 0, background: 'var(--cbrio-modal-bg, #fff)', zIndex: 1 }}>
                {!editingTask ? (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 17, fontWeight: 700, color: C.dark, lineHeight: 1.3, marginBottom: 8 }}>{task.titulo}</div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: cat.bg, color: cat.color, fontWeight: 600 }}>{cat.label}</span>
                          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: `${ts.color}15`, color: ts.color, fontWeight: 600 }}>{ts.label}</span>
                          {task.prioridade && task.prioridade !== 'normal' && (
                            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: task.prioridade === 'alta' ? '#fee2e2' : '#f0fdf4', color: task.prioridade === 'alta' ? '#ef4444' : '#10b981', fontWeight: 600 }}>
                              {task.prioridade === 'alta' ? '↑ Alta' : '↓ Baixa'}
                            </span>
                          )}
                          <button onClick={() => { setEditingTask(true); setEditData({ titulo: task.titulo, area: task.area || 'adm', prazo: normDate(task.prazo) || '', responsavel_nome: task.responsavel_nome || '', prioridade: task.prioridade || 'normal', event_phase_id: task.event_phase_id }); }}
                            style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, border: `1px solid ${C.border}`, background: 'transparent', cursor: 'pointer', color: C.t3, fontWeight: 500 }}>Editar</button>
                        </div>
                      </div>
                      <button onClick={() => { setSelectedTask(null); setEditingTask(false); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: C.t3, padding: '4px 8px' }}>✕</button>
                    </div>
                    <div style={{ display: 'flex', gap: 16, fontSize: 12, color: C.t2 }}>
                      <div><span style={{ fontWeight: 600 }}>Responsável:</span> {task.responsavel_nome || '—'}</div>
                      {p && <div><span style={{ fontWeight: 600 }}>Prazo:</span> {fmtDate(p)} {daysColor && <span style={{ color: daysColor, fontWeight: 700 }}> ({diff < 0 ? `${Math.abs(diff)}d atrás` : diff === 0 ? 'Hoje' : `${diff}d`})</span>}</div>}
                    </div>
                  </>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: C.dark }}>Editar tarefa</span>
                      <button onClick={() => setEditingTask(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: C.t3 }}>✕</button>
                    </div>
                    <input value={editData.titulo || ''} onChange={e => setEditData(d => ({ ...d, titulo: e.target.value }))} placeholder="Título"
                      style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 13, fontWeight: 600, color: C.dark, background: 'var(--cbrio-input-bg, #fff)' }} />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 10, fontWeight: 600, color: C.t3 }}>Fase</label>
                        <select value={editData.event_phase_id || ''} onChange={e => setEditData(d => ({ ...d, event_phase_id: e.target.value }))}
                          style={{ width: '100%', padding: '5px 8px', borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 12, color: C.dark, background: 'var(--cbrio-input-bg, #fff)' }}>
                          {phases.map(ph => <option key={ph.id} value={ph.id}>F{ph.numero_fase} — {ph.nome_fase}</option>)}
                        </select>
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 10, fontWeight: 600, color: C.t3 }}>Área</label>
                        <select value={editData.area || 'adm'} onChange={e => setEditData(d => ({ ...d, area: e.target.value }))}
                          style={{ width: '100%', padding: '5px 8px', borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 12, color: C.dark, background: 'var(--cbrio-input-bg, #fff)' }}>
                          <option value="adm">Administrativo</option><option value="marketing">Marketing</option>
                          <option value="compras">Compras</option><option value="financeiro">Financeiro</option>
                          <option value="manutencao">Manutenção</option><option value="limpeza">Limpeza</option><option value="cozinha">Cozinha</option><option value="producao">Produção</option>
                        </select>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 10, fontWeight: 600, color: C.t3 }}>Prazo</label>
                        <input type="date" value={editData.prazo || ''} onChange={e => setEditData(d => ({ ...d, prazo: e.target.value }))}
                          style={{ width: '100%', padding: '5px 8px', borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 12, color: C.dark, background: 'var(--cbrio-input-bg, #fff)', boxSizing: 'border-box' }} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 10, fontWeight: 600, color: C.t3 }}>Responsável</label>
                        <input value={editData.responsavel_nome || ''} onChange={e => setEditData(d => ({ ...d, responsavel_nome: e.target.value }))} placeholder="Nome"
                          style={{ width: '100%', padding: '5px 8px', borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 12, color: C.dark, background: 'var(--cbrio-input-bg, #fff)', boxSizing: 'border-box' }} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button onClick={() => setEditingTask(false)} style={{ padding: '5px 12px', borderRadius: 6, border: `1px solid ${C.border}`, background: 'transparent', cursor: 'pointer', fontSize: 11 }}>Cancelar</button>
                      <button onClick={async () => {
                        await api.updateTask(task.id, { titulo: editData.titulo, area: editData.area, prazo: editData.prazo || null, responsavel_nome: editData.responsavel_nome || null, event_phase_id: editData.event_phase_id });
                        setEditingTask(false); load(); setSelectedTask(null);
                      }} style={{ padding: '5px 12px', borderRadius: 6, border: 'none', background: C.accent, color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>Salvar</button>
                    </div>
                  </div>
                )}
              </div>

              <div style={{ padding: '16px 24px' }}>
                {/* ── Entregável Esperado ── */}
                {(phase?.entregas_padrao || task.entrega) && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.accent, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>📋 Entregável Esperado</div>
                    <div style={{ background: `${C.accent}08`, border: `1px solid ${C.accent}30`, borderRadius: 10, padding: '14px 16px' }}>
                      {phase?.entregas_padrao && (
                        <div style={{ fontSize: 13, color: C.dark, lineHeight: 1.6, whiteSpace: 'pre-line' }}>{phase.entregas_padrao}</div>
                      )}
                      {task.entrega && (
                        <div style={{ fontSize: 12, color: C.t2, marginTop: phase?.entregas_padrao ? 8 : 0, paddingTop: phase?.entregas_padrao ? 8 : 0, borderTop: phase?.entregas_padrao ? '1px solid var(--cbrio-border)' : 'none' }}>
                          <span style={{ fontWeight: 600 }}>Específico:</span> {task.entrega}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── Fase do Ciclo ── */}
                {phase && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.t2, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Fase</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.dark }}>{phase.nome_fase}</div>
                    {phase.descricao_fase && <div style={{ fontSize: 12, color: C.t2, marginTop: 4, lineHeight: 1.5 }}>{phase.descricao_fase}</div>}
                  </div>
                )}

                {/* ── Descrição ── */}
                {task.descricao && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.t2, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Descrição</div>
                    <div style={{ fontSize: 13, color: C.dark, lineHeight: 1.6, whiteSpace: 'pre-line' }}>{task.descricao}</div>
                  </div>
                )}

                {/* ── Subtasks / Checklist ── */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.t2, textTransform: 'uppercase', letterSpacing: 0.5 }}>Checklist ({subsDone}/{subs.length})</div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: subsPct >= 100 ? '#10b981' : subsPct > 0 ? '#3b82f6' : C.t3 }}>{subsPct}%</span>
                  </div>
                  {/* Progress bar */}
                  <div style={{ height: 6, background: 'var(--cbrio-border)', borderRadius: 3, marginBottom: 10, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${subsPct}%`, background: subsPct >= 100 ? '#10b981' : '#3b82f6', borderRadius: 3, transition: 'width 0.3s' }} />
                  </div>
                  {subs.length === 0 ? (
                    <div style={{ fontSize: 12, color: C.t3, padding: 8 }}>Nenhuma subtarefa.</div>
                  ) : subs.map(sub => (
                    <div key={sub.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--cbrio-border)' }}>
                      <input type="checkbox" checked={sub.done} onChange={async () => {
                        await api.updateSubtask(sub.id, { done: !sub.done });
                        load();
                        const updated = { ...task, subtasks: subs.map(s => s.id === sub.id ? { ...s, done: !s.done } : s) };
                        setSelectedTask(updated);
                      }} style={{ cursor: 'pointer', width: 16, height: 16, accentColor: C.accent }} />
                      <span style={{ flex: 1, fontSize: 13, color: C.dark, ...(sub.done ? { textDecoration: 'line-through', color: C.t3 } : {}) }}>{sub.name}</span>
                      <button onClick={async () => {
                        await api.deleteSubtask(sub.id);
                        load();
                        setSelectedTask({ ...task, subtasks: subs.filter(s => s.id !== sub.id) });
                      }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.t3, padding: 0, lineHeight: 1 }} title="Excluir subtarefa">
                        <span style={{ fontSize: 14 }}>✕</span>
                      </button>
                    </div>
                  ))}
                  {/* Adicionar subtarefa */}
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <input
                      id="new-subtask-input"
                      type="text" placeholder="Nova subtarefa..."
                      onKeyDown={async (e) => {
                        if (e.key === 'Enter' && e.target.value.trim()) {
                          const name = e.target.value.trim();
                          e.target.value = '';
                          const newSub = await api.createSubtask(task.id, name);
                          load();
                          setSelectedTask({ ...task, subtasks: [...subs, newSub] });
                        }
                      }}
                      style={{ flex: 1, padding: '5px 8px', borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 12, color: C.dark, background: 'var(--cbrio-input-bg, #fff)' }}
                    />
                    <button onClick={async () => {
                      const input = document.getElementById('new-subtask-input');
                      if (!input?.value.trim()) return;
                      const name = input.value.trim();
                      input.value = '';
                      const newSub = await api.createSubtask(task.id, name);
                      load();
                      setSelectedTask({ ...task, subtasks: [...subs, newSub] });
                    }} style={{ padding: '5px 10px', borderRadius: 6, border: 'none', background: C.accent, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>+</button>
                  </div>
                </div>

                {/* ── Observações ── */}
                {task.observacoes && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.t2, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Observações</div>
                    <div style={{ fontSize: 12, color: C.t2, lineHeight: 1.5, background: 'var(--cbrio-bg)', borderRadius: 8, padding: '10px 14px' }}>{task.observacoes}</div>
                  </div>
                )}

                {/* ── Conclusão ── */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.t2, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Conclusão</div>
                  <CompletionSection
                    task={task}
                    phase={phase}
                    eventName={eventName || ''}
                    isPMO={isPMO}
                    onComplete={() => { load(); setSelectedTask(null); }}
                  />
                </div>

                {/* ── Ações ── */}
                <div style={{ paddingTop: 16, borderTop: '1px solid var(--cbrio-border)' }}>
                  {!confirmDelete ? (
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button onClick={() => setConfirmDelete(true)}
                        style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#ef4444', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                        Excluir
                      </button>
                    </div>
                  ) : (
                    <div style={{ background: '#fee2e220', border: '1px solid #ef444430', borderRadius: 8, padding: 12 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#ef4444', marginBottom: 8 }}>Excluir "{task.titulo}"?</div>
                      <div style={{ fontSize: 11, color: C.t2, marginBottom: 10 }}>Esta acao nao pode ser desfeita. O card e suas subtarefas serao removidos.</div>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button onClick={() => setConfirmDelete(false)}
                          style={{ padding: '6px 14px', borderRadius: 6, border: `1px solid ${C.border}`, background: 'transparent', cursor: 'pointer', fontSize: 12 }}>Cancelar</button>
                        <button onClick={async () => { await handleDeleteTask(task.id); setConfirmDelete(false); setSelectedTask(null); }}
                          style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: '#ef4444', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Sim, excluir</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );
}

const modalOverlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 };
const modalBox = { background: 'var(--cbrio-card, #fff)', borderRadius: 12, padding: '20px 24px', width: '100%', maxWidth: 460, maxHeight: '90vh', overflowY: 'auto' };
const lblStyle = { fontSize: 11, fontWeight: 600, color: 'var(--cbrio-text2)', display: 'block', marginBottom: 4 };
const inputStyle = { width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--cbrio-border)', fontSize: 12, color: 'var(--cbrio-text)', outline: 'none' };
