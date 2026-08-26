// ════════════════════════════════════════════════════════════════════════════
//  A cota de 24h da Meta · o teto que o teto POR RODADA não cobria
//
//  ⚠️⚠️ INCIDENTE DE 26/08/2026, e este arquivo existe por causa dele.
//
//  Às 02:14 saíram 200 convites do censo. Às 02:15, mais 400 — rodadas 9, 10 e
//  11 em **48 segundos**, 600 pessoas. O teto POR RODADA (200) funcionou
//  perfeitamente nas três; o que não existia era trava ENTRE rodadas.
//
//  Resultado, medido no mesmo dia: **321 mensagens recusadas com
//  `Spam Rate limit hit`** — e o estrago NÃO ficou no censo. A partir dali,
//  TODA mensagem da igreja passou a bater no mesmo erro, inclusive as
//  transacionais que ninguém pediu para arriscar:
//      grupos_pedido_aprovado_v2 ·  3
//      pedido_atualizado         · 11
//      aniversario_voluntariado  ·  1
//  No dia: 336 bloqueadas contra 248 entregues. Uma campanha de madrugada
//  derrubou o canal de aviso de grupo do dia seguinte.
//
//  ⚠️ A conta está em TIER_250: **250 destinatários ÚNICOS por 24h**, e a cota
//  é da CONTA INTEIRA, não por template nem por contexto. Contar por rodada
//  nunca poderia proteger disso.
//
//  ⚠️⚠️ A RESERVA OPERACIONAL é o coração do arquivo. Sem ela, uma campanha
//  legítima consome a cota do dia e o aviso de "seu pedido de grupo foi
//  aprovado" — que é resposta a um ato da pessoa, chega para UMA pessoa e não
//  pode esperar — morre porque alguém apertou disparar de madrugada. Campanha
//  espera; transacional não.
// ════════════════════════════════════════════════════════════════════════════

/** O tier da conta. ⚠️ Só subir quando a Meta subir de verdade — ver o topo. */
const CAPACIDADE_24H = 250;

/**
 * Fatia intocável por disparo em massa.
 *
 * ⚠️ 50 não é chute: é a ordem de grandeza do que sai por dia em transacional
 * (grupos aprovados, escala, aniversário, pedido atualizado). Foi exatamente
 * essa faixa que morreu em 26/08.
 */
const RESERVA_OPERACIONAL = 50;

/** Inteiro >= 0, ou 0. Texto do banco (`"321"`) entra normalmente. */
function naoNegativo(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

/**
 * Quantos destinatários novos uma campanha ainda pode alcançar agora.
 *
 * @param unicos24h  destinatários ÚNICOS já contatados nas últimas 24h, em
 *                   QUALQUER contexto (é assim que a Meta conta)
 *
 * ⚠️⚠️ `unicos24h` DESCONHECIDO (null/undefined) devolve **0**, não a cota
 * cheia. Não conseguir contar quanto já saiu é exatamente a situação em que
 * disparar é mais perigoso — e o custo de errar fechado é uma campanha adiada,
 * contra um número queimado do outro lado. Fail-CLOSED.
 */
function cotaDisponivel({
  unicos24h = null, capacidade = CAPACIDADE_24H, reserva = RESERVA_OPERACIONAL,
} = {}) {
  if (unicos24h === null || unicos24h === undefined) return 0;
  const cap = naoNegativo(capacidade);
  const res = naoNegativo(reserva);
  const usados = naoNegativo(unicos24h);
  return Math.max(0, cap - res - usados);
}

/**
 * O teto EFETIVO da rodada: o menor entre o teto do canal e o que a cota
 * de 24h ainda permite.
 *
 * Devolve `{ teto, motivo }` — o motivo sobe para a tela poder DIZER por que a
 * rodada encolheu. "Só 40 de 380 vão sair" sem explicação faz a pessoa apertar
 * disparar de novo, que é literalmente o que produziu o incidente.
 */
function tetoEfetivo({ tetoCanal = 0, unicos24h = null, capacidade, reserva } = {}) {
  const disp = cotaDisponivel({ unicos24h, capacidade, reserva });
  const canal = naoNegativo(tetoCanal);
  if (disp <= 0) {
    return {
      teto: 0,
      motivo: unicos24h === null || unicos24h === undefined
        ? 'nao_deu_pra_conferir_a_cota'
        : 'cota_24h_esgotada',
      cota_disponivel: disp,
      unicos_24h: naoNegativo(unicos24h),
    };
  }
  if (disp < canal) {
    return { teto: disp, motivo: 'limitado_pela_cota_24h', cota_disponivel: disp, unicos_24h: naoNegativo(unicos24h) };
  }
  return { teto: canal, motivo: 'teto_do_canal', cota_disponivel: disp, unicos_24h: naoNegativo(unicos24h) };
}

module.exports = { cotaDisponivel, tetoEfetivo, CAPACIDADE_24H, RESERVA_OPERACIONAL };
