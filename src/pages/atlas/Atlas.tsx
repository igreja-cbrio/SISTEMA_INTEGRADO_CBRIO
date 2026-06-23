import { useEffect, useMemo } from 'react';
// O atlas é um documento HTML autocontido (CSS + JS + dados embutidos), gerado
// pela varredura do sistema. Importamos como string crua (Vite ?raw) e renderizamos
// num <iframe srcDoc> pra isolar 100% o CSS/JS dele do resto do app.
import atlasHtml from './atlas.html?raw';

/**
 * /atlas — Atlas operacional do sistema (manual + auditoria + fluxograma).
 * Página standalone (fora do AppShell), autenticada (ProtectedRoute) e fora de
 * qualquer menu. `initialHash` abre direto numa visão (ex.: '#fluxograma' em
 * /atlas/fluxograma): injetamos um setter de location.hash antes do conteúdo, que
 * o roteamento interno por hash do atlas lê na inicialização.
 */
export default function Atlas({ initialHash }: { initialHash?: string }) {
  useEffect(() => {
    const anterior = document.title;
    document.title = (initialHash === '#fluxograma' ? 'Fluxograma · ' : '') + 'Atlas operacional · CBRio';
    return () => { document.title = anterior; };
  }, [initialHash]);

  const doc = useMemo(() => {
    const hashScript = initialHash
      ? '<script>try{location.hash=' + JSON.stringify(initialHash) + ';}catch(e){}</script>'
      : '';
    return '<!doctype html><html lang="pt-br"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1"></head><body>' +
      hashScript + atlasHtml + '</body></html>';
  }, [initialHash]);

  return (
    <iframe
      title="Atlas operacional CBRio"
      srcDoc={doc}
      sandbox="allow-scripts allow-same-origin"
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', border: 'none', background: '#eef2f1' }}
    />
  );
}
