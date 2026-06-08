import { useState, useEffect, useCallback } from 'react';
import { integracao as intApi } from '../../../api';
import { Users, Heart, Calendar, Check, X, AlertCircle, RefreshCw, MessageSquare } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '../../../components/ui/avatar';
import { Button } from '../../../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../../components/ui/dialog';
import { Textarea } from '../../../components/ui/textarea';
import { toast } from 'sonner';

function fmtData(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const meses = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  const dias = ['Dom','Seg','Ter','Qua','Qui','Sex','Sab'];
  const dt = new Date(y, m - 1, d);
  return `${dias[dt.getDay()]} ${String(d).padStart(2,'0')}/${meses[m-1]}`;
}

function fmtRelativeTime(iso) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `${min} min atras`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h atras`;
  const d = Math.floor(h / 24);
  return `${d}d atras`;
}

export default function ColetaPendentes({ onChange }) {
  const [pendentes, setPendentes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rejeitando, setRejeitando] = useState(null); // { id, motivo }
  const [acaoLoading, setAcaoLoading] = useState(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const data = await intApi.coleta.pendentes();
      setPendentes(data || []);
    } catch (e) {
      toast.error(e.message || 'Erro ao carregar pendentes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function aprovar(sub) {
    setAcaoLoading(sub.id);
    try {
      await intApi.coleta.aprovar(sub.id);
      toast.success('Submissao aprovada · dados aplicados ao culto');
      setPendentes(prev => prev.filter(p => p.id !== sub.id));
      onChange?.();
    } catch (e) {
      toast.error(e.message || 'Erro ao aprovar');
    } finally {
      setAcaoLoading(null);
    }
  }

  async function confirmarRejeicao() {
    if (!rejeitando) return;
    if (!rejeitando.motivo || rejeitando.motivo.trim().length < 3) {
      toast.error('Motivo precisa ter pelo menos 3 caracteres');
      return;
    }
    setAcaoLoading(rejeitando.id);
    try {
      await intApi.coleta.rejeitar(rejeitando.id, rejeitando.motivo.trim());
      toast.success('Submissao rejeitada · responsavel pode reenviar');
      setPendentes(prev => prev.filter(p => p.id !== rejeitando.id));
      setRejeitando(null);
      onChange?.();
    } catch (e) {
      toast.error(e.message || 'Erro ao rejeitar');
    } finally {
      setAcaoLoading(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[1,2,3].map(i => <div key={i} className="h-32 rounded-xl bg-secondary/40 animate-pulse" />)}
      </div>
    );
  }

  if (pendentes.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="h-16 w-16 rounded-full bg-emerald-50 dark:bg-emerald-950/30 mx-auto mb-3 flex items-center justify-center">
          <Check className="h-8 w-8 text-emerald-600" />
        </div>
        <p className="text-sm font-medium text-foreground">Tudo aprovado!</p>
        <p className="text-xs text-muted-foreground mt-1">Sem submissoes pendentes de aprovação</p>
        <Button variant="outline" size="sm" onClick={carregar} className="mt-4 gap-2">
          <RefreshCw className="h-3.5 w-3.5" /> Atualizar
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {pendentes.length} submiss{pendentes.length === 1 ? 'ao pendente' : 'oes pendentes'}
        </p>
        <Button variant="ghost" size="sm" onClick={carregar} className="gap-1.5 h-7 px-2">
          <RefreshCw className="h-3.5 w-3.5" /> Atualizar
        </Button>
      </div>

      {pendentes.map(sub => {
        const isKids = sub.ambiente === 'kids';
        const cor = isKids ? '#EC4899' : '#00B39D';
        const Icone = isKids ? Heart : Users;
        const nomeSubmitter = sub.submitter?.name || sub.submitter?.email || 'Anonimo';
        const sNome = sub.culto?.service_type?.name || 'Culto';
        const sHora = sub.culto?.service_type?.recurrence_time ? String(sub.culto.service_type.recurrence_time).slice(0,5) : '';
        const initials = nomeSubmitter.split(' ').map(n => n[0]).slice(0,2).join('').toUpperCase();

        // Mostrar valor atual no culto (se já tem) pra coord comparar
        const atualPresencial = isKids ? sub.culto?.presencial_kids : sub.culto?.presencial_adulto;
        const atualDecisoes = isKids ? sub.culto?.decisoes_kids : sub.culto?.decisoes_presenciais;
        const temAtual = (atualPresencial != null && atualPresencial > 0) || (atualDecisoes != null && atualDecisoes > 0);

        return (
          <div key={sub.id} className="rounded-xl border border-border bg-card overflow-hidden">
            {/* Header · quem enviou e quando */}
            <div className="px-4 py-3 border-b border-border bg-secondary/30 flex items-center gap-3">
              <Avatar className="h-9 w-9">
                {sub.submitter?.avatar_url && <AvatarImage src={sub.submitter.avatar_url} />}
                <AvatarFallback className="text-xs">{initials}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{nomeSubmitter}</p>
                <p className="text-xs text-muted-foreground">{fmtRelativeTime(sub.submitted_at)}</p>
              </div>
              <span
                className="inline-flex items-center gap-1 text-xs font-semibold text-white px-2.5 py-1 rounded-full"
                style={{ background: cor }}
              >
                <Icone className="h-3 w-3" />
                {isKids ? 'Kids' : 'Templo'}
              </span>
            </div>

            {/* Culto */}
            <div className="px-4 py-2 border-b border-border flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" />
              <span className="font-medium text-foreground">{sNome}</span>
              <span>·</span>
              <span>{fmtData(sub.culto?.data)}</span>
              {sHora && <><span>·</span><span>{sHora}</span></>}
            </div>

            {/* Valores · destaque */}
            <div className="px-4 py-4 grid grid-cols-2 gap-3">
              <div className="text-center">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                  Presencial
                </p>
                <p className="text-3xl font-bold text-foreground tabular-nums">
                  {sub.presencial.toLocaleString('pt-BR')}
                </p>
                {temAtual && atualPresencial != null && atualPresencial !== sub.presencial && (
                  <p className="text-[10px] text-amber-600 mt-1">
                    Atual no culto: {atualPresencial}
                  </p>
                )}
              </div>
              <div className="text-center">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                  Decisoes
                </p>
                <p className="text-3xl font-bold tabular-nums" style={{ color: cor }}>
                  {sub.decisoes.toLocaleString('pt-BR')}
                </p>
                {temAtual && atualDecisoes != null && atualDecisoes !== sub.decisoes && (
                  <p className="text-[10px] text-amber-600 mt-1">
                    Atual no culto: {atualDecisoes}
                  </p>
                )}
              </div>
            </div>

            {/* Observação */}
            {sub.observacao && (
              <div className="px-4 pb-3 -mt-2">
                <div className="flex items-start gap-2 text-xs bg-secondary/40 rounded-lg p-2.5">
                  <MessageSquare className="h-3.5 w-3.5 mt-0.5 text-muted-foreground flex-shrink-0" />
                  <p className="text-foreground/80 italic">{sub.observacao}</p>
                </div>
              </div>
            )}

            {/* Ações */}
            <div className="px-4 py-3 border-t border-border flex gap-2">
              <Button
                variant="outline"
                className="flex-1 gap-2"
                onClick={() => setRejeitando({ id: sub.id, motivo: '' })}
                disabled={acaoLoading === sub.id}
              >
                <X className="h-4 w-4" /> Rejeitar
              </Button>
              <Button
                className="flex-1 gap-2"
                onClick={() => aprovar(sub)}
                disabled={acaoLoading === sub.id}
              >
                <Check className="h-4 w-4" />
                {acaoLoading === sub.id ? 'Aplicando...' : 'Aprovar'}
              </Button>
            </div>
          </div>
        );
      })}

      {/* Dialog Rejeitar */}
      <Dialog open={!!rejeitando} onOpenChange={(v) => !v && setRejeitando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-rose-500" /> Rejeitar submissao
            </DialogTitle>
            <DialogDescription>
              Informe o motivo · o responsavel sera notificado e podera reenviar.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Ex: não bate com a contagem do voluntário..."
            value={rejeitando?.motivo || ''}
            onChange={(e) => setRejeitando(r => ({ ...r, motivo: e.target.value }))}
            rows={3}
          />
          <div className="flex gap-2 mt-2">
            <Button variant="outline" className="flex-1" onClick={() => setRejeitando(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={confirmarRejeicao}
              disabled={acaoLoading === rejeitando?.id}
            >
              {acaoLoading === rejeitando?.id ? 'Rejeitando...' : 'Confirmar rejeicao'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
