import { useState, useMemo } from 'react';
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
import Paginacao, { usePaginacaoLocal } from '@/components/Paginacao';
import {
  useVolunteersPool, useSyncPlanningCenter, useWaitingAllocation,
  useAllocateVolunteer, useVolTeamsManaged,
} from './hooks';
import VolDetalheDialog from './VolDetalheDialog';
import MarcadoresJornada from '@/components/MarcadoresJornada';

type Tab = 'todos' | 'fila';

// Vínculo de equipe que VALE. ⚠️ `is_active=false` é vínculo encerrado (o
// /team-members já filtra assim, e o botão de remover do totem Kids marca a
// flag em vez de apagar a linha) — contá-lo faria "tem equipe" mentir. Hoje não
// há nenhum inativo no banco, então isto é guarda contra o dia em que houver.
function equipesDe(vol: any): any[] {
  return ((vol?.team_members || []) as any[]).filter(tm => tm?.is_active !== false);
}

// Card de resumo que também é filtro. `ativo` só pinta a borda — quem decide o
// recorte é o estado do pai, pra não existir uma segunda régua de "o que está
// filtrado" (era o que fazia o card e o seletor discordarem).
function CardFiltro({ valor, rotulo, cor, ativo, onClick }: {
  valor: number; rotulo: string; cor?: string; ativo: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button" onClick={onClick} aria-pressed={ativo}
      className={`rounded-lg border bg-card p-3 text-center transition-colors hover:bg-accent/40 ${
        ativo ? 'border-primary ring-1 ring-primary/30' : ''
      }`}
    >
      <p className={`text-xl font-bold ${cor || ''}`}>{valor}</p>
      <p className="text-xs text-muted-foreground">{rotulo}</p>
    </button>
  );
}

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

  const qc = useQueryClient();
  const [enviandoId, setEnviandoId] = useState<string | null>(null);
  async function parabenizar(r: any) {
    setEnviandoId(r.vol_profile_id);
    try {
      await voluntariado.parabenizar(r.vol_profile_id);
      toast.success(`Parabéns enviado para ${(r.nome || '').split(/\s+/)[0]}! 🎉`);
      qc.invalidateQueries({ queryKey: ['vol', 'aniversariantes'] });
    } catch (e: any) {
      // sem opt-in / sem cadastro / template → abre o WhatsApp pra mandar manual
      toast.error(e?.message || 'Não foi possível enviar pela API. Abrindo o WhatsApp…');
      const wa = waBday(r.telefone, mensagemPara(r.nome));
      if (wa) window.open(wa, '_blank');
    } finally { setEnviandoId(null); }
  }

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
                  {r.parabenizado ? (
                    <Button size="sm" variant="outline" disabled className="h-8 gap-1.5 border-emerald-300 text-emerald-600">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Enviado
                    </Button>
                  ) : wa ? (
                    <Button size="sm" disabled={enviandoId === r.vol_profile_id} onClick={() => parabenizar(r)} className="h-8 gap-1.5 bg-[#25D366] hover:bg-[#25D366]/85 text-white">
                      <MessageCircle className="h-3.5 w-3.5" /> {enviandoId === r.vol_profile_id ? 'Enviando…' : 'Parabenizar'}
                    </Button>
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
      for (const tm of equipesDe(vol)) {
        if (tm.team) map.set(tm.team.id, tm.team);
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [pool]);

  // Ativos = roster atual do PCO + internos. Arquivados = saíram do PCO (reconciliação).
  const ativos = useMemo(() => (pool as any[]).filter(v => !v.arquivado), [pool]);
  const arquivados = useMemo(() => (pool as any[]).filter(v => v.arquivado), [pool]);
  // Fila de trabalho da coordenação. ⚠️ Conta só o que o servidor devolve, e o
  // embed do pool alcança a membership pelo FK do PERFIL — linha "pc-only"
  // (ligada só pelo id do Planning Center) NÃO vinha, e a tela dizia "sem
  // equipe" pra quem TEM equipe: em 26/08 eram 40 exibidos contra 19 reais.
  // As 57 linhas órfãs foram religadas e o sync passou a repontar as futuras
  // (`repontarOrfas` em services/planningCenter.js) — se este número voltar a
  // inchar, é lá que a resposta está, não neste filtro.
  const semEquipe = useMemo(() => ativos.filter(v => !equipesDe(v).length), [ativos]);

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
      list = list.filter(v => !equipesDe(v).length);
    } else if (teamFilter !== 'all') {
      list = list.filter(v =>
        equipesDe(v).some((tm: any) => tm.team_id === teamFilter)
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
          toast.success(`Sincronizado: ${data.volunteersSynced ?? 0} voluntários, ${data.services ?? 0} cultos, ${data.newSchedules ?? 0} escalas${recMsg}`);
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
            {ativos.length} voluntário(s) ativo(s)
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

      {/* ⚠️ Os cards são BOTÕES-FILTRO, não placar (padrão que o /grupos adotou em
          10/06 — "o Marcos não achava as pills"). O filtro "sem equipe" EXISTIA
          desde sempre como 2ª opção do seletor "Equipe" e o Matheus não achou
          (26/08) — é a lição do lápis de 18px: afordância escondida é afordância
          que não existe. O card diz o número e leva ao recorte num toque. */}
      <div className={`grid gap-3 ${arquivados.length > 0 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'}`}>
        <CardFiltro
          valor={ativos.length} rotulo="Total ativos"
          ativo={teamFilter === 'all' && sourceFilter === 'all'}
          onClick={() => { setTeamFilter('all'); setSourceFilter('all'); }}
        />
        <CardFiltro
          valor={ativos.filter(v => v.planning_center_id).length} rotulo="Planning Center" cor="text-blue-600"
          ativo={sourceFilter === 'pc'}
          onClick={() => setSourceFilter(sourceFilter === 'pc' ? 'all' : 'pc')}
        />
        <CardFiltro
          valor={ativos.filter(v => !v.planning_center_id).length} rotulo="Internos" cor="text-[#00B39D]"
          ativo={sourceFilter === 'sistema'}
          onClick={() => setSourceFilter(sourceFilter === 'sistema' ? 'all' : 'sistema')}
        />
        {arquivados.length > 0 && (
          <CardFiltro
            valor={arquivados.length} rotulo="Arquivados" cor="text-muted-foreground"
            ativo={sourceFilter === 'arquivados'}
            onClick={() => setSourceFilter(sourceFilter === 'arquivados' ? 'all' : 'arquivados')}
          />
        )}
      </div>

      {/* Sem equipe: é a fila de trabalho da coordenação ("pra a equipe de
          voluntariado ir alimentando"), então tem card próprio, âmbar (pendência,
          não erro) e só aparece quando há o que fazer. */}
      {semEquipe.length > 0 && (
        <button
          type="button"
          onClick={() => setTeamFilter(teamFilter === 'none' ? 'all' : 'none')}
          className={`w-full text-left rounded-lg border px-4 py-3 transition-colors ${
            teamFilter === 'none'
              ? 'border-amber-500 bg-amber-500/10'
              : 'border-amber-500/40 bg-amber-500/5 hover:bg-amber-500/10'
          }`}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <Users className="h-4 w-4 text-amber-600 shrink-0" />
            <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">
              {semEquipe.length} voluntário(s) ativo(s) sem equipe atribuída
            </span>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/40 text-amber-700 dark:text-amber-400">
              {teamFilter === 'none' ? 'filtrando — toque pra ver todos' : 'toque pra ver quem'}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Sem equipe eles não entram na composição de nenhuma escala. Use o botão
            <strong> Atribuir</strong> na linha da pessoa.
          </p>
        </button>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Users className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="font-medium text-muted-foreground">
              {pool.length === 0 ? 'Nenhum voluntário sincronizado' : 'Nenhum resultado para esse filtro'}
            </p>
            {pool.length === 0 && <p className="text-sm text-muted-foreground/60 mt-1">Clique em Sincronizar para importar do Planning Center</p>}
          </CardContent>
        </Card>
      ) : (
        <>
        <div className="space-y-1.5">
          {filteredPag.map((vol: any) => {
            const teamsOf = equipesDe(vol);
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
                    {/* Marcadores de jornada (Arthur Serpa / Pr. Nélio · 13/08/2026).
                        ⚠️ Perfil sem `membresia_id` fica SEM marcador — não dá pra
                        afirmar nada sobre a jornada de quem o sistema não ligou
                        ao cadastro da pessoa (o import do Planning Center deixou
                        muitos assim). Por isso `mostrarVazio={false}`: aqui um
                        "—" seria lido como "não fez nada". */}
                    <MarcadoresJornada marcadores={vol.marcadores} mostrarVazio={false} />
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
              {equipesDe(gvol).length ? (
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
                    {(teamsManaged as any[]).filter(t => t.is_active && !(equipesDe(gvol).some((tm: any) => tm.team_id === t.id))).map(t => (
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
        <h1 className="text-xl font-bold text-foreground">Fila de Alocação</h1>
        <p className="text-sm text-muted-foreground">
          {queue.length} voluntário(s) aguardando designação de equipe
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
            <p className="font-medium text-muted-foreground">Nenhum voluntário aguardando alocação</p>
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
                    Aguardando alocação
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
