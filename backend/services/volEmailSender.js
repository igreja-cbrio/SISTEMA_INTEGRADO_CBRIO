// Disparo de e-mails pros voluntários · resolução de segmento + fila drenada.
//
// Mecânica: o Exchange Online limita o remetente a ~30 msgs/min, então um blast
// de ~900 leva 35-45 min — impossível numa única invocação serverless
// (maxDuration 300s). A campanha vira status 'enviando' com 1 linha por
// destinatário em vol_email_disparo_destinatarios (status 'pendente'); a rota
// de envio drena inline com orçamento de tempo e o cron */5 min retoma o que
// sobrou. Claim atômico por linha (pendente→enviado com filtro no UPDATE)
// evita duplicata se rota e cron rodarem juntos.

const { supabase } = require('../utils/supabase');
const { enviarEmail } = require('./email');
const { notificar } = require('./notificar');

const RITMO_MS = 2400; // ~25 msgs/min · margem sob o limite de 30/min
const PAGE = 1000; // cap server-side do PostgREST
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Segmento → destinatários ────────────────────────────────────────────────
// Retorna { destinatarios: [{vol_profile_id, email, nome}], sem_email }.
// Dedup por lower(email) · exclui perfis arquivados e e-mails inválidos.
async function resolverSegmento(segmento = {}) {
  const tipo = segmento.tipo || 'todos';
  const brutos = [];
  let semEmail = 0;

  if (tipo === 'todos') {
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('vol_profiles')
        .select('id, full_name, email')
        .eq('arquivado', false)
        .order('id')
        .range(from, from + PAGE - 1);
      if (error) throw error;
      for (const p of data || []) {
        if (p.email) brutos.push({ vol_profile_id: p.id, email: p.email, nome: p.full_name });
        else semEmail += 1;
      }
      if (!data || data.length < PAGE) break;
    }
  } else if (tipo === 'equipe') {
    if (!segmento.team_id) throw new Error('team_id obrigatório no segmento de equipe');
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('vol_team_members')
        .select('volunteer_profile_id, vol_profiles(id, full_name, email, arquivado)')
        .eq('team_id', segmento.team_id)
        .eq('is_active', true)
        .order('id')
        .range(from, from + PAGE - 1);
      if (error) throw error;
      for (const m of data || []) {
        const p = m.vol_profiles;
        if (p && !p.arquivado && p.email) {
          brutos.push({ vol_profile_id: p.id, email: p.email, nome: p.full_name });
        } else {
          semEmail += 1; // membro só-PC (sem profile), arquivado ou sem e-mail
        }
      }
      if (!data || data.length < PAGE) break;
    }
  } else if (tipo === 'manual') {
    const ids = Array.isArray(segmento.vol_profile_ids) ? segmento.vol_profile_ids.filter(Boolean) : [];
    if (!ids.length) throw new Error('Nenhum voluntário selecionado');
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await supabase
        .from('vol_profiles')
        .select('id, full_name, email')
        .in('id', ids.slice(i, i + 200));
      if (error) throw error;
      for (const p of data || []) {
        if (p.email) brutos.push({ vol_profile_id: p.id, email: p.email, nome: p.full_name });
        else semEmail += 1;
      }
    }
  } else if (tipo === 'escala') {
    if (!segmento.service_id) throw new Error('service_id obrigatório no segmento de escala');
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('vol_schedules')
        .select('volunteer_id, volunteer_name, vol_profiles(id, full_name, email, arquivado)')
        .eq('service_id', segmento.service_id)
        .order('id')
        .range(from, from + PAGE - 1);
      if (error) throw error;
      for (const s of data || []) {
        const p = s.vol_profiles;
        if (p && !p.arquivado && p.email) {
          brutos.push({ vol_profile_id: p.id, email: p.email, nome: p.full_name || s.volunteer_name });
        } else {
          semEmail += 1; // escalado sem vínculo com vol_profiles ou sem e-mail
        }
      }
      if (!data || data.length < PAGE) break;
    }
  } else {
    throw new Error(`Tipo de segmento desconhecido: ${tipo}`);
  }

  const vistos = new Set();
  const destinatarios = [];
  for (const d of brutos) {
    const chave = String(d.email).trim().toLowerCase();
    if (!EMAIL_RE.test(chave)) { semEmail += 1; continue; }
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    destinatarios.push({ ...d, email: chave });
  }
  return { destinatarios, sem_email: semEmail };
}

