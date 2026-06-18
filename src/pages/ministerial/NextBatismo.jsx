// ============================================================================
// Next - Batismo · "Check de pessoas" do funil de novos convertidos (Fase 1)
//
// Console de RESOLUÇÃO DE IDENTIDADE do Kevyn (Marcos · 2026-06-15). NÃO faz
// CRUD/presença — Integração confirma presença e consome as identidades limpas.
// Duas lentes:
//   1. Duplicatas possíveis · funde (mantém um, absorve o outro) ou marca
//      "não é a mesma pessoa". Detecta convertido recém-chegado (nome parecido
//      sem CPF/nascimento · revisão humana · NUNCA auto-funde).
//   2. Sem vínculo · inscrição (Next/Batismo) ou decisão sem membro vinculado →
//      liga ao membro certo (sugestões por CPF/telefone/e-mail/nome) ou cria o
//      cadastro novo.
// ============================================================================

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { nextBatismo as api } from '../../api';
import { toast } from 'sonner';
import {
  UserSearch, GitMerge, X, RefreshCw, Loader2, ArrowLeft, ArrowRight,
  Phone, Mail, Calendar, User as UserIcon, IdCard, Link2, UserPlus, Users,
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '../../components/ui/dialog';

const MOTIVO_LABELS = {
  cpf_igual:         { label: 'Mesmo CPF',          cor: '#DC2626' },
  nome_e_nascimento: { label: 'Nome + nascimento',  cor: '#7C3AED' },
  telefone_igual:    { label: 'Mesmo telefone',     cor: '#EA580C' },
  email_igual:       { label: 'Mesmo e-mail',       cor: '#0EA5E9' },
  nome_similar:      { label: 'Nome similar',       cor: '#A16207' },
  nome_parecido:     { label: 'Nome parecido',      cor: '#CA8A04' },
  nome:              { label: 'Nome',               cor: '#CA8A04' },
};

const ORIGEM_META = {
  next:       { label: 'Next',      cor: '#0EA5E9' },
  batismo:    { label: 'Batismo',   cor: '#2563EB' },
  convertido: { label: 'Decisão',   cor: '#DB2777' },
};

function maskCpf(v) {
  if (!v) return '';
  const d = String(v).replace(/\D/g, '');
  if (d.length !== 11) return v;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}
function maskTelefone(v) {
  if (!v) return '';
  const d = String(v).replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return v;
}
function fmtData(iso) {
  if (!iso) return '';
  const s = String(iso);
  const d = s.length <= 10 ? new Date(s + 'T12:00:00') : new Date(s);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ============================================================================
export default function NextBatismo() {
  const [tab, setTab] = useState('duplicatas');
  const { data: resumo } = useQuery({
    queryKey: ['next-batismo', 'resumo'],
    queryFn: () => api.resumo(),
    staleTime: 30_000,
  });

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <UserSearch className="size-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Next - Batismo</h1>
          <p className="text-sm text-muted-foreground">
            Check de pessoas do funil de novos convertidos · garante uma pessoa = um cadastro
            antes de seguir pra Membresia.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        <TabBtn active={tab === 'duplicatas'} onClick={() => setTab('duplicatas')}
          icon={GitMerge} label="Duplicatas possíveis" count={resumo?.duplicatas} />
        <TabBtn active={tab === 'sem_vinculo'} onClick={() => setTab('sem_vinculo')}
          icon={Link2} label="Sem vínculo" count={resumo?.sem_vinculo} />
      </div>

      {tab === 'duplicatas' ? <DuplicadosTab /> : <SemVinculoTab />}
    </div>
  );
}

function TabBtn({ active, onClick, icon: Icon, label, count }) {
  return (
    <button
      onClick={onClick}
      className={`relative -mb-px flex items-center gap-2 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
        active ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
      }`}
    >
      <Icon className="size-4" />
      {label}
      {count != null && count > 0 && (
        <span className="ml-0.5 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-primary/15 text-primary text-[11px] font-bold">
          {count}
        </span>
      )}
    </button>
  );
}

// ----------------------------------------------------------------------------
// LENTE 1 · Duplicatas
// ----------------------------------------------------------------------------
function DuplicadosTab() {
  const qc = useQueryClient();
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['next-batismo', 'duplicados'],
    queryFn: () => api.duplicados({ limit: 200 }),
    staleTime: 30_000,
  });
  const [mergeDialog, setMergeDialog] = useState(null); // { par, keep_id }

  const invalida = () => {
    qc.invalidateQueries({ queryKey: ['next-batismo', 'duplicados'] });
    qc.invalidateQueries({ queryKey: ['next-batismo', 'resumo'] });
  };

  const ignorarMut = useMutation({
    mutationFn: (par) => api.ignorarDuplicata({ membro_a_id: par.membro_a_id, membro_b_id: par.membro_b_id }),
    onSuccess: () => { toast.success('Marcado como pessoas distintas · não aparece mais'); invalida(); },
    onError: (e) => toast.error(e?.message || 'Erro ao ignorar'),
  });
  const mergeMut = useMutation({
    mutationFn: ({ keep_id, merge_ids }) => api.fundir({ keep_id, merge_ids }),
    onSuccess: (res) => {
      toast.success(`Fundido · ${res?.merged || 1} cadastro(s) absorvido(s)`);
      invalida(); setMergeDialog(null);
    },
    onError: (e) => toast.error(e?.message || 'Erro ao fundir'),
  });

  const items = data?.items || [];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <p className="text-xs text-muted-foreground max-w-2xl">
          Pares que parecem a <strong>mesma pessoa</strong> dentro do funil novo. Inclui convertido
          recém-chegado com nome parecido (sem CPF/nascimento) — por isso, <strong>confira antes de fundir</strong>:
          dois nomes parecidos podem ser pessoas diferentes.
        </p>
        <Button onClick={() => refetch()} disabled={isFetching} variant="outline" size="sm" className="gap-1.5">
          <RefreshCw className={`size-3.5 ${isFetching ? 'animate-spin' : ''}`} /> Recarregar
        </Button>
      </div>

      {isLoading ? (
        <Centro><Loader2 className="size-5 animate-spin mr-2" /> Procurando duplicatas...</Centro>
      ) : items.length === 0 ? (
        <Vazio icon={GitMerge} titulo="Nenhuma duplicata pendente"
          texto="Quando dois cadastros do funil parecerem a mesma pessoa, eles aparecem aqui pra você juntar." />
      ) : (
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">{items.length} par(es) pra revisar</div>
          {items.map((par) => (
            <ParCard key={par.par_id} par={par}
              onMerge={(keep_id) => setMergeDialog({ par, keep_id })}
              onIgnorar={() => ignorarMut.mutate(par)} ignorando={ignorarMut.isPending} />
          ))}
        </div>
      )}

      <Dialog open={!!mergeDialog} onOpenChange={(o) => !o && setMergeDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar fusão</DialogTitle>
            <DialogDescription>
              Esta ação é <strong>permanente</strong> · só dá pra auditar pelo log, não desfazer pela tela.
            </DialogDescription>
          </DialogHeader>
          {mergeDialog && (() => {
            const keep = mergeDialog.par.membro_a_id === mergeDialog.keep_id ? mergeDialog.par.membro_a : mergeDialog.par.membro_b;
            const drop = mergeDialog.par.membro_a_id === mergeDialog.keep_id ? mergeDialog.par.membro_b : mergeDialog.par.membro_a;
            return (
              <div className="space-y-3 text-sm">
                <div className="rounded-lg border bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800 p-3">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300 mb-1">Manter este</div>
                  <div className="font-semibold text-foreground">{keep.nome}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">criado {fmtData(keep.criado_em)} · {keep.status}</div>
                </div>
                <div className="rounded-lg border bg-red-50 dark:bg-red-950/30 border-red-300 dark:border-red-800 p-3">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-red-700 dark:text-red-300 mb-1">Absorver (será deletado)</div>
                  <div className="font-semibold text-foreground">{drop.nome}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">criado {fmtData(drop.criado_em)} · {drop.status}</div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Todos os vínculos do cadastro absorvido (inscrições, decisões, grupos, contribuições, NSM) passam pro mantido. Snapshot vai pro log.
                </p>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setMergeDialog(null)} disabled={mergeMut.isPending}>Cancelar</Button>
            <Button
              onClick={() => {
                if (!mergeDialog) return;
                const drop_id = mergeDialog.par.membro_a_id === mergeDialog.keep_id ? mergeDialog.par.membro_b_id : mergeDialog.par.membro_a_id;
                mergeMut.mutate({ keep_id: mergeDialog.keep_id, merge_ids: [drop_id] });
              }}
              disabled={mergeMut.isPending} className="gap-1.5"
            >
              {mergeMut.isPending ? <><Loader2 className="size-3.5 animate-spin" /> Fundindo...</> : <><GitMerge className="size-3.5" /> Confirmar fusão</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ParCard({ par, onMerge, onIgnorar, ignorando }) {
  const motivos = par.motivos || [];
  const corPrincipal = MOTIVO_LABELS[motivos[0]]?.cor || '#6B7280';
  return (
    <Card className="overflow-hidden">
      <CardHeader className="py-2 px-3 flex flex-row items-center justify-between gap-2 space-y-0" style={{ borderLeft: `3px solid ${corPrincipal}`, background: 'var(--cbrio-input-bg)' }}>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-[10px] font-bold" style={{ borderColor: corPrincipal, color: corPrincipal }}>
            {par.confianca}% provável
          </Badge>
          {motivos.map((m) => {
            const def = MOTIVO_LABELS[m] || { label: m, cor: '#6B7280' };
            return <Badge key={m} variant="outline" className="text-[10px]" style={{ borderColor: def.cor, color: def.cor }}>{def.label}</Badge>;
          })}
        </div>
        <Button variant="ghost" size="sm" onClick={onIgnorar} disabled={ignorando} className="h-7 text-xs gap-1">
          <X className="size-3" /> Não é a mesma pessoa
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x">
          <MembroLado membro={par.membro_a} lado="A" onMerge={() => onMerge(par.membro_a_id)} />
          <MembroLado membro={par.membro_b} lado="B" onMerge={() => onMerge(par.membro_b_id)} />
        </div>
      </CardContent>
    </Card>
  );
}

function MembroLado({ membro, lado, onMerge }) {
  return (
    <div className="p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {membro.foto_url
            ? <img src={membro.foto_url} alt="" className="size-8 rounded-full object-cover" />
            : <div className="size-8 rounded-full bg-muted flex items-center justify-center"><UserIcon className="size-4 text-muted-foreground" /></div>}
          <div>
            <div className="font-semibold text-sm text-foreground">{membro.nome}</div>
            <div className="text-[10px] text-muted-foreground">{membro.status} · criado {fmtData(membro.criado_em)}</div>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={onMerge} className="gap-1 text-xs h-7" title="Fundir mantendo este cadastro">
          {lado === 'A' ? <ArrowRight className="size-3" /> : <ArrowLeft className="size-3" />} Manter este
        </Button>
      </div>
      <div className="text-xs space-y-1 pl-10">
        {membro.cpf && <Linha icon={IdCard}><span className="font-mono">{maskCpf(membro.cpf)}</span></Linha>}
        {membro.telefone && <Linha icon={Phone}>{maskTelefone(membro.telefone)}</Linha>}
        {membro.email && <Linha icon={Mail}><span className="truncate">{membro.email}</span></Linha>}
        {membro.data_nascimento && <Linha icon={Calendar}>{fmtData(membro.data_nascimento)}</Linha>}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// LENTE 2 · Sem vínculo
// ----------------------------------------------------------------------------
function SemVinculoTab() {
  const qc = useQueryClient();
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['next-batismo', 'sem-vinculo'],
    queryFn: () => api.semVinculo(),
    staleTime: 30_000,
  });
  const [ligarRow, setLigarRow] = useState(null);

  const itens = data?.itens || [];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <p className="text-xs text-muted-foreground max-w-2xl">
          Inscrições do Next/Batismo e decisões que <strong>ainda não estão ligadas a um cadastro</strong>.
          Ligue à pessoa certa (a busca sugere quem já existe) ou crie o cadastro se for alguém novo.
        </p>
        <Button onClick={() => refetch()} disabled={isFetching} variant="outline" size="sm" className="gap-1.5">
          <RefreshCw className={`size-3.5 ${isFetching ? 'animate-spin' : ''}`} /> Recarregar
        </Button>
      </div>

      {isLoading ? (
        <Centro><Loader2 className="size-5 animate-spin mr-2" /> Buscando pendências...</Centro>
      ) : itens.length === 0 ? (
        <Vazio icon={Link2} titulo="Tudo ligado por aqui"
          texto="Toda inscrição e decisão do funil está vinculada a um cadastro. Bom trabalho!" />
      ) : (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">{itens.length} pendência(s)</div>
          {itens.map((r) => <SemVinculoRow key={`${r.tipo}_${r.id}`} row={r} onLigar={() => setLigarRow(r)} />)}
        </div>
      )}

      <LigarDialog row={ligarRow} onClose={() => setLigarRow(null)} onDone={() => {
        qc.invalidateQueries({ queryKey: ['next-batismo', 'sem-vinculo'] });
        qc.invalidateQueries({ queryKey: ['next-batismo', 'resumo'] });
        qc.invalidateQueries({ queryKey: ['next-batismo', 'duplicados'] });
        setLigarRow(null);
      }} />
    </div>
  );
}

function SemVinculoRow({ row, onLigar }) {
  const om = ORIGEM_META[row.tipo] || { label: row.tipo, cor: '#6B7280' };
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px]" style={{ borderColor: om.cor, color: om.cor }}>{om.label}</Badge>
          <span className="font-medium text-sm text-foreground truncate">{row.nome}</span>
        </div>
        <div className="text-[11px] text-muted-foreground mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
          {row.cpf && <span className="font-mono">{maskCpf(row.cpf)}</span>}
          {row.telefone && <span>{maskTelefone(row.telefone)}</span>}
          {row.email && <span className="truncate">{row.email}</span>}
          <span>{row.contexto}{row.quando ? ` · ${fmtData(row.quando)}` : ''}</span>
        </div>
      </div>
      <Button size="sm" variant="outline" onClick={onLigar} className="gap-1.5 text-xs h-8 shrink-0">
        <Link2 className="size-3.5" /> Ligar
      </Button>
    </div>
  );
}

function LigarDialog({ row, onClose, onDone }) {
  const open = !!row;
  const { data, isLoading } = useQuery({
    queryKey: ['next-batismo', 'candidatos', row?.tipo, row?.id],
    queryFn: () => api.candidatos({ cpf: row.cpf || '', email: row.email || '', telefone: row.telefone || '', nome: row.nome || '' }),
    enabled: open,
    staleTime: 10_000,
  });

  const ligarMut = useMutation({
    mutationFn: (payload) => api.ligar(payload),
    onSuccess: (res) => {
      toast.success(res?.criado ? 'Cadastro novo criado e ligado' : 'Inscrição ligada ao cadastro');
      onDone();
    },
    onError: (e) => toast.error(e?.message || 'Erro ao ligar'),
  });

  const candidatos = data?.candidatos || [];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Ligar ao cadastro certo</DialogTitle>
          <DialogDescription>
            {row && (
              <span>
                <strong className="text-foreground">{row.nome}</strong>
                {row.cpf ? ` · ${maskCpf(row.cpf)}` : ''}{row.telefone ? ` · ${maskTelefone(row.telefone)}` : ''} · {ORIGEM_META[row?.tipo]?.label}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <Users className="size-3.5" /> Já existe no sistema?
          </div>
          {isLoading ? (
            <div className="py-6 flex items-center justify-center text-muted-foreground"><Loader2 className="size-4 animate-spin mr-2" /> Buscando...</div>
          ) : candidatos.length === 0 ? (
            <div className="rounded-lg border border-dashed bg-muted/20 p-4 text-center text-xs text-muted-foreground">
              Nenhum cadastro parecido encontrado. Se for alguém novo, crie o cadastro abaixo.
            </div>
          ) : (
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {candidatos.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-2 rounded-lg border bg-card px-2.5 py-1.5">
                  <div className="min-w-0 flex items-center gap-2">
                    {c.foto_url
                      ? <img src={c.foto_url} alt="" className="size-7 rounded-full object-cover shrink-0" />
                      : <div className="size-7 rounded-full bg-muted flex items-center justify-center shrink-0"><UserIcon className="size-3.5 text-muted-foreground" /></div>}
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">{c.nome}</div>
                      <div className="text-[10px] text-muted-foreground flex flex-wrap gap-x-2">
                        {c.cpf && <span className="font-mono">{maskCpf(c.cpf)}</span>}
                        {c.telefone && <span>{maskTelefone(c.telefone)}</span>}
                        <span className="opacity-70">{c.status}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Badge variant="outline" className="text-[10px]" title={(c.motivos || []).join(', ')}>{c.score}%</Badge>
                    <Button size="sm" className="h-7 text-xs gap-1"
                      disabled={ligarMut.isPending}
                      onClick={() => ligarMut.mutate({ tipo: row.tipo, id: row.id, membro_id: c.id })}>
                      <Link2 className="size-3" /> É esta
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={onClose} disabled={ligarMut.isPending} className="sm:mr-auto">Cancelar</Button>
          <Button variant="secondary" className="gap-1.5" disabled={ligarMut.isPending}
            onClick={() => ligarMut.mutate({ tipo: row.tipo, id: row.id, criar: true })}>
            {ligarMut.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <UserPlus className="size-3.5" />}
            É alguém novo · criar cadastro
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ----------------------------------------------------------------------------
// Pequenos helpers de UI
// ----------------------------------------------------------------------------
function Linha({ icon: Icon, children }) {
  return <div className="flex items-center gap-1.5 text-muted-foreground"><Icon className="size-3" /> {children}</div>;
}
function Centro({ children }) {
  return <div className="py-12 flex items-center justify-center text-muted-foreground">{children}</div>;
}
function Vazio({ icon: Icon, titulo, texto }) {
  return (
    <div className="rounded-xl border border-dashed bg-muted/20 p-8 text-center">
      <Icon className="size-8 mx-auto text-muted-foreground/60 mb-3" />
      <p className="text-sm font-medium text-foreground">{titulo}</p>
      <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">{texto}</p>
    </div>
  );
}
