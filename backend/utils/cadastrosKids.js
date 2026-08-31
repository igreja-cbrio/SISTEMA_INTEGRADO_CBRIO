// ════════════════════════════════════════════════════════════════════════════
//  "Quantas crianças foram cadastradas?" — régua PURA do card do Kids
//
//  Pedido do Matheus (31/08/2026): ele perguntou quantos cadastros de crianças
//  saíram no domingo e, com o número na mão, pediu a funcionalidade dentro do
//  módulo. Medido naquele dia: **28 no domingo 30/08** (18 visitantes · 10
//  membros · 28/28 com responsável) e **14 no domingo anterior**.
//
//  ⚠️⚠️ O DIA É BRT, NUNCA UTC. `created_at` é timestamptz e o cadastro no
//  totem acontece no culto — inclusive o da NOITE, que termina depois das 21h,
//  quando o dia UTC JÁ VIROU. Agrupar em UTC jogaria as crianças cadastradas no
//  fim do culto de domingo para a segunda-feira, e o número do domingo (o único
//  que a equipe olha) sairia menor. É a mesma armadilha do dia da curva do
//  censo, do totem Kids e do "culto de agora".
// ════════════════════════════════════════════════════════════════════════════

const MS_BRT = 3 * 3600 * 1000;

/** O dia da igreja (YYYY-MM-DD) de um timestamp. */
function diaBRT(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Date(t - MS_BRT).toISOString().slice(0, 10);
}

/**
 * A linha veio de IMPORT (Planning Center), não de cadastro no culto?
 *
 * ⚠️ `planning_center_id` é o único marcador confiável. O PCO saiu do código do
 * Kids em 20/07/2026 e a coluna ficou no banco sem leitor — este é o leitor.
 * ⚠️ String vazia conta como ausência (a base tem as duas formas de "vazio").
 */
function temMarcaDeImport(linha) {
  const id = linha?.planning_center_id;
  if (id == null) return false;
  return String(id).trim() !== '';
}

/**
 * O retrato do período.
 *
 * ⚠️ **APAGADAS não somem: viram contagem própria.** Cadastro feito e desfeito
 * no mesmo domingo é o sinal de que alguém errou e corrigiu — esconder faria a
 * equipe procurar uma criança que "foi cadastrada" e não está na lista. Elas
 * ficam FORA do total (o total é o que existe hoje) e DECLARADAS ao lado.
 *
 * ⚠️ `visitante` é nullable: `null` NÃO é "membro". Cai em `sem_marcacao`, que é
 * um terceiro estado — contar como membro inflaria o número que a liderança usa
 * pra saber quanta gente NOVA a igreja recebeu.
 */
function resumirCadastros(linhas = []) {
  const vivas = [];
  let apagadas = 0;
  for (const l of linhas || []) {
    if (!l) continue;
    if (l.deleted_at) { apagadas += 1; continue; }
    vivas.push(l);
  }

  // ⚠️⚠️ IMPORTADAS FICAM FORA DO TOTAL, e este é o achado que mais importa
  // nesta régua. Medido em 31/08/2026: o dia **30/06/2026 tem 3.381 cadastros
  // num único dia** (o import do Planning Center), **3.169 deles marcados
  // `visitante = true`** — porque o import marcou assim, não porque 3 mil
  // crianças visitaram a igreja. Efeito no número que a tela publica:
  //
  //   janela      total cru   visitantes cru   visitantes REAIS
  //   7 dias         31            21               21
  //   30 dias        98            47               47
  //   90 dias     3.547         3.222               53     ← 60× inflado
  //
  // Ou seja: o chip "90 dias" respondia "você teve 3.222 visitantes" quando a
  // resposta é 53. "Quantos visitantes eu tive" é sobre gente que APARECEU, e
  // linha de planilha importada não apareceu em culto nenhum.
  //
  // ⚠️ O marcador é `planning_center_id`, NÃO volume nem `created_by` nulo:
  // 3.380 dos 3.381 daquele dia têm o id do PCO, e `created_by` nulo acontece
  // todo dia (é a porta pública e o app, 1-2 por dia). Heurística de volume
  // quebraria no primeiro domingo grande de verdade.
  //
  // ⚠️ Elas são CONTADAS e DECLARADAS, nunca descartadas em silêncio: some do
  // total e apareça em `importadas`. Quem procurar uma criança do import na
  // lista precisa entender por que ela não está no número.
  const importadas = vivas.filter((l) => temMarcaDeImport(l));
  const doCulto = vivas.filter((l) => !temMarcaDeImport(l));

  return {
    total: doCulto.length,
    visitantes: doCulto.filter((l) => l.visitante === true).length,
    membros: doCulto.filter((l) => l.visitante === false).length,
    sem_marcacao: doCulto.filter((l) => l.visitante == null).length,
    // Quantas linhas do período vieram de import (e não de cadastro no culto).
    importadas: importadas.length,
    // ⚠️ Guardado à parte pra a tela poder dizer "e mais N do import, que não
    // contam aqui" — sem o número, a diferença entre o que a pessoa vê na
    // lista de crianças e o que vê neste card fica inexplicável.
    importadas_visitante: importadas.filter((l) => l.visitante === true).length,
    apagadas,
    sem_responsavel: doCulto.filter((l) => l.tem_responsavel === false).length,
    sem_nascimento: doCulto.filter((l) => !l.data_nascimento).length,
  };
}

