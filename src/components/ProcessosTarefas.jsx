/**
 * Calendario semanal de tarefas por area.
 * Seg-Dom com KPIs agendados + tarefas pessoais completas.
 * Modal para criar tarefa com: prioridade, recorrencia, horario, responsavel, tipo, descricao, vinculo.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { processos as api, users as usersApi } from '../api';
import { getAreaNome } from '../data/indicadores';
import { useKpis } from '../hooks/useKpis';
import KpiQuickFillModal from './KpiQuickFillModal';

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', text: 'var(--cbrio-text)',
  t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)', border: 'var(--cbrio-border)',
  inputBg: 'var(--cbrio-input-bg)', modalBg: 'var(--cbrio-modal-bg)', overlay: 'var(--cbrio-overlay)',
  primary: '#00B39D', primaryBg: '#e6f7f5',
  green: '#10b981', greenBg: '#d1fae5', red: '#ef4444', redBg: '#fee2e2',
  amber: '#f59e0b', amberBg: '#fef3c7', blue: '#3b82f6', blueBg: '#dbeafe',
  purple: '#8b5cf6', purpleBg: '#ede9fe',
};
const inp = { width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--cbrio-border)', background: 'var(--cbrio-input-bg)', color: 'var(--cbrio-text)', fontSize: 13, boxSizing: 'border-box', fontFamily: 'inherit' };

const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom'];
const PRIORIDADES = [
  { value: 'alta', label: 'Alta', c: '#ef4444', bg: '#fee2e2' },
  { value: 'media', label: 'M\u00e9dia', c: '#f59e0b', bg: '#fef3c7' },
  { value: 'baixa', label: 'Baixa', c: '#10b981', bg: '#d1fae5' },
];
const TIPOS = [
  { value: 'reuniao', label: 'Reuni\u00e3o' }, { value: 'ligacao', label: 'Liga\u00e7\u00e3o' },
  { value: 'visita', label: 'Visita' }, { value: 'relatorio', label: 'Relat\u00f3rio' },
  { value: 'devocional', label: 'Devocional' }, { value: 'compras', label: 'Compras' },
  { value: 'outro', label: 'Outro' },
];
const RECORRENCIAS = [
  { value: 'unica', label: '\u00danica' }, { value: 'diaria', label: 'Di\u00e1ria' },
  { value: 'semanal', label: 'Semanal' }, { value: 'quinzenal', label: 'Quinzenal' },
  { value: 'mensal', label: 'Mensal' },
];

function getMonday(d) { const dt = new Date(d); const day = dt.getDay(); dt.setDate(dt.getDate() - (day === 0 ? 6 : day - 1)); dt.setHours(0,0,0,0); return dt; }
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
// fmtDate: usa data LOCAL (nao UTC) pra evitar off-by-one em fusos negativos.
// `d.toISOString().slice(0,10)` daria a data UTC, que em UTC-3 a noite vira amanha.
function fmtDate(d) {
  if (!d || !(d instanceof Date) || isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function fmtShort(d) {
  if (!d || !(d instanceof Date) || isNaN(d.getTime())) return '--/--';
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
}

// Periodicidade -> chave de periodo (para matchar registros do mesmo periodo)
function getPeriodKey(date, periodicidade) {
  const d = typeof date === 'string' ? new Date(date) : new Date(date);
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const p = String(periodicidade || '').toLowerCase();
  if (p === 'semanal') {
    const tmp = new Date(d); tmp.setHours(0,0,0,0);
    tmp.setDate(tmp.getDate() + 4 - (tmp.getDay() || 7));
    const yearStart = new Date(tmp.getFullYear(), 0, 1);
    const week = Math.ceil(((tmp - yearStart) / 86400000 + 1) / 7);
    return `${tmp.getFullYear()}-W${String(week).padStart(2,'0')}`;
  }
  if (p === 'mensal') return `${y}-${String(m).padStart(2,'0')}`;
  if (p === 'trimestral') return `${y}-Q${Math.ceil(m/3)}`;
  if (p === 'semestral') return `${y}-S${m <= 6 ? 1 : 2}`;
  if (p === 'anual') return String(y);
  return `${y}-${String(m).padStart(2,'0')}`;
}

// Esta semana (weekStart = segunda-feira) e a "janela de exibicao" do KPI?
//
// Regras (revisadas 2026-05-04):
//   Semanal     -> toda semana
//   Mensal      -> qualquer semana do mes (4 semanas pra preencher, nao 1)
//   Trimestral  -> qualquer semana do mes inicial do trimestre (jan/abr/jul/out)
//   Semestral   -> qualquer semana do mes inicial do semestre (jan/jul)
//   Anual       -> qualquer semana do mes inicial do ano (janeiro)
//
// offsetMeses desloca o mes inicial:
//   trimestral 0 -> jan/abr/jul/out (padrao)
//   trimestral 1 -> fev/mai/ago/nov
//   semestral 0  -> jan/jul (padrao)
//   semestral 1  -> fev/ago
//   anual N      -> mes N (0=jan, 11=dez)
function isShowingWeekFor(weekStart, periodicidade, offsetMeses = 0) {
  const p = String(periodicidade || '').toLowerCase();
  if (p === 'semanal') return true;
  const off = Number.isFinite(Number(offsetMeses)) ? Number(offsetMeses) : 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart); d.setDate(d.getDate() + i);
    const month = d.getMonth();
    if (p === 'mensal') return true; // qualquer semana do mes
    if (p === 'trimestral' && ((month - off + 12) % 3 === 0)) return true;
    if (p === 'semestral' && ((month - off + 12) % 6 === 0)) return true;
    if (p === 'anual' && month === (off % 12)) return true;
  }
  return false;
}

// Cor/label da periodicidade no badge
const PERIOD_BADGE = {
  semanal:    { c: '#3b82f6', bg: '#dbeafe', label: 'sem' },
  mensal:     { c: '#10b981', bg: '#d1fae5', label: 'mês' },
  trimestral: { c: '#f59e0b', bg: '#fef3c7', label: 'tri' },
  semestral:  { c: '#8b5cf6', bg: '#ede9fe', label: '6m' },
  anual:      { c: '#ef4444', bg: '#fee2e2', label: 'ano' },
};

function PrioBadge({ p }) {
  const pr = PRIORIDADES.find(x => x.value === p) || PRIORIDADES[1];
  return <span style={{ padding: '1px 6px', borderRadius: 6, fontSize: 9, fontWeight: 700, color: pr.c, background: pr.bg }}>{pr.label}</span>;
}

export default function ProcessosTarefas({ area }) {
  const { isAdmin, isDiretor } = useAuth();
  const canWrite = isAdmin || isDiretor;
  const { byId: kpiById, isLoading: kpisLoading } = useKpis();

  // Mobile: trocar grid 7-col por lista vertical
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 720);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 720);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [processos, setProcessos] = useState([]);
  const [agenda, setAgenda] = useState([]);
  const [registros, setRegistros] = useState([]);
  const [tarefas, setTarefas] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [modalDay, setModalDay] = useState(null);
  const [fillTarget, setFillTarget] = useState(null);
  const [fillVal, setFillVal] = useState('');
  const [saving, setSaving] = useState(false);
  // Quando user marca tarefa done que esta linkada a KPI, abre o quick-fill
  // antes de marcar done. Apos save, marca done automaticamente.
  const [fillFromTask, setFillFromTask] = useState(null); // { tarefa, kpi, periodKey }

  const emptyForm = { titulo: '', prioridade: 'media', recorrencia: 'unica', horario: '', responsavel_id: '', responsavel_nome: '', tipo: 'outro', descricao: '', processo_id: '' };
  const [form, setForm] = useState(emptyForm);

  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const weekEnd = weekDates[6];
  const todayStr = fmtDate(new Date());

  // Dados estaveis: processos + agenda + users (carrega 1x)
  useEffect(() => {
    Promise.all([
      api.list({ area, status: 'ativo' }).then(setProcessos),
      api.agenda.list({ area }).catch(() => []).then(setAgenda),
      usersApi.list().then(setUsersList).catch(() => {}),
    ]).finally(() => setInitialLoading(false));
  }, [area]);

  // Dados da semana: registros + tarefas (carrega ao trocar semana)
  const loadWeek = useCallback(async () => {
    const di = fmtDate(weekStart), df = fmtDate(weekEnd);
    const [regs, tars] = await Promise.all([
      api.registros.list({ data_inicio: di, data_fim: df }).catch(() => []),
      api.tarefas.list({ area, data_inicio: di, data_fim: df }).catch(() => []),
    ]);
    setRegistros(regs); setTarefas(tars);
  }, [area, weekStart, weekEnd]);

  useEffect(() => { if (!initialLoading) loadWeek(); }, [loadWeek, initialLoading]);

  const agendaMap = useMemo(() => { const m = {}; agenda.forEach(a => { m[a.indicador_id] = a.dia_semana; }); return m; }, [agenda]);

  // Mapa de "ja preenchido neste periodo": { indicadorId|periodKey -> registro }
  // Periodo derivado da periodicidade do KPI a partir de data_preenchimento.
  const fillByPeriod = useMemo(() => {
    const m = {};
    registros.forEach(r => {
      if (!r || !r.indicador_id || !r.data_preenchimento) return;
      const kpi = kpiById[r.indicador_id];
      const periodicidade = kpi?.periodicidade || 'mensal'; // fallback seguro
      const periodKey = getPeriodKey(r.data_preenchimento, periodicidade);
      m[`${r.indicador_id}|${periodKey}`] = r;
    });
    return m;
  }, [registros, kpiById]);

  const dayKpis = useMemo(() => weekDates.map((date, gi) => {
    const bankDay = gi === 6 ? 0 : gi + 1;
    const dateStr = fmtDate(date);
    const items = [];
    processos.forEach(p => (p.indicador_ids || []).forEach(indId => {
      if (agendaMap[indId] !== bankDay) return;
      const kpi = kpiById[indId];
      if (!kpi) return;
      // So mostra se a janela do periodo cobre esta semana (com offset)
      if (!isShowingWeekFor(weekStart, kpi.periodicidade, kpi.periodo_offset_meses)) return;
      const periodKey = getPeriodKey(date, kpi.periodicidade);
      const reg = fillByPeriod[`${indId}|${periodKey}`];
      items.push({
        processoId: p.id,
        processoNome: p.nome,
        indicadorId: indId,
        date: dateStr,
        periodicidade: kpi.periodicidade,
        periodKey,
        filled: !!reg,
        valor: reg?.valor,
      });
    }));
    return items;
  }), [weekDates, weekStart, processos, agendaMap, fillByPeriod, kpiById]);

  const dayTarefas = useMemo(() => weekDates.map(date => tarefas.filter(t => t.data === fmtDate(date))), [weekDates, tarefas]);

  // ── Operacoes otimistas (atualiza state local, sync no background) ──

  const submitFill = async () => {
    if (!fillTarget || !fillVal) return;
    const val = Number(fillVal);
    // Otimista: adiciona ao state imediatamente. fillByPeriod recompoe automatico.
    setRegistros(prev => [...prev, {
      indicador_id: fillTarget.indicadorId,
      data_preenchimento: fillTarget.date,
      valor: val,
      id: 'temp-' + Date.now(),
    }]);
    setFillTarget(null); setFillVal('');
    api.registros.create({
      processo_id: fillTarget.processoId,
      indicador_id: fillTarget.indicadorId,
      valor: val,
      periodo: fillTarget.periodKey, // grava o periodo no banco (util pra auditoria)
      data_preenchimento: fillTarget.date,
    }).catch(e => { console.error(e); loadWeek(); });
  };

  const toggleTarefa = async (id, done) => {
    // Se ja esta done -> desmarcar (toggle visual normal)
    if (done) {
      setTarefas(prev => prev.map(t => t.id === id ? { ...t, done: false } : t));
      api.tarefas.toggle(id, false).catch(e => { console.error(e); loadWeek(); });
      return;
    }

    // Marcando como done — se a tarefa tem processo vinculado com KPI, abre
    // QuickFillModal pra registrar valor antes de marcar feito.
    const tarefa = tarefas.find(t => t.id === id);
    if (tarefa?.processo_id) {
      const processo = processos.find(p => p.id === tarefa.processo_id);
      const firstKpiId = (processo?.indicador_ids || []).find(kid => kpiById[kid]);
      const linkedKpi = firstKpiId ? kpiById[firstKpiId] : null;
      if (linkedKpi) {
        const periodicidade = String(linkedKpi.periodicidade || 'mensal').toLowerCase();
        const periodKey = getPeriodKey(new Date(), periodicidade);
        setFillFromTask({ tarefa, kpi: linkedKpi, periodKey });
        return;
      }
    }
    // Sem KPI vinculado: comportamento antigo
    setTarefas(prev => prev.map(t => t.id === id ? { ...t, done: true } : t));
    api.tarefas.toggle(id, true).catch(e => { console.error(e); loadWeek(); });
  };

  // Apos QuickFillModal salvar, marca a tarefa origem como done
  const onFillFromTaskSaved = useCallback(() => {
    const t = fillFromTask?.tarefa;
    if (!t) return;
    setTarefas(prev => prev.map(x => x.id === t.id ? { ...x, done: true } : x));
    api.tarefas.toggle(t.id, true).catch(e => { console.error(e); loadWeek(); });
    setFillFromTask(null);
    // Atualiza registros pra refletir o KPI preenchido
    loadWeek();
  }, [fillFromTask, loadWeek]);

  const removeTarefa = async (id) => {
    // Otimista
    setTarefas(prev => prev.filter(t => t.id !== id));
    api.tarefas.remove(id).catch(e => { console.error(e); loadWeek(); });
  };

  const openModal = (gi) => { setForm(emptyForm); setModalDay(gi); };

  const submitTarefa = async () => {
    if (!form.titulo.trim() || modalDay === null) return;
    setSaving(true);
    const dateStr = fmtDate(weekDates[modalDay]);
    // Otimista: adiciona placeholder ao state
    const tempId = 'temp-' + Date.now();
    setTarefas(prev => [...prev, { ...form, id: tempId, data: dateStr, area, done: false }]);
    setModalDay(null);
    try {
      await api.tarefas.create({ ...form, data: dateStr, area });
      loadWeek(); // reload pra pegar o id real e instancias de recorrencia
    } catch (e) { console.error(e); setTarefas(prev => prev.filter(t => t.id !== tempId)); }
    setSaving(false);
  };

  if (initialLoading || kpisLoading) return <div style={{ padding: 40, textAlign: 'center', color: C.t3 }}>Carregando...</div>;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: C.text }}>Tarefas - {getAreaNome(area)}</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => setWeekStart(addDays(weekStart, -7))} style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 18, color: C.t2, lineHeight: 1 }}>{'\u2039'}</button>
          <button onClick={() => setWeekStart(getMonday(new Date()))} style={{ background: C.primaryBg, border: `1px solid ${C.primary}40`, borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: C.primary }}>Hoje</button>
          <span style={{ fontSize: 14, fontWeight: 600, color: C.text, minWidth: 140, textAlign: 'center' }}>{fmtShort(weekStart)} - {fmtShort(weekEnd)}</span>
          <button onClick={() => setWeekStart(addDays(weekStart, 7))} style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 18, color: C.t2, lineHeight: 1 }}>{'\u203a'}</button>
        </div>
      </div>

      {/* Grid 7 colunas em desktop, lista vertical em mobile */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(7, 1fr)', gap: 8 }}>
        {weekDates.map((date, gi) => {
          const dateStr = fmtDate(date);
          const isToday = dateStr === todayStr;
          const kpis = dayKpis[gi];
          const tasks = dayTarefas[gi];
          const totalK = kpis.length, filledK = kpis.filter(k => k.filled).length;

          // Em mobile, esconde dias sem nada pra reduzir scroll
          if (isMobile && totalK === 0 && tasks.length === 0 && !isToday) return null;

          return (
            <div key={gi} style={{ background: C.card, border: `2px solid ${isToday ? C.primary : C.border}`, borderRadius: 12, minHeight: isMobile ? 0 : 200, display: 'flex', flexDirection: 'column' }}>
              {/* Day header */}
              <div style={{ padding: '8px 10px', borderBottom: `1px solid ${C.border}`, background: isToday ? C.primaryBg : 'transparent', borderRadius: '10px 10px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: isToday ? C.primary : C.t3, textTransform: 'uppercase' }}>{DIAS[gi]}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: isToday ? C.primary : C.text }}>{date.getDate()}/{date.getMonth()+1}</div>
                </div>
                {totalK > 0 && <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 8, background: filledK === totalK ? C.greenBg : C.bg, color: filledK === totalK ? C.green : C.t3 }}>{filledK}/{totalK}</span>}
              </div>

              <div style={{ padding: 6, flex: 1, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, overflow: 'auto' }}>
                {/* KPIs */}
                {kpis.map((k, ki) => {
                  const isFilling = fillTarget?.indicadorId === k.indicadorId && fillTarget?.date === k.date;
                  const pBadge = PERIOD_BADGE[String(k.periodicidade || '').toLowerCase()] || PERIOD_BADGE.semanal;
                  return (
                    <div key={ki} style={{ padding: '5px 7px', borderRadius: 6, cursor: k.filled || !canWrite ? 'default' : 'pointer', background: k.filled ? C.greenBg : C.blueBg, border: `1px solid ${k.filled ? C.green+'30' : C.blue+'30'}` }}
                      onClick={() => !k.filled && canWrite && setFillTarget(isFilling ? null : k)}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4 }}>
                        <span style={{ fontWeight: 600, color: k.filled ? C.green : C.blue, fontSize: 11 }}>{k.indicadorId}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span title={k.periodicidade || 'Semanal'}
                            style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 8, color: pBadge.c, background: pBadge.bg }}>
                            {pBadge.label}
                          </span>
                          {k.filled && <span style={{ fontSize: 10, color: C.green, fontWeight: 700 }}>{'\u2713'} {k.valor}</span>}
                        </div>
                      </div>
                      <div style={{ fontSize: 10, color: k.filled ? C.green : C.t2, marginTop: 1 }}>{k.processoNome}</div>
                      {isFilling && !k.filled && (
                        <div style={{ marginTop: 4, display: 'flex', gap: 3 }} onClick={e => e.stopPropagation()}>
                          <input type="number" value={fillVal} onChange={e => setFillVal(e.target.value)} placeholder="Valor" style={{ ...inp, fontSize: 11, padding: '3px 6px' }} autoFocus onKeyDown={e => e.key === 'Enter' && submitFill()} />
                          <button onClick={submitFill} disabled={saving || !fillVal} style={{ background: C.primary, color: '#fff', border: 'none', borderRadius: 6, padding: '3px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer', opacity: !fillVal ? 0.5 : 1 }}>OK</button>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Tarefas pessoais */}
                {tasks.sort((a, b) => (a.horario || '99').localeCompare(b.horario || '99')).map(t => {
                  const pr = PRIORIDADES.find(x => x.value === t.prioridade) || PRIORIDADES[1];
                  const tp = TIPOS.find(x => x.value === t.tipo);
                  const proc = t.processo_id ? processos.find(p => p.id === t.processo_id) : null;
                  const linkedKpi = proc?.indicador_ids?.length ? kpiById[proc.indicador_ids[0]] : null;
                  return (
                    <div key={t.id} style={{ padding: '4px 6px', borderRadius: 6, background: C.bg, border: `1px solid ${C.border}`, borderLeft: `3px solid ${pr.c}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <input
                          type="checkbox"
                          checked={t.done}
                          onChange={() => toggleTarefa(t.id, t.done)}
                          style={{ margin: 0, cursor: 'pointer' }}
                          title={linkedKpi && !t.done ? `Vai abrir preenchimento de ${linkedKpi.id}` : ''}
                        />
                        <span style={{ flex: 1, fontSize: 11, color: t.done ? C.t3 : C.text, textDecoration: t.done ? 'line-through' : 'none', fontWeight: 600 }}>{t.titulo}</span>
                        <button onClick={() => removeTarefa(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.t3, fontSize: 13, padding: 0, lineHeight: 1 }}>&times;</button>
                      </div>
                      <div style={{ display: 'flex', gap: 4, marginTop: 2, flexWrap: 'wrap' }}>
                        {t.horario && <span style={{ fontSize: 9, color: C.t2, fontWeight: 600 }}>{t.horario.slice(0,5)}</span>}
                        {tp && tp.value !== 'outro' && <span style={{ fontSize: 9, padding: '0 4px', borderRadius: 4, background: C.purpleBg, color: C.purple }}>{tp.label}</span>}
                        <PrioBadge p={t.prioridade} />
                        {linkedKpi && (
                          <span style={{ fontSize: 9, padding: '0 4px', borderRadius: 4, background: C.primaryBg, color: C.primary, fontWeight: 700 }} title="Marcar feita pede valor do KPI">
                            → {linkedKpi.id}
                          </span>
                        )}
                        {t.responsavel_nome && <span style={{ fontSize: 9, color: C.t3 }}>{t.responsavel_nome}</span>}
                      </div>
                    </div>
                  );
                })}

                {/* Add button */}
                <button onClick={() => openModal(gi)} style={{ width: '100%', background: 'none', border: `1px dashed ${C.border}`, borderRadius: 6, padding: '4px', cursor: 'pointer', color: C.t3, fontSize: 11, marginTop: 'auto' }}>+ Adicionar</button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal criar tarefa */}
      {modalDay !== null && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.overlay }} onClick={() => setModalDay(null)}>
          <div style={{ background: C.modalBg, borderRadius: 12, width: 560, maxHeight: '90vh', overflow: 'auto', padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,.3)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 18, color: C.text }}>Nova Tarefa - {DIAS[modalDay]} {weekDates[modalDay] ? `${weekDates[modalDay].getDate()}/${weekDates[modalDay].getMonth()+1}` : ''}</h2>
              <button onClick={() => setModalDay(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: C.t3 }}>&times;</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {/* Titulo - span full */}
              <div style={{ gridColumn: '1/-1' }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: C.t2, display: 'block', marginBottom: 4 }}>{'T\u00edtulo *'}</label>
                <input value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} placeholder="O que precisa ser feito?" style={inp} autoFocus />
              </div>

              {/* Prioridade */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: C.t2, display: 'block', marginBottom: 4 }}>Prioridade</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  {PRIORIDADES.map(p => (
                    <button key={p.value} onClick={() => setForm(f => ({ ...f, prioridade: p.value }))}
                      style={{ flex: 1, padding: '6px 0', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: form.prioridade === p.value ? `2px solid ${p.c}` : `1px solid ${C.border}`, background: form.prioridade === p.value ? p.bg : 'transparent', color: form.prioridade === p.value ? p.c : C.t3 }}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tipo */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: C.t2, display: 'block', marginBottom: 4 }}>Tipo</label>
                <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))} style={inp}>
                  {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>

              {/* Recorrencia */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: C.t2, display: 'block', marginBottom: 4 }}>{'Recorr\u00eancia'}</label>
                <select value={form.recorrencia} onChange={e => setForm(f => ({ ...f, recorrencia: e.target.value }))} style={inp}>
                  {RECORRENCIAS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
                {form.recorrencia !== 'unica' && <span style={{ fontSize: 10, color: C.t3, marginTop: 2, display: 'block' }}>Gera automaticamente para as proximas 12 semanas</span>}
              </div>

              {/* Horario */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: C.t2, display: 'block', marginBottom: 4 }}>{'Hor\u00e1rio'}</label>
                <input type="time" value={form.horario} onChange={e => setForm(f => ({ ...f, horario: e.target.value }))} style={inp} />
              </div>

              {/* Responsavel */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: C.t2, display: 'block', marginBottom: 4 }}>{'Respons\u00e1vel'}</label>
                <select value={form.responsavel_id} onChange={e => { const u = usersList.find(u => u.id === e.target.value); setForm(f => ({ ...f, responsavel_id: e.target.value, responsavel_nome: u?.name || '' })); }} style={inp}>
                  <option value="">Nenhum</option>
                  {usersList.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>

              {/* Vinculo a processo */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: C.t2, display: 'block', marginBottom: 4 }}>Vincular a processo</label>
                <select value={form.processo_id} onChange={e => setForm(f => ({ ...f, processo_id: e.target.value }))} style={inp}>
                  <option value="">Nenhum</option>
                  {processos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
              </div>

              {/* Descricao - span full */}
              <div style={{ gridColumn: '1/-1' }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: C.t2, display: 'block', marginBottom: 4 }}>{'Descri\u00e7\u00e3o'}</label>
                <textarea value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} placeholder="Detalhes adicionais..." rows={2} style={{ ...inp, resize: 'vertical' }} />
              </div>
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
              <button onClick={() => setModalDay(null)} style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: 'transparent', color: C.t2, border: `1px solid ${C.border}` }}>Cancelar</button>
              <button onClick={submitTarefa} disabled={saving || !form.titulo.trim()} style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', background: C.primary, color: '#fff', border: 'none', opacity: saving || !form.titulo.trim() ? 0.5 : 1 }}>{saving ? 'Salvando...' : 'Criar Tarefa'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de fill rapido pra KPI vinculado a tarefa que vai virar done */}
      <KpiQuickFillModal
        open={!!fillFromTask}
        kpi={fillFromTask?.kpi || null}
        periodKey={fillFromTask?.periodKey || ''}
        onClose={() => setFillFromTask(null)}
        onSaved={onFillFromTaskSaved}
      />
    </div>
  );
}
