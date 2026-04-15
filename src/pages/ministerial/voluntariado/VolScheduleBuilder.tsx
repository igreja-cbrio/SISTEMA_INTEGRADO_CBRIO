import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  useUpcomingServices, useServiceSchedules, useVolTeamsManaged,
  useVolTeamMembers, useCreateSchedule, useDeleteSchedule,
  useAutoFillSchedule, useCopySchedule, useCreateService,
  useVolServiceTypes,
} from './hooks';
import { Plus, Trash2, Wand2, Copy, UserPlus, X, Calendar, Users, ChevronDown, ChevronUp } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import type { VolSchedule, VolTeam, VolService } from './types';

export default function VolScheduleBuilder() {
  const { data: services = [], isLoading: servicesLoading } = useUpcomingServices();
  const { data: teams = [] } = useVolTeamsManaged();
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const { data: schedules = [], isLoading: schedulesLoading } = useServiceSchedules(selectedServiceId || undefined);
  const [showCreateService, setShowCreateService] = useState(false);
  const [showAddVolunteer, setShowAddVolunteer] = useState(false);
  const [showCopyDialog, setShowCopyDialog] = useState(false);

  const selectedService = services.find(s => s.id === selectedServiceId);

  // Group schedules by team
  const schedulesByTeam = useMemo(() => {
    const grouped: Record<string, { teamName: string; teamId: string | null; schedules: VolSchedule[] }> = {};
    for (const sch of schedules) {
      const key = sch.team_name || 'Sem equipe';
      if (!grouped[key]) grouped[key] = { teamName: key, teamId: sch.team_id || null, schedules: [] };
      grouped[key].schedules.push(sch);
    }
    return Object.values(grouped).sort((a, b) => a.teamName.localeCompare(b.teamName));
  }, [schedules]);

  const totalScheduled = schedules.length;
  const confirmed = schedules.filter(s => s.confirmation_status === 'confirmed').length;
  const pending = schedules.filter(s => s.confirmation_status === 'pending').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-foreground">Montar Escala</h1>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowCreateService(true)}>
          <Plus className="h-4 w-4" /> Criar Culto
        </Button>
      </div>

      {/* Service selector */}
      <Card>
        <CardContent className="p-4">
          <Label className="mb-2 block text-sm">Selecione o culto</Label>
          <Select value={selectedServiceId} onValueChange={setSelectedServiceId}>
            <SelectTrigger><SelectValue placeholder="Escolha um culto para montar a escala" /></SelectTrigger>
            <SelectContent>
              {services.map(svc => (
                <SelectItem key={svc.id} value={svc.id}>
                  {svc.name} — {format(new Date(svc.scheduled_at), "EEEE, dd/MM 'as' HH:mm", { locale: ptBR })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {selectedServiceId && selectedService && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <Card><CardContent className="p-3 md:p-4 text-center"><p className="text-xl md:text-2xl font-bold">{totalScheduled}</p><p className="text-xs md:text-sm text-muted-foreground">Escalados</p></CardContent></Card>
            <Card><CardContent className="p-3 md:p-4 text-center"><p className="text-xl md:text-2xl font-bold text-green-600">{confirmed}</p><p className="text-xs md:text-sm text-muted-foreground">Confirmados</p></CardContent></Card>
            <Card><CardContent className="p-3 md:p-4 text-center"><p className="text-xl md:text-2xl font-bold text-yellow-600">{pending}</p><p className="text-xs md:text-sm text-muted-foreground">Pendentes</p></CardContent></Card>
          </div>

          {/* Action bar */}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" className="gap-1.5" onClick={() => setShowAddVolunteer(true)}>
              <UserPlus className="h-4 w-4" /> Adicionar Voluntario
            </Button>
            <AutoFillButton serviceId={selectedServiceId} teams={teams} />
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowCopyDialog(true)}>
              <Copy className="h-4 w-4" /> Copiar de Outro Culto
            </Button>
          </div>

          {/* Schedule list by team */}
          {schedulesLoading ? (
            <div className="text-center py-8 text-muted-foreground">Carregando escala...</div>
          ) : schedulesByTeam.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Users className="h-10 w-10 text-muted-foreground/30 mb-3" />
                <p className="text-muted-foreground">Nenhum voluntario escalado</p>
                <p className="text-sm text-muted-foreground/60">Use os botoes acima para montar a escala</p>
              </CardContent>
            </Card>
          ) : (
            schedulesByTeam.map(group => (
              <TeamScheduleGroup
                key={group.teamName}
                teamName={group.teamName}
                teamId={group.teamId}
                schedules={group.schedules}
                teams={teams}
              />
            ))
          )}
        </>
      )}

      {!selectedServiceId && !servicesLoading && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Calendar className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-lg font-medium text-muted-foreground">Selecione um culto</p>
            <p className="text-sm text-muted-foreground/60 mt-1">Escolha um culto para montar ou editar a escala</p>
          </CardContent>
        </Card>
      )}

      {showCreateService && (
        <CreateServiceDialog onClose={() => setShowCreateService(false)} />
      )}

      {showAddVolunteer && selectedServiceId && (
        <AddVolunteerDialog
          serviceId={selectedServiceId}
          teams={teams}
          existingSchedules={schedules}
          onClose={() => setShowAddVolunteer(false)}
        />
      )}

      {showCopyDialog && selectedServiceId && (
        <CopyScheduleDialog
          targetServiceId={selectedServiceId}
          services={services}
          onClose={() => setShowCopyDialog(false)}
        />
      )}
    </div>
  );
}

