// O que de uma pergunta do censo VIRA GRÁFICO — e o que não vira, mas precisa
// ser DECLARADO.
//
// ⚠️⚠️ Esta régua existe por causa de um vazamento real, medido em 13/09/2026.
// O endpoint /censo/perfil (nível 1) puxava `vw_cen_item_agregado` com
// `.limit(5000)`; o PostgREST capa em 1000 SERVER-SIDE, e a pesquisa viva tinha
// 4.752 linhas. Chegavam 1.000, cobrindo 12 de 40 perguntas — as outras 28
// sumiam da tela sem erro nenhum.
//
// ⚠️⚠️ E o truncamento estava ESCONDENDO UM VAZAMENTO POR ACIDENTE. O Postgres
// devolvia ordenado por `pergunta_id`, e o corte caía no "e": `nascimento`
// (tipo `data`, 774 valores distintos) ficava de fora. `data` não estava em
// nenhuma das listas de exclusão do handler, então consertar SÓ o cap entregaria
// 774 datas de nascimento nominais como 774 barras para qualquer conta com
// censo nível 1. O conserto do bug abriria o vazamento.
//
// Por isso a decisão é por TIPO e é WHITELIST, nunca blacklist: tipo novo no
// construtor nasce FORA do gráfico e alguém decide conscientemente se entra.
// Blacklist erraria para o lado de publicar.

// Vira barra. Cardinalidade limitada pelas OPÇÕES, não pelo número de
// respondentes — é isto que faz o volume não crescer com a pesquisa.
const TIPOS_GRAFICO = Object.freeze([
  'opcao_unica', 'multipla', 'sim_nao', 'escala_5', 'estrelas_5', 'nps', 'numero',
]);

// Lista longa com busca (igrejas, grupos). Vira barra, mas o valor é digitado
// pela pessoa, então a cauda é longa e precisa de teto.
const TIPOS_LISTA_LONGA = Object.freeze(['busca']);

// Texto livre: o volume aparece, o conteúdo é da Leitura da IA.
const TIPOS_TEXTO = Object.freeze(['texto_longo']);

// ⚠️ IDENTIFICAÇÃO — nome, CPF, telefone, e-mail, nascimento, CEP.
// Não são opinião, são cadastro: cada resposta é um valor único, então "gráfico"
// seria a lista nominal. Ficam DECLARADAS na tela (a pessoa vê que a pergunta
// existe e por que não tem barra) e o VALOR nunca sai do banco.
const TIPOS_IDENTIFICACAO = Object.freeze(['texto_curto', 'data']);

const TIPOS_NUMERICOS = Object.freeze(['numero', 'escala_5', 'estrelas_5', 'nps']);

// Teto de barras por pergunta. `igreja_anterior_nome` sozinha tem 177 valores
// distintos — sem teto, a tela fica ilegível justamente nas perguntas que o
// conserto acabou de revelar. O resto vira UMA linha "outros", com o número.
const TETO_VALORES = 20;

function classificar(tipo) {
  if (tipo === 'secao') return 'secao';
  if (TIPOS_IDENTIFICACAO.includes(tipo)) return 'identificacao';
  if (TIPOS_TEXTO.includes(tipo)) return 'texto';
  if (TIPOS_LISTA_LONGA.includes(tipo)) return 'lista_longa';
  if (TIPOS_GRAFICO.includes(tipo)) return 'grafico';
  // ⚠️ Tipo desconhecido NÃO vira gráfico. Whitelist: tipo novo no construtor
  // aparece declarado e alguém decide.
  return 'desconhecido';
}

// Os tipos que o endpoint pede ao banco. É o filtro que resolve o cap: das
// 4.752 linhas da pesquisa viva, estes tipos somam ~282 — folga de 3,5× contra
// o cap de 1000, e o número NÃO cresce com respondentes novos.
const TIPOS_PARA_BUSCAR = Object.freeze([...TIPOS_GRAFICO, ...TIPOS_LISTA_LONGA]);

// Aplica o teto e devolve o que sobrou declarado, nunca descartado em silêncio.
function aplicarTeto(valores, teto) {
  const t = Number.isFinite(teto) && teto > 0 ? teto : TETO_VALORES;
  if (!Array.isArray(valores) || valores.length <= t) {
    return { valores: valores || [], ocultos: 0, ocultosTotal: 0 };
  }
  // ⚠️ As NEUTRAS nunca são cortadas: "Prefiro não dizer" é o dado que explica
  // a base, e escondê-lo faria o percentual parecer errado sem explicação.
  const neutras = valores.filter((v) => v.neutra);
  const resto = valores.filter((v) => !v.neutra);
  const vis = resto.slice(0, t);
  const fora = resto.slice(t);
  const ocultosTotal = fora.reduce((s, v) => s + (Number(v.total) || 0), 0);
  return { valores: [...vis, ...neutras], ocultos: fora.length, ocultosTotal };
}

/**
 * Corta um CORTE DEMOGRÁFICO no teto, DECLARANDO o que ficou de fora.
 *
 * ⚠️⚠️ Existe por um defeito medido em 16/09/2026 (achado pelo Marcos): o corte
 * de `bairro` cortava em 12 com um `slice()` cru, e isso escondia **205 pessoas
 * em 108 bairros** de 973 respondentes — 21% — sem uma palavra na tela. Quem
 * somasse as barras concluiria que faltava gente, e estaria certo. É a lei
 * "número na tela nunca pode ser efeito colateral de paginação".
 *
 * ⚠️ `(não informado)` NUNCA é cortado — é o análogo da NEUTRA do `aplicarTeto`:
 * ele explica a base, e escondê-lo faz a tela afirmar que todo mundo respondeu.
 * Hoje são 7 pessoas e ele cai na cauda; sem esta guarda, some.
 *
 * @param {Record<string, number>} contagem  valor -> total
 * @param {number} teto  quantos valores desenhar (fora o "não informado")
 * @returns {{valores: {valor: string, total: number}[], ocultos: number, ocultos_pessoas: number}}
 */
const SEM_DADO_DEMOGRAFIA = '(não informado)';
function cortarDemografia(contagem, teto) {
  const t = Number.isFinite(teto) && teto > 0 ? teto : TETO_VALORES;
  const todos = Object.entries(contagem || {})
    .map(([valor, total]) => ({ valor, total: Number(total) || 0 }))
    .sort((a, b) => b.total - a.total);
  if (todos.length <= t) return { valores: todos, ocultos: 0, ocultos_pessoas: 0 };
  const semDado = todos.filter((v) => v.valor === SEM_DADO_DEMOGRAFIA);
  const resto = todos.filter((v) => v.valor !== SEM_DADO_DEMOGRAFIA);
  const vis = resto.slice(0, t);
  const fora = resto.slice(t);
  return {
    valores: [...vis, ...semDado],
    ocultos: fora.length,
    ocultos_pessoas: fora.reduce((s, v) => s + v.total, 0),
  };
}

module.exports = {
  SEM_DADO_DEMOGRAFIA,
  cortarDemografia,
  TIPOS_GRAFICO,
  TIPOS_LISTA_LONGA,
  TIPOS_TEXTO,
  TIPOS_IDENTIFICACAO,
  TIPOS_NUMERICOS,
  TIPOS_PARA_BUSCAR,
  TETO_VALORES,
  classificar,
  aplicarTeto,
};
