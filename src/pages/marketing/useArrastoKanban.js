import { useCallback, useEffect, useRef, useState } from 'react';
import {
  iniciarArrasto, moverArrasto, decidirSoltura, velocidadeAutoScroll,
} from '../../lib/arrastoKanban';

// ============================================================================
// Liga a régua de arrasto (src/lib/arrastoKanban.ts · pura e testada) ao DOM.
// ============================================================================
// ⚠️ Substitui o HTML5 drag-and-drop, que NÃO dispara em toque — motivo pelo
// qual o Pedro não conseguia mover nada no tablet, e por que a Triagem (que
// nunca teve `onDrop`) parecia travada. Pointer events chegam igual de mouse,
// caneta e dedo.
//
// Como a coluna alvo é descoberta: cada coluna marca `data-coluna="<key>"` no
// container, e aqui usamos `document.elementFromPoint(x, y)` + `closest()`.
// ⚠️ É preciso ESCONDER o fantasma antes de perguntar quem está embaixo, senão
// `elementFromPoint` devolve o próprio fantasma e nenhuma coluna é encontrada.
export function useArrastoKanban({ onMover, aceitaColuna, habilitado = true }) {
  const [arrasto, setArrasto] = useState(null);
  const arrastoRef = useRef(null);
  const fantasmaRef = useRef(null);
  const containerRef = useRef(null);
  const rafRef = useRef(0);
  const [colunaSobre, setColunaSobre] = useState(null);

  arrastoRef.current = arrasto;

  const limpar = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0; }
    // ⚠️ NÃO remover o fantasma do DOM aqui: quem o monta e desmonta é o REACT
    // (ele é JSX condicionado a `arrastando`). Chamar `removeChild` num nó que o
    // React possui estoura "The node to be removed is not a child of this node"
    // na hora em que o React tenta desmontá-lo — e derrubava o arrasto inteiro.
    // Este hook só GUARDA a ref (pra esconder no elementFromPoint e posicionar).
    // O teste de gesto pegou isto antes de ir pro Pedro.
    fantasmaRef.current = null;
    setArrasto(null);
    arrastoRef.current = null;
    setColunaSobre(null);
    document.body.style.removeProperty('user-select');
  }, []);

  // Auto-scroll horizontal enquanto o ponteiro fica perto das bordas.
  // ⚠️ Sem isto, mover do Backlog até Concluído exigia que a coluna de destino
  // já estivesse visível — com 6 colunas e `snap`, quase nunca está.
  useEffect(() => {
    if (!arrasto?.ativo) return undefined;
    let vivo = true;
    const passo = () => {
      if (!vivo) return;
      const cont = containerRef.current;
      const e = arrastoRef.current;
      if (cont && e) {
        const r = cont.getBoundingClientRect();
        const v = velocidadeAutoScroll(e.x, { left: r.left, right: r.right });
        if (v !== 0) cont.scrollLeft += v;
      }
      rafRef.current = requestAnimationFrame(passo);
    };
    rafRef.current = requestAnimationFrame(passo);
    return () => { vivo = false; if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [arrasto?.ativo]);

  const colunaSob = useCallback((x, y) => {
    const f = fantasmaRef.current;
    const visivel = f?.style.display;
    if (f) f.style.display = 'none';           // ⚠️ ver comentário do topo
    const el = document.elementFromPoint(x, y);
    if (f) f.style.display = visivel || '';
    const col = el?.closest?.('[data-coluna]');
    return col?.getAttribute('data-coluna') || null;
  }, []);

  const aoPressionar = useCallback((ev, card) => {
    if (!habilitado) return;
    // Só botão principal do mouse; toque e caneta passam.
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    // Não sequestra o gesto de quem tocou num controle dentro do card.
    if (ev.target?.closest?.('button, a, [role="menuitem"], input, textarea, select')) return;
    setArrasto(iniciarArrasto({
      pointerId: ev.pointerId,
      cardId: card.id,
      estadoOrigem: card.estado,
      x: ev.clientX,
      y: ev.clientY,
    }));
  }, [habilitado]);

  // pointermove/up ficam na JANELA: o ponteiro sai do card assim que começa a
  // andar, e handlers presos ao card perderiam o resto do gesto.
  useEffect(() => {
    if (!arrasto) return undefined;

    const mover = (ev) => {
      if (ev.pointerId !== arrastoRef.current?.pointerId) return;
      const prox = moverArrasto(arrastoRef.current, ev.clientX, ev.clientY);
      arrastoRef.current = prox;
      setArrasto(prox);
      if (!prox?.ativo) return;
      // ⚠️ Impede a página de rolar/selecionar durante o arrasto no toque.
      if (ev.cancelable) ev.preventDefault();
      document.body.style.setProperty('user-select', 'none');
      if (fantasmaRef.current) {
        fantasmaRef.current.style.transform = `translate(${ev.clientX + 8}px, ${ev.clientY + 8}px)`;
      }
      setColunaSobre(colunaSob(ev.clientX, ev.clientY));
    };

    const soltar = (ev) => {
      const atual = arrastoRef.current;
      if (!atual || ev.pointerId !== atual.pointerId) return;
      const alvo = atual.ativo ? colunaSob(ev.clientX, ev.clientY) : null;
      const decisao = decidirSoltura(atual, alvo, aceitaColuna);
      limpar();
      if (decisao.acao === 'mover') onMover?.(decisao.cardId, decisao.para);
      else if (decisao.acao === 'clique') onMover?.(decisao.cardId, null); // null = "foi clique"
    };

    const cancelar = () => limpar();

    window.addEventListener('pointermove', mover, { passive: false });
    window.addEventListener('pointerup', soltar);
    window.addEventListener('pointercancel', cancelar);
    return () => {
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', soltar);
      window.removeEventListener('pointercancel', cancelar);
    };
  }, [arrasto, colunaSob, aceitaColuna, onMover, limpar]);

  return {
    arrasto,
    arrastando: !!arrasto?.ativo,
    cardArrastado: arrasto?.ativo ? arrasto.cardId : null,
    colunaSobre,
    containerRef,
    fantasmaRef,
    aoPressionar,
  };
}
