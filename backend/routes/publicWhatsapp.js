// Webhook publico do WhatsApp Cloud API (Meta). SEM auth ERP · a Meta
// chama esse endpoint. Seguranca = verify_token (GET) + HMAC opcional (POST).
//
// GET  /api/public/whatsapp · verificacao do webhook (handshake da Meta)
// POST /api/public/whatsapp · recebimento de mensagens
//
// Fluxo do POST (responde 200 IMEDIATO · Meta da timeout em ~5s):
//   1. valida HMAC (se WHATSAPP_APP_SECRET setado)
//   2. pra cada mensagem de texto:
//      a. idempotencia (whatsapp_message_id UNIQUE)
//      b. identifica lider por telefone
//      c. parseia com Claude Haiku
//      d. grava em whatsapp_coletas (status 'parseado' ou 'recebido')
//      e. responde o lider (ack) via Graph API · cai na fila pro coord aplicar
const router = require('express').Router();
const crypto = require('crypto');
const { supabase } = require('../utils/supabase');
const { enviarTexto, normalizarTelefone } = require('../services/whatsappSend');
const { parseMensagem } = require('../services/whatsappParser');

// ── GET · verificacao do webhook ────────────────────────────────────
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// ── POST · recebimento ──────────────────────────────────────────────
router.post('/', (req, res) => {
  // Responde rapido · processa async (Meta reentrega se demorar)
  res.sendStatus(200);
  processarEvento(req).catch(e => console.error('[whatsapp webhook] processar:', e.message));
});

// Validacao HMAC · so se o APP_SECRET estiver configurado (prod).
// Em teste (sem secret) deixamos passar pra nao travar o MVP.
function assinaturaValida(req) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return true; // MVP/teste · sem validacao
  const assinatura = req.headers['x-hub-signature-256'];
  if (!assinatura || !req.rawBody) return false;
  const esperado = 'sha256=' + crypto.createHmac('sha256', secret).update(req.rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(assinatura), Buffer.from(esperado));
  } catch {
    return false;
  }
}

async function processarEvento(req) {
  if (!assinaturaValida(req)) {
    console.warn('[whatsapp webhook] assinatura HMAC invalida · ignorando');
    return;
  }
  const entry = req.body?.entry || [];
  for (const e of entry) {
    for (const ch of (e.changes || [])) {
      const value = ch.value || {};
      const mensagens = value.messages || [];
      for (const m of mensagens) {
        if (m.type !== 'text') continue; // MVP · so texto
        await processarMensagem(m, value);
      }
    }
  }
}

async function processarMensagem(m, value) {
  const messageId = m.id;
  const telefone = normalizarTelefone(m.from);
  const texto = m.text?.body || '';

  // a. Idempotencia · insere ja como 'recebido'. Se UNIQUE bate, ja vimos.
  const { data: coleta, error: insErr } = await supabase
    .from('whatsapp_coletas')
    .insert({
      whatsapp_message_id: messageId,
      telefone,
      raw_text: texto,
      status: 'recebido',
    })
    .select('id')
    .single();
  if (insErr) {
    if (insErr.code === '23505') return; // duplicada · ja processada
    console.error('[whatsapp webhook] insert coleta:', insErr.message);
    return;
  }

  // b. Identifica lider por telefone
  const { data: lider } = await supabase
    .from('whatsapp_lideres')
    .select('id, nome_exibicao, escopo, grupo_id')
    .eq('telefone', telefone)
    .eq('ativo', true)
    .is('deleted_at', null)
    .maybeSingle();

  // Numero nao reconhecido · responde educado + marca ignorado
  if (!lider) {
    await supabase.from('whatsapp_coletas')
      .update({ status: 'ignorado', erro: 'telefone_nao_vinculado' })
      .eq('id', coleta.id);
    await enviarTexto(telefone,
      'Ola! Esse numero ainda nao esta vinculado a um lider no sistema da CBRio. '
      + 'Fale com a equipe pra liberar o seu acesso. 🙏');
    return;
  }

  // c. Parseia com Claude · dica de modulo se o lider so tem 1 escopo
  const dica = (lider.escopo || []).length === 1 ? lider.escopo[0] : undefined;
  const parsed = await parseMensagem(texto, dica);

  // d. Atualiza coleta com o resultado
  const modulo = parsed.modulo && parsed.modulo !== 'desconhecido' ? parsed.modulo : 'desconhecido';
  const aplicavel = parsed.intent === 'reportar_dado' && modulo !== 'desconhecido';
  await supabase.from('whatsapp_coletas')
    .update({
      lider_id: lider.id,
      parsed,
      modulo_destino: modulo,
      status: aplicavel ? 'parseado' : 'recebido',
    })
    .eq('id', coleta.id);

  // e. Ack pro lider
  const nome = (lider.nome_exibicao || '').split(' ')[0];
  let resposta;
  if (aplicavel) {
    const resumo = parsed.resumo || 'dados do encontro';
    resposta = `Recebi${nome ? ', ' + nome : ''}! 📋 Entendi: ${resumo}. `
      + 'Um lider vai confirmar e lancar no sistema. Obrigado! 🙌';
  } else {
    resposta = `Oi${nome ? ', ' + nome : ''}! Nao consegui identificar numeros na sua mensagem. `
      + 'Tente algo como: "12 presentes, 2 visitantes, 1 decisao". 🙏';
  }
  await enviarTexto(telefone, resposta);
}

module.exports = router;
