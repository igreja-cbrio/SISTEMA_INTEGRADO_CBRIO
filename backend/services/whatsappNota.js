// Fluxo de NOTA FISCAL por foto no WhatsApp.
//
// Qualquer número manda "nota fiscal" → o bot pede a(s) foto(s). Cada foto é
// processada NA HORA (extrai com Sonnet · rápido) e já vira uma COMPRA PENDENTE
// na aba Compras (aguardando aprovação do Pery). O bot pergunta se tem mais; ao
// dizer "não", encerra com o resumo. Criar por-foto (em vez de acumular pra
// finalizar) evita a corrida que travava o fluxo em loop.
//
// Intercepta ANTES da checagem de líder no webhook (qualquer número usa). Só
// "assume" quando há sessão de nota aberta ou gatilho explícito — senão devolve
// false e o fluxo normal (culto/grupos/institucional) segue.

const crypto = require('crypto');
const { supabase } = require('../utils/supabase');
const { enviarTexto } = require('./whatsappSend');
const { extrairNotaFiscal } = require('./nfScanner');
const { criarCompraPendenteDeNota } = require('./comprasShared');
const { notificar } = require('./notificar');

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || 'v21.0';
const MODELO = 'claude-sonnet-4-6';            // rápido e forte pra OCR de nota
const JANELA_MIN = 60;                          // sessão de nota viva por 60 min
const MIME_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };

const GATILHO_FORTE = /nota\s*fiscal|notinha|\bnf\b|(envi|mand|enviar|registrar|lan[cç]ar)[\sa-zà-ú]{0,14}\bnota/i;
const GATILHO_SOLTO = /\bnotas?\b/i;
const NEG = /n[aã]o|acabou|s[oó] ?ess|s[oó] ?isso|pronto|\bfim\b|finaliz|termin|encerr|conclu|nenhum|j[aá] enviei|\bdeu\b|chega/i;
const AFF = /\bsim\b|tenho|\bmais\b|outra|continu|vou mandar|\bmanda\b|envio mais|aguarda/i;
const CANCELAR = /\b(cancelar|cancela|deixa pra l[aá]|esquece|desistir)\b/i;

const fmtMoney = (v) => v != null ? `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'valor a conferir';
function ehGatilho(t) {
  const s = (t || '').trim();
  if (!s) return false;
  if (GATILHO_FORTE.test(s)) return true;
  if (GATILHO_SOLTO.test(s) && !/\d/.test(s) && s.length <= 24) return true;
  return false;
}

// Baixa a mídia da Meta (mesma lógica do fluxo de grupos)
async function baixarMedia(mediaId) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) return null;
  const meta = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json()).catch(() => null);
  if (!meta?.url) return null;
  const resp = await fetch(meta.url, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
  if (!resp || !resp.ok) return null;
  const buffer = Buffer.from(await resp.arrayBuffer());
  if (buffer.length > 16 * 1024 * 1024) return null;
  return { buffer, mime: meta.mime_type || resp.headers.get('content-type') || 'image/jpeg' };
}

async function getSessao(telefone) {
  const limite = new Date(Date.now() - JANELA_MIN * 60 * 1000).toISOString();
  const { data } = await supabase.from('whatsapp_coletas')
    .select('id, parsed')
    .eq('telefone', telefone).eq('status', 'aguardando_info')
    .gte('created_at', limite)
    .order('created_at', { ascending: false }).limit(5);
  return (data || []).find((c) => c.parsed?.fonte === 'nota_fiscal') || null;
}

async function abrirSessao(telefone, messageId) {
  // encerra sessões de nota antigas/presas desse número (começa limpo)
  const { data: antigas } = await supabase.from('whatsapp_coletas')
    .select('id, parsed').eq('telefone', telefone).eq('status', 'aguardando_info').limit(10);
  for (const a of (antigas || [])) {
    if (a.parsed?.fonte === 'nota_fiscal') {
      await supabase.from('whatsapp_coletas').update({ status: 'ignorado', erro: 'sessao_substituida' }).eq('id', a.id);
    }
  }
  const parsed = { fonte: 'nota_fiscal', criadas: 0, msg_ids: [] };
  const { data } = await supabase.from('whatsapp_coletas').insert({
    whatsapp_message_id: messageId, telefone, raw_text: 'Envio de nota fiscal (WhatsApp)',
    parsed, modulo_destino: 'logistica', status: 'aguardando_info',
  }).select('id, parsed').single();
  return data;
}

// Processa UMA foto: baixa → extrai → cria a compra pendente na hora.
async function processarImagem(sessao, m, telefone) {
  const parsed = sessao.parsed || { criadas: 0, msg_ids: [] };
  if (m.id && (parsed.msg_ids || []).includes(m.id)) return;       // dedup interno
  const mediaId = m.image?.id;
  if (!mediaId) { await enviarTexto(telefone, 'Não consegui ler essa imagem. Pode enviar a foto da nota de novo? 📸'); return; }
  // marca o message_id ANTES de processar (evita reprocesso em re-entrega concorrente)
  parsed.msg_ids = [...(parsed.msg_ids || []), m.id];
  await supabase.from('whatsapp_coletas').update({ parsed, updated_at: new Date().toISOString() }).eq('id', sessao.id);

  const media = await baixarMedia(mediaId);
  if (!media) { await enviarTexto(telefone, 'Não consegui baixar a foto. Tenta enviar de novo? 🙏'); return; }
  const ext = MIME_EXT[media.mime] || 'jpg';
  const path = `compras/whatsapp/${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
  let url = null;
  const { error: upErr } = await supabase.storage.from('log-arquivos').upload(path, media.buffer, { contentType: media.mime, upsert: false });
  // ⚠️ CAMINHO, não URL pública — a leitura assina (anexosLogArquivos).
  if (!upErr) url = path;

  let extraido = null;
  try { ({ extraido } = await extrairNotaFiscal(media.buffer, media.mime, MODELO)); }
  catch (e) { console.error('[whatsappNota] extrair:', e.message); }

  const compra = await criarCompraPendenteDeNota({ extraido, storagePath: url, telefone, origem: 'whatsapp' });
  if (compra) {
    parsed.criadas = (parsed.criadas || 0) + 1;
    await supabase.from('whatsapp_coletas').update({ parsed, updated_at: new Date().toISOString() }).eq('id', sessao.id);
    sessao.parsed = parsed;
    await enviarTexto(telefone, `✅ Nota ${parsed.criadas} registrada: *${extraido?.emitente_nome || 'fornecedor'}* · ${fmtMoney(extraido?.valor_total)} — já está *aguardando aprovação*.\nTem *mais alguma*? Mande a próxima foto, ou responda *não* pra finalizar.`);
  } else {
    await enviarTexto(telefone, 'Recebi a foto, mas não consegui ler os dados da nota. Pode tirar uma foto mais nítida (boa luz, nota inteira) e reenviar? 🙏');
  }
}

