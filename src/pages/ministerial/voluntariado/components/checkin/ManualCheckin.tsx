import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Check, Search, UserPlus } from 'lucide-react';
import type { VolSchedule } from '../../types';

interface ManualCheckinProps {
  schedules: VolSchedule[];
  onCheckIn: (scheduleId: string) => void;
  onUnscheduledCheckIn: (name: string) => void;
  isLoading?: boolean;
}

// Chave de pessoa · junta as escalas da MESMA pessoa (PCO id → volunteer_id →
// nome normalizado) pra consolidar num único card com os cultos como tags.
function pessoaKey(s: VolSchedule): string {
  return s.planning_center_person_id || s.volunteer_id || s.volunteer_name.trim().toLowerCase();
}

// Rótulo do culto/turno que a pessoa escolheu servir (o team_name do PCO já
// vem com o horário · ex.: "Bazar 8:30"). Position vira sufixo quando houver.
function slotLabel(s: VolSchedule): string {
  const base = s.team_name || s.service?.service_type_name || 'Escala';
  return s.position_name ? `${base} · ${s.position_name}` : base;
}

export default function ManualCheckin({ schedules, onCheckIn, onUnscheduledCheckIn, isLoading }: ManualCheckinProps) {
  const [search, setSearch] = useState('');
  const [unscheduledName, setUnscheduledName] = useState('');

  const filtered = schedules.filter(s =>
    s.volunteer_name.toLowerCase().includes(search.toLowerCase()) ||
    s.team_name?.toLowerCase().includes(search.toLowerCase())
  );

  // Consolida por pessoa · 1 card com N tags de culto (antes o nome repetia).
  const pessoas = useMemo(() => {
    const m = new Map<string, { key: string; nome: string; slots: VolSchedule[] }>();
    for (const s of filtered) {
      const k = pessoaKey(s);
      const g = m.get(k) || { key: k, nome: s.volunteer_name, slots: [] };
      g.slots.push(s);
      m.set(k, g);
    }
    const arr = [...m.values()];
    for (const g of arr) {
      g.slots.sort((a, b) => slotLabel(a).localeCompare(slotLabel(b), 'pt-BR'));
    }
    arr.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    return arr;
  }, [filtered]);

  const chipClass = (s: VolSchedule): string => {
    const base = 'inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium border transition-colors';
    if (s.check_in) return `${base} bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800 cursor-default`;
    if (s.confirmation_status === 'declined') return `${base} bg-red-50 text-red-700 border-red-300 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800`;
    if (s.confirmation_status === 'pending') return `${base} bg-yellow-50 text-yellow-800 border-yellow-300 hover:bg-yellow-100 dark:bg-yellow-900/20 dark:text-yellow-300 dark:border-yellow-800`;
    return `${base} bg-blue-50 text-blue-800 border-blue-300 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800`;
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar voluntário..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
          name="busca-voluntario"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          inputMode="search"
        />
      </div>

      <div className="space-y-2 max-h-[400px] overflow-y-auto">
        {pessoas.map(g => {
          const total = g.slots.length;
          const presentes = g.slots.filter(s => s.check_in).length;
          return (
            <div key={g.key} className="p-3 rounded-lg border bg-card">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">{g.nome}</p>
                {total > 1 && (
                  <span className="text-xs text-muted-foreground shrink-0">{presentes}/{total} cultos</span>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {g.slots.map(s => {
                  const done = !!s.check_in;
                  const declined = s.confirmation_status === 'declined';
                  return (
                    <button
                      key={s.id}
                      type="button"
                      disabled={done || isLoading}
                      onClick={() => { if (!done) onCheckIn(s.id); }}
                      className={chipClass(s)}
                      title={done ? 'Presente' : 'Marcar presença neste culto'}
                    >
                      {done && <Check className="h-3 w-3" />}
                      {slotLabel(s)}
                      {declined && !done && <span className="opacity-70">· recusou</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {pessoas.length === 0 && search && (
        <div className="text-center py-4">
          <p className="text-muted-foreground mb-3">Nenhum voluntário escalado encontrado</p>
          <div className="flex gap-2 justify-center">
            <Input placeholder="Nome do voluntário" value={unscheduledName} onChange={e => setUnscheduledName(e.target.value)} className="max-w-xs" name="nome-voluntario" autoComplete="off" autoCorrect="off" spellCheck={false} />
            <Button onClick={() => { if (unscheduledName.trim()) { onUnscheduledCheckIn(unscheduledName.trim()); setUnscheduledName(''); } }} disabled={!unscheduledName.trim() || isLoading}>
              <UserPlus className="h-4 w-4 mr-1" /> Check-in sem escala
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
