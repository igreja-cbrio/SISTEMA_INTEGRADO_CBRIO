import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { events, meetings, cycles as cyclesApi, occurrences as occApi, dashboard as dashApi, risks as risksApi, retrospective as retroApi, history as historyApi, users as usersApi, reports as reportsApi } from '../../api';
import { supabase } from '../../supabaseClient';
import { resolveApiBaseUrl } from '../../lib/api-base';
import CycleView from './components/CycleView';

const API = resolveApiBaseUrl(import.meta.env.VITE_API_URL);
import BudgetPanel from './components/BudgetPanel';
import { Button } from '../../components/ui/button';
import { Select as ShadSelect, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import CompletionSection from '../../components/CompletionSection';

// ── Tema ────────────────────────────────────────────────────
const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', primary: '#00B39D', primaryBg: '#00B39D20',
  text: 'var(--cbrio-text)', text2: 'var(--cbrio-text2)', text3: 'var(--cbrio-text3)',
  border: 'var(--cbrio-border)', green: '#10b981', greenBg: '#10b98120',
  red: '#ef4444', redBg: '#ef444420', amber: '#f59e0b', amberBg: '#f59e0b20',
  blue: '#3b82f6', blueBg: '#3b82f620',
};

const STATUS_MAP = {
  'no-prazo': { c: C.green, bg: C.greenBg, label: 'No Prazo' },
  'atencao': { c: C.amber, bg: C.amberBg, label: 'Atenção' },
  'atrasado': { c: C.red, bg: C.redBg, label: 'Atrasado' },
  'concluido': { c: C.blue, bg: C.blueBg, label: 'Concluído' },
};

const TASK_STATUS_MAP = {
  'pendente': { c: C.text3, bg: 'var(--cbrio-bg)', label: 'Pendente' },
  'em-andamento': { c: C.blue, bg: C.blueBg, label: 'Em Andamento' },
  'concluida': { c: C.green, bg: C.greenBg, label: 'Concluída' },
  'atrasada': { c: C.red, bg: C.redBg, label: 'Atrasada' },
};

const PRIORITY_MAP = {
  'alta': { c: C.red, bg: C.redBg, label: 'Alta' },
  'media': { c: C.amber, bg: C.amberBg, label: 'Média' },
  'baixa': { c: C.green, bg: C.greenBg, label: 'Baixa' },
};

