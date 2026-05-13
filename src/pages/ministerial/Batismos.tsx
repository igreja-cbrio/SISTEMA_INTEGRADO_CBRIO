import { useState, useEffect, useCallback } from 'react';
import { kpis as kpisApi } from '../../api';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Badge } from '../../components/ui/badge';
import { StatisticsCard } from '../../components/ui/statistics-card';
import {
  Droplets, Loader2, Search, Plus, Calendar, Phone, Mail, AlertCircle,
  CheckCircle2, Clock, XCircle, ChevronRight, User, IdCard, FileText,
} from 'lucide-react';
import { toast } from 'sonner';

const C = { primary: '#00B39D', info: '#3b82f6', warn: '#f59e0b', purple: '#8b5cf6', danger: '#ef4444' };

type Status = 'pendente' | 'confirmado' | 'realizado' | 'cancelado';

type BatismoInscricao = {
  id: string;
  membro_id?: string | null;
  nome: string;
  sobrenome: string;
  data_nascimento?: string | null;
  cpf?: string | null;
  telefone?: string | null;
  email?: string | null;
  status: Status;
  data_batismo?: string | null;
  origem: 'totem' | 'manual';
  observacoes?: string | null;
  created_at: string;
  updated_at: string;
  membro?: { id: string; nome: string; foto_url?: string | null; cpf?: string | null } | null;
};

const STATUS_LABEL: Record<Status, string> = {
  pendente: 'Pendente',
  confirmado: 'Confirmado',
  realizado: 'Realizado',
  cancelado: 'Cancelado',
};

const STATUS_COLOR: Record<Status, string> = {
  pendente: C.warn,
  confirmado: C.info,
  realizado: C.primary,
  cancelado: C.danger,
};

const STATUS_ICON: Record<Status, any> = {
  pendente: Clock,
  confirmado: CheckCircle2,
  realizado: Droplets,
  cancelado: XCircle,
};

