/**
 * Cobertura da escala — régua PURA de "quem preenche qual vaga".
 *
 * Extraída em 14/08/2026 ao construir a visão MATRIZ (várias semanas de uma
 * vez). Até aqui a conta vivia dentro de `_coberturaDoCulto`, que consulta o
 * banco de UM culto; a matriz precisa da mesma conta para N cultos numa
 * varredura só, e reimplementá-la lá seria a receita de a grade dizer "falta 1"
 * enquanto a tela do culto diz "está completo".
 *
 * ⚠️ Fica em `utils/` (sem `require` de banco) porque é assim que entra no gate
 * de deploy — `src/test/volCobertura.test.ts`.
 */

/**
 * Casa as pessoas escaladas com os itens da composição do culto.
 *
 * A régua tem DOIS níveis, e a ordem importa:
 *   1. `escala_culto_item_id` — o vínculo explícito com a vaga, gravado desde
 *      13/08/2026 por quem escala pela tela nova;
 *   2. o par (equipe, função) — fallback para escala antiga e para quem foi
 *      escalado à mão fora de qualquer composição.
 *
 * ⚠️ Uma pessoa conta para UM item só. Sem a marca de usada, uma escala sem
 * `escala_culto_item_id` casaria com duas linhas da composição do mesmo par
 * (equipe, função) e as duas apareceriam preenchidas pela mesma pessoa — a
 * tela subestimaria o que ainda falta.
 *
 * ⚠️ Linha sem `volunteer_id` NÃO preenche vaga: é lugar reservado, não gente.
 */
function montarCobertura(itens, escalas) {
  const lista = Array.isArray(escalas) ? escalas : [];
  const porItemId = new Map();
  const porPar = new Map();
  const chavePar = (t, p) => `${t || ''}:${p || ''}`;

  for (const s of lista) {
    if (!s || !s.volunteer_id) continue;
    if (s.escala_culto_item_id) {
      if (!porItemId.has(s.escala_culto_item_id)) porItemId.set(s.escala_culto_item_id, []);
      porItemId.get(s.escala_culto_item_id).push(s);
    } else {
      const k = chavePar(s.team_id, s.position_id);
      if (!porPar.has(k)) porPar.set(k, []);
      porPar.get(k).push(s);
    }
  }

  // ⚠️⚠️ QUEM RECUSOU NÃO PREENCHE A VAGA (21/08/2026). Antes disto, uma escala
  // `declined` contava como preenchida: o aviso dizia "a vaga voltou a ficar em
  // aberto" e a tela mostrava o lugar OCUPADO por quem acabou de dizer que não
  // vai. Medido em 21/08: 27 escalas futuras recusadas, nenhuma reabrindo vaga.
  //
  // ⚠️ A pessoa CONTINUA aparecendo em `pessoas`, marcada — sumir com ela faria
  // o supervisor perder a informação de quem era e por que a vaga abriu, que é
  // justamente o que ele precisa pra repor.
  const contaVaga = (s) => !!s && s.confirmation_status !== 'declined';

  const usadas = new Set();
  const resultado = (Array.isArray(itens) ? itens : []).map(a => {
    const diretas = (porItemId.get(a.id) || []).filter(s => !usadas.has(s.id));
    // Só busca no fallback o que ainda falta depois do vínculo explícito.
    // ⚠️ Conta só quem PREENCHE: recusada no vínculo direto não pode impedir o
    // fallback de mostrar que a vaga está aberta.
    const querFaltando = Math.max(0, (a.quantidade || 0) - diretas.filter(contaVaga).length);
    const doPar = querFaltando > 0
      ? (porPar.get(chavePar(a.team_id, a.position_id)) || [])
        .filter(s => !usadas.has(s.id)).slice(0, querFaltando)
      : [];
    const pessoas = [...diretas, ...doPar];
    for (const s of pessoas) usadas.add(s.id);

    return {
      id: a.id,
      team_id: a.team_id,
      team: a.team?.name || a.team || null,
      position_id: a.position_id,
      position: a.position?.name || a.position || null,
      fixo: a.fixo,
      alvo: a.quantidade || 0,
      preenchidas: pessoas.filter(contaVaga).length,
      recusadas: pessoas.length - pessoas.filter(contaVaga).length,
      faltam: Math.max(0, (a.quantidade || 0) - pessoas.filter(contaVaga).length),
      pessoas,
    };
  });

  // ⚠️ Quem sobrou não pode sumir: é gente escalada à mão numa área sem
  // composição, ou além do que o template pedia. Sumir com essa pessoa da tela
  // faria a coordenação escalar outra no lugar dela.
  const sobrando = lista.filter(s => s && s.volunteer_id && !usadas.has(s.id));

  const alvo = resultado.reduce((s, i) => s + i.alvo, 0);
  const preenchidas = resultado.reduce((s, i) => s + i.preenchidas, 0);

  return {
    itens: resultado,
    sobrando,
    resumo: {
      alvo,
      preenchidas,
      faltam: Math.max(0, alvo - preenchidas),
      cobertura_pct: alvo ? Math.round((preenchidas / alvo) * 100) : null,
    },
  };
}

/** Contadores de confirmação de um conjunto de escalas. */
function contarStatus(escalas) {
  const r = { total: 0, confirmados: 0, recusados: 0, pendentes: 0 };
  for (const s of Array.isArray(escalas) ? escalas : []) {
    if (!s) continue;
    r.total++;
    if (s.confirmation_status === 'confirmed') r.confirmados++;
    else if (s.confirmation_status === 'declined') r.recusados++;
    else r.pendentes++;
  }
  return r;
}

module.exports = { montarCobertura, contarStatus };
