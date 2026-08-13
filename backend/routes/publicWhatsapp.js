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
const whatsappGrupos = require('../services/whatsappGrupos');
const whatsappNota = require('../services/whatsappNota');

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

  // C0 · Statuses de entrega da Meta (delivered/read/failed) — SEMPRE processa,
  // ANTES do gate de IA (recibo de entrega não é IA; precisa registrar mesmo
  // com a IA desligada). Best-effort: nunca derruba o 200 do webhook.
  for (const e of (req.body?.entry || [])) {
    for (const ch of (e.changes || [])) {
      const st = ch.value?.statuses;
      if (Array.isArray(st) && st.length) {
        await processarStatuses(st).catch(err =>
          console.error('[whatsapp webhook] statuses:', err.message));
      }
    }
  }

  // Respeita o toggle global da IA
  // ⚠️⚠️ `ia_ativa === false` corta o webhook INTEIRO — inclusive o
  // `registrarInbound`, ou seja a mensagem da pessoa não aparece na aba
  // Conversas. É o freio de emergência, não o jeito de "calar o bot": pra isso
  // existe `respostas_automaticas` (migration 20260812130000), lida em
  // `processarMensagem`, que desliga só o que o bot RESPONDE e mantém o inbox
  // recebendo.
  const { data: cfg } = await supabase
    .from('whatsapp_config')
    .select('ia_ativa, institucional, respostas_automaticas')
    .eq('id', 1).maybeSingle();
  if (cfg && cfg.ia_ativa === false) return;

  const entry = req.body?.entry || [];
  // Cap defensivo · um unico POST forjado nao deve disparar N inserts + N
  // chamadas de LLM + N envios de WhatsApp (amplificacao de custo/DoS).
  let processadas = 0;
  const MAX_MSGS = 20;
  for (const e of entry) {
    for (const ch of (e.changes || [])) {
      const value = ch.value || {};
      // Multi-número (2026-08-12): a WABA entrega no MESMO webhook os eventos de
      // TODOS os números dela. O institucional (env WHATSAPP_PHONE_NUMBER_ID) é o
      // do BOT; qualquer outro (ex.: o CBZap, quando migrar da Multi360) é
      // atendimento humano puro — mensagem vai direto pro inbox, sem personas, e
      // a conversa registra o número pra resposta do time sair por ele.
      const pnid = value.metadata?.phone_number_id ? String(value.metadata.phone_number_id) : null;
      const institucional = ehNumeroBot(pnid);
      const mensagens = value.messages || [];
      for (const m of mensagens) {
        const ehTexto = m.type === 'text';
        const ehFlowReply = m.type === 'interactive' && m.interactive?.type === 'nfm_reply';
        // Botão de Aprovar/Recusar da aprovação de solicitação: interativo
        // (mensagem de sessão) OU quick-reply de TEMPLATE (m.type === 'button').
        const ehBotao = (m.type === 'interactive' && m.interactive?.type === 'button_reply') || m.type === 'button';
        // Áudio e foto são aceitos pro fluxo de GRUPOS (relato do encontro ·
        // transcrição/foto tratadas em services/whatsappGrupos).
        const ehMidia = m.type === 'audio' || m.type === 'image' || m.type === 'document';
        if (!ehTexto && !ehFlowReply && !ehMidia && !ehBotao) continue;
        if (++processadas > MAX_MSGS) {
          console.warn('[whatsapp webhook] limite de mensagens por evento atingido · ignorando excedente');
          return;
        }
        if (!institucional) {
          await inboxDireto(m, pnid).catch(err =>
            console.error('[whatsapp webhook] inbox direto:', err.message));
        } else if (ehFlowReply) {
          await processarFlowReply(m).catch(err =>
            console.error('[whatsapp webhook] flow:', err.message));
        } else if (ehBotao) {
          await processarBotaoAprovacao(m).catch(err =>
            console.error('[whatsapp webhook] botao:', err.message));
        } else {
          await processarMensagem(m, cfg, pnid).catch(err =>
            console.error('[whatsapp webhook] mensagem:', err.message));
        }
      }
    }
  }
}

// Multi-número: true quando o evento veio do número do BOT (institucional =
// WHATSAPP_PHONE_NUMBER_ID da env). Payload sem metadata (payload antigo/teste)
// conta como bot — comportamento idêntico ao histórico.
function ehNumeroBot(pnid) {
  const padrao = process.env.WHATSAPP_PHONE_NUMBER_ID;
  return !pnid || !padrao || String(pnid) === String(padrao);
}

