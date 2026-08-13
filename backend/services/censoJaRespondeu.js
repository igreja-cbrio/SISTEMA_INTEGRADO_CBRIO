// ════════════════════════════════════════════════════════════════════════════
//  CENSO · "essa pessoa já respondeu?" — uma regra só, dois chamadores
//
//  Pedido do Matheus (08/08): o censo aparece no app do membro, mas SÓ para
//  quem ainda não respondeu; quem já respondeu vê um aviso. E ele foi explícito
//  no critério: "o sistema vai saber pelo CPF".
//
//  Por que o CPF importa e o membro_id sozinho não basta: o vínculo
//  resposta → pessoa é feito no PÓS-PROCESSAMENTO, de propósito (durante o
//  culto, resolver identidade custava 7 das 8,3 idas ao banco por resposta).
//  Então existe uma janela — de minutos a horas — em que a resposta está no
//  banco, concluída, com o CPF certo, e ainda SEM membro_id.
//
//  Nessa janela, uma checagem só por membro_id diria "ainda não respondeu" para
//  quem acabou de responder no culto. A pessoa abriria o app e preencheria 93
//  campos de novo — e o segundo envio não é barrado por nada, porque a trava de
//  idempotência é por aparelho (envio_id), não por pessoa.
//
//  Daí este arquivo existir separado das duas rotas que o usam (o prefill do
//  formulário público e o endpoint do app): duas cópias da regra divergiriam, e
//  a divergência apareceria como "o app diz que já respondi e o site deixa
//  responder" — o tipo de inconsistência que destrói a confiança na tela.
// ════════════════════════════════════════════════════════════════════════════

const { supabase } = require('../utils/supabase');

/** Só os dígitos. O item de resposta guarda CPF assim (11 caracteres). */
function digitos(v) {
  return String(v || '').replace(/\D/g, '');
}

/**
 * Devolve a resposta concluída desta pessoa nesta pesquisa, ou null.
 *
 * Procura por DOIS caminhos, nesta ordem:
 *   1. `membro_id` — o vínculo já feito. Uma consulta, barata.
 *   2. CPF no item de resposta — pega a janela antes do pós-processamento.
 *
 * O CPF é opcional: sem ele, a função ainda funciona pelo primeiro caminho.
 * Membro sem CPF cadastrado é comum (743 hoje) e não pode virar erro.
 *
 * @param {{ pesquisaId: string, membroId?: string|null, cpf?: string|null }} p
 * @returns {Promise<null|{ id: string, concluida_em: string, por: 'membro'|'cpf' }>}
 */
async function acharRespostaDaPessoa({ pesquisaId, membroId, cpf }) {
  if (!pesquisaId) return null;

  if (membroId) {
    const { data, error } = await supabase
      .from('cen_resposta').select('id, concluida_em')
      .eq('pesquisa_id', pesquisaId).eq('membro_id', membroId)
      .not('concluida_em', 'is', null).is('deleted_at', null)
      .order('concluida_em', { ascending: false }).limit(1).maybeSingle();
    // ⚠️ Falha de consulta é REGISTRADA. Ela devolve "não respondeu" (fail-open
    // de propósito: barrar por erro nosso deixaria a pessoa sem responder), mas
    // em silêncio isso vira resposta duplicada sem ninguém saber por quê.
    if (error) console.error('[censo ja-respondeu] por membro:', error.message);
    if (data) return { ...data, por: 'membro' };
  }

  const doc = digitos(cpf);
  if (doc.length !== 11) return null;

  // O `!inner` é obrigatório: sem ele o PostgREST TRAZ a resposta mas não
  // FILTRA por ela, e isto passaria a dizer "já respondeu" para todo mundo.
  const { data, error: erroCpf } = await supabase
    .from('cen_resposta_item')
    .select('cen_resposta!inner(id, concluida_em, pesquisa_id, deleted_at)')
    .eq('pergunta_id', 'cpf').eq('valor_texto', doc)
    .eq('cen_resposta.pesquisa_id', pesquisaId)
    .not('cen_resposta.concluida_em', 'is', null)
    .is('cen_resposta.deleted_at', null)
    .limit(1).maybeSingle();

  if (erroCpf) console.error('[censo ja-respondeu] por CPF:', erroCpf.message);
  const r = data?.cen_resposta;
  return r ? { id: r.id, concluida_em: r.concluida_em, por: 'cpf' } : null;
}

module.exports = { acharRespostaDaPessoa, digitos };
