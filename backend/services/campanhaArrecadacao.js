// ════════════════════════════════════════════════════════════════════════════
//  Arrecadação da campanha · quem responde "quanto já entrou"
//
//  ⚠️⚠️ LEI Nº 6 DO NÚCLEO: `mem_contribuicoes` NÃO É CAIXA. Este arquivo NUNCA
//  a consulta pra somar dinheiro. O total sai de `vw_camp_arrecadacao`, que soma
//  três baldes disjuntos por construção (ver o cabeçalho da view na migration
//  `20260827120000` e `utils/campanhaProgresso.js`).
//
//  ⚠️ `mem_contribuicoes` aparece aqui SÓ pra responder "QUEM doou" (o razão
//  nominal, que alimenta o agradecimento e a contagem de doadores). São camadas
//  diferentes e a fronteira é o que impede a dupla contagem de ~R$ 1,5 mi que
//  este projeto já pagou pra descobrir.
// ════════════════════════════════════════════════════════════════════════════

const { supabase } = require('../utils/supabase');
const { calcularProgresso, ritmoNecessario, estaNoAr } = require('../utils/campanhaProgresso');
const { extrairDigito } = require('../utils/digitoCampanha');

/** Hoje em BRT, formato 'YYYY-MM-DD'. `toISOString` é UTC e às 21h já virou. */
function hojeBrt() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

/**
 * O retrato de UMA campanha: progresso + ritmo + se está no ar.
 *
 * ⚠️ Lê a VIEW, não as tabelas. A regra de "o que conta" mora num lugar só —
 * duas implementações da mesma soma é como um número da tela passa a divergir
 * do outro e ninguém sabe qual está certo.
 */
