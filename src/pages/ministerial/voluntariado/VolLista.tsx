import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RefreshCw, Search, Users, QrCode, Clock, CheckCircle2, UserCheck, UserPlus, X, Cake, Pencil, MessageCircle } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { voluntariado } from '@/api';
import { hrefConversa } from '@/lib/conversas';
import Paginacao, { usePaginacaoLocal } from '@/components/Paginacao';
import {
  useVolunteersPool, useSyncPlanningCenter, useWaitingAllocation,
  useAllocateVolunteer, useVolTeamsManaged,
} from './hooks';
import VolDetalheDialog from './VolDetalheDialog';

type Tab = 'todos' | 'fila';

export default function VolLista() {
  const [tab, setTab] = useState<Tab>('todos');

  return (
    <div className="space-y-4">
      {/* Tab switcher */}
      <div className="flex gap-1 border-b pb-0">
        {([
          { key: 'todos', label: 'Todos os Voluntários' },
          { key: 'fila', label: 'Fila de Alocacao' },
        ] as { key: Tab; label: string }[]).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'todos' ? <TodosList /> : <FilaAlocacao />}
    </div>
  );
}

// ── Aniversariantes da semana (parabenizar por WhatsApp) ─────────────────────
const DOW_LBL = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const BDAY_MSG_KEY = 'cbrio_vol_bday_msg';
const BDAY_MSG_DEFAULT = 'Feliz aniversário, {nome}! 🎉 Que Deus te encha de alegria e bênçãos neste novo ano de vida. Obrigado por servir com a gente no CBRio! 💚';

function waBday(tel?: string | null, msg?: string) {
  if (!tel) return null;
  let d = String(tel).replace(/\D/g, '');
  if (!d) return null;
  if (d.length <= 11) d = '55' + d;
  return `https://wa.me/${d}${msg ? `?text=${encodeURIComponent(msg)}` : ''}`;
}

