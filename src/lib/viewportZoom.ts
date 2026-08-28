import { useEffect } from 'react';

// Devolve o pinch-zoom para a página que chamar este hook.
//
// ⚠️ POR QUE ISTO EXISTE: o `index.html` do sistema trava o zoom
// (`maximum-scale=1.0, user-scalable=no`), e a trava foi POSITIVA e deliberada
// (27/07/2026): com pinch manual, elementos `position: fixed` do ERP — o botão
// Reportar, o cabeçalho — somiam em várias telas. Mas o index.html é UM só para
// o SPA inteiro, então a trava desceu junto para as páginas PÚBLICAS.
//
// Em formulário público isso é outra história:
//  · quem responde está em pé, no culto, no celular — se o texto sair grande
//    para ela, não existe recurso nenhum: não dá para aproximar nem afastar;
//  · e é requisito de acessibilidade (WCAG 1.4.4) poder ampliar até 200%.
//    Bloquear zoom é justamente o anti-padrão que a diretriz nomeia.
//
// A página pública não tem os elementos fixos que motivaram a trava (o único é
// o botão de tema), então devolver o zoom aqui não traz de volta aquele bug.
//
// ⚠️ RESTAURA no desmonte. Sem isso, navegar do formulário público para uma tela
// do ERP na mesma aba deixaria o ERP sem a trava — reintroduzindo, pela porta do
// lado, exatamente o problema que ela resolve.
export function usePermitirZoom() {
  useEffect(() => {
    const meta = document.querySelector('meta[name="viewport"]');
    if (!meta) return undefined;
    const antes = meta.getAttribute('content');
    meta.setAttribute('content', 'width=device-width, initial-scale=1');
    return () => {
      if (antes !== null) meta.setAttribute('content', antes);
    };
  }, []);
}
