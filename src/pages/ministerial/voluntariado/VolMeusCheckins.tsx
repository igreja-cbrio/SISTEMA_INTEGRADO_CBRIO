import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { voluntariado } from '@/api';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  CheckCircle2, Calendar, QrCode, Hand, Scan, Smartphone, AlertTriangle, Loader2,
} from 'lucide-react';

type MyCheckIn = {
  id: string;
  checked_in_at: string;
  method: string | null;
  is_unscheduled: boolean;
  schedule_id: string | null;
  service: { id: string; name: string; scheduled_at: string } | null;
};

const METHOD_ICON: Record<string, typeof QrCode> = {
  qr_code: QrCode,
  manual: Hand,
  facial: Scan,
  self_service: Smartphone,
};

const METHOD_LABEL: Record<string, string> = {
  qr_code: 'QR Code',
  manual: 'Manual',
  facial: 'Facial',
  self_service: 'Auto',
};

export default function VolMeusCheckins() {
  const { data: checkIns = [], isLoading } = useQuery({
    queryKey: ['vol', 'my-check-ins'],
    queryFn: () => (voluntariado.me as any).checkIns() as Promise<MyCheckIn[]>,
  });

  const stats = useMemo(() => {
    const total = checkIns.length;
    const unscheduled = checkIns.filter(c => c.is_unscheduled).length;
    return { total, unscheduled, scheduled: total - unscheduled };
  }, [checkIns]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Meus Check-ins</h1>

      {/* Resumo */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{stats.total}</p>
            <p className="text-xs text-muted-foreground mt-1">Total</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-[#00B39D]">{stats.scheduled}</p>
            <p className="text-xs text-muted-foreground mt-1">Escalado</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-yellow-600">{stats.unscheduled}</p>
            <p className="text-xs text-muted-foreground mt-1">Sem escala</p>
          </CardContent>
        </Card>
      </div>

      {checkIns.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-12 text-center">
            <CheckCircle2 className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-lg font-medium text-muted-foreground">Nenhum check-in ainda</p>
            <p className="text-sm text-muted-foreground/60 mt-1">
              Seus check-ins aparecerao aqui.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {checkIns.map(ci => {
            const Icon = METHOD_ICON[ci.method || ''] || CheckCircle2;
            const methodLabel = METHOD_LABEL[ci.method || ''] || ci.method || '';
            return (
              <Card key={ci.id} className={ci.is_unscheduled ? 'border-yellow-200 dark:border-yellow-900/40' : ''}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${
                      ci.is_unscheduled
                        ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300'
                        : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                    }`}>
                      {ci.is_unscheduled ? <AlertTriangle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{ci.service?.name || 'Culto removido'}</p>
                      {ci.service?.scheduled_at && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(ci.service.scheduled_at), "EEE, dd/MM/yyyy 'as' HH:mm", { locale: ptBR })}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <Badge variant="outline" className="text-xs gap-1">
                          <Icon className="h-3 w-3" />
                          {methodLabel}
                        </Badge>
                        {ci.is_unscheduled ? (
                          <Badge className="text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 border-yellow-200">
                            Sem escala
                          </Badge>
                        ) : (
                          <Badge className="text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 border-green-200">
                            Escalado
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground ml-auto">
                          {format(new Date(ci.checked_in_at), 'dd/MM HH:mm', { locale: ptBR })}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
