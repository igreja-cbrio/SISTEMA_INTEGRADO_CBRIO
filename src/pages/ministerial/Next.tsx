import { useState, useEffect, useCallback } from 'react';
import { next as nextApi } from '../../api';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/tabs';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Badge } from '../../components/ui/badge';
import { StatisticsCard } from '../../components/ui/statistics-card';
import {
  Calendar, Users, CheckCircle2, Clock, Plus, Loader2, Search, ChevronRight,
  Droplets, HandHeart, UsersRound, Wallet, X, AlertCircle, Phone, Mail, Copy,
} from 'lucide-react';
import { toast } from 'sonner';

const C = { primary: '#00B39D', info: '#3b82f6', warn: '#f59e0b', purple: '#8b5cf6', danger: '#ef4444' };

type Evento = { id: string; data: string; titulo?: string; status: string; observacoes?: string; inscritos: number; checkins: number };
type Inscricao = {
  id: string;
  evento_id?: string;
  evento?: { id: string; data: string; titulo?: string };
  nome: string; sobrenome?: string;
  cpf?: string; telefone?: string; email?: string; data_nascimento?: string;
  observacoes?: string;
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

  return (
    <div className="space-y-6 p-6 max-w-[1400px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-foreground">NEXT</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Porta de entrada da CBRio — 3 primeiros domingos do mes
        </p>
      </div>

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
              </TableRow>
            </TableHeader>
            <TableBody>
              {eventos.map(ev => {
                const pct = ev.inscritos > 0 ? Math.round((ev.checkins / ev.inscritos) * 100) : 0;
                return (
                  <TableRow key={ev.id}>
                    <TableCell>
                      <p className="font-medium">{new Date(ev.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })}</p>
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
// INSCRITOS (com check-in e indicacoes)
// ──────────────────────────────────────────────────────────────────────────
function TabInscritos({ onChanged }: { onChanged: () => void }) {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [eventoFilter, setEventoFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const [list, setList] = useState<Inscricao[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Inscricao | null>(null);

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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={eventoFilter}
          onChange={e => setEventoFilter(e.target.value)}
          className="px-3 py-2 rounded-xl border border-border bg-background text-sm"
        >
          <option value="">Todos os eventos</option>
          {eventos.map(ev => (
            <option key={ev.id} value={ev.id}>{new Date(ev.data + 'T12:00:00').toLocaleDateString('pt-BR')} {ev.titulo || ''}</option>
          ))}
        </select>
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar nome, email ou CPF" className="pl-9" />
        </div>
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
    </div>
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
