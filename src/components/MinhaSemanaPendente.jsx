// ============================================================================
// MinhaSemanaPendente - widget na home mostrando o que precisa ser feito
//
// Lista:
//  - KPIs em vermelho da semana (agenda no dia atual ou anterior, sem
//    registro no periodo correspondente da periodicidade)
//  - Tarefas atrasadas ou de hoje (tarefas_pessoais.done=false e
//    data <= hoje)
//
// Cada KPI/tarefa pode ser preenchido em 1 clique (chama onFillKpi prop
// pra abrir modal de fill — implementacao em PR seguinte).
// ============================================================================

import { useState, useEffect, useMemo, useCallback } from 'react';
import { processos as api } from '../api';
import { useKpis } from '../hooks/useKpis';
import { useAuth } from '../contexts/AuthContext';
import { AlertCircle, CheckCircle2, ListTodo, Clock } from 'lucide-react';

// helpers
function getMonday(d) {
  const dt = new Date(d);
  const day = dt.getDay();
  dt.setDate(dt.getDate() - (day === 0 ? 6 : day - 1));
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function fmtLocal(d) {
  if (!d) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

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

// O periodo do KPI esta "ativo" hoje? (Semanal sempre. Mensal: dia 1-7
// do mes. Trimestral: 1-7 do mes inicial do trimestre, com offset.)
function isInActivePeriod(date, periodicidade, offsetMeses = 0) {
  const p = String(periodicidade || '').toLowerCase();
  if (p === 'semanal') return true;
  const day = date.getDate();
  const month = date.getMonth();
  const off = Number(offsetMeses) || 0;
  if (p === 'mensal') return day <= 7;
  if (p === 'trimestral') return (month - off + 12) % 3 === 0 && day <= 7;
  if (p === 'semestral') return (month - off + 12) % 6 === 0 && day <= 7;
  if (p === 'anual') return month === (off % 12) && day <= 7;
  return false;
}

const PRIORIDADES_COLOR = {
  alta: { c: '#ef4444', bg: '#fee2e2', label: 'Alta' },
  media: { c: '#f59e0b', bg: '#fef3c7', label: 'Média' },
  baixa: { c: '#10b981', bg: '#d1fae5', label: 'Baixa' },
};

export default function MinhaSemanaPendente({ onFillKpi }) {
  const { isAdmin, isDiretor } = useAuth();
  const canEdit = isAdmin || isDiretor;
  const { byId: kpiById, isLoading: kpisLoading } = useKpis();

  const [agenda, setAgenda] = useState([]);
  const [registros, setRegistros] = useState([]);
  const [tarefas, setTarefas] = useState([]);
  const [loading, setLoading] = useState(true);

  const today = useMemo(() => { const t = new Date(); t.setHours(0,0,0,0); return t; }, []);
  const todayStr = fmtLocal(today);
  const monday = useMemo(() => getMonday(today), [today]);
  const sunday = useMemo(() => { const s = new Date(monday); s.setDate(s.getDate() + 6); return s; }, [monday]);

  const load = useCallback(async () => {
    setLoading(true);
    // 90 dias de registros pra cobrir trimestral/semestral; tarefas open
    const di90 = fmtLocal(new Date(today.getFullYear(), today.getMonth() - 3, 1));
    const dfNext = fmtLocal(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7));
    try {
      const [a, r, t] = await Promise.all([
        api.agenda.list().catch(() => []),
        api.registros.list({ data_inicio: di90, data_fim: dfNext }).catch(() => []),
        api.tarefas.list({ data_inicio: di90, data_fim: dfNext }).catch(() => []),
      ]);
      setAgenda(a || []);
      setRegistros(r || []);
      setTarefas(t || []);
    } catch (e) {
      console.error('MinhaSemanaPendente:', e);
    } finally {
      setLoading(false);
    }
  }, [today]);

  useEffect(() => { load(); }, [load]);

  const pending = useMemo(() => {
    if (kpisLoading || loading) return { kpis: [], tasks: [] };

    // Index registros por (kpi, periodKey) usando a periodicidade do KPI
    const filledByKey = {};
    registros.forEach(r => {
      if (!r?.indicador_id || !r?.data_preenchimento) return;
      const kpi = kpiById[r.indicador_id];
      if (!kpi) return;
      const key = getPeriodKey(r.data_preenchimento, kpi.periodicidade);
      filledByKey[`${r.indicador_id}|${key}`] = r;
    });

    // KPIs pendentes desta semana
    const kpiList = [];
    const todayDow = today.getDay(); // 0=dom..6=sab
    agenda.forEach(a => {
      const kpi = kpiById[a.indicador_id];
      if (!kpi) return;
      if (kpi.ativo === false) return;
      // So mostra se o KPI esta na janela de exibicao do periodo atual
      if (!isInActivePeriod(today, kpi.periodicidade, kpi.periodo_offset_meses)) return;
      // Ja preenchido neste periodo?
      const periodKey = getPeriodKey(today, kpi.periodicidade);
      if (filledByKey[`${a.indicador_id}|${periodKey}`]) return;
      // Status: vencido, hoje, ou amanha em diante (so mostramos vencido + hoje)
      let status;
      if (a.dia_semana < todayDow && a.dia_semana !== 0) status = 'overdue';
      else if (a.dia_semana === todayDow) status = 'today';
      else if (a.dia_semana === 0 && todayDow !== 0) status = 'overdue'; // domingo passou
      else return; // futuro nesta semana, nao mostra
      kpiList.push({ kpi, agenda: a, status, periodKey });
    });

    // Ordenar: vencido primeiro, depois hoje, depois por sort_order
    kpiList.sort((x, y) => {
      if (x.status !== y.status) return x.status === 'overdue' ? -1 : 1;
      return (x.kpi.sort_order || 0) - (y.kpi.sort_order || 0);
    });

    // Tarefas atrasadas + de hoje (nao done)
    const taskList = tarefas
      .filter(t => !t.done && t.data && t.data <= todayStr)
      .sort((x, y) => (x.data || '').localeCompare(y.data || ''));

    return { kpis: kpiList, tasks: taskList };
  }, [kpiById, agenda, registros, tarefas, today, todayStr, kpisLoading, loading]);

  if (loading || kpisLoading) {
    return (
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <ListTodo className="h-4 w-4 text-primary" />
          Minha Semana
        </h2>
        <div className="h-24 rounded-lg bg-card border border-border/50 animate-pulse" />
      </section>
    );
  }

  const total = pending.kpis.length + pending.tasks.length;

  if (total === 0) {
    return (
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <ListTodo className="h-4 w-4 text-primary" />
          Minha Semana
        </h2>
        <div className="rounded-lg border border-border/50 bg-card p-6 text-center">
          <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
          <p className="text-sm font-medium text-foreground">Tudo em dia esta semana</p>
          <p className="text-xs text-muted-foreground">Nenhum KPI vencido nem tarefa atrasada</p>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
        <ListTodo className="h-4 w-4 text-primary" />
        Minha Semana
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary/20 text-primary">{total}</span>
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* KPIs pendentes */}
        {pending.kpis.length > 0 && (
          <div className="rounded-lg border border-border/50 bg-card overflow-hidden">
            <div className="px-4 py-2 border-b border-border/50 bg-amber-50 dark:bg-amber-950/30 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <span className="text-xs font-semibold text-foreground">KPIs pra preencher</span>
              <span className="text-[10px] text-muted-foreground ml-auto">{pending.kpis.length}</span>
            </div>
            <div className="max-h-72 overflow-auto divide-y divide-border/30">
              {pending.kpis.map(({ kpi, agenda: a, status, periodKey }) => {
                const isOverdue = status === 'overdue';
                return (
                  <button
                    key={`${kpi.id}|${periodKey}`}
                    onClick={() => onFillKpi?.({ kpi, periodKey })}
                    disabled={!canEdit || !onFillKpi}
                    className="w-full text-left px-4 py-2.5 hover:bg-accent/50 transition-colors flex items-center gap-3 disabled:cursor-default"
                  >
                    <span
                      className="inline-block w-1.5 h-8 rounded-full"
                      style={{ background: isOverdue ? '#ef4444' : '#f59e0b' }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold" style={{ color: isOverdue ? '#ef4444' : '#f59e0b' }}>{kpi.id}</span>
                        {kpi.is_okr && <span className="text-[9px] font-bold px-1.5 rounded bg-amber-100 text-amber-800">OKR</span>}
                        <span className="text-[10px] text-muted-foreground">{kpi.periodicidade}</span>
                      </div>
                      <div className="text-xs text-foreground truncate">{kpi.indicador || kpi.nome}</div>
                    </div>
                    <span className="text-[10px] font-medium" style={{ color: isOverdue ? '#ef4444' : '#f59e0b' }}>
                      {isOverdue ? 'Vencido' : 'Hoje'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Tarefas pessoais */}
        {pending.tasks.length > 0 && (
          <div className="rounded-lg border border-border/50 bg-card overflow-hidden">
            <div className="px-4 py-2 border-b border-border/50 bg-rose-50 dark:bg-rose-950/30 flex items-center gap-2">
              <Clock className="h-4 w-4 text-rose-600" />
              <span className="text-xs font-semibold text-foreground">Tarefas atrasadas/hoje</span>
              <span className="text-[10px] text-muted-foreground ml-auto">{pending.tasks.length}</span>
            </div>
            <div className="max-h-72 overflow-auto divide-y divide-border/30">
              {pending.tasks.map(t => {
                const isOverdue = t.data < todayStr;
                const pri = PRIORIDADES_COLOR[t.prioridade] || PRIORIDADES_COLOR.media;
                return (
                  <div
                    key={t.id}
                    className="px-4 py-2.5 hover:bg-accent/50 transition-colors flex items-center gap-3"
                  >
                    <span
                      className="inline-block w-1.5 h-8 rounded-full"
                      style={{ background: pri.c }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-bold px-1.5 rounded" style={{ color: pri.c, background: pri.bg }}>{pri.label}</span>
                        {t.area && <span className="text-[10px] text-muted-foreground">{t.area}</span>}
                      </div>
                      <div className="text-xs text-foreground truncate font-medium">{t.titulo}</div>
                    </div>
                    <span className="text-[10px] font-medium" style={{ color: isOverdue ? '#ef4444' : '#f59e0b' }}>
                      {isOverdue ? 'Atrasada' : 'Hoje'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