// ── Estilos ─────────────────────────────────────────────────
const styles = {
  page: { maxWidth: 1200, margin: '0 auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 },
  title: { fontSize: 20, fontWeight: 700, color: C.text, letterSpacing: -0.5, lineHeight: 1.25 },
  subtitle: { fontSize: 14, color: C.text2, marginTop: 2, lineHeight: 1.5 },
  tabs: { display: 'flex', gap: 0, borderBottom: `2px solid ${C.border}`, marginBottom: 24 },
  tab: (active) => ({
    padding: '12px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none', background: 'none',
    color: active ? C.primary : C.text2,
    borderBottom: active ? `2px solid ${C.primary}` : '2px solid transparent',
    marginBottom: -2, transition: 'all 0.15s',
  }),
  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 24 },
  card: {
    background: C.card, borderRadius: 12, border: `1px solid ${C.border}`,
    boxShadow: '0 1px 2px rgba(0,0,0,0.05)', overflow: 'hidden',
  },
  cardHeader: { padding: 16, borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 14, fontWeight: 700, color: C.text },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { padding: '12px 16px', fontSize: 12, fontWeight: 700, color: C.text2, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'left', borderBottom: `1px solid ${C.border}`, background: 'var(--cbrio-table-header)' },
  td: { padding: '12px 16px', fontSize: 14, color: C.text, borderBottom: `1px solid ${C.border}`, lineHeight: 1.5 },
  badge: (color, bg) => ({
    display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
    color, background: bg,
  }),
  btn: (variant = 'primary') => ({
    padding: '8px 16px', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', border: 'none',
    transition: 'all 0.15s',
    ...(variant === 'primary' ? { background: C.primary, color: '#fff' } : {}),
    ...(variant === 'secondary' ? { background: 'transparent', color: C.primary, border: `1px solid ${C.primary}` } : {}),
    ...(variant === 'danger' ? { background: C.red, color: '#fff' } : {}),
    ...(variant === 'ghost' ? { background: 'transparent', color: C.text2, padding: '6px 12px' } : {}),
  }),
  btnSm: { padding: '4px 10px', fontSize: 12 },
  filterRow: { display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' },
  input: {
    padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 14,
    outline: 'none', width: '100%', transition: 'border 0.15s', background: 'var(--cbrio-input-bg)',
  },
  select: { padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 14, background: 'var(--cbrio-input-bg)', outline: 'none' },
  label: { fontSize: 12, fontWeight: 600, color: C.text2, marginBottom: 4, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5 },
  formGroup: { marginBottom: 14 },
  formRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  overlay: { position: 'fixed', inset: 0, background: 'var(--cbrio-overlay)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: 60, zIndex: 1000 },
  modal: { background: 'var(--cbrio-modal-bg)', borderRadius: 12, width: '95%', maxWidth: 560, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 16px 48px rgba(0,0,0,0.12)' },
  modalHeader: { padding: '20px 24px 12px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { fontSize: 18, fontWeight: 700, color: C.text },
  modalBody: { padding: '16px 24px 24px' },
  modalFooter: { padding: '12px 24px 20px', display: 'flex', gap: 8, justifyContent: 'flex-end' },
  empty: { textAlign: 'center', padding: 40, color: C.text3, fontSize: 14, lineHeight: 1.5 },
  clickRow: { cursor: 'pointer', transition: 'background 0.1s' },
  sectionTitle: { fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 12, marginTop: 24 },
  taskCard: {
    background: C.card, borderRadius: 10, border: `1px solid ${C.border}`, padding: '14px 18px',
    marginBottom: 10, boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
  },
  subtaskRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 14, color: C.text },
  commentBox: { background: 'var(--cbrio-table-header)', borderRadius: 8, padding: '8px 12px', marginTop: 6, fontSize: 12, color: C.text2 },
  dot: (color) => ({ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: color, marginRight: 6 }),
  backBtn: { background: 'none', border: 'none', cursor: 'pointer', color: C.primary, fontWeight: 600, fontSize: 13, padding: 0, marginBottom: 16 },
  inlineInput: { padding: '4px 8px', borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 12, outline: 'none', flex: 1 },
  inlineBtn: { padding: '4px 10px', borderRadius: 6, border: 'none', background: C.primary, color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' },
};

// ── Helpers ─────────────────────────────────────────────────
function normDate(d) { return d ? (typeof d === 'string' ? d.slice(0, 10) : '') : ''; }
const fmtDate = (d) => { const s = normDate(d); if (!s) return '—'; const [y, m, day] = s.split('-'); return `${day}/${m}/${y}`; };
const fmtMoney = (v) => v != null ? `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—';
function filterByHorizon(items, days, dateField = 'prazo') {
  if (!days) return items;
  const limit = new Date(); limit.setDate(limit.getDate() + days);
  return items.filter(t => { const d = normDate(t[dateField]); if (!d) return true; return new Date(d + 'T12:00:00') <= limit; });
}
function sortByUrgency(tasks) {
  return [...tasks].sort((a, b) => {
    const pa = normDate(a.prazo || a.deadline); const pb = normDate(b.prazo || b.deadline);
    if (!pa && !pb) return 0; if (!pa) return 1; if (!pb) return -1;
    return pa.localeCompare(pb);
  });
}

function DaysCounter({ date, status }) {
  const s = normDate(date);
  if (!s || status === 'concluido') return null;
  const diff = Math.ceil((new Date(s + 'T12:00:00') - new Date()) / 86400000);
  const color = diff < 0 ? C.red : diff <= 7 ? C.amber : C.green;
  const text = diff < 0 ? `${Math.abs(diff)}d atrás` : diff === 0 ? 'Hoje' : `${diff}d`;
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
          <Button variant="ghost" size="sm" onClick={onClose}>✕</Button>
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
      {label && <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">{label}</label>}
      <input className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm shadow-black/5 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" {...props} />
    </div>
  );
}

function Select({ label, children, ...props }) {
  return (
    <div style={styles.formGroup}>
      {label && <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">{label}</label>}
      <select className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm shadow-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" {...props}>{children}</select>
    </div>
  );
}

function FormSelect({ label, value, onChange, children, placeholder, style, ...props }) {
  return (
    <div style={{ ...styles.formGroup, ...style }}>
      {label && <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">{label}</label>}
      <ShadSelect value={value || ''} onValueChange={v => onChange && onChange({ target: { value: v } })} {...props}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder={placeholder || 'Selecione...'} />
        </SelectTrigger>
        <SelectContent>
          {children}
        </SelectContent>
      </ShadSelect>
    </div>
  );
}

function Textarea({ label, ...props }) {
  return (
    <div style={styles.formGroup}>
      {label && <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">{label}</label>}
      <textarea className="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm shadow-black/5 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" style={{ minHeight: 60, resize: 'vertical' }} {...props} />
    </div>
  );
}

function Badge({ status, map }) {
  const s = map[status] || { c: C.text3, bg: 'var(--cbrio-bg)', label: status || '—' };
  return <span style={styles.badge(s.c, s.bg)}>{s.label}</span>;
}

// ── Calendário interativo ───────────────────────────────────
const MONTH_NAMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const WEEK_DAYS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

function BigCalendar({ eventsByDate, onSelectDate, selectedDate }) {
  const [viewMonth, setViewMonth] = useState(() => {
    const d = selectedDate ? new Date(selectedDate + 'T12:00:00') : new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date().toISOString().slice(0, 10);

  const days = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);

  return (
    <div style={{ background: 'var(--cbrio-card)', borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: `1px solid ${C.border}` }}>
        <Button variant="ghost" size="sm" onClick={() => setViewMonth(new Date(year, month - 1, 1))}>‹</Button>
        <span style={{ fontWeight: 700, fontSize: 16, color: C.text }}>{MONTH_NAMES[month]} {year}</span>
        <Button variant="ghost" size="sm" onClick={() => setViewMonth(new Date(year, month + 1, 1))}>›</Button>
      </div>
      {/* Weekday headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: `1px solid ${C.border}` }}>
        {WEEK_DAYS.map(d => (
          <div key={d} style={{ padding: '8px 0', textAlign: 'center', fontSize: 11, fontWeight: 700, color: C.text3, textTransform: 'uppercase' }}>{d}</div>
        ))}
      </div>
      {/* Day cells */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
        {days.map((d, i) => {
          if (!d) return <div key={`e${i}`} style={{ minHeight: 80, borderRight: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }} />;
          const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          const evs = eventsByDate[ds] || [];
          const isToday = ds === today;
          const isSelected = ds === selectedDate;
          return (
            <div key={d} onClick={() => onSelectDate(ds)} style={{
              minHeight: 80, padding: '4px 6px', cursor: 'pointer', borderRight: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`,
              background: isSelected ? C.primaryBg : isToday ? 'var(--cbrio-table-header)' : 'var(--cbrio-card)',
              transition: 'background 0.1s',
            }}>
              <div style={{
                fontSize: 12, fontWeight: isToday ? 800 : 400, marginBottom: 4,
                color: isToday ? '#fff' : C.text,
                ...(isToday ? { background: C.primary, borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' } : {}),
              }}>
                {d}
              </div>
              {evs.slice(0, 3).map((ev, j) => {
                const st = STATUS_MAP[ev.status];
                return (
                  <div key={j} style={{
                    fontSize: 10, padding: '1px 4px', marginBottom: 2, borderRadius: 4, overflow: 'hidden',
                    whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                    background: ev.category_color ? `${ev.category_color}20` : C.primaryBg,
                    color: ev.category_color || C.primary,
                    borderLeft: `3px solid ${st?.c || C.text3}`,
                  }}>
                    {ev.name}
                  </div>
                );
              })}
              {evs.length > 3 && <div style={{ fontSize: 9, color: C.text3, fontWeight: 600 }}>+{evs.length - 3} mais</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── KPI Cards (estilo unificado) ─────────────────────────────
const EV_STAT_SVGS = [
  <svg key="e0" style={{ position: 'absolute', right: 0, top: 0, height: '100%', width: '67%', pointerEvents: 'none', zIndex: 0 }} viewBox="0 0 300 200" fill="none"><circle cx="220" cy="100" r="90" fill="#fff" fillOpacity="0.08" /><circle cx="260" cy="60" r="60" fill="#fff" fillOpacity="0.10" /></svg>,
  <svg key="e1" style={{ position: 'absolute', right: 0, top: 0, height: '100%', width: '67%', pointerEvents: 'none', zIndex: 0 }} viewBox="0 0 300 200" fill="none"><circle cx="200" cy="140" r="100" fill="#fff" fillOpacity="0.07" /><circle cx="270" cy="40" r="50" fill="#fff" fillOpacity="0.09" /></svg>,
  <svg key="e2" style={{ position: 'absolute', right: 0, top: 0, height: '100%', width: '67%', pointerEvents: 'none', zIndex: 0 }} viewBox="0 0 300 200" fill="none"><circle cx="240" cy="80" r="80" fill="#fff" fillOpacity="0.08" /><circle cx="280" cy="150" r="55" fill="#fff" fillOpacity="0.10" /></svg>,
  <svg key="e3" style={{ position: 'absolute', right: 0, top: 0, height: '100%', width: '67%', pointerEvents: 'none', zIndex: 0 }} viewBox="0 0 300 200" fill="none"><circle cx="210" cy="120" r="95" fill="#fff" fillOpacity="0.07" /><circle cx="265" cy="50" r="45" fill="#fff" fillOpacity="0.10" /></svg>,
  <svg key="e4" style={{ position: 'absolute', right: 0, top: 0, height: '100%', width: '67%', pointerEvents: 'none', zIndex: 0 }} viewBox="0 0 300 200" fill="none"><circle cx="230" cy="90" r="85" fill="#fff" fillOpacity="0.08" /><circle cx="270" cy="160" r="50" fill="#fff" fillOpacity="0.09" /></svg>,
  <svg key="e5" style={{ position: 'absolute', right: 0, top: 0, height: '100%', width: '67%', pointerEvents: 'none', zIndex: 0 }} viewBox="0 0 300 200" fill="none"><circle cx="200" cy="100" r="90" fill="#fff" fillOpacity="0.07" /><circle cx="260" cy="40" r="60" fill="#fff" fillOpacity="0.10" /></svg>,
  <svg key="e6" style={{ position: 'absolute', right: 0, top: 0, height: '100%', width: '67%', pointerEvents: 'none', zIndex: 0 }} viewBox="0 0 300 200" fill="none"><circle cx="220" cy="110" r="88" fill="#fff" fillOpacity="0.08" /><circle cx="275" cy="55" r="52" fill="#fff" fillOpacity="0.09" /></svg>,
];

function EvStatCard({ label, value, bg, svg }) {
  return (
    <div
      style={{ position: 'relative', overflow: 'hidden', background: bg, borderRadius: 12, padding: '20px 24px', color: '#fff', minHeight: 100, cursor: 'pointer', transition: 'transform 0.15s, box-shadow 0.15s' }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 25px rgba(0,0,0,0.3)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
    >
      {svg}
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.8)', marginBottom: 8 }}>{label}</div>
        <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: -1 }}>{value}</div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════
export default function Eventos() {
  const { profile, user, getAccessLevel, userAreas } = useAuth();
  const userRole = profile?.role || '';
  const userArea = profile?.area || '';
  const userId = user?.id || '';
  const accessLevel = getAccessLevel(['Agenda']);
  const isPMO = accessLevel >= 4;

  // URL params para drill-down (ex: /eventos?status=atrasado&id=xxx)
  const urlParams = new URLSearchParams(window.location.search);
  const urlStatus = urlParams.get('status') || '';
  const urlEventId = urlParams.get('id') || '';

  const [tab, setTab] = useState(urlStatus ? 1 : urlEventId ? 4 : 0); // 0=Home, 1=Lista, 2=Kanban, 3=Gantt, 4=Detail, 5=KPIs
  const [kpiData, setKpiData] = useState(null);
  const [kpiTipo, setKpiTipo] = useState('all');
  const [kpiEventDetail, setKpiEventDetail] = useState(null);
  const [kpiEventName, setKpiEventName] = useState('');
  const [kpiLoading, setKpiLoading] = useState(false);
  const [kpiConfigOpen, setKpiConfigOpen] = useState(false);
  const [kpiDocModal, setKpiDocModal] = useState(null); // { doc, resumo, loading }
  const scoreColor = (s) => s >= 80 ? '#10b981' : s >= 60 ? '#f59e0b' : s >= 40 ? '#ef4444' : '#6b7280';
  const [admTemplates, setAdmTemplates] = useState([]);
  const [admTemplatesLoaded, setAdmTemplatesLoaded] = useState(false);
  const [newTplForm, setNewTplForm] = useState({ area: '', etapa: '', titulo: '', offset_start: -30, offset_end: -15 });
  const [newSubName, setNewSubName] = useState('');
  const [expandedTpl, setExpandedTpl] = useState(null);
  const [kpiWeights, setKpiWeights] = useState([]);
  const [eventList, setEventList] = useState([]);
  const [categories, setCategories] = useState([]);
  const [dash, setDash] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Filtros
  const [filtroStatus, setFiltroStatus] = useState(urlStatus);
  const [filtroCategoria, setFiltroCategoria] = useState('');

  // PMO KPIs + workload
  const [pmoKpis, setPmoKpis] = useState(null);
  const [workload, setWorkload] = useState([]);

  // Lista melhorias
  const [hideDone, setHideDone] = useState(true);
  const [sortCol, setSortCol] = useState('date');
  const [sortAsc, setSortAsc] = useState(true);

  // Card expandido (clicável)
  const [expandedCard, setExpandedCard] = useState(null); // 'task-id', 'meeting-id', 'risk-id'

  // Riscos, retrospectiva, histórico do evento selecionado
  const [eventRisks, setEventRisks] = useState([]);
  const [retroData, setRetroData] = useState(null);
  const [auditHistory, setAuditHistory] = useState([]);
  const [showRetroForm, setShowRetroForm] = useState(false);
  const [showRiskForm, setShowRiskForm] = useState(false);

  // Kanban
  const [kanbanTasks, setKanbanTasks] = useState([]);
  const [kanbanFilter, setKanbanFilter] = useState('');
  const [kanbanLoading, setKanbanLoading] = useState(false);

  // Home / Calendário
  const [selectedDate, setSelectedDate] = useState(null);

  // Ocorrência expandida
  const [expandedOcc, setExpandedOcc] = useState(null);  // { ...occurrence, tasks, meetings }
  const [occTaskName, setOccTaskName] = useState('');
  const [occMeetingTitle, setOccMeetingTitle] = useState('');
  const [occMeetingDate, setOccMeetingDate] = useState('');

  // Ciclo criativo
  const [hasCycle, setHasCycle] = useState(false);
  const [detailTab, setDetailTab] = useState('info');

  // Modais
  const [modalEvent, setModalEvent] = useState(null);
  const [modalTask, setModalTask] = useState(null);

  // Inline inputs
  const [newSubtask, setNewSubtask] = useState({});
  const [newComment, setNewComment] = useState({});

  // People list for responsible picker
  const [usersList, setUsersList] = useState([]);

  // ── Loaders ──
  const loadCategories = useCallback(async () => {
    try { setCategories(await events.categories()); } catch (e) { console.error(e); }
  }, []);

  const loadDash = useCallback(async () => {
    try { setDash(await events.dashboard()); } catch (e) { console.error(e); }
  }, []);

  const loadEvents = useCallback(async () => {
    try {
      setLoading(true);
      const params = {};
      if (filtroStatus) params.status = filtroStatus;
      if (filtroCategoria) params.category_id = filtroCategoria;
      setEventList(await events.list(params));
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [filtroStatus, filtroCategoria]);

  const loadDetail = useCallback(async (id) => {
    try {
      setLoading(true);
      const ev = await events.get(id);
      setSelectedEvent(ev);
      setTab(4);
      setExpandedOcc(null);
      setExpandedCard(null);
      // Carregar riscos, retrospectiva, histórico
      risksApi.list(id).then(d => setEventRisks(d)).catch(() => setEventRisks([]));
      retroApi.get(id).then(d => setRetroData(d)).catch(() => setRetroData(null));
      historyApi.list(id).then(d => setAuditHistory(d)).catch(() => setAuditHistory([]));
      // Verificar se tem ciclo criativo
      try {
        const cycleData = await cyclesApi.get(id);
        const has = !!cycleData?.cycle;
        setHasCycle(has);
        setDetailTab(has ? 'reunioes' : 'tarefas');
      } catch {
        setHasCycle(false);
        setDetailTab('tarefas');
      }
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  const refreshDetail = useCallback(async () => {
    if (selectedEvent?.id) {
      try {
        setSelectedEvent(await events.get(selectedEvent.id));
      } catch (e) { console.error(e); }
    }
  }, [selectedEvent?.id]);

  useEffect(() => {
    loadCategories(); loadDash(); loadEvents();
    dashApi.pmo().then(d => setPmoKpis(d)).catch(() => {});
    dashApi.workload().then(d => setWorkload(d)).catch(() => {});
    usersApi.list().then(d => setUsersList(Array.isArray(d) ? d : [])).catch(() => setUsersList([]));
    // Abrir evento direto se veio via URL param
    if (urlEventId) loadDetail(urlEventId);
  }, []);
  useEffect(() => { loadEvents(); }, [filtroStatus, filtroCategoria]);

  // ── Event CRUD ──
  async function saveEvent(data) {
    try {
      const ativarCiclo = data.ativar_ciclo === 'true';
      delete data.ativar_ciclo;

      if (data.id) {
        // Se a data mudou, confirmar com o usuário (recalcula ciclo inteiro)
        if (selectedEvent?.date && data.date && selectedEvent.date !== data.date) {
          if (!window.confirm('Ao alterar a data do evento, todas as datas das fases e tarefas do ciclo criativo serão recalculadas automaticamente. Deseja continuar?')) return;
        }
        await events.update(data.id, data);
        // Ativar ciclo no editar se marcado e evento ainda não tem
        if (ativarCiclo && !hasCycle) {
          try { await cyclesApi.activate(data.id); setHasCycle(true); } catch(e) { console.error('Erro ao ativar ciclo:', e.message); }
        }
      } else {
        const created = await events.create(data);
        if (ativarCiclo && created?.id) {
          try { await cyclesApi.activate(created.id); } catch(e) { console.error('Erro ao ativar ciclo:', e.message); }
        }
      }
      setModalEvent(null);
      loadEvents();
      loadDash();
      if (data.id && selectedEvent?.id === data.id) refreshDetail();
    } catch (e) { setError(e.message); }
  }

  async function toggleEventStatus(id, currentStatus) {
    const newStatus = currentStatus === 'concluido' ? 'reabrir' : 'concluido';
    const label = newStatus === 'concluido' ? 'finalizar' : 'reabrir';
    if (!window.confirm(`Deseja ${label} este evento?`)) return;
    try {
      await events.updateStatus(id, newStatus);
      loadEvents();
      if (selectedEvent?.id === id) refreshDetail();
    } catch (e) { setError(e.message); }
  }

  async function deleteEvent(id) {
    if (!window.confirm('Excluir este evento?')) return;
    try {
      await events.remove(id);
      setSelectedEvent(null);
      setTab(1);
      loadEvents();
      loadDash();
    } catch (e) { setError(e.message); }
  }

  // ── Task CRUD ──
  async function saveTask(data) {
    try {
      if (data.id) {
        await events.updateTask(data.id, data);
      } else {
        await events.createTask(selectedEvent.id, data);
      }
      setModalTask(null);
      setExpandedCard(null);
      refreshDetail();
    } catch (e) { setError(e.message); }
  }

  async function deleteTask(taskId) {
    if (!window.confirm('Excluir esta tarefa?')) return;
    try {
      await events.removeTask(taskId);
      setExpandedCard(null);
      refreshDetail();
    } catch (e) { setError(e.message); }
  }

  async function changeTaskStatus(taskId, status) {
    try {
      await events.updateTaskStatus(taskId, status);
      refreshDetail();
    } catch (e) { setError(e.message); }
  }

  // ── Subtask ──
  async function addSubtask(taskId) {
    const name = (newSubtask[taskId] || '').trim();
    if (!name) return;
    try {
      await events.createSubtask(taskId, { name });
      setNewSubtask(prev => ({ ...prev, [taskId]: '' }));
      refreshDetail();
    } catch (e) { setError(e.message); }
  }

  async function toggleSubtask(subId, done) {
    try {
      await events.toggleSubtask(subId, done);
      refreshDetail();
    } catch (e) { setError(e.message); }
  }

  async function deleteSubtask(subId) {
    try {
      await events.removeSubtask(subId);
      refreshDetail();
    } catch (e) { setError(e.message); }
  }

  // ── Comment ──
  async function addComment(taskId) {
    const text = (newComment[taskId] || '').trim();
    if (!text) return;
    try {
      await events.addComment(taskId, text);
      setNewComment(prev => ({ ...prev, [taskId]: '' }));
      refreshDetail();
    } catch (e) { setError(e.message); }
  }

  // ── Occurrence helpers ──
  async function loadOccurrence(occId) {
    try {
      const data = await occApi.get(occId);
      setExpandedOcc(data);
    } catch (e) { console.error(e); }
  }

  async function addOccTask(occId) {
    if (!occTaskName.trim()) return;
    try {
      await occApi.createTask(occId, { name: occTaskName });
      setOccTaskName('');
      loadOccurrence(occId);
    } catch (e) { setError(e.message); }
  }

  async function changeOccTaskStatus(taskId, status, occId) {
    try { await occApi.updateTaskStatus(taskId, status); loadOccurrence(occId); }
    catch (e) { setError(e.message); }
  }

  async function deleteOccTask(taskId, occId) {
    try { await occApi.removeTask(taskId); loadOccurrence(occId); }
    catch (e) { setError(e.message); }
  }

  async function addOccMeeting(occId) {
    if (!occMeetingTitle.trim() || !occMeetingDate) return;
    try {
      await occApi.createMeeting(occId, { title: occMeetingTitle, date: occMeetingDate });
      setOccMeetingTitle(''); setOccMeetingDate('');
      loadOccurrence(occId);
    } catch (e) { setError(e.message); }
  }

  async function toggleOccPendency(pId, done, occId) {
    try { await occApi.togglePendency(pId, !done); loadOccurrence(occId); }
    catch (e) { setError(e.message); }
  }

  // ── Category helpers ──
  const catMap = {};
  (categories || []).forEach(c => { catMap[c.id] = c; });
  const getCatColor = (catId) => catMap[catId]?.color || C.text3;
  const getCatName = (catId) => catMap[catId]?.name || '—';

  // ── EventsByDate (para calendário) ──
  const eventsByDate = {};
  (eventList || []).forEach(ev => {
    const d = normDate(ev.date);
    if (d) { if (!eventsByDate[d]) eventsByDate[d] = []; eventsByDate[d].push(ev); }
    (ev.occurrence_dates || []).forEach(od => {
      const odn = normDate(od);
      if (odn && odn !== d) { if (!eventsByDate[odn]) eventsByDate[odn] = []; eventsByDate[odn].push(ev); }
    });
  });

  // ── Eventos do dia selecionado ──
  const selectedDayEvents = selectedDate ? (eventsByDate[selectedDate] || []) : [];

  // ── Dashboard KPIs (PMO real + contagem local) ──
  const counts = { total: (eventList || []).length, 'no-prazo': 0, 'em-risco': 0, 'atrasado': 0, 'concluido': 0 };
  eventList.forEach(e => { if (counts[e.status] !== undefined) counts[e.status]++; });
  const k = pmoKpis || {};
  // Helper: navegar do KPI para a Lista com filtro de status
  const kpiDrillDown = (status) => {
    setFiltroStatus(status || '');
    setHideDone(status !== 'concluido');
    setTab(1); // Lista
  };
  const kpis = [
    { label: 'Eventos', value: counts.total, color: C.primary, action: () => kpiDrillDown('') },
    { label: 'No Prazo', value: counts['no-prazo'], color: C.green, action: () => kpiDrillDown('no-prazo') },
    { label: 'Em Risco', value: counts['em-risco'], color: C.amber, action: () => kpiDrillDown('em-risco') },
    { label: 'Atrasados', value: counts['atrasado'], color: C.red, action: () => kpiDrillDown('atrasado') },
    { label: 'Concluídos', value: counts['concluido'], color: C.blue, action: () => kpiDrillDown('concluido') },
    { label: 'Próx. 7 dias', value: k.events_next_7d || 0, color: '#8b5cf6', action: () => kpiDrillDown('') },
    { label: 'Tarefas abertas', value: k.tasks_open || 0, color: '#6b7280', action: () => { setTab(2); } },
    { label: 'Tarefas atrasadas', value: k.tasks_overdue || 0, color: C.red, action: () => { setTab(2); } },
    { label: 'Riscos abertos', value: k.risks_open || 0, color: '#f59e0b', action: () => { setTab(2); } },
    { label: 'Sem responsável', value: k.events_no_owner || 0, color: '#9ca3af', action: () => kpiDrillDown('') },
  ];

  // ── Relatório IA (modal no kanban)
  const [reportModal, setReportModal] = useState(null); // null | { step: 'event' | 'scope' | 'phase' | 'generating' | 'done', eventId, eventName, type, phaseName, result, error }

  // ── Kanban (dois níveis)
  const isLider = !isPMO && accessLevel >= 3;
  // Líderes: visão PMO filtrada pela area deles. PMO: visão completa.
  const [kanbanViewMode, setKanbanViewMode] = useState('pmo');
  const defaultArea = isLider && userAreas.length > 0 ? userAreas[0].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') : 'all';
  const [kanbanArea, setKanbanArea] = useState(defaultArea);
  const [kanbanHorizon, setKanbanHorizon] = useState(0);
  const [kanbanSelectedTask, setKanbanSelectedTask] = useState(null);
  const [kanbanCycleData, setKanbanCycleData] = useState(null);
  const [kanbanPhase, setKanbanPhase] = useState(null);
  const [kanbanEvent, setKanbanEvent] = useState('all');
  const [showKanbanNewTask, setShowKanbanNewTask] = useState(false);
  const [kanbanNewTaskSubs, setKanbanNewTaskSubs] = useState([]);
  const [newTaskEventId, setNewTaskEventId] = useState('');

  async function loadKanban() {
    setKanbanLoading(true);
    try {
      const data = await cyclesApi.kanbanAll();
      setKanbanCycleData(data);
      // Auto-selecionar primeira fase não concluída
      if (data?.phases?.length > 0 && !kanbanPhase) {
        const first = data.phases.find(p => p.status !== 'concluida') || data.phases[0];
        setKanbanPhase(first.numero_fase);
      }
    } catch (e) { console.error(e); }
    finally { setKanbanLoading(false); }
  }

  // ═══════════════════════════════════════════════════════════
  // RENDER — KANBAN (dois níveis: fases + kanban por fase)
  // ═══════════════════════════════════════════════════════════
  async function loadKpis(tipo) {
    setKpiLoading(true);
    try {
      const params = tipo && tipo !== 'all' ? { tipo } : {};
      const data = await cyclesApi.kpiCross(params);
      setKpiData(data);
    } catch (e) { console.error('KPI:', e); }
    finally { setKpiLoading(false); }
  }

  async function loadKpiEventDetail(eventId) {
    try {
      const data = await cyclesApi.kpiEvento(eventId);
      setKpiEventDetail(data);
    } catch (e) { console.error('KPI evento:', e); }
  }

  function renderKPIs() {
    const d = kpiData;
    const CAT_COLORS = { marketing: '#00B39D', producao: '#6366f1', compras: '#3b82f6', financeiro: '#10b981', manutencao: '#f59e0b', limpeza: '#8b5cf6', cozinha: '#ec4899', adm: '#0ea5e9' };
    const CAT_LABELS = { marketing: 'Marketing', producao: 'Producao', compras: 'Compras', financeiro: 'Financeiro', manutencao: 'Manutencao', limpeza: 'Limpeza', cozinha: 'Cozinha', adm: 'Administrativo' };
    // scoreColor movido para nivel do componente

    const ScoreLegend = () => (
      <div style={{ display: 'flex', gap: 12, padding: '10px 16px', background: C.bg, borderRadius: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center', border: `1px solid ${C.border}` }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: C.t2 }}>Score =</span>
        {[
          { label: 'Prazo', pts: 40, color: '#3b82f6', icon: '\u23f0' },
          { label: 'Aprovacao', pts: 30, color: '#10b981', icon: '\u2705' },
          { label: 'Qualidade', pts: 20, color: '#f59e0b', icon: '\u2b50' },
          { label: 'Arquivo', pts: 10, color: '#8b5cf6', icon: '\ud83d\udcce' },
        ].map((s, i) => (
          <span key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {i > 0 && <span style={{ color: C.t3, fontSize: 11 }}>+</span>}
            <span style={{ fontSize: 12 }}>{s.icon}</span>
            <span style={{ fontSize: 11, color: s.color, fontWeight: 600 }}>{s.label} ({s.pts}%)</span>
          </span>
        ))}
      </div>
    );

    const BreakdownBar = ({ label, icon, value, max, count, total }) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: 11, width: 14 }}>{icon}</span>
        <span style={{ fontSize: 10, color: C.t3, width: 65 }}>{label}</span>
        <div style={{ flex: 1, height: 5, background: C.border, borderRadius: 3 }}>
          <div style={{ height: '100%', borderRadius: 3, width: total > 0 ? `${(count / total) * 100}%` : '0%', background: count === total && total > 0 ? '#10b981' : count > 0 ? '#f59e0b' : C.border, transition: 'width 0.3s' }} />
        </div>
        <span style={{ fontSize: 10, fontWeight: 600, color: count === total && total > 0 ? '#10b981' : count > 0 ? C.t2 : C.t3, width: 45, textAlign: 'right' }}>{count}/{total}</span>
      </div>
    );

    // Detalhe de um evento
    if (kpiEventDetail) {
      const ev = kpiEventDetail;
      const kpiVal = ev.kpi_evento?.kpi_evento || 0;
      return (
        <div>
          <button onClick={() => setKpiEventDetail(null)} style={{ background: 'none', border: 'none', color: C.primary, cursor: 'pointer', fontSize: 13, fontWeight: 600, marginBottom: 16 }}>{'\u2190'} Voltar ao ranking</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: `conic-gradient(${scoreColor(kpiVal)} ${kpiVal * 3.6}deg, var(--cbrio-border) 0deg)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: C.card, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, color: scoreColor(kpiVal) }}>{kpiVal}</div>
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>{kpiEventName || 'Evento'}</div>
              <div style={{ fontSize: 12, color: C.t3 }}>{kpiVal}% score | {ev.kpi_evento?.total_docs || 0} documentos | {ev.kpi_evento?.total_areas || 0} areas</div>
            </div>
          </div>

          <ScoreLegend />

          {/* KPI por area com breakdown */}
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 10 }}>Performance por Area</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12, marginBottom: 20 }}>
            {(ev.kpi_areas || []).map(a => {
              const b = a.breakdown || {};
              return (
                <div key={a.area} style={{ background: C.card, borderRadius: 12, padding: 16, border: `1px solid ${C.border}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: CAT_COLORS[a.area] || C.t3 }} />
                      <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{CAT_LABELS[a.area] || a.area}</span>
                    </div>
                    <span style={{ fontSize: 20, fontWeight: 800, color: scoreColor(a.kpi_area) }}>{a.kpi_area || 0}%</span>
                  </div>
                  <BreakdownBar label="Prazo" icon={'\u23f0'} value={b.score_prazo || 0} max={b.total * 40} count={b.no_prazo || 0} total={b.total || 0} />
                  <BreakdownBar label="Aprovacao" icon={'\u2705'} value={b.score_aprovacao || 0} max={b.total * 30} count={b.aprovados || 0} total={b.total || 0} />
                  <BreakdownBar label="Qualidade" icon={'\u2b50'} value={b.score_qualidade || 0} max={b.total * 20} count={b.qualidade_ok || 0} total={b.total || 0} />
                  <BreakdownBar label="Arquivo" icon={'\ud83d\udcce'} value={b.score_arquivo || 0} max={b.total * 10} count={b.com_arquivo || 0} total={b.total || 0} />
                  <div style={{ fontSize: 10, color: C.t3, marginTop: 6, paddingTop: 6, borderTop: `1px solid ${C.border}` }}>{a.docs_ok}/{a.total_docs} entregues | {a.docs_atrasados} atrasados | {a.docs_pendentes} pendentes</div>
                </div>
              );
            })}
          </div>

          {/* Documentos individuais */}
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 10 }}>Documentos ({(ev.documentos || []).length})</div>
          <div style={{ background: C.card, borderRadius: 10, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
            {(ev.documentos || []).length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: C.t3, fontSize: 13 }}>Nenhum documento registrado</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr style={{ background: 'var(--cbrio-table-header)' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: C.t3, textTransform: 'uppercase' }}>Documento</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: C.t3, textTransform: 'uppercase' }}>Area</th>
                  <th style={{ padding: '8px 12px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: C.t3, textTransform: 'uppercase' }}>Prazo</th>
                  <th style={{ padding: '8px 12px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: C.t3, textTransform: 'uppercase' }}>Qualidade</th>
                  <th style={{ padding: '8px 12px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: C.t3, textTransform: 'uppercase' }}>Aprovado</th>
                  <th style={{ padding: '8px 12px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: C.t3, textTransform: 'uppercase' }}>Arquivo</th>
                  <th style={{ padding: '8px 12px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: C.t3, textTransform: 'uppercase' }}>Score</th>
                  <th style={{ padding: '8px 12px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: C.t3, textTransform: 'uppercase' }}>Acoes</th>
                </tr></thead>
                <tbody>
                  {(ev.documentos || []).map(doc => {
                    const prazoFase = doc.prazo_fase;
                    const entregue = doc.status === 'concluida';
                    const onTime = doc.on_time != null ? doc.on_time : (entregue && prazoFase ? new Date(doc.delivered_at || doc.updated_at || Date.now()) <= new Date(prazoFase + 'T23:59:59') : null);
                    const prazoPassou = prazoFase && !entregue && new Date(prazoFase) < new Date();
                    return (
                      <tr key={doc.id} onClick={async () => { setKpiDocModal({ doc, resumo: null, loading: true }); try { const r = await cyclesApi.docResumo(doc.id); setKpiDocModal({ doc, ...r, loading: false }); } catch { setKpiDocModal(m => ({ ...m, loading: false })); } }} style={{ borderBottom: `1px solid ${C.border}`, cursor: 'pointer' }}
                        onMouseEnter={e => e.currentTarget.style.background = C.bg} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 600, color: C.text }}>{doc.card_titulo}{doc.is_critical && <span style={{ fontSize: 9, marginLeft: 6, padding: '1px 5px', borderRadius: 99, background: '#ef444420', color: '#ef4444' }}>critico</span>}</td>
                        <td style={{ padding: '10px 12px' }}><span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: (CAT_COLORS[doc.area] || '#9ca3af') + '20', color: CAT_COLORS[doc.area] || '#9ca3af', fontWeight: 500 }}>{CAT_LABELS[doc.area] || doc.area}</span></td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          {entregue ? (
                            onTime ? <span style={{ fontSize: 11, fontWeight: 600, color: '#10b981' }}>No prazo</span> : <span style={{ fontSize: 11, fontWeight: 600, color: '#ef4444' }}>Atrasado</span>
                          ) : prazoPassou ? (
                            <span style={{ fontSize: 11, fontWeight: 600, color: '#ef4444' }}>Vencido</span>
                          ) : prazoFase ? (
                            <span style={{ fontSize: 11, color: C.t3 }}>{fmtDate(prazoFase)}</span>
                          ) : <span style={{ color: C.t3 }}>-</span>}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          {doc.approved_by && doc.quality_rating === 'ok' ? (
                            <span style={{ fontSize: 11, color: '#10b981', fontWeight: 600 }}>OK</span>
                          ) : doc.quality_rating === 'incompleto' ? (
                            <span style={{ fontSize: 11, color: '#f59e0b', fontWeight: 600 }}>Incompleto</span>
                          ) : doc.quality_rating === 'reprovado' ? (
                            <span style={{ fontSize: 11, color: '#ef4444', fontWeight: 600 }}>Reprovado</span>
                          ) : (
                            <span style={{ fontSize: 11, color: C.t3 }}>-</span>
                          )}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>{doc.approved_by ? <span style={{ color: '#10b981' }}>Sim</span> : <span style={{ color: C.t3 }}>-</span>}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>{doc.file_name ? <span style={{ color: '#10b981' }}>Sim</span> : <span style={{ color: C.t3 }}>-</span>}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 800, color: scoreColor(doc.score || 0) }}>{doc.score || 0}%</td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'wrap' }}>
                            {doc.approved_by ? (
                              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: '#10b98120', color: '#10b981', fontWeight: 600 }}>Aprovado</span>
                            ) : (
                              <>
                                <button onClick={async (e) => { e.stopPropagation(); e.preventDefault(); try { await cyclesApi.approveCard(doc.id); await cyclesApi.qualityCard(doc.id, 'ok'); } catch {} loadKpiEventDetail(doc.event_id); }} style={{ padding: '3px 8px', fontSize: 10, borderRadius: 4, border: 'none', background: '#10b98120', color: '#10b981', cursor: 'pointer', fontWeight: 600 }}>Aprovar</button>
                                <button onClick={async (e) => { e.stopPropagation(); e.preventDefault(); try { await cyclesApi.qualityCard(doc.id, 'incompleto'); } catch {} loadKpiEventDetail(doc.event_id); }} style={{ padding: '3px 8px', fontSize: 10, borderRadius: 4, border: 'none', background: '#f59e0b20', color: '#f59e0b', cursor: 'pointer', fontWeight: 600 }}>Incompleto</button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      );
    }

    // Cross-eventos
    return (
      <div>
        {/* Filtro + Config */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
          {['all', 'serie', 'evento'].map(t => (
            <button key={t} onClick={() => { setKpiTipo(t); loadKpis(t); }} style={{
              padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: kpiTipo === t ? 700 : 400, cursor: 'pointer',
              border: kpiTipo === t ? `2px solid ${C.primary}` : `1px solid ${C.border}`,
              background: kpiTipo === t ? C.primaryBg : 'transparent', color: kpiTipo === t ? C.primary : C.t3,
            }}>{t === 'all' ? 'Todos' : t === 'serie' ? 'Series' : 'Eventos'}</button>
          ))}
          {accessLevel >= 5 && (
            <button onClick={async () => {
              const w = await cyclesApi.kpiAreaWeights();
              setKpiWeights(w || []); setKpiConfigOpen(true);
            }} style={{ marginLeft: 'auto', padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, border: `1px solid ${C.border}`, background: 'transparent', color: C.t3, cursor: 'pointer' }}>
              Configurar Pesos
            </button>
          )}
        </div>

        <ScoreLegend />

        {kpiLoading ? (
          <div style={{ padding: 40, textAlign: 'center', color: C.t3 }}>Carregando KPIs...</div>
        ) : !d ? (
          <div style={{ padding: 40, textAlign: 'center', color: C.t3 }}>Clique em um filtro para carregar</div>
        ) : (
          <>
            {/* KPI Medio */}
            <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
              <div style={{ background: C.card, borderRadius: 14, padding: 20, border: `1px solid ${C.border}`, flex: '1 1 200px', textAlign: 'center' }}>
                <div style={{ fontSize: 40, fontWeight: 800, color: scoreColor(d.kpi_medio) }}>{d.kpi_medio}</div>
                <div style={{ fontSize: 13, color: C.t3 }}>KPI Medio Institucional</div>
                <div style={{ fontSize: 11, color: C.t3, marginTop: 4 }}>{d.eventos?.length || 0} eventos com ciclo criativo</div>
              </div>

              {/* Top 3 areas */}
              {(d.ranking_areas || []).slice(0, 3).map((a, i) => (
                <div key={a.area} style={{ background: C.card, borderRadius: 14, padding: 16, border: `1px solid ${C.border}`, flex: '1 1 150px' }}>
                  <div style={{ fontSize: 10, color: C.t3, textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>{i === 0 ? 'Melhor area' : `#${i + 1}`}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: CAT_COLORS[a.area] || C.text }}>{CAT_LABELS[a.area] || a.area}</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: scoreColor(a.kpi) }}>{a.kpi}</div>
                  <div style={{ fontSize: 10, color: C.t3 }}>{a.docs_ok}/{a.total_docs} docs OK</div>
                </div>
              ))}
            </div>

            {/* Ranking de areas */}
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 10 }}>Ranking de Areas</div>
            <div style={{ background: C.card, borderRadius: 10, border: `1px solid ${C.border}`, marginBottom: 24, overflow: 'hidden' }}>
              {(d.ranking_areas || []).map((a, i) => (
                <div key={a.area} style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 16, fontWeight: 800, color: C.t3, width: 24 }}>{i + 1}</span>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: CAT_COLORS[a.area] || C.t3, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.text, flex: 1 }}>{CAT_LABELS[a.area] || a.area}</span>
                  <div style={{ width: 120, height: 6, background: C.border, borderRadius: 3 }}>
                    <div style={{ height: '100%', borderRadius: 3, width: `${a.kpi}%`, background: scoreColor(a.kpi), transition: 'width 0.3s' }} />
                  </div>
                  <span style={{ fontSize: 16, fontWeight: 800, color: scoreColor(a.kpi), width: 50, textAlign: 'right' }}>{a.kpi}%</span>
                </div>
              ))}
              {(d.ranking_areas || []).length === 0 && <div style={{ padding: 24, textAlign: 'center', color: C.t3, fontSize: 13 }}>Nenhum dado de KPI ainda</div>}
            </div>

            {/* Eventos */}
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 10 }}>Eventos ({(d.eventos || []).length})</div>
            <div style={{ background: C.card, borderRadius: 10, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
              {(d.eventos || []).length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: C.t3, fontSize: 13 }}>Nenhum evento com ciclo criativo encontrado</div>
              ) : (d.eventos || []).sort((a, b) => (b.kpi_evento || 0) - (a.kpi_evento || 0)).map(ev => (
                <div key={ev.event_id} onClick={() => { setKpiEventName(ev.event_name); loadKpiEventDetail(ev.event_id); }} style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = C.bg} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{ev.event_name}</div>
                    <div style={{ fontSize: 11, color: C.t3, display: 'flex', gap: 8, marginTop: 2 }}>
                      <span>{ev.category}</span>
                      <span>{fmtDate(ev.date)}</span>
                      <span>{ev.total_docs || 0} docs | {ev.docs_ok || 0} OK | {ev.docs_atrasados || 0} atrasados</span>
                    </div>
                  </div>
                  <div style={{ width: 80, height: 6, background: C.border, borderRadius: 3 }}>
                    <div style={{ height: '100%', borderRadius: 3, width: `${ev.kpi_evento || 0}%`, background: scoreColor(ev.kpi_evento || 0), transition: 'width 0.3s' }} />
                  </div>
                  <span style={{ fontSize: 20, fontWeight: 800, color: scoreColor(ev.kpi_evento || 0), width: 50, textAlign: 'right' }}>{ev.kpi_evento || 0}%</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  function renderKpiConfig() {
    if (!kpiConfigOpen) return null;
    const CAT_LABELS = { marketing: 'Marketing', producao: 'Producao', compras: 'Compras', financeiro: 'Financeiro', manutencao: 'Manutencao', limpeza: 'Limpeza', cozinha: 'Cozinha', adm: 'Administrativo' };
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)' }}>
        <div style={{ background: 'var(--cbrio-modal-bg)', borderRadius: 16, padding: 24, maxWidth: 500, width: '90%', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Pesos de Area por Categoria</span>
            <button onClick={() => setKpiConfigOpen(false)} style={{ background: 'none', border: 'none', fontSize: 18, color: C.t3, cursor: 'pointer' }}>{'\u2715'}</button>
          </div>
          <div style={{ fontSize: 12, color: C.t3, marginBottom: 12 }}>
            Defina a importancia de cada area no calculo do KPI. Producao com peso 3 vale 3x mais que uma area com peso 1.
          </div>
          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            {(kpiWeights || []).map(w => (
              <div key={w.id} style={{ padding: '8px 12px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                <span style={{ color: C.t3, width: 120, flexShrink: 0, fontSize: 12 }}>{w.event_categories?.name || '-'}</span>
                <span style={{ color: C.text, flex: 1, fontWeight: 500 }}>{CAT_LABELS[w.area] || w.area}</span>
                <input type="number" min="0" max="10" step="1" value={w.weight} onChange={async (e) => {
                  const val = parseFloat(e.target.value) || 1;
                  setKpiWeights(prev => (prev || []).map(x => x.id === w.id ? { ...x, weight: val } : x));
                  await cyclesApi.updateAreaWeight(w.id, val);
                }} style={{ width: 50, padding: 6, borderRadius: 6, border: `1px solid ${C.border}`, background: C.card, color: C.text, fontSize: 13, textAlign: 'center' }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  function renderTemplates() {
    const AREAS = ['marketing', 'producao', 'compras', 'financeiro', 'manutencao', 'limpeza', 'cozinha', 'adm'];
    const CAT_LABELS = { marketing: 'Marketing', producao: 'Producao', compras: 'Compras', financeiro: 'Financeiro', manutencao: 'Manutencao', limpeza: 'Limpeza', cozinha: 'Cozinha', adm: 'Administrativo' };
    const CAT_COLORS = { marketing: '#00B39D', producao: '#6366f1', compras: '#3b82f6', financeiro: '#10b981', manutencao: '#f59e0b', limpeza: '#8b5cf6', cozinha: '#ec4899', adm: '#0ea5e9' };
    const cardStyle = { background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden' };

    // Fases com seus offsets (do cycle_phase_templates)
    const FASES = [
      { nome: 'Pré Briefing', etapas: ['Pré-Briefing'], offset: '-92 a -85 dias' },
      { nome: 'Briefing', etapas: ['Briefing'], offset: '-85 a -78 dias' },
      { nome: 'Brainstorming e Conceito', etapas: ['Brainstorming e Conceito'], offset: '-78 a -64 dias' },
      { nome: 'Identidade e Estratégia', etapas: ['Identidade e Estratégia'], offset: '-64 a -50 dias' },
      { nome: 'Aprovação', etapas: ['Aprovação'], offset: '-50 a -43 dias' },
      { nome: 'Execução Estratégica', etapas: ['Execução Estratégica'], offset: '-43 a -29 dias' },
      { nome: 'Pré-Testes', etapas: ['Pré-Testes'], offset: '-29 a -22 dias' },
      { nome: 'Finalizações', etapas: ['Finalizações'], offset: '-22 a -15 dias' },
      { nome: 'Alinhamentos Operacionais Finais', etapas: ['Alinhamentos Operacionais Finais'], offset: '-15 a -1 dias' },
      { nome: 'Dia D', etapas: ['Dia D'], offset: 'Dia do evento' },
      { nome: 'Debrief', etapas: ['Debriefing', 'Debrief'], offset: '+1 a +7 dias' },
    ];

    // Mapa etapa → offset para auto-preencher
    const ETAPA_OFFSETS = {
      'Pré-Briefing': { start: -92, end: -85 }, 'Briefing': { start: -85, end: -78 },
      'Brainstorming e Conceito': { start: -78, end: -64 }, 'Identidade e Estratégia': { start: -64, end: -50 },
      'Aprovação': { start: -50, end: -43 }, 'Execução Estratégica': { start: -43, end: -29 },
      'Pré-Testes': { start: -29, end: -22 }, 'Finalizações': { start: -22, end: -15 },
      'Alinhamentos Operacionais Finais': { start: -15, end: -1 }, 'Dia D': { start: 0, end: 0 },
      'Debriefing': { start: 1, end: 7 },
    };

    const tpls = Array.isArray(admTemplates) ? admTemplates : [];
    const reloadTemplates = async () => { const d = await cyclesApi.admTemplates(); setAdmTemplates(d || []); };

    return (
      <div>
        <div style={{ fontSize: 12, color: C.t3, marginBottom: 16 }}>
          Tarefas criadas automaticamente ao ativar o ciclo criativo. O prazo e vinculado a fase (dias antes do Dia D).
        </div>

        {/* Novo template */}
        <div style={{ background: C.card, borderRadius: 10, padding: 14, marginBottom: 24, border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 10 }}>Adicionar tarefa padrao</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <div style={{ fontSize: 10, color: C.t3, marginBottom: 2 }}>Fase</div>
              <select value={newTplForm.etapa} onChange={e => { const etapa = e.target.value; const o = ETAPA_OFFSETS[etapa] || {}; setNewTplForm(f => ({ ...f, etapa, offset_start: o.start || 0, offset_end: o.end || 0 })); }} style={{ padding: 6, borderRadius: 6, border: `1px solid ${C.border}`, background: C.card, color: C.text, fontSize: 12, minWidth: 180 }}>
                <option value="">Selecione a fase</option>
                {FASES.map(f => <option key={f.nome} value={f.etapas[0]}>{f.nome} ({f.offset})</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 10, color: C.t3, marginBottom: 2 }}>Area</div>
              <select value={newTplForm.area} onChange={e => setNewTplForm(f => ({ ...f, area: e.target.value }))} style={{ padding: 6, borderRadius: 6, border: `1px solid ${C.border}`, background: C.card, color: C.text, fontSize: 12, minWidth: 130 }}>
                <option value="">Selecione</option>
                {AREAS.map(a => <option key={a} value={a}>{CAT_LABELS[a]}</option>)}
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 10, color: C.t3, marginBottom: 2 }}>Titulo da tarefa</div>
              <input value={newTplForm.titulo} onChange={e => setNewTplForm(f => ({ ...f, titulo: e.target.value }))} placeholder="Ex: Criar briefing visual do evento" style={{ width: '100%', padding: 6, borderRadius: 6, border: `1px solid ${C.border}`, background: C.card, color: C.text, fontSize: 12 }} onKeyDown={async e => {
                if (e.key === 'Enter' && newTplForm.area && newTplForm.etapa && newTplForm.titulo) { await cyclesApi.createAdmTemplate(newTplForm); await reloadTemplates(); setNewTplForm(f => ({ ...f, titulo: '' })); }
              }} />
            </div>
            <button onClick={async () => { if (!newTplForm.area || !newTplForm.etapa || !newTplForm.titulo) return; await cyclesApi.createAdmTemplate(newTplForm); await reloadTemplates(); setNewTplForm(f => ({ ...f, titulo: '' })); }} style={{ padding: '6px 16px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: 'none', background: C.primary, color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap' }}>Adicionar</button>
          </div>
        </div>

        {/* Lista por fase em cards */}
        {FASES.map(fase => {
          const faseTpls = tpls.filter(t => fase.etapas.includes(t.etapa));
          const ativos = faseTpls.filter(t => t.ativo).length;
          return (
            <div key={fase.nome} style={{ ...cardStyle, marginBottom: 16 }}>
              {/* Header da fase */}
              <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: `1px solid ${C.border}`, background: 'var(--cbrio-table-header)' }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: C.text, flex: 1 }}>{fase.nome}</span>
                <span style={{ fontSize: 10, padding: '3px 10px', borderRadius: 99, background: C.bg, color: C.t3, border: `1px solid ${C.border}` }}>{fase.offset}</span>
                <span style={{ fontSize: 11, color: C.t2, fontWeight: 600 }}>{ativos}/{faseTpls.length}</span>
              </div>
              {/* Tarefas */}
              {faseTpls.length === 0 ? (
                <div style={{ padding: 16, textAlign: 'center', color: C.t3, fontSize: 12 }}>Nenhuma tarefa nesta fase</div>
              ) : faseTpls.map(t => (
                <div key={t.id} style={{ borderBottom: `1px solid ${C.border}`, opacity: t.ativo ? 1 : 0.4 }}>
                  <div style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }} onClick={() => setExpandedTpl(expandedTpl === t.id ? null : t.id)}
                    onMouseEnter={e => e.currentTarget.style.background = C.bg} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: (CAT_COLORS[t.area] || '#9ca3af') + '20', color: CAT_COLORS[t.area] || '#9ca3af', fontWeight: 600, flexShrink: 0 }}>{CAT_LABELS[t.area] || t.area}</span>
                    <span style={{ fontSize: 13, fontWeight: 500, color: C.text, flex: 1 }}>{t.titulo}</span>
                    <span style={{ fontSize: 10, color: C.t3, flexShrink: 0 }}>{(t.adm_task_template_subtasks || []).length} subtarefas</span>
                    <button onClick={async (e) => { e.stopPropagation(); await cyclesApi.toggleAdmTemplate(t.id); await reloadTemplates(); }} style={{ padding: '3px 10px', fontSize: 10, borderRadius: 6, border: 'none', background: t.ativo ? '#10b98118' : '#ef444418', color: t.ativo ? '#10b981' : '#ef4444', cursor: 'pointer', fontWeight: 600, flexShrink: 0 }}>
                      {t.ativo ? 'Ativo' : 'Inativo'}
                    </button>
                    <button onClick={async (e) => { e.stopPropagation(); if (window.confirm('Excluir esta tarefa de todos os eventos ativos?')) { await cyclesApi.deleteAdmTemplate(t.id); await reloadTemplates(); } }} style={{ background: 'none', border: 'none', color: C.red, cursor: 'pointer', fontSize: 12, flexShrink: 0 }}>{'\u2715'}</button>
                  </div>
                  {/* Subtarefas expandidas */}
                  {expandedTpl === t.id && (
                    <div style={{ padding: '6px 16px 12px', background: C.bg }}>
                      {(t.adm_task_template_subtasks || []).sort((a, b) => a.sort_order - b.sort_order).map(s => (
                        <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 12, color: C.t2 }}>
                          <span style={{ color: C.t3, fontSize: 8 }}>{'\u25cf'}</span>
                          <span style={{ flex: 1 }}>{s.name}</span>
                          <button onClick={async () => { await cyclesApi.removeAdmSubtask(s.id); await reloadTemplates(); }} style={{ background: 'none', border: 'none', color: C.red, cursor: 'pointer', fontSize: 10 }}>{'\u2715'}</button>
                        </div>
                      ))}
                      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                        <input placeholder="Nova subtarefa..." value={newSubName} onChange={e => setNewSubName(e.target.value)} style={{ flex: 1, padding: 5, borderRadius: 6, border: `1px solid ${C.border}`, background: C.card, color: C.text, fontSize: 11 }} onKeyDown={async (e) => {
                          if (e.key === 'Enter' && newSubName.trim()) { await cyclesApi.addAdmSubtask(t.id, { name: newSubName.trim() }); setNewSubName(''); await reloadTemplates(); }
                        }} />
                        <button onClick={async () => { if (newSubName.trim()) { await cyclesApi.addAdmSubtask(t.id, { name: newSubName.trim() }); setNewSubName(''); await reloadTemplates(); } }} style={{ padding: '4px 12px', fontSize: 10, borderRadius: 6, border: 'none', background: C.primary, color: '#fff', cursor: 'pointer' }}>+ Sub</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          );
        })}

        {tpls.length > 0 && (
          <div style={{ ...cardStyle, padding: 14, marginTop: 8 }}>
            <div style={{ fontSize: 12, color: C.t2, display: 'flex', gap: 16 }}>
              <span><strong>{tpls.length}</strong> tarefas padrao</span>
              <span><strong>{tpls.filter(t => t.ativo).length}</strong> ativas</span>
              <span><strong>{tpls.reduce((a, t) => a + (t.adm_task_template_subtasks?.length || 0), 0)}</strong> subtarefas</span>
              <span style={{ color: C.t3, fontSize: 11 }}>Ao adicionar/excluir, as alteracoes sao aplicadas em todos os eventos ativos</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderKanban() {
    const CAT = {
      adm:        { label: 'Administrativo', color: '#0ea5e9', bg: '#e0f2fe' },
      marketing:  { label: 'Marketing',  color: '#00B39D', bg: '#d1fae5' },
      compras:    { label: 'Compras',    color: '#3b82f6', bg: '#dbeafe' },
      financeiro: { label: 'Financeiro', color: '#10b981', bg: '#d1fae5' },
      manutencao: { label: 'Manutenção', color: '#f59e0b', bg: '#fef3c7' },
      limpeza:    { label: 'Limpeza',    color: '#8b5cf6', bg: '#ede9fe' },
      cozinha:    { label: 'Cozinha',    color: '#ec4899', bg: '#fce7f3' },
      producao:   { label: 'Produção',   color: '#6366f1', bg: '#e0e7ff' },
      outros:     { label: 'Outros',     color: 'var(--cbrio-text3)', bg: 'var(--cbrio-bg)' },
    };
    const getCat = (t) => (t.area || '').toLowerCase() || 'outros';

    const d = kanbanCycleData;
    if (!d) return <div style={{ padding: 20, textAlign: 'center', color: 'var(--cbrio-text3)' }}>{kanbanLoading ? 'Carregando...' : 'Nenhum ciclo criativo ativo'}</div>;

    const allPhases = d.phases || [];
    const allTasks = d.tasks || [];
    const allEvents = d.events || [];

    // Agrupar fases por numero_fase (unificando de todos os eventos)
    const phaseNums = [...new Set(allPhases.map(p => p.numero_fase))].sort((a, b) => a - b);
    const phaseNames = {};
    allPhases.forEach(p => { phaseNames[p.numero_fase] = p.nome_fase; });

    // Filtrar por evento
    const filteredPhases = kanbanEvent === 'all' ? allPhases : allPhases.filter(p => p.event_id === kanbanEvent);
    const phaseIds = new Set(filteredPhases.map(p => p.id));

    // Tarefas da fase selecionada + filtros + visão
    const lowerUserAreas = (userAreas || []).map(a => a.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));

    let phaseTasks = allTasks.filter(t => {
      // Filtrar por fase (modo PMO — sempre ativo)
      if (kanbanViewMode === 'pmo') {
        const ph = allPhases.find(p => p.id === t.event_phase_id);
        if (!ph || ph.numero_fase !== kanbanPhase) return false;
      }
      // Filtrar por evento
      if (kanbanEvent !== 'all' && t.event_id !== kanbanEvent) return false;
      // Líderes: filtrar pela area automaticamente (sem opcao de mudar)
      if (isLider && lowerUserAreas.length > 0) {
        const cat = getCat(t);
        if (!lowerUserAreas.includes(cat)) return false;
      }
      // Minhas tarefas (PMO)
      if (kanbanViewMode === 'minhas') {
        if (t.responsavel_id !== userId && t.responsavel_nome !== profile?.name) return false;
      }
      return true;
    });
    // Filtro de area manual (so PMO usa)
    if (kanbanArea !== 'all') phaseTasks = phaseTasks.filter(t => getCat(t) === kanbanArea);
    phaseTasks = filterByHorizon(phaseTasks, kanbanHorizon, 'prazo');

    return (
      <div style={{ margin: '0 -32px', padding: '0 16px' }}>
        {/* Header com botão relatório */}
        {accessLevel >= 5 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
            <button onClick={() => setReportModal({ step: 'event' })} style={{
              padding: '7px 16px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 600,
              background: '#7c3aed', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
            }}>
              🤖 Gerar Relatório
            </button>
          </div>
        )}

        {/* Toggle visão (só PMO vê) */}
        {isPMO && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 10, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--cbrio-text2)', fontWeight: 600 }}>Visão:</span>
            {[
              { key: 'pmo', label: 'PMO (por fase)' },
              { key: 'minhas', label: 'Minhas tarefas' },
            ].map(v => (
              <button key={v.key} onClick={() => setKanbanViewMode(v.key)} style={{
                padding: '5px 14px', borderRadius: 8, fontSize: 12, fontWeight: kanbanViewMode === v.key ? 700 : 400, cursor: 'pointer',
                border: kanbanViewMode === v.key ? '2px solid #00B39D' : '1px solid var(--cbrio-border)',
                background: kanbanViewMode === v.key ? '#00B39D15' : 'transparent',
                color: kanbanViewMode === v.key ? '#00B39D' : 'var(--cbrio-text3)',
              }}>{v.label}</button>
            ))}
          </div>
        )}

        {/* Filtros */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
          {/* Filtro evento */}
          <span style={{ fontSize: 11, color: 'var(--cbrio-text2)', fontWeight: 600 }}>Evento:</span>
          <ShadSelect value={kanbanEvent} onValueChange={v => setKanbanEvent(v)}>
            <SelectTrigger className="w-[200px] h-8 text-xs">
              <SelectValue placeholder="Todos os eventos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os eventos</SelectItem>
              {allEvents.map(ev => <SelectItem key={ev.id} value={String(ev.id)}>{ev.name}</SelectItem>)}
            </SelectContent>
          </ShadSelect>

          <span style={{ width: 1, height: 20, background: 'var(--cbrio-border)', margin: '0 4px' }} />

          {/* Horizonte */}
          <span style={{ fontSize: 11, color: 'var(--cbrio-text2)', fontWeight: 600 }}>Horizonte:</span>
          <ShadSelect value={String(kanbanHorizon)} onValueChange={v => setKanbanHorizon(parseInt(v))}>
            <SelectTrigger className="w-[120px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="15">15 dias</SelectItem>
              <SelectItem value="30">30 dias</SelectItem>
              <SelectItem value="0">Sem filtro</SelectItem>
            </SelectContent>
          </ShadSelect>

          {/* Filtro área (só PMO vê) */}
          {isPMO && <>
            <span style={{ width: 1, height: 20, background: 'var(--cbrio-border)', margin: '0 4px' }} />
            <span style={{ fontSize: 11, color: 'var(--cbrio-text2)', fontWeight: 600 }}>Área:</span>
            {[{ key: 'all', label: 'Todas' }, ...Object.entries(CAT).filter(([k]) => k !== 'outros').map(([k, v]) => ({ key: k, label: v.label, color: v.color, bg: v.bg }))].map(f => (
              <button key={f.key} onClick={() => setKanbanArea(f.key)} style={{
                padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: kanbanArea === f.key ? 600 : 400, cursor: 'pointer',
                border: kanbanArea === f.key ? `2px solid ${f.color || '#00B39D'}` : `1px solid var(--cbrio-border)`,
                background: kanbanArea === f.key ? (f.bg || '#d1fae5') : 'transparent',
                color: kanbanArea === f.key ? (f.color || '#00B39D') : 'var(--cbrio-text3)',
              }}>{f.label}</button>
            ))}
          </>}
        </div>

        {/* Faixa de fases (nível 1) */}
        <div style={{ overflowX: 'auto', marginBottom: 16, paddingBottom: 6 }}>
          <div style={{ display: 'flex', gap: 5, minWidth: 'max-content' }}>
            {phaseNums.map((num, i) => {
              const isActive = num === kanbanPhase;
              const relevantPhases = filteredPhases.filter(p => p.numero_fase === num);
              const relevantPhaseIds = relevantPhases.map(p => p.id);
              const pTasks = allTasks.filter(t => relevantPhaseIds.includes(t.event_phase_id) && (kanbanEvent === 'all' || t.event_id === kanbanEvent));
              const pDone = pTasks.filter(t => t.status === 'concluida').length;
              const pBlocked = 0;
              const isDone = pTasks.length > 0 && pDone === pTasks.length;
              const pPct = pTasks.length > 0 ? Math.round((pDone / pTasks.length) * 100) : 0;

              return (
                <div key={num} style={{ display: 'flex', alignItems: 'center' }}>
                  <div onClick={() => { setKanbanPhase(num); setKanbanSelectedTask(null); }} style={{
                    borderRadius: 8, padding: '8px 10px', cursor: 'pointer', minWidth: 100, maxWidth: 120,
                    border: isActive ? '2px solid #00B39D' : num === 10 ? '1px solid #f59e0b' : `1px solid var(--cbrio-border)`,
                    background: isActive ? 'rgba(0,179,157,0.1)' : num === 10 ? '#fef3c720' : isDone ? 'var(--cbrio-bg)' : 'var(--cbrio-card)',
                    opacity: isDone && !isActive ? 0.7 : 1, transition: 'all .15s',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--cbrio-text3)', marginBottom: 3 }}>
                      <span>F{num}</span>
                      {pBlocked > 0 && <span style={{ color: '#ef4444' }}>{pBlocked} bloq</span>}
                    </div>
                    <div style={{ fontSize: 10, fontWeight: isActive ? 700 : 500, color: isActive ? '#00B39D' : 'var(--cbrio-text)', lineHeight: 1.3, marginBottom: 4 }}>
                      {phaseNames[num]}
                    </div>
                    <div style={{ height: 3, borderRadius: 2, background: 'var(--cbrio-border)', marginBottom: 3 }}>
                      <div style={{ height: 3, borderRadius: 2, width: `${pPct}%`, background: isDone ? '#10b981' : pPct > 0 ? '#00B39D' : 'transparent', transition: 'width .3s' }} />
                    </div>
                    <div style={{ fontSize: 9, color: 'var(--cbrio-text3)' }}>{pTasks.length > 0 ? (isDone ? 'concluída' : `${pTasks.length - pDone} pendente(s)`) : 'vazia'}</div>
                  </div>
                  {i < phaseNums.length - 1 && <div style={{ width: 12, height: 2, background: isDone ? '#10b981' : 'var(--cbrio-border)', flexShrink: 0 }} />}
                </div>
              );
            })}
          </div>
        </div>

        {/* Header da fase */}
        {kanbanPhase && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--cbrio-text)' }}>
              Fase {kanbanPhase} — {phaseNames[kanbanPhase]}
              <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--cbrio-text3)', marginLeft: 12 }}>
                {phaseTasks.filter(t => t.status !== 'concluida').length} pendente(s)
              </span>
            </div>
            <button onClick={() => { setNewTaskEventId(kanbanEvent !== 'all' ? kanbanEvent : ''); setShowKanbanNewTask(true); }} style={{ padding: '4px 10px', fontSize: 11, border: 'none', cursor: 'pointer', fontWeight: 600, background: '#00B39D', color: '#fff', borderRadius: 6 }}>+ Tarefa</button>
          </div>
        )}

        {/* Lista de cards agrupados por área */}
        {phaseTasks.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--cbrio-text3)', fontSize: 13 }}>Nenhuma tarefa nesta fase com os filtros selecionados.</div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {Object.entries(CAT).map(([catKey, catMeta]) => {
            const catTasks = sortByUrgency(phaseTasks.filter(t => getCat(t) === catKey));
            if (catTasks.length === 0) return null;
            const done = catTasks.filter(t => t.status === 'concluida').length;
            const pct = Math.round((done / catTasks.length) * 100);
            return (
              <div key={catKey} style={{ background: 'var(--cbrio-card)', borderRadius: 10, border: '1px solid var(--cbrio-border)', overflow: 'hidden' }}>
                {/* Header da área */}
                <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--cbrio-border)' }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: catMeta.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--cbrio-text)', flex: 1 }}>{catMeta.label}</span>
                  <span style={{ fontSize: 11, color: 'var(--cbrio-text3)', fontWeight: 600 }}>{done}/{catTasks.length}</span>
                  <div style={{ width: 60, height: 4, borderRadius: 2, background: 'var(--cbrio-border)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? '#10b981' : catMeta.color, borderRadius: 2, transition: 'width 0.3s' }} />
                  </div>
                </div>
                {/* Cards */}
                {catTasks.map(task => {
                  const evName = allEvents.find(e => e.id === task.event_id)?.name || '';
                  const isDone = task.status === 'concluida';
                  const p = normDate(task.prazo);
                  const diff = p ? Math.ceil((new Date(p + 'T12:00:00') - new Date()) / 86400000) : null;
                  const dColor = diff === null || isDone ? null : diff < 0 ? '#ef4444' : diff <= 3 ? '#f59e0b' : '#10b981';
                  const dText = diff === null ? '' : diff < 0 ? `${Math.abs(diff)}d atrás` : diff === 0 ? 'Hoje' : `${diff}d`;
                  return (
                    <div key={task.id} onClick={() => setKanbanSelectedTask(task)}
                      style={{
                        padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10,
                        borderBottom: '1px solid var(--cbrio-border)', cursor: 'pointer',
                        background: kanbanSelectedTask?.id === task.id ? 'rgba(0,179,157,0.06)' : 'transparent',
                        opacity: isDone ? 0.65 : 1, transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => { if (!isDone) e.currentTarget.style.background = 'var(--cbrio-bg)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = kanbanSelectedTask?.id === task.id ? 'rgba(0,179,157,0.06)' : 'transparent'; }}>
                      {/* Status icon */}
                      <div style={{
                        width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: isDone ? '#d1fae5' : 'var(--cbrio-bg)',
                        border: isDone ? '2px solid #10b981' : '2px solid var(--cbrio-border)',
                        fontSize: 11, color: isDone ? '#10b981' : 'var(--cbrio-text3)',
                      }}>
                        {isDone ? '✓' : ''}
                      </div>
                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: isDone ? 400 : 600, color: 'var(--cbrio-text)', textDecoration: isDone ? 'line-through' : 'none', lineHeight: 1.3 }}>{task.titulo}</div>
                        <div style={{ fontSize: 11, color: 'var(--cbrio-text3)', marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <span>{task.responsavel_nome || '—'}</span>
                          {evName && <span>· {evName}</span>}
                          {p && <span>· {fmtDate(p)}</span>}
                        </div>
                      </div>
                      {/* Deadline badge */}
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

        {/* ── PAINEL LATERAL — Detalhe da Tarefa ── */}
        {kanbanSelectedTask && (() => {
          const task = kanbanSelectedTask;
          const phase = allPhases.find(p => p.id === task.event_phase_id);
          const cat = CAT[getCat(task)] || CAT.outros;
          const subs = task.subtasks || [];
          const subsDone = subs.filter(s => s.done).length;
          const subsPct = subs.length > 0 ? Math.round((subsDone / subs.length) * 100) : task.status === 'concluida' ? 100 : 0;
          const evName = allEvents.find(e => e.id === task.event_id)?.name || '';
          const p = normDate(task.prazo);
          const diff = p ? Math.ceil((new Date(p + 'T12:00:00') - new Date()) / 86400000) : null;
          const daysColor = diff === null || task.status === 'concluida' ? null : diff < 0 ? '#ef4444' : diff <= 7 ? '#f59e0b' : '#10b981';
          const TASK_ST = { a_fazer: { label: 'A fazer', color: '#9ca3af' }, em_andamento: { label: 'Em andamento', color: '#3b82f6' }, concluida: { label: 'Concluída', color: '#10b981' } };
          const ts = TASK_ST[task.status] || TASK_ST.a_fazer;

          return (
            <>
              <div onClick={() => setKanbanSelectedTask(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 900, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 40 }} />
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
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--cbrio-text)', lineHeight: 1.3, marginBottom: 8 }}>{task.titulo}</div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: cat.bg, color: cat.color, fontWeight: 600 }}>{cat.label}</span>
                        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: `${ts.color}15`, color: ts.color, fontWeight: 600 }}>{ts.label}</span>
                      </div>
                    </div>
                    <button onClick={() => setKanbanSelectedTask(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--cbrio-text3)', padding: '4px 8px' }}>✕</button>
                  </div>
                  <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--cbrio-text2)' }}>
                    {evName && <div><span style={{ fontWeight: 600 }}>Evento:</span> {evName}</div>}
                    <div><span style={{ fontWeight: 600 }}>Responsável:</span> {task.responsavel_nome || '—'}</div>
                    {p && <div><span style={{ fontWeight: 600 }}>Prazo:</span> {fmtDate(p)} {daysColor && <span style={{ color: daysColor, fontWeight: 700 }}> ({diff < 0 ? `${Math.abs(diff)}d atrás` : diff === 0 ? 'Hoje' : `${diff}d`})</span>}</div>}
                  </div>
                </div>

                <div style={{ padding: '16px 24px' }}>
                  {/* Entregável Esperado */}
                  {(phase?.entregas_padrao || task.entrega) && (
                    <div style={{ marginBottom: 20 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#00B39D', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>📋 Entregável Esperado</div>
                      <div style={{ background: 'rgba(0,179,157,0.06)', border: '1px solid rgba(0,179,157,0.2)', borderRadius: 10, padding: '14px 16px' }}>
                        {phase?.entregas_padrao && <div style={{ fontSize: 13, color: 'var(--cbrio-text)', lineHeight: 1.6, whiteSpace: 'pre-line' }}>{phase.entregas_padrao}</div>}
                        {task.entrega && <div style={{ fontSize: 12, color: 'var(--cbrio-text2)', marginTop: 8 }}><span style={{ fontWeight: 600 }}>Específico:</span> {task.entrega}</div>}
                      </div>
                    </div>
                  )}

                  {/* Fase */}
                  {phase && (
                    <div style={{ marginBottom: 20 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--cbrio-text2)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Fase</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--cbrio-text)' }}>Fase {phase.numero_fase} — {phase.nome_fase}</div>
                      {phase.descricao_fase && <div style={{ fontSize: 12, color: 'var(--cbrio-text2)', marginTop: 4, lineHeight: 1.5 }}>{phase.descricao_fase}</div>}
                    </div>
                  )}

                  {/* Descrição */}
                  {task.descricao && (
                    <div style={{ marginBottom: 20 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--cbrio-text2)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Descrição</div>
                      <div style={{ fontSize: 13, color: 'var(--cbrio-text)', lineHeight: 1.6, whiteSpace: 'pre-line' }}>{task.descricao}</div>
                    </div>
                  )}

                  {/* Checklist */}
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--cbrio-text2)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Checklist ({subsDone}/{subs.length})</div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: subsPct >= 100 ? '#10b981' : subsPct > 0 ? '#3b82f6' : 'var(--cbrio-text3)' }}>{subsPct}%</span>
                    </div>
                    <div style={{ height: 6, background: 'var(--cbrio-border)', borderRadius: 3, marginBottom: 10, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${subsPct}%`, background: subsPct >= 100 ? '#10b981' : '#3b82f6', borderRadius: 3, transition: 'width 0.3s' }} />
                    </div>
                    {subs.length === 0 ? (
                      <div style={{ fontSize: 12, color: 'var(--cbrio-text3)', padding: 8 }}>Nenhuma subtarefa.</div>
                    ) : subs.map(sub => (
                      <div key={sub.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--cbrio-border)' }}>
                        <input type="checkbox" checked={sub.done} onChange={async () => {
                          const newSubs = subs.map(s => s.id === sub.id ? { ...s, done: !s.done } : s);
                          setKanbanSelectedTask({ ...task, subtasks: newSubs });
                          await cyclesApi.updateSubtask(sub.id, { done: !sub.done });
                        }} style={{ cursor: 'pointer', width: 16, height: 16, accentColor: '#00B39D' }} />
                        <span style={{ flex: 1, fontSize: 13, color: 'var(--cbrio-text)', ...(sub.done ? { textDecoration: 'line-through', color: 'var(--cbrio-text3)' } : {}) }}>{sub.name}</span>
                        <button onClick={async () => {
                          await cyclesApi.deleteSubtask(sub.id);
                          loadKanban();
                          setKanbanSelectedTask({ ...task, subtasks: subs.filter(s => s.id !== sub.id) });
                        }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--cbrio-text3)', padding: 0, lineHeight: 1 }} title="Excluir subtarefa">
                          <span style={{ fontSize: 14 }}>✕</span>
                        </button>
                      </div>
                    ))}
                    {/* Adicionar subtarefa */}
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      <input id="kanban-new-subtask" type="text" placeholder="Nova subtarefa..."
                        onKeyDown={async (e) => {
                          if (e.key === 'Enter' && e.target.value.trim()) {
                            const name = e.target.value.trim(); e.target.value = '';
                            const newSub = await cyclesApi.createSubtask(task.id, name);
                            loadKanban();
                            setKanbanSelectedTask({ ...task, subtasks: [...subs, newSub] });
                          }
                        }}
                        style={{ flex: 1, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--cbrio-border)', fontSize: 12, color: 'var(--cbrio-text)', background: 'var(--cbrio-input-bg, #fff)' }} />
                      <button onClick={async () => {
                        const input = document.getElementById('kanban-new-subtask');
                        if (!input?.value.trim()) return;
                        const name = input.value.trim(); input.value = '';
                        const newSub = await cyclesApi.createSubtask(task.id, name);
                        loadKanban();
                        setKanbanSelectedTask({ ...task, subtasks: [...subs, newSub] });
                      }} style={{ padding: '5px 10px', borderRadius: 6, border: 'none', background: '#00B39D', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>+</button>
                    </div>
                  </div>

                  {/* Observações */}
                  {task.observacoes && (
                    <div style={{ marginBottom: 20 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--cbrio-text2)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Observações</div>
                      <div style={{ fontSize: 12, color: 'var(--cbrio-text2)', lineHeight: 1.5, background: 'var(--cbrio-bg)', borderRadius: 8, padding: '10px 14px' }}>{task.observacoes}</div>
                    </div>
                  )}

                  {/* Conclusão */}
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--cbrio-text2)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Conclusão</div>
                    <CompletionSection
                      task={task}
                      phase={phase}
                      eventName={evName}
                      isPMO={isPMO}
                      onComplete={() => { loadKanban(); setKanbanSelectedTask(null); }}
                    />
                  </div>

                  {/* Ações */}
                  <div style={{ display: 'flex', gap: 8, paddingTop: 16, borderTop: '1px solid var(--cbrio-border)', justifyContent: 'flex-end' }}>
                    <button onClick={async () => {
                      if (!window.confirm(`Excluir o card "${task.titulo}"? Esta ação não pode ser desfeita.`)) return;
                      await cyclesApi.deleteTask(task.id); loadKanban(); setKanbanSelectedTask(null);
                    }}
                      style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#ef4444', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                      Excluir
                    </button>
                  </div>
                </div>
              </div>
            </>
          );
        })()}

        {/* ── MODAL NOVA TAREFA (kanban) ── */}
        {showKanbanNewTask && (() => {
          const eventOptions = allEvents.filter(e => e.status !== 'concluido');
          const selectedEventId = newTaskEventId || (kanbanEvent !== 'all' ? kanbanEvent : '');
          const eventPhases = filteredPhases.filter(p => p.event_id === selectedEventId).sort((a, b) => a.numero_fase - b.numero_fase);
          return (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => { setShowKanbanNewTask(false); setKanbanNewTaskSubs([]); setNewTaskEventId(''); }}>
              <div style={{ background: 'var(--cbrio-modal-bg, #fff)', borderRadius: 16, padding: 24, width: '95%', maxWidth: 500, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--cbrio-text)' }}>Nova Tarefa</span>
                  <button onClick={() => { setShowKanbanNewTask(false); setKanbanNewTaskSubs([]); setNewTaskEventId(''); }} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--cbrio-text3)' }}>✕</button>
                </div>
                <form onSubmit={async (e) => {
                  e.preventDefault();
                  const fd = new FormData(e.target);
                  const d = Object.fromEntries(fd.entries());
                  const selectedPhase = filteredPhases.find(p => p.id === d.phase_id);
                  const prazo = selectedPhase?.data_fim_prevista || null;
                  const task = await cyclesApi.createTask({ event_phase_id: d.phase_id, event_id: selectedEventId, titulo: d.titulo, area: d.area, prazo, responsavel_nome: d.responsavel || null, status: 'a_fazer', prioridade: 'normal' });
                  if (task?.id && kanbanNewTaskSubs.length > 0) {
                    for (const name of kanbanNewTaskSubs) await cyclesApi.createSubtask(task.id, name);
                  }
                  setShowKanbanNewTask(false); setKanbanNewTaskSubs([]); setNewTaskEventId(''); loadKanban();
                }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--cbrio-text3)', display: 'block', marginBottom: 2 }}>Evento *</label>
                      <ShadSelect value={selectedEventId} onValueChange={v => setNewTaskEventId(v)}>
                        <SelectTrigger className="w-full h-8 text-xs">
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                        <SelectContent>
                          {eventOptions.map(ev => <SelectItem key={ev.id} value={String(ev.id)}>{ev.name}</SelectItem>)}
                        </SelectContent>
                      </ShadSelect>
                      <input type="hidden" name="event_id" value={selectedEventId} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--cbrio-text3)', display: 'block', marginBottom: 2 }}>Fase</label>
                      <ShadSelect name="phase_id" defaultValue={eventPhases[0]?.id || ''}>
                        <SelectTrigger className="w-full h-8 text-xs">
                          <SelectValue placeholder={eventPhases.length === 0 ? 'Selecione o evento primeiro' : 'Selecione...'} />
                        </SelectTrigger>
                        <SelectContent>
                          {eventPhases.map(p => <SelectItem key={p.id} value={p.id}>F{p.numero_fase} — {p.nome_fase}</SelectItem>)}
                        </SelectContent>
                      </ShadSelect>
                    </div>
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--cbrio-text3)', display: 'block', marginBottom: 2 }}>Título *</label>
                    <input name="titulo" required placeholder="Nome da tarefa" style={{ width: '100%', padding: '5px 8px', borderRadius: 6, border: '1px solid var(--cbrio-border)', fontSize: 12, color: 'var(--cbrio-text)', background: 'var(--cbrio-input-bg, #fff)', boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--cbrio-text3)', display: 'block', marginBottom: 2 }}>Área</label>
                    <ShadSelect name="area" defaultValue="compras">
                      <SelectTrigger className="w-full h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="compras">Compras</SelectItem>
                        <SelectItem value="financeiro">Financeiro</SelectItem>
                        <SelectItem value="manutencao">Manutenção</SelectItem>
                        <SelectItem value="limpeza">Limpeza</SelectItem>
                        <SelectItem value="cozinha">Cozinha</SelectItem>
                        <SelectItem value="marketing">Marketing</SelectItem>
                        <SelectItem value="producao">Produção</SelectItem>
                      </SelectContent>
                    </ShadSelect>
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--cbrio-text3)', display: 'block', marginBottom: 2 }}>Responsável</label>
                    <input name="responsavel" placeholder="Nome do responsável" style={{ width: '100%', padding: '5px 8px', borderRadius: 6, border: '1px solid var(--cbrio-border)', fontSize: 12, color: 'var(--cbrio-text)', background: 'var(--cbrio-input-bg, #fff)', boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--cbrio-text3)', display: 'block', marginBottom: 2 }}>Subtarefas</label>
                    {kanbanNewTaskSubs.map((s, i) => (
                      <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ flex: 1, fontSize: 12, color: 'var(--cbrio-text)', padding: '4px 8px', background: 'var(--cbrio-bg)', borderRadius: 4 }}>{s}</span>
                        <button type="button" onClick={() => setKanbanNewTaskSubs(prev => prev.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--cbrio-text3)', fontSize: 14 }}>✕</button>
                      </div>
                    ))}
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input id="kanban-new-task-sub" type="text" placeholder="Nova subtarefa..." style={{ flex: 1, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--cbrio-border)', fontSize: 12, color: 'var(--cbrio-text)', background: 'var(--cbrio-input-bg, #fff)' }}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); const v = e.target.value.trim(); if (v) { setKanbanNewTaskSubs(prev => [...prev, v]); e.target.value = ''; } } }} />
                      <button type="button" onClick={() => {
                        const inp = document.getElementById('kanban-new-task-sub');
                        if (inp?.value.trim()) { setKanbanNewTaskSubs(prev => [...prev, inp.value.trim()]); inp.value = ''; }
                      }} style={{ padding: '5px 10px', borderRadius: 6, border: 'none', background: '#00B39D', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>+</button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
                    <button type="button" onClick={() => { setShowKanbanNewTask(false); setKanbanNewTaskSubs([]); }} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid var(--cbrio-border)', background: 'transparent', cursor: 'pointer', fontSize: 12 }}>Cancelar</button>
                    <button type="submit" style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: '#00B39D', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Criar tarefa</button>
                  </div>
                </form>
              </div>
            </div>
          );
        })()}

        {/* ── MODAL RELATÓRIO IA ── */}
        {reportModal && (() => {
          const rm = reportModal;
          const d = kanbanCycleData;
          const allEvts = d?.events || [];
          const allPh = d?.phases || [];

          const closeModal = () => setReportModal(null);

          const selectEvent = (ev) => setReportModal({ ...rm, step: 'scope', eventId: ev.id, eventName: ev.name });

          const selectScope = async (type) => {
            if (type === 'full') {
              setReportModal({ ...rm, step: 'generating', type: 'full' });
              try {
                const result = await reportsApi.generate(rm.eventId, { type: 'full' });
                setReportModal({ ...rm, step: 'done', type: 'full', result });
              } catch (e) { setReportModal({ ...rm, step: 'done', type: 'full', error: e.message }); }
            } else {
              setReportModal({ ...rm, step: 'phase', type: 'phase' });
            }
          };

          const selectPhase = async (phaseName) => {
            setReportModal({ ...rm, step: 'generating', type: 'phase', phaseName });
            try {
              const result = await reportsApi.generate(rm.eventId, { type: 'phase', phase_name: phaseName });
              setReportModal({ ...rm, step: 'done', type: 'phase', phaseName, result });
            } catch (e) { setReportModal({ ...rm, step: 'done', type: 'phase', phaseName, error: e.message }); }
          };

          const eventPhases = allPh.filter(p => p.event_id === rm.eventId);

          return (
            <>
              <div onClick={closeModal} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 900 }} />
              <div style={{
                position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                width: '95%', maxWidth: 540, maxHeight: '85vh',
                background: 'var(--cbrio-modal-bg, #fff)', zIndex: 901,
                borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflowY: 'auto',
              }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--cbrio-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--cbrio-text)' }}>🤖 Gerar Relatório IA</span>
                  <button onClick={closeModal} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--cbrio-text3)' }}>✕</button>
                </div>
                <div style={{ padding: '16px 20px' }}>

                  {/* Step 1: Selecionar evento */}
                  {rm.step === 'event' && (
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--cbrio-text)', marginBottom: 12 }}>Selecione o evento ou série:</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {allEvts.map(ev => (
                          <button key={ev.id} onClick={() => selectEvent(ev)} style={{
                            padding: '10px 14px', borderRadius: 8, border: '1px solid var(--cbrio-border)',
                            background: 'transparent', cursor: 'pointer', textAlign: 'left',
                            fontSize: 13, color: 'var(--cbrio-text)', transition: 'background 0.1s',
                          }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--cbrio-bg)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                            {ev.name}
                          </button>
                        ))}
                        {allEvts.length === 0 && <div style={{ color: 'var(--cbrio-text3)', fontSize: 12 }}>Nenhum evento com ciclo ativo.</div>}
                      </div>
                    </div>
                  )}

                  {/* Step 2: Escopo */}
                  {rm.step === 'scope' && (
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--cbrio-text3)', marginBottom: 4 }}>{rm.eventName}</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--cbrio-text)', marginBottom: 12 }}>Qual tipo de relatório?</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <button onClick={() => selectScope('full')} style={{
                          padding: '14px 16px', borderRadius: 10, border: '1px solid var(--cbrio-border)',
                          background: 'transparent', cursor: 'pointer', textAlign: 'left',
                        }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--cbrio-bg)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--cbrio-text)' }}>Acumulado completo</div>
                          <div style={{ fontSize: 11, color: 'var(--cbrio-text3)', marginTop: 2 }}>Tudo que foi entregue no evento/série até hoje</div>
                        </button>
                        <button onClick={() => selectScope('phase')} style={{
                          padding: '14px 16px', borderRadius: 10, border: '1px solid var(--cbrio-border)',
                          background: 'transparent', cursor: 'pointer', textAlign: 'left',
                        }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--cbrio-bg)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--cbrio-text)' }}>Fase específica</div>
                          <div style={{ fontSize: 11, color: 'var(--cbrio-text3)', marginTop: 2 }}>Relatório de uma fase do ciclo criativo</div>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Step 3: Selecionar fase */}
                  {rm.step === 'phase' && (
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--cbrio-text3)', marginBottom: 4 }}>{rm.eventName}</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--cbrio-text)', marginBottom: 12 }}>Selecione a fase:</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {eventPhases.map(p => (
                          <button key={p.id} onClick={() => selectPhase(p.nome_fase)} style={{
                            padding: '10px 14px', borderRadius: 8, border: '1px solid var(--cbrio-border)',
                            background: 'transparent', cursor: 'pointer', textAlign: 'left',
                            fontSize: 13, color: 'var(--cbrio-text)', transition: 'background 0.1s',
                          }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--cbrio-bg)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                            Fase {p.numero_fase} — {p.nome_fase}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Step 4: Gerando */}
                  {rm.step === 'generating' && (
                    <div style={{ textAlign: 'center', padding: 30 }}>
                      <div style={{ width: 28, height: 28, border: '3px solid var(--cbrio-border)', borderTopColor: '#7c3aed', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
                      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                      <div style={{ fontSize: 13, color: 'var(--cbrio-text2)' }}>Gerando relatório de {rm.eventName}...</div>
                      <div style={{ fontSize: 11, color: 'var(--cbrio-text3)', marginTop: 4 }}>Analisando entregáveis e conclusões</div>
                    </div>
                  )}

                  {/* Step 5: Resultado — botões de download */}
                  {rm.step === 'done' && (
                    <div>
                      {rm.error ? (
                        <div style={{ padding: '12px 16px', background: '#fee2e2', color: '#ef4444', borderRadius: 8, fontSize: 13 }}>{rm.error}</div>
                      ) : (
                        <div style={{ textAlign: 'center', padding: '10px 0' }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--cbrio-text)', marginBottom: 4 }}>
                            {rm.type === 'full' ? 'Relatório Completo' : `Fase: ${rm.phaseName}`}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--cbrio-text3)', marginBottom: 20 }}>
                            {rm.eventName} · {rm.result?.attachments_count || 0} arquivo(s) analisado(s)
                          </div>
                          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                            <button onClick={async () => {
                              try {
                                const res = await fetch(`${API}/events/${rm.eventId}/report/export`, {
                                  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}` },
                                  body: JSON.stringify({ reportId: rm.result.id, format: 'slide' }),
                                });
                                const blob = await res.blob();
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a'); a.href = url; a.download = `Apresentacao_${rm.eventName}.pptx`; a.click();
                              } catch (e) { console.error(e); }
                            }} style={{ padding: '14px 28px', borderRadius: 10, border: 'none', background: '#00839D', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                              Baixar Apresentação
                            </button>
                            <button onClick={async () => {
                              try {
                                const res = await fetch(`${API}/events/${rm.eventId}/report/export`, {
                                  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}` },
                                  body: JSON.stringify({ reportId: rm.result.id, format: 'document' }),
                                });
                                const blob = await res.blob();
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a'); a.href = url; a.download = `Documento_${rm.eventName}.docx`; a.click();
                              } catch (e) { console.error(e); }
                            }} style={{ padding: '14px 28px', borderRadius: 10, border: 'none', background: '#242223', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                              Baixar Documento
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </>
          );
        })()}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // RENDER — GANTT (por fases do ciclo criativo)
  // ═══════════════════════════════════════════════════════════
  const [ganttMode, setGanttMode] = useState('eventos'); // 'eventos' | 'acumulado'

  function renderGantt() {
    const MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    const d = kanbanCycleData;
    if (!d) return <div style={{ padding: 20, textAlign: 'center', color: 'var(--cbrio-text3)' }}>{kanbanLoading ? 'Carregando...' : 'Nenhum ciclo ativo'}</div>;

    const aPhases = d.phases || []; const aTasks = d.tasks || []; const aEvents = d.events || [];

    // Agrupar por evento
    const evGroups = {};
    aEvents.forEach(ev => { evGroups[ev.id] = { name: ev.name, date: ev.date, phases: [] }; });
    aPhases.forEach(ph => { if (evGroups[ph.event_id]) evGroups[ph.event_id].phases.push(ph); });
    const groups = Object.values(evGroups).filter(g => g.phases.length > 0);
    groups.forEach(g => g.phases.sort((a, b) => a.numero_fase - b.numero_fase));
    groups.sort((a, b) => {
      const da = a.phases[0]?.data_inicio_prevista || '9999';
      const db = b.phases[0]?.data_inicio_prevista || '9999';
      return da.localeCompare(db);
    });

    const allDts = aPhases.flatMap(p => [p.data_inicio_prevista, p.data_fim_prevista].filter(Boolean)).map(x => new Date(x));
    const today = new Date();
    const gS = allDts.length > 0 ? new Date(Math.min(...allDts, today) - 14 * 86400000) : new Date(today.getFullYear(), 0, 1);
    const gE = allDts.length > 0 ? new Date(Math.max(...allDts, today) + 14 * 86400000) : new Date(today.getFullYear(), 11, 31);
    gS.setDate(1); gE.setDate(1); gE.setMonth(gE.getMonth() + 1);
    const dPct = (dt) => Math.max(0, Math.min(100, ((new Date(dt) - gS) / (gE - gS)) * 100));
    const tPct = dPct(today);
    const mL = []; const mc = new Date(gS);
    while (mc < gE) { mL.push({ label: MONTHS[mc.getMonth()] + (mc.getMonth() === 0 ? ' ' + mc.getFullYear() : ''), pct: dPct(mc) }); mc.setMonth(mc.getMonth() + 1); }

    const NW = 220; const BH = 32;
    const COLORS = ['#00B39D', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899', '#10b981', '#6366f1', '#14b8a6', '#f97316', '#a855f7', '#06b6d4', '#e11d48', '#84cc16'];

    return (
      <div style={{ margin: '0 -32px', padding: '0 16px' }}>
        {/* Toggle */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          {[{ key: 'eventos', label: 'Por Evento' }, { key: 'acumulado', label: 'Acumulado' }].map(m => (
            <button key={m.key} onClick={() => setGanttMode(m.key)} style={{
              padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: ganttMode === m.key ? 600 : 400, cursor: 'pointer',
              border: ganttMode === m.key ? '2px solid #00B39D' : '1px solid var(--cbrio-border)',
              background: ganttMode === m.key ? '#00B39D15' : 'transparent',
              color: ganttMode === m.key ? '#00B39D' : 'var(--cbrio-text3)',
            }}>{m.label}</button>
          ))}
        </div>

        {groups.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: 'var(--cbrio-text3)', fontSize: 13 }}>Nenhum ciclo criativo ativo</div>}

        {/* ── GANTT ACUMULADO ── */}
        {ganttMode === 'acumulado' && groups.length > 0 && (
          <div style={{ background: 'var(--cbrio-card)', borderRadius: 12, border: '1px solid var(--cbrio-border)', marginBottom: 16, overflow: 'hidden' }}>
            <div style={{ padding: '10px 16px', background: '#00B39D10', borderBottom: '1px solid var(--cbrio-border)' }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--cbrio-text)' }}>Todos os Eventos — Visão Acumulada</span>
              <span style={{ fontSize: 11, color: 'var(--cbrio-text3)', marginLeft: 12 }}>({groups.length} eventos)</span>
            </div>
            <div style={{ display: 'flex' }}>
              <div style={{ width: NW, flexShrink: 0, borderRight: '1px solid var(--cbrio-border)' }}>
                <div style={{ height: 28, borderBottom: '1px solid var(--cbrio-border)', background: 'var(--cbrio-table-header)' }} />
                {groups.map((g, i) => (
                  <div key={i} style={{ height: BH, padding: '0 10px', display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid var(--cbrio-border)' }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: COLORS[i % COLORS.length], flexShrink: 0 }} />
                    <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--cbrio-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</span>
                  </div>
                ))}
              </div>
              <div style={{ flex: 1, overflowX: 'auto' }}>
                <div style={{ minWidth: 600, position: 'relative' }}>
                  <div style={{ height: 28, position: 'relative', borderBottom: '1px solid var(--cbrio-border)', background: 'var(--cbrio-table-header)' }}>
                    {mL.map((m, i) => (<div key={i} style={{ position: 'absolute', left: `${m.pct}%`, top: 0, height: '100%', borderLeft: '1px solid var(--cbrio-border)', padding: '5px 6px', fontSize: 10, fontWeight: 600, color: 'var(--cbrio-text2)', whiteSpace: 'nowrap' }}>{m.label}</div>))}
                    <div style={{ position: 'absolute', left: `${tPct}%`, top: 0, width: 2, height: '100%', background: '#ef4444', zIndex: 2 }} />
                    <div style={{ position: 'absolute', left: `${tPct}%`, top: -1, transform: 'translateX(-50%)', fontSize: 8, fontWeight: 700, color: '#ef4444', background: 'var(--cbrio-card)', padding: '0 3px', borderRadius: 3, zIndex: 3 }}>hoje</div>
                  </div>
                  {groups.map((g, gi) => {
                    const firstDate = g.phases[0]?.data_inicio_prevista;
                    const lastDate = g.phases[g.phases.length - 1]?.data_fim_prevista;
                    if (!firstDate || !lastDate) return <div key={gi} style={{ height: BH, borderBottom: '1px solid var(--cbrio-border)' }} />;
                    const lp = dPct(firstDate); const rp = dPct(lastDate); const wp = Math.max(rp - lp, 2);
                    const phaseIds = g.phases.map(p => p.id);
                    const evTasks = aTasks.filter(t => phaseIds.includes(t.event_phase_id));
                    const evDone = evTasks.filter(t => t.status === 'concluida').length;
                    const pct = evTasks.length > 0 ? Math.round(evDone / evTasks.length * 100) : 0;
                    const barColor = COLORS[gi % COLORS.length];
                    return (
                      <div key={gi} style={{ position: 'relative', height: BH, borderBottom: '1px solid var(--cbrio-border)' }}>
                        {mL.map((m, i) => (<div key={i} style={{ position: 'absolute', left: `${m.pct}%`, top: 0, width: 1, height: '100%', background: 'var(--cbrio-border)', opacity: 0.3 }} />))}
                        <div style={{ position: 'absolute', left: `${tPct}%`, top: 0, width: 2, height: '100%', background: '#ef4444', zIndex: 2, opacity: 0.4 }} />
                        <div title={`${g.name}\n${fmtDate(firstDate)} → ${fmtDate(lastDate)}\n${evDone}/${evTasks.length} tarefas (${pct}%)`}
                          style={{ position: 'absolute', top: 4, height: BH - 8, borderRadius: 6, left: `${lp}%`, width: `${wp}%`, background: barColor, opacity: 0.85, display: 'flex', alignItems: 'center', padding: '0 8px', overflow: 'hidden' }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>{pct}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── GANTT POR EVENTO ── */}
        {ganttMode === 'eventos' && groups.map((group, gi) => (
          <div key={gi} style={{ background: 'var(--cbrio-card)', borderRadius: 12, border: '1px solid var(--cbrio-border)', marginBottom: 16, overflow: 'hidden' }}>
            <div style={{ padding: '10px 16px', background: '#00B39D10', borderBottom: '1px solid var(--cbrio-border)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#00B39D' }} />
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--cbrio-text)' }}>{group.name}</span>
              <span style={{ fontSize: 11, color: 'var(--cbrio-text3)' }}>({group.phases.filter(p => p.status === 'concluida').length}/{group.phases.length})</span>
            </div>
            <div style={{ display: 'flex' }}>
              <div style={{ width: NW, flexShrink: 0, borderRight: '1px solid var(--cbrio-border)' }}>
                <div style={{ height: 28, borderBottom: '1px solid var(--cbrio-border)', background: 'var(--cbrio-table-header)' }} />
                {group.phases.map(ph => {
                  const eiN = normDate(ph.data_fim_prevista);
                  const diffN = eiN ? Math.ceil((new Date(eiN + 'T12:00:00') - new Date()) / 86400000) : null;
                  const dotC = ph.status === 'concluida' ? '#10b981' : diffN !== null && diffN < 0 ? '#ef4444' : diffN !== null && diffN <= 3 ? '#f59e0b' : '#9ca3af';
                  return (
                  <div key={ph.id} style={{ height: BH, padding: '0 10px', display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid var(--cbrio-border)' }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: dotC, flexShrink: 0 }} />
                    <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--cbrio-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>F{ph.numero_fase} {ph.nome_fase}</span>
                  </div>
                  ); })}
              </div>
              <div style={{ flex: 1, overflowX: 'auto' }}>
                <div style={{ minWidth: 600, position: 'relative' }}>
                  <div style={{ height: 28, position: 'relative', borderBottom: '1px solid var(--cbrio-border)', background: 'var(--cbrio-table-header)' }}>
                    {mL.map((m, i) => (<div key={i} style={{ position: 'absolute', left: `${m.pct}%`, top: 0, height: '100%', borderLeft: '1px solid var(--cbrio-border)', padding: '5px 6px', fontSize: 10, fontWeight: 600, color: 'var(--cbrio-text2)', whiteSpace: 'nowrap' }}>{m.label}</div>))}
                    <div style={{ position: 'absolute', left: `${tPct}%`, top: 0, width: 2, height: '100%', background: '#ef4444', zIndex: 2 }} />
                    <div style={{ position: 'absolute', left: `${tPct}%`, top: -1, transform: 'translateX(-50%)', fontSize: 8, fontWeight: 700, color: '#ef4444', background: 'var(--cbrio-card)', padding: '0 3px', borderRadius: 3, zIndex: 3 }}>hoje</div>
                  </div>
                  {group.phases.map(ph => {
                    const si = normDate(ph.data_inicio_prevista); const ei = normDate(ph.data_fim_prevista);
                    if (!si || !ei) return <div key={ph.id} style={{ height: BH, borderBottom: '1px solid var(--cbrio-border)' }} />;
                    const lp = dPct(si); const rp = dPct(ei);
                    const wp = Math.max(rp - lp, 1.5); // largura real baseada na duração, mínimo 1.5%
                    const phT = aTasks.filter(t => t.event_phase_id === ph.id);
                    const phD = phT.filter(t => t.status === 'concluida').length;
                    const isDone = ph.status === 'concluida' || (phT.length > 0 && phD === phT.length) || phT.length === 0;
                    const endD = new Date(ei + 'T12:00:00');
                    const diff2 = Math.ceil((endD - new Date()) / 86400000);
                    const barC = isDone ? '#d1d5db' : diff2 < 0 ? '#ef4444' : diff2 <= 3 ? '#f59e0b' : '#10b981';
                    const dTxt = isDone ? '✓' : diff2 < 0 ? `${Math.abs(diff2)}d atrás` : diff2 === 0 ? 'Hoje' : `${diff2}d`;
                    return (
                      <div key={ph.id} style={{ position: 'relative', height: BH, borderBottom: '1px solid var(--cbrio-border)' }}>
                        {mL.map((m, i) => (<div key={i} style={{ position: 'absolute', left: `${m.pct}%`, top: 0, width: 1, height: '100%', background: 'var(--cbrio-border)', opacity: 0.3 }} />))}
                        <div style={{ position: 'absolute', left: `${tPct}%`, top: 0, width: 2, height: '100%', background: '#ef4444', zIndex: 2, opacity: 0.4 }} />
                        <div title={`${ph.nome_fase}\n${fmtDate(si)} → ${fmtDate(ei)}\n${dTxt}`}
                          style={{ position: 'absolute', top: 4, height: BH - 8, borderRadius: 6, left: `${lp}%`, width: `${wp}%`, minWidth: 40, background: barC, opacity: isDone ? 0.5 : 0.9, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', overflow: 'hidden' }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>{dTxt}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        ))}

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', padding: '8px 0' }}>
          {[{ l: 'No prazo (>3d)', c: '#10b981' }, { l: 'Urgente (≤3d)', c: '#f59e0b' }, { l: 'Atrasada', c: '#ef4444' }, { l: 'Concluída', c: '#d1d5db' }].map(x => (
            <div key={x.l} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 20, height: 10, borderRadius: 4, background: x.c }} /><span style={{ fontSize: 12, color: 'var(--cbrio-text2)' }}>{x.l}</span>
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 2, height: 14, background: '#ef4444' }} /><span style={{ fontSize: 12, color: 'var(--cbrio-text2)' }}>Hoje</span>
          </div>
        </div>
        <div style={{ height: 40 }} />
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // RENDER — HOME (calendário)
  // ═══════════════════════════════════════════════════════════
  function renderHome() {
    return (
      <>
        {/* KPIs */}
        {/* Barra de status compacta */}
        <div style={{
          background: 'var(--cbrio-card)', borderRadius: 12, border: `1px solid ${C.border}`,
          padding: '14px 24px', marginBottom: 20, display: 'flex', gap: 16, alignItems: 'center',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)', overflowX: 'auto',
        }}>
          {[
            { label: 'Eventos', value: counts.total, color: C.primary, action: () => kpiDrillDown('') },
            { label: 'No Prazo', value: counts['no-prazo'], color: C.green, action: () => kpiDrillDown('no-prazo') },
            { label: 'Em Risco', value: counts['em-risco'], color: C.amber, action: () => kpiDrillDown('em-risco') },
            { label: 'Atrasados', value: counts['atrasado'], color: C.red, action: () => kpiDrillDown('atrasado') },
            { label: 'Concluídos', value: counts['concluido'], color: C.blue, action: () => kpiDrillDown('concluido') },
            null,
            { label: 'Próx. 7d', value: k.events_next_7d || 0, color: '#8b5cf6', action: () => kpiDrillDown('') },
            { label: 'Tarefas abertas', value: k.tasks_open || 0, color: C.text2, action: () => { setTab(2); } },
            { label: 'Tarefas atrasadas', value: k.tasks_overdue || 0, color: C.red, action: () => { setTab(2); } },
            { label: 'Riscos', value: k.risks_open || 0, color: C.amber, action: () => { setTab(2); } },
            { label: 'Sem dono', value: k.events_no_owner || 0, color: C.text3, action: () => kpiDrillDown('') },
          ].map((item, i) => {
            if (!item) return <div key={i} style={{ width: 1, height: 24, background: 'var(--cbrio-border)' }} />;
            return (
              <div key={item.label} onClick={item.action}
                style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '2px 4px', borderRadius: 6, transition: 'background .15s' }}
                onMouseEnter={e => e.currentTarget.style.background = `${item.color}15`}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <span style={{ fontSize: 20, fontWeight: 800, color: item.color }}>{item.value}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--cbrio-text3)', textTransform: 'uppercase', letterSpacing: 0.3, whiteSpace: 'nowrap' }}>{item.label}</span>
              </div>
            );
          })}
        </div>

        {/* Orçamento global + Carga de trabalho */}
        {(k.budget_total > 0 || workload.length > 0) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 20 }}>
            {k.budget_total > 0 && (
              <div style={{ ...styles.card, flex: '1 1 320px', minWidth: 280 }}>
                <div style={{ padding: '20px 24px' }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--cbrio-text, #1a1a2e)', marginBottom: 12 }}>Orçamento Global</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--cbrio-text2)', marginBottom: 6 }}>
                    <span>Gasto: R$ {Number(k.budget_spent || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    <span>Aprovado: R$ {Number(k.budget_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div style={{ height: 10, background: 'var(--cbrio-border)', borderRadius: 5 }}>
                    <div style={{ height: '100%', width: `${Math.min(((k.budget_spent || 0) / k.budget_total) * 100, 100)}%`, borderRadius: 5, background: (k.budget_spent || 0) > k.budget_total ? '#ef4444' : '#10b981', transition: 'width 0.3s' }} />
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--cbrio-text3)', marginTop: 6 }}>
                    {Math.round(((k.budget_spent || 0) / (k.budget_total || 1)) * 100)}% utilizado
                  </div>
                </div>
              </div>
            )}
            {workload.length > 0 && (
              <div style={{ ...styles.card, flex: '1 1 320px', minWidth: 280 }}>
                <div style={{ padding: '20px 24px' }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--cbrio-text, #1a1a2e)', marginBottom: 12 }}>Carga de Trabalho</div>
                  {workload.slice(0, 10).map((w, i) => (
                    <div key={i} onClick={() => { window.location.href = `/planejamento?person=${encodeURIComponent(w.responsible)}`; }}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, cursor: 'pointer', padding: '3px 4px', borderRadius: 6, transition: 'background .1s' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--cbrio-bg)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--cbrio-text, #1a1a2e)', width: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.responsible}</span>
                      <div style={{ flex: 1, height: 8, background: 'var(--cbrio-border)', borderRadius: 4 }}>
                        <div style={{ height: '100%', width: `${Math.min((w.total_tasks / Math.max(...workload.map(x => x.total_tasks), 1)) * 100, 100)}%`, borderRadius: 4, background: w.atrasadas > 0 ? '#ef4444' : '#10b981', transition: 'width 0.3s' }} />
                      </div>
                      <span style={{ fontSize: 12, color: w.atrasadas > 0 ? '#ef4444' : 'var(--cbrio-text3)', fontWeight: 600, minWidth: 60, textAlign: 'right' }}>
                        {w.total_tasks} tarefas{w.atrasadas > 0 ? ` (${w.atrasadas} ⚠)` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Calendário */}
        <BigCalendar
          eventsByDate={eventsByDate}
          selectedDate={selectedDate}
          onSelectDate={(date) => setSelectedDate(date === selectedDate ? null : date)}
        />

        {/* Eventos do dia selecionado */}
        {selectedDate && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 10 }}>
              {fmtDate(selectedDate)} — {selectedDayEvents.length} evento{selectedDayEvents.length !== 1 ? 's' : ''}
            </div>
            {selectedDayEvents.length === 0 && (
              <div style={styles.empty}>Nenhum evento neste dia</div>
            )}
            {selectedDayEvents.map(ev => {
              const st = STATUS_MAP[ev.status] || {};
              return (
                <div key={ev.id} onClick={() => loadDetail(ev.id)} style={{
                  ...styles.taskCard, cursor: 'pointer', borderLeft: `4px solid ${getCatColor(ev.category_id)}`,
                  transition: 'box-shadow 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'}
                onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14, color: C.text }}>{ev.name}</div>
                      <div style={{ fontSize: 12, color: C.text2, marginTop: 2 }}>
                        {getCatName(ev.category_id)}
                        {ev.responsible && ` · ${ev.responsible}`}
                        {ev.location && ` · ${ev.location}`}
                      </div>
                    </div>
                    <Badge status={ev.status} map={STATUS_MAP} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Margem inferior */}
        <div style={{ height: 80 }} />
      </>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // RENDER — LISTA
  // ═══════════════════════════════════════════════════════════
  function renderList() {
    return (
      <>
        {/* KPIs — barra inline compacta (mesmo formato da Home) */}
        <div style={{
          background: 'var(--cbrio-card)', borderRadius: 12, border: `1px solid ${C.border}`,
          padding: '14px 24px', marginBottom: 20, display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}>
          {[
            { label: 'Eventos', value: counts.total, color: C.primary, action: () => kpiDrillDown('') },
            { label: 'No Prazo', value: counts['no-prazo'], color: C.green, action: () => kpiDrillDown('no-prazo') },
            { label: 'Em Risco', value: counts['em-risco'], color: C.amber, action: () => kpiDrillDown('em-risco') },
            { label: 'Atrasados', value: counts['atrasado'], color: C.red, action: () => kpiDrillDown('atrasado') },
            { label: 'Concluídos', value: counts['concluido'], color: C.blue, action: () => kpiDrillDown('concluido') },
            null,
            { label: 'Tarefas abertas', value: k.tasks_open || 0, color: C.text2, action: () => {} },
            { label: 'Tarefas atrasadas', value: k.tasks_overdue || 0, color: C.red, action: () => {} },
            { label: 'Riscos', value: k.risks_open || 0, color: C.amber, action: () => {} },
          ].map((item, i) => {
            if (!item) return <div key={i} style={{ width: 1, height: 24, background: 'var(--cbrio-border)' }} />;
            return (
              <div key={item.label} onClick={item.action}
                style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '2px 4px', borderRadius: 6, transition: 'background .15s' }}
                onMouseEnter={e => e.currentTarget.style.background = `${item.color}15`}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <span style={{ fontSize: 20, fontWeight: 800, color: item.color }}>{item.value}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--cbrio-text3)', textTransform: 'uppercase', letterSpacing: 0.3, whiteSpace: 'nowrap' }}>{item.label}</span>
              </div>
            );
          })}
        </div>

        {/* Filtros */}
        <div style={styles.filterRow}>
          <ShadSelect value={filtroStatus || '__all__'} onValueChange={v => setFiltroStatus(v === '__all__' ? '' : v)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Todos os status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos os status</SelectItem>
              {Object.entries(STATUS_MAP).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </ShadSelect>
          <ShadSelect value={filtroCategoria || '__all__'} onValueChange={v => setFiltroCategoria(v === '__all__' ? '' : v)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Todas as categorias" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas as categorias</SelectItem>
              {categories.map(c => (
                <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </ShadSelect>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--cbrio-text2)', cursor: 'pointer' }}>
            <input type="checkbox" checked={hideDone} onChange={e => setHideDone(e.target.checked)} />
            Esconder concluídos
          </label>
        </div>

        {/* Tabela */}
        <div style={styles.card}>
          <table style={styles.table}>
            <thead>
              <tr>
                {[{ key: 'name', label: 'Nome' }, { key: 'date', label: 'Data' }, { key: 'category', label: 'Categoria' }, { key: 'responsible', label: 'Responsável' }, { key: 'budget', label: 'Orçamento' }, { key: 'status', label: 'Status' }].map(col => (
                  <th key={col.key} style={{ ...styles.th, cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => { if (sortCol === col.key) setSortAsc(!sortAsc); else { setSortCol(col.key); setSortAsc(true); } }}>
                    {col.label} {sortCol === col.key ? (sortAsc ? '▲' : '▼') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(() => {
                let list = hideDone ? eventList.filter(e => e.status !== 'concluido') : eventList;
                list = [...list].sort((a, b) => {
                  let va, vb;
                  if (sortCol === 'name') { va = a.name || ''; vb = b.name || ''; }
                  else if (sortCol === 'date') { va = a.date || ''; vb = b.date || ''; }
                  else if (sortCol === 'status') { va = a.status || ''; vb = b.status || ''; }
                  else if (sortCol === 'responsible') { va = a.responsible || ''; vb = b.responsible || ''; }
                  else if (sortCol === 'budget') { va = Number(a.budget_planned) || 0; vb = Number(b.budget_planned) || 0; return sortAsc ? va - vb : vb - va; }
                  else { va = a.name || ''; vb = b.name || ''; }
                  return sortAsc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
                });
                if (list.length === 0) return (
                  <tr><td colSpan={6} style={styles.empty}>{loading ? 'Carregando...' : 'Nenhum evento encontrado.'}</td></tr>
                );
                return list.map(ev => (
                <tr key={ev.id} className="cbrio-row"
                  onClick={() => loadDetail(ev.id)}
                >
                  <td style={{ ...styles.td, fontWeight: 600 }}>{ev.name}</td>
                  <td style={styles.td}>{fmtDate(ev.date)}</td>
                  <td style={styles.td}>
                    <span style={styles.dot(getCatColor(ev.category_id))} />
                    {getCatName(ev.category_id)}
                  </td>
                  <td style={styles.td}>{ev.responsible || '—'}</td>
                  <td style={styles.td}>{fmtMoney(ev.budget_planned)}</td>
                  <td style={{ ...styles.td, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Badge status={ev.status} map={STATUS_MAP} />
                    <DaysCounter date={ev.next_occurrence_date || ev.date} status={ev.status} />
                  </td>
                </tr>
              ));
              })()}
            </tbody>
          </table>
        </div>
      </>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // RENDER — DETALHES
  // ═══════════════════════════════════════════════════════════
  function renderDetail() {
    if (!selectedEvent) return <div style={styles.empty}>Selecione um evento na lista.</div>;
    const ev = selectedEvent;
    const taskList = ev.tasks || [];
    const occurrences = ev.occurrences || [];
    const meetingsList = ev.meetings || [];

    return (
      <>
        <button style={styles.backBtn} onClick={() => { setTab(1); setSelectedEvent(null); }}>
          ← Voltar para lista
        </button>

        {/* Info card */}
        <div style={{ ...styles.card, marginBottom: 20 }}>
          <div style={styles.cardHeader}>
            <div>
              <div style={styles.cardTitle}>{ev.name}</div>
              <div style={{ fontSize: 12, color: C.text2, marginTop: 2 }}>
                <span style={styles.dot(getCatColor(ev.category_id))} />
                {getCatName(ev.category_id)}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Badge status={ev.status} map={STATUS_MAP} />
                              <>
                  <Button
                    variant={ev.status === 'concluido' ? 'outline' : 'default'}
                    size="sm"
                    onClick={() => toggleEventStatus(ev.id, ev.status)}
                  >
                    {ev.status === 'concluido' ? 'Reabrir' : 'Finalizar'}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setModalEvent(ev)}>Editar</Button>
                  <Button variant="destructive" size="sm" onClick={() => deleteEvent(ev.id)}>Excluir</Button>
                </>
            </div>
          </div>
          <div style={{ padding: '16px 20px' }}>
            <div style={styles.formRow}>
              <div><span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Data</span><div style={{ fontSize: 13, marginTop: 2 }}>{fmtDate(ev.date)}</div></div>
              <div><span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Local</span><div style={{ fontSize: 13, marginTop: 2 }}>{ev.location || '—'}</div></div>
            </div>
            <div style={{ ...styles.formRow, marginTop: 12 }}>
              <div><span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Responsável</span><div style={{ fontSize: 13, marginTop: 2 }}>{ev.responsible || '—'}</div></div>
              <div><span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Público esperado</span><div style={{ fontSize: 13, marginTop: 2 }}>{ev.expected_attendance || '—'}</div></div>
            </div>
            <div style={{ ...styles.formRow, marginTop: 12 }}>
              <div><span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Orçamento Previsto</span><div style={{ fontSize: 13, marginTop: 2 }}>{fmtMoney(ev.budget_planned)}</div></div>
              <div><span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Orçamento Gasto</span><div style={{ fontSize: 13, marginTop: 2 }}>{fmtMoney(ev.budget_spent)}</div></div>
            </div>
            {ev.description && (
              <div style={{ marginTop: 12 }}>
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Descrição</span>
                <div style={{ fontSize: 13, marginTop: 2, color: C.text2 }}>{ev.description}</div>
              </div>
            )}
            {ev.notes && (
              <div style={{ marginTop: 12 }}>
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Observações</span>
                <div style={{ fontSize: 13, marginTop: 2, color: C.text2 }}>{ev.notes}</div>
              </div>
            )}
            {ev.lessons_learned && (
              <div style={{ marginTop: 12 }}>
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Lições Aprendidas</span>
                <div style={{ fontSize: 13, marginTop: 2, color: C.text2 }}>{ev.lessons_learned}</div>
              </div>
            )}

            {/* Ocorrências como pills dentro do card (só recorrentes) */}
            {occurrences.length > 1 && ev.recurrence !== 'unico' && (
              <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Ocorrências ({occurrences.length})</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  {occurrences.map(occ => {
                    const occDate = normDate(occ.date);
                    const today = new Date().toISOString().slice(0, 10);
                    const isPast = occDate < today;
                    const isToday = occDate === today;
                    const statusColor = occ.status === 'concluido' ? C.green : isPast ? C.red : isToday ? C.amber : C.text3;
                    const isSelected = expandedOcc?.id === occ.id;
                    return (
                      <button key={occ.id}
                        onClick={() => { setExpandedCard(null); if (isSelected) { setExpandedOcc(null); } else { loadOccurrence(occ.id); } }}
                        style={{
                          padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                          border: isSelected ? `2px solid ${C.primary}` : `1.5px solid ${statusColor}`,
                          background: isSelected ? C.primaryBg : `${statusColor}10`,
                          color: isSelected ? C.primary : statusColor,
                          transition: 'all 0.15s',
                        }}>
                        {fmtDate(occ.date)}
                        {occ.status === 'concluido' && ' ✓'}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Contexto: ocorrência selecionada (só recorrentes) */}
        {expandedOcc && ev.recurrence !== 'unico' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, padding: '8px 14px', background: 'var(--cbrio-bg)', borderRadius: 8, border: `1px solid ${C.border}` }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Visualizando: {fmtDate(expandedOcc.date)}</span>
            <span style={styles.badge(expandedOcc.status === 'concluido' ? C.green : C.text3, expandedOcc.status === 'concluido' ? `${C.green}15` : 'var(--cbrio-bg)')}>
              {expandedOcc.status === 'concluido' ? 'Concluído' : 'Pendente'}
            </span>
            <Button variant={expandedOcc.status === 'concluido' ? 'outline' : 'default'} size="sm"
              onClick={async () => {
                const ns = expandedOcc.status === 'concluido' ? 'pendente' : 'concluido';
                try { await events.updateOccurrence(ev.id, expandedOcc.id, { status: ns }); refreshDetail(); loadOccurrence(expandedOcc.id); dashApi.pmo().then(setPmoKpis).catch(() => {}); }
                catch (err) { setError(err.message); }
              }}>
              {expandedOcc.status === 'concluido' ? 'Reabrir' : 'Finalizar'}
            </Button>
          </div>
        )}

        {/* ── ABAS FIXAS ── */}
        <div style={styles.tabs}>
          {[
            ...(!hasCycle ? [{ key: 'tarefas', label: `Tarefas (${expandedOcc ? (expandedOcc.tasks?.length || 0) : taskList.length})` }] : []),
            { key: 'reunioes', label: `Reuniões (${expandedOcc ? (expandedOcc.meetings?.length || 0) : meetingsList.length})` },
            { key: 'riscos', label: `Riscos (${eventRisks.length})` },
            { key: 'historico', label: `Histórico (${auditHistory.length})` },
            { key: 'relatorios', label: 'Relatórios' },
            ...(ev.status === 'concluido' ? [{ key: 'retro', label: 'Retrospectiva' }] : []),
          ].map(t => (
            <button key={t.key} style={styles.tab(detailTab === t.key)} onClick={() => { setDetailTab(t.key); setExpandedCard(null); }}>{t.label}</button>
          ))}
        </div>

        {/* ── ABA: Tarefas ── */}
        {detailTab === 'tarefas' && !expandedOcc && <>
        <div style={{ padding: '20px 0 60px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--cbrio-text, #1a1a2e)' }}>Tarefas do Evento ({taskList.length})</div>
          <Button size="sm" onClick={() => setModalTask({})}>+ Tarefa</Button>
        </div>

        {taskList.length === 0 && <div style={styles.empty}>Nenhuma tarefa cadastrada.</div>}
        {taskList.map(task => {
          const isOpen = expandedCard === `task-${task.id}`;
          const subsDone = (task.subtasks || []).filter(s => s.done).length;
          const subsTotal = (task.subtasks || []).length;
          return (
          <div key={task.id} style={{ ...styles.taskCard, cursor: 'pointer', transition: 'box-shadow 0.15s' }}
            onClick={() => setExpandedCard(isOpen ? null : `task-${task.id}`)}
            onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'}
            onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>
            {/* Resumo (sempre visível) */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                <span style={{ color: C.text3, fontSize: 12 }}>{isOpen ? '▼' : '▶'}</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: C.text }}>
                    {task.is_milestone && <span style={{ color: C.amber, marginRight: 4 }}>★</span>}
                    {task.name}
                  </div>
                  <div style={{ fontSize: 12, color: C.text2, marginTop: 2 }}>
                    {task.responsible || 'Sem responsável'}
                    {task.deadline && ` · ${fmtDate(task.deadline)}`}
                    {subsTotal > 0 && ` · ${subsDone}/${subsTotal} subtarefas`}
                    {(task.comments || []).length > 0 && ` · ${task.comments.length} comentários`}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                {task.priority && <Badge status={task.priority} map={PRIORITY_MAP} />}
                <Badge status={task.status} map={TASK_STATUS_MAP} />
                <ShadSelect value={task.status} onValueChange={v => changeTaskStatus(task.id, v)}>
                  <SelectTrigger className="w-[130px] h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TASK_STATUS_MAP).map(([k, v]) => (<SelectItem key={k} value={k}>{v.label}</SelectItem>))}
                  </SelectContent>
                </ShadSelect>
              </div>
            </div>

            {/* Detalhe expandido */}
            {isOpen && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}` }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                  <Button variant="ghost" size="sm" onClick={() => setModalTask(task)}>Editar</Button>
                  <Button variant="ghost" size="sm" className="text-destructive" onClick={() => deleteTask(task.id)}>Excluir</Button>
                </div>

                {task.description && <div style={{ fontSize: 12, color: C.text2, marginBottom: 8 }}>{task.description}</div>}
                {task.area && <div style={{ fontSize: 12, color: C.text3, marginBottom: 8 }}>Área: {task.area}</div>}

                {/* Subtasks */}
                {subsTotal > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: C.text2, marginBottom: 4 }}>Subtarefas ({subsDone}/{subsTotal})</div>
                    {task.subtasks.map(sub => (
                      <div key={sub.id} style={styles.subtaskRow}>
                        <input type="checkbox" checked={!!sub.done} onChange={() => toggleSubtask(sub.id, !sub.done)} style={{ cursor: 'pointer' }} />
                        <span style={sub.done ? { textDecoration: 'line-through', color: C.text3 } : {}}>{sub.name}</span>
                        <button style={{ background: 'none', border: 'none', color: C.text3, cursor: 'pointer', fontSize: 11, padding: '0 4px' }} onClick={() => deleteSubtask(sub.id)}>✕</button>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                  <input style={styles.inlineInput} placeholder="Nova subtarefa..." value={newSubtask[task.id] || ''}
                    onChange={e => setNewSubtask(prev => ({ ...prev, [task.id]: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && addSubtask(task.id)} />
                  <button style={styles.inlineBtn} onClick={() => addSubtask(task.id)}>+</button>
                </div>

                {/* Comments */}
                {(task.comments || []).length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: C.text2, marginBottom: 4 }}>Comentários</div>
                    {task.comments.map(c => (
                      <div key={c.id} style={styles.commentBox}>
                        <div style={{ fontWeight: 600, fontSize: 11, color: C.text }}>{c.author_name || c.author || 'Anônimo'}</div>
                        <div style={{ marginTop: 2 }}>{c.text}</div>
                        <div style={{ fontSize: 10, color: C.text3, marginTop: 2 }}>{c.created_at ? new Date(c.created_at).toLocaleString('pt-BR') : ''}</div>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6 }}>
                  <input style={styles.inlineInput} placeholder="Adicionar comentário..." value={newComment[task.id] || ''}
                    onChange={e => setNewComment(prev => ({ ...prev, [task.id]: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && addComment(task.id)} />
                  <button style={styles.inlineBtn} onClick={() => addComment(task.id)}>Enviar</button>
                </div>
              </div>
            )}
          </div>
          );
        })}
        </div>
        </>}

        {/* ── ABA: Reuniões (evento) ── */}
        {detailTab === 'reunioes' && !expandedOcc && (
          <div style={{ padding: '20px 0 60px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--cbrio-text, #1a1a2e)' }}>Reuniões do Evento ({meetingsList.length})</div>
              <Button size="sm" onClick={() => setModalTask(null)}>+ Reunião</Button>
            </div>
            {meetingsList.length === 0 && <div style={styles.empty}>Nenhuma reunião cadastrada</div>}
            {meetingsList.map(m => {
              const isOpen = expandedCard === `meeting-${m.id}`;
              const pendsCount = (m.pendencies || []).length;
              const pendsDone = (m.pendencies || []).filter(p => p.done).length;
              return (
              <div key={m.id} style={{ ...styles.taskCard, cursor: 'pointer', transition: 'box-shadow 0.15s' }}
                onClick={() => setExpandedCard(isOpen ? null : `meeting-${m.id}`)}
                onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'}
                onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>
                {/* Resumo */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                    <span style={{ color: C.text3, fontSize: 12 }}>{isOpen ? '▼' : '▶'}</span>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14, color: C.text }}>{m.title || 'Reunião'}</div>
                      <div style={{ fontSize: 12, color: C.text2, marginTop: 2 }}>
                        {fmtDate(m.date)}
                        {m.participants?.length > 0 && ` · ${m.participants.join(', ')}`}
                        {pendsCount > 0 && ` · ${pendsDone}/${pendsCount} pendências`}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Detalhe expandido */}
                {isOpen && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}` }} onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                      <Button variant="ghost" size="sm" className="text-destructive"
                        onClick={async () => { if (window.confirm('Excluir reunião?')) { await meetings.remove(m.id); refreshDetail(); } }}>Excluir</Button>
                    </div>
                    {m.decisions && <div style={{ fontSize: 12, color: C.text2, marginBottom: 6 }}><strong>Decisões:</strong> {m.decisions}</div>}
                    {m.notes && <div style={{ fontSize: 12, color: C.text3, marginBottom: 6 }}><strong>Notas:</strong> {m.notes}</div>}
                    {pendsCount > 0 && (
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: C.text2, marginBottom: 4 }}>Pendências ({pendsDone}/{pendsCount})</div>
                        {m.pendencies.map(p => (
                          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '3px 0' }}>
                            <input type="checkbox" checked={p.done}
                              onChange={async () => { await meetings.togglePendency(p.id, !p.done); refreshDetail(); }} />
                            <span style={p.done ? { textDecoration: 'line-through', color: C.text3 } : { color: C.text }}>{p.description || p.text}</span>
                            {p.responsible && <span style={{ fontSize: 10, color: C.text3 }}>({p.responsible})</span>}
                            {p.deadline && <span style={{ fontSize: 10, color: C.text3 }}>{fmtDate(p.deadline)}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              );
            })}
          </div>
        )}

        {/* ── ABA: Tarefas (ocorrência) ── */}
        {detailTab === 'tarefas' && expandedOcc && (
          <div style={{ padding: '20px 0 60px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--cbrio-text, #1a1a2e)' }}>Tarefas — {fmtDate(expandedOcc.date)} ({expandedOcc.tasks?.length || 0})</div>
            </div>
            {(expandedOcc.tasks || []).length === 0 && <div style={styles.empty}>Nenhuma tarefa nesta ocorrência</div>}
            {(expandedOcc.tasks || []).map(task => {
              const isOpen = expandedCard === `occtask-${task.id}`;
              return (
              <div key={task.id} style={{ ...styles.taskCard, cursor: 'pointer', transition: 'box-shadow 0.15s' }}
                onClick={() => setExpandedCard(isOpen ? null : `occtask-${task.id}`)}
                onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'}
                onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                    <span style={{ color: C.text3, fontSize: 12 }}>{isOpen ? '▼' : '▶'}</span>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14, color: C.text }}>{task.name}</div>
                      <div style={{ fontSize: 12, color: C.text2, marginTop: 2 }}>
                        {task.responsible || 'Sem responsável'}
                        {task.deadline && ` · ${fmtDate(task.deadline)}`}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                    <Badge status={task.status} map={TASK_STATUS_MAP} />
                    <ShadSelect value={task.status} onValueChange={v => changeOccTaskStatus(task.id, v, expandedOcc.id)}>
                      <SelectTrigger className="w-[130px] h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pendente">Pendente</SelectItem>
                        <SelectItem value="em-andamento">Em andamento</SelectItem>
                        <SelectItem value="concluida">Concluída</SelectItem>
                      </SelectContent>
                    </ShadSelect>
                  </div>
                </div>
                {isOpen && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}` }} onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => deleteOccTask(task.id, expandedOcc.id)}>Excluir</Button>
                    </div>
                    {task.description && <div style={{ fontSize: 12, color: C.text2, marginBottom: 6 }}>{task.description}</div>}
                    {task.area && <div style={{ fontSize: 12, color: C.text3 }}>Área: {task.area}</div>}
                  </div>
                )}
              </div>
              );
            })}
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <input style={styles.inlineInput} placeholder="Nova tarefa..." value={occTaskName}
                onChange={e => setOccTaskName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addOccTask(expandedOcc.id)} />
              <button style={styles.inlineBtn} onClick={() => addOccTask(expandedOcc.id)}>+</button>
            </div>
          </div>
        )}


        {/* ── ABA: Reuniões (ocorrência) ── */}
        {detailTab === 'reunioes' && expandedOcc && (
          <div style={{ padding: '20px 0 60px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--cbrio-text, #1a1a2e)' }}>Reuniões — {fmtDate(expandedOcc.date)} ({expandedOcc.meetings?.length || 0})</div>
            </div>
            {(expandedOcc.meetings || []).length === 0 && <div style={styles.empty}>Nenhuma reunião nesta ocorrência</div>}
            {(expandedOcc.meetings || []).map(m => {
              const isOpen = expandedCard === `occmeeting-${m.id}`;
              const pendsCount = (m.pendencies || []).length;
              const pendsDone = (m.pendencies || []).filter(p => p.done).length;
              return (
              <div key={m.id} style={{ ...styles.taskCard, cursor: 'pointer', transition: 'box-shadow 0.15s' }}
                onClick={() => setExpandedCard(isOpen ? null : `occmeeting-${m.id}`)}
                onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'}
                onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                    <span style={{ color: C.text3, fontSize: 12 }}>{isOpen ? '▼' : '▶'}</span>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14, color: C.text }}>{m.title || 'Reunião'}</div>
                      <div style={{ fontSize: 12, color: C.text2, marginTop: 2 }}>
                        {fmtDate(m.date)}
                        {m.participants?.length > 0 && ` · ${m.participants.join(', ')}`}
                        {pendsCount > 0 && ` · ${pendsDone}/${pendsCount} pendências`}
                      </div>
                    </div>
                  </div>
                </div>
                {isOpen && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}` }} onClick={e => e.stopPropagation()}>
                    {m.decisions && <div style={{ fontSize: 12, color: C.text2, marginBottom: 6 }}><strong>Decisões:</strong> {m.decisions}</div>}
                    {m.notes && <div style={{ fontSize: 12, color: C.text3, marginBottom: 6 }}><strong>Notas:</strong> {m.notes}</div>}
                    {pendsCount > 0 && (
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: C.text2, marginBottom: 4 }}>Pendências ({pendsDone}/{pendsCount})</div>
                        {m.pendencies.map(p => (
                          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '3px 0' }}>
                            <input type="checkbox" checked={p.done} onChange={() => toggleOccPendency(p.id, p.done, expandedOcc.id)} />
                            <span style={p.done ? { textDecoration: 'line-through', color: C.text3 } : { color: C.text }}>{p.description}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              );
            })}
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <input style={{ ...styles.inlineInput, flex: 2 }} placeholder="Título da reunião..." value={occMeetingTitle} onChange={e => setOccMeetingTitle(e.target.value)} />
              <input type="date" style={{ ...styles.inlineInput, flex: 1 }} value={occMeetingDate} onChange={e => setOccMeetingDate(e.target.value)} />
              <button style={styles.inlineBtn} onClick={() => addOccMeeting(expandedOcc.id)}>+</button>
            </div>
          </div>
        )}

        {/* ── ABA: Riscos ── */}
        {detailTab === 'riscos' && (
          <div style={{ padding: '20px 0 60px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--cbrio-text, #1a1a2e)' }}>Riscos do Evento ({eventRisks.length})</div>
              <Button size="sm" onClick={() => setShowRiskForm(true)}>+ Risco</Button>
            </div>
            {eventRisks.length === 0 && <div style={styles.empty}>Nenhum risco registrado</div>}
            {eventRisks.map(risk => {
              const scoreColor = risk.score >= 15 ? C.red : risk.score >= 9 ? C.amber : C.green;
              const isOpen = expandedCard === `risk-${risk.id}`;
              return (
                <div key={risk.id} style={{ ...styles.taskCard, cursor: 'pointer', transition: 'box-shadow 0.15s' }}
                  onClick={() => setExpandedCard(isOpen ? null : `risk-${risk.id}`)}
                  onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'}
                  onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>
                  {/* Resumo */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                      <span style={{ color: C.text3, fontSize: 12 }}>{isOpen ? '▼' : '▶'}</span>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: scoreColor, flexShrink: 0 }} />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14, color: C.text }}>{risk.title}</div>
                        <div style={{ fontSize: 12, color: C.text2, marginTop: 2 }}>
                          Score: {risk.score} · {risk.category} · {risk.status}
                          {risk.owner_name && ` · ${risk.owner_name}`}
                        </div>
                      </div>
                    </div>
                    <span style={styles.badge(scoreColor, `${scoreColor}15`)}>{risk.score}</span>
                  </div>

                  {/* Detalhe expandido */}
                  {isOpen && (
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}` }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                        <ShadSelect value={risk.status} onValueChange={async v => { await risksApi.update(risk.id, { status: v }); risksApi.list(ev.id).then(setEventRisks); }}>
                          <SelectTrigger className="w-[140px] h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {['aberto','mitigando','mitigado','aceito','fechado'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                          </SelectContent>
                        </ShadSelect>
                        <Button variant="ghost" size="sm" className="text-destructive"
                          onClick={async () => { if (window.confirm('Excluir risco?')) { await risksApi.remove(risk.id); risksApi.list(ev.id).then(setEventRisks); } }}>Excluir</Button>
                      </div>
                      {risk.description && <div style={{ fontSize: 12, color: C.text2, marginBottom: 6 }}>{risk.description}</div>}
                      <div style={{ fontSize: 12, color: C.text2, marginBottom: 4 }}>Probabilidade: {risk.probability}/5 · Impacto: {risk.impact}/5</div>
                      {risk.mitigation && <div style={{ fontSize: 12, color: C.text2, marginBottom: 4 }}><strong>Mitigação:</strong> {risk.mitigation}</div>}
                      {risk.owner_name && <div style={{ fontSize: 12, color: C.text3 }}>Responsável: {risk.owner_name}{risk.target_date ? ` · Prazo: ${fmtDate(risk.target_date)}` : ''}</div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── ABA: Histórico ── */}
        {detailTab === 'historico' && (
          <div style={{ padding: '20px 0 60px' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--cbrio-text, #1a1a2e)', marginBottom: 16 }}>Histórico de Alterações</div>
            {auditHistory.length === 0 && <div style={styles.empty}>Nenhuma alteração registrada</div>}
            {auditHistory.map(h => (
              <div key={h.id} style={{ display: 'flex', gap: 8, padding: '8px 0', borderBottom: `1px solid ${C.border}`, fontSize: 12 }}>
                <span style={{ color: C.text3, minWidth: 120 }}>{new Date(h.created_at).toLocaleString('pt-BR')}</span>
                <span style={{ color: C.text2, minWidth: 80 }}>{h.changed_by_name || '—'}</span>
                <span style={{ color: C.text, flex: 1 }}>{h.description || `${h.action}: ${h.field_name || h.table_name}`}</span>
                {h.old_value && h.new_value && <span style={{ color: C.text3 }}>{h.old_value} → {h.new_value}</span>}
              </div>
            ))}
          </div>
        )}

        {/* ── ABA: Ciclo Criativo (só se ativado) ── */}
        {detailTab === 'ciclo' && (
          <div>
            <BudgetPanel eventId={ev.id} budget={null} onReload={() => refreshDetail()} />
            <CycleView eventId={ev.id} eventName={ev.name} />
          </div>
        )}

        {/* ── ABA: Relatórios IA ── */}
        {detailTab === 'relatorios' && (
          <ReportTab eventId={ev.id} isPMO={isPMO} />
        )}

        {/* ── ABA: Retrospectiva (só evento concluído) ── */}
        {detailTab === 'retro' && (
          <div>
            {retroData ? (
              <div style={styles.card}>
                <div style={{ padding: '16px 20px' }}>
                  {retroData.overall_rating && <div style={{ fontSize: 14, marginBottom: 10 }}>Avaliação: {'★'.repeat(retroData.overall_rating)}{'☆'.repeat(5 - retroData.overall_rating)}</div>}
                  {retroData.what_went_well && <div style={{ marginBottom: 10 }}><span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">O que foi bem</span><div style={{ fontSize: 13, color: C.text2 }}>{retroData.what_went_well}</div></div>}
                  {retroData.what_to_improve && <div style={{ marginBottom: 10 }}><span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">O que melhorar</span><div style={{ fontSize: 13, color: C.text2 }}>{retroData.what_to_improve}</div></div>}
                  {retroData.action_items && <div><span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Ações</span><div style={{ fontSize: 13, color: C.text2 }}>{retroData.action_items}</div></div>}
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: 24 }}>
                <div style={{ color: C.text3, fontSize: 13, marginBottom: 12 }}>Nenhuma retrospectiva registrada</div>
                <Button onClick={() => setShowRetroForm(true)}>Preencher Retrospectiva</Button>
              </div>
            )}
          </div>
        )}

        {/* Modal: Novo risco */}
        {showRiskForm && (
          <Modal open onClose={() => setShowRiskForm(false)} title="Novo Risco"
            footer={<>
              <Button variant="ghost" onClick={() => setShowRiskForm(false)}>Cancelar</Button>
              <Button onClick={async () => {
                const f = document.getElementById('risk-form');
                const fd = new FormData(f);
                const data = Object.fromEntries(fd.entries());
                data.probability = parseInt(data.probability); data.impact = parseInt(data.impact);
                await risksApi.create(ev.id, data);
                setShowRiskForm(false);
                risksApi.list(ev.id).then(setEventRisks);
              }}>Salvar</Button>
            </>}>
            <form id="risk-form" onSubmit={e => e.preventDefault()}>
              <Input label="Título" name="title" required />
              <Textarea label="Descrição" name="description" />
              <div style={styles.formRow}>
                <Select label="Categoria" name="category">
                  <option value="timeline">Timeline</option><option value="budget">Orçamento</option>
                  <option value="resources">Recursos</option><option value="quality">Qualidade</option>
                  <option value="stakeholder">Stakeholder</option><option value="other">Outro</option>
                </Select>
                <Select label="Probabilidade (1-5)" name="probability" defaultValue="3">
                  {[1,2,3,4,5].map(n => <option key={n} value={n}>{n} - {['Rara','Baixa','Média','Alta','Muito Alta'][n-1]}</option>)}
                </Select>
              </div>
              <div style={styles.formRow}>
                <Select label="Impacto (1-5)" name="impact" defaultValue="3">
                  {[1,2,3,4,5].map(n => <option key={n} value={n}>{n} - {['Insignificante','Baixo','Moderado','Grave','Catastrófico'][n-1]}</option>)}
                </Select>
                <Input label="Responsável" name="owner_name" />
              </div>
              <Textarea label="Estratégia de mitigação" name="mitigation" />
              <Input label="Data alvo" name="target_date" type="date" />
            </form>
          </Modal>
        )}

        {/* Modal: Retrospectiva */}
        {showRetroForm && (
          <Modal open onClose={() => setShowRetroForm(false)} title="Retrospectiva do Evento"
            footer={<>
              <Button variant="ghost" onClick={() => setShowRetroForm(false)}>Cancelar</Button>
              <Button onClick={async () => {
                const f = document.getElementById('retro-form');
                const fd = new FormData(f);
                const data = Object.fromEntries(fd.entries());
                if (data.overall_rating) data.overall_rating = parseInt(data.overall_rating);
                await retroApi.save(ev.id, data);
                setShowRetroForm(false);
                retroApi.get(ev.id).then(setRetroData);
              }}>Salvar</Button>
            </>}>
            <form id="retro-form" onSubmit={e => e.preventDefault()}>
              <Select label="Avaliação geral" name="overall_rating">
                <option value="">Selecionar...</option>
                {[5,4,3,2,1].map(n => <option key={n} value={n}>{'★'.repeat(n)} ({n}/5)</option>)}
              </Select>
              <Textarea label="O que foi bem?" name="what_went_well" />
              <Textarea label="O que pode melhorar?" name="what_to_improve" />
              <Textarea label="Ações para próximos eventos" name="action_items" />
              <Textarea label="Feedback dos participantes" name="attendee_feedback" />
            </form>
          </Modal>
        )}
      </>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // MODAL — EVENTO
  // ═══════════════════════════════════════════════════════════
  function renderEventModal() {
    const isEdit = modalEvent && modalEvent.id;
    return (
      <Modal
        open={!!modalEvent}
        onClose={() => setModalEvent(null)}
        title={isEdit ? 'Editar Evento' : 'Novo Evento'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalEvent(null)}>Cancelar</Button>
            <Button onClick={() => {
              const f = document.getElementById('event-form');
              const fd = new FormData(f);
              const data = Object.fromEntries(fd.entries());
              if (data.budget_planned) data.budget_planned = parseFloat(data.budget_planned);
              if (data.budget_spent) data.budget_spent = parseFloat(data.budget_spent);
              if (data.expected_attendance) data.expected_attendance = parseInt(data.expected_attendance);
              if (data.actual_attendance) data.actual_attendance = parseInt(data.actual_attendance);
              if (isEdit) data.id = modalEvent.id;
              saveEvent(data);
            }}>Salvar</Button>
          </>
        }
      >
        <form id="event-form" onSubmit={e => e.preventDefault()}>
          <Input label="Nome" name="name" defaultValue={modalEvent?.name || ''} required />
          <div style={styles.formRow}>
            <Input label="Data" name="date" type="date" defaultValue={modalEvent?.date || ''} />
            <Select label="Categoria" name="category_id" defaultValue={modalEvent?.category_id || ''}>
              <option value="">Selecione...</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          <div style={styles.formRow}>
            <Input label="Local" name="location" defaultValue={modalEvent?.location || ''} />
            <Input label="Responsável" name="responsible" defaultValue={modalEvent?.responsible || ''} />
          </div>
          <div style={styles.formRow}>
            <Input label="Orçamento Previsto" name="budget_planned" type="number" step="0.01" defaultValue={modalEvent?.budget_planned || ''} />
            {isEdit && <Input label="Orçamento Gasto" name="budget_spent" type="number" step="0.01" defaultValue={modalEvent?.budget_spent || ''} />}
          </div>
          <div style={styles.formRow}>
            <Input label="Público Esperado" name="expected_attendance" type="number" defaultValue={modalEvent?.expected_attendance || ''} />
            {isEdit && <Input label="Público Real" name="actual_attendance" type="number" defaultValue={modalEvent?.actual_attendance || ''} />}
          </div>
          <Select label="Recorrência" name="recurrence" defaultValue={modalEvent?.recurrence || ''}>
            <option value="">Nenhuma</option>
            <option value="semanal">Semanal</option>
            <option value="quinzenal">Quinzenal</option>
            <option value="mensal">Mensal</option>
            <option value="anual">Anual</option>
          </Select>
          {isEdit && (
            <Select label="Status" name="status" defaultValue={modalEvent?.status || 'no-prazo'}>
              {Object.entries(STATUS_MAP).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </Select>
          )}
          <Textarea label="Descrição" name="description" defaultValue={modalEvent?.description || ''} />
          <Textarea label="Observações" name="notes" defaultValue={modalEvent?.notes || ''} />
          {isEdit && <Textarea label="Lições Aprendidas" name="lessons_learned" defaultValue={modalEvent?.lessons_learned || ''} />}

          {/* Ciclo Criativo */}
          {isEdit && hasCycle && selectedEvent?.id === modalEvent?.id ? (
            <div style={{ padding: '12px 14px', background: '#10b98120', borderRadius: 8, border: '1px solid #10b98140', display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#10b981' }}>✓ Ciclo Criativo ativado</span>
            </div>
          ) : (
            <div style={{ padding: '12px 14px', background: '#00B39D15', borderRadius: 8, border: '1px solid #00B39D40', display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
              <input type="checkbox" name="ativar_ciclo" id="ciclo-modal" value="true" style={{ width: 18, height: 18, cursor: 'pointer' }} />
              <label htmlFor="ciclo-modal" style={{ fontSize: 14, color: '#00B39D', fontWeight: 600, cursor: 'pointer' }}>
                Ativar Ciclo Criativo
              </label>
              <span style={{ fontSize: 12, color: C.text3 }}>— 11 fases de produção + trilha administrativa</span>
            </div>
          )}
        </form>
      </Modal>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // MODAL — TAREFA
  // ═══════════════════════════════════════════════════════════
  function renderTaskModal() {
    const isEdit = modalTask && modalTask.id;
    return (
      <Modal
        open={!!modalTask}
        onClose={() => setModalTask(null)}
        title={isEdit ? 'Editar Tarefa' : 'Nova Tarefa'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalTask(null)}>Cancelar</Button>
            <Button onClick={() => {
              const f = document.getElementById('task-form');
              const fd = new FormData(f);
              const data = Object.fromEntries(fd.entries());
              data.is_milestone = data.is_milestone === 'true';
              if (isEdit) data.id = modalTask.id;
              saveTask(data);
            }}>Salvar</Button>
          </>
        }
      >
        <form id="task-form" onSubmit={e => e.preventDefault()}>
          <Input label="Nome" name="name" defaultValue={modalTask?.name || ''} required />
          <div style={styles.formRow}>
            <div style={styles.formGroup}>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Responsável</label>
              <input list="people-list" className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm shadow-black/5 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" name="responsible" defaultValue={modalTask?.responsible || ''} placeholder="Buscar pessoa..." autoComplete="off" />
              <datalist id="people-list">
                {usersList.map(u => <option key={u.id} value={u.name || u.full_name || u.email} />)}
              </datalist>
            </div>
            <Input label="Área" name="area" defaultValue={modalTask?.area || ''} />
          </div>
          <div style={styles.formRow}>
            <Input label="Data Início" name="start_date" type="date" defaultValue={modalTask?.start_date || ''} />
            <Input label="Prazo" name="deadline" type="date" defaultValue={modalTask?.deadline || ''} />
          </div>
          <div style={styles.formRow}>
            <Select label="Status" name="status" defaultValue={modalTask?.status || 'pendente'}>
              {Object.entries(TASK_STATUS_MAP).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </Select>
            <Select label="Prioridade" name="priority" defaultValue={modalTask?.priority || 'media'}>
              {Object.entries(PRIORITY_MAP).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </Select>
          </div>
          <Select label="Marco (Milestone)" name="is_milestone" defaultValue={modalTask?.is_milestone ? 'true' : 'false'}>
            <option value="false">Não</option>
            <option value="true">Sim</option>
          </Select>
          <Textarea label="Descrição" name="description" defaultValue={modalTask?.description || ''} />
        </form>
      </Modal>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // RENDER PRINCIPAL
  // ═══════════════════════════════════════════════════════════
  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <div style={styles.title}>Eventos</div>
          <div style={styles.subtitle}>Gestão de eventos da igreja</div>
        </div>
        {(tab <= 3) && (
          <Button onClick={() => setModalEvent({})}>+ Novo Evento</Button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div style={{ ...styles.badge(C.red, C.redBg), padding: '8px 14px', marginBottom: 16, fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{error}</span>
          <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setError('')}>✕</Button>
        </div>
      )}

      {/* Tabs */}
      <div style={styles.tabs}>
        <button style={styles.tab(tab === 0)} onClick={() => setTab(0)}>Home</button>
        <button style={styles.tab(tab === 1)} onClick={() => setTab(1)}>Lista</button>
        <button style={styles.tab(tab === 2)} onClick={() => { setTab(2); if (!kanbanCycleData) loadKanban(); }}>Kanban</button>
        <button style={styles.tab(tab === 3)} onClick={() => { setTab(3); if (!kanbanCycleData) loadKanban(); }}>Gantt</button>
        <button style={styles.tab(tab === 5)} onClick={() => { setTab(5); if (!kpiData) loadKpis(kpiTipo); }}>KPIs</button>
        {accessLevel >= 5 && <button style={styles.tab(tab === 6)} onClick={async () => { setTab(6); if (!admTemplatesLoaded) { const d = await cyclesApi.admTemplates(); setAdmTemplates(d || []); setAdmTemplatesLoaded(true); } }}>Templates</button>}
        {selectedEvent && <button style={styles.tab(tab === 4)} onClick={() => setTab(4)}>Detalhes</button>}
      </div>

      {/* Content */}
      {tab === 0 && renderHome()}
      {tab === 1 && renderList()}
      {tab === 2 && renderKanban()}
      {tab === 3 && renderGantt()}
      {tab === 4 && renderDetail()}
      {tab === 5 && renderKPIs()}
      {tab === 6 && renderTemplates()}

      {/* KPI Doc Resumo Modal */}
      {kpiDocModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)' }} onClick={() => setKpiDocModal(null)}>
          <div style={{ background: 'var(--cbrio-modal-bg)', borderRadius: 16, padding: 24, maxWidth: 550, width: '90%', maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{kpiDocModal.doc?.card_titulo}</span>
              <button onClick={() => setKpiDocModal(null)} style={{ background: 'none', border: 'none', fontSize: 18, color: C.t3, cursor: 'pointer' }}>{'\u2715'}</button>
            </div>

            {/* Info do documento */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: C.primaryBg, color: C.primary }}>{kpiDocModal.doc?.area}</span>
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: C.bg, color: C.t3, border: `1px solid ${C.border}` }}>{kpiDocModal.doc?.fase}</span>
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: scoreColor(kpiDocModal.doc?.score || 0) + '20', color: scoreColor(kpiDocModal.doc?.score || 0), fontWeight: 700 }}>Score: {kpiDocModal.doc?.score || 0}%</span>
            </div>

            {/* Score breakdown do doc */}
            <div style={{ background: C.bg, borderRadius: 10, padding: 12, marginBottom: 16, border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.t2, marginBottom: 8 }}>Composicao do Score</div>
              {[
                { label: 'Entrega no prazo', pts: 40, ok: kpiDocModal.doc?.on_time !== false && kpiDocModal.doc?.status === 'concluida', icon: '\u23f0' },
                { label: 'Aprovado', pts: 30, ok: !!kpiDocModal.doc?.approved_by, icon: '\u2705' },
                { label: 'Qualidade OK', pts: 20, ok: kpiDocModal.doc?.quality_rating === 'ok', icon: '\u2b50' },
                { label: 'Arquivo anexado', pts: 10, ok: !!kpiDocModal.doc?.file_name, icon: '\ud83d\udcce' },
              ].map(s => (
                <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, fontSize: 12 }}>
                  <span>{s.icon}</span>
                  <span style={{ flex: 1, color: C.text }}>{s.label}</span>
                  <span style={{ fontWeight: 700, color: s.ok ? '#10b981' : C.t3 }}>{s.ok ? `+${s.pts}%` : '0%'}</span>
                </div>
              ))}
            </div>

            {/* Resumo do Cerebro */}
            <div style={{ fontSize: 12, fontWeight: 600, color: C.t2, marginBottom: 8 }}>Resumo do Documento (Cerebro)</div>
            {kpiDocModal.loading ? (
              <div style={{ padding: 16, textAlign: 'center', color: C.t3, fontSize: 12 }}>Carregando resumo...</div>
            ) : kpiDocModal.resumo ? (
              <div style={{ background: C.bg, borderRadius: 10, padding: 14, border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 13, color: C.text, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{kpiDocModal.resumo}</div>
                {kpiDocModal.tags?.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 10 }}>
                    {kpiDocModal.tags.map(t => (
                      <span key={t} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 99, background: C.primaryBg, color: C.primary }}>{t}</span>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ padding: 16, textAlign: 'center', color: C.t3, fontSize: 12, background: C.bg, borderRadius: 10, border: `1px solid ${C.border}` }}>
                {kpiDocModal.file_name ? 'Documento ainda nao processado pelo Cerebro. O resumo aparece apos o proximo ciclo do agente.' : 'Nenhum arquivo anexado a este card.'}
              </div>
            )}

            {/* Link para arquivo */}
            {kpiDocModal.file_url && (
              <a href={kpiDocModal.file_url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', marginTop: 12, fontSize: 12, color: C.primary, fontWeight: 600 }}>Abrir arquivo original</a>
            )}
          </div>
        </div>
      )}

      {/* KPI Config Modal */}
      {renderKpiConfig()}

      {/* Modals */}
      {renderEventModal()}
      {renderTaskModal()}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ReportTab — Gerar e visualizar relatórios IA do evento
// ═══════════════════════════════════════════════════════════
function ReportTab({ eventId, isPMO }) {
  const [reportsList, setReportsList] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [viewReport, setViewReport] = useState(null);
  const [reportType, setReportType] = useState('full');

  useEffect(() => {
    reportsApi.list(eventId).then(setReportsList).catch(() => {});
  }, [eventId]);

  const [exporting, setExporting] = useState('');

  const generate = async () => {
    setGenerating(true);
    setError('');
    try {
      const report = await reportsApi.generate(eventId, { type: reportType });
      setReportsList(prev => [report, ...prev]);
      setViewReport(report);
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const downloadExport = async (reportId, format) => {
    setExporting(format);
    try {
      const res = await fetch(`${API}/events/${eventId}/report/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}` },
        body: JSON.stringify({ reportId, format }),
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = format === 'pptx' ? `Apresentacao_CBRio.pptx` : `Documento_CBRio.docx`;
      a.click();
    } catch (e) { setError('Erro ao exportar: ' + e.message); }
    finally { setExporting(''); }
  };

  return (
    <div style={{ padding: '20px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--cbrio-text)' }}>Relatórios do Evento</div>
        {isPMO && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <ShadSelect value={reportType} onValueChange={v => setReportType(v)}>
              <SelectTrigger className="w-[180px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="full">Evento Completo</SelectItem>
                <SelectItem value="phase">Por Fase</SelectItem>
              </SelectContent>
            </ShadSelect>
            <button onClick={generate} disabled={generating}
              style={{
                padding: '8px 16px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 600,
                background: generating ? '#9ca3af' : '#7c3aed', color: '#fff', cursor: generating ? 'wait' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
              {generating ? 'Gerando...' : '🤖 Gerar Relatório'}
            </button>
          </div>
        )}
      </div>

      {error && (
        <div style={{ padding: '10px 16px', borderRadius: 8, background: '#fee2e2', color: '#ef4444', fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Relatório gerado — botões de download */}
      {viewReport && (
        <div style={{ background: 'var(--cbrio-card)', borderRadius: 12, border: '1px solid var(--cbrio-border)', marginBottom: 16, padding: '24px 20px' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--cbrio-text)', marginBottom: 4 }}>
            {viewReport.report_type === 'full' ? 'Relatório Completo' : `Relatório: ${viewReport.phase_name}`}
          </div>
          <div style={{ fontSize: 11, color: 'var(--cbrio-text3)', marginBottom: 20 }}>
            {viewReport.attachments_count} arquivo(s) analisado(s) · Gerado em {new Date(viewReport.created_at).toLocaleString('pt-BR')}
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button onClick={() => downloadExport(viewReport.id, 'pptx')} disabled={!!exporting}
              style={{ padding: '14px 28px', borderRadius: 10, border: 'none', background: '#00839D', color: '#fff', fontSize: 14, fontWeight: 700, cursor: exporting ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 8, opacity: exporting === 'docx' ? 0.5 : 1 }}>
              {exporting === 'pptx' ? 'Gerando...' : 'Baixar Apresentação'}
            </button>
            <button onClick={() => downloadExport(viewReport.id, 'docx')} disabled={!!exporting}
              style={{ padding: '14px 28px', borderRadius: 10, border: 'none', background: '#242223', color: '#fff', fontSize: 14, fontWeight: 700, cursor: exporting ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 8, opacity: exporting === 'pptx' ? 0.5 : 1 }}>
              {exporting === 'docx' ? 'Gerando...' : 'Baixar Documento'}
            </button>
            <button onClick={() => setViewReport(null)}
              style={{ padding: '14px 20px', borderRadius: 10, border: '1px solid var(--cbrio-border)', background: 'transparent', fontSize: 13, cursor: 'pointer', color: 'var(--cbrio-text3)' }}>
              Fechar
            </button>
          </div>
        </div>
      )}

      {/* Lista de relatórios anteriores */}
      {reportsList.length === 0 && !viewReport ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--cbrio-text3)', fontSize: 13 }}>
          Nenhum relatório gerado ainda. Anexe entregáveis nas tarefas e clique em "Gerar Relatório".
        </div>
      ) : !viewReport && (
        <div style={{ background: 'var(--cbrio-card)', borderRadius: 12, border: '1px solid var(--cbrio-border)', overflow: 'hidden' }}>
          {reportsList.map(r => (
            <div key={r.id} style={{ padding: '12px 20px', borderBottom: '1px solid var(--cbrio-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
              onClick={() => setViewReport(r)}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--cbrio-bg)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <div>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--cbrio-text)' }}>
                  {r.report_type === 'full' ? 'Evento Completo' : `Fase: ${r.phase_name}`}
                </span>
                <span style={{ fontSize: 11, color: 'var(--cbrio-text3)', marginLeft: 8 }}>
                  {r.attachments_count} anexo(s) · {new Date(r.created_at).toLocaleDateString('pt-BR')}
                </span>
              </div>
              <span style={{ fontSize: 11, color: '#7c3aed', fontWeight: 600 }}>Ver →</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