async function retrato(campanhaId) {
  const { data, error } = await supabase
    .from('vw_camp_arrecadacao')
    .select('*')
    .eq('campanha_id', campanhaId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const hoje = hojeBrt();
  const progresso = calcularProgresso(data);
  const ritmo = ritmoNecessario({
    total_centavos: progresso.total_centavos,
    meta_centavos: data.meta_centavos,
    hoje,
    // ⚠️ `data_inicio` é obrigatória aqui: a view só conta dinheiro DENTRO da
    // janela da campanha, então o ritmo tem de ser dividido pela janela em que
    // ainda dá pra arrecadar — não por "de hoje até o fim". Sem ela, a campanha
    // do Kids dizia "faltam 65 dias" em 27/08 quando a arrecadação só abre em
    // 01/09 (61 dias, 8 domingos), e o ritmo saía folgado.
    data_inicio: data.data_inicio,
    data_fim: data.data_fim,
  });

  return {
    ...data,
    ...progresso,
    ...ritmo,
    no_ar: estaNoAr(data, hoje),
    hoje,
  };
}

/** Todas as campanhas com o retrato de cada uma. */
async function listar({ incluirEncerradas = true } = {}) {
  const q = supabase.from('vw_camp_arrecadacao').select('*').order('data_lancamento', { ascending: false });
  if (!incluirEncerradas) q.in('status', ['rascunho', 'ativa', 'pausada']);
  const { data, error } = await q;
  if (error) throw error;

  const hoje = hojeBrt();
  return (data || []).map((c) => ({
    ...c,
    ...calcularProgresso(c),
    ...ritmoNecessario({
      total_centavos: (c.caixa_confirmado_centavos || 0) + (c.caixa_conciliando_centavos || 0)
        + (c.online_pago_centavos || 0),
      meta_centavos: c.meta_centavos,
      hoje,
      data_inicio: c.data_inicio,
      data_fim: c.data_fim,
    }),
    no_ar: estaNoAr(c, hoje),
  }));
}

/**
 * Os lançamentos que compõem o total — o extrato da campanha.
 *
 * ⚠️ Devolve as DUAS camadas de caixa juntas, cada linha marcada com a sua
 * `situacao`: `confirmado` (já é lançamento contábil) ou `em_conciliacao` (está
 * no banco, esperando a fila). Sem essa marca, quem olha a lista não entende por
 * que o total da tela é maior que o do DRE — e a resposta é sempre "a fila".
 */
async function lancamentos(campanhaId, { limite = 200 } = {}) {
  const { data: camp, error: e0 } = await supabase
    .from('camp_campanhas')
    .select('id, digito, data_inicio, data_fim')
    .eq('id', campanhaId).is('deleted_at', null).maybeSingle();
  if (e0) throw e0;
  if (!camp) return [];

  const vetos = await vetosDaCampanha(campanhaId);

  // ── Camada 1 · transações confirmadas ────────────────────────────────────
  const confirmadas = [];
  if (camp.digito) {
    let q = supabase
      .from('fin_transacoes')
      .select('id, valor, data_competencia, descricao, membro_id, lancamento_bruto_id, identificador_centavo')
      .eq('tipo', 'receita')
      .eq('identificador_centavo', camp.digito)
      .order('data_competencia', { ascending: false })
      .limit(limite);
    if (camp.data_inicio) q = q.gte('data_competencia', camp.data_inicio);
    if (camp.data_fim) q = q.lte('data_competencia', camp.data_fim);
    const { data, error } = await q;
    if (error) throw error;
    for (const t of data || []) {
      if (vetos.transacoes.has(t.id)) continue;
      confirmadas.push({
        origem: 'caixa', situacao: 'confirmado',
        transacao_id: t.id, lancamento_bruto_id: t.lancamento_bruto_id,
        valor_centavos: Math.round(Math.abs(Number(t.valor)) * 100),
        data: t.data_competencia, descricao: t.descricao, membro_id: t.membro_id,
      });
    }
  }

  // ── Camada 2 · brutos com o dígito e ainda sem transação ─────────────────
  // ⚠️ O PostgREST capa em 1000 linhas server-side (lição permanente da casa) e
  // não sabe fazer `NOT EXISTS`. Então filtra-se em JS contra o conjunto de
  // `lancamento_bruto_id` que já virou transação — que é o mesmo NOT EXISTS da
  // view, só do outro lado do fio.
  const conciliando = [];
  if (camp.digito) {
    const jaTransacionados = new Set(confirmadas.map((c) => c.lancamento_bruto_id).filter(Boolean));
    let q = supabase
      .from('fin_lancamentos_brutos')
      .select('id, valor, data_lancamento, memo, nome_contraparte, tipo_trn, membro_id')
      .order('data_lancamento', { ascending: false })
      .limit(1000);
    if (camp.data_inicio) q = q.gte('data_lancamento', camp.data_inicio);
    if (camp.data_fim) q = q.lte('data_lancamento', camp.data_fim);
    const { data, error } = await q;
    if (error) throw error;

    // Quais desses brutos já têm transação? Uma consulta só, pelos ids.
    const ids = (data || []).map((b) => b.id);
    const comTransacao = new Set(jaTransacionados);
    for (let i = 0; i < ids.length; i += 200) {
      const fatia = ids.slice(i, i + 200);
      if (!fatia.length) break;
      const { data: ts } = await supabase
        .from('fin_transacoes').select('lancamento_bruto_id').in('lancamento_bruto_id', fatia);
      for (const t of ts || []) comTransacao.add(t.lancamento_bruto_id);
    }

    for (const b of data || []) {
      const ehCred = b.tipo_trn === 'CREDIT' || (b.tipo_trn !== 'DEBIT' && Number(b.valor) > 0);
      if (!ehCred) continue;
      if (extrairDigito(b.valor) !== camp.digito) continue;
      if (comTransacao.has(b.id)) continue;
      if (vetos.brutos.has(b.id)) continue;
      conciliando.push({
        origem: 'caixa', situacao: 'em_conciliacao',
        lancamento_bruto_id: b.id, transacao_id: null,
        valor_centavos: Math.round(Math.abs(Number(b.valor)) * 100),
        data: b.data_lancamento,
        descricao: b.memo || b.nome_contraparte || 'Crédito sem descrição',
        membro_id: b.membro_id,
      });
    }
  }

  // ── Camada 3 · doação online ─────────────────────────────────────────────
  const { data: online, error: e3 } = await supabase
    .from('pag_cobrancas')
    .select('id, valor_centavos, valor_pago_centavos, pago_em, metodo, membro_id, pagador_nome, metadata')
    .eq('origem_tipo', 'generosidade')
    .eq('status', 'pago')
    .is('deleted_at', null)
    .order('pago_em', { ascending: false })
    .limit(limite);
  if (e3) throw e3;

  const onlineDaCampanha = (online || [])
    .filter((p) => String(p.metadata?.campanha_id || '') === String(campanhaId))
    .map((p) => ({
      origem: 'online', situacao: 'confirmado',
      cobranca_id: p.id, transacao_id: null, lancamento_bruto_id: null,
      valor_centavos: p.valor_pago_centavos || p.valor_centavos,
      data: p.pago_em ? p.pago_em.slice(0, 10) : null,
      descricao: `Doação online${p.metodo ? ` via ${p.metodo}` : ''}`,
      membro_id: p.membro_id,
    }));

  return [...confirmadas, ...conciliando, ...onlineDaCampanha]
    .sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')));
}

/** Os vetos e inclusões manuais desta campanha, em dois conjuntos. */
async function vetosDaCampanha(campanhaId) {
  const { data } = await supabase
    .from('camp_vinculos')
    .select('lancamento_bruto_id, transacao_id, incluir')
    .eq('campanha_id', campanhaId)
    .eq('incluir', false);
  const brutos = new Set();
  const transacoes = new Set();
  for (const v of data || []) {
    if (v.lancamento_bruto_id) brutos.add(v.lancamento_bruto_id);
    if (v.transacao_id) transacoes.add(v.transacao_id);
  }
  return { brutos, transacoes };
}

/**
 * Créditos com o dígito da campanha que ainda esperam a fila de classificação.
 *
 * É a lista que o financeiro usa pra trabalhar. ⚠️ Ela existe porque a fila
 * geral tem 5.311 itens pendentes (medido em 26/08) e o crédito da campanha
 * não pode ficar atrás de 5 mil linhas de dízimo.
 */
async function pendentesDeConciliacao(campanhaId) {
  const linhas = await lancamentos(campanhaId, { limite: 500 });
  return linhas.filter((l) => l.situacao === 'em_conciliacao');
}

module.exports = {
  retrato,
  listar,
  lancamentos,
  pendentesDeConciliacao,
  vetosDaCampanha,
  hojeBrt,
};

/**
 * TROCA O DÍGITO da campanha, FIXANDO o que já foi identificado.
 *
 * ⚠️⚠️ POR QUE ISTO É MAIS QUE UM UPDATE: `vw_camp_arrecadacao` casa o caixa por
 * `identificador_centavo = c.digito`. Trocar 07 por 08 faria TODA doação já
 * identificada com ,07 **desaparecer da barrinha, em silêncio** — o número só
 * ficaria menor, sem erro nenhum. A saída NÃO é mudar a chave da view (é ela que
 * impede a dupla contagem do repasse do PSP · LEI Nº 6): é fixar o passado em
 * `camp_vinculos` (incluir = true), que a view soma desde a migration
 * `20260827170000`.
 *
 * ⚠️ ORDEM: fixa ANTES de trocar. Morrer no meio deixa inclusões manuais
 * redundantes (inofensivas — a view conta a linha UMA vez, o dígito ainda bate) e
 * o dígito antigo de pé. A ordem inversa deixaria o dinheiro fora da barrinha.
 *
 * ⚠️ `ignoreDuplicates: true` é o que PRESERVA O VETO: se alguém já marcou "este
 * crédito não é daqui", a fixação não pode sobrescrever para `true`.
 */
async function trocarDigito({ campanhaId, digitoNovo, motivo, autorId }) {
  const { data: camp, error: e0 } = await supabase.from('camp_campanhas')
    .select('id, nome, digito, data_inicio, data_fim')
    .eq('id', campanhaId).is('deleted_at', null).maybeSingle();
  if (e0) throw e0;
  if (!camp) return { ok: false, motivo: 'campanha_nao_encontrada' };

  const anterior = camp.digito || null;
  if (anterior === digitoNovo) return { ok: true, sem_mudanca: true, fixados: 0 };

  let fixados = 0;

  // Só há passado a fixar se havia dígito antes.
  if (anterior) {
    const linhas = await lancamentos(campanhaId, { limite: 1000 });
    const doCaixa = linhas.filter((l) => l.origem === 'caixa');

    const paraFixar = doCaixa.map((l) => ({
      campanha_id: campanhaId,
      lancamento_bruto_id: l.lancamento_bruto_id || null,
      transacao_id: l.transacao_id || null,
      incluir: true,
      motivo: `Dígito da campanha mudou de ${anterior} para ${digitoNovo}` +
        `${motivo ? ` · ${String(motivo).slice(0, 200)}` : ''}`,
      created_by: autorId || null,
    }));

    // ⚠️ Duas chaves de conflito distintas (bruto × transação), então são dois
    // upserts: um `onConflict` só não cobriria as duas famílias de linha.
    const brutos = paraFixar.filter((v) => v.lancamento_bruto_id && !v.transacao_id);
    const trans = paraFixar.filter((v) => v.transacao_id);

    for (const [lote, conflito] of [[brutos, 'campanha_id,lancamento_bruto_id'],
      [trans, 'campanha_id,transacao_id']]) {
      for (let i = 0; i < lote.length; i += 200) {
        const fatia = lote.slice(i, i + 200);
        if (!fatia.length) break;
        const { error } = await supabase.from('camp_vinculos')
          .upsert(fatia, { onConflict: conflito, ignoreDuplicates: true });
        if (error && error.code !== '23505') throw error;
        fixados += fatia.length;
      }
    }
  }

  const { error: eUp } = await supabase.from('camp_campanhas')
    .update({ digito: digitoNovo, updated_at: new Date().toISOString() })
    .eq('id', campanhaId).is('deleted_at', null);
  if (eUp) throw eUp;

  // Trilha append-only: é ela que explica, meses depois, por que existe inclusão
  // manual em massa naquela data.
  await supabase.from('camp_digito_historico').insert({
    campanha_id: campanhaId,
    digito_anterior: anterior,
    digito_novo: digitoNovo,
    lancamentos_fixados: fixados,
    motivo: motivo ? String(motivo).slice(0, 500) : null,
    created_by: autorId || null,
  }).catch((e) => console.error('[campanhaArrecadacao] trilha do dígito:', e.message));

  return { ok: true, anterior, novo: digitoNovo, fixados };
}

module.exports.trocarDigito = trocarDigito;
