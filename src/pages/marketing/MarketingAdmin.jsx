import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { marketing as api } from '../../api';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../../components/ui/dialog';
import { Megaphone, Kanban, CalendarDays, Plus, Trash2, Settings, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../supabaseClient';
import MarketingNav from './MarketingNav';

const DIAS_LABEL = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const HABILIDADES = ['coordenador', 'videomaker', 'fotografo', 'designer', 'social_media', 'social_media_assistente'];

export default function MarketingAdmin() {
  const navigate = useNavigate();
  const { isAdmin, modulePerms } = useAuth();
  const lvl = (modulePerms?.marketing?.leitura || 0);
  const podeAdmin = isAdmin || (modulePerms?.marketing?.escrita || 0) >= 5;

  if (!podeAdmin) {
    return (
      <div className="p-6">
        <Card className="p-6 text-center max-w-md mx-auto">
          <p className="text-muted-foreground">Acesso restrito · só admin do módulo.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Settings className="h-6 w-6 text-primary" />
            Marketing · Admin
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Equipe · etiquetas · recorrentes · overrides · padrões por fase
          </p>
        </div>
        <MarketingNav />
      </div>

      <Tabs defaultValue="membros" className="w-full">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-5">
          <TabsTrigger value="membros">Membros</TabsTrigger>
          <TabsTrigger value="etiquetas">Etiquetas</TabsTrigger>
          <TabsTrigger value="recorrentes">Recorrentes</TabsTrigger>
          <TabsTrigger value="overrides">Overrides</TabsTrigger>
          <TabsTrigger value="padroes">Padrões</TabsTrigger>
        </TabsList>

        <TabsContent value="membros" className="mt-4"><AbaMembros /></TabsContent>
        <TabsContent value="etiquetas" className="mt-4"><AbaEtiquetas /></TabsContent>
        <TabsContent value="recorrentes" className="mt-4"><AbaRecorrentes /></TabsContent>
        <TabsContent value="overrides" className="mt-4"><AbaOverrides /></TabsContent>
        <TabsContent value="padroes" className="mt-4"><AbaPadroes /></TabsContent>
      </Tabs>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Membros
// ═══════════════════════════════════════════════════════════════════════
function AbaMembros() {
  const [lista, setLista] = useState([]);
  const [loading, setLoading] = useState(true);
  const [novoOpen, setNovoOpen] = useState(false);
  const [profilesCriativo, setProfilesCriativo] = useState([]);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.admin.membros.list();
      setLista(data);
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // Lista de profiles candidatos · area=Criativo (Aline futura entra aqui também)
  useEffect(() => {
    if (!supabase) return;
    supabase.from('profiles')
      .select('id, name, email, area')
      .ilike('area', 'criativo')
      .order('name')
      .then(({ data }) => setProfilesCriativo(data || []))
      .catch(() => {});
  }, []);

  async function salvarLinha(id, payload) {
    try {
      await api.admin.membros.update(id, payload);
      toast.success('Salvo');
      carregar();
    } catch (e) { toast.error(e.message); }
  }

  async function remover(id) {
    if (!confirm('Remover este membro? (soft-delete · reversível)')) return;
    try {
      await api.admin.membros.remove(id);
      toast.success('Removido');
      carregar();
    } catch (e) { toast.error(e.message); }
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-between">
        <p className="text-sm text-muted-foreground">{lista.length} membros · admin edita inline</p>
        <Dialog open={novoOpen} onOpenChange={setNovoOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> Novo membro</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo membro Marketing</DialogTitle></DialogHeader>
            <NovoMembroForm
              profiles={profilesCriativo}
              onSuccess={() => { setNovoOpen(false); carregar(); }}
            />
          </DialogContent>
        </Dialog>
      </div>

      {loading ? <Loader2 className="h-5 w-5 animate-spin mx-auto my-8 text-muted-foreground" /> : (
        <div className="space-y-2">
          {lista.map(m => (
            <MembroRow key={m.id} membro={m} onSave={salvarLinha} onRemove={remover} />
          ))}
        </div>
      )}
    </div>
  );
}

function MembroRow({ membro, onSave, onRemove }) {
  const [horas, setHoras] = useState(membro.horas_semanais);
  const [obs, setObs] = useState(membro.observacao || '');
  const [ativo, setAtivo] = useState(membro.ativo);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setDirty(
      Number(horas) !== Number(membro.horas_semanais) ||
      (obs || '') !== (membro.observacao || '') ||
      ativo !== membro.ativo
    );
  }, [horas, obs, ativo, membro]);

  return (
    <Card className="p-3 flex flex-col md:flex-row md:items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm">{membro.profile?.name || '(sem nome)'}</p>
        <p className="text-xs text-muted-foreground">{membro.profile?.email}</p>
      </div>
      <Badge variant="secondary" className="self-start md:self-auto">{membro.habilidade}</Badge>
      <div className="flex items-center gap-2">
        <Label className="text-xs">Horas/sem</Label>
        <Input
          type="number"
          step="0.5"
          value={horas}
          onChange={e => setHoras(e.target.value)}
          className="w-20 h-8"
        />
      </div>
      <Input
        value={obs}
        onChange={e => setObs(e.target.value)}
        placeholder="Observação"
        className="flex-1 h-8 text-sm"
      />
      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
        <input type="checkbox" checked={ativo} onChange={e => setAtivo(e.target.checked)} />
        Ativo
      </label>
      <div className="flex gap-1">
        <Button
          size="sm"
          onClick={() => onSave(membro.id, { horas_semanais: parseFloat(horas), observacao: obs, ativo })}
          disabled={!dirty}
        >
          Salvar
        </Button>
        <Button size="icon" variant="outline" onClick={() => onRemove(membro.id)} className="text-red-600">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
}

function NovoMembroForm({ profiles, onSuccess }) {
  const [tipo, setTipo] = useState('com_login'); // com_login | sem_login
  const [form, setForm] = useState({ profile_id: '', nome_display: '', habilidade: '', horas_semanais: 30, observacao: '' });
  const [submitting, setSubmitting] = useState(false);
  async function submit() {
    if (!form.habilidade) { toast.error('Habilidade obrigatória'); return; }
    if (tipo === 'com_login' && !form.profile_id) { toast.error('Selecione a pessoa'); return; }
    if (tipo === 'sem_login' && !form.nome_display.trim()) { toast.error('Nome obrigatório'); return; }
    setSubmitting(true);
    try {
      const payload = {
        habilidade: form.habilidade,
        horas_semanais: parseFloat(form.horas_semanais),
        observacao: form.observacao,
        profile_id: tipo === 'com_login' ? form.profile_id : null,
        nome_display: tipo === 'sem_login' ? form.nome_display.trim() : null,
      };
      await api.admin.membros.create(payload);
      toast.success('Criado');
      onSuccess();
    } catch (e) { toast.error(e.message); }
    finally { setSubmitting(false); }
  }
  return (
    <div className="space-y-3">
      <div className="flex gap-2 text-xs">
        <button
          onClick={() => setTipo('com_login')}
          className={`flex-1 px-3 py-2 rounded border transition-colors ${tipo === 'com_login' ? 'bg-primary text-primary-foreground border-primary' : 'border-border'}`}
        >Tem login no sistema</button>
        <button
          onClick={() => setTipo('sem_login')}
          className={`flex-1 px-3 py-2 rounded border transition-colors ${tipo === 'sem_login' ? 'bg-primary text-primary-foreground border-primary' : 'border-border'}`}
        >Sem login (PJ · ocasional)</button>
      </div>

      {tipo === 'com_login' ? (
        <div className="space-y-2">
          <Label>Pessoa (Criativo) *</Label>
          <Select value={form.profile_id} onValueChange={v => setForm(f => ({ ...f, profile_id: v }))}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              {profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <div className="space-y-2">
          <Label>Nome de exibição *</Label>
          <Input
            value={form.nome_display}
            onChange={e => setForm(f => ({ ...f, nome_display: e.target.value }))}
            placeholder="Ex: Aline (fotógrafa domingo)"
          />
          <p className="text-xs text-muted-foreground">Pessoa que não acessa o sistema · só aparece no calendário/admin como referência. Informações de RH cadastradas separadamente.</p>
        </div>
      )}
      <div className="space-y-2">
        <Label>Habilidade *</Label>
        <Select value={form.habilidade} onValueChange={v => setForm(f => ({ ...f, habilidade: v }))}>
          <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
          <SelectContent>
            {HABILIDADES.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Horas/semana</Label>
          <Input type="number" step="0.5" value={form.horas_semanais}
            onChange={e => setForm(f => ({ ...f, horas_semanais: e.target.value }))} />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Observação</Label>
        <Textarea rows={2} value={form.observacao}
          onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))} />
      </div>
      <div className="flex justify-end">
        <Button onClick={submit} disabled={submitting}>{submitting ? 'Criando...' : 'Criar'}</Button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Etiquetas (tipo + destino)
// ═══════════════════════════════════════════════════════════════════════
function AbaEtiquetas() {
  const [tipos, setTipos] = useState([]);
  const [destinos, setDestinos] = useState([]);
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [t, d] = await Promise.all([api.admin.etiquetasTipo.list(), api.admin.etiquetasDestino.list()]);
      setTipos(t);
      setDestinos(d);
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function salvarTipo(id, payload) {
    try { await api.admin.etiquetasTipo.update(id, payload); toast.success('Salvo'); carregar(); }
    catch (e) { toast.error(e.message); }
  }
  async function salvarDestino(id, payload) {
    try { await api.admin.etiquetasDestino.update(id, payload); toast.success('Salvo'); carregar(); }
    catch (e) { toast.error(e.message); }
  }

  if (loading) return <Loader2 className="h-5 w-5 animate-spin mx-auto my-8 text-muted-foreground" />;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold mb-2 text-foreground">Tipos (8)</h3>
        <p className="text-xs text-muted-foreground mb-3">
          `esforco_max_h` = tempo MÁXIMO acordado (SLA interno). Usado pra estimar prazo pessimista + detectar atraso individual no card (acima de 1.5× = badge vermelho). NULL = tipo sem SLA.
        </p>
        <div className="space-y-2">
          {tipos.map(t => <TipoRow key={t.id} t={t} onSave={salvarTipo} />)}
        </div>
      </div>
      <div>
        <h3 className="text-sm font-semibold mb-2 text-foreground">Destinos (5)</h3>
        <div className="space-y-2">
          {destinos.map(d => <DestinoRow key={d.id} d={d} onSave={salvarDestino} />)}
        </div>
      </div>
    </div>
  );
}

function TipoRow({ t, onSave }) {
  const [esforco, setEsforco] = useState(t.esforco_max_h ?? '');
  const [hab, setHab] = useState(t.habilidade_padrao || '');
  const [cor, setCor] = useState(t.cor || '');
  const [ativo, setAtivo] = useState(t.ativo);
  const dirty =
    String(esforco) !== String(t.esforco_max_h ?? '') ||
    hab !== (t.habilidade_padrao || '') ||
    cor !== (t.cor || '') ||
    ativo !== t.ativo;

  return (
    <Card className="p-3 flex flex-col md:flex-row md:items-center gap-3">
      <div className="flex items-center gap-2 min-w-[200px]">
        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: cor || '#888' }} />
        <p className="font-medium text-sm">{t.nome}</p>
      </div>
      <Select value={hab || '__none__'} onValueChange={v => setHab(v === '__none__' ? '' : v)}>
        <SelectTrigger className="w-[180px] h-8"><SelectValue placeholder="Habilidade padrão" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">(sem)</SelectItem>
          {HABILIDADES.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
        </SelectContent>
      </Select>
      <div className="flex items-center gap-2">
        <Label className="text-xs whitespace-nowrap">Máx (h)</Label>
        <Input type="number" step="0.5" value={esforco}
          onChange={e => setEsforco(e.target.value)} placeholder="—" className="w-20 h-8" />
      </div>
      <Input value={cor} onChange={e => setCor(e.target.value)} placeholder="#HEX" className="w-24 h-8" />
      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
        <input type="checkbox" checked={ativo} onChange={e => setAtivo(e.target.checked)} />
        Ativo
      </label>
      <Button size="sm" disabled={!dirty}
        onClick={() => onSave(t.id, {
          esforco_max_h: esforco === '' ? null : parseFloat(esforco),
          habilidade_padrao: hab || null,
          cor: cor || null,
          ativo,
        })}>Salvar</Button>
    </Card>
  );
}

function DestinoRow({ d, onSave }) {
  const [cor, setCor] = useState(d.cor || '');
  const [ativo, setAtivo] = useState(d.ativo);
  const dirty = cor !== (d.cor || '') || ativo !== d.ativo;
  return (
    <Card className="p-3 flex flex-col md:flex-row md:items-center gap-3">
      <div className="flex items-center gap-2 min-w-[200px]">
        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: cor || '#888' }} />
        <p className="font-medium text-sm">{d.nome}</p>
      </div>
      <Input value={cor} onChange={e => setCor(e.target.value)} placeholder="#HEX" className="w-24 h-8" />
      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
        <input type="checkbox" checked={ativo} onChange={e => setAtivo(e.target.checked)} />
        Ativo
      </label>
      <Button size="sm" disabled={!dirty}
        onClick={() => onSave(d.id, { cor: cor || null, ativo })}>Salvar</Button>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Recorrentes
// ═══════════════════════════════════════════════════════════════════════
function AbaRecorrentes() {
  const [lista, setLista] = useState([]);
  const [membros, setMembros] = useState([]);
  const [loading, setLoading] = useState(true);
  const [novoOpen, setNovoOpen] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [r, m] = await Promise.all([api.admin.recorrentes.list(), api.membros()]);
      setLista(r);
      setMembros(m);
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const membroMap = Object.fromEntries(membros.map(m => [m.id, m]));

  async function remover(id) {
    if (!confirm('Remover este recorrente?')) return;
    try { await api.admin.recorrentes.remove(id); toast.success('Removido'); carregar(); }
    catch (e) { toast.error(e.message); }
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-between">
        <p className="text-sm text-muted-foreground">{lista.length} recorrentes · slots fixos da equipe</p>
        <Dialog open={novoOpen} onOpenChange={setNovoOpen}>
          <DialogTrigger asChild><Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> Novo</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo compromisso recorrente</DialogTitle></DialogHeader>
            <NovoRecorrenteForm membros={membros} onSuccess={() => { setNovoOpen(false); carregar(); }} />
          </DialogContent>
        </Dialog>
      </div>
      {loading ? <Loader2 className="h-5 w-5 animate-spin mx-auto my-8 text-muted-foreground" /> : (
        <div className="space-y-2">
          {lista.map(r => {
            const parts = (r.participantes_ids || []).map(id => membroMap[id]).filter(Boolean);
            return (
              <Card key={r.id} className="p-3 flex flex-wrap items-center gap-3">
                <Badge variant="secondary">{DIAS_LABEL[r.dia_semana]}</Badge>
                <span className="text-sm font-mono">{r.hora_inicio?.slice(0, 5)} · {r.duracao_h}h</span>
                <span className="text-sm text-foreground flex-1 min-w-[200px]">{r.descricao}</span>
                <div className="flex flex-wrap gap-1 items-center">
                  {parts.length === 0 ? (
                    <span className="text-xs text-muted-foreground italic">sem participantes</span>
                  ) : (
                    parts.map(p => (
                      <Badge key={p.id} variant="outline" className="text-[10px]">
                        {p.profile?.name?.split(' ')[0] || '?'}
                      </Badge>
                    ))
                  )}
                </div>
                <Button size="icon" variant="outline" onClick={() => remover(r.id)} className="text-red-600">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function NovoRecorrenteForm({ membros, onSuccess }) {
  const [form, setForm] = useState({ participantes_ids: [], dia_semana: '1', hora_inicio: '09:00', duracao_h: 3, descricao: '' });
  const [submitting, setSubmitting] = useState(false);

  function toggleMembro(id) {
    setForm(f => ({
      ...f,
      participantes_ids: f.participantes_ids.includes(id)
        ? f.participantes_ids.filter(x => x !== id)
        : [...f.participantes_ids, id],
    }));
  }

  function selecionarTodos() {
    setForm(f => ({ ...f, participantes_ids: membros.map(m => m.id) }));
  }
  function limparTodos() {
    setForm(f => ({ ...f, participantes_ids: [] }));
  }

  async function submit() {
    if (form.participantes_ids.length === 0) { toast.error('Selecione pelo menos 1 participante'); return; }
    if (!form.descricao) { toast.error('Descrição obrigatória'); return; }
    setSubmitting(true);
    try {
      await api.admin.recorrentes.create({
        participantes_ids: form.participantes_ids,
        dia_semana: parseInt(form.dia_semana),
        hora_inicio: form.hora_inicio,
        duracao_h: parseFloat(form.duracao_h),
        descricao: form.descricao,
      });
      toast.success('Criado');
      onSuccess();
    } catch (e) { toast.error(e.message); }
    finally { setSubmitting(false); }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Participantes * ({form.participantes_ids.length}/{membros.length})</Label>
          <div className="flex gap-1">
            <Button type="button" size="sm" variant="ghost" onClick={selecionarTodos} className="h-6 text-[10px]">Todos</Button>
            <Button type="button" size="sm" variant="ghost" onClick={limparTodos} className="h-6 text-[10px]">Limpar</Button>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-1 max-h-48 overflow-y-auto border border-border rounded p-2">
          {membros.map(m => {
            const sel = form.participantes_ids.includes(m.id);
            return (
              <label key={m.id} className={`flex items-center gap-2 px-2 py-1 rounded text-sm cursor-pointer transition-colors ${sel ? 'bg-primary/10' : 'hover:bg-muted/50'}`}>
                <input
                  type="checkbox"
                  checked={sel}
                  onChange={() => toggleMembro(m.id)}
                  className="h-4 w-4 cursor-pointer"
                />
                <span className="flex-1">{m.profile?.name || '(sem nome)'}</span>
                <span className="text-xs text-muted-foreground">{m.habilidade}</span>
              </label>
            );
          })}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-2">
          <Label>Dia *</Label>
          <Select value={form.dia_semana} onValueChange={v => setForm(f => ({ ...f, dia_semana: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {DIAS_LABEL.map((l, i) => <SelectItem key={i} value={String(i)}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Hora</Label>
          <Input type="time" value={form.hora_inicio}
            onChange={e => setForm(f => ({ ...f, hora_inicio: e.target.value }))} />
        </div>
        <div className="space-y-2">
          <Label>Duração (h)</Label>
          <Input type="number" step="0.5" value={form.duracao_h}
            onChange={e => setForm(f => ({ ...f, duracao_h: e.target.value }))} />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Descrição *</Label>
        <Input value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} />
      </div>
      <div className="flex justify-end">
        <Button onClick={submit} disabled={submitting}>{submitting ? 'Criando...' : 'Criar'}</Button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Overrides
// ═══════════════════════════════════════════════════════════════════════
function AbaOverrides() {
  const [lista, setLista] = useState([]);
  const [membros, setMembros] = useState([]);
  const [loading, setLoading] = useState(true);
  const [novoOpen, setNovoOpen] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [o, m] = await Promise.all([api.admin.overrides.list(), api.membros()]);
      setLista(o);
      setMembros(m);
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const membroMap = Object.fromEntries(membros.map(m => [m.id, m]));

  async function remover(id) {
    if (!confirm('Remover este override?')) return;
    try { await api.admin.overrides.remove(id); toast.success('Removido'); carregar(); }
    catch (e) { toast.error(e.message); }
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-start gap-3 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground">{lista.length} overrides</p>
          <p className="text-xs text-muted-foreground">Override substitui horas_disponiveis (férias = 0 · pico = horas extras)</p>
        </div>
        <Dialog open={novoOpen} onOpenChange={setNovoOpen}>
          <DialogTrigger asChild><Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> Novo</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo override de capacidade</DialogTitle></DialogHeader>
            <NovoOverrideForm membros={membros} onSuccess={() => { setNovoOpen(false); carregar(); }} />
          </DialogContent>
        </Dialog>
      </div>
      {loading ? <Loader2 className="h-5 w-5 animate-spin mx-auto my-8 text-muted-foreground" /> : (
        <div className="space-y-2">
          {lista.map(o => (
            <Card key={o.id} className="p-3 flex flex-wrap items-center gap-3">
              <p className="font-medium text-sm min-w-[140px]">{membroMap[o.membro_id]?.profile?.name || '(membro)'}</p>
              <Badge variant="secondary">{o.semana_inicio}</Badge>
              <span className="text-sm font-mono">{o.horas_disponiveis}h disponíveis</span>
              <span className="text-sm text-muted-foreground flex-1 min-w-[200px]">{o.motivo || '—'}</span>
              <Button size="icon" variant="outline" onClick={() => remover(o.id)} className="text-red-600">
                <Trash2 className="h-4 w-4" />
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function NovoOverrideForm({ membros, onSuccess }) {
  function proximaSegunda() {
    const d = new Date();
    const day = d.getDay() || 7;
    d.setDate(d.getDate() - day + 1 + 7);
    return d.toISOString().slice(0, 10);
  }
  const [form, setForm] = useState({ membro_id: '', semana_inicio: proximaSegunda(), horas_disponiveis: 0, motivo: '' });
  const [submitting, setSubmitting] = useState(false);
  async function submit() {
    if (!form.membro_id || !form.semana_inicio) { toast.error('Membro e semana obrigatórios'); return; }
    setSubmitting(true);
    try {
      await api.admin.overrides.create({
        ...form,
        horas_disponiveis: parseFloat(form.horas_disponiveis),
      });
      toast.success('Criado');
      onSuccess();
    } catch (e) { toast.error(e.message); }
    finally { setSubmitting(false); }
  }
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label>Membro *</Label>
        <Select value={form.membro_id} onValueChange={v => setForm(f => ({ ...f, membro_id: v }))}>
          <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
          <SelectContent>
            {membros.map(m => <SelectItem key={m.id} value={m.id}>{m.profile?.name} · {m.habilidade}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Semana (segunda) *</Label>
          <Input type="date" value={form.semana_inicio}
            onChange={e => setForm(f => ({ ...f, semana_inicio: e.target.value }))} />
        </div>
        <div className="space-y-2">
          <Label>Horas disponíveis *</Label>
          <Input type="number" step="0.5" value={form.horas_disponiveis}
            onChange={e => setForm(f => ({ ...f, horas_disponiveis: e.target.value }))} />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Motivo</Label>
        <Input value={form.motivo} onChange={e => setForm(f => ({ ...f, motivo: e.target.value }))}
          placeholder="Férias · feriado · pico AMI" />
      </div>
      <div className="flex justify-end">
        <Button onClick={submit} disabled={submitting}>{submitting ? 'Criando...' : 'Criar'}</Button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Padrões por fase (categoria do evento × fase → etiqueta + dono automáticos)
// ═══════════════════════════════════════════════════════════════════════
function AbaPadroes() {
  const [lista, setLista] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [membros, setMembros] = useState([]);
  const [loading, setLoading] = useState(true);
  const [novoOpen, setNovoOpen] = useState(false);
  const [aplicando, setAplicando] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [p, c, t, m] = await Promise.all([
        api.admin.cicloPadroes.list(),
        api.admin.cicloPadroes.categorias(),
        api.admin.etiquetasTipo.list(),
        api.membros(),
      ]);
      setLista(p);
      setCategorias(c);
      setTipos((t || []).filter(x => x.ativo));
      setMembros(m);
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  async function salvar(id, payload) {
    try { await api.admin.cicloPadroes.update(id, payload); carregar(); }
    catch (e) { toast.error(e.message); }
  }
  async function remover(id) {
    if (!confirm('Remover este padrão?')) return;
    try { await api.admin.cicloPadroes.remove(id); toast.success('Removido'); carregar(); }
    catch (e) { toast.error(e.message); }
  }
  async function aplicar() {
    if (!confirm('Aplicar os padrões aos cards de evento ativos que estão sem etiqueta e/ou sem dono?\nNão sobrescreve o que já foi classificado.')) return;
    setAplicando(true);
    try {
      const r = await api.admin.cicloPadroes.aplicar();
      toast.success(`${r?.atualizados || 0} card(s) atualizado(s)`);
    } catch (e) { toast.error(e.message); }
    finally { setAplicando(false); }
  }

  const catMap = Object.fromEntries(categorias.map(c => [c.id, c.name]));
  const grupos = {};
  for (const p of lista) {
    const nome = p.categoria?.name || catMap[p.category_id] || '(categoria)';
    (grupos[nome] = grupos[nome] || []).push(p);
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-start gap-3 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground">{lista.length} padrões · {categorias.length} categorias</p>
          <p className="text-xs text-muted-foreground">
            Por (categoria do evento × fase) · aplica etiqueta + esforço + dono quando nasce o card. Pedro refina no card.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={aplicar} disabled={aplicando || !lista.length}>
            {aplicando ? 'Aplicando...' : 'Aplicar a cards ativos'}
          </Button>
          <Dialog open={novoOpen} onOpenChange={setNovoOpen}>
            <DialogTrigger asChild><Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> Novo padrão</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Novo padrão por fase</DialogTitle></DialogHeader>
              <NovoPadraoForm categorias={categorias} tipos={tipos} membros={membros}
                onSuccess={() => { setNovoOpen(false); carregar(); }} />
            </DialogContent>
          </Dialog>
        </div>
      </div>
      {loading ? <Loader2 className="h-5 w-5 animate-spin mx-auto my-8 text-muted-foreground" /> : (
        lista.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            Nenhum padrão ainda. Crie o primeiro · ex: (Série × Briefing) → etiqueta "Briefing" + Cauã.
          </Card>
        ) : (
          <div className="space-y-4">
            {Object.entries(grupos).map(([cat, itens]) => (
              <div key={cat} className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{cat}</p>
                {itens.map(p => (
                  <PadraoRow key={p.id} padrao={p} tipos={tipos} membros={membros} onSave={salvar} onRemove={remover} />
                ))}
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

function PadraoRow({ padrao, tipos, membros, onSave, onRemove }) {
  return (
    <Card className="p-3 flex flex-wrap items-center gap-3">
      <Badge variant="secondary" className="min-w-[120px] justify-center">{padrao.nome_fase}</Badge>

      <Select value={padrao.etiqueta_tipo_id || '__none__'}
        onValueChange={v => onSave(padrao.id, { etiqueta_tipo_id: v === '__none__' ? null : v })}>
        <SelectTrigger className="w-[200px] h-8 text-xs"><SelectValue placeholder="Etiqueta..." /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">(sem etiqueta)</SelectItem>
          {tipos.map(t => <SelectItem key={t.id} value={t.id}>{t.nome}{t.esforco_max_h ? ` · ${t.esforco_max_h}h` : ''}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select value={padrao.atribuido_a || '__none__'}
        onValueChange={v => onSave(padrao.id, { atribuido_a: v === '__none__' ? null : v })}>
        <SelectTrigger className="w-[180px] h-8 text-xs"><SelectValue placeholder="Dono..." /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">(sem dono)</SelectItem>
          {membros.map(m => <SelectItem key={m.id} value={m.id}>{(m.profile?.name || m.nome_display || '—')} · {m.habilidade}</SelectItem>)}
        </SelectContent>
      </Select>

      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <input type="checkbox" checked={padrao.ativo} onChange={e => onSave(padrao.id, { ativo: e.target.checked })} />
        Ativo
      </label>

      <Button size="icon" variant="outline" onClick={() => onRemove(padrao.id)} className="text-red-600 ml-auto">
        <Trash2 className="h-4 w-4" />
      </Button>
    </Card>
  );
}

function NovoPadraoForm({ categorias, tipos, membros, onSuccess }) {
  const [form, setForm] = useState({ category_id: '', nome_fase: '', etiqueta_tipo_id: '', atribuido_a: '' });
  const [fases, setFases] = useState([]);
  const [loadingFases, setLoadingFases] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function escolherCategoria(catId) {
    setForm(f => ({ ...f, category_id: catId, nome_fase: '' }));
    setFases([]);
    if (!catId) return;
    setLoadingFases(true);
    try { setFases(await api.admin.cicloPadroes.fases(catId)); }
    catch (e) { toast.error(e.message); }
    finally { setLoadingFases(false); }
  }

  async function submit() {
    if (!form.category_id || !form.nome_fase) { toast.error('Categoria e fase obrigatórias'); return; }
    if (!form.etiqueta_tipo_id && !form.atribuido_a) { toast.error('Informe ao menos etiqueta ou dono'); return; }
    setSubmitting(true);
    try {
      await api.admin.cicloPadroes.create({
        category_id: form.category_id,
        nome_fase: form.nome_fase,
        etiqueta_tipo_id: form.etiqueta_tipo_id || null,
        atribuido_a: form.atribuido_a || null,
      });
      toast.success('Criado');
      onSuccess();
    } catch (e) { toast.error(e.message); }
    finally { setSubmitting(false); }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label>Categoria do evento *</Label>
        <Select value={form.category_id} onValueChange={escolherCategoria}>
          <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
          <SelectContent>
            {categorias.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Fase *</Label>
        <Select value={form.nome_fase} onValueChange={v => setForm(f => ({ ...f, nome_fase: v }))}
          disabled={!form.category_id || loadingFases}>
          <SelectTrigger>
            <SelectValue placeholder={loadingFases ? 'Carregando...' : (form.category_id ? 'Selecione a fase' : 'Escolha a categoria antes')} />
          </SelectTrigger>
          <SelectContent>
            {fases.map(f => <SelectItem key={f.nome} value={f.nome}>{f.numero ? `${f.numero}. ` : ''}{f.nome}</SelectItem>)}
          </SelectContent>
        </Select>
        {form.category_id && !loadingFases && fases.length === 0 && (
          <p className="text-xs text-amber-600">Sem fases no catálogo dessa categoria · confira os templates do ciclo criativo.</p>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Etiqueta (entregável)</Label>
          <Select value={form.etiqueta_tipo_id || '__none__'}
            onValueChange={v => setForm(f => ({ ...f, etiqueta_tipo_id: v === '__none__' ? '' : v }))}>
            <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">(sem etiqueta)</SelectItem>
              {tipos.map(t => <SelectItem key={t.id} value={t.id}>{t.nome}{t.esforco_max_h ? ` · ${t.esforco_max_h}h` : ''}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Dono padrão</Label>
          <Select value={form.atribuido_a || '__none__'}
            onValueChange={v => setForm(f => ({ ...f, atribuido_a: v === '__none__' ? '' : v }))}>
            <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">(sem dono)</SelectItem>
              {membros.map(m => <SelectItem key={m.id} value={m.id}>{(m.profile?.name || m.nome_display || '—')} · {m.habilidade}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Informe ao menos um (etiqueta ou dono). O esforço vem da etiqueta.</p>
      <div className="flex justify-end">
        <Button onClick={submit} disabled={submitting}>{submitting ? 'Criando...' : 'Criar'}</Button>
      </div>
    </div>
  );
}
