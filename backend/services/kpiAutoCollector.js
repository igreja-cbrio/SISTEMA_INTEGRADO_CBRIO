// ============================================================================
// KPI Auto Collector - coleta valores automaticamente para indicadores taticos
// que tem fonte_auto definido em kpi_indicadores_taticos.
//
// Cada coletor recebe { período, periodicidade } e retorna { valor, observação }
// ou null se não houver dado suficiente para calcular.
//
// Chamado pelo cron POST /api/kpis/v2/cron/coletar (diario).
// ============================================================================

const { supabase } = require('../utils/supabase');

// ── Helpers de período ──────────────────────────────────────────────────────

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

// Converte período (YYYY-WNN, YYYY-MM, etc) em range [início, fim) ISO
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

// Filtros por service_type_name (vw_culto_stats expoe esse campo via JOIN).
// Robusto contra variacoes no nome do culto (ex: "AMI — 17/05/2026").
// Fallback para nome.includes() pra cultos avulsos sem service_type_id.
function isAmiCulto(c) {
  const t = (c.service_type_name || '').toLowerCase();
  if (t) return t === 'ami';
  const n = (c.nome || '').toLowerCase();
  return (n.includes('ami') || n.includes('sabado') || n.includes('sábado')) && !n.includes('bridge');
}

function isBridgeCulto(c) {
  const t = (c.service_type_name || '').toLowerCase();
  if (t) return t === 'bridge';
  const n = (c.nome || '').toLowerCase();
  return n.includes('bridge');
}

// Sede · 4 horarios de domingo + Quarta com Deus
function isSedeCulto(c) {
  const t = (c.service_type_name || '').toLowerCase();
  return t.startsWith('domingo') || t === 'quarta com deus';
}

// Mantido por compat retroativa: cultos AMI ou Bridge (consolidacao antiga).
function isAmiBridgeCulto(c) {
  return isAmiCulto(c) || isBridgeCulto(c);
}

// ── Coletores por fonte ─────────────────────────────────────────────────────

// Coorte dos primeiros 90 dias: dos convertidos do período/área, % que cumpriu
// o marco (batismo ou Next) em <=90 dias da conversão. Cruza por membro/cpf/nome.
async function cohortNoPrazoPct({ inicio, fim, area, marco }) {
  const DIA = 86400000;
  const dig = (v) => String(v || '').replace(/\D/g, '');
  const fetchAll = async (table, columns, applyFilter) => {
    const out = []; let from = 0; const page = 1000;
    while (true) {
      let q = supabase.from(table).select(columns).range(from, from + page - 1);
      if (applyFilter) q = applyFilter(q);
      const { data, error } = await q;
      if (error) throw error;
      out.push(...(data || []));
      if (!data || data.length < page) break;
      from += page;
    }
    return out;
  };

  let cq = supabase.from('cui_convertidos')
    .select('id, nome, cpf, membro_id, data_culto')
    .is('deleted_at', null).gte('data_culto', inicio).lt('data_culto', fim);
  if (area) cq = cq.eq('area', area);
  const { data: convs } = await cq;
  if (!convs || !convs.length) return null;

  const byMembro = new Map(), byCpf = new Map(), byNome = new Map();
  const put = (m, k, d) => { if (!k || !d) return; const c = m.get(k); if (!c || d < c) m.set(k, d); }; // guarda a data mais antiga
  if (marco === 'batismo') {
    const rows = await fetchAll('batismo_inscricoes', 'membro_id, cpf, nome, data_batismo',
      q => q.eq('status', 'realizado').is('deleted_at', null).not('data_batismo', 'is', null));
    for (const b of rows) { put(byMembro, b.membro_id, b.data_batismo); put(byCpf, dig(b.cpf).length === 11 ? dig(b.cpf) : null, b.data_batismo); put(byNome, String(b.nome || '').trim().toLowerCase() || null, b.data_batismo); }
  } else {
    // Next "feito" = formado na turma (presente em todos os encontros) · data = último encontro da turma
    const mats = await fetchAll('next_matriculas', 'membro_id, nome, cpf, turma_id, status', q => q.eq('status', 'formado').is('deleted_at', null));
    const turmaIds = [...new Set(mats.map(m => m.turma_id).filter(Boolean))];
    const dataPorTurma = new Map();
    if (turmaIds.length) {
      const encs = await fetchAll('next_encontros', 'turma_id, data', q => q.in('turma_id', turmaIds).not('data', 'is', null));
      for (const e of encs) { const d = String(e.data).slice(0, 10); const cur = dataPorTurma.get(e.turma_id); if (!cur || d > cur) dataPorTurma.set(e.turma_id, d); }
    }
    for (const n of mats) {
      const d = dataPorTurma.get(n.turma_id); if (!d) continue;
      put(byMembro, n.membro_id, d); put(byCpf, dig(n.cpf).length === 11 ? dig(n.cpf) : null, d); put(byNome, String(n.nome || '').trim().toLowerCase() || null, d);
    }
  }
  const dataEventoDe = (c) => {
    const cands = [c.membro_id ? byMembro.get(c.membro_id) : null, dig(c.cpf).length === 11 ? byCpf.get(dig(c.cpf)) : null, byNome.get(String(c.nome || '').trim().toLowerCase())].filter(Boolean);
    return cands.length ? cands.sort()[0] : null;
  };

  let noPrazo = 0;
  for (const c of convs) {
    const dEvento = dataEventoDe(c);
    if (!dEvento) continue;
    const dias = Math.floor((new Date(dEvento + 'T12:00:00').getTime() - new Date(c.data_culto + 'T12:00:00').getTime()) / DIA);
    if (dias >= 0 && dias <= 90) noPrazo++;
  }
  return { valor: Math.round((noPrazo / convs.length) * 100), observacao: `${noPrazo} de ${convs.length} em <=90 dias` };
}

