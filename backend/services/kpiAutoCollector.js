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

function isAmiCulto(c) {
  const n = (c.nome || '').toLowerCase();
  // AMI sozinho ou com sabado (publico AMI no culto de sabado).
  // Bridge fica EXCLUIDO.
  return (n.includes('ami') || n.includes('sabado') || n.includes('sábado')) && !n.includes('bridge');
}

function isBridgeCulto(c) {
  const n = (c.nome || '').toLowerCase();
  return n.includes('bridge');
}

// Mantido por compat retroativa: cultos AMI ou Bridge (consolidacao antiga).
function isAmiBridgeCulto(c) {
  return isAmiCulto(c) || isBridgeCulto(c);
}

// ── Coletores por fonte ─────────────────────────────────────────────────────

const COLLECTORS = {
  // ── Cultos: AMI (separado de Bridge) ──
  'cultos.ami_freq': async ({ inicio, fim }) => {
    const { data } = await supabase.from('vw_culto_stats').select('nome, presencial_adulto').gte('data', inicio).lt('data', fim);
    const ami = (data || []).filter(isAmiCulto);
    const total = ami.reduce((s, c) => s + (c.presencial_adulto || 0), 0);
    return { valor: total, observacao: `${ami.length} culto(s) AMI` };
  },

  'cultos.ami_conv': async ({ inicio, fim }) => {
    const { data } = await supabase.from('vw_culto_stats').select('nome, decisoes_presenciais, decisoes_online').gte('data', inicio).lt('data', fim);
    const ami = (data || []).filter(isAmiCulto);
    const total = ami.reduce((s, c) => s + (c.decisoes_presenciais || 0) + (c.decisoes_online || 0), 0);
    return { valor: total, observacao: `${ami.length} culto(s) AMI` };
  },

  // ── Cultos: Bridge (separado de AMI) ──
  'cultos.bridge_freq': async ({ inicio, fim }) => {
    const { data } = await supabase.from('vw_culto_stats').select('nome, presencial_adulto').gte('data', inicio).lt('data', fim);
    const bridge = (data || []).filter(isBridgeCulto);
    const total = bridge.reduce((s, c) => s + (c.presencial_adulto || 0), 0);
    return { valor: total, observacao: `${bridge.length} culto(s) Bridge` };
  },

  'cultos.bridge_conv': async ({ inicio, fim }) => {
    const { data } = await supabase.from('vw_culto_stats').select('nome, decisoes_presenciais, decisoes_online').gte('data', inicio).lt('data', fim);
    const bridge = (data || []).filter(isBridgeCulto);
    const total = bridge.reduce((s, c) => s + (c.decisoes_presenciais || 0) + (c.decisoes_online || 0), 0);
    return { valor: total, observacao: `${bridge.length} culto(s) Bridge` };
  },

  // ── Cultos: AMI+Bridge consolidado (DEPRECATED — manter ate cleanup) ──
  'cultos.amibridge_freq': async ({ inicio, fim }) => {
    const { data } = await supabase.from('vw_culto_stats').select('nome, presencial_adulto').gte('data', inicio).lt('data', fim);
    const total = (data || []).filter(isAmiBridgeCulto).reduce((s, c) => s + (c.presencial_adulto || 0), 0);
    return { valor: total, observacao: `${(data || []).filter(isAmiBridgeCulto).length} culto(s) AMI/Bridge (DEPRECATED)` };
  },

  'cultos.amibridge_conv': async ({ inicio, fim }) => {
    const { data } = await supabase.from('vw_culto_stats').select('nome, decisoes_presenciais, decisoes_online').gte('data', inicio).lt('data', fim);
    const total = (data || []).filter(isAmiBridgeCulto).reduce((s, c) => s + (c.decisoes_presenciais || 0) + (c.decisoes_online || 0), 0);
    return { valor: total, observacao: 'DEPRECATED: usar cultos.ami_conv ou cultos.bridge_conv' };
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

  // ── Integracao - 1x1 mensal ──
  // % = (voluntarios da Integracao com reuniao 1x1 no mes)
  //     / (total voluntarios ativos da Integracao) * 100
  'integracao.1x1_mensal': async ({ inicio, fim }) => {
    const { data: teams } = await supabase
      .from('vol_teams')
      .select('id')
      .ilike('name', '%integ%');
    const teamIds = (teams || []).map(t => t.id);
    if (teamIds.length === 0) return { valor: 0, observacao: 'Equipe Integracao nao encontrada' };

    // Voluntarios ativos na Integracao
    const { data: members } = await supabase
      .from('vol_team_members')
      .select('volunteer_profile_id')
      .in('team_id', teamIds);
    const profileIds = [...new Set((members || []).map(m => m.volunteer_profile_id).filter(Boolean))];
    if (profileIds.length === 0) return { valor: 0, observacao: 'Sem voluntarios na Integracao' };

    // Voluntarios com 1x1 no periodo
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
      observacao: `${comReuniao} de ${profileIds.length} voluntarios da Integracao com 1x1 no mes`,
    };
  },

  // ── Integracao - voluntarios em treinamento ──
  // % = (voluntarios da Integracao que fizeram check-in de treinamento no periodo)
  //     / (total de voluntarios ativos na equipe Integracao) * 100
  'integracao.treinamento': async ({ inicio, fim }) => {
    // Buscar a equipe Integracao
    const { data: teams } = await supabase
      .from('vol_teams')
      .select('id, name')
      .ilike('name', '%integ%');

    const teamIds = (teams || []).map(t => t.id);
    if (teamIds.length === 0) {
      return { valor: 0, observacao: 'Equipe Integracao nao encontrada em vol_teams' };
    }

    // Denominador: voluntarios ativos na equipe Integracao
    const { count: ativos } = await supabase
      .from('vol_team_members')
      .select('id', { count: 'exact', head: true })
      .in('team_id', teamIds);

    if (!ativos) {
      return { valor: 0, observacao: 'Sem voluntarios na equipe Integracao' };
    }

    // Numerador: voluntarios distintos com check-in de treinamento (team Integracao) no periodo
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
      observacao: `${treinando} em treinamento de ${ativos} voluntarios ativos da Integracao`,
    };
  },

  // ── NEXT - automatizacoes pos-NEXT ──
  // NEXT-01: % inscritos NAO batizados pre-NEXT que viraram batizandos
  //          (indicaram batismo no NEXT do mes)
  'next.batismos': async ({ inicio, fim }) => {
    // Inscritos no periodo que estavam ja_batizado=false
    const { data: inscritos } = await supabase
      .from('next_inscricoes')
      .select('id, indicou_batismo')
      .eq('ja_batizado', false)
      .gte('created_at', inicio)
      .lt('created_at', fim);
    const total = (inscritos || []).length;
    if (!total) return { valor: 0, observacao: 'Nenhum inscrito nao-batizado no periodo' };
    const indicaram = (inscritos || []).filter(i => i.indicou_batismo).length;
    const pct = Math.round((indicaram / total) * 100);
    return {
      valor: pct,
      observacao: `${indicaram} de ${total} inscritos nao-batizados indicaram batismo`,
    };
  },

  // NEXT-02: % inscritos NAO voluntarios pre-NEXT que indicaram servir
  'next.voluntarios': async ({ inicio, fim }) => {
    const { data: inscritos } = await supabase
      .from('next_inscricoes')
      .select('id, indicou_servir')
      .eq('ja_voluntario', false)
      .gte('created_at', inicio)
      .lt('created_at', fim);
    const total = (inscritos || []).length;
    if (!total) return { valor: 0, observacao: 'Nenhum inscrito nao-voluntario no periodo' };
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
      .from('next_inscricoes')
      .select('id, indicou_dizimo')
      .gte('created_at', inicio)
      .lt('created_at', fim);
    const total = (inscritos || []).length;
    if (!total) return { valor: 0, observacao: 'Nenhum inscrito no periodo' };
    const indicaram = (inscritos || []).filter(i => i.indicou_dizimo).length;
    const pct = Math.round((indicaram / total) * 100);
    return {
      valor: pct,
      observacao: `${indicaram} de ${total} inscritos indicaram dizimo`,
    };
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

  // ── Voluntariado extras (Onda 3) ──

  // VOLT-01: voluntarios ativos na semana (check-ins ultimos 7 dias)
  'voluntariado.ativos_semanal': async ({ inicio, fim }) => {
    const { data } = await supabase.from('vol_check_ins').select('volunteer_id').gte('checked_in_at', inicio).lt('checked_in_at', fim);
    const unique = new Set((data || []).map(d => d.volunteer_id).filter(Boolean)).size;
    return { valor: unique, observacao: `${unique} voluntarios com check-in na semana` };
  },

  // VOLT-03: voluntarios ativos no trimestre
  'voluntariado.ativos_trimestral': async ({ inicio, fim }) => {
    const { data } = await supabase.from('vol_check_ins').select('volunteer_id').gte('checked_in_at', inicio).lt('checked_in_at', fim);
    const unique = new Set((data || []).map(d => d.volunteer_id).filter(Boolean)).size;
    return { valor: unique, observacao: `${unique} voluntarios com check-in no trimestre` };
  },

  // VOLT-05: voluntarios integrados (entraram e completaram onboarding)
  'voluntariado.integrados': async ({ inicio, fim }) => {
    const { count } = await supabase.from('mem_voluntarios').select('id', { count: 'exact', head: true })
      .gte('desde', inicio).lt('desde', fim);
    return { valor: count || 0, observacao: `${count || 0} voluntarios integrados no periodo` };
  },

  // VOLT-07: voluntarios desaparecidos (sem check-in 90+ dias, ate IS NULL)
  'voluntariado.desaparecidos': async () => {
    const d90 = new Date(Date.now() - 90 * 86400000).toISOString();
    const { data: ativos } = await supabase.from('mem_voluntarios').select('membro_id').is('ate', null);
    if (!ativos || ativos.length === 0) return { valor: 0 };
    const ids = ativos.map(a => a.membro_id).filter(Boolean);
    const { data: recentes } = await supabase.from('vol_check_ins').select('volunteer_id').gte('checked_in_at', d90);
    const recentSet = new Set((recentes || []).map(r => r.volunteer_id));
    const desaparecidos = ids.filter(id => !recentSet.has(id)).length;
    return { valor: desaparecidos, observacao: `${desaparecidos} voluntarios sem check-in 90+ dias` };
  },

  // VOLT-08: % interessados integrados
  'voluntariado.interessados_integrados': async ({ inicio, fim }) => {
    const { data: indicacoes } = await supabase.from('next_indicacoes').select('id, status')
      .eq('tipo', 'servir').gte('created_at', inicio).lt('created_at', fim);
    const total = (indicacoes || []).length;
    if (!total) return { valor: 0, observacao: 'Sem indicacoes de servir no periodo' };
    const concluidos = (indicacoes || []).filter(i => i.status === 'concluido').length;
    const pct = Math.round((concluidos / total) * 100);
    return { valor: pct, observacao: `${concluidos} de ${total} indicacoes concluidas` };
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
    if (!totalDoadores) return { valor: 0, observacao: 'Sem doadores no periodo' };
    const recorrentes = Object.values(doadores).filter(meses => meses.size >= 3).length;
    const pct = Math.round((recorrentes / totalDoadores) * 100);
    return { valor: pct, observacao: `${recorrentes} de ${totalDoadores} doadores com 3+ meses` };
  },

  // GEN-04: % participantes Next convertidos em doadores
  'generosidade.next_doadores': async ({ inicio, fim }) => {
    const { data: indicacoes } = await supabase.from('next_indicacoes').select('id, status')
      .eq('tipo', 'dizimo').gte('created_at', inicio).lt('created_at', fim);
    const total = (indicacoes || []).length;
    if (!total) return { valor: 0, observacao: 'Sem indicacoes de dizimo no periodo' };
    const concluidos = (indicacoes || []).filter(i => i.status === 'concluido').length;
    const pct = Math.round((concluidos / total) * 100);
    return { valor: pct, observacao: `${concluidos} de ${total} convertidos em doadores` };
  },

  // ── Devocionais (Gap 3) ──
  // KID-04: famílias fazendo devocionais — conta familias distintas com
  // ao menos 1 devocional do tipo 'familiar' no periodo.
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
    return { valor: familias.size, observacao: `${familias.size} familias com devocionais no periodo` };
  },

  // ── CBA — fluxo batismo ──
  // CBA-01: % batismos realizados / decisoes no periodo
  'cba.batismos_conversoes': async ({ inicio, fim }) => {
    const { count: decisoes } = await supabase.from('int_visitantes')
      .select('id', { count: 'exact', head: true })
      .eq('fez_decisao', true)
      .gte('data_visita', inicio).lt('data_visita', fim);
    if (!decisoes) return { valor: 0, observacao: 'Sem decisoes no periodo' };
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
    if (!total) return { valor: 0, observacao: 'Sem visitantes com decisao no periodo' };
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
};

// ── Coletor master ──────────────────────────────────────────────────────────

async function coletarTodos({ dryRun = false, fontes = null, areas = null } = {}) {
  let query = supabase
    .from('kpi_indicadores_taticos')
    .select('id, periodicidade, fonte_auto, indicador, area')
    .eq('ativo', true)
    .not('fonte_auto', 'is', null);

  // Filtro por prefixos de fonte_auto (ex: ['next.', 'integracao.'])
  if (Array.isArray(fontes) && fontes.length > 0) {
    const ors = fontes.map(f => `fonte_auto.ilike.${f}%`).join(',');
    query = query.or(ors);
  }
  // Filtro por areas (ex: ['next', 'integracao'])
  if (Array.isArray(areas) && areas.length > 0) {
    query = query.in('area', areas);
  }

  const { data: indicadores, error } = await query;

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
        continue;
      }

      // Tambem grava em processo_registros: 1 linha por processo que rastreia
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
        // primeiro deleta auto existente do mesmo (processo, indicador, periodo)
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
