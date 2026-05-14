import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { integracao as intApi, voluntariado as volApi } from '../../api';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/tabs';

const Batismos = lazy(() => import('./Batismos'));
const VisualizacaoFrequencia = lazy(() => import('./VisualizacaoFrequencia'));
const VisualizacaoDecisoes   = lazy(() => import('./VisualizacaoDecisoes'));
import CalendarioCultos from '../../components/CalendarioCultos';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { StatisticsCard } from '../../components/ui/statistics-card';
import {
  Search, Loader2, Calendar, ChevronRight, CheckCircle2, Heart, Clock, Plus,
  MessageCircle, ChevronLeft,
} from 'lucide-react';
import { toast } from 'sonner';

const C = { primary: '#00B39D', info: '#3b82f6', warn: '#f59e0b', purple: '#8b5cf6', pink: '#ef476f', gray: '#737373' };

export default function Integracao() {
  const [tab, setTab] = useState('frequencia');
  const [dashboard, setDashboard] = useState<any>(null);
  const [loadingDash, setLoadingDash] = useState(true);

  const reloadDashboard = useCallback(async () => {
    setLoadingDash(true);
    try { setDashboard(await intApi.dashboard()); } catch { /* noop */ } finally { setLoadingDash(false); }
  }, []);

  useEffect(() => { reloadDashboard(); }, [reloadDashboard]);

  // Permitir abrir aba via querystring (?tab=batismos)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('tab');
    if (t && ['pendentes', '1x1', 'batismos', 'frequencia', 'vis_frequencia', 'vis_decisoes'].includes(t)) setTab(t);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Integração</h1>
          <p className="text-sm text-muted-foreground">Acompanhamento de cultos, decisões e batismos</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <button onClick={() => setTab('frequencia')} className="text-left hover:scale-[1.02] transition-transform">
          <StatisticsCard
            title="Cultos · registrar"
            value="Abrir"
            icon={Calendar}
            iconColor={C.purple}
          />
        </button>
        <button onClick={() => setTab('frequencia')} className="text-left hover:scale-[1.02] transition-transform">
          <StatisticsCard
            title="Decisões · registrar"
            value={loadingDash ? '…' : String(dashboard?.total_decisoes ?? 0)}
            icon={Heart}
            iconColor={C.pink}
          />
        </button>
        <button onClick={() => setTab('batismos')} className="text-left hover:scale-[1.02] transition-transform">
          <StatisticsCard
            title="Batismos · registrar"
            value={loadingDash ? '…' : String(dashboard?.total_batismos ?? '—')}
            icon={CheckCircle2}
            iconColor={C.primary}
          />
        </button>
        <button onClick={() => setTab('1x1')} className="text-left hover:scale-[1.02] transition-transform">
          <StatisticsCard
            title="Contatos hoje"
            value={loadingDash ? '…' : String(dashboard?.acompanhamentos_hoje ?? 0)}
            icon={Clock}
            iconColor={C.warn}
          />
        </button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="frequencia">Cultos</TabsTrigger>
          <TabsTrigger value="vis_frequencia">Frequência</TabsTrigger>
          <TabsTrigger value="vis_decisoes">Decisões</TabsTrigger>
          <TabsTrigger value="pendentes">Pendentes</TabsTrigger>
          <TabsTrigger value="1x1">Encontros 1x1</TabsTrigger>
          <TabsTrigger value="batismos">Batismos</TabsTrigger>
        </TabsList>

        <TabsContent value="frequencia" className="mt-4">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Clique num culto pra preencher os dados daquele culto: presencial (adultos/kids),
              decisões e transmissão online. Cada culto é vinculado ao seu tipo (Domingo 08:30 /
              10:00 / 11:30 / 19:00 · AMI · Bridge · Quarta com Deus) · relatórios saem por culto
              automaticamente.
            </p>
            <CalendarioCultos />
          </div>
        </TabsContent>
        <TabsContent value="vis_frequencia" className="mt-4">
          <Suspense fallback={<div className="flex items-center justify-center py-12 text-sm text-muted-foreground">Carregando…</div>}>
            <VisualizacaoFrequencia />
          </Suspense>
        </TabsContent>
        <TabsContent value="vis_decisoes" className="mt-4">
          <Suspense fallback={<div className="flex items-center justify-center py-12 text-sm text-muted-foreground">Carregando…</div>}>
            <VisualizacaoDecisoes />
          </Suspense>
        </TabsContent>
        <TabsContent value="pendentes" className="mt-4">
          <TabPendentes />
        </TabsContent>
        <TabsContent value="1x1" className="mt-4">
          <TabEncontros1x1 />
        </TabsContent>
        <TabsContent value="batismos" className="mt-4">
          <Suspense fallback={<div className="flex items-center justify-center py-12 text-sm text-muted-foreground">Carregando…</div>}>
            <Batismos />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TabPendentes() {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    intApi.acompanhamentos.pendentes()
      .then((d: any) => setList(d || []))
      .catch((e: any) => toast.error(e.message || 'Erro'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  );
  if (list.length === 0) return (
    <div className="rounded-lg border bg-card py-16 text-center">
      <CheckCircle2 className="h-10 w-10 text-[#00B39D]/50 mx-auto mb-3" />
      <p className="font-medium text-muted-foreground">Sem contatos pendentes</p>
      <p className="text-sm text-muted-foreground/60 mt-1">Quando agendar um próximo contato, ele aparecerá aqui.</p>
    </div>
  );
  return (
    <div className="rounded-lg border bg-card divide-y">
      {list.map(a => (
        <div key={a.id} className="px-4 py-3 flex items-center gap-3">
          <Clock className="h-4 w-4 text-amber-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">{a.visitante?.nome || '—'}</p>
            <p className="text-xs text-muted-foreground">
              {a.proximo_passo || a.tipo}
              {' · '}
              {a.data_proximo_contato && new Date(a.data_proximo_contato + 'T00:00:00').toLocaleDateString('pt-BR')}
            </p>
          </div>
          {a.voluntario && (
            <span className="text-xs text-muted-foreground hidden sm:inline">{a.voluntario.full_name}</span>
          )}
        </div>
      ))}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// TAB: Encontros 1x1 mensais
// ──────────────────────────────────────────────────────────────────────────
type Member1x1 = {
  id: string;
  volunteer_profile_id: string;
  volunteer_name: string;
  position?: { name: string } | null;
  profile?: { full_name: string; email?: string; phone?: string; allocation_status?: string } | null;
  meeting_1x1?: { id: string; meeting_date: string; observacoes?: string | null } | null;
};

function ymCurrent() {
  return new Date().toISOString().slice(0, 7);
}

function ymShift(ym: string, delta: number) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

function ymLabel(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

function TabEncontros1x1() {
  const [yearMonth, setYearMonth] = useState(ymCurrent());
  const [teamId, setTeamId] = useState<string | null>(null);
  const [members, setMembers] = useState<Member1x1[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [obsModalFor, setObsModalFor] = useState<Member1x1 | null>(null);
  const [obs, setObs] = useState('');

  // Descobre o teamId da Integracao na primeira carga
  useEffect(() => {
    (async () => {
      try {
        const teams = await volApi.teamsManage.list();
        const t = (Array.isArray(teams) ? teams : []).find((x: any) =>
          (x.name || '').toLowerCase().includes('integ')
        );
        if (t) setTeamId(t.id);
        else toast.error('Equipe Integracao nao encontrada. Cadastre em Voluntariado > Equipes.');
      } catch (e: any) {
        toast.error(e?.message || 'Erro ao buscar equipes');
      }
    })();
  }, []);

  const load = useCallback(async () => {
    if (!teamId) return;
    setLoading(true);
    try {
      const data = await volApi.teamMembers(teamId, yearMonth);
      setMembers(data?.members || []);
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao carregar voluntarios');
    }
    setLoading(false);
  }, [teamId, yearMonth]);

  useEffect(() => { load(); }, [load]);

  const handleToggle = async (m: Member1x1) => {
    try {
      if (m.meeting_1x1) {
        await volApi.oneOnOne.remove(m.meeting_1x1.id);
        toast.success('1x1 desmarcado');
      } else {
        await volApi.oneOnOne.create({
          volunteer_profile_id: m.volunteer_profile_id,
          team_id: teamId,
          meeting_date: `${yearMonth}-${String(new Date().getDate()).padStart(2, '0')}`,
        });
        toast.success('1x1 marcado!');
      }
      await load();
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao salvar');
    }
  };

  const handleSaveObs = async () => {
    if (!obsModalFor) return;
    try {
      const date = obsModalFor.meeting_1x1?.meeting_date
        || `${yearMonth}-${String(new Date().getDate()).padStart(2, '0')}`;
      await volApi.oneOnOne.create({
        volunteer_profile_id: obsModalFor.volunteer_profile_id,
        team_id: teamId,
        meeting_date: date,
        observacoes: obs.trim() || null,
      });
      toast.success('Observacoes salvas');
      setObsModalFor(null);
      setObs('');
      await load();
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao salvar');
    }
  };

  const filtered = members.filter(m => {
    const name = (m.volunteer_name || m.profile?.full_name || '').toLowerCase();
    return !search || name.includes(search.toLowerCase());
  });

  const total = members.length;
  const comReuniao = members.filter(m => m.meeting_1x1).length;
  const pct = total > 0 ? Math.round((comReuniao / total) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Header com seletor de mes + KPI */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setYearMonth(ymShift(yearMonth, -1))} className="gap-1.5">
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="font-semibold text-foreground capitalize px-2">{ymLabel(yearMonth)}</span>
          <Button size="sm" variant="outline" onClick={() => setYearMonth(ymShift(yearMonth, 1))} className="gap-1.5">
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
          {yearMonth !== ymCurrent() && (
            <Button size="sm" variant="ghost" onClick={() => setYearMonth(ymCurrent())} className="text-xs">
              Hoje
            </Button>
          )}
        </div>
        <div className="flex items-center gap-3 rounded-xl bg-muted/30 border border-border px-4 py-2">
          <div>
            <p className="text-xs text-muted-foreground">% com 1x1 no mes</p>
            <p className="text-xl font-bold tabular-nums" style={{ color: pct >= 90 ? C.primary : pct >= 70 ? C.warn : '#ef4444' }}>
              {pct}%
            </p>
          </div>
          <div className="text-xs text-muted-foreground border-l border-border pl-3">
            <p><strong>{comReuniao}</strong> de <strong>{total}</strong></p>
            <p className="text-[10px]">voluntarios</p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar voluntario..." className="pl-9" />
      </div>

      {/* Tabela */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !teamId ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
          Aguardando carregar a equipe Integracao...
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
          Nenhum voluntario na equipe Integracao{search ? ' com esse nome' : ''}.
        </div>
      ) : (
        <div className="rounded-2xl border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Voluntario</TableHead>
                <TableHead className="hidden sm:table-cell">Posicao</TableHead>
                <TableHead className="hidden md:table-cell">Contato</TableHead>
                <TableHead className="text-center">1x1 do mes</TableHead>
                <TableHead className="text-right">Acoes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(m => {
                const name = m.volunteer_name || m.profile?.full_name || '—';
                const hasMeeting = !!m.meeting_1x1;
                return (
                  <TableRow key={m.id}>
                    <TableCell>
                      <p className="font-medium text-foreground">{name}</p>
                      {m.profile?.allocation_status && (
                        <p className="text-[10px] text-muted-foreground uppercase">{m.profile.allocation_status}</p>
                      )}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                      {m.position?.name || '—'}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                      {m.profile?.email && <p>{m.profile.email}</p>}
                      {m.profile?.phone && <p>{m.profile.phone}</p>}
                    </TableCell>
                    <TableCell className="text-center">
                      <button
                        onClick={() => handleToggle(m)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors"
                        style={{
                          background: hasMeeting ? `${C.primary}20` : 'transparent',
                          color: hasMeeting ? C.primary : '#737373',
                          border: `1px solid ${hasMeeting ? C.primary : '#d4d4d4'}`,
                        }}
                      >
                        {hasMeeting ? (
                          <><CheckCircle2 className="h-3.5 w-3.5" /> Feito{' · '}{new Date(m.meeting_1x1!.meeting_date + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</>
                        ) : (
                          <><Plus className="h-3.5 w-3.5" /> Marcar</>
                        )}
                      </button>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setObsModalFor(m);
                          setObs(m.meeting_1x1?.observacoes || '');
                        }}
                        className="text-xs gap-1"
                      >
                        <MessageCircle className="h-3 w-3" />
                        {m.meeting_1x1?.observacoes ? 'Ver/editar' : 'Anotar'}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Modal observacoes */}
      <Dialog open={!!obsModalFor} onOpenChange={(open) => !open && setObsModalFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              1x1 com {obsModalFor?.volunteer_name || obsModalFor?.profile?.full_name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Observacoes</Label>
              <Textarea
                value={obs}
                onChange={e => setObs(e.target.value)}
                rows={5}
                placeholder="Pontos discutidos, preocupacoes, proximos passos..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setObsModalFor(null)}>Cancelar</Button>
            <Button onClick={handleSaveObs}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
