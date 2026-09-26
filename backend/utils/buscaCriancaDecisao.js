// ============================================================================
//  Busca de criança na tela de Decisões do Kids · régua PURA (sem banco)
//
//  ⚠️⚠️ POR QUE ELA EXISTE (21/09/2026). Pedido do Matheus: um campo pra
//  "pesquisar e saber se uma criança já aceitou a Jesus". Essa tela passa a
//  AFIRMAR algo sobre uma criança — e a lei da casa é dura justamente aqui:
//  **ausência de marcador NÃO é prova de que não aconteceu**.
//
//  ⇒ São TRÊS estados, e colapsá-los é o bug:
//    `com_decisao`  → há decisão registrada (com data e culto)
//    `sem_decisao`  → a criança EXISTE e não tem registro
//    (não achou)    → não existe criança com esse nome na base
//  "Não achei" e "achei e não tem" levam a ações opostas: a primeira é procurar
//  outra grafia; a segunda é registrar a decisão. Uma lista vazia respondendo às
//  duas é a tela muda de novo.
//
//  ⚠️⚠️ E POR QUE NÃO USAR `vw_kids_decisoes_resumo_crianca`: ela filtra
//  `k.ativo = true`. Criança que saiu do ministério mas ACEITOU ficaria
//  invisível — o falso negativo que mais importa numa tela cuja pergunta é
//  "essa criança já aceitou?". A busca vê inativa também, e DECLARA que é.
// ============================================================================

/** Stopwords de nome BR — não servem pra achar ninguém. */
const LIGACOES = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

/**
 * Termo digitado → tokens comparáveis com `kids_criancas.nome_norm`.
 *
 * ⚠️ `nome_norm` é coluna GERADA `lower(f_unaccent(nome))` — SEM trim e SEM
 * colapsar espaço interno. Por isso a comparação é por TOKEN: assim espaço
 * duplo e sobra nas pontas deixam de importar, dos dois lados.
 *
 * ⚠️ Acento é removido nos DOIS lados ou a busca perde gente: foi assim que
 * "monica" não achava "Mônica" no seletor de supervisor (25/08).
 */
function tokensDaBusca(termo) {
  return String(termo == null ? '' : termo)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2 && !LIGACOES.has(t));
}

/** A data que vale para a decisão — espelha as views do módulo. */
function dataDaDecisao(d) {
  // ⚠️ `decidiu_em` VENCE `registrado_em`: é o campo criado pro replay (uma
  // decisão de hoje sobre um culto antigo). Usar só o carimbo de digitação
  // dataria toda decisão importada no dia do import.
  const v = d?.decidiu_em || (typeof d?.registrado_em === 'string' ? d.registrado_em.slice(0, 10) : null);
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null;
}

/**
 * Monta o resultado da busca.
 *
 * @param {object} p
 * @param {any[]} p.criancas  — linhas de `kids_criancas` que casaram
 * @param {any[]} p.decisoes  — decisões `tipo_decisao='kids'` dessas crianças
 * @param {string} p.termo
 * @param {number} [p.teto]
 */
function montarResultado({ criancas, decisoes, termo, teto = 25 } = {}) {
  const tokens = tokensDaBusca(termo);
  const lista = Array.isArray(criancas) ? criancas : [];

  const porCrianca = new Map();
  for (const d of Array.isArray(decisoes) ? decisoes : []) {
    const k = d?.kids_crianca_id;
    if (!k) continue;
    if (!porCrianca.has(k)) porCrianca.set(k, []);
    porCrianca.get(k).push(d);
  }

  const itens = lista.map((c) => {
    const ds = (porCrianca.get(c.id) || [])
      .map((d) => ({
        data: dataDaDecisao(d),
        culto: d?.culto_nome || null,
        responsavel: d?.responsavel_nome || null,
      }))
      .sort((a, b) => String(a.data || '').localeCompare(String(b.data || '')));

    const nomeNorm = String(c.nome_norm || '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const tk = nomeNorm.split(/\s+/).filter(Boolean);

    return {
      crianca_id: c.id,
      nome: c.nome,
      data_nascimento: c.data_nascimento || null,
      // ⚠️ DECLARADO, não escondido: inativa e visitante mudam como a equipe lê
      // o resultado, e sumir com elas produziria o falso negativo.
      ativa: c.ativo !== false,
      visitante: c.visitante === true,
      // ⚠️ `data_conversao` é o campo da FICHA; a decisão registrada é a lista.
      // Os dois podem divergir (ficha preenchida à mão, import antigo) e a tela
      // mostra os dois em vez de escolher um.
      data_conversao_ficha: c.data_conversao || null,
      estado: ds.length ? 'com_decisao' : 'sem_decisao',
      total_decisoes: ds.length,
      primeira: ds[0]?.data || null,
      ultima: ds.length ? ds[ds.length - 1].data : null,
      decisoes: ds,
      _tokens_comuns: tokens.filter((t) => tk.some((x) => x === t)).length,
    };
  });

  itens.sort((a, b) =>
    b._tokens_comuns - a._tokens_comuns ||
    (b.ativa ? 1 : 0) - (a.ativa ? 1 : 0) ||
    String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));

  const truncado = itens.length > teto;
  return {
    termo: String(termo || '').trim(),
    tokens,
    itens: itens.slice(0, teto).map(({ _tokens_comuns, ...r }) => r),
    total: itens.length,
    // ⚠️ Truncar em silêncio é a doença do seletor de supervisor (teto de 8 sem
    // avisar): a tela tem de poder dizer "refine a busca".
    truncado,
  };
}

module.exports = { LIGACOES, tokensDaBusca, dataDaDecisao, montarResultado };
