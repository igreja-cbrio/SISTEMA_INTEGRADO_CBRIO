import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useUpcomingServices, useServiceSchedules } from './hooks';
import ScheduleList from './components/schedules/ScheduleList';
import SchedulesByTeam from './components/schedules/SchedulesByTeam';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarPlus, LayoutGrid, List } from 'lucide-react';

export default function VolEscalas() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { data: services = [], isLoading } = useUpcomingServices();
  const [selectedServiceId, setSelectedServiceId] = useState(searchParams.get('serviceId') || '');
  const [vista, setVista] = useState<'equipes' | 'lista'>('equipes');
  const { data: schedules = [] } = useServiceSchedules(selectedServiceId || undefined);

  const selectedService = services.find(s => s.id === selectedServiceId);
  const total = schedules.length;
  const confirmed = schedules.filter(s => s.confirmation_status === 'confirmed').length;
  const checkedIn = schedules.filter(s => s.check_in).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Escalas</h1>
        <Button
          size="sm"
          className="gap-1.5 bg-[#00B39D] hover:bg-[#00B39D]/90"
          onClick={() => navigate('/ministerial/voluntariado/montar-escala')}
        >
          <CalendarPlus className="h-4 w-4" /> Montar Escala
        </Button>
      </div>

      <Card>
        <CardContent className="p-4">
          <Select value={selectedServiceId} onValueChange={setSelectedServiceId}>
            <SelectTrigger><SelectValue placeholder="Selecione um culto" /></SelectTrigger>
            <SelectContent>
              {services.map(svc => (
                <SelectItem key={svc.id} value={svc.id}>
                  {svc.name} — {format(new Date(svc.scheduled_at), "EEEE, dd/MM", { locale: ptBR })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {selectedServiceId && selectedService && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold">{total}</p><p className="text-sm text-muted-foreground">Escalados</p></CardContent></Card>
            <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-blue-600">{confirmed}</p><p className="text-sm text-muted-foreground">Confirmados</p></CardContent></Card>
            <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-green-600">{checkedIn}</p><p className="text-sm text-muted-foreground">Presentes</p></CardContent></Card>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
              <CardTitle>{selectedService.name}</CardTitle>
              <div className="flex rounded-lg border bg-muted/40 p-0.5">
                <button
                  type="button"
                  onClick={() => setVista('equipes')}
                  className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${vista === 'equipes' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  <LayoutGrid className="h-3.5 w-3.5" /> Equipes
                </button>
                <button
                  type="button"
                  onClick={() => setVista('lista')}
                  className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${vista === 'lista' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  <List className="h-3.5 w-3.5" /> Lista
                </button>
              </div>
            </CardHeader>
            <CardContent>
              {vista === 'equipes'
                ? <SchedulesByTeam schedules={schedules} />
                : <ScheduleList schedules={schedules} />}
            </CardContent>
          </Card>
        </>
      )}

      {!selectedServiceId && !isLoading && (
        <p className="text-center text-muted-foreground py-8">Selecione um culto para ver as escalas</p>
      )}
    </div>
  );
}
