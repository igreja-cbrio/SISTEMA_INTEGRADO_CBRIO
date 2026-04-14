import { Badge } from '@/components/ui/badge';
import { Check, Clock, X } from 'lucide-react';
import type { VolSchedule } from '../../types';

interface ScheduleListProps {
  schedules: VolSchedule[];
}

export default function ScheduleList({ schedules }: ScheduleListProps) {
  return (
    <div className="space-y-2">
      {schedules.map(s => (
        <div key={s.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
          <div className="flex items-center gap-3">
            {s.check_in ? (
              <div className="h-8 w-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <Check className="h-4 w-4 text-green-600" />
              </div>
            ) : s.confirmation_status === 'declined' ? (
              <div className="h-8 w-8 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <X className="h-4 w-4 text-red-600" />
              </div>
            ) : (
              <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                <Clock className="h-4 w-4 text-muted-foreground" />
              </div>
            )}
            <div>
              <p className="font-medium">{s.volunteer_name}</p>
              {s.team_name && <p className="text-sm text-muted-foreground">{s.team_name}{s.position_name ? ` - ${s.position_name}` : ''}</p>}
            </div>
          </div>
          <Badge variant="outline" className={
            s.check_in ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
            : s.confirmation_status === 'declined' ? 'bg-red-100 text-red-800'
            : s.confirmation_status === 'pending' ? 'bg-yellow-100 text-yellow-800'
            : ''
          }>
            {s.check_in ? 'Presente' : s.confirmation_status === 'declined' ? 'Recusou' : s.confirmation_status === 'pending' ? 'Pendente' : 'Confirmado'}
          </Badge>
        </div>
      ))}
      {schedules.length === 0 && <p className="text-center text-muted-foreground py-8">Nenhuma escala encontrada</p>}
    </div>
  );
}
