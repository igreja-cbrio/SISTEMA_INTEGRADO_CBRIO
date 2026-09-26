/** Catálogo e ocupação de batismo. Toda leitura resolve uma unidade operacional.
 * Opções de campus vêm da rota autorizada ou da porta pública, nunca são
 * autorização por si. Chamadores legados só funcionam durante preparação.
 */
const { supabase } = require('../utils/supabase');
const { DATAS_ABERTAS_PADRAO, dataIso } = require('../utils/batismoData');
const { lerTodasPaginas } = require('../utils/campusPaginacao');
const { resolverCampusOperacional } = require('./campusOperacional');

async function contexto(opcoes = {}) {
  const db = opcoes.supabase || supabase;
  return { db, id: await resolverCampusOperacional(db, opcoes.campusId) };
}

async function horariosConfigurados(opcoes = {}) {
  try {
    const { db, id } = await contexto(opcoes);
    return await lerTodasPaginas(() => db.from('batismo_horarios')
      .select('id, horario, label, aberto, limite').eq('igreja_id', id)
      .is('deleted_at', null).order('ordem').order('id'));
  } catch (error) {
    console.error('[batismoHorarios] catálogo:', error.message);
    return null;
  }
}

// Erro em qualquer página invalida a ocupação inteira. Uma contagem parcial
// jamais pode autorizar uma inscrição acima da capacidade.
async function ocupacaoPorHorario(dataBatismo, opcoes = {}) {
  if (!dataIso(dataBatismo)) throw new Error('Data de batismo inválida.');
  const { db, id } = await contexto(opcoes);
  const linhas = await lerTodasPaginas(() => db.from('batismo_inscricoes')
    .select('horario_culto').eq('igreja_id', id).eq('data_batismo', dataBatismo)
    .is('deleted_at', null).not('status', 'in', '(cancelado,rejeitado)').order('id'));
  const ocupacao = {};
  for (const linha of linhas) if (linha.horario_culto) ocupacao[linha.horario_culto] = (ocupacao[linha.horario_culto] || 0) + 1;
  return ocupacao;
}

async function eventosAbertos(n = DATAS_ABERTAS_PADRAO, opcoes = {}) {
  try {
    if (!Number.isInteger(n) || n < 1 || n > 24) throw new Error('Quantidade de datas inválida.');
    const { db, id } = await contexto(opcoes);
    const { data, error } = await db.rpc('fn_campus_batismo_datas_abertas', { p_igreja_id: id, p_n: n });
    if (error || !Array.isArray(data)) throw error || new Error('Resposta inválida do catálogo de batismo.');
    return data.map(evento => ({ id: evento.id, data: evento.data }));
  } catch (error) {
    console.error('[batismoHorarios] datas:', error.message);
    return null;
  }
}

async function datasAbertas(n = DATAS_ABERTAS_PADRAO, opcoes = {}) {
  const eventos = await eventosAbertos(n, opcoes);
  return eventos === null ? null : eventos.map(evento => evento.data);
}
async function dataProximoBatismo(opcoes = {}) {
  const datas = await datasAbertas(1, opcoes);
  return datas?.[0] || null;
}
module.exports = { horariosConfigurados, ocupacaoPorHorario, dataProximoBatismo, datasAbertas, eventosAbertos };
