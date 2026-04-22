import { useState, useEffect, useCallback } from 'react';
import { integracao as intApi } from '../../api';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/tabs';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Badge } from '../../components/ui/badge';
import { StatisticsCard } from '../../components/ui/statistics-card';
import {
  UserPlus, Users, Search, Loader2, Phone, Mail, Calendar, ChevronRight,
  CheckCircle2, Heart, TrendingUp, Clock,
} from 'lucide-react';
import { toast } from 'sonner';

const C = { primary: '#00B39D', info: '#3b82f6', warn: '#f59e0b', purple: '#8b5cf6', pink: '#ef476f', gray: '#737373' };

const STATUS_OPTS: { value: string; label: string; color: string }[] = [
  { value: 'novo', label: 'Novo', color: C.info },
  { value: 'primeiro_contato', label: '1º contato', color: C.warn },
  { value: 'acompanhamento', label: 'Acompanhamento', color: C.purple },
  { value: 'discipulado', label: 'Discipulado', color: C.pink },
  { value: 'batizado', label: 'Batizado', color: C.primary },
  { value: 'membro_ativo', label: 'Membro ativo', color: C.primary },
  { value: 'inativo', label: 'Inativo', color: C.gray },
  { value: 'mudou_cidade', label: 'Mudou de cidade', color: C.gray },
];

const ORIGEM_OPTS = [
  { value: 'amigo', label: 'Convidado por amigo' },
  { value: 'redes_sociais', label: 'Redes sociais' },
  { value: 'site', label: 'Site' },
  { value: 'evento', label: 'Evento' },
  { value: 'busca', label: 'Busca / Google Maps' },
  { value: 'outro', label: 'Outro' },
];

function statusMeta(status: string) {
  return STATUS_OPTS.find(s => s.value === status) || { label: status, color: C.gray };
}

function StatusBadge({ status }: { status: string }) {
  const m = statusMeta(status);
  return (
    <Badge
      variant="outline"
      className="text-[10px] px-1.5 py-0 border-0"
      style={{ background: `${m.color}22`, color: m.color }}
    >
      {m.label}
    </Badge>
  );
}

