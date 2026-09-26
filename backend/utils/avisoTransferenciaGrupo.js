// ════════════════════════════════════════════════════════════════════════════
//  O aviso à COORDENAÇÃO de que alguém pediu transferência de grupo — PURO
//
//  Duas portas criam `mem_grupo_transferencias`, e as duas passam por
//  `services/grupoTransferencia.solicitarTransferencia`:
//    · 'app'      — o LÍDER aperta "Solicitar transferência" (25/08/2026);
//    · 'whatsapp' — a PRÓPRIA pessoa pede pelo WhatsApp da CBRio (26/09/2026).
//
//  ⚠️ O texto de 'app' é BYTE A BYTE o que a rota do app sempre mandou —
//  extrair o serviço não pode mudar o que a coordenação lê.
//  ⚠️ O de 'whatsapp' diz de onde veio e o destino citado, e NÃO leva telefone:
//  a notificação vai para quem a regra do módulo alcançar; o telefone da
//  conversa fica no `motivo` da própria transferência, que é onde a
//  coordenação trabalha.
// ════════════════════════════════════════════════════════════════════════════

function textoAvisoTransferencia({ origem = 'app', pessoaNome = null, grupoNome = '', motivo = null, destinoTexto = null } = {}) {
  if (origem === 'whatsapp') {
    return {
      titulo: 'Pedido de troca de grupo pelo WhatsApp',
      mensagem: `${pessoaNome || 'Alguém'} do grupo "${grupoNome}" pediu pelo WhatsApp da CBRio para trocar de grupo. `
        + `Destino citado: ${destinoTexto || 'não informado'}. `
        + 'O pedido está na Caixa de entrada, aguardando a coordenação confirmar com a pessoa e escolher o grupo.',
    };
  }
  return {
    titulo: 'Transferência pedida por um líder',
    mensagem: `${pessoaNome || 'Alguém'} do grupo "${grupoNome}" precisa ser transferida. `
      + `${motivo ? `Motivo: ${motivo}. ` : ''}O pedido está na Caixa de entrada, aguardando a coordenação escolher o grupo.`,
  };
}

module.exports = { textoAvisoTransferencia };
