// Reconciliação dos STATUSES ÓRFÃOS da Meta (médio da revisão de 05/08: a
// tabela whatsapp_status_orfaos era WRITE-ONLY — recibo que chegava antes de a
// fila gravar o message_id ficava órfão pra sempre e o delivered_at daquele
// envio nunca era preenchido). Roda 1×/hora de carona no cron de agendamentos
// da Comunicação: tenta casar cada órfão com a fila (whatsapp_envios) ou com o
// chat (wa_mensagens) e aplica o recibo com as MESMAS guardas idempotentes do
// webhook (.is(col, null) — reprocessar não regride o 1º timestamp).
const { supabase } = require('../utils/supabase');

const DESCARTE_DIAS = 60; // órfão que nunca casou não pode acumular pra sempre

async function aplicarNoEnvio(envio, o) {
  const ts = o.status_timestamp || o.criado_em;
  if (o.status === 'delivered') {
    await supabase.from('whatsapp_envios').update({ delivered_at: ts })
      .eq('id', envio.id).is('delivered_at', null);
  } else if (o.status === 'read') {
    await supabase.from('whatsapp_envios').update({ read_at: ts })
      .eq('id', envio.id).is('read_at', null);
    await supabase.from('whatsapp_envios').update({ delivered_at: ts })
      .eq('id', envio.id).is('delivered_at', null);
  } else if (o.status === 'failed') {
    const { data: mudou } = await supabase.from('whatsapp_envios')
      .update({ failed_at: ts, erro_status: o.erro || 'failed' })
      .eq('id', envio.id).is('failed_at', null).select('id');
    if (mudou?.length) {
      // mesma régua do webhook: falha REPORTADA depois do envio avisa gente
      const { avisarNaoEntregue } = require('./whatsappContexto');
      await avisarNaoEntregue(envio, o.erro || 'failed').catch(() => {});
    }
  }
}

async function aplicarNoChat(chatId, o) {
  const ts = o.status_timestamp || o.criado_em;
  const marca = async (patch, col) => {
    const { error } = await supabase.from('wa_mensagens')
      .update(patch).eq('id', chatId).is(col, null);
    if (error && error.code !== '42703') console.warn('[waStatusReconcile] chat:', error.message);
  };
  if (o.status === 'delivered') await marca({ delivered_at: ts }, 'delivered_at');
  else if (o.status === 'read') { await marca({ read_at: ts }, 'read_at'); await marca({ delivered_at: ts }, 'delivered_at'); }
  else if (o.status === 'failed') await marca({ failed_at: ts, erro_status: o.erro || 'failed' }, 'failed_at');
}

async function reconciliarStatusOrfaos({ limite = 200 } = {}) {
  const { data: orfaos, error } = await supabase.from('whatsapp_status_orfaos')
    .select('*').order('criado_em', { ascending: true }).limit(limite);
  if (error) return { ok: false, erro: error.message };
  let casados_envio = 0;
  let casados_chat = 0;
  let descartados_velhos = 0;
  const corteVelho = Date.now() - DESCARTE_DIAS * 86400000;

  for (const o of orfaos || []) {
    let casou = false;
    try {
      if (o.message_id) {
        const { data: envio } = await supabase.from('whatsapp_envios')
          .select('id, contexto, telefone, ref_id, template, tipo')
          .eq('message_id', o.message_id).maybeSingle();
        if (envio) {
          await aplicarNoEnvio(envio, o);
          casou = true; casados_envio += 1;
        } else {
          const { data: chat } = await supabase.from('wa_mensagens')
            .select('id').eq('wa_message_id', o.message_id).maybeSingle();
          if (chat) {
            await aplicarNoChat(chat.id, o);
            casou = true; casados_chat += 1;
          }
        }
      }
      const velho = new Date(o.criado_em).getTime() < corteVelho;
      if (casou || velho) {
        await supabase.from('whatsapp_status_orfaos').delete().eq('id', o.id);
        if (!casou) descartados_velhos += 1;
      }
    } catch (e) {
      console.warn('[waStatusReconcile] órfão %s:', o.id, e.message);
    }
  }
  return { ok: true, avaliados: (orfaos || []).length, casados_envio, casados_chat, descartados_velhos };
}

module.exports = { reconciliarStatusOrfaos };
