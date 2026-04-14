import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import PeriodFilter from './components/reports/PeriodFilter';
import VolunteerThermometer from './components/reports/VolunteerThermometer';
import { useVolReportData, useVolunteerThermometer, useInactiveVolunteers } from './hooks';
import { useVolTeams } from './hooks';
import { UserX, Flame, BarChart3, Calendar, CheckCircle2, TrendingUp, Users, Printer } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function VolRelatorios() {
  const [period, setPeriod] = useState('week');
  const [teamFilter, setTeamFilter] = useState('__all__');
  const teamFilterValue = teamFilter === '__all__' ? undefined : teamFilter;
  const { data: reportData } = useVolReportData(period as any);
  const { data: thermometerData = [] } = useVolunteerThermometer(period as any, teamFilterValue);
  const { data: inactiveData = [] } = useInactiveVolunteers('3months', teamFilterValue);
  const { data: teams = [] } = useVolTeams();

  // Compute summary stats
  const stats = useMemo(() => {
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
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Relatorios</h1>
          <p className="text-sm text-muted-foreground">Analise de presenca</p>
        </div>
        <div className="flex gap-2 items-center">
          <Button variant="outline" size="sm" className="gap-1" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Imprimir
          </Button>
          <Select value={teamFilter} onValueChange={setTeamFilter}>
            <SelectTrigger className="w-[170px]">
              <SelectValue placeholder="Todas Equipes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas Equipes</SelectItem>
              {teams.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <TabsList>
            <TabsTrigger value="weekly" className="gap-1"><Calendar className="h-4 w-4" /> Relatorio Semanal</TabsTrigger>
            <TabsTrigger value="overview" className="gap-1"><BarChart3 className="h-4 w-4" /> Visao Geral</TabsTrigger>
            <TabsTrigger value="inactive" className="gap-1"><UserX className="h-4 w-4" /> Inativos</TabsTrigger>
            <TabsTrigger value="thermometer" className="gap-1"><Flame className="h-4 w-4" /> Termometro</TabsTrigger>
          </TabsList>
          <PeriodFilter value={period} onChange={setPeriod} />
        </div>

        {/* ── Visao Geral ── */}
        <TabsContent value="overview">
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardContent className="p-4 text-center">
                <Calendar className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                <p className="text-2xl font-bold">{stats.scheduled}</p>
                <p className="text-xs text-muted-foreground">Escalados</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <CheckCircle2 className="h-5 w-5 mx-auto mb-1 text-green-600" />
                <p className="text-2xl font-bold">{stats.checkedIn}</p>
                <p className="text-xs text-muted-foreground">Check-ins</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <TrendingUp className="h-5 w-5 mx-auto mb-1 text-blue-600" />
                <p className="text-2xl font-bold">{stats.rate}%</p>
                <p className="text-xs text-muted-foreground">Taxa</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <Users className="h-5 w-5 mx-auto mb-1 text-purple-600" />
                <p className="text-2xl font-bold">{stats.uniqueVol}</p>
                <p className="text-xs text-muted-foreground">Vol. Unicos</p>
              </CardContent>
            </Card>
          </div>

          {/* Per-service breakdown */}
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
                            className={`h-full rounded-full transition-all ${svc.rate >= 80 ? 'bg-green-500' : svc.rate >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                            style={{ width: `${Math.min(svc.rate, 100)}%` }}
                          />
                        </div>
                        <span className="text-sm text-muted-foreground w-16 text-right">{svc.present}/{svc.total}</span>
                        <span className={`text-sm font-semibold w-12 text-right ${svc.rate >= 80 ? 'text-green-600' : svc.rate >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                          {svc.rate}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Relatorio Semanal (same as overview but filtered to week) ── */}
        <TabsContent value="weekly">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardContent className="p-4 text-center">
                <Calendar className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                <p className="text-2xl font-bold">{stats.scheduled}</p>
                <p className="text-xs text-muted-foreground">Escalados</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <CheckCircle2 className="h-5 w-5 mx-auto mb-1 text-green-600" />
                <p className="text-2xl font-bold">{stats.checkedIn}</p>
                <p className="text-xs text-muted-foreground">Check-ins</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <TrendingUp className="h-5 w-5 mx-auto mb-1 text-blue-600" />
                <p className="text-2xl font-bold">{stats.rate}%</p>
                <p className="text-xs text-muted-foreground">Taxa</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <Users className="h-5 w-5 mx-auto mb-1 text-purple-600" />
                <p className="text-2xl font-bold">{stats.uniqueVol}</p>
                <p className="text-xs text-muted-foreground">Vol. Unicos</p>
              </CardContent>
            </Card>
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
                            className={`h-full rounded-full transition-all ${svc.rate >= 80 ? 'bg-green-500' : svc.rate >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                            style={{ width: `${Math.min(svc.rate, 100)}%` }}
                          />
                        </div>
                        <span className="text-sm text-muted-foreground w-16 text-right">{svc.present}/{svc.total}</span>
                        <span className={`text-sm font-semibold w-12 text-right ${svc.rate >= 80 ? 'text-green-600' : svc.rate >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                          {svc.rate}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Termometro ── */}
        <TabsContent value="thermometer">
          <Card>
            <CardContent className="p-4">
              <VolunteerThermometer data={thermometerData} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Inativos ── */}
        <TabsContent value="inactive">
          <Card>
            <CardContent className="p-4">
              <h3 className="font-semibold mb-4">Voluntarios Inativos (3+ meses)</h3>
              <div className="space-y-2">
                {inactiveData.map((v: any) => (
                  <div key={v.planningCenterId} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                    <div>
                      <p className="font-medium">{v.name}</p>
                      {v.team && <p className="text-sm text-muted-foreground">{v.team}</p>}
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {v.lastCheckIn ? `Ultimo: ${new Date(v.lastCheckIn).toLocaleDateString('pt-BR')}` : 'Nunca fez check-in'}
                    </span>
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
