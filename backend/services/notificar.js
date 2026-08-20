const { supabase } = require('../utils/supabase');
const { enviarPushParaUsers } = require('./webpush');
const { pushExpoParaUsers } = require('./appPush');
const { enviarEmail, isConfigured: emailConfigurado } = require('./email');

function escapeHtmlNotif(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Dispara e-mail (best-effort · Resend) para os usuários notificados. No-op
// gracioso se RESEND_API_KEY não estiver configurada. Resolve o e-mail de cada
// destinatário em profiles.email.
async function enviarEmailNotificacao(userIds, { titulo, mensagem, link, emailsExtra }) {
  const extra = (emailsExtra || []).filter(e => e && /@/.test(e));
  if (!emailConfigurado() || (!userIds?.length && !extra.length)) return;
  try {
    let emailsProfiles = [];
    if (userIds?.length) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('email')
        .in('id', userIds);
      emailsProfiles = (profs || []).map(p => p.email);
    }
    // E-mails dos profiles + e-mails extras avulsos (não ligados a conta).
    const tos = [...new Set([...emailsProfiles, ...extra].filter(e => e && /@/.test(e)))];
    if (!tos.length) return;
    const base = process.env.FRONTEND_URL || '';
    const url = link ? (/^https?:\/\//.test(link) ? link : base + link) : base;
    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.5;max-width:600px">
        <p style="margin:0 0 10px"><strong>${escapeHtmlNotif(titulo)}</strong></p>
        <p style="margin:0 0 16px">${escapeHtmlNotif(mensagem || '')}</p>
        ${url ? `<p style="margin:0 0 16px"><a href="${escapeHtmlNotif(url)}" style="background:#00B39D;color:#fff;padding:9px 16px;border-radius:6px;text-decoration:none;display:inline-block">Abrir no sistema</a></p>` : ''}
        <p style="margin:0;color:#999;font-size:12px">Mensagem automática do sistema CBRio.</p>
      </div>`;
    const r = await enviarEmail({
      to: tos,
      subject: titulo,
      html,
      text: `${titulo}\n\n${mensagem || ''}${url ? `\n\n${url}` : ''}`,
    });
    if (!r?.ok) console.warn('[notificar email] falhou:', r?.error);
  } catch (e) {
    console.warn('[notificar email] exceção:', e.message);
  }
}

/**
 * Resolve quais usuários devem receber notificação de um módulo.
 * 1. Verifica regras personalizadas (notificacao_regras)
 * 2. Fallback: todos admin/diretor
 */
async function resolverDestinatarios(modulo, tipo = null) {
  // ⚠️ REGRA DE TIPO VENCE REGRA DE MÓDULO (11/08/2026). Um mesmo módulo emite
  // coisas de naturezas diferentes: `inscricoes` manda 2.146 avisos de
  // "nova inscrição" por mês pra coordenação E o alerta técnico de webhook
  // recusado, que é de quem MANTÉM o sistema. Sem esta dimensão, restringir um
  // significava restringir o outro.
  //
  // `tipo` NULL na regra = "todos os tipos do módulo" — o comportamento
  // histórico, e é o que as regras que já existiam continuam fazendo.
  //
  // ⚠️⚠️ DEGRADA SOZINHO SE A COLUNA AINDA NÃO EXISTIR (deploy em 2 etapas).
  // Pedir coluna inexistente faz o PostgREST recusar a query INTEIRA — e aqui
  // isso não deixaria "algumas pessoas de fora": deixaria TODO MUNDO, em módulo
  // nenhum, até a migration rodar. Mesma lição do `is_servico` logo abaixo e do
  // `event_id` (telemetria morta 5 dias em silêncio).
  let regras = null;
  const comTipo = await supabase
    .from('notificacao_regras')
    .select('profile_id, tipo')
    .eq('modulo', modulo)
    .eq('ativo', true);

  if (!comTipo.error) {
    const todas = comTipo.data || [];
    const doTipo = tipo ? todas.filter(r => r.tipo === tipo) : [];
    // Específica primeiro; se não há, as genéricas (tipo NULL). Regra de OUTRO
    // tipo nunca entra — senão configurar um tipo mudaria o destino dos demais.
    regras = doTipo.length ? doTipo : todas.filter(r => !r.tipo);
  } else {
    console.warn('[notificar] sem a coluna tipo em notificacao_regras — usando regra por módulo:', comTipo.error.message);
    const { data } = await supabase
      .from('notificacao_regras')
      .select('profile_id')
      .eq('modulo', modulo)
      .eq('ativo', true);
    regras = data || [];
  }

  if (regras?.length) return regras.map(r => r.profile_id);

  // Fallback: admin + diretor.
  //
  // ⚠️⚠️ CONTA DESATIVADA E CONTA-ROBÔ FICAM FORA (10/08/2026). As contas de
  // agente (`agente.rh@`, `agente.financeiro@`, …) têm role `diretor` porque
  // precisam do bypass de autorização para trabalhar — e por isso recebiam o
  // fan-out inteiro. Medido só no módulo `grupos`, em 21 dias: **4.762 das
  // 10.914 notificações foram escritas para robôs**, que nunca abrem o sino.
  // Não é só desperdício: infla a fila, atrasa o insert de quem é gente
  // (`CHUNK` de 8 por vez) e mente na contagem de "não lidas".
  //
  // ⚠️ O filtro é a COLUNA `profiles.is_servico` (migration 20260810180000), não
  // um padrão de e-mail: `agente.%` é convenção de nome, e regra presa a nome de
  // e-mail quebra no dia em que alguém batizar um robô de outro jeito.
  //
  // ⚠️⚠️ DEGRADA SOZINHO SE A COLUNA AINDA NÃO EXISTIR (deploy em 2 etapas).
  // Pedir coluna inexistente faz o PostgREST recusar a query INTEIRA — e aqui
  // isso não deixaria "algumas pessoas de fora", deixaria TODO MUNDO: nenhuma
  // notificação do sistema seria criada, em módulo nenhum, até a migration
  // rodar. É a lição do `event_id` (telemetria morta 5 dias em silêncio).
  const comFlag = await supabase
    .from('profiles')
    .select('id, is_servico')
    .in('role', ['admin', 'diretor'])
    .eq('active', true);

  if (!comFlag.error) {
    return (comFlag.data || []).filter(a => a.is_servico !== true).map(a => a.id);
  }

  console.warn('[notificar] sem a coluna is_servico — usando o fallback antigo:', comFlag.error.message);
  const { data: admins } = await supabase
    .from('profiles')
    .select('id')
    .in('role', ['admin', 'diretor'])
    .eq('active', true);
  return (admins || []).map(a => a.id);
}

/**
 * Cria notificação para múltiplos usuários, com deduplicação.
 * chaveDedup: string única que identifica o evento (ex: "ferias_vencendo_uuid123")
 */
async function notificar({ modulo, tipo, titulo, mensagem, link, severidade = 'info', chaveDedup, targetIds, extraTargetIds, email = false, emailsExtra }) {
  let destinatarios = targetIds || await resolverDestinatarios(modulo, tipo);
  if (extraTargetIds?.length) {
    destinatarios = [...new Set([...(destinatarios || []), ...extraTargetIds.filter(Boolean)])];
  }
  if (!destinatarios.length) {
    console.warn(`[notificar] sem destinatarios · modulo=${modulo} · titulo="${titulo}"`);
    return 0;
  }

  let inserted = 0;
  let skipped = 0;
  let failed = 0;
  const usersInseridos = [];
  const erros = [];

  // Processa os destinatários em CHUNKS paralelos (cada inserção é 1 round-trip
  // REST ao Supabase · em série isso fica lento quando o fan-out é grande — ex:
  // fallback pra todos os admins/diretores). Concorrência limitada (CHUNK) pra
  // não estourar conexões; um destinatário com erro não derruba os demais.
  const CHUNK = 8;
  async function processarUm(userId) {
    // Dedup: não cria se já existe notificação não-lida com mesma chave
    if (chaveDedup) {
      const { count } = await supabase
        .from('notificacoes')
        .select('id', { count: 'exact', head: true })
        .eq('usuario_id', userId)
        .eq('chave_dedup', chaveDedup)
        .eq('lida', false);
      if (count > 0) return { status: 'skipped' };
    }

    const { error } = await supabase.from('notificacoes').insert({
      usuario_id: userId,
      titulo,
      mensagem,
      tipo: tipo || modulo,
      link,
      modulo,
      severidade,
      chave_dedup: chaveDedup,
      lida: false,
    });
    if (!error) return { status: 'inserted', userId };
    return { status: 'failed', erro: `${userId.slice(0, 8)}: ${error.message}` };
  }

  for (let i = 0; i < destinatarios.length; i += CHUNK) {
    const slice = destinatarios.slice(i, i + CHUNK);
    const resultados = await Promise.all(slice.map(processarUm));
    for (const r of resultados) {
      if (r.status === 'inserted') { inserted++; usersInseridos.push(r.userId); }
      else if (r.status === 'skipped') { skipped++; }
      else { failed++; erros.push(r.erro); }
    }
  }

  console.log(`[notificar] modulo=${modulo} alvos=${destinatarios.length} inseridos=${inserted} pulados=${skipped} falhas=${failed}${failed ? ' erros=' + erros.slice(0, 3).join('; ') : ''}`);

  // Dispara push em background (no-op se VAPID não configurado)
  if (usersInseridos.length) {
    enviarPushParaUsers(usersInseridos, {
      title: titulo,
      body: mensagem,
      url: link || '/',
      tag: chaveDedup || `${modulo}-${Date.now()}`,
    }).catch(e => console.warn('[notificar push]', e.message));

    // Push Expo pro app do STAFF · best-effort, nunca quebra o fluxo — no-op
    // gracioso pra quem não tem token em app_push_tokens.
    //
    // ⚠️⚠️ `app: 'staff'` (20/08/2026). Isto aqui é o aviso OPERACIONAL do ERP
    // (inscrição no Next, cadastro aprovado, falha de WhatsApp) e a linha vai
    // pra `notificacoes`, que o app do MEMBRO não lê. Sem o alvo, a banner do
    // push ia pra todos os tokens da pessoa e aparecia no app de membros de
    // quem usa os dois com a mesma conta — foi o relato do Matheus.
    pushExpoParaUsers(usersInseridos, {
      title: titulo,
      body: mensagem,
      data: { tipo: tipo || modulo, modulo, link: link || null },
      app: 'staff',
    }).catch(e => console.warn('[notificar push expo]', e.message));
  }

  // Dispara e-mail em background (no-op se Resend não configurado · só quando
  // o chamador pede email:true). Usa usersInseridos pra herdar a dedup.
  if (email && (usersInseridos.length || emailsExtra?.length)) {
    enviarEmailNotificacao(usersInseridos, { titulo, mensagem, link, emailsExtra })
      .catch(e => console.warn('[notificar email bg]', e.message));
  }

  return inserted;
}

module.exports = { notificar, resolverDestinatarios };
