import { useState, useEffect, useCallback } from 'react';
import { next as nextApi } from '../../api';
import ProcessosTarefas from '../../components/ProcessosTarefas';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/tabs';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover';
import { Calendar as CalendarPicker } from '../../components/ui/calendar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Badge } from '../../components/ui/badge';
import { StatisticsCard } from '../../components/ui/statistics-card';
import { ptBR } from 'date-fns/locale';
import {
  Calendar, Users, CheckCircle2, Clock, Plus, Loader2, Search, ChevronRight,
  Droplets, HandHeart, UsersRound, Wallet, X, AlertCircle, Phone, Mail, Copy,
  Share2, MessageCircle, RefreshCw, FileText, CalendarDays,
} from 'lucide-react';
import QRCode from 'qrcode';
import { kpis as kpisApi } from '../../api';
import { toast } from 'sonner';

const C = { primary: '#00B39D', info: '#3b82f6', warn: '#f59e0b', purple: '#8b5cf6', danger: '#ef4444' };

type Evento = {
  id: string; data: string; titulo?: string; status: string; observacoes?: string;
  inscritos: number; checkins: number;
  total_lista?: number | null;
  presentes_impressa?: number | null;
  presentes_manuscritos?: number | null;
  arquivo_origem?: string | null;
};
type Inscricao = {
  id: string;
  evento_id?: string;
  evento?: { id: string; data: string; titulo?: string };
  nome: string; sobrenome?: string;
  cpf?: string; telefone?: string; email?: string; data_nascimento?: string;
  observacoes?: string;
  origem_lista?: 'impressa' | 'manuscrito' | null;
  ja_batizado?: boolean; ja_voluntario?: boolean; ja_doador?: boolean;
  check_in_at?: string | null;
  indicou_batismo?: boolean; indicou_servir?: boolean; indicou_grupo?: boolean; indicou_dizimo?: boolean;
  indicacao_observacoes?: string;
  created_at: string;
};
type Indicacao = {
  id: string; tipo: string; status: string; area_destino?: string; observacoes?: string;
  inscricao_id: string;
  inscricao?: { id: string; nome: string; sobrenome?: string; email?: string; telefone?: string; evento?: { data: string } };
  created_at: string;
};

