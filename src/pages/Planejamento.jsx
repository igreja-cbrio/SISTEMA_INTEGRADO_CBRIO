import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { dashboard as dashApi, cycles as cyclesApi, tasks as tasksApi, projects as projectsApi } from '../api';

const C = {
  text: 'var(--cbrio-text)', t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)',
  border: 'var(--cbrio-border)', card: 'var(--cbrio-card)', bg: 'var(--cbrio-bg)',
  inputBg: 'var(--cbrio-input-bg)', tableHeader: 'var(--cbrio-table-header)',
  modalBg: 'var(--cbrio-modal-bg)', overlay: 'var(--cbrio-overlay)',
  accent: '#00B39D',
};

const CAT = {
  marketing:  { label: 'Marketing',  color: '#00B39D', bg: '#d1fae5' },
  compras:    { label: 'Compras',    color: '#3b82f6', bg: '#dbeafe' },
  financeiro: { label: 'Financeiro', color: '#10b981', bg: '#d1fae5' },
  manutencao: { label: 'Manutenção', color: '#f59e0b', bg: '#fef3c7' },
  limpeza:    { label: 'Limpeza',    color: '#8b5cf6', bg: '#ede9fe' },
  cozinha:    { label: 'Cozinha',    color: '#ec4899', bg: '#fce7f3' },
  outros:     { label: 'Outros',     color: 'var(--cbrio-text3)', bg: 'var(--cbrio-bg)' },
};

const COLS = [
  { key: 'a_fazer', label: 'A fazer', color: 'var(--cbrio-text3)' },
  { key: 'em_andamento', label: 'Em andamento', color: '#3b82f6' },
  { key: 'bloqueada', label: 'Bloqueada', color: '#ef4444' },
  { key: 'concluida', label: 'Concluída', color: '#10b981' },
];

function normDate(d) { return d ? (typeof d === 'string' ? d.slice(0, 10) : '') : ''; }
function fmtDate(d) { const s = normDate(d); if (!s) return ''; const [y, m, day] = s.split('-'); return `${day}/${m}`; }
function getCat(t) { return (t.area || '').toLowerCase() || 'outros'; }
// Ordenar por urgência: prazo mais próximo de vencer primeiro, sem prazo por último
function filterByHorizon(items, days, dateField = 'prazo') {
  if (!days) return items; // 0 = sem filtro
  const limit = new Date(); limit.setDate(limit.getDate() + days);
  return items.filter(t => {
    const d = normDate(t[dateField]);
    if (!d) return true; // sem data = mostrar sempre
    return new Date(d + 'T12:00:00') <= limit;
  });
}

function sortByUrgency(tasks) {
  return [...tasks].sort((a, b) => {
    const pa = normDate(a.prazo); const pb = normDate(b.prazo);
    if (!pa && !pb) return 0; if (!pa) return 1; if (!pb) return -1;
    return pa.localeCompare(pb);
  });
}