// Pesquisa de satisfação 0-5 — conversa finalizada aguardando a nota. Vale pra
// QUALQUER número da WABA (a pesquisa é da CONVERSA, não do bot); por isso vive
// aqui fora, usada pelo fluxo do bot (processarMensagem) E pelo multi-número
// (inboxDireto) — a régua é UMA. Devolve true quando assumiu a mensagem.
async function tratarPesquisaSatisfacao({ telefone, texto, messageId, pnid = null }) {
  const { data: convP } = await supabase.from('wa_conversas')
    .select('id, pesquisa_estado, protocolo').eq('telefone', telefone)
    .eq('pesquisa_estado', 'aguardando').is('deleted_at', null).maybeSingle();
  if (!convP) return false;
  const waInbox = require('../services/waInbox');
  const t = String(texto || '').trim();
  const nota = /^[0-5]$/.test(t) ? Number(t) : null;
  const agora = new Date().toISOString();
  if (nota != null) {
    await supabase.from('wa_mensagens').insert({
      conversa_id: convP.id, direcao: 'in', tipo: 'avaliacao', texto: t, wa_message_id: messageId,
    }).catch(() => {});
    await supabase.from('wa_conversas').update({
      satisfacao: nota, satisfacao_em: agora, pesquisa_estado: 'respondida',
      last_message_at: agora, ultima_previa: `Avaliação: ${nota}/5`,
    }).eq('id', convP.id);
    const agr = `Obrigado pela sua avaliação (${nota}/5)! 🙏 Se precisar, é só chamar de novo.`;
    // Agradece pelo número por onde a conversa aconteceu (default = env).
    const rAgr = await enviarTexto(telefone, agr, pnid ? { phoneNumberId: pnid } : {}).catch(() => null);
    await waInbox.registrarOutbound({ telefone, texto: agr, tipo: 'bot', phoneNumberId: pnid, waMessageId: rAgr?.message_id || null }).catch(() => {});
  } else {
    // não foi 0-5 → encerra a espera e deixa a mensagem no inbox pro time
    await supabase.from('wa_conversas').update({ pesquisa_estado: 'ignorada' }).eq('id', convP.id);
    await waInbox.registrarInbound({ telefone, texto, messageId, tipo: 'text', phoneNumberId: pnid }).catch(() => {});
  }
  return true;
}

// Mensagem chegando por número que NÃO é o do bot: atendimento humano puro —
// nada de opt-out/triagem/coleta/institucional (personas são do número do bot).
// Só a pesquisa de satisfação (que é da CONVERSA, não do bot) e o inbox.
async function inboxDireto(m, pnid) {
  const messageId = m.id;
  const telefone = normalizarTelefone(m.from);
  const texto = (m.text?.body
    || m.button?.text
    || m.interactive?.button_reply?.title
    || m.interactive?.list_reply?.title
    || '').slice(0, 2000);
  if (m.type === 'text') {
    const assumiu = await tratarPesquisaSatisfacao({ telefone, texto, messageId, pnid });
    if (assumiu) return;
  }
  await require('../services/waInbox').registrarInbound({
    telefone, texto, messageId,
    tipo: m.type === 'image' ? 'image' : m.type === 'audio' ? 'audio' : m.type === 'document' ? 'document' : 'text',
    mediaId: m.image?.id || m.audio?.id || m.document?.id,
    phoneNumberId: pnid,
  });
}

