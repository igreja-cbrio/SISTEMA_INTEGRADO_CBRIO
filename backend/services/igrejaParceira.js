// ============================================================================
// Igreja PARCEIRA (CBA) · eventos que a CBRio opera PARA outra igreja
// ============================================================================
// Primeiro caso: Genesis numa igreja ligada à CBA (24/09/2026). A inscrição usa
// a espinha inteira (form, pagamento, check-in, comprovante), mas a PESSOA
// inscrita não é da CBRio:
//   - nunca vira cadastro (`mem_membros`) nem é ligada a um — `membro_id` fica
//     NULL pra sempre (o banco recusa o contrário · trigger
//     `trg_inscricoes_parceira_sem_membro`, migration 20260924150000);
//   - não entra em número nenhum da CBRio, fila de identidade, nem no app.
//
// ⚠️ A separação é por AUSÊNCIA, não por filtro: como a pessoa não nasce em
// `mem_membros`, NSM/KPI/jornada/cuidados já não a enxergam. Os filtros deste
// arquivo cobrem SÓ os leitores que olham `inscricoes` direto (view unificada,
// dashboard de inscrições, catálogo do app, push de evento novo).
//
// Régua: evento é de parceira ⇔ `insc_eventos.igreja_id` aponta pra uma igreja
// `tipo = 'cba_acompanhada'`. `igreja_id` NULL = CBRio (todos os eventos
// anteriores a esta mudança).
// ============================================================================
const { supabase } = require('../utils/supabase');

const TIPO_PARCEIRA = 'cba_acompanhada';

async function igrejaParceiraPorId(igrejaId) {
  if (!igrejaId) return null;
  const { data, error } = await supabase.from('igrejas')
    .select('id, nome, slug, tipo, cidade, estado, ativa')
    .eq('id', igrejaId).maybeSingle();
  if (error) throw error;
  return data && data.tipo === TIPO_PARCEIRA ? data : null;
}

/** true quando o evento (já carregado, com `igreja_id`) é de igreja parceira. */
async function eventoEhParceiro(ev) {
  if (!ev || !ev.igreja_id) return false;
  return Boolean(await igrejaParceiraPorId(ev.igreja_id));
}

/** Ids das igrejas parceiras (ativas ou não — inscrição antiga continua de lá). */
async function idsIgrejasParceiras() {
  const { data, error } = await supabase.from('igrejas').select('id').eq('tipo', TIPO_PARCEIRA);
  if (error) throw error;
  return (data || []).map((r) => r.id);
}

/** Ids dos eventos de igreja parceira — pra excluir de contagem da CBRio. */
async function idsEventosParceiros() {
  const igrejas = await idsIgrejasParceiras();
  if (!igrejas.length) return [];
  const { data, error } = await supabase.from('insc_eventos').select('id').in('igreja_id', igrejas);
  if (error) throw error;
  return (data || []).map((r) => r.id);
}

/**
 * Filtro PostgREST "só eventos da CBRio" pra uma query de `insc_eventos`
 * (coluna `igreja_id`), ou null quando não há parceira cadastrada. Uso:
 *   const f = await filtroSoEventosCbrio(); if (f) q = q.or(f);
 * ⚠️ Devolve a STRING, não a query: função async que devolve o builder do
 * supabase faz o `await` EXECUTAR a query (o builder é thenable).
 */
async function filtroSoEventosCbrio() {
  const igrejas = await idsIgrejasParceiras();
  if (!igrejas.length) return null;
  return `igreja_id.is.null,igreja_id.not.in.(${igrejas.join(',')})`;
}

module.exports = {
  TIPO_PARCEIRA,
  igrejaParceiraPorId,
  eventoEhParceiro,
  idsIgrejasParceiras,
  idsEventosParceiros,
  filtroSoEventosCbrio,
};
