import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import PeriodFilter from './components/reports/PeriodFilter';
import VolunteerThermometer from './components/reports/VolunteerThermometer';
import { useVolReportData, useVolunteerThermometer, useInactiveVolunteers } from './hooks';
import { useVolTeams } from './hooks';
import { UserX, Flame, BarChart3, Calendar, CheckCircle2, TrendingUp, Users, Printer, AlertTriangle, Filter, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const METHOD_LABELS: Record<string, string> = {
  qr_code: 'QR',
  manual: 'Manual',
  facial: 'Facial',
  self_service: 'Self',
};

export default function VolRelatorios() {
  const [period, setPeriod] = useState('week');
  const [teamFilter, setTeamFilter] = useState('__all__');
  const [inactiveMode, setInactiveMode] = useState<'checkin' | 'schedule'>('checkin');
  const teamFilterValue = teamFilter === '__all__' ? undefined : teamFilter;
  const { data: reportData } = useVolReportData(period as any);
  const { data: thermometerData = [] } = useVolunteerThermometer(period as any, teamFilterValue);
  const { data: inactiveByCheckin = [] } = useInactiveVolunteers(period, teamFilterValue, 'checkin');
  const { data: inactiveBySchedule = [] } = useInactiveVolunteers(period, teamFilterValue, 'schedule');
  const { data: teams = [] } = useVolTeams();
  const inactiveData = inactiveMode === 'checkin' ? inactiveByCheckin : inactiveBySchedule;

  // ── Overview stats (Visao Geral) ──
  const overviewStats = useMemo(() => {
    if (!reportData) return { rate: 0, uniqueVol: 0, totalServices: 0, unscheduledCount: 0 };
    const scheduled = reportData.schedules.length;
    const checkedIn = reportData.checkIns.length;
    const rate = scheduled > 0 ? Math.round((checkedIn / scheduled) * 100) : 0;
    const uniqueVol = new Set(reportData.schedules.map(s => s.planning_center_person_id)).size;
    const unscheduledCount = reportData.checkIns.filter(c => c.is_unscheduled).length;
    return { rate, uniqueVol, totalServices: reportData.services.length, unscheduledCount };
  }, [reportData]);

  // Unscheduled check-ins list
  const unscheduledCheckIns = useMemo(() => {
    if (!reportData) return [];
    return reportData.checkIns
      .filter(c => c.is_unscheduled)
      .sort((a, b) => new Date(b.checked_in_at).getTime() - new Date(a.checked_in_at).getTime())
      .map(ci => {
        const svc = reportData.services.find(s => s.id === ci.service_id);
        return { ...ci, serviceName: svc?.name || 'Desconhecido' };
      });
  }, [reportData]);

  // ── Weekly/Report stats (Relatorio Semanal + Por Culto) ──
  const weeklyStats = useMemo(() => {
    if (!reportData) return { scheduled: 0, checkedIn: 0, rate: 0, uniqueVol: 0 };
    const scheduled = reportData.schedules.length;
    const checkedIn = reportData.checkIns.length;
    const rate = scheduled > 0 ? Math.round((checkedIn / scheduled) * 100) : 0;
    const uniqueVol = new Set(reportData.schedules.map(s => s.planning_center_person_id)).size;
    return { scheduled, checkedIn, rate, uniqueVol };
  }, [reportData]);

  // Per-service breakdown
  const serviceBreakdown = useMemo(() => {
    if (!reportData) return [];
    return reportData.services
      .sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime())
      .map(svc => {
        const svcSchedules = reportData.schedules.filter(s => s.service_id === svc.id);
        const svcCheckIns = reportData.checkIns.filter(c => c.service_id === svc.id);
        const total = svcSchedules.length;
        const present = svcCheckIns.length;
        const rate = total > 0 ? Math.round((present / total) * 100) : 0;
        return { ...svc, total, present, rate };
      });
  }, [reportData]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">Relatorios</h1>
          <p className="text-sm text-muted-foreground">Analise de presenca</p>
        </div>
        <div className="flex gap-2 items-center w-full sm:w-auto">
          <Button variant="outline" size="sm" className="gap-1 hidden sm:flex" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Imprimir
          </Button>
          <Select value={teamFilter} onValueChange={setTeamFilter}>
            <SelectTrigger className="w-full sm:w-[170px]">
              <div className="flex items-center gap-1.5">
                <Filter className="h-3.5 w-3.5" />
                <SelectValue placeholder="Todas Equipes" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas Equipes</SelectItem>
              {teams.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs defaultValue="weekly">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div className="w-full sm:w-auto overflow-x-auto scrollbar-hide">
            <TabsList className="inline-flex w-auto min-w-max">
              <TabsTrigger value="weekly" className="gap-1 text-xs sm:text-sm"><Calendar className="h-4 w-4 shrink-0" /><span className="hidden sm:inline">Relatorio</span> Semanal</TabsTrigger>
              <TabsTrigger value="overview" className="gap-1 text-xs sm:text-sm"><BarChart3 className="h-4 w-4 shrink-0" /><span className="hidden sm:inline">Visao</span> Geral</TabsTrigger>
              <TabsTrigger value="inactive" className="gap-1 text-xs sm:text-sm"><UserX className="h-4 w-4 shrink-0" />Inativos</TabsTrigger>
              <TabsTrigger value="thermometer" className="gap-1 text-xs sm:text-sm"><Flame className="h-4 w-4 shrink-0" />Termometro</TabsTrigger>
            </TabsList>
          </div>
          <PeriodFilter value={period} onChange={setPeriod} />
        </div>

        {/* ═══════════════════════════════════════════════════════════════
            RELATORIO SEMANAL — stats + por culto
        ═══════════════════════════════════════════════════════════════ */}
        <TabsContent value="weekly">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card><CardContent className="p-4 text-center">
              <Calendar className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
              <p className="text-2xl font-bold">{weeklyStats.scheduled}</p>
              <p className="text-xs text-muted-foreground">Escalados</p>
            </CardContent></Card>
            <Card><CardContent className="p-4 text-center">
              <CheckCircle2 className="h-5 w-5 mx-auto mb-1 text-green-600" />
              <p className="text-2xl font-bold">{weeklyStats.checkedIn}</p>
              <p className="text-xs text-muted-foreground">Check-ins</p>
            </CardContent></Card>
            <Card><CardContent className="p-4 text-center">
              <TrendingUp className="h-5 w-5 mx-auto mb-1 text-blue-600" />
              <p className="text-2xl font-bold">{weeklyStats.rate}%</p>
              <p className="text-xs text-muted-foreground">Taxa</p>
            </CardContent></Card>
            <Card><CardContent className="p-4 text-center">
              <Users className="h-5 w-5 mx-auto mb-1 text-purple-600" />
              <p className="text-2xl font-bold">{weeklyStats.uniqueVol}</p>
              <p className="text-xs text-muted-foreground">Vol. Unicos</p>
            </CardContent></Card>
          </div>

          <Card>
            <CardContent className="p-4">
              <h3 className="font-semibold mb-4">Por Culto</h3>
              {serviceBreakdown.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Nenhum culto no periodo</p>
              ) : (
                <div className="space-y-3">
                  {serviceBreakdown.map(svc => (
                    <div key={svc.id} className="flex items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{svc.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(svc.scheduled_at), "EEEE, dd/MM 'as' HH:mm", { locale: ptBR })}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="w-32 h-2 bg-muted rounded-full overflow-hidden hidden sm:block">
                          <div
                            className={`h-full rounded-full ${svc.rate >= 80 ? 'bg-green-500' : svc.rate >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                            style={{ width: `${Math.min(svc.rate, 100)}%` }}
                          />
                        </div>
                        <span className="text-sm text-muted-foreground w-16 text-right">{svc.present}/{svc.total}</span>
                        <Badge variant={svc.rate >= 80 ? 'default' : 'outline'} className={svc.rate >= 80 ? 'bg-green-600 text-white' : ''}>
                          {svc.rate}%
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════
            VISAO GERAL — taxa, voluntarios, cultos, sem escala + lista
        ═══════════════════════════════════════════════════════════════ */}
        <TabsContent value="overview">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card><CardContent className="p-4 text-center">
              <TrendingUp className="h-5 w-5 mx-auto mb-1 text-blue-600" />
              <p className="text-2xl font-bold">{overviewStats.rate}%</p>
              <p className="text-xs text-muted-foreground">Taxa</p>
            </CardContent></Card>
            <Card><CardContent className="p-4 text-center">
              <Users className="h-5 w-5 mx-auto mb-1 text-purple-600" />
              <p className="text-2xl font-bold">{overviewStats.uniqueVol}</p>
              <p className="text-xs text-muted-foreground">Voluntarios</p>
            </CardContent></Card>
            <Card><CardContent className="p-4 text-center">
              <Calendar className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
              <p className="text-2xl font-bold">{overviewStats.totalServices}</p>
              <p className="text-xs text-muted-foreground">Cultos</p>
            </CardContent></Card>
            <Card><CardContent className="p-4 text-center">
              <AlertTriangle className="h-5 w-5 mx-auto mb-1 text-yellow-500" />
              <p className="text-2xl font-bold">{overviewStats.unscheduledCount}</p>
              <p className="text-xs text-muted-foreground">Sem escala</p>
            </CardContent></Card>
          </div>

          {/* Unscheduled check-ins */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
                <h3 className="font-semibold">Check-ins sem Escala</h3>
              </div>
              {unscheduledCheckIns.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Nenhum check-in sem escala no periodo</p>
              ) : (
                <div className="space-y-2">
                  {unscheduledCheckIns.map(ci => (
                    <div key={ci.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                      <div className="min-w-0">
                        <p className="font-medium text-sm">Voluntario</p>
                        <p className="text-xs text-muted-foreground">{ci.serviceName}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(ci.checked_in_at), 'dd/MM HH:mm')}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {METHOD_LABELS[ci.method] || ci.method}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════
            TERMOMETRO
        ═══════════════════════════════════════════════════════════════ */}
        <TabsContent value="thermometer">
          <VolunteerThermometer data={thermometerData} />
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════
            INATIVOS — Por Check-in / Por Escala
        ═══════════════════════════════════════════════════════════════ */}
        <TabsContent value="inactive">
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-1 bg-muted rounded-lg p-1">
              <button
                onClick={() => setInactiveMode('checkin')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${inactiveMode === 'checkin' ? 'bg-card shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Por Check-in
              </button>
              <button
                onClick={() => setInactiveMode('schedule')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${inactiveMode === 'schedule' ? 'bg-card shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Por Escala
              </button>
            </div>
            <div className="flex items-center gap-2">
              <UserX className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{inactiveData.length} inativos</span>
            </div>
          </div>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-4">
                <UserX className="h-5 w-5 text-red-500" />
                <h3 className="font-semibold">
                  Voluntarios Inativos
                </h3>
                <span className="text-sm text-muted-foreground">
                  ({inactiveMode === 'checkin' ? 'sem check-in' : 'sem escala'})
                </span>
              </div>
              <div className="space-y-2">
                {inactiveData.map((v: any) => (
                  <div key={v.planningCenterId} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                    <div className="min-w-0">
                      <p className="font-medium">{v.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {v.team ? `${v.team} · ` : ''}
                        {v.lastDate ? `Ultimo: ${new Date(v.lastDate).toLocaleDateString('pt-BR')}` : inactiveMode === 'checkin' ? 'Nunca fez check-in' : 'Nunca foi escalado'}
                      </p>
                    </div>
                    <div className="shrink-0">
                      {v.monthsInactive ? (
                        <Badge className="bg-red-500 text-white hover:bg-red-600">
                          {v.monthsInactive} {v.monthsInactive === 1 ? 'mes' : 'meses'}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          Nunca
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
                {inactiveData.length === 0 && <p className="text-center text-muted-foreground py-8">Nenhum voluntario inativo encontrado</p>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
