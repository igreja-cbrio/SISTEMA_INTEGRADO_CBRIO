// Decide se um erro que derrubou a tela é RECUPERÁVEL por recarregamento.
//
// Estava embutido no App.tsx, onde não dava para testar: importar o App puxa
// todas as rotas lazy. Aqui é função pura, e os dois regexes ficam num lugar só.

// Um chunk lazy que não carrega quase sempre significa deploy novo: o HTML em
// cache aponta para um hash de arquivo que já não existe.
//
// Mensagens cobertas por navegador:
//   Chrome/Edge : "Failed to fetch dynamically imported module"
//   Firefox     : "error loading dynamically imported module"
//   Safari/iOS  : "Importing a module script failed" + "'text/html' is not a valid JavaScript MIME type"
//   Webpack     : "Loading chunk X failed" / "ChunkLoadError"
export const CHUNK_ERROR_RE = /Loading chunk|ChunkLoadError|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|valid JavaScript MIME type|Expected a JavaScript(?: \w+)? module script/i;

// #310 "Rendered more hooks than during the previous render" e #300 "Rendered
// fewer hooks than expected". Em produção o React só emite o número.
export const HOOKS_ERROR_RE = /Minified React error #3(00|10)\b|Rendered (more|fewer) hooks/i;

export type MotivoRecuperacao = 'chunk' | 'hooks-pos-atualizacao';

/**
 * ⚠️ A GUARDA DOS HOOKS É DE PROPÓSITO ESTREITA.
 *
 * Erro de ordem de hooks quase sempre é BUG DE CÓDIGO — foi o que derrubou a
 * tela do voluntariado em 16/08/2026 (um `useState` depois de um `return null`).
 * Recarregar naquele caso não consertaria nada: o mesmo componente quebraria de
 * novo, o usuário perderia o que estava fazendo e ainda ficaria sem a mensagem
 * de erro que permitiu achar a causa.
 *
 * Existe UM caso em que recarregar resolve: a aba acabou de se atualizar sozinha
 * e ficou com módulos de duas versões misturados. Esse caso tem uma assinatura
 * observável — o contador de tentativas na querystring está acima de zero, e ele
 * EXPIRA em 60 segundos (APP_UPDATE_RETRY_WINDOW_MS). Fora dessa janela, tratar
 * #310 como recuperável transformaria todo bug de hooks num recarregamento
 * silencioso: a tela pisca, volta a quebrar, e ninguém nunca fica sabendo.
 *
 * Por isso `retryCount > 0` não é detalhe de implementação — é a guarda inteira.
 */
export function classificarErroDeTela(
  mensagem: string | null | undefined,
  retryCount: number,
  maxRetries: number,
): { recuperavel: boolean; motivo: MotivoRecuperacao | null } {
  const msg = mensagem || '';

  if (CHUNK_ERROR_RE.test(msg)) {
    return { recuperavel: retryCount < maxRetries, motivo: 'chunk' };
  }

  if (HOOKS_ERROR_RE.test(msg) && retryCount > 0) {
    return { recuperavel: retryCount < maxRetries, motivo: 'hooks-pos-atualizacao' };
  }

  return { recuperavel: false, motivo: null };
}
