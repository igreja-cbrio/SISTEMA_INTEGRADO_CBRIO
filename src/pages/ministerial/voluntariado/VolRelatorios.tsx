import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import PeriodFilter from './components/reports/PeriodFilter';
import ServiceTable from './components/reports/ServiceTable';
import VolunteerThermometer from './components/reports/VolunteerThermometer';
import { useVolReportData, useVolunteerThermometer, useInactiveVolunteers } from './hooks';
import { useVolTeams } from './hooks';
import { UserX, Flame, BarChart3 } from 'lucide-react';

export default function VolRelatorios() {
  const [period, setPeriod] = useState('month');
  const [teamFilter, setTeamFilter] = useState('');
  const { data: reportData } = useVolReportData(period as any);
  const { data: thermometerData = [] } = useVolunteerThermometer(period as any, teamFilter || undefined);
  const { data: inactiveData = [] } = useInactiveVolunteers('3months', teamFilter || undefined);
  const { data: teams = [] } = useVolTeams();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-foreground">Relatorios</h1>
        <div className="flex gap-2">
          <Select value={teamFilter} onValueChange={setTeamFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Todas equipes" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">Todas</SelectItem>
              {teams.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <PeriodFilter value={period} onChange={setPeriod} />
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview" className="gap-1"><BarChart3 className="h-4 w-4" /> Visao Geral</TabsTrigger>
          <TabsTrigger value="thermometer" className="gap-1"><Flame className="h-4 w-4" /> Termometro</TabsTrigger>
          <TabsTrigger value="inactive" className="gap-1"><UserX className="h-4 w-4" /> Inativos</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card>
            <CardHeader><CardTitle>Cultos no periodo</CardTitle></CardHeader>
            <CardContent>
              {reportData ? (
                <ServiceTable services={reportData.services} schedules={reportData.schedules} checkIns={reportData.checkIns} />
              ) : (
                <p className="text-center text-muted-foreground py-8">Carregando...</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="thermometer">
          <Card>
            <CardHeader><CardTitle>Termometro de Voluntarios</CardTitle></CardHeader>
            <CardContent><VolunteerThermometer data={thermometerData} /></CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="inactive">
          <Card>
            <CardHeader><CardTitle>Voluntarios Inativos (3+ meses)</CardTitle></CardHeader>
            <CardContent>
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
