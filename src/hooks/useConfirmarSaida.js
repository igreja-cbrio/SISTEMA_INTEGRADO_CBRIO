// ============================================================================
// useConfirmarSaida — confirmação antes de fechar modal com alterações não salvas
// ============================================================================
// Pedido dos usuários do piloto (2026-06-10): clicar fora do modal durante o
// preenchimento fechava na hora e perdia tudo sem aviso.
//
// Uso (modal customizado com backdrop div):
//   const { tentarFechar, backdropProps } = useConfirmarSaida(temAlteracoes, onClose);
//   <div {...backdropProps} style={{ position: 'fixed', inset: 0, ... }}>
//     ... botões X / Cancelar chamam tentarFechar ...
//
// Uso (Dialog shadcn):
//   const { tentarFechar } = useConfirmarSaida(temAlteracoes, onClose);
//   <Dialog open onOpenChange={(v) => { if (!v) tentarFechar(); }}>
//
// `temAlteracoes` é responsabilidade do modal (snapshot do estado inicial vs
// atual). Regra de ouro: abrir e fechar SEM digitar nada não pode perguntar.
// ============================================================================

import { useRef, useCallback } from 'react';

export const MSG_CONFIRMAR_SAIDA =
  'Tem certeza que deseja sair? As alterações não salvas serão perdidas.';

export default function useConfirmarSaida(temAlteracoes, onClose) {
  // Só fecha pelo backdrop se o clique COMEÇOU nele — selecionar texto num
  // campo e soltar o mouse fora do modal não pode fechar (o evento click
  // dispara no ancestral comum do mousedown/mouseup).
  const mousedownNoBackdropRef = useRef(false);

  const tentarFechar = useCallback(() => {
    if (temAlteracoes && !window.confirm(MSG_CONFIRMAR_SAIDA)) return;
    onClose?.();
  }, [temAlteracoes, onClose]);

  const backdropProps = {
    onMouseDown: (e) => { mousedownNoBackdropRef.current = e.target === e.currentTarget; },
    onClick: (e) => { if (e.target === e.currentTarget && mousedownNoBackdropRef.current) tentarFechar(); },
  };

  return { tentarFechar, backdropProps };
}
