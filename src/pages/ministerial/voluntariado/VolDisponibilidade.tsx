import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useVolAvailability, useCreateAvailability, useDeleteAvailability, useVolTeamMembers } from './hooks';
import { Plus, Trash2, CalendarOff, Search, X } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

export default function VolDisponibilidade() {
  const [month, setMonth] = useState(() => format(new Date(), 'yyyy-MM'));
  const fromDate = `${month}-01`;
  const toDate = `${month}-31`;
  const { data: availability = [], isLoading } = useVolAvailability({ from: fromDate, to: toDate });
  const { data: members = [] } = useVolTeamMembers();
  const deleteAvailability = useDeleteAvailability();
  const [showAdd, setShowAdd] = useState(false);
  const [filterName, setFilterName] = useState('');

  // Group by volunteer
  const grouped = useMemo(() => {
    const map = new Map<string, { name: string; profileId: string | null; entries: typeof availability }>();
    for (const a of availability) {
      const key = a.volunteer_profile_id || a.planning_center_person_id || a.id;
      const member = members.find(m => m.volunteer_profile_id === a.volunteer_profile_id);
      const name = member?.volunteer_name || 'Voluntario';
      if (!map.has(key)) map.set(key, { name, profileId: a.volunteer_profile_id, entries: [] });
      map.get(key)!.entries.push(a);
    }
    let result = Array.from(map.values());
    if (filterName) result = result.filter(g => g.name.toLowerCase().includes(filterName.toLowerCase()));
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }, [availability, members, filterName]);

  const handleDelete = (id: string) => {
    deleteAvailability.mutate(id, {
      onSuccess: () => toast.success('Indisponibilidade removida'),
      onError: () => toast.error('Erro ao remover'),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-foreground">Disponibilidade</h1>
        <Button onClick={() => setShowAdd(true)} className="gap-1.5 bg-[#00B39D] hover:bg-[#00B39D]/90">
          <Plus className="h-4 w-4" /> Registrar Ausencia
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Input
          type="month"
          value={month}
          onChange={e => setMonth(e.target.value)}
          className="w-auto"
        />
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Filtrar por nome..."
            value={filterName}
            onChange={e => setFilterName(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : grouped.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <CalendarOff className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-lg font-medium text-muted-foreground">Nenhuma ausencia registrada</p>
            <p className="text-sm text-muted-foreground/60 mt-1">para {format(parseISO(`${month}-01`), "MMMM 'de' yyyy", { locale: ptBR })}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {grouped.map(group => (
            <Card key={group.profileId || group.name}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                    {group.name.charAt(0)}
                  </div>
                  <p className="font-medium text-sm">{group.name}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {group.entries.map(entry => (
                    <div key={entry.id} className="flex items-center gap-1.5 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 px-2.5 py-1 rounded-full text-xs">
                      <span>
                        {format(parseISO(entry.unavailable_from), 'dd/MM')}
                        {entry.unavailable_from !== entry.unavailable_to && ` - ${format(parseISO(entry.unavailable_to), 'dd/MM')}`}
                      </span>
                      {entry.reason && <span className="text-red-500 dark:text-red-400">({entry.reason})</span>}
                      <button onClick={() => handleDelete(entry.id)} className="hover:text-red-900 dark:hover:text-red-100">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showAdd && (
        <AddAvailabilityDialog
          members={members}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  );
}

function AddAvailabilityDialog({ members, onClose }: { members: any[]; onClose: () => void }) {
  const createAvailability = useCreateAvailability();
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [reason, setReason] = useState('');

  const selectedMember = members.find(m => m.id === selectedMemberId);

  const handleCreate = () => {
    if (!selectedMemberId || !dateFrom) return toast.error('Voluntario e data obrigatorios');
    const member = members.find(m => m.id === selectedMemberId);
    if (!member) return;

    createAvailability.mutate({
      volunteer_profile_id: member.volunteer_profile_id || undefined,
      planning_center_person_id: member.planning_center_person_id || undefined,
      unavailable_from: dateFrom,
      unavailable_to: dateTo || dateFrom,
      reason: reason.trim() || undefined,
    }, {
      onSuccess: () => { toast.success('Ausencia registrada'); onClose(); },
      onError: (err: any) => toast.error(err.message || 'Erro ao registrar'),
    });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar Ausencia</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Voluntario</Label>
            <Select value={selectedMemberId} onValueChange={setSelectedMemberId}>
              <SelectTrigger><SelectValue placeholder="Selecione o voluntario" /></SelectTrigger>
              <SelectContent>
                {members.map(m => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.volunteer_name} {m.team?.name ? `(${m.team.name})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>De</Label>
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            </div>
            <div>
              <Label>Ate</Label>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Motivo (opcional)</Label>
            <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="Ex: Viagem, Doenca..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleCreate} disabled={createAvailability.isPending} className="bg-[#00B39D] hover:bg-[#00B39D]/90">
            Registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
