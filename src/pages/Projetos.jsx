import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { projects, users as usersApi, tasks as tasksApi } from '../api';

// ── Tema (CSS vars para dark/light mode) ──────────────────
const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', text: 'var(--cbrio-text)',
  t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)', border: 'var(--cbrio-border)',
  inputBg: 'var(--cbrio-input-bg)', tableHeader: 'var(--cbrio-table-header)',
  modalBg: 'var(--cbrio-modal-bg)', overlay: 'var(--cbrio-overlay)',
  primary: '#00B39D', primaryBg: '#e6f7f5',
  green: '#10b981', greenBg: '#d1fae5', red: '#ef4444', redBg: '#fee2e2',
  amber: '#f59e0b', amberBg: '#fef3c7', blue: '#3b82f6', blueBg: '#dbeafe',
  gray: '#9ca3af', grayBg: '#d1d5db',
};

const STATUS_MAP = {
  'planejamento': { c: '#9ca3af', bg: '#9ca3af20', label: 'Planejamento' },
  'no-prazo': { c: C.green, bg: C.greenBg, label: 'No Prazo' },
  'em_andamento': { c: C.blue, bg: C.blueBg, label: 'Em Andamento' },
  'em-risco': { c: C.amber, bg: C.amberBg, label: 'Em Risco' },
  'atrasado': { c: C.red, bg: C.redBg, label: 'Atrasado' },
  'concluido': { c: '#06b6d4', bg: '#06b6d420', label: 'Concluido' },
  'cancelado': { c: '#6b7280', bg: '#6b728020', label: 'Cancelado' },
  'pausado': { c: '#d946ef', bg: '#d946ef20', label: 'Pausado' },
};

const TASK_STATUS_MAP = {
  'pendente': { c: C.t3, bg: 'var(--cbrio-bg)', label: 'Pendente' },
  'em-andamento': { c: C.blue, bg: C.blueBg, label: 'Em Andamento' },
  'concluida': { c: C.green, bg: C.greenBg, label: 'Concluida' },
  'bloqueada': { c: C.red, bg: C.redBg, label: 'Bloqueada' },
};

const PHASE_STATUS_MAP = {
  'pendente': { c: C.t3, bg: 'var(--cbrio-bg)', label: 'Pendente' },
  'em-andamento': { c: C.blue, bg: C.blueBg, label: 'Em Andamento' },
  'concluida': { c: C.green, bg: C.greenBg, label: 'Concluida' },
  'bloqueada': { c: C.red, bg: C.redBg, label: 'Bloqueada' },
};

const PRIORITY_MAP = {
  'alta': { c: C.red, bg: C.redBg, label: 'Alta' },
  'media': { c: C.amber, bg: C.amberBg, label: 'Media' },
  'baixa': { c: C.green, bg: C.greenBg, label: 'Baixa' },
};

const COMPLEXITY_MAP = {
  'baixa': 'Baixa', 'media': 'Media', 'alta': 'Alta',
};
const IMPACT_MAP = {
  'baixo': 'Baixo', 'medio': 'Medio', 'alto': 'Alto',
};

const BUDGET_CATEGORIES = [
  { value: 'investimento', label: 'Investimento' },
  { value: 'receita', label: 'Receita' },
  { value: 'custo', label: 'Custo' },
];

const PHASE_NAMES = ['Concepção', 'Planejamento', 'Mobilização', 'Comunicação', 'Execução', 'Monitoramento', 'Encerramento'];
const PHASE_ABBREVS = ['CON', 'PLA', 'MOB', 'COM', 'EXE', 'MON', 'ENC'];

