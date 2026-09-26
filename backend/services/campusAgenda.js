const { ErroCampus } = require('./campusContexto');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TAMANHO_PAGINA = 1000;

function janelaAgenda(agora = new Date()) {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(agora);
  const obter = tipo => Number(partes.find(p => p.type === tipo)?.value);
  const ano = obter('year'); const mes = obter('month'); const dia = obter('day');
  const inicio = `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  const ultimoDia = new Date(Date.UTC(ano, mes + 3, 0)).getUTCDate();
  const fim = new Date(Date.UTC(ano, mes + 2, Math.min(dia, ultimoDia))).toISOString().slice(0, 10);
  return { inicio, fim };
}

async function listarCampiComAgenda(supabase) {
  const { data: config, error } = await supabase.from('app_campus_config')
    .select('estado, campus_legado_id, ja_ativado').eq('id', true).maybeSingle();
  if (error || !config || !UUID.test(config.campus_legado_id || '')
    || !['preparacao', 'ensaio', 'ativo'].includes(config.estado)
    || (config.estado === 'preparacao' ? config.ja_ativado !== false : config.ja_ativado !== true)) {
    throw new ErroCampus(503, 'campus_configuracao_pendente', 'A configuração de campus não permite gerar a agenda.');
  }
  const campi = new Map();
  for (let pagina = 0; pagina < 1000; pagina += 1) {
    let consulta = supabase.from('vol_campus_service_types')
      .select('igreja_id, service_type_id, igrejas!inner(id, nome, ativa, tipo)')
      .eq('is_active', true).eq('igrejas.ativa', true).eq('igrejas.tipo', 'sede')
      .order('igreja_id').order('service_type_id')
      .range(pagina * TAMANHO_PAGINA, (pagina + 1) * TAMANHO_PAGINA - 1);
    if (config.estado === 'preparacao') consulta = consulta.eq('igreja_id', config.campus_legado_id);
    const { data, error: erroAgenda } = await consulta;
    if (erroAgenda || !Array.isArray(data)) throw new ErroCampus(503, 'campus_agenda_indisponivel', 'Não foi possível carregar as agendas de campus.');
    for (const item of data) {
      const igreja = Array.isArray(item.igrejas) ? item.igrejas[0] : item.igrejas;
      if (!UUID.test(item.igreja_id || '') || igreja?.id !== item.igreja_id || igreja?.ativa !== true || igreja?.tipo !== 'sede') {
        throw new ErroCampus(503, 'campus_agenda_invalida', 'A agenda possui uma origem de campus inválida.');
      }
      if (config.estado === 'preparacao' && item.igreja_id !== config.campus_legado_id) {
        throw new ErroCampus(503, 'campus_agenda_invalida', 'A preparação permite somente a agenda do campus legado.');
      }
      campi.set(item.igreja_id, Object.freeze({ id: item.igreja_id, nome: igreja.nome }));
    }
    if (data.length < TAMANHO_PAGINA) return { estado: config.estado, campi: [...campi.values()] };
  }
  throw new ErroCampus(503, 'campus_agenda_limite', 'A agenda excedeu o limite de consulta. Nenhum campus foi processado.');
}

// Não recebe req/header: o cron processa origens cadastradas no servidor.
// A RPC agrega no banco para não truncar a contagem no teto do PostgREST.
async function gerarAgendaDosCampi({ supabase, agora = new Date() }) {
  const { campi } = await listarCampiComAgenda(supabase);
  const { inicio, fim } = janelaAgenda(agora);
  const resultados = [];
  for (const campus of campi) {
    try {
      const { data, error } = await supabase.rpc('fn_campus_gerar_cultos_resumo', {
        p_igreja_id: campus.id, p_data_inicio: inicio, p_data_fim: fim,
      });
      if (error) throw error;
      if (!data || !Number.isInteger(data.total) || !Number.isInteger(data.criados)
        || !Number.isInteger(data.ja_existia) || data.total < 0 || data.criados < 0
        || data.ja_existia < 0 || data.criados + data.ja_existia !== data.total) throw new Error('Resumo inválido');
      resultados.push({ igreja_id: campus.id, ok: true, total: data.total, criados: data.criados, ja_existia: data.ja_existia });
    } catch {
      // Um campus indisponível não impede os demais. Retry roda todos novamente;
      // a unicidade (campus,tipo,data) torna a RPC idempotente.
      resultados.push({ igreja_id: campus.id, ok: false, error: 'Não foi possível gerar os cultos deste campus.' });
    }
  }
  const concluidos = resultados.filter(r => r.ok);
  return {
    ok: concluidos.length === resultados.length, inicio, ate: fim,
    total: concluidos.reduce((soma, r) => soma + r.total, 0),
    criados: concluidos.reduce((soma, r) => soma + r.criados, 0),
    campi: resultados,
  };
}

module.exports = { janelaAgenda, listarCampiComAgenda, gerarAgendaDosCampi };
