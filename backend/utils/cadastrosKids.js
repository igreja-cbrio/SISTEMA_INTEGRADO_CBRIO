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
  return {
    total: vivas.length,
    visitantes: vivas.filter((l) => l.visitante === true).length,
    membros: vivas.filter((l) => l.visitante === false).length,
    sem_marcacao: vivas.filter((l) => l.visitante == null).length,
    apagadas,
    sem_responsavel: vivas.filter((l) => l.tem_responsavel === false).length,
    sem_nascimento: vivas.filter((l) => !l.data_nascimento).length,
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

module.exports = { diaBRT, resumirCadastros, serieDiaria, limitesUtc, MS_BRT };
