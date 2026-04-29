import { useState, useEffect, useCallback } from 'react';
import { integracao as intApi, voluntariado as volApi } from '../../api';
import ProcessosTarefas from '../../components/ProcessosTarefas';
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
  CheckCircle2, Heart, TrendingUp, Clock, Plus, Trash2, MessageCircle,
  ChevronLeft, X,
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

const TIPO_CONTATO_OPTS = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'ligacao', label: 'Ligação' },
  { value: 'visita', label: 'Visita' },
  { value: 'cafe', label: 'Café / encontro' },
  { value: 'culto', label: 'Conversa no culto' },
  { value: 'presencial', label: 'Presencial' },
  { value: 'outro', label: 'Outro' },
];

const RESULTADO_OPTS = [
  { value: 'sucesso', label: 'Conseguiu conversar' },
  { value: 'sem_resposta', label: 'Sem resposta' },
  { value: 'reagendou', label: 'Reagendou' },
  { value: 'recusou', label: 'Recusou contato' },
];

function tipoLabel(v: string) {
  return TIPO_CONTATO_OPTS.find(o => o.value === v)?.label || v;
}
function resultadoLabel(v: string | null) {
  if (!v) return null;
  return RESULTADO_OPTS.find(o => o.value === v)?.label || v;
}

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
          <TabsTrigger value="1x1">Encontros 1x1</TabsTrigger>
          <TabsTrigger value="tarefas">Tarefas</TabsTrigger>
        </TabsList>

        <TabsContent value="visitantes" className="mt-4">
          <TabVisitantes onChanged={reloadDashboard} />
        </TabsContent>

        <TabsContent value="pendentes" className="mt-4">
          <TabPendentes />
        </TabsContent>

        <TabsContent value="1x1" className="mt-4">
          <TabEncontros1x1 />
        </TabsContent>
        <TabsContent value="tarefas" className="mt-4">
          <ProcessosTarefas area="Integracao" />
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
  const [showAddContato, setShowAddContato] = useState(false);

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

  const removeAcompanhamento = async (id: string) => {
    if (!confirm('Remover este contato do histórico?')) return;
    try {
      await intApi.acompanhamentos.remove(id);
      toast.success('Contato removido');
      await reload();
      onChanged();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao remover');
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
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-muted-foreground uppercase">Acompanhamentos</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowAddContato(true)}
                  className="h-7 gap-1 text-xs"
                >
                  <Plus className="h-3 w-3" /> Registrar contato
                </Button>
              </div>
              {data.acompanhamentos?.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">Nenhum contato registrado ainda.</p>
              ) : (
                <div className="space-y-2">
                  {data.acompanhamentos.map((a: any) => (
                    <div key={a.id} className="rounded-lg border p-2.5 text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <MessageCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="font-medium">{tipoLabel(a.tipo)}</span>
                          {a.resultado && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              {resultadoLabel(a.resultado)}
                            </Badge>
                          )}
                          {a.voluntario && (
                            <span className="text-xs text-muted-foreground">• {a.voluntario.full_name}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-xs text-muted-foreground">
                            {new Date(a.data_contato).toLocaleDateString('pt-BR')}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-destructive"
                            onClick={() => removeAcompanhamento(a.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      {a.observacoes && <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{a.observacoes}</p>}
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
            </div>
          </div>
        ) : null}

        {showAddContato && (
          <AcompanhamentoFormDialog
            visitanteId={visitanteId}
            onClose={() => setShowAddContato(false)}
            onSaved={() => { setShowAddContato(false); reload(); onChanged(); }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function AcompanhamentoFormDialog({
  visitanteId, onClose, onSaved,
}: { visitanteId: string; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<any>({
    tipo: 'whatsapp',
    data_contato: new Date().toISOString().slice(0, 16),
    voluntario_id: '',
    resultado: '',
    observacoes: '',
    proximo_passo: '',
    data_proximo_contato: '',
  });
  const [saving, setSaving] = useState(false);
  const [voluntarios, setVoluntarios] = useState<any[]>([]);

  useEffect(() => {
    volApi.volunteersPool()
      .then((d: any) => setVoluntarios(d || []))
      .catch(() => { /* dropdown permanece vazio, campo é opcional */ });
  }, []);

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.tipo) return toast.error('Tipo obrigatório');
    setSaving(true);
    try {
      const payload: any = {
        tipo: form.tipo,
        data_contato: new Date(form.data_contato).toISOString(),
      };
      if (form.voluntario_id) payload.voluntario_id = form.voluntario_id;
      if (form.resultado) payload.resultado = form.resultado;
      if (form.observacoes.trim()) payload.observacoes = form.observacoes.trim();
      if (form.proximo_passo.trim()) payload.proximo_passo = form.proximo_passo.trim();
      if (form.data_proximo_contato) payload.data_proximo_contato = form.data_proximo_contato;
      await intApi.visitantes.addAcompanhamento(visitanteId, payload);
      toast.success('Contato registrado');
      onSaved();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao registrar contato');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-md z-[1100]">
        <DialogHeader><DialogTitle>Registrar contato</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tipo *</Label>
              <Select value={form.tipo} onValueChange={v => set('tipo', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="z-[1101]">
                  {TIPO_CONTATO_OPTS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Data e hora</Label>
              <Input
                type="datetime-local"
                value={form.data_contato}
                onChange={e => set('data_contato', e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label>Quem fez o contato</Label>
            <Select value={form.voluntario_id} onValueChange={v => set('voluntario_id', v === '__none__' ? '' : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecionar voluntário (opcional)" />
              </SelectTrigger>
              <SelectContent className="z-[1101]">
                <SelectItem value="__none__">Não especificar</SelectItem>
                {voluntarios.map(v => (
                  <SelectItem key={v.id} value={v.id}>{v.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Resultado</Label>
            <Select value={form.resultado} onValueChange={v => set('resultado', v === '__none__' ? '' : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Como foi? (opcional)" />
              </SelectTrigger>
              <SelectContent className="z-[1101]">
                <SelectItem value="__none__">Não especificar</SelectItem>
                {RESULTADO_OPTS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Observações</Label>
            <Textarea
              rows={3}
              value={form.observacoes}
              onChange={e => set('observacoes', e.target.value)}
              placeholder="O que foi conversado, como reagiu, pontos a lembrar…"
            />
          </div>
          <div className="pt-2 border-t">
            <p className="text-xs font-medium text-muted-foreground uppercase mb-2">Próximo passo (opcional)</p>
            <div className="space-y-2">
              <Input
                placeholder="Ex: Convidar pro culto de domingo"
                value={form.proximo_passo}
                onChange={e => set('proximo_passo', e.target.value)}
              />
              <Input
                type="date"
                value={form.data_proximo_contato}
                onChange={e => set('data_proximo_contato', e.target.value)}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving} className="bg-[#00B39D] hover:bg-[#00B39D]/90">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Registrar'}
          </Button>
        </DialogFooter>
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
