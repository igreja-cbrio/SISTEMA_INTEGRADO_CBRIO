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
async function acharMembro(telefone) {
  const dig = soDigitos(telefone);
  if (dig.length < 8) return null;
  const suf = dig.slice(-8);
  try {
    const { data } = await supabase.from('mem_membros')
      .select('id, nome, telefone').is('deleted_at', null)
      .ilike('telefone', `%${suf}%`).limit(8);
    const alvo = dig.slice(-9);
    return (data || []).find(m => soDigitos(m.telefone).endsWith(alvo)) || (data || [])[0] || null;
  } catch { return null; }
}

// Acha-ou-cria a conversa do número (1 por telefone).
async function acharOuCriarConversa(telefone) {
  const tel = wpp.normalizarTelefone(telefone) || soDigitos(telefone);
  if (!tel) return null;
  const { data: existente } = await supabase.from('wa_conversas')
    .select('*').eq('telefone', tel).maybeSingle();
  if (existente) return existente;
  const membro = await acharMembro(tel);
  const { data } = await supabase.from('wa_conversas')
    .insert({ telefone: tel, nome: membro?.nome || null, membro_id: membro?.id || null })
    .select('*').single();
  return data;
}

// Mensagem que CHEGOU (do contato). Marca não-lida, reabre e abre a janela de 24h.
async function registrarInbound({ telefone, texto, tipo = 'text', messageId }) {
  const c = await acharOuCriarConversa(telefone);
  if (!c) return;
  const { error } = await supabase.from('wa_mensagens').insert({
    conversa_id: c.id, direcao: 'in', tipo, texto: texto || null, wa_message_id: messageId || null,
  });
  if (error) return; // provável reentrega (wa_message_id único) → não incrementa
  const previa = (texto || (tipo === 'image' ? '[imagem]' : tipo === 'audio' ? '[áudio]' : '[mídia]')).slice(0, 140);
  const agora = new Date().toISOString();
  await supabase.from('wa_conversas').update({
    last_message_at: agora, last_inbound_at: agora,
    nao_lidas: (c.nao_lidas || 0) + 1, resolvida: false, ultima_previa: previa,
  }).eq('id', c.id);
}

// Mensagem que SAIU (bot ou humano). Não mexe em não-lidas nem na janela.
async function registrarOutbound({ telefone, texto, tipo = 'text', autorId = null }) {
  const c = await acharOuCriarConversa(telefone);
  if (!c) return null;
  await supabase.from('wa_mensagens').insert({
    conversa_id: c.id, direcao: 'out', tipo, texto: texto || null, autor_id: autorId,
  });
  await supabase.from('wa_conversas').update({
    last_message_at: new Date().toISOString(), ultima_previa: (texto || '').slice(0, 140),
  }).eq('id', c.id);
  return c;
}

module.exports = {
  registrarInbound, registrarOutbound, acharOuCriarConversa,
  dentroJanela24h, JANELA_24H_MS, soDigitos,
};
