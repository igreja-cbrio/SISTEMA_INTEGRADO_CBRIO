const { filtrarCampus, validarContexto } = require('../utils/campusQuery');
const { lerTodasPaginas } = require('../utils/campusPaginacao');
const { eventosAbertos, ocupacaoPorHorario } = require('./batismoHorarios');
const { ErroCampus } = require('./campusContexto');
const { dataIso } = require('../utils/batismoData');

async function listarBatismos(db, contexto, status) {
  validarContexto(contexto);
  const rows = await lerTodasPaginas(() => {
    let query = filtrarCampus(db.from('batismo_inscricoes')
      .select('*, membro:membro_id(id, nome, foto_url, cpf)'), contexto)
      .is('deleted_at', null).order('created_at', { ascending: false }).order('id');
    if (status) query = query.eq('status', status);
    return query;
  });
  const ids = [...new Set(rows.map(row => row.membro_id).filter(Boolean))];
  const conversoes = new Map();
  // O vínculo global autoriza a identidade do participante; não autoriza ler
  // atos pastorais em outros campi. O enriquecimento usa somente atos locais.
  for (let i = 0; i < ids.length; i += 200) {
    const trilhas = await lerTodasPaginas(() => filtrarCampus(db.from('mem_trilha_valores')
      .select('membro_id, data_conclusao'), contexto)
      .eq('etapa', 'conversao').eq('concluida', true).is('deleted_at', null)
      .in('membro_id', ids.slice(i, i + 200)).order('id'));
    for (const t of trilhas) if (t.data_conclusao && (!conversoes.has(t.membro_id) || t.data_conclusao < conversoes.get(t.membro_id))) conversoes.set(t.membro_id, t.data_conclusao);
  }
  return rows.map(({ codigo_acesso, codigo_conferencia, ...row }) => {
    const data_conversao = conversoes.get(row.membro_id) || null;
    return { ...row, data_conversao, dias_conversao_batismo: data_conversao && row.data_batismo
      ? Math.round((new Date(`${row.data_batismo}T12:00:00Z`) - new Date(`${data_conversao}T12:00:00Z`)) / 86400000) : null };
  });
}
async function listarHorarios(db, contexto, solicitada) {
  validarContexto(contexto);
  if (solicitada !== undefined && !dataIso(solicitada)) throw new ErroCampus(400, 'batismo_data_invalida', 'Data de batismo inválida.');
  const opcoes = { supabase: db, campusId: contexto.campus_id };
  const eventos = await eventosAbertos(24, opcoes);
  if (!eventos) throw new ErroCampus(503, 'batismo_catalogo_indisponivel', 'Catálogo de batismo indisponível.');
  const evento = solicitada ? eventos.find(e => e.data === solicitada) : eventos[0];
  if (solicitada && !evento) throw new ErroCampus(404, 'batismo_evento_ausente', 'Data não encontrada neste campus.');
  const horarios = await lerTodasPaginas(() => filtrarCampus(db.from('batismo_horarios')
    .select('*'), contexto).is('deleted_at', null).order('ordem').order('id'));
  const ocupacao = evento ? await ocupacaoPorHorario(evento.data, opcoes) : {};
  return { data_batismo: evento?.data || null, evento_id: evento?.id || null,
    horarios: horarios.map(h => ({ ...h, inscritos: ocupacao[h.horario] || 0 })) };
}
function validarHorario(body, criar) {
  const result = {};
  const invalido = message => { throw new ErroCampus(400, 'batismo_horario_invalido', message); };
  if (criar) {
    if (typeof body?.horario !== 'string' || !body.horario.trim() || body.horario.trim().length > 40) invalido('Informe um horário com até 40 caracteres.');
    result.horario = body.horario.trim();
  }
  if (criar || body?.label !== undefined) {
    const label = body?.label ?? result.horario;
    if (typeof label !== 'string' || !label.trim() || label.trim().length > 120) invalido('Informe um nome com até 120 caracteres.');
    result.label = label.trim();
  }
  if (criar || body?.limite !== undefined) {
    const valor = body?.limite;
    if (valor === null || valor === undefined || valor === '') result.limite = null;
    else if ((typeof valor !== 'string' && typeof valor !== 'number') || !/^\d+$/.test(String(valor)) || !Number.isSafeInteger(Number(valor))) invalido('O limite deve ser um número inteiro maior ou igual a zero.');
    else result.limite = Number(valor);
  }
  if (criar || body?.aberto !== undefined) {
    if (body?.aberto !== undefined && typeof body.aberto !== 'boolean') invalido('Informe se o horário está aberto.');
    result.aberto = body?.aberto ?? true;
  }
  if (criar || body?.ordem !== undefined) {
    const ordem = body?.ordem ?? 99;
    if ((typeof ordem !== 'number' && typeof ordem !== 'string') || String(ordem).trim() === '' || !Number.isSafeInteger(Number(ordem))) invalido('A ordem deve ser um número inteiro.');
    result.ordem = Number(ordem);
  }
  return result;
}
module.exports = { listarBatismos, listarHorarios, validarHorario };