// C0 · Processa os recibos de status da Meta (value.statuses[]).
// Cada item: { id (message_id/wamid), status: sent|delivered|read|failed,
// timestamp (unix s), recipient_id, errors[] }. Casa por message_id com
// whatsapp_envios (a fila grava o message_id no envio); se não achar, tenta o
// chat (wa_mensagens.wa_message_id) e senão registra em whatsapp_status_orfaos
// pra nada se perder. Idempotente: os UPDATE são guardados por `.is(col, null)`
// (não sobrescrevem o 1º timestamp; reprocessar o mesmo status não regride).
async function processarStatuses(statuses) {
  for (const s of statuses) {
    try {
      const messageId = s?.id;
      const st = s?.status;
      if (!messageId || !st || st === 'sent') continue; // 'sent' já é o 'enviado' da fila
      const ts = s.timestamp
        ? new Date(Number(s.timestamp) * 1000).toISOString()
        : new Date().toISOString();
      const erroTxt = st === 'failed'
        ? String(s.errors?.[0]?.title || s.errors?.[0]?.message || s.errors?.[0]?.code || 'failed').slice(0, 300)
        : null;

      // contexto/telefone/ref_id vêm junto porque o `failed` agora AVISA gente
      // (antes só gravava a coluna e a falha morria em silêncio).
      const { data: envio } = await supabase.from('whatsapp_envios')
        .select('id, contexto, telefone, ref_id, template')
        .eq('message_id', messageId).maybeSingle();

      if (envio) {
        if (st === 'delivered') {
          await supabase.from('whatsapp_envios').update({ delivered_at: ts })
            .eq('message_id', messageId).is('delivered_at', null);
        } else if (st === 'read') {
          // read implica delivered — preenche o delivered_at se ainda vazio
          await supabase.from('whatsapp_envios').update({ read_at: ts })
            .eq('message_id', messageId).is('read_at', null);
          await supabase.from('whatsapp_envios').update({ delivered_at: ts })
            .eq('message_id', messageId).is('delivered_at', null);
        } else if (st === 'failed') {
          // ⚠️ O `.select('id')` NÃO é enfeite: é ele que diz se ESTA entrega do
          // webhook foi a que transicionou a linha. O `.is('failed_at', null)`
          // torna o UPDATE idempotente, mas sem saber quantas linhas mudaram a
          // reentrega da Meta (que é normal, e ela reentrega muitas vezes)
          // avisaria de novo a cada vez. Mesma lição da guarda de idempotência:
          // o efeito colateral tem que estar amarrado à transição real.
          const { data: mudou } = await supabase.from('whatsapp_envios')
            .update({ failed_at: ts, erro_status: erroTxt })
            .eq('message_id', messageId).is('failed_at', null)
            .select('id');

          // ⚠️ AQUI cai o "número brasileiro válido SEM WhatsApp": a Meta ACEITA
          // o envio (200, message_id emitido) e só depois reporta `failed`. Era
          // o furo registrado no CLAUDE.md — a falha ficava só na tabela e
          // ninguém sabia que a pessoa não recebeu.
          if (mudou?.length) {
            const { avisarNaoEntregue } = require('../services/whatsappContexto');
            await avisarNaoEntregue(envio, erroTxt);
          }
        }
        continue;
      }

      // Não é da fila: é do chat (outbound do inbox/bot)? Grava o recibo NA
      // MENSAGEM (13/08 · caso da Júlia: a resposta do atendente não tinha
      // ✓✓ porque isto aqui descartava). Guardas .is(col, null) = idempotente
      // (reentrega da Meta não regride o 1º timestamp). 42703 = migration
      // 20260813190000 ausente → ignora (vira órfão, comportamento antigo).
      const { data: chat } = await supabase.from('wa_mensagens')
        .select('id').eq('wa_message_id', messageId).maybeSingle();
      if (chat) {
        const marca = async (patch, col) => {
          const { error: eUp } = await supabase.from('wa_mensagens')
            .update(patch).eq('id', chat.id).is(col, null);
          if (eUp && eUp.code !== '42703') console.warn('[whatsapp webhook] status chat:', eUp.message);
          return eUp;
        };
        if (st === 'delivered') {
          await marca({ delivered_at: ts }, 'delivered_at');
        } else if (st === 'read') {
          await marca({ read_at: ts }, 'read_at');
          await marca({ delivered_at: ts }, 'delivered_at'); // read implica delivered
        } else if (st === 'failed') {
          const eUp = await marca({ failed_at: ts, erro_status: erroTxt }, 'failed_at');
          // Mensagem de ATENDENTE que não chegou merece aviso ativo — o ⚠ na
          // thread só aparece quando alguém reabre a conversa.
          if (!eUp) {
            const { notificar } = require('../services/notificar');
            await notificar({
              modulo: 'conversas',
              tipo: 'whatsapp_chat_falhou',
              titulo: 'Mensagem do chat não entregue',
              mensagem: `Uma mensagem enviada pelo chat pro número ${s.recipient_id || '?'} falhou (${String(erroTxt || 'failed').slice(0, 120)}). Confira a conversa.`,
              link: '/comunicacao?tab=conversas',
              severidade: 'aviso',
              chaveDedup: `wa_chat_falha_${messageId}`,
            }).catch(() => {});
          }
        }
        continue;
      }
      await supabase.from('whatsapp_status_orfaos').insert({
        message_id: messageId, status: st, status_timestamp: ts, erro: erroTxt, raw: s,
      }).catch(() => {});
    } catch (e) {
      console.error('[whatsapp webhook] status item:', e.message);
    }
  }
}

