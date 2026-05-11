// ============================================================================
// formatErro · mensagem amigavel baseada no tipo de erro
//
// Uso:
//   .catch(e => setErro(formatErro(e, 'KPI')))
//   .catch(e => toast.error(formatErro(e)))
//
// Distingue:
//   - Network · fetch nao chegou (offline, DNS, CORS)
//   - 401 · sessao expirada
//   - 403 · sem permissao
//   - 404 · recurso nao encontrado
//   - 5xx · erro do servidor
//   - Resto · mensagem do backend ou generica
// ============================================================================

export function formatErro(err, contexto = '') {
  // TypeError sem status = falha de rede (fetch nao chegou no servidor)
  if (err instanceof TypeError || /fetch|network/i.test(err?.message || '')) {
    return 'Sem conexao com o servidor. Verifique sua internet.';
  }

  const status = err?.status;

  if (status === 401) return 'Sua sessao expirou. Recarregue a pagina e entre de novo.';
  if (status === 403) return 'Voce nao tem permissao para essa acao.';
  if (status === 404) return contexto ? `${contexto} nao encontrado.` : 'Recurso nao encontrado.';
  if (status === 409) return err?.message || 'Conflito · esse registro ja existe.';
  if (status >= 500) return 'Erro no servidor. Tente novamente em alguns segundos.';

  return err?.message || (contexto ? `Erro ao carregar ${contexto.toLowerCase()}.` : 'Erro inesperado.');
}
