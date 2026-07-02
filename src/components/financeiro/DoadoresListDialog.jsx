import { useEffect, useMemo, useState } from 'react';
import {
  Loader2, Search, UserCircle2, AlertCircle, ArrowUpDown, X, ChevronRight,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { financeiroV2 } from '../../api';
import MembroFichaDialog from '../membresia/MembroFichaDialog';

const fmtMoney = (v) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Lista paginada de doadores do ano. Cada linha tem ação "Ver ficha" que abre
 * o MembroFichaDialog com a ficha 360 da pessoa (quando matched com mem_membros)
 * ou modo "doador não-vinculado" (quando não tem match).
 */
export default function DoadoresListDialog({ open, onClose, ano }) {
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState(null);
  const [busca, setBusca] = useState('');
  const [pessoaSel, setPessoaSel] = useState(null); // { membroId, nome }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setErro(null);
    financeiroV2.doadores({ ano: ano || new Date().getFullYear(), limit: 500 })
      .then(r => { if (!cancelled) setDados(r); })
      .catch(e => { if (!cancelled) setErro(e?.message || 'Erro ao carregar doadores'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, ano]);

  const itens = useMemo(() => {
    const all = dados?.items || [];
    if (!busca.trim()) return all;
    const q = busca.trim().toLowerCase();
    return all.filter(d =>
      (d.nome || '').toLowerCase().includes(q) ||
      (d.membro_nome || '').toLowerCase().includes(q)
    );
  }, [dados, busca]);

  const totalGeral = dados?.total_geral || 0;
  const qtdTotal = dados?.qtd_total || 0;
  const matchedCount = (dados?.items || []).filter(d => d.membro_id).length;

  const abrirFicha = (item) => {
    setPessoaSel({
      membroId: item.membro_id || null,
      nome: item.nome,
    });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && onClose?.()}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="px-6 pt-5 pb-3 border-b">
            <DialogTitle className="text-base">
              Doadores · {ano || new Date().getFullYear()}
            </DialogTitle>
            <div className="text-xs text-muted-foreground mt-1 flex items-center flex-wrap gap-3">
              <span>{qtdTotal.toLocaleString('pt-BR')} pessoas · {fmtMoney(totalGeral)} no ano</span>
              {dados && qtdTotal > 0 && (
                <span className="text-[11px]">
                  {matchedCount} de {Math.min(qtdTotal, dados.items?.length || 0)} ({((matchedCount / Math.max(1, dados.items?.length || 0)) * 100).toFixed(0)}%) vinculados à membresia
                </span>
              )}
            </div>
          </DialogHeader>

          <div className="px-6 py-3 border-b bg-muted/30">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por nome…"
                className="pl-9 h-9 text-sm"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0">
            {loading && (
              <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
                <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando lista…
              </div>
            )}
            {erro && !loading && (
              <div className="m-6 p-3 rounded-lg bg-rose-50 dark:bg-rose-500/10 border border-rose-200 text-rose-700 text-sm flex gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <div>{erro}</div>
              </div>
            )}
            {!loading && !erro && itens.length === 0 && (
              <div className="py-16 text-center text-sm text-muted-foreground">
                {busca ? 'Nenhum doador encontrado pra essa busca' : 'Sem doadores no período'}
              </div>
            )}
            {!loading && !erro && itens.length > 0 && (
              <div className="divide-y">
                <div className="grid grid-cols-[40px_1fr_120px_60px_90px_60px] gap-3 px-6 py-2 bg-muted/20 text-[10px] uppercase tracking-wide font-medium text-muted-foreground sticky top-0 z-10">
                  <span>#</span>
                  <span>Doador</span>
                  <span className="text-right">Total no ano</span>
                  <span className="text-right">Lanç.</span>
                  <span className="text-right">% geral</span>
                  <span></span>
                </div>
                {itens.map(item => (
                  <DoadorRow key={`${item.posicao}-${item.nome}`} item={item} onAbrir={() => abrirFicha(item)} />
                ))}
              </div>
            )}
          </div>

          <div className="px-6 py-3 border-t bg-muted/20 flex items-center justify-between flex-wrap gap-2 text-[11px] text-muted-foreground">
            <span>
              {itens.length.toLocaleString('pt-BR')} {busca ? 'filtrados' : 'doadores'}
              {itens.length < qtdTotal && !busca && ` de ${qtdTotal.toLocaleString('pt-BR')} (limite 500)`}
            </span>
            <Button variant="ghost" size="sm" onClick={onClose} className="text-xs h-7">
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <MembroFichaDialog
        open={!!pessoaSel}
        onClose={() => setPessoaSel(null)}
        membroId={pessoaSel?.membroId}
        nomeFallback={pessoaSel?.membroId ? null : pessoaSel?.nome}
        ano={ano}
      />
    </>
  );
}

function DoadorRow({ item, onAbrir }) {
  const matched = !!item.membro_id;
  const matchVia = item.match_via;
  return (
    <button
      type="button"
      onClick={onAbrir}
      className="grid grid-cols-[40px_1fr_120px_60px_90px_60px] gap-3 items-center w-full px-6 py-2.5 text-left text-sm hover:bg-accent/40 transition-colors"
    >
      <span className="text-[11px] font-mono text-muted-foreground tabular-nums">
        {item.posicao}
      </span>
      <div className="min-w-0">
        <div className="font-medium truncate flex items-center gap-1.5">
          {matched ? (
            <UserCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
          ) : (
            <UserCircle2 className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
          )}
          {item.nome}
        </div>
        <div className="text-[11px] text-muted-foreground truncate flex items-center gap-1.5">
          {matched ? (
            <>
              <Badge variant="outline" className="text-[9px] h-3.5 px-1 border-emerald-200 text-emerald-700">
                {matchVia === 'fk' ? 'vinculado' : 'match por nome'}
              </Badge>
              {item.membro_nome && item.membro_nome !== item.nome && (
                <span className="truncate">→ {item.membro_nome}</span>
              )}
            </>
          ) : (
            <Badge variant="outline" className="text-[9px] h-3.5 px-1 border-amber-200 text-amber-700">
              não vinculado
            </Badge>
          )}
        </div>
      </div>
      <span className="text-right font-semibold tabular-nums text-sm">
        {fmtMoney(item.total)}
      </span>
      <span className="text-right text-[11px] text-muted-foreground tabular-nums">
        {item.qtd}
      </span>
      <span className="text-right text-[11px] text-muted-foreground tabular-nums">
        {Number(item.pct_geral || 0).toFixed(2)}%
      </span>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </button>
  );
}