function ymdLocal(d: string | null | undefined): string {
  if (!d) return '';
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function ymdHoje(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function Batismos() {
  const [list, setList] = useState<BatismoInscricao[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<Status | 'todos'>('todos');
  const [busca, setBusca] = useState('');
  const [selected, setSelected] = useState<BatismoInscricao | null>(null);
  const [novaOpen, setNovaOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await kpisApi.batismos.list();
      setList(Array.isArray(data) ? data : []);
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao carregar batismos');
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtrada = list.filter(b => {
    if (statusFilter !== 'todos' && b.status !== statusFilter) return false;
    if (busca) {
      const q = busca.toLowerCase();
      const hay = `${b.nome} ${b.sobrenome} ${b.cpf || ''} ${b.telefone || ''} ${b.email || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  // KPIs
  const inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0);
  const ymdInicioMes = inicioMes.toISOString().slice(0, 10);
  const realizadosMes = list.filter(b => b.status === 'realizado' && (b.data_batismo || '') >= ymdInicioMes).length;
  const pendentes = list.filter(b => b.status === 'pendente').length;
  const confirmados = list.filter(b => b.status === 'confirmado').length;
  const proximaDataBatismo = list
    .filter(b => (b.status === 'pendente' || b.status === 'confirmado') && b.data_batismo && b.data_batismo >= ymdHoje())
    .map(b => b.data_batismo as string)
    .sort()[0];

  return (
    <div className="space-y-6 p-6 max-w-[1400px] mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Droplets className="h-6 w-6" style={{ color: C.primary }} />
            Batismos
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Inscricoes, confirmacao e realizacao de batismos
          </p>
        </div>
        <Button onClick={() => setNovaOpen(true)} className="gap-2 bg-[#00B39D] hover:bg-[#00B39D]/90 text-white">
          <Plus className="h-4 w-4" /> Cadastrar inscricao
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatisticsCard
          title="Pendentes"
          value={String(pendentes)}
          icon={<Clock className="h-5 w-5" />}
          iconColor={C.warn}
        />
        <StatisticsCard
          title="Confirmados"
          value={String(confirmados)}
          icon={<CheckCircle2 className="h-5 w-5" />}
          iconColor={C.info}
        />
        <StatisticsCard
          title="Realizados (mes)"
          value={String(realizadosMes)}
          icon={<Droplets className="h-5 w-5" />}
          iconColor={C.primary}
        />
        <StatisticsCard
          title="Proximo batismo"
          value={proximaDataBatismo ? ymdLocal(proximaDataBatismo) : '—'}
          icon={<Calendar className="h-5 w-5" />}
          iconColor={C.purple}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-xl border border-border p-0.5 bg-muted/30 overflow-x-auto">
          {(['todos', 'pendente', 'confirmado', 'realizado', 'cancelado'] as const).map(f => {
            const count = f === 'todos' ? list.length : list.filter(b => b.status === f).length;
            return (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={`px-3 py-1.5 text-xs rounded-lg transition-colors whitespace-nowrap ${statusFilter === f ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {f === 'todos' ? `Todos (${count})` : `${STATUS_LABEL[f]} (${count})`}
              </button>
            );
          })}
        </div>
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar nome, CPF, telefone ou email" className="pl-9" />
        </div>
      </div>

      {loading ? (
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mx-auto my-12" />
      ) : filtrada.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
          {list.length === 0 ? 'Nenhuma inscricao de batismo.' : 'Nenhum registro corresponde aos filtros.'}
        </div>
      ) : (
        <div className="rounded-2xl border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead className="hidden md:table-cell">Contato</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-center hidden sm:table-cell">Data batismo</TableHead>
                <TableHead className="text-center hidden lg:table-cell">Origem</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtrada.map(b => {
                const Icon = STATUS_ICON[b.status];
                return (
                  <TableRow
                    key={b.id}
                    className="cursor-pointer hover:bg-muted/40 transition-colors"
                    onClick={() => setSelected(b)}
                  >
                    <TableCell>
                      <p className="font-medium">{b.nome} {b.sobrenome}</p>
                      {b.cpf && <p className="text-xs text-muted-foreground">{b.cpf}</p>}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                        {b.telefone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{b.telefone}</span>}
                        {b.email && <span className="flex items-center gap-1 truncate max-w-[200px]"><Mail className="h-3 w-3" />{b.email}</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant="outline"
                        className="gap-1"
                        style={{ color: STATUS_COLOR[b.status], borderColor: STATUS_COLOR[b.status] + '60' }}
                      >
                        <Icon className="h-3 w-3" />
                        {STATUS_LABEL[b.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center hidden sm:table-cell text-sm text-muted-foreground">
                      {b.data_batismo ? ymdLocal(b.data_batismo) : '—'}
                    </TableCell>
                    <TableCell className="text-center hidden lg:table-cell">
                      <Badge variant="outline" className="text-[9px] uppercase">{b.origem}</Badge>
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

      {selected && (
        <ModalDetalheBatismo
          batismo={selected}
          onClose={() => setSelected(null)}
          onSaved={() => { load(); setSelected(null); }}
        />
      )}

      {novaOpen && (
        <ModalNovaInscricao
          onClose={() => setNovaOpen(false)}
          onCreated={() => { load(); setNovaOpen(false); }}
        />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// MODAL DE DETALHE / EDICAO
// ──────────────────────────────────────────────────────────────────────────
function ModalDetalheBatismo({ batismo, onClose, onSaved }: {
  batismo: BatismoInscricao;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [status, setStatus] = useState<Status>(batismo.status);
  const [dataBatismo, setDataBatismo] = useState(batismo.data_batismo || '');
  const [observacoes, setObservacoes] = useState(batismo.observacoes || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await kpisApi.batismos.update(batismo.id, {
        status,
        data_batismo: dataBatismo || null,
        observacoes: observacoes || null,
      });
      toast.success('Inscricao atualizada');
      onSaved();
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao atualizar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Droplets className="h-5 w-5" style={{ color: C.primary }} />
            {batismo.nome} {batismo.sobrenome}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 pt-2">
          <div className="rounded-xl border border-border p-4 space-y-2 text-sm bg-muted/20">
            {batismo.cpf && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <IdCard className="h-4 w-4" />
                <span>{batismo.cpf}</span>
              </div>
            )}
            {batismo.telefone && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Phone className="h-4 w-4" />
                <span>{batismo.telefone}</span>
              </div>
            )}
            {batismo.email && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Mail className="h-4 w-4" />
                <span>{batismo.email}</span>
              </div>
            )}
            {batismo.data_nascimento && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span>Nascimento: {ymdLocal(batismo.data_nascimento)}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-muted-foreground text-xs pt-1 border-t border-border/50">
              <span>Inscrito em {new Date(batismo.created_at).toLocaleString('pt-BR')}</span>
              <Badge variant="outline" className="text-[9px] uppercase ml-auto">{batismo.origem}</Badge>
            </div>
            {batismo.membro_id && batismo.membro && (
              <div className="flex items-center gap-2 text-xs pt-1 border-t border-border/50" style={{ color: C.primary }}>
                <User className="h-3 w-3" />
                <span>Vinculado ao membro: {batismo.membro.nome}</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Status</Label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value as Status)}
                className="w-full mt-1 px-3 py-2 rounded-xl border border-border bg-background text-sm"
              >
                {(['pendente', 'confirmado', 'realizado', 'cancelado'] as const).map(s => (
                  <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="data-bat" className="text-xs">Data do batismo</Label>
              <Input
                id="data-bat"
                type="date"
                value={dataBatismo}
                onChange={e => setDataBatismo(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="obs" className="text-xs">Observacoes</Label>
            <Textarea
              id="obs"
              value={observacoes}
              onChange={e => setObservacoes(e.target.value)}
              rows={3}
            />
          </div>

          {batismo.status !== 'realizado' && status === 'realizado' && batismo.membro_id && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 dark:bg-emerald-950/20 dark:border-emerald-900/40 p-3 flex gap-2 text-xs text-emerald-800 dark:text-emerald-200">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                Ao marcar como "Realizado", o sistema vai criar automaticamente
                a etapa "batismo" na trilha de valores deste membro (Jornada/NSM).
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="pt-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="gap-2 bg-[#00B39D] hover:bg-[#00B39D]/90 text-white"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// MODAL DE CADASTRO MANUAL
// ──────────────────────────────────────────────────────────────────────────
function ModalNovaInscricao({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
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

  const [form, setForm] = useState({
    nome: '', sobrenome: '',
    cpf: '', telefone: '', email: '',
    data_nascimento: '',
    observacoes: '',
  });
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    let v = e.target.value;
    if (k === 'cpf') v = mascaraCpf(v);
    if (k === 'telefone') v = mascaraTel(v);
    setForm(f => ({ ...f, [k]: v }));
    setErro(null);
  };

  const handleSubmit = async () => {
    if (!form.nome.trim() || form.nome.trim().length < 2) return setErro('Informe o nome');
    if (!form.sobrenome.trim()) return setErro('Informe o sobrenome');
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return setErro('Email invalido');
    if (form.telefone && soDigitos(form.telefone).length < 10) return setErro('Telefone invalido');
    if (form.cpf && !cpfValido(form.cpf)) return setErro('CPF invalido');

    setSaving(true);
    try {
      await kpisApi.batismos.create({
        nome: form.nome.trim(),
        sobrenome: form.sobrenome.trim(),
        cpf: form.cpf || null,
        telefone: form.telefone || null,
        email: form.email.toLowerCase().trim() || null,
        data_nascimento: form.data_nascimento || null,
        observacoes: form.observacoes.trim() || null,
        origem: 'manual',
      });
      toast.success('Inscricao cadastrada!');
      onCreated();
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
            Cadastrar inscricao de batismo
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 pt-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="bn-nome" className="text-xs">Nome *</Label>
              <Input id="bn-nome" value={form.nome} onChange={set('nome')} autoComplete="given-name" />
            </div>
            <div>
              <Label htmlFor="bn-sobrenome" className="text-xs">Sobrenome *</Label>
              <Input id="bn-sobrenome" value={form.sobrenome} onChange={set('sobrenome')} autoComplete="family-name" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="bn-cpf" className="text-xs">CPF (opcional · linka com membro existente)</Label>
              <Input id="bn-cpf" value={form.cpf} onChange={set('cpf')} placeholder="000.000.000-00" inputMode="numeric" />
            </div>
            <div>
              <Label htmlFor="bn-nasc" className="text-xs">Data de nascimento</Label>
              <Input id="bn-nasc" type="date" value={form.data_nascimento} onChange={set('data_nascimento')} autoComplete="bday" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="bn-tel" className="text-xs">Telefone</Label>
              <Input id="bn-tel" value={form.telefone} onChange={set('telefone')} placeholder="(00) 00000-0000" inputMode="tel" autoComplete="tel" />
            </div>
            <div>
              <Label htmlFor="bn-email" className="text-xs">Email</Label>
              <Input id="bn-email" type="email" value={form.email} onChange={set('email')} autoComplete="email" inputMode="email" />
            </div>
          </div>

          <div>
            <Label htmlFor="bn-obs" className="text-xs">Observacoes</Label>
            <Textarea id="bn-obs" value={form.observacoes} onChange={set('observacoes')} rows={2} />
          </div>

          {erro && (
            <div className="rounded-xl border border-red-200 bg-red-50/40 dark:bg-red-950/20 dark:border-red-900/40 p-3 flex gap-2 text-xs text-red-700 dark:text-red-300">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{erro}</span>
            </div>
          )}

          <div className="rounded-xl border border-amber-200 bg-amber-50/40 dark:bg-amber-950/20 dark:border-amber-900/40 p-3 flex gap-2 text-xs text-amber-800 dark:text-amber-200">
            <FileText className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              Status inicial: <strong>pendente</strong>. Voce define a data e marca como
              "confirmado"/"realizado" no detalhe depois do cadastro.
            </div>
          </div>
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
