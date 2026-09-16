/**
 * Régua PURA do que o `PUT /api/grupos/:id` pode escrever em `rede_id`.
 * Sem banco, sem rede, sem relógio → entra no gate de deploy.
 *
 * ⚠️⚠️ POR QUE ISTO EXISTE (medido no `app_audit_log` em 16/09/2026).
 * A rede dos grupos foi preenchida em lote em 29/07 e ESVAZIOU sozinha: **80
 * salvamentos** apagaram `rede_id` entre 21/07 e 01/09, sempre como efeito
 * colateral de um save que mexia em OUTRA coisa (79 dos 80 tinham
 * `modo_inscricao` no mesmo evento). Em 16/09, 74 dos 110 grupos ativos
 * estavam sem rede — e a coordenação chegou a repor a rede de um grupo às
 * 15:23 e vê-la apagada de novo no mesmo dia. O `PUT` é update de OBJETO
 * INTEIRO (`rede_id: d.rede_id || null`): qualquer corpo que chegue sem a
 * rede — chunk antigo em cache, payload parcial, tela que não carregou a
 * lista de redes — APAGA o vínculo em silêncio.
 *
 * ⚠️⚠️ A LEI: **campo vazio não apaga rede.** Só apaga quem PEDE pra apagar,
 * com `rede_limpar: true`. É a mesma lei que `modo_inscricao` já tinha ("um
 * form com chunk antigo não pode resetar o modo"), agora escrita pro campo que
 * sangrou. O custo de errar é assimétrico: deixar de gravar uma rede que a
 * pessoa acabou de escolher ela percebe na hora e refaz; apagar a rede de 41
 * grupos ninguém percebe — vira "o import veio incompleto" dois meses depois.
 *
 * ⚠️ Tirar o grupo de uma rede CONTINUA possível: a tela manda `rede_limpar`
 * quando a pessoa escolhe "Sem rede" no seletor. O que não existe mais é o
 * apagamento que ninguém pediu.
 */

// Aceita só o formato de id do banco — texto solto ('', '__none__', 'null',
// undefined) nunca vira escrita, em nenhuma direção.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * @param {object} body  corpo do PUT
 * @returns {{rede_id?: string|null}} patch a mesclar no update — objeto VAZIO
 *          significa "não mexe na rede que está lá".
 */
function patchRedeGrupo(body) {
  const d = body || {};
  const bruto = typeof d.rede_id === 'string' ? d.rede_id.trim() : d.rede_id;
  if (typeof bruto === 'string' && UUID.test(bruto)) return { rede_id: bruto };
  // Pedido EXPLÍCITO de desvincular — o único caminho que apaga.
  if (d.rede_limpar === true) return { rede_id: null };
  return {};
}

module.exports = { patchRedeGrupo };
