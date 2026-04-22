import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw, Users, Calendar, QrCode, BarChart3, ClipboardCheck, Loader2, Monitor, Users as UsersIcon } from 'lucide-react';
import { useTodaysServices, useUpcomingServices } from './hooks';
import { useSyncPlanningCenter, useLastSync } from './hooks';
import LastSyncIndicator from './components/dashboard/LastSyncIndicator';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

export default function VolDashboard() {
  const navigate = useNavigate();
  const { data: todayServices = [] } = useTodaysServices();
  const { data: upcomingServices = [] } = useUpcomingServices();
  const sync = useSyncPlanningCenter();

  const handleSync = async () => {
    try {
      const result = await sync.mutateAsync();
      toast.success(`Sincronizado: ${result.services} cultos, ${result.newSchedules} escalas`);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao sincronizar');
    }
  };

  const quickActions = [
    { label: 'Check-in', icon: ClipboardCheck, path: '/ministerial/voluntariado/checkin', color: 'text-green-600' },
    { label: 'Modo Totem', icon: Monitor, path: '/voluntariado/totem', color: 'text-teal-600' },
    { label: 'Escalas', icon: Calendar, path: '/ministerial/voluntariado/escalas', color: 'text-blue-600' },
    { label: 'QR Codes', icon: QrCode, path: '/ministerial/voluntariado/qrcodes', color: 'text-purple-600' },
    { label: 'Relatorios', icon: BarChart3, path: '/ministerial/voluntariado/relatorios', color: 'text-orange-600' },
    { label: 'Administracao', icon: Users, path: '/ministerial/voluntariado/admin', color: 'text-red-600' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">Voluntariado</h1>
          <LastSyncIndicator />
        </div>
        <Button onClick={handleSync} disabled={sync.isPending} variant="outline" className="gap-2 w-full sm:w-auto">
          {sync.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Sincronizar
        </Button>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2 md:gap-3">
        {quickActions.map(a => (
          <Card key={a.path} className="cursor-pointer hover:bg-muted/50 transition-colors active:scale-95" onClick={() => navigate(a.path)}>
            <CardContent className="flex flex-col items-center gap-1.5 p-3 md:p-4">
              <a.icon className={`h-6 w-6 md:h-8 md:w-8 ${a.color}`} />
              <span className="text-xs md:text-sm font-medium text-center">{a.label}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Today's services */}
      <Card>
        <CardHeader><CardTitle className="text-lg">Cultos de Hoje</CardTitle></CardHeader>
        <CardContent>
          {todayServices.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">Nenhum culto agendado para hoje</p>
          ) : (
            <div className="space-y-2 md:space-y-3">
              {todayServices.map(svc => (
                <div key={svc.id} className="flex items-center justify-between p-3 md:p-4 rounded-lg border bg-card hover:bg-muted/30 cursor-pointer active:scale-[0.98] transition-transform min-h-[56px]"
                  onClick={() => navigate(`/ministerial/voluntariado/checkin?serviceId=${svc.id}`)}>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm md:text-base truncate">{svc.name}</p>
                    {svc.service_type_name && <p className="text-xs md:text-sm text-muted-foreground truncate">{svc.service_type_name}</p>}
                  </div>
                  <span className="text-sm text-muted-foreground ml-3 shrink-0">{format(new Date(svc.scheduled_at), 'HH:mm', { locale: ptBR })}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upcoming services */}
      <Card>
        <CardHeader><CardTitle className="text-lg">Proximos Cultos</CardTitle></CardHeader>
        <CardContent>
          {upcomingServices.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">Nenhum culto futuro sincronizado</p>
          ) : (
            <div className="space-y-2">
              {upcomingServices.slice(0, 5).map(svc => (
                <div key={svc.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                  <div>
                    <p className="font-medium">{svc.name}</p>
                    {svc.service_type_name && <p className="text-sm text-muted-foreground">{svc.service_type_name}</p>}
                  </div>
                  <span className="text-sm text-muted-foreground">{format(new Date(svc.scheduled_at), "dd/MM 'as' HH:mm", { locale: ptBR })}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
