import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';

/**
 * Lightbox global de foto de pessoa: qualquer `<img data-foto-avatar>` do
 * sistema (o `AvatarImage` do ui/avatar marca automaticamente; imgs cruas de
 * foto recebem o atributo nos call sites) abre ampliada ao ser clicada.
 *
 * Montado uma vez no AppShell. Usa um listener delegado em fase de captura —
 * clicar na foto abre o lightbox e NÃO dispara a ação da linha/card por trás.
 * Exceção: avatar dentro de botão/link/menu (ex.: o avatar do header, que abre
 * o menu do usuário) mantém o comportamento do elemento interativo — pra
 * forçar a exceção em outro lugar, marque um ancestral com `data-foto-skip`.
 */
export default function FotoLightboxGlobal() {
  const [foto, setFoto] = useState(null); // { url, nome } | null

  useEffect(() => {
    function aoClicar(e) {
      const img = e.target?.closest?.('img[data-foto-avatar]');
      if (!img) return;
      const url = img.currentSrc || img.src;
      if (!url) return;
      if (img.closest('button, a, [role="menuitem"], [role="button"], [data-foto-skip]')) return;
      e.preventDefault();
      e.stopPropagation();
      setFoto({ url, nome: img.alt || 'Foto' });
    }
    document.addEventListener('click', aoClicar, true);
    return () => document.removeEventListener('click', aoClicar, true);
  }, []);

  return (
    <Dialog open={!!foto} onOpenChange={(v) => { if (!v) setFoto(null); }}>
      {/* z-index 1100 · pode abrir por cima de outro modal (ficha, drawer etc) */}
      <DialogContent className="max-w-lg z-[1100]">
        <DialogHeader>
          <DialogTitle className="truncate">{foto?.nome || 'Foto'}</DialogTitle>
        </DialogHeader>
        {foto ? (
          <img
            src={foto.url}
            alt={foto.nome}
            className="w-full max-h-[70vh] object-contain rounded-lg bg-muted"
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
