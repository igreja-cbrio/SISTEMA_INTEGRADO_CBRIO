// Rótulo em português (com acentuação correta) pro status de `solicitacoes`.
// Espelho do STATUS_LABELS de src/pages/Solicitacoes.jsx — mudou lá, muda aqui.
const STATUS_LABELS = {
  aguardando_aprovacao_origem: 'Aguardando aprovação',
  em_cotacao: 'Em cotação',
  pendente: 'Pendente',
  aguardando_aprovacao_financeira: 'Aprovação financeira',
  em_analise: 'Em análise',
  aprovado: 'Aprovado',
  em_atendimento: 'Em atendimento',
  aguardando_entrega: 'Aguardando entrega',
  rejeitado: 'Rejeitado',
  concluido: 'Concluído',
  avaliado: 'Avaliado',
  aguardando_ajuste: 'Aguardando ajuste',
  aguardando_merito: 'Julgamento de mérito',
  sobrestada: 'Em espera (sobrestada)',
  cancelado: 'Cancelado',
};

function rotuloStatusSolicitacao(status) {
  return STATUS_LABELS[status] || String(status || '').replace(/_/g, ' ');
}

module.exports = { rotuloStatusSolicitacao, STATUS_LABELS };
