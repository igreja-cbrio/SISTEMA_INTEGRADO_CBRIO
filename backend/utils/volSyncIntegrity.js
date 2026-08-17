function decidirReconciliacao({ tiposComFalha, pessoasCompletas }) {
  if (tiposComFalha > 0) return { podeReconciliar: false, motivo: 'tipos_de_servico_com_falha' };
  if (!pessoasCompletas) return { podeReconciliar: false, motivo: 'pessoas_do_services_incompletas' };
  return { podeReconciliar: true, motivo: null };
}

module.exports = { decidirReconciliacao };
