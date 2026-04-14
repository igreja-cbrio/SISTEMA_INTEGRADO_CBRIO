import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, Search, UserPlus } from 'lucide-react';
import type { VolSchedule } from '../../types';

interface ManualCheckinProps {
  schedules: VolSchedule[];
  onCheckIn: (scheduleId: string) => void;
  onUnscheduledCheckIn: (name: string) => void;
  isLoading?: boolean;
}

export default function ManualCheckin({ schedules, onCheckIn, onUnscheduledCheckIn, isLoading }: ManualCheckinProps) {
  const [search, setSearch] = useState('');
  const [unscheduledName, setUnscheduledName] = useState('');

  const filtered = schedules.filter(s =>
    s.volunteer_name.toLowerCase().includes(search.toLowerCase()) ||
    s.team_name?.toLowerCase().includes(search.toLowerCase())
  );

  const statusColor = (s: VolSchedule) => {
    if (s.check_in) return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
    if (s.confirmation_status === 'declined') return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
    if (s.confirmation_status === 'pending') return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
    return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar voluntario..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      <div className="space-y-2 max-h-[400px] overflow-y-auto">
        {filtered.map(s => (
          <div key={s.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
            <div>
              <p className="font-medium">{s.volunteer_name}</p>
              {s.team_name && <p className="text-sm text-muted-foreground">{s.team_name}{s.position_name ? ` - ${s.position_name}` : ''}</p>}
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={statusColor(s)}>
                {s.check_in ? 'Presente' : s.confirmation_status || 'Escalado'}
              </Badge>
              {!s.check_in && (
                <Button size="sm" onClick={() => onCheckIn(s.id)} disabled={isLoading}>
                  <Check className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && search && (
        <div className="text-center py-4">
          <p className="text-muted-foreground mb-3">Nenhum voluntario escalado encontrado</p>
          <div className="flex gap-2 justify-center">
            <Input placeholder="Nome do voluntario" value={unscheduledName} onChange={e => setUnscheduledName(e.target.value)} className="max-w-xs" />
            <Button onClick={() => { if (unscheduledName.trim()) { onUnscheduledCheckIn(unscheduledName.trim()); setUnscheduledName(''); } }} disabled={!unscheduledName.trim() || isLoading}>
              <UserPlus className="h-4 w-4 mr-1" /> Check-in sem escala
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
