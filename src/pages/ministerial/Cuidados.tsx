import { useState, useEffect, useMemo, useRef } from 'react';
import { ModuleHeader } from '../../components/layout/ModuleHeader';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { hrefConversa } from '@/lib/conversas';
import { cuidados as cuidadosApi } from '../../api';
import Paginacao, { usePaginacaoLocal } from '../../components/Paginacao';
import useConfirmarSaida from '../../hooks/useConfirmarSaida';
import DevocionalAdmin from '../../components/DevocionalAdmin';
import AgentePrimeiroContato from '../../components/AgentePrimeiroContato';
import AgenteBatismoNext from '../../components/AgenteBatismoNext';
import NextConvite from '../../components/NextConvite';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/tabs';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Switch } from '../../components/ui/switch';
import { Badge } from '../../components/ui/badge';
import { StatisticsCard } from '../../components/ui/statistics-card';
import { Heart, Users, UserCheck, CheckCircle2, Plus, Trash2, Loader2, Search, Sparkles, CalendarCheck, CalendarPlus, Phone, MessageSquare, AlertTriangle, HeartHandshake, Pencil, Check, X } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';

const C = { primary: '#00B39D', info: '#3b82f6', warn: '#f59e0b', purple: '#8b5cf6', pink: '#ef476f' };
// Cor por status do 1º contato (dashboard · Próximos passos)
const PP_COR: Record<string, string> = {
  atendido_respondido: '#10b981', nao_respondeu: '#f59e0b', nao_atendido: '#64748b',
  numero_errado: '#94a3b8', pendente: '#ef476f',
};

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

// Quem faz o atendimento do convertido. Essas pessoas NÃO logam no Cuidados —
// o Marcelo registra quem ficou responsável. A lista vive no banco
// (cui_responsaveis) e a própria equipe gerencia pelo modal "Gerenciar
// responsáveis" da aba Próximos passos (Marcos 2026-07-21). As constantes
// abaixo são só FALLBACK enquanto a API não responde (espelham o estado do
// banco pós-dedup da migration 20260721190000: Kevin/Arthur, Arthur/Kevin,
// Naná, Mari e Carmet/Arthur foram consolidados no responsável canônico).
// Inativo = histórico: aparece desabilitado no dropdown, não pode ser
// escolhido em novos lançamentos.
const RESPONSAVEIS_ATENDIMENTO = ['Arthur Cecconi', 'Renata Martins', 'Nélio Paiva', 'Wesley Ramos'];
const RESPONSAVEIS_ANTIGOS = ['Lorena', 'Lilian', 'Sebastião', 'Natasha', 'Mariane', 'Carmet', 'Léia', 'Kevin'];
const RESPONSAVEIS_FALLBACK = [
  ...RESPONSAVEIS_ATENDIMENTO.map(nome => ({ id: nome, nome, ativo: true })),
  ...RESPONSAVEIS_ANTIGOS.map(nome => ({ id: nome, nome, ativo: false })),
];

