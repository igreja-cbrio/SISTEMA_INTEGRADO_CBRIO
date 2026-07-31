import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PaginacaoProps {
  /** Página atual (1-based) */
  page: number;
  /** Itens por página */
  pageSize: number;
  /** Total de itens (todas as páginas) */
  total: number;
  onPageChange: (page: number) => void;
  /** Rótulo do item no resumo (ex.: "membros", "grupos"). Default "itens". */
  itemLabel?: string;
  className?: string;
  /** Quando fornecido, mostra o seletor "Itens por página" (pedido do
   *  usuário 2026-07-31). Omitir pra manter o comportamento antigo, sem seletor. */
  onPageSizeChange?: (pageSize: number) => void;
  /** Opções do seletor de itens por página. Default [25, 50, 100]. */
  pageSizeOptions?: number[];
}

// Páginas a exibir: 1 … (atual-1, atual, atual+1) … última
function janelaDePaginas(atual: number, totalPaginas: number): (number | 'gap')[] {
  if (totalPaginas <= 7) {
    return Array.from({ length: totalPaginas }, (_, i) => i + 1);
  }
  const paginas: (number | 'gap')[] = [1];
  const esq = Math.max(2, atual - 1);
  const dir = Math.min(totalPaginas - 1, atual + 1);
  if (esq > 2) paginas.push('gap');
  for (let i = esq; i <= dir; i++) paginas.push(i);
  if (dir < totalPaginas - 1) paginas.push('gap');
  paginas.push(totalPaginas);
  return paginas;
}

/**
 * Paginação de página padrão do sistema. Estilo único — usar SEMPRE este
 * componente nas listas grandes (não criar paginação ad-hoc). Controlado:
 * recebe page/pageSize/total e dispara onPageChange. Some quando há 1 página só.
 */
export default function Paginacao({
  page, pageSize, total, onPageChange, itemLabel = 'itens', className,
  onPageSizeChange, pageSizeOptions = [25, 50, 100],
}: PaginacaoProps) {
  const totalPaginas = Math.max(1, Math.ceil(total / pageSize));
  if (totalPaginas <= 1 && !onPageSizeChange) return null;

  const inicio = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const fim = Math.min(page * pageSize, total);
  const ir = (p: number) => onPageChange(Math.min(totalPaginas, Math.max(1, p)));
  const paginas = janelaDePaginas(page, totalPaginas);

  return (
    <div className={cn('flex flex-col sm:flex-row items-center justify-between gap-3 pt-4', className)}>
      <div className="flex items-center gap-3 order-2 sm:order-1">
        <p className="text-xs text-muted-foreground">
          Mostrando <span className="font-medium text-foreground">{inicio}</span>
          –<span className="font-medium text-foreground">{fim}</span> de{' '}
          <span className="font-medium text-foreground">{total}</span> {itemLabel}
        </p>
        {onPageSizeChange && (
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Por página:
            <select
              className="h-7 rounded-md border border-input bg-background px-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
            >
              {pageSizeOptions.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        )}
      </div>
      {totalPaginas > 1 && (
      <div className="flex items-center gap-1 order-1 sm:order-2">
        <Button
          variant="outline" size="icon" className="h-8 w-8"
          onClick={() => ir(page - 1)} disabled={page <= 1} aria-label="Página anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        {paginas.map((p, i) => p === 'gap' ? (
          <span key={`gap-${i}`} className="px-1.5 text-sm text-muted-foreground select-none">…</span>
        ) : (
          <Button
            key={p}
            variant={p === page ? 'default' : 'outline'}
            size="icon"
            className={cn('h-8 min-w-8 px-2', p === page && 'bg-[#00B39D] hover:bg-[#00B39D]/90 text-white border-[#00B39D]')}
            onClick={() => ir(p)}
            aria-current={p === page ? 'page' : undefined}
          >
            {p}
          </Button>
        ))}
        <Button
          variant="outline" size="icon" className="h-8 w-8"
          onClick={() => ir(page + 1)} disabled={page >= totalPaginas} aria-label="Próxima página"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      )}
    </div>
  );
}

/**
 * Paginação CLIENT-SIDE: fatia um array já carregado em memória. Para a maioria
 * das listas (que carregam tudo de uma vez). Reseta pra página 1 quando o total
 * de itens muda (ex.: ao aplicar um filtro/busca) e clampa página fora de faixa.
 *
 * Uso:
 *   const { pageItems, paginacaoProps } = usePaginacaoLocal(listaFiltrada, 25);
 *   ...pageItems.map(...)
 *   <Paginacao {...paginacaoProps} itemLabel="membros" />
 *
 * Pra oferecer o seletor "itens por página" (25/50/100), passe também
 * `onPageSizeChange={setPageSize}` no <Paginacao> (opt-in explícito — quem
 * não passar mantém o comportamento antigo, sem seletor):
 *   const { pageItems, paginacaoProps, setPageSize } = usePaginacaoLocal(lista, 25);
 *   <Paginacao {...paginacaoProps} itemLabel="bens" onPageSizeChange={setPageSize} />
 */
export function usePaginacaoLocal<T>(items: T[], pageSizeInicial = 25) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(pageSizeInicial);
  const total = items.length;
  const totalPaginas = Math.max(1, Math.ceil(total / pageSize));

  // Reseta pra 1 quando o tamanho da lista muda (filtro/busca) ou a página
  // sai de faixa.
  useEffect(() => { setPage(1); }, [total]);
  useEffect(() => { if (page > totalPaginas) setPage(totalPaginas); }, [page, totalPaginas]);

  const safePage = Math.min(page, totalPaginas);
  const pageItems = useMemo(
    () => items.slice((safePage - 1) * pageSize, safePage * pageSize),
    [items, safePage, pageSize],
  );

  // Trocar o tamanho da página sempre volta pra página 1 — senão a página 4
  // de 25 vira um índice sem sentido quando o tamanho muda pra 100.
  const setPageSize = (novoPageSize: number) => { setPageSizeState(novoPageSize); setPage(1); };

  return {
    page: safePage,
    setPage,
    pageItems,
    total,
    pageSize,
    setPageSize,
    paginacaoProps: { page: safePage, pageSize, total, onPageChange: setPage } as PaginacaoProps,
  };
}