export default function Integracao() {
  const [tab, setTab] = useState('visitantes');
  const [dashboard, setDashboard] = useState<any>(null);
  const [loadingDash, setLoadingDash] = useState(true);

  const reloadDashboard = useCallback(async () => {
    setLoadingDash(true);
    try { setDashboard(await intApi.dashboard()); } catch { /* noop */ } finally { setLoadingDash(false); }
  }, []);

  useEffect(() => { reloadDashboard(); }, [reloadDashboard]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Integração</h1>
          <p className="text-sm text-muted-foreground">Funil de visitante a membro ativo</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatisticsCard
          title="Visitantes (30d)"
          value={loadingDash ? '…' : String(dashboard?.visitantes_ultimos_30 ?? 0)}
          icon={Users}
          iconColor={C.info}
        />
        <StatisticsCard
          title="Decisões"
          value={loadingDash ? '…' : String(dashboard?.total_decisoes ?? 0)}
          icon={Heart}
          iconColor={C.pink}
        />
        <StatisticsCard
          title="Em acompanhamento"
          value={loadingDash ? '…' : String(dashboard?.por_status?.acompanhamento ?? 0)}
          icon={TrendingUp}
          iconColor={C.purple}
        />
        <StatisticsCard
          title="Contatos hoje"
          value={loadingDash ? '…' : String(dashboard?.acompanhamentos_hoje ?? 0)}
          icon={Clock}
          iconColor={C.warn}
        />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="visitantes">Visitantes</TabsTrigger>
          <TabsTrigger value="pendentes">Pendentes</TabsTrigger>
        </TabsList>

        <TabsContent value="visitantes" className="mt-4">
          <TabVisitantes onChanged={reloadDashboard} />
        </TabsContent>

        <TabsContent value="pendentes" className="mt-4">
          <TabPendentes />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TabVisitantes({ onChanged }: { onChanged: () => void }) {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState<any | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (statusFilter !== 'todos') params.status = statusFilter;
      if (search.trim()) params.search = search.trim();
      const data = await intApi.visitantes.list(params);
      setList(data || []);
    } catch (e: any) {
      toast.error(e.message || 'Erro ao carregar visitantes');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => { reload(); }, [reload]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8 w-56"
              placeholder="Buscar por nome, telefone, email"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos status</SelectItem>
              {STATUS_OPTS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => setShowForm(true)} className="gap-1.5 bg-[#00B39D] hover:bg-[#00B39D]/90">
          <UserPlus className="h-4 w-4" /> Novo visitante
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : list.length === 0 ? (
        <div className="rounded-lg border bg-card py-16 text-center">
          <Users className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="font-medium text-muted-foreground">Nenhum visitante cadastrado</p>
          <p className="text-sm text-muted-foreground/60 mt-1">Clique em "Novo visitante" para começar</p>
        </div>
      ) : (
        <div className="rounded-lg border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead className="hidden sm:table-cell">Contato</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Responsável</TableHead>
                <TableHead className="hidden md:table-cell">Data visita</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map(v => (
                <TableRow
                  key={v.id}
                  className="cursor-pointer hover:bg-accent/40"
                  onClick={() => setSelected(v)}
                >
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {v.nome}
                      {v.fez_decisao && (
                        <Heart className="h-3 w-3 text-pink-500" aria-label="Fez decisão" />
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                    {v.telefone && <div className="flex items-center gap-1"><Phone className="h-3 w-3" /> {v.telefone}</div>}
                    {v.email && <div className="flex items-center gap-1 truncate max-w-[220px]"><Mail className="h-3 w-3" /> {v.email}</div>}
                  </TableCell>
                  <TableCell><StatusBadge status={v.status} /></TableCell>
                  <TableCell className="hidden md:table-cell text-sm">
                    {v.responsavel?.full_name || <span className="text-muted-foreground/60">—</span>}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                    {v.data_visita ? new Date(v.data_visita + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}
                  </TableCell>
                  <TableCell>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {showForm && (
        <VisitanteFormDialog
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); reload(); onChanged(); }}
        />
      )}

      {selected && (
        <VisitanteDetailDialog
          visitanteId={selected.id}
          onClose={() => setSelected(null)}
          onChanged={() => { reload(); onChanged(); }}
        />
      )}
    </div>
  );
}

function VisitanteFormDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<any>({
    nome: '', telefone: '', email: '', idade: '',
    data_visita: new Date().toISOString().slice(0, 10),
    origem: '', veio_acompanhado: false, fez_decisao: false, tipo_decisao: '',
    observacoes: '',
  });
  const [saving, setSaving] = useState(false);

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.nome.trim()) return toast.error('Nome obrigatório');
    setSaving(true);
    try {
      const payload: any = { ...form };
      if (!payload.idade) delete payload.idade;
      else payload.idade = Number(payload.idade);
      if (!payload.origem) delete payload.origem;
      if (!payload.tipo_decisao || !payload.fez_decisao) delete payload.tipo_decisao;
      await intApi.visitantes.create(payload);
      toast.success('Visitante cadastrado');
      onSaved();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao cadastrar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Novo visitante</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label>Nome *</Label>
            <Input autoFocus value={form.nome} onChange={e => set('nome', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Telefone</Label>
              <Input value={form.telefone} onChange={e => set('telefone', e.target.value)} placeholder="(21) 99999-0000" />
            </div>
            <div>
              <Label>Idade</Label>
              <Input type="number" value={form.idade} onChange={e => set('idade', e.target.value)} />
            </div>
          </div>
          <div>
            <Label>E-mail</Label>
            <Input type="email" value={form.email} onChange={e => set('email', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Data da visita</Label>
              <Input type="date" value={form.data_visita} onChange={e => set('data_visita', e.target.value)} />
            </div>
            <div>
              <Label>Origem</Label>
              <Select value={form.origem} onValueChange={v => set('origem', v)}>
                <SelectTrigger><SelectValue placeholder="Como conheceu?" /></SelectTrigger>
                <SelectContent>
                  {ORIGEM_OPTS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-6 text-sm">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={form.veio_acompanhado}
                onChange={e => set('veio_acompanhado', e.target.checked)}
              />
              Veio acompanhado
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={form.fez_decisao}
                onChange={e => set('fez_decisao', e.target.checked)}
              />
              Fez decisão
            </label>
          </div>
          {form.fez_decisao && (
            <div>
              <Label>Tipo de decisão</Label>
              <Select value={form.tipo_decisao} onValueChange={v => set('tipo_decisao', v)}>
                <SelectTrigger><SelectValue placeholder="Presencial ou online" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="presencial">Presencial</SelectItem>
                  <SelectItem value="online">Online</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>Observações</Label>
            <Textarea rows={3} value={form.observacoes} onChange={e => set('observacoes', e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving} className="bg-[#00B39D] hover:bg-[#00B39D]/90">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Cadastrar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VisitanteDetailDialog({
  visitanteId, onClose, onChanged,
}: { visitanteId: string; onClose: () => void; onChanged: () => void }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [changingStatus, setChangingStatus] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try { setData(await intApi.visitantes.get(visitanteId)); }
    catch (e: any) { toast.error(e.message || 'Erro ao carregar'); }
    finally { setLoading(false); }
  }, [visitanteId]);

  useEffect(() => { reload(); }, [reload]);

  const changeStatus = async (status: string) => {
    setChangingStatus(true);
    try {
      await intApi.visitantes.changeStatus(visitanteId, status);
      toast.success('Status atualizado');
      await reload();
      onChanged();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao mudar status');
    } finally {
      setChangingStatus(false);
    }
  };

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {loading ? 'Carregando...' : data?.nome}
            {data && <StatusBadge status={data.status} />}
          </DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : data ? (
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3 text-sm">
              {data.telefone && <InfoRow icon={Phone} label="Telefone" value={data.telefone} />}
              {data.email && <InfoRow icon={Mail} label="E-mail" value={data.email} />}
              {data.idade && <InfoRow icon={Users} label="Idade" value={`${data.idade} anos`} />}
              {data.data_visita && (
                <InfoRow icon={Calendar} label="Data visita"
                  value={new Date(data.data_visita + 'T00:00:00').toLocaleDateString('pt-BR')} />
              )}
              {data.culto && <InfoRow icon={Calendar} label="Culto" value={data.culto.name} />}
              {data.origem && <InfoRow icon={Users} label="Origem" value={ORIGEM_OPTS.find(o => o.value === data.origem)?.label || data.origem} />}
              {data.fez_decisao && (
                <InfoRow icon={Heart} label="Decisão"
                  value={data.tipo_decisao === 'online' ? 'Online' : 'Presencial'} />
              )}
              {data.responsavel && <InfoRow icon={UserPlus} label="Responsável" value={data.responsavel.full_name} />}
            </div>

            {data.observacoes && (
              <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                <p className="text-xs font-medium text-muted-foreground mb-1">OBSERVAÇÕES</p>
                <p className="whitespace-pre-wrap">{data.observacoes}</p>
              </div>
            )}

            <div>
              <Label className="text-xs">Mover no funil</Label>
              <Select value={data.status} onValueChange={changeStatus}>
                <SelectTrigger disabled={changingStatus}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2 uppercase">Acompanhamentos</p>
              {data.acompanhamentos?.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">Nenhum contato registrado ainda.</p>
              ) : (
                <div className="space-y-2">
                  {data.acompanhamentos.map((a: any) => (
                    <div key={a.id} className="rounded-lg border p-2.5 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium capitalize">{a.tipo.replace('_', ' ')}</span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(a.data_contato).toLocaleDateString('pt-BR')}
                        </span>
                      </div>
                      {a.observacoes && <p className="text-xs text-muted-foreground mt-1">{a.observacoes}</p>}
                      {a.proximo_passo && (
                        <p className="text-xs text-[#00B39D] mt-1">
                          Próximo passo: {a.proximo_passo}
                          {a.data_proximo_contato && ` (${new Date(a.data_proximo_contato + 'T00:00:00').toLocaleDateString('pt-BR')})`}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-2 italic">
                Registro de contatos 1:1 será habilitado na próxima entrega.
              </p>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate">{value}</p>
      </div>
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
