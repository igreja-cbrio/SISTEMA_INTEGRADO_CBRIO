import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { cuidados as cuidadosApi } from '../../api';
import useConfirmarSaida from '../../hooks/useConfirmarSaida';
import ProcessosTarefas from '../../components/ProcessosTarefas';
import DevocionalAdmin from '../../components/DevocionalAdmin';
import EncaminhamentosInbox from '../../components/EncaminhamentosInbox';
import WhatsappAutoConfig from '../../components/WhatsappAutoConfig';
import OracaoPanel from '../../components/OracaoPanel';
import CuidadosJ180 from '../../components/CuidadosJ180';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/tabs';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Badge } from '../../components/ui/badge';
import { StatisticsCard } from '../../components/ui/statistics-card';
import { Heart, Users, UserCheck, CheckCircle2, Plus, Trash2, Loader2, Search, Sparkles, CalendarCheck, CalendarPlus, ClipboardCheck, ArrowRight, Phone, MessageSquare, AlertTriangle, HeartHandshake } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';

const C = { primary: '#00B39D', info: '#3b82f6', warn: '#f59e0b', purple: '#8b5cf6', pink: '#ef476f' };

// Filtro de período do dashboard (bate com DASH_DIAS_VALIDOS no backend)
const DASH_PERIODOS = [
  { dias: 30, label: '30 dias' },
  { dias: 60, label: '60 dias' },
  { dias: 90, label: '90 dias' },
  { dias: 180, label: '180 dias' },
  { dias: 365, label: '1 ano' },
  { dias: 1825, label: '5 anos' },
];
const MESES_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
// Rótulo do eixo X conforme a granularidade vinda do backend (dia/semana = DD/MM · mes = mmm/AA)
function fmtPeriodo(v: string, gran: string) {
  if (!v) return '';
  if (gran === 'mes') {
    const [y, m] = v.split('-');
    return `${MESES_PT[Number(m) - 1] || m}/${String(y).slice(2)}`;
  }
  const [, m, d] = v.split('-');
  return `${d}/${m}`;
}

// Pedidos de Cuidados vindos do app
const PEDIDO_META: Record<string, { label: string; color: string }> = {
  sos: { label: 'SOS', color: '#ef4444' },
  aconselhamento: { label: 'Aconselhamento', color: '#f59e0b' },
  oracao: { label: 'Oração', color: '#00B39D' },
};
const TRAT_LABEL: Record<string, string> = {
  pendente: 'Pendente', em_andamento: 'Em andamento', concluido: 'Concluído',
};

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

function emptyAcompForm() {
  return {
    nome: '', cpf: '', telefone: '', tipo: 'aconselhamento', motivo: '', observacoes: '',
    agendar: false, agendamento_data: '', agendamento_hora: '', agendamento_responsavel_id: '',
  };
}

