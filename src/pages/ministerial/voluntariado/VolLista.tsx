import { useState, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RefreshCw, Search, Users, QrCode } from 'lucide-react';
import { toast } from 'sonner';
import { useVolunteersPool, useSyncPlanningCenter } from './hooks';

export default function VolLista() {
  const { data: pool = [], isLoading } = useVolunteersPool();
  const sync = useSyncPlanningCenter();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [teamFilter, setTeamFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');

  // Collect all unique teams from pool
  const allTeams = useMemo(() => {
    const map = new Map<string, { id: string; name: string; color?: string }>();
    for (const vol of pool as any[]) {
      for (const tm of vol.team_members || []) {
        if (tm.team) map.set(tm.team.id, tm.team);
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [pool]);

  const filtered = useMemo(() => {
    let list = pool as any[];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(v =>
        v.full_name.toLowerCase().includes(q) ||
        v.email?.toLowerCase().includes(q) ||
        v.cpf?.includes(q)
      );
    }
    if (teamFilter !== 'all') {
      list = list.filter(v =>
        (v.team_members || []).some((tm: any) => tm.team_id === teamFilter)
      );
    }
    if (sourceFilter === 'pc') {
      list = list.filter(v => !!v.planning_center_id);
    } else if (sourceFilter === 'sistema') {
      list = list.filter(v => !v.planning_center_id);
    }
    return list;
  }, [pool, search, teamFilter, sourceFilter]);

  const handleSync = () => {
    sync.mutate(undefined, {
      onSuccess: (data: any) => {
        queryClient.invalidateQueries({ queryKey: ['vol', 'volunteers-pool'] });
        toast.success(`Sincronizado: ${data.services ?? 0} cultos, ${data.newSchedules ?? 0} escalas`);
      },
      onError: (err: any) => toast.error(err.message || 'Erro ao sincronizar'),
    });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Voluntarios</h1>
          <p className="text-sm text-muted-foreground">{pool.length} voluntario(s) no sistema</p>
        </div>
        <Button
          size="sm" variant="outline" className="gap-2 w-full sm:w-auto"
          onClick={handleSync} disabled={sync.isPending}
        >
          {sync.isPending
            ? <RefreshCw className="h-4 w-4 animate-spin" />
            : <RefreshCw className="h-4 w-4" />}
          Sincronizar
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, e-mail ou CPF..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={teamFilter} onValueChange={setTeamFilter}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Equipe" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas equipes</SelectItem>
            {allTeams.map(t => (
              <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Origem" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas origens</SelectItem>
            <SelectItem value="pc">Planning Center</SelectItem>
            <SelectItem value="sistema">Cadastro interno</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xl font-bold">{pool.length}</p>
            <p className="text-xs text-muted-foreground">Total</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xl font-bold text-blue-600">
              {(pool as any[]).filter(v => v.planning_center_id).length}
            </p>
            <p className="text-xs text-muted-foreground">Planning Center</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xl font-bold text-[#00B39D]">
              {(pool as any[]).filter(v => !v.planning_center_id).length}
            </p>
            <p className="text-xs text-muted-foreground">Internos</p>
          </CardContent>
        </Card>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Users className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="font-medium text-muted-foreground">
              {pool.length === 0 ? 'Nenhum voluntario sincronizado' : 'Nenhum resultado para esse filtro'}
            </p>
            {pool.length === 0 && (
              <p className="text-sm text-muted-foreground/60 mt-1">Clique em Sincronizar para importar do Planning Center</p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((vol: any) => {
            const teamsOf = (vol.team_members || []) as any[];
            const hasPc = !!vol.planning_center_id;
            const hasQr = !!vol.qr_code;

            return (
              <div
                key={vol.id}
                className="flex items-center gap-3 px-4 py-3 rounded-lg border bg-card hover:bg-accent/30 transition-colors"
              >
                {/* Avatar */}
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-sm font-semibold shrink-0 overflow-hidden">
                  {vol.avatar_url
                    ? <img src={vol.avatar_url} alt={vol.full_name} className="h-full w-full object-cover" />
                    : vol.full_name.charAt(0).toUpperCase()}
                </div>

                {/* Main info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium truncate">{vol.full_name}</p>
                    <Badge
                      variant="outline"
                      className={`text-[10px] px-1.5 py-0 ${hasPc ? 'border-blue-200 text-blue-700 dark:text-blue-300' : 'border-[#00B39D]/30 text-[#00B39D]'}`}
                    >
                      {hasPc ? 'Planning Center' : 'Interno'}
                    </Badge>
                    {hasQr && (
                      <QrCode className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {teamsOf.length > 0
                      ? teamsOf.map((tm: any) => (
                          <span
                            key={tm.id}
                            className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                          >
                            {tm.team?.color && (
                              <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: tm.team.color }} />
                            )}
                            {tm.team?.name}{tm.position ? ` · ${tm.position.name}` : ''}
                          </span>
                        ))
                      : <span className="text-[10px] text-muted-foreground/50">Sem equipe atribuida</span>
                    }
                  </div>
                </div>

                {/* Secondary info — hidden on very small screens */}
                <div className="hidden md:block text-right shrink-0">
                  {vol.email && <p className="text-xs text-muted-foreground truncate max-w-44">{vol.email}</p>}
                  {vol.cpf && <p className="text-xs text-muted-foreground/60">{vol.cpf}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
