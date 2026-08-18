/**
 * Quando o sync pode ARQUIVAR perfis que sumiram do Planning Center.
 *
 * A reconciliação é a única parte do sync que REMOVE gente de circulação, e ela
 * decide isso por ausência — "não vi no roster, logo saiu". Toda condição aqui
 * existe pra impedir que uma ausência que não é uma saída vire arquivamento.
 */
function decidirReconciliacao({ tiposComFalha, pessoasCompletas, pcoAtivo = true }) {
  // ⚠️⚠️ A igreja saindo do Services não é "todo mundo saiu do voluntariado".
  // 923 dos 931 perfis têm `origem=planning_center`; contra um roster vazio ou
  // congelado, a reconciliação arquivaria a base inteira — e o
  // `/volunteers-pool` esconde arquivados, então a tela de escalar ficaria
  // vazia sem nenhum erro aparecer. Esta é a primeira condição de propósito:
  // as outras duas protegem de leitura PARCIAL, e nenhuma delas cobre a
  // decisão humana de parar de usar o Planning Center.
  if (!pcoAtivo) return { podeReconciliar: false, motivo: 'pco_desativado' };
  if (tiposComFalha > 0) return { podeReconciliar: false, motivo: 'tipos_de_servico_com_falha' };
  if (!pessoasCompletas) return { podeReconciliar: false, motivo: 'pessoas_do_services_incompletas' };
  return { podeReconciliar: true, motivo: null };
}

/**
 * O gerador de cultos por recorrência pode criar neste dia?
 *
 * `servicosDoDia` = os cultos que já existem naquele dia, cada um com
 * `service_type_id` e `planning_center_id`.
 *
 * ⚠️ Com o PCO ATIVO a régua é conservadora por causa de um incidente real
 * (05/07/2026): a equipe criou "Domingo 08:30/10:00/11:30" num dia que já tinha
 * o "Domingo - Manhã" do Planning Center, e 243 check-ins caíram nos cultos
 * novos — que nascem sem escala. As presenças se separaram da escala e a lista
 * do dia apareceu vazia. Por isso, enquanto o PCO manda, QUALQUER culto dele no
 * dia bloqueia a geração.
 *
 * ⚠️ Com o PCO DESLIGADO essa mesma régua vira o problema: um domingo tem manhã
 * E noite, e o culto da manhã (herdado do PCO) bloquearia a geração do culto da
 * noite pra sempre. Aí a única duplicata que importa é a do MESMO tipo.
 */
function podeGerarCulto({ servicosDoDia = [], serviceTypeId, pcoAtivo = true }) {
  if (servicosDoDia.some(s => s.service_type_id === serviceTypeId)) {
    return { pode: false, motivo: 'ja_existe_deste_tipo' };
  }
  if (pcoAtivo && servicosDoDia.some(s => s.planning_center_id || s.service_type_id == null)) {
    return { pode: false, motivo: 'dia_tem_culto_do_planning_center' };
  }
  return { pode: true, motivo: null };
}

module.exports = { decidirReconciliacao, podeGerarCulto };
