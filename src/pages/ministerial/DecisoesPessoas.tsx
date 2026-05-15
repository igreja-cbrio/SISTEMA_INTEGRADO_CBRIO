// ============================================================================
// /integracao aba Decisões · interface dedicada pra registrar pessoas que
// tomaram decisão em culto
//
// Marcos: "lembra tambem de fazer uma interface para preencher os dados das
//          pessoas que tomam decisao por Jesus, nao vi isso no sistema".
//
// Listagem dos cultos com decisoes, agrupados por status do gap:
//  - NENHUMA REGISTRADA (vermelho) · culto com decisões e zero pessoas
//  - PARCIAL (amarelo) · algumas pessoas registradas
//  - COMPLETO (verde) · todas as decisões com nome
//
// Click num culto abre lista de pessoas + form pra adicionar nova.
// ============================================================================

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { painel as painelApi, kpis as kpisApi } from '../../api';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card, CardContent } from '../../components/ui/card';
import {
  UserPlus, Heart, Loader2, AlertTriangle, CheckCircle2, EyeOff,
  ChevronDown, ChevronRight, Trash2, Pencil, Search,
} from 'lucide-react';
import { toast } from 'sonner';

const C = { primary: '#00B39D', purple: '#8B5CF6', amber: '#F59E0B', red: '#EF4444', green: '#10B981', gray: '#9CA3AF' };

type CultoSemDados = {
  culto_id: string;
  data_culto: string;
  culto_nome: string | null;
  service_type_name: string | null;
  service_type_color: string | null;
  decisoes_presenciais: number;
  decisoes_online: number | null;
  total_decisoes: number;
  total_registradas: number;
  com_membro_vinculado: number;
  sem_dados: number;
  gap_status: 'sem_decisoes' | 'nenhuma_registrada' | 'parcial' | 'completo';
};

type FiltroStatus = 'todos' | 'pendentes' | 'completos';

