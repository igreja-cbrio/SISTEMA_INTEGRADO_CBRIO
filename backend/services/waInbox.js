// Inbox de WhatsApp (estilo Multi360) · persiste conversas de contatos que NÃO
// são fluxo do bot (convertidos, visitantes, gente comum) pra o time responder
// pela aba Cuidados → Conversas. Coexiste com o bot: só captura na Persona 1.
const { supabase } = require('../utils/supabase');
const wpp = require('./whatsappService');

const JANELA_24H_MS = 24 * 60 * 60 * 1000; // WhatsApp só deixa texto livre dentro de 24h

function soDigitos(v) { return String(v || '').replace(/\D+/g, ''); }

// Janela de 24h aberta? (texto livre permitido; fora dela, só template aprovado)
function dentroJanela24h(lastInboundAt) {
  if (!lastInboundAt) return false;
  return (Date.now() - new Date(lastInboundAt).getTime()) < JANELA_24H_MS;
}

// Acha um membro pelo telefone (best-effort · casa pelos últimos dígitos). Não bloqueia.
// Resolve o contato pelo telefone: primeiro em mem_membros, senão em vol_profiles
// (voluntário) — muita gente do voluntariado ainda não tem cadastro de membro,
// mas o nome deve aparecer na conversa. Se o voluntário tiver membresia_id,
// também vincula o membro_id.
async function acharContato(telefone) {
  const dig = soDigitos(telefone);
  if (dig.length < 8) return { membro_id: null, nome: null };
  const suf = dig.slice(-8);
  const alvo = dig.slice(-9);
  try {
    const { data } = await supabase.from('mem_membros')
      .select('id, nome, telefone').is('deleted_at', null)
      .ilike('telefone', `%${suf}%`).limit(8);
    const m = (data || []).find(x => soDigitos(x.telefone).endsWith(alvo)) || (data || [])[0];
    if (m) return { membro_id: m.id, nome: m.nome };
  } catch { /* segue pro voluntariado */ }
  try {
    const { data } = await supabase.from('vol_profiles')
      .select('id, full_name, phone, membresia_id').eq('arquivado', false)
      .ilike('phone', `%${suf}%`).limit(8);
    const v = (data || []).find(x => soDigitos(x.phone).endsWith(alvo)) || (data || [])[0];
    if (v) return { membro_id: v.membresia_id || null, nome: v.full_name };
  } catch { /* nada */ }
  return { membro_id: null, nome: null };
}

// Multi-número: grava em qual número da WABA a conversa acontece (coluna
// `wa_conversas.phone_number_id` · migration 20260812150000). É UPDATE ISOLADO
// e best-effort DE PROPÓSITO: a coluna pode não existir antes da migration, e
// incluí-la no INSERT/SELECT principal derrubaria o inbox inteiro (lição do
// parcelas_max). 42703 = coluna ausente → silêncio; o resto loga.
async function gravarNumeroConversa(convId, phoneNumberId) {
  if (!convId || !phoneNumberId) return;
  try {
    const { error } = await supabase.from('wa_conversas')
      .update({ phone_number_id: String(phoneNumberId) }).eq('id', convId);
    if (error && error.code !== '42703') console.warn('[waInbox] phone_number_id:', error.message);
  } catch { /* best-effort */ }
}

// Acha-ou-cria a conversa do número (1 por telefone). Faz backfill do nome/cadastro
// quando a conversa já existe mas nasceu sem contato resolvido (ex.: criada antes
// do match, ou voluntário que virou membro depois). `phoneNumberId` (opcional) =
// número da WABA por onde a mensagem passou — fica registrado na conversa pra
// resposta sair pelo MESMO número (institucional × CBZap).
async function acharOuCriarConversa(telefone, phoneNumberId = null) {
  const tel = wpp.normalizarTelefone(telefone) || soDigitos(telefone);
  if (!tel) return null;
  const { data: existente } = await supabase.from('wa_conversas')
    .select('*').eq('telefone', tel).maybeSingle();
  if (existente) {
    if (phoneNumberId && existente.phone_number_id !== String(phoneNumberId)) {
      await gravarNumeroConversa(existente.id, phoneNumberId);
      existente.phone_number_id = String(phoneNumberId);
    }
    if (!existente.membro_id || !existente.nome) {
      const c = await acharContato(tel);
      const patch = {};
      if (!existente.membro_id && c.membro_id) patch.membro_id = c.membro_id;
      if (!existente.nome && c.nome) patch.nome = c.nome;
      if (Object.keys(patch).length) {
        const { data: up } = await supabase.from('wa_conversas')
          .update(patch).eq('id', existente.id).select('*').single();
        return up || { ...existente, ...patch };
      }
    }
    return existente;
  }
  const c = await acharContato(tel);
  const { data } = await supabase.from('wa_conversas')
    .insert({ telefone: tel, nome: c.nome || null, membro_id: c.membro_id || null })
    .select('*').single();
  if (data && phoneNumberId) {
    await gravarNumeroConversa(data.id, phoneNumberId);
    data.phone_number_id = String(phoneNumberId);
  }
  return data;
}

