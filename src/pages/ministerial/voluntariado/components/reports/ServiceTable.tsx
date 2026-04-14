import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import type { VolService, VolSchedule, VolCheckIn } from '../../types';

interface ServiceTableProps {
  services: VolService[];
  schedules: VolSchedule[];
  checkIns: VolCheckIn[];
  onSelectService?: (serviceId: string) => void;
}

export default function ServiceTable({ services, schedules, checkIns, onSelectService }: ServiceTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="text-left p-3 font-medium">Culto</th>
            <th className="text-left p-3 font-medium">Data</th>
            <th className="text-center p-3 font-medium">Escalados</th>
            <th className="text-center p-3 font-medium">Presentes</th>
            <th className="text-center p-3 font-medium">Taxa</th>
          </tr>
        </thead>
        <tbody>
          {services.map(svc => {
            const svcSchedules = schedules.filter(s => s.service_id === svc.id);
            const svcCheckIns = checkIns.filter(c => c.service_id === svc.id);
            const rate = svcSchedules.length > 0 ? Math.round((svcCheckIns.length / svcSchedules.length) * 100) : 0;
            return (
              <tr key={svc.id} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => onSelectService?.(svc.id)}>
                <td className="p-3">
                  <p className="font-medium">{svc.name}</p>
                  {svc.service_type_name && <p className="text-xs text-muted-foreground">{svc.service_type_name}</p>}
                </td>
                <td className="p-3">{format(new Date(svc.scheduled_at), "dd/MM/yy HH:mm", { locale: ptBR })}</td>
                <td className="p-3 text-center">{svcSchedules.length}</td>
                <td className="p-3 text-center">{svcCheckIns.length}</td>
                <td className="p-3 text-center">
                  <Badge variant="outline" className={rate >= 80 ? 'bg-green-100 text-green-800' : rate >= 50 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}>
                    {rate}%
                  </Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
