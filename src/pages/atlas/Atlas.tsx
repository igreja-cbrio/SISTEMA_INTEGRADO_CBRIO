import { useEffect } from 'react';
// O atlas é um documento HTML autocontido (CSS + JS + dados embutidos), gerado
// pela varredura do sistema. Importamos como string crua (Vite ?raw) e renderizamos
// num <iframe srcDoc> pra isolar 100% o CSS/JS dele do resto do app.
import atlasHtml from './atlas.html?raw';

// Embrulha o conteúdo num documento completo (doctype + charset) pra sair do quirks mode.
const DOC =
  '<!doctype html><html lang="pt-br"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width, initial-scale=1"></head><body>' +
  atlasHtml +
  '</body></html>';

/**
 * /atlas — Atlas operacional do sistema (manual de operação + auditoria de propósito).
 * Página standalone (fora do AppShell), autenticada (ProtectedRoute) e fora de qualquer
 * menu. Memória física de como cada módulo funciona e do que dá pra melhorar.
 */
export default function Atlas() {
  useEffect(() => {
    const anterior = document.title;
    document.title = 'Atlas operacional · CBRio';
    return () => { document.title = anterior; };
  }, []);

  return (
    <iframe
      title="Atlas operacional CBRio"
      srcDoc={DOC}
      sandbox="allow-scripts"
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', border: 'none', background: '#eef2f1' }}
    />
  );
}
