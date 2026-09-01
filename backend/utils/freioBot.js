// ════════════════════════════════════════════════════════════════════════════
//  O freio do bot · "posso responder automaticamente?"
//
//  Relato do Matheus (25/08/2026), com print: a Thalya escreveu "Vou semana que
//  vem com minha amiga!" e recebeu o MENU DE SETORES 20 segundos depois — com
//  `whatsapp_config.respostas_automaticas = false` desde 24/08 19:50.
//
//  ⚠️⚠️ A CAUSA: o gate existia, estava certo, e era FAIL-OPEN.
//
//      const { data: cfg } = await supabase.from('whatsapp_config')...
//      if (cfg && cfg.respostas_automaticas === false) { ...; return; }
//
//  O `error` era DESCARTADO. Consulta que falha (instabilidade, timeout) devolve
//  `cfg = null`, `cfg && ...` vira `false`, e o bot PASSA. Ou seja: uma falha de
//  leitura da configuração RELIGAVA o bot.
//
//  ⚠️ O padrão no banco é a assinatura disso, não de gate quebrado. O bot falou
//  18·7·29·21·8 vezes/dia até 11/08; o gate entrou em 12/08 e caiu para 1 no
//  mesmo dia; depois 1·3·1·1 em 22-25/08. Gate quebrado não produz "1 a cada
//  dois dias" — falha intermitente produz.
//
//  ⚠️⚠️ E OS DOIS FREIOS PRECISAM DE DIREÇÕES OPOSTAS:
//
//    `ia_ativa`             corta o webhook INTEIRO, inclusive o
//                           `registrarInbound` ⇒ fechar em caso de falha faria
//                           a mensagem da pessoa NÃO APARECER no inbox. Fica
//                           FAIL-OPEN: perder a mensagem é pior que o bot falar.
//
//    `respostas_automaticas` cala só o que o bot RESPONDE, e a mensagem já foi
//                           gravada ⇒ FAIL-CLOSED. Não conseguir ler significa
//                           não responder, e o custo é uma resposta a menos numa
//                           caixa que gente atende de qualquer forma.
//
//  A lei que sustenta a assimetria é do Matheus (12/08, reafirmada em 24/08):
//  "não quero bot; o que a pessoa falar não deve abrir o menu. Será apenas
//  atendimento humanizado por enquanto." Um freio que se solta sozinho quando o
//  banco soluça não é freio.
// ════════════════════════════════════════════════════════════════════════════

/**
 * O bot pode responder automaticamente?
 *
 * @param cfg          a linha de `whatsapp_config` (ou null)
 * @param erroConfig   o `error` da consulta (truthy = não deu para ler)
 *
 * ⚠️ `=== false` e não `!cfg.respostas_automaticas`: coluna ausente (deploy
 * anterior à migration) devolve `undefined`, e ali o comportamento correto é o
 * histórico — o bot responde, como respondia antes de o freio existir. Só um
 * `false` EXPLÍCITO no banco significa "cale-se".
 */
function botPodeResponder({ cfg = null, erroConfig = null } = {}) {
  // ⚠️⚠️ FAIL-CLOSED: sem conseguir ler a configuração, não se responde.
  if (erroConfig) return false;
  if (!cfg) return false;
  return cfg.respostas_automaticas !== false;
}

/**
 * O webhook deve parar INTEIRO? (freio de emergência)
 *
 * ⚠️ FAIL-OPEN de propósito, e a diferença em relação ao de cima é o que se
 * perde ao errar: aqui um `true` indevido descartaria a mensagem da pessoa
 * ANTES de ela chegar no inbox. Só um `false` explícito corta.
 */
function webhookDesligado({ cfg = null } = {}) {
  return !!cfg && cfg.ia_ativa === false;
}

module.exports = { botPodeResponder, webhookDesligado };
