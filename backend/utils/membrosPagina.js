// ════════════════════════════════════════════════════════════════════════════
//  Régua da lista PAGINADA de membros (o app do staff usa)
//
//  Vive fora da rota de propósito. `backend/routes/membresia.js` tem 3.000+
//  linhas e requer `multer`, que só é instalado no Vercel — carregar aquele
//  arquivo num teste é impossível nesta máquina, e é por isso que nenhum teste
//  cobria nada dele. Régua pura aqui = régua testada.
//
//  Também é a razão de a decisão não morar em linha solta dentro do handler:
//  teto de página, ordem e faixa etária são exatamente o tipo de coisa que
//  quebra em silêncio (rolagem infinita que nunca acaba, Z→A que devolve A→Z).
// ════════════════════════════════════════════════════════════════════════════

/** Teto de itens por página. Sem ele, `limite=5000` traz a base inteira de
 *  novo — que é o problema que a paginação existe para resolver. */
const LIMITE_MAX = 100;
const LIMITE_PADRAO = 30;

/** Colunas que a LISTA desenha. `select('*')` aqui seria carregar a ficha
 *  inteira de 30 pessoas para mostrar nome, foto e telefone. */
const COLUNAS_LISTA = 'id, nome, telefone, email, status, foto_url, data_nascimento, bairro, cpf';

/**
 * Janelas de nascimento por faixa. Mesma régua do `GET /membros` — duas contas
 * de idade em duas telas seria pior que repetir.
 * @param {Date} hoje injetável: teste que lê o relógio da máquina apodrece.
 */
function janelaDaFaixa(faixa, hoje = new Date()) {
  const f = (anos) => {
    const a = hoje.getFullYear() - anos;
    const m = String(hoje.getMonth() + 1).padStart(2, '0');
    const d = String(hoje.getDate()).padStart(2, '0');
    return `${a}-${m}-${d}`;
  };
  if (faixa === 'crianca') return { gt: f(13) };
  if (faixa === 'adolescente') return { gt: f(18), lte: f(13) };
  if (faixa === 'jovem') return { gt: f(31), lte: f(18) };
  if (faixa === 'adulto') return { lte: f(31) };
  return null;
}

/**
 * Traduz a query da tela num plano de consulta.
 *
 * @returns {{ limite, offset, ascending, range: [number, number],
 *            status: string|null, semCpf: boolean, faixa: object|null,
 *            tokens: string[] }}
 */
function planoDaPagina(query = {}, hoje = new Date()) {
  // ⚠️ "não é número" e "número fora da faixa" são coisas DIFERENTES.
  // `parseInt(x) || PADRAO` trata `0` como ausente e devolve 30 — o que faz
  // `limite=0` significar silenciosamente "trinta". Aqui: lixo cai no padrão,
  // número válido é APERTADO na faixa.
  const limiteBruto = parseInt(query.limite, 10);
  const limite = Number.isFinite(limiteBruto)
    ? Math.min(Math.max(limiteBruto, 1), LIMITE_MAX)
    : LIMITE_PADRAO;

  const offsetBruto = parseInt(query.offset, 10);
  const offset = Number.isFinite(offsetBruto) ? Math.max(offsetBruto, 0) : 0;

  // A→Z é o padrão porque é como a pessoa procura um nome numa lista.
  const ascending = String(query.ordem || '') !== 'nome_desc';

  // Busca por tokens: "matheus toscano" acha "Matheus Ribeiro Toscano", em
  // qualquer ordem. Teto de 6 palavras — cada uma é um ILIKE no banco.
  const tokens = String(query.busca || '').trim().split(/\s+/).filter(Boolean).slice(0, 6);

  return {
    limite,
    offset,
    ascending,
    range: [offset, offset + limite - 1],
    status: query.status ? String(query.status) : null,
    semCpf: query.sem_cpf === '1' || query.sem_cpf === true || query.sem_cpf === 'true',
    faixa: janelaDaFaixa(query.faixa, hoje),
    tokens,
  };
}

/**
 * Monta a resposta a partir das linhas do banco.
 *
 * ⚠️ O CPF NÃO SAI DAQUI. A lista só precisa saber se ele FALTA (é o filtro de
 * qualidade de cadastro); mandar o documento de 30 pessoas para desenhar uma
 * etiqueta é expor dado sem precisar dele.
 *
 * ⚠️ `tem_mais` se calcula com o TOTAL, nunca com o tamanho da página: errar
 * aqui dá rolagem que nunca acaba (sempre verdadeiro) ou que para no meio da
 * base (sempre falso), e as duas passam por teste de tela.
 */
function montarResposta(linhas, { total, offset, limite }) {
  const itens = (linhas || []).map((m) => {
    const { cpf, ...resto } = m;
    return { ...resto, sem_cpf: !cpf };
  });
  const t = Number(total) || 0;
  return { itens, total: t, offset, limite, tem_mais: offset + itens.length < t };
}

module.exports = {
  planoDaPagina, montarResposta, janelaDaFaixa,
  LIMITE_MAX, LIMITE_PADRAO, COLUNAS_LISTA,
};
