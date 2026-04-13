import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  add,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  getDay,
  isEqual,
  isSameDay,
  isSameMonth,
  isToday,
  parse,
  startOfToday,
  startOfWeek,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  ChevronLeft,
  ChevronRight,
  PlusCircle,
  CalendarIcon,
  UserIcon,
  ClockIcon,
  X,
} from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Separator } from '../../../components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../../../components/ui/dialog';
import { rh } from '../../../api';
import { C, TIPO_FERIAS, FERIAS_STATUS } from '../../../lib/theme';

const VACATION_COLORS = {
  ferias: { dot: 'bg-blue-500', badge: 'bg-blue-500/10 text-blue-400 border border-blue-500/20', label: 'Férias' },
  licenca_medica: { dot: 'bg-red-500', badge: 'bg-red-500/10 text-red-400 border border-red-500/20', label: 'Licença Médica' },
  licenca_maternidade: { dot: 'bg-pink-500', badge: 'bg-pink-500/10 text-pink-400 border border-pink-500/20', label: 'Maternidade' },
  licenca_paternidade: { dot: 'bg-purple-500', badge: 'bg-purple-500/10 text-purple-400 border border-purple-500/20', label: 'Paternidade' },
  outro: { dot: 'bg-gray-500', badge: 'bg-gray-500/10 text-gray-400 border border-gray-500/20', label: 'Outro' },
};

const STATUS_BADGE = {
  pendente: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
  aprovado: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
  rejeitado: 'bg-red-500/10 text-red-400 border border-red-500/20',
};

const STATUS_LABEL = { pendente: 'Pendente', aprovado: 'Aprovado', rejeitado: 'Rejeitado' };

const colStartClasses = ['', 'col-start-2', 'col-start-3', 'col-start-4', 'col-start-5', 'col-start-6', 'col-start-7'];

const FILTER_OPTIONS = [
  { value: 'todos', label: 'Todos' },
  { value: 'ferias', label: 'Férias' },
  { value: 'licenca_medica', label: 'Licença Médica' },
  { value: 'licenca_maternidade', label: 'Maternidade' },
  { value: 'licenca_paternidade', label: 'Paternidade' },
  { value: 'outro', label: 'Outro' },
];

