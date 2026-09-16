// Quem pode ser avaliado por quem, e quando um resultado pode ser REVELADO.
//
// ⚠️⚠️ ESTA É A PEÇA QUE PROTEGE GENTE. Medido na base em 16/09/2026:
//
//   46 funcionários ativos · 11 gestores
//   liderados por gestor: 1 (×3) · 2 (×1) · 4 (×2) · 5 (×3) · 6 (×1) · 9 (×1)
//   áreas: Gestão 19 · Ministerial 14 · Criativo 10 · **Financeiro 2** · sem área 1
//
// ⇒ **3 gestores têm UM liderado.** Feedback "anônimo" de subordinado ali é
// assinado por construção: o gestor sabe exatamente quem escreveu. O Financeiro
// tem 2 pessoas — "par" ali é uma pessoa falando de outra.
//
// ⚠️⚠️ A LEI: quando o piso não é atingido, **NÃO SE COLETA** — em vez de
// coletar e esconder na hora de exibir. Três motivos, e o terceiro é o que
// costuma ser esquecido:
//   1. Esconder na tela é teatro: o dado continua no banco, legível pelo
//      backend (service_role) e pelas 17 contas admin/diretor que fazem bypass
//      do gate de módulo.
//   2. A supressão CARREGA INFORMAÇÃO. "Não publicado — poucas respostas" num
//      gestor de 1 liderado diz exatamente de quem era a resposta.
//   3. Diferencing: com o agregado por critério, comparar o ciclo antes e
//      depois de alguém entrar/sair da equipe reconstrói a resposta individual.
//
// ⚠️ E o que se promete é **CONFIDENCIAL, não anônimo**: o sistema grava quem
// respondeu (é o que impede resposta dupla, permite cobrar quem falta, atender
// pedido de acesso da LGPD e remover a resposta de quem saiu). O que muda é
// QUEM VÊ. Prometer "anônimo" com 46 pessoas é falso de qualquer jeito — um
// parágrafo de texto livre é assinatura.

// Papéis de avaliador. `auto` e `gestor` são IDENTIFICADOS POR NATUREZA:
// a pessoa sabe que ela mesma se avaliou e sabe quem é o gestor dela. Aplicar
// piso neles não protegeria ninguém e só esconderia o feedback mais útil.
const PAPEIS = ['auto', 'gestor', 'par', 'liderado'];
const PAPEIS_IDENTIFICADOS = new Set(['auto', 'gestor']);

// Piso padrão de respondentes para revelar um agregado. 3 é o mínimo defensável;
// o mercado usa 4-5 (Glint 4, Culture Amp 5). Fica configurável POR CICLO para
// a igreja poder endurecer sem mexer em código — mas nunca afrouxar abaixo de 3.
const PISO_MINIMO_ABSOLUTO = 3;
const PISO_PADRAO = 3;

function ehPapelValido(papel) {
  return PAPEIS.includes(papel);
}

// ⚠️ Piso NUNCA desce abaixo de PISO_MINIMO_ABSOLUTO, venha de onde vier.
// Configuração de ciclo é dado editável na tela; se alguém digitar 1 para
// "conseguir ver o resultado do fulano", a régua recusa.
function normalizarPiso(piso) {
  const n = Number(piso);
  if (!Number.isInteger(n)) return PISO_PADRAO;
  return Math.max(n, PISO_MINIMO_ABSOLUTO);
}

/**
 * ANTES de convidar: este papel pode ser coletado para este avaliado?
 *
 * `elegiveis` é quantas pessoas PODERIAM responder naquele papel (liderados do
 * gestor, pares da área...). Se não há gente suficiente para o agregado ser
 * confidencial, o convite não é gerado — e o motivo é declarado, nunca silencioso.
 *
 * Devolve { coletar, motivo, piso }.
 */
function podeColetarPapel({ papel, elegiveis, piso } = {}) {
  if (!ehPapelValido(papel)) {
    return { coletar: false, motivo: 'papel_invalido', piso: null };
  }
  const p = normalizarPiso(piso);
  const n = Number(elegiveis);
  if (!Number.isInteger(n) || n < 0) {
    // Não saber quantos são não é "pode" — é fail-closed.
    return { coletar: false, motivo: 'elegiveis_desconhecido', piso: p };
  }
  if (n === 0) {
    return { coletar: false, motivo: 'sem_elegiveis', piso: p };
  }
  // auto/gestor não passam pelo piso: são identificados por natureza.
  if (PAPEIS_IDENTIFICADOS.has(papel)) {
    return { coletar: true, motivo: 'identificado_por_natureza', piso: p };
  }
  if (n < p) {
    return { coletar: false, motivo: 'abaixo_do_piso', piso: p };
  }
  return { coletar: true, motivo: 'ok', piso: p };
}

/**
 * DEPOIS de coletar: este agregado pode ser exibido?
 *
 * Segunda camada. A primeira (podeColetarPapel) já deveria ter impedido o
 * convite — mas gente sai da empresa, gente não responde, e o número efetivo
 * cai abaixo do piso mesmo tendo sido elegível na abertura.
 *
 * Devolve { revelar, motivo, respostas, piso }.
 */
function podeRevelar({ papel, respostas, piso } = {}) {
  if (!ehPapelValido(papel)) {
    return { revelar: false, motivo: 'papel_invalido', respostas: 0, piso: null };
  }
  const p = normalizarPiso(piso);
  const n = Number(respostas);
  if (!Number.isInteger(n) || n < 0) {
    return { revelar: false, motivo: 'respostas_desconhecido', respostas: 0, piso: p };
  }
  if (n === 0) {
    return { revelar: false, motivo: 'sem_respostas', respostas: 0, piso: p };
  }
  if (PAPEIS_IDENTIFICADOS.has(papel)) {
    return { revelar: true, motivo: 'identificado_por_natureza', respostas: n, piso: p };
  }
  if (n < p) {
    return { revelar: false, motivo: 'abaixo_do_piso', respostas: n, piso: p };
  }
  return { revelar: true, motivo: 'ok', respostas: n, piso: p };
}

/**
 * O plano de coleta de um avaliado: para cada papel, coletar ou não, e por quê.
 *
 * `elegiveisPorPapel` = { auto: 1, gestor: 1, par: 9, liderado: 1 }
 *
 * ⚠️ A saída DECLARA o que ficou de fora. Papel suprimido em silêncio faz o
 * ciclo fechar com "85% de adesão" sem ninguém saber que 15% nunca foi
 * convidado — e é a equipe pequena que some, justo a que mais precisa de
 * cuidado.
 */
function planoDeColeta({ elegiveisPorPapel, piso } = {}) {
  const p = normalizarPiso(piso);
  const fonte = elegiveisPorPapel && typeof elegiveisPorPapel === 'object' ? elegiveisPorPapel : {};
  const coletar = [];
  const suprimidos = [];
  for (const papel of PAPEIS) {
    const d = podeColetarPapel({ papel, elegiveis: fonte[papel], piso: p });
    if (d.coletar) coletar.push(papel);
    else suprimidos.push({ papel, motivo: d.motivo });
  }
  return { piso: p, coletar, suprimidos };
}

module.exports = {
  PAPEIS,
  PAPEIS_IDENTIFICADOS,
  PISO_PADRAO,
  PISO_MINIMO_ABSOLUTO,
  ehPapelValido,
  normalizarPiso,
  podeColetarPapel,
  podeRevelar,
  planoDeColeta,
};