/**
 * Série por dia, com os dias VAZIOS preenchidos.
 *
 * ⚠️ Dia sem cadastro tem que aparecer como ZERO, não sumir: o gráfico existe
 * pra mostrar que a entrada de gente acontece no DOMINGO, e uma série só com os
 * dias que tiveram cadastro esconde exatamente esse padrão.
 */
function serieDiaria(linhas = [], inicioISO, fimISO) {
  const t0 = Date.parse(`${inicioISO}T12:00:00Z`);
  const t1 = Date.parse(`${fimISO}T12:00:00Z`);
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 < t0) return [];

  const porDia = new Map();
  for (const l of linhas || []) {
    if (!l || l.deleted_at) continue;               // série é do que EXISTE
    // ⚠️⚠️ Import fica FORA da série também: 3.381 num único dia (30/06/2026)
    // achata todos os outros dias em zero visual, e o gráfico existe justamente
    // pra mostrar que a entrada de gente acontece no DOMINGO. Com o pico, o
    // padrão que ele deveria revelar desaparece.
    if (temMarcaDeImport(l)) continue;
    const d = diaBRT(l.created_at);
    if (!d) continue;
    porDia.set(d, (porDia.get(d) || 0) + 1);
  }

  const fora = [];
  for (let t = t0; t <= t1; t += 86400000) {
    const dia = new Date(t).toISOString().slice(0, 10);
    fora.push({ dia, total: porDia.get(dia) || 0 });
  }
  return fora;
}


/**
 * Os limites em UTC que cobrem EXATAMENTE os dias BRT pedidos.
 *
 * ⚠️⚠️ Filtrar `created_at >= '2026-08-24'` (meia-noite UTC) pega **3 horas do
 * dia 23 em BRT** — justamente a faixa do culto de domingo à noite. O primeiro
 * instante do dia 24 BRT é `2026-08-24T03:00:00Z`, e o último é o começo do dia
 * seguinte. Sem isto, o "últimos 7 dias" inclui o fim do 8º domingo e o número
 * de um domingo vaza para o outro.
 */
function limitesUtc(inicioISO, fimISO) {
  const t0 = Date.parse(`${inicioISO}T00:00:00Z`);
  const t1 = Date.parse(`${fimISO}T00:00:00Z`);
  if (!Number.isFinite(t0) || !Number.isFinite(t1)) return null;
  return {
    desde: new Date(t0 + MS_BRT).toISOString(),
    ate: new Date(t1 + MS_BRT + 86400000).toISOString(),   // exclusivo
  };
}

module.exports = { diaBRT, resumirCadastros, serieDiaria, limitesUtc, temMarcaDeImport, MS_BRT };