export default function Next() {
  const [tab, setTab] = useState('eventos');
  const [dashboard, setDashboard] = useState<any>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [recalcLoading, setRecalcLoading] = useState(false);

  const reload = useCallback(async () => {
    try { setDashboard(await nextApi.dashboard()); } catch {}
  }, []);
  useEffect(() => { reload(); }, [reload]);

  // Permitir abrir tab via querystring (?tab=indicacoes)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('tab');
    if (t && ['eventos', 'inscritos', 'indicacoes'].includes(t)) setTab(t);
  }, []);

  const handleRecalcular = async () => {
    setRecalcLoading(true);
    try {
      const r = await kpisApi.v2.coletarAuto({ fontes: ['next.'] });
      const ok = (r.resultados || []).filter((x: any) => x.status === 'ok').length;
      toast.success(`KPIs do NEXT recalculados (${ok} indicador(es) atualizados)`);
      reload();
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao recalcular');
    }
    setRecalcLoading(false);
  };

  return (
    <div className="space-y-6 p-6 max-w-[1400px] mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">NEXT</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Porta de entrada da CBRio — 3 primeiros domingos do mes
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => setShareOpen(true)} className="gap-2 bg-[#00B39D] hover:bg-[#00B39D]/90 text-white">
            <Share2 className="h-4 w-4" /> Compartilhar inscricao
          </Button>
          <Button variant="outline" onClick={handleRecalcular} disabled={recalcLoading} className="gap-2">
            {recalcLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Recalcular KPIs
          </Button>
        </div>
      </div>

      {shareOpen && <ModalCompartilhar onClose={() => setShareOpen(false)} />}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatisticsCard
          title="Eventos do mes"
          value={String(dashboard?.eventos_mes?.length ?? 0)}
          icon={Calendar}
          iconColor={C.info}
        />
        <StatisticsCard
          title="Inscricoes (mes)"
          value={String(dashboard?.inscricoes_mes ?? 0)}
          icon={Users}
          iconColor={C.primary}
        />
        <StatisticsCard
          title="Check-ins (mes)"
          value={String(dashboard?.checkins_mes ?? 0)}
          icon={CheckCircle2}
          iconColor={C.primary}
        />
        <StatisticsCard
          title="Indicacoes pendentes"
          value={String(dashboard?.indicacoes_pendentes ?? 0)}
          icon={Clock}
          iconColor={C.warn}
        />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="eventos">Eventos</TabsTrigger>
          <TabsTrigger value="inscritos">Inscritos</TabsTrigger>
          <TabsTrigger value="indicacoes">Indicacoes</TabsTrigger>
          <TabsTrigger value="tarefas">Tarefas</TabsTrigger>
        </TabsList>

        <TabsContent value="eventos" className="mt-4">
          <TabEventos onChanged={reload} />
        </TabsContent>
        <TabsContent value="inscritos" className="mt-4">
          <TabInscritos onChanged={reload} />
        </TabsContent>
        <TabsContent value="indicacoes" className="mt-4">
          <TabIndicacoes />
        </TabsContent>
        <TabsContent value="tarefas" className="mt-4">
          <ProcessosTarefas area="NEXT" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// EVENTOS
// ──────────────────────────────────────────────────────────────────────────
function TabEventos({ onChanged }: { onChanged: () => void }) {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoCreating, setAutoCreating] = useState(false);
  const [eventoSelecionado, setEventoSelecionado] = useState<Evento | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setEventos(await nextApi.eventos.list()); } catch {}
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const handleAutoCreate = async () => {
    setAutoCreating(true);
    try {
      const hoje = new Date();
      const r = await nextApi.eventos.autoCreateMes({
        ano: hoje.getFullYear(),
        mes: hoje.getMonth() + 1,
      });
      toast.success(`${r.created} evento(s) criado(s)`);
      await load();
      onChanged();
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao criar eventos');
    }
    setAutoCreating(false);
  };

  const copyInviteLink = () => {
    const url = `${window.location.origin}/next/inscrever`;
    navigator.clipboard.writeText(url);
    toast.success('Link copiado!');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button onClick={handleAutoCreate} disabled={autoCreating} className="gap-2">
          {autoCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calendar className="h-4 w-4" />}
          Gerar eventos do mes (3 domingos)
        </Button>
        <Button variant="outline" onClick={copyInviteLink} className="gap-2">
          <Copy className="h-4 w-4" /> Copiar link de inscricao publica
        </Button>
      </div>

      {loading ? (
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mx-auto my-12" />
      ) : eventos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
          Nenhum evento. Clique em "Gerar eventos do mes".
        </div>
      ) : (
        <div className="rounded-2xl border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-center">Inscritos</TableHead>
                <TableHead className="text-center">Check-ins</TableHead>
                <TableHead className="text-center">% Comparecimento</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {eventos.map(ev => {
                const pct = ev.inscritos > 0 ? Math.round((ev.checkins / ev.inscritos) * 100) : 0;
                return (
                  <TableRow
                    key={ev.id}
                    className="cursor-pointer hover:bg-muted/40 transition-colors"
                    onClick={() => setEventoSelecionado(ev)}
                  >
                    <TableCell>
                      <p className="font-medium">{new Date(ev.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</p>
                      {ev.titulo && <p className="text-xs text-muted-foreground">{ev.titulo}</p>}
                    </TableCell>
                    <TableCell>
                      <Badge variant={ev.status === 'realizado' ? 'default' : 'outline'}>{ev.status}</Badge>
                    </TableCell>
                    <TableCell className="text-center font-semibold">{ev.inscritos}</TableCell>
                    <TableCell className="text-center font-semibold">{ev.checkins}</TableCell>
                    <TableCell className="text-center text-sm">
                      <span style={{ color: pct >= 70 ? C.primary : pct >= 50 ? C.warn : C.danger }}>{pct}%</span>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      <ChevronRight className="h-4 w-4 inline-block" />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {eventoSelecionado && (
        <ModalEventoDetalhe
          evento={eventoSelecionado}
          onClose={() => setEventoSelecionado(null)}
          onChanged={() => { load(); onChanged(); }}
        />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// MODAL DE DETALHE DO EVENTO
// ──────────────────────────────────────────────────────────────────────────
function ModalEventoDetalhe({ evento, onClose, onChanged }: { evento: Evento; onClose: () => void; onChanged: () => void }) {
  const [inscricoes, setInscricoes] = useState<Inscricao[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<'todos' | 'presentes' | 'ausentes'>('todos');
  const [origem, setOrigem] = useState<'todas' | 'impressa' | 'manuscrito'>('todas');
  const [busca, setBusca] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setInscricoes(await nextApi.inscricoes.list({ evento_id: evento.id, limit: 500 }));
    } catch {}
    setLoading(false);
  }, [evento.id]);
  useEffect(() => { load(); }, [load]);

  const handleCheckinToggle = async (insc: Inscricao) => {
    try {
      if (insc.check_in_at) {
        await nextApi.inscricoes.descheckin(insc.id);
        toast.success('Check-in desfeito');
      } else {
        await nextApi.inscricoes.checkin(insc.id);
        toast.success('Check-in marcado');
      }
      await load();
      onChanged();
    } catch (e: any) {
      toast.error(e?.message || 'Erro');
    }
  };

  const filtradas = inscricoes.filter(i => {
    if (filtro === 'presentes' && !i.check_in_at) return false;
    if (filtro === 'ausentes' && i.check_in_at) return false;
    if (origem !== 'todas' && i.origem_lista !== origem) return false;
    if (busca) {
      const q = busca.toLowerCase();
      const hay = `${i.nome} ${i.sobrenome || ''} ${i.telefone || ''} ${i.email || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const presentesCount = inscricoes.filter(i => i.check_in_at).length;
  const ausentesCount = inscricoes.length - presentesCount;
  const pct = inscricoes.length > 0 ? Math.round((presentesCount / inscricoes.length) * 100) : 0;
  const impressaCount = inscricoes.filter(i => i.origem_lista === 'impressa').length;
  const manuscritoCount = inscricoes.filter(i => i.origem_lista === 'manuscrito').length;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" style={{ color: C.primary }} />
            NEXT — {new Date(evento.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 my-3">
          <div className="rounded-xl border border-border p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Inscritos</p>
            <p className="text-2xl font-bold">{inscricoes.length}</p>
            {evento.total_lista != null && evento.total_lista !== inscricoes.length && (
              <p className="text-[10px] text-muted-foreground">planilha: {evento.total_lista}</p>
            )}
          </div>
          <div className="rounded-xl border border-border p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Presentes</p>
            <p className="text-2xl font-bold" style={{ color: C.primary }}>{presentesCount}</p>
            <p className="text-[10px] text-muted-foreground">{ausentesCount} ausentes</p>
          </div>
          <div className="rounded-xl border border-border p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">% Comparecimento</p>
            <p className="text-2xl font-bold" style={{ color: pct >= 70 ? C.primary : pct >= 50 ? C.warn : C.danger }}>{pct}%</p>
          </div>
          <div className="rounded-xl border border-border p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Origem</p>
            <div className="text-xs space-y-0.5 mt-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Impressa</span><span className="font-semibold">{impressaCount}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Manuscrito</span><span className="font-semibold">{manuscritoCount}</span></div>
            </div>
          </div>
        </div>

        {evento.observacoes && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/40 dark:bg-amber-950/20 dark:border-amber-900/40 p-3 flex gap-2 text-xs">
            <FileText className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
            <div>
              <p className="font-medium text-amber-900 dark:text-amber-200 mb-0.5">Observacao do dia</p>
              <p className="text-amber-800 dark:text-amber-300/80">{evento.observacoes}</p>
              {evento.arquivo_origem && <p className="text-[10px] text-amber-700/70 dark:text-amber-400/60 mt-1">Origem: {evento.arquivo_origem}</p>}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2 items-center pt-2 pb-3 border-b border-border">
          <div className="inline-flex rounded-xl border border-border p-0.5 bg-muted/30">
            {(['todos', 'presentes', 'ausentes'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFiltro(f)}
                className={`px-3 py-1 text-xs rounded-lg transition-colors ${filtro === f ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {f === 'todos' ? `Todos (${inscricoes.length})` : f === 'presentes' ? `Presentes (${presentesCount})` : `Ausentes (${ausentesCount})`}
              </button>
            ))}
          </div>
          <div className="inline-flex rounded-xl border border-border p-0.5 bg-muted/30">
            {(['todas', 'impressa', 'manuscrito'] as const).map(o => (
              <button
                key={o}
                onClick={() => setOrigem(o)}
                className={`px-3 py-1 text-xs rounded-lg transition-colors ${origem === o ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {o === 'todas' ? 'Todas origens' : o}
              </button>
            ))}
          </div>
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar nome ou telefone" className="pl-8 h-8 text-xs" />
          </div>
        </div>

        {loading ? (
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mx-auto my-12" />
        ) : filtradas.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">Nenhum registro corresponde aos filtros.</p>
        ) : (
          <div className="space-y-1 max-h-[50vh] overflow-y-auto pr-1">
            {filtradas.map(i => (
              <div key={i.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/40 transition-colors">
                <button
                  onClick={() => handleCheckinToggle(i)}
                  className={`shrink-0 h-8 w-8 rounded-full border-2 flex items-center justify-center transition-all ${i.check_in_at ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-border hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'}`}
                  title={i.check_in_at ? 'Desfazer check-in' : 'Marcar check-in'}
                >
                  {i.check_in_at ? <CheckCircle2 className="h-4 w-4" /> : null}
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{i.nome} {i.sobrenome || ''}</p>
                  <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                    {i.telefone && <span className="flex items-center gap-0.5"><Phone className="h-3 w-3" />{i.telefone}</span>}
                    {i.email && <span className="flex items-center gap-0.5"><Mail className="h-3 w-3" />{i.email}</span>}
                  </div>
                </div>
                {i.origem_lista && (
                  <Badge variant="outline" className="text-[9px] uppercase">
                    {i.origem_lista}
                  </Badge>
                )}
              </div>
            ))}
          </div>
        )}

        <DialogFooter className="pt-3">
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// INSCRITOS (com check-in e indicacoes)
// ──────────────────────────────────────────────────────────────────────────
function TabInscritos({ onChanged }: { onChanged: () => void }) {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [eventoFilter, setEventoFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const [list, setList] = useState<Inscricao[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Inscricao | null>(null);
  const [novaOpen, setNovaOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (eventoFilter) params.evento_id = eventoFilter;
      if (search) params.search = search;
      setList(await nextApi.inscricoes.list(params));
    } catch {}
    setLoading(false);
  }, [eventoFilter, search]);

  useEffect(() => { nextApi.eventos.list().then(setEventos).catch(() => {}); }, []);
  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  const handleCheckin = async (inscricao: Inscricao) => {
    try {
      if (inscricao.check_in_at) {
        await nextApi.inscricoes.descheckin(inscricao.id);
        toast.success('Check-in desfeito');
      } else {
        await nextApi.inscricoes.checkin(inscricao.id);
        toast.success('Check-in marcado!');
      }
      await load();
      onChanged();
    } catch (e: any) {
      toast.error(e?.message || 'Erro');
    }
  };

  // Mapa data (yyyy-mm-dd) -> evento, e datas disponíveis como Date objetos
  const eventoPorData = new Map(eventos.map(ev => [ev.data, ev]));
  const eventDates = eventos.map(ev => new Date(ev.data + 'T12:00:00'));
  const eventoAtual = eventoFilter ? eventos.find(e => e.id === eventoFilter) : null;
  const [calOpen, setCalOpen] = useState(false);
  // Mes inicial: ultimo evento (mais recente) ou hoje
  const initialMonth = eventos[0] ? new Date(eventos[0].data + 'T12:00:00') : new Date();
  const [calMonth, setCalMonth] = useState<Date>(initialMonth);

  const handlePickDate = (date: Date | undefined) => {
    if (!date) { setEventoFilter(''); setCalOpen(false); return; }
    const ymd = date.toISOString().slice(0, 10);
    const ev = eventoPorData.get(ymd);
    if (ev) {
      setEventoFilter(ev.id);
      setCalOpen(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Popover open={calOpen} onOpenChange={setCalOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="gap-2 min-w-[220px] justify-start font-normal">
              <CalendarDays className="h-4 w-4" style={{ color: C.primary }} />
              {eventoAtual ? (
                <span>
                  {new Date(eventoAtual.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
              ) : (
                <span className="text-muted-foreground">Todos os eventos</span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <CalendarPicker
              mode="single"
              locale={ptBR}
              month={calMonth}
              onMonthChange={setCalMonth}
              selected={eventoAtual ? new Date(eventoAtual.data + 'T12:00:00') : undefined}
              onSelect={handlePickDate}
              modifiers={{ hasEvent: eventDates }}
              modifiersStyles={{
                hasEvent: {
                  fontWeight: 700,
                  color: C.primary,
                  textDecoration: 'underline',
                  textUnderlineOffset: 4,
                },
              }}
              disabled={(date) => {
                const ymd = date.toISOString().slice(0, 10);
                return !eventoPorData.has(ymd);
              }}
            />
            <div className="border-t border-border p-2 flex items-center justify-between text-xs">
              <span className="text-muted-foreground px-2">{eventos.length} encontro(s)</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setEventoFilter(''); setCalOpen(false); }}
                className="text-xs h-7"
              >
                Limpar filtro
              </Button>
            </div>
          </PopoverContent>
        </Popover>
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar nome, email ou CPF" className="pl-9" />
        </div>
        <Button
          onClick={() => setNovaOpen(true)}
          className="gap-2 bg-[#00B39D] hover:bg-[#00B39D]/90 text-white ml-auto"
        >
          <Plus className="h-4 w-4" /> Cadastrar inscricao
        </Button>
      </div>

      {loading ? (
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mx-auto my-12" />
      ) : list.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
          Nenhuma inscricao encontrada.
        </div>
      ) : (
        <div className="rounded-2xl border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Inscrito</TableHead>
                <TableHead className="hidden md:table-cell">Contato</TableHead>
                <TableHead className="hidden lg:table-cell">Evento</TableHead>
                <TableHead className="text-center">Check-in</TableHead>
                <TableHead className="text-center">Indicacoes</TableHead>
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map(i => {
                const indicCount = [i.indicou_batismo, i.indicou_servir, i.indicou_grupo, i.indicou_dizimo].filter(Boolean).length;
                return (
                  <TableRow key={i.id}>
                    <TableCell>
                      <p className="font-medium text-foreground">{i.nome} {i.sobrenome || ''}</p>
                      {i.ja_batizado || i.ja_voluntario || i.ja_doador ? (
                        <div className="flex gap-1 mt-1">
                          {i.ja_batizado && <Badge variant="outline" className="text-[9px]">batizado</Badge>}
                          {i.ja_voluntario && <Badge variant="outline" className="text-[9px]">voluntario</Badge>}
                          {i.ja_doador && <Badge variant="outline" className="text-[9px]">doador</Badge>}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                      {i.email && <p className="flex items-center gap-1"><Mail className="h-3 w-3" />{i.email}</p>}
                      {i.telefone && <p className="flex items-center gap-1"><Phone className="h-3 w-3" />{i.telefone}</p>}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                      {i.evento ? new Date(i.evento.data + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                    </TableCell>
                    <TableCell className="text-center">
                      <button
                        onClick={() => handleCheckin(i)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors"
                        style={{
                          background: i.check_in_at ? `${C.primary}20` : 'transparent',
                          color: i.check_in_at ? C.primary : '#737373',
                          border: `1px solid ${i.check_in_at ? C.primary : '#d4d4d4'}`,
                        }}
                      >
                        {i.check_in_at ? <><CheckCircle2 className="h-3.5 w-3.5" /> Presente</> : <><Plus className="h-3.5 w-3.5" /> Marcar</>}
                      </button>
                    </TableCell>
                    <TableCell className="text-center">
                      {indicCount > 0 ? (
                        <Badge style={{ background: `${C.purple}20`, color: C.purple }}>{indicCount}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground/50">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => setSelected(i)} className="text-xs gap-1">
                        Ver <ChevronRight className="h-3 w-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {selected && <CardInscrito inscricao={selected} onClose={() => setSelected(null)} onSaved={() => { load(); onChanged(); }} />}

      {novaOpen && (
        <ModalNovaInscricao
          eventos={eventos}
          eventoIdInicial={eventoFilter || undefined}
          onClose={() => setNovaOpen(false)}
          onCreated={() => { load(); onChanged(); }}
        />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Modal de cadastro manual de inscricao (espelha campos do form publico)
// ──────────────────────────────────────────────────────────────────────────
function ModalNovaInscricao({
  eventos, eventoIdInicial, onClose, onCreated,
}: {
  eventos: Evento[];
  eventoIdInicial?: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const soDigitos = (v: string) => (v || '').replace(/\D+/g, '');
  const mascaraCpf = (v: string) => {
    const d = soDigitos(v).slice(0, 11);
    if (d.length <= 3) return d;
    if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
    if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  };
  const mascaraTel = (v: string) => {
    const d = soDigitos(v).slice(0, 11);
    if (d.length <= 2) return d.length ? `(${d}` : '';
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  };
  const cpfValido = (v: string) => {
    const d = soDigitos(v);
    if (d.length !== 11) return false;
    if (/^(\d)\1{10}$/.test(d)) return false;
    const calc = (base: string, fator: number) => {
      let s = 0;
      for (let i = 0; i < base.length; i += 1) s += parseInt(base[i], 10) * (fator - i);
      const r = (s * 10) % 11;
      return r === 10 ? 0 : r;
    };
    return calc(d.slice(0, 9), 10) === parseInt(d[9], 10)
      && calc(d.slice(0, 10), 11) === parseInt(d[10], 10);
  };

  // Evento default: o filtrado, senao o proximo "agendado", senao o primeiro
  const defaultEventoId = eventoIdInicial
    || eventos.find(e => e.status === 'agendado')?.id
    || eventos[0]?.id
    || '';

  const [form, setForm] = useState({
    evento_id: defaultEventoId,
    nome: '', sobrenome: '',
    email: '', telefone: '', cpf: '',
    data_nascimento: '',
    origem_lista: 'impressa' as 'impressa' | 'manuscrito',
    observacoes: '',
  });
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    let v = e.target.value;
    if (k === 'cpf') v = mascaraCpf(v);
    if (k === 'telefone') v = mascaraTel(v);
    setForm(f => ({ ...f, [k]: v }));
    setErro(null);
  };

  const handleSubmit = async () => {
    if (!form.evento_id) return setErro('Selecione um evento');
    if (!form.nome.trim() || form.nome.trim().length < 2) return setErro('Informe o nome');
    if (!form.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return setErro('Email invalido');
    if (!form.telefone || soDigitos(form.telefone).length < 10) return setErro('Telefone invalido');
    if (form.cpf && !cpfValido(form.cpf)) return setErro('CPF invalido');

    setSaving(true);
    try {
      await nextApi.inscricoes.create({
        evento_id: form.evento_id,
        nome: form.nome.trim(),
        sobrenome: form.sobrenome.trim() || null,
        cpf: form.cpf || null,
        telefone: form.telefone,
        email: form.email.toLowerCase().trim(),
        data_nascimento: form.data_nascimento || null,
        observacoes: form.observacoes.trim() || null,
        origem_lista: form.origem_lista,
      });
      toast.success('Inscricao cadastrada!');
      onCreated();
      onClose();
    } catch (e: any) {
      setErro(e?.message || 'Erro ao cadastrar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" style={{ color: C.primary }} />
            Cadastrar inscricao no NEXT
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div>
            <Label className="text-xs">Evento *</Label>
            <select
              value={form.evento_id}
              onChange={set('evento_id')}
              className="w-full mt-1 px-3 py-2 rounded-xl border border-border bg-background text-sm"
            >
              <option value="">— escolha —</option>
              {eventos.map(ev => (
                <option key={ev.id} value={ev.id}>
                  {new Date(ev.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
                  {ev.status === 'agendado' ? ' (agendado)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ni-nome" className="text-xs">Nome *</Label>
              <Input id="ni-nome" value={form.nome} onChange={set('nome')} autoComplete="given-name" />
            </div>
            <div>
              <Label htmlFor="ni-sobrenome" className="text-xs">Sobrenome</Label>
              <Input id="ni-sobrenome" value={form.sobrenome} onChange={set('sobrenome')} autoComplete="family-name" />
            </div>
          </div>

          <div>
            <Label htmlFor="ni-email" className="text-xs">Email *</Label>
            <Input id="ni-email" type="email" value={form.email} onChange={set('email')} autoComplete="email" inputMode="email" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ni-telefone" className="text-xs">Telefone *</Label>
              <Input id="ni-telefone" value={form.telefone} onChange={set('telefone')} placeholder="(00) 00000-0000" inputMode="tel" autoComplete="tel" />
            </div>
            <div>
              <Label htmlFor="ni-cpf" className="text-xs">CPF (opcional)</Label>
              <Input id="ni-cpf" value={form.cpf} onChange={set('cpf')} placeholder="000.000.000-00" inputMode="numeric" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ni-nasc" className="text-xs">Data de nascimento (opcional)</Label>
              <Input id="ni-nasc" type="date" value={form.data_nascimento} onChange={set('data_nascimento')} autoComplete="bday" />
            </div>
            <div>
              <Label className="text-xs">Origem da inscricao</Label>
              <div className="inline-flex rounded-xl border border-border p-0.5 bg-muted/30 mt-1 w-full">
                {(['impressa', 'manuscrito'] as const).map(o => (
                  <button
                    key={o}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, origem_lista: o }))}
                    className={`flex-1 px-3 py-1.5 text-xs rounded-lg transition-colors capitalize ${form.origem_lista === o ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    {o}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <Label htmlFor="ni-obs" className="text-xs">Observacoes (opcional)</Label>
            <Textarea id="ni-obs" value={form.observacoes} onChange={set('observacoes')} rows={2} />
          </div>

          {erro && (
            <div className="rounded-xl border border-red-200 bg-red-50/40 dark:bg-red-950/20 dark:border-red-900/40 p-3 flex gap-2 text-xs text-red-700 dark:text-red-300">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{erro}</span>
            </div>
          )}
        </div>

        <DialogFooter className="pt-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saving} className="gap-2 bg-[#00B39D] hover:bg-[#00B39D]/90 text-white">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Cadastrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Card de inscrito (modal) com indicacoes
// ──────────────────────────────────────────────────────────────────────────
function CardInscrito({ inscricao, onClose, onSaved }: {
  inscricao: Inscricao;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [tipos, setTipos] = useState<Set<string>>(new Set([
    ...(inscricao.indicou_batismo ? ['batismo'] : []),
    ...(inscricao.indicou_servir ? ['servir'] : []),
    ...(inscricao.indicou_grupo ? ['grupo'] : []),
    ...(inscricao.indicou_dizimo ? ['dizimo'] : []),
  ]));
  const [obs, setObs] = useState(inscricao.indicacao_observacoes || '');
  const [saving, setSaving] = useState(false);

  const toggle = (t: string) => {
    const s = new Set(tipos);
    if (s.has(t)) s.delete(t); else s.add(t);
    setTipos(s);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await nextApi.inscricoes.indicacoes(inscricao.id, { tipos: Array.from(tipos), observacoes: obs });
      toast.success('Indicacoes registradas! Areas notificadas.');
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || 'Erro');
    }
    setSaving(false);
  };

  const opcoes = [
    { id: 'batismo', label: 'Quer se batizar', icon: Droplets, color: C.info, area: 'Integracao' },
    { id: 'servir', label: 'Quer servir', icon: HandHeart, color: C.primary, area: 'Voluntariado' },
    { id: 'grupo', label: 'Quer entrar em grupo', icon: UsersRound, color: C.purple, area: 'Grupos' },
    { id: 'dizimo', label: 'Quer comecar a dizimar/ofertar', icon: Wallet, color: C.warn, area: 'Generosidade' },
  ];

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{inscricao.nome} {inscricao.sobrenome || ''}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-xl bg-muted/30 border border-border p-3 text-xs space-y-1">
            {inscricao.email && <p className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-muted-foreground" /> {inscricao.email}</p>}
            {inscricao.telefone && <p className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-muted-foreground" /> {inscricao.telefone}</p>}
            {inscricao.cpf && <p className="text-muted-foreground">CPF: {inscricao.cpf}</p>}
            {inscricao.data_nascimento && <p className="text-muted-foreground">Nasc.: {new Date(inscricao.data_nascimento + 'T12:00:00').toLocaleDateString('pt-BR')}</p>}
          </div>

          {inscricao.observacoes && (
            <div>
              <Label>Observacoes da inscricao</Label>
              <p className="text-sm bg-muted/30 rounded-lg p-2 mt-1">{inscricao.observacoes}</p>
            </div>
          )}

          <div>
            <Label className="mb-2 block">Indicacoes (marcar gera notificacao para a area)</Label>
            <div className="grid grid-cols-1 gap-2">
              {opcoes.map(opt => {
                const Icon = opt.icon;
                const ativo = tipos.has(opt.id);
                return (
                  <button
                    key={opt.id}
                    onClick={() => toggle(opt.id)}
                    className="flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left"
                    style={{
                      borderColor: ativo ? opt.color : 'var(--border)',
                      background: ativo ? `${opt.color}15` : 'transparent',
                    }}
                  >
                    <Icon className="h-5 w-5 shrink-0" style={{ color: opt.color }} />
                    <div className="flex-1">
                      <p className="font-medium text-sm">{opt.label}</p>
                      <p className="text-[10px] text-muted-foreground">notifica: {opt.area}</p>
                    </div>
                    {ativo && <CheckCircle2 className="h-4 w-4" style={{ color: opt.color }} />}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <Label>Anotacoes (opcional)</Label>
            <Textarea value={obs} onChange={e => setObs(e.target.value)} rows={3} placeholder="Contexto, motivo, etc." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar e notificar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// INDICACOES (visao geral)
// ──────────────────────────────────────────────────────────────────────────
function TabIndicacoes() {
  const [list, setList] = useState<Indicacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('pendente');

  const load = useCallback(async () => {
    setLoading(true);
    try { setList(await nextApi.indicacoes.list({ status: statusFilter })); } catch {}
    setLoading(false);
  }, [statusFilter]);
  useEffect(() => { load(); }, [load]);

  const handleStatus = async (id: string, novoStatus: string) => {
    try {
      await nextApi.indicacoes.update(id, { status: novoStatus });
      toast.success('Atualizado');
      load();
    } catch (e: any) {
      toast.error(e?.message || 'Erro');
    }
  };

  const tipoLabel = (t: string) => ({ batismo: 'Batismo', servir: 'Servir', grupo: 'Grupos', dizimo: 'Dizimo' }[t] || t);
  const tipoIcon = (t: string) => ({ batismo: Droplets, servir: HandHeart, grupo: UsersRound, dizimo: Wallet }[t] || AlertCircle);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {['pendente', 'em_andamento', 'concluido'].map(s => (
          <Button
            key={s}
            size="sm"
            variant={statusFilter === s ? 'default' : 'outline'}
            onClick={() => setStatusFilter(s)}
          >
            {s.replace('_', ' ')}
          </Button>
        ))}
      </div>

      {loading ? (
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mx-auto my-12" />
      ) : list.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
          Nenhuma indicacao com status "{statusFilter}".
        </div>
      ) : (
        <div className="rounded-2xl border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>Pessoa</TableHead>
                <TableHead className="hidden md:table-cell">Contato</TableHead>
                <TableHead className="hidden lg:table-cell">Evento</TableHead>
                <TableHead>Area</TableHead>
                <TableHead className="text-right">Acoes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map(i => {
                const Icon = tipoIcon(i.tipo);
                return (
                  <TableRow key={i.id}>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5 text-sm font-medium">
                        <Icon className="h-3.5 w-3.5" />
                        {tipoLabel(i.tipo)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <p className="font-medium">{i.inscricao?.nome} {i.inscricao?.sobrenome || ''}</p>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                      {i.inscricao?.email && <p>{i.inscricao.email}</p>}
                      {i.inscricao?.telefone && <p>{i.inscricao.telefone}</p>}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                      {i.inscricao?.evento?.data && new Date(i.inscricao.evento.data + 'T12:00:00').toLocaleDateString('pt-BR')}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">{i.area_destino || '—'}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {statusFilter === 'pendente' && (
                        <>
                          <Button size="sm" variant="outline" className="text-xs mr-2" onClick={() => handleStatus(i.id, 'em_andamento')}>Iniciar</Button>
                          <Button size="sm" className="text-xs" onClick={() => handleStatus(i.id, 'concluido')}>Concluir</Button>
                        </>
                      )}
                      {statusFilter === 'em_andamento' && (
                        <Button size="sm" className="text-xs" onClick={() => handleStatus(i.id, 'concluido')}>Concluir</Button>
                      )}
                      {statusFilter === 'concluido' && (
                        <Button size="sm" variant="ghost" className="text-xs" onClick={() => handleStatus(i.id, 'pendente')}>Reabrir</Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Modal de compartilhar link de inscricao
// ──────────────────────────────────────────────────────────────────────────
function ModalCompartilhar({ onClose }: { onClose: () => void }) {
  const url = `${window.location.origin}/next/inscrever`;
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const mensagem = `Voce esta convidado(a) para o NEXT da CBRio - a porta de entrada da igreja!\n\nInscreva-se: ${url}`;

  useEffect(() => {
    QRCode.toDataURL(url, { width: 320, margin: 2, color: { dark: '#000000', light: '#ffffff' } })
      .then(setQrDataUrl)
      .catch(() => {});
  }, [url]);

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copiado!');
  };

  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(mensagem)}`;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5" /> Compartilhar inscricao no NEXT
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Link */}
          <div>
            <Label className="text-xs">Link publico</Label>
            <div className="flex gap-2 mt-1">
              <Input value={url} readOnly className="font-mono text-xs" />
              <Button size="sm" variant="outline" onClick={() => copy(url)} className="shrink-0 gap-1.5">
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* QR Code */}
          {qrDataUrl && (
            <div className="text-center">
              <Label className="text-xs block mb-2">QR code</Label>
              <img src={qrDataUrl} alt="QR Code" className="mx-auto rounded-lg border border-border" style={{ width: 220, height: 220 }} />
              <p className="text-[10px] text-muted-foreground mt-2">
                Escaneie com a camera do celular para abrir o formulario
              </p>
            </div>
          )}

          {/* Botoes de compartilhar */}
          <div className="grid grid-cols-2 gap-2">
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
              style={{ background: '#25D366' }}
            >
              <MessageCircle className="h-4 w-4" /> WhatsApp
            </a>
            <Button variant="outline" onClick={() => copy(mensagem)} className="gap-2">
              <Copy className="h-4 w-4" /> Copiar mensagem
            </Button>
          </div>

          <div className="rounded-xl bg-muted/30 border border-border p-3">
            <p className="text-[11px] text-muted-foreground whitespace-pre-line">{mensagem}</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
