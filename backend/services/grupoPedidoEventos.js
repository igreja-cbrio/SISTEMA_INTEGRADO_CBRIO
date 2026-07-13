// Linha do tempo do pedido de grupo — cada transição vira um evento imutável
// em mem_grupo_pedido_eventos (é o histórico que a triagem vê ao clicar na
// pessoa na caixa de entrada). Nunca lança: histórico é acessório, não pode
// derrubar o fluxo principal (e tolera a migration ainda não aplicada).
const { supabase } = require('../utils/supabase');

async function registrarEventoPedido(pedidoId, tipo, detalhe = {}, autorNome = null) {
  try {
    const { error } = await supabase.from('mem_grupo_pedido_eventos').insert({
      pedido_id: pedidoId,
      tipo,
      detalhe: detalhe || {},
      autor_nome: autorNome || null,
    });
    if (error) console.error('[PedidoEventos]', tipo, error.message);
  } catch (e) {
    console.error('[PedidoEventos]', tipo, e.message);
  }
}

module.exports = { registrarEventoPedido };
