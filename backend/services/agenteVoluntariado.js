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
const { fetchAllRows } = require('../utils/pagination');
const { resolverTelefoneVoluntario } = require('../utils/telefoneVoluntario');

const DIA = 86400000;
// `.in()` com lista grande estoura a URL do PostgREST — lotes, sempre.
const LOTE_IN = 200;

function digitosCpf(v) {
  const d = String(v || '').replace(/\D+/g, '');
  return d.length === 11 ? d : null;
}

function nomeDaInscricao(vi) {
  const completo = String(vi?.nome_completo || '').trim();
  if (completo) return completo;
  return [vi?.nome, vi?.sobrenome].filter(Boolean).join(' ').trim();
}

// Lê em lotes de LOTE_IN e pagina cada lote (o cap de 1000 do PostgREST trunca
// EM SILÊNCIO — a lição que já mordeu o dashboard do Kids e a Membresia).
async function _emLotes(valores, build) {
  const out = [];
  const uniq = [...new Set((valores || []).filter(Boolean))];
  for (let i = 0; i < uniq.length; i += LOTE_IN) {
    const chunk = uniq.slice(i, i + LOTE_IN);
    if (!chunk.length) break;
    out.push(...await fetchAllRows(() => build(chunk)));
  }
  return out;
}

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

// ⚠️ Resolve NOME + TELEFONE por volunteer_id percorrendo a FONTE ÚNICA de
// pessoas, não só a cópia local do módulo.
//
// Antes isto lia `vol_profiles.phone` e nada mais. Medido em 13/08/2026: só 8
// dos 930 perfis têm telefone ali (o import do Planning Center nunca trouxe),
// então as 87 escalas pendentes apareciam TODAS como "sem telefone" — e 59
// delas tinham telefone em `mem_membros` ou no formulário público que a própria
// pessoa preencheu. A régua da cadeia e o porquê de cada canal estão em
// `utils/telefoneVoluntario.js`; aqui só se lê o banco.
async function perfisPorId(ids) {
  const out = {};
  const uniq = [...new Set((ids || []).filter(Boolean))];
  if (uniq.length === 0) return out;

  const perfis = await _emLotes(uniq, (chunk) => supabase
    .from('vol_profiles')
    .select('id, full_name, phone, cpf, email, membresia_id')
    .in('id', chunk));
  if (!perfis.length) return out;

  // 1 · cadastro da pessoa pelo vínculo que o módulo declara (membresia_id)
  const membroIds = perfis.map((p) => p.membresia_id).filter(Boolean);
  const membros = {};
  for (const m of await _emLotes(membroIds, (chunk) => supabase
    .from('mem_membros').select('id, nome, telefone').in('id', chunk).is('deleted_at', null))) {
    membros[m.id] = m;
  }

  // 2 · cadastro da pessoa pelo CPF do perfil (chave forte do matcher)
  const cpfs = perfis.map((p) => digitosCpf(p.cpf)).filter(Boolean);
  const porCpf = {};
  for (const m of await _emLotes(cpfs, (chunk) => supabase
    .from('mem_membros').select('id, nome, telefone, cpf').in('cpf', chunk).is('deleted_at', null))) {
    const k = digitosCpf(m.cpf);
    if (k && !porCpf[k]) porCpf[k] = m;
  }

  // 3 · o formulário público de voluntariado que a pessoa preencheu.
  //     Casado por e-mail; quem exige NOME compatível é a régua pura.
  const emails = perfis.map((p) => String(p.email || '').trim().toLowerCase()).filter(Boolean);
  const inscPorEmail = {};
  for (const vi of await _emLotes(emails, (chunk) => supabase
    .from('vol_inscricoes')
    .select('email, telefone, nome, sobrenome, nome_completo, created_at')
    .in('email', chunk).is('deleted_at', null).not('telefone', 'is', null)
    .order('created_at', { ascending: false }))) {
    const k = String(vi.email || '').trim().toLowerCase();
    if (!k) continue;
    (inscPorEmail[k] = inscPorEmail[k] || []).push(vi);
  }

  // 4 · contato secundário acumulado (mem_contatos) do membro já vinculado.
  //     Best-effort: a tabela pode não existir num deploy em 2 etapas, e ficar
  //     sem o ÚLTIMO canal da cadeia não pode derrubar o painel inteiro.
  const contatos = {};
  try {
    for (const c of await _emLotes(Object.keys(membros), (chunk) => supabase
      .from('mem_contatos').select('membro_id, valor, ultimo_visto')
      .in('membro_id', chunk).eq('tipo', 'telefone').is('deleted_at', null)
      .order('ultimo_visto', { ascending: false }))) {
      (contatos[c.membro_id] = contatos[c.membro_id] || []).push({ telefone: c.valor });
    }
  } catch (e) {
    console.error('[agenteVoluntariado] contatos secundários indisponíveis:', e.message);
  }

  // ⚠️ Veto de nome no canal do VÍNCULO (`membresia_id`) não é só "não achei
  // telefone": é sinal de que o perfil de voluntário está ligado ao cadastro de
  // OUTRA PESSOA — e vínculo errado ali conta a pessoa errada no valor Servir,
  // não só perde um telefone. Fica no log agregado (nunca uma linha por pessoa,
  // e nunca o nome no log) pra que apareça sem virar ruído.
  let vinculosSuspeitos = 0;
  let numerosInalcancaveis = 0;

  for (const p of perfis) {
    const membro = p.membresia_id ? membros[p.membresia_id] : null;
    const cpf = digitosCpf(p.cpf);
    const r = resolverTelefoneVoluntario({
      nome: p.full_name,
      perfilTelefone: p.phone,
      membro,
      membroPorCpf: cpf ? porCpf[cpf] : null,
      inscricoes: (inscPorEmail[String(p.email || '').trim().toLowerCase()] || [])
        .map((vi) => ({ nome: nomeDaInscricao(vi), telefone: vi.telefone })),
      contatos: membro ? contatos[membro.id] || [] : [],
    });
    for (const d of r.descartados || []) {
      if (d.motivo === 'nome_divergente' && (d.origem === 'membro' || d.origem === 'cpf')) vinculosSuspeitos++;
      if (d.motivo === 'numero_errado') numerosInalcancaveis++;
    }

    out[p.id] = {
      id: p.id,
      full_name: p.full_name,
      phone: r.telefone,
      telefone_origem: r.origem,
      telefone_fonte: r.rotulo,
      membro_id: r.membro_id || p.membresia_id || null,
    };
  }

  if (vinculosSuspeitos > 0) {
    console.error(`[agenteVoluntariado] ${vinculosSuspeitos} perfil(is) de voluntário com nome incompatível com o cadastro de pessoa vinculado — vínculo suspeito, conferir em /entradas`);
  }
  if (numerosInalcancaveis > 0) {
    console.error(`[agenteVoluntariado] ${numerosInalcancaveis} telefone(s) descartado(s) por não serem alcançáveis pelo nosso envio (DDD inexistente, faltando o 9, ou número estrangeiro)`);
  }
  return out;
}

