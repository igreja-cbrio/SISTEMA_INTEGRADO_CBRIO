// ============================================================================
// OCUPAÇÃO DA EQUIPE DE MARKETING · régua PURA (dias úteis e carga por dia)
// ============================================================================
// Pedido do Marcos (14/08/2026): *"temos que melhorar a aba de planner, pois hoje
// quando Pedro coloca uma tarefa para alguém, não ocupa o trabalho da pessoa no
// planner; vale a pena quando sair da triagem, Pedro já colocar nos campos quanto
// tempo deve ocupar na semana de cada um"*.
//
// ⚠️⚠️ POR QUE ATRIBUIR NÃO OCUPAVA — e não era bug de conta, era CÍRCULO:
// o Planner só desenha card que tem `data_inicio` E `data_fim`; o único lugar que
// gravava essas datas era **arrastar a barra no próprio Planner** — onde o card
// não aparece justamente porque não tem datas. O CardDrawer não tem campo de
// data, e na triagem os dois campos eram OPCIONAIS.
// **Medido em 14/08: `data_inicio`/`data_fim` preenchidos em 0 (ZERO) dos 83
// cards vivos — o Planner nunca teve uma barra.**
//
// A saída é informar a ocupação em DIAS ÚTEIS na triagem (decisão do Marcos) e
// derivar o fim daqui. Unidade escolhida por já ser a do modelo vigente
// (`marketing_membros.slots_dia`), sem criar uma 2ª régua de capacidade.
// ============================================================================

// Ocupações que a triagem oferece, em DIAS ÚTEIS.
// ⚠️ Inteiros porque a coluna que guarda isso é `marketing_kanban_cards.
// duracao_dias`, que é **integer** (`20260530140000`) — assim esta leva não
// precisa de migration. As funções abaixo já sabem lidar com meio dia (0.5) se
// um dia houver coluna numérica; a UI simplesmente não oferece.
const OCUPACOES_DIAS = [1, 2, 3, 5];

const RE_DIA = /^\d{4}-\d{2}-\d{2}$/;

// 'YYYY-MM-DD' → nº de dias desde a época. `null` se não for dia válido.
// ⚠️ Toda conta é em STRING e em UTC: `new Date('2026-08-17').getDay()` cai no
// fuso local e erra o dia da semana no Rio — a mesma armadilha do calendário.
function paraDia(s) {
  if (typeof s !== 'string' || !RE_DIA.test(s)) return null;
  const t = Date.parse(`${s}T00:00:00Z`);
  if (Number.isNaN(t)) return null;
  // ⚠️ `Date.parse` ACEITA data inexistente rolando o mês ('2026-02-31' → 03/03).
  // Sem esta conferência, um dia inválido viraria outro dia silenciosamente.
  const d = new Date(t);
  if (d.toISOString().slice(0, 10) !== s) return null;
  return Math.floor(t / 86400000);
}

function paraStr(dia) {
  return new Date(dia * 86400000).toISOString().slice(0, 10);
}

// 0=dom … 6=sáb. (1970-01-01 foi quinta → +4)
function diaDaSemana(dia) {
  return ((dia + 4) % 7 + 7) % 7;
}

function ehDiaUtil(diaOuStr) {
  const d = typeof diaOuStr === 'string' ? paraDia(diaOuStr) : diaOuStr;
  if (d === null) return false;
  const dow = diaDaSemana(d);
  return dow !== 0 && dow !== 6;
}

// Próximo dia útil a partir de (inclusive) `diaStr`. Usado como início sugerido.
function proximoDiaUtil(diaStr) {
  let d = paraDia(diaStr);
  if (d === null) return null;
  // Teto de 7 pra nunca girar sem fim se a régua de fim de semana mudar.
  for (let i = 0; i < 7 && !ehDiaUtil(d); i++) d += 1;
  return paraStr(d);
}

// Data de FIM a partir do início + quantos dias úteis a tarefa ocupa.
//
// ⚠️ O dia de início CONTA como o 1º dia útil ocupado: "começa segunda e ocupa
// 2 dias" termina na TERÇA, não na quarta. Somar `ocupa` ao início daria sempre
// um dia a mais de carga por tarefa — e com 83 tarefas isso é uma semana
// inteira de capacidade fantasma.
// ⚠️ Fim de semana é PULADO (não conta como ocupação nem termina nele).
// ⚠️ `ocupa` menor que 1 (meio dia) ocupa 1 dia no calendário: o dia existe.
function calcularDataFim(inicioStr, ocupaDias) {
  const ini = paraDia(inicioStr);
  if (ini === null) return null;
  const n = Number(ocupaDias);
  if (!Number.isFinite(n) || n <= 0) return null;

  const precisa = Math.max(1, Math.ceil(n));
  let d = ini;
  // Se começar num fim de semana, anda até o 1º dia útil.
  for (let i = 0; i < 7 && !ehDiaUtil(d); i++) d += 1;

  let contados = 1;                 // o próprio dia de início já conta
  let guarda = 0;
  while (contados < precisa && guarda < 400) {
    d += 1;
    guarda++;
    if (ehDiaUtil(d)) contados++;
  }
  return paraStr(d);
}