// Atendimento pastoral (aconselhamento ou capelania) · pode agendar a sessão,
// que aparece no calendário de "Visitas agendadas". Recebe pelo app, WhatsApp
// ou input manual do pastor. allTags não se aplica aqui (triagem é dos convertidos).
function AcompanhamentoModal({ open, onClose, onSaved, atendentes, initial }: {
  open: boolean; onClose: () => void; onSaved: () => void; atendentes: any[]; initial?: any | null;
}) {
  const editing = !!initial?.id;
  const [form, setForm] = useState(emptyAcompForm());
  const [membro, setMembro] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const snapRef = useRef<string>(JSON.stringify(emptyAcompForm()));
  useEffect(() => {
    if (!open) return;
    const next = initial ? {
      nome: initial.nome || '',
      cpf: initial.cpf || '',
      telefone: initial.telefone || '',
      tipo: initial.tipo || 'aconselhamento',
      motivo: initial.motivo || '',
      observacoes: initial.observacoes || '',
      agendar: !!initial.agendamento_data,
      agendamento_data: initial.agendamento_data || '',
      agendamento_hora: initial.agendamento_hora ? String(initial.agendamento_hora).slice(0, 5) : '',
      agendamento_responsavel_id: initial.agendamento_responsavel_id || '',
    } : emptyAcompForm();
    setForm(next);
    setMembro(null);
    snapRef.current = JSON.stringify(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

  const temAlteracoes = JSON.stringify(form) !== snapRef.current;
  const { tentarFechar } = useConfirmarSaida(temAlteracoes, onClose);

  const respForaDaLista = !!form.agendamento_responsavel_id && !atendentes.some((u: any) => u.id === form.agendamento_responsavel_id);

  async function save() {
    if (!form.nome) return toast.error('Nome obrigatório');
    if (form.agendar && !form.agendamento_data) return toast.error('Escolha a data da sessão');
    setSaving(true);
    try {
      const u = atendentes.find((x: any) => x.id === form.agendamento_responsavel_id);
      const payload: any = {
        telefone: form.telefone, tipo: form.tipo, motivo: form.motivo, observacoes: form.observacoes,
        agendamento_data: form.agendar ? form.agendamento_data : null,
        agendamento_hora: form.agendar ? (form.agendamento_hora || null) : null,
        agendamento_responsavel_id: form.agendar ? (form.agendamento_responsavel_id || null) : null,
        agendamento_responsavel_nome: form.agendar
          ? (u?.name || (form.agendamento_responsavel_id === initial?.agendamento_responsavel_id ? initial?.agendamento_responsavel_nome : null) || null)
          : null,
      };
      if (editing) {
        await cuidadosApi.acompanhamentos.update(initial.id, payload);
        toast.success('Atendimento atualizado');
      } else {
        payload.nome = form.nome;
        if (form.cpf) payload.cpf = form.cpf;
        if (!membro && form.cpf.replace(/\D/g, '').length === 11) {
          const novo = await cuidadosApi.criarMembro({ nome: form.nome, telefone: form.telefone });
          payload.membro_id = novo.id;
        } else if (membro) {
          payload.membro_id = membro.id; payload.nome = membro.nome;
        }
        await cuidadosApi.acompanhamentos.create(payload);
        toast.success('Atendimento registrado');
      }
      onSaved();
      onClose();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) tentarFechar(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{editing ? 'Editar atendimento' : 'Novo atendimento pastoral'}</DialogTitle></DialogHeader>
        <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
          <div>
            <Label>Tipo</Label>
            <div className="flex gap-2 mt-1">
              <Button type="button" size="sm" variant={form.tipo === 'aconselhamento' ? 'default' : 'outline'} onClick={() => setForm({ ...form, tipo: 'aconselhamento' })}>Aconselhamento</Button>
              <Button type="button" size="sm" variant={form.tipo === 'capelania' ? 'default' : 'outline'} onClick={() => setForm({ ...form, tipo: 'capelania' })}>Capelania</Button>
            </div>
          </div>
          <div><Label>Nome *</Label><Input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} disabled={editing} /></div>
          {!editing && (
            <div><Label>CPF</Label><CpfMembroLookup value={form.cpf} onChange={v => setForm({ ...form, cpf: v })} onMembro={setMembro} /></div>
          )}
          <div><Label>Telefone</Label><Input value={form.telefone} onChange={e => setForm({ ...form, telefone: e.target.value })} /></div>
          <div>
            <Label>Motivo</Label>
            <Select value={form.motivo || '__none'} onValueChange={v => setForm({ ...form, motivo: v === '__none' ? '' : v })}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Sem motivo</SelectItem>
                <SelectItem value="luto">Luto</SelectItem>
                <SelectItem value="casal">Casal</SelectItem>
                <SelectItem value="espiritual">Espiritual</SelectItem>
                <SelectItem value="financeiro">Financeiro</SelectItem>
                <SelectItem value="saude">Saúde</SelectItem>
                <SelectItem value="outro">Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-md border border-border p-2.5" style={{ background: 'var(--cbrio-input-bg)' }}>
            <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
              <input type="checkbox" checked={form.agendar} onChange={e => setForm({ ...form, agendar: e.target.checked })} />
              <CalendarPlus className="h-3.5 w-3.5 text-primary" />Agendar sessão
              <span className="text-xs text-muted-foreground font-normal">· entra nas Visitas agendadas</span>
            </label>
            {form.agendar && (
              <div className="space-y-2 mt-2">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Data *</Label><Input type="date" value={form.agendamento_data} onChange={e => setForm({ ...form, agendamento_data: e.target.value })} /></div>
                  <div><Label>Hora</Label><Input type="time" value={form.agendamento_hora} onChange={e => setForm({ ...form, agendamento_hora: e.target.value })} /></div>
                </div>
                <div>
                  <Label>Quem vai atender</Label>
                  <Select value={form.agendamento_responsavel_id || '__none'} onValueChange={v => setForm({ ...form, agendamento_responsavel_id: v === '__none' ? '' : v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione o líder" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">A definir</SelectItem>
                      {respForaDaLista && <SelectItem value={form.agendamento_responsavel_id}>{initial?.agendamento_responsavel_nome || 'Responsável atual'}</SelectItem>}
                      {atendentes.map((u: any) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>
          <div><Label>Observações</Label><Input value={form.observacoes} onChange={e => setForm({ ...form, observacoes: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={tentarFechar}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Salvando...' : editing ? 'Salvar' : 'Registrar'}</Button>
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

const ENCONTRO_STATUS: Record<string, { label: string; color: string }> = {
  agendado:  { label: 'Agendado',  color: '#3b82f6' },
  realizado: { label: 'Realizado', color: '#10b981' },
  faltou:    { label: 'Faltou',    color: '#ef4444' },
  cancelado: { label: 'Cancelado', color: '#6b7280' },
};

// Semáforo da jornada (contato/batismo/Next) · espelha o JornadaConvertidos
const JORNADA_ST: Record<string, { label: string; color: string }> = {
  feito:          { label: 'Feito',        color: '#10b981' },
  feito_no_prazo: { label: 'No prazo',     color: '#10b981' },
  feito_atrasado: { label: 'Feito (fora)', color: '#0ea5e9' },
  inscrito:       { label: 'Inscrito',     color: '#3b82f6' },
  no_prazo:       { label: 'No prazo',     color: '#94a3b8' },
  vencendo:       { label: 'Vencendo',     color: '#f59e0b' },
  atrasado:       { label: 'Atrasado',     color: '#ef4444' },
};
function JornadaPill({ label, m }: { label: string; m: any }) {
  const st = JORNADA_ST[m?.status] || JORNADA_ST.no_prazo;
  return (
    <span title={`${label}: ${st.label}`} className="text-[10px] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap"
      style={{ background: st.color + '20', color: st.color, border: `1px solid ${st.color}40` }}>
      {label}{m?.feito ? ' ✓' : ''}
    </span>
  );
}

// destinos do encaminhamento da jornada · mapeiam pros próximos valores
const DESTINOS_ENC = [
  { v: 'jornada180',  l: 'Jornada 180', sub: 'firmar na fé (Investir)' },
  { v: 'grupos',      l: 'Grupos',      sub: 'conectar / comunidade' },
  { v: 'voluntarios', l: 'Voluntários', sub: 'servir' },
];

function emptyConvertidoForm() {
  return {
    nome: '',
    cpf: '',
    telefone: '',
    data_culto: new Date().toISOString().slice(0, 10),
    atendido_apos_culto: true,
    cadastrado: false,
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

  // Snapshot tirado sobre o MESMO objeto que popula o form (dentro do effect
  // de abertura/edição) · refeito a cada open/initial · membro (lookup) fora.
  const snapRef = useRef<string>(JSON.stringify(emptyConvertidoForm()));

  useEffect(() => {
    if (!open) return;
    const next = initial
      ? {
          nome: initial.nome || '',
          cpf: initial.cpf || '',
          telefone: initial.telefone || '',
          data_culto: initial.data_culto || new Date().toISOString().slice(0, 10),
          atendido_apos_culto: !!initial.atendido_apos_culto,
          cadastrado: !!initial.cadastrado,
          tags: Array.isArray(initial.tags) ? initial.tags : [],
          observacoes: initial.observacoes || '',
        }
      : emptyConvertidoForm();
    setForm(next);
    setMembro(null);
    snapRef.current = JSON.stringify(next);
  }, [open, initial]);

  const temAlteracoes = JSON.stringify(form) !== snapRef.current;
  const { tentarFechar } = useConfirmarSaida(temAlteracoes, onClose);

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
    <Dialog open={open} onOpenChange={(v) => { if (!v) tentarFechar(); }}>
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
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.cadastrado} onChange={e => setForm({ ...form, cadastrado: e.target.checked })} />Cadastrado</label>
          </div>
          <p className="text-xs text-muted-foreground rounded-md border border-border p-2.5" style={{ background: 'var(--cbrio-input-bg)' }}>
            <CalendarPlus className="h-3.5 w-3.5 text-primary inline mr-1" />
            O encontro pastoral (data, hora e quem vai atender) é agendado pelo botão <strong>Agendar encontro</strong> na lista ou na ficha da pessoa.
          </p>
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
          <Button variant="outline" onClick={tentarFechar}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Salvando...' : editing ? 'Salvar' : 'Registrar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConvertidoDetailDialog({
  convertido, onClose, onEdit, onRemove, onAgendar, onDesfecho, canEdit,
}: {
  convertido: any | null;
  onClose: () => void;
  onEdit: () => void;
  onRemove: () => void;
  onAgendar: () => void;
  onDesfecho: () => void;
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

          <section className="rounded-md border border-border p-3 space-y-2" style={{ background: 'var(--cbrio-input-bg)' }}>
            <h3 className="text-xs font-semibold uppercase tracking-wide flex items-center gap-1.5">
              <CalendarCheck className="h-3.5 w-3.5 text-primary" />
              Encontro pastoral
            </h3>
            {c.encontro_marcado ? (
              <div className="text-sm space-y-0.5">
                <div>Quando: <strong className="text-primary">{fmtData(c.data_encontro)}{c.encontro_hora ? ' · ' + String(c.encontro_hora).slice(0, 5) : ''}</strong></div>
                {c.encontro_responsavel_nome && <div>Quem atende: <strong>{c.encontro_responsavel_nome}</strong></div>}
                {c.encontro_status && (
                  <div>Status: <span style={{ color: ENCONTRO_STATUS[c.encontro_status]?.color }} className="font-medium">{ENCONTRO_STATUS[c.encontro_status]?.label || c.encontro_status}</span>
                    {c.encontro_status === 'realizado' && c.encontro_compareceu === false && ' · não compareceu'}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">Nenhum encontro agendado ainda.</div>
            )}
            {canEdit && (
              <div className="flex gap-2 pt-1 flex-wrap">
                <Button size="sm" variant="outline" onClick={onAgendar}>
                  <CalendarPlus className="h-3.5 w-3.5 mr-1" />{c.encontro_marcado ? 'Reagendar' : 'Agendar encontro'}
                </Button>
                {c.encontro_status === 'agendado' && (
                  <Button size="sm" onClick={onDesfecho}>
                    <ClipboardCheck className="h-3.5 w-3.5 mr-1" />Registrar desfecho
                  </Button>
                )}
              </div>
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

// Agendar visita pastoral · data + hora + quem vai atender (notifica o líder).
// É o "primeiro contato", o diferencial pedido pelo Marcos. A visita aparece
// no calendário da aba "Visitas agendadas". Só líderes de culto e de
// ministérios podem atender (lista vem filtrada por cargo do backend).
function AgendarEncontroModal({ open, convertido, atendentes, onClose, onSaved }: {
  open: boolean; convertido: any | null; atendentes: any[]; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({ data_encontro: '', encontro_hora: '', responsavel_id: '' });
  const [saving, setSaving] = useState(false);

  // Snapshot tirado sobre o MESMO objeto que popula o form ao abrir/reabrir
  // com outro convertido · baseline = form já populado.
  const snapRef = useRef<string>(JSON.stringify({ data_encontro: '', encontro_hora: '', responsavel_id: '' }));

  useEffect(() => {
    if (open && convertido) {
      const next = {
        data_encontro: convertido.data_encontro || new Date().toISOString().slice(0, 10),
        encontro_hora: convertido.encontro_hora ? String(convertido.encontro_hora).slice(0, 5) : '',
        responsavel_id: convertido.encontro_responsavel_id || '',
      };
      setForm(next);
      snapRef.current = JSON.stringify(next);
    }
  }, [open, convertido]);

  const temAlteracoes = JSON.stringify(form) !== snapRef.current;
  const { tentarFechar } = useConfirmarSaida(temAlteracoes, onClose);

  // Visita antiga pode ter responsável fora da lista atual de atendentes ·
  // mantém a opção visível pra não perder o vínculo ao reagendar.
  const responsavelForaDaLista =
    !!form.responsavel_id && !atendentes.some((u: any) => u.id === form.responsavel_id);

  async function save() {
    if (!form.data_encontro) return toast.error('Escolha a data da visita');
    setSaving(true);
    try {
      const u = atendentes.find((x: any) => x.id === form.responsavel_id);
      const nomeAtual = form.responsavel_id === convertido.encontro_responsavel_id
        ? convertido.encontro_responsavel_nome : null;
      await cuidadosApi.convertidos.agendarEncontro(convertido.id, {
        data_encontro: form.data_encontro,
        encontro_hora: form.encontro_hora || null,
        encontro_responsavel_id: form.responsavel_id || null,
        encontro_responsavel_nome: u?.name || nomeAtual || null,
      });
      toast.success('Visita agendada');
      onSaved(); onClose();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  if (!convertido) return null;
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) tentarFechar(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Agendar visita — {convertido.nome}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Data *</Label><Input type="date" value={form.data_encontro} onChange={e => setForm({ ...form, data_encontro: e.target.value })} /></div>
            <div><Label>Hora</Label><Input type="time" value={form.encontro_hora} onChange={e => setForm({ ...form, encontro_hora: e.target.value })} /></div>
          </div>
          <div>
            <Label>Quem vai atender</Label>
            <Select value={form.responsavel_id || '__none'} onValueChange={(v) => setForm({ ...form, responsavel_id: v === '__none' ? '' : v })}>
              <SelectTrigger><SelectValue placeholder="Selecione o líder" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">A definir</SelectItem>
                {responsavelForaDaLista && (
                  <SelectItem value={form.responsavel_id}>{convertido.encontro_responsavel_nome || 'Responsável atual'}</SelectItem>
                )}
                {atendentes.map((u: any) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">Só líderes de culto e de ministérios podem atender convertidos.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={tentarFechar}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Salvando...' : 'Agendar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Desfecho da visita · compareceu? + tags pastorais + encaminhamento + observações,
// tudo num modal só (decisão do Marcos 2026-06-10: o líder preenche tudo ali).
// Sem "não converteu": ninguém é interrompido · toda pessoa sai com uma indicação.
function DesfechoModal({ open, convertido, allTags, onClose, onSaved }: {
  open: boolean; convertido: any | null; allTags: string[]; onClose: () => void; onSaved: () => void;
}) {
  const [compareceu, setCompareceu] = useState(true);
  const [destinos, setDestinos] = useState<Record<string, boolean>>({});
  const [notas, setNotas] = useState<Record<string, string>>({});
  const [tags, setTags] = useState<string[]>([]);
  const [obs, setObs] = useState('');
  const [saving, setSaving] = useState(false);

  // Snapshot = exatamente os valores do reset feito ao abrir (effect abaixo).
  const snapRef = useRef<string>(
    JSON.stringify({ compareceu: true, destinos: {}, notas: {}, tags: [], obs: '' })
  );

  useEffect(() => {
    if (open) {
      // Tags já marcadas na ficha + encaminhamentos já feitos entram pré-preenchidos
      // (reabrir pra completar pendência não some com o que já existe).
      const tagsIniciais: string[] = Array.isArray(convertido?.tags) ? convertido.tags : [];
      const destinosIniciais: Record<string, boolean> = {};
      (Array.isArray(convertido?.destinos_existentes) ? convertido.destinos_existentes : [])
        .forEach((d: string) => { destinosIniciais[d] = true; });
      setCompareceu(true); setDestinos(destinosIniciais); setNotas({}); setTags(tagsIniciais); setObs('');
      snapRef.current = JSON.stringify({ compareceu: true, destinos: destinosIniciais, notas: {}, tags: tagsIniciais, obs: '' });
    }
  }, [open, convertido]);

  const temAlteracoes = JSON.stringify({ compareceu, destinos, notas, tags, obs }) !== snapRef.current;
  const { tentarFechar } = useConfirmarSaida(temAlteracoes, onClose);

  function toggleTag(t: string) {
    setTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  }

  async function save() {
    if (compareceu && !DESTINOS_ENC.some(d => destinos[d.v])) {
      return toast.error('Toda pessoa sai com uma indicação · escolha ao menos um próximo passo');
    }
    if (compareceu && tags.length === 0) {
      return toast.error('Marque ao menos uma tag pastoral · ela orienta a triagem do cuidado');
    }
    setSaving(true);
    try {
      const encaminhamentos = compareceu
        ? DESTINOS_ENC.filter(d => destinos[d.v]).map(d => ({ destino: d.v, observacao: notas[d.v]?.trim() || null }))
        : [];
      await cuidadosApi.convertidos.desfecho(convertido.id, { compareceu, encaminhamentos, observacoes: obs.trim() || null, tags });
      toast.success('Desfecho registrado');
      onSaved(); onClose();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  if (!convertido) return null;
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) tentarFechar(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Desfecho da visita — {convertido.nome}</DialogTitle></DialogHeader>
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <div>
            <Label>A pessoa compareceu?</Label>
            <div className="flex gap-2 mt-1">
              <Button type="button" variant={compareceu ? 'default' : 'outline'} size="sm" onClick={() => setCompareceu(true)}>Compareceu</Button>
              <Button type="button" variant={!compareceu ? 'default' : 'outline'} size="sm" onClick={() => setCompareceu(false)}>Faltou</Button>
            </div>
            {!compareceu && <p className="text-xs text-muted-foreground mt-1">Faltou · você pode reagendar depois pela ficha.</p>}
          </div>

          {compareceu && (
            <div>
              <Label>Tags pastorais <span className="text-muted-foreground font-normal">(o que apareceu na conversa · mínimo 1)</span></Label>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {allTags.map(t => {
                  const active = tags.includes(t);
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
          )}

          {compareceu && (
            <div className="space-y-2">
              <Label>Pra onde encaminhar? <span className="text-muted-foreground font-normal">(toda pessoa sai com uma indicação)</span></Label>
              {DESTINOS_ENC.map(d => (
                <div key={d.v} className="rounded-md border border-border p-2.5" style={{ background: 'var(--cbrio-input-bg)' }}>
                  <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                    <input type="checkbox" checked={!!destinos[d.v]} onChange={e => setDestinos(s => ({ ...s, [d.v]: e.target.checked }))} />
                    <ArrowRight className="h-3.5 w-3.5 text-primary" />{d.l}
                    <span className="text-xs text-muted-foreground font-normal">· {d.sub}</span>
                  </label>
                  {destinos[d.v] && (
                    <Input className="mt-2" placeholder="Observação discreta (opcional)" value={notas[d.v] || ''} onChange={e => setNotas(s => ({ ...s, [d.v]: e.target.value }))} />
                  )}
                </div>
              ))}
            </div>
          )}

          <div>
            <Label>Observações <span className="text-muted-foreground font-normal">(ficam na ficha · opcional)</span></Label>
            <textarea className="w-full min-h-[64px] rounded-md border border-border p-2 text-sm" style={{ background: 'var(--cbrio-input-bg)' }}
              value={obs} onChange={e => setObs(e.target.value)} placeholder="Resumo da visita, contexto, próximos passos..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={tentarFechar}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Salvando...' : 'Salvar desfecho'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Visitas passadas com pendência: toda pessoa visitada precisa sair com
// desfecho + ≥1 tag pastoral + ≥1 encaminhamento. Aparece abaixo do calendário
// da aba "Visitas agendadas".
const PENDENCIA_LABELS: Record<string, string> = {
  desfecho: 'Sem desfecho',
  tag: 'Sem tag pastoral',
  encaminhamento: 'Sem encaminhamento',
};

function VisitasPendentesSection({ itens, canEdit, onResolver, onFicha }: {
  itens: any[]; canEdit: boolean; onResolver: (c: any) => void; onFicha: (c: any) => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-1">
        <AlertTriangle className="h-4 w-4 text-warning" />
        <h3 className="font-semibold text-sm">Visitas passadas sem encaminhamento</h3>
        {itens.length > 0 && (
          <Badge variant="destructive" className="ml-1">{itens.length}</Badge>
        )}
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Toda pessoa visitada precisa sair com desfecho registrado, ao menos uma tag pastoral e um encaminhamento. Estas visitas já aconteceram e ainda têm pendência.
      </p>
      {itens.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma pendência · todas as visitas passadas foram encaminhadas.</p>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pessoa</TableHead>
                <TableHead>Visita</TableHead>
                <TableHead>Quem atendeu</TableHead>
                <TableHead>Pendências</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {itens.map((c: any) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">
                    <button type="button" onClick={() => onFicha(c)} className="text-left hover:text-primary transition-colors">
                      <div className="underline-offset-2 hover:underline">{c.nome}</div>
                      {c.telefone && <div className="text-xs text-muted-foreground">{c.telefone}</div>}
                    </button>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {c.data_encontro ? new Date(c.data_encontro + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                    {c.encontro_hora ? ' · ' + String(c.encontro_hora).slice(0, 5) : ''}
                  </TableCell>
                  <TableCell className="text-sm">{c.encontro_responsavel_nome || '—'}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(c.pendencias || []).map((p: string) => (
                        <Badge key={p} className="bg-warning/15 text-warning border-warning/30">{PENDENCIA_LABELS[p] || p}</Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {canEdit && (
                      <Button size="sm" variant="outline" onClick={() => onResolver(c)}>
                        <ClipboardCheck className="h-3.5 w-3.5 mr-1" />
                        {c.encontro_status === 'agendado' ? 'Registrar desfecho' : 'Completar'}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Página principal
// ──────────────────────────────────────────────────────────────────
export default function Cuidados() {
  const { isAdmin, getAccessLevel } = useAuth();
  const podeEditarCuidados = isAdmin || (getAccessLevel?.(['cuidados']) ?? 0) >= 3;
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState(() => {
    const t = searchParams.get('tab') || 'dashboard';
    if (t === 'tarefas') return 'visitas'; // legado · aba renomeada pra "Visitas agendadas"
    if (t === 'primeiros-passos') return 'convertidos'; // legado · fundida em "Próximos passos"
    return t;
  });

  function handleTabChange(v: string) {
    setTab(v);
    const sp = new URLSearchParams(searchParams);
    if (v === 'dashboard') sp.delete('tab'); else sp.set('tab', v);
    setSearchParams(sp, { replace: true });
  }
  const [dashSeries, setDashSeries] = useState<any>(null);
  const [dashDias, setDashDias] = useState(90);
  const [dashLoading, setDashLoading] = useState(true);

  const [acomp, setAcomp] = useState<any[]>([]);
  const [pedidosApp, setPedidosApp] = useState<any[]>([]);
  const [convertidos, setConvertidos] = useState<any[]>([]);
  const [jornadaData, setJornadaData] = useState<any>(null); // /jornada-convertidos · status contato/batismo/Next por pessoa

  const [modalAcomp, setModalAcomp] = useState(false);
  const [editAcomp, setEditAcomp] = useState<any | null>(null);
  const [modalConvert, setModalConvert] = useState(false);
  const [editConvert, setEditConvert] = useState<any | null>(null);
  const [detailConvert, setDetailConvert] = useState<any | null>(null);
  const [agendarConv, setAgendarConv] = useState<any | null>(null);
  const [desfechoConv, setDesfechoConv] = useState<any | null>(null);
  const [atendentes, setAtendentes] = useState<any[]>([]);
  const [visitasPendentes, setVisitasPendentes] = useState<any[]>([]);
  const [visitasVersion, setVisitasVersion] = useState(0);
  const [convertTags, setConvertTags] = useState<string[]>([]);
  const [convertSearch, setConvertSearch] = useState('');
  const [convertFilter, setConvertFilter] = useState<'todos' | 'pendentes' | 'atendidos' | 'encontro_marcado' | 'sem_encontro' | 'aguardando_desfecho' | 'atrasados'>('todos');
  const [convertFilterTag, setConvertFilterTag] = useState<string>('');
  const [convertFilterFrom, setConvertFilterFrom] = useState<string>('');
  const [convertFilterTo, setConvertFilterTo] = useState<string>('');
  const [search, setSearch] = useState('');

  async function loadAll() {
    const [a, pa, c, jd] = await Promise.all([
      cuidadosApi.acompanhamentos.list().catch(() => []),
      cuidadosApi.pedidosApp.list().catch(() => []),
      cuidadosApi.convertidos.list().catch(() => []),
      cuidadosApi.jornadaConvertidos().catch(() => null),
    ]);
    setAcomp(a); setPedidosApp(pa); setConvertidos(c); setJornadaData(jd);
    // Sinaliza o calendário de visitas + recarrega as pendências
    setVisitasVersion(v => v + 1);
    cuidadosApi.convertidos.visitasPendentes().then(setVisitasPendentes).catch(() => {});
  }

  useEffect(() => { loadAll(); }, []);

  // Catalogo de tags pastorais · fonte de verdade no backend
  useEffect(() => {
    cuidadosApi.convertidos.tags().then(setConvertTags).catch(() => {});
  }, []);

  // Atendentes elegíveis (líderes de culto e de ministérios · filtrado por
  // cargo no backend) · select de "quem vai atender" no agendamento da visita
  useEffect(() => {
    cuidadosApi.convertidos.atendentes().then(setAtendentes).catch(() => {});
  }, []);

  // Séries do dashboard novo · recarrega ao trocar o período ou quando os dados mudam
  useEffect(() => {
    setDashLoading(true);
    cuidadosApi.dashboardSeries({ dias: dashDias })
      .then(setDashSeries).catch(() => setDashSeries(null)).finally(() => setDashLoading(false));
  }, [dashDias, visitasVersion]);

  // Visitas agendadas da semana · une os encontros de convertido + as sessões de
  // aconselhamento/capelania agendadas no mesmo calendário.
  const fetchVisitasSemana = useCallback(async (di: string, df: string) => {
    const [convs, acomps] = await Promise.all([
      cuidadosApi.convertidos.list({ encontro_from: di, encontro_to: df }).catch(() => []),
      cuidadosApi.acompanhamentos.list({ agendamento_from: di, agendamento_to: df }).catch(() => []),
    ]);
    const evConv = (convs || []).map((c: any) => ({
      id: c.id, tipoEvento: 'convertido',
      data: c.data_encontro, horario: c.encontro_hora,
      titulo: c.nome,
      subtitulo: c.encontro_responsavel_nome || 'Atendente a definir',
      cor: ENCONTRO_STATUS[c.encontro_status]?.color || C.info,
      statusLabel: ENCONTRO_STATUS[c.encontro_status]?.label || c.encontro_status,
      raw: c,
    }));
    const evAcomp = (acomps || []).map((a: any) => ({
      id: a.id, tipoEvento: 'acompanhamento',
      data: a.agendamento_data, horario: a.agendamento_hora,
      titulo: a.nome,
      subtitulo: a.agendamento_responsavel_nome || (a.tipo === 'capelania' ? 'Capelania' : 'Aconselhamento'),
      cor: C.purple,
      statusLabel: a.tipo === 'capelania' ? 'Capelania' : 'Aconselhamento',
      raw: a,
    }));
    return [...evConv, ...evAcomp];
  }, []);

  // Checkbox "Atendido" otimista: responde na hora · rollback + toast se falhar.
  // (Antes esperava o PATCH + recarga completa da página sem feedback — parecia travado.)
  async function marcarAtendido(id: string, checked: boolean) {
    setConvertidos(prev => prev.map((x: any) => x.id === id ? { ...x, atendido_apos_culto: checked } : x));
    try {
      await cuidadosApi.convertidos.update(id, { atendido_apos_culto: checked });
    } catch (e: any) {
      setConvertidos(prev => prev.map((x: any) => x.id === id ? { ...x, atendido_apos_culto: !checked } : x));
      toast.error(`Não foi possível atualizar o atendimento: ${e.message}`);
    }
  }

  // Jornada por pessoa (contato/batismo/Next) indexada por id do convertido
  const jMap = useMemo(() => {
    const m = new Map<string, any>();
    (jornadaData?.itens || []).forEach((i: any) => m.set(i.id, i));
    return m;
  }, [jornadaData]);

  async function marcarContato(id: string) {
    try {
      await cuidadosApi.convertidos.registrarContato(id);
      toast.success('Contato registrado');
      loadAll();
    } catch (e: any) { toast.error(e.message); }
  }

  const convertidosFiltrados = useMemo(() => {
    const q = convertSearch.trim().toLowerCase();
    return convertidos.filter((c: any) => {
      if (convertFilter === 'pendentes' && c.atendido_apos_culto) return false;
      if (convertFilter === 'atendidos' && !c.atendido_apos_culto) return false;
      if (convertFilter === 'encontro_marcado' && !c.encontro_marcado) return false;
      if (convertFilter === 'sem_encontro' && c.encontro_marcado) return false;
      if (convertFilter === 'aguardando_desfecho' && c.encontro_status !== 'agendado') return false;
      if (convertFilter === 'atrasados') {
        const j = jMap.get(c.id);
        if (!(j && [j.contato, j.batismo, j.next].some((m: any) => m?.status === 'atrasado'))) return false;
      }
      if (convertFilterTag && !(Array.isArray(c.tags) && c.tags.includes(convertFilterTag))) return false;
      if (convertFilterFrom && c.data_culto < convertFilterFrom) return false;
      if (convertFilterTo && c.data_culto > convertFilterTo) return false;
      if (q) {
        const hay = `${c.nome || ''} ${c.telefone || ''} ${c.cpf || ''} ${c.observacoes || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [convertidos, convertSearch, convertFilter, convertFilterTag, convertFilterFrom, convertFilterTo, jMap]);

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

  const acompFiltrados = useMemo(() => {
    if (!search) return acomp;
    return acomp.filter(a => (a.nome || '').toLowerCase().includes(search.toLowerCase()));
  }, [acomp, search]);

  const pedidosPendentes = useMemo(
    () => pedidosApp.filter((p: any) => p.tratamento_status === 'pendente').length,
    [pedidosApp]
  );

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Heart className="h-6 w-6 text-primary" /> Cuidados</h1>
        <p className="text-sm text-muted-foreground mt-1">Acompanhamentos pastorais, Jornada 180, capelania, aconselhamento e convertidos pós-culto.</p>
      </div>

      <Tabs value={tab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="acomp">Aconselhamento</TabsTrigger>
          <TabsTrigger value="jornada">Jornada 180</TabsTrigger>
          <TabsTrigger value="convertidos">Próximos passos</TabsTrigger>
          <TabsTrigger value="devocional">Devocional</TabsTrigger>
          <TabsTrigger value="visitas">Visitas agendadas</TabsTrigger>
        </TabsList>

        {/* Dashboard */}
        <TabsContent value="dashboard" className="space-y-5">
          {/* Filtro de período */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-muted-foreground">Período:</span>
            {DASH_PERIODOS.map(p => (
              <Button key={p.dias} size="sm" variant={dashDias === p.dias ? 'default' : 'outline'} onClick={() => setDashDias(p.dias)}>
                {p.label}
              </Button>
            ))}
          </div>

          {dashLoading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : !dashSeries ? (
            <p className="text-sm text-muted-foreground text-center py-12">Não foi possível carregar os indicadores.</p>
          ) : (
            <>
              {/* 5 cards de cobertura dos convertidos */}
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                <StatisticsCard title="Convertidos presencial" value={dashSeries.cards.conv_presencial_total} icon={UserCheck} iconColor={C.primary} />
                <StatisticsCard title="Com dados · presencial" value={dashSeries.cards.conv_presencial_com_dados} icon={Phone} iconColor={C.info} subtitle="dá pra contatar" />
                <StatisticsCard title="Convertidos online" value={dashSeries.cards.conv_online_total} icon={Users} iconColor={C.purple} />
                <StatisticsCard title="Com dados · online" value={dashSeries.cards.conv_online_com_dados} icon={Phone} iconColor={C.pink} subtitle="dá pra contatar" />
                <StatisticsCard title="% com dados" value={`${dashSeries.cards.pct_com_dados}%`} icon={CheckCircle2} iconColor={C.warn} subtitle="do total de convertidos" />
              </div>

              {/* Gráfico 1 · funil do cuidado (a ponte pros outros valores) */}
              <div className="rounded-lg border border-border bg-card p-4">
                <h3 className="font-semibold text-sm mb-1">Convertidos → 1º contato → engajados em +1 valor</h3>
                <p className="text-xs text-muted-foreground mb-3">
                  O gargalo do cuidado: de quem se converteu, com quantos a gente falou e quantos seguiram pra outro valor (grupo, voluntário, Jornada 180).
                </p>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={dashSeries.funil} margin={{ top: 8, right: 16, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--cbrio-border)" />
                    <XAxis dataKey="periodo" tickFormatter={(v) => fmtPeriodo(v, dashSeries.gran_trend)} fontSize={11} />
                    <YAxis allowDecimals={false} fontSize={11} />
                    <Tooltip labelFormatter={(v) => fmtPeriodo(v as string, dashSeries.gran_trend)} />
                    <Legend />
                    <Line type="monotone" dataKey="convertidos" name="Convertidos" stroke={C.primary} strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="contato" name="1º contato" stroke={C.info} strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="engajados" name="Engajados +1 valor" stroke={C.purple} strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Gráfico 2 · processos pastorais */}
              <div className="rounded-lg border border-border bg-card p-4">
                <h3 className="font-semibold text-sm mb-1">Processos internos · capelania · acompanhamento · Jornada 180</h3>
                <p className="text-xs text-muted-foreground mb-3">Volume de atendimentos pastorais ao longo do tempo.</p>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={dashSeries.processos} margin={{ top: 8, right: 16, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--cbrio-border)" />
                    <XAxis dataKey="periodo" tickFormatter={(v) => fmtPeriodo(v, dashSeries.gran_trend)} fontSize={11} />
                    <YAxis allowDecimals={false} fontSize={11} />
                    <Tooltip labelFormatter={(v) => fmtPeriodo(v as string, dashSeries.gran_trend)} />
                    <Legend />
                    <Line type="monotone" dataKey="acompanhamento" name="Acompanhamento" stroke={C.info} strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="jornada180" name="Jornada 180" stroke={C.pink} strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="capelania" name="Capelania" stroke={C.warn} strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
                <p className="text-[11px] text-muted-foreground mt-2">A linha de capelania passa a contar quando os atendimentos forem registrados por tipo (em breve).</p>
              </div>

              {/* Gráfico 3 · leitura de devocional */}
              <div className="rounded-lg border border-border bg-card p-4">
                <h3 className="font-semibold text-sm mb-1">
                  Devocional · leitores {dashSeries.gran_devoc === 'dia' ? 'por dia' : dashSeries.gran_devoc === 'semana' ? 'por semana' : 'por mês'}
                </h3>
                <p className="text-xs text-muted-foreground mb-3">Quantas pessoas leram o devocional no período.</p>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={dashSeries.devocional} margin={{ top: 8, right: 16, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--cbrio-border)" />
                    <XAxis dataKey="periodo" tickFormatter={(v) => fmtPeriodo(v, dashSeries.gran_devoc)} fontSize={11} />
                    <YAxis allowDecimals={false} fontSize={11} />
                    <Tooltip labelFormatter={(v) => fmtPeriodo(v as string, dashSeries.gran_devoc)} />
                    <Bar dataKey="leitores" name="Leitores" fill={C.primary} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </TabsContent>

        {/* Acompanhamentos */}
        <TabsContent value="acomp" className="space-y-4">
          {/* Pedidos pelo app · "Quero conversar com um pastor" / oração / SOS */}
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-1">
              <HeartHandshake className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-sm">Pedidos pelo app</h3>
              {pedidosPendentes > 0 && (
                <Badge variant="destructive" className="ml-1">{pedidosPendentes} pendente{pedidosPendentes > 1 ? 's' : ''}</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mb-3">"Quero conversar com um pastor", pedidos de oração e SOS enviados pelo aplicativo de membros.</p>
            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pessoa</TableHead><TableHead>Tipo</TableHead><TableHead>Mensagem</TableHead><TableHead>Quando</TableHead><TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pedidosApp.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Nenhum pedido pelo app.</TableCell></TableRow>
                  ) : pedidosApp.map(p => {
                    const meta = PEDIDO_META[p.tipo] || { label: p.tipo, color: '#64748b' };
                    const tel = String(p.telefone || '').replace(/\D/g, '');
                    const urgentePend = p.tipo === 'sos' && p.tratamento_status === 'pendente';
                    return (
                      <TableRow key={p.id} className={urgentePend ? 'bg-red-50/60 dark:bg-red-950/20' : ''}>
                        <TableCell>
                          <div className="font-medium flex items-center gap-1.5">
                            {p.tipo === 'sos' && <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />}
                            {p.membro_id ? (
                              <Link to={`/ministerial/membresia?q=${encodeURIComponent(p.nome || '')}`} className="text-primary hover:underline">{p.nome || 'Membro'}</Link>
                            ) : (p.nome || '—')}
                            {p.membro_id && <Badge variant="secondary" className="text-[10px]">membro</Badge>}
                          </div>
                          {p.telefone && (
                            <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                              <a href={`tel:${tel}`} className="flex items-center gap-1 hover:text-primary"><Phone className="h-3 w-3" />{p.telefone}</a>
                              {tel && <a href={`https://wa.me/55${tel}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-primary"><MessageSquare className="h-3 w-3" />WhatsApp</a>}
                            </div>
                          )}
                        </TableCell>
                        <TableCell><Badge style={{ backgroundColor: meta.color, color: '#fff' }}>{meta.label}</Badge></TableCell>
                        <TableCell className="max-w-[260px]"><span className="text-sm text-muted-foreground line-clamp-2">{p.mensagem || '—'}</span></TableCell>
                        <TableCell className="whitespace-nowrap text-sm">{new Date(p.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</TableCell>
                        <TableCell>
                          {podeEditarCuidados ? (
                            <Select value={p.tratamento_status} onValueChange={async (v) => { await cuidadosApi.pedidosApp.updateStatus(p.id, v); loadAll(); }}>
                              <SelectTrigger className="h-8 w-[150px]"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="pendente">Pendente</SelectItem>
                                <SelectItem value="em_andamento">Em andamento</SelectItem>
                                <SelectItem value="concluido">Concluído</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <Badge variant={p.tratamento_status === 'concluido' ? 'secondary' : 'default'}>{TRAT_LABEL[p.tratamento_status] || p.tratamento_status}</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar nome..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
            </div>
            {podeEditarCuidados && (
              <Button onClick={() => { setEditAcomp(null); setModalAcomp(true); }}><Plus className="h-4 w-4 mr-2" />Novo atendimento</Button>
            )}
          </div>
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead><TableHead>Tipo</TableHead><TableHead>Motivo</TableHead><TableHead>Sessão agendada</TableHead><TableHead>Status</TableHead><TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {acompFiltrados.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhum atendimento.</TableCell></TableRow>
                ) : acompFiltrados.map(a => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.nome}{a.membro_id && <Badge variant="secondary" className="ml-2 text-[10px]">membro</Badge>}</TableCell>
                    <TableCell>
                      <Badge style={{ background: (a.tipo === 'capelania' ? C.warn : C.info) + '20', color: a.tipo === 'capelania' ? C.warn : C.info, border: `1px solid ${(a.tipo === 'capelania' ? C.warn : C.info)}40` }}>
                        {a.tipo === 'capelania' ? 'Capelania' : 'Aconselhamento'}
                      </Badge>
                    </TableCell>
                    <TableCell>{a.motivo || '—'}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {a.agendamento_data ? (
                        <span className="text-primary flex items-center gap-1"><CalendarCheck className="h-3.5 w-3.5" />{new Date(a.agendamento_data + 'T12:00:00').toLocaleDateString('pt-BR')}{a.agendamento_hora ? ' · ' + String(a.agendamento_hora).slice(0, 5) : ''}</span>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell><Badge variant={a.status === 'ativo' ? 'default' : 'secondary'}>{a.status}</Badge></TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {podeEditarCuidados && (
                        <Button variant="ghost" size="sm" onClick={() => { setEditAcomp(a); setModalAcomp(true); }}>Editar</Button>
                      )}
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

          {/* Técnico · oração (insights por IA) + configuração de WhatsApp · recolhido embaixo */}
          <details className="rounded-lg border border-border bg-card">
            <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />Oração (insights) e configuração de WhatsApp
            </summary>
            <div className="p-4 pt-0 space-y-4">
              <OracaoPanel canWrite={podeEditarCuidados} />
              {podeEditarCuidados && <WhatsappAutoConfig api={cuidadosApi.whatsappAuto} />}
            </div>
          </details>
        </TabsContent>

        {/* Jornada 180 */}
        <TabsContent value="jornada" className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="font-semibold text-sm flex items-center gap-2 mb-1"><ArrowRight className="h-4 w-4 text-primary" />Encaminhados pra firmar</h3>
            <p className="text-xs text-muted-foreground mb-3">Pessoas que o cuidado pastoral encaminhou pra Jornada 180. Faça o primeiro contato e registre a devolutiva.</p>
            <EncaminhamentosInbox destino="jornada180" canWrite={podeEditarCuidados} />
          </div>
          <CuidadosJ180 canWrite={podeEditarCuidados} />
        </TabsContent>

        {/* Próximos passos · lista operacional dos convertidos + jornada (contato/batismo/Next) */}
        <TabsContent value="convertidos" className="space-y-4">
          <div>
            <h3 className="font-semibold text-sm flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" />Acompanhamento dos novos convertidos</h3>
            <p className="text-xs text-muted-foreground">Quem a Integração registrou neste período inicial · marque o atendimento, agende a visita e acompanhe a jornada (contato em 3d · batismo e Next em 90d · atrasados em vermelho).</p>
          </div>
          {jornadaData?.resumo && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-lg border border-border bg-card p-3 flex items-center gap-3">
                <div className="rounded-lg p-2 shrink-0" style={{ background: C.primary + '18' }}><Phone className="h-5 w-5" style={{ color: C.primary }} /></div>
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Contato ≤ 3 dias</p>
                  <span className="text-2xl font-bold text-foreground">{jornadaData.resumo.contato_pct}%</span>
                  <p className="text-[11px] text-muted-foreground">{jornadaData.resumo.contato_no_prazo}/{jornadaData.resumo.total} no prazo · {jornadaData.resumo.contato_atrasados} atrasados</p>
                </div>
              </div>
              <div className="rounded-lg border border-border bg-card p-3 flex items-center gap-3">
                <div className="rounded-lg p-2 shrink-0" style={{ background: '#0ea5e918' }}><CheckCircle2 className="h-5 w-5" style={{ color: '#0ea5e9' }} /></div>
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Batismo ≤ 90 dias</p>
                  <span className="text-2xl font-bold text-foreground">{jornadaData.resumo.batismo_pct}%</span>
                  <p className="text-[11px] text-muted-foreground">{jornadaData.resumo.batismo_feitos}/{jornadaData.resumo.total} batizados</p>
                </div>
              </div>
              <div className="rounded-lg border border-border bg-card p-3 flex items-center gap-3">
                <div className="rounded-lg p-2 shrink-0" style={{ background: C.purple + '18' }}><Sparkles className="h-5 w-5" style={{ color: C.purple }} /></div>
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Next ≤ 90 dias</p>
                  <span className="text-2xl font-bold text-foreground">{jornadaData.resumo.next_pct}%</span>
                  <p className="text-[11px] text-muted-foreground">{jornadaData.resumo.next_feitos}/{jornadaData.resumo.total} fizeram o Next</p>
                </div>
              </div>
            </div>
          )}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm text-muted-foreground">
              <strong className="text-foreground">{convertidos.length}</strong> convertidos
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
                placeholder="Buscar por nome, telefone, CPF ou observação..."
                value={convertSearch}
                onChange={e => setConvertSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select value={convertFilter} onValueChange={(v: any) => setConvertFilter(v)}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="encontro_marcado">Com encontro marcado</SelectItem>
                <SelectItem value="sem_encontro">Sem encontro marcado</SelectItem>
                <SelectItem value="aguardando_desfecho">Aguardando desfecho</SelectItem>
                <SelectItem value="atrasados">Atrasados na jornada</SelectItem>
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
              <Label className="text-xs text-muted-foreground">até</Label>
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
                  <TableHead>Encontro</TableHead>
                  <TableHead>Jornada</TableHead>
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
                    <TableRow key={c.id}>
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
                        {(() => {
                          const j = jMap.get(c.id);
                          if (!j) return <span className="text-xs text-muted-foreground">—</span>;
                          return (
                            <div className="flex flex-col gap-1 items-start">
                              <div className="flex gap-1">
                                <JornadaPill label="Contato" m={j.contato} />
                                <JornadaPill label="Batismo" m={j.batismo} />
                                <JornadaPill label="Next" m={j.next} />
                              </div>
                              {podeEditarCuidados && !j.contato?.feito && (
                                <button onClick={() => marcarContato(c.id)} className="text-[10px] text-primary hover:underline">marcar contato</button>
                              )}
                            </div>
                          );
                        })()}
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
                        {(() => {
                          const tel = String(c.telefone || '').replace(/\D/g, '');
                          if (!tel) return null;
                          const primeiro = String(c.nome || '').trim().split(/\s+/)[0] || '';
                          const msg = `Olá ${primeiro}! Aqui é da CBRio 🙏 Que alegria te ver no culto e na decisão que você tomou! Queremos te acompanhar nos próximos passos — podemos conversar?`;
                          return (
                            <a
                              href={`https://wa.me/55${tel}?text=${encodeURIComponent(msg)}`}
                              target="_blank" rel="noopener noreferrer" title="Enviar WhatsApp"
                              onClick={e => e.stopPropagation()}
                              className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-accent align-middle"
                            >
                              <MessageSquare className="h-3.5 w-3.5 text-emerald-600" />
                            </a>
                          );
                        })()}
                        {podeEditarCuidados && (
                          <>
                            {!c.encontro_marcado && (
                              <Button variant="ghost" size="sm" title="Agendar encontro" onClick={() => setAgendarConv(c)}><CalendarPlus className="h-3.5 w-3.5 text-primary" /></Button>
                            )}
                            {c.encontro_status === 'agendado' && (
                              <Button variant="ghost" size="sm" title="Registrar desfecho" onClick={() => setDesfechoConv(c)}><ClipboardCheck className="h-3.5 w-3.5 text-primary" /></Button>
                            )}
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

        <TabsContent value="devocional" className="space-y-4">
          <DevocionalAdmin />
        </TabsContent>

        {/* Visitas agendadas · calendário semanal + pendências de encaminhamento */}
        <TabsContent value="visitas" className="space-y-4">
          <ProcessosTarefas
            area="Cuidados"
            titulo="Visitas agendadas - Cuidados"
            fetchEventos={fetchVisitasSemana}
            onEventoClick={(ev: any) => {
              if (ev.tipoEvento === 'acompanhamento') { setEditAcomp(ev.raw); setModalAcomp(true); }
              else setDetailConvert(ev.raw);
            }}
            eventosKey={visitasVersion}
          />
          <VisitasPendentesSection
            itens={visitasPendentes}
            canEdit={podeEditarCuidados}
            onResolver={(c: any) => setDesfechoConv(c)}
            onFicha={(c: any) => setDetailConvert(c)}
          />
        </TabsContent>
      </Tabs>

      <AcompanhamentoModal
        open={modalAcomp}
        onClose={() => { setModalAcomp(false); setEditAcomp(null); }}
        onSaved={loadAll}
        atendentes={atendentes}
        initial={editAcomp}
      />
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
        onAgendar={() => { setAgendarConv(detailConvert); setDetailConvert(null); }}
        onDesfecho={() => { setDesfechoConv(detailConvert); setDetailConvert(null); }}
        onRemove={async () => {
          if (!detailConvert) return;
          if (!confirm(`Remover ${detailConvert.nome}?`)) return;
          await cuidadosApi.convertidos.remove(detailConvert.id);
          setDetailConvert(null);
          loadAll();
        }}
      />
      <AgendarEncontroModal
        open={!!agendarConv}
        convertido={agendarConv}
        atendentes={atendentes}
        onClose={() => setAgendarConv(null)}
        onSaved={loadAll}
      />
      <DesfechoModal
        open={!!desfechoConv}
        convertido={desfechoConv}
        allTags={convertTags}
        onClose={() => setDesfechoConv(null)}
        onSaved={loadAll}
      />
    </div>
  );
}
