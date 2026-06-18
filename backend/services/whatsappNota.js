// Fluxo de NOTA FISCAL por foto no WhatsApp.
//
// Qualquer número manda "nota fiscal" → o bot pede a(s) foto(s), aceita VÁRIAS
// (uma de cada vez, perguntando se tem mais), e ao finalizar extrai TODAS com o
// melhor modelo da Anthropic (Opus) e cria uma COMPRA PENDENTE por nota na aba
// Compras (aguardando aprovação do Pery). Nada entra direto — só a fila.
//
// Intercepta ANTES da checagem de líder no webhook (qualquer número usa). Só
// "assume" a mensagem quando há sessão de nota aberta ou gatilho explícito —
// senão devolve false e o fluxo normal (culto/grupos/institucional) segue.

const crypto = require('crypto');
const { supabase } = require('../utils/supabase');
const { enviarTexto } = require('./whatsappSend');
const { extrairNotaFiscal } = require('./nfScanner');
const { criarCompraPendenteDeNota } = require('./comprasShared');
const { notificar } = require('./notificar');

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || 'v21.0';
const OPUS = 'claude-opus-4-8';                 // melhor modelo de visão da Anthropic
const JANELA_MIN = 60;                          // sessão de nota viva por 60 min
const MIME_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };

const GATILHO_FORTE = /nota\s*fiscal|notinha|\bnf\b|(envi|mand|enviar|registrar|lan[cç]ar)[\sa-zà-ú]{0,14}\bnota/i;
const GATILHO_SOLTO = /\bnotas?\b/i;
const NEG = /n[aã]o|acabou|s[oó] ?ess|s[oó] ?isso|pronto|\bfim\b|finaliz|termin|encerr|conclu|nenhum|j[aá] enviei|\bdeu\b|chega/i;
const AFF = /\bsim\b|tenho|\bmais\b|outra|continu|vou mandar|\bmanda\b|envio mais|aguarda/i;
const CANCELAR = /\b(cancelar|cancela|deixa pra l[aá]|esquece|desistir)\b/i;

const fmtMoney = (v) => v != null ? `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'valor a conferir';
// Gatilho: "nota fiscal"/"nf"/"enviar nota" em qualquer caso, OU "nota" sozinha
// em mensagem curta SEM números (evita disparar em relato de culto/grupo).
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
  const parsed = { fonte: 'nota_fiscal', fotos: [], msg_ids: [] };
  const { data } = await supabase.from('whatsapp_coletas').insert({
    whatsapp_message_id: messageId, telefone, raw_text: 'Envio de nota fiscal (WhatsApp)',
    parsed, modulo_destino: 'logistica', status: 'aguardando_info',
  }).select('id, parsed').single();
  return data;
}

async function processarImagem(sessao, m, telefone) {
  const parsed = sessao.parsed || { fotos: [], msg_ids: [] };
  if (m.id && (parsed.msg_ids || []).includes(m.id)) return;       // dedup interno
  const mediaId = m.image?.id;
  if (!mediaId) { await enviarTexto(telefone, 'Não consegui ler essa imagem. Pode enviar a foto da nota de novo? 📸'); return; }
  const media = await baixarMedia(mediaId);
  if (!media) { await enviarTexto(telefone, 'Não consegui baixar a foto. Tenta enviar de novo? 🙏'); return; }
  const ext = MIME_EXT[media.mime] || 'jpg';
  const path = `compras/whatsapp/${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
  const { error } = await supabase.storage.from('log-arquivos').upload(path, media.buffer, { contentType: media.mime, upsert: false });
  if (error) { await enviarTexto(telefone, 'Tive um problema pra salvar a foto. Tenta de novo? 🙏'); return; }
  const url = supabase.storage.from('log-arquivos').getPublicUrl(path).data.publicUrl;
  parsed.fotos = [...(parsed.fotos || []), { path, url, mime: media.mime }];
  parsed.msg_ids = [...(parsed.msg_ids || []), m.id];
  await supabase.from('whatsapp_coletas').update({ parsed, updated_at: new Date().toISOString() }).eq('id', sessao.id);
  sessao.parsed = parsed;
  const n = parsed.fotos.length;
  await enviarTexto(telefone, `✅ Recebi a nota ${n}. Tem *mais alguma* nota pra enviar?\nResponda *sim* (e mande a próxima foto) ou *não* pra eu finalizar.`);
}