// Quantos DIAS ÚTEIS existem no intervalo [inicioStr, fimStr] (inclusive).
function diasUteisNoIntervalo(inicioStr, fimStr) {
  const a = paraDia(inicioStr);
  const b = paraDia(fimStr);
  if (a === null || b === null || b < a) return 0;
  let n = 0;
  for (let d = a; d <= b; d++) if (ehDiaUtil(d)) n++;
  return n;
}

// Carga que UMA tarefa põe em UM dia útil, em slots.
//
// ⚠️ Régua vigente do módulo (não inventar outra): tarefa em PARALELO consome 1
// slot; tarefa em FOCO enche o dia (consome todos os slots da pessoa).
// ⚠️ Meio dia (`ocupa < 1`) em paralelo consome meio slot — é o que permite ao
// Pedro encaixar duas coisas curtas no mesmo dia sem a barra dizer "cheio".
function cargaNoDia({ pode_paralelo = true, slots_dia = 3, ocupa_dias = 1 } = {}) {
  const slots = Number.isFinite(Number(slots_dia)) && Number(slots_dia) > 0 ? Number(slots_dia) : 3;
  if (!pode_paralelo) return slots;
  const n = Number(ocupa_dias);
  if (Number.isFinite(n) && n > 0 && n < 1) return n;   // meio dia
  return 1;
}

// Ocupação por dia de uma pessoa, a partir das tarefas dela.
//
// Entrada: tarefas com { data_inicio, data_fim, pode_paralelo, ocupa_dias }.
// Saída:   { '2026-08-17': { slots, cheio, excedido, tarefas: [...] }, ... }
//
// ⚠️ Só dias ÚTEIS entram: sábado e domingo não são capacidade da equipe.
// ⚠️ `cheio` (bateu no teto) é DIFERENTE de `excedido` (passou do teto). A tela
// precisa dos dois: bater no teto é planejamento normal; passar é sobrecarga que
// alguém tem que resolver.
function ocupacaoPorDia({ tarefas = [], slots_dia = 3, de = null, ate = null } = {}) {
  const slots = Number.isFinite(Number(slots_dia)) && Number(slots_dia) > 0 ? Number(slots_dia) : 3;
  const lo = de ? paraDia(de) : null;
  const hi = ate ? paraDia(ate) : null;
  const mapa = {};

  for (const t of Array.isArray(tarefas) ? tarefas : []) {
    const a = paraDia(t?.data_inicio);
    const b = paraDia(t?.data_fim);
    // Tarefa sem plano (era o caso de 83 de 83) é ignorada.
    // ⚠️ Guarda DEFENSIVA e declaradamente NÃO coberta por teste: o mutante que
    // a remove sobrevive, porque o laço abaixo também não produz nada com data
    // nula (`d++` vira NaN e ele sai). Fica porque expressa a intenção e protege
    // se o laço mudar — mas não afirmo cobertura que não existe.
    if (a === null || b === null || b < a) continue;
    const carga = cargaNoDia({
      pode_paralelo: t.pode_paralelo !== false,
      slots_dia: slots,
      ocupa_dias: t.ocupa_dias,
    });
    for (let d = a; d <= b; d++) {
      if (!ehDiaUtil(d)) continue;
      if (lo !== null && d < lo) continue;
      if (hi !== null && d > hi) continue;
      const k = paraStr(d);
      if (!mapa[k]) mapa[k] = { slots: 0, cheio: false, excedido: false, tarefas: [] };
      mapa[k].slots += carga;
      mapa[k].tarefas.push(t.titulo || t.id || '—');
    }
  }
  for (const k of Object.keys(mapa)) {
    mapa[k].slots = Math.round(mapa[k].slots * 100) / 100;   // evita 0.30000000000004
    mapa[k].cheio = mapa[k].slots >= slots;
    mapa[k].excedido = mapa[k].slots > slots;
  }
  return mapa;
}

module.exports = {
  OCUPACOES_DIAS,
  ehDiaUtil,
  proximoDiaUtil,
  calcularDataFim,
  diasUteisNoIntervalo,
  cargaNoDia,
  ocupacaoPorDia,
};
