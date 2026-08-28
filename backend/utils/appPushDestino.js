// ============================================================================
// PARA QUAL APP VAI O PUSH — 2026-08-20
//
// Relato do Matheus: *"to recebendo notificações do app de membros sobre
// inscrição no next, cadastros aprovados, aviso sobre disparo de mensagens no
// wpp que não chegou para certa pessoa. Essas notificações devem vir apenas no
// app do staff."*
//
// ⚠️⚠️ A CAUSA: `app_push_tokens` é UMA tabela para DOIS apps Expo (membros e
// CBRio Staff), e `notificar()` — que é o aviso do ERP/staff — disparava push
// para TODOS os tokens da pessoa. Quem usa os dois apps com a MESMA conta
// recebia o aviso operacional no celular pelo app errado. Medido em 20/08: a
// conta `matheus.toscano@cbrio.org` tem um token carimbado com o projeto do app
// de MEMBROS, atualizado no mesmo dia.
//
// ⚠️ O sino não estava errado: `app_notificacoes` (que o app do membro lê) não
// tinha nenhuma linha desses tipos. O vazamento era só na BANNER do push, que
// não passa por tabela nenhuma.
// ============================================================================

/** EAS projectId de cada app. Não é segredo — vive no `app.json` de cada repo. */
const APP_MEMBROS = '3da60261-4811-458b-90c7-7e81f5511c51';
const APP_STAFF = '5360e6ff-c713-44e4-bf4c-eb8f29a096ee';

const PROJETO_POR_APP = { membros: APP_MEMBROS, staff: APP_STAFF };

/** Normaliza o `projeto_id` da linha; devolve null quando não dá pra saber. */
function projetoDoToken(linha) {
  const v = linha && linha.projeto_id != null ? String(linha.projeto_id).trim().toLowerCase() : '';
  return v || null;
}

/** O token é comprovadamente do app informado? (desconhecido = false) */
function ehDoApp(linha, app) {
  const alvo = PROJETO_POR_APP[app];
  return !!alvo && projetoDoToken(linha) === alvo;
}

/**
 * Filtra os tokens que devem receber um push destinado a `alvo`.
 *
 * ⚠️⚠️ A REGRA É "EXCLUIR O QUE É COMPROVADAMENTE DO OUTRO APP", não "aceitar
 * só o que é do alvo". Motivo medido: o app do Staff **não carimbava**
 * `projeto_id` (a rota `/staff/push-token` gravava sem ele), então lista branca
 * derrubaria o push de TODO aparelho de staff que ainda não reabriu o app —
 * trocaria um aviso no app errado por nenhum aviso.
 *
 * ⚠️ RESÍDUO DECLARADO: token sem carimbo continua recebendo. Isso ainda alcança
 * token ANTIGO do app de membros (anterior a 07/08/2026, quando o carimbo
 * entrou). Ele encolhe sozinho — os dois apps regravam o próprio token a cada
 * abertura —, e a lista branca só é segura quando os sem-carimbo drenarem.
 *
 * @param {Array<{token?: string, projeto_id?: string|null}>} tokens
 * @param {'membros'|'staff'} alvo
 */
function filtrarPorApp(tokens, alvo) {
  const lista = Array.isArray(tokens) ? tokens : [];
  if (!PROJETO_POR_APP[alvo]) return lista; // alvo desconhecido: não filtra nada
  const outros = Object.keys(PROJETO_POR_APP)
    .filter((k) => k !== alvo)
    .map((k) => PROJETO_POR_APP[k]);
  return lista.filter((linha) => {
    // ⚠️ Token SEM CARIMBO devolve `null`, que nunca está em `outros` — então
    // ele cai aqui e é MANTIDO. É o resíduo declarado no cabeçalho, e é o que
    // impede a lista branca de silenciar o staff que ainda não reabriu o app.
    return !outros.includes(projetoDoToken(linha));
  });
}

/** Quantos tokens ficaram sem carimbo — é o tamanho do resíduo acima. */
function contarSemCarimbo(tokens) {
  return (Array.isArray(tokens) ? tokens : []).filter((l) => projetoDoToken(l) === null).length;
}

module.exports = {
  APP_MEMBROS,
  APP_STAFF,
  PROJETO_POR_APP,
  projetoDoToken,
  ehDoApp,
  filtrarPorApp,
  contarSemCarimbo,
};