// Resposta por BOTÃO (Aprovar/Recusar) da aprovação de solicitação. O id do botão
// ('aprovar'/'rejeitar') é interpretado pelo tratarRespostaAprovacao igual ao número.
async function processarBotaoAprovacao(m) {
  const messageId = m.id;
  const telefone = normalizarTelefone(m.from);
  // Botão interativo (session) → interactive.button_reply.id · quick-reply de
  // TEMPLATE → m.button.text/payload (ex.: "Aprovar"/"Recusar"). interpretar() casa os dois.
  const botaoId = m.type === 'button'
    ? (m.button?.text || m.button?.payload || '')
    : (m.interactive?.button_reply?.id || '');
  const { data: jaVisto } = await supabase
    .from('whatsapp_coletas').select('id').eq('whatsapp_message_id', messageId).maybeSingle();
  if (jaVisto) return;
  await require('../services/solicitacaoWpp')
    .tratarRespostaAprovacao({ telefone, texto: botaoId })
    .catch(err => console.error('[whatsapp webhook] botao aprovacao:', err.message));
  await supabase.from('whatsapp_coletas').insert({
    whatsapp_message_id: messageId, telefone, raw_text: botaoId, status: 'ignorado',
  }).catch(() => {});
}

async function processarMensagem(m, cfg, pnid = null) {
  const messageId = m.id;
  const telefone = normalizarTelefone(m.from);
  // Cap de tamanho · evita mandar payload gigante pro parser (LLM) e pro banco.
  const texto = (m.text?.body || '').slice(0, 2000);

  // Idempotencia · se ja gravamos esse message_id, ignora reentrega
  const { data: jaVisto } = await supabase
    .from('whatsapp_coletas').select('id').eq('whatsapp_message_id', messageId).maybeSingle();
  if (jaVisto) return;

  // ── OPT-OUT / OPT-IN · PRIORIDADE MÁXIMA (Marcos 2026-07-24). Quem pede pra
  // parar é desligado NA HORA (membro + líder), antes de qualquer fluxo —
  // respeitar isso protege o número (opt-out é melhor que bloqueio). Pega o
  // texto digitado OU o payload do botão "Não quero mais receber" dos templates.
  {
    const optSvc = require('../services/whatsappOptout');
    let bruto = texto, deBotao = false;
    if (m.type === 'button') { bruto = m.button?.text || m.button?.payload || ''; deBotao = true; }
    else if (m.type === 'interactive') { bruto = m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || m.interactive?.button_reply?.id || ''; deBotao = true; }
    const intencao = optSvc.intencaoOptOut(bruto, { deBotao });
    if (intencao) {
      const ligar = intencao === 'in';
      const r = await optSvc.aplicarOptOut({ telefone, ligar }).catch(err => { console.error('[whatsapp webhook] optout:', err.message); return null; });
      await supabase.from('whatsapp_coletas').insert({
        whatsapp_message_id: messageId, telefone, raw_text: (bruto || texto || '').slice(0, 2000),
        status: 'ignorado', parsed: { fonte: ligar ? 'opt_in' : 'opt_out', afetados: r?.afetados ?? 0 },
      }).catch(() => {});
      await enviarTexto(telefone, ligar
        ? 'Pronto! Você voltou a receber as mensagens da CBRio. 🙏'
        : 'Pronto, você não vai mais receber mensagens da CBRio por aqui. Se mudar de ideia, responda VOLTAR.'
      ).catch(() => {});
      return;
    }
  }

  // ── APROVAÇÃO DE SOLICITAÇÃO · se o número tem solicitação aguardando (ex.:
  // Arthur), interpreta 1=aprovar / 2=rejeitar e aplica. Intercepta cedo (só
  // assume se houver pendência pra este número); senão segue o fluxo normal.
  const tratadoAprov = await require('../services/solicitacaoWpp')
    .tratarRespostaAprovacao({ telefone, texto })
    .catch(err => { console.error('[whatsapp webhook] aprovacao:', err.message); return false; });
  if (tratadoAprov) {
    await supabase.from('whatsapp_coletas').insert({
      whatsapp_message_id: messageId, telefone, raw_text: texto, status: 'ignorado',
    }).catch(() => {});
    return;
  }

  // ── NOTA FISCAL · qualquer número envia foto(s) → fila de aprovação da aba
  // Compras. Intercepta ANTES da checagem de líder (não restringe remetente) e
  // só assume quando há sessão de nota aberta ou gatilho explícito ("nota
  // fiscal"); senão devolve false e o fluxo normal segue.
  const tratadoNota = await whatsappNota
    .tratarNotaFiscal({ m, telefone, texto, messageId })
    .catch(err => { console.error('[whatsapp webhook] nota:', err.message); return false; });
  if (tratadoNota) return;

  // ── PESQUISA DE SATISFAÇÃO ── conversa finalizada aguardando a nota (0-5).
  // Captura a resposta como avaliação e agradece (não reabre o ticket).
  if (m.type === 'text') {
    const assumiu = await tratarPesquisaSatisfacao({ telefone, texto, messageId, pnid });
    if (assumiu) return;
  }

  // ── INBOX HUMANO ASSUMIDO ── se a igreja já iniciou/assumiu uma conversa
  // com este número pelo inbox (Nova conversa ou resposta do time), as
  // respostas voltam pro inbox — NÃO pro bot — mesmo que o número seja líder.
  // Exceção: se houver coleta conversacional aberta (líder mid-report), o bot
  // continua (não interrompe uma coleta em andamento).
  const { data: convAssumida } = await supabase.from('wa_conversas')
    .select('id').eq('telefone', telefone).eq('assumida_humano', true).is('deleted_at', null).maybeSingle();
  if (convAssumida) {
    const limColeta = new Date(Date.now() - JANELA_CONVERSA_MIN * 60 * 1000).toISOString();
    const { data: coletaViva } = await supabase.from('whatsapp_coletas')
      .select('id').eq('telefone', telefone).eq('status', 'aguardando_info').gte('created_at', limColeta).limit(1).maybeSingle();
    if (!coletaViva) {
      await require('../services/waInbox').registrarInbound({
        telefone, texto, messageId,
        tipo: m.type === 'image' ? 'image' : m.type === 'audio' ? 'audio' : m.type === 'document' ? 'document' : 'text',
        mediaId: m.image?.id || m.audio?.id || m.document?.id,
        phoneNumberId: pnid,
      }).catch(e => console.error('[whatsapp webhook] inbox assumida:', e.message));
      return; // não aciona bot nem resposta institucional
    }
  }

  // Identifica lider/assistente cadastrado
  const { data: lider } = await supabase
    .from('whatsapp_lideres')
    .select('id, nome_exibicao, escopo, grupo_id, papel')
    .eq('telefone', telefone).eq('ativo', true).is('deleted_at', null)
    .maybeSingle();

  // ── COLETA APOSENTADA (Marcos · 2026-08-13): "os líderes de integração não
  // compraram a ideia — pode inclusive aposentar isso". A persona de coleta
  // (números de culto por texto/formulário Flow, relato de encontro de grupos
  // por texto/áudio) está DESLIGADA: todo mundo — inclusive coordenador — cai
  // na persona 1 (inbox + triagem/institucional). Todo o código abaixo do
  // bloco da persona 1 fica DORMANTE de propósito (reativar = restaurar a
  // linha histórica `lider && lider.papel === 'coordenador'`). A fila de
  // Coletas e a aba antiga saíram da UI na mesma data (admin/Whatsapp.jsx).
  const podeColetar = false;

  // ── Persona 1 · numero desconhecido (ou sem permissão de coleta) ────
  if (!podeColetar) {
    // Inbox humano (Cuidados → Conversas): captura a mensagem de quem NÃO é
    // fluxo do bot (convertidos, visitantes) pra o time responder. Best-effort.
    const waInbox = require('../services/waInbox');
    await waInbox.registrarInbound({
      telefone, texto, messageId,
      tipo: m.type === 'image' ? 'image' : m.type === 'audio' ? 'audio' : m.type === 'document' ? 'document' : 'text',
      mediaId: m.image?.id || m.audio?.id || m.document?.id,
      phoneNumberId: pnid,
    }).catch(e => console.error('[whatsapp webhook] inbox in:', e.message));
    if (m.type !== 'text') return; // mídia: já no inbox; não custa LLM institucional

    // ⚠️⚠️ SEM RESPOSTA AUTOMÁTICA (Matheus · 12/08/2026): *"não quero bot; o que
    // a pessoa falar não deve abrir o menu. Será apenas atendimento humanizado
    // por enquanto."* A mensagem JÁ está no inbox (logo acima) — daqui pra
    // frente é gente que responde.
    // ⚠️ O gate é AQUI e não no topo do webhook: `ia_ativa` faz `return` ANTES
    // do `registrarInbound`, então usá-lo calaria o bot CEGANDO a aba Conversas.
    // ⚠️ E é depois do `podeColetar`: o formulário de números de culto dos
    // COORDENADORES é ferramenta de trabalho, não atendimento — não é o "bot"
    // de que ele está falando.
    if (cfg && cfg.respostas_automaticas === false) {
      await supabase.from('whatsapp_coletas').insert({
        whatsapp_message_id: messageId, telefone, raw_text: texto,
        status: 'ignorado', erro: 'respostas_automaticas_desligadas',
        modulo_destino: 'conversas',
      }).catch(() => {});
      return;
    }

    // ── BOT DE TRIAGEM ── número realmente desconhecido (não-líder): o bot
    // pergunta o setor + nome, tria pra área e notifica a equipe. Substitui a
    // FAQ institucional. Líder-comum (coleta_restrita) mantém o institucional.
    if (!lider) {
      const assumiu = await require('../services/whatsappTriagem')
        .tratar({ telefone, texto })
        .catch(e => { console.error('[whatsapp webhook] triagem:', e.message); return false; });
      if (assumiu) {
        await supabase.from('whatsapp_coletas').insert({
          whatsapp_message_id: messageId, telefone, raw_text: texto,
          status: 'ignorado', erro: 'triagem', modulo_destino: 'conversas',
        }).catch(() => {});
        return;
      }
    }

    const resposta = await responderInstitucional({ texto, institucional: cfg?.institucional });
    await supabase.from('whatsapp_coletas').insert({
      whatsapp_message_id: messageId, telefone, raw_text: texto,
      status: 'ignorado', erro: lider ? 'coleta_restrita' : 'institucional', modulo_destino: 'institucional',
    });
    const rInst = await enviarTexto(telefone, resposta);
    await waInbox.registrarOutbound({ telefone, texto: resposta, tipo: 'institucional', phoneNumberId: pnid, waMessageId: rInst?.message_id || null })
      .catch(e => console.error('[whatsapp webhook] inbox out:', e.message));
    return;
  }

  // ── GRUPOS DE CONEXÃO · relato do encontro (texto/áudio/foto) ──────
  // Sessão de relato aberta (lembrete do cron), mídia de líder com escopo
  // grupos, ou texto de líder SÓ-grupos → o fluxo de grupos assume aqui
  // (extrai presenças nominais + resumo · fila de revisão). Senão, segue
  // o fluxo existente (formulário de culto / conversa).
  const tratadoGrupos = await whatsappGrupos
    .tratarMensagemGrupos({ m, lider, telefone, messageId })
    .catch(err => { console.error('[whatsapp webhook] grupos:', err.message); return false; });
  if (tratadoGrupos) return;
  if (m.type !== 'text') return; // mídia que o fluxo de grupos não assumiu · para aqui

  // ── Sessão conversacional aberta? (líder mid-coleta por texto) ─────
  // Se há uma coleta conversacional em aberto desse líder, a próxima
  // mensagem CONTINUA ela — mesmo sem números (ex: "nenhuma", "só isso") —
  // pra não interromper a coleta com o formulário. Ignora sessões de
  // FORMULÁRIO (fonte:'flow' · loop de pessoas) pra os dois modos não colidirem.
  const limite = new Date(Date.now() - JANELA_CONVERSA_MIN * 60 * 1000).toISOString();
  let { data: aberta } = await supabase
    .from('whatsapp_coletas')
    .select('id, parsed, modulo_destino')
    .eq('lider_id', lider.id).eq('status', 'aguardando_info')
    .gte('created_at', limite)
    .order('created_at', { ascending: false })
    .limit(1).maybeSingle();
  if (aberta?.parsed?.fonte === 'flow') aberta = null; // sessão de formulário · não mistura
  if (aberta?.parsed?.fonte === 'grupo_encontro') aberta = null; // sessão de relato de grupo · tratada acima

  // ── Caminho rápido (SEM LLM) · sem sessão aberta + sem números ─────
  // Regra desenhada com o Marcos (2026-06-08): o formulário (Flow) é o
  // caminho principal e INSTANTÂNEO. Líder cadastrado SEM coleta em aberto
  // que manda mensagem SEM números está pedindo pra reportar (ou só
  // cumprimentando) → mandamos o formulário na hora. Só caímos no Haiku
  // (mais lento) quando há sessão aberta OU o líder DIGITA números soltos.
  if (!aberta && flowColeta.pedeFormulario(texto)) {
    const podeForm = flowColeta.flowsConfigurados() && (lider.escopo || []).includes('integracao');
    // Dedup defensivo (reentrega da Meta): claim do message_id antes de responder.
    const { error: dupErr } = await supabase.from('whatsapp_coletas').insert({
      whatsapp_message_id: messageId, telefone, lider_id: lider.id, raw_text: texto,
      status: 'recebido', modulo_destino: podeForm ? 'integracao' : 'desconhecido',
      erro: podeForm ? 'form_enviado' : 'orientacao',
    });
    if (dupErr) {
      if (dupErr.code === '23505') return; // já respondemos a essa mensagem
      console.error('[whatsapp webhook] dedup form:', dupErr.message);
    }
    if (podeForm) {
      const fres = await flowColeta.enviarFormularioCulto(telefone, lider.nome_exibicao);
      // Diagnóstico: se o Flow não abriu (estado draft/publish na Meta, etc),
      // grava o erro da Graph na própria coleta pra inspeção via banco.
      if (fres && fres.ok === false && fres.error !== 'sem_cultos') {
        await supabase.from('whatsapp_coletas')
          .update({ erro: ('flow_fail: ' + String(fres.error || '?')).slice(0, 250) })
          .eq('whatsapp_message_id', messageId);
      }
    } else {
      // Líder só de grupos (ou Flows não configurados): grupos não tem
      // formulário (encontro exige lista nominal) → orientação templated.
      const primeiro = (lider.nome_exibicao || '').split(' ')[0];
      await enviarTexto(telefone,
        `Oi${primeiro ? ', ' + primeiro : ''}! Me manda os números do encontro que eu registro. `
        + 'Ex: "12 presentes, 2 visitantes, 1 decisão". 🙏');
    }
    return;
  }

  // ── Coleta conversacional (Haiku) ──────────────────────────────────
  const dica = (lider.escopo || []).length === 1 ? lider.escopo[0] : undefined;

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
// ⚠️ COLETA APOSENTADA (2026-08-13): nenhum formulário é mais enviado; uma
// resposta que chegue aqui é de Flow ANTIGO parado num celular — registra e
// descarta, sem processar (reativar = remover este bloco).
async function processarFlowReply(m) {
  const telefone = normalizarTelefone(m.from);
  await supabase.from('whatsapp_coletas').insert({
    whatsapp_message_id: m.id, telefone, raw_text: '[nfm_reply descartado]',
    status: 'ignorado', erro: 'coleta_aposentada', modulo_destino: 'desconhecido',
  }).catch(() => {});
  return;
  // eslint-disable-next-line no-unreachable -- código dormante da persona de coleta
  // Idempotência (cobre o Flow do culto, que insere coleta com este message_id).
  const { data: jaVisto } = await supabase
    .from('whatsapp_coletas').select('id').eq('whatsapp_message_id', m.id).maybeSingle();
  if (jaVisto) return;
  const { data: lider } = await supabase
    .from('whatsapp_lideres')
    .select('id, nome_exibicao, escopo, grupo_id, papel')
    .eq('telefone', telefone).eq('ativo', true).is('deleted_at', null)
    .maybeSingle();
  // Coleta restrita a coordenadores (Marcos · 2026-07-10): resposta de
  // formulário de quem não é coordenador é registrada e descartada — não
  // vira coleta (líder comum não pode alimentar contagem oficial).
  if (!lider || lider.papel !== 'coordenador') {
    await supabase.from('whatsapp_coletas').insert({
      whatsapp_message_id: m.id, telefone, raw_text: '[nfm_reply descartado]',
      status: 'ignorado', erro: 'coleta_restrita', modulo_destino: 'desconhecido',
    }).catch(() => {});
    return;
  }
  await flowColeta.tratarFlowReply(m, telefone, lider);
}

module.exports = router;
