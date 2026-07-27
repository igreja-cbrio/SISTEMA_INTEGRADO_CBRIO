// ════════════════════════════════════════════════════════════════════════════
// E-mails · disparos pros voluntários
// Composer WYSIWYG (Tiptap) + IA + segmentos (todos/equipe/escala) + histórico
// com status por destinatário. Envio via Microsoft Graph (backend) · limite
// ~30 msgs/min do Exchange → blasts grandes concluem em background (cron).
// ════════════════════════════════════════════════════════════════════════════
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { voluntariado } from '@/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Mail, Plus, Pencil, Trash2, XCircle, Loader2, Clock, CheckCircle2, AlertTriangle, Ban, Eye, Search, RotateCw, type LucideIcon } from 'lucide-react';
import VolEmailComposer, { type VolEmailDisparo } from './components/VolEmailComposer';

type DestLog = { nome: string | null; email: string; status: 'pendente' | 'enviado' | 'erro'; erro_msg: string | null; enviado_em: string | null; aberto_em: string | null; aberturas: number };

const STATUS_META: Record<string, { label: string; cls: string; icon: LucideIcon }> = {
  rascunho:  { label: 'Rascunho',   cls: 'bg-muted text-muted-foreground',                 icon: Pencil },
  agendado:  { label: 'Agendado',   cls: 'bg-blue-500/15 text-blue-600 dark:text-blue-400', icon: Clock },
  enviando:  { label: 'Enviando',   cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400', icon: Loader2 },
  enviado:   { label: 'Enviado',    cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400', icon: CheckCircle2 },
  erro:      { label: 'Erro',       cls: 'bg-red-500/15 text-red-600 dark:text-red-400',   icon: AlertTriangle },
  cancelado: { label: 'Cancelado',  cls: 'bg-muted text-muted-foreground',                 icon: Ban },
};

function segmentoLabel(seg: VolEmailDisparo['segmento'] | null | undefined): string {
  if (seg?.tipo === 'equipe') return 'Equipe';
  if (seg?.tipo === 'escala') return 'Escala (culto)';
  if (seg?.tipo === 'manual') return `Seleção manual (${seg.vol_profile_ids?.length || 0})`;
  return 'Todos os voluntários';
}

function fmtData(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function VolEmails() {
  const qc = useQueryClient();
  const [editando, setEditando] = useState<VolEmailDisparo | 'novo' | null>(null);
  const [confirmar, setConfirmar] = useState<{ acao: 'cancelar' | 'excluir'; disparo: VolEmailDisparo } | null>(null);
  const [detalhe, setDetalhe] = useState<VolEmailDisparo | null>(null);

  const { data: disparos = [], isLoading } = useQuery<VolEmailDisparo[]>({
    queryKey: ['vol', 'emails'],
    queryFn: () => voluntariado.emails.list(),
    refetchInterval: (query) => {
      const rows = (query.state.data || []) as VolEmailDisparo[];
      return rows.some((d) => d.status === 'enviando' || d.status === 'agendado') ? 5000 : false;
    },
  });

  const cancelarMut = useMutation({
    mutationFn: (id: string) => voluntariado.emails.cancelar(id),
    onSuccess: () => {
      toast.success('Disparo cancelado');
      qc.invalidateQueries({ queryKey: ['vol', 'emails'] });
    },
    onError: (e: Error) => toast.error(e.message || 'Erro ao cancelar'),
  });

  const excluirMut = useMutation({
    mutationFn: (id: string) => voluntariado.emails.remove(id),
    onSuccess: () => {
      toast.success('Disparo excluído');
      qc.invalidateQueries({ queryKey: ['vol', 'emails'] });
    },
    onError: (e: Error) => toast.error(e.message || 'Erro ao excluir'),
  });

  if (editando) {
    return (
      <VolEmailComposer
        disparo={editando === 'novo' ? null : editando}
        onVoltar={() => {
          setEditando(null);
          qc.invalidateQueries({ queryKey: ['vol', 'emails'] });
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" /> E-mails pros voluntários
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Componha, personalize e dispare avisos por e-mail — para todos, por equipe ou por escala.
          </p>
        </div>
        <Button onClick={() => setEditando('novo')}>
          <Plus className="h-4 w-4 mr-1.5" /> Novo disparo
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Histórico</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-10 flex justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : disparos.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum disparo ainda. Clique em "Novo disparo" pra criar o primeiro.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-border">
                    <th className="py-2 pr-3 font-medium">Assunto</th>
                    <th className="py-2 pr-3 font-medium">Segmento</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 pr-3 font-medium">Progresso</th>
                    <th className="py-2 pr-3 font-medium">Quando</th>
                    <th className="py-2 pr-3 font-medium">Por</th>
                    <th className="py-2 font-medium text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {disparos.map((d) => {
                    const meta = STATUS_META[d.status] || STATUS_META.rascunho;
                    const Icon = meta.icon;
                    const editavel = d.status === 'rascunho' || d.status === 'agendado';
                    const cancelavel = d.status === 'agendado' || d.status === 'enviando';
                    const excluivel = ['rascunho', 'cancelado', 'enviado', 'erro'].includes(d.status);
                    return (
                      <tr
                        key={d.id}
                        className="border-b border-border/60 last:border-0 cursor-pointer hover:bg-accent/40"
                        onClick={() => setDetalhe(d)}
                      >
                        <td className="py-2.5 pr-3 max-w-[280px]">
                          <span className="font-medium truncate block">{d.assunto || '(sem assunto)'}</span>
                        </td>
                        <td className="py-2.5 pr-3 whitespace-nowrap">{segmentoLabel(d.segmento)}</td>
                        <td className="py-2.5 pr-3">
                          <Badge variant="outline" className={`gap-1 border-0 ${meta.cls}`}>
                            <Icon className={`h-3 w-3 ${d.status === 'enviando' ? 'animate-spin' : ''}`} />
                            {meta.label}
                          </Badge>
                        </td>
                        <td className="py-2.5 pr-3 whitespace-nowrap">
                          {d.total_destinatarios > 0 ? (
                            <span>
                              {d.total_enviados}/{d.total_destinatarios}
                              {d.total_erros > 0 && (
                                <span className="text-red-500 ml-1.5">({d.total_erros} erros)</span>
                              )}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="py-2.5 pr-3 whitespace-nowrap text-muted-foreground">
                          {d.status === 'agendado' ? `Agendado · ${fmtData(d.agendado_para)}` : fmtData(d.enviado_em || d.created_at)}
                        </td>
                        <td className="py-2.5 pr-3 whitespace-nowrap text-muted-foreground max-w-[140px] truncate">
                          {d.criado_por_nome || '—'}
                        </td>
                        <td className="py-2.5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="sm" onClick={() => setDetalhe(d)} title="Ver detalhes">
                            <Eye className="h-4 w-4" />
                          </Button>
                          {editavel && (
                            <Button variant="ghost" size="sm" onClick={() => setEditando(d)} title="Editar">
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {cancelavel && (
                            <Button
                              variant="ghost" size="sm"
                              onClick={() => setConfirmar({ acao: 'cancelar', disparo: d })}
                              title="Cancelar disparo"
                            >
                              <XCircle className="h-4 w-4 text-amber-500" />
                            </Button>
                          )}
                          {excluivel && (
                            <Button
                              variant="ghost" size="sm"
                              onClick={() => setConfirmar({ acao: 'excluir', disparo: d })}
                              title="Excluir"
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {detalhe && <DisparoDetalheDialog disparo={detalhe} onClose={() => setDetalhe(null)} />}

      <AlertDialog open={!!confirmar} onOpenChange={(open) => !open && setConfirmar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmar?.acao === 'cancelar' ? 'Cancelar este disparo?' : 'Excluir este disparo?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmar?.acao === 'cancelar'
                ? `"${confirmar.disparo.assunto || '(sem assunto)'}" — os e-mails ainda não enviados não serão disparados.`
                : `"${confirmar?.disparo.assunto || '(sem assunto)'}" será removido do histórico.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!confirmar) return;
                if (confirmar.acao === 'cancelar') cancelarMut.mutate(confirmar.disparo.id);
                else excluirMut.mutate(confirmar.disparo.id);
                setConfirmar(null);
              }}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Detalhe do disparo · log por destinatário ────────────────────────────────
// "Enviado" = o servidor de e-mail aceitou a mensagem (não é confirmação de
// leitura); "Erro" traz o motivo da falha.
function DisparoDetalheDialog({ disparo, onClose }: { disparo: VolEmailDisparo; onClose: () => void }) {
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<'todos' | 'enviado' | 'erro' | 'abriu'>('todos');
  const qc = useQueryClient();

  const { data: log = [], isLoading } = useQuery<DestLog[]>({
    queryKey: ['vol', 'emails', 'destinatarios', disparo.id],
    queryFn: () => voluntariado.emails.destinatarios(disparo.id),
    refetchInterval: disparo.status === 'enviando' ? 5000 : false,
  });

  const reenviarMut = useMutation({
    mutationFn: () => voluntariado.emails.reenviarErros(disparo.id),
    onSuccess: (r: { reprocessados?: number }) => {
      toast.success(`Reenviando ${r?.reprocessados ?? ''} destinatário(s) que falharam.`);
      qc.invalidateQueries({ queryKey: ['vol', 'emails'] });
    },
    onError: (e: Error) => toast.error(e.message || 'Erro ao reenviar'),
  });

  const meta = STATUS_META[disparo.status] || STATUS_META.rascunho;
  const MetaIcon = meta.icon;

  const abriram = log.filter((d) => !!d.aberto_em).length;
  const filtrado = log.filter((d) => {
    if (filtro === 'abriu') { if (!d.aberto_em) return false; }
    else if (filtro !== 'todos' && d.status !== filtro) return false;
    const q = busca.trim().toLowerCase();
    return !q || (d.nome || '').toLowerCase().includes(q) || d.email.toLowerCase().includes(q);
  });

  const DEST_STATUS: Record<string, { label: string; cls: string }> = {
    enviado:  { label: 'Enviado',  cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
    erro:     { label: 'Erro',     cls: 'bg-red-500/15 text-red-600 dark:text-red-400' },
    pendente: { label: 'Pendente', cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-8">
            <Mail className="h-5 w-5 text-primary shrink-0" />
            <span className="truncate">{disparo.assunto || '(sem assunto)'}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <Badge variant="outline" className={`gap-1 border-0 ${meta.cls}`}>
            <MetaIcon className={`h-3 w-3 ${disparo.status === 'enviando' ? 'animate-spin' : ''}`} />
            {meta.label}
          </Badge>
          <span>{segmentoLabel(disparo.segmento)}</span>
          <span>
            <strong className="text-foreground">{disparo.total_enviados}</strong>/{disparo.total_destinatarios} enviados
            {disparo.total_erros > 0 && <span className="text-red-500 ml-1">· {disparo.total_erros} erros</span>}
          </span>
          <span title="Abertura aproximada (pixel) — clientes que bloqueiam imagem não contam">
            <strong className="text-foreground">{abriram}</strong> abriram
            {disparo.total_enviados > 0 && <span className="text-muted-foreground"> ({Math.round((abriram / disparo.total_enviados) * 100)}%)</span>}
          </span>
          <span>{fmtData(disparo.enviado_em || disparo.agendado_para || disparo.created_at)}</span>
          {disparo.criado_por_nome && <span>por {disparo.criado_por_nome}</span>}
          {disparo.total_erros > 0 && disparo.status !== 'enviando' && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5"
              onClick={() => reenviarMut.mutate()}
              disabled={reenviarMut.isPending}
            >
              {reenviarMut.isPending
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <RotateCw className="h-3.5 w-3.5" />}
              Reenviar os que falharam
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou e-mail…" className="pl-9" />
          </div>
          <Tabs value={filtro} onValueChange={(v) => setFiltro(v as typeof filtro)}>
            <TabsList>
              <TabsTrigger value="todos">Todos ({log.length})</TabsTrigger>
              <TabsTrigger value="enviado">Enviados ({log.filter((d) => d.status === 'enviado').length})</TabsTrigger>
              <TabsTrigger value="abriu">Abriram ({abriram})</TabsTrigger>
              <TabsTrigger value="erro">Erros ({log.filter((d) => d.status === 'erro').length})</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto rounded-lg border border-border">
          {isLoading ? (
            <div className="py-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : filtrado.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nenhum destinatário nesse filtro.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="py-2 px-3 font-medium">Nome</th>
                  <th className="py-2 px-3 font-medium">E-mail</th>
                  <th className="py-2 px-3 font-medium">Status</th>
                  <th className="py-2 px-3 font-medium">Abriu</th>
                  <th className="py-2 px-3 font-medium">Quando</th>
                </tr>
              </thead>
              <tbody>
                {filtrado.map((d) => {
                  const ds = DEST_STATUS[d.status] || DEST_STATUS.pendente;
                  return (
                    <tr key={d.email} className="border-b border-border/60 last:border-0 align-top">
                      <td className="py-2 px-3 max-w-[180px] truncate">{d.nome || '—'}</td>
                      <td className="py-2 px-3 max-w-[220px] truncate text-muted-foreground">{d.email}</td>
                      <td className="py-2 px-3">
                        <Badge variant="outline" className={`border-0 ${ds.cls}`}>{ds.label}</Badge>
                        {d.status === 'erro' && d.erro_msg && (
                          <span className="block text-xs text-red-500/90 mt-0.5 max-w-[220px]">{d.erro_msg}</span>
                        )}
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap">
                        {d.aberto_em
                          ? <span className="text-emerald-600 dark:text-emerald-400" title={`${d.aberturas || 1}× · ${fmtData(d.aberto_em)}`}>✓ abriu</span>
                          : <span className="text-muted-foreground/50">—</span>}
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap text-muted-foreground">{fmtData(d.enviado_em)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          "Enviado" significa que o servidor aceitou a mensagem pra entrega — não é confirmação de leitura.
        </p>
      </DialogContent>
    </Dialog>
  );
}
