// ════════════════════════════════════════════════════════════════════════════
//  A identidade da LINHA de escala quando a equipe não está vinculada.
//
//  Pergunta do Matheus (01/09/2026): *"esses voluntários sem área, são o quê??
//  sem área significa sem equipe??"*
//
//  ⚠️⚠️ NÃO SIGNIFICA — e a tela estava DIZENDO "SEM EQUIPE" para gente cuja
//  equipe ela conhece. Medido em 01/09/2026:
//
//    • 694 escalas do Planning Center têm `team_id` NULO e `team_name`
//      PREENCHIDO (Liderança, Assistentes, Vocal, Recepção, Câmeras…);
//    • em 612 delas existe UMA equipe em `vol_teams` com o nome IDÊNTICO — o
//      vínculo só não foi feito. 67 têm nome ambíguo, 15 não têm par;
//    • na quarta 02/09 as 59 escalas do culto estavam TODAS sem `team_id`.
//
//  Eram DOIS defeitos somados no endpoint da matriz:
//
//    1. `garanteLinha(s.team_id, null, ...)` passava `null` como NOME, jogando
//       fora o `team_name` que estava ali. O resgate seguinte procurava o nome em
//       `vol_teams` POR `team_id` — que é justamente o que está nulo.
//    2. A chave da linha era `(team_id, position_id)`. Com `team_id` nulo, TODAS
//       as equipes desvinculadas colapsavam na MESMA linha — daí o bloco único
//       com Liderança, Assistentes e Vocal misturados no print dele.
//
//  ⚠️ Régua PURA (sem banco, sem rede) pra entrar no gate.
// ════════════════════════════════════════════════════════════════════════════

