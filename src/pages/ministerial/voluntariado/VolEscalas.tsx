import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useUpcomingServices, useServiceSchedules } from './hooks';
import ScheduleList from './components/schedules/ScheduleList';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarPlus } from 'lucide-react';

export default function VolEscalas() {
  const navigate = useNavigate();
  const { data: services = [], isLoading } = useUpcomingServices();
  const [selectedServiceId, setSelectedServiceId] = useState('');
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
                  {svc.name} — {format(new Date(svc.scheduled_at), "dd/MM 'as' HH:mm", { locale: ptBR })}
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
            <CardHeader><CardTitle>{selectedService.name}</CardTitle></CardHeader>
            <CardContent><ScheduleList schedules={schedules} /></CardContent>
          </Card>
        </>
      )}

      {!selectedServiceId && !isLoading && (
        <p className="text-center text-muted-foreground py-8">Selecione um culto para ver as escalas</p>
      )}
    </div>
  );
}
