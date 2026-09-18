// ════════════════════════════════════════════════════════════════════════════
//  O teto do "aprovar em lote" na fila de propostas dos agentes.
//
//  ⚠️⚠️ POR QUE EXISTE (02/09/2026): o botão Aprovar estava DESARMADO desde
//  sempre — `agent_queue.id` é inteiro e a rota validava UUID, então 440
//  propostas acumularam e ZERO foi aplicada. Consertar a validação liga um
//  botão sobre **432 propostas represadas desde 26/05**, e cada uma aplicada
//  dispara uma notificação interna. O sino já está com ~18,9 mil não lidas.
//
//  É a lição de 13/08 ("o conserto LIGOU um botão que estava desarmado e o
//  caminho de envio não estava pronto") aplicada ANTES do estrago, não depois.
//
//  ⚠️⚠️ O TETO VALE SÓ PARA APROVAR, NUNCA PARA REJEITAR. Rejeitar não manda
//  aviso a ninguém — é limpeza de fila, e limitá-la só tornaria a limpeza mais
//  trabalhosa. O teto existe por causa do EFEITO COLATERAL, não do volume.
// ════════════════════════════════════════════════════════════════════════════

/** Quantas propostas podem ser APLICADAS por clique. */
export const TETO_APLICAR_EM_LOTE = 25;

export type IdProposta = string | number;

export type PlanoLote = {
  /** os ids que vão nesta rodada · ⚠️ `agent_queue.id` é INTEIRO, mas a tela
   *  repassa o valor como veio do JSON — por isso o tipo aceita os dois. */
  vao: IdProposta[];
  /** quantos ficaram de fora do teto (0 quando nada foi cortado) */
  adiados: number;
  /** true quando o teto cortou algo — a tela DECLARA */
  truncado: boolean;
  /** true se esta ação dispara aviso a gente (só aprovar dispara) */
  avisa: boolean;
};

/**
 * Decide o que entra numa rodada de lote.
 *
 * ⚠️ Preserva a ORDEM recebida (é a ordem que a tela mostra): cortar do fim
 * mantém previsível qual proposta ficou para a próxima rodada.
 */
export function planejarLote(ids: readonly IdProposta[] | null | undefined, tipo: 'apply' | 'reject'): PlanoLote {
  const lista: IdProposta[] = Array.isArray(ids)
    ? ids.filter((x): x is IdProposta => typeof x === 'string' || typeof x === 'number')
    : [];
  if (tipo !== 'apply') {
    // Rejeitar não tem teto — ver o cabeçalho.
    return { vao: [...lista], adiados: 0, truncado: false, avisa: false };
  }
  const vao = lista.slice(0, TETO_APLICAR_EM_LOTE);
  const adiados = Math.max(0, lista.length - vao.length);
  return { vao, adiados, truncado: adiados > 0, avisa: vao.length > 0 };
}

/**
 * O texto da confirmação. ⚠️ Diz o EFEITO ("vão sair N avisos"), não a
 * quantidade de cliques — quem confirma precisa saber o que sai daqui, e é
 * isso que o botão nunca disse.
 */
export function textoConfirmacao(plano: PlanoLote, tipo: 'apply' | 'reject'): string {
  const n = plano.vao.length;
  if (tipo === 'reject') {
    return n === 1
      ? 'Rejeitar 1 proposta? Ela sai da fila e ninguém é avisado.'
      : `Rejeitar ${n} propostas? Elas saem da fila e ninguém é avisado.`;
  }
  const base = n === 1
    ? 'Aprovar 1 proposta vai executar a ação dela e disparar 1 aviso interno'
    : `Aprovar ${n} propostas vai executar a ação de cada uma e disparar até ${n} avisos internos`;
  const cauda = plano.truncado
    ? ` As outras ${plano.adiados} ficam para o próximo lote (o teto é ${TETO_APLICAR_EM_LOTE} por vez).`
    : '';
  return `${base} para os responsáveis.${cauda}`;
}
