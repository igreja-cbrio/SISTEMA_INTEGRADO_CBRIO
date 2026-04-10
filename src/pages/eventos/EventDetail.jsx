import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { events as api, meetings as meetingsApi, cycles as cyclesApi } from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'sonner';
import TaskFormModal from './components/TaskFormModal';
import MeetingFormModal from './components/MeetingFormModal';
import CycleView from './components/CycleView';
import BudgetPanel from './components/BudgetPanel';

const C = {
  dark: 'var(--cbrio-text)', t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)', border: 'var(--cbrio-border)',
  accent: '#00B39D', accentBg: '#f3e8ff',
};

const STATUS = {
  'no-prazo':  { label: 'No prazo',   color: '#10b981', bg: '#ecfdf5' },
  'em-risco':  { label: 'Em risco',   color: '#f59e0b', bg: '#fffbeb' },
  'atrasado':  { label: 'Atrasado',   color: '#ef4444', bg: '#fef2f2' },
  'concluido': { label: 'Concluído',  color: 'var(--cbrio-text2)', bg: 'var(--cbrio-bg)' },
};

const TASK_STATUS = {
  'pendente':      { label: 'Pendente',      color: 'var(--cbrio-text3)', bg: 'var(--cbrio-bg)' },
  'em-andamento':  { label: 'Em andamento',  color: '#3b82f6', bg: '#eff6ff' },
  'concluida':     { label: 'Concluída',     color: '#10b981', bg: '#ecfdf5' },
};

const PRIORITY = {
  'urgente': { label: 'Urgente', color: '#ef4444' },
  'alta':    { label: 'Alta',    color: '#f59e0b' },
  'media':   { label: 'Média',   color: '#3b82f6' },
  'baixa':   { label: 'Baixa',   color: 'var(--cbrio-text3)' },
};

function Badge({ text, color, bg }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 6, color, background: bg }}>
      {text}
    </span>
  );
}

function InfoRow({ label, value }) {
  if (!value) return null;
  return (
    <div style={{ marginBottom: 6 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: C.t2 }}>{label}: </span>
      <span style={{ fontSize: 13, color: C.dark }}>{value}</span>
    </div>
  );
}

