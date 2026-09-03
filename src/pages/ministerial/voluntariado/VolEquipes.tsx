import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  useVolTeamsManaged, useCreateTeam, useUpdateTeam, useDeleteTeam,
  useImportTeamsFromSchedules, useSyncTeamMembersFromSchedules, useVolTeamMembers, useAddTeamMember,
  useRemoveTeamMember, useVolPositions, useCreatePosition, useDeletePosition,
} from './hooks';
import { Plus, Users, Trash2, Edit2, UserPlus, X, Download, Briefcase, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { voluntariado } from '@/api';
import { toast } from 'sonner';
import type { VolTeam, VolPosition } from './types';

const TEAM_COLORS = ['#00B39D', '#3B82F6', '#EF4444', '#F59E0B', '#8B5CF6', '#EC4899', '#10B981', '#6366F1', '#F97316', '#14B8A6'];

export default function VolEquipes() {
  const { data: teams = [], isLoading } = useVolTeamsManaged();
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editTeam, setEditTeam] = useState<VolTeam | null>(null);

  const selectedTeam = teams.find(t => t.id === selectedTeamId);

  // Áreas já usadas (pra reaproveitar no campo do formulário)
  const areasExistentes = useMemo(
    () => [...new Set(teams.map(t => (t.area || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [teams],
  );

  // ⚠️ Ativas e inativas em listas SEPARADAS. Depois do remapeamento de 16/08
  // as 113 equipes-espelho do Planning Center ficaram inativas (não foram
  // apagadas — DELETE cascatearia em `vol_positions` e daí em itens de
  // template). Misturadas, elas afogariam as ~13 equipes que a escala usa.
  const ativas = useMemo(() => teams.filter(t => t.is_active), [teams]);
  const inativas = useMemo(
    () => teams.filter(t => !t.is_active).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    [teams],
  );
  const [verInativas, setVerInativas] = useState(false);

  // Equipes agrupadas por área · "Sem área" sempre por último
  const grupos = useMemo(() => {
    const map = new Map<string, VolTeam[]>();
    for (const t of ativas) {
      const key = (t.area || '').trim() || 'Sem área';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return [...map.entries()].sort((a, b) => {
      if (a[0] === 'Sem área') return 1;
      if (b[0] === 'Sem área') return -1;
      return a[0].localeCompare(b[0]);
    });
  }, [ativas]);

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Equipes</h1>
        <div className="flex gap-2">
          <ImportTeamsButton />
          <SyncMembersButton />
          <Button onClick={() => setShowCreateDialog(true)} className="gap-1.5 bg-[#00B39D] hover:bg-[#00B39D]/90">
            <Plus className="h-4 w-4" /> Nova Equipe
          </Button>
        </div>
      </div>

      <PendenciasPcoCard teams={teams} />

      {teams.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Users className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-lg font-medium text-muted-foreground">Nenhuma equipe cadastrada</p>
            <p className="text-sm text-muted-foreground/60 mt-1">Importe do Planning Center ou crie manualmente</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5">
          {grupos.map(([area, lista]) => (
            <div key={area}>
              <div className="flex items-center gap-2 mb-2 px-1">
                <h2 className="text-sm font-semibold text-foreground">{area}</h2>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{lista.length}</Badge>
              </div>
              <div className="rounded-lg border bg-card divide-y">
                {lista.map(team => {
                  const memberCount = team.members?.length ?? 0;
                  const positionCount = team.positions?.length ?? 0;
                  return (
                    <div
                      key={team.id}
                      role="button"
                      tabIndex={0}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-accent/40 cursor-pointer transition-colors"
                      onClick={() => setSelectedTeamId(team.id)}
                      onKeyDown={e => { if (e.key === 'Enter') setSelectedTeamId(team.id); }}
                    >
                      <div
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: team.color || '#737373' }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium truncate">{team.name}</p>
                          {!team.is_active && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">Inativa</Badge>
                          )}
                        </div>
                        {team.leader && (
                          <p className="text-xs text-muted-foreground truncate">
                            Lider: {team.leader.full_name}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground shrink-0">
                        <span className="flex items-center gap-1" title="Membros">
                          <Users className="h-3.5 w-3.5" />
                          {memberCount}
                        </span>
                        {positionCount > 0 && (
                          <span className="hidden sm:flex items-center gap-1" title="Posições">
                            <Briefcase className="h-3.5 w-3.5" />
                            {positionCount}
                          </span>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={e => { e.stopPropagation(); setEditTeam(team); }}
                        title="Editar equipe"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {inativas.length > 0 && (
            <div>
              <button
                type="button"
                className="flex items-center gap-2 mb-2 px-1 text-sm font-semibold text-muted-foreground hover:text-foreground"
                onClick={() => setVerInativas(v => !v)}
              >
                {verInativas ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                Arquivadas do Planning Center
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{inativas.length}</Badge>
              </button>
              {verInativas && (
                <>
                  <p className="px-1 pb-2 text-xs text-muted-foreground">
                    Nomes de time do Planning Center que viraram <strong>função</strong> dentro das
                    equipes acima. Ficam aqui como histórico — ninguém novo entra nelas.
                  </p>
                  <div className="rounded-lg border bg-muted/30 divide-y">
                    {inativas.map(team => (
                      <div key={team.id} className="flex items-center gap-3 px-4 py-2">
                        <span className="text-sm text-muted-foreground truncate flex-1">{team.name}</span>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {team.members?.length ?? 0} vínculo(s)
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      <TeamDetailDialog teamId={selectedTeamId} team={selectedTeam ?? null} onClose={() => setSelectedTeamId(null)} />

      {(showCreateDialog || editTeam) && (
        <TeamFormDialog
          team={editTeam}
          areas={areasExistentes}
          onClose={() => { setShowCreateDialog(false); setEditTeam(null); }}
        />
      )}
    </div>
  );
}

/**
 * Times do Planning Center que ainda não têm destino aqui.
 *
 * ⚠️ Existe porque o sync PAROU de criar equipe por nome novo (era assim que o
 * banco chegou a 129 equipes). O preço de não criar mais é que um nome novo
 * precisa aparecer em algum lugar — senão o voluntário some da escala e
 * ninguém entende por quê. Este card é esse lugar.
 */
function PendenciasPcoCard({ teams }: { teams: VolTeam[] }) {
  const qc = useQueryClient();
  const { data } = useQuery<{ pendentes: { nome: string; escalas: number }[] }>({
    queryKey: ['vol-pendencias-pco'],
    queryFn: () => voluntariado.teamsManage.pendenciasPco(),
    staleTime: 5 * 60 * 1000,
  });
  const [alvo, setAlvo] = useState<string | null>(null);
  const pendentes = data?.pendentes || [];
  if (!pendentes.length) return null;

  return (
    <Card className="border-amber-500/40 bg-amber-500/5">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium">
              {pendentes.length} time(s) do Planning Center sem destino aqui
            </p>
            <p className="text-xs text-muted-foreground">
              No Planning Center, "time" é o que aqui chamamos de <strong>função</strong>.
              Enquanto um nome não tiver destino, quem serve nele não entra em nenhuma equipe
              — e não aparece pro supervisor na hora de escalar.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {pendentes.slice(0, 30).map(p => (
            <Button key={p.nome} variant="outline" size="sm" className="h-7 text-xs"
              onClick={() => setAlvo(p.nome)}>
              {p.nome}
              <Badge variant="secondary" className="ml-1.5 text-[10px] px-1 py-0">{p.escalas}</Badge>
            </Button>
          ))}
          {pendentes.length > 30 && (
            <span className="self-center text-xs text-muted-foreground">
              +{pendentes.length - 30} — resolva estes primeiro
            </span>
          )}
        </div>
      </CardContent>
      {alvo && (
        <MapearPcoDialog
          pcoNome={alvo}
          teams={teams.filter(t => t.is_active)}
          onClose={() => setAlvo(null)}
          onGravado={() => {
            qc.invalidateQueries({ queryKey: ['vol-pendencias-pco'] });
            setAlvo(null);
          }}
        />
      )}
    </Card>
  );
}

function MapearPcoDialog({ pcoNome, teams, onClose, onGravado }: {
  pcoNome: string; teams: VolTeam[]; onClose: () => void; onGravado: () => void;
}) {
  const [teamId, setTeamId] = useState('');
  const [posId, setPosId] = useState('__none__');
  const { data: positions = [] } = useVolPositions(teamId || undefined);
  const mut = useMutation({
    mutationFn: (body: {
      pco_nome: string; team_id?: string; position_id?: string | null; ignorar?: boolean;
    }) => voluntariado.teamsManage.mapearPco(body),
    onSuccess: () => { toast.success(`"${pcoNome}" mapeado`); onGravado(); },
    onError: (e: Error) => toast.error(e?.message || 'Erro ao mapear'),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Onde entra "{pcoNome}"?</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Equipe</Label>
            <Select value={teamId} onValueChange={v => { setTeamId(v); setPosId('__none__'); }}>
              <SelectTrigger><SelectValue placeholder="Escolher equipe" /></SelectTrigger>
              <SelectContent>
                {teams.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Função (opcional)</Label>
            <Select value={posId} onValueChange={setPosId} disabled={!teamId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Sem função específica</SelectItem>
                {positions.map((p: VolPosition) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          {/* "Ignorar" não é o mesmo que deixar pendente: é dizer que aquele
              nome NÃO deve gerar vínculo (time administrativo, teste no PCO).
              Sem essa saída, um nome desses ficaria no card pra sempre. */}
          <Button variant="ghost" onClick={() => mut.mutate({ pco_nome: pcoNome, ignorar: true })}
            disabled={mut.isPending}>
            Ignorar este nome
          </Button>
          <Button
            disabled={!teamId || mut.isPending}
            className="bg-[#00B39D] hover:bg-[#00B39D]/90"
            onClick={() => mut.mutate({
              pco_nome: pcoNome,
              team_id: teamId,
              position_id: posId === '__none__' ? null : posId,
            })}
          >
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImportTeamsButton() {
  const importMut = useImportTeamsFromSchedules();
  return (
    <Button
      variant="outline"
      className="gap-1.5"
      disabled={importMut.isPending}
      onClick={() => {
        importMut.mutate(undefined, {
          onSuccess: (data: any) => toast.success(`${data.imported} equipes importadas`),
          onError: () => toast.error('Erro ao importar equipes'),
        });
      }}
    >
      <Download className="h-4 w-4" />
      <span className="hidden sm:inline">Importar do PC</span>
    </Button>
  );
}

function SyncMembersButton() {
  const syncMut = useSyncTeamMembersFromSchedules();
  return (
    <Button
      variant="outline"
      className="gap-1.5"
      disabled={syncMut.isPending}
      onClick={() => {
        syncMut.mutate(undefined, {
          onSuccess: (data: any) =>
            toast.success(`${data.assigned} atribuições sincronizadas (${data.volunteers} voluntários)`),
          onError: () => toast.error('Erro ao sincronizar membros'),
        });
      }}
    >
      <Download className="h-4 w-4" />
      <span className="hidden sm:inline">Sincronizar membros</span>
    </Button>
  );
}

function TeamFormDialog({ team, areas = [], onClose }: { team: VolTeam | null; areas?: string[]; onClose: () => void }) {
  const createTeam = useCreateTeam();
  const updateTeam = useUpdateTeam();
  const deleteTeam = useDeleteTeam();
  const [name, setName] = useState(team?.name || '');
  const [description, setDescription] = useState(team?.description || '');
  const [color, setColor] = useState(team?.color || TEAM_COLORS[0]);
  const [area, setArea] = useState(team?.area || '');
  const [split, setSplit] = useState(team?.split_por_horario === true);

  const handleSave = () => {
    if (!name.trim()) return toast.error('Nome obrigatório');
    const data = { name: name.trim(), description: description.trim() || null, color, area: area.trim() || null, split_por_horario: split };
    if (team) {
      updateTeam.mutate({ id: team.id, data }, { onSuccess: () => { toast.success('Equipe atualizada'); onClose(); }, onError: () => toast.error('Erro ao atualizar') });
    } else {
      createTeam.mutate(data, { onSuccess: () => { toast.success('Equipe criada'); onClose(); }, onError: () => toast.error('Erro ao criar') });
    }
  };

  const handleDelete = () => {
    if (!team) return;
    if (!confirm('Tem certeza? Isso removerá a equipe e todos os membros.')) return;
    deleteTeam.mutate(team.id, { onSuccess: () => { toast.success('Equipe removida'); onClose(); }, onError: () => toast.error('Erro ao remover') });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{team ? 'Editar Equipe' : 'Nova Equipe'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Nome</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Louvor, Mídia, Recepção" />
          </div>
          <div>
            <Label>Área</Label>
            <Input
              value={area}
              onChange={e => setArea(e.target.value)}
              placeholder="Ex: Produção, Kids, Louvor, Acolhimento"
              list="vol-team-areas"
            />
            <datalist id="vol-team-areas">
              {areas.map(a => <option key={a} value={a} />)}
            </datalist>
            <p className="text-[11px] text-muted-foreground mt-1">Agrupa a equipe nesta área na lista. Reaproveite uma área já existente pra juntar os times.</p>
          </div>
          <div>
            <Label>Descrição</Label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Descrição da equipe (opcional)" />
          </div>
          {/* Split por horário (03/09/2026) · o Split Team do Planning Center.
              ⚠️ O rótulo diz o EFEITO, não o nome técnico: o líder decide olhando
              a equipe dele, não o schema. E o texto de apoio nomeia o caso
              concreto (a manhã de domingo tem duas celebrações) porque "bloco"
              não é palavra que alguém use na igreja. */}
          <div className="rounded-md border border-border p-3">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={split}
                onChange={e => setSplit(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[#00B39D]"
              />
              <span>
                <span className="block text-sm font-medium text-foreground">Cada horário tem gente diferente</span>
                <span className="block text-[11px] text-muted-foreground mt-0.5">
                  Marque quando a equipe troca de pessoas entre as celebrações do mesmo dia — o domingo de manhã
                  tem duas (09:30 e 11:30). A escala e as vagas passam a ser por horário. Desmarcado, a equipe
                  serve o dia todo com a mesma gente.
                </span>
              </span>
            </label>
          </div>
          <div>
            <Label>Cor</Label>
            <div className="flex gap-2 mt-1">
              {TEAM_COLORS.map(c => (
                <button
                  key={c}
                  className={`h-7 w-7 rounded-full border-2 transition-transform ${color === c ? 'border-foreground scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter className="flex justify-between">
          {team && (
            <Button variant="destructive" onClick={handleDelete} disabled={deleteTeam.isPending}>
              <Trash2 className="h-4 w-4 mr-1" /> Remover
            </Button>
          )}
          <div className="flex gap-2 ml-auto">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={handleSave} disabled={createTeam.isPending || updateTeam.isPending} className="bg-[#00B39D] hover:bg-[#00B39D]/90">
              {team ? 'Salvar' : 'Criar'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TeamDetailDialog({ teamId, team, onClose }: { teamId: string | null; team: VolTeam | null; onClose: () => void }) {
  const { data: members = [], isLoading: membersLoading } = useVolTeamMembers(teamId ?? undefined);
  const { data: positions = [] } = useVolPositions(teamId ?? undefined);

  return (
    <Dialog open={!!teamId} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {team?.color && <div className="h-4 w-4 rounded-full shrink-0" style={{ backgroundColor: team.color }} />}
            {team?.name}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto min-h-0">
          {team && (
            <Tabs defaultValue="members">
              <TabsList>
                <TabsTrigger value="members">Membros ({members.length})</TabsTrigger>
                <TabsTrigger value="positions">Posicoes ({positions.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="members" className="mt-4">
                <TeamMembersList teamId={team.id} members={members} loading={membersLoading} positions={positions} />
              </TabsContent>

              <TabsContent value="positions" className="mt-4">
                <PositionsList teamId={team.id} positions={positions} />
              </TabsContent>
            </Tabs>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TeamMembersList({ teamId, members, loading, positions }: { teamId: string; members: any[]; loading: boolean; positions: VolPosition[] }) {
  const addMember = useAddTeamMember();
  const removeMember = useRemoveTeamMember();
  const [showAdd, setShowAdd] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  const handleSearchPC = async () => {
    if (!searchQuery.trim() || searchQuery.trim().length < 2) return;
    setSearching(true);
    try {
      const { people } = await (await import('@/api')).voluntariado.pc.searchPeople(searchQuery.trim());
      setSearchResults(people || []);
    } catch { toast.error('Erro ao buscar'); }
    setSearching(false);
  };

  const handleAddFromPC = (person: any) => {
    addMember.mutate({
      team_id: teamId,
      planning_center_person_id: person.id,
      volunteer_name: person.full_name,
    } as any, {
      onSuccess: () => { toast.success(`${person.full_name} adicionado`); setSearchResults(prev => prev.filter(p => p.id !== person.id)); },
      onError: (err: any) => toast.error(err.message || 'Erro ao adicionar'),
    });
  };

  const handleRemove = (memberId: string, name: string) => {
    if (!confirm(`Remover ${name} da equipe?`)) return;
    removeMember.mutate(memberId, {
      onSuccess: () => toast.success('Membro removido'),
      onError: () => toast.error('Erro ao remover'),
    });
  };

  if (loading) return <div className="text-center py-8 text-muted-foreground">Carregando...</div>;

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowAdd(!showAdd)} className="gap-1.5">
          <UserPlus className="h-4 w-4" /> Adicionar Membro
        </Button>
      </div>

      {showAdd && (
        <Card className="p-4 space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="Buscar voluntário no Planning Center..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearchPC()}
            />
            <Button onClick={handleSearchPC} disabled={searching} size="sm">Buscar</Button>
          </div>
          {searchResults.length > 0 && (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {searchResults.map(p => (
                <div key={p.id} className="flex items-center justify-between p-2 rounded hover:bg-accent">
                  <span className="text-sm">{p.full_name}</span>
                  <Button size="sm" variant="ghost" onClick={() => handleAddFromPC(p)} disabled={addMember.isPending}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {members.length === 0 ? (
        <p className="text-center text-muted-foreground py-6">Nenhum membro nesta equipe</p>
      ) : (
        <div className="space-y-1">
          {members.map(m => (
            <div key={m.id} className="flex items-center justify-between p-2.5 rounded-lg border bg-card">
              <div className="flex items-center gap-3">
                {m.profile?.avatar_url ? (
                  <img data-foto-avatar="" src={m.profile.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
                ) : (
                  <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                    {m.volunteer_name.charAt(0)}
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium">{m.volunteer_name}</p>
                  {m.position && <p className="text-xs text-muted-foreground">{m.position.name}</p>}
                </div>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => handleRemove(m.id, m.volunteer_name)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PositionsList({ teamId, positions }: { teamId: string; positions: VolPosition[] }) {
  const createPosition = useCreatePosition();
  const deletePosition = useDeletePosition();
  const [showAdd, setShowAdd] = useState(false);
  const [posName, setPosName] = useState('');

  const handleCreate = () => {
    if (!posName.trim()) return;
    createPosition.mutate({ team_id: teamId, name: posName.trim() } as any, {
      onSuccess: () => { toast.success('Posição criada'); setPosName(''); setShowAdd(false); },
      onError: (err: any) => toast.error(err.message || 'Erro ao criar'),
    });
  };

  const handleDelete = (id: string, name: string) => {
    if (!confirm(`Remover posição "${name}"?`)) return;
    deletePosition.mutate(id, {
      onSuccess: () => toast.success('Posição removida'),
      onError: () => toast.error('Erro ao remover'),
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowAdd(!showAdd)} className="gap-1.5">
          <Plus className="h-4 w-4" /> Nova Posição
        </Button>
      </div>

      {showAdd && (
        <div className="flex gap-2">
          <Input
            placeholder="Ex: Vocalista, Câmera 1, Recepcionista..."
            value={posName}
            onChange={e => setPosName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
          />
          <Button onClick={handleCreate} disabled={createPosition.isPending} size="sm">Criar</Button>
        </div>
      )}

      {positions.length === 0 ? (
        <p className="text-center text-muted-foreground py-6">Nenhuma posição cadastrada</p>
      ) : (
        <div className="space-y-1">
          {positions.map(p => (
            <div key={p.id} className="flex items-center justify-between p-2.5 rounded-lg border bg-card">
              <div>
                <p className="text-sm font-medium">{p.name}</p>
                <p className="text-xs text-muted-foreground">Min: {p.min_volunteers}{p.max_volunteers ? ` / Max: ${p.max_volunteers}` : ''}</p>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(p.id, p.name)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
