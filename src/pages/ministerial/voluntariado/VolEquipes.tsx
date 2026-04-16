import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Plus, Users, Trash2, Edit2, UserPlus, X, Download, Briefcase } from 'lucide-react';
import { toast } from 'sonner';
import type { VolTeam, VolPosition } from './types';

const TEAM_COLORS = ['#00B39D', '#3B82F6', '#EF4444', '#F59E0B', '#8B5CF6', '#EC4899', '#10B981', '#6366F1', '#F97316', '#14B8A6'];

export default function VolEquipes() {
  const { data: teams = [], isLoading } = useVolTeamsManaged();
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editTeam, setEditTeam] = useState<VolTeam | null>(null);

  const selectedTeam = teams.find(t => t.id === selectedTeamId);

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

      {teams.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Users className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-lg font-medium text-muted-foreground">Nenhuma equipe cadastrada</p>
            <p className="text-sm text-muted-foreground/60 mt-1">Importe do Planning Center ou crie manualmente</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {teams.map(team => (
            <Card
              key={team.id}
              className="cursor-pointer transition-all hover:shadow-md hover:ring-2 hover:ring-primary/40"
              onClick={() => setSelectedTeamId(team.id)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {team.color && (
                      <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: team.color }} />
                    )}
                    <CardTitle className="text-base">{team.name}</CardTitle>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7"
                      onClick={e => { e.stopPropagation(); setEditTeam(team); }}
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {team.description && <p className="text-sm text-muted-foreground mb-2">{team.description}</p>}
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" />
                    {team.members?.[0]?.count ?? 0} membros
                  </span>
                  {team.positions && team.positions.length > 0 && (
                    <span className="flex items-center gap-1">
                      <Briefcase className="h-3.5 w-3.5" />
                      {team.positions.length} posicoes
                    </span>
                  )}
                </div>
                {team.leader && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Lider: {team.leader.full_name}
                  </p>
                )}
                {!team.is_active && <Badge variant="outline" className="mt-2 text-xs">Inativa</Badge>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <TeamDetailDialog teamId={selectedTeamId} team={selectedTeam ?? null} onClose={() => setSelectedTeamId(null)} />

      {(showCreateDialog || editTeam) && (
        <TeamFormDialog
          team={editTeam}
          onClose={() => { setShowCreateDialog(false); setEditTeam(null); }}
        />
      )}
    </div>
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
            toast.success(`${data.assigned} atribuicoes sincronizadas (${data.volunteers} voluntarios)`),
          onError: () => toast.error('Erro ao sincronizar membros'),
        });
      }}
    >
      <Download className="h-4 w-4" />
      <span className="hidden sm:inline">Sincronizar membros</span>
    </Button>
  );
}

function TeamFormDialog({ team, onClose }: { team: VolTeam | null; onClose: () => void }) {
  const createTeam = useCreateTeam();
  const updateTeam = useUpdateTeam();
  const deleteTeam = useDeleteTeam();
  const [name, setName] = useState(team?.name || '');
  const [description, setDescription] = useState(team?.description || '');
  const [color, setColor] = useState(team?.color || TEAM_COLORS[0]);

  const handleSave = () => {
    if (!name.trim()) return toast.error('Nome obrigatorio');
    const data = { name: name.trim(), description: description.trim() || null, color };
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
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Louvor, Midia, Recepcao" />
          </div>
          <div>
            <Label>Descricao</Label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Descricao da equipe (opcional)" />
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
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {team?.color && <div className="h-4 w-4 rounded-full shrink-0" style={{ backgroundColor: team.color }} />}
            {team?.name}
          </DialogTitle>
        </DialogHeader>
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
              placeholder="Buscar voluntario no Planning Center..."
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
                  <img src={m.profile.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
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
      onSuccess: () => { toast.success('Posicao criada'); setPosName(''); setShowAdd(false); },
      onError: (err: any) => toast.error(err.message || 'Erro ao criar'),
    });
  };

  const handleDelete = (id: string, name: string) => {
    if (!confirm(`Remover posicao "${name}"?`)) return;
    deletePosition.mutate(id, {
      onSuccess: () => toast.success('Posicao removida'),
      onError: () => toast.error('Erro ao remover'),
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowAdd(!showAdd)} className="gap-1.5">
          <Plus className="h-4 w-4" /> Nova Posicao
        </Button>
      </div>

      {showAdd && (
        <div className="flex gap-2">
          <Input
            placeholder="Ex: Vocalista, Camera 1, Recepcionista..."
            value={posName}
            onChange={e => setPosName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
          />
          <Button onClick={handleCreate} disabled={createPosition.isPending} size="sm">Criar</Button>
        </div>
      )}

      {positions.length === 0 ? (
        <p className="text-center text-muted-foreground py-6">Nenhuma posicao cadastrada</p>
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