export default function TabFeriasCalendar({ funcs, onAprovar }) {
  const today = startOfToday();
  const [selectedDay, setSelectedDay] = useState(today);
  const [currentMonth, setCurrentMonth] = useState(format(today, 'MMM-yyyy'));
  const [ferias, setFerias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [selectedVacation, setSelectedVacation] = useState(null);
  const [form, setForm] = useState({ tipo: 'ferias' });
  const [filterType, setFilterType] = useState('todos');

  const filteredFerias = useMemo(() => {
    if (filterType === 'todos') return ferias;
    return ferias.filter(v => v.tipo === filterType);
  }, [ferias, filterType]);

  const firstDayCurrentMonth = parse(currentMonth, 'MMM-yyyy', new Date());

  const days = useMemo(() => eachDayOfInterval({
    start: startOfWeek(firstDayCurrentMonth),
    end: endOfWeek(endOfMonth(firstDayCurrentMonth)),
  }), [currentMonth]);

  const loadFerias = useCallback(async () => {
    setLoading(true);
    try {
      const data = await rh.ferias.list();
      setFerias(Array.isArray(data) ? data : []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { loadFerias(); }, [loadFerias]);

  const calendarData = useMemo(() => {
    return days.map(day => {
      const dayVacations = filteredFerias.filter(v => {
        if (!v.data_inicio || !v.data_fim) return false;
        const start = new Date(v.data_inicio + 'T00:00:00');
        const end = new Date(v.data_fim + 'T23:59:59');
        return day >= start && day <= end;
      });
      return { day, vacations: dayVacations };
    });
  }, [days, filteredFerias]);

  const selectedDayVacations = calendarData.find(d => isSameDay(d.day, selectedDay))?.vacations || [];

  const stats = useMemo(() => {
    const pending = filteredFerias.filter(v => v.status === 'pendente').length;
    const approved = filteredFerias.filter(v => v.status === 'aprovado').length;
    const totalDays = filteredFerias
      .filter(v => v.status === 'aprovado')
      .reduce((sum, v) => {
        if (!v.data_inicio || !v.data_fim) return sum;
        return sum + Math.ceil((new Date(v.data_fim) - new Date(v.data_inicio)) / 86400000);
      }, 0);
    return { pending, approved, totalDays };
  }, [filteredFerias]);

  function previousMonth() {
    setCurrentMonth(format(add(firstDayCurrentMonth, { months: -1 }), 'MMM-yyyy'));
  }
  function nextMonth() {
    setCurrentMonth(format(add(firstDayCurrentMonth, { months: 1 }), 'MMM-yyyy'));
  }
  function goToToday() {
    setCurrentMonth(format(today, 'MMM-yyyy'));
    setSelectedDay(today);
  }

  async function handleAprovar(id, status) {
    await onAprovar(id, status);
    loadFerias();
    setSelectedVacation(null);
  }

  async function handleSave() {
    try {
      await rh.ferias.create(form);
      setIsNewOpen(false);
      setForm({ tipo: 'ferias' });
      loadFerias();
    } catch (e) { console.error(e); }
  }

  const upd = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const getName = (v) => v.rh_funcionarios?.nome || 'Colaborador';
  const getInitial = (v) => (getName(v)[0] || '?').toUpperCase();
  const getType = (v) => VACATION_COLORS[v.tipo] || VACATION_COLORS.outro;

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10">
            <div className="text-center leading-none">
              <div className="text-[10px] font-bold text-primary uppercase">{format(today, 'MMM')}</div>
              <div className="text-lg font-bold text-primary">{format(today, 'd')}</div>
            </div>
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">Férias dos Colaboradores</h2>
            <p className="text-sm text-muted-foreground capitalize">
              {format(firstDayCurrentMonth, 'MMMM yyyy', { locale: ptBR })}
            </p>
          </div>
        </div>
      </div>

      {/* Stats + Navigation */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
            <ClockIcon className="h-4 w-4 text-amber-400" />
            <div>
              <div className="text-[10px] text-muted-foreground uppercase font-medium">Pendentes</div>
              <div className="text-lg font-bold text-foreground">{stats.pending}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
            <CalendarIcon className="h-4 w-4 text-emerald-400" />
            <div>
              <div className="text-[10px] text-muted-foreground uppercase font-medium">Aprovadas</div>
              <div className="text-lg font-bold text-foreground">{stats.approved}</div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={previousMonth} className="h-8 w-8">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={goToToday}>Hoje</Button>
          <Button variant="outline" size="icon" onClick={nextMonth} className="h-8 w-8">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Separator orientation="vertical" className="h-6 mx-1" />
          <Button onClick={() => { setForm({ tipo: 'ferias' }); setIsNewOpen(true); }}>
            <PlusCircle className="h-4 w-4 mr-1" /> Nova Solicitação
          </Button>
        </div>
      </div>

      {/* Type Filter */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {FILTER_OPTIONS.map(opt => {
          const isActive = filterType === opt.value;
          const color = opt.value !== 'todos' ? VACATION_COLORS[opt.value] : null;
          return (
            <button
              key={opt.value}
              onClick={() => setFilterType(opt.value)}
              className={[
                'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                isActive
                  ? (color ? color.badge : 'bg-primary text-primary-foreground border-primary')
                  : 'bg-card text-muted-foreground border-border hover:bg-muted/50',
              ].join(' ')}
            >
              {color && <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${color.dot}`} />}
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 flex-wrap rounded-lg border border-border bg-card px-4 py-2.5">
        <span className="text-xs font-medium text-muted-foreground mr-1">Legenda:</span>
        {Object.entries(VACATION_COLORS).map(([key, val]) => (
          <div key={key} className="flex items-center gap-1.5">
            <span className={`inline-block w-2.5 h-2.5 rounded-full ${val.dot}`} />
            <span className="text-xs text-foreground">{val.label}</span>
          </div>
        ))}
      </div>

      {/* Calendar + Sidebar */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-4">
        {/* Calendar */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="grid grid-cols-7 border-b border-border">
            {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => (
              <div key={d} className="py-2 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {calendarData.map((dayData, dayIdx) => (
              <button
                key={dayData.day.toISOString()}
                onClick={() => setSelectedDay(dayData.day)}
                type="button"
                className={[
                  'relative flex flex-col min-h-[90px] p-1.5 border-b border-r border-border transition-colors hover:bg-muted/50 focus:z-10 focus:outline-none text-left',
                  dayIdx === 0 ? colStartClasses[getDay(dayData.day)] : '',
                  !isSameMonth(dayData.day, firstDayCurrentMonth) ? 'opacity-40' : '',
                  isEqual(dayData.day, selectedDay) ? 'ring-2 ring-primary ring-inset bg-primary/5' : '',
                ].filter(Boolean).join(' ')}
              >
                <span className={[
                  'inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium mb-0.5',
                  isToday(dayData.day) ? 'bg-primary text-primary-foreground' : 'text-foreground',
                ].join(' ')}>
                  {format(dayData.day, 'd')}
                </span>
                <div className="flex flex-col gap-0.5 overflow-hidden flex-1">
                  {dayData.vacations.slice(0, 2).map(v => {
                    const type = getType(v);
                    return (
                      <div
                        key={v.id}
                        onClick={(e) => { e.stopPropagation(); setSelectedVacation(v); }}
                        className={`text-[10px] font-medium px-1.5 py-0.5 rounded truncate cursor-pointer ${type.badge}`}
                      >
                        {getName(v)}
                      </div>
                    );
                  })}
                  {dayData.vacations.length > 2 && (
                    <div className="text-[10px] text-muted-foreground font-medium px-1">
                      +{dayData.vacations.length - 2} mais
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Sidebar */}
        <div className="flex flex-col gap-4">
          {/* Selected day */}
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-sm font-bold text-foreground mb-3">
              {format(selectedDay, "d 'de' MMMM, yyyy", { locale: ptBR })}
            </h3>
            {selectedDayVacations.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Nenhuma solicitação para este dia
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {selectedDayVacations.map(v => {
                  const type = getType(v);
                  const dias = v.data_inicio && v.data_fim
                    ? Math.ceil((new Date(v.data_fim) - new Date(v.data_inicio)) / 86400000)
                    : 0;
                  return (
                    <div
                      key={v.id}
                      className="flex items-start gap-3 p-3 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer"
                      onClick={() => setSelectedVacation(v)}
                    >
                      {v.rh_funcionarios?.foto_url ? (
                        <img src={v.rh_funcionarios.foto_url} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                          style={{ background: C.primaryBg, color: C.primary }}>
                          {getInitial(v)}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-foreground truncate">{getName(v)}</div>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${type.badge}`}>
                            {type.label}
                          </span>
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${STATUS_BADGE[v.status] || ''}`}>
                            {STATUS_LABEL[v.status] || v.status}
                          </span>
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-1">
                          {dias} {dias === 1 ? 'dia' : 'dias'}
                        </div>
                        {v.observacoes && (
                          <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{v.observacoes}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <Separator />

          {/* All requests */}
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-sm font-bold text-foreground mb-3">Todas as Solicitações</h3>
            <div className="flex flex-col gap-1.5 max-h-[300px] overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-6 gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/25 border-t-primary" />
                  <span className="text-xs text-muted-foreground">Carregando...</span>
                </div>
              ) : filteredFerias.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhuma solicitação</p>
              ) : filteredFerias.map(v => (
                <div
                  key={v.id}
                  className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() => setSelectedVacation(v)}
                >
                  {v.rh_funcionarios?.foto_url ? (
                    <img src={v.rh_funcionarios.foto_url} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                      style={{ background: C.primaryBg, color: C.primary }}>
                      {getInitial(v)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-foreground truncate">{getName(v)}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {v.data_inicio ? format(new Date(v.data_inicio + 'T12:00:00'), 'dd/MM') : '?'} - {v.data_fim ? format(new Date(v.data_fim + 'T12:00:00'), 'dd/MM') : '?'}
                    </div>
                  </div>
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${STATUS_BADGE[v.status] || ''}`}>
                    {STATUS_LABEL[v.status] || v.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Detail Dialog */}
      <Dialog open={!!selectedVacation} onOpenChange={() => setSelectedVacation(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Detalhes da Solicitação</DialogTitle>
          </DialogHeader>
          {selectedVacation && (() => {
            const v = selectedVacation;
            const type = getType(v);
            const dias = v.data_inicio && v.data_fim
              ? Math.ceil((new Date(v.data_fim) - new Date(v.data_inicio)) / 86400000)
              : 0;
            return (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  {v.rh_funcionarios?.foto_url ? (
                    <img src={v.rh_funcionarios.foto_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                  ) : (
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold"
                      style={{ background: C.primaryBg, color: C.primary }}>
                      {getInitial(v)}
                    </div>
                  )}
                  <div>
                    <div className="font-semibold text-foreground">{getName(v)}</div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded ${STATUS_BADGE[v.status] || ''}`}>
                      {STATUS_LABEL[v.status] || v.status}
                    </span>
                  </div>
                </div>
                <Separator />
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tipo:</span>
                    <span className={`font-medium px-2 py-0.5 rounded text-xs ${type.badge}`}>{type.label}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Período:</span>
                    <span className="font-medium text-foreground">
                      {v.data_inicio ? format(new Date(v.data_inicio + 'T12:00:00'), 'dd/MM/yyyy') : '?'} — {v.data_fim ? format(new Date(v.data_fim + 'T12:00:00'), 'dd/MM/yyyy') : '?'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Dias:</span>
                    <span className="font-medium text-foreground">{dias}</span>
                  </div>
                  {v.observacoes && (
                    <div>
                      <span className="text-muted-foreground">Motivo:</span>
                      <p className="text-foreground mt-1">{v.observacoes}</p>
                    </div>
                  )}
                </div>
                {v.status === 'pendente' && (
                  <>
                    <Separator />
                    <div className="flex gap-2">
                      <Button className="flex-1" onClick={() => handleAprovar(v.id, 'aprovado')}>Aprovar</Button>
                      <Button variant="destructive" className="flex-1" onClick={() => handleAprovar(v.id, 'rejeitado')}>Rejeitar</Button>
                    </div>
                  </>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* New Request Dialog */}
      <Dialog open={isNewOpen} onOpenChange={setIsNewOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Solicitação de Férias/Licença</DialogTitle>
            <DialogDescription>Preencha os dados para solicitar</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Colaborador *</label>
              <ShadSelect value={form.funcionario_id || '__none__'} onValueChange={v => upd('funcionario_id', v === '__none__' ? '' : v)}>
                <SelectTrigger className="h-9 w-full text-sm"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent className="z-[1001]">
                  <SelectItem value="__none__">Selecionar</SelectItem>
                  {(funcs || []).filter(f => f.status === 'ativo').map(f => (
                    <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                  ))}
                </SelectContent>
              </ShadSelect>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Tipo *</label>
              <ShadSelect value={form.tipo} onValueChange={v => upd('tipo', v)}>
                <SelectTrigger className="h-9 w-full text-sm"><SelectValue /></SelectTrigger>
                <SelectContent className="z-[1001]">
                  {Object.entries(TIPO_FERIAS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </ShadSelect>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Data Início *</label>
                <input type="date" className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm shadow-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={form.data_inicio || ''} onChange={e => upd('data_inicio', e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Data Fim *</label>
                <input type="date" className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm shadow-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={form.data_fim || ''} onChange={e => upd('data_fim', e.target.value)} />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Observações</label>
              <textarea className="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm shadow-black/5 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                style={{ minHeight: 60, resize: 'vertical' }}
                value={form.observacoes || ''} onChange={e => upd('observacoes', e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNewOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave}>Solicitar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
