// useOverlayAberto · detecta se algum Dialog/Sheet Radix está aberto no
// documento (role="dialog" + data-state="open" — mesmo primitivo usado por
// Dialog e Sheet do shadcn) e, especificamente, se é um Sheet lateral
// esquerdo (data-side="left" — o drawer de navegação mobile). Usado pelos
// botões flutuantes (Reportar/IA) pra minimizar/realocar em vez de cobrir
// conteúdo (achado na revisão de responsividade mobile 2026-07-27).
import { useEffect, useState } from 'react';

export function useOverlayAberto() {
  const [estado, setEstado] = useState({ aberto: false, drawerEsquerdo: false });

  useEffect(() => {
    function checar() {
      const dialog = document.querySelector('[data-state="open"][role="dialog"]');
      const drawerEsquerdo = !!document.querySelector('[data-state="open"][role="dialog"][data-side="left"]');
      setEstado(prev => {
        const aberto = !!dialog;
        if (prev.aberto === aberto && prev.drawerEsquerdo === drawerEsquerdo) return prev;
        return { aberto, drawerEsquerdo };
      });
    }
    checar();
    const observer = new MutationObserver(checar);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['data-state', 'data-side', 'role'],
      childList: true,
      subtree: true,
    });
    return () => observer.disconnect();
  }, []);

  return estado;
}
