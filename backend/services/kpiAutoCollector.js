// ============================================================================
// KPI Auto Collector - coleta valores automaticamente para indicadores taticos
// que tem fonte_auto definido em kpi_indicadores_taticos.
//
// Cada coletor recebe { periodo, periodicidade } e retorna { valor, observacao }
// ou null se nao houver dado suficiente para calcular.
//
// Chamado pelo cron POST /api/kpis/v2/cron/coletar (diario).
// ============================================================================

const { supabase } = require('../utils/supabase');

// ── Helpers de periodo ──────────────────────────────────────────────────────

function periodoAtual(periodicidade, date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  switch (periodicidade) {
    case 'semanal': {
      const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
      const day = d.getUTCDay() || 7;
      d.setUTCDate(d.getUTCDate() + 4 - day);
      const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
      return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
    }
    case 'mensal':     return `${y}-${m}`;
    case 'trimestral': return `${y}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
    case 'semestral':  return `${y}-S${date.getUTCMonth() < 6 ? 1 : 2}`;
    case 'anual':      return `${y}`;
    default:           return `${y}-${m}`;
  }
}

// Converte periodo (YYYY-WNN, YYYY-MM, etc) em range [inicio, fim) ISO
function periodoRange(periodo, periodicidade) {
  if (periodicidade === 'semanal') {
    const [year, week] = periodo.split('-W').map(Number);
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const day = jan4.getUTCDay() || 7;
    const monday = new Date(jan4);
    monday.setUTCDate(jan4.getUTCDate() - day + 1 + (week - 1) * 7);
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 7);
    return { inicio: monday.toISOString().slice(0, 10), fim: sunday.toISOString().slice(0, 10) };
  }
  if (periodicidade === 'mensal') {
    const [y, m] = periodo.split('-').map(Number);
    const ini = new Date(Date.UTC(y, m - 1, 1));
    const fim = new Date(Date.UTC(y, m, 1));
    return { inicio: ini.toISOString().slice(0, 10), fim: fim.toISOString().slice(0, 10) };
  }
  if (periodicidade === 'trimestral') {
    const [y, qStr] = periodo.split('-Q');
    const q = Number(qStr);
    const ini = new Date(Date.UTC(Number(y), (q - 1) * 3, 1));
    const fim = new Date(Date.UTC(Number(y), q * 3, 1));
    return { inicio: ini.toISOString().slice(0, 10), fim: fim.toISOString().slice(0, 10) };
  }
  if (periodicidade === 'semestral') {
    const [y, sStr] = periodo.split('-S');
    const s = Number(sStr);
    const ini = new Date(Date.UTC(Number(y), (s - 1) * 6, 1));
    const fim = new Date(Date.UTC(Number(y), s * 6, 1));
    return { inicio: ini.toISOString().slice(0, 10), fim: fim.toISOString().slice(0, 10) };
  }
  // anual
  const y = Number(periodo);
  return { inicio: `${y}-01-01`, fim: `${y + 1}-01-01` };
}

function isAmiBridgeCulto(c) {
  const n = (c.nome || '').toLowerCase();
  return n.includes('ami') || n.includes('bridge') || n.includes('sabado') || n.includes('sábado');
}

// ── Coletores por fonte ─────────────────────────────────────────────────────

const COLLECTORS = {
  // ── Cultos ──
  'cultos.amibridge_freq': async ({ inicio, fim }) => {
    const { data } = await supabase.from('vw_culto_stats').select('nome, presencial_adulto').gte('data', inicio).lt('data', fim);
    const total = (data || []).filter(isAmiBridgeCulto).reduce((s, c) => s + (c.presencial_adulto || 0), 0);
    return { valor: total, observacao: `${(data || []).filter(isAmiBridgeCulto).length} culto(s) AMI/Bridge` };
  },

  'cultos.amibridge_conv': async ({ inicio, fim }) => {
    const { data } = await supabase.from('vw_culto_stats').select('nome, decisoes_presenciais, decisoes_online').gte('data', inicio).lt('data', fim);
    const total = (data || []).filter(isAmiBridgeCulto).reduce((s, c) => s + (c.decisoes_presenciais || 0) + (c.decisoes_online || 0), 0);
    return { valor: total };
  },

  'cultos.kids_freq': async ({ inicio, fim }) => {
    const { data } = await supabase.from('vw_culto_stats').select('presencial_kids').gte('data', inicio).lt('data', fim);
    const total = (data || []).reduce((s, c) => s + (c.presencial_kids || 0), 0);
    return { valor: total };
  },

  'cultos.conv_visit': async ({ inicio, fim }) => {
    const { data } = await supabase.from('vw_culto_stats').select('decisoes_presenciais, decisoes_online, visitantes, visitantes_online').gte('data', inicio).lt('data', fim);
    const conv = (data || []).reduce((s, c) => s + (c.decisoes_presenciais || 0) + (c.decisoes_online || 0), 0);
    const visit = (data || []).reduce((s, c) => s + (c.visitantes || 0) + (c.visitantes_online || 0), 0);
    return { valor: conv + visit, observacao: `${conv} conversoes + ${visit} visitantes` };
  },

  // ── Cuidados ──
  'cuidados.convertidos_pos_culto': async ({ inicio, fim }) => {
    const { count: total } = await supabase.from('cui_convertidos').select('id', { count: 'exact', head: true }).gte('data_culto', inicio).lt('data_culto', fim);
    const { count: atendidos } = await supabase.from('cui_convertidos').select('id', { count: 'exact', head: true }).eq('atendido_apos_culto', true).gte('data_culto', inicio).lt('data_culto', fim);
    if (!total) return { valor: 0, observacao: 'Nenhum convertido no periodo' };
    const pct = Math.round((atendidos / total) * 100);
    return { valor: pct, observacao: `${atendidos} de ${total} atendidos` };
  },

  'cuidados.jornada180': async ({ inicio, fim }) => {
    const { count } = await supabase.from('cui_jornada180').select('id', { count: 'exact', head: true }).gte('data_encontro', inicio).lt('data_encontro', fim);
    return { valor: count || 0 };
  },

  'cuidados.atendimentos_pastorais': async ({ inicio }) => {
    // cui_atendimentos_agregado eh agregado mensal (campo 'mes' = primeiro dia do mes)
    const mes = inicio.slice(0, 7) + '-01';
    const tipos = ['capelania', 'aconselhamento', 'staff'];
    let total = 0;
    const partes = [];
    for (const tipo of tipos) {
      const { count } = await supabase.from('cui_atendimentos_agregado').select('id', { count: 'exact', head: true }).eq('mes', mes).eq('tipo', tipo);
      total += count || 0;
      if (count) partes.push(`${tipo}: ${count}`);
    }
    return { valor: total, observacao: partes.join(' | ') || 'Sem atendimentos' };
  },

  'cuidados.engajados_valor': async ({ inicio, fim }) => {
    // Convertidos no periodo que aparecem em pelo menos 1 valor (grupos OR voluntariado OR doadores)
    // Approximacao: convertidos cadastrados / total de convertidos
    const { count: total } = await supabase.from('cui_convertidos').select('id', { count: 'exact', head: true }).gte('data_culto', inicio).lt('data_culto', fim);
    const { count: cadastrados } = await supabase.from('cui_convertidos').select('id', { count: 'exact', head: true }).eq('cadastrado', true).gte('data_culto', inicio).lt('data_culto', fim);
    if (!total) return { valor: 0, observacao: 'Sem convertidos' };
    const pct = Math.round((cadastrados / total) * 100);
    return { valor: pct, observacao: `${cadastrados} de ${total} cadastrados (proxy de engajamento)` };
  },

  // ── Grupos ──
  'grupos.total_grupos': async () => {
    const { count } = await supabase.from('mem_grupos').select('id', { count: 'exact', head: true }).eq('ativo', true);
    return { valor: count || 0 };
  },

  'grupos.participantes': async () => {
    const { count } = await supabase.from('mem_grupo_membros').select('id', { count: 'exact', head: true }).is('saiu_em', null);
    return { valor: count || 0, observacao: 'Membros ativos em grupos' };
  },

  // ── Voluntariado ──
  'voluntariado.ativos': async ({ inicio }) => {
    try {
      const { data } = await supabase.rpc('kpi_servir_comunidade', { _since: inicio });
      const valor = (data && data[0]?.voluntarios_ativos) || 0;
      return { valor, observacao: 'Via kpi_servir_comunidade RPC' };
    } catch (e) {
      return null;
    }
  },

  'voluntariado.escalados': async ({ inicio, fim }) => {
    // % de voluntarios ativos que tiveram escala no periodo
    try {
      const { data } = await supabase.rpc('kpi_servir_comunidade', { _since: inicio });
      const ativos = (data && data[0]?.voluntarios_ativos) || 0;
      const escalados = (data && data[0]?.voluntarios_escalados) || 0;
      if (!ativos) return { valor: 0, observacao: 'Sem voluntarios ativos' };
      const pct = Math.round((escalados / ativos) * 100);
      return { valor: pct, observacao: `${escalados} escalados de ${ativos} ativos` };
    } catch (e) {
      return null;
    }
  },

  'voluntariado.funil': async ({ inicio, fim }) => {
    // Aproximacao: novos cadastros de membros ativos no periodo
    const { count } = await supabase.from('mem_membros').select('id', { count: 'exact', head: true }).gte('created_at', inicio).lt('created_at', fim);
    return { valor: count || 0, observacao: 'Novos membros (aprox. funil)' };
  },

  // ── Batismos ──
  'batismos.kids': async ({ inicio, fim }) => {
    // Aceitacoes + batismos de criancas no periodo
    // Usa batismos com idade <= 12 (Kids); ajustar conforme schema real
    try {
      const { count } = await supabase.from('batismos')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', inicio).lt('created_at', fim);
      return { valor: count || 0, observacao: 'Total batismos no periodo (filtro Kids pendente)' };
    } catch (e) {
      return null;
    }
  },
};

// ── Coletor master ──────────────────────────────────────────────────────────

async function coletarTodos({ dryRun = false } = {}) {
  const { data: indicadores, error } = await supabase
    .from('kpi_indicadores_taticos')
    .select('id, periodicidade, fonte_auto, indicador, area')
    .eq('ativo', true)
    .not('fonte_auto', 'is', null);

  if (error) throw error;

  const resultados = [];
  for (const ind of (indicadores || [])) {
    const collector = COLLECTORS[ind.fonte_auto];
    if (!collector) {
      resultados.push({ id: ind.id, status: 'sem_coletor', fonte: ind.fonte_auto });
      continue;
    }

    const periodo = periodoAtual(ind.periodicidade);
    const range = periodoRange(periodo, ind.periodicidade);

    try {
      const result = await collector({ ...range, periodo, periodicidade: ind.periodicidade });
      if (result == null) {
        resultados.push({ id: ind.id, status: 'sem_dado', periodo });
        continue;
      }
      const { valor, observacao } = result;

      if (dryRun) {
        resultados.push({ id: ind.id, status: 'dry_run', periodo, valor, observacao });
        continue;
      }

      // Upsert no kpi_registros (so atualiza se origem='auto' OU nao existir)
      // Nao sobrescreve lancamentos manuais
      const { data: existente } = await supabase
        .from('kpi_registros')
        .select('id, origem')
        .eq('indicador_id', ind.id)
        .eq('periodo_referencia', periodo)
        .maybeSingle();

      if (existente && existente.origem === 'manual') {
        resultados.push({ id: ind.id, status: 'pulou_manual', periodo, valor });
        continue;
      }

      const payload = {
        indicador_id: ind.id,
        periodo_referencia: periodo,
        valor_realizado: valor,
        observacoes: observacao || null,
        responsavel: 'sistema',
        origem: 'auto',
        data_preenchimento: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { error: upErr } = await supabase
        .from('kpi_registros')
        .upsert(payload, { onConflict: 'indicador_id,periodo_referencia' });

      if (upErr) {
        resultados.push({ id: ind.id, status: 'erro', erro: upErr.message });
      } else {
        resultados.push({ id: ind.id, status: 'ok', periodo, valor });
      }
    } catch (e) {
      resultados.push({ id: ind.id, status: 'erro', erro: e.message });
    }
  }

  return resultados;
}

module.exports = { coletarTodos, COLLECTORS, periodoAtual, periodoRange };