// Analisa as escalas: pendentes (a confirmar), recusadas (repor) e no-shows.
async function analisar() {
  const agora = Date.now();
  const in7dIso = new Date(agora + 7 * DIA).toISOString();
  const desde2dIso = new Date(agora - 2 * DIA).toISOString();

  // 1) cultos próximos (e os recém-passados, p/ no-show)
  const servicos = await fetchAllRows(() => supabase
    .from('vol_services')
    .select('id, name, service_type_name, scheduled_at')
    .gte('scheduled_at', desde2dIso)
    .lte('scheduled_at', in7dIso)
    .order('scheduled_at', { ascending: true }));
  const futuros = (servicos || []).filter((s) => new Date(s.scheduled_at).getTime() >= agora);
  const passados = (servicos || []).filter((s) => new Date(s.scheduled_at).getTime() < agora);
  const svcById = Object.fromEntries((servicos || []).map((s) => [s.id, s]));

  const confirmacoes_pendentes = [];
  const reposicoes = [];
  const no_shows = [];

  // 2) escalas dos cultos FUTUROS → pendentes / recusadas
  if (futuros.length > 0) {
    const escalas = await _emLotes(futuros.map((s) => s.id), (chunk) => supabase
      .from('vol_schedules')
      .select('id, service_id, volunteer_id, volunteer_name, team_name, position_name, confirmation_status')
      .in('service_id', chunk)
      .order('id', { ascending: true }));
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
          // ⚠️ De ONDE veio o telefone vai pra tela. Telefone recuperado por
          // caminho indireto (cadastro da pessoa, formulário antigo) é
          // indistinguível de um digitado aqui se a origem não for declarada —
          // e é a origem que diz à equipe se pode confiar sem conferir.
          telefone_fonte: perfil?.telefone_fonte || null,
          telefone_origem: perfil?.telefone_origem || null,
          membro_id: perfil?.membro_id || null,
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
    const escalasP = await _emLotes(passados.map((s) => s.id), (chunk) => supabase
      .from('vol_schedules')
      .select('id, service_id, volunteer_id, volunteer_name, team_name, position_name')
      .eq('confirmation_status', 'confirmed')
      .in('service_id', chunk)
      .order('id', { ascending: true }));
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