function TeamScheduleGroup({ teamName, teamId, schedules, teams }: {
  teamName: string; teamId: string | null; schedules: VolSchedule[]; teams: VolTeam[];
}) {
  const deleteSchedule = useDeleteSchedule();
  const [expanded, setExpanded] = useState(true);
  const team = teams.find(t => t.id === teamId);

  const handleRemove = (scheduleId: string, name: string) => {
    if (!confirm(`Remover ${name} da escala?`)) return;
    deleteSchedule.mutate(scheduleId, {
      onSuccess: () => toast.success('Removido da escala'),
      onError: () => toast.error('Erro ao remover'),
    });
  };

  return (
    <Card>
      <CardHeader className="pb-2 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {team?.color && <div className="h-3 w-3 rounded-full" style={{ backgroundColor: team.color }} />}
            <CardTitle className="text-base">{teamName}</CardTitle>
            <Badge variant="outline" className="text-xs">{schedules.length}</Badge>
          </div>
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="pt-0">
          <div className="space-y-1">
            {schedules.map(sch => (
              <div key={sch.id} className="flex items-center justify-between p-2.5 rounded-lg border bg-card/50">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium shrink-0">
                    {sch.volunteer_name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{sch.volunteer_name}</p>
                    <div className="flex items-center gap-2">
                      {sch.position_name && <span className="text-xs text-muted-foreground">{sch.position_name}</span>}
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${
                        sch.confirmation_status === 'confirmed' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' :
                        sch.confirmation_status === 'declined' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' :
                        'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
                      }`}>
                        {sch.confirmation_status === 'confirmed' ? 'Confirmado' :
                         sch.confirmation_status === 'declined' ? 'Recusou' : 'Pendente'}
                      </Badge>
                      {sch.source !== 'planning_center' && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {sch.source === 'auto_rotation' ? 'Auto' : 'Manual'}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                <Button
                  variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => handleRemove(sch.id, sch.volunteer_name)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function AutoFillButton({ serviceId, teams }: { serviceId: string; teams: VolTeam[] }) {
  const autoFill = useAutoFillSchedule();
  const [showSelect, setShowSelect] = useState(false);

  const handleAutoFill = (teamId: string) => {
    autoFill.mutate({ service_id: serviceId, team_id: teamId }, {
      onSuccess: (data: any) => {
        toast.success(`${data.created} voluntario(s) escalado(s) automaticamente`);
        setShowSelect(false);
      },
      onError: (err: any) => toast.error(err.message || 'Erro ao auto-preencher'),
    });
  };

  if (teams.length === 0) return null;

  return (
    <div className="relative">
      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowSelect(!showSelect)}>
        <Wand2 className="h-4 w-4" /> Auto-preencher
      </Button>
      {showSelect && (
        <div className="absolute top-full left-0 mt-1 bg-popover border rounded-lg shadow-lg z-10 min-w-48">
          <div className="p-2 space-y-1">
            <p className="text-xs text-muted-foreground px-2 pb-1">Selecione a equipe:</p>
            {teams.filter(t => t.is_active).map(t => (
              <button
                key={t.id}
                className="w-full text-left px-3 py-2 rounded text-sm hover:bg-accent flex items-center gap-2"
                onClick={() => handleAutoFill(t.id)}
                disabled={autoFill.isPending}
              >
                {t.color && <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: t.color }} />}
                {t.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AddVolunteerDialog({ serviceId, teams, existingSchedules, onClose }: {
  serviceId: string; teams: VolTeam[]; existingSchedules: VolSchedule[]; onClose: () => void;
}) {
  const createSchedule = useCreateSchedule();
  const { data: allMembers = [] } = useVolTeamMembers();
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);

  // Filter team members not already scheduled
  const alreadyScheduledIds = new Set(existingSchedules.map(s => s.volunteer_id || s.planning_center_person_id));
  const teamMembers = useMemo(() => {
    let filtered = allMembers.filter(m => !alreadyScheduledIds.has(m.volunteer_profile_id || m.planning_center_person_id));
    if (selectedTeamId) filtered = filtered.filter(m => m.team_id === selectedTeamId);
    if (searchQuery) filtered = filtered.filter(m => m.volunteer_name.toLowerCase().includes(searchQuery.toLowerCase()));
    return filtered;
  }, [allMembers, selectedTeamId, searchQuery, alreadyScheduledIds]);

  const handleAdd = (member: any) => {
    createSchedule.mutate({
      service_id: serviceId,
      volunteer_id: member.volunteer_profile_id || undefined,
      volunteer_name: member.volunteer_name,
      team_id: member.team_id,
      team_name: member.team?.name,
      position_id: member.position_id || undefined,
      position_name: member.position?.name,
      planning_center_person_id: member.planning_center_person_id || undefined,
    }, {
      onSuccess: () => toast.success(`${member.volunteer_name} escalado`),
      onError: (err: any) => toast.error(err.message || 'Erro ao escalar'),
    });
  };

  const handleSearchPC = async () => {
    if (!searchQuery.trim() || searchQuery.trim().length < 2) return;
    try {
      const { people } = await (await import('@/api')).voluntariado.pc.searchPeople(searchQuery.trim());
      setSearchResults(people || []);
    } catch { toast.error('Erro ao buscar no PC'); }
  };

  const handleAddFromPC = (person: any) => {
    createSchedule.mutate({
      service_id: serviceId,
      volunteer_name: person.full_name,
      planning_center_person_id: person.id,
    }, {
      onSuccess: () => { toast.success(`${person.full_name} escalado`); setSearchResults(prev => prev.filter(p => p.id !== person.id)); },
      onError: (err: any) => toast.error(err.message || 'Erro ao escalar'),
    });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Adicionar Voluntario</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 flex-1 overflow-hidden flex flex-col">
          <div className="flex gap-2">
            <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Equipe" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {teams.filter(t => t.is_active).map(t => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Buscar por nome..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="flex-1"
            />
          </div>

          <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
            {teamMembers.length > 0 ? (
              teamMembers.map(m => (
                <div key={m.id} className="flex items-center justify-between p-2.5 rounded-lg border">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                      {m.volunteer_name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{m.volunteer_name}</p>
                      <p className="text-xs text-muted-foreground">{m.team?.name}{m.position ? ` - ${m.position.name}` : ''}</p>
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => handleAdd(m)} disabled={createSchedule.isPending}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              ))
            ) : (
              <div className="text-center py-6">
                <p className="text-sm text-muted-foreground mb-2">Nenhum membro disponivel</p>
                <Button size="sm" variant="outline" onClick={handleSearchPC} className="gap-1">
                  Buscar no Planning Center
                </Button>
              </div>
            )}

            {searchResults.length > 0 && (
              <>
                <p className="text-xs text-muted-foreground pt-2 px-1">Resultados do Planning Center:</p>
                {searchResults.map(p => (
                  <div key={p.id} className="flex items-center justify-between p-2.5 rounded-lg border border-dashed">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                        {p.full_name.charAt(0)}
                      </div>
                      <p className="text-sm">{p.full_name}</p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => handleAddFromPC(p)} disabled={createSchedule.isPending}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CopyScheduleDialog({ targetServiceId, services, onClose }: {
  targetServiceId: string; services: VolService[]; onClose: () => void;
}) {
  const copySchedule = useCopySchedule();
  const [sourceId, setSourceId] = useState('');

  const handleCopy = () => {
    if (!sourceId) return toast.error('Selecione o culto de origem');
    copySchedule.mutate({ from_service_id: sourceId, to_service_id: targetServiceId }, {
      onSuccess: (data: any) => { toast.success(`${data.copied} escala(s) copiada(s)`); onClose(); },
      onError: (err: any) => toast.error(err.message || 'Erro ao copiar'),
    });
  };

  const availableServices = services.filter(s => s.id !== targetServiceId);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Copiar Escala de Outro Culto</DialogTitle>
        </DialogHeader>
        <div className="py-4">
          <Label>Culto de origem</Label>
          <Select value={sourceId} onValueChange={setSourceId}>
            <SelectTrigger><SelectValue placeholder="Selecione o culto" /></SelectTrigger>
            <SelectContent>
              {availableServices.map(svc => (
                <SelectItem key={svc.id} value={svc.id}>
                  {svc.name} — {format(new Date(svc.scheduled_at), "dd/MM 'as' HH:mm", { locale: ptBR })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleCopy} disabled={copySchedule.isPending} className="bg-[#00B39D] hover:bg-[#00B39D]/90">
            Copiar Escala
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateServiceDialog({ onClose }: { onClose: () => void }) {
  const createService = useCreateService();
  const { data: serviceTypes = [] } = useVolServiceTypes();
  const [name, setName] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [serviceTypeId, setServiceTypeId] = useState('');

  const handleSelectType = (typeId: string) => {
    setServiceTypeId(typeId);
    const st = serviceTypes.find(t => t.id === typeId);
    if (st) setName(st.name);
  };

  const handleCreate = () => {
    if (!name.trim() || !scheduledAt) return toast.error('Nome e data obrigatorios');
    createService.mutate({
      name: name.trim(),
      service_type_name: name.trim(),
      service_type_id: serviceTypeId || undefined,
      scheduled_at: new Date(scheduledAt).toISOString(),
    }, {
      onSuccess: () => { toast.success('Culto criado'); onClose(); },
      onError: (err: any) => toast.error(err.message || 'Erro ao criar'),
    });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Criar Culto</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {serviceTypes.length > 0 && (
            <div>
              <Label>Tipo de Culto</Label>
              <Select value={serviceTypeId} onValueChange={handleSelectType}>
                <SelectTrigger><SelectValue placeholder="Selecione (opcional)" /></SelectTrigger>
                <SelectContent>
                  {serviceTypes.filter(t => t.is_active).map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>Nome</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Culto Domingo Manha" />
          </div>
          <div>
            <Label>Data e Horario</Label>
            <Input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleCreate} disabled={createService.isPending} className="bg-[#00B39D] hover:bg-[#00B39D]/90">
            Criar Culto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
