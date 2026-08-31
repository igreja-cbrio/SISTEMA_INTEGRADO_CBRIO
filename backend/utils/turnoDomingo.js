// ============================================================================
// TURNO de domingo · a média é das SOMAS SEMANAIS, nunca a soma das médias
//
// Pergunta do Matheus (31/08): "essa média histórica do Dom manhã tá contando
// os cultos antigos, de quando tinha 3 cultos na manhã?"
//
// ⚠️⚠️ NÃO ESTAVA, e o número mentia. Medido em produção (2026, semanas 1..35):
//
//   somando as médias dos cultos que rodaram NA SEMANA → 999
//     (09:30 = 376, de UMA semana + 11:30 = 623)
//   média REAL do turno (soma semanal → média)          → 1.252
//     (com 08:30 = 193 e 10:00 = 443, que ENCERRARAM mas fizeram a história)
//
// A semana 35 (992) aparecia como "na média" quando está **21% ABAIXO**.
//
// É a mesma lição que o card de Média Histórica já tinha aprendido: a média de
// um conjunto é a média das SOMAS de cada período, não a soma das médias das
// partes — que ignora quem saiu e conta quem entrou como se sempre existisse.
// ============================================================================

/** Manhã até 12h; a partir dela, noite. Sem hora válida devolve null. */
function turnoPorHorario(hora) {
  const h = String(hora || '').slice(0, 5);
  if (!/^\d{2}:\d{2}$/.test(h)) return null;
  return h < '12:00' ? 'manha' : 'noite';
}

const NOME = { manha: 'Dom manhã', noite: 'Dom noite' };

/**
 * @param linhasSemana [{ service_type_id, valor }] da semana exibida
 * @param linhasHist   [{ service_type_id, semana_iso, valor }] do ano até ela
 * @param turnoPorTipo Map<service_type_id, 'manha'|'noite'>
 * @param capacidade   lugares de UM culto (a ocupação é sobre os OFERECIDOS)
 */
function montarTurnos({
  linhasSemana = [], linhasHist = [], turnoPorTipo = new Map(),
  capacidade = 0, usaOcupacao = false,
} = {}) {
  const naSemana = new Map();
  for (const r of linhasSemana) {
    const t = turnoPorTipo.get(r.service_type_id);
    if (!t) continue;
    const at = naSemana.get(t) || { soma: 0, cultos: 0 };
    at.soma += Number(r.valor) || 0;
    at.cultos += 1;
    naSemana.set(t, at);
  }

  // soma por (turno, semana) — é ela que entra na média
  const porSemana = new Map();
  for (const r of linhasHist) {
    const t = turnoPorTipo.get(r.service_type_id);
    if (!t) continue;
    const k = `${t}|${r.semana_iso}`;
    porSemana.set(k, (porSemana.get(k) || 0) + (Number(r.valor) || 0));
  }
  const somas = new Map();
  for (const [k, v] of porSemana) {
    const t = k.slice(0, k.indexOf('|'));
    if (!somas.has(t)) somas.set(t, []);
    somas.get(t).push(v);
  }

  return ['manha', 'noite'].map((t) => {
    const sem = naSemana.get(t);
    // Turno que não rodou nesta semana não vira barra vazia.
    if (!sem) return null;
    const hist = somas.get(t) || [];
    return {
      turno: t,
      nome: NOME[t],
      valor_absoluto: sem.soma,
      media: hist.length ? Math.round(hist.reduce((a, v) => a + v, 0) / hist.length) : 0,
      // ⚠️ Denominador = capacidade × cultos DAQUELA semana. Juntar 2 cultos
      // dobra os assentos; sem isso a manhã mostraria ~94% onde é ~47%.
      taxa_ocupacao: usaOcupacao && sem.soma > 0 && sem.cultos > 0 && capacidade > 0
        ? Math.round((sem.soma / (capacidade * sem.cultos)) * 1000) / 10
        : null,
      cultos_na_semana: sem.cultos,
      // Declarado: "média" de 1 semana não se lê igual a média de 35.
      semanas_na_media: hist.length,
    };
  }).filter(Boolean);
}

module.exports = { turnoPorHorario, montarTurnos, NOME_TURNO: NOME };
