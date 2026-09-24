// Rótulo do status de evento na TELA (24/09/2026 · pedido do Matheus:
// "eventos encerrados podem ficar como inativos"). O valor gravado continua o
// do banco (`publicado`/`encerrado`/…) — é enum do CHECK e de vários leitores;
// o que muda é só o que a equipe lê. Uma régua, usada por todas as telas.
export const ROTULO_STATUS_EVENTO: Record<string, string> = {
  rascunho: 'rascunho',
  publicado: 'ativo',
  encerrado: 'inativo',
  arquivado: 'arquivado',
};

export function rotuloStatusEvento(status?: string | null): string {
  const s = String(status || '');
  return ROTULO_STATUS_EVENTO[s] || s;
}
