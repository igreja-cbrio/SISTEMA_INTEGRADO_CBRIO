import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { cuidados as cuidadosApi, devocionalPlanos as devPlanosApi } from '../../api';
import ProcessosTarefas from '../../components/ProcessosTarefas';
import DevocionalAdmin from '../../components/DevocionalAdmin';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/tabs';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Badge } from '../../components/ui/badge';
import { StatisticsCard } from '../../components/ui/statistics-card';
import { Heart, BookOpen, HandHelping, Users, UserCheck, CheckCircle2, Plus, Trash2, Loader2, Search, Sparkles, CalendarCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';

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

// Cores/labels das tags pastorais · espelham as fixas do backend
const TAG_LABELS: Record<string, string> = {
  casamento: 'Casamento',
  familia: 'Família',
  espiritual: 'Espiritual',
  saude: 'Saúde',
  financeiro: 'Financeiro',
  luto: 'Luto',
  emocional: 'Emocional',
  vicios: 'Vícios',
  profissional: 'Profissional',
  outro: 'Outro',
};
const TAG_COLORS: Record<string, string> = {
  casamento: '#ef476f',
  familia: '#8b5cf6',
  espiritual: '#00B39D',
  saude: '#10b981',
  financeiro: '#f59e0b',
  luto: '#6b7280',
  emocional: '#3b82f6',
  vicios: '#dc2626',
  profissional: '#0ea5e9',
  outro: '#94a3b8',
};

function emptyConvertidoForm() {
  return {
    nome: '',
    cpf: '',
    telefone: '',
    data_culto: new Date().toISOString().slice(0, 10),
    atendido_apos_culto: true,
    cadastrado: false,
    encontro_marcado: false,
    data_encontro: '',
    tags: [] as string[],
    observacoes: '',
  };
}

function ConvertidoModal({
  open, onClose, onSaved, allTags, initial,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  allTags: string[];
  initial?: any | null;
}) {
  const [form, setForm] = useState(emptyConvertidoForm());
  const [membro, setMembro] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const editing = !!initial?.id;

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setForm({
        nome: initial.nome || '',
        cpf: initial.cpf || '',
        telefone: initial.telefone || '',
        data_culto: initial.data_culto || new Date().toISOString().slice(0, 10),
        atendido_apos_culto: !!initial.atendido_apos_culto,
        cadastrado: !!initial.cadastrado,
        encontro_marcado: !!initial.encontro_marcado,
        data_encontro: initial.data_encontro || '',
        tags: Array.isArray(initial.tags) ? initial.tags : [],
        observacoes: initial.observacoes || '',
      });
    } else {
      setForm(emptyConvertidoForm());
    }
    setMembro(null);
  }, [open, initial]);

  function toggleTag(t: string) {
    setForm(f => ({
      ...f,
      tags: f.tags.includes(t) ? f.tags.filter(x => x !== t) : [...f.tags, t],
    }));
  }

  async function save() {
    if (!form.nome) return toast.error('Nome obrigatório');
    setSaving(true);
    try {
      const payload: any = { ...form };
      // marcar encontro implica ter data · se desmarcou, limpa a data
      if (!payload.encontro_marcado) payload.data_encontro = null;
      else if (!payload.data_encontro) payload.data_encontro = null;
      if (editing) {
        await cuidadosApi.convertidos.update(initial.id, payload);
        toast.success('Convertido atualizado');
      } else {
        if (membro) { payload.membro_id = membro.id; payload.nome = membro.nome; payload.cadastrado = true; }
        await cuidadosApi.convertidos.create(payload);
        toast.success('Convertido registrado');
      }
      onSaved();
      onClose();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? 'Editar Convertido' : 'Registrar Convertido pós-culto'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
          <div><Label>Nome *</Label><Input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} disabled={editing} /></div>
          {!editing && (
            <div><Label>CPF</Label><CpfMembroLookup value={form.cpf} onChange={v => setForm({ ...form, cpf: v })} onMembro={setMembro} /></div>
          )}
          <div><Label>Telefone</Label><Input value={form.telefone} onChange={e => setForm({ ...form, telefone: e.target.value })} /></div>
          <div><Label>Data do culto</Label><Input type="date" value={form.data_culto} onChange={e => setForm({ ...form, data_culto: e.target.value })} /></div>
          <div className="flex items-center gap-4 flex-wrap">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.atendido_apos_culto} onChange={e => setForm({ ...form, atendido_apos_culto: e.target.checked })} />Atendido após culto</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.cadastrado} onChange={e => setForm({ ...form, cadastrado: e.target.checked })} />Cadastrado</label>
          </div>
          <div className="rounded-md border border-border p-3 space-y-2" style={{ background: 'var(--cbrio-input-bg)' }}>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={form.encontro_marcado} onChange={e => setForm({ ...form, encontro_marcado: e.target.checked, data_encontro: e.target.checked ? form.data_encontro : '' })} />
              <CalendarCheck className="h-4 w-4 text-primary" />
              Encontro pastoral marcado
            </label>
            {form.encontro_marcado && (
              <div>
                <Label className="text-xs">Data do encontro</Label>
                <Input type="date" value={form.data_encontro} onChange={e => setForm({ ...form, data_encontro: e.target.value })} />
              </div>
            )}
          </div>
          <div>
            <Label>Tags pastorais</Label>
            <p className="text-xs text-muted-foreground mb-2">Marque tudo que aplica · serve pra triagem do time de cuidados.</p>
            <div className="flex flex-wrap gap-1.5">
              {allTags.map(t => {
                const active = form.tags.includes(t);
                const color = TAG_COLORS[t] || '#94a3b8';
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleTag(t)}
                    className="text-xs px-2.5 py-1 rounded-full border transition-colors"
                    style={{
                      borderColor: color,
                      background: active ? color : 'transparent',
                      color: active ? '#fff' : color,
                    }}
                  >
                    {TAG_LABELS[t] || t}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <Label>Observações</Label>
            <textarea
              className="w-full min-h-[80px] rounded-md border border-border p-2 text-sm"
              style={{ background: 'var(--cbrio-input-bg)' }}
              value={form.observacoes}
              onChange={e => setForm({ ...form, observacoes: e.target.value })}
              placeholder="Resumo da conversa, próximos passos, contexto da família, etc."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Salvando...' : editing ? 'Salvar' : 'Registrar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConvertidoDetailDialog({
  convertido, onClose, onEdit, onRemove, canEdit,
}: {
  convertido: any | null;
  onClose: () => void;
  onEdit: () => void;
  onRemove: () => void;
  canEdit: boolean;
}) {
  if (!convertido) return null;
  const c = convertido;
  const tags: string[] = Array.isArray(c.tags) ? c.tags : [];
  const fmtData = (d: string | null) =>
    d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
  const fmtCpf = (v: string | null) => {
    if (!v) return null;
    const d = String(v).replace(/\D/g, '').slice(0, 11);
    return d.length === 11
      ? d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2')
      : v;
  };

  return (
    <Dialog open={!!convertido} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-3">
            <span>{c.nome}</span>
            <div className="flex items-center gap-1 text-xs font-normal">
              {c.atendido_apos_culto ? (
                <Badge className="bg-primary/15 text-primary border-primary/30">Atendido</Badge>
              ) : (
                <Badge className="bg-warning/15 text-warning border-warning/30">Pendente</Badge>
              )}
              {c.encontro_marcado && (
                <Badge className="bg-info/15 text-info border-info/30">Encontro marcado</Badge>
              )}
              {c.cadastrado && (
                <Badge className="bg-purple-500/15 text-purple-500 border-purple-500/30">Cadastrado</Badge>
              )}
            </div>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <section>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Contato</h3>
            <dl className="grid grid-cols-2 gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">Telefone</dt>
              <dd>{c.telefone || '—'}</dd>
              <dt className="text-muted-foreground">CPF</dt>
              <dd>{fmtCpf(c.cpf) || '—'}</dd>
              <dt className="text-muted-foreground">Membro vinculado</dt>
              <dd>{c.membro_id ? 'Sim' : 'Não'}</dd>
            </dl>
          </section>

          <section>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Conversão</h3>
            <dl className="grid grid-cols-2 gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">Data do culto</dt>
              <dd>{fmtData(c.data_culto)}</dd>
              <dt className="text-muted-foreground">Registrado em</dt>
              <dd>{c.created_at ? new Date(c.created_at).toLocaleDateString('pt-BR') : '—'}</dd>
            </dl>
          </section>

          <section className="rounded-md border border-border p-3" style={{ background: 'var(--cbrio-input-bg)' }}>
            <h3 className="text-xs font-semibold uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <CalendarCheck className="h-3.5 w-3.5 text-primary" />
              Acompanhamento pastoral
            </h3>
            {c.encontro_marcado ? (
              <div className="text-sm">
                Encontro marcado para <strong className="text-primary">{fmtData(c.data_encontro)}</strong>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">Nenhum encontro marcado ainda · clique em Editar pra agendar.</div>
            )}
          </section>

          <section>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Tags pastorais</h3>
            {tags.length === 0 ? (
              <div className="text-sm text-muted-foreground">Sem tags · clique em Editar pra triagem.</div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {tags.map(t => (
                  <span key={t} className="text-xs px-2.5 py-1 rounded-full font-medium" style={{
                    background: (TAG_COLORS[t] || '#94a3b8') + '20',
                    color: TAG_COLORS[t] || '#94a3b8',
                    border: `1px solid ${(TAG_COLORS[t] || '#94a3b8')}40`,
                  }}>{TAG_LABELS[t] || t}</span>
                ))}
              </div>
            )}
          </section>

          <section>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Observações</h3>
            {c.observacoes ? (
              <p className="text-sm whitespace-pre-wrap rounded-md border border-border p-3" style={{ background: 'var(--cbrio-input-bg)' }}>
                {c.observacoes}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground italic">Sem observações registradas.</p>
            )}
          </section>
        </div>
        <DialogFooter className="flex-row justify-between sm:justify-between">
          {canEdit ? (
            <Button variant="ghost" onClick={onRemove} className="text-destructive hover:text-destructive">
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />Remover
            </Button>
          ) : <div />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Fechar</Button>
            {canEdit && <Button onClick={onEdit}>Editar</Button>}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ──────────────────────────────────────────────────────────────────
// Página principal
// ──────────────────────────────────────────────────────────────────
export default function Cuidados() {
  const { isAdmin, getAccessLevel } = useAuth();
  const podeEditarCuidados = isAdmin || (getAccessLevel?.(['cuidados']) ?? 0) >= 3;
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState(() => searchParams.get('tab') || 'dashboard');

  function handleTabChange(v: string) {
    setTab(v);
    const sp = new URLSearchParams(searchParams);
    if (v === 'dashboard') sp.delete('tab'); else sp.set('tab', v);
    setSearchParams(sp, { replace: true });
  }
  const [dash, setDash] = useState<any>(null);
  const [devMetrics, setDevMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [acomp, setAcomp] = useState<any[]>([]);
  const [jornada, setJornada] = useState<any[]>([]);
  const [convertidos, setConvertidos] = useState<any[]>([]);
  const [agregado, setAgregado] = useState<any[]>([]);
  const [agMes, setAgMes] = useState(new Date().toISOString().slice(0, 7));
  const [agArea, setAgArea] = useState('igreja');
  const [agAcons, setAgAcons] = useState('');
  const [agCapel, setAgCapel] = useState('');
  const [agDevoc, setAgDevoc] = useState('');
  const [agJorn, setAgJorn] = useState('');
  const [agConvAtend, setAgConvAtend] = useState('');

  const [modalAcomp, setModalAcomp] = useState(false);
  const [modalJornada, setModalJornada] = useState(false);
  const [modalConvert, setModalConvert] = useState(false);
  const [editConvert, setEditConvert] = useState<any | null>(null);
  const [detailConvert, setDetailConvert] = useState<any | null>(null);
  const [convertTags, setConvertTags] = useState<string[]>([]);
  const [convertSearch, setConvertSearch] = useState('');
  const [convertFilter, setConvertFilter] = useState<'todos' | 'pendentes' | 'encontro_marcado' | 'sem_encontro'>('todos');
  const [convertFilterTag, setConvertFilterTag] = useState<string>('');
  const [convertFilterFrom, setConvertFilterFrom] = useState<string>('');
  const [convertFilterTo, setConvertFilterTo] = useState<string>('');
  const [search, setSearch] = useState('');

  async function loadAll() {
    setLoading(true);
    try {
      const [d, a, j, c, ag, dm] = await Promise.all([
        cuidadosApi.dashboard().catch(() => null),
        cuidadosApi.acompanhamentos.list().catch(() => []),
        cuidadosApi.jornada180.list().catch(() => []),
        cuidadosApi.convertidos.list().catch(() => []),
        cuidadosApi.agregado.list(agMes).catch(() => []),
        devPlanosApi.metricasCuidados().catch(() => null),
      ]);
      setDash(d); setAcomp(a); setJornada(j); setConvertidos(c); setAgregado(ag); setDevMetrics(dm);
      const findT = (t: string) => (ag || []).find((r: any) => r.tipo === t);
      setAgAcons(findT('aconselhamento') ? String(findT('aconselhamento').quantidade) : '');
      setAgCapel(findT('capelania') ? String(findT('capelania').quantidade) : '');
      setAgDevoc(findT('devocional') ? String(findT('devocional').quantidade) : '');
      setAgJorn(findT('jornada180_inscricoes') ? String(findT('jornada180_inscricoes').quantidade) : '');
      setAgConvAtend(findT('novos_convertidos_atend') ? String(findT('novos_convertidos_atend').quantidade) : '');
    } finally { setLoading(false); }
  }

  useEffect(() => { loadAll(); }, []);

  // Catalogo de tags pastorais · fonte de verdade no backend
  useEffect(() => {
    cuidadosApi.convertidos.tags().then(setConvertTags).catch(() => {});
  }, []);

  const convertidosFiltrados = useMemo(() => {
    const q = convertSearch.trim().toLowerCase();
    return convertidos.filter((c: any) => {
      if (convertFilter === 'pendentes' && c.atendido_apos_culto) return false;
      if (convertFilter === 'encontro_marcado' && !c.encontro_marcado) return false;
      if (convertFilter === 'sem_encontro' && c.encontro_marcado) return false;
      if (convertFilterTag && !(Array.isArray(c.tags) && c.tags.includes(convertFilterTag))) return false;
      if (convertFilterFrom && c.data_culto < convertFilterFrom) return false;
      if (convertFilterTo && c.data_culto > convertFilterTo) return false;
      if (q) {
        const hay = `${c.nome || ''} ${c.telefone || ''} ${c.cpf || ''} ${c.observacoes || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [convertidos, convertSearch, convertFilter, convertFilterTag, convertFilterFrom, convertFilterTo]);

  const filtersActive = convertSearch || convertFilter !== 'todos' || convertFilterTag || convertFilterFrom || convertFilterTo;
  function limparFiltrosConvertidos() {
    setConvertSearch('');
    setConvertFilter('todos');
    setConvertFilterTag('');
    setConvertFilterFrom('');
    setConvertFilterTo('');
  }

  const convertPendentes = useMemo(
    () => convertidos.filter((c: any) => !c.atendido_apos_culto).length,
    [convertidos]
  );

  // Recarregar agregado quando mudar mês
  useEffect(() => {
    cuidadosApi.agregado.list(agMes).then((ag: any) => {
      setAgregado(ag);
      const findT = (t: string) => (ag || []).find((r: any) => r.tipo === t);
      setAgAcons(findT('aconselhamento') ? String(findT('aconselhamento').quantidade) : '');
      setAgCapel(findT('capelania') ? String(findT('capelania').quantidade) : '');
      setAgDevoc(findT('devocional') ? String(findT('devocional').quantidade) : '');
      setAgJorn(findT('jornada180_inscricoes') ? String(findT('jornada180_inscricoes').quantidade) : '');
      setAgConvAtend(findT('novos_convertidos_atend') ? String(findT('novos_convertidos_atend').quantidade) : '');
    }).catch(() => {});
  }, [agMes]);

  async function salvarAgregado(tipo: string, q: string) {
    try {
      await cuidadosApi.agregado.upsert({ mes: agMes, tipo, quantidade: Number(q) || 0, area: agArea });
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

      <Tabs value={tab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="acomp">Acompanhamentos</TabsTrigger>
          <TabsTrigger value="jornada">Jornada 180</TabsTrigger>
          <TabsTrigger value="convertidos">Convertidos</TabsTrigger>
          <TabsTrigger value="agregado">Mensal / Agregado</TabsTrigger>
          <TabsTrigger value="devocional">Devocional</TabsTrigger>
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

              {/* Métricas do Devocional */}
              <div className="pt-2">
                <div className="flex items-center gap-2 mb-3">
                  <BookOpen className="h-4 w-4 text-primary" />
                  <h3 className="font-semibold text-sm">Devocional</h3>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <StatisticsCard
                    title="Check-ins hoje"
                    value={devMetrics?.checkins_hoje ?? 0}
                    icon={CalendarCheck}
                    iconColor={C.primary}
                    subtitle={`${devMetrics?.adesao_hoje_pct ?? 0}% dos membros logados`}
                  />
                  <StatisticsCard
                    title="Check-ins (7 dias)"
                    value={devMetrics?.checkins_7d ?? 0}
                    icon={BookOpen}
                    iconColor={C.info}
                  />
                  <StatisticsCard
                    title="Membros engajados (30d)"
                    value={devMetrics?.membros_engajados_30d ?? 0}
                    icon={Users}
                    iconColor={C.purple}
                    subtitle={`${devMetrics?.membros_logados ?? 0} membros logaram no app`}
                  />
                  <StatisticsCard
                    title="Planos ativos"
                    value={devMetrics?.planos_ativos ?? 0}
                    icon={Sparkles}
                    iconColor={C.warn}
                  />
                </div>
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
            {podeEditarCuidados && (
              <Button onClick={() => setModalAcomp(true)}><Plus className="h-4 w-4 mr-2" />Novo</Button>
            )}
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
                      {podeEditarCuidados && a.status === 'ativo' && (
                        <Button variant="ghost" size="sm" onClick={async () => { await cuidadosApi.acompanhamentos.update(a.id, { status: 'concluido', data_encerramento: new Date().toISOString().slice(0, 10) }); loadAll(); }}>Concluir</Button>
                      )}
                      {podeEditarCuidados && (
                        <Button variant="ghost" size="sm" onClick={async () => { if (confirm('Remover?')) { await cuidadosApi.acompanhamentos.remove(a.id); loadAll(); } }}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                      )}
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
            {podeEditarCuidados && (
              <Button onClick={() => setModalJornada(true)}><Plus className="h-4 w-4 mr-2" />Registrar encontro</Button>
            )}
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
                    <TableCell className="text-right">
                      {podeEditarCuidados && (
                        <Button variant="ghost" size="sm" onClick={async () => { if (confirm('Remover?')) { await cuidadosApi.jornada180.remove(j.id); loadAll(); } }}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* Convertidos */}
        <TabsContent value="convertidos" className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm text-muted-foreground">
              <strong className="text-foreground">{convertidos.length}</strong> convertidos · {convertPendentes > 0 ? <span className="text-warning">{convertPendentes} ainda nao atendidos</span> : <span className="text-primary">todos atendidos</span>}
            </div>
            {podeEditarCuidados && (
              <Button onClick={() => { setEditConvert(null); setModalConvert(true); }}>
                <Plus className="h-4 w-4 mr-2" />Novo convertido
              </Button>
            )}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, telefone, CPF ou observacao..."
                value={convertSearch}
                onChange={e => setConvertSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select value={convertFilter} onValueChange={(v: any) => setConvertFilter(v)}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="pendentes">Pendentes de atendimento</SelectItem>
                <SelectItem value="encontro_marcado">Com encontro marcado</SelectItem>
                <SelectItem value="sem_encontro">Sem encontro marcado</SelectItem>
              </SelectContent>
            </Select>
            <Select value={convertFilterTag || '__all'} onValueChange={(v: any) => setConvertFilterTag(v === '__all' ? '' : v)}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Filtrar por tag" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">Todas as tags</SelectItem>
                {convertTags.map(t => (
                  <SelectItem key={t} value={t}>{TAG_LABELS[t] || t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1 text-xs">
              <Label className="text-xs text-muted-foreground">De</Label>
              <Input type="date" value={convertFilterFrom} onChange={e => setConvertFilterFrom(e.target.value)} className="w-36 h-9" />
              <Label className="text-xs text-muted-foreground">ate</Label>
              <Input type="date" value={convertFilterTo} onChange={e => setConvertFilterTo(e.target.value)} className="w-36 h-9" />
            </div>
            {filtersActive && (
              <Button variant="ghost" size="sm" onClick={limparFiltrosConvertidos} className="text-xs">
                Limpar filtros
              </Button>
            )}
          </div>
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Data culto</TableHead>
                  <TableHead>Atendido</TableHead>
                  <TableHead>Encontro</TableHead>
                  <TableHead>Tags</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {convertidosFiltrados.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    {convertidos.length === 0 ? 'Nenhum convertido.' : 'Nenhum resultado nos filtros atuais.'}
                  </TableCell></TableRow>
                ) : convertidosFiltrados.map(c => {
                  const tags: string[] = Array.isArray(c.tags) ? c.tags : [];
                  return (
                    <TableRow key={c.id} className={!c.atendido_apos_culto ? 'border-l-2 border-l-warning' : undefined}>
                      <TableCell className="font-medium">
                        <button
                          type="button"
                          onClick={() => setDetailConvert(c)}
                          className="text-left hover:text-primary transition-colors"
                        >
                          <div className="underline-offset-2 hover:underline">{c.nome}</div>
                          {c.telefone && <div className="text-xs text-muted-foreground">{c.telefone}</div>}
                        </button>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{new Date(c.data_culto + 'T12:00:00').toLocaleDateString('pt-BR')}</TableCell>
                      <TableCell>
                        <input type="checkbox" checked={!!c.atendido_apos_culto} disabled={!podeEditarCuidados} onChange={async e => { await cuidadosApi.convertidos.update(c.id, { atendido_apos_culto: e.target.checked }); loadAll(); }} />
                      </TableCell>
                      <TableCell>
                        {c.encontro_marcado ? (
                          <div className="flex items-center gap-1.5 text-primary text-xs">
                            <CalendarCheck className="h-3.5 w-3.5" />
                            {c.data_encontro
                              ? new Date(c.data_encontro + 'T12:00:00').toLocaleDateString('pt-BR')
                              : 'marcado'}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {tags.length === 0 ? <span className="text-xs text-muted-foreground">—</span> : (
                          <div className="flex flex-wrap gap-1">
                            {tags.slice(0, 3).map(t => (
                              <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{
                                background: (TAG_COLORS[t] || '#94a3b8') + '20',
                                color: TAG_COLORS[t] || '#94a3b8',
                              }}>{TAG_LABELS[t] || t}</span>
                            ))}
                            {tags.length > 3 && (
                              <span className="text-[10px] text-muted-foreground">+{tags.length - 3}</span>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {podeEditarCuidados && (
                          <>
                            <Button variant="ghost" size="sm" onClick={() => { setEditConvert(c); setModalConvert(true); }}>Editar</Button>
                            <Button variant="ghost" size="sm" onClick={async () => { if (confirm('Remover?')) { await cuidadosApi.convertidos.remove(c.id); loadAll(); } }}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* Agregado · totais mensais por tipo */}
        <TabsContent value="agregado" className="space-y-4">
          <p className="text-sm text-muted-foreground">Registre os totais mensais por tipo. Alimentam direto os KPIs (Aconselhamento, Capelania, Devocional, Jornada 180 e Convertidos atendidos).</p>
          <div className="flex items-center gap-3 flex-wrap">
            <Label>Mês:</Label>
            <Input type="month" value={agMes} onChange={e => setAgMes(e.target.value)} className="w-44" />
            <Label>Área:</Label>
            <Select value={agArea} onValueChange={setAgArea}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="igreja">Igreja (geral)</SelectItem>
                <SelectItem value="kids">Kids</SelectItem>
                <SelectItem value="ami">AMI</SelectItem>
                <SelectItem value="bridge">Bridge</SelectItem>
                <SelectItem value="sede">Sede</SelectItem>
                <SelectItem value="online">Online</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <div className="flex items-center gap-2"><BookOpen className="h-4 w-4 text-info" /><h3 className="font-semibold">Aconselhamentos</h3></div>
              <Input type="number" min={0} value={agAcons} onChange={e => setAgAcons(e.target.value)} placeholder="Quantidade" />
              <Button size="sm" disabled={!podeEditarCuidados} onClick={() => salvarAgregado('aconselhamento', agAcons)}>Salvar</Button>
            </div>
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <div className="flex items-center gap-2"><HandHelping className="h-4 w-4 text-warning" /><h3 className="font-semibold">Capelania</h3></div>
              <Input type="number" min={0} value={agCapel} onChange={e => setAgCapel(e.target.value)} placeholder="Quantidade" />
              <Button size="sm" disabled={!podeEditarCuidados} onClick={() => salvarAgregado('capelania', agCapel)}>Salvar</Button>
            </div>
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <div className="flex items-center gap-2"><BookOpen className="h-4 w-4" style={{ color: '#8b5cf6' }} /><h3 className="font-semibold">Devocional</h3></div>
              <Input type="number" min={0} value={agDevoc} onChange={e => setAgDevoc(e.target.value)} placeholder="Pessoas fazendo devocional" />
              <Button size="sm" disabled={!podeEditarCuidados} onClick={() => salvarAgregado('devocional', agDevoc)}>Salvar</Button>
            </div>
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <div className="flex items-center gap-2"><Users className="h-4 w-4" style={{ color: '#ef476f' }} /><h3 className="font-semibold">Jornada 180 · Inscrições</h3></div>
              <Input type="number" min={0} value={agJorn} onChange={e => setAgJorn(e.target.value)} placeholder="Inscritos no semestre" />
              <Button size="sm" disabled={!podeEditarCuidados} onClick={() => salvarAgregado('jornada180_inscricoes', agJorn)}>Salvar</Button>
            </div>
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <div className="flex items-center gap-2"><UserCheck className="h-4 w-4 text-primary" /><h3 className="font-semibold">Convertidos atendidos</h3></div>
              <Input type="number" min={0} value={agConvAtend} onChange={e => setAgConvAtend(e.target.value)} placeholder="Atendidos na semana da conversão" />
              <Button size="sm" disabled={!podeEditarCuidados} onClick={() => salvarAgregado('novos_convertidos_atend', agConvAtend)}>Salvar</Button>
            </div>
          </div>
          {agregado.length > 0 && (
            <div className="text-xs text-muted-foreground">
              Última atualização: {new Date(agregado[0].updated_at || agregado[0].created_at).toLocaleString('pt-BR')}
            </div>
          )}
        </TabsContent>

        <TabsContent value="devocional" className="space-y-4">
          <DevocionalAdmin />
        </TabsContent>

        <TabsContent value="tarefas" className="space-y-4">
          <ProcessosTarefas area="Cuidados" />
        </TabsContent>
      </Tabs>

      <AcompanhamentoModal open={modalAcomp} onClose={() => setModalAcomp(false)} onSaved={loadAll} />
      <JornadaModal open={modalJornada} onClose={() => setModalJornada(false)} onSaved={loadAll} />
      <ConvertidoModal
        open={modalConvert}
        onClose={() => { setModalConvert(false); setEditConvert(null); }}
        onSaved={loadAll}
        allTags={convertTags}
        initial={editConvert}
      />
      <ConvertidoDetailDialog
        convertido={detailConvert}
        onClose={() => setDetailConvert(null)}
        canEdit={podeEditarCuidados}
        onEdit={() => {
          setEditConvert(detailConvert);
          setDetailConvert(null);
          setModalConvert(true);
        }}
        onRemove={async () => {
          if (!detailConvert) return;
          if (!confirm(`Remover ${detailConvert.nome}?`)) return;
          await cuidadosApi.convertidos.remove(detailConvert.id);
          setDetailConvert(null);
          loadAll();
        }}
      />
    </div>
  );
}