// Sobe um buffer de mídia pro bucket público wa-inbox e devolve a URL pública.
async function subirMedia({ buffer, mime, conversaId, origem = 'in', filename }) {
  try {
    let ext = ((mime || '').split(';')[0].split('/')[1] || 'bin').replace('jpeg', 'jpg');
    if (filename && filename.includes('.')) ext = filename.split('.').pop().toLowerCase().slice(0, 8);
    const path = `${conversaId}/${origem}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from('wa-inbox')
      .upload(path, buffer, { contentType: mime || 'application/octet-stream', upsert: true });
    if (error) { console.error('[waInbox] upload media:', error.message); return null; }
    return supabase.storage.from('wa-inbox').getPublicUrl(path).data.publicUrl;
  } catch (e) { console.error('[waInbox] subirMedia:', e.message); return null; }
}

// Mensagem que CHEGOU (do contato). Marca não-lida, reabre e abre a janela de 24h.
// Se vier `mediaId` (imagem/documento/áudio), baixa da Meta e guarda a URL.
async function registrarInbound({ telefone, texto, tipo = 'text', messageId, mediaId, phoneNumberId = null }) {
  const c = await acharOuCriarConversa(telefone, phoneNumberId);
  if (!c) return;
  const ins = await supabase.from('wa_mensagens').insert({
    conversa_id: c.id, direcao: 'in', tipo, texto: texto || null, wa_message_id: messageId || null,
  }).select('id').maybeSingle();
  if (ins.error) return; // provável reentrega (wa_message_id único) → não incrementa
  if (mediaId && ins.data?.id && ['image', 'document', 'audio'].includes(tipo)) {
    const media = await wpp.baixarMedia(mediaId);
    if (media?.buffer) {
      const url = await subirMedia({ buffer: media.buffer, mime: media.mime, conversaId: c.id, origem: 'in' });
      if (url) await supabase.from('wa_mensagens').update({ media_url: url }).eq('id', ins.data.id);
    }
  }
  const previa = (texto || (tipo === 'image' ? '[imagem]' : tipo === 'audio' ? '[áudio]' : tipo === 'document' ? '[documento]' : '[mídia]')).slice(0, 140);
  const agora = new Date().toISOString();
  await supabase.from('wa_conversas').update({
    last_message_at: agora, last_inbound_at: agora,
    nao_lidas: (c.nao_lidas || 0) + 1, resolvida: false, ultima_previa: previa,
  }).eq('id', c.id);
}

// Mensagem que SAIU (bot ou humano). Não mexe em não-lidas nem na janela.
// Envio humano (autorId) ou template → marca a conversa como "assumida por
// humano" (as respostas passam a voltar pro inbox, não pro bot).
async function registrarOutbound({ telefone, texto, tipo = 'text', autorId = null, mediaUrl = null, phoneNumberId = null }) {
  const c = await acharOuCriarConversa(telefone, phoneNumberId);
  if (!c) return null;
  await supabase.from('wa_mensagens').insert({
    conversa_id: c.id, direcao: 'out', tipo, texto: texto || null, autor_id: autorId, media_url: mediaUrl,
  });
  const patch = { last_message_at: new Date().toISOString(), ultima_previa: (texto || '').slice(0, 140) };
  if (autorId || tipo === 'template') patch.assumida_humano = true;
  await supabase.from('wa_conversas').update(patch).eq('id', c.id);
  return c;
}

module.exports = {
  registrarInbound, registrarOutbound, acharOuCriarConversa, subirMedia,
  dentroJanela24h, JANELA_24H_MS, soDigitos,
};
