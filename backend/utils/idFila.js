// ════════════════════════════════════════════════════════════════════════════
//  O id da fila de propostas dos agentes é INTEIRO, não UUID.
//
//  ⚠️⚠️ INCIDENTE de 02/09/2026 — o Matheus clicou em "Aprovar" na fila do
//  /assistente-ia e recebeu a faixa âmbar `0 de 1 concluída · 1 com erro: ID
//  invalido`. Causa: `POST /agents/queue/:id/apply` validava
//  `isValidUUID(req.params.id)`, mas `agent_queue.id` é
//  `integer DEFAULT nextval('agent_queue_id_seq')` — os ids reais são 440, 439,
//  438. Ou seja **TODO clique em Aprovar era recusado com 400**, desde sempre:
//  medido, 440 propostas na história e **ZERO aplicadas**.
//
//  ⚠️ O "Rejeitar" funcionava (8 rejeitadas) porque a rota dele não tinha
//  validação nenhuma — o que é o outro lado do mesmo defeito: id não-numérico
//  ali chega ao PostgREST e vira 22P02 traduzido como "Erro" genérico.
//
//  ⚠️⚠️ RÉGUA QUE FICA: validador tem que casar com o TIPO DA COLUNA. Guarda
//  copiada de outra rota é guarda que recusa justamente o caminho certo — e o
//  sintoma ("ID inválido" para um id que o próprio sistema gerou) manda quem
//  usa procurar defeito no lugar errado.
// ════════════════════════════════════════════════════════════════════════════

/**
 * Aceita id de fila (inteiro positivo) vindo da URL, onde tudo é string.
 *
 * ⚠️ Recusa `'1.5'`, `'0'`, `'-3'`, `'1e3'`, `'  '`, `'12abc'` e notação com
 * sinal: `Number('+7')` é 7 e `parseInt('12abc')` é 12 — os dois deixariam
 * passar lixo que o banco depois recusa com 22P02. O teste amarra isso.
 *
 * @returns {number|null} o inteiro, ou null quando não é id de fila
 */
function idFila(valor) {
  if (typeof valor === 'number') {
    return Number.isInteger(valor) && valor > 0 ? valor : null;
  }
  if (typeof valor !== 'string') return null;
  // Só dígitos, sem sinal, sem ponto, sem espaço, sem zero à esquerda solto.
  if (!/^[1-9][0-9]{0,17}$/.test(valor)) return null;
  const n = Number(valor);
  return Number.isSafeInteger(n) ? n : null;
}

module.exports = { idFila };
