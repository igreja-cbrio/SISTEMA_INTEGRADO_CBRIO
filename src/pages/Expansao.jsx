import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { expansion, users } from '../api';
import { AlertTriangle } from 'lucide-react';

// ── Tema (CSS vars para dark/light mode) ──────────────────
const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', text: 'var(--cbrio-text)',
  t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)', border: 'var(--cbrio-border)',
  primary: '#7c3aed', primaryBg: '#ede9fe',
  green: '#10b981', greenBg: '#d1fae5', red: '#ef4444', redBg: '#fee2e2',
  amber: '#f59e0b', amberBg: '#fef3c7', blue: '#3b82f6', blueBg: '#dbeafe',
};

// ── Eixos Estratégicos ─────────────────────────────────────
const AXES = {
  2026: { year: 2026, name: 'Unidade / Consolidação', color: '#10b981', bg: '#d1fae5',
    objective: 'Fortalecer a base e unificar processos internos' },
  2027: { year: 2027, name: 'Pausa Estratégica e Reavaliação', color: '#3b82f6', bg: '#dbeafe',
    objective: 'Avaliar resultados e recalibrar estratégias' },
  2028: { year: 2028, name: 'Expansão Qualificada', color: '#f59e0b', bg: '#fef3c7',
    objective: 'Crescer de forma sustentável e planejada' },
  2029: { year: 2029, name: 'Maturidade e Consolidação', color: '#8b5cf6', bg: '#f5f3ff',
    objective: 'Consolidar expansão e institucionalizar processos' },
};

const STATUS_MAP = {
  'pendente': { label: 'Pendente', c: '#9ca3af', bg: '#f3f4f6' },
  'em-andamento': { label: 'Em Andamento', c: C.blue, bg: C.blueBg },
  'concluido': { label: 'Concluído', c: C.green, bg: C.greenBg },
  'bloqueado': { label: 'Bloqueado', c: C.red, bg: C.redBg },
};

const TASK_STATUS = {
  'pendente': { label: 'Pendente', c: '#9ca3af', bg: '#f3f4f6' },
  'em-andamento': { label: 'Em Andamento', c: C.blue, bg: C.blueBg },
  'concluida': { label: 'Concluída', c: C.green, bg: C.greenBg },
  'bloqueada': { label: 'Bloqueada', c: C.red, bg: C.redBg },
};

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

