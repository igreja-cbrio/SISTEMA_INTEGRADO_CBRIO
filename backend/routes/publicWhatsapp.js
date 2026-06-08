// Webhook publico do WhatsApp Cloud API (Meta). SEM auth ERP.
// GET  /api/whatsapp/webhook · verificacao (handshake da Meta)
// POST /api/whatsapp/webhook · recebimento de mensagens
//
// Duas personas (responde 200 imediato · processa async):
//   - Lider/assistente cadastrado -> coleta CONVERSACIONAL (multi-turno):
//     entende texto livre, pergunta o que faltou, quando completa marca
//     'parseado' (cai na fila do coordenador). Mantem estado em uma coleta
//     'aguardando_info' por ate 30 min.
//   - Numero desconhecido -> assistente INSTITUCIONAL (missao/visao/horarios).
//     NAO coleta dado · so responde.
const router = require('express').Router();
const crypto = require('crypto');
const { supabase } = require('../utils/supabase');
const { enviarTexto, normalizarTelefone } = require('../services/whatsappSend');
const { parseConversa, responderInstitucional } = require('../services/whatsappParser');
const { safeEqual } = require('../utils/cronAuth');
const flowColeta = require('../services/whatsappFlowColeta');

// Janela da "sessao" de coleta: enquanto houver uma coleta em aberto
// (status='aguardando_info') do lider, a proxima mensagem CONTINUA ela e
// completa os dados que faltam — nao fragmenta o relatorio em 2 cards.
// 7 dias cobre "mando o resto mais tarde/amanha" sem grudar no relatorio
// da semana seguinte (alem disso, ao completar vira 'parseado' e sai do radar).
const JANELA_CONVERSA_MIN = 60 * 24 * 7; // 7 dias

// ── GET · verificacao ───────────────────────────────────────────────
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const verify = process.env.WHATSAPP_VERIFY_TOKEN;
  if (mode === 'subscribe' && verify && token && safeEqual(String(token), verify)) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// ── POST · recebimento ──────────────────────────────────────────────
router.post('/', (req, res) => {
  res.sendStatus(200);
  processarEvento(req).catch(e => console.error('[whatsapp webhook] processar:', e.message));
});

// Validação HMAC · so se o APP_SECRET estiver configurado (prod).
function assinaturaValida(req) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) {
    // Fail-CLOSED em producao: sem o secret nao da pra provar que a Meta enviou.
    // Aceitar sem assinatura abriria injecao de coletas/spam de mensagens + custo
    // de LLM. Em dev/teste (sem NODE_ENV=production) ainda deixamos passar.
    return process.env.NODE_ENV !== 'production';
  }
  const assinatura = req.headers['x-hub-signature-256'];
  if (!assinatura || !req.rawBody) return false;
  const esperado = 'sha256=' + crypto.createHmac('sha256', secret).update(req.rawBody).digest('hex');
  try { return crypto.timingSafeEqual(Buffer.from(assinatura), Buffer.from(esperado)); }
  catch { return false; }
}

async function processarEvento(req) {
  if (!assinaturaValida(req)) {
    console.warn('[whatsapp webhook] assinatura HMAC invalida · ignorando');
    return;
  }
  // Respeita o toggle global da IA
  const { data: cfg } = await supabase.from('whatsapp_config').select('ia_ativa, institucional').eq('id', 1).maybeSingle();
  if (cfg && cfg.ia_ativa === false) return;

  const entry = req.body?.entry || [];
  // Cap defensivo · um unico POST forjado nao deve disparar N inserts + N
  // chamadas de LLM + N envios de WhatsApp (amplificacao de custo/DoS).
  let processadas = 0;
  const MAX_MSGS = 20;
  for (const e of entry) {
    for (const ch of (e.changes || [])) {
      const value = ch.value || {};
      const mensagens = value.messages || [];
      for (const m of mensagens) {
        const ehTexto = m.type === 'text';
        const ehFlowReply = m.type === 'interactive' && m.interactive?.type === 'nfm_reply';
        if (!ehTexto && !ehFlowReply) continue; // MVP · texto ou resposta de formulário
        if (++processadas > MAX_MSGS) {
          console.warn('[whatsapp webhook] limite de mensagens por evento atingido · ignorando excedente');
          return;
        }
        if (ehFlowReply) {
          await processarFlowReply(m).catch(err =>
            console.error('[whatsapp webhook] flow:', err.message));
        } else {
          await processarMensagem(m, cfg).catch(err =>
            console.error('[whatsapp webhook] mensagem:', err.message));
        }
      }
    }
  }
}

