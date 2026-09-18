// ════════════════════════════════════════════════════════════════════════════
//  "Quais opções esta pessoa marcou?" — régua PURA do filtro por área
//
//  Pedido do Matheus (01/09/2026): *"no evento que tivemos do celebra, desse
//  para filtrar nos check-ins pelas áreas. Para saber quantas pessoas por
//  exemplo vieram que era da produção."*
//
//  ⚠️⚠️ SEPARADOR NÃO SERVE, e o Celebra prova. A resposta de múltipla escolha
//  é gravada como TEXTO com vírgula — mas uma das 19 opções do formulário É:
//      "Ainda não sirvo, mas tenho interesse em conhecer o voluntariado."
//  Dividir por vírgula parte essa opção em duas e produz áreas que não existem
//  ("Ainda não sirvo" · "mas tenho interesse em conhecer o voluntariado."), que
//  foi exatamente o que a primeira medição devolveu.
//
//  ⚠️⚠️ E há dado sujo REAL: uma inscrição do Celebra tem a MESMA opção
//  repetida OITO vezes e cortada no limite do campo ("…mas tenho i"). Sem
//  dedup, aquela linha sozinha somaria 8 na contagem da área.
//
//  ⇒ Quem manda é o CATÁLOGO (`insc_eventos.campos[].opcoes`): procuramos as
//  opções DENTRO do texto, das mais longas para as mais curtas, removendo o que
//  casa. Assim a vírgula interna, o espaço duplo e a repetição deixam de
//  importar.
// ════════════════════════════════════════════════════════════════════════════

/** Sem acento, minúsculo, espaços colapsados — "Check-in  - Voluntariado" tem
 *  DOIS espaços no catálogo do Celebra. */
function normalizar(t) {
  return String(t == null ? '' : t)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Campos que dá pra agrupar: os que têm LISTA DE OPÇÕES.
 *
 * ⚠️ Texto livre NUNCA entra — não agrupa (cada resposta é única) e é o campo
 * onde PII costuma aparecer. Um "filtro por resposta" sobre texto livre seria
 * uma lista de nomes e telefones na tela de check-in.
 */
function camposAgrupaveis(campos) {
  if (!Array.isArray(campos)) return [];
  return campos.filter((c) => c && c.key && Array.isArray(c.opcoes) && c.opcoes.length >= 2);
}

/**
 * As opções marcadas numa resposta.
 *
 * ⚠️ Ordem por TAMANHO decrescente: se um dia existirem "Integração" e
 * "Recepção - Integração", casar a curta primeiro marcaria a errada dentro da
 * longa. Removendo o trecho que casou, cada pedaço do texto é consumido UMA vez.
 *
 * ⚠️ Devolve na ordem do CATÁLOGO (não na ordem em que apareceram): é o que faz
 * a tela listar as áreas sempre igual, independente do que a pessoa marcou
 * primeiro.
 */
function opcoesMarcadas(valor, opcoes) {
  const texto = normalizar(valor);
  if (!texto || !Array.isArray(opcoes)) return [];

  const porTamanho = opcoes
    .filter((o) => typeof o === 'string' && o.trim())
    .map((o) => ({ original: o, norm: normalizar(o) }))
    .filter((o) => o.norm)
    .sort((a, b) => b.norm.length - a.norm.length);

  let resto = texto;
  const achadas = new Set();
  for (const o of porTamanho) {
    if (!resto.includes(o.norm)) continue;
    achadas.add(o.original);
    // ⚠️ `split(...).join(' ')` remove TODAS as repetições de uma vez — é o que
    // neutraliza a linha com a mesma opção 8 vezes.
    resto = resto.split(o.norm).join(' ');
  }

  return opcoes.filter((o) => achadas.has(o));
}

/**
 * O retrato por opção: quantos se inscreveram e quantos VIERAM.
 *
 * ⚠️⚠️ Uma pessoa pode marcar VÁRIAS áreas (o campo é múltipla escolha), então
 * **a soma das áreas é MAIOR que o total de pessoas**. Isso não é erro de
 * conta — é a natureza do dado, e a tela precisa dizer, senão alguém soma as
 * colunas e conclui que o número está errado (a mesma lição de
 * "participações × pessoas" dos Grupos).
 *
 * ⚠️ `sem_resposta` é contado à parte, nunca somado a uma área: inscrição sem
 * ministério declarado não é "de nenhuma área", é desconhecida.
 */
function resumoPorOpcao(linhas, opcoes) {
  const idx = new Map((opcoes || []).map((o) => [o, { opcao: o, inscritos: 0, presentes: 0 }]));
  let semResposta = 0;
  let naoReconhecido = 0;
  let pessoas = 0;
  let presentesTotal = 0;

  for (const l of linhas || []) {
    if (!l) continue;
    pessoas += 1;
    if (l.presente) presentesTotal += 1;
    const marcadas = opcoesMarcadas(l.valor, opcoes);
    if (!marcadas.length) {
      if (normalizar(l.valor)) naoReconhecido += 1;
      else semResposta += 1;
      continue;
    }
    for (const m of marcadas) {
      const alvo = idx.get(m);
      if (!alvo) continue;
      alvo.inscritos += 1;
      if (l.presente) alvo.presentes += 1;
    }
  }

  return {
    // Só as opções que alguém marcou — 19 linhas em que 6 são zero viram ruído.
    porOpcao: [...idx.values()].filter((o) => o.inscritos > 0)
      .sort((a, b) => b.presentes - a.presentes || b.inscritos - a.inscritos),
    sem_resposta: semResposta,
    nao_reconhecido: naoReconhecido,
    pessoas,
    presentes: presentesTotal,
  };
}

module.exports = { normalizar, camposAgrupaveis, opcoesMarcadas, resumoPorOpcao };
