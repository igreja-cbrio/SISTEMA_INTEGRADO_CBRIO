import { useState, useEffect, useMemo } from 'react';
import { cuidados as cuidadosApi } from '../../api';
import ProcessosTarefas from '../../components/ProcessosTarefas';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/tabs';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Badge } from '../../components/ui/badge';
import { StatisticsCard } from '../../components/ui/statistics-card';
import { Heart, BookOpen, HandHelping, Users, UserCheck, CheckCircle2, Plus, Trash2, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';

const C = { primary: '#00B39D', info: '#3b82f6', warn: '#f59e0b', purple: '#8b5cf6', pink: '#ef476f' };

function maskCpf(v: string) {
  const d = String(v || '').replace(/\D/g, '').slice(0, 11);
  return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

function CpfMembroLookup({ value, onChange, onMembro }: { value: string; onChange: (v: string) => void; onMembro: (m: any) => void }) {
  const [membro, setMembro] = useState<any>(null);
  const [searching, setSearching] = useState(false);
  const clean = String(value || '').replace(/\D/g, '');

  useEffect(() => {
    if (clean.length !== 11) { setMembro(null); onMembro(null); return; }
    let cancel = false;
    setSearching(true);
    cuidadosApi.buscarMembro(clean).then((r: any) => {
      if (cancel) return;
      setMembro(r.membro);
      onMembro(r.membro);
    }).catch(() => {}).finally(() => !cancel && setSearching(false));
    return () => { cancel = true; };
  }, [clean]);

  return (
    <div className="space-y-1">
      <Input placeholder="CPF (opcional)" value={maskCpf(value)} onChange={e => onChange(e.target.value)} />
      {clean.length === 11 && (
        <p className="text-xs flex items-center gap-1">
          {searching ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          {membro
            ? <span className="text-primary">✓ Vinculado a <strong>{membro.nome}</strong></span>
            : !searching && <span className="text-muted-foreground">Sem cadastro — será criado como visitante.</span>}
        </p>
      )}
    </div>
  );
}

function AcompanhamentoModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ nome: '', cpf: '', telefone: '', motivo: '', observacoes: '' });
  const [membro, setMembro] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!form.nome) return toast.error('Nome obrigatório');
    setSaving(true);
    try {
      let payload: any = { ...form };
      if (!membro && form.cpf.replace(/\D/g, '').length === 11) {
        // criar membro novo
        const novo = await cuidadosApi.criarMembro({ nome: form.nome, telefone: form.telefone });
        payload.membro_id = novo.id;
      } else if (membro) {
        payload.membro_id = membro.id;
        payload.nome = membro.nome;
      }
      await cuidadosApi.acompanhamentos.create(payload);
      toast.success('Acompanhamento registrado');
      onSaved();
      onClose();
      setForm({ nome: '', cpf: '', telefone: '', motivo: '', observacoes: '' });
      setMembro(null);
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Novo Acompanhamento</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Nome *</Label><Input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} /></div>
          <div><Label>CPF</Label><CpfMembroLookup value={form.cpf} onChange={v => setForm({ ...form, cpf: v })} onMembro={setMembro} /></div>
          <div><Label>Telefone</Label><Input value={form.telefone} onChange={e => setForm({ ...form, telefone: e.target.value })} /></div>
          <div>
            <Label>Motivo</Label>
            <Select value={form.motivo} onValueChange={v => setForm({ ...form, motivo: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="luto">Luto</SelectItem>
                <SelectItem value="casal">Casal</SelectItem>
                <SelectItem value="espiritual">Espiritual</SelectItem>
                <SelectItem value="financeiro">Financeiro</SelectItem>
                <SelectItem value="saude">Saúde</SelectItem>
                <SelectItem value="outro">Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Observações</Label><Input value={form.observacoes} onChange={e => setForm({ ...form, observacoes: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Salvando...' : 'Registrar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function JornadaModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ nome: '', cpf: '', etapa: 1, data_encontro: new Date().toISOString().slice(0, 10), presente: true, observacoes: '' });
  const [membro, setMembro] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!form.nome) return toast.error('Nome obrigatório');
    setSaving(true);
    try {
      const payload: any = { ...form, etapa: Number(form.etapa) };
      if (membro) { payload.membro_id = membro.id; payload.nome = membro.nome; }
      await cuidadosApi.jornada180.create(payload);
      toast.success('Encontro registrado');
      onSaved();
      onClose();
      setForm({ nome: '', cpf: '', etapa: 1, data_encontro: new Date().toISOString().slice(0, 10), presente: true, observacoes: '' });
      setMembro(null);
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Registrar Encontro Jornada 180</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Nome *</Label><Input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} /></div>
          <div><Label>CPF</Label><CpfMembroLookup value={form.cpf} onChange={v => setForm({ ...form, cpf: v })} onMembro={setMembro} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Etapa (1-6)</Label>
              <Input type="number" min={1} max={6} value={form.etapa} onChange={e => setForm({ ...form, etapa: Number(e.target.value) })} />
            </div>
            <div><Label>Data</Label><Input type="date" value={form.data_encontro} onChange={e => setForm({ ...form, data_encontro: e.target.value })} /></div>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="presente" checked={form.presente} onChange={e => setForm({ ...form, presente: e.target.checked })} />
            <Label htmlFor="presente">Presente</Label>
          </div>
          <div><Label>Observações</Label><Input value={form.observacoes} onChange={e => setForm({ ...form, observacoes: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Salvando...' : 'Registrar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConvertidoModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ nome: '', cpf: '', telefone: '', data_culto: new Date().toISOString().slice(0, 10), atendido_apos_culto: true, cadastrado: false, observacoes: '' });
  const [membro, setMembro] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!form.nome) return toast.error('Nome obrigatório');
    setSaving(true);
    try {
      const payload: any = { ...form };
      if (membro) { payload.membro_id = membro.id; payload.nome = membro.nome; payload.cadastrado = true; }
      await cuidadosApi.convertidos.create(payload);
      toast.success('Convertido registrado');
      onSaved();
      onClose();
      setForm({ nome: '', cpf: '', telefone: '', data_culto: new Date().toISOString().slice(0, 10), atendido_apos_culto: true, cadastrado: false, observacoes: '' });
      setMembro(null);
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Registrar Convertido pós-culto</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Nome *</Label><Input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} /></div>
          <div><Label>CPF</Label><CpfMembroLookup value={form.cpf} onChange={v => setForm({ ...form, cpf: v })} onMembro={setMembro} /></div>
          <div><Label>Telefone</Label><Input value={form.telefone} onChange={e => setForm({ ...form, telefone: e.target.value })} /></div>
          <div><Label>Data do culto</Label><Input type="date" value={form.data_culto} onChange={e => setForm({ ...form, data_culto: e.target.value })} /></div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.atendido_apos_culto} onChange={e => setForm({ ...form, atendido_apos_culto: e.target.checked })} />Atendido após culto</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.cadastrado} onChange={e => setForm({ ...form, cadastrado: e.target.checked })} />Cadastrado</label>
          </div>
          <div><Label>Observações</Label><Input value={form.observacoes} onChange={e => setForm({ ...form, observacoes: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Salvando...' : 'Registrar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ──────────────────────────────────────────────────────────────────
// Página principal
// ──────────────────────────────────────────────────────────────────
export default function Cuidados() {
  const [tab, setTab] = useState('dashboard');
  const [dash, setDash] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [acomp, setAcomp] = useState<any[]>([]);
  const [jornada, setJornada] = useState<any[]>([]);
  const [convertidos, setConvertidos] = useState<any[]>([]);
  const [agregado, setAgregado] = useState<any[]>([]);
  const [agMes, setAgMes] = useState(new Date().toISOString().slice(0, 7));
  const [agAcons, setAgAcons] = useState('');
  const [agCapel, setAgCapel] = useState('');

  const [modalAcomp, setModalAcomp] = useState(false);
  const [modalJornada, setModalJornada] = useState(false);
  const [modalConvert, setModalConvert] = useState(false);
  const [search, setSearch] = useState('');

  async function loadAll() {
    setLoading(true);
    try {
      const [d, a, j, c, ag] = await Promise.all([
        cuidadosApi.dashboard().catch(() => null),
        cuidadosApi.acompanhamentos.list().catch(() => []),
        cuidadosApi.jornada180.list().catch(() => []),
        cuidadosApi.convertidos.list().catch(() => []),
        cuidadosApi.agregado.list(agMes).catch(() => []),
      ]);
      setDash(d); setAcomp(a); setJornada(j); setConvertidos(c); setAgregado(ag);
      const ac = (ag || []).find((r: any) => r.tipo === 'aconselhamento');
      const cp = (ag || []).find((r: any) => r.tipo === 'capelania');
      setAgAcons(ac ? String(ac.quantidade) : '');
      setAgCapel(cp ? String(cp.quantidade) : '');
    } finally { setLoading(false); }
  }

  useEffect(() => { loadAll(); }, []);

  // Recarregar agregado quando mudar mês
  useEffect(() => {
    cuidadosApi.agregado.list(agMes).then((ag: any) => {
      setAgregado(ag);
      const ac = (ag || []).find((r: any) => r.tipo === 'aconselhamento');
      const cp = (ag || []).find((r: any) => r.tipo === 'capelania');
      setAgAcons(ac ? String(ac.quantidade) : '');
      setAgCapel(cp ? String(cp.quantidade) : '');
    }).catch(() => {});
  }, [agMes]);

  async function salvarAgregado(tipo: 'aconselhamento' | 'capelania', q: string) {
    try {
      await cuidadosApi.agregado.upsert({ mes: agMes, tipo, quantidade: Number(q) || 0 });
      toast.success('Salvo');
      loadAll();
    } catch (e: any) { toast.error(e.message); }
  }

  const acompFiltrados = useMemo(() => {
    if (!search) return acomp;
    return acomp.filter(a => (a.nome || '').toLowerCase().includes(search.toLowerCase()));
  }, [acomp, search]);

  const a = dash?.atual || {};
  const ant = dash?.anterior || {};
  const delta = (cur: number, prev: number) => prev > 0 ? `${Math.round(((cur - prev) / prev) * 100)}%` : '—';

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Heart className="h-6 w-6 text-primary" /> Cuidados</h1>
        <p className="text-sm text-muted-foreground mt-1">Acompanhamentos pastorais, Jornada 180, capelania, aconselhamento e convertidos pós-culto.</p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="acomp">Acompanhamentos</TabsTrigger>
          <TabsTrigger value="jornada">Jornada 180</TabsTrigger>
          <TabsTrigger value="convertidos">Convertidos</TabsTrigger>
          <TabsTrigger value="agregado">Aconselhamento / Capelania</TabsTrigger>
          <TabsTrigger value="tarefas">Tarefas</TabsTrigger>
        </TabsList>

        {/* Dashboard */}
        <TabsContent value="dashboard" className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatisticsCard title="Pessoas Acompanhadas" value={a.pessoas_acompanhadas ?? 0} icon={Heart} iconColor={C.primary} />
                <StatisticsCard title="Aconselhamentos" value={a.aconselhamentos ?? 0} icon={BookOpen} iconColor={C.info}
                  subtitle={`Mês anterior: ${ant.aconselhamentos ?? 0} (${delta(a.aconselhamentos, ant.aconselhamentos)})`} />
                <StatisticsCard title="Capelania" value={a.capelania ?? 0} icon={HandHelping} iconColor={C.warn}
                  subtitle={`Mês anterior: ${ant.capelania ?? 0} (${delta(a.capelania, ant.capelania)})`} />
                <StatisticsCard title="Encontros Jornada 180" value={a.jornada180_encontros ?? 0} icon={Users} iconColor={C.purple}
                  subtitle={`Mês anterior: ${ant.jornada180_encontros ?? 0}`} />
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-2 gap-4">
                <StatisticsCard title="Convertidos Atendidos Pós-Culto" value={a.convertidos_atendidos ?? 0} icon={UserCheck} iconColor={C.primary}
                  subtitle={`Mês anterior: ${ant.convertidos_atendidos ?? 0}`} />
                <StatisticsCard title="Convertidos Cadastrados" value={a.convertidos_cadastrados ?? 0} icon={CheckCircle2} iconColor={C.info}
                  subtitle={`Mês anterior: ${ant.convertidos_cadastrados ?? 0}`} />
              </div>
            </>
          )}
        </TabsContent>

        {/* Acompanhamentos */}
        <TabsContent value="acomp" className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar nome..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Button onClick={() => setModalAcomp(true)}><Plus className="h-4 w-4 mr-2" />Novo</Button>
          </div>
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead><TableHead>Motivo</TableHead><TableHead>Início</TableHead><TableHead>Status</TableHead><TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {acompFiltrados.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhum acompanhamento.</TableCell></TableRow>
                ) : acompFiltrados.map(a => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.nome}{a.membro_id && <Badge variant="secondary" className="ml-2 text-[10px]">membro</Badge>}</TableCell>
                    <TableCell>{a.motivo || '—'}</TableCell>
                    <TableCell>{a.data_inicio ? new Date(a.data_inicio + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</TableCell>
                    <TableCell><Badge variant={a.status === 'ativo' ? 'default' : 'secondary'}>{a.status}</Badge></TableCell>
                    <TableCell className="text-right">
                      {a.status === 'ativo' && (
                        <Button variant="ghost" size="sm" onClick={async () => { await cuidadosApi.acompanhamentos.update(a.id, { status: 'concluido', data_encerramento: new Date().toISOString().slice(0, 10) }); loadAll(); }}>Concluir</Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={async () => { if (confirm('Remover?')) { await cuidadosApi.acompanhamentos.remove(a.id); loadAll(); } }}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* Jornada 180 */}
        <TabsContent value="jornada" className="space-y-4">
          <div className="flex items-center justify-end">
            <Button onClick={() => setModalJornada(true)}><Plus className="h-4 w-4 mr-2" />Registrar encontro</Button>
          </div>
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead><TableHead>Etapa</TableHead><TableHead>Data</TableHead><TableHead>Presente</TableHead><TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jornada.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhum encontro registrado.</TableCell></TableRow>
                ) : jornada.map(j => (
                  <TableRow key={j.id}>
                    <TableCell className="font-medium">{j.nome}</TableCell>
                    <TableCell><Badge variant="outline">Etapa {j.etapa}</Badge></TableCell>
                    <TableCell>{new Date(j.data_encontro + 'T12:00:00').toLocaleDateString('pt-BR')}</TableCell>
                    <TableCell>{j.presente ? '✓' : '✗'}</TableCell>
                    <TableCell className="text-right"><Button variant="ghost" size="sm" onClick={async () => { if (confirm('Remover?')) { await cuidadosApi.jornada180.remove(j.id); loadAll(); } }}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* Convertidos */}
        <TabsContent value="convertidos" className="space-y-4">
          <div className="flex items-center justify-end">
            <Button onClick={() => setModalConvert(true)}><Plus className="h-4 w-4 mr-2" />Novo convertido</Button>
          </div>
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead><TableHead>Data culto</TableHead><TableHead>Atendido</TableHead><TableHead>Cadastrado</TableHead><TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {convertidos.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhum convertido.</TableCell></TableRow>
                ) : convertidos.map(c => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.nome}</TableCell>
                    <TableCell>{new Date(c.data_culto + 'T12:00:00').toLocaleDateString('pt-BR')}</TableCell>
                    <TableCell>
                      <input type="checkbox" checked={!!c.atendido_apos_culto} onChange={async e => { await cuidadosApi.convertidos.update(c.id, { atendido_apos_culto: e.target.checked }); loadAll(); }} />
                    </TableCell>
                    <TableCell>
                      <input type="checkbox" checked={!!c.cadastrado} onChange={async e => { await cuidadosApi.convertidos.update(c.id, { cadastrado: e.target.checked }); loadAll(); }} />
                    </TableCell>
                    <TableCell className="text-right"><Button variant="ghost" size="sm" onClick={async () => { if (confirm('Remover?')) { await cuidadosApi.convertidos.remove(c.id); loadAll(); } }}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* Agregado */}
        <TabsContent value="agregado" className="space-y-4">
          <p className="text-sm text-muted-foreground">Registre o total mensal de atendimentos sem identificar pessoas. Estes dados alimentam diretamente o KPI mensal.</p>
          <div className="flex items-center gap-3">
            <Label>Mês:</Label>
            <Input type="month" value={agMes} onChange={e => setAgMes(e.target.value)} className="w-44" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <div className="flex items-center gap-2"><BookOpen className="h-4 w-4 text-info" /><h3 className="font-semibold">Aconselhamentos</h3></div>
              <Input type="number" min={0} value={agAcons} onChange={e => setAgAcons(e.target.value)} placeholder="Quantidade" />
              <Button size="sm" onClick={() => salvarAgregado('aconselhamento', agAcons)}>Salvar</Button>
            </div>
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <div className="flex items-center gap-2"><HandHelping className="h-4 w-4 text-warning" /><h3 className="font-semibold">Capelania</h3></div>
              <Input type="number" min={0} value={agCapel} onChange={e => setAgCapel(e.target.value)} placeholder="Quantidade" />
              <Button size="sm" onClick={() => salvarAgregado('capelania', agCapel)}>Salvar</Button>
            </div>
          </div>
          {agregado.length > 0 && (
            <div className="text-xs text-muted-foreground">
              Última atualização: {new Date(agregado[0].updated_at || agregado[0].created_at).toLocaleString('pt-BR')}
            </div>
          )}
        </TabsContent>

        <TabsContent value="tarefas" className="space-y-4">
          <ProcessosTarefas area="Cuidados" />
        </TabsContent>
      </Tabs>

      <AcompanhamentoModal open={modalAcomp} onClose={() => setModalAcomp(false)} onSaved={loadAll} />
      <JornadaModal open={modalJornada} onClose={() => setModalJornada(false)} onSaved={loadAll} />
      <ConvertidoModal open={modalConvert} onClose={() => setModalConvert(false)} onSaved={loadAll} />
    </div>
  );
}
