// ============================================================================
// utils/vinculosDuplicados · a MESMA pessoa com 2+ vínculos ATIVOS no MESMO grupo
// ============================================================================
// Régua PURA (sem banco, sem rede, sem relógio) — mora em `utils/` pra entrar no
// gate. Quem lê e escreve é `routes/grupos.js`.
//
// De onde veio: no print do Matheus (13/08/2026) a coluna Grupo da aba Pessoas
// repetia "JOVENS - ESTUDO DA MENSAGEM DO CULTO AMI" cinco vezes na mesma
// pessoa. Não era bug de render: são linhas REAIS de `mem_grupo_membros`, todas
// com `saiu_em IS NULL`, no mesmo grupo.
//
// ⚠️ Isso é possível desde `20260721170000`, que DROPOU `uniq_mem_grupo_membros_ativo`
// pra formalizar o multi-grupo (a pessoa pode estar em N grupos ao mesmo tempo).
// O efeito colateral é que ninguém impede N linhas no MESMO grupo. Este relatório
// existe pra a coordenação limpar isso à mão — a constraint não volta, porque ela
// bloquearia o multi-grupo que a igreja usa de verdade.
//
// ⚠️⚠️ REMOVER É `deleted_at` (soft delete), NUNCA `saiu_em`. A pessoa NÃO saiu
// do grupo — a linha é que não devia existir. `saiu_em` alimenta o bloco
// "Entradas e saídas" da ficha do grupo, então usá-lo aqui FABRICARIA um evento
// "saiu do grupo" que nunca aconteceu, e é justamente o histórico que a
// coordenação lê pra decidir coisas.
//
// ⚠️ O que se perde ao remover: só o CONTADOR `presencas` daquela linha (que
// soma na coluna "Presenças" da aba Pessoas). A frequência REAL por grupo vem de
// `mem_grupo_encontro_presencas`, que é chaveada por MEMBRO + encontro — não pela
// linha do vínculo. Conferido em `GET /grupos/pessoas/:membroId/frequencia`, que
// monta `papelDe` num Map por grupo_id (duplicata já colapsa lá).
// ============================================================================

/** Rank de função, pra não sugerir manter a linha de menor papel. */
const RANK_FUNCAO = {
  coordenador: 7, supervisor: 6, lider: 5, co_lider: 4,
  lider_treinamento: 3, frequentador: 2, membro: 2, visitante: 1,
};

function rank(funcao) {
  return RANK_FUNCAO[String(funcao || '').toLowerCase()] || 0;
}

/** Data → número comparável. Valor ausente/inválido vai pro FIM (Infinity). */
function tempo(v) {
  if (!v) return Infinity;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? Infinity : t;
}

/**
 * Qual linha MANTER num caso de duplicata, em ordem de desempate:
 *   1. maior `presencas`      → é o contador que se perde ao remover as outras
 *   2. maior rank de função   → não rebaixar quem é líder/co-líder no grupo
 *   3. `entrou_em` mais antigo→ preserva a data real de entrada da pessoa
 *   4. `created_at` mais antigo
 *   5. `id` (ordem estável · sem isso a sugestão muda a cada refresh)
 *
 * ⚠️ É SUGESTÃO. Quem decide é a coordenação — a tela deixa trocar, e o servidor
 * aceita qualquer uma das linhas do caso como a mantida.
 */
function escolherLinhaAManter(linhas) {
  const lista = (linhas || []).filter(Boolean);
  if (!lista.length) return null;
  const ordenadas = [...lista].sort((a, b) => (
    (b.presencas || 0) - (a.presencas || 0)
    || rank(b.funcao) - rank(a.funcao)
    || tempo(a.entrou_em) - tempo(b.entrou_em)
    || tempo(a.created_at) - tempo(b.created_at)
    || String(a.id).localeCompare(String(b.id))
  ));
  return ordenadas[0];
}

/**
 * Agrupa vínculos ATIVOS por (membro, grupo) e devolve só os casos com 2+ linhas.
 *
 * @param {object[]} rows  linhas de `mem_grupo_membros` já filtradas
 *                         (`saiu_em IS NULL` e `deleted_at IS NULL`)
 * @returns {{ casos: object[], total_linhas_extras: number,
 *             pessoas_afetadas: number, grupos_afetados: number }}
 */