async function finalizar(sessao, telefone) {
  const fotos = sessao.parsed?.fotos || [];
  if (!fotos.length) {
    await enviarTexto(telefone, 'Você ainda não me enviou nenhuma foto. Manda a *foto da nota fiscal* 📸 (ou diga *cancelar*).');
    return;
  }
  await enviarTexto(telefone, `Show! Estou lendo ${fotos.length} ${fotos.length === 1 ? 'nota' : 'notas'} e enviando pro sistema… ⏳`);
  let ok = 0;
  const resumos = [];
  for (const f of fotos) {
    try {
      const buffer = await fetch(f.url).then((r) => r.arrayBuffer()).then((b) => Buffer.from(b));
      const { extraido } = await extrairNotaFiscal(buffer, f.mime, OPUS);
      const compra = await criarCompraPendenteDeNota({ extraido, storagePath: f.url, telefone, origem: 'whatsapp' });
      if (compra) { ok++; resumos.push(`• ${extraido?.emitente_nome || 'Nota'} — ${fmtMoney(extraido?.valor_total)}`); }
    } catch (e) { console.error('[whatsappNota] extrair/criar:', e.message); }
  }
  await supabase.from('whatsapp_coletas')
    .update({ status: 'aplicado', parsed: { ...sessao.parsed, total_criadas: ok }, updated_at: new Date().toISOString() })
    .eq('id', sessao.id);
  if (ok) {
    try {
      await notificar({
        modulo: 'logistica', tipo: 'compra_whatsapp',
        titulo: `${ok} nota(s) fiscal(is) via WhatsApp`,
        mensagem: `Chegaram ${ok} nota(s) pelo WhatsApp — confira e aprove na aba Compras.`,
        link: '/admin/logistica', severidade: 'info',
      });
    } catch (e) { /* best-effort */ }
    await enviarTexto(telefone, `✅ Pronto! Enviei ${ok} ${ok === 1 ? 'nota' : 'notas'} pro sistema:\n${resumos.join('\n')}\n\nEstão *aguardando aprovação* na aba Compras. Obrigado! 🙌`);
  } else {
    await enviarTexto(telefone, 'Não consegui ler as notas que você enviou. Pode tirar fotos mais nítidas (boa luz, nota inteira no quadro) e enviar de novo? 🙏');
  }
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
      await enviarTexto(telefone, '📸 Beleza! Me envie a *foto da nota fiscal*.\nPode mandar uma de cada vez — depois eu pergunto se tem mais. Quando acabar, é só dizer *não*.');
      return true;
    }
    if (ehImagem && ehGatilho(caption)) {
      const s = await abrirSessao(telefone, messageId);
      if (s) await processarImagem(s, m, telefone);
      return true;
    }
    return false; // não é nota · segue o fluxo normal do webhook
  }

  // Sessão de nota aberta
  if (ehImagem) { await processarImagem(sessao, m, telefone); return true; }
  if (ehTexto) {
    if (CANCELAR.test(texto)) { await cancelar(sessao, telefone); return true; }
    if (NEG.test(texto)) { await finalizar(sessao, telefone); return true; }
    if (AFF.test(texto)) { await enviarTexto(telefone, 'Pode mandar a próxima foto. 📸'); return true; }
    await enviarTexto(telefone, 'Me envie a *foto* da nota fiscal, ou responda *não* se já enviou todas. 🙏');
    return true;
  }
  // áudio/outro durante a sessão
  await enviarTexto(telefone, 'Pra registrar a nota eu preciso da *foto* dela. Pode enviar? 📸');
  return true;
}

module.exports = { tratarNotaFiscal };