// Modal "Gerenciar responsáveis" · a equipe liga/desliga quem está disponível,
// adiciona gente nova, EDITA o nome (o backend propaga pros convertidos — o
// vínculo é por texto) e exclui quem NUNCA foi usado (nome errado etc. · o
// backend bloqueia com 409 se o nome está em algum convertido).
function GerenciarResponsaveisModal({ open, onClose, responsaveis, onChanged, onRenomeado }: {
  open: boolean; onClose: () => void; responsaveis: any[]; onChanged: () => void; onRenomeado?: () => void;
}) {
  const [novoNome, setNovoNome] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  async function adicionar() {
    const nome = novoNome.trim();
    if (nome.length < 2) { toast.error('Informe o nome do responsável.'); return; }
    setSalvando(true);
    try {
      await cuidadosApi.responsaveis.create(nome);
      setNovoNome('');
      toast.success(`${nome} adicionado à lista.`);
      onChanged();
    } catch (e: any) {
      toast.error(`Não foi possível adicionar: ${e.message}`);
    } finally {
      setSalvando(false);
    }
  }

  async function toggleAtivo(r: any, ativo: boolean) {
    setTogglingId(r.id);
    try {
      await cuidadosApi.responsaveis.update(r.id, { ativo });
      onChanged();
    } catch (e: any) {
      toast.error(`Não foi possível atualizar: ${e.message}`);
    } finally {
      setTogglingId(null);
    }
  }

  // Excluir de verdade: só quem nunca atendeu ninguém (o backend valida e
  // responde 409 com orientação pra desativar quando o nome está em uso).
  async function excluir(r: any) {
    if (!confirm(`Excluir ${r.nome} da lista? Só é possível se nunca foi usado em nenhum convertido.`)) return;
    setTogglingId(r.id);
    try {
      await cuidadosApi.responsaveis.remove(r.id);
      toast.success(`${r.nome} excluído.`);
      onChanged();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setTogglingId(null);
    }
  }

  // Editar nome: renomeia no catálogo E em todos os convertidos que apontam
  // pro nome antigo (o backend propaga · vínculo por texto).
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editNome, setEditNome] = useState('');

  function iniciarEdicao(r: any) {
    setEditandoId(r.id);
    setEditNome(r.nome);
  }

  async function salvarNome(r: any) {
    const nome = editNome.trim();
    if (nome === r.nome || nome.length < 2) { setEditandoId(null); return; }
    setTogglingId(r.id);
    try {
      const resp = await cuidadosApi.responsaveis.update(r.id, { nome });
      const n = resp?.renomeados || 0;
      toast.success(n > 0
        ? `Renomeado pra ${nome} — ${n} convertido(s) atualizados junto.`
        : `Renomeado pra ${nome}.`);
      setEditandoId(null);
      onChanged();
      if (n > 0) onRenomeado?.(); // recarrega os convertidos (a tabela mostra o nome novo)
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setTogglingId(null);
    }
  }

  const ativos = responsaveis.filter(r => r.ativo);
  const inativos = responsaveis.filter(r => !r.ativo);

  // Função comum (não componente · evita remount/perda de foco do input de edição)
  function linhaResponsavel(r: any) {
    const editando = editandoId === r.id;
    return (
      <div key={r.id} className={`flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 ${r.ativo || editando ? '' : 'opacity-70'}`}>
        {editando ? (
          <>
            <Input
              autoFocus
              className="h-7 text-sm flex-1"
              value={editNome}
              onChange={e => setEditNome(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); salvarNome(r); }
                if (e.key === 'Escape') setEditandoId(null);
              }}
            />
            <Button variant="ghost" size="icon" className="h-7 w-7 text-primary" disabled={togglingId === r.id} onClick={() => salvarNome(r)} title="Salvar novo nome">
              {togglingId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" disabled={togglingId === r.id} onClick={() => setEditandoId(null)} title="Cancelar edição">
              <X className="h-3.5 w-3.5" />
            </Button>
          </>
        ) : (
          <>
            <span className="text-sm flex-1">{r.nome}</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground"
              disabled={togglingId === r.id}
              onClick={() => iniciarEdicao(r)}
              title="Editar nome (atualiza também os convertidos já registrados com ele)"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Switch
              checked={r.ativo}
              disabled={togglingId === r.id}
              onCheckedChange={() => toggleAtivo(r, !r.ativo)}
              title={r.ativo ? 'Disponível · clique pra desativar' : 'Indisponível · clique pra reativar'}
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              disabled={togglingId === r.id}
              onClick={() => excluir(r)}
              title="Excluir (só se nunca foi usado em nenhum convertido)"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md flex flex-col max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>Gerenciar responsáveis</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto min-h-0 space-y-4">
          <p className="text-xs text-muted-foreground">
            Quem está <strong>disponível</strong> aparece no seletor de responsável dos convertidos.
            Desativar não apaga nada — os registros antigos continuam mostrando o nome.
            Editar o nome (lápis) atualiza também os convertidos já registrados com ele.
            A lixeira exclui de vez, mas só quem nunca foi usado em nenhum convertido.
          </p>
          <div className="flex gap-2">
            <Input
              placeholder="Nome do novo responsável"
              value={novoNome}
              onChange={e => setNovoNome(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); adicionar(); } }}
            />
            <Button onClick={adicionar} disabled={salvando}>
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            </Button>
          </div>
          <div className="space-y-1.5">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Disponíveis ({ativos.length})</p>
            {ativos.length === 0 && <p className="text-xs text-muted-foreground">Ninguém disponível — adicione ou reative alguém abaixo.</p>}
            {ativos.map(r => linhaResponsavel(r))}
          </div>
          {inativos.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Antigos / indisponíveis ({inativos.length})</p>
              {inativos.map(r => linhaResponsavel(r))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Pra NOVO CONVERTIDO o único próximo passo direcionável no Cuidados é o NEXT (decisão
// Marcos · 2026-06-25 · o direcionamento pros valores — Grupos/Voluntários/Batismo/Devocional —
// migrou pra DENTRO do Next). Direcionar "Next" INSCREVE a pessoa numa matrícula em fila,
// reusando o membro_id (sem duplicar). NÃO conta engajamento (NSM conta Next só quando 'formado').
const DIRECIONAMENTOS: { v: string; l: string }[] = [
  { v: 'next', l: 'Next' },
];
// Labels de TODOS os destinos (inclui os LEGADOS grupos/devocionais/voluntarios/batismo, de
// registros criados antes da inversão · só pra EXIBIR · não são mais oferecidos).
const DIRECIONAMENTO_LABEL: Record<string, string> = {
  next: 'Next',
  grupos: 'Grupos',
  devocionais: 'Devocionais',
  voluntarios: 'Voluntários',
  batismo: 'Batismo',
};

// Status do PRIMEIRO CONTATO · 4 opções (decisão Marcos · 2026-06-30):
// Não respondeu · Não atendido · Número errado · Atendido e respondido.
// "Não respondeu/Não atendido/Atendido e respondido" contam como 1º CONTATO FEITO
// (a tentativa foi realizada). "Número errado" também conta como contato RESOLVIDO
// (a equipe tentou; o número é que estava errado) → entra no "Contato feito", mas fica
// FORA do denominador de "Atendido e respondido" pra não penalizar a equipe por um
// número errado. A meta é 100% contatado → o que falta pra 100% é quem está SEM
// marcação ("—"). Ordem do pior desfecho ao melhor.
const PCONTATO_OPCOES: { v: string; label: string; positivo?: boolean }[] = [
  { v: 'nao_respondeu',       label: 'Não respondeu' },
  { v: 'nao_atendido',        label: 'Não atendido' },
  { v: 'numero_errado',       label: 'Número errado' },
  { v: 'atendido_respondido', label: 'Atendido e respondido', positivo: true },
];
// Labels de TODOS os status (inclui os legados da planilha antiga já importada) ·
// usado só pra EXIBIR registros que vieram com esses valores (não são mais oferecidos).
const PCONTATO_LABEL: Record<string, string> = {
  nao_respondeu: 'Não respondeu',
  nao_atendido: 'Não atendido',
  atendido_respondido: 'Atendido e respondido',
  respondeu: 'Respondeu',
  nao_compareceu: 'Não compareceu',
  sem_retorno: 'Sem retorno do responsável',
  numero_errado: 'Número errado',
};
// Status que indicam que o PRIMEIRO CONTATO foi feito (a pessoa recebeu a mensagem,
// independente da resposta) → balão "Contato" verde. "sem_retorno" e "numero_errado"
// (e vazio) NÃO contam como contato feito.
const CONTATO_FEITO = new Set(['respondeu', 'atendido_respondido', 'nao_respondeu', 'nao_compareceu', 'nao_atendido']);

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
    // Modal é EDIT-only · convertido nasce no culto (Integração), não aqui.
    if (!editing) return;
    setSaving(true);
    try {
      const payload: any = { ...form };
      await cuidadosApi.convertidos.update(initial.id, payload);
      toast.success('Convertido atualizado');
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
            <HeartHandshake className="h-3.5 w-3.5 text-primary inline mr-1" />
            O responsável pelo atendimento e o direcionamento (Grupos / Devocionais / Voluntários) são definidos direto na lista de Próximos passos.
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
              {c.direcionamento && (
                <Badge className="bg-info/15 text-info border-info/30">{DIRECIONAMENTO_LABEL[c.direcionamento] || c.direcionamento}</Badge>
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

          <section className="rounded-md border border-border p-3 space-y-1.5" style={{ background: 'var(--cbrio-input-bg)' }}>
            <h3 className="text-xs font-semibold uppercase tracking-wide flex items-center gap-1.5">
              <HeartHandshake className="h-3.5 w-3.5 text-primary" />
              Atendimento
            </h3>
            <dl className="grid grid-cols-2 gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">Responsável</dt>
              <dd>{c.responsavel_atendimento || <span className="text-muted-foreground">A definir</span>}</dd>
              <dt className="text-muted-foreground">Direcionamento</dt>
              <dd>{c.direcionamento ? (DIRECIONAMENTO_LABEL[c.direcionamento] || c.direcionamento) : <span className="text-muted-foreground">—</span>}</dd>
            </dl>
            <p className="text-[11px] text-muted-foreground pt-0.5">O responsável e o direcionamento são definidos direto na lista de Próximos passos.</p>
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

// Visitas e atendimentos avulsos · tipos/status/labels da lista da aba homônima.
const VISITA_TIPOS_UI: { v: string; l: string }[] = [
  { v: 'visita_domiciliar', l: 'Visita domiciliar' },
  { v: 'visita_hospitalar', l: 'Visita hospitalar' },
  { v: 'funeral',           l: 'Funeral' },
  { v: 'casamento',         l: 'Casamento' },
  { v: 'aconselhamento',    l: 'Aconselhamento' },
  { v: 'outro',             l: 'Outro' },
];
const VISITA_TIPO_LABEL: Record<string, string> = Object.fromEntries(VISITA_TIPOS_UI.map(t => [t.v, t.l]));
const VISITA_TIPO_COR: Record<string, string> = {
  visita_domiciliar: '#00B39D', visita_hospitalar: '#3b82f6', funeral: '#6b7280',
  casamento: '#ec4899', aconselhamento: '#f59e0b', outro: '#8b5cf6',
};
const VISITA_STATUS_UI: { v: string; l: string; color: string }[] = [
  { v: 'agendada',  l: 'Agendada',  color: '#3b82f6' },
  { v: 'realizada', l: 'Realizada', color: '#10b981' },
  { v: 'cancelada', l: 'Cancelada', color: '#6b7280' },
];

function emptyVisitaForm() {
  return { nome: '', telefone: '', data_visita: new Date().toISOString().slice(0, 10), tipo: 'visita_domiciliar', tipo_outro: '', responsavel: '', status: 'realizada', observacao: '' };
}

// Registrar/editar uma visita pastoral ou atendimento avulso (fora dos convertidos).
function VisitaModal({ open, onClose, onSaved, initial }: {
  open: boolean; onClose: () => void; onSaved: () => void; initial?: any | null;
}) {
  const [form, setForm] = useState(emptyVisitaForm());
  const [saving, setSaving] = useState(false);
  const editing = !!initial?.id;
  const snapRef = useRef<string>(JSON.stringify(emptyVisitaForm()));

  useEffect(() => {
    if (!open) return;
    const next = initial ? {
      nome: initial.nome || '',
      telefone: initial.telefone || '',
      data_visita: initial.data_visita || new Date().toISOString().slice(0, 10),
      tipo: initial.tipo || 'visita_domiciliar',
      tipo_outro: initial.tipo_outro || '',
      responsavel: initial.responsavel || '',
      status: initial.status || 'realizada',
      observacao: initial.observacao || '',
    } : emptyVisitaForm();
    setForm(next);
    snapRef.current = JSON.stringify(next);
  }, [open, initial]);

  const temAlteracoes = JSON.stringify(form) !== snapRef.current;
  const { tentarFechar } = useConfirmarSaida(temAlteracoes, onClose);

  async function save() {
    if (!form.nome.trim()) return toast.error('Nome obrigatório');
    if (!form.data_visita) return toast.error('Escolha a data');
    if (form.tipo === 'outro' && !form.tipo_outro.trim()) return toast.error('Descreva o tipo (Outro)');
    setSaving(true);
    try {
      if (editing) {
        await cuidadosApi.visitas.update(initial.id, form);
        toast.success('Visita atualizada');
      } else {
        await cuidadosApi.visitas.create(form);
        toast.success('Visita registrada');
      }
      onSaved(); onClose();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) tentarFechar(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? 'Editar visita / atendimento' : 'Registrar visita / atendimento'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Pessoa *</Label><Input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="Quem foi visitado / atendido" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Telefone</Label><Input value={form.telefone} onChange={e => setForm({ ...form, telefone: e.target.value })} /></div>
            <div><Label>Data *</Label><Input type="date" value={form.data_visita} onChange={e => setForm({ ...form, data_visita: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={v => setForm({ ...form, tipo: v, tipo_outro: v === 'outro' ? form.tipo_outro : '' })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{VISITA_TIPOS_UI.map(t => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{VISITA_STATUS_UI.map(s => <SelectItem key={s.v} value={s.v}>{s.l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          {form.tipo === 'outro' && (
            <div><Label>Qual? *</Label><Input value={form.tipo_outro} onChange={e => setForm({ ...form, tipo_outro: e.target.value })} placeholder="Escreva o tipo de visita / atendimento" /></div>
          )}
          <div><Label>Quem visitou / atendeu</Label><Input value={form.responsavel} onChange={e => setForm({ ...form, responsavel: e.target.value })} placeholder="Pastor / líder" /></div>
          <div>
            <Label>Observação</Label>
            <textarea className="w-full min-h-[80px] rounded-md border border-border p-2 text-sm" style={{ background: 'var(--cbrio-input-bg)' }}
              value={form.observacao} onChange={e => setForm({ ...form, observacao: e.target.value })} placeholder="Contexto, motivo, desfecho..." />
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

// ── Trilha por pessoa (aba "Visitas e Atendimentos") ──────────────────
// Agrupa os atendimentos por PESSOA (cui_visitas + cui_acompanhamentos, unidos
// no backend GET /cuidados/trilha). Cada pessoa abre uma trilha com o histórico
// de atendimentos + comentários por atendimento. Substituiu a lista solta.
const ATEND_TIPO_LABEL: Record<string, string> = {
  visita_domiciliar: 'Visita domiciliar', visita_hospitalar: 'Visita hospitalar',
  funeral: 'Funeral', casamento: 'Casamento', aconselhamento: 'Aconselhamento',
  capelania: 'Capelania', outro: 'Outro',
};
const ATEND_TIPO_COR: Record<string, string> = {
  visita_domiciliar: '#00B39D', visita_hospitalar: '#3b82f6', funeral: '#6b7280',
  casamento: '#ec4899', aconselhamento: '#f59e0b', capelania: '#8b5cf6', outro: '#64748b',
};
function tipoAtendLabel(t: any) {
  if (t?.tipo === 'outro' && t.tipo_outro) return `Outro · ${t.tipo_outro}`;
  return ATEND_TIPO_LABEL[t?.tipo] || t?.tipo || '—';
}
function fmtDataBR(d: string | null) { return d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—'; }

// Comentários de um atendimento (lazy · abre ao clicar). refTipo = visita|acompanhamento
function ComentariosAtendimento({ refTipo, refId, count, canWrite }: { refTipo: string; refId: string; count: number; canWrite: boolean }) {
  const [aberto, setAberto] = useState(false);
  const [itens, setItens] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [texto, setTexto] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function carregar() {
    setLoading(true);
    try { setItens(await cuidadosApi.atendimentoComentarios.list(refTipo, refId)); }
    catch { setItens([]); }
    finally { setLoading(false); }
  }
  function toggle() { const n = !aberto; setAberto(n); if (n && itens === null) carregar(); }
  async function adicionar() {
    const t = texto.trim();
    if (!t) return;
    setSalvando(true);
    try {
      const novo = await cuidadosApi.atendimentoComentarios.create(refTipo, refId, t);
      setItens(prev => [...(prev || []), novo]);
      setTexto('');
    } catch (e: any) { toast.error(e.message); }
    finally { setSalvando(false); }
  }
  async function remover(id: string) {
    if (!confirm('Remover comentário?')) return;
    try { await cuidadosApi.atendimentoComentarios.remove(id); setItens(prev => (prev || []).filter(c => c.id !== id)); }
    catch (e: any) { toast.error(e.message); }
  }
  const total = itens ? itens.length : count;
  return (
    <div className="mt-2">
      <button type="button" onClick={toggle} className="text-xs text-primary hover:underline flex items-center gap-1">
        <MessageSquare className="h-3 w-3" />{total > 0 ? `${total} comentário${total > 1 ? 's' : ''}` : 'Comentar'}
      </button>
      {aberto && (
        <div className="mt-2 space-y-2 pl-3 border-l-2 border-border">
          {loading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : (itens || []).map(c => (
            <div key={c.id} className="text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{c.autor_nome || 'Equipe'}</span>
                <span className="text-muted-foreground">
                  {new Date(c.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  {canWrite && <button type="button" onClick={() => remover(c.id)} className="ml-2 text-muted-foreground hover:text-destructive">×</button>}
                </span>
              </div>
              <p className="whitespace-pre-wrap text-muted-foreground">{c.texto}</p>
            </div>
          ))}
          {itens && itens.length === 0 && !loading && <p className="text-xs text-muted-foreground italic">Sem comentários.</p>}
          {canWrite && (
            <div className="flex gap-2">
              <Input className="h-8 text-xs" placeholder="Adicionar comentário..." value={texto}
                onChange={e => setTexto(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); adicionar(); } }} />
              <Button size="sm" className="h-8" disabled={salvando || !texto.trim()} onClick={adicionar}>
                {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Enviar'}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Painel da trilha de uma pessoa (timeline de atendimentos + comentários)
function TrilhaPessoaDialog({ pessoa, canEdit, onClose, onEditVisita, onNovoParaPessoa }: {
  pessoa: any | null; canEdit: boolean; onClose: () => void; onEditVisita: (a: any) => void; onNovoParaPessoa: (p: any) => void;
}) {
  if (!pessoa) return null;
  return (
    <Dialog open={!!pessoa} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl flex flex-col max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><HeartHandshake className="h-4 w-4 text-primary" />{pessoa.nome || 'Pessoa'}</DialogTitle>
          {pessoa.telefone && <p className="text-xs text-muted-foreground">{pessoa.telefone}{pessoa.membro_id ? ' · membro' : ''}</p>}
        </DialogHeader>
        <div className="flex-1 overflow-y-auto min-h-0 space-y-3">
          <p className="text-xs text-muted-foreground">{pessoa.total} atendimento{pessoa.total > 1 ? 's' : ''} · do mais recente ao mais antigo.</p>
          {(pessoa.atendimentos || []).map((a: any) => {
            const cor = ATEND_TIPO_COR[a.tipo] || '#64748b';
            return (
              <div key={a.fonte + a.id} className="rounded-lg border border-border p-3" style={{ background: 'var(--cbrio-input-bg)' }}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ background: cor + '22', color: cor, border: `1px solid ${cor}40` }}>{tipoAtendLabel(a)}</span>
                    <span className="text-sm font-medium">{fmtDataBR(a.data)}{a.hora ? ' · ' + String(a.hora).slice(0, 5) : ''}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {a.status && <span className="text-[11px] text-muted-foreground">{a.status}</span>}
                    {canEdit && a.fonte === 'visita' && (
                      <Button variant="ghost" size="icon" className="h-6 w-6" title="Editar atendimento" onClick={() => onEditVisita(a)}><Pencil className="h-3 w-3" /></Button>
                    )}
                  </div>
                </div>
                {a.responsavel && <p className="text-xs text-muted-foreground mt-1">Quem atendeu: {a.responsavel}</p>}
                {a.texto && <p className="text-sm mt-1 whitespace-pre-wrap">{a.texto}</p>}
                <ComentariosAtendimento refTipo={a.fonte} refId={a.id} count={a.comentarios_count || 0} canWrite={canEdit} />
              </div>
            );
          })}
        </div>
        <DialogFooter className="flex-row justify-between sm:justify-between">
          <div>{canEdit && <Button variant="outline" size="sm" onClick={() => onNovoParaPessoa(pessoa)}><Plus className="h-4 w-4 mr-1.5" />Novo atendimento</Button>}</div>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Aba "Visitas e Atendimentos" · trilha por pessoa (cui_visitas + cui_acompanhamentos)
function TrilhaPessoas({ canEdit, reloadKey, onNova, onEditVisita, onNovoParaPessoa }: {
  canEdit: boolean; reloadKey: number; onNova: () => void; onEditVisita: (a: any) => void; onNovoParaPessoa: (p: any) => void;
}) {
  const [pessoas, setPessoas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [sel, setSel] = useState<any | null>(null);

  useEffect(() => {
    setLoading(true);
    cuidadosApi.trilha().then((p: any[]) => setPessoas(Array.isArray(p) ? p : [])).catch(() => setPessoas([])).finally(() => setLoading(false));
  }, [reloadKey]);

  // Sincroniza o painel aberto após recarregar (comentários, nome novo, etc.)
  useEffect(() => {
    if (sel) { const atual = pessoas.find(p => p.chave === sel.chave); setSel(atual || null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pessoas]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return pessoas;
    return pessoas.filter(p => `${p.nome || ''} ${p.telefone || ''}`.toLowerCase().includes(q));
  }, [pessoas, busca]);
  const { pageItems, paginacaoProps } = usePaginacaoLocal(filtradas, 30);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-1"><CalendarCheck className="h-4 w-4 text-primary" /><h3 className="font-semibold text-sm">Visitas e Atendimentos</h3></div>
        <p className="text-xs text-muted-foreground">Histórico por pessoa — cada atendimento (visita, aconselhamento, capelania) na trilha da pessoa, com comentários.</p>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Buscar pessoa por nome ou telefone..." value={busca} onChange={e => setBusca(e.target.value)} className="pl-8" />
        </div>
        {canEdit && <Button onClick={onNova}><Plus className="h-4 w-4 mr-2" />Registrar atendimento</Button>}
      </div>
      {loading ? (
        <div className="text-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground inline" /></div>
      ) : filtradas.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground text-sm">{pessoas.length === 0 ? 'Nenhum atendimento registrado ainda.' : 'Ninguém com esse nome/telefone.'}</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {pageItems.map((p: any) => (
            <button key={p.chave} type="button" onClick={() => setSel(p)}
              className="text-left rounded-lg border border-border bg-card p-3 hover:border-primary/50 transition-colors">
              <div className="font-medium flex items-center gap-1.5">{p.nome || 'Sem nome'}{p.membro_id && <Badge variant="secondary" className="text-[10px]">membro</Badge>}</div>
              {p.telefone && <div className="text-xs text-muted-foreground">{p.telefone}</div>}
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-muted-foreground">{p.total} atendimento{p.total > 1 ? 's' : ''}</span>
                <span className="text-[11px] text-muted-foreground">{p.ultimo_em ? fmtDataBR(p.ultimo_em) : ''}</span>
              </div>
              <div className="flex flex-wrap gap-1 mt-1.5">
                {(p.tipos || []).slice(0, 4).map((t: string) => {
                  const cor = ATEND_TIPO_COR[t] || '#64748b';
                  return <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: cor + '20', color: cor }}>{ATEND_TIPO_LABEL[t] || t}</span>;
                })}
              </div>
            </button>
          ))}
        </div>
      )}
      <Paginacao {...paginacaoProps} itemLabel="pessoas" />
      <TrilhaPessoaDialog
        pessoa={sel}
        canEdit={canEdit}
        onClose={() => setSel(null)}
        onEditVisita={(a) => { setSel(null); onEditVisita(a); }}
        onNovoParaPessoa={(p) => { setSel(null); onNovoParaPessoa(p); }}
      />
    </div>
  );
}

// ── Caixa de entrada · pedidos de cuidado ─────────────────────────────
// Fila única de triagem: junta cui_pedidos (whatsapp/plataforma/manual) +
// app_inscricoes (canal app · /pedidos-app). O líder escolhe o TIPO ao atender
// → cria o atendimento na trilha da pessoa (aba Visitas e Atendimentos).
const PEDIDO_TIPO_META: Record<string, { label: string; color: string }> = {
  aconselhamento: { label: 'Aconselhamento', color: '#f59e0b' },
  capelania: { label: 'Capelania', color: '#8b5cf6' },
  oracao: { label: 'Oração', color: '#00B39D' },
  sos: { label: 'SOS', color: '#ef4444' },
  visita: { label: 'Visita', color: '#3b82f6' },
  outro: { label: 'Outro', color: '#64748b' },
};
const CANAL_LABEL: Record<string, string> = { app: 'App', whatsapp: 'WhatsApp', plataforma: 'Plataforma', manual: 'Manual' };
const PEDIDO_STATUS_UI: { v: string; l: string }[] = [
  { v: 'pendente', l: 'Pendente' }, { v: 'em_andamento', l: 'Em andamento' }, { v: 'concluido', l: 'Concluído' },
];
// pedido.tipo → tipo de atendimento sugerido ao atender
const TIPO_ATEND_SUGERIDO: Record<string, string> = {
  aconselhamento: 'aconselhamento', capelania: 'capelania', visita: 'visita_domiciliar',
  oracao: 'aconselhamento', sos: 'aconselhamento', outro: 'aconselhamento',
};

// Modal "Atender" · o líder escolhe o tipo de atendimento/visita → cria a trilha
function AtenderPedidoModal({ pedido, canEdit, onClose, onSaved }: {
  pedido: any | null; canEdit: boolean; onClose: () => void; onSaved: () => void;
}) {
  const [tipo, setTipo] = useState('aconselhamento');
  const [responsavel, setResponsavel] = useState('');
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [hora, setHora] = useState('');
  const [tipoOutro, setTipoOutro] = useState('');
  const [observacao, setObservacao] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!pedido) return;
    setTipo(TIPO_ATEND_SUGERIDO[pedido.tipo] || 'aconselhamento');
    setResponsavel(''); setData(new Date().toISOString().slice(0, 10)); setHora('');
    setTipoOutro(''); setObservacao(pedido.mensagem || '');
  }, [pedido]);

  const ehSessao = tipo === 'aconselhamento' || tipo === 'capelania';
  async function salvar() {
    if (!pedido) return;
    if (tipo === 'outro' && !tipoOutro.trim()) { toast.error('Descreva o tipo (Outro)'); return; }
    setSalvando(true);
    try {
      await cuidadosApi.pedidos.atender(pedido.fonte, pedido.id, {
        tipo, tipo_outro: tipoOutro || null, responsavel: responsavel || null,
        data: data || null, hora: ehSessao ? (hora || null) : null,
        observacao: observacao || null,
        status: ehSessao ? 'ativo' : 'agendada',
      });
      toast.success('Atendimento criado na trilha da pessoa.');
      onSaved(); onClose();
    } catch (e: any) { toast.error(e.message); }
    finally { setSalvando(false); }
  }

  return (
    <Dialog open={!!pedido} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Atender · {pedido?.nome || 'pessoa'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">Escolha o tipo de atendimento/visita. Isso cria o atendimento na trilha da pessoa (aba Visitas e Atendimentos).</p>
          <div>
            <Label>Tipo de atendimento *</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {['aconselhamento', 'capelania', 'visita_domiciliar', 'visita_hospitalar', 'funeral', 'casamento', 'outro'].map(t => (
                  <SelectItem key={t} value={t}>{ATEND_TIPO_LABEL[t] || t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {tipo === 'outro' && (
            <div><Label>Qual? *</Label><Input value={tipoOutro} onChange={e => setTipoOutro(e.target.value)} placeholder="Descreva o tipo" /></div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Data</Label><Input type="date" value={data} onChange={e => setData(e.target.value)} /></div>
            {ehSessao && <div><Label>Hora</Label><Input type="time" value={hora} onChange={e => setHora(e.target.value)} /></div>}
          </div>
          <div><Label>Quem vai atender</Label><Input value={responsavel} onChange={e => setResponsavel(e.target.value)} placeholder="Pastor / líder" /></div>
          <div>
            <Label>Observação</Label>
            <textarea className="w-full min-h-[70px] rounded-md border border-border p-2 text-sm" style={{ background: 'var(--cbrio-input-bg)' }}
              value={observacao} onChange={e => setObservacao(e.target.value)} placeholder="Contexto, motivo, próximos passos..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando || !canEdit}>{salvando ? 'Salvando...' : 'Criar atendimento'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Modal "Registrar pedido" · pedido manual na Caixa (canal manual)
function RegistrarPedidoModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [tipo, setTipo] = useState('aconselhamento');
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [salvando, setSalvando] = useState(false);
  useEffect(() => { if (open) { setTipo('aconselhamento'); setNome(''); setTelefone(''); setMensagem(''); } }, [open]);
  async function salvar() {
    if (!nome.trim() && !telefone.trim()) { toast.error('Informe ao menos nome ou telefone.'); return; }
    setSalvando(true);
    try {
      await cuidadosApi.pedidos.create({ tipo, nome, telefone, mensagem });
      toast.success('Pedido registrado na Caixa de entrada.');
      onSaved(); onClose();
    } catch (e: any) { toast.error(e.message); }
    finally { setSalvando(false); }
  }
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Registrar pedido de cuidado</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Tipo *</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.keys(PEDIDO_TIPO_META).map(t => <SelectItem key={t} value={t}>{PEDIDO_TIPO_META[t].label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Nome</Label><Input value={nome} onChange={e => setNome(e.target.value)} /></div>
            <div><Label>Telefone</Label><Input value={telefone} onChange={e => setTelefone(e.target.value)} /></div>
          </div>
          <div>
            <Label>Mensagem / motivo</Label>
            <textarea className="w-full min-h-[70px] rounded-md border border-border p-2 text-sm" style={{ background: 'var(--cbrio-input-bg)' }}
              value={mensagem} onChange={e => setMensagem(e.target.value)} placeholder="O que a pessoa precisa?" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando}>{salvando ? 'Salvando...' : 'Registrar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Aba "Caixa de entrada" (ex-Aconselhamento) · fila unificada de pedidos.
function CaixaEntrada({ canEdit, onAtendido, onPendentes }: {
  canEdit: boolean; onAtendido: () => void; onPendentes?: (n: number) => void;
}) {
  const [itens, setItens] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [fCanal, setFCanal] = useState('todos');
  const [fTipo, setFTipo] = useState('todos');
  const [fStatus, setFStatus] = useState('abertos');
  const [busca, setBusca] = useState('');
  const [atender, setAtender] = useState<any | null>(null);
  const [registrar, setRegistrar] = useState(false);

  async function carregar() {
    setLoading(true);
    try {
      const [cui, app] = await Promise.all([
        cuidadosApi.pedidos.list().catch(() => []),
        cuidadosApi.pedidosApp.list().catch(() => []),
      ]);
      const norm: any[] = [];
      for (const p of (cui || [])) norm.push({
        fonte: 'cui', id: p.id, canal: p.canal || 'manual', tipo: p.tipo || 'outro',
        nome: p.nome, telefone: p.telefone, email: p.email, mensagem: p.mensagem,
        status: p.status || 'pendente', membro_id: p.membro_id, atribuido_nome: p.atribuido_nome || null,
        atendido: !!p.atendimento_ref, created_at: p.created_at,
      });
      for (const p of (app || [])) norm.push({
        fonte: 'app', id: p.id, canal: 'app', tipo: p.tipo || 'outro',
        nome: p.nome, telefone: p.telefone, email: p.email, mensagem: p.mensagem,
        status: p.tratamento_status || 'pendente', membro_id: p.membro_id, atribuido_nome: null,
        atendido: false, created_at: p.created_at,
      });
      norm.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
      setItens(norm);
      if (onPendentes) onPendentes(norm.filter(x => x.status === 'pendente').length);
    } catch { setItens([]); }
    finally { setLoading(false); }
  }
  useEffect(() => { carregar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function mudarStatus(it: any, status: string) {
    // otimista
    setItens(prev => prev.map(x => (x.fonte === it.fonte && x.id === it.id) ? { ...x, status } : x));
    try {
      if (it.fonte === 'cui') await cuidadosApi.pedidos.update(it.id, { status });
      else await cuidadosApi.pedidosApp.updateStatus(it.id, status);
      if (onPendentes) setItens(prev => { const n = prev.filter(x => x.status === 'pendente').length; onPendentes(n); return prev; });
    } catch (e: any) { toast.error(e.message); carregar(); }
  }
  async function remover(it: any) {
    if (it.fonte !== 'cui') return;
    if (!confirm('Remover este pedido da Caixa de entrada?')) return;
    try { await cuidadosApi.pedidos.remove(it.id); carregar(); }
    catch (e: any) { toast.error(e.message); }
  }

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return itens.filter(it => {
      if (fCanal !== 'todos' && it.canal !== fCanal) return false;
      if (fTipo !== 'todos' && it.tipo !== fTipo) return false;
      if (fStatus === 'abertos' && it.status === 'concluido') return false;
      else if (fStatus !== 'abertos' && fStatus !== 'todos' && it.status !== fStatus) return false;
      if (q && !(`${it.nome || ''} ${it.telefone || ''} ${it.mensagem || ''}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [itens, fCanal, fTipo, fStatus, busca]);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-1"><HeartHandshake className="h-4 w-4 text-primary" /><h3 className="font-semibold text-sm">Caixa de entrada</h3></div>
        <p className="text-xs text-muted-foreground">Todos os pedidos de cuidado num lugar — app, WhatsApp, plataforma e registro manual. Atenda escolhendo o tipo; vira atendimento na trilha da pessoa.</p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Buscar por nome, telefone, mensagem..." value={busca} onChange={e => setBusca(e.target.value)} className="pl-8" />
        </div>
        <Select value={fCanal} onValueChange={setFCanal}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os canais</SelectItem>
            {Object.keys(CANAL_LABEL).map(c => <SelectItem key={c} value={c}>{CANAL_LABEL[c]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={fTipo} onValueChange={setFTipo}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            {Object.keys(PEDIDO_TIPO_META).map(t => <SelectItem key={t} value={t}>{PEDIDO_TIPO_META[t].label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={fStatus} onValueChange={setFStatus}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="abertos">Em aberto</SelectItem>
            <SelectItem value="pendente">Pendente</SelectItem>
            <SelectItem value="em_andamento">Em andamento</SelectItem>
            <SelectItem value="concluido">Concluído</SelectItem>
            <SelectItem value="todos">Todos</SelectItem>
          </SelectContent>
        </Select>
        {canEdit && <Button onClick={() => setRegistrar(true)}><Plus className="h-4 w-4 mr-2" />Registrar pedido</Button>}
      </div>

      {loading ? (
        <div className="text-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground inline" /></div>
      ) : filtrados.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground text-sm">{itens.length === 0 ? 'Nenhum pedido na caixa de entrada.' : 'Nenhum pedido nos filtros atuais.'}</div>
      ) : (
        <div className="space-y-2">
          {filtrados.map(it => {
            const meta = PEDIDO_TIPO_META[it.tipo] || { label: it.tipo, color: '#64748b' };
            const tel = String(it.telefone || '').replace(/\D/g, '');
            const urgente = it.tipo === 'sos' && it.status === 'pendente';
            return (
              <div key={it.fonte + it.id} className={`rounded-lg border p-3 bg-card ${urgente ? 'border-red-400/60' : 'border-border'}`}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="font-medium flex items-center gap-1.5">
                      {it.tipo === 'sos' && <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />}
                      {it.nome || '—'}
                      {it.membro_id && <Badge variant="secondary" className="text-[10px]">membro</Badge>}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ background: meta.color + '22', color: meta.color, border: `1px solid ${meta.color}40` }}>{meta.label}</span>
                      <span className="text-[11px] text-muted-foreground">{CANAL_LABEL[it.canal] || it.canal}</span>
                      <span className="text-[11px] text-muted-foreground">{it.created_at ? new Date(it.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}</span>
                    </div>
                    {it.telefone && (
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <a href={`tel:${tel}`} className="flex items-center gap-1 hover:text-primary"><Phone className="h-3 w-3" />{it.telefone}</a>
                      </div>
                    )}
                    {it.mensagem && <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{it.mensagem}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {canEdit ? (
                      <Select value={it.status} onValueChange={(v) => mudarStatus(it, v)}>
                        <SelectTrigger className="h-8 w-[140px]"><SelectValue /></SelectTrigger>
                        <SelectContent>{PEDIDO_STATUS_UI.map(s => <SelectItem key={s.v} value={s.v}>{s.l}</SelectItem>)}</SelectContent>
                      </Select>
                    ) : (
                      <Badge variant={it.status === 'concluido' ? 'secondary' : 'default'}>{PEDIDO_STATUS_UI.find(s => s.v === it.status)?.l || it.status}</Badge>
                    )}
                    {tel && (
                      <Button asChild variant="outline" size="sm" title="Ver e responder no módulo Conversas">
                        <Link to={hrefConversa(`55${tel}`)}><MessageSquare className="h-3.5 w-3.5 mr-1" />Conversas</Link>
                      </Button>
                    )}
                    {canEdit && it.status !== 'concluido' && (
                      <Button size="sm" onClick={() => setAtender(it)}><HeartHandshake className="h-3.5 w-3.5 mr-1" />Atender</Button>
                    )}
                    {canEdit && it.fonte === 'cui' && (
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => remover(it)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AtenderPedidoModal pedido={atender} canEdit={canEdit} onClose={() => setAtender(null)} onSaved={() => { carregar(); onAtendido(); }} />
      <RegistrarPedidoModal open={registrar} onClose={() => setRegistrar(false)} onSaved={carregar} />
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
    if (t === 'jornada') return 'dashboard'; // legado · Jornada 180 saiu do Cuidados (é do módulo Grupos)
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

  const [convertidos, setConvertidos] = useState<any[]>([]);
  const [jornadaData, setJornadaData] = useState<any>(null); // /jornada-convertidos · status contato/batismo/Next por pessoa
  const navigate = useNavigate();

  const [caixaPendentes, setCaixaPendentes] = useState(0); // badge da aba Caixa de entrada
  const [modalConvert, setModalConvert] = useState(false);
  const [editConvert, setEditConvert] = useState<any | null>(null);
  const [detailConvert, setDetailConvert] = useState<any | null>(null);
  const [atendentes, setAtendentes] = useState<any[]>([]);
  // Responsáveis do atendimento (cui_responsaveis) · fallback = lista fixa antiga
  const [responsaveis, setResponsaveis] = useState<any[]>(RESPONSAVEIS_FALLBACK);
  const [modalResponsaveis, setModalResponsaveis] = useState(false);
  const [modalVisita, setModalVisita] = useState(false);
  const [editVisita, setEditVisita] = useState<any | null>(null);
  const [visitasVersion, setVisitasVersion] = useState(0);
  const [trilhaVersion, setTrilhaVersion] = useState(0);
  const [convertTags, setConvertTags] = useState<string[]>([]);
  const [convertSearch, setConvertSearch] = useState('');
  const [convertFilter, setConvertFilter] = useState<'todos' | 'sem_responsavel' | 'sem_direcionamento' | 'atrasados'>('todos');
  const [convertFilterStatus, setConvertFilterStatus] = useState<string>(''); // primeiro_contato_status ('' = todos · 'sem' = sem status)
  const [convertPeriodo, setConvertPeriodo] = useState<string>('tudo'); // 30/60/90/180/365/tudo (por data_culto)

  async function loadAll() {
    const [c, jd] = await Promise.all([
      cuidadosApi.convertidos.list().catch(() => []),
      cuidadosApi.jornadaConvertidos().catch(() => null),
    ]);
    setConvertidos(c); setJornadaData(jd);
    // Recarrega as séries do dashboard após mudanças nos dados
    setVisitasVersion(v => v + 1);
  }

  // Recarrega a trilha (aba Visitas e Atendimentos) + as séries do dashboard.
  function recarregarTrilha() { setTrilhaVersion(v => v + 1); setVisitasVersion(v => v + 1); }

  useEffect(() => { loadAll(); }, []);

  // Catalogo de tags pastorais · fonte de verdade no backend
  useEffect(() => {
    cuidadosApi.convertidos.tags().then(setConvertTags).catch(() => {});
  }, []);

  // Atendentes elegíveis (líderes de culto e de ministérios · filtrado por
  // cargo no backend) · select de "quem vai atender" no agendamento da sessão
  // de aconselhamento (aba Aconselhamento).
  useEffect(() => {
    cuidadosApi.convertidos.atendentes().then(setAtendentes).catch(() => {});
  }, []);

  // Responsáveis do atendimento (lista gerenciável) · se a API falhar,
  // fica o fallback fixo (comportamento antigo).
  function loadResponsaveis() {
    cuidadosApi.responsaveis.list()
      .then((r: any[]) => { if (Array.isArray(r) && r.length) setResponsaveis(r); })
      .catch(() => {});
  }
  useEffect(() => { loadResponsaveis(); }, []);

  const responsaveisAtivos = useMemo(() => responsaveis.filter((r: any) => r.ativo), [responsaveis]);
  const responsaveisInativos = useMemo(() => responsaveis.filter((r: any) => !r.ativo), [responsaveis]);

  // Séries do dashboard novo · recarrega ao trocar o período ou quando os dados mudam
  useEffect(() => {
    setDashLoading(true);
    cuidadosApi.dashboardSeries({ dias: dashDias })
      .then(setDashSeries).catch(() => setDashSeries(null)).finally(() => setDashLoading(false));
  }, [dashDias, visitasVersion]);

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


  // Status do primeiro contato (otimista). O 1º contato NÃO se marca à mão — se FAZ:
  // ao selecionar uma opção de contato feito, carimba primeiro_contato_em (balão verde
  // em todas as telas + KPI). "Número errado" conta como contato RESOLVIDO nos cards,
  // mas NÃO carimba primeiro_contato_em (fica fora do KPI/denominador de atendido) e
  // zera atendido_apos_culto. Vazio limpa (não-feito).
  // O responsável e o direcionamento são definidos nas colunas ao lado.
  async function setPcStatus(id: string, value: string) {
    const v = value || null;
    const anterior = convertidos;
    const cur: any = convertidos.find((x: any) => x.id === id);
    const patch: any = { primeiro_contato_status: v };
    if (v === 'atendido_respondido') patch.atendido_apos_culto = true;
    if (v === 'numero_errado') patch.atendido_apos_culto = false; // número errado nunca é "atendido"
    if (v && CONTATO_FEITO.has(v)) {
      if (!cur?.primeiro_contato_em) patch.primeiro_contato_em = new Date().toISOString();
    } else {
      patch.primeiro_contato_em = null;
    }
    setConvertidos(prev => prev.map((x: any) => x.id === id ? { ...x, ...patch } : x));
    try {
      await cuidadosApi.convertidos.update(id, patch);
    } catch (e: any) {
      setConvertidos(anterior);
      toast.error(`Não foi possível salvar o status: ${e.message}`);
    }
  }

  // Responsável do atendimento (otimista · texto · lista fixa na UI)
  async function setResponsavel(id: string, value: string) {
    const v = value || null;
    const anterior = convertidos;
    setConvertidos(prev => prev.map((x: any) => x.id === id ? { ...x, responsavel_atendimento: v } : x));
    try {
      await cuidadosApi.convertidos.update(id, { responsavel_atendimento: v });
    } catch (e: any) {
      setConvertidos(anterior);
      toast.error(`Não foi possível salvar o responsável: ${e.message}`);
    }
  }

  // Direcionamento (otimista). Único destino do Cuidados = Next (inscreve em fila reusando
  // membro_id, sem duplicar) · NÃO marca engajamento (o NSM conta Next só quando 'formado').
  async function setDirecionamento(id: string, value: string) {
    const v = value || null;
    const anterior = convertidos;
    setConvertidos(prev => prev.map((x: any) => x.id === id ? { ...x, direcionamento: v } : x));
    try {
      await cuidadosApi.convertidos.direcionar(id, v);
      if (v === 'next') toast.success('Inscrito no Next (pendente · fila de espera)');
    } catch (e: any) {
      setConvertidos(anterior);
      toast.error(`Não foi possível direcionar: ${e.message}`);
    }
  }

  // Corte por período (data_culto >= hoje - N dias) · 'tudo' = sem corte
  const convertPeriodoCorte = useMemo(() => {
    if (convertPeriodo === 'tudo') return null;
    const dias = Number(convertPeriodo);
    if (!dias) return null;
    return new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10);
  }, [convertPeriodo]);

  const convertidosFiltrados = useMemo(() => {
    const q = convertSearch.trim().toLowerCase();
    return convertidos.filter((c: any) => {
      if (convertFilter === 'sem_responsavel' && c.responsavel_atendimento) return false;
      if (convertFilter === 'sem_direcionamento' && c.direcionamento) return false;
      if (convertFilter === 'atrasados') {
        const j = jMap.get(c.id);
        if (!(j && [j.contato, j.batismo, j.next].some((m: any) => m?.status === 'atrasado'))) return false;
      }
      if (convertFilterStatus) {
        if (convertFilterStatus === 'sem') { if (c.primeiro_contato_status) return false; }
        else if (c.primeiro_contato_status !== convertFilterStatus) return false;
      }
      if (convertPeriodoCorte && (c.data_culto || '') < convertPeriodoCorte) return false;
      if (q) {
        const hay = `${c.nome || ''} ${c.telefone || ''} ${c.cpf || ''} ${c.observacoes || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [convertidos, convertSearch, convertFilter, convertFilterStatus, convertPeriodoCorte, jMap]);

  // Resumo dos 4 cards · AO VIVO do estado (atualiza ao mexer no dropdown) e respeitando
  // o PERÍODO selecionado. DOIS denominadores (decisão Marcos · 2026-06-30):
  //  • "Contato feito" usa TODOS do período, incl. "número errado" (= contato resolvido:
  //    a equipe tentou; o número é que estava errado → conta como feito, não fica pendente).
  //  • "Atendido e respondido", "Batismo" e "Next" usam só os CONTATÁVEIS (excluem "número
  //    errado") pra não penalizar a equipe por um número errado.
  // Pendentes = só os "—" (sem status e sem contato). Batismo/Next vêm do jornadaData por id.
  const cardsResumo = useMemo(() => {
    const corte = convertPeriodoCorte;
    const jById = new Map<string, any>((jornadaData?.itens || []).map((i: any) => [i.id, i]));
    const periodo = convertidos.filter((c: any) => !corte || (c.data_culto || '') >= corte);
    const contataveis = periodo.filter((c: any) => c.primeiro_contato_status !== 'numero_errado');
    const numErrado = periodo.length - contataveis.length;
    const total = contataveis.length;        // denominador de atendido/batismo/next (exclui número errado)
    const totalContato = periodo.length;      // denominador de "contato feito" (inclui número errado)
    const feitosOk = contataveis.filter((c: any) => CONTATO_FEITO.has(c.primeiro_contato_status) || c.primeiro_contato_em).length;
    const feitos = feitosOk + numErrado;      // número errado conta como contato resolvido
    const pendentes = periodo.filter((c: any) => !c.primeiro_contato_status && !c.primeiro_contato_em).length; // só "—"
    const atendidos = periodo.filter((c: any) => c.primeiro_contato_status === 'atendido_respondido').length;
    const batismos = contataveis.filter((c: any) => jById.get(c.id)?.batismo?.feito).length;
    const nexts = contataveis.filter((c: any) => jById.get(c.id)?.next?.feito).length;
    const pct = (n: number, d: number) => d ? Math.round((n / d) * 100) : 0;
    return {
      total, totalContato, feitos, pendentes, atendidos, batismos, nexts, numErrado,
      contato_pct: pct(feitos, totalContato), atendido_pct: pct(atendidos, total),
      batismo_pct: pct(batismos, total), next_pct: pct(nexts, total),
    };
  }, [convertidos, jornadaData, convertPeriodoCorte]);

  const filtersActive = convertSearch || convertFilter !== 'todos' || convertFilterStatus || convertPeriodo !== 'tudo';
  function limparFiltrosConvertidos() {
    setConvertSearch('');
    setConvertFilter('todos');
    setConvertFilterStatus('');
    setConvertPeriodo('tudo');
  }

  const convertPendentes = useMemo(
    () => convertidos.filter((c: any) => !c.atendido_apos_culto).length,
    [convertidos]
  );

  return (
    <div className="p-6 space-y-6">
      <ModuleHeader
        icon={Heart}
        title="Cuidados"
        subtitle="Acompanhamentos pastorais, capelania, aconselhamento e convertidos pós-culto."
      />

      <Tabs value={tab} onValueChange={handleTabChange}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="acomp" className="gap-1.5">
            Caixa de entrada
            {caixaPendentes > 0 && <Badge variant="destructive" className="h-4 px-1.5 text-[10px]">{caixaPendentes > 99 ? '99+' : caixaPendentes}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="convertidos">Próximos passos</TabsTrigger>
          <TabsTrigger value="devocional">Devocional</TabsTrigger>
          <TabsTrigger value="visitas">Visitas e Atendimentos</TabsTrigger>
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
                  O gargalo do cuidado: de quem se converteu, com quantos a gente falou e quantos seguiram pra outro valor (grupo, voluntário, Next).
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
                    <Line type="monotone" dataKey="atendido" name="Atendido e respondido" stroke="#10b981" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="engajados" name="Engajados +1 valor" stroke={C.purple} strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Próximos passos · status do 1º contato */}
              <div className="rounded-lg border border-border bg-card p-4">
                <h3 className="font-semibold text-sm mb-1">Próximos passos · status do 1º contato</h3>
                <p className="text-xs text-muted-foreground mb-3">Status do primeiro contato dos convertidos do período. "Número errado" conta como contato feito (a mensagem foi enviada) e fica fora do cálculo de "atendido e respondido".</p>
                <div className="space-y-2">
                  {(() => {
                    const totalPP = (dashSeries.statusDist || []).reduce((s: number, d: any) => s + d.n, 0) || 1;
                    return (dashSeries.statusDist || []).map((d: any) => (
                      <div key={d.status} className="flex items-center gap-3">
                        <span className="w-40 shrink-0 text-xs text-muted-foreground">{d.label}</span>
                        <div className="flex-1 h-5 rounded bg-muted/50 overflow-hidden">
                          <div className="h-full rounded" style={{ width: `${Math.round((d.n / totalPP) * 100)}%`, background: PP_COR[d.status] || '#94a3b8' }} />
                        </div>
                        <span className="w-24 shrink-0 text-right text-xs"><strong className="text-foreground">{d.n}</strong> <span className="text-muted-foreground">({Math.round((d.n / totalPP) * 100)}%)</span></span>
                      </div>
                    ));
                  })()}
                </div>
              </div>

              {/* Relatório por responsável do atendimento */}
              <div className="rounded-lg border border-border bg-card p-4">
                <h3 className="font-semibold text-sm mb-1">Relatório por responsável</h3>
                <p className="text-xs text-muted-foreground mb-3">Quem ficou responsável pelo atendimento e a cobertura de cada um. "Contato feito" inclui número errado; "atendido e respondido" exclui número errado do denominador.</p>
                <div className="rounded-lg border border-border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Responsável</TableHead>
                        <TableHead className="text-right">Convertidos</TableHead>
                        <TableHead className="text-right">Contato feito</TableHead>
                        <TableHead className="text-right">Atendido e respondido</TableHead>
                        <TableHead className="text-right">Número errado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(dashSeries.porResponsavel || []).length === 0 ? (
                        <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Sem dados no período.</TableCell></TableRow>
                      ) : (dashSeries.porResponsavel || []).map((r: any) => (
                        <TableRow key={r.responsavel}>
                          <TableCell className="font-medium">{r.responsavel}</TableCell>
                          <TableCell className="text-right">{r.total}</TableCell>
                          <TableCell className="text-right">{r.contato} <span className="text-muted-foreground text-xs">({r.contato_pct}%)</span></TableCell>
                          <TableCell className="text-right">{r.atendido} <span className="text-muted-foreground text-xs">({r.atendido_pct}%)</span></TableCell>
                          <TableCell className="text-right">{r.numero_errado || 0}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Gráfico 2 · visitas e atendimentos por tipo (aba Visitas e atendimentos) */}
              <div className="rounded-lg border border-border bg-card p-4">
                <h3 className="font-semibold text-sm mb-1">Visitas e atendimentos por tipo</h3>
                <p className="text-xs text-muted-foreground mb-3">Total de visitas e atendimentos ao longo do tempo, empilhado por tipo (aba "Visitas e atendimentos").</p>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={dashSeries.visitas} margin={{ top: 8, right: 16, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--cbrio-border)" />
                    <XAxis dataKey="periodo" tickFormatter={(v) => fmtPeriodo(v, dashSeries.gran_trend)} fontSize={11} />
                    <YAxis allowDecimals={false} fontSize={11} />
                    <Tooltip labelFormatter={(v) => fmtPeriodo(v as string, dashSeries.gran_trend)} />
                    <Legend />
                    {VISITA_TIPOS_UI.map(t => (
                      <Bar key={t.v} dataKey={t.v} name={t.l} stackId="v" fill={VISITA_TIPO_COR[t.v]} radius={[2, 2, 0, 0]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
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

        {/* Caixa de entrada · fila única de pedidos de cuidado */}
        <TabsContent value="acomp" className="space-y-4">
          <CaixaEntrada canEdit={podeEditarCuidados} onAtendido={recarregarTrilha} onPendentes={setCaixaPendentes} />
        </TabsContent>

        {/* Próximos passos · lista operacional dos convertidos + jornada (contato/batismo/Next) */}
        <TabsContent value="convertidos" className="space-y-4">
          <Tabs defaultValue="acompanhamento" className="space-y-4">
            <TabsList>
              <TabsTrigger value="acompanhamento">Acompanhamento</TabsTrigger>
              <TabsTrigger value="disparos">Disparos de mensagem</TabsTrigger>
            </TabsList>

            <TabsContent value="disparos" className="space-y-4">
              <AgentePrimeiroContato />
              <AgenteBatismoNext />
              <NextConvite />
            </TabsContent>

            <TabsContent value="acompanhamento" className="space-y-4">
          <div>
            <h3 className="font-semibold text-sm flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" />Acompanhamento dos novos convertidos</h3>
            <p className="text-xs text-muted-foreground">Quem a Integração registrou neste período inicial · marque o 1º contato, defina o responsável e o direcionamento, e acompanhe a jornada (contato em 3d · batismo e Next em 90d · atrasados em vermelho).</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-lg border border-border bg-card p-3 flex items-center gap-3">
              <div className="rounded-lg p-2 shrink-0" style={{ background: C.primary + '18' }}><Phone className="h-5 w-5" style={{ color: C.primary }} /></div>
              <div>
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Contato feito</p>
                <span className="text-2xl font-bold text-foreground">{cardsResumo.contato_pct}%</span>
                <p className="text-[11px] text-muted-foreground">{cardsResumo.feitos}/{cardsResumo.totalContato} feitos · {cardsResumo.pendentes} pendentes</p>
              </div>
            </div>
            <div className="rounded-lg border border-border bg-card p-3 flex items-center gap-3">
              <div className="rounded-lg p-2 shrink-0" style={{ background: '#10b98118' }}><HeartHandshake className="h-5 w-5" style={{ color: '#10b981' }} /></div>
              <div>
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Atendido e respondido</p>
                <span className="text-2xl font-bold text-foreground">{cardsResumo.atendido_pct}%</span>
                <p className="text-[11px] text-muted-foreground">{cardsResumo.atendidos}/{cardsResumo.total} atendidos</p>
              </div>
            </div>
            <div className="rounded-lg border border-border bg-card p-3 flex items-center gap-3">
              <div className="rounded-lg p-2 shrink-0" style={{ background: '#0ea5e918' }}><CheckCircle2 className="h-5 w-5" style={{ color: '#0ea5e9' }} /></div>
              <div>
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Batismo ≤ 90 dias</p>
                <span className="text-2xl font-bold text-foreground">{cardsResumo.batismo_pct}%</span>
                <p className="text-[11px] text-muted-foreground">{cardsResumo.batismos}/{cardsResumo.total} batizados</p>
              </div>
            </div>
            <div className="rounded-lg border border-border bg-card p-3 flex items-center gap-3">
              <div className="rounded-lg p-2 shrink-0" style={{ background: C.purple + '18' }}><Sparkles className="h-5 w-5" style={{ color: C.purple }} /></div>
              <div>
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Next ≤ 90 dias</p>
                <span className="text-2xl font-bold text-foreground">{cardsResumo.next_pct}%</span>
                <p className="text-[11px] text-muted-foreground">{cardsResumo.nexts}/{cardsResumo.total} fizeram o Next</p>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm text-muted-foreground">
              <strong className="text-foreground">{convertidos.length}</strong> convertidos
            </div>
            {/* Convertido nasce SEMPRE do culto (princípio · 25/06): "Novo
                convertido" leva pra Integração registrar a decisão no culto —
                Cuidados acompanha/direciona, não origina. */}
            {podeEditarCuidados && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => setModalResponsaveis(true)}
                  title="Gerenciar quem está disponível pra atender os convertidos"
                >
                  <Users className="h-4 w-4 mr-2" />Gerenciar responsáveis
                </Button>
                <Button
                  onClick={() => navigate('/ministerial/integracao')}
                  title="Registrar pela Integração (decisão de culto)"
                >
                  <Plus className="h-4 w-4 mr-2" />Novo convertido
                </Button>
              </div>
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
                <SelectItem value="sem_responsavel">Sem responsável</SelectItem>
                <SelectItem value="sem_direcionamento">Sem direcionamento</SelectItem>
                <SelectItem value="atrasados">Atrasados na jornada</SelectItem>
              </SelectContent>
            </Select>
            <Select value={convertFilterStatus || '__all'} onValueChange={(v: any) => setConvertFilterStatus(v === '__all' ? '' : v)}>
              <SelectTrigger className="w-52"><SelectValue placeholder="Filtrar por status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">Todos os status</SelectItem>
                {PCONTATO_OPCOES.map(s => (
                  <SelectItem key={s.v} value={s.v}>{s.label}</SelectItem>
                ))}
                <SelectItem value="sem">Sem status</SelectItem>
              </SelectContent>
            </Select>
            <Select value={convertPeriodo} onValueChange={(v: any) => setConvertPeriodo(v)}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="30">Últimos 30 dias</SelectItem>
                <SelectItem value="60">Últimos 60 dias</SelectItem>
                <SelectItem value="90">Últimos 90 dias</SelectItem>
                <SelectItem value="180">Últimos 180 dias</SelectItem>
                <SelectItem value="365">Último 1 ano</SelectItem>
                <SelectItem value="tudo">Tudo</SelectItem>
              </SelectContent>
            </Select>
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
                  <TableHead>1º contato</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead>Direcionamento</TableHead>
                  <TableHead>Jornada</TableHead>
                  <TableHead>Tags</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {convertidosFiltrados.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">
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
                        {podeEditarCuidados ? (
                          <select
                            value={c.primeiro_contato_status || ''}
                            onChange={e => setPcStatus(c.id, e.target.value)}
                            onClick={e => e.stopPropagation()}
                            className="h-8 rounded-md border border-border bg-background text-xs px-1.5 max-w-[160px]"
                            title="Status do primeiro contato"
                          >
                            <option value="">—</option>
                            {PCONTATO_OPCOES.map(s => (
                              <option key={s.v} value={s.v}>{s.label}</option>
                            ))}
                            {c.primeiro_contato_status && !PCONTATO_OPCOES.some(s => s.v === c.primeiro_contato_status) && (
                              <option value={c.primeiro_contato_status}>{(PCONTATO_LABEL[c.primeiro_contato_status] || c.primeiro_contato_status) + ' (antigo)'}</option>
                            )}
                          </select>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {PCONTATO_LABEL[c.primeiro_contato_status] || '—'}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {podeEditarCuidados ? (
                          <select
                            value={c.responsavel_atendimento || ''}
                            onChange={e => setResponsavel(c.id, e.target.value)}
                            onClick={e => e.stopPropagation()}
                            className="h-8 rounded-md border border-border bg-background text-xs px-1.5 max-w-[150px]"
                            title="Responsável do atendimento"
                          >
                            <option value="">A definir</option>
                            {responsaveisAtivos.map((r: any) => (
                              <option key={r.id} value={r.nome}>{r.nome}</option>
                            ))}
                            {/* Inativos: histórico · desabilitados (o próprio valor do registro fica habilitado pra exibir) */}
                            {responsaveisInativos.length > 0 && (
                              <optgroup label="Antigos (histórico · não selecionável)">
                                {responsaveisInativos.map((r: any) => (
                                  <option key={r.id} value={r.nome} disabled={c.responsavel_atendimento !== r.nome}>{r.nome}</option>
                                ))}
                              </optgroup>
                            )}
                            {/* Valor do registro que não está em lista nenhuma (removido/legado) · mantém exibível */}
                            {c.responsavel_atendimento && !responsaveis.some((r: any) => r.nome === c.responsavel_atendimento) && (
                              <option value={c.responsavel_atendimento}>{c.responsavel_atendimento}</option>
                            )}
                          </select>
                        ) : (
                          <span className="text-xs">{c.responsavel_atendimento || <span className="text-muted-foreground">—</span>}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {podeEditarCuidados ? (
                          <select
                            value={c.direcionamento || ''}
                            onChange={e => setDirecionamento(c.id, e.target.value)}
                            onClick={e => e.stopPropagation()}
                            className="h-8 rounded-md border border-border bg-background text-xs px-1.5 max-w-[140px]"
                            title="Direcionamento do responsável"
                          >
                            <option value="">—</option>
                            {DIRECIONAMENTOS.map(d => (
                              <option key={d.v} value={d.v}>{d.l}</option>
                            ))}
                            {c.direcionamento && !DIRECIONAMENTOS.some(d => d.v === c.direcionamento) && (
                              <option value={c.direcionamento}>{(DIRECIONAMENTO_LABEL[c.direcionamento] || c.direcionamento) + ' (antigo)'}</option>
                            )}
                          </select>
                        ) : (
                          <span className="text-xs">{c.direcionamento ? (DIRECIONAMENTO_LABEL[c.direcionamento] || c.direcionamento) : <span className="text-muted-foreground">—</span>}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const j = jMap.get(c.id);
                          // Contato se FAZ pelo status do dropdown → verde automático.
                          const contatoOk = CONTATO_FEITO.has(c.primeiro_contato_status) || !!j?.contato?.feito;
                          const contatoM = contatoOk ? { feito: true, status: 'feito' } : (j?.contato || { feito: false, status: 'no_prazo' });
                          return (
                            <div className="flex gap-1">
                              <JornadaPill label="Contato" m={contatoM} />
                              {j && <JornadaPill label="Batismo" m={j.batismo} />}
                              {j && <JornadaPill label="Next" m={j.next} />}
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
                            <Link
                              to={hrefConversa(`55${tel}`, msg)}
                              title="Abrir conversa no WhatsApp"
                              onClick={e => e.stopPropagation()}
                              className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-accent align-middle"
                            >
                              <MessageSquare className="h-3.5 w-3.5 text-emerald-600" />
                            </Link>
                          );
                        })()}
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
          </Tabs>
        </TabsContent>

        <TabsContent value="devocional" className="space-y-4">
          <DevocionalAdmin />
        </TabsContent>

        {/* Visitas e Atendimentos · trilha por pessoa (cui_visitas + cui_acompanhamentos) */}
        <TabsContent value="visitas" className="space-y-4">
          <TrilhaPessoas
            canEdit={podeEditarCuidados}
            reloadKey={trilhaVersion}
            onNova={() => { setEditVisita(null); setModalVisita(true); }}
            onEditVisita={(a: any) => {
              setEditVisita({ id: a.id, nome: a.nome, telefone: a.telefone, data_visita: a.data, tipo: a.tipo, tipo_outro: a.tipo_outro, responsavel: a.responsavel, status: a.status, observacao: a.texto });
              setModalVisita(true);
            }}
            onNovoParaPessoa={(p: any) => { setEditVisita({ nome: p.nome, telefone: p.telefone }); setModalVisita(true); }}
          />
        </TabsContent>
      </Tabs>

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
      <VisitaModal
        open={modalVisita}
        onClose={() => { setModalVisita(false); setEditVisita(null); }}
        onSaved={recarregarTrilha}
        initial={editVisita}
      />
      <GerenciarResponsaveisModal
        open={modalResponsaveis}
        onClose={() => setModalResponsaveis(false)}
        responsaveis={responsaveis}
        onChanged={loadResponsaveis}
        onRenomeado={loadAll}
      />
    </div>
  );
}