const COLLECTORS = {
  // ── Cultos: AMI (separado de Bridge) ──
  'cultos.ami_freq': async ({ inicio, fim }) => {
    const { data } = await supabase.from('vw_culto_stats').select('nome, service_type_name, presencial_adulto').gte('data', inicio).lt('data', fim);
    const ami = (data || []).filter(isAmiCulto);
    const total = ami.reduce((s, c) => s + (c.presencial_adulto || 0), 0);
    return { valor: total, observacao: `${ami.length} culto(s) AMI` };
  },

  'cultos.ami_conv': async ({ inicio, fim }) => {
    const { data } = await supabase.from('vw_culto_stats').select('nome, service_type_name, decisoes_presenciais, decisoes_online').gte('data', inicio).lt('data', fim);
    const ami = (data || []).filter(isAmiCulto);
    const total = ami.reduce((s, c) => s + (c.decisoes_presenciais || 0) + (c.decisoes_online || 0), 0);
    return { valor: total, observacao: `${ami.length} culto(s) AMI` };
  },

  // ── Cultos: Bridge (separado de AMI) ──
  'cultos.bridge_freq': async ({ inicio, fim }) => {
    const { data } = await supabase.from('vw_culto_stats').select('nome, service_type_name, presencial_adulto').gte('data', inicio).lt('data', fim);
    const bridge = (data || []).filter(isBridgeCulto);
    const total = bridge.reduce((s, c) => s + (c.presencial_adulto || 0), 0);
    return { valor: total, observacao: `${bridge.length} culto(s) Bridge` };
  },

  'cultos.bridge_conv': async ({ inicio, fim }) => {
    const { data } = await supabase.from('vw_culto_stats').select('nome, service_type_name, decisoes_presenciais, decisoes_online').gte('data', inicio).lt('data', fim);
    const bridge = (data || []).filter(isBridgeCulto);
    const total = bridge.reduce((s, c) => s + (c.decisoes_presenciais || 0) + (c.decisoes_online || 0), 0);
    return { valor: total, observacao: `${bridge.length} culto(s) Bridge` };
  },

  // ── Cultos: AMI+Bridge consolidado (DEPRECATED — manter até cleanup) ──
  'cultos.amibridge_freq': async ({ inicio, fim }) => {
    const { data } = await supabase.from('vw_culto_stats').select('nome, service_type_name, presencial_adulto').gte('data', inicio).lt('data', fim);
    const total = (data || []).filter(isAmiBridgeCulto).reduce((s, c) => s + (c.presencial_adulto || 0), 0);
    return { valor: total, observacao: `${(data || []).filter(isAmiBridgeCulto).length} culto(s) AMI/Bridge (DEPRECATED)` };
  },

  'cultos.amibridge_conv': async ({ inicio, fim }) => {
    const { data } = await supabase.from('vw_culto_stats').select('nome, service_type_name, decisoes_presenciais, decisoes_online').gte('data', inicio).lt('data', fim);
    const total = (data || []).filter(isAmiBridgeCulto).reduce((s, c) => s + (c.decisoes_presenciais || 0) + (c.decisoes_online || 0), 0);
    return { valor: total, observacao: 'DEPRECATED: usar cultos.ami_conv ou cultos.bridge_conv' };
  },

  'cultos.kids_freq': async ({ inicio, fim }) => {
    const { data } = await supabase.from('vw_culto_stats').select('presencial_kids').gte('data', inicio).lt('data', fim);
    const total = (data || []).reduce((s, c) => s + (c.presencial_kids || 0), 0);
    return { valor: total };
  },

  // Conversões/decisões do Kids · soma de cultos.decisoes_kids no período
  // (mesma fonte do consolidado do totem/integração). Faltava o coletor kids
  // (ami/bridge/sede/online já existiam) → KIDS-02 ficava sem dado.
  'cultos.kids_conv': async ({ inicio, fim }) => {
    const { data } = await supabase.from('cultos').select('decisoes_kids, data').gte('data', inicio).lt('data', fim);
    const total = (data || []).reduce((s, c) => s + (c.decisoes_kids || 0), 0);
    return { valor: total, observacao: `${total} decisão(ões) kids no período` };
  },

  // ── Cultos: Sede (Domingos + Quarta com Deus) ──
  'cultos.sede_freq': async ({ inicio, fim }) => {
    const { data } = await supabase.from('vw_culto_stats').select('nome, service_type_name, presencial_adulto').gte('data', inicio).lt('data', fim);
    const sede = (data || []).filter(isSedeCulto);
    const total = sede.reduce((s, c) => s + (c.presencial_adulto || 0), 0);
    return { valor: total, observacao: `${sede.length} culto(s) Sede` };
  },

  'cultos.sede_conv': async ({ inicio, fim }) => {
    const { data } = await supabase.from('vw_culto_stats').select('nome, service_type_name, decisoes_presenciais, decisoes_online').gte('data', inicio).lt('data', fim);
    const sede = (data || []).filter(isSedeCulto);
    const total = sede.reduce((s, c) => s + (c.decisoes_presenciais || 0) + (c.decisoes_online || 0), 0);
    return { valor: total, observacao: `${sede.length} culto(s) Sede` };
  },

  // ── Cultos: Online (audiencia via stream · soma de pico online no período) ──
  'cultos.online_freq': async ({ inicio, fim }) => {
    const { data } = await supabase.from('cultos').select('online_pico').gte('data', inicio).lt('data', fim).not('online_pico', 'is', null);
    const cultos = (data || []).filter(c => (c.online_pico || 0) > 0);
    const total = cultos.reduce((s, c) => s + (c.online_pico || 0), 0);
    return { valor: total, observacao: `${cultos.length} culto(s) com transmissão` };
  },

  'cultos.online_conv': async ({ inicio, fim }) => {
    const { data } = await supabase.from('cultos').select('decisoes_online').gte('data', inicio).lt('data', fim).not('decisoes_online', 'is', null);
    const total = (data || []).reduce((s, c) => s + (c.decisoes_online || 0), 0);
    return { valor: total };
  },

  // Antes somava conversoes + visitantes · Marcos descontinuou contagem de
  // visitantes em 2026-05-14 (PR #399), então agora soma so as conversoes.
  // KPI deixa de misturar entidades · número do indicador fica interpretavel.
  'cultos.conv_visit': async ({ inicio, fim }) => {
    const { data } = await supabase.from('vw_culto_stats').select('decisoes_presenciais, decisoes_online').gte('data', inicio).lt('data', fim);
    const conv = (data || []).reduce((s, c) => s + (c.decisoes_presenciais || 0) + (c.decisoes_online || 0), 0);
    return { valor: conv, observacao: `${conv} conversoes` };
  },

  // ── Online · KPIs especificos do canal (so /minha-area, NÃO entram em painel NSM) ──
  // Marcos: "enquadre isso como dados apenas e crie kpis específicos do online
  //          que só são do online (então eles não entram no painel nsm pois não
  //          tem cross, so entram na minha área)"
  // Os 3 KPIs ON-AUD-01 / ON-DS-01 / ON-DDUS-01 tem valores=NULL · /painel filtra
  // por valores.includes(v), então não aparecem em mandala/matriz. /minha-area
  // mostra todos os ativos da área.

  'cultos.online_pico_avg': async ({ inicio, fim }) => {
    const { data } = await supabase
      .from('cultos')
      .select('online_pico')
      .gte('data', inicio).lt('data', fim)
      .not('online_pico', 'is', null);
    const vals = (data || []).map(c => c.online_pico).filter(v => v > 0);
    if (vals.length === 0) return { valor: 0, observacao: 'Nenhum culto com pico online no período' };
    const media = Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
    return { valor: media, observacao: `Media de ${vals.length} culto(s)` };
  },

  'cultos.online_ds_total': async ({ inicio, fim }) => {
    const { data } = await supabase
      .from('cultos')
      .select('online_ds')
      .gte('data', inicio).lt('data', fim)
      .not('online_ds', 'is', null);
    const total = (data || []).reduce((s, c) => s + (c.online_ds || 0), 0);
    return { valor: total, observacao: `${(data || []).length} culto(s) com vídeo` };
  },

  'cultos.online_ddus_total': async ({ inicio, fim }) => {
    const { data } = await supabase
      .from('cultos')
      .select('online_ddus')
      .gte('data', inicio).lt('data', fim)
      .not('online_ddus', 'is', null);
    const total = (data || []).reduce((s, c) => s + (c.online_ddus || 0), 0);
    return { valor: total, observacao: `${(data || []).length} culto(s) com vídeo` };
  },

  // ── Cuidados ──
  'cuidados.convertidos_pos_culto': async ({ inicio, fim }) => {
    const { count: total } = await supabase.from('cui_convertidos').select('id', { count: 'exact', head: true }).gte('data_culto', inicio).lt('data_culto', fim);
    const { count: atendidos } = await supabase.from('cui_convertidos').select('id', { count: 'exact', head: true }).eq('atendido_apos_culto', true).gte('data_culto', inicio).lt('data_culto', fim);
    if (!total) return { valor: 0, observacao: 'Nenhum convertido no período' };
    const pct = Math.round((atendidos / total) * 100);
    return { valor: pct, observacao: `${atendidos} de ${total} atendidos` };
  },

  // ── Jornada do novo convertido · 3 marcos (alimentam a matriz Seguir × Área) ──
  // coorte mensal por área · o coletor recebe `area` (passado em coletarTodos)
  'cuidados.reuniao_aceita_pct': async ({ inicio, fim, area }) => {
    let q = supabase.from('cui_convertidos').select('id, encontro_marcado')
      .is('deleted_at', null).gte('data_culto', inicio).lt('data_culto', fim);
    if (area) q = q.eq('area', area);
    const { data } = await q;
    if (!data || !data.length) return null;
    const aceitos = data.filter(c => c.encontro_marcado).length;
    return { valor: Math.round((aceitos / data.length) * 100), observacao: `${aceitos} de ${data.length} aceitaram a reunião` };
  },

  'cuidados.batismo_90d_pct': async ({ inicio, fim, area }) => cohortNoPrazoPct({ inicio, fim, area, marco: 'batismo' }),

  'cuidados.next_90d_pct': async ({ inicio, fim, area }) => cohortNoPrazoPct({ inicio, fim, area, marco: 'next' }),

  'cuidados.jornada180': async ({ inicio, fim }) => {
    const { count } = await supabase.from('cui_jornada180').select('id', { count: 'exact', head: true }).gte('data_encontro', inicio).lt('data_encontro', fim);
    return { valor: count || 0 };
  },

  'cuidados.atendimentos_pastorais': async ({ inicio }) => {
    // Conta os atendimentos pastorais REAIS do mês (cui_acompanhamentos por tipo),
    // não mais a entrada manual mensal de cui_atendimentos_agregado (aposentada na Fase 2).
    const mesIni = inicio.slice(0, 7) + '-01';
    const dt = new Date(mesIni + 'T12:00:00'); dt.setMonth(dt.getMonth() + 1);
    const mesFim = dt.toISOString().slice(0, 10);
    const tipos = ['capelania', 'aconselhamento'];
    let total = 0;
    const partes = [];
    for (const tipo of tipos) {
      const { count } = await supabase.from('cui_acompanhamentos')
        .select('id', { count: 'exact', head: true })
        .is('deleted_at', null).eq('tipo', tipo)
        .gte('created_at', mesIni).lt('created_at', mesFim);
      total += count || 0;
      if (count) partes.push(`${tipo}: ${count}`);
    }
    return { valor: total, observacao: partes.join(' | ') || 'Sem atendimentos' };
  },

  'cuidados.engajados_valor': async () => {
    // CUID-05: % novos convertidos engajados em ao menos 1 dos 5 valores
    // Calcula real: convertidos com pelo menos 1 valor ativo
    const d90 = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
    const { data: convertidos } = await supabase.from('cui_convertidos').select('membro_id').not('membro_id', 'is', null);
    const membroIds = [...new Set((convertidos || []).map(c => c.membro_id).filter(Boolean))];
    if (membroIds.length === 0) return { valor: 0, observacao: 'Sem convertidos com membro vinculado' };

    const [grupos, vols, contribs] = await Promise.all([
      supabase.from('mem_grupo_membros').select('membro_id').in('membro_id', membroIds).is('saiu_em', null),
      supabase.from('mem_voluntarios').select('membro_id').in('membro_id', membroIds).is('ate', null),
      supabase.from('mem_contribuicoes').select('membro_id').in('membro_id', membroIds).gte('data', d90),
    ]);
    const engajados = new Set([
      ...(grupos.data || []).map(g => g.membro_id),
      ...(vols.data || []).map(v => v.membro_id),
      ...(contribs.data || []).map(c => c.membro_id),
    ]);
    const pct = Math.round((engajados.size / membroIds.length) * 100);
    return { valor: pct, observacao: `${engajados.size} de ${membroIds.length} convertidos com 1+ valor` };
  },

  'cuidados.membros_2mais_valores': async () => {
    // CUID-06: % de membros envolvidos em 2+ valores
    const d90 = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
    const { data: membros } = await supabase.from('mem_membros').select('id').eq('active', true);
    if (!membros || membros.length === 0) return { valor: 0, observacao: 'Sem membros ativos' };

    const ids = membros.map(m => m.id);
    const [trilha, grupos, j180, vols, contribs] = await Promise.all([
      supabase.from('mem_trilha_valores').select('membro_id').in('membro_id', ids).in('etapa', ['conversao', 'primeiro_contato', 'batismo']).eq('concluida', true),
      supabase.from('mem_grupo_membros').select('membro_id').in('membro_id', ids).is('saiu_em', null),
      supabase.from('cui_jornada180').select('membro_id').in('membro_id', ids).gte('data_encontro', d90),
      supabase.from('mem_voluntarios').select('membro_id').in('membro_id', ids).is('ate', null),
      supabase.from('mem_contribuicoes').select('membro_id').in('membro_id', ids).gte('data', d90),
    ]);
    const sets = {
      seguir: new Set((trilha.data || []).map(t => t.membro_id)),
      conectar: new Set((grupos.data || []).map(g => g.membro_id)),
      investir: new Set((j180.data || []).map(j => j.membro_id)),
      servir: new Set((vols.data || []).map(v => v.membro_id)),
      generosidade: new Set((contribs.data || []).map(c => c.membro_id)),
    };
    let com2mais = 0;
    for (const id of ids) {
      const count = Object.values(sets).filter(s => s.has(id)).length;
      if (count >= 2) com2mais++;
    }
    const pct = Math.round((com2mais / ids.length) * 100);
    return { valor: pct, observacao: `${com2mais} de ${ids.length} membros com 2+ valores` };
  },

  // ── Cuidados · Devocional + Jornada 180 inscrições ──
  // Devocional: count distinct membros que registraram pelo menos 1 devocional
  // no período (do módulo de Cuidados → aba Devocional, tabela mem_devocionais)
  'cuidados.devocional_membros': async ({ inicio, fim }) => {
    const { data } = await supabase
      .from('mem_devocionais')
      .select('membro_id, concluida')
      .eq('concluida', true)
      .gte('data_devocional', inicio)
      .lt('data_devocional', fim);
    const distinct = new Set((data || []).map(d => d.membro_id));
    return {
      valor: distinct.size,
      observacao: `${distinct.size} membros fizeram pelo menos 1 devocional no período`,
    };
  },

  // Jornada 180 inscrições: count distinct membros na etapa 1 do período
  // (primeiro encontro = "inscrição" funcional)
  'cuidados.jornada180_inscricoes': async ({ inicio, fim }) => {
    const { data } = await supabase
      .from('cui_jornada180')
      .select('membro_id, nome')
      .eq('etapa', 1)
      .gte('data_encontro', inicio)
      .lt('data_encontro', fim);
    // Conta por membro_id quando existe, senao por nome (visitantes)
    const distinct = new Set((data || []).map(d => d.membro_id || `nome:${d.nome}`));
    return {
      valor: distinct.size,
      observacao: `${distinct.size} pessoas iniciaram a Jornada 180 (etapa 1)`,
    };
  },

  // ── Grupos · Supervisao (líderes treinados + acompanhados) ──
  'grupos.lideres_treinados': async () => {
    // Count membros com funcao='lider_treinamento' ativos (saiu_em IS NULL)
    const { count } = await supabase
      .from('mem_grupo_membros')
      .select('id', { count: 'exact', head: true })
      .eq('funcao', 'lider_treinamento')
      .is('saiu_em', null);
    return {
      valor: count || 0,
      observacao: `${count || 0} membros marcados como líder em treinamento (Grupos)`,
    };
  },

  'grupos.lideres_acompanhados': async ({ inicio, fim }) => {
    // Count distinct grupo_id visitado no período (cada supervisor visitou X grupos distintos)
    // Só status='realizada' conta · visita agendada (futura) não é acompanhamento feito
    const { data } = await supabase
      .from('grupo_supervisao_visitas')
      .select('grupo_id')
      .eq('status', 'realizada')
      .gte('data_visita', inicio)
      .lt('data_visita', fim);
    const distinct = new Set((data || []).map(v => v.grupo_id));
    return {
      valor: distinct.size,
      observacao: `${distinct.size} grupos visitados no período`,
    };
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
    // % de voluntários ativos que tiveram escala no período
    try {
      const { data } = await supabase.rpc('kpi_servir_comunidade', { _since: inicio });
      const ativos = (data && data[0]?.voluntarios_ativos) || 0;
      const escalados = (data && data[0]?.voluntarios_escalados) || 0;
      if (!ativos) return { valor: 0, observacao: 'Sem voluntários ativos' };
      const pct = Math.round((escalados / ativos) * 100);
      return { valor: pct, observacao: `${escalados} escalados de ${ativos} ativos` };
    } catch (e) {
      return null;
    }
  },

  'voluntariado.funil': async ({ inicio, fim }) => {
    // Aproximacao: novos cadastros de membros ativos no período
    const { count } = await supabase.from('mem_membros').select('id', { count: 'exact', head: true }).gte('created_at', inicio).lt('created_at', fim);
    return { valor: count || 0, observacao: 'Novos membros (aprox. funil)' };
  },

  // ── Integração - 1x1 mensal ──
  // % = (voluntários da Integração com reunião 1x1 no mês)
  //     / (total voluntários ativos da Integração) * 100
  'integracao.1x1_mensal': async ({ inicio, fim }) => {
    const { data: teams } = await supabase
      .from('vol_teams')
      .select('id')
      .ilike('name', '%integ%');
    const teamIds = (teams || []).map(t => t.id);
    if (teamIds.length === 0) return { valor: 0, observacao: 'Equipe Integração não encontrada' };

    // Voluntários ativos na Integração
    const { data: members } = await supabase
      .from('vol_team_members')
      .select('volunteer_profile_id')
      .in('team_id', teamIds);
    const profileIds = [...new Set((members || []).map(m => m.volunteer_profile_id).filter(Boolean))];
    if (profileIds.length === 0) return { valor: 0, observacao: 'Sem voluntários na Integração' };

    // Voluntários com 1x1 no período
    const { data: meetings } = await supabase
      .from('vol_1x1_meetings')
      .select('volunteer_profile_id')
      .in('team_id', teamIds)
      .gte('meeting_date', inicio)
      .lt('meeting_date', fim);
    const comReuniaoSet = new Set((meetings || []).map(m => m.volunteer_profile_id));
    const comReuniao = profileIds.filter(id => comReuniaoSet.has(id)).length;

    const pct = Math.round((comReuniao / profileIds.length) * 100);
    return {
      valor: pct,
      observacao: `${comReuniao} de ${profileIds.length} voluntários da Integração com 1x1 no mês`,
    };
  },

  // ── Integração - voluntários em treinamento ──
  // % = (voluntários da Integração que fizeram check-in de treinamento no período)
  //     / (total de voluntários ativos na equipe Integração) * 100
  'integracao.treinamento': async ({ inicio, fim }) => {
    // Buscar a equipe Integração
    const { data: teams } = await supabase
      .from('vol_teams')
      .select('id, name')
      .ilike('name', '%integ%');

    const teamIds = (teams || []).map(t => t.id);
    if (teamIds.length === 0) {
      return { valor: 0, observacao: 'Equipe Integração não encontrada em vol_teams' };
    }

    // Denominador: voluntários ativos na equipe Integração
    const { count: ativos } = await supabase
      .from('vol_team_members')
      .select('id', { count: 'exact', head: true })
      .in('team_id', teamIds);

    if (!ativos) {
      return { valor: 0, observacao: 'Sem voluntários na equipe Integração' };
    }

    // Numerador: voluntários distintos com check-in de treinamento (team Integração) no período
    const { data: checkins } = await supabase
      .from('vol_training_checkins')
      .select('volunteer_name')
      .gte('created_at', inicio)
      .lt('created_at', fim)
      .ilike('team_name', '%integ%');

    const treinandoSet = new Set((checkins || []).map(c => c.volunteer_name?.toLowerCase().trim()).filter(Boolean));
    const treinando = treinandoSet.size;

    const pct = Math.round((treinando / ativos) * 100);
    return {
      valor: pct,
      observacao: `${treinando} em treinamento de ${ativos} voluntários ativos da Integração`,
    };
  },

  // ── NEXT - automatizacoes pos-NEXT ──
  // NEXT-01: % inscritos NÃO batizados pre-NEXT que viraram batizandos
  //          (indicaram batismo no NEXT do mês)
  'next.batismos': async ({ inicio, fim }) => {
    // Matrículas no período que estavam ja_batizado=false (cutover: next_matriculas)
    const { data: inscritos } = await supabase
      .from('next_matriculas')
      .select('id, indicou_batismo')
      .eq('ja_batizado', false)
      .is('deleted_at', null)
      .gte('created_at', inicio)
      .lt('created_at', fim);
    const total = (inscritos || []).length;
    if (!total) return { valor: 0, observacao: 'Nenhum inscrito nao-batizado no período' };
    const indicaram = (inscritos || []).filter(i => i.indicou_batismo).length;
    const pct = Math.round((indicaram / total) * 100);
    return {
      valor: pct,
      observacao: `${indicaram} de ${total} inscritos nao-batizados indicaram batismo`,
    };
  },

  // NEXT-02: % inscritos NÃO voluntários pre-NEXT que indicaram servir
  'next.voluntarios': async ({ inicio, fim }) => {
    const { data: inscritos } = await supabase
      .from('next_matriculas')
      .select('id, indicou_servir')
      .eq('ja_voluntario', false)
      .is('deleted_at', null)
      .gte('created_at', inicio)
      .lt('created_at', fim);
    const total = (inscritos || []).length;
    if (!total) return { valor: 0, observacao: 'Nenhum inscrito nao-voluntario no período' };
    const indicaram = (inscritos || []).filter(i => i.indicou_servir).length;
    const pct = Math.round((indicaram / total) * 100);
    return {
      valor: pct,
      observacao: `${indicaram} de ${total} inscritos nao-voluntarios indicaram servir`,
    };
  },

  // NEXT-03: % inscritos com indicacao de dizimo pos-NEXT
  'next.dizimo': async ({ inicio, fim }) => {
    const { data: inscritos } = await supabase
      .from('next_matriculas')
      .select('id, indicou_dizimo')
      .is('deleted_at', null)
      .gte('created_at', inicio)
      .lt('created_at', fim);
    const total = (inscritos || []).length;
    if (!total) return { valor: 0, observacao: 'Nenhum inscrito no período' };
    const indicaram = (inscritos || []).filter(i => i.indicou_dizimo).length;
    const pct = Math.round((indicaram / total) * 100);
    return {
      valor: pct,
      observacao: `${indicaram} de ${total} inscritos indicaram dizimo`,
    };
  },

  // ── Batismos por área (alimentados pela coluna area_kpi adicionada em
  //    20260514180000_batismo_area_kpi.sql). Filtra status='realizado' e
  //    usa COALESCE(data_batismo, created_at) pra contar a data real.
  ...['kids', 'sede', 'bridge', 'ami', 'online'].reduce((acc, area) => {
    acc[`batismos.${area}`] = async ({ inicio, fim }) => {
      const { data } = await supabase
        .from('batismo_inscricoes')
        .select('id, data_batismo, created_at')
        .eq('status', 'realizado')
        .eq('area_kpi', area);
      const total = (data || []).filter(b => {
        const dt = b.data_batismo || (b.created_at || '').slice(0, 10);
        return dt >= inicio && dt < fim;
      }).length;
      return { valor: total, observacao: `${total} batismo(s) ${area} no período` };
    };
    return acc;
  }, {}),

  // ── Voluntariado extras (Onda 3) ──

  // VOLT-01: voluntários ativos na semana (check-ins últimos 7 dias)
  'voluntariado.ativos_semanal': async ({ inicio, fim }) => {
    const { data } = await supabase.from('vol_check_ins').select('volunteer_id').gte('checked_in_at', inicio).lt('checked_in_at', fim);
    const unique = new Set((data || []).map(d => d.volunteer_id).filter(Boolean)).size;
    return { valor: unique, observacao: `${unique} voluntários com check-in na semana` };
  },

  // VOLT-03: voluntários ativos no trimestre
  'voluntariado.ativos_trimestral': async ({ inicio, fim }) => {
    const { data } = await supabase.from('vol_check_ins').select('volunteer_id').gte('checked_in_at', inicio).lt('checked_in_at', fim);
    const unique = new Set((data || []).map(d => d.volunteer_id).filter(Boolean)).size;
    return { valor: unique, observacao: `${unique} voluntários com check-in no trimestre` };
  },

  // VOLT-05: voluntários integrados (entraram e completaram onboarding)
  'voluntariado.integrados': async ({ inicio, fim }) => {
    const { count } = await supabase.from('mem_voluntarios').select('id', { count: 'exact', head: true })
      .gte('desde', inicio).lt('desde', fim);
    return { valor: count || 0, observacao: `${count || 0} voluntários integrados no período` };
  },

  // VOLT-07: voluntários desaparecidos (sem check-in 90+ dias, até IS NULL)
  'voluntariado.desaparecidos': async () => {
    const d90 = new Date(Date.now() - 90 * 86400000).toISOString();
    const { data: ativos } = await supabase.from('mem_voluntarios').select('membro_id').is('ate', null);
    if (!ativos || ativos.length === 0) return { valor: 0 };
    const ids = ativos.map(a => a.membro_id).filter(Boolean);
    const { data: recentes } = await supabase.from('vol_check_ins').select('volunteer_id').gte('checked_in_at', d90);
    const recentSet = new Set((recentes || []).map(r => r.volunteer_id));
    const desaparecidos = ids.filter(id => !recentSet.has(id)).length;
    return { valor: desaparecidos, observacao: `${desaparecidos} voluntários sem check-in 90+ dias` };
  },

  // VOLT-08: % interessados integrados
  'voluntariado.interessados_integrados': async ({ inicio, fim }) => {
    const { data: indicacoes } = await supabase.from('next_indicacoes').select('id, status')
      .eq('tipo', 'servir').gte('created_at', inicio).lt('created_at', fim);
    const total = (indicacoes || []).length;
    if (!total) return { valor: 0, observacao: 'Sem indicacoes de servir no período' };
    const concluidos = (indicacoes || []).filter(i => i.status === 'concluido').length;
    const pct = Math.round((concluidos / total) * 100);
    return { valor: pct, observacao: `${concluidos} de ${total} indicacoes concluídas` };
  },

  // ── Generosidade (Onda 3) ──

  // GEN-02: % doadores ativos com recorrencia >= 3 meses
  'generosidade.recorrencia': async () => {
    const d90 = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
    const { data: recentes } = await supabase.from('mem_contribuicoes').select('membro_id, data').gte('data', d90);
    const doadores = {};
    (recentes || []).forEach(c => {
      if (!doadores[c.membro_id]) doadores[c.membro_id] = new Set();
      doadores[c.membro_id].add(c.data.slice(0, 7)); // YYYY-MM
    });
    const totalDoadores = Object.keys(doadores).length;
    if (!totalDoadores) return { valor: 0, observacao: 'Sem doadores no período' };
    const recorrentes = Object.values(doadores).filter(meses => meses.size >= 3).length;
    const pct = Math.round((recorrentes / totalDoadores) * 100);
    return { valor: pct, observacao: `${recorrentes} de ${totalDoadores} doadores com 3+ meses` };
  },

  // GEN-04: % participantes Next convertidos em doadores
  'generosidade.next_doadores': async ({ inicio, fim }) => {
    const { data: indicacoes } = await supabase.from('next_indicacoes').select('id, status')
      .eq('tipo', 'dizimo').gte('created_at', inicio).lt('created_at', fim);
    const total = (indicacoes || []).length;
    if (!total) return { valor: 0, observacao: 'Sem indicacoes de dizimo no período' };
    const concluidos = (indicacoes || []).filter(i => i.status === 'concluido').length;
    const pct = Math.round((concluidos / total) * 100);
    return { valor: pct, observacao: `${concluidos} de ${total} convertidos em doadores` };
  },

  // ── Devocionais (Gap 3) ──
  // KID-04: famílias fazendo devocionais — conta famílias distintas com
  // ao menos 1 devocional do tipo 'familiar' no período.
  'devocionais.familias': async ({ inicio, fim }) => {
    const { data } = await supabase.from('mem_devocionais')
      .select('membro_id, mem_membros(familia_id)')
      .eq('tipo', 'familiar')
      .gte('data_devocional', inicio)
      .lt('data_devocional', fim);
    const familias = new Set();
    (data || []).forEach(d => {
      const fid = d.mem_membros?.familia_id;
      if (fid) familias.add(fid);
    });
    return { valor: familias.size, observacao: `${familias.size} famílias com devocionais no período` };
  },

  // ── Devocionais do app (2026-06-12) · DEV-01/DEV-02 ──
  // Check-ins do webapp gravam mem_devocionais (1 linha por membro/dia).
  // DEV-01: total de check-ins no período (igreja toda).
  'devocionais.checkins': async ({ inicio, fim }) => {
    const { count } = await supabase.from('mem_devocionais')
      .select('id', { count: 'exact', head: true })
      .gte('data_devocional', inicio)
      .lt('data_devocional', fim);
    return { valor: count || 0, observacao: `${count || 0} check-ins de devocional no período` };
  },

  // DEV-02: pessoas distintas com check-in no período (paginado · cap 1000)
  'devocionais.pessoas': async ({ inicio, fim }) => {
    const pessoas = new Set();
    let offset = 0;
    const pageSize = 1000;
    while (true) {
      const { data } = await supabase.from('mem_devocionais')
        .select('membro_id')
        .gte('data_devocional', inicio)
        .lt('data_devocional', fim)
        .order('id', { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (!data || data.length === 0) break;
      data.forEach(d => { if (d.membro_id) pessoas.add(d.membro_id); });
      if (data.length < pageSize) break;
      offset += pageSize;
    }
    return { valor: pessoas.size, observacao: `${pessoas.size} pessoas com devocional no período` };
  },

  // ── CBA — fluxo batismo ──
  // CBA-01: % batismos realizados / decisões no período
  'cba.batismos_conversoes': async ({ inicio, fim }) => {
    const { count: decisoes } = await supabase.from('int_visitantes')
      .select('id', { count: 'exact', head: true })
      .eq('fez_decisao', true)
      .gte('data_visita', inicio).lt('data_visita', fim);
    if (!decisoes) return { valor: 0, observacao: 'Sem decisões no período' };
    const { count: batismos } = await supabase.from('batismo_inscricoes')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'realizado')
      .gte('data_batismo', inicio).lt('data_batismo', fim);
    const pct = Math.round(((batismos || 0) / decisoes) * 100);
    return { valor: pct, observacao: `${batismos || 0} batismos / ${decisoes} decisoes` };
  },

  // CBA-04: % visitantes com primeiro contato em <=5 dias da visita
  'cba.contato_5dias': async ({ inicio, fim }) => {
    const { data: visitantes } = await supabase.from('int_visitantes')
      .select('id, data_visita')
      .eq('fez_decisao', true)
      .gte('data_visita', inicio).lt('data_visita', fim);
    const total = (visitantes || []).length;
    if (!total) return { valor: 0, observacao: 'Sem visitantes com decisão no período' };
    const ids = visitantes.map(v => v.id);
    const { data: contatos } = await supabase.from('int_acompanhamentos')
      .select('visitante_id, data_contato')
      .in('visitante_id', ids)
      .order('data_contato', { ascending: true });
    const primeiroContato = {};
    (contatos || []).forEach(c => {
      if (!primeiroContato[c.visitante_id]) primeiroContato[c.visitante_id] = c.data_contato;
    });
    let dentro5 = 0;
    visitantes.forEach(v => {
      const c = primeiroContato[v.id];
      if (!c) return;
      const dias = (new Date(c) - new Date(v.data_visita)) / 86400000;
      if (dias <= 5) dentro5++;
    });
    const pct = Math.round((dentro5 / total) * 100);
    return { valor: pct, observacao: `${dentro5} de ${total} visitantes contactados em <=5 dias` };
  },

  // ── Marketing (Spec 005 · 2026-05-28) ────────────────────────────────────
  // KPIs MKT-PRAZO, MKT-LEAD, MKT-THROUGHPUT, MKT-DEM-CAP
  // valores={} · ficam em /minha-area + /marketing/analytics, fora da mandala.

  'marketing.prazo_no_alvo': async ({ inicio, fim }) => {
    // % cards entregues no prazo (entregue_em <= prazo-alvo).
    // prazo-alvo = prazo_producao do entregavel (redesenho) ou prazo_confirmado (legado).
    const { data } = await supabase
      .from('marketing_kanban_cards')
      .select('id, entregue_em, prazo_producao, prazo_confirmado')
      .eq('estado', 'concluido')
      .is('deleted_at', null)
      .not('entregue_em', 'is', null)
      .gte('entregue_em', inicio).lt('entregue_em', fim);

    const total = (data || []).length;
    if (!total) return { valor: null, observacao: 'Sem cards entregues no período' };
    const noPrazo = (data || []).filter(c => {
      const alvo = c.prazo_producao || c.prazo_confirmado;
      return !alvo || new Date(c.entregue_em) <= new Date(alvo);
    }).length;
    const pct = Math.round((noPrazo / total) * 100);
    return { valor: pct, observacao: `${noPrazo} de ${total} cards entregues no prazo` };
  },

  'marketing.lead_time_medio': async ({ inicio, fim }) => {
    const { data } = await supabase
      .from('marketing_kanban_cards')
      .select('created_at, entregue_em')
      .eq('estado', 'concluido')
      .is('deleted_at', null)
      .not('entregue_em', 'is', null)
      .gte('entregue_em', inicio).lt('entregue_em', fim);

    const total = (data || []).length;
    if (!total) return { valor: null, observacao: 'Sem cards entregues no período' };
    const somaDias = (data || []).reduce((acc, c) => {
      const dias = (new Date(c.entregue_em) - new Date(c.created_at)) / 86400000;
      return acc + dias;
    }, 0);
    const media = Math.round((somaDias / total) * 10) / 10;
    return { valor: media, observacao: `${total} cards · media de ${media} dias do pedido a entrega` };
  },

  'marketing.throughput': async ({ inicio, fim }) => {
    const { count } = await supabase
      .from('marketing_kanban_cards')
      .select('id', { count: 'exact', head: true })
      .eq('estado', 'concluido')
      .is('deleted_at', null)
      .not('entregue_em', 'is', null)
      .gte('entregue_em', inicio).lt('entregue_em', fim);
    return { valor: count || 0, observacao: `${count || 0} cards entregues na semana` };
  },

  'marketing.razao_demanda_capacidade': async () => {
    // SLOTS (redesenho · NÃO horas): demanda = slot-dias úteis ocupados na semana
    // corrente pelos entregaveis ativos; capacidade = soma(slots_dia) dos membros
    // ativos x 5 dias úteis. Snapshot da semana atual.
    const hoje = new Date();
    const seg = new Date(hoje);
    seg.setDate(hoje.getDate() - ((hoje.getDay() + 6) % 7)); // segunda desta semana
    seg.setHours(0, 0, 0, 0);
    const sex = new Date(seg); sex.setDate(seg.getDate() + 4);
    const ymd = d => d.toISOString().slice(0, 10);
    const segStr = ymd(seg), sexStr = ymd(sex);

    const { data: membros } = await supabase
      .from('marketing_membros').select('slots_dia').eq('ativo', true).neq('habilidade', 'coordenador').is('deleted_at', null);
    const capacidade = (membros || []).reduce((a, m) => a + (Number(m.slots_dia) || 3), 0) * 5;

    const { data: cards } = await supabase
      .from('marketing_kanban_cards')
      .select('data_inicio, data_fim')
      .neq('estado', 'concluido').is('deleted_at', null)
      .not('data_inicio', 'is', null).not('data_fim', 'is', null)
      .lte('data_inicio', sexStr).gte('data_fim', segStr);

    let demanda = 0;
    for (const c of (cards || [])) {
      let d = new Date(c.data_inicio + 'T00:00:00');
      const fimC = new Date(c.data_fim + 'T00:00:00');
      while (d <= fimC) {
        const wd = d.getDay();
        if (wd !== 0 && wd !== 6 && d >= seg && d <= sex) demanda += 1; // 1 slot por dia útil
        d = new Date(d.getTime() + 86400000);
      }
    }

    if (capacidade <= 0) {
      return { valor: demanda > 0 ? 999 : 0, observacao: demanda > 0 ? 'Sem capacidade cadastrada' : 'Sem demanda nem capacidade' };
    }
    const razao = Math.round((demanda / capacidade) * 100);
    return { valor: razao, observacao: `Semana: ${demanda} slot-dia / ${capacidade} disponiveis` };
  },
};

// ── Coletor master ──────────────────────────────────────────────────────────

// referenceDate: opcional · usado quando o gatilho do recalculo conhece a
// data exata do dado que mudou (ex: PUT /cultos/:id passa a data do culto).
// Isso garante que editar um culto do mês passado recalcula o registro do
// mês passado, não o período atual. Sem o param, comporta como cron diario
// (recalcula sempre o período corrente).
async function coletarTodos({ dryRun = false, fontes = null, areas = null, referenceDate = null } = {}) {
  let query = supabase
    .from('kpi_indicadores_taticos')
    .select('id, periodicidade, fonte_auto, indicador, area')
    .eq('ativo', true)
    .not('fonte_auto', 'is', null);

  // Filtro por prefixos de fonte_auto (ex: ['next.', 'integração.'])
  if (Array.isArray(fontes) && fontes.length > 0) {
    const ors = fontes.map(f => `fonte_auto.ilike.${f}%`).join(',');
    query = query.or(ors);
  }
  // Filtro por áreas (ex: ['next', 'integração'])
  if (Array.isArray(areas) && areas.length > 0) {
    query = query.in('area', areas);
  }

  const { data: indicadores, error } = await query;

  if (error) throw error;

  const dataRef = referenceDate ? new Date(referenceDate) : new Date();

  const resultados = [];
  for (const ind of (indicadores || [])) {
    const collector = COLLECTORS[ind.fonte_auto];
    if (!collector) {
      resultados.push({ id: ind.id, status: 'sem_coletor', fonte: ind.fonte_auto });
      continue;
    }

    const periodo = periodoAtual(ind.periodicidade, dataRef);
    const range = periodoRange(periodo, ind.periodicidade);

    try {
      const result = await collector({ ...range, periodo, periodicidade: ind.periodicidade, area: ind.area });
      if (result == null) {
        resultados.push({ id: ind.id, status: 'sem_dado', periodo });
        continue;
      }
      const { valor, observacao } = result;

      if (dryRun) {
        resultados.push({ id: ind.id, status: 'dry_run', periodo, valor, observacao });
        continue;
      }

      // Upsert no kpi_registros (so atualiza se origem='auto' OU não existir)
      // Não sobrescreve lancamentos manuais
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
        continue;
      }

      // Também grava em processo_registros: 1 linha por processo que rastreia
      // este indicador (processo.indicador_ids @> [ind.id]). Marcos's UI le
      // de processo_registros filtrado por processo_id.
      const { data: processosVinculados } = await supabase
        .from('processos')
        .select('id, responsavel_nome')
        .contains('indicador_ids', [ind.id])
        .neq('status', 'arquivado');

      const processosCount = (processosVinculados || []).length;

      for (const p of (processosVinculados || [])) {
        const procPayload = {
          processo_id: p.id,
          indicador_id: ind.id,
          valor: valor,
          periodo: periodo,
          periodo_referencia: periodo,
          data_preenchimento: new Date().toISOString().slice(0, 10),
          responsavel_nome: 'sistema',
          observacoes: observacao || null,
          origem: 'auto',
        };

        // Upsert manual: como o unique index e parcial (origem='auto'),
        // primeiro deleta auto existente do mesmo (processo, indicador, período)
        await supabase
          .from('processo_registros')
          .delete()
          .eq('processo_id', p.id)
          .eq('indicador_id', ind.id)
          .eq('periodo_referencia', periodo)
          .eq('origem', 'auto');

        await supabase.from('processo_registros').insert(procPayload);
      }

      resultados.push({
        id: ind.id,
        status: 'ok',
        periodo,
        valor,
        processos_alimentados: processosCount,
      });
    } catch (e) {
      resultados.push({ id: ind.id, status: 'erro', erro: e.message });
    }
  }

  return resultados;
}

module.exports = { coletarTodos, COLLECTORS, periodoAtual, periodoRange };