export default function Planejamento() {
  const { profile, user, getAccessLevel, userAreas } = useAuth();
  const userRole = profile?.role || '';
  const userArea = profile?.area || '';
  const userId = user?.id || '';
  const accessLevel = getAccessLevel(['Projetos', 'Tarefas', 'Agenda']);

  // Ler URL params para drill-down (ex: /planejamento?person=João)
  const urlParams = new URLSearchParams(window.location.search);
  const urlPerson = urlParams.get('person') || '';
  const urlStatus = urlParams.get('status') || '';
  const isPMO = accessLevel >= 4; // Diretor+ vê tudo

  const [tab, setTab] = useState((urlPerson || urlStatus) ? 2 : accessLevel <= 2 ? 2 : 0);
  const [viewMode, setViewMode] = useState(isPMO ? 'pmo' : accessLevel >= 3 ? 'area' : 'minhas');
  const [kpis, setKpis] = useState(null);
  const [workload, setWorkload] = useState([]);
  const [cycleData, setCycleData] = useState(null);
  const [kanbanPhase, setKanbanPhase] = useState(null);
  const [areaFilter, setAreaFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [eventFilter, setEventFilter] = useState('all');
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(true);

  // Drill-down filters (usados quando KPI é clicado ou via URL params)
  const [listStatusFilter, setListStatusFilter] = useState(urlStatus);
  const [listPersonFilter, setListPersonFilter] = useState(urlPerson);

  // Helper: navegar do KPI para a Lista com filtro
  const drillDown = (opts = {}) => {
    setTab(2); // Lista
    setHorizon(0); // sem filtro de horizonte para ver tudo
    setViewMode('pmo');
    setListStatusFilter(opts.status || '');
    setListPersonFilter(opts.person || '');
  };

  // Horizonte temporal (dias)
  const [horizon, setHorizon] = useState((urlPerson || urlStatus) ? 0 : 30); // 30, 15, 0 (sem filtro)

  // Projetos + Estratégico
  const [projectsData, setProjectsData] = useState([]);
  const [strategicData, setStrategicData] = useState([]);
  const [selectedAreaGroup, setSelectedAreaGroup] = useState('all');

  // Kanban projetos (7 fases)
  const [projTasks, setProjTasks] = useState([]);
  const [projKanbanPhase, setProjKanbanPhase] = useState(null);
  const [projKanbanProject, setProjKanbanProject] = useState('all');
  const [projKanbanExpanded, setProjKanbanExpanded] = useState(null);

  // Gantt data
  const [ganttTasks, setGanttTasks] = useState([]);

  const [apiError, setApiError] = useState('');

  useEffect(() => {
    Promise.all([
      dashApi.pmo().then(setKpis).catch(e => console.error('KPIs:', e)),
      dashApi.workload().then(setWorkload).catch(e => console.error('Workload:', e)),
      cyclesApi.kanbanAll().then(d => {
        setCycleData(d);
        if (d?.phases?.length > 0) {
          const first = d.phases.find(p => p.status !== 'concluida') || d.phases[0];
          setKanbanPhase(first.numero_fase);
        }
      }).catch(e => console.error('Kanban:', e)),
      tasksApi.all({}).then(setGanttTasks).catch(e => console.error('Gantt:', e)),
      dashApi.projectsKanban().then(setProjectsData).catch(e => console.error('Projetos:', e)),
      dashApi.strategicKanban().then(setStrategicData).catch(e => console.error('Estratégico:', e)),
      tasksApi.all({ source: 'projeto' }).then(d => setProjTasks(Array.isArray(d) ? d : [])).catch(e => console.error('ProjTasks:', e)),
    ]).finally(() => setLoading(false));
  }, []);

  const handleProjTaskStatus = async (taskId, status) => {
    await tasksApi.updateStatus('projeto', taskId, status);
    tasksApi.all({ source: 'projeto' }).then(d => setProjTasks(Array.isArray(d) ? d : [])).catch(() => {});
  };

  const handleTaskStatus = async (taskId, status) => {
    const task = (cycleData?.tasks || []).find(t => t.id === taskId);
    if (task && task.event_phase_id === 'simple') {
      await tasksApi.updateStatus('evento', taskId, status);
    } else {
      await cyclesApi.updateTask(taskId, { status });
    }
    cyclesApi.kanbanAll().then(setCycleData).catch(() => {});
  };

  if (loading) return <div style={{ padding: 40, color: C.t2, fontSize: 14 }}>Carregando planejamento...</div>;

  const k = kpis || {};

  // Dados do kanban
  const d = cycleData;
  const allPhases = d?.phases || [];
  const allTasks = d?.tasks || [];
  const allEvents = d?.events || [];
  const phaseNums = [...new Set(allPhases.map(p => p.numero_fase))].sort((a, b) => a - b);
  const phaseNames = {}; allPhases.forEach(p => { phaseNames[p.numero_fase] = p.nome_fase; });
  const filteredPhases = eventFilter === 'all' ? allPhases : allPhases.filter(p => p.event_id === eventFilter);

  let phaseTasks = allTasks.filter(t => {
    // Filtro por fase (visão PMO) ou todas as tarefas (visão pessoal)
    if (viewMode === 'pmo') {
      if (kanbanPhase === 'simple') {
        if (t.event_phase_id !== 'simple') return false;
      } else {
        const ph = allPhases.find(p => p.id === t.event_phase_id);
        if (!ph || ph.numero_fase !== kanbanPhase) return false;
      }
    }
    if (eventFilter !== 'all' && t.event_id !== eventFilter) return false;
    // Filtro por visão
    if (viewMode === 'area') {
      const cat = getCat(t);
      if (!userAreas.includes(cat) && !userAreas.includes(t.area)) return false;
    }
    if (viewMode === 'minhas') {
      if (t.responsavel_id !== userId && t.responsavel_nome !== profile?.name) return false;
    }
    return true;
  });
  if (areaFilter !== 'all') phaseTasks = phaseTasks.filter(t => getCat(t) === areaFilter);
  phaseTasks = filterByHorizon(phaseTasks, horizon, 'prazo');

  // Gantt
  const MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const ganttGroups = {};
  ganttTasks.forEach(t => { const k = t.parent_name || 'Sem projeto'; if (!ganttGroups[k]) ganttGroups[k] = { name: k, tasks: [] }; ganttGroups[k].tasks.push(t); });
  const ganttList = Object.values(ganttGroups);
  const ganttDates = ganttTasks.filter(t => t.deadline).map(t => new Date(normDate(t.deadline)));
  const today = new Date();
  const gStart = ganttDates.length > 0 ? new Date(Math.min(...ganttDates, today) - 30 * 86400000) : new Date(today.getFullYear(), 0, 1);
  const gEnd = ganttDates.length > 0 ? new Date(Math.max(...ganttDates, today) + 30 * 86400000) : new Date(today.getFullYear(), 11, 31);
  gStart.setDate(1); gEnd.setDate(1); gEnd.setMonth(gEnd.getMonth() + 1);
  const dayPct = (date) => Math.max(0, Math.min(100, ((new Date(date) - gStart) / (gEnd - gStart)) * 100));
  const todayPct = dayPct(today);
  const monthLabels = [];
  const mc = new Date(gStart);
  while (mc < gEnd) { monthLabels.push({ label: MONTHS[mc.getMonth()] + (mc.getMonth() === 0 ? ' ' + mc.getFullYear() : ''), pct: dayPct(mc) }); mc.setMonth(mc.getMonth() + 1); }

  const SOURCE_COLORS = { evento: '#00B39D', ciclo: '#3b82f6', projeto: '#8b5cf6', planejamento: '#f59e0b' };

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 800, color: C.text }}>Planejamento</div>
          <div style={{ fontSize: 13, color: C.t2, marginTop: 2 }}>Visão consolidada de eventos, projetos e planejamento estratégico</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: `2px solid ${C.border}`, marginBottom: 20 }}>
        {['Dashboard', 'Kanban', 'Lista', 'Gantt'].map((t, i) => (
          <button key={t} onClick={() => setTab(i)} style={{
            padding: '10px 20px', border: 'none', background: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: 600, color: tab === i ? C.accent : C.t3,
            borderBottom: tab === i ? `2px solid ${C.accent}` : '2px solid transparent', marginBottom: -2,
          }}>{t}</button>
        ))}
      </div>

      {/* ═══ TAB: Dashboard ═══ */}
      {tab === 0 && (
  <div>
    {/* ── KPI Bar consolidada ── */}
    <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: '14px 24px', marginBottom: 20, display: 'flex', gap: 16, alignItems: 'center', overflowX: 'auto' }}>
      {[
        { label: 'Eventos', value: k.total_events || 0, color: C.accent, action: () => { window.location.href = '/eventos'; } },
        { label: 'Projetos', value: projectsData.length, color: '#8b5cf6', action: () => { window.location.href = '/projetos'; } },
        { label: 'Estratégico', value: strategicData.length, color: '#f59e0b', action: () => {} },
        null,
        { label: 'Tarefas abertas', value: k.tasks_open || 0, color: C.t2, action: () => drillDown({}) },
        { label: 'Tarefas atrasadas', value: k.tasks_overdue || 0, color: '#ef4444', action: () => drillDown({ status: 'atrasada' }) },
        { label: 'Riscos', value: k.risks_open || 0, color: '#f59e0b', action: () => { window.location.href = '/eventos'; } },
      ].map((item, i) => {
        if (!item) return <div key={i} style={{ width: 1, height: 24, background: C.border }} />;
        return (
          <div key={item.label} onClick={item.action} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '2px 4px', borderRadius: 6, transition: 'background .15s' }}
            onMouseEnter={e => e.currentTarget.style.background = `${item.color}15`}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <span style={{ fontSize: 20, fontWeight: 800, color: item.color }}>{item.value}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: C.t3, textTransform: 'uppercase', letterSpacing: 0.3, whiteSpace: 'nowrap' }}>{item.label}</span>
          </div>
        );
      })}
    </div>

    {/* ── Cards resumo (grid 3 colunas) ── */}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginBottom: 20 }}>

      {/* Card Eventos */}
      <div onClick={() => { window.location.href = '/eventos'; }} style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: '20px 24px', cursor: 'pointer', transition: 'box-shadow .15s' }}
        onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'}
        onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Eventos</span>
          <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 99, background: `${C.accent}15`, color: C.accent, fontWeight: 600 }}>VER TODOS →</span>
        </div>
        <div style={{ display: 'flex', gap: 16 }}>
          {[
            { v: k.events_on_track || 0, l: 'No prazo', c: '#10b981' },
            { v: k.events_at_risk || 0, l: 'Em risco', c: '#f59e0b' },
            { v: k.events_overdue || 0, l: 'Atrasados', c: '#ef4444' },
            { v: k.events_next_7d || 0, l: 'Próx. 7d', c: '#8b5cf6' },
          ].map(x => (
            <div key={x.l} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: x.c }}>{x.v}</div>
              <div style={{ fontSize: 9, color: C.t3, textTransform: 'uppercase' }}>{x.l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Card Projetos */}
      <div onClick={() => { window.location.href = '/projetos'; }} style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: '20px 24px', cursor: 'pointer', transition: 'box-shadow .15s' }}
        onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'}
        onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Projetos</span>
          <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 99, background: '#8b5cf615', color: '#8b5cf6', fontWeight: 600 }}>VER TODOS →</span>
        </div>
        <div style={{ display: 'flex', gap: 16 }}>
          {(() => {
            const pc = { 'no-prazo': 0, 'em-risco': 0, 'atrasado': 0, 'concluido': 0 };
            projectsData.forEach(p => { if (pc[p.status] !== undefined) pc[p.status]++; });
            return [
              { v: pc['no-prazo'], l: 'No prazo', c: '#10b981' },
              { v: pc['em-risco'], l: 'Em risco', c: '#f59e0b' },
              { v: pc['atrasado'], l: 'Atrasados', c: '#ef4444' },
              { v: pc['concluido'], l: 'Concluídos', c: '#3b82f6' },
            ].map(x => (
              <div key={x.l} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: x.c }}>{x.v}</div>
                <div style={{ fontSize: 9, color: C.t3, textTransform: 'uppercase' }}>{x.l}</div>
              </div>
            ));
          })()}
        </div>
      </div>

      {/* Card Orçamento Global */}
      {(k.budget_total > 0 || projectsData.some(p => p.budget_planned > 0)) && (
        <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: '20px 24px' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 12 }}>Orçamento Global</div>
          {(() => {
            const totalPlanned = Number(k.budget_total || 0) + projectsData.reduce((s, p) => s + Number(p.budget_planned || 0), 0);
            const totalSpent = Number(k.budget_spent || 0) + projectsData.reduce((s, p) => s + Number(p.budget_spent || 0), 0);
            const pct = totalPlanned > 0 ? Math.round((totalSpent / totalPlanned) * 100) : 0;
            return (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: C.t2, marginBottom: 6 }}>
                  <span>R$ {totalSpent.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  <span>R$ {totalPlanned.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
                <div style={{ height: 10, background: C.border, borderRadius: 5 }}>
                  <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, borderRadius: 5, background: pct > 100 ? '#ef4444' : pct > 80 ? '#f59e0b' : '#10b981' }} />
                </div>
                <div style={{ fontSize: 11, color: C.t3, marginTop: 4, textAlign: 'right' }}>{pct}% utilizado</div>
              </>
            );
          })()}
        </div>
      )}
    </div>

    {/* ── Carga de Trabalho + Itens Críticos (2 colunas) ── */}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginBottom: 20 }}>

      {/* Carga de Trabalho */}
      {workload.length > 0 && (
        <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: '20px 24px' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 12 }}>Carga de Trabalho</div>
          {workload.slice(0, 10).map((w, i) => (
            <div key={i} onClick={() => drillDown({ person: w.responsible })}
              style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, cursor: 'pointer', padding: '4px 6px', borderRadius: 6, transition: 'background .1s' }}
              onMouseEnter={e => e.currentTarget.style.background = `${C.accent}08`}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', background: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                {(w.responsible || '?').charAt(0).toUpperCase()}
              </div>
              <span style={{ fontSize: 12, color: C.text, width: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.responsible}</span>
              <div style={{ flex: 1, height: 8, background: C.border, borderRadius: 4 }}>
                <div style={{ height: '100%', width: `${Math.min((w.total_tasks / Math.max(...workload.map(x => x.total_tasks), 1)) * 100, 100)}%`, borderRadius: 4, background: w.atrasadas > 0 ? '#ef4444' : '#10b981' }} />
              </div>
              <span style={{ fontSize: 11, color: w.atrasadas > 0 ? '#ef4444' : C.t3, fontWeight: 600, minWidth: 55, textAlign: 'right' }}>
                {w.total_tasks}t{w.atrasadas > 0 ? ` (${w.atrasadas}⚠)` : ''}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Itens Críticos (atrasados cross-fonte) */}
      {(() => {
        const today = new Date();
        const overdue = ganttTasks
          .filter(t => t.status !== 'concluida' && t.deadline && new Date(normDate(t.deadline) + 'T12:00:00') < today)
          .sort((a, b) => new Date(normDate(a.deadline)) - new Date(normDate(b.deadline)))
          .slice(0, 8);
        if (overdue.length === 0) return null;
        const SOURCE_BADGE = { evento: { c: '#00B39D', l: 'Evento' }, ciclo: { c: '#00B39D', l: 'Ciclo' }, projeto: { c: '#8b5cf6', l: 'Projeto' }, planejamento: { c: '#f59e0b', l: 'Estratégico' } };
        return (
          <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: '20px 24px' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 12 }}>
              Itens Críticos <span style={{ fontSize: 11, fontWeight: 400, color: '#ef4444' }}>({overdue.length} atrasados)</span>
            </div>
            {overdue.map(t => {
              const dl = normDate(t.deadline);
              const diff = Math.ceil((new Date(dl + 'T12:00:00') - today) / 86400000);
              const sb = SOURCE_BADGE[t.source] || SOURCE_BADGE.evento;
              return (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 99, background: `${sb.c}15`, color: sb.c, fontWeight: 600, flexShrink: 0 }}>{sb.l}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</div>
                    <div style={{ fontSize: 10, color: C.t3 }}>{t.responsible || '—'} · {t.parent_name || '—'}</div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#ef4444', flexShrink: 0 }}>{Math.abs(diff)}d atrás</span>
                </div>
              );
            })}
          </div>
        );
      })()}
    </div>

    {/* ── Próximos Prazos (7 dias) ── */}
    {(() => {
      const today = new Date();
      const limit = new Date(); limit.setDate(limit.getDate() + 7);
      const upcoming = ganttTasks
        .filter(t => t.status !== 'concluida' && t.deadline && (() => { const d = new Date(normDate(t.deadline) + 'T12:00:00'); return d >= today && d <= limit; })())
        .sort((a, b) => new Date(normDate(a.deadline)) - new Date(normDate(b.deadline)))
        .slice(0, 10);
      if (upcoming.length === 0) return null;
      const SOURCE_BADGE = { evento: { c: '#00B39D', l: 'Evento' }, ciclo: { c: '#00B39D', l: 'Ciclo' }, projeto: { c: '#8b5cf6', l: 'Projeto' }, planejamento: { c: '#f59e0b', l: 'Estratégico' } };
      return (
        <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: '20px 24px', marginBottom: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 12 }}>
            Próximos Prazos <span style={{ fontSize: 11, fontWeight: 400, color: '#f59e0b' }}>({upcoming.length} nos próx. 7 dias)</span>
          </div>
          {upcoming.map(t => {
            const dl = normDate(t.deadline);
            const diff = Math.ceil((new Date(dl + 'T12:00:00') - today) / 86400000);
            const sb = SOURCE_BADGE[t.source] || SOURCE_BADGE.evento;
            const dc = diff <= 2 ? '#f59e0b' : '#10b981';
            return (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: `1px solid ${C.border}` }}>
                <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 99, background: `${sb.c}15`, color: sb.c, fontWeight: 600, flexShrink: 0 }}>{sb.l}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</div>
                  <div style={{ fontSize: 10, color: C.t3 }}>{t.responsible || '—'} · {t.parent_name || '—'}</div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: dc, flexShrink: 0 }}>{diff === 0 ? 'Hoje' : `${diff}d`}</span>
              </div>
            );
          })}
        </div>
      );
    })()}
  </div>
)}

      {/* ═══ TAB: Kanban ═══ */}
      {tab === 1 && (
        <div>
          {/* Toggle de visão */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 12, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: C.t2, fontWeight: 600 }}>Visão:</span>
            {[
              { key: 'pmo', label: 'PMO (por fase)', desc: 'Todas as fases e tarefas' },
              ...(userArea ? [{ key: 'area', label: `Minha área (${userArea})`, desc: `Tarefas de ${userArea}` }] : []),
              { key: 'minhas', label: 'Minhas tarefas', desc: 'Apenas tarefas atribuídas a mim' },
            ].map(v => (
              <button key={v.key} onClick={() => setViewMode(v.key)} title={v.desc} style={{
                padding: '5px 14px', borderRadius: 8, fontSize: 12, fontWeight: viewMode === v.key ? 700 : 400, cursor: 'pointer',
                border: viewMode === v.key ? `2px solid ${C.accent}` : `1px solid ${C.border}`,
                background: viewMode === v.key ? `${C.accent}15` : 'transparent',
                color: viewMode === v.key ? C.accent : C.t3,
              }}>{v.label}</button>
            ))}
          </div>

          {/* Filtros */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
            {/* Tipo */}
            <span style={{ fontSize: 11, color: C.t2, fontWeight: 600 }}>Tipo:</span>
            {[
              { key: 'all', label: 'Todos', color: C.accent },
              { key: 'eventos', label: 'Eventos', color: '#00B39D' },
              { key: 'projetos', label: 'Projetos', color: '#8b5cf6' },
              { key: 'estrategico', label: 'Planejamento', color: '#f59e0b' },
            ].map(f => (
              <button key={f.key} onClick={() => { setTypeFilter(f.key); setEventFilter('all'); }} style={{
                padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: typeFilter === f.key ? 600 : 400, cursor: 'pointer',
                border: typeFilter === f.key ? `2px solid ${f.color}` : `1px solid ${C.border}`,
                background: typeFilter === f.key ? `${f.color}15` : 'transparent',
                color: typeFilter === f.key ? f.color : C.t3,
              }}>{f.label}</button>
            ))}

            <span style={{ width: 1, height: 20, background: C.border }} />

            {/* Dropdown contextual por tipo */}
            {(typeFilter === 'all' || typeFilter === 'eventos') && allEvents.length > 0 && (
              <>
                <span style={{ fontSize: 11, color: C.t2, fontWeight: 600 }}>{typeFilter === 'eventos' ? 'Evento:' : 'Evento/Projeto:'}</span>
                <select value={eventFilter} onChange={e => setEventFilter(e.target.value)}
                  style={{ fontSize: 12, padding: '4px 8px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.inputBg }}>
                  <option value="all">Todos</option>
                  {allEvents.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
                </select>
              </>
            )}
            {typeFilter === 'projetos' && (
              <>
                <span style={{ fontSize: 11, color: C.t2, fontWeight: 600 }}>Projeto:</span>
                <select value={eventFilter} onChange={e => setEventFilter(e.target.value)}
                  style={{ fontSize: 12, padding: '4px 8px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.inputBg }}>
                  <option value="all">Todos os projetos</option>
                  {projectsData.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </>
            )}
            {typeFilter === 'estrategico' && (
              <>
                <span style={{ fontSize: 11, color: C.t2, fontWeight: 600 }}>Marco:</span>
                <select value={eventFilter} onChange={e => setEventFilter(e.target.value)}
                  style={{ fontSize: 12, padding: '4px 8px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.inputBg }}>
                  <option value="all">Todos os marcos</option>
                  {strategicData.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </>
            )}

            <span style={{ width: 1, height: 20, background: C.border }} />

            {/* Área */}
            <span style={{ fontSize: 11, color: C.t2, fontWeight: 600 }}>Área:</span>
            {[{ key: 'all', label: 'Todas' }, ...Object.entries(CAT).filter(([k]) => k !== 'outros').map(([k, v]) => ({ key: k, label: v.label, color: v.color, bg: v.bg }))].map(f => (
              <button key={f.key} onClick={() => setAreaFilter(f.key)} style={{
                padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: areaFilter === f.key ? 600 : 400, cursor: 'pointer',
                border: areaFilter === f.key ? `2px solid ${f.color || C.accent}` : `1px solid ${C.border}`,
                background: areaFilter === f.key ? (f.bg || `${C.accent}15`) : 'transparent',
                color: areaFilter === f.key ? (f.color || C.accent) : C.t3,
              }}>{f.label}</button>
            ))}

            <span style={{ width: 1, height: 20, background: C.border }} />

            {/* Horizonte temporal */}
            <span style={{ fontSize: 11, color: C.t2, fontWeight: 600 }}>Horizonte:</span>
            <select value={horizon} onChange={e => setHorizon(parseInt(e.target.value))}
              style={{ fontSize: 12, padding: '4px 8px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.inputBg }}>
              <option value={15}>Próx. 15 dias</option>
              <option value={30}>Próx. 30 dias</option>
              <option value={0}>Sem filtro</option>
            </select>
          </div>

          {/* ══ KANBAN "TODOS" — swim lanes por responsável ══ */}
          {typeFilter === 'all' && (() => {
  const TASK_COLS = [
    { key: 'pendente', label: 'A fazer', color: '#9ca3af' },
    { key: 'em-andamento', label: 'Em andamento', color: '#3b82f6' },
    { key: 'bloqueada', label: 'Bloqueada', color: '#ef4444' },
    { key: 'concluida', label: 'Concluída', color: '#10b981' },
  ];
  const SOURCE_BADGE = { evento: { c: '#00B39D', l: 'Ev' }, ciclo: { c: '#00B39D', l: 'Ci' }, projeto: { c: '#8b5cf6', l: 'Pj' }, planejamento: { c: '#f59e0b', l: 'Es' } };

  // All tasks from all sources
  let allUnified = [...ganttTasks];
  allUnified = filterByHorizon(allUnified, horizon, 'deadline');

  // Permission filter
  const isAssistant = !isPMO && !userArea;
  if (!isPMO && userArea) {
    allUnified = allUnified.filter(t => t.area === userArea || t.responsible === profile?.name);
  } else if (!isPMO) {
    allUnified = allUnified.filter(t => t.responsible === profile?.name);
  }

  // For assistants: flat 4-column kanban (no swim lanes)
  if (isAssistant || (!isPMO && !userArea)) {
    const myTasks = allUnified.filter(t => t.responsible === profile?.name);
    return (
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 10 }}>
          Minhas Tarefas
          <span style={{ fontSize: 12, fontWeight: 400, color: C.t3, marginLeft: 8 }}>
            {myTasks.filter(t => t.status === 'concluida').length}/{myTasks.length}
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, minHeight: 200 }}>
          {TASK_COLS.map(col => {
            const colT = sortByUrgency(myTasks.filter(t => (t.status === col.key) || (col.key === 'pendente' && t.status === 'a_fazer')));
            return (
              <div key={col.key} style={{ background: C.bg, borderRadius: 10, padding: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: col.color, textTransform: 'uppercase' }}>{col.label}</span>
                  <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 99, background: C.card, border: `1px solid ${C.border}`, color: C.t3 }}>{colT.length}</span>
                </div>
                {colT.length === 0 && <div style={{ padding: 16, textAlign: 'center', fontSize: 10, color: C.t3, border: '1.5px dashed var(--cbrio-border)', borderRadius: 8 }}>—</div>}
                {colT.map(task => {
                  const sb = SOURCE_BADGE[task.source] || SOURCE_BADGE.evento;
                  const dl = normDate(task.deadline);
                  const diff = dl ? Math.ceil((new Date(dl + 'T12:00:00') - new Date()) / 86400000) : null;
                  const dc = diff === null || task.status === 'concluida' ? null : diff < 0 ? '#ef4444' : diff <= 3 ? '#f59e0b' : '#10b981';
                  const dt = diff === null ? '' : diff < 0 ? `${Math.abs(diff)}d atrás` : diff === 0 ? 'Hoje' : `${diff}d`;
                  return (
                    <div key={task.id} style={{ background: C.card, borderRadius: 8, padding: 8, marginBottom: 4, border: dc === '#ef4444' ? '1px solid #fecaca' : `1px solid ${C.border}` }}>
                      <div style={{ display: 'flex', gap: 4, marginBottom: 3 }}>
                        <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 99, background: `${sb.c}15`, color: sb.c, fontWeight: 600 }}>{sb.l}</span>
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 500, color: C.text, lineHeight: 1.3, marginBottom: 2 }}>{task.name}</div>
                      <div style={{ fontSize: 9, color: C.t3 }}>{task.parent_name || '—'}</div>
                      {dc && <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: dc }}>{dt}</span>
                      </div>}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // PMO/Area: swim lanes by responsible
  const byPerson = {};
  allUnified.forEach(t => {
    const key = t.responsible || 'Sem responsável';
    if (!byPerson[key]) byPerson[key] = [];
    byPerson[key].push(t);
  });
  // Sort by most tasks first
  const personList = Object.entries(byPerson).sort((a, b) => b[1].length - a[1].length);

  return (
    <div>
      {personList.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: C.t3, fontSize: 13 }}>Nenhuma tarefa encontrada. Ajuste o horizonte ou os filtros.</div>}
      {personList.map(([person, tasks]) => {
        const done = tasks.filter(t => t.status === 'concluida').length;
        const pct = tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0;
        return (
          <div key={person} style={{ marginBottom: 20 }}>
            {/* Person header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 700 }}>
                {person.charAt(0).toUpperCase()}
              </div>
              <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{person}</span>
              <span style={{ fontSize: 11, color: C.t3 }}>{done}/{tasks.length} tarefas</span>
              <div style={{ flex: 1, maxWidth: 120, height: 4, background: C.border, borderRadius: 2 }}>
                <div style={{ height: '100%', width: `${pct}%`, borderRadius: 2, background: pct >= 100 ? '#10b981' : C.accent }} />
              </div>
            </div>
            {/* 4 columns */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginLeft: 38 }}>
              {TASK_COLS.map(col => {
                const colT = sortByUrgency(tasks.filter(t => (t.status === col.key) || (col.key === 'pendente' && t.status === 'a_fazer')));
                return (
                  <div key={col.key} style={{ background: C.bg, borderRadius: 8, padding: 6, minHeight: 40 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 9, fontWeight: 600, color: col.color, textTransform: 'uppercase' }}>{col.label}</span>
                      <span style={{ fontSize: 8, color: C.t3 }}>{colT.length}</span>
                    </div>
                    {colT.slice(0, 5).map(task => {
                      const sb = SOURCE_BADGE[task.source] || SOURCE_BADGE.evento;
                      const dl = normDate(task.deadline);
                      const diff = dl ? Math.ceil((new Date(dl + 'T12:00:00') - new Date()) / 86400000) : null;
                      const dc = diff === null || task.status === 'concluida' ? null : diff < 0 ? '#ef4444' : diff <= 3 ? '#f59e0b' : '#10b981';
                      const dt = diff === null ? '' : diff < 0 ? `${Math.abs(diff)}d` : diff === 0 ? 'Hj' : `${diff}d`;
                      return (
                        <div key={task.id} style={{ background: C.card, borderRadius: 6, padding: '4px 6px', marginBottom: 3, border: dc === '#ef4444' ? '1px solid #fecaca' : `1px solid ${C.border}`, fontSize: 10 }}>
                          <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                            <span style={{ fontSize: 7, padding: '0 3px', borderRadius: 3, background: `${sb.c}15`, color: sb.c, fontWeight: 600 }}>{sb.l}</span>
                            <span style={{ color: C.text, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{task.name}</span>
                            {dc && <span style={{ fontSize: 9, fontWeight: 700, color: dc, flexShrink: 0 }}>{dt}</span>}
                          </div>
                        </div>
                      );
                    })}
                    {colT.length > 5 && <div style={{ fontSize: 9, color: C.t3, textAlign: 'center', padding: 2 }}>+{colT.length - 5} mais</div>}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
})()}

          {/* ══ KANBAN EVENTOS (fases do ciclo) ══ */}
          {(typeFilter === 'eventos') && <>
          <div style={{ overflowX: 'auto', marginBottom: 16, paddingBottom: 6 }}>
            <div style={{ display: 'flex', gap: 5, minWidth: 'max-content', justifyContent: 'center' }}>
              {phaseNums.map((num, i) => {
                const isActive = num === kanbanPhase;
                const rp = filteredPhases.filter(p => p.numero_fase === num);
                const rpIds = rp.map(p => p.id);
                const pT = allTasks.filter(t => rpIds.includes(t.event_phase_id) && (eventFilter === 'all' || t.event_id === eventFilter));
                const pDone = pT.filter(t => t.status === 'concluida').length;
                const isDone = pT.length > 0 && pDone === pT.length;
                const pPct = pT.length > 0 ? Math.round((pDone / pT.length) * 100) : 0;
                return (
                  <div key={num} style={{ display: 'flex', alignItems: 'center' }}>
                    <div onClick={() => { setKanbanPhase(num); setExpanded(null); }}
                      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = `${C.accent}08`; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = isDone ? C.bg : C.card; e.currentTarget.style.transform = ''; }}
                      style={{
                      borderRadius: 8, padding: '8px 10px', cursor: 'pointer', minWidth: 100, maxWidth: 120, transition: 'all .15s',
                      border: isActive ? `2px solid ${C.accent}` : `1px solid ${C.border}`,
                      background: isActive ? `${C.accent}10` : isDone ? C.bg : C.card,
                      opacity: isDone && !isActive ? 0.7 : 1,
                    }}>
                      <div style={{ fontSize: 9, color: C.t3, marginBottom: 3 }}>F{num}</div>
                      <div style={{ fontSize: 10, fontWeight: isActive ? 700 : 500, color: isActive ? C.accent : C.text, lineHeight: 1.3, marginBottom: 4 }}>{phaseNames[num]}</div>
                      <div style={{ height: 3, borderRadius: 2, background: C.border }}>
                        <div style={{ height: 3, borderRadius: 2, width: `${pPct}%`, background: isDone ? '#10b981' : C.accent }} />
                      </div>
                      <div style={{ fontSize: 9, color: C.t3, marginTop: 3 }}>{pT.length > 0 ? `${pDone}/${pT.length}` : 'vazia'}</div>
                    </div>
                    {i < phaseNums.length - 1 && <div style={{ width: 12, height: 2, background: isDone ? '#10b981' : C.border, flexShrink: 0 }} />}
                  </div>
                );
              })}
              {/* Card "Sem ciclo" */}
              {(() => {
                const sT = allTasks.filter(t => t.event_phase_id === 'simple');
                if (sT.length === 0 && allEvents.filter(e => e._simple).length === 0) return null;
                const isA = kanbanPhase === 'simple';
                return (
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <div style={{ width: 16, height: 2, background: C.border, flexShrink: 0 }} />
                    <div onClick={() => { setKanbanPhase('simple'); setExpanded(null); }} style={{
                      borderRadius: 8, padding: '8px 10px', cursor: 'pointer', minWidth: 100,
                      border: isA ? '2px solid #f59e0b' : `1px solid ${C.border}`,
                      background: isA ? '#f59e0b10' : C.card,
                    }}>
                      <div style={{ fontSize: 10, fontWeight: isA ? 700 : 500, color: isA ? '#f59e0b' : C.text }}>Sem ciclo</div>
                      <div style={{ fontSize: 9, color: C.t3 }}>{sT.length} tarefas</div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Kanban 4 colunas */}
          {kanbanPhase && (
            <>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 10 }}>
                {kanbanPhase === 'simple' ? 'Eventos sem ciclo' : `Fase ${kanbanPhase} — ${phaseNames[kanbanPhase]}`}
                <span style={{ fontSize: 12, fontWeight: 400, color: C.t3, marginLeft: 12 }}>
                  {phaseTasks.filter(t => t.status === 'concluida').length}/{phaseTasks.length} tarefas
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, minHeight: 300 }}>
                {COLS.map(col => {
                  const colT = sortByUrgency(phaseTasks.filter(t => t.status === col.key));
                  return (
                    <div key={col.key} style={{ background: C.bg, borderRadius: 10, padding: 8, transition: 'background .15s' }}
                      onDragOver={e => e.preventDefault()}
                      onDragEnter={e => { e.currentTarget.style.background = `${col.color}15`; }}
                      onDragLeave={e => { e.currentTarget.style.background = C.bg; }}
                      onDrop={e => { e.currentTarget.style.background = C.bg; const id = e.dataTransfer.getData('planKanbanId'); if (id) handleTaskStatus(id, col.key); }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span style={{ fontSize: 10, fontWeight: 600, color: col.color, textTransform: 'uppercase' }}>{col.label}</span>
                        <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 99, background: C.card, border: `1px solid ${C.border}`, color: C.t3 }}>{colT.length}</span>
                      </div>
                      {colT.length === 0 && <div style={{ padding: 16, textAlign: 'center', fontSize: 10, color: C.t3, border: '1.5px dashed var(--cbrio-border)', borderRadius: 8 }}>Arraste tarefas aqui</div>}
                      {colT.map(task => {
                        const cat = CAT[getCat(task)] || CAT.outros;
                        const evN = allEvents.find(e => e.id === task.event_id)?.name || '';
                        const p = normDate(task.prazo);
                        const diff = p ? Math.ceil((new Date(p + 'T12:00:00') - new Date()) / 86400000) : null;
                        const dc = diff === null || task.status === 'concluida' ? null : diff < 0 ? '#ef4444' : diff <= 3 ? '#f59e0b' : '#10b981';
                        const dt = diff === null ? '' : diff < 0 ? `${Math.abs(diff)}d atrás` : diff === 0 ? 'Hoje' : `${diff}d`;
                        const subs = task.subtasks || [];
                        const isOpen = expanded === task.id;
                        return (
                          <div key={task.id} draggable
                            onDragStart={e => { e.dataTransfer.setData('planKanbanId', task.id); e.currentTarget.style.opacity = '0.4'; }}
                            onDragEnd={e => { e.currentTarget.style.opacity = '1'; }}
                            onClick={() => setExpanded(isOpen ? null : task.id)}
                            style={{ background: C.card, borderRadius: 8, padding: 8, marginBottom: 4, border: dc === '#ef4444' ? '1px solid #fecaca' : `1px solid ${C.border}`, cursor: 'grab', transition: 'opacity .15s, box-shadow .15s' }}
                            onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'}
                            onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>
                            <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 99, background: cat.bg, color: cat.color, fontWeight: 500, display: 'inline-block', marginBottom: 4 }}>{cat.label}</span>
                            <div style={{ fontSize: 11, fontWeight: 500, color: C.text, lineHeight: 1.3, marginBottom: 2 }}>{task.titulo}</div>
                            {evN && <div style={{ fontSize: 9, color: C.t3, marginBottom: 2 }}>{evN}</div>}
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: C.t3 }}>
                              <span>{task.responsavel_nome || '—'}</span>
                              {subs.length > 0 && <span>{subs.filter(s => s.done).length}/{subs.length}</span>}
                            </div>
                            {dc && task.status !== 'concluida' && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, paddingTop: 6, borderTop: `1px solid ${C.border}` }}>
                                <span style={{ fontSize: 11, fontWeight: 700, color: dc }}>{fmtDate(task.prazo)}</span>
                                <span style={{ fontSize: 10, fontWeight: 700, color: dc, padding: '1px 6px', borderRadius: 8, background: `${dc}15` }}>{dt}</span>
                              </div>
                            )}
                            {isOpen && subs.length > 0 && (
                              <div style={{ marginTop: 6, paddingTop: 6, borderTop: `1px solid ${C.border}` }} onClick={e => e.stopPropagation()}>
                                {subs.map(sub => (
                                  <div key={sub.id} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, padding: '2px 0', color: C.text }}>
                                    <input type="checkbox" checked={sub.done} onChange={async () => { await cyclesApi.updateSubtask(sub.id, { done: !sub.done }); cyclesApi.kanbanAll().then(setCycleData).catch(() => {}); }} style={{ cursor: 'pointer', width: 13, height: 13 }} />
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
            </>
          )}
          </>}

          {/* ══ KANBAN PROJETOS (7 fases + 4 colunas tarefas) ══ */}
          {(typeFilter === 'projetos') && (() => {
            const PHASE_NAMES = ['Concepção', 'Planejamento', 'Mobilização', 'Comunicação', 'Execução', 'Monitoramento', 'Encerramento'];
            const PHASE_ABBREVS = ['CON', 'PLA', 'MOB', 'COM', 'EXE', 'MON', 'ENC'];
            const TASK_COLS = [
              { key: 'pendente', label: 'A fazer', color: '#9ca3af' },
              { key: 'em-andamento', label: 'Em andamento', color: '#3b82f6' },
              { key: 'bloqueada', label: 'Bloqueada', color: '#ef4444' },
              { key: 'concluida', label: 'Concluída', color: '#10b981' },
            ];

            // Filtrar tarefas por projeto selecionado
            let filteredProjTasks = [...projTasks];
            if (projKanbanProject !== 'all') {
              filteredProjTasks = filteredProjTasks.filter(t => t.parent_id === projKanbanProject || t.project_id === projKanbanProject);
            }
            if (viewMode === 'minhas') {
              filteredProjTasks = filteredProjTasks.filter(t => t.responsible === profile?.name);
            } else if (viewMode === 'area' && userArea) {
              filteredProjTasks = filteredProjTasks.filter(t => t.area === userArea || t.responsible === profile?.name);
            }
            filteredProjTasks = filterByHorizon(filteredProjTasks, horizon, 'deadline');

            // Contagem por fase
            const phaseTaskCounts = {};
            PHASE_NAMES.forEach((name, i) => {
              const pt = filteredProjTasks.filter(t => (t.description || '').includes(`Fase: ${name}`));
              phaseTaskCounts[i + 1] = { total: pt.length, done: pt.filter(t => t.status === 'concluida').length };
            });

            // Auto-select primeira fase ativa
            const activePhase = projKanbanPhase || (() => {
              const first = PHASE_NAMES.findIndex((n, i) => { const c = phaseTaskCounts[i + 1]; return c && c.total > 0 && c.done < c.total; });
              return first >= 0 ? first + 1 : 1;
            })();
            const selectedPhaseName = PHASE_NAMES[activePhase - 1];
            const phaseTasks2 = sortByUrgency(filteredProjTasks.filter(t => (t.description || '').includes(`Fase: ${selectedPhaseName}`)));

            return (
              <div>
                {/* Filtro por projeto */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: C.t2, fontWeight: 600 }}>Projeto:</span>
                  <select value={projKanbanProject} onChange={e => setProjKanbanProject(e.target.value)}
                    style={{ fontSize: 12, padding: '4px 8px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.inputBg, maxWidth: 280 }}>
                    <option value="all">Todos os projetos ({projectsData.length})</option>
                    {projectsData.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>

                {/* Strip de 7 fases */}
                <div style={{ overflowX: 'auto', marginBottom: 16, paddingBottom: 6 }}>
                  <div style={{ display: 'flex', gap: 5, minWidth: 'max-content', justifyContent: 'center' }}>
                    {PHASE_NAMES.map((name, i) => {
                      const order = i + 1;
                      const isActive = activePhase === order;
                      const c = phaseTaskCounts[order] || { total: 0, done: 0 };
                      const isDone = c.total > 0 && c.done === c.total;
                      const pct = c.total > 0 ? Math.round((c.done / c.total) * 100) : 0;
                      return (
                        <div key={order} style={{ display: 'flex', alignItems: 'center' }}>
                          <div onClick={() => { setProjKanbanPhase(order); setProjKanbanExpanded(null); }}
                            onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = `${C.accent}08`; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                            onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = isDone ? C.bg : C.card; e.currentTarget.style.transform = ''; }}
                            style={{
                              borderRadius: 8, padding: '8px 10px', cursor: 'pointer', minWidth: 100, maxWidth: 130, transition: 'all .15s',
                              border: isActive ? `2px solid ${C.accent}` : `1px solid ${C.border}`,
                              background: isActive ? `${C.accent}10` : isDone ? C.bg : C.card,
                              opacity: isDone && !isActive ? 0.7 : 1,
                            }}>
                            <div style={{ fontSize: 9, color: C.t3, marginBottom: 3 }}>{PHASE_ABBREVS[i]}</div>
                            <div style={{ fontSize: 10, fontWeight: isActive ? 700 : 500, color: isActive ? C.accent : C.text, lineHeight: 1.3, marginBottom: 4 }}>{name}</div>
                            <div style={{ height: 3, borderRadius: 2, background: C.border }}>
                              <div style={{ height: 3, borderRadius: 2, width: `${pct}%`, background: isDone ? '#10b981' : C.accent, transition: 'width .3s' }} />
                            </div>
                            <div style={{ fontSize: 9, color: C.t3, marginTop: 3 }}>{c.total > 0 ? `${c.done}/${c.total}` : 'vazia'}</div>
                          </div>
                          {i < PHASE_NAMES.length - 1 && <div style={{ width: 12, height: 2, background: isDone ? '#10b981' : C.border, flexShrink: 0 }} />}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Header da fase */}
                <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 10 }}>
                  Fase {activePhase} — {selectedPhaseName}
                  <span style={{ fontSize: 12, fontWeight: 400, color: C.t3, marginLeft: 12 }}>
                    {phaseTasks2.filter(t => t.status === 'concluida').length}/{phaseTasks2.length} tarefas
                  </span>
                </div>

                {/* 4 colunas kanban */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, minHeight: 300 }}>
                  {TASK_COLS.map(col => {
                    const colT = sortByUrgency(phaseTasks2.filter(t => t.status === col.key));
                    return (
                      <div key={col.key} style={{ background: C.bg, borderRadius: 10, padding: 8, transition: 'background .15s' }}
                        onDragOver={e => e.preventDefault()}
                        onDragEnter={e => { e.currentTarget.style.background = `${col.color}15`; }}
                        onDragLeave={e => { e.currentTarget.style.background = C.bg; }}
                        onDrop={e => { e.currentTarget.style.background = C.bg; const id = e.dataTransfer.getData('projTaskId'); if (id) handleProjTaskStatus(id, col.key); }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                          <span style={{ fontSize: 10, fontWeight: 600, color: col.color, textTransform: 'uppercase' }}>{col.label}</span>
                          <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 99, background: C.card, border: `1px solid ${C.border}`, color: C.t3 }}>{colT.length}</span>
                        </div>
                        {colT.length === 0 && <div style={{ padding: 16, textAlign: 'center', fontSize: 10, color: C.t3, border: '1.5px dashed var(--cbrio-border)', borderRadius: 8 }}>Arraste tarefas aqui</div>}
                        {colT.map(task => {
                          const projName = task.parent_name || projectsData.find(p => p.id === (task.parent_id || task.project_id))?.name || '';
                          const dl = normDate(task.deadline);
                          const diff = dl ? Math.ceil((new Date(dl + 'T12:00:00') - new Date()) / 86400000) : null;
                          const dc = diff === null || task.status === 'concluida' ? null : diff < 0 ? '#ef4444' : diff <= 3 ? '#f59e0b' : '#10b981';
                          const dt = diff === null ? '' : diff < 0 ? `${Math.abs(diff)}d atrás` : diff === 0 ? 'Hoje' : `${diff}d`;
                          const isOpen = projKanbanExpanded === task.id;
                          return (
                            <div key={task.id} draggable
                              onDragStart={e => { e.dataTransfer.setData('projTaskId', task.id); e.currentTarget.style.opacity = '0.4'; }}
                              onDragEnd={e => { e.currentTarget.style.opacity = '1'; }}
                              onClick={() => setProjKanbanExpanded(isOpen ? null : task.id)}
                              style={{ background: C.card, borderRadius: 8, padding: 8, marginBottom: 4, border: dc === '#ef4444' ? '1px solid #fecaca' : `1px solid ${C.border}`, cursor: 'grab', transition: 'opacity .15s, box-shadow .15s' }}
                              onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'}
                              onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                                <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 99, background: `${C.accent}15`, color: C.accent, fontWeight: 500 }}>{task.area || 'gestao'}</span>
                              </div>
                              <div style={{ fontSize: 11, fontWeight: 500, color: C.text, lineHeight: 1.3, marginBottom: 2 }}>{task.name}</div>
                              {projName && <div style={{ fontSize: 9, color: C.t3, marginBottom: 2 }}>{projName}</div>}
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: C.t3 }}>
                                <span>{task.responsible || '—'}</span>
                              </div>
                              {dc && task.status !== 'concluida' && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, paddingTop: 6, borderTop: `1px solid ${C.border}` }}>
                                  <span style={{ fontSize: 11, fontWeight: 700, color: dc }}>{fmtDate(dl)}</span>
                                  <span style={{ fontSize: 10, fontWeight: 700, color: dc, padding: '1px 6px', borderRadius: 8, background: `${dc}15` }}>{dt}</span>
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
            );
          })()}

          {/* ══ KANBAN ESTRATÉGICO (mesma estrutura de projetos) ══ */}
          {(typeFilter === 'estrategico') && (() => {
            const AREAS = [
              { key: 'all', label: 'Todas', color: C.accent },
              { key: 'Gestão', label: 'Gestão', color: '#3b82f6' },
              { key: 'Ministerial', label: 'Ministerial', color: '#8b5cf6' },
            ];
            let filtered = selectedAreaGroup === 'all' ? strategicData : strategicData.filter(p => p.area_group === selectedAreaGroup);
            filtered = filterByHorizon(filtered, horizon, 'date_end');
            const STATUS_COLS = [
              { key: 'no-prazo', label: 'No prazo', color: '#10b981' },
              { key: 'em-risco', label: 'Em risco', color: '#f59e0b' },
              { key: 'atrasado', label: 'Atrasado', color: '#ef4444' },
            ];

            return (
              <div>
                <div style={{ overflowX: 'auto', marginBottom: 16, paddingBottom: 6 }}>
                  <div style={{ display: 'flex', gap: 5, minWidth: 'max-content', justifyContent: 'center', justifyContent: 'center' }}>
                    {AREAS.map((a, i) => {
                      const count = a.key === 'all' ? strategicData.length : strategicData.filter(p => p.area_group === a.key).length;
                      const isActive = selectedAreaGroup === a.key;
                      return (
                        <div key={a.key} style={{ display: 'flex', alignItems: 'center' }}>
                          <div onClick={() => setSelectedAreaGroup(a.key)} style={{
                            borderRadius: 8, padding: '10px 20px', cursor: 'pointer', minWidth: 120, textAlign: 'center',
                            border: isActive ? `2px solid ${a.color}` : `1px solid ${C.border}`,
                            background: isActive ? `${a.color}10` : C.card,
                          }}>
                            <div style={{ fontSize: 13, fontWeight: isActive ? 700 : 500, color: isActive ? a.color : C.text }}>{a.label}</div>
                            <div style={{ fontSize: 10, color: C.t3, marginTop: 2 }}>{count} marcos</div>
                          </div>
                          {i < AREAS.length - 1 && <div style={{ width: 12, height: 2, background: C.border, flexShrink: 0 }} />}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {filtered.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: C.t3, fontSize: 13 }}>Nenhum marco estratégico cadastrado. Crie planos para vê-los aqui.</div>}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                  {STATUS_COLS.map(col => {
                    const colPlans = sortByUrgency(filtered.filter(p => p.status === col.key).map(p => ({ ...p, prazo: p.date_end })));
                    return (
                      <div key={col.key} style={{ background: C.bg, borderRadius: 10, padding: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: col.color, textTransform: 'uppercase' }}>{col.label}</span>
                          <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 99, background: C.card, border: `1px solid ${C.border}`, color: C.t3 }}>{colPlans.length}</span>
                        </div>
                        {colPlans.length === 0 && <div style={{ padding: 16, textAlign: 'center', fontSize: 10, color: C.t3, border: '1.5px dashed var(--cbrio-border)', borderRadius: 8 }}>—</div>}
                        {colPlans.map(p => {
                          const pct = p.tasks_total > 0 ? Math.round((p.tasks_done / p.tasks_total) * 100) : 0;
                          const ed = normDate(p.date_end);
                          const diff = ed ? Math.ceil((new Date(ed + 'T12:00:00') - new Date()) / 86400000) : null;
                          const dc = diff === null ? null : diff < 0 ? '#ef4444' : diff <= 3 ? '#f59e0b' : '#10b981';
                          const dt = diff === null ? '' : diff < 0 ? `${Math.abs(diff)}d atrás` : diff === 0 ? 'Hoje' : `${diff}d`;
                          return (
                            <div key={p.id} style={{ background: C.card, borderRadius: 8, padding: 10, marginBottom: 6, border: `1px solid ${C.border}` }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 99, background: `${p.category_color || '#9ca3af'}20`, color: p.category_color || C.t3, fontWeight: 500 }}>{p.category_name}</span>
                                <span style={{ fontSize: 9, color: C.t3 }}>{p.area_group}</span>
                              </div>
                              <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 4 }}>{p.name}</div>
                              {p.responsible && <div style={{ fontSize: 10, color: C.t3, marginBottom: 4 }}>{p.responsible}</div>}
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                <div style={{ flex: 1, height: 4, background: C.border, borderRadius: 2 }}>
                                  <div style={{ height: '100%', width: `${pct}%`, background: '#10b981', borderRadius: 2 }} />
                                </div>
                                <span style={{ fontSize: 9, color: C.t3, fontWeight: 600 }}>{p.tasks_done}/{p.tasks_total}</span>
                              </div>
                              {dc && <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                                <span style={{ fontSize: 10, fontWeight: 700, color: dc }}>{fmtDate(p.date_end)}</span>
                                <span style={{ fontSize: 9, fontWeight: 700, color: dc, padding: '1px 5px', borderRadius: 6, background: `${dc}15` }}>{dt}</span>
                              </div>}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ═══ TAB: Gantt (por fases do ciclo) ═══ */}
      {/* ═══ TAB: Lista ═══ */}
      {tab === 2 && (() => {
        const [listGroup, setListGroup] = [viewMode, setViewMode]; // reusar viewMode para agrupamento
        const [listHorizon, setListHorizon] = [horizon, setHorizon];

        // Buscar todas as tarefas de todos os ciclos + eventos simples
        let allItems = allTasks.map(t => ({
          id: t.id, name: t.titulo || t.name, responsible: t.responsavel_nome || t.responsible || 'Sem responsável',
          deadline: t.prazo || t.deadline, status: t.status, source: t.event_phase_id === 'simple' ? 'evento' : 'ciclo',
          event_name: allEvents.find(e => e.id === t.event_id)?.name || '—', event_id: t.event_id,
          area: t.area || allEvents.find(e => e.id === t.event_id)?.category_name || '',
        }));
        allItems = filterByHorizon(allItems, listHorizon, 'deadline');
        allItems = sortByUrgency(allItems.map(t => ({ ...t, prazo: t.deadline })));

        // Filtro por visão baseado no nível de permissão
        if (listGroup === 'pmo') {
          // PMO/Diretor/Admin vê tudo. Outros veem só da sua área + suas tarefas
          if (!isPMO && userArea) {
            allItems = allItems.filter(t => t.responsible === profile?.name || t.area === userArea || getCat(t) === userArea.toLowerCase());
          } else if (!isPMO) {
            allItems = allItems.filter(t => t.responsible === profile?.name);
          }
        }
        if (listGroup === 'minhas') allItems = allItems.filter(t => t.responsible === profile?.name);
        if (listGroup === 'area' && userArea) allItems = allItems.filter(t => t.area === userArea || getCat(t) === userArea.toLowerCase());

        // Drill-down filters (vindos dos KPIs clicáveis)
        if (listStatusFilter === 'atrasada') {
          allItems = allItems.filter(t => {
            const dl = normDate(t.deadline);
            return dl && new Date(dl + 'T12:00:00') < new Date() && t.status !== 'concluida';
          });
        } else if (listStatusFilter) {
          allItems = allItems.filter(t => t.status === listStatusFilter);
        }
        if (listPersonFilter) {
          allItems = allItems.filter(t => t.responsible === listPersonFilter);
        }

        // Agrupar
        const groups = {};
        allItems.forEach(t => {
          const key = t.responsible || 'Sem responsável';
          if (!groups[key]) groups[key] = [];
          groups[key].push(t);
        });

        const STATUS_LABEL = { a_fazer: 'A fazer', em_andamento: 'Em andamento', concluida: 'Concluída', bloqueada: 'Bloqueada', pendente: 'Pendente', 'em-andamento': 'Em andamento' };
        const STATUS_COLOR = { a_fazer: '#9ca3af', em_andamento: '#3b82f6', concluida: '#10b981', bloqueada: '#ef4444', pendente: '#9ca3af', 'em-andamento': '#3b82f6' };

        return (
          <div>
            {/* Filtros */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: C.t2, fontWeight: 600 }}>Horizonte:</span>
              <select value={listHorizon} onChange={e => setListHorizon(parseInt(e.target.value))}
                style={{ fontSize: 12, padding: '4px 8px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.inputBg }}>
                <option value={15}>15 dias</option>
                <option value={30}>30 dias</option>
                <option value={0}>Sem filtro</option>
              </select>
              <span style={{ width: 1, height: 20, background: C.border }} />
              <span style={{ fontSize: 11, color: C.t2, fontWeight: 600 }}>Visão:</span>
              {[
                { key: 'pmo', label: isPMO ? 'Todas' : (userArea ? `Minha área + minhas` : 'Minhas tarefas') },
                ...(userArea ? [{ key: 'area', label: `Só ${userArea}` }] : []),
                { key: 'minhas', label: 'Só minhas' },
              ].map(v => (
                <button key={v.key} onClick={() => setViewMode(v.key)} style={{
                  padding: '4px 12px', borderRadius: 8, fontSize: 11, fontWeight: listGroup === v.key ? 700 : 400, cursor: 'pointer',
                  border: listGroup === v.key ? `2px solid ${C.accent}` : `1px solid ${C.border}`,
                  background: listGroup === v.key ? `${C.accent}15` : 'transparent',
                  color: listGroup === v.key ? C.accent : C.t3,
                }}>{v.label}</button>
              ))}
            </div>

            {/* Filtros ativos (drill-down) */}
            {(listStatusFilter || listPersonFilter) && (
              <div style={{ display: 'flex', gap: 6, marginBottom: 12, alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: C.t2, fontWeight: 600 }}>Filtros:</span>
                {listStatusFilter && (
                  <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: '#ef444415', color: '#ef4444', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                    {listStatusFilter === 'atrasada' ? 'Atrasadas' : listStatusFilter}
                    <button onClick={() => setListStatusFilter('')} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 12, padding: 0, marginLeft: 2 }}>✕</button>
                  </span>
                )}
                {listPersonFilter && (
                  <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: `${C.accent}15`, color: C.accent, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                    {listPersonFilter}
                    <button onClick={() => setListPersonFilter('')} style={{ background: 'none', border: 'none', color: C.accent, cursor: 'pointer', fontSize: 12, padding: 0, marginLeft: 2 }}>✕</button>
                  </span>
                )}
                <button onClick={() => { setListStatusFilter(''); setListPersonFilter(''); setHorizon(30); }}
                  style={{ fontSize: 10, padding: '3px 10px', borderRadius: 20, border: `1px solid ${C.border}`, background: 'transparent', color: C.t3, cursor: 'pointer' }}>Limpar filtros</button>
              </div>
            )}

            {/* Lista agrupada por responsável */}
            {allItems.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: C.t3, fontSize: 13 }}>Nenhuma tarefa encontrada. Ajuste o horizonte ou os filtros de visão.</div>}
            {Object.entries(groups).map(([person, tasks]) => (
              <div key={person} style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 700 }}>
                    {person.charAt(0).toUpperCase()}
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{person}</span>
                  <span style={{ fontSize: 11, color: C.t3 }}>({tasks.length} tarefas)</span>
                </div>
                {tasks.map(t => {
                  const d = normDate(t.deadline);
                  const diff = d ? Math.ceil((new Date(d + 'T12:00:00') - new Date()) / 86400000) : null;
                  const dc = diff === null || t.status === 'concluida' ? null : diff < 0 ? '#ef4444' : diff <= 3 ? '#f59e0b' : '#10b981';
                  const dt = diff === null ? '' : diff < 0 ? `${Math.abs(diff)}d atrás` : diff === 0 ? 'Hoje' : `${diff}d`;
                  const sc = STATUS_COLOR[t.status] || '#9ca3af';
                  return (
                    <div key={t.id} onClick={() => { if (t.event_id) window.location.href = `/eventos?id=${t.event_id}`; }}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: C.card, borderRadius: 8, border: `1px solid ${C.border}`, marginBottom: 4, cursor: 'pointer', transition: 'background .1s' }}
                      onMouseEnter={e => e.currentTarget.style.background = `${C.accent}08`}
                      onMouseLeave={e => e.currentTarget.style.background = C.card}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: sc, flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{t.name}</div>
                        <div style={{ fontSize: 10, color: C.t3 }}>{t.event_name}</div>
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 600, color: sc, padding: '2px 8px', borderRadius: 10, background: `${sc}15` }}>{STATUS_LABEL[t.status] || t.status}</span>
                      {dc && <span style={{ fontSize: 11, fontWeight: 700, color: dc, padding: '2px 8px', borderRadius: 8, background: `${dc}15`, flexShrink: 0 }}>{dt}</span>}
                      {d && <span style={{ fontSize: 10, color: C.t3, flexShrink: 0 }}>{fmtDate(d)}</span>}
                    </div>
                  );
                })}
              </div>
            ))}
            <div style={{ height: 60 }} />
          </div>
        );
      })()}

      {/* ═══ TAB: Gantt (por fases do ciclo) ═══ */}
      {tab === 3 && (() => {
        const STATUS_COLORS = { pendente: '#9ca3af', em_andamento: '#3b82f6', concluida: '#10b981', atrasada: '#ef4444', em_risco: '#f59e0b' };

        // Agrupar fases por evento
        const eventGroups = {};
        allEvents.forEach(ev => { eventGroups[ev.id] = { name: ev.name, phases: [] }; });
        allPhases.forEach(ph => {
          if (eventGroups[ph.event_id]) eventGroups[ph.event_id].phases.push(ph);
        });
        const groups = Object.values(eventGroups).filter(g => g.phases.length > 0);
        groups.forEach(g => g.phases.sort((a, b) => a.numero_fase - b.numero_fase));

        // Range de datas
        const allDates = allPhases.flatMap(p => [p.data_inicio_prevista, p.data_fim_prevista].filter(Boolean)).map(d => new Date(d));
        const gS = allDates.length > 0 ? new Date(Math.min(...allDates, today) - 14 * 86400000) : new Date(today.getFullYear(), 0, 1);
        const gE = allDates.length > 0 ? new Date(Math.max(...allDates, today) + 14 * 86400000) : new Date(today.getFullYear(), 11, 31);
        gS.setDate(1); gE.setDate(1); gE.setMonth(gE.getMonth() + 1);
        const dPct = (date) => Math.max(0, Math.min(100, ((new Date(date) - gS) / (gE - gS)) * 100));
        const tPct = dPct(today);

        const mLabels = [];
        const mc2 = new Date(gS);
        while (mc2 < gE) { mLabels.push({ label: MONTHS[mc2.getMonth()] + (mc2.getMonth() === 0 ? ' ' + mc2.getFullYear() : ''), pct: dPct(mc2) }); mc2.setMonth(mc2.getMonth() + 1); }

        const NAME_W = 200;
        const BAR_H = 32;

        return (
          <div>
            {groups.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: C.t3, fontSize: 13 }}>Nenhum ciclo criativo ativo</div>}

            {groups.map((group, gi) => (
              <div key={gi} style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, marginBottom: 16, overflow: 'hidden' }}>
                {/* Header do evento */}
                <div style={{ padding: '10px 16px', background: `${C.accent}10`, borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.accent }} />
                  <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{group.name}</span>
                  <span style={{ fontSize: 11, color: C.t3 }}>({group.phases.filter(p => p.status === 'concluida').length}/{group.phases.length} fases)</span>
                </div>

                {/* Gantt */}
                <div style={{ display: 'flex' }}>
                  {/* Coluna fixa: nomes das fases */}
                  <div style={{ width: NAME_W, flexShrink: 0, borderRight: `1px solid ${C.border}` }}>
                    <div style={{ height: 28, borderBottom: `1px solid ${C.border}`, background: C.tableHeader }} />
                    {group.phases.map(ph => {
                      const eiN = normDate(ph.data_fim_prevista);
                      const diffN = eiN ? Math.ceil((new Date(eiN + 'T12:00:00') - new Date()) / 86400000) : null;
                      const dotColor = ph.status === 'concluida' ? '#10b981' : diffN !== null && diffN < 0 ? '#ef4444' : diffN !== null && diffN <= 3 ? '#f59e0b' : '#9ca3af';
                      return (
                      <div key={ph.id} style={{ height: BAR_H, padding: '0 10px', display: 'flex', alignItems: 'center', gap: 6, borderBottom: `1px solid ${C.border}` }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
                        <span style={{ fontSize: 11, fontWeight: 500, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          F{ph.numero_fase} {ph.nome_fase}
                        </span>
                      </div>
                    ); })}
                  </div>

                  {/* Área scrollável: barras */}
                  <div style={{ flex: 1, overflowX: 'auto' }}>
                    <div style={{ minWidth: 600, position: 'relative' }}>
                      {/* Header meses */}
                      <div style={{ height: 28, position: 'relative', borderBottom: `1px solid ${C.border}`, background: C.tableHeader }}>
                        {mLabels.map((m, i) => (
                          <div key={i} style={{ position: 'absolute', left: `${m.pct}%`, top: 0, height: '100%', borderLeft: `1px solid ${C.border}`, padding: '5px 6px', fontSize: 10, fontWeight: 600, color: C.t2, whiteSpace: 'nowrap' }}>{m.label}</div>
                        ))}
                        <div style={{ position: 'absolute', left: `${tPct}%`, top: 0, width: 2, height: '100%', background: '#ef4444', zIndex: 2 }} />
                        <div style={{ position: 'absolute', left: `${tPct}%`, top: -1, transform: 'translateX(-50%)', fontSize: 10, fontWeight: 700, color: '#ef4444', background: C.card, padding: '1px 5px', borderRadius: 4, zIndex: 3 }}>hoje</div>
                      </div>

                      {/* Barras das fases */}
                      {group.phases.map(ph => {
                        const si = normDate(ph.data_inicio_prevista);
                        const ei = normDate(ph.data_fim_prevista);
                        if (!si || !ei) return <div key={ph.id} style={{ height: BAR_H, borderBottom: `1px solid ${C.border}` }} />;
                        const lp = dPct(si); const rp = dPct(ei); const wp = Math.max(rp - lp, 2);
                        // Auto-concluir: se todas as tarefas da fase estão concluídas ou não tem tarefas
                        const phTasks = allTasks.filter(t => t.event_phase_id === ph.id);
                        const phDone = phTasks.filter(t => t.status === 'concluida').length;
                        const isDone = ph.status === 'concluida' || (phTasks.length > 0 && phDone === phTasks.length) || phTasks.length === 0;
                        const endDate = new Date(ei + 'T12:00:00');
                        const diff = Math.ceil((endDate - new Date()) / 86400000);
                        const barColor = isDone ? '#d1d5db' : diff < 0 ? '#ef4444' : diff <= 3 ? '#f59e0b' : '#10b981';
                        const daysText = isDone ? '✓' : diff < 0 ? `${Math.abs(diff)}d atrás` : diff === 0 ? 'Hoje' : `${diff}d`;

                        return (
                          <div key={ph.id} style={{ position: 'relative', height: BAR_H, borderBottom: `1px solid ${C.border}` }}>
                            {mLabels.map((m, i) => (<div key={i} style={{ position: 'absolute', left: `${m.pct}%`, top: 0, width: 1, height: '100%', background: C.border, opacity: 0.3 }} />))}
                            <div style={{ position: 'absolute', left: `${tPct}%`, top: 0, width: 2, height: '100%', background: '#ef4444', zIndex: 2, opacity: 0.4 }} />
                            <div title={`${ph.nome_fase}\n${fmtDate(si)} → ${fmtDate(ei)}\n${daysText}`}
                              style={{
                                position: 'absolute', top: 4, height: BAR_H - 8, borderRadius: 6,
                                left: `${lp}%`, width: `${wp}%`, minWidth: 50,
                                background: barColor, opacity: isDone ? 0.5 : 0.9,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px', overflow: 'hidden',
                              }}>
                              <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>
                                {daysText}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {/* Legenda */}
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', padding: '12px 0', marginBottom: 20 }}>
              {[
                { label: 'No prazo (>3 dias)', color: '#10b981' },
                { label: 'Urgente (≤3 dias)', color: '#f59e0b' },
                { label: 'Atrasada', color: '#ef4444' },
                { label: 'Concluída', color: '#d1d5db' },
              ].map(l => (
                <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 20, height: 10, borderRadius: 4, background: l.color }} />
                  <span style={{ fontSize: 12, color: C.t2 }}>{l.label}</span>
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 2, height: 14, background: '#ef4444' }} />
                <span style={{ fontSize: 12, color: C.t2 }}>Hoje</span>
              </div>
            </div>

            <div style={{ height: 40 }} />
          </div>
        );
      })()}
    </div>
  );
}
