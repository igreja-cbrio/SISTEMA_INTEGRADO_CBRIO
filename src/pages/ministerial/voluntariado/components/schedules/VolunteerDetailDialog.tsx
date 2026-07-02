import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Check, Clock, X, Mail, Phone, Loader2, CalendarClock } from 'lucide-react';
import { voluntariado } from '@/api';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { VolSchedule } from '../../types';

interface Props {
  volunteerId: string | null;
  volunteerName: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

function statusLabel(s: VolSchedule) {
  if (s.check_in) return { label: 'Presente', cls: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' };
  if (s.confirmation_status === 'declined') return { label: 'Recusou', cls: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' };
  if (s.confirmation_status === 'pending') return { label: 'Pendente', cls: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' };
  return { label: 'Confirmado', cls: '' };
}

export default function VolunteerDetailDialog({ volunteerId, volunteerName, open, onOpenChange }: Props) {
  const enabled = open && !!volunteerId;

  const { data: profile } = useQuery({
    queryKey: ['vol', 'profile', volunteerId],
    queryFn: () => voluntariado.profiles.get(volunteerId as string),
    enabled,
  });

  const { data: schedules = [], isLoading: loadingSchedules } = useQuery<VolSchedule[]>({
    queryKey: ['vol', 'schedules', 'by-volunteer', volunteerId],
    queryFn: () => voluntariado.schedules.list({ volunteer_id: volunteerId as string }),
    enabled,
  });

  const sorted = [...schedules].sort((a, b) => {
    const da = a.service?.scheduled_at || '';
    const db = b.service?.scheduled_at || '';
    return db.localeCompare(da);
  });
  const now = Date.now();
  const presencas = schedules.filter(s => s.check_in).length;
  const proxima = sorted.filter(s => s.service && new Date(s.service.scheduled_at).getTime() >= now).slice(-1)[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{profile?.full_name || volunteerName}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0">
          {!volunteerId ? (
            <p className="text-sm text-muted-foreground py-4">
              Este voluntário ainda não tem um perfil vinculado no sistema (veio do Planning Center sem
              cadastro). O histórico fica disponível assim que o perfil for criado/vinculado.
            </p>
          ) : (
            <div className="space-y-4">
              {/* Header com contato */}
              <div className="flex items-center gap-3">
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt={profile.full_name} className="h-14 w-14 rounded-full object-cover" />
                ) : (
                  <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center text-lg font-semibold text-muted-foreground">
                    {(profile?.full_name || volunteerName).trim().charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="space-y-0.5 text-sm">
                  {profile?.email && (
                    <p className="flex items-center gap-1.5 text-muted-foreground"><Mail className="h-3.5 w-3.5" /> {profile.email}</p>
                  )}
                  {(profile as any)?.phone && (
                    <p className="flex items-center gap-1.5 text-muted-foreground"><Phone className="h-3.5 w-3.5" /> {(profile as any).phone}</p>
                  )}
                  {!profile?.email && !(profile as any)?.phone && (
                    <p className="text-muted-foreground italic">Sem contato cadastrado</p>
                  )}
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg border p-2"><p className="text-xl font-bold">{schedules.length}</p><p className="text-xs text-muted-foreground">Escalas</p></div>
                <div className="rounded-lg border p-2"><p className="text-xl font-bold text-green-600">{presencas}</p><p className="text-xs text-muted-foreground">Presenças</p></div>
                <div className="rounded-lg border p-2">
                  <p className="text-sm font-semibold flex items-center justify-center gap-1 h-7">
                    <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
                    {proxima?.service ? format(new Date(proxima.service.scheduled_at), 'dd/MM', { locale: ptBR }) : '—'}
                  </p>
                  <p className="text-xs text-muted-foreground">Próxima</p>
                </div>
              </div>

              {/* Histórico de escalas */}
              <div>
                <p className="text-sm font-medium mb-2">Histórico de escalas</p>
                {loadingSchedules ? (
                  <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                ) : sorted.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma escala registrada para este voluntário.</p>
                ) : (
                  <div className="space-y-2">
                    {sorted.map(s => {
                      const st = statusLabel(s);
                      return (
                        <div key={s.id} className="flex items-center justify-between gap-2 p-2.5 rounded-lg border bg-card">
                          <div className="flex items-center gap-2.5 min-w-0">
                            {s.check_in ? (
                              <div className="h-7 w-7 shrink-0 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center"><Check className="h-3.5 w-3.5 text-green-600" /></div>
                            ) : s.confirmation_status === 'declined' ? (
                              <div className="h-7 w-7 shrink-0 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center"><X className="h-3.5 w-3.5 text-red-600" /></div>
                            ) : (
                              <div className="h-7 w-7 shrink-0 rounded-full bg-muted flex items-center justify-center"><Clock className="h-3.5 w-3.5 text-muted-foreground" /></div>
                            )}
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{s.service?.name || 'Culto'}</p>
                              <p className="text-xs text-muted-foreground truncate">
                                {s.service?.scheduled_at ? format(new Date(s.service.scheduled_at), "dd/MM/yyyy", { locale: ptBR }) : ''}
                                {s.team_name ? ` · ${s.team_name}${s.position_name ? ` - ${s.position_name}` : ''}` : ''}
                              </p>
                            </div>
                          </div>
                          <Badge variant="outline" className={`shrink-0 ${st.cls}`}>{st.label}</Badge>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
