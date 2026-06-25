// ============================================================================
// Agente de Voluntariado (escalas · confirmação + reposição + no-show)
// ============================================================================
// Reduz buracos de escala: vigia as escalas dos PRÓXIMOS cultos e sinaliza
// (a) pendentes de confirmação → lembrete WhatsApp 1-toque pro voluntário;
// (b) recusadas → reposição da mesma função; e, pós-culto, (c) no-show
// (confirmou e não fez check-in). MODO SEGURO: só sugere/alerta — o
// coordenador é quem age. Read-only no dado operacional. Reusa notificar().
// ============================================================================

const { supabase } = require('../utils/supabase');
const { notificar } = require('../services/notificar');

const DIA = 86400000;

function waLink(phone, msg) {
  const tel = String(phone || '').replace(/\D/g, '');
  if (!tel) return null;
  const num = tel.startsWith('55') ? tel : `55${tel}`;
  return `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;
}

function fmtData(iso) {
  try { return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
  catch { return iso; }
}

// Junta perfis (telefone/nome) por volunteer_id.
async function perfisPorId(ids) {
  const out = {};
  const uniq = [...new Set(ids.filter(Boolean))];
  if (uniq.length === 0) return out;
  for (let i = 0; i < uniq.length; i += 200) {
    const chunk = uniq.slice(i, i + 200);
    const { data } = await supabase.from('vol_profiles').select('id, full_name, phone').in('id', chunk);
    for (const p of data || []) out[p.id] = p;
  }
  return out;
}

// Analisa as escalas: pendentes (a confirmar), recusadas (repor) e no-shows.
async function analisar() {
  const agora = Date.now();
  const nowIso = new Date(agora).toISOString();
  const in7dIso = new Date(agora + 7 * DIA).toISOString();
  const desde2dIso = new Date(agora - 2 * DIA).toISOString();

  // 1) cultos próximos (e os recém-passados, p/ no-show)
  const { data: servicos } = await supabase
    .from('vol_services')
    .select('id, name, service_type_name, scheduled_at')
    .gte('scheduled_at', desde2dIso)
    .lte('scheduled_at', in7dIso);
  const futuros = (servicos || []).filter((s) => new Date(s.scheduled_at).getTime() >= agora);
  const passados = (servicos || []).filter((s) => new Date(s.scheduled_at).getTime() < agora);
  const svcById = Object.fromEntries((servicos || []).map((s) => [s.id, s]));

  const confirmacoes_pendentes = [];
  const reposicoes = [];
  const no_shows = [];

  // 2) escalas dos cultos FUTUROS → pendentes / recusadas
  if (futuros.length > 0) {
    const { data: escalas } = await supabase
      .from('vol_schedules')
      .select('id, service_id, volunteer_id, volunteer_name, team_name, position_name, confirmation_status')
      .in('service_id', futuros.map((s) => s.id));
    const perfis = await perfisPorId((escalas || []).map((e) => e.volunteer_id));
    for (const e of escalas || []) {
      const svc = svcById[e.service_id];
      const quando = svc ? fmtData(svc.scheduled_at) : '';
      const funcao = [e.team_name, e.position_name].filter(Boolean).join(' · ');
      const perfil = perfis[e.volunteer_id];
      const nome = (e.volunteer_name || perfil?.full_name || '').trim();
      if (e.confirmation_status === 'pending') {
        const primeiro = nome.split(/\s+/)[0] || '';
        const msg = `Oi ${primeiro}! Tudo bem? Você está escalado(a) para ${funcao || 'servir'} no ${svc?.name || 'culto'} (${quando}). Consegue confirmar sua presença? 💙`;
        confirmacoes_pendentes.push({
          schedule_id: e.id, nome, funcao, servico: svc?.name || null, quando,
          telefone: perfil?.phone || null, whatsapp: waLink(perfil?.phone, msg), mensagem: msg,
        });
      } else if (e.confirmation_status === 'declined') {
        reposicoes.push({
          schedule_id: e.id, nome, funcao, team_name: e.team_name || null,
          position_name: e.position_name || null, servico: svc?.name || null, quando,
        });
      }
    }
  }

  // 3) cultos passados (≤2d) → no-show (confirmou e não fez check-in)
  if (passados.length > 0) {
    const { data: escalasP } = await supabase
      .from('vol_schedules')
      .select('id, service_id, volunteer_id, volunteer_name, team_name, position_name')
      .eq('confirmation_status', 'confirmed')
      .in('service_id', passados.map((s) => s.id));
    const schedIds = (escalasP || []).map((e) => e.id);
    const comCheckin = new Set();
    for (let i = 0; i < schedIds.length; i += 200) {
      const chunk = schedIds.slice(i, i + 200);
      if (chunk.length === 0) break;
      const { data: cks } = await supabase.from('vol_check_ins').select('schedule_id').in('schedule_id', chunk);
      for (const c of cks || []) comCheckin.add(c.schedule_id);
    }
    const perfisP = await perfisPorId((escalasP || []).map((e) => e.volunteer_id));
    for (const e of escalasP || []) {
      if (comCheckin.has(e.id)) continue;
      const svc = svcById[e.service_id];
      no_shows.push({
        schedule_id: e.id,
        nome: (e.volunteer_name || perfisP[e.volunteer_id]?.full_name || '').trim(),
        funcao: [e.team_name, e.position_name].filter(Boolean).join(' · '),
        servico: svc?.name || null, quando: svc ? fmtData(svc.scheduled_at) : '',
      });
    }
  }

  return { confirmacoes_pendentes, reposicoes, no_shows };
}

// Alerta o coordenador de voluntariado (resumo diário · dedup).
async function alertar() {
  const { confirmacoes_pendentes, reposicoes, no_shows } = await analisar();
  const hojeStr = new Date().toISOString().slice(0, 10);
  let count = 0;

  if (confirmacoes_pendentes.length > 0 || reposicoes.length > 0) {
    const partes = [];
    if (confirmacoes_pendentes.length) partes.push(`${confirmacoes_pendentes.length} aguardando confirmação`);
    if (reposicoes.length) partes.push(`${reposicoes.length} recusada(s) precisando de reposição`);
    count += await notificar({
      modulo: 'voluntariado',
      tipo: 'escalas_pendentes',
      titulo: 'Escalas dos próximos cultos precisam de atenção',
      mensagem: `${partes.join(' e ')}. Confira em Voluntariado para lembrar/repor.`,
      link: '/voluntariado',
      severidade: reposicoes.length ? 'warning' : 'info',
      chaveDedup: `vol_escalas_${hojeStr}`,
    });
  }
  if (no_shows.length > 0) {
    count += await notificar({
      modulo: 'voluntariado',
      tipo: 'voluntario_no_show',
      titulo: `${no_shows.length} falta(s) sem aviso no último culto`,
      mensagem: `${no_shows.length} voluntário(s) confirmaram e não fizeram check-in. Vale um acompanhamento.`,
      link: '/voluntariado',
      severidade: 'info',
      chaveDedup: `vol_noshow_${hojeStr}`,
    });
  }
  return count;
}

module.exports = { analisar, alertar };
