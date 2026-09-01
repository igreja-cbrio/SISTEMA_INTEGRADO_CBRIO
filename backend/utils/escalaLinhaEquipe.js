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

module.exports = { chaveNome, chaveExataNome, chaveDaLinha, rotuloDaEquipe, areaDaLinha };
