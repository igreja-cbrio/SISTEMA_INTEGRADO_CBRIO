import { useEffect, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { cuidados as cuidadosApi } from '../api';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { HandHeart, Loader2, Sparkles, Phone, MessageSquare, ExternalLink, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

type Pedido = {
  id: string; membro_id: string | null; nome: string | null; telefone: string | null;
  mensagem: string | null; categoria: string | null; categoria_label: string | null;
  resumo: string | null; tratamento_status: string; created_at: string;
};
type Insights = { total: number; analisados: number; nao_analisados: number; temas: { slug: string; label: string; count: number; pct: number }[] };

const TRAT_LABEL: Record<string, string> = { pendente: 'Pendente', em_andamento: 'Em andamento', concluido: 'Concluído' };
const fmt = (d: string) => new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

export default function OracaoPanel({ canWrite }: { canWrite: boolean }) {
  const [list, setList] = useState<Pedido[]>([]);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(true);
  const [analisando, setAnalisando] = useState(false);
  const [sel, setSel] = useState<Pedido | null>(null);
  const first = useRef(true);

  const load = useCallback(async () => {
    try {
      const [l, i] = await Promise.all([
        cuidadosApi.oracoes.list().catch(() => []),
        cuidadosApi.oracoes.insights().catch(() => null),
      ]);
      setList(l || []);
      setInsights(i);
    } finally {
      setLoading(false);
    }
  }, []);

  // Carga inicial + atualização em tempo (quase) real: poll 15s + ao focar a aba.
  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    const onFocus = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onFocus);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onFocus); };
  }, [load]);

  // mantém o modal aberto sincronizado quando a lista atualiza
  useEffect(() => {
    if (!sel) return;
    const atual = list.find(p => p.id === sel.id);
    if (atual && atual.tratamento_status !== sel.tratamento_status) setSel(atual);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list]);

  async function analisar() {
    setAnalisando(true);
    try {
      const r = await cuidadosApi.oracoes.analisar();
      toast.success(`${r.analisados || 0} pedido(s) analisado(s) pela IA`);
      await load();
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao analisar');
    } finally {
      setAnalisando(false);
    }
  }

  async function mudarStatus(p: Pedido, status: string) {
    try {
      await cuidadosApi.pedidosApp.updateStatus(p.id, status);
      setList(prev => prev.map(x => (x.id === p.id ? { ...x, tratamento_status: status } : x)));
      setSel(s => (s && s.id === p.id ? { ...s, tratamento_status: status } : s));
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao atualizar');
    }
  }

  const tel = (t?: string | null) => String(t || '').replace(/\D/g, '');

  return (
    <div className="space-y-4">
      {/* Insights por IA */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-sm">Insights dos pedidos de oração</h3>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={load} title="Atualizar"><RefreshCw className="h-3.5 w-3.5" /></Button>
            {insights && insights.nao_analisados > 0 && (
              <Button variant="outline" size="sm" onClick={analisar} disabled={analisando}>
                {analisando ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
                Analisar {insights.nao_analisados} pendente(s)
              </Button>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          {insights ? `${insights.total} pedido(s) · ${insights.analisados} analisado(s) pela IA` : '—'}
        </p>
        {insights && insights.temas.length > 0 ? (
          <div className="space-y-1.5">
            {insights.temas.map(t => (
              <div key={t.slug} className="flex items-center gap-2">
                <span className="text-xs w-44 shrink-0 truncate">{t.label}</span>
                <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-primary rounded-full cbrio-bar" style={{ width: `${t.pct}%` }} />
                </div>
                <span className="text-xs text-muted-foreground w-16 text-right">{t.count} · {t.pct}%</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{loading ? 'Carregando…' : 'Sem temas analisados ainda.'}</p>
        )}
      </div>

      {/* Lista de pedidos */}
      <div className="space-y-2">
        {loading && list.length === 0 ? (
          <Loader2 className="h-5 w-5 animate-spin mx-auto my-8 text-muted-foreground" />
        ) : list.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">Nenhum pedido de oração ainda.</p>
        ) : (
          list.map(p => (
            <button
              key={p.id}
              onClick={() => setSel(p)}
              className="w-full text-left rounded-lg border border-border bg-card p-3 hover:bg-muted/40 transition-colors flex items-start gap-3"
            >
              <HandHeart className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{p.nome || '—'}</span>
                  {p.categoria_label && <Badge variant="secondary" className="text-[10px]">{p.categoria_label}</Badge>}
                  <span className="text-[11px] text-muted-foreground">{fmt(p.created_at)}</span>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-1 mt-0.5">{p.mensagem || p.resumo || '—'}</p>
              </div>
              <Badge variant={p.tratamento_status === 'concluido' ? 'secondary' : 'default'} className="shrink-0">
                {TRAT_LABEL[p.tratamento_status] || p.tratamento_status}
              </Badge>
            </button>
          ))
        )}
      </div>

      {/* Detalhe do pedido */}
      <Dialog open={!!sel} onOpenChange={o => !o && setSel(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><HandHeart className="h-4 w-4 text-primary" /> Pedido de oração</DialogTitle>
          </DialogHeader>
          {sel && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                {sel.membro_id ? (
                  <Link to={`/ministerial/membresia?membro=${sel.membro_id}`} className="text-primary hover:underline font-medium flex items-center gap-1">
                    {sel.nome || 'Membro'} <ExternalLink className="h-3 w-3" />
                  </Link>
                ) : <span className="font-medium">{sel.nome || '—'}</span>}
                {sel.categoria_label && <Badge variant="secondary">{sel.categoria_label}</Badge>}
              </div>

              {sel.telefone && (
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <a href={`tel:${tel(sel.telefone)}`} className="flex items-center gap-1 hover:text-primary"><Phone className="h-3 w-3" />{sel.telefone}</a>
                  <a href={`https://wa.me/55${tel(sel.telefone)}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-primary"><MessageSquare className="h-3 w-3" />WhatsApp</a>
                </div>
              )}

              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Pedido completo</p>
                <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm whitespace-pre-wrap max-h-72 overflow-y-auto">
                  {sel.mensagem || sel.resumo || '(sem texto)'}
                </div>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">{fmt(sel.created_at)}</span>
                {canWrite ? (
                  <Select value={sel.tratamento_status} onValueChange={v => mudarStatus(sel, v)}>
                    <SelectTrigger className="h-8 w-[150px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pendente">Pendente</SelectItem>
                      <SelectItem value="em_andamento">Em andamento</SelectItem>
                      <SelectItem value="concluido">Concluído</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge>{TRAT_LABEL[sel.tratamento_status] || sel.tratamento_status}</Badge>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
