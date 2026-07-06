import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Check, Clock, X, ChevronRight, ChevronDown } from 'lucide-react';
import type { VolSchedule } from '../../types';
import VolunteerDetailDialog from './VolunteerDetailDialog';

interface ScheduleListProps {
  schedules: VolSchedule[];
}

export default function ScheduleList({ schedules }: ScheduleListProps) {
  const [selected, setSelected] = useState<{ id: string | null; name: string } | null>(null);
  const [recolhidos, setRecolhidos] = useState<Set<string>>(new Set());

  // Agrupa por equipe (team_name) · lista longa fica recolhível por área.
  const grupos = useMemo(() => {
    const m = new Map<string, VolSchedule[]>();
    for (const s of schedules) {
      const k = s.team_name || 'Sem equipe';
      const arr = m.get(k) || [];
      arr.push(s);
      m.set(k, arr);
    }
    const arr = [...m.entries()];
    for (const [, lista] of arr) lista.sort((a, b) => a.volunteer_name.localeCompare(b.volunteer_name, 'pt-BR'));
    arr.sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));
    return arr;
  }, [schedules]);

  const toggle = (k: string) => setRecolhidos(prev => {
    const n = new Set(prev);
    if (n.has(k)) n.delete(k); else n.add(k);
    return n;
  });

  const statusBadge = (s: VolSchedule) => (
    <Badge variant="outline" className={
      s.check_in ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
      : s.confirmation_status === 'declined' ? 'bg-red-100 text-red-800'
      : s.confirmation_status === 'pending' ? 'bg-yellow-100 text-yellow-800'
      : ''
    }>
      {s.check_in ? 'Presente' : s.confirmation_status === 'declined' ? 'Recusou' : s.confirmation_status === 'pending' ? 'Pendente' : 'Confirmado'}
    </Badge>
  );

  if (schedules.length === 0) return <p className="text-center text-muted-foreground py-8">Nenhuma escala encontrada</p>;

  return (
    <div className="space-y-3">
      {grupos.map(([team, lista]) => {
        const aberto = !recolhidos.has(team);
        const presentes = lista.filter(s => s.check_in).length;
        return (
          <div key={team} className="rounded-lg border overflow-hidden">
            <button
              type="button"
              onClick={() => toggle(team)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2.5 bg-muted/40 hover:bg-muted/60 transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                {aberto ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                <span className="font-semibold truncate">{team}</span>
                <Badge variant="secondary" className="shrink-0">{lista.length}</Badge>
              </div>
              <span className="text-xs text-muted-foreground shrink-0">{presentes}/{lista.length} presentes</span>
            </button>
            {aberto && (
              <div className="divide-y">
                {lista.map(s => (
                  <div
                    key={s.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelected({ id: s.volunteer_id, name: s.volunteer_name })}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected({ id: s.volunteer_id, name: s.volunteer_name }); } }}
                    className="flex items-center justify-between p-3 hover:bg-muted/40 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {s.check_in ? (
                        <div className="h-8 w-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0"><Check className="h-4 w-4 text-green-600" /></div>
                      ) : s.confirmation_status === 'declined' ? (
                        <div className="h-8 w-8 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0"><X className="h-4 w-4 text-red-600" /></div>
                      ) : (
                        <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0"><Clock className="h-4 w-4 text-muted-foreground" /></div>
                      )}
                      <div className="min-w-0">
                        <p className="font-medium truncate">{s.volunteer_name}</p>
                        {s.position_name && <p className="text-sm text-muted-foreground truncate">{s.position_name}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {statusBadge(s)}
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      <VolunteerDetailDialog
        volunteerId={selected?.id ?? null}
        volunteerName={selected?.name ?? ''}
        open={!!selected}
        onOpenChange={(v) => { if (!v) setSelected(null); }}
      />
    </div>
  );
}