async function finalizar(sessao, telefone) {
  const criadas = sessao.parsed?.criadas || 0;
  if (!criadas) {
    // não fecha a sessão — pode haver foto em processamento ou nenhuma enviada ainda
    await enviarTexto(telefone, 'Ainda não recebi nenhuma nota. Se você *acabou de enviar* a foto, aguarde uns segundos. Senão, manda a *foto da nota* 📸 (ou diga *cancelar*).');
    return;
  }
  await supabase.from('whatsapp_coletas').update({ status: 'aplicado', updated_at: new Date().toISOString() }).eq('id', sessao.id);
  try {
    await notificar({
      modulo: 'logistica', tipo: 'compra_whatsapp',
      titulo: `${criadas} nota(s) fiscal(is) via WhatsApp`,
      mensagem: `Chegaram ${criadas} nota(s) pelo WhatsApp — confira e aprove na aba Compras.`,
      link: '/admin/logistica', severidade: 'info',
    });
  } catch (e) { /* best-effort */ }
  await enviarTexto(telefone, `✅ Pronto! Registrei ${criadas} ${criadas === 1 ? 'nota' : 'notas'} — ${criadas === 1 ? 'ela está' : 'todas estão'} *aguardando aprovação* na aba Compras. Obrigado! 🙌`);
}

async function cancelar(sessao, telefone) {
  await supabase.from('whatsapp_coletas').update({ status: 'ignorado', erro: 'cancelado_usuario', updated_at: new Date().toISOString() }).eq('id', sessao.id);
  await enviarTexto(telefone, 'Beleza, cancelei o envio. Quando quiser, é só mandar *nota fiscal* de novo. 👍');
}

/**
 * Interceptor do webhook. Retorna true se assumiu a mensagem (não passar adiante).
 */
async function tratarNotaFiscal({ m, telefone, texto, messageId }) {
  const sessao = await getSessao(telefone);
  const ehImagem = m.type === 'image';
  const ehTexto = m.type === 'text';
  const caption = m.image?.caption || '';

  if (!sessao) {
    if (ehTexto && ehGatilho(texto)) {
      await abrirSessao(telefone, messageId);
      await enviarTexto(telefone, '📸 Beleza! Me envie a *foto da nota fiscal*.\nPode mandar uma de cada vez — a cada foto eu já registro e pergunto se tem mais. Quando acabar, é só dizer *não*.');
      return true;
    }
    if (ehImagem && ehGatilho(caption)) {
      const s = await abrirSessao(telefone, messageId);
      if (s) await processarImagem(s, m, telefone);
      return true;
    }
    return false; // não é nota · segue o fluxo normal do webhook
  }

  if (ehImagem) { await processarImagem(sessao, m, telefone); return true; }
  if (ehTexto) {
    if (CANCELAR.test(texto)) { await cancelar(sessao, telefone); return true; }
    if (NEG.test(texto)) { await finalizar(sessao, telefone); return true; }
    if (AFF.test(texto)) { await enviarTexto(telefone, 'Pode mandar a próxima foto. 📸'); return true; }
    await enviarTexto(telefone, 'Me envie a *foto* da nota fiscal, ou responda *não* se já enviou todas. 🙏');
    return true;
  }
  await enviarTexto(telefone, 'Pra registrar a nota eu preciso da *foto* dela. Pode enviar? 📸');
  return true;
}

module.exports = { tratarNotaFiscal };
