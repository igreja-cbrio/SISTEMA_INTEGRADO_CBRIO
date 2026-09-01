// ════════════════════════════════════════════════════════════════════════════
//  "Quais campanhas podem receber doação AGORA, e a escolha vale?"
//
//  Pedido do Matheus (01/09/2026): *"toda vez que tivermos campanha ativa, ela
//  deve ativar e aparecer dentro de generosidade no app dos membros também. E aí
//  já fica tudo vinculado com o cadastro da pessoa."*
//
//  ⚠️⚠️ O QUE ESTAVA QUEBRADO ANTES DISTO, medido em 01/09/2026:
//    • no APP a campanha era um CAMPO DE TEXTO que a pessoa digitava
//      (`campanhaTxt`, "Nome da campanha") — nada ligava ao registro, então a
//      barrinha nunca veria a doação;
//    • no SITE a doação gravava `metadata.campanha` (o NOME, e sempre `null`),
//      mas `vw_camp_arrecadacao` casa por **`metadata->>'campanha_id'`** — ou
//      seja, nem pelo site o dinheiro alimentava a barra.
//
//  ⚠️ Régua PURA: sem banco, sem rede, `hoje` INJETADO.
// ════════════════════════════════════════════════════════════════════════════

const { estaNoAr } = require('./campanhaProgresso');

/**
 * As campanhas que podem receber doação hoje.
 *
 * ⚠️⚠️ REUSA `estaNoAr` do núcleo de campanhas em vez de reescrever a janela. Uma
 * 2ª régua de "a campanha está no ar?" divergiria da barrinha, e o sintoma seria
 * o pior possível: o app aceitando doação para uma campanha que a barra considera
 * fora do ar — dinheiro entrando num balde que ninguém soma.
 *
 * ⚠️⚠️ O GATILHO É `status = 'ativa'`, NÃO `publica`. Decisão explícita do
 * Matheus ("toda vez que tivermos campanha ATIVA"). `publica` governa outra
 * coisa: a barrinha nas telas do culto e na página que a igreja compartilha.
 * CONSEQUÊNCIA que precisa estar dita: a campanha aparece no app **antes** de
 * alguém clicar em "Publicar a barrinha".
 */
function campanhasOfertaveis(campanhas, hoje) {
  return (campanhas || []).filter((c) => c && aceitaOnline(c) && estaNoAr(c, hoje));
}

/**
 * A campanha aceita doação ONLINE?
 *
 * ⚠️⚠️ `camp_campanhas.aceita_online` já existia e ninguém lia. É a intenção
 * EXPLÍCITA de quem cadastrou a campanha — existe campanha que se arrecada só
 * por transferência com o dígito (obra grande, doador único) e oferecê-la no app
 * seria o sistema decidindo no lugar de quem configurou.
 *
 * ⚠️ Ausente/nulo conta como TRUE: é o default da coluna, e tratar ausência como
 * "não aceita" esconderia toda campanha cadastrada antes de a coluna existir —
 * exatamente o silêncio que este projeto já pagou várias vezes.
 */
function aceitaOnline(c) {
  return c?.aceita_online !== false;
}

/** Só o que o app precisa saber — nada de meta, valor ou dígito. */
function paraOApp(c) {
  return {
    id: c.id,
    nome: c.nome,
    // ⚠️ NÃO devolve `meta_centavos` nem arrecadado: a tela de doar é pra doar.
    // Publicar quanto falta ali transforma a oferta em placar, e a decisão de
    // mostrar valor é da barrinha (`mostrar_valor`), não desta tela.
    descricao_curta: typeof c.descricao_curta === 'string' && c.descricao_curta.trim()
      ? c.descricao_curta.trim().slice(0, 160)
      : null,
  };
}

const CATEGORIAS = ['dizimo', 'oferta', 'campanha'];

/**
 * A escolha da pessoa vale? Devolve `{ ok, campanha_id, motivo }`.
 *
 * ⚠️⚠️ CATEGORIA `campanha` SEM `campanha_id` É RECUSA, nunca "vira oferta".
 * Cair silenciosamente em oferta faria a pessoa doar achando que era pra reforma
 * do Kids e o dinheiro entrar no balde geral — e ninguém descobre, porque os dois
 * caminhos respondem "obrigado".
 *
 * ⚠️⚠️ `campanha_id` FORA da lista ofertável também é RECUSA. É o caso de
 * campanha encerrada/pausada entre a tela abrir e a pessoa tocar em doar, e de
 * id inventado por um cliente. Aceitar gravaria `campanha_id` que a barra não
 * casa: dinheiro cobrado, atribuição perdida.
 *
 * ⚠️ Categoria que NÃO é `campanha` zera o `campanha_id` mesmo que ele venha —
 * senão um dízimo apareceria somando na campanha.
 */
function validarEscolha({ categoria, campanha_id: campanhaId, ofertaveis } = {}) {
  const cat = CATEGORIAS.includes(categoria) ? categoria : null;
  if (!cat) return { ok: false, motivo: 'categoria_invalida' };

  if (cat !== 'campanha') {
    return { ok: true, categoria: cat, campanha_id: null };
  }

  const id = typeof campanhaId === 'string' ? campanhaId.trim() : '';
  if (!id) return { ok: false, motivo: 'campanha_nao_escolhida' };

  const achada = (ofertaveis || []).find((c) => c && String(c.id) === id);
  if (!achada) return { ok: false, motivo: 'campanha_indisponivel' };

  return { ok: true, categoria: cat, campanha_id: id, campanha_nome: achada.nome || null };
}

/**
 * O `metadata` da cobrança.
 *
 * ⚠️⚠️ A CHAVE É `campanha_id`, e é a única que a barrinha lê:
 * `vw_camp_arrecadacao` casa `pag_cobrancas.metadata->>'campanha_id' = camp.id`.
 * Gravar só `campanha` (o nome) é o que fazia a doação do site não aparecer.
 *
 * ⚠️ `campanha` (nome) CONTINUA sendo gravado ao lado, e não é redundância: é
 * SNAPSHOT do que a pessoa viu no momento de doar. Se a campanha for renomeada,
 * o extrato tem que continuar dizendo para que ela doou.
 */
function metadataDaDoacao({ categoria, campanha_id: campanhaId, campanha_nome: nome, canal, extra } = {}) {
  return {
    ...(extra && typeof extra === 'object' ? extra : {}),
    categoria,
    canal,
    campanha_id: campanhaId || null,
    campanha: nome || null,
  };
}

/** Descrição que vai pra cobrança (e pro extrato do provedor). */
function descricaoDaDoacao({ categoria, campanha_nome: nome } = {}) {
  if (categoria === 'campanha') return `Campanha: ${nome || 'CBRio'}`.slice(0, 120);
  return categoria === 'dizimo' ? 'Dízimo' : 'Oferta';
}

module.exports = {
  CATEGORIAS,
  campanhasOfertaveis,
  paraOApp,
  validarEscolha,
  metadataDaDoacao,
  descricaoDaDoacao,
};
