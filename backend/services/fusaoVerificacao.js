// ════════════════════════════════════════════════════════════════════════════
//  FUSÃO DE CADASTROS · a conferência de que nada ficou pendurado
//
//  ⚠️⚠️ POR QUE ISTO EXISTE (14/09/2026 · pedido do Marcos: "garanta que não
//  haja esse problema de linhas penduradas em cadastros juntados")
//
//  Varredura feita em 14/09 sobre as **1.037 fusões já realizadas** e as **63
//  tabelas que apontam para `mem_membros`**: **zero linhas órfãs**. Ou seja, o
//  `merge_membros` hoje repointa tudo — inclusive `cen_resposta`, que nasceu em
//  agosto, DEPOIS da função.
//
//  O risco, portanto, não é o passado: é a tabela que alguém vai criar mês que
//  vem. Se ela não entrar no repointe, as fusões seguintes passam a deixar
//  linha apontando para um cadastro que não existe mais — e ninguém vê, porque
//  a fusão devolve sucesso do mesmo jeito. O dado não some do banco; ele some
//  da PESSOA, que é pior: a contribuição fica órfã, o batismo some da ficha.
//
//  Duas travas, e elas se complementam:
//   1. ESTA verificação, que roda depois de toda fusão e diz o que sobrou;
//   2. `src/test/fusaoTabelas.test.ts`, que lê as migrations e QUEBRA O GATE
//      quando uma tabela nova com `membro_id` não está na lista abaixo.
//
//  ⚠️ Sem a trava 2, esta lista envelhece em silêncio — que é exatamente o
//  defeito que ela existe para evitar. Mesma ideia do `routeModuleMap.test.ts`.
// ════════════════════════════════════════════════════════════════════════════

/**
 * Tabelas com coluna `membro_id` apontando para `mem_membros`.
 *
 * ⚠️ Extraída das migrations em 14/09/2026 e TRAVADA pelo teste. Ao criar
 * tabela nova com `membro_id`, acrescente aqui — o teste diz o nome que falta.
 *
 * Fora da lista de propósito:
 *  · `_bk_*` — cópias de backup, não são vínculo vivo de pessoa;
 *  · tabelas onde o vínculo tem outro nome de coluna (ver `COLUNA_ALTERNATIVA`).
 */
const TABELAS_COM_MEMBRO = Object.freeze([
  'app_decisoes', 'app_inscricoes', 'app_suporte_mensagens', 'app_verificacoes',
  'batismo_inscricoes', 'camp_agradecimentos', 'camp_disparo_envios',
  'cen_convite', 'cen_cuidado', 'cen_resposta',
  'cui_acompanhamentos', 'cui_convertidos', 'cui_j180_turma_membros', 'cui_jornada180',
  'cui_pedidos', 'cui_visitas', 'cultos_decisoes_pessoas', 'devocional_envios',
  'ext_inscricoes', 'face_presencas', 'fin_alertas', 'fin_lancamentos_brutos',
  'fin_regras_classificacao', 'fin_transacoes', 'flx_acoes', 'identidade_pendencias',
  'inscricao_consentimentos', 'inscricoes', 'jornada_encaminhamentos',
  'kids_responsaveis', 'kids_sala_voluntarios', 'marketing_capacidade_override', 'marketing_card_checklist', 'marketing_ciclo_itens_padrao',
  'marketing_compromissos_recorrentes', 'marketing_grupo_padrao',
  'marketing_recorrentes_participantes', 'mem_cadastros_pendentes', 'mem_censo_convites',
  'mem_checkins', 'mem_contatos', 'mem_contribuicoes', 'mem_devocionais', 'mem_escalas',
  'mem_grupo_encontro_presencas', 'mem_grupo_membros', 'mem_grupo_pedidos',
  'mem_grupo_transferencias', 'mem_historico', 'mem_identidade_observacoes',
  'mem_lider_inscricoes', 'mem_trilha_valores', 'mem_voluntarios',
  'next_inscricoes', 'next_matriculas', 'next_pessoa_aula_manual', 'nsm_eventos',
  'pag_cobrancas', 'profiles', 'vis_visitas', 'vol_area_supervisores',
  'vol_background_checks', 'vol_inscricoes', 'vol_inscritos', 'vol_servicos_historico',
  'wa_conversas', 'wifi_visitantes',
]);

/**
 * Vínculo de pessoa que NÃO se chama `membro_id`.
 *
 * ⚠️ `vol_profiles.membresia_id` foi visto em produção na fusão do João
 * Guilherme (14/09): o `related_snapshot` da própria função registrou o
 * repointe dessa coluna. Um nome diferente não deixa o vínculo menos real.
 */
const COLUNA_ALTERNATIVA = Object.freeze({
  vol_profiles: 'membresia_id',
  mem_identidade_pares: 'membro_b_id',
  entradas_pares_adiados: 'membro_b_id',
});

/**
 * Alguma linha continua apontando para um cadastro que a fusão apagou?
 *
 * @param supabase cliente (service_role)
 * @param idsRemovidos uuid[] dos cadastros que deixaram de existir
 * @returns { ok, sobras: [{ tabela, coluna, linhas }], naoConferidas: [] }
 *
 * ⚠️ NUNCA LANÇA. A fusão já aconteceu e foi confirmada pelo banco; derrubar a
 * resposta da API por causa da CONFERÊNCIA transformaria um aviso em erro e
 * faria a pessoa repetir uma fusão que deu certo.
 *
 * ⚠️ Tabela ausente em produção (migration ainda não aplicada) não é sobra —
 * entra em `naoConferidas` e segue. Confundir "não existe" com "está órfã"
 * encheria a tela de alarme falso no dia de um deploy em duas etapas.
 */
async function verificarSobrasDaFusao(supabase, idsRemovidos) {
  const ids = (Array.isArray(idsRemovidos) ? idsRemovidos : [idsRemovidos]).filter(Boolean);
  if (!ids.length) return { ok: true, sobras: [], naoConferidas: [] };

  const alvos = [
    ...TABELAS_COM_MEMBRO.map((t) => [t, 'membro_id']),
    ...Object.entries(COLUNA_ALTERNATIVA),
  ];
  const sobras = [];
  const naoConferidas = [];

  // Concorrência limitada: são ~68 consultas curtas e a fusão é ato humano —
  // não vale abrir 68 conexões de uma vez contra o pooler.
  const LOTE = 8;
  for (let i = 0; i < alvos.length; i += LOTE) {
    await Promise.all(alvos.slice(i, i + LOTE).map(async ([tabela, coluna]) => {
      try {
        const { data, error } = await supabase.from(tabela).select(coluna).in(coluna, ids);
        if (error) { naoConferidas.push({ tabela, coluna, motivo: error.message }); return; }
        if (data && data.length) sobras.push({ tabela, coluna, linhas: data.length });
      } catch (e) {
        naoConferidas.push({ tabela, coluna, motivo: String(e.message).slice(0, 120) });
      }
    }));
  }
  return { ok: sobras.length === 0, sobras, naoConferidas };
}

module.exports = { TABELAS_COM_MEMBRO, COLUNA_ALTERNATIVA, verificarSobrasDaFusao };
