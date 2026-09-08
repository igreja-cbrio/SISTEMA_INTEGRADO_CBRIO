// ============================================================================
// APRESENTAÇÃO DE CRIANÇAS · régua PURA do horário + dos nomes dos pais (08/09/2026)
//
// Pedido do Marcos (via Milena, no Kids): *"não aparece o horário que as crianças
// vão se apresentar. Criar uma ótica parecida com a do batismo: até 6 inscrições,
// sempre no culto de 9:30; passando de 6, culto de 11:30; com a possibilidade de
// editar dentro da área do Kids os horários."*
//
// Vive em `utils/` (sem Supabase) pra entrar no gate de deploy
// (`src/test/apresentacaoHorario.test.ts`). Quem lê o banco é
// `services/apresentacaoHorarios.js`; aqui só entra DECISÃO.
//
// ⚠️ Diferença pro batismo (`utils/batismoHorario.js`): lá a PESSOA escolhe e a
// régua valida; aqui o SISTEMA atribui e a equipe corrige na tela. Os dois
// partilham o formato do catálogo (horario/label/aberto/limite/ordem), de
// propósito — a tela de gestão é a mesma ideia.
// ============================================================================

const { rotuloHora } = require('./criancaApresentacao');

/**
 * Escolhe o horário que recebe a PRÓXIMA inscrição.
 *
 * Percorre o catálogo na `ordem` e devolve o primeiro horário ABERTO com vaga.
 * `limite` nulo = sem teto (é assim que o 11:30 recebe o transbordo do 9:30).
 *
 * ⚠️ FALHA FECHADA À MODA DA APRESENTAÇÃO: `configurados === null` (não deu pra
 * ler o catálogo) devolve `null`, e a inscrição ENTRA sem horário — é o oposto
 * do batismo (que recusa), e é de propósito: aqui o horário é atribuição
 * interna, não escolha da pessoa, e o Kids corrige na tela. Perder a inscrição
 * da família por um informativo seria pior que deixar o horário em branco
 * (é a mesma lei do `culto_id` em `routes/app.js`).
 *
 * ⚠️ `ocupacao` conta INSCRIÇÕES (= crianças), não famílias. Irmãos da mesma
 * inscrição nunca se separam: quem chama escolhe UMA vez por envio e grava o
 * mesmo horário em todos — o limite é conferido antes da família entrar, então
 * uma família de 2 pode fechar o 9:30 com 7. É o comportamento que a equipe
 * espera (ninguém apresenta um irmão às 9h30 e o outro às 11h30).
 *
 * @param {Array<{horario:string,label?:string,aberto?:boolean,limite?:number|null,ordem?:number}>|null} configurados
 * @param {Record<string, number>|Map<string, number>} [ocupacao] horario → nº de inscrições ativas na data
 * @returns {{horario:string|null, label:string|null, transbordou:boolean, lotado:boolean}}
 *   `lotado` = havia horário aberto mas TODOS estavam cheios (a equipe precisa agir).
 */
function escolherHorarioApresentacao(configurados, ocupacao = {}) {
  const vazio = { horario: null, label: null, transbordou: false, lotado: false };
  if (!Array.isArray(configurados) || !configurados.length) return vazio;

  const n = (h) => {
    const v = ocupacao && (ocupacao.get?.(h) ?? ocupacao[h]);
    return Number.isFinite(+v) ? +v : 0;
  };
  const abertos = configurados
    .filter((c) => c && c.horario && c.aberto !== false)
    .slice()
    .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || String(a.horario).localeCompare(String(b.horario)));
  if (!abertos.length) return vazio;

  for (let i = 0; i < abertos.length; i++) {
    const c = abertos[i];
    const limite = c.limite == null ? null : +c.limite;
    // ⚠️ `limite` nulo NUNCA lota (é o "sem teto"); `limite` 0 lota sempre.
    const cheio = limite !== null && n(c.horario) >= limite;
    if (!cheio) {
      return { horario: c.horario, label: c.label || rotuloHora(c.horario) || c.horario, transbordou: i > 0, lotado: false };
    }
  }
  return { ...vazio, lotado: true };
}

/**
 * Rótulo de um horário a partir do catálogo ('09:30' → 'Culto das 9h30').
 * Sem catálogo cai no `rotuloHora` ('9h30'); sem horário devolve null — o
 * texto é OMITIDO, nunca inventado (lei do B9).
 */
function rotuloHorarioApresentacao(horario, configurados = null) {
  if (!horario) return null;
  const c = (configurados || []).find((x) => x && x.horario === horario);
  return c?.label || rotuloHora(horario) || String(horario);
}

/** Nome normalizado pra comparar pessoas ("Aline  Lazaro" = "aline lazaro"). */
function nomeChave(nome) {
  return String(nome ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Pai e mãe são a MESMA pessoa? (o caso Isabella: "Aline Lazaro / Aline Lazaro")
 *
 * ⚠️ Aconteceu no formulário público: a mãe preencheu o próprio nome nos DOIS
 * campos (pai e mãe), e o nome saiu dobrado na lista do Kids e no certificado
 * ("Aline Lazaro e Aline Lazaro"). A porta agora RECUSA (400) e a tela exibe
 * uma vez só — `nomesDosPaisUnicos` é a guarda de leitura pras linhas antigas.
 */
function paisIguais(nomePai, nomeMae) {
  const a = nomeChave(nomePai);
  const b = nomeChave(nomeMae);
  return Boolean(a) && a === b;
}

/**
 * Lista de responsáveis SEM repetição, na ordem pai → mãe. Pra exibição
 * (lista do Kids · certificado). Linha antiga com o nome dobrado sai uma vez.
 * @returns {string[]}
 */
function nomesDosPaisUnicos(nomePai, nomeMae) {
  const out = [];
  const vistos = new Set();
  for (const n of [nomePai, nomeMae]) {
    const s = String(n ?? '').trim().replace(/\s+/g, ' ');
    if (!s) continue;
    const k = nomeChave(s);
    if (vistos.has(k)) continue;
    vistos.add(k);
    out.push(s);
  }
  return out;
}

module.exports = {
  escolherHorarioApresentacao,
  rotuloHorarioApresentacao,
  paisIguais,
  nomesDosPaisUnicos,
  nomeChave,
};