function agruparDuplicados(rows) {
  const porPar = new Map();
  for (const r of rows || []) {
    if (!r?.membro_id || !r?.grupo_id) continue; // linha órfã não é duplicata
    const chave = `${r.membro_id}|${r.grupo_id}`;
    if (!porPar.has(chave)) porPar.set(chave, []);
    porPar.get(chave).push(r);
  }

  const casos = [];
  const pessoas = new Set();
  const grupos = new Set();
  let extras = 0;

  for (const [chave, linhas] of porPar) {
    if (linhas.length < 2) continue;
    const [membro_id, grupo_id] = chave.split('|');
    const manter = escolherLinhaAManter(linhas);
    // Ordem de exibição: a sugerida primeiro, o resto por presenças desc.
    const ordenadas = [...linhas].sort((a, b) => (
      (a.id === manter.id ? -1 : 0) - (b.id === manter.id ? -1 : 0)
      || (b.presencas || 0) - (a.presencas || 0)
      || String(a.id).localeCompare(String(b.id))
    ));
    // O que a coluna "Presenças" perde se a coordenação seguir a sugestão.
    const presencasFora = ordenadas
      .filter((l) => l.id !== manter.id)
      .reduce((acc, l) => acc + (l.presencas || 0), 0);

    casos.push({
      membro_id,
      grupo_id,
      linhas: ordenadas,
      sugestao_manter_id: manter.id,
      presencas_fora_da_sugestao: presencasFora,
      // ⚠️ Sinal pra a coordenação NÃO clicar no automático: mais de uma linha
      // com presença significa que o histórico do contador está partido entre
      // elas, e aí a escolha muda um número que alguém lê.
      exige_atencao: ordenadas.filter((l) => (l.presencas || 0) > 0).length > 1,
    });
    pessoas.add(membro_id);
    grupos.add(grupo_id);
    extras += linhas.length - 1;
  }

  // Caso que exige atenção primeiro; depois o de mais linhas.
  casos.sort((a, b) => (
    (b.exige_atencao ? 1 : 0) - (a.exige_atencao ? 1 : 0)
    || b.linhas.length - a.linhas.length
    || String(a.membro_id).localeCompare(String(b.membro_id))
  ));

  return {
    casos,
    total_linhas_extras: extras,
    pessoas_afetadas: pessoas.size,
    grupos_afetados: grupos.size,
  };
}

/**
 * Valida no SERVIDOR o pedido de resolução. O payload diz QUAIS linhas, nunca
 * SE pode — mesma régua do lote de aprovação de cadastros.
 *
 * @param {object[]} linhasVivas  linhas ATIVAS de (membro, grupo), lidas AGORA
 * @param {string} manterId
 * @param {string[]} removerIds
 * @returns {{ ok: boolean, erro?: string, remover?: string[] }}
 */
function validarResolucao(linhasVivas, manterId, removerIds) {
  const vivas = (linhasVivas || []).filter(Boolean);
  const ids = new Set(vivas.map((l) => String(l.id)));
  const manter = String(manterId || '');
  const remover = [...new Set((removerIds || []).map(String))];

  if (vivas.length < 2) return { ok: false, erro: 'nao_ha_duplicata' };
  if (!ids.has(manter)) return { ok: false, erro: 'manter_invalido' };
  if (!remover.length) return { ok: false, erro: 'nada_a_remover' };
  if (remover.includes(manter)) return { ok: false, erro: 'manter_na_lista_de_remover' };
  if (remover.some((id) => !ids.has(id))) return { ok: false, erro: 'linha_fora_do_caso' };
  // ⚠️ NUNCA deixar o caso sem nenhuma linha ativa: a pessoa sumiria do grupo
  // sem ninguém ter decidido isso.
  // ⚠️ HONESTIDADE: hoje esta guarda é INALCANÇÁVEL — as três acima já garantem
  // que `remover ⊆ ids \ {manter}`, logo `remover.length <= vivas.length - 1`.
  // Ela fica como backstop pra o dia em que alguém reordenar/afrouxar as outras,
  // mas NÃO é ela que protege: quem protege são `manter_na_lista_de_remover` e
  // `linha_fora_do_caso`, e são essas que estão mutation-testadas. Um mutante
  // que apaga só esta linha sobrevive, e isso é esperado — não é buraco de teste.
  if (remover.length >= vivas.length) return { ok: false, erro: 'removeria_todas' };

  return { ok: true, remover };
}

module.exports = {
  RANK_FUNCAO,
  escolherLinhaAManter,
  agruparDuplicados,
  validarResolucao,
};
