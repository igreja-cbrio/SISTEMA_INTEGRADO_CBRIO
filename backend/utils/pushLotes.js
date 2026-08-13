// ============================================================================
// COMO PARTIR O LOTE DE PUSH · a régua (07/08/2026)
//
// ⚠️ GÊMEA de `Aplicativo-CBRio/lib/pushLotes.ts`. As duas precisam decidir
// IGUAL porque os dois remetentes escrevem na MESMA tabela de tokens e falam
// com o MESMO serviço da Expo. Se divergirem, um deles volta a montar request
// misto e o erro reaparece só metade das vezes — que é pior de achar do que o
// bug original. Mudou aqui, muda lá (e vice-versa).
//
// ⚠️⚠️ O QUE ISTO CONSERTA: 1.801 de 1.820 tickets (98,9%) em
// `system_mobile_push_tickets` estavam em erro, 1.773 deles com
// `PUSH_TOO_MANY_EXPERIENCE_IDS`. A tabela `app_push_tokens` recebe token de
// DOIS apps Expo (membros e CBRio Staff — mesma org, mesmo Supabase) e o
// remetente juntava tudo num request só. A Expo recusa **o request inteiro**,
// não as linhas estranhas: um token do Staff derrubava a entrega dos 30 tokens
// iOS perfeitamente válidos do app de membros.
// Só 19 pushes passaram desde 02/08 — justamente os envios pequenos, pra uma
// pessoa só, em que o lote por acaso não misturou.
// ============================================================================

/** Teto de mensagens por request da Expo Push API. */
const MAX_POR_REQUEST = 100;

/** Projeto normalizado, ou `null` quando desconhecido. */
function projetoDe(t) {
  const p = typeof t.projeto_id === 'string' ? t.projeto_id.trim() : '';
  return p || null;
}

/**
 * Parte a lista de tokens em REQUESTS que a Expo aceita.
 *
 *  1. Nunca misturar projetos no mesmo request (a causa dos 1.773 erros).
 *  2. Token de projeto DESCONHECIDO vai SOZINHO — um request com uma mensagem
 *     só não tem como ter "experience ids demais". É o que mantém a entrega
 *     correta desde o primeiro envio, sem adivinhar a origem do token antigo e
 *     sem apagar linha de ninguém.
 *
 * ⚠️ Não juntar os desconhecidos num lote: eles são exatamente os de origem
 * AMBÍGUA, ou seja, a mistura mais provável de todas.
 */
function lotesDePush(tokens, maxPorRequest = MAX_POR_REQUEST) {
  if (!Array.isArray(tokens) || !tokens.length) return [];
  const teto = Number.isFinite(maxPorRequest) && maxPorRequest >= 1
    ? Math.floor(maxPorRequest)
    : MAX_POR_REQUEST;

  const vistos = new Set();
  const porProjeto = new Map();
  const desconhecidos = [];

  for (const t of tokens) {
    const tok = t && typeof t.token === 'string' ? t.token.trim() : '';
    if (!tok || vistos.has(tok)) continue;
    vistos.add(tok);
    const proj = projetoDe(t);
    if (proj === null) { desconhecidos.push({ ...t, token: tok }); continue; }
    const lista = porProjeto.get(proj) || [];
    lista.push({ ...t, token: tok });
    porProjeto.set(proj, lista);
  }

  const lotes = [];
  for (const proj of [...porProjeto.keys()].sort()) {
    const lista = porProjeto.get(proj);
    for (let i = 0; i < lista.length; i += teto) lotes.push(lista.slice(i, i + teto));
  }
  for (const t of desconhecidos) lotes.push([t]);
  return lotes;
}

/**
 * Este ticket de erro merece apagar o token?
 *
 * ⚠️ SÓ `DeviceNotRegistered` — o único erro que a Expo define como permanente
 * (app desinstalado / permissão revogada) e o único que se conserta apagando a
 * linha. `PUSH_TOO_MANY_EXPERIENCE_IDS` culpa o REQUEST, não o token: apagar
 * por causa dele teria zerado a tabela inteira, 30 pessoas perdendo push por um
 * defeito que não era delas.
 */
function tokenMorreu(errorCode) {
  return String(errorCode == null ? '' : errorCode).trim() === 'DeviceNotRegistered';
}

module.exports = { MAX_POR_REQUEST, lotesDePush, tokenMorreu };
