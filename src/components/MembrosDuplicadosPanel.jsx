// ============================================================================
// MembrosDuplicadosPanel · aba Duplicados de /ministerial/membresia
//
// Marcos: "caso alguem se converta ou levante a mao 2x · ter aba pra juntar".
//
// Mostra pares potencialmente duplicados (vw_membros_duplicados) · cada par
// vem com confianca (0-100) e lista de motivos (cpf · telefone · email · etc).
// Opções por par:
//   1. Fundir mantendo A (deleta B, FKs vão pra A, snapshot em log)
//   2. Fundir mantendo B (vice-versa)
//   3. Não é duplicata · ignorar (vai pra mem_duplicados_ignorados, somem)
// ============================================================================

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { membresia as membresiaApi } from '../api';
import { toast } from 'sonner';
import {
  GitMerge, X, RefreshCw, AlertCircle, Loader2, ArrowLeft, ArrowRight,
  Phone, Mail, Calendar, User as UserIcon, IdCard,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from './ui/dialog';

const MOTIVO_LABELS = {
  cpf_igual:         { label: 'Mesmo CPF',          cor: '#DC2626', forca: 100 },
  nome_e_nascimento: { label: 'Nome + nascimento',  cor: '#7C3AED', forca: 95 },
  telefone_igual:    { label: 'Mesmo telefone',     cor: '#EA580C', forca: 90 },
  email_igual:       { label: 'Mesmo e-mail',       cor: '#0EA5E9', forca: 85 },
  nome_similar:      { label: 'Nome similar',       cor: '#A16207', forca: 70 },
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
  return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR');
}

function fmtDataHora(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

export default function MembrosDuplicadosPanel() {
  const qc = useQueryClient();
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['membresia', 'duplicados'],
    queryFn: () => membresiaApi.duplicados.list({ limit: 200 }),
    staleTime: 30_000,
  });

  const [mergeDialog, setMergeDialog] = useState(null); // { par, keep_id }

  const ignorarMut = useMutation({
    mutationFn: (par) => membresiaApi.duplicados.ignorar({
      membro_a_id: par.membro_a_id,
      membro_b_id: par.membro_b_id,
      motivo: 'Marcado manualmente como não duplicado',
    }),
    onSuccess: () => {
      toast.success('Par ignorado · não aparece mais aqui');
      qc.invalidateQueries({ queryKey: ['membresia', 'duplicados'] });
    },
    onError: (e) => toast.error(e?.message || 'Erro ao ignorar'),
  });

  const mergeMut = useMutation({
    mutationFn: ({ keep_id, merge_ids }) => membresiaApi.duplicados.merge({
      keep_id,
      merge_ids,
      observacao: 'Merge manual via aba Duplicados',
    }),
    onSuccess: (res) => {
      toast.success(`Fundido · ${res?.merged || 1} cadastro(s) absorvido(s)`);
      qc.invalidateQueries({ queryKey: ['membresia', 'duplicados'] });
      qc.invalidateQueries({ queryKey: ['membresia', 'membros'] });
      setMergeDialog(null);
    },
    onError: (e) => toast.error(e?.message || 'Erro ao fundir'),
  });

  const items = data?.items || [];
  const total = data?.total || 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <GitMerge className="size-4 text-primary" />
            Possíveis duplicados
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Pares de cadastros que parecem ser a mesma pessoa · CPF, telefone, e-mail, nome+nascimento ou nome similar.
          </p>
        </div>
        <Button
          onClick={() => refetch()}
          disabled={isFetching}
          variant="outline"
          size="sm"
          className="gap-1.5"
        >
          <RefreshCw className={`size-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          Recarregar
        </Button>
      </div>

      {/* Loading / empty */}
      {isLoading ? (
        <div className="py-12 flex items-center justify-center text-muted-foreground">
          <Loader2 className="size-5 animate-spin mr-2" /> Procurando duplicados...
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-muted/20 p-8 text-center">
          <AlertCircle className="size-8 mx-auto text-muted-foreground/60 mb-3" />
          <p className="text-sm font-medium text-foreground">Nenhum duplicado detectado</p>
          <p className="text-xs text-muted-foreground mt-1">
            Quando aparecer cadastros com CPF, telefone, e-mail ou nome+nascimento iguais, eles vão aparecer aqui pra você fundir.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">
            {total} par{total === 1 ? '' : 'es'} detectado{total === 1 ? '' : 's'}
          </div>
          {items.map(par => (
            <ParCard
              key={par.par_id}
              par={par}
              onMerge={(keep_id) => setMergeDialog({ par, keep_id })}
              onIgnorar={() => ignorarMut.mutate(par)}
              ignorando={ignorarMut.isPending}
            />
          ))}
        </div>
      )}

      {/* Modal de confirmação de merge */}
      <Dialog open={!!mergeDialog} onOpenChange={(open) => !open && setMergeDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar fusão</DialogTitle>
            <DialogDescription>
              Esta ação é <strong>permanente</strong> · não dá pra desfazer pela UI (só consultando o log).
            </DialogDescription>
          </DialogHeader>
          {mergeDialog && (() => {
            const keep = mergeDialog.par.membro_a_id === mergeDialog.keep_id
              ? mergeDialog.par.membro_a : mergeDialog.par.membro_b;
            const drop = mergeDialog.par.membro_a_id === mergeDialog.keep_id
              ? mergeDialog.par.membro_b : mergeDialog.par.membro_a;
            return (
              <div className="space-y-3 text-sm">
                <div className="rounded-lg border bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800 p-3">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300 mb-1">
                    Manter este cadastro
                  </div>
                  <div className="font-semibold text-foreground">{keep.nome}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Criado {fmtDataHora(keep.criado_em)} · {keep.status}
                  </div>
                </div>
                <div className="rounded-lg border bg-red-50 dark:bg-red-950/30 border-red-300 dark:border-red-800 p-3">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-red-700 dark:text-red-300 mb-1">
                    Absorver este (será deletado)
                  </div>
                  <div className="font-semibold text-foreground">{drop.nome}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Criado {fmtDataHora(drop.criado_em)} · {drop.status}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Todos os vínculos (grupos, contribuições, voluntariado, decisões, devocionais, NSM) do cadastro absorvido vão ser <strong>transferidos</strong> para o cadastro mantido. Snapshot do antes vai pro <code className="text-[10px] bg-muted px-1 rounded">mem_merge_log</code>.
                </p>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setMergeDialog(null)} disabled={mergeMut.isPending}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (!mergeDialog) return;
                const drop_id = mergeDialog.par.membro_a_id === mergeDialog.keep_id
                  ? mergeDialog.par.membro_b_id : mergeDialog.par.membro_a_id;
                mergeMut.mutate({ keep_id: mergeDialog.keep_id, merge_ids: [drop_id] });
              }}
              disabled={mergeMut.isPending}
              className="gap-1.5"
            >
              {mergeMut.isPending
                ? <><Loader2 className="size-3.5 animate-spin" /> Fundindo...</>
                : <><GitMerge className="size-3.5" /> Confirmar fusão</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ----------------------------------------------------------------------------
// ParCard · 1 par lado a lado com badges de motivo + ações
// ----------------------------------------------------------------------------
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
          {motivos.map(m => {
            const def = MOTIVO_LABELS[m] || { label: m, cor: '#6B7280' };
            return (
              <Badge
                key={m}
                variant="outline"
                className="text-[10px]"
                style={{ borderColor: def.cor, color: def.cor }}
              >
                {def.label}
              </Badge>
            );
          })}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onIgnorar}
          disabled={ignorando}
          className="h-7 text-xs gap-1"
        >
          <X className="size-3" /> Não é duplicata
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
            : <div className="size-8 rounded-full bg-muted flex items-center justify-center"><UserIcon className="size-4 text-muted-foreground" /></div>
          }
          <div>
            <div className="font-semibold text-sm text-foreground">{membro.nome}</div>
            <div className="text-[10px] text-muted-foreground">
              {membro.status} · criado {fmtDataHora(membro.criado_em)}
            </div>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={onMerge}
          className="gap-1 text-xs h-7"
          title="Fundir mantendo este cadastro"
        >
          {lado === 'A' ? <ArrowRight className="size-3" /> : <ArrowLeft className="size-3" />}
          Manter este
        </Button>
      </div>
      <div className="text-xs space-y-1 pl-10">
        {membro.cpf && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <IdCard className="size-3" /> <span className="font-mono">{maskCpf(membro.cpf)}</span>
          </div>
        )}
        {membro.telefone && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Phone className="size-3" /> {maskTelefone(membro.telefone)}
          </div>
        )}
        {membro.email && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Mail className="size-3" /> <span className="truncate">{membro.email}</span>
          </div>
        )}
        {membro.data_nascimento && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Calendar className="size-3" /> {fmtData(membro.data_nascimento)}
          </div>
        )}
      </div>
    </div>
  );
}