export default function EventDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const isDiretor = profile?.role === 'diretor';

  const [event, setEvent] = useState(null);
  const [hasCycle, setHasCycle] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(null);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [editTask, setEditTask] = useState(null);
  const [showMeetingForm, setShowMeetingForm] = useState(false);
  const [commentText, setCommentText] = useState({});

  const load = async () => {
    try {
      const data = await api.get(id);
      setEvent(data);
      // Verificar se o evento tem ciclo criativo
      try {
        const cycleData = await cyclesApi.get(id);
        const has = !!cycleData?.cycle;
        setHasCycle(has);
        if (tab === null) setTab(has ? 'ciclo criativo' : 'tarefas');
      } catch {
        setHasCycle(false);
        if (tab === null) setTab('tarefas');
      }
    } catch (e) {
      console.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const handleDeleteEvent = async () => {
    if (!confirm('Tem certeza que deseja excluir este evento?')) return;
    try { await api.remove(id); navigate('/eventos'); }
    catch (e) { toast.error(e.message || 'Erro ao excluir evento'); }
  };

  const handleFinalize = async () => {
    try { await api.update(id, { status: 'concluido' }); toast.success('Evento concluído'); load(); }
    catch (e) { toast.error(e.message || 'Erro ao concluir evento'); }
  };

  // Tasks
  const handleSaveTask = async (data) => {
    try {
      if (editTask) { await api.updateTask(editTask.id, data); }
      else { await api.createTask(id, data); }
      setShowTaskForm(false); setEditTask(null); load();
    } catch (e) { toast.error(e.message || 'Erro ao salvar tarefa'); }
  };

  const handleTaskStatusChange = async (taskId, status) => {
    try { await api.updateTaskStatus(taskId, status); load(); }
    catch (e) { toast.error(e.message || 'Erro ao atualizar status'); }
  };

  const handleDeleteTask = async (taskId) => {
    if (!confirm('Excluir tarefa?')) return;
    try { await api.removeTask(taskId); load(); }
    catch (e) { toast.error(e.message || 'Erro ao excluir tarefa'); }
  };

  // Subtasks
  const handleAddSubtask = async (taskId) => {
    const name = prompt('Nome da subtarefa:');
    if (!name) return;
    try { await api.createSubtask(taskId, { name }); load(); }
    catch (e) { toast.error(e.message || 'Erro ao criar subtarefa'); }
  };

  const handleToggleSubtask = async (subId, done) => {
    try { await api.toggleSubtask(subId, !done); load(); }
    catch (e) { toast.error(e.message || 'Erro ao atualizar subtarefa'); }
  };

  // Comments
  const handleAddComment = async (taskId) => {
    const text = commentText[taskId];
    if (!text?.trim()) return;
    try { await api.addComment(taskId, text); setCommentText(prev => ({ ...prev, [taskId]: '' })); load(); }
    catch (e) { toast.error(e.message || 'Erro ao adicionar comentário'); }
  };

  // Meetings
  const handleSaveMeeting = async (data) => {
    try { await meetingsApi.create({ ...data, event_id: id }); setShowMeetingForm(false); load(); }
    catch (e) { toast.error(e.message || 'Erro ao salvar reunião'); }
  };

  const handleTogglePendency = async (pId, done) => {
    try { await meetingsApi.togglePendency(pId, !done); load(); }
    catch (e) { toast.error(e.message || 'Erro ao atualizar pendência'); }
  };

  if (loading) return <div style={{ padding: 40, color: C.t2 }}>Carregando...</div>;
  if (!event) return <div style={{ padding: 40, color: C.t2 }}>Evento não encontrado</div>;

  const st = STATUS[event.status] || STATUS['no-prazo'];
  const tasks = event.tasks || [];
  const occurrences = event.occurrences || [];
  const eventMeetings = event.meetings || [];
  const tasksDone = tasks.filter(t => t.status === 'concluida').length;
  const progress = tasks.length > 0 ? Math.round((tasksDone / tasks.length) * 100) : 0;

  return (
    <div>
      {/* Header */}
      <button onClick={() => navigate('/eventos')} style={{ ...linkBtn, marginBottom: 12 }}>← Voltar</button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: C.dark, margin: 0 }}>{event.name}</h1>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6 }}>
            <Badge text={st.label} color={st.color} bg={st.bg} />
            {event.category_name && <Badge text={event.category_name} color={C.accent} bg={C.accentBg} />}
            {event.recurrence !== 'unico' && <Badge text={event.recurrence} color="var(--cbrio-text2)" bg="var(--cbrio-bg)" />}
          </div>
        </div>
        {isDiretor && (
          <div style={{ display: 'flex', gap: 6 }}>
            {event.status !== 'concluido' && (
              <button onClick={handleFinalize} style={secondaryBtn}>Finalizar</button>
            )}
            <button onClick={handleDeleteEvent} style={{ ...secondaryBtn, color: '#ef4444', borderColor: '#fecaca' }}>Excluir</button>
          </div>
        )}
      </div>

      {/* Info */}
      <div style={{ background: 'var(--cbrio-card)', borderRadius: 10, padding: 16, border: `1px solid ${C.border}`, marginBottom: 16 }}>
        <div className="info-grid">
          <InfoRow label="Data" value={event.date && new Date(event.date + 'T12:00:00').toLocaleDateString('pt-BR')} />
          <InfoRow label="Responsável" value={event.responsible} />
          <InfoRow label="Local" value={event.location} />
          <InfoRow label="Orçamento" value={event.budget_planned ? `R$ ${Number(event.budget_planned).toLocaleString('pt-BR')}` : null} />
          <InfoRow label="Público esperado" value={event.expected_attendance} />
          <InfoRow label="Público real" value={event.actual_attendance} />
        </div>
        {event.description && <div style={{ fontSize: 13, color: C.dark, marginTop: 8 }}>{event.description}</div>}

        {/* Progress */}
        {tasks.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.t2, marginBottom: 4 }}>
              <span>Progresso</span>
              <span>{tasksDone}/{tasks.length} tarefas ({progress}%)</span>
            </div>
            <div style={{ height: 6, background: 'var(--cbrio-border)', borderRadius: 3 }}>
              <div style={{ height: '100%', width: `${progress}%`, background: '#10b981', borderRadius: 3, transition: 'width 0.3s' }} />
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="tab-bar">
        {(hasCycle
          ? ['ciclo criativo', 'ocorrências']
          : ['tarefas', 'reuniões', 'ocorrências']
        ).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '8px 16px', border: 'none', background: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: 600, color: tab === t ? C.accent : C.t3,
            borderBottom: tab === t ? `2px solid ${C.accent}` : '2px solid transparent',
          }}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
            {t === 'tarefas' && ` (${tasks.length})`}
            {t === 'reuniões' && ` (${eventMeetings.length})`}
            {t === 'ocorrências' && ` (${occurrences.length})`}
          </button>
        ))}
      </div>

      {/* Tab: Tarefas */}
      {tab === 'tarefas' && (
        <div>
          {isDiretor && (
            <button onClick={() => { setEditTask(null); setShowTaskForm(true); }} style={{ ...primaryBtn, marginBottom: 12 }}>
              + Nova Tarefa
            </button>
          )}
          <div className="kanban-grid">
            {['pendente', 'em-andamento', 'concluida'].map(col => {
              const colTasks = tasks.filter(t => t.status === col);
              const ts = TASK_STATUS[col];
              return (
                <div key={col} style={{ background: 'var(--cbrio-table-header)', borderRadius: 10, padding: 10 }}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { const taskId = e.dataTransfer.getData('taskId'); if (taskId) handleTaskStatusChange(taskId, col); }}
                >
                  <div style={{ fontSize: 12, fontWeight: 700, color: ts.color, marginBottom: 8 }}>
                    {ts.label} ({colTasks.length})
                  </div>
                  {colTasks.map(task => (
                    <div key={task.id} draggable onDragStart={e => e.dataTransfer.setData('taskId', task.id)}
                      style={{ background: 'var(--cbrio-card)', borderRadius: 8, padding: 10, marginBottom: 6, border: `1px solid ${C.border}`, cursor: 'grab' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: C.dark }}>{task.name}</div>
                        {isDiretor && (
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button onClick={() => { setEditTask(task); setShowTaskForm(true); }} style={iconBtn}>✎</button>
                            <button onClick={() => handleDeleteTask(task.id)} style={iconBtn}>×</button>
                          </div>
                        )}
                      </div>
                      {task.responsible && <div style={{ fontSize: 11, color: C.t2, marginTop: 2 }}>{task.responsible}</div>}
                      <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                        {task.priority && <Badge text={PRIORITY[task.priority]?.label || task.priority} color={PRIORITY[task.priority]?.color || C.t3} bg="var(--cbrio-bg)" />}
                        {task.deadline && <span style={{ fontSize: 10, color: C.t3 }}>{new Date(task.deadline + 'T12:00:00').toLocaleDateString('pt-BR')}</span>}
                      </div>

                      {/* Subtasks */}
                      {(task.subtasks || []).length > 0 && (
                        <div style={{ marginTop: 6, borderTop: `1px solid ${C.border}`, paddingTop: 4 }}>
                          {task.subtasks.map(sub => (
                            <div key={sub.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '2px 0' }}>
                              <input type="checkbox" checked={sub.done} onChange={() => handleToggleSubtask(sub.id, sub.done)} />
                              <span style={{ textDecoration: sub.done ? 'line-through' : 'none', color: sub.done ? C.t3 : C.dark }}>{sub.name}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {isDiretor && (
                        <button onClick={() => handleAddSubtask(task.id)} style={{ ...linkBtn, fontSize: 10, marginTop: 4 }}>+ Subtarefa</button>
                      )}

                      {/* Comments */}
                      {(task.comments || []).length > 0 && (
                        <div style={{ marginTop: 6, borderTop: `1px solid ${C.border}`, paddingTop: 4 }}>
                          {task.comments.map(c => (
                            <div key={c.id} style={{ fontSize: 11, marginBottom: 4 }}>
                              <span style={{ fontWeight: 600, color: C.accent }}>{c.author_name}</span>
                              <span style={{ color: C.t3 }}> · {new Date(c.created_at).toLocaleDateString('pt-BR')}</span>
                              <div style={{ color: C.dark }}>{c.text}</div>
                            </div>
                          ))}
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                        <input type="text" placeholder="Comentar..." value={commentText[task.id] || ''}
                          onChange={e => setCommentText(prev => ({ ...prev, [task.id]: e.target.value }))}
                          onKeyDown={e => { if (e.key === 'Enter') handleAddComment(task.id); }}
                          style={{ flex: 1, padding: '4px 8px', borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 11 }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab: Ciclo Criativo */}
      {tab === 'ciclo criativo' && (
        <div>
          <BudgetPanel eventId={id} budget={null} onReload={load} />
          <CycleView eventId={id} />
        </div>
      )}

      {/* Tab: Reuniões */}
      {tab === 'reuniões' && (
        <div>
          {isDiretor && (
            <button onClick={() => setShowMeetingForm(true)} style={{ ...primaryBtn, marginBottom: 12 }}>
              + Nova Reunião
            </button>
          )}
          {eventMeetings.length === 0 && <div style={{ color: C.t3, fontSize: 13, padding: 16 }}>Nenhuma reunião registrada</div>}
          {eventMeetings.map(m => (
            <div key={m.id} style={{ background: 'var(--cbrio-card)', borderRadius: 10, padding: 14, border: `1px solid ${C.border}`, marginBottom: 8 }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: C.dark }}>{m.title}</div>
              <div style={{ fontSize: 11, color: C.t2, marginTop: 2 }}>
                {m.date && new Date(m.date + 'T12:00:00').toLocaleDateString('pt-BR')}
                {m.participants?.length > 0 && ` · ${m.participants.join(', ')}`}
              </div>
              {m.decisions && <div style={{ fontSize: 12, color: C.dark, marginTop: 6 }}><strong>Decisões:</strong> {m.decisions}</div>}
              {m.notes && <div style={{ fontSize: 12, color: C.t2, marginTop: 4 }}>{m.notes}</div>}

              {(m.pendencies || []).length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: C.t2, marginBottom: 4 }}>Pendências</div>
                  {m.pendencies.map(p => (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '3px 0' }}>
                      <input type="checkbox" checked={p.done} onChange={() => handleTogglePendency(p.id, p.done)} />
                      <span style={{ textDecoration: p.done ? 'line-through' : 'none', color: p.done ? C.t3 : C.dark, flex: 1 }}>
                        {p.description}
                      </span>
                      {p.responsible && <span style={{ fontSize: 10, color: C.t3 }}>{p.responsible}</span>}
                      {p.deadline && <span style={{ fontSize: 10, color: C.t3 }}>{new Date(p.deadline + 'T12:00:00').toLocaleDateString('pt-BR')}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Tab: Ocorrências */}
      {tab === 'ocorrências' && (
        <div>
          {occurrences.length === 0 && <div style={{ color: C.t3, fontSize: 13, padding: 16 }}>Evento único — sem ocorrências</div>}
          {occurrences.map(occ => (
            <div key={occ.id} style={{ background: 'var(--cbrio-card)', borderRadius: 10, padding: 12, border: `1px solid ${C.border}`, marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: 13, fontWeight: 600, color: C.dark }}>
                  {occ.date && new Date(occ.date + 'T12:00:00').toLocaleDateString('pt-BR')}
                </span>
                {occ.attendance && <span style={{ fontSize: 11, color: C.t2 }}> · {occ.attendance} presentes</span>}
                {occ.notes && <div style={{ fontSize: 11, color: C.t2, marginTop: 2 }}>{occ.notes}</div>}
              </div>
              <Badge
                text={occ.status === 'concluido' ? 'Concluído' : 'Pendente'}
                color={occ.status === 'concluido' ? '#10b981' : 'var(--cbrio-text3)'}
                bg={occ.status === 'concluido' ? '#ecfdf5' : 'var(--cbrio-bg)'}
              />
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      {showTaskForm && (
        <TaskFormModal
          task={editTask}
          onSave={handleSaveTask}
          onClose={() => { setShowTaskForm(false); setEditTask(null); }}
        />
      )}
      {showMeetingForm && (
        <MeetingFormModal
          onSave={handleSaveMeeting}
          onClose={() => setShowMeetingForm(false)}
        />
      )}
    </div>
  );
}

const primaryBtn = {
  padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer',
  background: '#00B39D', color: '#fff', fontWeight: 600, fontSize: 13,
};
const secondaryBtn = {
  padding: '6px 14px', borderRadius: 8, border: '1px solid var(--cbrio-border)', cursor: 'pointer',
  background: 'var(--cbrio-card)', color: 'var(--cbrio-text2)', fontWeight: 600, fontSize: 12,
};
const linkBtn = {
  background: 'none', border: 'none', color: '#00B39D', cursor: 'pointer',
  fontWeight: 600, fontSize: 12, padding: 0,
};
const iconBtn = {
  background: 'none', border: 'none', cursor: 'pointer', fontSize: 14,
  color: 'var(--cbrio-text3)', padding: '0 2px',
};