function AniversariantesSemana() {
  const { data } = useQuery({ queryKey: ['vol', 'aniversariantes'], queryFn: () => voluntariado.aniversariantesSemana() });
  const rows: any[] = Array.isArray((data as any)?.rows) ? (data as any).rows : [];
  const [msg, setMsg] = useState<string>(() => {
    try { return localStorage.getItem(BDAY_MSG_KEY) || BDAY_MSG_DEFAULT; } catch { return BDAY_MSG_DEFAULT; }
  });
  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState(msg);

  const mensagemPara = (nome: string) => {
    const primeiro = (nome || '').trim().split(/\s+/)[0] || nome;
    return msg.replace(/\{nome\}/g, primeiro);
  };

  return (
    <Card className="border-[#00B39D]/30">
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <Cake className="h-4 w-4 text-[#00B39D]" />
            <h3 className="font-semibold text-sm">Aniversariantes da semana</h3>
            <Badge variant="secondary">{rows.length}</Badge>
          </div>
          <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs" onClick={() => { setDraft(msg); setEditOpen(true); }}>
            <Pencil className="h-3.5 w-3.5" /> Editar mensagem
          </Button>
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum aniversariante nos próximos 7 dias.</p>
        ) : (
          <div className="space-y-1.5">
            {rows.map((r) => {
              const wa = waBday(r.telefone, mensagemPara(r.nome));
              const dataFmt = r.aniversario ? new Date(r.aniversario + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '';
              return (
                <div key={r.vol_profile_id} className="flex items-center gap-3 rounded-lg border px-3 py-2">
                  <div className="h-9 w-9 rounded-full bg-[#00B39D]/10 flex items-center justify-center shrink-0">
                    <Cake className="h-4 w-4 text-[#00B39D]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{r.nome}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.hoje ? <span className="text-[#00B39D] font-semibold">Hoje 🎉</span> : `${DOW_LBL[r.dow] ?? ''} · ${dataFmt}`}
                    </p>
                  </div>
                  {wa ? (
                    <Link to={hrefConversa(r.telefone, mensagemPara(r.nome))}>
                      <Button size="sm" className="h-8 gap-1.5 bg-[#25D366] hover:bg-[#25D366]/85 text-white">
                        <MessageCircle className="h-3.5 w-3.5" /> Parabenizar
                      </Button>
                    </Link>
                  ) : (
                    <span className="text-xs text-muted-foreground">sem telefone</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Mensagem de aniversário</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Use <code className="bg-muted px-1 rounded">{'{nome}'}</code> pra inserir o primeiro nome da pessoa.</p>
            <Textarea rows={4} value={draft} onChange={e => setDraft(e.target.value)} />
            <p className="text-[11px] text-muted-foreground">Prévia: {draft.replace(/\{nome\}/g, 'Maria')}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button onClick={() => { setMsg(draft); try { localStorage.setItem(BDAY_MSG_KEY, draft); } catch { /* ignore */ } setEditOpen(false); toast.success('Mensagem salva.'); }}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ── Lista principal ──────────────────────────────────────────────────────────
function TodosList() {
  const { data: pool = [], isLoading } = useVolunteersPool(true); // inclui arquivados p/ o card/filtro
  const sync = useSyncPlanningCenter();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [teamFilter, setTeamFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ full_name: '', email: '', phone: '', cpf: '' });
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [gerenciar, setGerenciar] = useState<any | null>(null);
  const [addTeam, setAddTeam] = useState('');
  const { data: teamsManaged = [] } = useVolTeamsManaged();
  const allocate = useAllocateVolunteer();
  const removeMember = useMutation({
    mutationFn: (tmId: string) => voluntariado.teamMembers.remove(tmId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['vol', 'volunteers-pool'] }),
    onError: (err: any) => toast.error(err.message || 'Erro ao remover da equipe'),
  });

  const createVol = useMutation({
    mutationFn: (data: typeof addForm) => voluntariado.profiles.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vol', 'volunteers-pool'] });
      toast.success('Voluntário adicionado com sucesso');
      setShowAdd(false);
      setAddForm({ full_name: '', email: '', phone: '', cpf: '' });
    },
    onError: (err: any) => toast.error(err.message || 'Erro ao adicionar voluntário'),
  });

  const allTeams = useMemo(() => {
    const map = new Map<string, { id: string; name: string; color?: string }>();
    for (const vol of pool as any[]) {
      for (const tm of vol.team_members || []) {
        if (tm.team) map.set(tm.team.id, tm.team);
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [pool]);

  // Ativos = roster atual do PCO + internos. Arquivados = saíram do PCO (reconciliação).
  const ativos = useMemo(() => (pool as any[]).filter(v => !v.arquivado), [pool]);
  const arquivados = useMemo(() => (pool as any[]).filter(v => v.arquivado), [pool]);

  const filtered = useMemo(() => {
    // O filtro "arquivados" mostra os que saíram do PCO; os demais operam sobre os ativos.
    let list = sourceFilter === 'arquivados' ? arquivados : ativos;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(v =>
        v.full_name.toLowerCase().includes(q) ||
        v.email?.toLowerCase().includes(q) ||
        v.cpf?.includes(q)
      );
    }
    if (teamFilter === 'none') {
      list = list.filter(v => !((v.team_members || []).length));
    } else if (teamFilter !== 'all') {
      list = list.filter(v =>
        (v.team_members || []).some((tm: any) => tm.team_id === teamFilter)
      );
    }
    if (sourceFilter === 'pc') list = list.filter(v => !!v.planning_center_id);
    else if (sourceFilter === 'sistema') list = list.filter(v => !v.planning_center_id);
    return list;
  }, [ativos, arquivados, search, teamFilter, sourceFilter]);

  const { pageItems: filteredPag, paginacaoProps: volPagProps } = usePaginacaoLocal(filtered, 25);

  const handleSync = () => {
    toast.info('Sincronizando com o Planning Center… pode levar até 1 minuto.');
    sync.mutate(undefined, {
      onSuccess: (data: any) => {
        queryClient.invalidateQueries({ queryKey: ['vol', 'volunteers-pool'] });
        if (data.dbError) {
          toast.error(`Erro no banco: ${data.dbError}`);
        } else {
          const rec = data.reconciliacao;
          const recMsg = rec && !rec.skipped && (rec.arquivados || rec.desarquivados)
            ? ` · ${rec.arquivados} arquivado(s), ${rec.desarquivados} reativado(s)` : '';
          toast.success(`Sincronizado: ${data.volunteersSynced ?? 0} voluntarios, ${data.services ?? 0} cultos, ${data.newSchedules ?? 0} escalas${recMsg}`);
        }
      },
      onError: (err: any) => toast.error(err.message || 'Erro ao sincronizar'),
    });
  };

  // vol "vivo" (reflete add/remove após o refetch do pool)
  const gvol = gerenciar ? ((pool as any[]).find(v => v.id === gerenciar.id) || gerenciar) : null;

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Voluntários</h1>
          <p className="text-sm text-muted-foreground">
            {ativos.length} voluntario(s) ativo(s)
            {arquivados.length > 0 && ` · ${arquivados.length} arquivado(s) (saíram do PCO)`}
          </p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button size="sm" className="gap-2 flex-1 sm:flex-none bg-[#00B39D] hover:bg-[#00B39D]/80" onClick={() => setShowAdd(true)}>
            <UserPlus className="h-4 w-4" /> Adicionar
          </Button>
          <Button size="sm" variant="outline" className="gap-2 flex-1 sm:flex-none" onClick={handleSync} disabled={sync.isPending}>
            {sync.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Sincronizar
          </Button>
        </div>
      </div>

      <AniversariantesSemana />

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome, e-mail ou CPF..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={teamFilter} onValueChange={setTeamFilter}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Equipe" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas equipes</SelectItem>
            <SelectItem value="none">Sem equipe atribuída</SelectItem>
            {allTeams.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Origem" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas origens</SelectItem>
            <SelectItem value="pc">Planning Center</SelectItem>
            <SelectItem value="sistema">Cadastro interno</SelectItem>
            {arquivados.length > 0 && <SelectItem value="arquivados">Arquivados (saíram do PCO)</SelectItem>}
          </SelectContent>
        </Select>
      </div>

      <div className={`grid gap-3 ${arquivados.length > 0 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'}`}>
        <Card><CardContent className="p-3 text-center"><p className="text-xl font-bold">{ativos.length}</p><p className="text-xs text-muted-foreground">Total ativos</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><p className="text-xl font-bold text-blue-600">{ativos.filter(v => v.planning_center_id).length}</p><p className="text-xs text-muted-foreground">Planning Center</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><p className="text-xl font-bold text-[#00B39D]">{ativos.filter(v => !v.planning_center_id).length}</p><p className="text-xs text-muted-foreground">Internos</p></CardContent></Card>
        {arquivados.length > 0 && (
          <Card><CardContent className="p-3 text-center"><p className="text-xl font-bold text-muted-foreground">{arquivados.length}</p><p className="text-xs text-muted-foreground">Arquivados</p></CardContent></Card>
        )}
      </div>

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
            {pool.length === 0 && <p className="text-sm text-muted-foreground/60 mt-1">Clique em Sincronizar para importar do Planning Center</p>}
          </CardContent>
        </Card>
      ) : (
        <>
        <div className="space-y-1.5">
          {filteredPag.map((vol: any) => {
            const teamsOf = (vol.team_members || []) as any[];
            const hasPc = !!vol.planning_center_id;
            return (
              <div key={vol.id} onClick={() => setDetalheId(vol.id)} className="flex items-center gap-3 px-4 py-3 rounded-lg border bg-card hover:bg-accent/40 transition-colors cursor-pointer">
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-sm font-semibold shrink-0 overflow-hidden">
                  {vol.avatar_url ? <img data-foto-avatar="" src={vol.avatar_url} alt={vol.full_name} className="h-full w-full object-cover" /> : vol.full_name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium truncate">{vol.full_name}</p>
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${hasPc ? 'border-blue-200 text-blue-700 dark:text-blue-300' : 'border-[#00B39D]/30 text-[#00B39D]'}`}>
                      {hasPc ? 'Planning Center' : 'Interno'}
                    </Badge>
                    {vol.qr_code && <QrCode className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {teamsOf.length > 0
                      ? teamsOf.map((tm: any) => (
                          <span key={tm.id} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                            {tm.team?.color && <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: tm.team.color }} />}
                            {tm.team?.name}{tm.position ? ` · ${tm.position.name}` : ''}
                          </span>
                        ))
                      : <span className="text-[10px] text-muted-foreground/50">Sem equipe atribuída</span>
                    }
                  </div>
                </div>
                <div className="hidden md:block text-right shrink-0 min-w-0">
                  {vol.email && <p className="text-xs text-muted-foreground truncate max-w-44">{vol.email}</p>}
                  {vol.cpf && <p className="text-xs text-muted-foreground/60">{vol.cpf}</p>}
                </div>
                <Button
                  size="sm" variant="outline"
                  className="h-7 text-xs gap-1 shrink-0"
                  onClick={(e) => { e.stopPropagation(); setGerenciar(vol); }}
                >
                  <Users className="h-3 w-3" /> {teamsOf.length ? 'Equipe' : 'Atribuir'}
                </Button>
              </div>
            );
          })}
        </div>
        <Paginacao {...volPagProps} itemLabel="voluntários" />
        </>
      )}

      {/* Modal: adicionar voluntário manualmente */}
      <Dialog open={showAdd} onOpenChange={open => { if (!open) { setShowAdd(false); setAddForm({ full_name: '', email: '', phone: '', cpf: '' }); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Adicionar Voluntário</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <div>
              <Label>Nome completo *</Label>
              <Input className="mt-1" placeholder="Nome e sobrenome" value={addForm.full_name} onChange={e => setAddForm(f => ({ ...f, full_name: e.target.value }))} />
            </div>
            <div>
              <Label>E-mail</Label>
              <Input className="mt-1" type="email" placeholder="email@exemplo.com" value={addForm.email} onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <Label>Telefone</Label>
              <Input className="mt-1" placeholder="(21) 99999-9999" value={addForm.phone} onChange={e => setAddForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
            <div>
              <Label>CPF</Label>
              <Input className="mt-1" placeholder="000.000.000-00" value={addForm.cpf} onChange={e => setAddForm(f => ({ ...f, cpf: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancelar</Button>
            <Button
              className="bg-[#00B39D] hover:bg-[#00B39D]/80"
              disabled={!addForm.full_name.trim() || createVol.isPending}
              onClick={() => createVol.mutate(addForm)}
            >
              {createVol.isPending ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Gerenciar equipes do voluntário (atribuir / trocar / remover) */}
      <Dialog open={!!gerenciar} onOpenChange={o => { if (!o) { setGerenciar(null); setAddTeam(''); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="truncate">Equipes de {gvol?.full_name}</DialogTitle>
          </DialogHeader>
          <div className="py-1 space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground">Equipes atuais</Label>
              {(gvol?.team_members || []).length ? (
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {(gvol.team_members as any[]).map(tm => (
                    <span key={tm.id} className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full bg-muted">
                      {tm.team?.color && <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: tm.team.color }} />}
                      {tm.team?.name}{tm.position ? ` · ${tm.position.name}` : ''}
                      <button onClick={() => removeMember.mutate(tm.id)} disabled={removeMember.isPending}
                        className="text-muted-foreground hover:text-red-600" title="Remover desta equipe"><X className="h-3 w-3" /></button>
                    </span>
                  ))}
                </div>
              ) : <p className="text-xs text-muted-foreground mt-1.5">Sem equipe atribuída.</p>}
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Adicionar equipe</Label>
              <div className="flex gap-2 mt-1.5">
                <Select value={addTeam} onValueChange={setAddTeam}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="Escolher equipe" /></SelectTrigger>
                  <SelectContent>
                    {(teamsManaged as any[]).filter(t => t.is_active && !((gvol?.team_members || []).some((tm: any) => tm.team_id === t.id))).map(t => (
                      <SelectItem key={t.id} value={t.id}>
                        <span className="flex items-center gap-2">
                          {t.color && <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: t.color }} />}
                          {t.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button className="bg-[#00B39D] hover:bg-[#00B39D]/80" disabled={!addTeam || allocate.isPending}
                  onClick={() => allocate.mutate({ id: gvol.id, team_id: addTeam }, {
                    onSuccess: () => { toast.success('Equipe atribuída'); setAddTeam(''); },
                    onError: (e: any) => toast.error(e.message || 'Erro ao atribuir'),
                  })}>
                  {allocate.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : 'Adicionar'}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1.5">Pra trocar de equipe, remova a atual (×) e adicione a nova.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setGerenciar(null); setAddTeam(''); }}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <VolDetalheDialog id={detalheId} onClose={() => setDetalheId(null)} />
    </>
  );
}

// ── Fila de Alocação ─────────────────────────────────────────────────────────
function FilaAlocacao() {
  const { data: queue = [], isLoading } = useWaitingAllocation();
  const { data: teams = [] } = useVolTeamsManaged();
  const allocate = useAllocateVolunteer();
  const [allocating, setAllocating] = useState<any | null>(null);
  const [selectedTeam, setSelectedTeam] = useState('');

  const handleAllocate = () => {
    if (!allocating || !selectedTeam) return;
    allocate.mutate({ id: allocating.id, team_id: selectedTeam }, {
      onSuccess: () => {
        toast.success(`${allocating.full_name} alocado para equipe`);
        setAllocating(null);
        setSelectedTeam('');
      },
      onError: (err: any) => toast.error(err.message || 'Erro ao alocar'),
    });
  };

  return (
    <>
      <div>
        <h1 className="text-xl font-bold text-foreground">Fila de Alocacao</h1>
        <p className="text-sm text-muted-foreground">
          {queue.length} voluntario(s) aguardando designacao de equipe
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : queue.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <CheckCircle2 className="h-10 w-10 text-[#00B39D]/50 mb-3" />
            <p className="font-medium text-muted-foreground">Nenhum voluntário aguardando alocacao</p>
            <p className="text-sm text-muted-foreground/60 mt-1">Quando um membro indicar que quer servir, aparecerá aqui</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {(queue as any[]).map(vol => (
            <div key={vol.id} className="flex items-center gap-3 px-4 py-3 rounded-lg border bg-card">
              <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium">{vol.full_name}</p>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-300 text-amber-700 dark:text-amber-300">
                    Aguardando alocacao
                  </Badge>
                  {vol.origem === 'membresia' && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-[#00B39D]/30 text-[#00B39D]">
                      Membro
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  {vol.cpf && <p className="text-xs text-muted-foreground/60">CPF: {vol.cpf}</p>}
                  {vol.email && <p className="text-xs text-muted-foreground truncate">{vol.email}</p>}
                  <p className="text-xs text-muted-foreground/50">
                    Desde {new Date(vol.created_at).toLocaleDateString('pt-BR')}
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                className="bg-[#00B39D] hover:bg-[#00B39D]/80 gap-1.5 shrink-0"
                onClick={() => { setAllocating(vol); setSelectedTeam(''); }}
              >
                <UserCheck className="h-3.5 w-3.5" /> Alocar
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Allocate dialog */}
      {allocating && (
        <Dialog open onOpenChange={() => { setAllocating(null); setSelectedTeam(''); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Alocar Voluntário</DialogTitle>
            </DialogHeader>
            <div className="py-3 space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-sm font-semibold">
                  {allocating.full_name.charAt(0)}
                </div>
                <div>
                  <p className="text-sm font-medium">{allocating.full_name}</p>
                  {allocating.cpf && <p className="text-xs text-muted-foreground">{allocating.cpf}</p>}
                </div>
              </div>
              <div>
                <Label>Equipe *</Label>
                <Select value={selectedTeam} onValueChange={setSelectedTeam}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione a equipe" /></SelectTrigger>
                  <SelectContent>
                    {(teams as any[]).filter(t => t.is_active).map(t => (
                      <SelectItem key={t.id} value={t.id}>
                        <span className="flex items-center gap-2">
                          {t.color && <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: t.color }} />}
                          {t.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAllocating(null)}>Cancelar</Button>
              <Button
                className="bg-[#00B39D] hover:bg-[#00B39D]/80"
                onClick={handleAllocate}
                disabled={!selectedTeam || allocate.isPending}
              >
                {allocate.isPending ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : null}
                Confirmar Alocacao
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
