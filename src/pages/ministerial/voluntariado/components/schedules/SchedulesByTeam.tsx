import { useMemo, useState } from 'react';
import { Check, Clock, X, CheckCircle2, XCircle, HelpCircle } from 'lucide-react';
import type { VolSchedule } from '../../types';
import VolunteerDetailDialog from './VolunteerDetailDialog';
import AvatarVoluntario from './AvatarVoluntario';

interface Props {
  schedules: VolSchedule[];
}

type Status = 'confirmed' | 'declined' | 'pending';
function statusDe(s: VolSchedule): Status {
  if (s.confirmation_status === 'confirmed' || s.check_in) return 'confirmed';
  if (s.confirmation_status === 'declined') return 'declined';
  return 'pending';
}

// Layout "Teams" (estilo Planning Center): 1 coluna por equipe, com contadores
// confirmados/recusados/pendentes, seções por posição e pessoas com avatar.
export default function SchedulesByTeam({ schedules }: Props) {
  const [selected, setSelected] = useState<{ id: string | null; name: string } | null>(null);

  const equipes = useMemo(() => {
    const mapa = new Map<string, {
      nome: string;
      conf: number; dec: number; pend: number;
      posicoes: Map<string, VolSchedule[]>;
    }>();
    for (const s of schedules) {
      const teamNome = s.team_name || 'Sem equipe';
      const eq = mapa.get(teamNome) || { nome: teamNome, conf: 0, dec: 0, pend: 0, posicoes: new Map() };
      const st = statusDe(s);
      if (st === 'confirmed') eq.conf++;
      else if (st === 'declined') eq.dec++;
      else eq.pend++;
      const posNome = s.position_name || '';
      const arr = eq.posicoes.get(posNome) || [];
      arr.push(s);
      eq.posicoes.set(posNome, arr);
      mapa.set(teamNome, eq);
    }
    // Ordena equipes por nome; pessoas por nome dentro da posição.
    const arr = [...mapa.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    for (const eq of arr) {
      for (const [, pessoas] of eq.posicoes) {
        pessoas.sort((a, b) => a.volunteer_name.localeCompare(b.volunteer_name, 'pt-BR'));
      }
    }
    return arr;
  }, [schedules]);

  if (!schedules.length) {
    return <p className="text-center text-muted-foreground py-8">Nenhuma escala encontrada</p>;
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {equipes.map(eq => (
          <div key={eq.nome} className="rounded-xl border bg-card flex flex-col self-start">
            {/* Cabeçalho da equipe + contadores */}
            <div className="p-3 border-b">
              <p className="font-semibold truncate" title={eq.nome}>{eq.nome}</p>
              <div className="flex items-center gap-3 mt-1 text-xs">
                <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400" title="Confirmados">
                  <CheckCircle2 className="h-3.5 w-3.5" /> {eq.conf}
                </span>
                <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400" title="Recusaram">
                  <XCircle className="h-3.5 w-3.5" /> {eq.dec}
                </span>
                <span className="inline-flex items-center gap-1 text-amber-500 dark:text-amber-400" title="Pendentes">
                  <HelpCircle className="h-3.5 w-3.5" /> {eq.pend}
                </span>
              </div>
            </div>
            {/* Posições + pessoas */}
            <div className="p-2 space-y-3">
              {[...eq.posicoes.entries()].map(([posNome, pessoas]) => (
                <div key={posNome || '_sem'}>
                  {posNome && (
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground px-1 mb-1">{posNome}</p>
                  )}
                  <div className="space-y-0.5">
                    {pessoas.map(s => {
                      const st = statusDe(s);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setSelected({ id: s.volunteer_id, name: s.volunteer_name })}
                          className="w-full flex items-center gap-2 p-1.5 rounded-lg hover:bg-muted/50 text-left transition-colors"
                        >
                          {/* ⚠️ `foto_url` vem RESOLVIDA do servidor quando o
                              endpoint a manda; aqui ela ainda não vem, então
                              cai nas iniciais — que é o comportamento de
                              sempre desta tela. */}
                          <AvatarVoluntario nome={s.volunteer_name} fotoUrl={(s as any).foto_url} status={st} tamanho={28} />
                          <span className="text-sm truncate flex-1">{s.volunteer_name}</span>
                          {st === 'confirmed' ? <Check className="h-3.5 w-3.5 text-green-600 shrink-0" />
                            : st === 'declined' ? <X className="h-3.5 w-3.5 text-red-600 shrink-0" />
                            : <Clock className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <VolunteerDetailDialog
        volunteerId={selected?.id ?? null}
        volunteerName={selected?.name ?? ''}
        open={!!selected}
        onOpenChange={(v) => { if (!v) setSelected(null); }}
      />
    </>
  );
}
