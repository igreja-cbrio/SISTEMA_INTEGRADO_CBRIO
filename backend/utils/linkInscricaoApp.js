// ============================================================================
// Link PÚBLICO de inscrição para o membro CONVIDAR outra pessoa (app · 20/08/2026)
//
// Pedido do Matheus: *"no app dos membros, nas inscrições, tivesse uma
// funcionalidade para compartilhar o link de inscrição. caso uma pessoa queira
// mandar para outra"*.
//
// ⚠️⚠️ O APP NÃO MONTA LINK. Ele recebe pronto daqui, e o motivo é concreto: a
// URL `cbrio.org/apresentacao-criancas` já foi um LINK MORTO por meses (medido
// em 11/08/2026 — devolvia 200 só pelo catch-all do SPA e não renderizava
// formulário nenhum). URL escrita à mão no app é URL que ninguém valida e que
// quebra em silêncio, num aparelho que só atualiza por OTA. Aqui a rota vem do
// registro canônico (`services/inscricaoPortas.js`), que tem teste no gate.
//
// ⚠️ E é DAQUI que sai o link também porque um dia o destino pode virar código
// curto do módulo Links: muda neste arquivo, e todo bundle já publicado passa a
// compartilhar o endereço novo, sem OTA.
// ============================================================================

const { PORTAS_INSCRICAO } = require('../services/inscricaoPortas');

// ⚠️⚠️ A BASE É CONSTANTE, e NÃO lê variável de ambiente. Isso é decisão, não
// esquecimento:
//
//   1. `FRONTEND_URL` existe em produção com valor ENCRIPTADO (não é auditável
//      daqui) e pode apontar pro domínio da Vercel. Este link vai pro WhatsApp
//      de gente de fora — apontar pra `crmcbrio.vercel.app` sem ninguém
//      perceber é o tipo de erro que só aparece quando alguém não consegue se
//      inscrever.
//   2. Base vinda de env também é como um link de `localhost` foi entregue a
//      uma líder por WhatsApp (29/07/2026). Sem env, essa classe de bug não
//      existe — melhor que se defender dela com um regex.
//
// `www.cbrio.org` é o endereço que a igreja divulga e o mesmo que os outros dois
// pontos deste arquivo já usavam. Mudou o domínio? Muda AQUI, num lugar só, e
// todo bundle já publicado passa a compartilhar o novo — sem OTA.
const BASE_PADRAO = 'https://www.cbrio.org';

/** A base pública. Ponto único de mudança (ver o porquê de não ler env acima). */
function basePublica() {
  return BASE_PADRAO;
}

// ⚠️ Quais portas o MEMBRO pode convidar alguém para — e o que ficou de fora,
// com o motivo. Lista explícita porque nem toda porta do catálogo é convite de
// membro pra membro, e deixar o app escolher seria o app decidindo régua.
//
//   eventos       FORA · não é porta fixa; o link é por evento e já vem em
//                 `GET /app/eventos` (campo `url`).
//   grupos_lider  FORA · é recrutamento de LÍDER, decisão de liderança. Não
//                 está na tela de Inscrições do app e não é convite de membro.
//
// A ORDEM é a da tela do app, pra a resposta não precisar ser reordenada lá.
const CHAVES_COMPARTILHAVEIS = Object.freeze([
  'batismo', 'grupos', 'next', 'voluntariado', 'apresentacao',
]);

/** Rótulo curto do convite, por porta. O texto final é montado no app. */
const CONVITE = Object.freeze({
  batismo: 'Batismo',
  grupos: 'Grupos de conexão',
  next: 'NEXT',
  voluntariado: 'Quero servir',
  apresentacao: 'Apresentação de crianças',
});

/**
 * Rota do catálogo → link absoluto, ou `null` quando ela não serve de convite.
 *
 * ⚠️⚠️ É AQUI que a rota PARAMETRIZADA é barrada. `/evento/:slug` é rota de
 * template, não endereço: virar link mandaria `www.cbrio.org/evento/:slug`
 * literal pro WhatsApp de alguém, que abre uma página de erro. Quem quiser
 * compartilhar evento usa `linkDoEvento(slug)`.
 *
 * ⚠️ Rota vazia ou relativa também devolve `null` — a tela ESCONDE o botão. Um
 * "compartilhar" que manda link pela metade é pior que botão ausente, porque o
 * estrago acontece no aparelho de quem recebeu.
 */
function linkDaRota(rota, base = basePublica()) {
  const r = String(rota || '').trim();
  if (!r || !r.startsWith('/')) return null;
  if (r.includes(':') || r.includes('*')) return null;   // rota de template
  return `${base}${r}`;
}

/**
 * Portas compartilháveis, com o link público pronto.
 * @returns {Array<{chave, nome, url}>}
 */
function portasCompartilhaveis() {
  const base = basePublica();
  const porChave = new Map(PORTAS_INSCRICAO.map((p) => [p.chave, p]));
  return CHAVES_COMPARTILHAVEIS
    .map((chave) => {
      const porta = porChave.get(chave);
      const url = linkDaRota(porta?.rotasPublicas?.[0], base);
      if (!url) return null;
      return { chave, nome: CONVITE[chave] || porta.nome, url };
    })
    .filter(Boolean);
}

/** Link público de um EVENTO da espinha (o `url` do catálogo do app). */
function linkDoEvento(slug) {
  const s = String(slug || '').trim();
  if (!s) return null;
  return `${basePublica()}/evento/${encodeURIComponent(s)}`;
}

module.exports = {
  basePublica,
  linkDaRota,
  portasCompartilhaveis,
  linkDoEvento,
  CHAVES_COMPARTILHAVEIS,
  BASE_PADRAO,
};