// ── HTML ────────────────────────────────────────────────────────────────────
// Sanitização barata (autor é staff · risco baixo, mas é grátis remover).
function sanitizarHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<script[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/javascript:/gi, '');
}

// Shell de e-mail (estilos inline · compatível com Outlook/Gmail) envolvendo o
// corpo do Tiptap. {{nome}} é substituído pelo primeiro nome do destinatário.
// assinaturaHtml (opcional) entra entre o corpo e o rodapé.
function montarHtmlEmail(corpoHtml, { nome, assinaturaHtml } = {}) {
  const primeiroNome = (nome || '').trim().split(/\s+/)[0] || 'voluntário';
  const corpo = sanitizarHtml(corpoHtml).replace(/\{\{\s*nome\s*\}\}/gi, primeiroNome);
  const assinatura = assinaturaHtml ? sanitizarHtml(assinaturaHtml) : '';
  return `<!DOCTYPE html>
<html lang="pt-BR">
<body style="margin:0;padding:0;background:#f4f5f7">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden">
        <tr><td style="height:5px;background:#00B39D;font-size:0;line-height:0">&nbsp;</td></tr>
        <tr><td style="padding:28px 30px;font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.6">
          ${corpo}
        </td></tr>
        ${assinatura ? `<tr><td style="padding:0 30px 24px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1a1a1a;line-height:1.5">
          <div style="border-top:1px solid #eceef1;padding-top:16px">${assinatura}</div>
        </td></tr>` : ''}
        <tr><td style="padding:16px 30px;border-top:1px solid #eceef1;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#8a919c">
          Você recebe este e-mail por ser voluntário da CBRio.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// Assinatura global do módulo (vol_email_config · linha única id=1).
async function carregarAssinatura() {
  const { data } = await supabase
    .from('vol_email_config')
    .select('assinatura_html')
    .eq('id', 1)
    .maybeSingle();
  return data?.assinatura_html || '';
}

// ── Snapshot dos destinatários ──────────────────────────────────────────────
// Idempotente: UNIQUE(disparo_id, email) + upsert ignorando duplicatas.
// Usado na hora do envio imediato e na promoção de agendados (dados frescos).
async function snapshotDestinatarios(disparo) {
  const { count } = await supabase
    .from('vol_email_disparo_destinatarios')
    .select('id', { count: 'exact', head: true })
    .eq('disparo_id', disparo.id);
  if (count > 0) return count;

  const { destinatarios } = await resolverSegmento(disparo.segmento || {});
  if (!destinatarios.length) return 0;

  for (let i = 0; i < destinatarios.length; i += 500) {
    const lote = destinatarios.slice(i, i + 500).map((d) => ({
      disparo_id: disparo.id,
      vol_profile_id: d.vol_profile_id || null,
      email: d.email,
      nome: d.nome || null,
    }));
    const { error } = await supabase
      .from('vol_email_disparo_destinatarios')
      .upsert(lote, { onConflict: 'disparo_id,email', ignoreDuplicates: true });
    if (error) throw error;
  }

  await supabase
    .from('vol_email_disparos')
    .update({ total_destinatarios: destinatarios.length })
    .eq('id', disparo.id);
  return destinatarios.length;
}

async function atualizarContadores(disparoId) {
  const contar = async (status) => {
    const { count } = await supabase
      .from('vol_email_disparo_destinatarios')
      .select('id', { count: 'exact', head: true })
      .eq('disparo_id', disparoId)
      .eq('status', status);
    return count || 0;
  };
  const [enviados, erros, pendentes] = await Promise.all([
    contar('enviado'), contar('erro'), contar('pendente'),
  ]);
  await supabase
    .from('vol_email_disparos')
    .update({ total_enviados: enviados, total_erros: erros })
    .eq('id', disparoId);
  return { enviados, erros, pendentes };
}

// ── Envio de 1 destinatário (claim atômico + retry de 429) ─────────────────
async function enviarUm(disparo, dest, assinaturaHtml) {
  // Claim: só envia quem ESTE processo conseguiu mover pendente→enviado.
  const { data: claimed, error: claimErr } = await supabase
    .from('vol_email_disparo_destinatarios')
    .update({ status: 'enviado', enviado_em: new Date().toISOString() })
    .eq('id', dest.id)
    .eq('status', 'pendente')
    .select('id');
  if (claimErr) throw claimErr;
  if (!claimed?.length) return 'pulado'; // outro processo pegou

  const html = montarHtmlEmail(disparo.corpo_html, { nome: dest.nome, assinaturaHtml });
  let r = await enviarEmail({ to: dest.email, subject: disparo.assunto, html });
  if (!r?.ok && /429/.test(r?.error || '')) {
    await sleep(15000); // Retry-After não chega até aqui · espera conservadora
    r = await enviarEmail({ to: dest.email, subject: disparo.assunto, html });
  }

  if (!r?.ok) {
    await supabase
      .from('vol_email_disparo_destinatarios')
      .update({ status: 'erro', erro_msg: String(r?.error || 'falha no envio').slice(0, 300), enviado_em: null })
      .eq('id', dest.id);
    return 'erro';
  }
  return 'enviado';
}

// ── Drain principal (rota de envio + cron compartilham) ─────────────────────
async function drenarDisparos({ budgetMs = 250000, apenasDisparoId = null } = {}) {
  const inicio = Date.now();
  const estourou = () => Date.now() - inicio > budgetMs;
  const resultado = { promovidos: 0, enviados: 0, erros: 0, concluidos: 0 };

  // 1. Promove agendados vencidos → enviando
  const { data: vencidos } = await supabase
    .from('vol_email_disparos')
    .select('id')
    .eq('status', 'agendado')
    .lte('agendado_para', new Date().toISOString())
    .is('deleted_at', null);
  for (const v of vencidos || []) {
    const { data: prom } = await supabase
      .from('vol_email_disparos')
      .update({ status: 'enviando' })
      .eq('id', v.id)
      .eq('status', 'agendado')
      .select('id');
    if (prom?.length) resultado.promovidos += 1;
  }

  // 2. Drena campanhas 'enviando'
  let q = supabase
    .from('vol_email_disparos')
    .select('*')
    .eq('status', 'enviando')
    .is('deleted_at', null)
    .order('created_at', { ascending: true });
  if (apenasDisparoId) q = q.eq('id', apenasDisparoId);
  const { data: ativas, error } = await q;
  if (error) throw error;

  for (const disparo of ativas || []) {
    if (estourou()) break;
    await snapshotDestinatarios(disparo);
    const assinaturaHtml = disparo.incluir_assinatura === false ? '' : await carregarAssinatura();

    let enviadosDesdeUpdate = 0;
    while (!estourou()) {
      const { data: pendentes, error: pErr } = await supabase
        .from('vol_email_disparo_destinatarios')
        .select('id, email, nome')
        .eq('disparo_id', disparo.id)
        .eq('status', 'pendente')
        .order('created_at', { ascending: true })
        .limit(50);
      if (pErr) throw pErr;
      if (!pendentes?.length) break;

      for (const dest of pendentes) {
        if (estourou()) break;
        try {
          const st = await enviarUm(disparo, dest, assinaturaHtml);
          if (st === 'enviado') resultado.enviados += 1;
          if (st === 'erro') resultado.erros += 1;
        } catch (e) {
          console.error('[volEmail] envio falhou', dest.email, e.message);
          resultado.erros += 1;
        }
        enviadosDesdeUpdate += 1;
        if (enviadosDesdeUpdate >= 10) {
          enviadosDesdeUpdate = 0;
          await atualizarContadores(disparo.id); // progresso pra UI
        }
        await sleep(RITMO_MS);
      }
    }

    const { enviados, erros, pendentes } = await atualizarContadores(disparo.id);
    if (pendentes === 0) {
      const statusFinal = enviados === 0 && erros > 0 ? 'erro' : 'enviado';
      await supabase
        .from('vol_email_disparos')
        .update({ status: statusFinal, enviado_em: new Date().toISOString() })
        .eq('id', disparo.id)
        .eq('status', 'enviando');
      resultado.concluidos += 1;
      try {
        await notificar({
          modulo: 'voluntariado',
          tipo: 'vol_email_disparo',
          titulo: 'Disparo de e-mail concluído',
          mensagem: `"${disparo.assunto}" · ${enviados} enviados · ${erros} erros`,
          link: '/ministerial/voluntariado/emails',
          chaveDedup: `vol_email_disparo:${disparo.id}`,
        });
      } catch (e) {
        console.warn('[volEmail] notificar falhou:', e.message);
      }
    }
  }

  return resultado;
}

module.exports = {
  resolverSegmento,
  montarHtmlEmail,
  sanitizarHtml,
  snapshotDestinatarios,
  drenarDisparos,
  carregarAssinatura,
};