async function processarMensagem(m, cfg) {
  const messageId = m.id;
  const telefone = normalizarTelefone(m.from);
  // Cap de tamanho · evita mandar payload gigante pro parser (LLM) e pro banco.
  const texto = (m.text?.body || '').slice(0, 2000);

  // Idempotencia · se ja gravamos esse message_id, ignora reentrega
  const { data: jaVisto } = await supabase
    .from('whatsapp_coletas').select('id').eq('whatsapp_message_id', messageId).maybeSingle();
  if (jaVisto) return;

  // Identifica lider/assistente cadastrado
  const { data: lider } = await supabase
    .from('whatsapp_lideres')
    .select('id, nome_exibicao, escopo, grupo_id')
    .eq('telefone', telefone).eq('ativo', true).is('deleted_at', null)
    .maybeSingle();

  // ── Persona 1 · numero desconhecido -> assistente institucional ────
  if (!lider) {
    const resposta = await responderInstitucional({ texto, institucional: cfg?.institucional });
    await supabase.from('whatsapp_coletas').insert({
      whatsapp_message_id: messageId, telefone, raw_text: texto,
      status: 'ignorado', erro: 'institucional', modulo_destino: 'institucional',
    });
    await enviarTexto(telefone, resposta);
    return;
  }

  // ── Atalho · FORMULÁRIO (Flow) quando o líder PEDE pra lançar ──────
  // Só quando os Flows estão publicados (env) e o texto é um pedido (sem
  // números soltos). Senão, segue a coleta conversacional de sempre.
  if (flowColeta.flowsConfigurados() && flowColeta.pedeFormulario(texto)) {
    await enviarTexto(telefone, 'Boa! Já te mando o formulário pra preencher. 📋');
    await flowColeta.enviarFormularioCulto(telefone);
    return;
  }

  // ── Persona 2 · lider/assistente -> coleta conversacional ──────────
  const dica = (lider.escopo || []).length === 1 ? lider.escopo[0] : undefined;

  // Procura sessao aberta (aguardando_info) recente desse lider
  const limite = new Date(Date.now() - JANELA_CONVERSA_MIN * 60 * 1000).toISOString();
  const { data: aberta } = await supabase
    .from('whatsapp_coletas')
    .select('id, parsed, modulo_destino')
    .eq('lider_id', lider.id).eq('status', 'aguardando_info')
    .gte('created_at', limite)
    .order('created_at', { ascending: false })
    .limit(1).maybeSingle();

  const dadosColetados = aberta?.parsed?.dados || {};
  const dicaEfetiva = (aberta?.modulo_destino && aberta.modulo_destino !== 'desconhecido')
    ? aberta.modulo_destino : dica;

  const r = await parseConversa({ texto, dicaModulo: dicaEfetiva, dadosColetados });

  // Status resultante
  let status;
  if (r.pronto) status = 'parseado';                       // completo · vai pra fila
  else if (r.intent === 'reportar_dado') status = 'aguardando_info'; // falta dado · continua
  else status = 'recebido';                                // saudacao/duvida · so conversa

  const parsedToStore = {
    intent: r.intent, modulo: r.modulo, dados: r.dados,
    pronto: r.pronto, faltando: r.faltando, resumo: r.resumo,
  };

  if (aberta) {
    // Continua a sessao · atualiza a mesma coleta (e o message_id pro dedup)
    await supabase.from('whatsapp_coletas').update({
      whatsapp_message_id: messageId, raw_text: texto, parsed: parsedToStore,
      modulo_destino: r.modulo, status,
    }).eq('id', aberta.id);
  } else {
    await supabase.from('whatsapp_coletas').insert({
      whatsapp_message_id: messageId, telefone, lider_id: lider.id, raw_text: texto,
      parsed: parsedToStore, modulo_destino: r.modulo, status,
    });
  }

  // Resposta da IA (pergunta o que falta / confirma / tira duvida)
  const resposta = r.resposta || (r.pronto
    ? 'Recebi! Um lider vai conferir e lancar no sistema. Obrigado! 🙌'
    : 'Pode me mandar os numeros do encontro? Ex: "12 presentes, 2 visitantes, 1 decisao". 🙏');
  await enviarTexto(telefone, resposta);
}

// Resposta de FORMULÁRIO (Flow) · identifica o líder e delega pro orquestrador.
async function processarFlowReply(m) {
  const telefone = normalizarTelefone(m.from);
  // Idempotência (cobre o Flow do culto, que insere coleta com este message_id).
  const { data: jaVisto } = await supabase
    .from('whatsapp_coletas').select('id').eq('whatsapp_message_id', m.id).maybeSingle();
  if (jaVisto) return;
  const { data: lider } = await supabase
    .from('whatsapp_lideres')
    .select('id, nome_exibicao, escopo, grupo_id')
    .eq('telefone', telefone).eq('ativo', true).is('deleted_at', null)
    .maybeSingle();
  await flowColeta.tratarFlowReply(m, telefone, lider);
}

module.exports = router;