// ── Estilos ─────────────────────────────────────────────────
const styles = {
  page: { maxWidth: 1600, margin: '0 auto', padding: '0 24px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 },
  title: { fontSize: 28, fontWeight: 800, color: C.text, letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: C.t2, marginTop: 2 },
  tabs: { display: 'flex', gap: 0, borderBottom: `2px solid ${C.border}`, marginBottom: 24 },
  tab: (a) => ({
    padding: '10px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none', background: 'none',
    color: a ? C.primary : C.t2, borderBottom: a ? `2px solid ${C.primary}` : '2px solid transparent',
    marginBottom: -2, transition: 'all 0.15s',
  }),
  card: { background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.04)', overflow: 'hidden' },
  cardHeader: { padding: '16px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 15, fontWeight: 700, color: C.text },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { padding: '10px 16px', fontSize: 11, fontWeight: 700, color: C.t2, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'left', borderBottom: `1px solid ${C.border}`, background: 'var(--cbrio-table-header, #fafafa)' },
  td: { padding: '12px 16px', fontSize: 13, color: C.text, borderBottom: `1px solid ${C.border}` },
  badge: (color, bg) => ({ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, color, background: bg }),
  btn: (v = 'primary') => ({
    padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none', transition: 'all 0.15s',
    ...(v === 'primary' ? { background: C.primary, color: '#fff' } : {}),
    ...(v === 'secondary' ? { background: 'transparent', color: C.primary, border: `1px solid ${C.primary}` } : {}),
    ...(v === 'danger' ? { background: C.red, color: '#fff' } : {}),
    ...(v === 'ghost' ? { background: 'transparent', color: C.t2, padding: '6px 12px' } : {}),
  }),
  btnSm: { padding: '4px 10px', fontSize: 11 },
  filterRow: { display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' },
  input: { padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, outline: 'none', width: '100%', background: 'var(--cbrio-input-bg, #fff)', color: C.text, boxSizing: 'border-box', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  select: { padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, background: 'var(--cbrio-input-bg, #fff)', color: C.text, outline: 'none', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  textarea: { padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, color: C.text, outline: 'none', width: '100%', boxSizing: 'border-box', minHeight: 60, resize: 'vertical', background: 'var(--cbrio-input-bg, #fff)', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  label: { fontSize: 11, fontWeight: 600, color: C.t2, marginBottom: 4, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5 },
  formGroup: { marginBottom: 14 },
  formRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  overlay: { position: 'fixed', inset: 0, background: 'var(--cbrio-overlay, rgba(0,0,0,0.5))', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: 60, zIndex: 1000 },
  modal: { background: 'var(--cbrio-modal-bg, #fff)', borderRadius: 16, width: '95%', maxWidth: 680, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' },
  modalHeader: { padding: '20px 24px 12px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { fontSize: 18, fontWeight: 700, color: C.text },
  modalBody: { padding: '16px 24px 24px' },
  modalFooter: { padding: '12px 24px 20px', display: 'flex', gap: 8, justifyContent: 'flex-end' },
  empty: { textAlign: 'center', padding: 40, color: C.t3, fontSize: 14 },
  clickRow: { cursor: 'pointer', transition: 'background 0.1s' },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  infoGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 },
  infoLabel: { fontSize: 11, fontWeight: 600, color: C.t3, textTransform: 'uppercase', letterSpacing: 0.5 },
  infoValue: { fontSize: 14, fontWeight: 500, color: C.text, marginTop: 2 },
  progress: { height: 8, borderRadius: 4, background: C.border, overflow: 'hidden', flex: 1 },
  progressBar: (pct, color) => ({ height: '100%', borderRadius: 4, background: color || (pct >= 100 ? C.green : C.primary), width: `${Math.min(pct, 100)}%`, transition: 'width 0.3s' }),
  iconBtn: { background: 'none', border: 'none', cursor: 'pointer', padding: 4, fontSize: 14, color: C.t3, lineHeight: 1 },
  taskRow: { padding: '12px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  subtaskRow: { padding: '8px 20px 8px 44px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10, background: 'var(--cbrio-input-bg)' },
};

// ── Helpers ─────────────────────────────────────────────────
function normDate(d) { return d ? (typeof d === 'string' ? d.slice(0, 10) : '') : ''; }
function fmtDate(d) { const s = normDate(d); if (!s) return '\u2014'; const [y, m, day] = s.split('-'); return `${day}/${m}/${y}`; }
function fmtMoney(v) { return v != null ? `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '\u2014'; }

function sortByUrgency(items) {
  return [...items].sort((a, b) => {
    const pa = normDate(a.date_end || a.expected_delivery);
    const pb = normDate(b.date_end || b.expected_delivery);
    if (!pa && !pb) return 0; if (!pa) return 1; if (!pb) return -1;
    return pa.localeCompare(pb);
  });
}

function DaysCounter({ date, status }) {
  const s = normDate(date);
  if (!s || status === 'concluido') return null;
  const diff = Math.ceil((new Date(s + 'T12:00:00') - new Date()) / 86400000);
  const color = diff < 0 ? C.red : diff <= 7 ? C.amber : C.green;
  const text = diff < 0 ? `${Math.abs(diff)}d atras` : diff === 0 ? 'Hoje' : `${diff}d`;
  return <span style={{ fontSize: 11, fontWeight: 700, color, marginLeft: 6 }}>{text}</span>;
}

function calcTaskProgress(task) {
  if (!task.subtasks || task.subtasks.length === 0) {
    return task.status === 'concluida' ? 100 : task.status === 'em-andamento' ? 50 : 0;
  }
  const total = task.subtasks.reduce((s, st) => s + (st.pct || 0), 0);
  return Math.round(total / task.subtasks.length);
}

function calcMilestoneProgress(milestone) {
  if (!milestone.tasks || milestone.tasks.length === 0) {
    return milestone.status === 'concluido' ? 100 : 0;
  }
  const total = milestone.tasks.reduce((s, t) => s + calcTaskProgress(t), 0);
  return Math.round(total / milestone.tasks.length);
}

function progressColor(pct) {
  if (pct >= 80) return C.green;
  if (pct >= 40) return C.amber;
  return C.red;
}

function axisColor(year) {
  return AXES[year]?.color || C.t3;
}

// ── Componentes auxiliares ──────────────────────────────────
function Modal({ open, onClose, title, children, footer }) {
  if (!open) return null;
  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <div style={styles.modalTitle}>{title}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: C.t3 }}>{'\u2715'}</button>
        </div>
        <div style={styles.modalBody}>{children}</div>
        {footer && <div style={styles.modalFooter}>{footer}</div>}
      </div>
    </div>
  );
}

function ConfirmDialog({ message, onConfirm, onCancel }) {
  if (!message) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}>
      <div style={{ background: 'var(--cbrio-modal-bg)', borderRadius: 16, padding: 28, maxWidth: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.3)', textAlign: 'center' }}>
        <AlertTriangle style={{ width: 36, height: 36, color: '#f59e0b', margin: '0 auto 12px' }} />
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--cbrio-text)', marginBottom: 20 }}>{message}</div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button style={styles.btn('ghost')} onClick={onCancel}>Cancelar</button>
          <button style={styles.btn('danger')} onClick={onConfirm}>Confirmar</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={styles.formGroup}>
      {label && <label style={styles.label}>{label}</label>}
      {children}
    </div>
  );
}

function ProgressBar({ pct, color, height = 8, showLabel = true }) {
  const c = color || progressColor(pct);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
      <div style={{ height, borderRadius: height / 2, background: C.border, flex: 1, overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: height / 2, background: c, width: `${Math.min(100, Math.max(0, pct))}%`, transition: 'width 0.3s' }} />
      </div>
      {showLabel && <span style={{ fontSize: 12, fontWeight: 600, color: c, minWidth: 36, textAlign: 'right' }}>{pct}%</span>}
    </div>
  );
}

function KpiBar({ items }) {
  return (
    <div style={{
      background: C.card, borderRadius: 12, border: `1px solid ${C.border}`,
      padding: '14px 24px', marginBottom: 20, display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)', overflowX: 'auto',
    }}>
      {items.map((item, i) => {
        if (!item) return <div key={i} style={{ width: 1, height: 24, background: C.border }} />;
        return (
          <div key={item.label + i} onClick={item.action}
            style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: item.action ? 'pointer' : 'default', padding: '2px 4px', borderRadius: 6, transition: 'background .15s' }}
            onMouseEnter={e => { if (item.action) e.currentTarget.style.background = `${item.color}15`; }}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <span style={{ fontSize: 20, fontWeight: 800, color: item.color }}>{item.value}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: C.t3, textTransform: 'uppercase', letterSpacing: 0.3, whiteSpace: 'nowrap' }}>{item.label}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── TABS ────────────────────────────────────────────────────
const TAB_LABELS = ['Visao Geral', 'Timeline', 'Marcos', 'Gantt'];

// ═══════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════
export default function Expansao() {
  const { user, profile, getAccessLevel, userAreas, userSetores } = useAuth();
  const accessLevel = getAccessLevel(['Projetos']);
  const userId = user?.id;
  const canEdit = accessLevel >= 3; // líder+ pode criar/editar
  const canEditItem = (item) => {
    if (accessLevel >= 4) return true; // diretor+: edita qualquer visível
    if (accessLevel === 3) return !item.area || userAreas.includes(item.area); // líder: edita da sua área
    if (accessLevel === 2) return item.responsible_id === userId; // assistente: só seus
    return false;
  };

  const [milestones, setMilestones] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState(accessLevel <= 2 ? 2 : 0); // assistente começa na aba Marcos
  const [saving, setSaving] = useState(false);
  const [usersList, setUsersList] = useState([]);

  // Detail state
  const [selectedMilestone, setSelectedMilestone] = useState(null);

  // Filters
  const [fYear, setFYear] = useState('');
  const [fArea, setFArea] = useState('');
  const [fResponsible, setFResponsible] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [listView, setListView] = useState('list'); // list | kanban

  // Gantt
  const [ganttYearFilter, setGanttYearFilter] = useState('');
  const [ganttAreaFilter, setGanttAreaFilter] = useState('');
  const [ganttStatusFilter, setGanttStatusFilter] = useState('');

  // Modals
  const [modalMilestone, setModalMilestone] = useState(null);
  const [modalTask, setModalTask] = useState(null);

  // Kanban drag
  const [dragId, setDragId] = useState(null);
  const [dropCol, setDropCol] = useState(null);

  // Timeline tooltip
  const [tooltip, setTooltip] = useState(null);

  // Confirm dialog
  const [confirmMsg, setConfirmMsg] = useState(null); // { message, onConfirm }

  // ── Loaders ──
  const load = useCallback(async () => {
    try {
      setError('');
      const [msRes, db] = await Promise.all([expansion.milestones(), expansion.dashboard()]);
      // API agora retorna { milestones, accessLevel, ... } ou array (backward compat)
      const ms = msRes?.milestones || (Array.isArray(msRes) ? msRes : []);
      setMilestones(Array.isArray(ms) ? ms : []);
      setDashboard(db);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { users.list().then(setUsersList).catch(() => {}); }, []);

  // ── Filtro por nível de acesso ──
  const visibleMilestones = useMemo(() => {
    if (accessLevel >= 5) return milestones; // Admin: tudo
    if (accessLevel >= 4) {
      // Diretor: tudo das áreas do setor
      if (userAreas.length === 0) return milestones; // sem áreas configuradas → vê tudo
      return milestones.filter(m => !m.area || userAreas.includes(m.area));
    }
    if (accessLevel >= 3) {
      // Líder: tudo da sua área
      return milestones.filter(m => !m.area || userAreas.includes(m.area));
    }
    if (accessLevel >= 2) {
      // Assistente: só itens onde é responsável (por UUID)
      return milestones.filter(m =>
        m.responsible_id === userId ||
        m.tasks?.some(t => t.responsible_id === userId)
      );
    }
    return []; // Negado
  }, [milestones, accessLevel, userAreas, userId]);

  // ── Derived data ──
  const allAreas = useMemo(() => [...new Set(visibleMilestones.map(m => m.area).filter(Boolean))].sort(), [visibleMilestones]);
  const allResponsibles = useMemo(() => [...new Set(visibleMilestones.map(m => m.responsible).filter(Boolean))].sort(), [visibleMilestones]);

  const counts = useMemo(() => {
    const c = { total: visibleMilestones.length, pendente: 0, 'em-andamento': 0, concluido: 0, bloqueado: 0 };
    visibleMilestones.forEach(m => { if (c[m.status] !== undefined) c[m.status]++; });
    return c;
  }, [visibleMilestones]);

  const axisCounts = useMemo(() => {
    const ac = {};
    [2026, 2027, 2028, 2029].forEach(y => {
      const yms = visibleMilestones.filter(m => m.year === y);
      ac[y] = { total: yms.length, done: yms.filter(m => m.status === 'concluido').length };
    });
    return ac;
  }, [visibleMilestones]);

  // ── CRUD Handlers ──
  const saveMilestone = async (form) => {
    // Validate dates
    if (form.date_start && form.date_end && form.date_start > form.date_end) {
      setError('Data início não pode ser posterior à data fim');
      return;
    }
    setSaving(true);
    try {
      if (form.id) {
        await expansion.updateMilestone(form.id, form);
      } else {
        await expansion.createMilestone(form);
      }
      setModalMilestone(null);
      await refreshAll();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const deleteMilestone = (id) => {
    setConfirmMsg({
      message: 'Excluir este marco e todas as suas tarefas?',
      onConfirm: async () => {
        setConfirmMsg(null);
        try {
          await expansion.removeMilestone(id);
          if (selectedMilestone?.id === id) { setSelectedMilestone(null); setTab(2); }
          await load();
        } catch (err) { setError(err.message); }
      },
    });
  };

  const saveTask = async (form, milestoneId) => {
    if (form.start_date && form.deadline && form.start_date > form.deadline) {
      setError('Data início não pode ser posterior ao prazo');
      return;
    }
    setSaving(true);
    try {
      if (form.id) {
        await expansion.updateTask(form.id, form);
      } else {
        await expansion.createTask(milestoneId, form);
      }
      setModalTask(null);
      await refreshAll();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const deleteTask = (id) => {
    setConfirmMsg({
      message: 'Excluir esta tarefa e suas subtarefas?',
      onConfirm: async () => {
        setConfirmMsg(null);
        try {
          await expansion.removeTask(id);
          await load();
          if (selectedMilestone) {
            const ms = await expansion.milestones();
            const updated = ms.find(m => m.id === selectedMilestone.id);
            if (updated) setSelectedMilestone(updated);
            else setSelectedMilestone(null);
          }
        } catch (err) { setError(err.message); }
      },
    });
  };

  // Helper to refresh milestones + detail in one go
  const refreshAll = async () => {
    const [msRes, db] = await Promise.all([expansion.milestones(), expansion.dashboard()]);
    const ms = msRes?.milestones || (Array.isArray(msRes) ? msRes : []);
    setMilestones(Array.isArray(ms) ? ms : []);
    setDashboard(db);
    if (selectedMilestone) {
      const updated = ms.find(m => m.id === selectedMilestone.id);
      setSelectedMilestone(updated || null);
    }
  };

  const addSubtask = async (taskId, name) => {
    if (!name.trim()) return;
    try {
      await expansion.createSubtask(taskId, { name });
      await refreshAll();
    } catch (err) { setError(err.message); }
  };

  const updateSubtaskPct = async (id, pct) => {
    try {
      await expansion.updateSubtaskPct(id, pct);
      await refreshAll();
    } catch (err) { setError(err.message); }
  };

  const deleteSubtask = async (id) => {
    try {
      await expansion.removeSubtask(id);
      await refreshAll();
    } catch (err) { setError(err.message); }
  };

  const openDetail = (mi) => {
    setSelectedMilestone(mi);
    setTab(4);
  };

  // ── KPI drill-down ──
  const kpiDrillDown = (status) => {
    setFStatus(status || '');
    setTab(2);
  };

  const kpiItems = [
    { label: 'Total', value: counts.total, color: C.primary, action: () => kpiDrillDown('') },
    null,
    { label: 'Concluidos', value: counts.concluido, color: C.green, action: () => kpiDrillDown('concluido') },
    { label: 'Em Andamento', value: counts['em-andamento'], color: C.blue, action: () => kpiDrillDown('em-andamento') },
    { label: 'Atrasados', value: visibleMilestones.filter(m => {
      const d = normDate(m.date_end || m.expected_delivery);
      return d && m.status !== 'concluido' && new Date(d + 'T12:00:00') < new Date();
    }).length, color: C.red, action: () => kpiDrillDown('atrasado') },
    { label: 'Bloqueados', value: counts.bloqueado, color: '#9ca3af', action: () => kpiDrillDown('bloqueado') },
  ];

  // ═══════════════════════════════════════════════════════════
  // RENDER — TAB 0: VISAO GERAL
  // ═══════════════════════════════════════════════════════════
  function renderVisaoGeral() {
    const overallPct = counts.total > 0 ? Math.round((counts.concluido / counts.total) * 100) : 0;

    // Workload by responsible
    const workloadMap = {};
    visibleMilestones.forEach(m => {
      const name = m.responsible || 'Sem responsavel';
      if (!workloadMap[name]) workloadMap[name] = { name, count: 0 };
      workloadMap[name].count++;
    });
    const workloadArr = Object.values(workloadMap).sort((a, b) => b.count - a.count).slice(0, 8);
    const maxWork = workloadArr.length > 0 ? Math.max(...workloadArr.map(w => w.count), 1) : 1;

    // Upcoming milestones (next 30 days)
    const now = new Date();
    const in30 = new Date(); in30.setDate(in30.getDate() + 30);
    const upcoming = sortByUrgency(
      visibleMilestones.filter(m => {
        if (m.status === 'concluido') return false;
        const d = normDate(m.date_end || m.expected_delivery);
        if (!d) return false;
        const dt = new Date(d + 'T12:00:00');
        return dt >= now && dt <= in30;
      })
    ).slice(0, 8);

    return (
      <>
        {/* Progresso geral */}
        <div style={{ ...styles.card, padding: '20px 24px', marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Progresso Geral</span>
            <span style={{ fontSize: 20, fontWeight: 800, color: progressColor(overallPct) }}>{overallPct}%</span>
          </div>
          <div style={{ height: 14, borderRadius: 7, background: C.border, overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 7, background: `linear-gradient(90deg, ${AXES[2026].color}, ${AXES[2027].color}, ${AXES[2028].color}, ${AXES[2029].color})`, width: `${overallPct}%`, transition: 'width 0.5s' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.t3, marginTop: 6 }}>
            <span>{counts.concluido} de {counts.total} marcos concluidos</span>
            <span>Meta: 93 marcos em 4 anos</span>
          </div>
        </div>

        {/* 4 Axis Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginBottom: 20 }}>
          {[2026, 2027, 2028, 2029].map(year => {
            const ax = AXES[year];
            const ac = axisCounts[year] || { total: 0, done: 0 };
            const pct = ac.total > 0 ? Math.round((ac.done / ac.total) * 100) : 0;
            const isCurrentYear = new Date().getFullYear() === year;
            return (
              <div key={year} onClick={() => { setFYear(String(year)); setTab(2); }}
                style={{
                  ...styles.card, padding: '20px 24px', cursor: 'pointer',
                  borderLeft: `4px solid ${ax.color}`, transition: 'box-shadow 0.15s, transform 0.15s',
                  ...(isCurrentYear ? { boxShadow: `0 0 0 2px ${ax.color}40` } : {}),
                }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = `0 4px 16px ${ax.color}30`; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = isCurrentYear ? `0 0 0 2px ${ax.color}40` : 'none'; e.currentTarget.style.transform = 'none'; }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: ax.color }}>{year}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginTop: 2 }}>{ax.name}</div>
                  </div>
                  {isCurrentYear && <span style={styles.badge(ax.color, ax.bg)}>Atual</span>}
                </div>
                <div style={{ fontSize: 11, color: C.t3, marginBottom: 10, lineHeight: 1.3 }}>{ax.objective}</div>
                <ProgressBar pct={pct} color={ax.color} height={6} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.t3, marginTop: 6 }}>
                  <span>{ac.done}/{ac.total} marcos</span>
                  <span style={{ fontWeight: 600, color: ax.color }}>{pct}%</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* KPI Bar */}
        <KpiBar items={kpiItems} />

        {/* Workload + Upcoming side by side */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 20 }}>
          {/* Workload */}
          {workloadArr.length > 0 && (
            <div style={{ ...styles.card, flex: '1 1 340px', minWidth: 280 }}>
              <div style={{ padding: '20px 24px' }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 12 }}>Carga por Responsavel</div>
                {workloadArr.map((w, i) => (
                  <div key={i} onClick={() => { setFResponsible(w.name); setTab(2); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, cursor: 'pointer', padding: '3px 4px', borderRadius: 6, transition: 'background .1s' }}
                    onMouseEnter={e => e.currentTarget.style.background = C.bg}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: C.text, width: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.name}</span>
                    <div style={{ flex: 1, height: 8, background: C.border, borderRadius: 4 }}>
                      <div style={{ height: '100%', width: `${Math.min((w.count / maxWork) * 100, 100)}%`, borderRadius: 4, background: C.primary, transition: 'width 0.3s' }} />
                    </div>
                    <span style={{ fontSize: 12, color: C.t3, fontWeight: 600, minWidth: 50, textAlign: 'right' }}>{w.count} marcos</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Upcoming milestones */}
          <div style={{ ...styles.card, flex: '1 1 340px', minWidth: 280 }}>
            <div style={{ padding: '20px 24px' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 12 }}>Proximos Marcos (30 dias)</div>
              {upcoming.length === 0 ? (
                <div style={{ fontSize: 13, color: C.t3 }}>Nenhum marco nos proximos 30 dias.</div>
              ) : (
                upcoming.map(m => (
                  <div key={m.id} onClick={() => openDetail(m)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: `1px solid ${C.border}`, cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.background = C.bg}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: axisColor(m.year), flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</div>
                      <div style={{ fontSize: 11, color: C.t3 }}>{m.area || '\u2014'} | {m.responsible || '\u2014'}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 11, color: C.t3 }}>{fmtDate(m.date_end || m.expected_delivery)}</div>
                      <DaysCounter date={m.date_end || m.expected_delivery} status={m.status} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // RENDER — TAB 1: TIMELINE
  // ═══════════════════════════════════════════════════════════
  function renderTimeline() {
    const today = new Date();
    const todayStr = normDate(today.toISOString());

    // Timeline: Jan 2026 -> Dec 2029 = 48 months
    const startYear = 2026;
    const totalMonths = 48;
    const monthToPct = (year, month) => {
      const idx = (year - startYear) * 12 + month;
      return (idx / totalMonths) * 100;
    };
    const dateToPct = (dateStr) => {
      if (!dateStr) return null;
      const d = new Date(dateStr + 'T12:00:00');
      const y = d.getFullYear();
      const m = d.getMonth();
      const daysInMonth = new Date(y, m + 1, 0).getDate();
      const dayPct = (d.getDate() - 1) / daysInMonth * (100 / totalMonths);
      return monthToPct(y, m) + dayPct;
    };

    const todayPct = (() => {
      const y = today.getFullYear();
      const m = today.getMonth();
      const daysInMonth = new Date(y, m + 1, 0).getDate();
      const dayPct = (today.getDate() - 1) / daysInMonth * (100 / totalMonths);
      return monthToPct(y, m) + dayPct;
    })();

    // Month labels (show every 3 months for space)
    const monthLabels = [];
    for (let y = 2026; y <= 2029; y++) {
      for (let m = 0; m < 12; m++) {
        const pct = monthToPct(y, m);
        monthLabels.push({ label: m === 0 ? `${MONTHS[m]} ${y}` : MONTHS[m], pct, isJan: m === 0, year: y, month: m });
      }
    }

    const statusColor = (status) => {
      if (status === 'concluido') return C.green;
      if (status === 'em-andamento') return C.blue;
      if (status === 'bloqueado') return C.red;
      return '#9ca3af';
    };

    const BAND_H = 80;
    const HEADER_H = 30;

    return (
      <>
        <div style={{ fontSize: 13, color: C.t3, marginBottom: 12 }}>Clique em um marco para ver detalhes. Passe o mouse para informacoes rapidas.</div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
          {Object.entries(STATUS_MAP).map(([k, v]) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: statusColor(k) }} />
              <span style={{ fontSize: 12, color: C.t2 }}>{v.label}</span>
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 2, height: 14, background: C.red }} />
            <span style={{ fontSize: 12, color: C.t2 }}>Hoje</span>
          </div>
        </div>

        <div style={{ ...styles.card, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: 1200, position: 'relative' }}>
              {/* Month header */}
              <div style={{ height: HEADER_H, position: 'relative', borderBottom: `1px solid ${C.border}`, background: 'var(--cbrio-table-header, #fafafa)' }}>
                {monthLabels.filter((_, i) => i % 3 === 0).map((m, i) => (
                  <div key={i} style={{
                    position: 'absolute', left: `${m.pct}%`, top: 0, height: '100%',
                    borderLeft: m.isJan ? `2px solid ${C.t3}` : `1px solid ${C.border}`,
                    padding: '6px 4px', fontSize: 10, fontWeight: m.isJan ? 700 : 500,
                    color: m.isJan ? C.text : C.t3, whiteSpace: 'nowrap',
                  }}>{m.label}</div>
                ))}
                {/* Today line top */}
                {todayPct >= 0 && todayPct <= 100 && (
                  <>
                    <div style={{ position: 'absolute', left: `${todayPct}%`, top: 0, width: 2, height: '100%', background: C.red, zIndex: 5 }} />
                    <div style={{ position: 'absolute', left: `${todayPct}%`, top: -1, transform: 'translateX(-50%)', fontSize: 9, fontWeight: 700, color: C.red, background: C.card, padding: '1px 4px', borderRadius: 4, zIndex: 6 }}>hoje</div>
                  </>
                )}
              </div>

              {/* Year bands */}
              {[2026, 2027, 2028, 2029].map(year => {
                const ax = AXES[year];
                const yearMilestones = visibleMilestones.filter(m => m.year === year);
                const bandLeft = monthToPct(year, 0);
                const bandWidth = (12 / totalMonths) * 100;

                return (
                  <div key={year} style={{ position: 'relative', height: BAND_H, borderBottom: `1px solid ${C.border}` }}>
                    {/* Year band background */}
                    <div style={{ position: 'absolute', left: `${bandLeft}%`, width: `${bandWidth}%`, top: 0, height: '100%', background: `${ax.color}08` }} />

                    {/* Year label */}
                    <div style={{ position: 'absolute', left: `${bandLeft}%`, top: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700, color: ax.color, zIndex: 3 }}>
                      {year} - {ax.name}
                    </div>

                    {/* Quarter lines */}
                    {[3, 6, 9].map(m => (
                      <div key={m} style={{ position: 'absolute', left: `${monthToPct(year, m)}%`, top: 0, height: '100%', width: 1, background: C.border, opacity: 0.4 }} />
                    ))}

                    {/* Year boundary lines */}
                    <div style={{ position: 'absolute', left: `${bandLeft}%`, top: 0, height: '100%', width: 2, background: `${ax.color}40` }} />

                    {/* Today line through bands */}
                    {todayPct >= 0 && todayPct <= 100 && (
                      <div style={{ position: 'absolute', left: `${todayPct}%`, top: 0, width: 2, height: '100%', background: C.red, zIndex: 4, opacity: 0.5 }} />
                    )}

                    {/* Milestone markers */}
                    {yearMilestones.map(mi => {
                      const dateStr = normDate(mi.date_end || mi.expected_delivery || mi.date_start);
                      const pct = dateToPct(dateStr);
                      if (pct === null || pct < 0 || pct > 100) return null;

                      const sc = statusColor(mi.status);
                      const size = 14;

                      return (
                        <div key={mi.id}
                          onClick={() => openDetail(mi)}
                          onMouseEnter={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setTooltip({ x: rect.left + rect.width / 2, y: rect.top - 8, mi });
                          }}
                          onMouseLeave={() => setTooltip(null)}
                          style={{
                            position: 'absolute',
                            left: `${pct}%`,
                            top: '50%',
                            transform: 'translate(-50%, -20%) rotate(45deg)',
                            width: size, height: size,
                            background: sc,
                            border: `2px solid ${C.card}`,
                            boxShadow: `0 0 0 1px ${sc}`,
                            cursor: 'pointer',
                            zIndex: 3,
                            transition: 'transform 0.15s, box-shadow 0.15s',
                          }}
                          onMouseOver={e => { e.currentTarget.style.transform = 'translate(-50%, -20%) rotate(45deg) scale(1.4)'; e.currentTarget.style.boxShadow = `0 0 0 2px ${sc}, 0 2px 8px ${sc}60`; }}
                          onMouseOut={e => { e.currentTarget.style.transform = 'translate(-50%, -20%) rotate(45deg)'; e.currentTarget.style.boxShadow = `0 0 0 1px ${sc}`; }}
                        />
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Tooltip (portal-like) */}
        {tooltip && (
          <div style={{
            position: 'fixed', left: tooltip.x, top: tooltip.y,
            transform: 'translate(-50%, -100%)',
            background: 'var(--cbrio-modal-bg, #1a1a2e)', border: `1px solid ${C.border}`,
            borderRadius: 8, padding: '8px 12px', zIndex: 2000,
            boxShadow: '0 4px 16px rgba(0,0,0,0.2)', maxWidth: 260, pointerEvents: 'none',
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 4 }}>{tooltip.mi.name}</div>
            <div style={{ fontSize: 11, color: C.t3 }}>
              {fmtDate(tooltip.mi.date_start)} {'\u2192'} {fmtDate(tooltip.mi.date_end)}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <span style={styles.badge(statusColor(tooltip.mi.status), `${statusColor(tooltip.mi.status)}20`)}>{STATUS_MAP[tooltip.mi.status]?.label || tooltip.mi.status}</span>
              {tooltip.mi.area && <span style={{ fontSize: 10, color: C.t3 }}>{tooltip.mi.area}</span>}
            </div>
          </div>
        )}
      </>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // RENDER — TAB 2: MARCOS (List + Kanban)
  // ═══════════════════════════════════════════════════════════
  function renderMarcos() {
    // Apply filters
    let filtered = [...visibleMilestones];
    if (fYear) filtered = filtered.filter(m => String(m.year) === fYear);
    if (fArea) filtered = filtered.filter(m => m.area === fArea);
    if (fResponsible) filtered = filtered.filter(m => m.responsible === fResponsible);
    if (fStatus) {
      if (fStatus === 'atrasado') {
        filtered = filtered.filter(m => {
          const d = normDate(m.date_end || m.expected_delivery);
          return d && m.status !== 'concluido' && new Date(d + 'T12:00:00') < new Date();
        });
      } else {
        filtered = filtered.filter(m => m.status === fStatus);
      }
    }

    return (
      <>
        {/* Filters */}
        <div style={styles.filterRow}>
          {/* Year buttons */}
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => setFYear('')} style={{
              padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: fYear === '' ? 700 : 400,
              border: fYear === '' ? `2px solid ${C.primary}` : `1px solid ${C.border}`,
              background: fYear === '' ? `${C.primary}15` : 'transparent', color: fYear === '' ? C.primary : C.t3, cursor: 'pointer',
            }}>Todos</button>
            {[2026, 2027, 2028, 2029].map(y => {
              const ax = AXES[y];
              const active = fYear === String(y);
              return (
                <button key={y} onClick={() => setFYear(active ? '' : String(y))} style={{
                  padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: active ? 700 : 400,
                  border: active ? `2px solid ${ax.color}` : `1px solid ${C.border}`,
                  background: active ? `${ax.color}15` : 'transparent', color: active ? ax.color : C.t3, cursor: 'pointer',
                }}>{y}</button>
              );
            })}
          </div>

          <select value={fArea} onChange={e => setFArea(e.target.value)} style={styles.select}>
            <option value="">Todas as areas</option>
            {allAreas.map(a => <option key={a} value={a}>{a}</option>)}
          </select>

          <select value={fResponsible} onChange={e => setFResponsible(e.target.value)} style={styles.select}>
            <option value="">Todos os responsaveis</option>
            {allResponsibles.map(r => <option key={r} value={r}>{r}</option>)}
          </select>

          <select value={fStatus} onChange={e => setFStatus(e.target.value)} style={styles.select}>
            <option value="">Todos os status</option>
            {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            <option value="atrasado">Atrasado</option>
          </select>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
            <button onClick={() => setListView('list')} style={{ ...styles.btn(listView === 'list' ? 'primary' : 'ghost'), ...styles.btnSm }}>Lista</button>
            <button onClick={() => setListView('kanban')} style={{ ...styles.btn(listView === 'kanban' ? 'primary' : 'ghost'), ...styles.btnSm }}>Kanban</button>
          </div>
        </div>

        <div style={{ fontSize: 11, color: C.t3, marginBottom: 12 }}>{filtered.length} marco(s) encontrado(s)</div>

        {listView === 'list' ? renderMarcosTable(filtered) : renderMarcosKanban(filtered)}
      </>
    );
  }

  function renderMarcosTable(filtered) {
    const sorted = sortByUrgency(filtered);
    return (
      <div style={styles.card}>
        <div style={{ overflowX: 'auto' }}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>#</th>
                <th style={styles.th}>Nome</th>
                <th style={styles.th}>Eixo</th>
                <th style={styles.th}>Area</th>
                <th style={styles.th}>Responsavel</th>
                <th style={styles.th}>Prazo</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Entrega</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr><td colSpan={8} style={styles.empty}>Nenhum marco encontrado.</td></tr>
              ) : sorted.map((mi, idx) => {
                const ax = AXES[mi.year] || {};
                return (
                  <tr key={mi.id} style={styles.clickRow} onClick={() => openDetail(mi)}
                    onMouseEnter={e => e.currentTarget.style.background = C.bg}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ ...styles.td, fontSize: 11, color: C.t3, fontWeight: 600 }}>{mi.sort_order || (idx + 1)}</td>
                    <td style={{ ...styles.td, fontWeight: 600 }}>{mi.name}</td>
                    <td style={styles.td}>
                      <span style={styles.badge(ax.color || C.t3, (ax.bg || '#f3f4f6'))}>
                        {mi.year} {'\u00B7'} {ax.name || '\u2014'}
                      </span>
                    </td>
                    <td style={styles.td}>{mi.area || '\u2014'}</td>
                    <td style={styles.td}>{mi.responsible || '\u2014'}</td>
                    <td style={styles.td}>
                      {fmtDate(mi.date_end)}
                      <DaysCounter date={mi.date_end} status={mi.status} />
                    </td>
                    <td style={styles.td}>
                      <span style={styles.badge(
                        (STATUS_MAP[mi.status] || STATUS_MAP.pendente).c,
                        (STATUS_MAP[mi.status] || STATUS_MAP.pendente).bg
                      )}>
                        {(STATUS_MAP[mi.status] || STATUS_MAP.pendente).label}
                      </span>
                    </td>
                    <td style={styles.td}>{mi.expected_delivery || '\u2014'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  function renderMarcosKanban(filtered) {
    const COLS = [
      { key: 'pendente', label: 'Pendente', color: '#9ca3af' },
      { key: 'em-andamento', label: 'Em Andamento', color: C.blue },
      { key: 'concluido', label: 'Concluido', color: C.green },
      { key: 'bloqueado', label: 'Bloqueado', color: C.red },
    ];

    const handleDragStart = (id) => setDragId(id);
    const handleDragEnd = () => { setDragId(null); setDropCol(null); };
    const handleDragOver = (e, col) => { e.preventDefault(); setDropCol(col); };
    const handleDrop = async (e, col) => {
      e.preventDefault();
      setDropCol(null);
      if (!dragId || !canEdit) { setDragId(null); return; }
      const mi = visibleMilestones.find(m => m.id === dragId);
      setDragId(null);
      if (!mi || mi.status === col) return;
      try {
        await expansion.updateMilestone(mi.id, { ...mi, status: col });
        await refreshAll();
      } catch (err) { setError(err.message); }
    };

    return (
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${COLS.length}, 1fr)`, gap: 12, alignItems: 'flex-start' }}>
        {COLS.map(col => {
          const colItems = filtered.filter(m => m.status === col.key);
          const isDrop = dropCol === col.key;
          return (
            <div key={col.key}
              onDragOver={e => handleDragOver(e, col.key)}
              onDragLeave={() => setDropCol(null)}
              onDrop={e => handleDrop(e, col.key)}
              style={{
                background: isDrop ? `${col.color}10` : C.bg,
                borderRadius: 12, padding: 10, minHeight: 200,
                border: isDrop ? `2px dashed ${col.color}` : `1px solid ${C.border}`,
                transition: 'background 0.15s, border 0.15s',
              }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, padding: '4px 6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: col.color }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{col.label}</span>
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, color: C.t3 }}>{colItems.length}</span>
              </div>
              {colItems.map(mi => {
                const ax = AXES[mi.year] || {};
                const isDragging = dragId === mi.id;
                return (
                  <div key={mi.id}
                    draggable={canEdit}
                    onDragStart={() => handleDragStart(mi.id)}
                    onDragEnd={handleDragEnd}
                    onClick={() => openDetail(mi)}
                    style={{
                      ...styles.card,
                      padding: '12px 14px', marginBottom: 8, cursor: 'pointer',
                      borderLeft: `3px solid ${ax.color || C.t3}`,
                      opacity: isDragging ? 0.4 : 1,
                      transition: 'opacity 0.15s, box-shadow 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'}
                    onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 6 }}>{mi.name}</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                      <span style={{ ...styles.badge(ax.color || C.t3, ax.bg || '#f3f4f6'), fontSize: 9 }}>{mi.year}</span>
                      {mi.area && <span style={{ fontSize: 10, color: C.t3 }}>{mi.area}</span>}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 10, color: C.t3 }}>{mi.responsible || '\u2014'}</span>
                      <DaysCounter date={mi.date_end || mi.expected_delivery} status={mi.status} />
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // RENDER — TAB 3: GANTT
  // ═══════════════════════════════════════════════════════════
  function renderGantt() {
    // Fixed range: Jan 2026 -> Dec 2029
    const ganttStart = new Date('2026-01-01T00:00:00');
    const ganttEnd = new Date('2030-01-01T00:00:00');
    const totalMs = ganttEnd - ganttStart;
    const dateToPct = (dt) => Math.max(0, Math.min(100, ((new Date(dt) - ganttStart) / totalMs) * 100));
    const today = new Date();
    const todayPct = dateToPct(today);

    // Month labels
    const monthLabels = [];
    const mc = new Date(ganttStart);
    while (mc < ganttEnd) {
      monthLabels.push({
        label: mc.getMonth() === 0 ? `${MONTHS[mc.getMonth()]} ${mc.getFullYear()}` : MONTHS[mc.getMonth()],
        pct: dateToPct(mc),
        isJan: mc.getMonth() === 0,
      });
      mc.setMonth(mc.getMonth() + 1);
    }

    // Filters
    let visible = visibleMilestones.filter(m => normDate(m.date_start) && normDate(m.date_end));
    if (ganttYearFilter) visible = visible.filter(m => String(m.year) === ganttYearFilter);
    if (ganttAreaFilter) visible = visible.filter(m => m.area === ganttAreaFilter);
    if (ganttStatusFilter) visible = visible.filter(m => m.status === ganttStatusFilter);

    visible = sortByUrgency(visible);

    const NW = 240;
    const BH = 34;

    return (
      <>
        {/* Filters */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: C.t2, fontWeight: 600 }}>Ano:</span>
          {['', '2026', '2027', '2028', '2029'].map(y => {
            const active = ganttYearFilter === y;
            const ax = y ? AXES[Number(y)] : null;
            const color = ax ? ax.color : C.primary;
            return (
              <button key={y || 'all'} onClick={() => setGanttYearFilter(y)} style={{
                padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: active ? 700 : 400, cursor: 'pointer',
                border: active ? `2px solid ${color}` : `1px solid ${C.border}`,
                background: active ? `${color}15` : 'transparent', color: active ? color : C.t3,
              }}>{y || 'Todos'}</button>
            );
          })}

          <span style={{ width: 1, height: 20, background: C.border }} />

          <select value={ganttAreaFilter} onChange={e => setGanttAreaFilter(e.target.value)}
            style={{ fontSize: 12, padding: '4px 8px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.card, color: C.text }}>
            <option value="">Todas as areas</option>
            {allAreas.map(a => <option key={a} value={a}>{a}</option>)}
          </select>

          <select value={ganttStatusFilter} onChange={e => setGanttStatusFilter(e.target.value)}
            style={{ fontSize: 12, padding: '4px 8px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.card, color: C.text }}>
            <option value="">Todos os status</option>
            {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
          {[{ l: 'No Prazo (>7d)', c: C.green }, { l: 'Urgente (\u22647d)', c: C.amber }, { l: 'Atrasado', c: C.red }, { l: 'Concluido', c: '#d1d5db' }].map(x => (
            <div key={x.l} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 20, height: 10, borderRadius: 4, background: x.c }} />
              <span style={{ fontSize: 12, color: C.t2 }}>{x.l}</span>
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 2, height: 14, background: C.red }} />
            <span style={{ fontSize: 12, color: C.t2 }}>Hoje</span>
          </div>
        </div>

        {visible.length === 0 && <div style={styles.empty}>Nenhum marco com datas definidas nos filtros selecionados.</div>}

        {visible.length > 0 && (
          <>
            <div style={{ fontSize: 11, color: C.t3, marginBottom: 8 }}>{visible.length} marco(s) exibido(s)</div>
            <div style={{ ...styles.card, overflow: 'hidden' }}>
              <div style={{ display: 'flex' }}>
                {/* Left column: names */}
                <div style={{ width: NW, flexShrink: 0, borderRight: `1px solid ${C.border}` }}>
                  <div style={{ height: 30, borderBottom: `1px solid ${C.border}`, background: 'var(--cbrio-table-header, #fafafa)', padding: '0 12px', display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: C.t2, textTransform: 'uppercase' }}>Marco</span>
                  </div>
                  {visible.map(m => {
                    const ax = AXES[m.year] || {};
                    return (
                      <div key={m.id} onClick={() => openDetail(m)}
                        style={{ height: BH, padding: '0 12px', display: 'flex', alignItems: 'center', gap: 6, borderBottom: `1px solid ${C.border}`, cursor: 'pointer' }}
                        onMouseEnter={e => e.currentTarget.style.background = C.bg}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: ax.color || C.t3, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{m.name}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Right: bars */}
                <div style={{ flex: 1, overflowX: 'auto' }}>
                  <div style={{ minWidth: 900, position: 'relative' }}>
                    {/* Month header */}
                    <div style={{ height: 30, position: 'relative', borderBottom: `1px solid ${C.border}`, background: 'var(--cbrio-table-header, #fafafa)' }}>
                      {monthLabels.filter((_, i) => i % 3 === 0).map((m, i) => (
                        <div key={i} style={{
                          position: 'absolute', left: `${m.pct}%`, top: 0, height: '100%',
                          borderLeft: m.isJan ? `2px solid ${C.t3}` : `1px solid ${C.border}`,
                          padding: '6px 4px', fontSize: 10, fontWeight: m.isJan ? 700 : 500,
                          color: m.isJan ? C.text : C.t3, whiteSpace: 'nowrap',
                        }}>{m.label}</div>
                      ))}
                      {todayPct >= 0 && todayPct <= 100 && (
                        <>
                          <div style={{ position: 'absolute', left: `${todayPct}%`, top: 0, width: 2, height: '100%', background: C.red, zIndex: 2 }} />
                          <div style={{ position: 'absolute', left: `${todayPct}%`, top: -1, transform: 'translateX(-50%)', fontSize: 9, fontWeight: 700, color: C.red, background: C.card, padding: '1px 4px', borderRadius: 4, zIndex: 3 }}>hoje</div>
                        </>
                      )}
                    </div>

                    {/* Bars */}
                    {visible.map(m => {
                      const si = normDate(m.date_start);
                      const ei = normDate(m.date_end);
                      const isDone = m.status === 'concluido';
                      const now = new Date();
                      const startDate = si ? new Date(si + 'T12:00:00') : null;
                      const endDate = ei ? new Date(ei + 'T12:00:00') : null;
                      const totalDays = startDate && endDate ? Math.max(Math.ceil((endDate - startDate) / 86400000), 1) : 0;
                      const elapsed = startDate ? Math.max(Math.ceil((now - startDate) / 86400000), 0) : 0;
                      const remaining = endDate ? Math.ceil((endDate - now) / 86400000) : null;
                      const timePct = totalDays > 0 ? Math.min(Math.max((elapsed / totalDays) * 100, 0), 100) : 0;

                      const barColor = isDone ? '#d1d5db' : remaining !== null && remaining < 0 ? C.red : remaining !== null && remaining <= 7 ? C.amber : C.green;
                      let daysText = '';
                      if (isDone) { daysText = '\u2713'; }
                      else if (startDate && now < startDate) { daysText = `em ${Math.ceil((startDate - now) / 86400000)}d`; }
                      else if (remaining !== null && remaining < 0) { daysText = `${Math.abs(remaining)}d atras`; }
                      else if (elapsed > 0 && remaining !== null) { daysText = `${elapsed}d \u25B8 ${remaining}d`; }
                      else if (remaining !== null) { daysText = `${remaining}d`; }

                      let lp = 0, wp = 0;
                      if (si && ei) { lp = dateToPct(si + 'T12:00:00'); const rp = dateToPct(ei + 'T12:00:00'); wp = Math.max(rp - lp, 0.5); }

                      return (
                        <div key={m.id} style={{ position: 'relative', height: BH, borderBottom: `1px solid ${C.border}` }}>
                          {/* Vertical grid lines (quarterly) */}
                          {monthLabels.filter((_, i) => i % 3 === 0).map((ml, i) => (
                            <div key={i} style={{ position: 'absolute', left: `${ml.pct}%`, top: 0, width: 1, height: '100%', background: C.border, opacity: 0.3 }} />
                          ))}
                          {/* Today line */}
                          {todayPct >= 0 && todayPct <= 100 && (
                            <div style={{ position: 'absolute', left: `${todayPct}%`, top: 0, width: 2, height: '100%', background: C.red, zIndex: 2, opacity: 0.3 }} />
                          )}
                          {si && ei && (
                            <div onClick={() => openDetail(m)}
                              title={`${m.name}\n${fmtDate(si)} \u2192 ${fmtDate(ei)}\n${totalDays} dias | ${elapsed}d passados | ${remaining ?? 0}d restantes`}
                              style={{
                                position: 'absolute', top: 4, height: BH - 8, borderRadius: 6,
                                left: `${lp}%`, width: `${wp}%`, minWidth: 40, overflow: 'hidden',
                                cursor: 'pointer', transition: 'opacity .15s', opacity: isDone ? 0.5 : 0.9,
                              }}
                              onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)'; }}
                              onMouseLeave={e => { e.currentTarget.style.opacity = isDone ? '0.5' : '0.9'; e.currentTarget.style.boxShadow = 'none'; }}>
                              {/* Background (remaining) */}
                              <div style={{ position: 'absolute', inset: 0, borderRadius: 6, background: barColor, opacity: 0.45 }} />
                              {/* Elapsed (darker) */}
                              <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: `${timePct}%`, borderRadius: `6px ${timePct >= 98 ? 6 : 0}px ${timePct >= 98 ? 6 : 0}px 6px`, background: barColor }} />
                              {/* Text */}
                              <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '0 6px' }}>
                                <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>{daysText}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
        <div style={{ height: 40 }} />
      </>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // RENDER — TAB 4: DETAIL (hidden tab)
  // ═══════════════════════════════════════════════════════════
  function renderDetail() {
    const mi = selectedMilestone;
    if (!mi) return <div style={styles.empty}>Selecione um marco.</div>;

    const ax = AXES[mi.year] || {};
    const pct = calcMilestoneProgress(mi);
    const tasks = mi.tasks || [];
    const st = STATUS_MAP[mi.status] || STATUS_MAP.pendente;

    return (
      <>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <button onClick={() => { setSelectedMilestone(null); setTab(2); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.primary, fontWeight: 600, fontSize: 13, padding: 0, marginBottom: 8 }}>{'\u2190'} Voltar aos marcos</button>
            <div style={{ fontSize: 22, fontWeight: 800, color: C.text, marginBottom: 8 }}>{mi.name}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span style={styles.badge(ax.color || C.t3, ax.bg || '#f3f4f6')}>{mi.year} {'\u00B7'} {ax.name || '\u2014'}</span>
              <span style={styles.badge(st.c, st.bg)}>{st.label}</span>
              {mi.area && <span style={styles.badge(C.primary, C.primaryBg)}>{mi.area}</span>}
              {mi.phase && <span style={{ fontSize: 11, color: C.t3, padding: '2px 8px' }}>Fase: {mi.phase}</span>}
            </div>
          </div>
          {canEditItem(mi) && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={styles.btn('secondary')} onClick={() => setModalMilestone(mi)}>Editar</button>
              <button style={styles.btn('danger')} onClick={() => deleteMilestone(mi.id)}>Excluir</button>
            </div>
          )}
        </div>

        {/* Progress bar */}
        <div style={{ ...styles.card, padding: '16px 20px', marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Progresso do Marco</span>
            <span style={{ fontSize: 18, fontWeight: 800, color: progressColor(pct) }}>{pct}%</span>
          </div>
          <ProgressBar pct={pct} height={10} showLabel={false} />
        </div>

        {/* Info Grid */}
        <div style={{ ...styles.card, padding: '20px 24px', marginBottom: 16 }}>
          <div style={styles.infoGrid}>
            <div>
              <div style={styles.infoLabel}>Responsavel</div>
              <div style={styles.infoValue}>{mi.responsible || '\u2014'}</div>
            </div>
            <div>
              <div style={styles.infoLabel}>Periodo</div>
              <div style={styles.infoValue}>{fmtDate(mi.date_start)} {'\u2192'} {fmtDate(mi.date_end)}</div>
            </div>
            <div>
              <div style={styles.infoLabel}>Entrega Esperada</div>
              <div style={styles.infoValue}>{mi.expected_delivery || '\u2014'}</div>
            </div>
            <div>
              <div style={styles.infoLabel}>Fase</div>
              <div style={styles.infoValue}>{mi.phase || '\u2014'}</div>
            </div>
            <div>
              <div style={styles.infoLabel}>Eixo Estrategico</div>
              <div style={{ ...styles.infoValue, color: ax.color }}>{ax.name || '\u2014'}</div>
            </div>
            <div>
              <div style={styles.infoLabel}>Objetivo Estrategico</div>
              <div style={styles.infoValue}>{mi.strategic_objective || ax.objective || '\u2014'}</div>
            </div>
            <div>
              <div style={styles.infoLabel}>Orcamento Planejado</div>
              <div style={styles.infoValue}>{fmtMoney(mi.budget_planned)}</div>
            </div>
            <div>
              <div style={styles.infoLabel}>Orcamento Gasto</div>
              <div style={styles.infoValue}>{fmtMoney(mi.budget_spent)}</div>
            </div>
          </div>
          {mi.description && (
            <div style={{ marginTop: 8, padding: '12px 16px', background: C.bg, borderRadius: 8, fontSize: 13, color: C.t2, lineHeight: 1.5 }}>
              {mi.description}
            </div>
          )}
        </div>

        {/* SWOT Card */}
        {(mi.swot_strengths || mi.swot_weaknesses || mi.swot_opportunities || mi.swot_threats) && (
          <div style={{ ...styles.card, marginBottom: 16 }}>
            <div style={styles.cardHeader}>
              <span style={styles.cardTitle}>Analise SWOT</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
              {[
                { key: 'swot_strengths', label: 'Forcas', color: C.green, bg: C.greenBg, icon: 'S' },
                { key: 'swot_weaknesses', label: 'Fraquezas', color: C.red, bg: C.redBg, icon: 'W' },
                { key: 'swot_opportunities', label: 'Oportunidades', color: C.blue, bg: C.blueBg, icon: 'O' },
                { key: 'swot_threats', label: 'Ameacas', color: C.amber, bg: C.amberBg, icon: 'T' },
              ].map(q => (
                <div key={q.key} style={{ padding: '16px 20px', borderRight: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{
                      width: 24, height: 24, borderRadius: 6, background: q.bg,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontWeight: 800, color: q.color,
                    }}>{q.icon}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: q.color }}>{q.label}</span>
                  </div>
                  <div style={{ fontSize: 12, color: C.t2, lineHeight: 1.5, whiteSpace: 'pre-line' }}>
                    {mi[q.key] || 'Nenhum registrado.'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tasks Section */}
        <div style={{ ...styles.card, marginBottom: 16 }}>
          <div style={styles.cardHeader}>
            <span style={styles.cardTitle}>Tarefas ({tasks.length})</span>
            {canEditItem(mi) && (
              <button style={{ ...styles.btn('secondary'), ...styles.btnSm }} onClick={() => setModalTask({ milestoneId: mi.id })}>
                + Adicionar Tarefa
              </button>
            )}
          </div>
          {tasks.length === 0 ? (
            <div style={styles.empty}>Nenhuma tarefa cadastrada.</div>
          ) : (
            tasks.map(task => (
              <TaskRow
                key={task.id}
                task={task}
                canEdit={canEditItem(task)}
                onEdit={() => setModalTask({ data: task, milestoneId: mi.id })}
                onDelete={() => deleteTask(task.id)}
                onAddSubtask={(name) => addSubtask(task.id, name)}
                onUpdateSubtaskPct={updateSubtaskPct}
                onDeleteSubtask={deleteSubtask}
              />
            ))
          )}
        </div>
      </>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // MAIN RENDER
  // ═══════════════════════════════════════════════════════════
  if (loading) return (
    <div style={styles.page}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 60, gap: 12 }}>
        <div style={{ width: 28, height: 28, border: `3px solid ${C.border}`, borderTopColor: C.primary, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <span style={{ fontSize: 13, color: C.t3 }}>Carregando plano de expansao...</span>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <div style={styles.title}>Plano de Expansao 2026-2029</div>
          <div style={styles.subtitle}>Quadrienio estrategico {'\u2014'} Pr. Pedrao</div>
        </div>
        {canEdit && (
          <button style={styles.btn('primary')} onClick={() => setModalMilestone({})}>
            + Novo Marco
          </button>
        )}
      </div>

      {error && (
        <div style={{ padding: '10px 16px', borderRadius: 8, background: C.redBg, color: C.red, fontSize: 13, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{error}</span>
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.red, fontSize: 16 }}>{'\u2715'}</button>
        </div>
      )}

      {/* Tabs — assistente (nível 2) não vê Visão Geral nem Timeline */}
      {tab !== 4 && (
        <div style={styles.tabs}>
          {TAB_LABELS.map((label, i) => {
            if (accessLevel <= 2 && (i === 0 || i === 1)) return null; // esconder Visão Geral e Timeline para assistente
            return <button key={i} style={styles.tab(tab === i)} onClick={() => setTab(i)}>{label}</button>;
          })}
        </div>
      )}

      {/* Tab Content */}
      {tab === 0 && renderVisaoGeral()}
      {tab === 1 && renderTimeline()}
      {tab === 2 && renderMarcos()}
      {tab === 3 && renderGantt()}
      {tab === 4 && renderDetail()}

      {/* Milestone Modal */}
      <MilestoneFormModal
        open={modalMilestone !== null}
        data={modalMilestone?.id ? modalMilestone : null}
        saving={saving}
        onSave={saveMilestone}
        onClose={() => setModalMilestone(null)}
        usersList={usersList}
      />

      {/* Task Modal */}
      <TaskFormModal
        open={modalTask !== null}
        data={modalTask?.data || null}
        milestoneId={modalTask?.milestoneId || null}
        saving={saving}
        onSave={saveTask}
        onClose={() => setModalTask(null)}
        usersList={usersList}
      />

      {/* Confirm Dialog */}
      <ConfirmDialog
        message={confirmMsg?.message}
        onConfirm={confirmMsg?.onConfirm}
        onCancel={() => setConfirmMsg(null)}
      />

      <div style={{ height: 40 }} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TaskRow Component
// ═══════════════════════════════════════════════════════════
function TaskRow({ task, canEdit, onEdit, onDelete, onAddSubtask, onUpdateSubtaskPct, onDeleteSubtask }) {
  const [showSubs, setShowSubs] = useState(false);
  const [newSub, setNewSub] = useState('');
  const tPct = calcTaskProgress(task);
  const tStatus = TASK_STATUS[task.status] || TASK_STATUS.pendente;

  return (
    <div>
      <div style={styles.taskRow}>
        <button style={styles.iconBtn} onClick={() => setShowSubs(!showSubs)} title="Subtarefas">
          <span style={{ transform: showSubs ? 'rotate(90deg)' : 'none', display: 'inline-block', transition: 'transform 0.15s' }}>{'\u25B6'}</span>
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{task.name}</span>
            <span style={styles.badge(tStatus.c, tStatus.bg)}>{tStatus.label}</span>
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 12, color: C.t3, flexWrap: 'wrap' }}>
            {task.responsible && <span>Resp: {task.responsible}</span>}
            {task.area && <span>Area: {task.area}</span>}
            {task.deadline && <span>Prazo: {fmtDate(task.deadline)}</span>}
            {task.subtasks && <span>{task.subtasks.length} subtarefas</span>}
          </div>
        </div>
        <div style={{ minWidth: 110 }}>
          <ProgressBar pct={tPct} height={6} />
        </div>
        {canEdit && (
          <div style={{ display: 'flex', gap: 2 }}>
            <button style={{ ...styles.iconBtn, fontSize: 12 }} onClick={onEdit} title="Editar">{'\u270E'}</button>
            <button style={{ ...styles.iconBtn, fontSize: 12, color: C.red }} onClick={onDelete} title="Excluir">{'\u2715'}</button>
          </div>
        )}
      </div>

      {/* Subtasks */}
      {showSubs && (
        <div>
          {(task.subtasks || []).map(st => (
            <div key={st.id} style={styles.subtaskRow}>
              <span style={{ fontSize: 13, color: C.text, flex: 1 }}>{st.name}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 180 }}>
                <input
                  type="range" min="0" max="100" step="5"
                  value={st.pct || 0}
                  onChange={e => onUpdateSubtaskPct(st.id, Number(e.target.value))}
                  style={{ width: 80, cursor: 'pointer', accentColor: C.primary }}
                  disabled={!canEdit}
                />
                <span style={{ fontSize: 12, fontWeight: 600, color: progressColor(st.pct || 0), minWidth: 36, textAlign: 'right' }}>
                  {st.pct || 0}%
                </span>
                {canEdit && (
                  <button style={{ ...styles.iconBtn, fontSize: 11, color: C.red }} onClick={() => onDeleteSubtask(st.id)} title="Excluir">{'\u2715'}</button>
                )}
              </div>
            </div>
          ))}

          {canEdit && (
            <div style={{ ...styles.subtaskRow, gap: 8 }}>
              <input
                type="text"
                placeholder="Nova subtarefa..."
                value={newSub}
                onChange={e => setNewSub(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') { onAddSubtask(newSub); setNewSub(''); }
                }}
                style={{ ...styles.input, flex: 1, padding: '6px 10px', fontSize: 12 }}
              />
              <button
                style={{ ...styles.btn('primary'), ...styles.btnSm }}
                onClick={() => { onAddSubtask(newSub); setNewSub(''); }}>
                +
              </button>
            </div>
          )}

          {(!task.subtasks || task.subtasks.length === 0) && !canEdit && (
            <div style={{ ...styles.subtaskRow, color: C.t3, fontSize: 12 }}>Nenhuma subtarefa.</div>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Milestone Form Modal
// ═══════════════════════════════════════════════════════════
function MilestoneFormModal({ open, data, saving, onSave, onClose, usersList }) {
  const isEdit = data?.id;
  const [form, setForm] = useState({});

  useEffect(() => {
    if (open) {
      setForm({
        id: data?.id || null,
        name: data?.name || '',
        description: data?.description || '',
        year: data?.year || 2026,
        strategic_axis: data?.strategic_axis || '',
        strategic_objective: data?.strategic_objective || '',
        area: data?.area || '',
        responsible: data?.responsible || '',
        responsible_id: data?.responsible_id || '',
        date_start: data?.date_start ? normDate(data.date_start) : '',
        date_end: data?.date_end ? normDate(data.date_end) : '',
        expected_delivery: data?.expected_delivery || '',
        status: data?.status || 'pendente',
        phase: data?.phase || '',
        budget_planned: data?.budget_planned ?? '',
        budget_spent: data?.budget_spent ?? '',
        sort_order: data?.sort_order ?? '',
        swot_strengths: data?.swot_strengths || '',
        swot_weaknesses: data?.swot_weaknesses || '',
        swot_opportunities: data?.swot_opportunities || '',
        swot_threats: data?.swot_threats || '',
      });
    }
  }, [open, data]);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    onSave({
      ...form,
      year: Number(form.year),
      budget_planned: form.budget_planned !== '' ? Number(form.budget_planned) : null,
      budget_spent: form.budget_spent !== '' ? Number(form.budget_spent) : null,
      sort_order: form.sort_order !== '' ? Number(form.sort_order) : null,
    });
  };

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Editar Marco' : 'Novo Marco'}
      footer={
        <>
          <button type="button" style={styles.btn('ghost')} onClick={onClose}>Cancelar</button>
          <button type="button" style={styles.btn('primary')} disabled={saving} onClick={handleSubmit}>{saving ? 'Salvando...' : 'Salvar'}</button>
        </>
      }>
      <form onSubmit={handleSubmit}>
        <Field label="Nome *">
          <input style={styles.input} value={form.name || ''} onChange={e => set('name', e.target.value)} required />
        </Field>
        <Field label="Descricao">
          <textarea style={styles.textarea} value={form.description || ''} onChange={e => set('description', e.target.value)} />
        </Field>
        <div style={styles.formRow}>
          <Field label="Ano *">
            <select style={{ ...styles.select, width: '100%' }} value={form.year || 2026} onChange={e => set('year', e.target.value)}>
              {[2026, 2027, 2028, 2029].map(y => <option key={y} value={y}>{y} - {AXES[y]?.name}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select style={{ ...styles.select, width: '100%' }} value={form.status || 'pendente'} onChange={e => set('status', e.target.value)}>
              {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </Field>
        </div>
        <div style={styles.formRow}>
          <Field label="Area">
            <input style={styles.input} value={form.area || ''} onChange={e => set('area', e.target.value)} />
          </Field>
          <Field label="Responsavel">
            <select style={{ ...styles.select, width: '100%' }} value={form.responsible_id || ''} onChange={e => set('responsible_id', e.target.value)}>
              <option value="">Selecionar...</option>
              {(usersList || []).map(u => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
            </select>
          </Field>
        </div>
        <div style={styles.formRow}>
          <Field label="Data Inicio">
            <input type="date" style={styles.input} value={form.date_start || ''} onChange={e => set('date_start', e.target.value)} />
          </Field>
          <Field label="Data Fim">
            <input type="date" style={styles.input} value={form.date_end || ''} onChange={e => set('date_end', e.target.value)} />
          </Field>
        </div>
        <div style={styles.formRow}>
          <Field label="Entrega Esperada">
            <input style={styles.input} placeholder="Ex: Relatório, Documento, Sistema ativo..." value={form.expected_delivery || ''} onChange={e => set('expected_delivery', e.target.value)} />
          </Field>
          <Field label="Fase">
            <input style={styles.input} value={form.phase || ''} onChange={e => set('phase', e.target.value)} />
          </Field>
        </div>
        <div style={styles.formRow}>
          <Field label="Eixo Estrategico">
            <input style={styles.input} value={form.strategic_axis || ''} onChange={e => set('strategic_axis', e.target.value)} />
          </Field>
          <Field label="Objetivo Estrategico">
            <input style={styles.input} value={form.strategic_objective || ''} onChange={e => set('strategic_objective', e.target.value)} />
          </Field>
        </div>
        <div style={styles.formRow}>
          <Field label="Orcamento Planejado (R$)">
            <input type="number" step="0.01" min="0" style={styles.input} value={form.budget_planned ?? ''} onChange={e => set('budget_planned', e.target.value)} />
          </Field>
          <Field label="Orcamento Gasto (R$)">
            <input type="number" step="0.01" min="0" style={styles.input} value={form.budget_spent ?? ''} onChange={e => set('budget_spent', e.target.value)} />
          </Field>
        </div>
        <Field label="Ordem (sort_order)">
          <input type="number" min="1" style={styles.input} value={form.sort_order ?? ''} onChange={e => set('sort_order', e.target.value)} />
        </Field>

        {/* SWOT */}
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginTop: 16, marginBottom: 8 }}>Analise SWOT (opcional)</div>
        <div style={styles.formRow}>
          <Field label="Forcas (S)">
            <textarea style={{ ...styles.textarea, minHeight: 40 }} value={form.swot_strengths || ''} onChange={e => set('swot_strengths', e.target.value)} />
          </Field>
          <Field label="Fraquezas (W)">
            <textarea style={{ ...styles.textarea, minHeight: 40 }} value={form.swot_weaknesses || ''} onChange={e => set('swot_weaknesses', e.target.value)} />
          </Field>
        </div>
        <div style={styles.formRow}>
          <Field label="Oportunidades (O)">
            <textarea style={{ ...styles.textarea, minHeight: 40 }} value={form.swot_opportunities || ''} onChange={e => set('swot_opportunities', e.target.value)} />
          </Field>
          <Field label="Ameacas (T)">
            <textarea style={{ ...styles.textarea, minHeight: 40 }} value={form.swot_threats || ''} onChange={e => set('swot_threats', e.target.value)} />
          </Field>
        </div>
      </form>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════
// Task Form Modal
// ═══════════════════════════════════════════════════════════
function TaskFormModal({ open, data, milestoneId, saving, onSave, onClose, usersList }) {
  const isEdit = data?.id;
  const [form, setForm] = useState({});

  useEffect(() => {
    if (open) {
      setForm({
        id: data?.id || null,
        name: data?.name || '',
        responsible: data?.responsible || '',
        responsible_id: data?.responsible_id || '',
        area: data?.area || '',
        start_date: data?.start_date ? normDate(data.start_date) : '',
        deadline: data?.deadline ? normDate(data.deadline) : '',
        description: data?.description || '',
        status: data?.status || 'pendente',
      });
    }
  }, [open, data]);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    onSave(form, milestoneId);
  };

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Editar Tarefa' : 'Nova Tarefa'}
      footer={
        <>
          <button type="button" style={styles.btn('ghost')} onClick={onClose}>Cancelar</button>
          <button type="button" style={styles.btn('primary')} disabled={saving} onClick={handleSubmit}>{saving ? 'Salvando...' : 'Salvar'}</button>
        </>
      }>
      <form onSubmit={handleSubmit}>
        <Field label="Nome *">
          <input style={styles.input} value={form.name || ''} onChange={e => set('name', e.target.value)} required />
        </Field>
        <div style={styles.formRow}>
          <Field label="Responsavel">
            <select style={{ ...styles.select, width: '100%' }} value={form.responsible_id || ''} onChange={e => set('responsible_id', e.target.value)}>
              <option value="">Selecionar...</option>
              {(usersList || []).map(u => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
            </select>
          </Field>
          <Field label="Area">
            <input style={styles.input} value={form.area || ''} onChange={e => set('area', e.target.value)} />
          </Field>
        </div>
        <div style={styles.formRow}>
          <Field label="Data Inicio">
            <input type="date" style={styles.input} value={form.start_date || ''} onChange={e => set('start_date', e.target.value)} />
          </Field>
          <Field label="Prazo">
            <input type="date" style={styles.input} value={form.deadline || ''} onChange={e => set('deadline', e.target.value)} />
          </Field>
        </div>
        {isEdit && (
          <Field label="Status">
            <select style={{ ...styles.select, width: '100%' }} value={form.status || 'pendente'} onChange={e => set('status', e.target.value)}>
              {Object.entries(TASK_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </Field>
        )}
        <Field label="Descricao">
          <textarea style={styles.textarea} value={form.description || ''} onChange={e => set('description', e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}