/** Normaliza nome de equipe pra CHAVE (nunca pra exibição). */
function chaveNome(nome) {
  return String(nome == null ? '' : nome)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * A chave que identifica a linha.
 *
 * ⚠️⚠️ Sem `team_id`, a chave usa o NOME normalizado. Sem isso, "Liderança",
 * "Assistentes" e "Vocal" viram uma linha só — que é o bloco embolado que o
 * Matheus viu. O `id` vem primeiro quando existe: ele é a identidade real, e
 * duas equipes podem ter o mesmo nome (medido: 67 escalas caem em nome ambíguo).
 *
 * ⚠️ O prefixo (`id:` / `nome:`) impede que um `team_id` que por acaso seja igual
 * a um nome normalizado colida com ele.
 */
function chaveDaLinha({ team_id: teamId, team_name: teamName, position_id: positionId } = {}) {
  const pos = positionId || '';
  if (teamId) return `id:${teamId}::${pos}`;
  const n = chaveNome(teamName);
  if (n) return `nome:${n}::${pos}`;
  // Nem id nem nome: é o único caso em que "sem equipe" é a verdade.
  return `sem::${pos}`;
}

/**
 * O rótulo da equipe na tela.
 *
 * ⚠️⚠️ `vinculada: false` com nome é um TERCEIRO estado, e a tela precisa dos
 * três: equipe vinculada · equipe conhecida mas NÃO vinculada · realmente sem
 * equipe. Colapsar os dois últimos em "Sem equipe" é o que fazia a tela afirmar
 * que não sabe algo que ela sabe — e mandava a coordenação procurar a pessoa
 * numa equipe que já estava escrita ali.
 */
function rotuloDaEquipe({ team_id: teamId, team_name: teamName, nome_do_vinculo: nomeVinculo } = {}) {
  // Vinculada: o nome que vale é o da TABELA (`vol_teams.name`), não o snapshot
  // do PCO — renomear a equipe tem de refletir.
  if (teamId) {
    return {
      nome: (typeof nomeVinculo === 'string' && nomeVinculo.trim())
        || (typeof teamName === 'string' && teamName.trim())
        || 'Sem equipe',
      vinculada: true,
    };
  }
  const n = typeof teamName === 'string' ? teamName.replace(/\s+/g, ' ').trim() : '';
  if (n) return { nome: n, vinculada: false };
  return { nome: 'Sem equipe', vinculada: false };
}

/**
 * A área da linha.
 *
 * ⚠️ Área vem SEMPRE da equipe vinculada (`vol_teams.area`). Equipe não
 * vinculada não tem área por definição — e inventar uma a partir do nome seria
 * chutar o organograma. Medido: 116 das 129 equipes estão sem área preenchida,
 * então "Sem área" é o caso comum mesmo entre as vinculadas; o conserto disso é
 * cadastro, não código.
 */
function areaDaLinha({ area, team_id: teamId } = {}) {
  if (!teamId) return null;
  const a = typeof area === 'string' ? area.trim() : '';
  return a || null;
}

/**
 * Nome EXATO pra casar equipe (trim + espaço interno colapsado, PRESERVANDO
 * acento e caixa).
 *
 * ⚠️⚠️ Existe por causa de um achado de produção (01/09/2026): `vol_teams` tem
 * SETE pares de equipe que diferem só por acento/caixa — "Cameras" × "Câmeras",
 * "Liderança" × "LIDERANÇA", "Check-in" × "Check-In", "preletor" × "Preletor",
 * "Próximos passos" × "Próximos Passos", "assistente ministerial" ×
 * "Assistente Ministerial", "Transmissão e infraestrutura" × "…Infraestrutura".
 * Casar SÓ por `chaveNome` torna esses 7 nomes AMBÍGUOS e deixa de religar
 * escala que o PCO identificou sem nenhuma dúvida: medido, 555 religáveis pelo
 * normalizado contra **681** quando o exato vem primeiro.
 *
 * ⚠️ NÃO serve pra AGRUPAR linha na tela (lá "Câmeras" e "Cameras" devem cair
 * no mesmo bloco — é `chaveDaLinha` que manda). Serve pra RELIGAR: ali o
 * empate exato é evidência, e a normalização é só desempate.
 */
function chaveExataNome(nome) {
  return String(nome == null ? '' : nome).replace(/\s+/g, ' ').trim();
}

/**
 * Indexa as equipes para o fallback por nome.
 *
 * ⚠️⚠️ SÓ EQUIPE ATIVA ENTRA. É a guarda que, sozinha, teria evitado o
 * incidente de 01/09/2026 (ver `destinoDaOrfa`): as 116 equipes-espelho do PCO
 * estão `is_active = false` porque alguém as APOSENTOU em 16/08, e religar
 * escala nelas desfaz essa decisão sem ninguém perceber — o sintoma é a matriz
 * mostrando tudo sob "Sem área", já que só as 13 vivas têm área preenchida.
 *
 * ⚠️ Ela mora AQUI, e não no serviço, de propósito: guarda em código impuro é
 * guarda que mutante nenhum alcança, e foi assim que ela passou sem teste na
 * primeira versão.
 *
 * ⚠️ `is_active` só exclui quando é EXATAMENTE `false`: a coluna pode vir nula
 * em equipe antiga, e tratar nulo como aposentada esconderia equipe viva.
 */
function indexarEquipesAtivas(equipes) {
  const porExatoAtivas = new Map();
  const porNomeAtivas = new Map();
  for (const t of equipes || []) {
    if (!t || t.is_active === false) continue;
    const ex = chaveExataNome(t.name);
    if (ex) {
      if (!porExatoAtivas.has(ex)) porExatoAtivas.set(ex, []);
      porExatoAtivas.get(ex).push(t.id);
    }
    const k = chaveNome(t.name);
    if (!k) continue;
    if (!porNomeAtivas.has(k)) porNomeAtivas.set(k, []);
    porNomeAtivas.get(k).push(t.id);
  }
  return { porExatoAtivas, porNomeAtivas };
}

/**
 * Indexa `vol_pco_mapa` (a decisão humana de 16/08) por nome normalizado.
 * ⚠️ Linha `ignorar` ou sem destino NÃO entra: é o veto de quem cadastrou.
 */
function indexarMapaPco(linhas) {
  const mapa = new Map();
  for (const m of linhas || []) {
    if (!m || !m.team_id || m.ignorar) continue;
    const k = chaveNome(m.pco_nome);
    if (k) mapa.set(k, { team_id: m.team_id, position_id: m.position_id || null });
  }
  return mapa;
}

/**
 * Para ONDE vai uma escala órfã do Planning Center.
 *
 * ⚠️⚠️ INCIDENTE DE 01/09/2026 — a lição que esta função existe pra fixar.
 * A 1ª versão religava por NOME contra `vol_teams`, e mandou **623 escalas
 * para equipes-espelho DESATIVADAS**: o sync do PCO criava uma equipe por
 * TIME do PCO (129 equipes) e o remapeamento de 16/08 (PR #2518) aposentou
 * essas 116, porque "time do PCO" é a nossa FUNÇÃO, não a nossa EQUIPE. Casar
 * por nome reencontra exatamente o artefato que foi aposentado — e o sintoma é
 * a matriz mostrando tudo sob "Sem área", porque só as 13 equipes VIVAS têm
 * área preenchida.
 *
 * ⇒ A fonte de verdade é **`vol_pco_mapa`** (`pco_nome` → `team_id` +
 * `position_id`). Medido: ela resolve 623 de 623, todas para equipe ATIVA.
 *
 * ⚠️ E a guarda que sozinha teria evitado o estrago: **NUNCA ligar em equipe
 * inativa.** Aposentar uma equipe é decisão humana; religar escala nela desfaz
 * a decisão sem ninguém perceber.
 *
 * @param orfa   `{ team_name, position_id }` da escala
 * @param fontes `{ mapa, porExatoAtivas, porNomeAtivas }` — Maps já indexados
 * @returns `{ team_id, position_id, via }` ou `{ via: 'nenhum'|'ambiguo' }`
 */
function destinoDaOrfa(orfa, fontes) {
  const { team_name: teamName, position_id: posAtual } = orfa || {};
  const { mapa, porExatoAtivas, porNomeAtivas } = fontes || {};
  const k = chaveNome(teamName);
  // ⚠️ Guarda DEFENSIVA e declaradamente NÃO OBSERVÁVEL: `indexarEquipesAtivas`
  // e `indexarMapaPco` já recusam chave vazia, então sem ela o resultado sairia
  // igual por acidente. Fica pela intenção — não afirmo cobertura que não existe.
  if (!k) return { via: 'nenhum', motivo: 'sem nome de equipe' };

  // 1 · o MAPA manda (é a decisão humana registrada em 16/08).
  const doMapa = mapa && mapa.get(k);
  if (doMapa) {
    return {
      team_id: doMapa.team_id,
      // ⚠️ Só PREENCHE função vazia — nunca sobrescreve a que alguém definiu.
      position_id: posAtual || doMapa.position_id || null,
      via: 'mapa_pco',
    };
  }

  // 2 · Fallback por nome, e SÓ entre equipes ATIVAS.
  const ex = porExatoAtivas && porExatoAtivas.get(chaveExataNome(teamName));
  const cand = (ex && ex.length === 1) ? ex : (porNomeAtivas && porNomeAtivas.get(k));
  if (!cand || !cand.length) return { via: 'nenhum', motivo: 'fora do mapa e sem equipe ativa de mesmo nome' };
  if (cand.length > 1) return { via: 'ambiguo', motivo: 'duas equipes ativas com o mesmo nome' };
  return { team_id: cand[0], position_id: posAtual || null, via: 'nome_ativa' };
}

module.exports = {
  chaveNome, chaveExataNome, chaveDaLinha, rotuloDaEquipe, areaDaLinha,
  indexarEquipesAtivas, indexarMapaPco, destinoDaOrfa,
};
