// ════════════════════════════════════════════════════════════════════════════
//  Registro de escaneamento do link curto · a régua de QUANTO esperar
//
//  ⚠️⚠️ POR QUE ISTO EXISTE (medido em produção em 22/09/2026)
//
//  A contagem de acesso era fire-and-forget DEPOIS do `res.redirect()`. Em
//  serverless o container congela ao responder, então o insert pendente às
//  vezes morre. Medição real, 50 escaneamentos SIMULTÂNEOS contra produção:
//
//      25 simultâneos  →  13 gravados na hora
//      +25 simultâneos →  44 no total  (parte dos 12 "perdidos" da 1ª rodada
//                                       chegou atrasada, quando o container
//                                       foi reaproveitado pela 2ª)
//      estado final    →  44 de 50 = 12% perdidos, estável
//
//  ⚠️⚠️ E a perda NÃO é aleatória: ela acontece sob CONCORRÊNCIA. O cartaz do
//  templo, escaneado por muita gente no mesmo minuto no fim do culto, perde
//  proporcionalmente MAIS que o cartaz de um corredor, onde as pessoas passam
//  espalhadas. Ou seja, o erro empurra exatamente contra o local movimentado —
//  e é essa a comparação que a campanha de voluntariado de outubro/2026 quer
//  fazer (templo × feirinha do hall).
//
//  ⚠️ O que a medição TAMBÉM desmentiu, e vale registrar para ninguém repetir
//  o alarme: o `s-maxage=30` da borda NÃO agregou nada — 50 de 50 requisições
//  voltaram `x-vercel-cache: MISS`, inclusive as 25 simultâneas. O cache não é
//  o problema, e não foi mexido.
//
//  ⇒ O insert passou a ser AWAITED. Mas awaited SEM TETO seria trocar um
//  defeito por outro pior: banco lento vira câmera parada na mão de quem está
//  com o celular apontado para um cartaz no meio do culto. Daí o teto.
//
//  ⚠️ O teto é generoso de propósito. Medido no mesmo dia: o `/r/` responde em
//  ~300 ms (já incluindo a rede Brasil→Vercel) e o insert acrescenta ~100 ms.
//  Um teto apertado demais jogaria fora justamente o registro do pico, que é o
//  que esta régua existe para salvar.
// ════════════════════════════════════════════════════════════════════════════

/** Teto de espera pelo registro, em ms. Estourou, a pessoa segue viagem e a
 *  linha de estatística se perde — nunca o contrário. */
const TETO_REGISTRO_MS = 1200;

/**
 * Espera o registro até o teto. NUNCA lança e NUNCA rejeita: quem chama está
 * no caminho de alguém que escaneou um cartaz, e estatística não pode derrubar
 * redirecionamento.
 *
 * Devolve o motivo para quem quiser logar/medir:
 *   'gravado'  · o insert confirmou
 *   'timeout'  · estourou o teto (o insert pode ou não completar depois)
 *   'erro'     · o banco recusou
 *   'sem_promessa' · o chamador não passou nada de esperável
 *
 * @param {Promise|any} promessa  o insert em andamento
 * @param {number} tetoMs         teto de espera
 * @returns {Promise<'gravado'|'timeout'|'erro'|'sem_promessa'>}
 */
async function esperarRegistro(promessa, tetoMs = TETO_REGISTRO_MS) {
  if (!promessa || typeof promessa.then !== 'function') return 'sem_promessa';

  // ⚠️ O teto tem que ser número finito e positivo. `Number('abc')` é NaN e
  // `setTimeout(fn, NaN)` dispara IMEDIATAMENTE — o await viraria no-op e a
  // perda de 12% voltaria calada. Valor inválido cai no default.
  const teto = Number.isFinite(tetoMs) && tetoMs > 0 ? tetoMs : TETO_REGISTRO_MS;

  let timer;
  try {
    const resultado = await Promise.race([
      // ⚠️ O supabase-js NÃO rejeita em erro de banco: devolve `{ error }`.
      // Tratar só o catch deixaria o erro do PostgREST passar como 'gravado'.
      Promise.resolve(promessa).then(
        (r) => (r && r.error ? 'erro' : 'gravado'),
        () => 'erro',
      ),
      new Promise((resolve) => { timer = setTimeout(() => resolve('timeout'), teto); }),
    ]);
    return resultado;
  } catch {
    return 'erro';
  } finally {
    // Sem isto, o timer segura o event loop até o fim do teto mesmo quando o
    // insert já respondeu — o oposto do que esta função existe para fazer.
    clearTimeout(timer);
  }
}

module.exports = { esperarRegistro, TETO_REGISTRO_MS };
