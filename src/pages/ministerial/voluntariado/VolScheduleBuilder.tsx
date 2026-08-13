import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { voluntariado } from '../../../api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  useUpcomingServices, useServiceSchedules, useVolTeamsManaged,
  useCreateSchedule, useDeleteSchedule, useUpdateSchedule,
  useAutoFillSchedule, useCopySchedule, useCreateService,
  useVolServiceTypes, useVolunteersPool, useSyncPlanningCenter,
  useMontagemContexto,
} from './hooks';
import { Plus, Trash2, Wand2, Copy, UserPlus, X, Calendar, Users, ChevronDown, ChevronUp, RefreshCw, Search, GripVertical } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import type { VolSchedule, VolTeam, VolService } from './types';

// MIME types custom do drag & drop HTML5 (padrão usado no Planner do Marketing).
const MIME_VOL = 'application/x-cbrio-vol';
const MIME_SCHED = 'application/x-cbrio-sched';

type PoolVol = any;

export default function VolScheduleBuilder() {
  const { data: services = [], isLoading: servicesLoading } = useUpcomingServices();
  const { data: teams = [] } = useVolTeamsManaged();
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const { data: schedules = [], isLoading: schedulesLoading } = useServiceSchedules(selectedServiceId || undefined);
  const [showCreateService, setShowCreateService] = useState(false);
  const [showAddVolunteer, setShowAddVolunteer] = useState(false);
  const [showCopyDialog, setShowCopyDialog] = useState(false);
  const { data: contexto } = useMontagemContexto(selectedServiceId || undefined);

  const selectedService = services.find(s => s.id === selectedServiceId);

  // Pool de voluntários do culto: sem os já escalados neste culto.
  const poolDisponiveis = useMemo(() => {
    if (!contexto?.pool) return [];
    return (contexto.pool as PoolVol[]).filter((v: PoolVol) => !v.jaEscalado);
  }, [contexto]);

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

  // Cobertura: composição esperada (template aplicado) × preenchidas ao vivo.
  const [addPreselectTeam, setAddPreselectTeam] = useState('');
  const { data: coberturaRaw } = useQuery<any>({
    queryKey: ['vol-escala-cobertura', selectedServiceId],
    queryFn: () => voluntariado.escalaCobertura(selectedServiceId),
    enabled: !!selectedServiceId,
  });
  const cobertura = useMemo(() => {
    const itens = coberturaRaw?.itens || [];
    const filled = (it: any) => schedules.filter((s: any) => s.volunteer_id && s.team_id === it.team_id &&
      ((it.position_id && s.position_id === it.position_id) || (!it.position_id && !s.position_id))).length;
    const calc = itens.map((it: any) => { const pre = filled(it); return { ...it, preenchidas: pre, faltam: Math.max(0, it.alvo - pre) }; });
    const porEquipe: Record<string, any[]> = {};
    for (const i of calc) (porEquipe[i.team || 'Equipe'] ||= []).push(i);
    const alvo = calc.reduce((a: number, i: any) => a + i.alvo, 0);
    const pre = calc.reduce((a: number, i: any) => a + i.preenchidas, 0);
    return { itens: calc, porEquipe, alvo, preenchidas: pre, faltam: Math.max(0, alvo - pre), pct: alvo ? Math.round((pre / alvo) * 100) : null };
  }, [coberturaRaw, schedules]);

  const createSchedule = useCreateSchedule();
  const updateSchedule = useUpdateSchedule();

  // Drop numa equipe: (a) voluntário vindo do pool → cria a escala; (b) voluntário
  // vindo de outra equipe → move (atualiza a equipe).
  const handleDropOnTeam = (e: React.DragEvent, teamId: string | null, teamName: string) => {
    e.preventDefault();
    const volRaw = e.dataTransfer.getData(MIME_VOL);
    if (volRaw) {
      const v = JSON.parse(volRaw);
      createSchedule.mutate({
        service_id: selectedServiceId,
        volunteer_id: v.volunteer_id,
        volunteer_name: v.volunteer_name,
        team_id: teamId || undefined,
        team_name: teamName,
        planning_center_person_id: v.planning_center_person_id || undefined,
      }, {
        onSuccess: () => toast.success(`${v.volunteer_name} escalado em ${teamName || 'Sem equipe'}`),
        onError: (err: any) => toast.error(err.message || 'Erro ao escalar'),
      });
      return;
    }
    const schedRaw = e.dataTransfer.getData(MIME_SCHED);
    if (schedRaw) {
      const s = JSON.parse(schedRaw);
      updateSchedule.mutate({ id: s.id, data: { team_id: teamId, team_name: teamName, position_id: null, position_name: null } }, {
        onSuccess: () => toast.success(`${s.volunteer_name} movido para ${teamName || 'Sem equipe'}`),
        onError: (err: any) => toast.error(err.message || 'Erro ao mover'),
      });
    }
  };

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
                  {svc.name} — {format(new Date(svc.scheduled_at), "EEEE, dd/MM", { locale: ptBR })}
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

          {/* Cobertura da escala (só quando um template foi aplicado ao culto) */}
          {cobertura.alvo > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span>Cobertura da escala</span>
                  <span className={cobertura.faltam ? 'text-yellow-600' : 'text-green-600'}>
                    {cobertura.preenchidas}/{cobertura.alvo} vagas · {cobertura.pct}%
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {Object.entries(cobertura.porEquipe).map(([team, itens]) => (
                  <div key={team}>
                    <div className="text-xs font-semibold text-muted-foreground mb-1">{team}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {(itens as any[]).map(it => (
                        <span key={it.id}
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs ${it.faltam ? 'border-yellow-400 bg-yellow-50 text-yellow-800' : 'border-green-300 bg-green-50 text-green-700'}`}>
                          <span>{it.position || 'Equipe toda'}</span>
                          <span className="font-semibold">{it.preenchidas}/{it.alvo}</span>
                          {it.faltam > 0 && (
                            <button className="underline underline-offset-2" onClick={() => { setAddPreselectTeam(it.team_id); setShowAddVolunteer(true); }}>
                              preencher
                            </button>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Pool de voluntários disponíveis · arrastar pra vaga/equipe */}
          <PoolSection
            pool={poolDisponiveis}
            contexto={contexto}
            teams={teams}
            onAdd={({ volunteer_id, volunteer_name, planning_center_person_id, team_id, team_name }) =>
              createSchedule.mutate({
                service_id: selectedServiceId,
                volunteer_id,
                volunteer_name,
                team_id: team_id || undefined,
                team_name: team_name || undefined,
                planning_center_person_id: planning_center_person_id || undefined,
              }, {
                onSuccess: () => toast.success(`${volunteer_name} escalado`),
                onError: (err: any) => toast.error(err.message || 'Erro ao escalar'),
              })
            }
          />

          {/* Schedule list by team (drop targets) */}
          {schedulesLoading ? (
            <div className="text-center py-8 text-muted-foreground">Carregando escala...</div>
          ) : schedulesByTeam.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Users className="h-10 w-10 text-muted-foreground/30 mb-3" />
                <p className="text-muted-foreground">Nenhum voluntário escalado</p>
                <p className="text-sm text-muted-foreground/60">Arraste voluntários do painel acima ou use os botoes</p>
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
                contexto={contexto}
                onDropTeam={handleDropOnTeam}
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
          initialTeamId={addPreselectTeam}
          poolAnotado={poolDisponiveis}
          onClose={() => { setShowAddVolunteer(false); setAddPreselectTeam(''); }}
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

// Painel de voluntários disponíveis: filtra indisponíveis (toggle), mostra quem
// já serve em outro culto do mesmo dia e permite arrastar pra vaga/equipe.
function PoolSection({ pool, contexto, teams, onAdd }: {
  pool: PoolVol[]; contexto: any; teams: VolTeam[]; onAdd: (v: any) => void;
}) {
  const [open, setOpen] = useState(true);
  const [hideUnavailable, setHideUnavailable] = useState(true);
  const [search, setSearch] = useState('');

  const list = useMemo(() => {
    let l = pool;
    if (hideUnavailable) l = l.filter((v: PoolVol) => !v.indisponivel);
    if (search.trim()) {
      const q = search.toLowerCase();
      l = l.filter((v: PoolVol) => v.full_name.toLowerCase().includes(q));
    }
    return l;
  }, [pool, hideUnavailable, search]);

  if (!contexto) return null;
  const totalDisponiveis = pool.filter((v: PoolVol) => !v.indisponivel).length;
  const totalIndisponiveis = pool.length - totalDisponiveis;

  const handleDragStart = (e: React.DragEvent, v: PoolVol) => {
    e.dataTransfer.setData(MIME_VOL, JSON.stringify({
      volunteer_id: v.id,
      volunteer_name: v.full_name,
      planning_center_person_id: v.planning_center_id || null,
    }));
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <Card className={hideUnavailable ? '' : 'border-red-200'}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-2 cursor-pointer select-none" onClick={() => setOpen(!open)}>
            {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            Voluntários disponíveis
            <Badge variant="outline" className="text-xs">{list.length}</Badge>
          </span>
          <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
            <input
              type="checkbox"
              checked={hideUnavailable}
              onChange={e => setHideUnavailable(e.target.checked)}
              className="accent-[#00B39D]"
            />
            Ocultar indisponíveis
            {totalIndisponiveis > 0 && (
              <span className="text-xs text-red-600">({totalIndisponiveis} indisponível(is))</span>
            )}
          </label>
        </CardTitle>
      </CardHeader>
      {open && (
        <CardContent className="pt-0 space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-9 text-sm"
            />
          </div>
          {list.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-3">
              {pool.length === 0
                ? 'Nenhum voluntário sincronizado. Use "Sincronizar" no modal de adicionar.'
                : 'Todos os voluntários já estão escalados ou indisponíveis neste dia.'}
            </p>
          ) : (
            <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((v: PoolVol) => {
                const over = (v.escaladoEm || []) as Array<{ service_id: string; name: string; scheduled_at: string }>;
                return (
                  <div
                    key={v.id}
                    draggable
                    onDragStart={e => handleDragStart(e, v)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg border bg-card/50 cursor-grab active:cursor-grabbing hover:border-[#00B39D]/60 transition-colors"
                    title={over.length
                      ? `Já serve às ${over.map(o => format(new Date(o.scheduled_at), 'HH:mm')).join(', ')} em outro(s) culto(s) deste dia`
                      : 'Arraste para uma equipe para escalar'}
                  >
                    <GripVertical className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium shrink-0 overflow-hidden">
                      {v.avatar_url
                        ? <img data-foto-avatar="" src={v.avatar_url} alt={v.full_name} className="h-full w-full object-cover" />
                        : v.full_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{v.full_name}</p>
                      <div className="flex flex-wrap gap-1">
                        {over.length > 0 && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                            já serve às {format(new Date(over[0].scheduled_at), 'HH:mm')}
                          </Badge>
                        )}
                        {(v.team_members || []).slice(0, 1).map((tm: any) => (
                          <span key={tm.id} className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
                            {tm.team?.color && <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: tm.team.color }} />}
                            {tm.team?.name}
                          </span>
                        ))}
                      </div>
                    </div>
                    <Button
                      size="icon"
                      className="h-7 w-7 shrink-0 bg-[#00B39D] hover:bg-[#00B39D]/80 text-white"
                      onClick={() => onAdd(v)}
                      title="Escalar (usa a primeira equipe do voluntário)"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function TeamScheduleGroup({ teamName, teamId, schedules, teams, contexto, onDropTeam }: {
  teamName: string; teamId: string | null; schedules: VolSchedule[]; teams: VolTeam[];
  contexto: any; onDropTeam: (e: React.DragEvent, teamId: string | null, teamName: string) => void;
}) {
  const deleteSchedule = useDeleteSchedule();
  const [expanded, setExpanded] = useState(true);
  const [over, setOver] = useState(false);
  const team = teams.find(t => t.id === teamId);

  const handleRemove = (scheduleId: string, name: string) => {
    if (!confirm(`Remover ${name} da escala?`)) return;
    deleteSchedule.mutate(scheduleId, {
      onSuccess: () => toast.success('Removido da escala'),
      onError: () => toast.error('Erro ao remover'),
    });
  };

  return (
    <Card
      className={`transition-colors ${over ? 'border-[#00B39D] bg-[#00B39D]/5' : ''}`}
      onDragOver={e => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={e => { setOver(false); onDropTeam(e, teamId, teamName); }}
    >
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
            {schedules.map(sch => {
              // Sobreposição/indisponibilidade da pessoa neste dia (do contexto).
              const info = (contexto?.pool || []).find((v: PoolVol) =>
                (sch.volunteer_id && v.id === sch.volunteer_id) ||
                (sch.planning_center_person_id && v.planning_center_id === sch.planning_center_person_id));
              const over = (info?.escaladoEm || []) as Array<{ service_id: string; name: string; scheduled_at: string }>;
              return (
                <div
                  key={sch.id}
                  draggable
                  onDragStart={e => {
                    e.dataTransfer.setData(MIME_SCHED, JSON.stringify({ id: sch.id, volunteer_name: sch.volunteer_name }));
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  className="flex items-center justify-between p-2.5 rounded-lg border bg-card/50 cursor-grab active:cursor-grabbing"
                  title={over.length
                    ? `Atenção: já serve às ${over.map(o => format(new Date(o.scheduled_at), 'HH:mm')).join(', ')} em outro(s) culto(s) deste dia`
                    : 'Arraste para mover de equipe'}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <GripVertical className="h-4 w-4 text-muted-foreground/30 shrink-0" />
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium shrink-0">
                      {sch.volunteer_name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{sch.volunteer_name}</p>
                      <div className="flex items-center gap-2 flex-wrap">
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
                        {over.length > 0 && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                            já serve às {format(new Date(over[0].scheduled_at), 'HH:mm')}
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
              );
            })}
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

function AddVolunteerDialog({ serviceId, teams, existingSchedules, initialTeamId, poolAnotado, onClose }: {
  serviceId: string; teams: VolTeam[]; existingSchedules: VolSchedule[]; initialTeamId?: string;
  poolAnotado?: PoolVol[]; onClose: () => void;
}) {
  const createSchedule = useCreateSchedule();
  const sync = useSyncPlanningCenter();
  const { data: poolLegacy = [], isLoading: poolLoading, refetch } = useVolunteersPool();
  // Quando o contexto de montagem já veio anotado (indisponibilidade + sobreposição),
  // usa ele — senão cai no pool genérico.
  const pool = (poolAnotado && poolAnotado.length > 0) ? poolAnotado : poolLegacy;
  const [selectedTeamId, setSelectedTeamId] = useState(initialTeamId || '');
  const [searchQuery, setSearchQuery] = useState('');
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [hideUnavailable, setHideUnavailable] = useState(true);
  // Quando o voluntário serve em mais de uma equipe e não há filtro de equipe,
  // guarda qual vínculo (equipe/função) o coordenador escolheu por pessoa.
  const [choice, setChoice] = useState<Record<string, number>>({});

  // Volunteers not yet on this service (existing + added in this session)
  const alreadyScheduledIds = useMemo(() => {
    const ids = new Set<string>();
    for (const s of existingSchedules) {
      if (s.volunteer_id) ids.add(s.volunteer_id);
      if (s.planning_center_person_id) ids.add(s.planning_center_person_id);
    }
    for (const id of addedIds) ids.add(id);
    return ids;
  }, [existingSchedules, addedIds]);

  const filtered = useMemo(() => {
    let list: any[] = pool.filter((v: any) => !alreadyScheduledIds.has(v.id) &&
      !alreadyScheduledIds.has(v.planning_center_id));
    if (hideUnavailable) list = list.filter((v: any) => !v.indisponivel);

    if (selectedTeamId && selectedTeamId !== 'all') {
      list = list.filter((v: any) =>
        (v.team_members || []).some((tm: any) => tm.team_id === selectedTeamId)
      );
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((v: any) => v.full_name.toLowerCase().includes(q) ||
        v.email?.toLowerCase().includes(q));
    }
    return list;
  }, [pool, selectedTeamId, searchQuery, alreadyScheduledIds, hideUnavailable]);

  const handleAdd = (vol: any) => {
    // Escolhe o vínculo (equipe/função) a usar: (1) se há filtro de equipe, o
    // vínculo daquela equipe; (2) se a pessoa escolheu no seletor, o escolhido;
    // (3) senão o primeiro. Fim do team_members[0] silencioso em quem serve em várias.
    const mem = (vol.team_members || []) as any[];
    let tm = mem[0];
    if (selectedTeamId && selectedTeamId !== 'all') tm = mem.find(m => m.team_id === selectedTeamId) || tm;
    else if (choice[vol.id] != null && mem[choice[vol.id]]) tm = mem[choice[vol.id]];
    createSchedule.mutate({
      service_id: serviceId,
      volunteer_id: vol.id,
      volunteer_name: vol.full_name,
      team_id: tm?.team_id || undefined,
      team_name: tm?.team?.name || undefined,
      position_id: tm?.position_id || undefined,
      position_name: tm?.position?.name || undefined,
      planning_center_person_id: vol.planning_center_id || undefined,
    }, {
      onSuccess: () => {
        toast.success(`${vol.full_name} escalado`);
        setAddedIds(prev => new Set(prev).add(vol.id));
      },
      onError: (err: any) => toast.error(err.message || 'Erro ao escalar'),
    });
  };

  const handleSync = () => {
    sync.mutate(undefined, {
      onSuccess: (data: any) => {
        toast.success(`Sincronizado: ${data.services} cultos, ${data.newSchedules} escalas`);
        refetch();
      },
      onError: (err: any) => toast.error(err.message || 'Erro ao sincronizar'),
    });
  };

  const countIndisponiveis = useMemo(() =>
    pool.filter((v: any) => !alreadyScheduledIds.has(v.id) &&
      !alreadyScheduledIds.has(v.planning_center_id) && v.indisponivel).length,
  [pool, alreadyScheduledIds]);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="w-full max-w-lg h-[90vh] sm:h-[80vh] flex flex-col p-0 gap-0">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b shrink-0">
          <div>
            <h2 className="text-base font-semibold">Adicionar Voluntário</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{pool.length} voluntario(s) no sistema</p>
          </div>
          <Button
            size="sm" variant="outline" className="gap-1.5 text-xs"
            onClick={handleSync} disabled={sync.isPending}
          >
            {sync.isPending
              ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              : <RefreshCw className="h-3.5 w-3.5" />}
            Sincronizar
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 px-4 py-3 border-b shrink-0">
          <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
            <SelectTrigger className="w-36 h-9 text-sm"><SelectValue placeholder="Equipe" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas equipes</SelectItem>
              {teams.filter(t => t.is_active).map(t => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative flex-1 min-w-[140px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-8 h-9 text-sm"
            />
          </div>
          <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
            <input
              type="checkbox"
              checked={hideUnavailable}
              onChange={e => setHideUnavailable(e.target.checked)}
              className="accent-[#00B39D]"
            />
            Ocultar indisponíveis
            {countIndisponiveis > 0 && (
              <span className="text-xs text-red-600">({countIndisponiveis})</span>
            )}
          </label>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-2 py-2 min-h-0">
          {poolLoading && pool.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10">
              <Users className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">
                {pool.length === 0
                  ? 'Nenhum voluntário sincronizado. Clique em Sincronizar.'
                  : 'Nenhum voluntário encontrado com esse filtro.'}
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {filtered.map((vol: any) => {
                const teams_of = (vol.team_members || []) as any[];
                const over = (vol.escaladoEm || []) as Array<{ service_id: string; name: string; scheduled_at: string }>;
                return (
                  <div key={vol.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border hover:bg-accent/50 transition-colors">
                    {/* Avatar */}
                    <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-sm font-semibold shrink-0 overflow-hidden">
                      {vol.avatar_url
                        ? <img data-foto-avatar="" src={vol.avatar_url} alt={vol.full_name} className="h-full w-full object-cover" />
                        : vol.full_name.charAt(0).toUpperCase()}
                    </div>
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{vol.full_name}</p>
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {teams_of.length > 0
                          ? teams_of.slice(0, 2).map((tm: any) => (
                              <span key={tm.id} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                {tm.team?.color && <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: tm.team.color }} />}
                                {tm.team?.name}{tm.position ? ` · ${tm.position.name}` : ''}
                              </span>
                            ))
                          : <span className="text-[10px] text-muted-foreground/60">Sem equipe</span>
                        }
                        {teams_of.length > 2 && (
                          <span className="text-[10px] text-muted-foreground/60">+{teams_of.length - 2}</span>
                        )}
                        {over.length > 0 && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                            já serve às {format(new Date(over[0].scheduled_at), 'HH:mm')}
                          </Badge>
                        )}
                        {vol.indisponivel && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" title={vol.indisponivelMotivo || 'Indisponível'}>
                            Indisponível{vol.indisponivelMotivo ? ` · ${vol.indisponivelMotivo}` : ''}
                          </Badge>
                        )}
                      </div>
                    </div>
                    {/* Seletor de equipe quando serve em >1 e sem filtro de equipe */}
                    {teams_of.length > 1 && (!selectedTeamId || selectedTeamId === 'all') && (
                      <select
                        className="h-8 shrink-0 rounded-md border bg-background px-1.5 text-xs max-w-[130px]"
                        value={choice[vol.id] ?? 0}
                        onChange={e => setChoice(prev => ({ ...prev, [vol.id]: parseInt(e.target.value, 10) }))}
                      >
                        {teams_of.map((tm: any, idx: number) => (
                          <option key={tm.id} value={idx}>{tm.team?.name}{tm.position ? ` · ${tm.position.name}` : ''}</option>
                        ))}
                      </select>
                    )}
                    {/* Add button */}
                    <Button
                      size="icon"
                      className="h-8 w-8 shrink-0 bg-[#00B39D] hover:bg-[#00B39D]/80 text-white"
                      onClick={() => handleAdd(vol)}
                      disabled={createSchedule.isPending}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t px-4 py-3 shrink-0 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{filtered.length} disponível(is)</p>
          <Button variant="outline" size="sm" onClick={onClose}>Fechar</Button>
        </div>
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
                  {svc.name} — {format(new Date(svc.scheduled_at), "EEEE, dd/MM", { locale: ptBR })}
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
    if (!name.trim() || !scheduledAt) return toast.error('Nome e data obrigatórios');
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
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Culto Domingo Manhã" />
          </div>
          <div>
            <Label>Data e Horário</Label>
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