export default function DecisoesPessoas() {
  const [filtro, setFiltro] = useState<FiltroStatus>('pendentes');
  const [busca, setBusca] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['painel', 'nsm-sem-dados', 365],
    queryFn: () => painelApi.nsmSemDados({ dias: 365 }),
    staleTime: 30_000,
  });

  const items: CultoSemDados[] = data?.items || [];
  const resumo = data?.resumo || { total_cultos: 0, total_decisoes: 0, total_registradas: 0, total_sem_dados: 0 };

  const filtrados = useMemo(() => {
    let lista = items;
    if (filtro === 'pendentes') lista = items.filter(c => c.gap_status === 'nenhuma_registrada' || c.gap_status === 'parcial');
    if (filtro === 'completos') lista = items.filter(c => c.gap_status === 'completo');
    if (busca) {
      const q = busca.toLowerCase();
      lista = lista.filter(c =>
        (c.service_type_name || '').toLowerCase().includes(q) ||
        (c.data_culto || '').includes(q)
      );
    }
    return lista;
  }, [items, filtro, busca]);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-start gap-2.5">
          <Heart className="h-5 w-5 text-[#8B5CF6] mt-0.5 shrink-0" />
          <div className="text-xs text-muted-foreground leading-relaxed">
            Registre os <strong>nomes e contatos</strong> das pessoas que tomaram decisão em cada culto.
            Sem isso, as decisões viram <strong>fantasmas</strong>: contam no número, mas a NSM não consegue
            acompanhar o engajamento delas em ≥1 valor da Jornada. Cadastrar aqui ativa a trilha pastoral.
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatBox label="Decisões registradas (total)" value={resumo.total_decisoes} cor={C.purple} />
        <StatBox label="Pessoas cadastradas" value={resumo.total_registradas} cor={C.green} />
        <StatBox label="SEM dados (fantasmas)" value={resumo.total_sem_dados} cor={C.red} destaque />
        <StatBox label="Cultos com decisões" value={resumo.total_cultos} cor={C.gray} />
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8 h-9"
            placeholder="Buscar por tipo de culto ou data..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
          />
        </div>
        <div className="inline-flex rounded-md border border-border p-0.5 bg-muted/30">
          {[
            { v: 'pendentes' as FiltroStatus, l: 'Pendentes', cor: C.amber },
            { v: 'completos' as FiltroStatus, l: 'Completos', cor: C.green },
            { v: 'todos' as FiltroStatus,     l: 'Todos',     cor: C.primary },
          ].map(opt => (
            <button
              key={opt.v}
              onClick={() => setFiltro(opt.v)}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                filtro === opt.v ? 'text-white' : 'text-muted-foreground hover:text-foreground'
              }`}
              style={filtro === opt.v ? { background: opt.cor } : undefined}
            >
              {opt.l}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">
          {filtrados.length} culto{filtrados.length === 1 ? '' : 's'}
        </span>
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtrados.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {filtro === 'pendentes'
              ? 'Nenhum culto com pendência · todas as decisões têm pessoa cadastrada 🎉'
              : 'Nenhum culto bate com o filtro.'}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtrados.map(c => (
            <CultoLinha
              key={c.culto_id}
              culto={c}
              expanded={expandedId === c.culto_id}
              onToggle={() => setExpandedId(expandedId === c.culto_id ? null : c.culto_id)}
              onChanged={() => refetch()}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function StatBox({ label, value, cor, destaque }: { label: string; value: number; cor: string; destaque?: boolean }) {
  return (
    <div
      className="rounded-lg border bg-card px-3 py-3 text-center"
      style={destaque ? { borderColor: cor, borderWidth: 2 } : undefined}
    >
      <div className="text-2xl font-bold tabular-nums leading-none" style={{ color: cor }}>
        {value.toLocaleString('pt-BR')}
      </div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-1.5 font-semibold">{label}</div>
    </div>
  );
}

function CultoLinha({
  culto, expanded, onToggle, onChanged,
}: {
  culto: CultoSemDados;
  expanded: boolean;
  onToggle: () => void;
  onChanged: () => void;
}) {
  const cor = culto.gap_status === 'nenhuma_registrada' ? C.red
            : culto.gap_status === 'parcial' ? C.amber
            : C.green;
  const dataFmt = new Date(culto.data_culto + 'T12:00:00').toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric', weekday: 'short',
  });

  return (
    <div className="rounded-lg border bg-card overflow-hidden" style={{ borderLeft: `3px solid ${cor}` }}>
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-muted/30 transition-colors text-left"
      >
        {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm capitalize">{dataFmt}</span>
            <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4" style={{ color: culto.service_type_color || C.primary, borderColor: culto.service_type_color || C.primary }}>
              {culto.service_type_name || 'Sem tipo'}
            </Badge>
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            <strong>{culto.total_decisoes}</strong> decisões · <strong>{culto.total_registradas}</strong> cadastradas
            {culto.com_membro_vinculado > 0 && <> · {culto.com_membro_vinculado} vinculadas a membro</>}
          </div>
        </div>
        <span
          className="text-[10px] font-bold px-2 py-1 rounded shrink-0"
          style={{ background: `${cor}1a`, color: cor }}
        >
          {culto.gap_status === 'nenhuma_registrada' ? `${culto.sem_dados} SEM DADOS`
            : culto.gap_status === 'parcial' ? `Faltam ${culto.sem_dados}`
            : 'Completo ✓'}
        </span>
      </button>
      {expanded && (
        <CultoExpandido cultoId={culto.culto_id} totalEsperado={culto.total_decisoes} onChanged={onChanged} />
      )}
    </div>
  );
}

function CultoExpandido({ cultoId, totalEsperado, onChanged }: { cultoId: string; totalEsperado: number; onChanged: () => void }) {
  const { data: pessoas = [], refetch } = useQuery({
    queryKey: ['cultos', cultoId, 'decisoes-pessoas'],
    queryFn: () => kpisApi.cultos.decisoesPessoas.list(cultoId),
    staleTime: 10_000,
  });

  const [adicionando, setAdicionando] = useState(false);
  const faltando = Math.max(0, totalEsperado - pessoas.length);

  const handleSaved = () => {
    setAdicionando(false);
    refetch();
    onChanged();
  };

  const remover = async (id: string) => {
    if (!window.confirm('Remover este registro?')) return;
    try {
      await kpisApi.cultos.decisoesPessoas.remove(id);
      toast.success('Removido');
      refetch();
      onChanged();
    } catch (e: any) {
      toast.error(e?.message || 'Erro');
    }
  };

  return (
    <div className="border-t bg-muted/20 p-3 space-y-2">
      {pessoas.length === 0 && !adicionando && (
        <div className="text-xs text-muted-foreground text-center py-3">
          Nenhuma pessoa registrada · clique no botão abaixo pra começar
        </div>
      )}

      {pessoas.length > 0 && (
        <div className="space-y-1.5">
          {pessoas.map((p: any) => (
            <div key={p.id} className="flex items-center gap-2 px-2.5 py-1.5 bg-card border rounded text-xs" style={{ borderLeft: `3px solid ${C.purple}` }}>
              <span className="font-semibold flex-1 min-w-0 truncate">{p.nome}</span>
              {p.telefone && <span className="text-muted-foreground">{p.telefone}</span>}
              {p.cpf && <span className="text-muted-foreground font-mono text-[10px]">{maskCpf(p.cpf)}</span>}
              <Badge variant="outline" className="text-[8px] px-1 py-0 h-4 capitalize">{p.tipo_decisao}</Badge>
              {p.membro_id && (
                <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                  vinculada
                </span>
              )}
              <button onClick={() => remover(p.id)} className="text-muted-foreground hover:text-red-500" title="Remover">
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {adicionando ? (
        <FormAdicionar cultoId={cultoId} onSaved={handleSaved} onCancel={() => setAdicionando(false)} />
      ) : (
        <Button
          onClick={() => setAdicionando(true)}
          size="sm"
          variant="outline"
          className="w-full h-8 gap-1.5"
          style={faltando > 0 ? { borderColor: C.purple, color: C.purple } : undefined}
        >
          <UserPlus className="h-3.5 w-3.5" />
          Adicionar pessoa {faltando > 0 ? `(faltam ${faltando})` : ''}
        </Button>
      )}
    </div>
  );
}

function FormAdicionar({ cultoId, onSaved, onCancel }: { cultoId: string; onSaved: () => void; onCancel: () => void }) {
  const [form, setForm] = useState({
    nome: '', telefone: '', email: '', idade: '', cpf: '',
    data_nascimento: '', tipo_decisao: 'presencial', observacoes: '',
  });
  const [saving, setSaving] = useState(false);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (form.nome.trim().length < 2) return toast.error('Nome obrigatório (min 2)');
    const cpfLimpo = form.cpf.replace(/\D/g, '');
    if (cpfLimpo.length !== 11) return toast.error('CPF deve ter 11 dígitos');
    if (!form.data_nascimento) return toast.error('Data de nascimento obrigatória');
    setSaving(true);
    try {
      await kpisApi.cultos.decisoesPessoas.create(cultoId, {
        nome: form.nome.trim(),
        telefone: form.telefone || null,
        email: form.email || null,
        idade: form.idade ? Number(form.idade) : null,
        cpf: cpfLimpo,
        data_nascimento: form.data_nascimento,
        tipo_decisao: form.tipo_decisao,
        observacoes: form.observacoes || null,
      });
      toast.success('Pessoa registrada');
      onSaved();
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao registrar');
    } finally { setSaving(false); }
  };

  return (
    <div className="rounded-lg border bg-card p-3 space-y-2" style={{ borderColor: C.purple, borderWidth: 2 }}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <div className="md:col-span-2">
          <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Nome *</label>
          <Input value={form.nome} onChange={e => set('nome', e.target.value)} autoFocus placeholder="Nome completo" className="h-8 text-xs" />
        </div>
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Tipo</label>
          <select
            value={form.tipo_decisao}
            onChange={e => set('tipo_decisao', e.target.value)}
            className="w-full h-8 px-2 rounded-md border border-input bg-background text-xs"
          >
            <option value="presencial">Presencial</option>
            <option value="online">Online</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">CPF *</label>
          <Input value={form.cpf} onChange={e => set('cpf', maskCpf(e.target.value))} maxLength={14} placeholder="000.000.000-00" className="h-8 text-xs" />
        </div>
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Nascimento *</label>
          <Input type="date" value={form.data_nascimento} onChange={e => set('data_nascimento', e.target.value)} className="h-8 text-xs" />
        </div>
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Telefone</label>
          <Input value={form.telefone} onChange={e => set('telefone', e.target.value)} placeholder="(21) 99999-0000" className="h-8 text-xs" />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Email</label>
          <Input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="opcional" className="h-8 text-xs" />
        </div>
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Observações</label>
          <Input value={form.observacoes} onChange={e => set('observacoes', e.target.value)} placeholder="opcional" className="h-8 text-xs" />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button onClick={onCancel} size="sm" variant="outline" disabled={saving}>Cancelar</Button>
        <Button onClick={submit} size="sm" disabled={saving} className="gap-1.5 text-white" style={{ background: C.purple }}>
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserPlus className="h-3 w-3" />}
          Registrar
        </Button>
      </div>
    </div>
  );
}

function maskCpf(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}