// ── Estilos ─────────────────────────────────────────────────
const styles = {
  page: { maxWidth: 1400, margin: '0 auto', padding: '0 24px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 },
  title: { fontSize: 20, fontWeight: 700, color: C.text, letterSpacing: -0.5, lineHeight: 1.25 },
  subtitle: { fontSize: 14, color: C.t2, marginTop: 2, lineHeight: 1.5 },
  tabs: { display: 'flex', gap: 0, borderBottom: `2px solid ${C.border}`, marginBottom: 24 },
  tab: (a) => ({
    padding: '12px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none', background: 'none',
    color: a ? C.primary : C.t2, borderBottom: a ? `2px solid ${C.primary}` : '2px solid transparent',
    marginBottom: -2, transition: 'all 0.15s',
  }),
  card: { background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, boxShadow: '0 1px 2px rgba(0,0,0,0.05)', overflow: 'hidden' },
  cardHeader: { padding: 16, borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 14, fontWeight: 700, color: C.text },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { padding: '12px 16px', fontSize: 12, fontWeight: 700, color: C.t2, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'left', borderBottom: `1px solid ${C.border}`, background: C.tableHeader },
  td: { padding: '12px 16px', fontSize: 14, color: C.text, borderBottom: `1px solid ${C.border}`, lineHeight: 1.5 },
  badge: (color, bg) => ({ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, color, background: bg }),
  btn: (v = 'primary') => ({
    padding: '8px 16px', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', border: 'none', transition: 'all 0.15s',
    ...(v === 'primary' ? { background: C.primary, color: '#fff' } : {}),
    ...(v === 'secondary' ? { background: 'transparent', color: C.primary, border: `1px solid ${C.primary}` } : {}),
    ...(v === 'danger' ? { background: C.red, color: '#fff' } : {}),
    ...(v === 'ghost' ? { background: 'transparent', color: C.t2, padding: '6px 12px' } : {}),
  }),
  btnSm: { padding: '4px 10px', fontSize: 12 },
  filterRow: { display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' },
  input: { padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 14, outline: 'none', width: '100%', background: C.inputBg, color: C.text },
  select: { padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 14, background: C.inputBg, color: C.text, outline: 'none' },
  label: { fontSize: 12, fontWeight: 600, color: C.t2, marginBottom: 4, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5 },
  formGroup: { marginBottom: 14 },
  formRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  overlay: { position: 'fixed', inset: 0, background: C.overlay, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: 60, zIndex: 1000 },
  modal: { background: C.modalBg, borderRadius: 12, width: '95%', maxWidth: 620, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 16px 48px rgba(0,0,0,0.12)' },
  modalHeader: { padding: '20px 24px 12px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { fontSize: 18, fontWeight: 700, color: C.text },
  modalBody: { padding: '16px 24px 24px' },
  modalFooter: { padding: '12px 24px 20px', display: 'flex', gap: 8, justifyContent: 'flex-end' },
  empty: { textAlign: 'center', padding: 40, color: C.t3, fontSize: 14, lineHeight: 1.5 },
  clickRow: { cursor: 'pointer', transition: 'background 0.1s' },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  infoGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 },
  infoLabel: { fontSize: 11, fontWeight: 600, color: C.t3, textTransform: 'uppercase', letterSpacing: 0.5 },
  infoValue: { fontSize: 14, fontWeight: 500, color: C.text, marginTop: 2 },
  progress: { height: 8, borderRadius: 4, background: C.border, overflow: 'hidden', flex: 1 },
  progressBar: (pct, color) => ({ height: '100%', borderRadius: 4, background: color || (pct >= 100 ? C.green : C.primary), width: `${Math.min(pct, 100)}%`, transition: 'width 0.3s' }),
};

// ── Helpers ─────────────────────────────────────────────────
function normDate(d) { return d ? (typeof d === 'string' ? d.slice(0, 10) : '') : ''; }
function fmtDate(d) { const s = normDate(d); if (!s) return '\u2014'; const [y, m, day] = s.split('-'); return `${day}/${m}/${y}`; }
function fmtMoney(v) { return v != null ? `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '\u2014'; }

function filterByHorizon(items, days, field = 'date_end') {
  if (!days) return items;
  const limit = new Date(); limit.setDate(limit.getDate() + days);
  return items.filter(t => { const d = normDate(t[field]); if (!d) return true; return new Date(d + 'T12:00:00') <= limit; });
}

function sortByUrgency(items) {
  return [...items].sort((a, b) => {
    const pa = normDate(a.deadline || a.date_end); const pb = normDate(b.deadline || b.date_end);
    if (!pa && !pb) return 0; if (!pa) return 1; if (!pb) return -1;
    return pa.localeCompare(pb);
  });
}

function DaysCounter({ date, status }) {
  const s = normDate(date);
  if (!s || status === 'concluido' || status === 'concluida') return null;
  const diff = Math.ceil((new Date(s + 'T12:00:00') - new Date()) / 86400000);
  const color = diff < 0 ? C.red : diff <= 7 ? C.amber : C.green;
  const text = diff < 0 ? `${Math.abs(diff)}d atras` : diff === 0 ? 'Hoje' : `${diff}d`;
  return <span style={{ fontSize: 11, fontWeight: 700, color, marginLeft: 6 }}>{text}</span>;
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

function Input({ label, ...props }) {
  return (
    <div style={styles.formGroup}>
      {label && <label style={styles.label}>{label}</label>}
      <input style={styles.input} {...props} />
    </div>
  );
}

function Select({ label, children, ...props }) {
  return (
    <div style={styles.formGroup}>
      {label && <label style={styles.label}>{label}</label>}
      <select style={{ ...styles.select, width: '100%' }} {...props}>{children}</select>
    </div>
  );
}

function Textarea({ label, ...props }) {
  return (
    <div style={styles.formGroup}>
      {label && <label style={styles.label}>{label}</label>}
      <textarea style={{ ...styles.input, minHeight: 60, resize: 'vertical' }} {...props} />
    </div>
  );
}

function Badge({ status, map }) {
  const s = map[status] || { c: C.t3, bg: 'var(--cbrio-bg)', label: status || '\u2014' };
  return <span style={styles.badge(s.c, s.bg)}>{s.label}</span>;
}

function ProgressBar({ value, max, color }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={styles.progress}><div style={styles.progressBar(pct, color)} /></div>
      <span style={{ fontSize: 12, fontWeight: 600, color: C.t2, minWidth: 36 }}>{pct}%</span>
    </div>
  );
}

// ── KPI Bar compacta ────────────────────────────────────────
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
            style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '2px 4px', borderRadius: 6, transition: 'background .15s' }}
            onMouseEnter={e => e.currentTarget.style.background = `${item.color}15`}
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
const TABS = ['Home', 'Lista', 'Kanban', 'Gantt'];

// ═══════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════
export default function Projetos() {
  const { profile, user, isDiretor, isAdmin, getAccessLevel, userAreas } = useAuth();
  const canEdit = isAdmin || isDiretor;
  const userRole = profile?.role || '';
  const userArea = profile?.area || '';
  const isPMO = ['diretor', 'admin'].includes(userRole);
  const accessLevel = getAccessLevel(['Projetos', 'Tarefas']);
  const userId = user?.id;

  // URL params drill-down
  const urlParams = new URLSearchParams(window.location.search);
  const urlStatus = urlParams.get('status') || '';
  const urlId = urlParams.get('id') || '';

  const [tab, setTab] = useState(urlStatus ? 1 : urlId ? 4 : 0);
  const [list, setList] = useState([]);
  const [categories, setCategories] = useState([]);
  const [dash, setDash] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [usersList, setUsersList] = useState([]);

  // Filtros
  const [fStatus, setFStatus] = useState(urlStatus);
  const [fCategory, setFCategory] = useState('');
  const [fPriority, setFPriority] = useState('');
  const [fSearch, setFSearch] = useState('');
  const [fLeader, setFLeader] = useState('');
  const [hideDone, setHideDone] = useState(true);

  // Kanban (3 níveis: fase strip → 4 colunas tarefas → filtros)
  const [kanbanCategory, setKanbanCategory] = useState('all');
  const [kanbanHorizon, setKanbanHorizon] = useState(30);
  const [kanbanPhase, setKanbanPhase] = useState(null); // phase_order selecionada (1-7)
  const [kanbanProject, setKanbanProject] = useState('all'); // projeto específico ou 'all'
  const [kanbanViewMode, setKanbanViewMode] = useState(isPMO ? 'pmo' : accessLevel >= 3 ? 'area' : 'minhas'); // pmo | area | minhas
  const [kanbanExpanded, setKanbanExpanded] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [dropCol, setDropCol] = useState(null);
  const [saving, setSaving] = useState(false);
  const [modalSaving, setModalSaving] = useState(false);

  // Gantt
  const [ganttExpanded, setGanttExpanded] = useState({});
  const [ganttStatusFilter, setGanttStatusFilter] = useState('');
  const [ganttCatFilter, setGanttCatFilter] = useState('');

  // Detail sub-tab
  const [detailTab, setDetailTab] = useState('info');

  // Modals
  const [modalProject, setModalProject] = useState(null);
  const [modalTask, setModalTask] = useState(null);
  const [modalRisk, setModalRisk] = useState(null);
  const [modalKpi, setModalKpi] = useState(null);
  const [modalBudget, setModalBudget] = useState(null);
  const [modalMilestone, setModalMilestone] = useState(null);

  // Subtasks & comments
  const [newSubtask, setNewSubtask] = useState({});
  const [newComment, setNewComment] = useState({});

  // Task view in detail
  const [taskView, setTaskView] = useState('lista');
  const [taskDragId, setTaskDragId] = useState(null);
  const [taskDropCol, setTaskDropCol] = useState(null);

  // Retrospectiva
  const [retroData, setRetroData] = useState(null);
  const [retroForm, setRetroForm] = useState({});

  // Kanban tasks (todas as tarefas de todos os projetos)
  const [kanbanTasks, setKanbanTasks] = useState([]);
  const [kanbanPhases, setKanbanPhases] = useState([]);

  // Sort
  const [sortCol, setSortCol] = useState('name');
  const [sortAsc, setSortAsc] = useState(true);

  // ── Loaders ──
  const loadCategories = useCallback(async () => {
    try { setCategories(await projects.categories()); } catch (e) { console.error(e); }
  }, []);

  const loadDash = useCallback(async () => {
    try { setDash(await projects.dashboard()); } catch (e) { console.error(e); }
  }, []);

  const loadList = useCallback(async () => {
    try {
      setLoading(true);
      const params = {};
      if (fStatus) params.status = fStatus;
      if (fCategory) params.category_id = fCategory;
      if (fPriority) params.priority = fPriority;
      setList(await projects.list(params));
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [fStatus, fCategory, fPriority]);

  const loadDetail = useCallback(async (id) => {
    try {
      setLoading(true);
      const p = await projects.get(id);
      setDetail(p);
      setTab(4);
      setDetailTab('info');
      // Load retrospective
      projects.getRetrospective(id).then(d => { setRetroData(d); setRetroForm(d || {}); }).catch(() => { setRetroData(null); setRetroForm({}); });
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  const refreshDetail = useCallback(async () => {
    if (detail?.id) {
      try {
        const p = await projects.get(detail.id);
        setDetail(p);
      } catch (e) { console.error(e); }
    }
  }, [detail?.id]);

  const loadKanbanData = useCallback(async () => {
    try {
      const [tasksData, phasesRes] = await Promise.all([
        tasksApi.all({ source: 'projeto' }),
        // Buscar todas as fases de todos os projetos via Supabase (rota não existe, mas podemos pegar do list)
        // Alternativa: buscar via cada projeto — mas para performance, vamos usar o que o list já traz
        fetch('/api/projects/all-phases', { headers: { 'Authorization': `Bearer ${localStorage.getItem('sb-token')}` } }).then(r => r.ok ? r.json() : []).catch(() => []),
      ]);
      setKanbanTasks(Array.isArray(tasksData) ? tasksData : []);
      setKanbanPhases(Array.isArray(phasesRes) ? phasesRes : []);
      // Se não tiver endpoint de fases, usar dados do list
      if (!phasesRes.length && list.length) {
        // Pegar fases do primeiro projeto como referência para phase_order
        const firstWithPhases = list.find(p => p.phases?.length > 0);
        if (firstWithPhases) setKanbanPhases(firstWithPhases.phases);
      }
    } catch (e) { console.error('Kanban data:', e); }
  }, [list]);

  useEffect(() => {
    loadCategories(); loadDash(); loadList();
    usersApi.list().then(d => setUsersList(Array.isArray(d) ? d : [])).catch(() => setUsersList([]));
    tasksApi.all({ source: 'projeto' }).then(d => setKanbanTasks(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (urlId) loadDetail(urlId);
  }, [urlId, loadDetail]);
  useEffect(() => { loadList(); }, [fStatus, fCategory, fPriority]);

  // ── Counts ──
  const counts = { total: list.length, 'no-prazo': 0, 'em-risco': 0, 'atrasado': 0, 'concluido': 0 };
  list.forEach(p => { if (counts[p.status] !== undefined) counts[p.status]++; });

  const d = dash || {};

  // ── Drill-down helper ──
  const kpiDrillDown = (status) => {
    setFStatus(status || '');
    setHideDone(status !== 'concluido');
    setTab(1);
  };

  // ── KPI items ──
  const kpiItems = [
    { label: 'Total', value: d.total || counts.total, color: C.primary, action: () => kpiDrillDown('') },
    { label: 'No Prazo', value: d.by_status?.['no-prazo'] ?? counts['no-prazo'], color: C.green, action: () => kpiDrillDown('no-prazo') },
    { label: 'Em Risco', value: d.by_status?.['em-risco'] ?? counts['em-risco'], color: C.amber, action: () => kpiDrillDown('em-risco') },
    { label: 'Atrasados', value: d.by_status?.['atrasado'] ?? counts['atrasado'], color: C.red, action: () => kpiDrillDown('atrasado') },
    { label: 'Concluidos', value: d.by_status?.['concluido'] ?? counts['concluido'], color: C.blue, action: () => kpiDrillDown('concluido') },
    null,
    { label: 'Tarefas abertas', value: d.tasks_open || 0, color: C.t2, action: () => { setTab(2); } },
    { label: 'Tarefas atrasadas', value: d.tasks_overdue || 0, color: C.red, action: () => { setTab(2); } },
  ];

  // ── Category map ──
  const catMap = {};
  categories.forEach(c => { catMap[c.id] = c; });
  const getCatName = (id) => catMap[id]?.name || '\u2014';
  const getCatColor = (id) => catMap[id]?.color || C.t3;

  // ── CRUD handlers ──
  async function saveProject(data) {
    try {
      setModalSaving(true);
      if (data.id) await projects.update(data.id, data);
      else await projects.create(data);
      setModalProject(null);
      loadList(); loadDash();
      if (detail && data.id === detail.id) refreshDetail();
    } catch (e) { setError(e.message); }
    finally { setModalSaving(false); }
  }

  async function deleteProject(id) {
    if (!window.confirm('Remover este projeto?')) return;
    try {
      await projects.remove(id);
      setDetail(null); setTab(0);
      loadList(); loadDash();
    } catch (e) { setError(e.message); }
  }

  async function changeProjectStatus(id, newStatus) {
    try {
      await projects.update(id, { status: newStatus });
      loadList(); loadDash();
      if (detail?.id === id) refreshDetail();
    } catch (e) { setError(e.message); }
  }

  async function toggleProjectStatus(id, currentStatus) {
    const newStatus = currentStatus === 'concluido' ? 'no-prazo' : 'concluido';
    try {
      await projects.update(id, { status: newStatus });
      loadList(); loadDash();
      if (detail?.id === id) refreshDetail();
    } catch (e) { setError(e.message); }
  }

  // Phase
  async function initPhases() {
    if (!detail) return;
    try {
      const defaultPhases = [
        { name: 'Concepção', phase_order: 1 },
        { name: 'Planejamento', phase_order: 2 },
        { name: 'Mobilização', phase_order: 3 },
        { name: 'Comunicação', phase_order: 4 },
        { name: 'Execução', phase_order: 5 },
        { name: 'Monitoramento', phase_order: 6 },
        { name: 'Encerramento', phase_order: 7 },
      ];
      for (let i = 0; i < defaultPhases.length; i++) {
        await projects.createPhase(detail.id, { name: defaultPhases[i].name, order_index: i, status: 'pendente' });
      }
      refreshDetail();
    } catch (e) { setError(e.message); }
  }

  async function updatePhaseField(phaseId, field, value) {
    try {
      await projects.updatePhase(phaseId, { [field]: value });
      refreshDetail();
    } catch (e) { setError(e.message); }
  }

  // Task
  async function saveTask(data) {
    try {
      setModalSaving(true);
      if (data.id) await projects.updateTask(data.id, data);
      else await projects.createTask(detail.id, data);
      setModalTask(null); refreshDetail();
    } catch (e) { setError(e.message); }
    finally { setModalSaving(false); }
  }

  async function changeTaskStatus(taskId, status) {
    try {
      setSaving(true);
      await projects.updateTaskStatus(taskId, status);
      refreshDetail();
      tasksApi.all({ source: 'projeto' }).then(d => setKanbanTasks(Array.isArray(d) ? d : [])).catch(() => {});
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }

  async function deleteTask(taskId) {
    if (!window.confirm('Excluir tarefa?')) return;
    try { await projects.removeTask(taskId); refreshDetail(); } catch (e) { setError(e.message); }
  }

  // Subtask
  async function addSubtask(taskId) {
    const name = (newSubtask[taskId] || '').trim();
    if (!name) return;
    try {
      await projects.createSubtask(taskId, { name });
      setNewSubtask(prev => ({ ...prev, [taskId]: '' }));
      refreshDetail();
    } catch (e) { setError(e.message); }
  }

  async function toggleSubtask(subId, done) {
    try { await projects.toggleSubtask(subId, done); refreshDetail(); } catch (e) { setError(e.message); }
  }

  async function deleteSubtask(subId) {
    try { await projects.removeSubtask(subId); refreshDetail(); } catch (e) { setError(e.message); }
  }

  // Comment
  async function addComment(taskId) {
    const text = (newComment[taskId] || '').trim();
    if (!text) return;
    try {
      await projects.addComment(taskId, text);
      setNewComment(prev => ({ ...prev, [taskId]: '' }));
      refreshDetail();
    } catch (e) { setError(e.message); }
  }

  // Milestone
  async function saveMilestone(data) {
    try {
      setModalSaving(true);
      if (data.id) await projects.updateMilestone(data.id, data);
      else await projects.createMilestone(detail.id, data);
      setModalMilestone(null); refreshDetail();
    } catch (e) { setError(e.message); }
    finally { setModalSaving(false); }
  }

  async function changeMilestoneStatus(mId, status) {
    try { await projects.updateMilestoneStatus(mId, status); refreshDetail(); } catch (e) { setError(e.message); }
  }

  // KPI
  async function saveKpi(data) {
    try {
      setModalSaving(true);
      if (data.id) await projects.updateKpi(data.id, data);
      else await projects.createKpi(detail.id, data);
      setModalKpi(null); refreshDetail();
    } catch (e) { setError(e.message); }
    finally { setModalSaving(false); }
  }

  async function deleteKpi(kpiId) {
    if (!window.confirm('Remover KPI?')) return;
    try { await projects.removeKpi(kpiId); refreshDetail(); } catch (e) { setError(e.message); }
  }

  // Risk
  async function saveRisk(data) {
    try {
      setModalSaving(true);
      if (data.id) await projects.updateRisk(data.id, data);
      else await projects.createRisk(detail.id, data);
      setModalRisk(null); refreshDetail();
    } catch (e) { setError(e.message); }
    finally { setModalSaving(false); }
  }

  async function deleteRisk(riskId) {
    if (!window.confirm('Remover risco?')) return;
    try { await projects.removeRisk(riskId); refreshDetail(); } catch (e) { setError(e.message); }
  }

  // Budget
  async function saveBudgetItem(data) {
    try {
      setModalSaving(true);
      if (data.id) await projects.updateBudgetItem(data.id, data);
      else await projects.createBudgetItem(detail.id, data);
      setModalBudget(null); refreshDetail();
    } catch (e) { setError(e.message); }
    finally { setModalSaving(false); }
  }

  async function deleteBudgetItem(itemId) {
    if (!window.confirm('Remover item?')) return;
    try { await projects.removeBudgetItem(itemId); refreshDetail(); } catch (e) { setError(e.message); }
  }

  // Retrospective
  async function saveRetrospective() {
    if (!detail) return;
    try {
      await projects.saveRetrospective(detail.id, retroForm);
      const r = await projects.getRetrospective(detail.id);
      setRetroData(r); setRetroForm(r || {});
    } catch (e) { setError(e.message); }
  }

  // Kanban project status change
  async function kanbanChangeProjectStatus(projectId, newStatus) {
    try {
      await projects.update(projectId, { status: newStatus });
      loadList(); loadDash();
    } catch (e) { setError(e.message); }
  }

  // ═══════════════════════════════════════════════════════════
  // RENDER — HOME
  // ═══════════════════════════════════════════════════════════
  function renderHome() {
    // Workload: group by leader/responsible
    const workloadMap = {};
    list.forEach(p => {
      const name = p.leader || p.responsible || 'Sem responsavel';
      if (!workloadMap[name]) workloadMap[name] = { name, tasks: 0 };
      workloadMap[name].tasks += (p.tasks_total || 0);
    });
    const workloadArr = Object.values(workloadMap).sort((a, b) => b.tasks - a.tasks).slice(0, 10);
    const maxTasks = workloadArr.length > 0 ? Math.max(...workloadArr.map(w => w.tasks), 1) : 1;

    // Projects by category
    const catCounts = {};
    list.forEach(p => {
      const catName = p.project_categories?.name || getCatName(p.category_id) || 'Sem categoria';
      const catColor = p.project_categories?.color || getCatColor(p.category_id);
      if (!catCounts[catName]) catCounts[catName] = { name: catName, color: catColor, count: 0 };
      catCounts[catName].count++;
    });
    const catArr = Object.values(catCounts).sort((a, b) => b.count - a.count);

    const budgetPlanned = Number(d.budget_planned) || 0;
    const budgetSpent = Number(d.budget_spent) || 0;
    const budgetPct = budgetPlanned > 0 ? Math.round((budgetSpent / budgetPlanned) * 100) : 0;

    return (
      <>
        {/* Compact KPI bar */}
        <KpiBar items={kpiItems} />

        {/* Budget + Workload */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 20 }}>
          {/* Budget card */}
          <div style={{ ...styles.card, flex: '1 1 320px', minWidth: 280 }}>
            <div style={{ padding: '20px 24px' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 12 }}>Orcamento Global</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: C.t2, marginBottom: 6 }}>
                <span>Gasto: {fmtMoney(budgetSpent)}</span>
                <span>Planejado: {fmtMoney(budgetPlanned)}</span>
              </div>
              <div style={{ height: 10, background: C.border, borderRadius: 5 }}>
                <div style={{ height: '100%', width: `${Math.min(budgetPct, 100)}%`, borderRadius: 5, background: budgetPct > 100 ? C.red : C.green, transition: 'width 0.3s' }} />
              </div>
              <div style={{ fontSize: 12, color: C.t3, marginTop: 6 }}>{budgetPct}% utilizado</div>
            </div>
          </div>

          {/* Workload bars */}
          {workloadArr.length > 0 && (
            <div style={{ ...styles.card, flex: '1 1 320px', minWidth: 280 }}>
              <div style={{ padding: '20px 24px' }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 12 }}>Carga de Trabalho</div>
                {workloadArr.map((w, i) => (
                  <div key={i} onClick={() => { setFSearch(w.name); setTab(1); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, cursor: 'pointer', padding: '3px 4px', borderRadius: 6, transition: 'background .1s' }}
                    onMouseEnter={e => e.currentTarget.style.background = C.bg}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: C.text, width: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.name}</span>
                    <div style={{ flex: 1, height: 8, background: C.border, borderRadius: 4 }}>
                      <div style={{ height: '100%', width: `${Math.min((w.tasks / maxTasks) * 100, 100)}%`, borderRadius: 4, background: C.primary, transition: 'width 0.3s' }} />
                    </div>
                    <span style={{ fontSize: 12, color: C.t3, fontWeight: 600, minWidth: 60, textAlign: 'right' }}>{w.tasks} tarefas</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Projects by category */}
        {catArr.length > 0 && (
          <div style={styles.section}>
            <div style={styles.sectionTitle}><span>Projetos por Categoria</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
              {catArr.map(cat => (
                <div key={cat.name} onClick={() => { setFCategory(''); setTab(1); }}
                  style={{ ...styles.card, padding: '16px 20px', cursor: 'pointer', borderLeft: `4px solid ${cat.color || C.primary}`, transition: 'box-shadow .15s' }}
                  onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'}
                  onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>
                  <div style={{ fontSize: 24, fontWeight: 800, color: cat.color || C.primary }}>{cat.count}</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.t2, marginTop: 4 }}>{cat.name}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        {/* Minhas Tarefas */}
        {profile?.name && (() => {
          const myTasks = kanbanTasks.filter(t => t.responsible === profile.name && t.status !== 'concluida').slice(0, 8);
          if (myTasks.length === 0) return null;
          return (
            <div style={{ ...styles.card, marginTop: 16 }}>
              <div style={{ ...styles.cardHeader }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Minhas Tarefas ({myTasks.length})</span>
                <button onClick={() => { setTab(2); setKanbanViewMode('minhas'); }} style={{ fontSize: 11, padding: '4px 12px', borderRadius: 6, background: C.primary, color: '#fff', border: 'none', cursor: 'pointer' }}>Ver todas</button>
              </div>
              <div style={{ padding: '12px 16px' }}>
                {myTasks.map(t => {
                  const dl = normDate(t.deadline);
                  const diff = dl ? Math.ceil((new Date(dl + 'T12:00:00') - new Date()) / 86400000) : null;
                  const dc = diff === null ? null : diff < 0 ? C.red : diff <= 3 ? C.amber : C.green;
                  const dt = diff === null ? '' : diff < 0 ? `${Math.abs(diff)}d atras` : diff === 0 ? 'Hoje' : `${diff}d`;
                  return (
                    <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: `1px solid ${C.border}` }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: (TASK_STATUS_MAP[t.status] || {}).c || C.t3, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 500, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</div>
                        <div style={{ fontSize: 10, color: C.t3 }}>{t.parent_name || '\u2014'}</div>
                      </div>
                      <Badge status={t.status} map={TASK_STATUS_MAP} />
                      {dc && <span style={{ fontSize: 11, fontWeight: 700, color: dc, flexShrink: 0 }}>{dt}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
        <div style={{ height: 40 }} />
      </>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // RENDER — LISTA
  // ═══════════════════════════════════════════════════════════
  function renderList() {
    let filtered = [...list];
    if (hideDone) filtered = filtered.filter(p => p.status !== 'concluido');
    if (fLeader) filtered = filtered.filter(p => p.leader === fLeader);
    if (fSearch) {
      const q = fSearch.toLowerCase();
      filtered = filtered.filter(p =>
        (p.name || '').toLowerCase().includes(q) ||
        (p.leader || '').toLowerCase().includes(q) ||
        (p.responsible || '').toLowerCase().includes(q)
      );
    }
    // Sort
    filtered.sort((a, b) => {
      let va, vb;
      if (sortCol === 'name') { va = a.name || ''; vb = b.name || ''; }
      else if (sortCol === 'status') { va = a.status || ''; vb = b.status || ''; }
      else if (sortCol === 'priority') { va = a.priority || ''; vb = b.priority || ''; }
      else if (sortCol === 'leader') { va = a.leader || ''; vb = b.leader || ''; }
      else if (sortCol === 'deadline') {
        va = normDate(a.date_end); vb = normDate(b.date_end);
        if (!va && !vb) return 0; if (!va) return 1; if (!vb) return -1;
        return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      else { va = a.name || ''; vb = b.name || ''; }
      return sortAsc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });

    const thClick = (col) => { if (sortCol === col) setSortAsc(!sortAsc); else { setSortCol(col); setSortAsc(true); } };

    return (
      <>
        <KpiBar items={kpiItems} />

        {/* Filters */}
        <div style={styles.filterRow}>
          <select style={styles.select} value={fStatus} onChange={e => setFStatus(e.target.value)}>
            <option value="">Todos os status</option>
            {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select style={styles.select} value={fCategory} onChange={e => setFCategory(e.target.value)}>
            <option value="">Todas as categorias</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select style={styles.select} value={fPriority} onChange={e => setFPriority(e.target.value)}>
            <option value="">Todas as prioridades</option>
            {Object.entries(PRIORITY_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={fLeader} onChange={e => setFLeader(e.target.value)} style={styles.select}>
            <option value="">Todos os lideres</option>
            {[...new Set(list.map(p => p.leader).filter(Boolean))].sort().map(l => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
          <input style={{ ...styles.input, width: 200 }} placeholder="Buscar..." value={fSearch} onChange={e => setFSearch(e.target.value)} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.t2, cursor: 'pointer' }}>
            <input type="checkbox" checked={hideDone} onChange={e => setHideDone(e.target.checked)} />
            Esconder concluidos
          </label>
        </div>

        {/* Table */}
        <div style={styles.card}>
          <table style={styles.table}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
              <tr>
                {[{ key: 'name', label: 'Nome' }, { key: 'category', label: 'Categoria' }, { key: 'leader', label: 'Lider' }, { key: 'status', label: 'Status' }, { key: 'priority', label: 'Prioridade' }, { key: 'progress', label: 'Progresso' }, { key: 'deadline', label: 'Prazo' }, ...(isDiretor ? [{ key: '_actions', label: 'Acoes' }] : [])].map(col => (
                  <th key={col.key} style={{ ...styles.th, cursor: 'pointer', userSelect: 'none' }} onClick={() => thClick(col.key)}>
                    {col.label} {sortCol === col.key ? (sortAsc ? '\u25B2' : '\u25BC') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td style={styles.td} colSpan={7}>Carregando...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td style={styles.empty} colSpan={7}>Nenhum projeto encontrado. Crie um novo ou ajuste os filtros.</td></tr>
              ) : filtered.map(p => {
                const catName = p.project_categories?.name || getCatName(p.category_id);
                const catColor = p.project_categories?.color || getCatColor(p.category_id);
                const pct = p.tasks_total > 0 ? Math.round((p.tasks_done / p.tasks_total) * 100) : 0;
                return (
                  <tr key={p.id} className="cbrio-row" onClick={() => loadDetail(p.id)}>
                    <td style={{ ...styles.td, fontWeight: 600 }}>{p.name}</td>
                    <td style={styles.td}><span style={styles.badge(catColor, catColor + '18')}>{catName}</span></td>
                    <td style={styles.td}>{p.leader || p.responsible || '\u2014'}</td>
                    <td style={styles.td}><Badge status={p.status} map={STATUS_MAP} /></td>
                    <td style={styles.td}><Badge status={p.priority} map={PRIORITY_MAP} /></td>
                    <td style={styles.td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 100 }}>
                        <div style={{ flex: 1, height: 6, background: C.border, borderRadius: 3 }}>
                          <div style={{ height: '100%', borderRadius: 3, width: `${pct}%`, background: pct >= 100 ? C.green : C.primary, transition: 'width 0.3s' }} />
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 600, color: C.t2 }}>{pct}%</span>
                      </div>
                    </td>
                    <td style={styles.td}>
                      {fmtDate(p.date_end)}
                      <DaysCounter date={p.date_end} status={p.status} />
                    </td>
                    {canEdit && (
                      <td style={styles.td} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button onClick={() => setModalProject(p)} style={{ padding: '3px 8px', fontSize: 10, borderRadius: 4, border: `1px solid ${C.border}`, background: 'transparent', color: C.primary, cursor: 'pointer', fontWeight: 600 }}>Editar</button>
                          <button onClick={() => toggleProjectStatus(p.id, p.status)} style={{ padding: '3px 8px', fontSize: 10, borderRadius: 4, border: 'none', background: p.status === 'concluido' ? C.amberBg : C.greenBg, color: p.status === 'concluido' ? C.amber : C.green, cursor: 'pointer', fontWeight: 600 }}>
                            {p.status === 'concluido' ? 'Reabrir' : 'Finalizar'}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ height: 40 }} />
      </>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // RENDER — KANBAN
  // ═══════════════════════════════════════════════════════════
  function renderKanban() {
    const TASK_COLS = [
      { key: 'pendente', label: 'A fazer', color: C.gray },
      { key: 'em-andamento', label: 'Em andamento', color: C.blue },
      { key: 'bloqueada', label: 'Bloqueada', color: C.red },
      { key: 'concluida', label: 'Concluída', color: C.green },
    ];

    // ─── NÍVEL 0: Filtros de visão (permissões) ───
    const viewModes = [
      { key: 'pmo', label: isPMO ? 'Todas' : (userArea ? 'Minha área + minhas' : 'Minhas tarefas'), desc: 'Visão completa' },
      ...(userArea ? [{ key: 'area', label: `Só ${userArea}`, desc: `Tarefas da área ${userArea}` }] : []),
      { key: 'minhas', label: 'Minhas tarefas', desc: 'Apenas tarefas atribuídas a mim' },
    ];

    // ─── Filtrar tarefas por permissão ───
    let filteredTasks = [...kanbanTasks];
    if (kanbanViewMode === 'minhas') {
      filteredTasks = filteredTasks.filter(t => t.responsible === profile?.name);
    } else if (kanbanViewMode === 'area') {
      filteredTasks = filteredTasks.filter(t => userAreas.includes(t.area) || t.responsible === profile?.name);
    } else if (kanbanViewMode === 'pmo' && !isPMO) {
      if (userAreas.length > 0) {
        filteredTasks = filteredTasks.filter(t => userAreas.includes(t.area) || t.responsible === profile?.name);
      } else {
        filteredTasks = filteredTasks.filter(t => t.responsible === profile?.name);
      }
    }

    // Filtrar por projeto
    if (kanbanProject !== 'all') {
      filteredTasks = filteredTasks.filter(t => t.parent_id === kanbanProject || t.project_id === kanbanProject);
    }

    // Filtrar por categoria
    if (kanbanCategory !== 'all') {
      const catProjectIds = list.filter(p => (p.project_categories?.name || '') === kanbanCategory).map(p => p.id);
      filteredTasks = filteredTasks.filter(t => catProjectIds.includes(t.parent_id || t.project_id));
    }

    // Filtrar por horizonte
    if (kanbanHorizon) {
      filteredTasks = filterByHorizon(filteredTasks, kanbanHorizon, 'deadline');
    }

    // ─── NÍVEL 1: Phase strip (7 fases) ───
    const phaseTaskCounts = {};
    PHASE_NAMES.forEach((name, i) => {
      const order = i + 1;
      const phaseTasks = filteredTasks.filter(t => (t.description || '').includes(`Fase: ${name}`));
      const done = phaseTasks.filter(t => t.status === 'concluida').length;
      phaseTaskCounts[order] = { total: phaseTasks.length, done };
    });

    // Auto-select first non-completed phase if none selected
    if (!kanbanPhase) {
      const firstActive = PHASE_NAMES.findIndex((name, i) => {
        const c = phaseTaskCounts[i + 1];
        return c && c.total > 0 && c.done < c.total;
      });
      if (firstActive >= 0) setKanbanPhase(firstActive + 1);
      else setKanbanPhase(1);
    }

    // Tasks for selected phase
    const selectedPhaseName = PHASE_NAMES[(kanbanPhase || 1) - 1];
    const phaseTasks = sortByUrgency(filteredTasks.filter(t => (t.description || '').includes(`Fase: ${selectedPhaseName}`)));

    // Category tabs with counts
    const catCounts = { all: filteredTasks.length };
    list.forEach(p => {
      const cn = p.project_categories?.name || '';
      if (!cn) return;
      const projTasks = filteredTasks.filter(t => t.parent_id === p.id || t.project_id === p.id);
      if (projTasks.length > 0) catCounts[cn] = (catCounts[cn] || 0) + projTasks.length;
    });

    return (
      <>
        {/* ── Visão (permissões) ── */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: C.t2, fontWeight: 600 }}>Visão:</span>
          {viewModes.map(v => (
            <button key={v.key} onClick={() => setKanbanViewMode(v.key)} title={v.desc} style={{
              padding: '5px 14px', borderRadius: 8, fontSize: 12, fontWeight: kanbanViewMode === v.key ? 700 : 400, cursor: 'pointer',
              border: kanbanViewMode === v.key ? `2px solid ${C.primary}` : `1px solid ${C.border}`,
              background: kanbanViewMode === v.key ? `${C.primary}15` : 'transparent',
              color: kanbanViewMode === v.key ? C.primary : C.t3,
            }}>{v.label}</button>
          ))}
        </div>

        {/* ── Filtros: Categoria + Projeto + Horizonte ── */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: C.t2, fontWeight: 600 }}>Categoria:</span>
          {[{ key: 'all', label: 'Todas', color: C.primary }, ...categories.filter(c => catCounts[c.name]).map(c => ({ key: c.name, label: c.name, color: c.color }))].map(f => (
            <button key={f.key} onClick={() => setKanbanCategory(f.key)} style={{
              padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: kanbanCategory === f.key ? 600 : 400, cursor: 'pointer',
              border: kanbanCategory === f.key ? `2px solid ${f.color}` : `1px solid ${C.border}`,
              background: kanbanCategory === f.key ? `${f.color}15` : 'transparent',
              color: kanbanCategory === f.key ? f.color : C.t3,
            }}>{f.label}</button>
          ))}

          <span style={{ width: 1, height: 20, background: C.border }} />

          <span style={{ fontSize: 11, color: C.t2, fontWeight: 600 }}>Projeto:</span>
          <select value={kanbanProject} onChange={e => setKanbanProject(e.target.value)}
            style={{ fontSize: 12, padding: '4px 8px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.card, color: C.text, maxWidth: 200 }}>
            <option value="all">Todos</option>
            {list.filter(p => p.status !== 'concluido').map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          <span style={{ width: 1, height: 20, background: C.border }} />

          <span style={{ fontSize: 11, color: C.t2, fontWeight: 600 }}>Horizonte:</span>
          <select value={kanbanHorizon} onChange={e => setKanbanHorizon(parseInt(e.target.value))}
            style={{ fontSize: 12, padding: '4px 8px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.card, color: C.text }}>
            <option value={30}>30 dias</option>
            <option value={60}>60 dias</option>
            <option value={0}>Sem filtro</option>
          </select>
        </div>

        {/* ─── NÍVEL 1: Phase strip (7 fases) ─── */}
        <div style={{ overflowX: 'auto', marginBottom: 16, paddingBottom: 6 }}>
          <div style={{ display: 'flex', gap: 5, minWidth: 'max-content', justifyContent: 'center' }}>
            {PHASE_NAMES.map((name, i) => {
              const order = i + 1;
              const isActive = kanbanPhase === order;
              const c = phaseTaskCounts[order] || { total: 0, done: 0 };
              const isDone = c.total > 0 && c.done === c.total;
              const pct = c.total > 0 ? Math.round((c.done / c.total) * 100) : 0;
              return (
                <div key={order} style={{ display: 'flex', alignItems: 'center' }}>
                  <div onClick={() => { setKanbanPhase(order); setKanbanExpanded(null); }}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = `${C.primary}08`; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = isDone ? C.bg : C.card; e.currentTarget.style.transform = ''; }}
                    style={{
                      borderRadius: 8, padding: '8px 10px', cursor: 'pointer', minWidth: 100, maxWidth: 130, transition: 'all .15s',
                      border: isActive ? `2px solid ${C.primary}` : `1px solid ${C.border}`,
                      background: isActive ? `${C.primary}10` : isDone ? C.bg : C.card,
                      opacity: isDone && !isActive ? 0.7 : 1,
                    }}>
                    <div style={{ fontSize: 9, color: C.t3, marginBottom: 3 }}>{PHASE_ABBREVS[i]}</div>
                    <div style={{ fontSize: 10, fontWeight: isActive ? 700 : 500, color: isActive ? C.primary : C.text, lineHeight: 1.3, marginBottom: 4 }}>{name}</div>
                    <div style={{ height: 3, borderRadius: 2, background: C.border }}>
                      <div style={{ height: 3, borderRadius: 2, width: `${pct}%`, background: isDone ? C.green : C.primary, transition: 'width .3s' }} />
                    </div>
                    <div style={{ fontSize: 9, color: C.t3, marginTop: 3 }}>{c.total > 0 ? `${c.done}/${c.total}` : 'vazia'}</div>
                  </div>
                  {i < PHASE_NAMES.length - 1 && <div style={{ width: 12, height: 2, background: isDone ? C.green : C.border, flexShrink: 0 }} />}
                </div>
              );
            })}
          </div>
        </div>

        {/* ─── NÍVEL 2: Header da fase selecionada ─── */}
        <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 10 }}>
          Fase {kanbanPhase} — {selectedPhaseName}
          <span style={{ fontSize: 12, fontWeight: 400, color: C.t3, marginLeft: 12 }}>
            {phaseTasks.filter(t => t.status === 'concluida').length}/{phaseTasks.length} tarefas
          </span>
          <button onClick={() => setModalTask({})} style={{ marginLeft: 8, fontSize: 11, padding: '3px 10px', borderRadius: 6, background: C.primary, color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}>+ Tarefa</button>
        </div>

        {/* ─── NÍVEL 2: 4 colunas kanban ─── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, minHeight: 300 }}>
          {TASK_COLS.map(col => {
            const colTasks = sortByUrgency(phaseTasks.filter(t => t.status === col.key));
            const isDropTarget = dropCol === col.key;
            return (
              <div key={col.key}
                onDragOver={e => e.preventDefault()}
                onDragEnter={e => { e.currentTarget.style.background = `${col.color}15`; setDropCol(col.key); }}
                onDragLeave={e => { e.currentTarget.style.background = C.bg; setDropCol(null); }}
                onDrop={e => { e.currentTarget.style.background = C.bg; setDropCol(null); const id = e.dataTransfer.getData('taskKanbanId'); if (id) changeTaskStatus(id, col.key); setDragId(null); }}
                style={{ background: isDropTarget ? `${col.color}10` : C.bg, borderRadius: 10, padding: 8, transition: 'background .15s' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: col.color, textTransform: 'uppercase' }}>{col.label}</span>
                  <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 99, background: C.card, border: `1px solid ${C.border}`, color: C.t3 }}>{colTasks.length}</span>
                </div>
                {colTasks.length === 0 && <div style={{ padding: 16, textAlign: 'center', fontSize: 10, color: C.t3, border: '1.5px dashed var(--cbrio-border)', borderRadius: 8 }}>Arraste tarefas aqui</div>}
                {colTasks.map(task => {
                  const projName = task.parent_name || list.find(p => p.id === (task.parent_id || task.project_id))?.name || '';
                  const dl = normDate(task.deadline);
                  const diff = dl ? Math.ceil((new Date(dl + 'T12:00:00') - new Date()) / 86400000) : null;
                  const dc = diff === null || task.status === 'concluida' ? null : diff < 0 ? C.red : diff <= 3 ? C.amber : C.green;
                  const dt = diff === null ? '' : diff < 0 ? `${Math.abs(diff)}d atrás` : diff === 0 ? 'Hoje' : `${diff}d`;
                  const isDragging = dragId === task.id;
                  const isOpen = kanbanExpanded === task.id;
                  return (
                    <div key={task.id} draggable
                      onDragStart={e => { e.dataTransfer.setData('taskKanbanId', task.id); setDragId(task.id); e.currentTarget.style.opacity = '0.4'; }}
                      onDragEnd={e => { setDragId(null); setDropCol(null); e.currentTarget.style.opacity = '1'; }}
                      onClick={() => setKanbanExpanded(isOpen ? null : task.id)}
                      style={{
                        background: C.card, borderRadius: 8, padding: 8, marginBottom: 4,
                        border: dc === C.red ? `1px solid ${C.redBg}` : `1px solid ${C.border}`,
                        cursor: 'grab', transition: 'opacity .15s, box-shadow .15s',
                        opacity: isDragging ? 0.4 : 1,
                      }}
                      onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'}
                      onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>
                      {/* Area badge */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                        <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 99, background: `${C.primary}15`, color: C.primary, fontWeight: 500 }}>{task.area || 'gestao'}</span>
                        {task.priority && task.priority !== 'media' && <Badge status={task.priority} map={PRIORITY_MAP} />}
                      </div>
                      {/* Task name */}
                      <div style={{ fontSize: 11, fontWeight: 500, color: C.text, lineHeight: 1.3, marginBottom: 2 }}>{task.name}</div>
                      {/* Project name */}
                      {projName && <div style={{ fontSize: 9, color: C.t3, marginBottom: 2 }}>{projName}</div>}
                      {/* Responsible + subtasks */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: C.t3 }}>
                        <span>{task.responsible || '—'}</span>
                        {task.subtasks?.length > 0 && <span>{task.subtasks.filter(s => s.done).length}/{task.subtasks.length}</span>}
                      </div>
                      {/* Deadline */}
                      {dc && task.status !== 'concluida' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, paddingTop: 6, borderTop: `1px solid ${C.border}` }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: dc }}>{fmtDate(dl)}</span>
                          <span style={{ fontSize: 10, fontWeight: 700, color: dc, padding: '1px 6px', borderRadius: 8, background: `${dc}15` }}>{dt}</span>
                        </div>
                      )}
                      {/* Expanded: subtasks */}
                      {isOpen && task.subtasks?.length > 0 && (
                        <div style={{ marginTop: 6, paddingTop: 6, borderTop: `1px solid ${C.border}` }} onClick={e => e.stopPropagation()}>
                          {task.subtasks.map(sub => (
                            <div key={sub.id} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, padding: '2px 0', color: C.text }}>
                              <input type="checkbox" checked={sub.done} onChange={async () => { await projects.toggleSubtask(sub.id, !sub.done); tasksApi.all({ source: 'projeto' }).then(d => setKanbanTasks(Array.isArray(d) ? d : [])).catch(() => {}); }} style={{ cursor: 'pointer', width: 13, height: 13 }} />
                              <span style={sub.done ? { textDecoration: 'line-through', color: C.t3 } : {}}>{sub.name}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
        <div style={{ height: 40 }} />
      </>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // RENDER — GANTT
  // ═══════════════════════════════════════════════════════════
  function renderGantt() {
    const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const ST_COLORS = { 'no-prazo': C.green, 'em-risco': C.amber, 'atrasado': C.red, 'concluido': C.grayBg };
    const PHASE_COLORS = { 'pendente': C.gray, 'em-andamento': C.blue, 'concluida': C.green, 'bloqueada': C.red };

    // Filtros do Gantt
    const statusFilters = [
      { key: 'all', label: 'Todos', color: C.primary },
      { key: 'no-prazo', label: 'No Prazo', color: C.green },
      { key: 'em-risco', label: 'Em Risco', color: C.amber },
      { key: 'atrasado', label: 'Atrasado', color: C.red },
      { key: 'concluido', label: 'Concluído', color: C.gray },
    ];

    let visibleProjects = list.filter(p => normDate(p.date_start) && normDate(p.date_end));
    // Aplicar filtro de status
    if (ganttStatusFilter && ganttStatusFilter !== 'all') {
      visibleProjects = visibleProjects.filter(p => p.status === ganttStatusFilter);
    }
    // Aplicar filtro de categoria
    if (ganttCatFilter && ganttCatFilter !== 'all') {
      visibleProjects = visibleProjects.filter(p => p.project_categories?.name === ganttCatFilter || p.category_name === ganttCatFilter);
    }

    if (list.filter(p => normDate(p.date_start) && normDate(p.date_end)).length === 0) return <div style={styles.empty}>Nenhum projeto com datas definidas.</div>;

    // Calculate timeline bounds (usar lista completa para range estável)
    const allWithDates = list.filter(p => normDate(p.date_start) && normDate(p.date_end));
    const allDates = allWithDates.flatMap(p => [p.date_start, p.date_end].filter(Boolean)).map(x => new Date(normDate(x) + 'T12:00:00'));
    const today = new Date();
    const ganttStart = new Date(Math.min(...allDates, today) - 14 * 86400000);
    const ganttEnd = new Date(Math.max(...allDates, today) + 14 * 86400000);
    ganttStart.setDate(1); ganttEnd.setDate(1); ganttEnd.setMonth(ganttEnd.getMonth() + 1);
    const totalMs = ganttEnd - ganttStart;
    const dateToPct = (dt) => Math.max(0, Math.min(100, ((new Date(dt) - ganttStart) / totalMs) * 100));
    const todayPct = dateToPct(today);

    // Month labels
    const monthLabels = [];
    const mc = new Date(ganttStart);
    while (mc < ganttEnd) { monthLabels.push({ label: MONTHS[mc.getMonth()] + (mc.getMonth() === 0 ? ' ' + mc.getFullYear() : ''), pct: dateToPct(mc) }); mc.setMonth(mc.getMonth() + 1); }

    const NW = 220; const BH = 34; const PHASE_H = 26;

    // Contagens para badges nos filtros
    const statusCounts = { 'all': allWithDates.length };
    allWithDates.forEach(p => { statusCounts[p.status] = (statusCounts[p.status] || 0) + 1; });

    return (
      <>
        {/* Filtros */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: C.t2, fontWeight: 600 }}>Status:</span>
          {statusFilters.map(f => {
            const isActive = (ganttStatusFilter || 'all') === f.key;
            return (
              <button key={f.key} onClick={() => setGanttStatusFilter(f.key === 'all' ? '' : f.key)} style={{
                padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: isActive ? 700 : 400, cursor: 'pointer',
                border: isActive ? `2px solid ${f.color}` : `1px solid ${C.border}`,
                background: isActive ? `${f.color}15` : 'transparent',
                color: isActive ? f.color : C.t3, transition: 'all .15s',
              }}>
                {f.label} <span style={{ fontSize: 9, opacity: 0.7 }}>({statusCounts[f.key] || 0})</span>
              </button>
            );
          })}

          <span style={{ width: 1, height: 20, background: C.border }} />

          <span style={{ fontSize: 11, color: C.t2, fontWeight: 600 }}>Categoria:</span>
          <select value={ganttCatFilter || 'all'} onChange={e => setGanttCatFilter(e.target.value === 'all' ? '' : e.target.value)}
            style={{ fontSize: 12, padding: '4px 8px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.card, color: C.text }}>
            <option value="all">Todas ({allWithDates.length})</option>
            {categories.map(c => {
              const cnt = allWithDates.filter(p => p.project_categories?.name === c.name || p.category_name === c.name).length;
              return cnt > 0 ? <option key={c.id} value={c.name}>{c.name} ({cnt})</option> : null;
            })}
          </select>
        </div>

        {/* Contagem filtrada */}
        {visibleProjects.length === 0 && <div style={styles.empty}>Nenhum projeto corresponde aos filtros selecionados.</div>}
        {visibleProjects.length > 0 && <div style={{ fontSize: 11, color: C.t3, marginBottom: 8 }}>{visibleProjects.length} projeto(s) exibido(s)</div>}

        {/* Legenda */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
          {[{ l: 'No Prazo (>7d)', c: C.green }, { l: 'Urgente (≤7d)', c: C.amber }, { l: 'Atrasado', c: C.red }, { l: 'Concluído', c: C.grayBg }].map(x => (
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

        <div style={{ ...styles.card, overflow: 'hidden' }}>
          <div style={{ display: 'flex' }}>
            {/* Fixed left column */}
            <div style={{ width: NW, flexShrink: 0, borderRight: `1px solid ${C.border}` }}>
              <div style={{ height: 30, borderBottom: `1px solid ${C.border}`, background: C.tableHeader, padding: '0 12px', display: 'flex', alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: C.t2, textTransform: 'uppercase' }}>Projeto</span>
              </div>
              {visibleProjects.map(p => {
                const isExp = ganttExpanded[p.id];
                const phases = p.phases || [];
                return (
                  <div key={p.id}>
                    <div onClick={() => setGanttExpanded(prev => ({ ...prev, [p.id]: !prev[p.id] }))}
                      style={{ height: BH, padding: '0 12px', display: 'flex', alignItems: 'center', gap: 6, borderBottom: `1px solid ${C.border}`, cursor: 'pointer' }}
                      onMouseEnter={e => e.currentTarget.style.background = C.bg}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <span style={{ fontSize: 10, color: C.t3, width: 12 }}>{phases.length > 0 ? (isExp ? '\u25BC' : '\u25B6') : ''}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{p.name}</span>
                    </div>
                    {isExp && phases.map(ph => (
                      <div key={ph.id} style={{ height: PHASE_H, padding: '0 12px 0 30px', display: 'flex', alignItems: 'center', borderBottom: `1px solid ${C.border}` }}>
                        <span style={{ fontSize: 10, color: C.t3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ph.name}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>

            {/* Scrollable right area */}
            <div style={{ flex: 1, overflowX: 'auto' }}>
              <div style={{ minWidth: 800, position: 'relative' }}>
                {/* Month header */}
                <div style={{ height: 30, position: 'relative', borderBottom: `1px solid ${C.border}`, background: C.tableHeader }}>
                  {monthLabels.map((m, i) => (
                    <div key={i} style={{ position: 'absolute', left: `${m.pct}%`, top: 0, height: '100%', borderLeft: `1px solid ${C.border}`, padding: '6px 6px', fontSize: 10, fontWeight: 600, color: C.t2, whiteSpace: 'nowrap' }}>{m.label}</div>
                  ))}
                  <div style={{ position: 'absolute', left: `${todayPct}%`, top: 0, width: 2, height: '100%', background: C.red, zIndex: 2 }} />
                  <div style={{ position: 'absolute', left: `${todayPct}%`, top: -1, transform: 'translateX(-50%)', fontSize: 10, fontWeight: 700, color: C.red, background: C.card, padding: '1px 5px', borderRadius: 4, zIndex: 3 }}>hoje</div>
                </div>

                {/* Project bars */}
                {visibleProjects.map(p => {
                  const isExp = ganttExpanded[p.id];
                  const phases = p.phases || [];
                  const si = normDate(p.date_start); const ei = normDate(p.date_end);
                  const isDone = p.status === 'concluido';
                  const now = new Date();
                  const startDate = si ? new Date(si + 'T12:00:00') : null;
                  const endDate = ei ? new Date(ei + 'T12:00:00') : null;
                  const totalDays = startDate && endDate ? Math.max(Math.ceil((endDate - startDate) / 86400000), 1) : 0;
                  const elapsed = startDate ? Math.max(Math.ceil((now - startDate) / 86400000), 0) : 0;
                  const remaining = endDate ? Math.ceil((endDate - now) / 86400000) : null;
                  const progressPct = totalDays > 0 ? Math.min(Math.max((elapsed / totalDays) * 100, 0), 100) : 0;

                  // Cor e texto
                  const barColor = isDone ? C.grayBg : remaining !== null && remaining < 0 ? C.red : remaining !== null && remaining <= 7 ? C.amber : C.green;
                  let daysText = '';
                  if (isDone) { daysText = '✓'; }
                  else if (startDate && now < startDate) { daysText = `em ${Math.ceil((startDate - now) / 86400000)}d`; }
                  else if (remaining !== null && remaining < 0) { daysText = `${Math.abs(remaining)}d atrás`; }
                  else if (elapsed > 0 && remaining !== null) { daysText = `${elapsed}d ▸ ${remaining}d`; }
                  else if (remaining !== null) { daysText = `${remaining}d`; }

                  let lp = 0, wp = 0;
                  if (si && ei) { lp = dateToPct(si + 'T12:00:00'); const rp = dateToPct(ei + 'T12:00:00'); wp = Math.max(rp - lp, 1); }

                  return (
                    <div key={p.id}>
                      <div style={{ position: 'relative', height: BH, borderBottom: `1px solid ${C.border}` }}>
                        {monthLabels.map((m, i) => (<div key={i} style={{ position: 'absolute', left: `${m.pct}%`, top: 0, width: 1, height: '100%', background: C.border, opacity: 0.3 }} />))}
                        <div style={{ position: 'absolute', left: `${todayPct}%`, top: 0, width: 2, height: '100%', background: C.red, zIndex: 2, opacity: 0.3 }} />
                        {si && ei && (
                          <div onClick={() => loadDetail(p.id)} title={`${p.name}\n${fmtDate(si)} → ${fmtDate(ei)}\n${totalDays} dias total | ${elapsed}d passados | ${remaining}d restantes`}
                            style={{ position: 'absolute', top: 4, height: BH - 8, borderRadius: 6, left: `${lp}%`, width: `${wp}%`, minWidth: 60, overflow: 'hidden', cursor: 'pointer', transition: 'opacity .15s', opacity: isDone ? 0.5 : 0.9 }}
                            onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)'; }}
                            onMouseLeave={e => { e.currentTarget.style.opacity = isDone ? '0.5' : '0.9'; e.currentTarget.style.boxShadow = 'none'; }}>
                            {/* Barra de progresso temporal (parte escura = já passou) */}
                            <div style={{ position: 'absolute', inset: 0, borderRadius: 6, background: barColor, opacity: 0.45 }} />
                            <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: `${progressPct}%`, borderRadius: `6px ${progressPct >= 98 ? 6 : 0}px ${progressPct >= 98 ? 6 : 0}px 6px`, background: barColor }} />
                            {/* Texto centralizado */}
                            <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '0 6px' }}>
                              <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>{daysText}</span>
                            </div>
                          </div>
                        )}
                      </div>
                      {/* Phase sub-bars */}
                      {isExp && phases.map(ph => {
                        const psi = normDate(ph.date_start || ph.start_date); const pei = normDate(ph.date_end || ph.end_date);
                        const phDone = ph.status === 'concluida';
                        const phEnd = pei ? new Date(pei + 'T12:00:00') : null;
                        const phDiff = phEnd ? Math.ceil((phEnd - new Date()) / 86400000) : null;
                        const phColor = phDone ? C.grayBg : ph.status === 'bloqueada' ? C.red : phDiff !== null && phDiff < 0 ? C.red : phDiff !== null && phDiff <= 3 ? C.amber : C.blue;
                        const phDaysText = phDone ? '✓' : phDiff === null ? ph.name : phDiff < 0 ? `${Math.abs(phDiff)}d` : phDiff === 0 ? 'Hoje' : `${phDiff}d`;
                        let plp = 0, pwp = 0;
                        if (psi && pei) { plp = dateToPct(psi + 'T12:00:00'); const prp = dateToPct(pei + 'T12:00:00'); pwp = Math.max(prp - plp, 1); }
                        return (
                          <div key={ph.id} style={{ position: 'relative', height: PHASE_H, borderBottom: `1px solid ${C.border}` }}>
                            {monthLabels.map((m, i) => (<div key={i} style={{ position: 'absolute', left: `${m.pct}%`, top: 0, width: 1, height: '100%', background: C.border, opacity: 0.2 }} />))}
                            <div style={{ position: 'absolute', left: `${todayPct}%`, top: 0, width: 2, height: '100%', background: C.red, zIndex: 2, opacity: 0.2 }} />
                            {psi && pei && (
                              <div title={`${ph.name}\n${fmtDate(psi)} → ${fmtDate(pei)}\n${phDaysText}`}
                                style={{ position: 'absolute', top: 3, height: PHASE_H - 6, borderRadius: 4, left: `${plp}%`, width: `${pwp}%`, minWidth: 30, background: phColor, opacity: phDone ? 0.5 : 0.75, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', overflow: 'hidden' }}>
                                <span style={{ fontSize: 9, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap' }}>{phDaysText}</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
        <div style={{ height: 40 }} />
      </>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // RENDER — DETAIL
  // ═══════════════════════════════════════════════════════════
  function renderDetail() {
    if (!detail) return <div style={styles.empty}>Selecione um projeto.</div>;
    const p = detail;
    const phases = p.phases || [];
    const tasks = p.tasks || [];
    const milestones = p.milestones || [];
    const risks = p.risks || [];
    const kpis = p.kpis || [];
    const budgetItems = p.budget_items || [];
    const retro = p.retrospective || retroData;

    const DETAIL_TABS = ['Info', 'Fases', 'Tarefas', 'Riscos', 'Orcamento', 'Retrospectiva'];

    return (
      <>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <button onClick={() => { setDetail(null); setTab(1); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.primary, fontWeight: 600, fontSize: 13, padding: 0, marginBottom: 8 }}>{'\u2190'} Voltar</button>
            <div style={{ fontSize: 22, fontWeight: 800, color: C.text, marginBottom: 8 }}>{p.name}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Badge status={p.status} map={STATUS_MAP} />
              <Badge status={p.priority} map={PRIORITY_MAP} />
              {p.project_categories?.name && <span style={styles.badge(p.project_categories.color || C.primary, (p.project_categories.color || C.primary) + '18')}>{p.project_categories.name}</span>}
            </div>
          </div>
          {canEdit && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button style={styles.btn('secondary')} onClick={() => setModalProject(p)}>Editar</button>
              {p.status !== 'concluido' && p.status !== 'cancelado' && (
                <button style={{ ...styles.btn('primary'), background: '#10b981', color: '#fff' }} onClick={() => changeProjectStatus(p.id, 'concluido')}>Finalizar</button>
              )}
              {p.status !== 'cancelado' && p.status !== 'concluido' && (
                <button style={{ ...styles.btn('secondary'), color: '#6b7280' }} onClick={() => { if (window.confirm('Cancelar este projeto?')) changeProjectStatus(p.id, 'cancelado'); }}>Cancelar</button>
              )}
              {(p.status === 'concluido' || p.status === 'cancelado') && (
                <button style={{ ...styles.btn('secondary'), color: C.amber }} onClick={() => changeProjectStatus(p.id, 'no-prazo')}>Reabrir</button>
              )}
            </div>
          )}
        </div>

        {/* Detail sub-tabs */}
        <div style={{ display: 'flex', gap: 0, borderBottom: `2px solid ${C.border}`, marginBottom: 20 }}>
          {DETAIL_TABS.map(t => (
            <button key={t} style={styles.tab(detailTab === t.toLowerCase())} onClick={() => setDetailTab(t.toLowerCase())}>{t}</button>
          ))}
        </div>

        {/* ─── Info ─── */}
        {detailTab === 'info' && (
          <>
            {/* Info grid */}
            <div style={{ ...styles.card, padding: 20, marginBottom: 20 }}>
              <div style={styles.infoGrid}>
                <div><div style={styles.infoLabel}>Lider</div><div style={styles.infoValue}>{p.leader || p.responsible || '\u2014'}</div></div>
                <div><div style={styles.infoLabel}>Area</div><div style={styles.infoValue}>{p.area || '\u2014'}</div></div>
                <div><div style={styles.infoLabel}>Periodo</div><div style={styles.infoValue}>{fmtDate(p.date_start)} - {fmtDate(p.date_end)}</div></div>
                <div><div style={styles.infoLabel}>Frequencia</div><div style={styles.infoValue}>{p.frequency || '\u2014'}</div></div>
                <div><div style={styles.infoLabel}>Publico-alvo</div><div style={styles.infoValue}>{p.public_target || '\u2014'}</div></div>
                <div><div style={styles.infoLabel}>Complexidade</div><div style={styles.infoValue}>{COMPLEXITY_MAP[p.complexity] || p.complexity || '\u2014'}</div></div>
                <div><div style={styles.infoLabel}>Impacto</div><div style={styles.infoValue}>{IMPACT_MAP[p.impact] || p.impact || '\u2014'}</div></div>
                <div><div style={styles.infoLabel}>Ano</div><div style={styles.infoValue}>{p.year || '\u2014'}</div></div>
              </div>
            </div>

            {/* Ourico card */}
            <div style={{ ...styles.card, padding: 20, marginBottom: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 12 }}>Teste do Ourico</div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {[
                  { label: 'Passa no Ourico?', value: p.ourico_test },
                  { label: 'Gera Unidade?', value: p.generates_unity },
                  { label: 'Colabora com Expansao?', value: p.collaborates_expansion },
                ].map(item => {
                  const val = item.value === true || item.value === 'sim' ? 'Sim' : item.value === false || item.value === 'nao' ? 'Nao' : 'N/A';
                  const color = val === 'Sim' ? C.green : val === 'Nao' ? C.red : C.t3;
                  const bg = val === 'Sim' ? C.greenBg : val === 'Nao' ? C.redBg : 'var(--cbrio-bg)';
                  return (
                    <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, color: C.t2 }}>{item.label}</span>
                      <span style={styles.badge(color, bg)}>{val}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* SWOT card */}
            {(p.swot_strengths || p.swot_weaknesses || p.swot_opportunities || p.swot_threats) && (
              <div style={{ ...styles.card, padding: 20, marginBottom: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 12 }}>Analise SWOT</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {[
                    { label: 'Forcas', value: p.swot_strengths, color: C.green },
                    { label: 'Fraquezas', value: p.swot_weaknesses, color: C.red },
                    { label: 'Oportunidades', value: p.swot_opportunities, color: C.blue },
                    { label: 'Ameacas', value: p.swot_threats, color: C.amber },
                  ].map(q => (
                    <div key={q.label} style={{ borderLeft: `4px solid ${q.color}`, padding: '12px 16px', background: C.bg, borderRadius: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: q.color, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>{q.label}</div>
                      <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{q.value || '\u2014'}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* KPIs */}
            <div style={styles.section}>
              <div style={styles.sectionTitle}>
                <span>KPIs ({kpis.length})</span>
                {canEdit && <button style={{ ...styles.btn('secondary'), ...styles.btnSm }} onClick={() => setModalKpi({})}>+ KPI</button>}
              </div>
              {kpis.length === 0 ? (
                <div style={styles.empty}>Nenhum KPI cadastrado.</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 12 }}>
                  {kpis.map(kpi => {
                    const current = Number(kpi.current_value) || 0;
                    const target = Number(kpi.target_value) || 1;
                    return (
                      <div key={kpi.id} style={{ ...styles.card, padding: 16 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{kpi.name}</div>
                          {canEdit && (
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button style={{ ...styles.btn('ghost'), ...styles.btnSm, fontSize: 10 }} onClick={() => setModalKpi(kpi)}>Editar</button>
                              <button style={{ ...styles.btn('ghost'), ...styles.btnSm, fontSize: 10, color: C.red }} onClick={() => deleteKpi(kpi.id)}>X</button>
                            </div>
                          )}
                        </div>
                        <ProgressBar value={current} max={target} />
                        <div style={{ fontSize: 11, color: C.t3, marginTop: 4 }}>
                          {current}/{target} {kpi.unit || ''}
                          {kpi.instrument && <span> | {kpi.instrument}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Description & Notes */}
            {p.description && (
              <div style={{ ...styles.card, padding: 20, marginBottom: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 8 }}>Descricao</div>
                <div style={{ fontSize: 13, color: C.t2, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{p.description}</div>
              </div>
            )}
            {p.notes && (
              <div style={{ ...styles.card, padding: 20, marginBottom: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 8 }}>Notas</div>
                <div style={{ fontSize: 13, color: C.t2, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{p.notes}</div>
              </div>
            )}
          </>
        )}

        {/* ─── Fases ─── */}
        {detailTab === 'fases' && (
          <>
            {/* Pulse animation for em-andamento */}
            <style>{`
              @keyframes phasePulse {
                0%, 100% { box-shadow: 0 0 0 0px rgba(59,130,246,0.3); }
                50% { box-shadow: 0 0 0 6px rgba(59,130,246,0.08); }
              }
            `}</style>
            {phases.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <div style={{ fontSize: 14, color: C.t3, marginBottom: 16 }}>Nenhuma fase cadastrada.</div>
                {canEdit && <button style={styles.btn('primary')} onClick={initPhases}>Iniciar Fases (7 fases)</button>}
              </div>
            ) : (() => {
              const sortedPhases = [...phases].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
              const selectedPhaseId = ganttExpanded.activePhase || (sortedPhases[0] && sortedPhases[0].id);
              const selectedPhase = sortedPhases.find(ph => ph.id === selectedPhaseId) || sortedPhases[0];

              // Helper: get tasks for a phase
              const getTasksForPhase = (ph) => {
                if (!ph) return [];
                const phaseName = ph.name || '';
                const phStart = ph.date_start || ph.start_date;
                const phEnd = ph.date_end || ph.end_date;
                return tasks.filter(t => {
                  // Match by description containing "Fase: {phaseName}"
                  if (t.description && phaseName && t.description.includes('Fase: ' + phaseName)) return true;
                  // Match by date range overlap
                  if (phStart && phEnd && (t.start_date || t.deadline)) {
                    const tStart = t.start_date || t.deadline;
                    const tEnd = t.deadline || t.start_date;
                    if (tStart && tEnd && tStart <= phEnd && tEnd >= phStart) return true;
                  }
                  return false;
                });
              };

              const phaseTasks = getTasksForPhase(selectedPhase);
              const doneTasks = phaseTasks.filter(t => t.status === 'concluida').length;
              const totalTasks = phaseTasks.length;

              return (
                <>
                  {/* Horizontal stepper — 7 circles */}
                  <div style={{ overflowX: 'auto', marginBottom: 24, padding: '12px 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0, minWidth: 'max-content' }}>
                      {sortedPhases.map((ph, i) => {
                        const isDone = ph.status === 'concluida';
                        const isActive = ph.status === 'em-andamento';
                        const isBlocked = ph.status === 'bloqueada';
                        const isSelected = ph.id === selectedPhaseId;
                        const circleColor = isDone ? C.green : isActive ? C.blue : isBlocked ? C.red : C.gray;
                        const circleBg = isDone ? C.greenBg : isActive ? C.blueBg : isBlocked ? C.redBg : 'var(--cbrio-bg)';
                        const abbrev = PHASE_ABBREVS[i] || `F${i + 1}`;
                        return (
                          <div key={ph.id} style={{ display: 'flex', alignItems: 'center' }}>
                            <div
                              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', padding: '0 2px' }}
                              onClick={() => setGanttExpanded(prev => ({ ...prev, activePhase: ph.id }))}
                            >
                              <div style={{
                                width: 44, height: 44, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                background: circleBg, border: `3px solid ${circleColor}`,
                                boxShadow: isSelected ? `0 0 0 4px ${circleColor}40` : 'none',
                                animation: isActive ? 'phasePulse 2s ease-in-out infinite' : 'none',
                                transition: 'all .2s',
                                transform: isSelected ? 'scale(1.1)' : 'scale(1)',
                              }}>
                                {isDone ? (
                                  <span style={{ fontSize: 18, color: C.green, fontWeight: 700 }}>{'\u2713'}</span>
                                ) : (
                                  <span style={{ fontSize: 13, fontWeight: 700, color: circleColor }}>{i + 1}</span>
                                )}
                              </div>
                              <div style={{
                                fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
                                color: isSelected ? circleColor : isDone ? C.green : isActive ? C.blue : C.gray,
                                marginTop: 6, textAlign: 'center',
                              }}>
                                {abbrev}
                              </div>
                              <div style={{
                                fontSize: 9, fontWeight: 500, color: C.t3, marginTop: 1, textAlign: 'center', maxWidth: 80,
                                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                              }}>
                                {ph.name || PHASE_NAMES[i] || `Fase ${i + 1}`}
                              </div>
                            </div>
                            {i < sortedPhases.length - 1 && (
                              <div style={{
                                width: 36, height: 3,
                                background: isDone ? C.green : C.border,
                                margin: '0 2px', marginBottom: 28, borderRadius: 2,
                              }} />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Selected phase detail card */}
                  {selectedPhase && (
                    <div style={{ ...styles.card, padding: 20, marginBottom: 16 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{
                            width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: selectedPhase.status === 'concluida' ? C.greenBg : selectedPhase.status === 'em-andamento' ? C.blueBg : selectedPhase.status === 'bloqueada' ? C.redBg : 'var(--cbrio-bg)',
                            border: `2px solid ${selectedPhase.status === 'concluida' ? C.green : selectedPhase.status === 'em-andamento' ? C.blue : selectedPhase.status === 'bloqueada' ? C.red : C.gray}`,
                            fontSize: 13, fontWeight: 700,
                            color: selectedPhase.status === 'concluida' ? C.green : selectedPhase.status === 'em-andamento' ? C.blue : selectedPhase.status === 'bloqueada' ? C.red : C.gray,
                          }}>
                            {selectedPhase.status === 'concluida' ? '\u2713' : (sortedPhases.indexOf(selectedPhase) + 1)}
                          </div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>
                            {selectedPhase.name || PHASE_NAMES[sortedPhases.indexOf(selectedPhase)] || 'Fase'}
                          </div>
                        </div>
                        <Badge status={selectedPhase.status} map={PHASE_STATUS_MAP} />
                      </div>

                      <div style={styles.infoGrid}>
                        <div>
                          <div style={styles.infoLabel}>Periodo</div>
                          <div style={styles.infoValue}>{fmtDate(selectedPhase.date_start || selectedPhase.start_date)} - {fmtDate(selectedPhase.date_end || selectedPhase.end_date)}</div>
                        </div>
                        <div>
                          <div style={styles.infoLabel}>Responsavel</div>
                          <div style={styles.infoValue}>{selectedPhase.responsible || '\u2014'}</div>
                        </div>
                      </div>

                      {canEdit && (
                        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 12 }}>
                          <label style={styles.label}>Status</label>
                          <select style={styles.select} value={selectedPhase.status} onChange={e => updatePhaseField(selectedPhase.id, 'status', e.target.value)}>
                            {Object.entries(PHASE_STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                          </select>
                        </div>
                      )}

                      {canEdit && (
                        <div style={{ marginTop: 12 }}>
                          <label style={styles.label}>Notas</label>
                          <textarea style={{ ...styles.input, minHeight: 60, resize: 'vertical' }} defaultValue={selectedPhase.notes || ''}
                            onBlur={e => updatePhaseField(selectedPhase.id, 'notes', e.target.value)} />
                        </div>
                      )}

                      {/* Mini task checklist for this phase */}
                      <div style={{ marginTop: 20, borderTop: `1px solid ${C.border}`, paddingTop: 16 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                            Tarefas da Fase ({doneTasks}/{totalTasks})
                          </div>
                        </div>

                        {/* Progress bar */}
                        {totalTasks > 0 && (
                          <div style={{ marginBottom: 12 }}>
                            <ProgressBar value={doneTasks} max={totalTasks} color={doneTasks === totalTasks ? C.green : C.blue} />
                          </div>
                        )}

                        {totalTasks === 0 ? (
                          <div style={{ fontSize: 12, color: C.t3, textAlign: 'center', padding: 16 }}>
                            Nenhuma tarefa associada a esta fase.
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {phaseTasks.map(t => {
                              const isDoneTask = t.status === 'concluida';
                              return (
                                <div
                                  key={t.id}
                                  onClick={() => changeTaskStatus(t.id, isDoneTask ? 'pendente' : 'concluida')}
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                                    borderRadius: 8, cursor: 'pointer', transition: 'background .15s',
                                    background: isDoneTask ? `${C.greenBg}` : 'transparent',
                                    border: `1px solid ${isDoneTask ? C.green + '30' : C.border}`,
                                  }}
                                >
                                  <div style={{
                                    width: 20, height: 20, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    border: `2px solid ${isDoneTask ? C.green : C.gray}`,
                                    background: isDoneTask ? C.green : 'transparent',
                                    transition: 'all .15s', flexShrink: 0,
                                  }}>
                                    {isDoneTask && <span style={{ color: '#fff', fontSize: 12, fontWeight: 700 }}>{'\u2713'}</span>}
                                  </div>
                                  <div style={{
                                    fontSize: 13, color: isDoneTask ? C.t3 : C.text, flex: 1,
                                    textDecoration: isDoneTask ? 'line-through' : 'none',
                                  }}>
                                    {t.title || t.name || 'Tarefa'}
                                  </div>
                                  <Badge status={t.status} map={TASK_STATUS_MAP} />
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </>
        )}

        {/* ─── Tarefas ─── */}
        {detailTab === 'tarefas' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', gap: 6 }}>
                {['lista', 'kanban'].map(v => (
                  <button key={v} onClick={() => setTaskView(v)} style={{
                    padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: taskView === v ? 700 : 400, cursor: 'pointer',
                    border: taskView === v ? `2px solid ${C.primary}` : `1px solid ${C.border}`,
                    background: taskView === v ? C.primaryBg : 'transparent', color: taskView === v ? C.primary : C.t3,
                  }}>{v === 'lista' ? 'Lista' : 'Kanban'}</button>
                ))}
              </div>
              {canEdit && <button style={{ ...styles.btn('primary'), ...styles.btnSm }} onClick={() => setModalTask({})}>+ Tarefa</button>}
            </div>

            {taskView === 'lista' ? (
              /* Task list view */
              tasks.length === 0 ? <div style={styles.empty}>Nenhuma tarefa nesta fase. Use o botao + Tarefa para adicionar.</div> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {sortByUrgency(tasks).map(t => {
                    const subs = t.subtasks || [];
                    const comments = t.comments || [];
                    const subsDone = subs.filter(s => s.done).length;
                    return (
                      <div key={t.id} style={{ ...styles.card, padding: 16 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{t.name}</div>
                            <div style={{ fontSize: 12, color: C.t3, marginTop: 2 }}>
                              {t.responsible || '\u2014'} | {fmtDate(t.deadline)} <DaysCounter date={t.deadline} status={t.status} />
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <Badge status={t.priority} map={PRIORITY_MAP} />
                            {canEdit ? (
                              <select style={{ ...styles.select, fontSize: 11, padding: '2px 6px' }} value={t.status}
                                onChange={e => changeTaskStatus(t.id, e.target.value)}>
                                {Object.entries(TASK_STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                              </select>
                            ) : <Badge status={t.status} map={TASK_STATUS_MAP} />}
                            {canEdit && (
                              <div style={{ display: 'flex', gap: 2 }}>
                                <button style={{ ...styles.btn('ghost'), ...styles.btnSm, fontSize: 10 }} onClick={() => setModalTask(t)}>Editar</button>
                                <button style={{ ...styles.btn('ghost'), ...styles.btnSm, fontSize: 10, color: C.red }} onClick={() => deleteTask(t.id)}>X</button>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Subtask progress */}
                        {subs.length > 0 && (
                          <div style={{ marginTop: 8 }}>
                            <div style={{ fontSize: 11, color: C.t3, marginBottom: 4 }}>Subtarefas ({subsDone}/{subs.length})</div>
                            {subs.map(sub => (
                              <div key={sub.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', fontSize: 12, color: C.text }}>
                                <input type="checkbox" checked={!!sub.done} onChange={() => toggleSubtask(sub.id, !sub.done)} style={{ cursor: 'pointer', width: 14, height: 14, accentColor: C.primary }} />
                                <span style={sub.done ? { textDecoration: 'line-through', color: C.t3 } : {}}>{sub.name}</span>
                                {canEdit && <button onClick={() => deleteSubtask(sub.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.red, fontSize: 10, marginLeft: 'auto' }}>{'\u2715'}</button>}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Add subtask */}
                        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                          <input style={{ ...styles.input, padding: '4px 8px', fontSize: 11 }} placeholder="Nova subtarefa..."
                            value={newSubtask[t.id] || ''} onChange={e => setNewSubtask(prev => ({ ...prev, [t.id]: e.target.value }))}
                            onKeyDown={e => { if (e.key === 'Enter') addSubtask(t.id); }} />
                          <button style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: C.primary, color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }} onClick={() => addSubtask(t.id)}>+</button>
                        </div>

                        {/* Comments */}
                        {comments.length > 0 && (
                          <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
                            {comments.map((c, ci) => (
                              <div key={ci} style={{ background: C.bg, borderRadius: 8, padding: '6px 10px', marginBottom: 4, fontSize: 12, color: C.t2 }}>
                                <span style={{ fontWeight: 600 }}>{c.author_name || 'Anonimo'}</span>: {c.text}
                                <span style={{ fontSize: 10, color: C.t3, marginLeft: 8 }}>{fmtDate(c.created_at)}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Add comment */}
                        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                          <input style={{ ...styles.input, padding: '4px 8px', fontSize: 11 }} placeholder="Comentar..."
                            value={newComment[t.id] || ''} onChange={e => setNewComment(prev => ({ ...prev, [t.id]: e.target.value }))}
                            onKeyDown={e => { if (e.key === 'Enter') addComment(t.id); }} />
                          <button style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: C.primary, color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }} onClick={() => addComment(t.id)}>Enviar</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : (
              /* Task kanban view */
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, minHeight: 300 }}>
                {Object.entries(TASK_STATUS_MAP).map(([colKey, colInfo]) => {
                  const colTasks = sortByUrgency(tasks.filter(t => t.status === colKey));
                  const isTarget = taskDropCol === colKey;
                  return (
                    <div key={colKey}
                      onDragOver={e => { e.preventDefault(); setTaskDropCol(colKey); }}
                      onDragLeave={() => setTaskDropCol(null)}
                      onDrop={e => { e.preventDefault(); const id = e.dataTransfer.getData('taskKanbanId'); if (id) changeTaskStatus(id, colKey); setTaskDropCol(null); setTaskDragId(null); }}
                      style={{
                        background: isTarget ? `${colInfo.c}10` : C.bg, borderRadius: 10, padding: 8,
                        border: isTarget ? `2px dashed ${colInfo.c}` : `1px solid ${C.border}`, transition: 'all .15s',
                      }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontSize: 10, fontWeight: 600, color: colInfo.c, textTransform: 'uppercase', letterSpacing: 0.4 }}>{colInfo.label}</span>
                        <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 99, background: C.card, border: `1px solid ${C.border}`, color: C.t3 }}>{colTasks.length}</span>
                      </div>
                      {colTasks.length === 0 && <div style={{ padding: 12, textAlign: 'center', fontSize: 10, color: C.t3, border: `1.5px dashed ${C.border}`, borderRadius: 8 }}>{'\u2014'}</div>}
                      {colTasks.map(t => {
                        const subs = t.subtasks || [];
                        const subsDone = subs.filter(s => s.done).length;
                        const isDragging = taskDragId === t.id;
                        return (
                          <div key={t.id} draggable
                            onDragStart={e => { e.dataTransfer.setData('taskKanbanId', t.id); setTaskDragId(t.id); }}
                            onDragEnd={() => { setTaskDragId(null); setTaskDropCol(null); }}
                            style={{
                              background: C.card, borderRadius: 8, padding: '10px 12px', marginBottom: 6,
                              border: `1px solid ${C.border}`, cursor: 'grab', opacity: isDragging ? 0.4 : 1,
                              transition: 'all .15s',
                            }}
                            onMouseEnter={e => { if (!isDragging) e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'; }}
                            onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 4 }}>{t.name}</div>
                            <div style={{ fontSize: 10, color: C.t3, marginBottom: 4 }}>{t.responsible || '\u2014'}</div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: 10, color: C.t3 }}>{fmtDate(t.deadline)}</span>
                              <DaysCounter date={t.deadline} status={t.status} />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                              <Badge status={t.priority} map={PRIORITY_MAP} />
                              {subs.length > 0 && <span style={{ fontSize: 9, color: C.t3 }}>{subsDone}/{subs.length}</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ─── Riscos ─── */}
        {detailTab === 'riscos' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Riscos ({risks.length})</div>
              {canEdit && <button style={{ ...styles.btn('primary'), ...styles.btnSm }} onClick={() => setModalRisk({})}>+ Risco</button>}
            </div>
            {/* Matriz de Riscos 5x5 */}
            {(detail.risks || []).length > 0 && (
              <div style={{ marginBottom: 20, padding: 16, background: 'var(--cbrio-bg)', borderRadius: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--cbrio-text)', marginBottom: 10 }}>Matriz de Riscos</div>
                <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end' }}>
                  <div style={{ width: 28, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                    {[5,4,3,2,1].map(p => <div key={p} style={{ height: 34, display: 'flex', alignItems: 'center', fontSize: 10, color: 'var(--cbrio-text3)' }}>{p}</div>)}
                    <div style={{ fontSize: 9, color: 'var(--cbrio-text3)', marginTop: 4 }}>Prob.</div>
                  </div>
                  <div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 34px)', gap: 2 }}>
                      {[5,4,3,2,1].flatMap(prob => [1,2,3,4,5].map(imp => {
                        const score = prob * imp;
                        const cellRisks = (detail.risks || []).filter(r => r.probability === prob && r.impact === imp);
                        const bg = score >= 15 ? `${C.red}30` : score >= 8 ? `${C.amber}30` : score >= 4 ? `${C.green}30` : C.card;
                        const bdr = cellRisks.length > 0 ? `2px solid ${score >= 15 ? C.red : score >= 8 ? C.amber : C.green}` : `1px solid ${C.border}`;
                        return (
                          <div key={`${prob}-${imp}`} title={`Prob: ${prob} \u00d7 Imp: ${imp} = ${score}${cellRisks.length ? '\n' + cellRisks.map(r => r.title).join(', ') : ''}`}
                            style={{ width: 34, height: 34, borderRadius: 4, background: bg, border: bdr, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 600, color: cellRisks.length ? 'var(--cbrio-text)' : 'var(--cbrio-text3)' }}>
                            {cellRisks.length || ''}
                          </div>
                        );
                      }))}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, padding: '0 2px' }}>
                      {[1,2,3,4,5].map(i => <div key={i} style={{ width: 34, textAlign: 'center', fontSize: 10, color: 'var(--cbrio-text3)' }}>{i}</div>)}
                    </div>
                    <div style={{ textAlign: 'center', fontSize: 9, color: 'var(--cbrio-text3)', marginTop: 2 }}>Impacto</div>
                  </div>
                </div>
              </div>
            )}
            {risks.length === 0 ? <div style={styles.empty}>Nenhum risco cadastrado. Adicione riscos para monitorar ameacas ao projeto.</div> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {risks.map(r => {
                  const score = (Number(r.probability) || 1) * (Number(r.impact) || 1);
                  const borderColor = score >= 15 ? C.red : score >= 8 ? C.amber : C.green;
                  return (
                    <div key={r.id} style={{ ...styles.card, padding: 16, borderLeft: `4px solid ${borderColor}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{r.title}</div>
                          <div style={{ fontSize: 12, color: C.t3, marginTop: 2 }}>
                            Prob.: {r.probability} x Imp.: {r.impact} = <span style={{ fontWeight: 700, color: borderColor }}>Score {score}</span>
                          </div>
                        </div>
                        {canEdit && (
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button style={{ ...styles.btn('ghost'), ...styles.btnSm, fontSize: 10 }} onClick={() => setModalRisk(r)}>Editar</button>
                            <button style={{ ...styles.btn('ghost'), ...styles.btnSm, fontSize: 10, color: C.red }} onClick={() => deleteRisk(r.id)}>X</button>
                          </div>
                        )}
                      </div>
                      {r.description && <div style={{ fontSize: 12, color: C.t2, marginBottom: 6 }}>{r.description}</div>}
                      {r.mitigation && (
                        <div style={{ fontSize: 12, color: C.t2, background: C.bg, padding: '8px 12px', borderRadius: 6, marginBottom: 6 }}>
                          <span style={{ fontWeight: 600 }}>Mitigacao:</span> {r.mitigation}
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 12, color: C.t3 }}>
                        {r.owner_name && <span>Responsavel: {r.owner_name}</span>}
                        {r.status && isDiretor && (
                          <select style={{ ...styles.select, fontSize: 11, padding: '2px 6px' }} value={r.status}
                            onChange={e => saveRisk({ ...r, status: e.target.value })}>
                            <option value="aberto">Aberto</option>
                            <option value="mitigado">Mitigado</option>
                            <option value="fechado">Fechado</option>
                          </select>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ─── Orcamento ─── */}
        {detailTab === 'orcamento' && (
          <>
            {/* Summary */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
              {[
                { label: 'Investimento', value: fmtMoney(p.budget_planned), color: C.blue },
                { label: 'Arrecadacao', value: fmtMoney(p.budget_revenue), color: C.green },
                { label: 'Custo para Igreja', value: fmtMoney(p.budget_church_cost), color: C.amber },
              ].map(item => (
                <div key={item.label} style={{ ...styles.card, padding: 20, textAlign: 'center' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: C.t3, textTransform: 'uppercase', marginBottom: 6 }}>{item.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: item.color }}>{item.value}</div>
                </div>
              ))}
            </div>

            {/* Progress */}
            {p.budget_planned > 0 && (
              <div style={{ ...styles.card, padding: 20, marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: C.t2, marginBottom: 8 }}>
                  <span>Gasto: {fmtMoney(p.budget_spent)}</span>
                  <span>Planejado: {fmtMoney(p.budget_planned)}</span>
                </div>
                <div style={{ height: 10, background: C.border, borderRadius: 5 }}>
                  <div style={{ height: '100%', width: `${Math.min(((Number(p.budget_spent) || 0) / Number(p.budget_planned)) * 100, 100)}%`, borderRadius: 5, background: (Number(p.budget_spent) || 0) > Number(p.budget_planned) ? C.red : C.green, transition: 'width 0.3s' }} />
                </div>
                <div style={{ fontSize: 12, color: C.t3, marginTop: 6 }}>
                  {Math.round(((Number(p.budget_spent) || 0) / (Number(p.budget_planned) || 1)) * 100)}% utilizado
                </div>
              </div>
            )}

            {/* Items table */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Itens ({budgetItems.length})</div>
              {canEdit && <button style={{ ...styles.btn('primary'), ...styles.btnSm }} onClick={() => setModalBudget({})}>+ Item</button>}
            </div>
            {budgetItems.length === 0 ? <div style={styles.empty}>Nenhum item de orcamento. Adicione itens para acompanhar gastos.</div> : (
              <div style={styles.card}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Descricao</th>
                      <th style={styles.th}>Categoria</th>
                      <th style={styles.th}>Planejado</th>
                      <th style={styles.th}>Real</th>
                      <th style={styles.th}>Data</th>
                      {canEdit && <th style={styles.th}>Acoes</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {budgetItems.map(bi => {
                      const catLabel = BUDGET_CATEGORIES.find(c => c.value === bi.category)?.label || bi.category || '\u2014';
                      const catColor = bi.category === 'investimento' ? C.blue : bi.category === 'receita' ? C.green : C.amber;
                      return (
                        <tr key={bi.id}>
                          <td style={styles.td}>{bi.description}</td>
                          <td style={styles.td}><span style={styles.badge(catColor, catColor + '18')}>{catLabel}</span></td>
                          <td style={styles.td}>{fmtMoney(bi.planned_amount)}</td>
                          <td style={styles.td}>{fmtMoney(bi.actual_amount)}</td>
                          <td style={styles.td}>{fmtDate(bi.date)}</td>
                          {canEdit && (
                            <td style={styles.td}>
                              <div style={{ display: 'flex', gap: 4 }}>
                                <button style={{ ...styles.btn('ghost'), ...styles.btnSm, fontSize: 10 }} onClick={() => setModalBudget(bi)}>Editar</button>
                                <button style={{ ...styles.btn('ghost'), ...styles.btnSm, fontSize: 10, color: C.red }} onClick={() => deleteBudgetItem(bi.id)}>X</button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ─── Retrospectiva ─── */}
        {detailTab === 'retrospectiva' && (
          <>
            {/* Rating */}
            <div style={{ ...styles.card, padding: 20, marginBottom: 20, textAlign: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 12 }}>Avaliacao Geral</div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                {[1, 2, 3, 4, 5].map(star => (
                  <span key={star} onClick={() => setRetroForm(f => ({ ...f, rating: star }))}
                    style={{ fontSize: 32, cursor: 'pointer', color: star <= (retroForm.rating || 0) ? C.amber : C.t3, transition: 'color .15s' }}>
                    {'\u2605'}
                  </span>
                ))}
              </div>
              {retroForm.rating && <div style={{ fontSize: 13, color: C.t2, marginTop: 6 }}>{retroForm.rating}/5</div>}
            </div>

            {/* Textareas */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ ...styles.card, padding: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.green, marginBottom: 8 }}>O que deu certo</div>
                <textarea style={{ ...styles.input, minHeight: 80, resize: 'vertical' }}
                  value={retroForm.what_went_well || ''} onChange={e => setRetroForm(f => ({ ...f, what_went_well: e.target.value }))} />
              </div>
              <div style={{ ...styles.card, padding: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.amber, marginBottom: 8 }}>O que melhorar</div>
                <textarea style={{ ...styles.input, minHeight: 80, resize: 'vertical' }}
                  value={retroForm.what_to_improve || ''} onChange={e => setRetroForm(f => ({ ...f, what_to_improve: e.target.value }))} />
              </div>
              <div style={{ ...styles.card, padding: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.blue, marginBottom: 8 }}>Acoes</div>
                <textarea style={{ ...styles.input, minHeight: 80, resize: 'vertical' }}
                  value={retroForm.actions || ''} onChange={e => setRetroForm(f => ({ ...f, actions: e.target.value }))} />
              </div>
            </div>

            {/* Save button */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button style={styles.btn('primary')} onClick={saveRetrospective}>Salvar Retrospectiva</button>
            </div>
          </>
        )}

        <div style={{ height: 40 }} />
      </>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // MAIN RENDER
  // ═══════════════════════════════════════════════════════════
  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <div style={styles.title}>Projetos</div>
          <div style={styles.subtitle}>Planejamento e acompanhamento de 67 projetos estrategicos</div>
        </div>
        {canEdit && tab !== 4 && (
          <button style={styles.btn('primary')} onClick={() => setModalProject({})}>+ Novo Projeto</button>
        )}
      </div>

      {/* Tabs (hide Detail tab from bar) */}
      {tab !== 4 && (
        <div style={styles.tabs}>
          {TABS.map((t, i) => (
            <button key={t} style={styles.tab(tab === i)} onClick={() => setTab(i)}>{t}</button>
          ))}
        </div>
      )}

      {error && (
        <div style={{ background: C.redBg, color: C.red, padding: '10px 16px', borderRadius: 8, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
          <span>{error}</span>
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', color: C.red, cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>{'\u2715'}</button>
        </div>
      )}

      {tab === 0 && renderHome()}
      {tab === 1 && renderList()}
      {tab === 2 && renderKanban()}
      {tab === 3 && renderGantt()}
      {tab === 4 && renderDetail()}

      {/* ═══════════════════════════════════════════════════ */}
      {/* MODALS                                             */}
      {/* ═══════════════════════════════════════════════════ */}

      {/* Project Form Modal */}
      <ProjectFormModal open={!!modalProject} data={modalProject} categories={categories} onClose={() => setModalProject(null)} onSave={saveProject} isDiretor={canEdit} modalSaving={modalSaving} />

      {/* Task Form Modal */}
      <TaskFormModal open={!!modalTask} data={modalTask} milestones={detail?.milestones || []} usersList={usersList} onClose={() => setModalTask(null)} onSave={saveTask} modalSaving={modalSaving} />

      {/* Risk Form Modal */}
      <RiskFormModal open={!!modalRisk} data={modalRisk} onClose={() => setModalRisk(null)} onSave={saveRisk} modalSaving={modalSaving} />

      {/* KPI Form Modal */}
      <KpiFormModal open={!!modalKpi} data={modalKpi} onClose={() => setModalKpi(null)} onSave={saveKpi} modalSaving={modalSaving} />

      {/* Budget Item Form Modal */}
      <BudgetItemFormModal open={!!modalBudget} data={modalBudget} onClose={() => setModalBudget(null)} onSave={saveBudgetItem} modalSaving={modalSaving} />

      {/* Milestone Form Modal */}
      <MilestoneFormModal open={!!modalMilestone} data={modalMilestone} onClose={() => setModalMilestone(null)} onSave={saveMilestone} modalSaving={modalSaving} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MODALS
// ═══════════════════════════════════════════════════════════

function ProjectFormModal({ open, data, categories, onClose, onSave, isDiretor, modalSaving }) {
  const [form, setForm] = useState({});
  useEffect(() => { if (data) setForm({ status: 'no-prazo', priority: 'media', year: new Date().getFullYear(), ...data }); }, [data]);
  if (!open || !isDiretor) return null;
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const handleSave = () => {
    if (!form.name) { alert('Nome e obrigatorio'); return; }
    onSave(form);
  };
  return (
    <Modal open title={form.id ? 'Editar Projeto' : 'Novo Projeto'} onClose={onClose}
      footer={<><button style={styles.btn('ghost')} onClick={onClose}>Cancelar</button><button disabled={modalSaving} style={{ ...styles.btn('primary'), opacity: modalSaving ? 0.5 : 1 }} onClick={handleSave}>{modalSaving ? 'Salvando...' : 'Salvar'}</button></>}>
      <Input label="Nome *" value={form.name || ''} onChange={e => set('name', e.target.value)} />
      <div style={styles.formRow}>
        <Select label="Categoria" value={form.category_id || ''} onChange={e => set('category_id', e.target.value)}>
          <option value="">Selecione</option>
          {(categories || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Input label="Lider" value={form.leader || ''} onChange={e => set('leader', e.target.value)} />
      </div>
      <div style={styles.formRow}>
        <Input label="Responsavel" value={form.responsible || ''} onChange={e => set('responsible', e.target.value)} />
        <Input label="Area" value={form.area || ''} onChange={e => set('area', e.target.value)} />
      </div>
      <div style={styles.formRow}>
        <Input label="Ano" type="number" value={form.year || ''} onChange={e => set('year', e.target.value)} />
        <Input label="Frequencia" value={form.frequency || ''} onChange={e => set('frequency', e.target.value)} />
      </div>
      <div style={styles.formRow}>
        <Input label="Data Inicio" type="date" value={normDate(form.date_start) || ''} onChange={e => set('date_start', e.target.value)} />
        <Input label="Data Fim" type="date" value={normDate(form.date_end) || ''} onChange={e => set('date_end', e.target.value)} />
      </div>
      <div style={styles.formRow}>
        <Input label="Publico-alvo" value={form.public_target || ''} onChange={e => set('public_target', e.target.value)} />
        <Select label="Complexidade" value={form.complexity || ''} onChange={e => set('complexity', e.target.value)}>
          <option value="">Selecione</option>
          <option value="baixa">Baixa</option>
          <option value="media">Media</option>
          <option value="alta">Alta</option>
        </Select>
      </div>
      <div style={styles.formRow}>
        <Select label="Impacto" value={form.impact || ''} onChange={e => set('impact', e.target.value)}>
          <option value="">Selecione</option>
          <option value="baixo">Baixo</option>
          <option value="medio">Medio</option>
          <option value="alto">Alto</option>
        </Select>
        <Select label="Prioridade" value={form.priority || ''} onChange={e => set('priority', e.target.value)}>
          {Object.entries(PRIORITY_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </Select>
      </div>
      <div style={styles.formRow}>
        <Select label="Status" value={form.status || ''} onChange={e => set('status', e.target.value)}>
          {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </Select>
        <Select label="Ourico" value={form.ourico_test || ''} onChange={e => set('ourico_test', e.target.value)}>
          <option value="">Selecione</option>
          <option value="sim">Sim</option>
          <option value="nao">Nao</option>
        </Select>
      </div>
      <div style={styles.formRow}>
        <div style={styles.formGroup}>
          <label style={{ ...styles.label, display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={!!form.generates_unity} onChange={e => set('generates_unity', e.target.checked)} style={{ accentColor: C.primary }} />
            Gera Unidade?
          </label>
        </div>
        <div style={styles.formGroup}>
          <label style={{ ...styles.label, display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={!!form.collaborates_expansion} onChange={e => set('collaborates_expansion', e.target.checked)} style={{ accentColor: C.primary }} />
            Colabora com Expansao?
          </label>
        </div>
      </div>
      <div style={styles.formRow}>
        <Input label="Orcamento Planejado" type="number" step="0.01" value={form.budget_planned || ''} onChange={e => set('budget_planned', e.target.value)} />
        <Input label="Receita Prevista" type="number" step="0.01" value={form.budget_revenue || ''} onChange={e => set('budget_revenue', e.target.value)} />
      </div>
      <Input label="Custo para Igreja" type="number" step="0.01" value={form.budget_church_cost || ''} onChange={e => set('budget_church_cost', e.target.value)} />
      <Textarea label="Descricao" value={form.description || ''} onChange={e => set('description', e.target.value)} />
      <Textarea label="Notas" value={form.notes || ''} onChange={e => set('notes', e.target.value)} />

      {/* SWOT */}
      <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginTop: 12, marginBottom: 8 }}>Analise SWOT</div>
      <div style={styles.formRow}>
        <Textarea label="Forcas" value={form.swot_strengths || ''} onChange={e => set('swot_strengths', e.target.value)} />
        <Textarea label="Fraquezas" value={form.swot_weaknesses || ''} onChange={e => set('swot_weaknesses', e.target.value)} />
      </div>
      <div style={styles.formRow}>
        <Textarea label="Oportunidades" value={form.swot_opportunities || ''} onChange={e => set('swot_opportunities', e.target.value)} />
        <Textarea label="Ameacas" value={form.swot_threats || ''} onChange={e => set('swot_threats', e.target.value)} />
      </div>
    </Modal>
  );
}

function TaskFormModal({ open, data, milestones, usersList, onClose, onSave, modalSaving }) {
  const [form, setForm] = useState({});
  useEffect(() => { if (data) setForm({ status: 'pendente', priority: 'media', ...data }); }, [data]);
  if (!open) return null;
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const handleSave = () => {
    if (!form.name) { alert('Nome e obrigatorio'); return; }
    onSave(form);
  };
  return (
    <Modal open title={form.id ? 'Editar Tarefa' : 'Nova Tarefa'} onClose={onClose}
      footer={<><button style={styles.btn('ghost')} onClick={onClose}>Cancelar</button><button disabled={modalSaving} style={{ ...styles.btn('primary'), opacity: modalSaving ? 0.5 : 1 }} onClick={handleSave}>{modalSaving ? 'Salvando...' : 'Salvar'}</button></>}>
      <Input label="Nome *" value={form.name || ''} onChange={e => set('name', e.target.value)} />
      <div style={styles.formGroup}>
        <label style={styles.label}>Responsavel</label>
        <input style={styles.input} list="users-list-task" value={form.responsible || ''} onChange={e => set('responsible', e.target.value)} placeholder="Digite o nome..." />
        <datalist id="users-list-task">
          {usersList.map((u, i) => <option key={i} value={u.name || u.email} />)}
        </datalist>
      </div>
      {milestones && milestones.length > 0 && (
        <Select label="Marco" value={form.milestone_id || ''} onChange={e => set('milestone_id', e.target.value)}>
          <option value="">Nenhum</option>
          {milestones.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </Select>
      )}
      <div style={styles.formRow}>
        <Input label="Data Inicio" type="date" value={normDate(form.start_date) || ''} onChange={e => set('start_date', e.target.value)} />
        <Input label="Prazo" type="date" value={normDate(form.deadline) || ''} onChange={e => set('deadline', e.target.value)} />
      </div>
      <div style={styles.formRow}>
        <Select label="Status" value={form.status || ''} onChange={e => set('status', e.target.value)}>
          {Object.entries(TASK_STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </Select>
        <Select label="Prioridade" value={form.priority || ''} onChange={e => set('priority', e.target.value)}>
          {Object.entries(PRIORITY_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </Select>
      </div>
      <Textarea label="Descricao" value={form.description || ''} onChange={e => set('description', e.target.value)} />
    </Modal>
  );
}

function RiskFormModal({ open, data, onClose, onSave, modalSaving }) {
  const [form, setForm] = useState({});
  useEffect(() => { if (data) setForm({ probability: 1, impact: 1, ...data }); }, [data]);
  if (!open) return null;
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const handleSave = () => {
    if (!form.title) { alert('Titulo e obrigatorio'); return; }
    onSave(form);
  };
  return (
    <Modal open title={form.id ? 'Editar Risco' : 'Novo Risco'} onClose={onClose}
      footer={<><button style={styles.btn('ghost')} onClick={onClose}>Cancelar</button><button disabled={modalSaving} style={{ ...styles.btn('primary'), opacity: modalSaving ? 0.5 : 1 }} onClick={handleSave}>{modalSaving ? 'Salvando...' : 'Salvar'}</button></>}>
      <Input label="Titulo *" value={form.title || ''} onChange={e => set('title', e.target.value)} />
      <Textarea label="Descricao" value={form.description || ''} onChange={e => set('description', e.target.value)} />
      <div style={styles.formRow}>
        <Select label="Probabilidade (1-5)" value={form.probability || 1} onChange={e => set('probability', Number(e.target.value))}>
          {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
        </Select>
        <Select label="Impacto (1-5)" value={form.impact || 1} onChange={e => set('impact', Number(e.target.value))}>
          {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
        </Select>
      </div>
      <Textarea label="Mitigacao" value={form.mitigation || ''} onChange={e => set('mitigation', e.target.value)} />
      <Input label="Responsavel do Risco" value={form.owner_name || ''} onChange={e => set('owner_name', e.target.value)} />
    </Modal>
  );
}

function KpiFormModal({ open, data, onClose, onSave, modalSaving }) {
  const [form, setForm] = useState({});
  useEffect(() => { if (data) setForm({ ...data }); }, [data]);
  if (!open) return null;
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const handleSave = () => {
    if (!form.name) { alert('Nome e obrigatorio'); return; }
    onSave(form);
  };
  return (
    <Modal open title={form.id ? 'Editar KPI' : 'Novo KPI'} onClose={onClose}
      footer={<><button style={styles.btn('ghost')} onClick={onClose}>Cancelar</button><button disabled={modalSaving} style={{ ...styles.btn('primary'), opacity: modalSaving ? 0.5 : 1 }} onClick={handleSave}>{modalSaving ? 'Salvando...' : 'Salvar'}</button></>}>
      <Input label="Nome *" value={form.name || ''} onChange={e => set('name', e.target.value)} />
      <div style={styles.formRow}>
        <Input label="Valor Alvo" type="number" value={form.target_value || ''} onChange={e => set('target_value', e.target.value)} />
        <Input label="Unidade" value={form.unit || ''} onChange={e => set('unit', e.target.value)} placeholder="ex: pessoas, %" />
      </div>
      {form.id && (
        <Input label="Valor Atual" type="number" value={form.current_value || ''} onChange={e => set('current_value', e.target.value)} />
      )}
      <Input label="Instrumento de Medicao" value={form.instrument || ''} onChange={e => set('instrument', e.target.value)} />
    </Modal>
  );
}

function BudgetItemFormModal({ open, data, onClose, onSave, modalSaving }) {
  const [form, setForm] = useState({});
  useEffect(() => { if (data) setForm({ ...data }); }, [data]);
  if (!open) return null;
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const handleSave = () => {
    if (!form.description) { alert('Descricao e obrigatoria'); return; }
    onSave(form);
  };
  return (
    <Modal open title={form.id ? 'Editar Item' : 'Novo Item de Orcamento'} onClose={onClose}
      footer={<><button style={styles.btn('ghost')} onClick={onClose}>Cancelar</button><button disabled={modalSaving} style={{ ...styles.btn('primary'), opacity: modalSaving ? 0.5 : 1 }} onClick={handleSave}>{modalSaving ? 'Salvando...' : 'Salvar'}</button></>}>
      <Input label="Descricao *" value={form.description || ''} onChange={e => set('description', e.target.value)} />
      <Select label="Categoria" value={form.category || ''} onChange={e => set('category', e.target.value)}>
        <option value="">Selecione</option>
        {BUDGET_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
      </Select>
      <div style={styles.formRow}>
        <Input label="Valor Planejado" type="number" step="0.01" value={form.planned_amount || ''} onChange={e => set('planned_amount', e.target.value)} />
        <Input label="Valor Real" type="number" step="0.01" value={form.actual_amount || ''} onChange={e => set('actual_amount', e.target.value)} />
      </div>
      <Input label="Data" type="date" value={normDate(form.date) || ''} onChange={e => set('date', e.target.value)} />
    </Modal>
  );
}

function MilestoneFormModal({ open, data, onClose, onSave, modalSaving }) {
  const [form, setForm] = useState({});
  useEffect(() => { if (data) setForm({ ...data }); }, [data]);
  if (!open) return null;
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const handleSave = () => {
    if (!form.name) { alert('Nome e obrigatorio'); return; }
    onSave(form);
  };
  return (
    <Modal open title={form.id ? 'Editar Marco' : 'Novo Marco'} onClose={onClose}
      footer={<><button style={styles.btn('ghost')} onClick={onClose}>Cancelar</button><button disabled={modalSaving} style={{ ...styles.btn('primary'), opacity: modalSaving ? 0.5 : 1 }} onClick={handleSave}>{modalSaving ? 'Salvando...' : 'Salvar'}</button></>}>
      <Input label="Nome *" value={form.name || ''} onChange={e => set('name', e.target.value)} />
      <div style={styles.formRow}>
        <Input label="Data Inicio" type="date" value={normDate(form.date_start) || ''} onChange={e => set('date_start', e.target.value)} />
        <Input label="Data Fim" type="date" value={normDate(form.date_end) || ''} onChange={e => set('date_end', e.target.value)} />
      </div>
      <Textarea label="Descricao" value={form.description || ''} onChange={e => set('description', e.target.value)} />
    </Modal>
  );
}
