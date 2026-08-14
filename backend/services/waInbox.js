// Inbox de WhatsApp (estilo Multi360) · persiste conversas de contatos que NÃO
// são fluxo do bot (convertidos, visitantes, gente comum) pra o time responder
// pela aba Cuidados → Conversas. Coexiste com o bot: só captura na Persona 1.
const { supabase } = require('../utils/supabase');
const wpp = require('./whatsappService');

const JANELA_24H_MS = 24 * 60 * 60 * 1000; // WhatsApp só deixa texto livre dentro de 24h

function soDigitos(v) { return String(v || '').replace(/\D+/g, ''); }

// Mesmo número BR módulo o NONO DÍGITO: o wa_id da Meta pode vir SEM o 9 do
// celular (12 dígitos) enquanto o outbound grava COM (13) — match exato criava
// DUAS conversas pra mesma pessoa, e a janela de 24h abria na conversa que o
// time não estava olhando. Regra: mesmo DDI 55 + mesmo DDD + mesmo local de 8
// dígitos (ignorando um 9 à frente de local de 9). Pura e exportada (testada).
function mesmoNumeroBR(a, b) {
  const da = soDigitos(a);
  const db = soDigitos(b);
  if (!da || !db) return false;
  if (da === db) return true;
  const pa = da.startsWith('55') && da.length >= 12 ? da.slice(2) : da;
  const pb = db.startsWith('55') && db.length >= 12 ? db.slice(2) : db;
  if (pa.length < 10 || pa.length > 11 || pb.length < 10 || pb.length > 11) return false;
  if (pa.slice(0, 2) !== pb.slice(0, 2)) return false; // DDD
  const la = pa.slice(2).replace(/^9(?=\d{8}$)/, '');
  const lb = pb.slice(2).replace(/^9(?=\d{8}$)/, '');
  return la.length === 8 && la === lb;
}

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
  let { data: existente } = await supabase.from('wa_conversas')
    .select('*').eq('telefone', tel).maybeSingle();
  if (!existente) {
    // Reconciliação do 9º dígito: antes de criar, procura a MESMA pessoa
    // gravada na outra forma (com/sem o 9) pelos 8 últimos dígitos. Sem isso,
    // "Nova conversa" com 13 dígitos + resposta da Meta com 12 = 2 conversas.
    const suf = tel.slice(-8);
    if (suf.length === 8) {
      const { data: candidatos } = await supabase.from('wa_conversas')
        .select('*').ilike('telefone', `%${suf}`).limit(5);
      existente = (candidatos || []).find(c => mesmoNumeroBR(c.telefone, tel)) || null;
    }
  }
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
  let { data, error } = await supabase.from('wa_conversas')
    .insert({ telefone: tel, nome: c.nome || null, membro_id: c.membro_id || null })
    .select('*').single();
  if (error) {
    // Corrida na criação: número NOVO manda 2 mensagens juntas → a 2ª toma
    // 23505 do UNIQUE(telefone) e a MENSAGEM ERA DESCARTADA em silêncio
    // (registrarInbound recebia null). Relê e segue com a linha do vencedor.
    const { data: denovo } = await supabase.from('wa_conversas')
      .select('*').eq('telefone', tel).maybeSingle();
    if (!denovo) {
      console.error('[waInbox] criar conversa:', error.message);
      return null;
    }
    data = denovo;
  }
  if (data && phoneNumberId && data.phone_number_id !== String(phoneNumberId)) {
    await gravarNumeroConversa(data.id, phoneNumberId);
    data.phone_number_id = String(phoneNumberId);
  }
  return data;
}

function extDaMidia(mime, filename) {
  let ext = ((mime || '').split(';')[0].split('/')[1] || 'bin').replace('jpeg', 'jpg');
  if (filename && filename.includes('.')) ext = filename.split('.').pop().toLowerCase().slice(0, 8);
  return ext;
}

// Sobe um buffer de mídia pro bucket PÚBLICO wa-inbox e devolve a URL pública.
// Uso: OUTBOUND (anexo que o time envia) — público DE PROPÓSITO: a Meta busca
// o arquivo pelo link no envio. Mídia RECEBIDA vai no privado (abaixo).
async function subirMedia({ buffer, mime, conversaId, origem = 'in', filename }) {
  try {
    const ext = extDaMidia(mime, filename);
    const path = `${conversaId}/${origem}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from('wa-inbox')
      .upload(path, buffer, { contentType: mime || 'application/octet-stream', upsert: true });
    if (error) { console.error('[waInbox] upload media:', error.message); return null; }
    return supabase.storage.from('wa-inbox').getPublicUrl(path).data.publicUrl;
  } catch (e) { console.error('[waInbox] subirMedia:', e.message); return null; }
}

// Mídia RECEBIDA (foto/documento que o MEMBRO manda — conteúdo potencialmente
// sensível) vai pro bucket PRIVADO e a mensagem guarda o PATH, não URL: a
// thread assina por 15 min na leitura (rota /conversas/:id/mensagens). Bucket
// ausente (migration 20260812190000 ainda não aplicada) → cai no público, que
// é o comportamento histórico — nada quebra no deploy em 2 etapas.
async function subirMediaPrivada({ buffer, mime, conversaId, filename }) {
  try {
    const ext = extDaMidia(mime, filename);
    const path = `${conversaId}/in-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from('wa-inbox-privado')
      .upload(path, buffer, { contentType: mime || 'application/octet-stream', upsert: true });
    if (!error) return path;
    console.warn('[waInbox] bucket privado indisponível (%s) — usando o público', error.message);
  } catch (e) { console.warn('[waInbox] subirMediaPrivada:', e.message); }
  return subirMedia({ buffer, mime, conversaId, origem: 'in', filename });
}

// ── Retenção de mídia (decisão do Marcos · 12/08: "acaba vindo muito lixo") ──
// Apaga do storage os anexos com mais de N dias (default 90 · env
// WA_INBOX_MEDIA_RETENCAO_DIAS · 0 desliga) e zera o ponteiro da mensagem —
// o TEXTO da conversa fica pra sempre; o que expira é o ARQUIVO. A thread
// mostra "[image]/[document]" no lugar (degradação já existente do front).
// Ordem: arquivo primeiro, ponteiro depois (morrer no meio deixa ponteiro
// pra arquivo morto, que a assinatura já trata como nulo — o inverso
// deixaria arquivo órfão pra sempre). Efeito gravado em BLOCOS (lei 04/08).
const RETENCAO_MIDIA_DIAS = parseInt(process.env.WA_INBOX_MEDIA_RETENCAO_DIAS || '90', 10);

function pathDoBucketPublico(url) {
  const marca = '/storage/v1/object/public/wa-inbox/';
  const i = String(url || '').indexOf(marca);
  return i === -1 ? null : decodeURIComponent(String(url).slice(i + marca.length));
}

async function limparMidiasAntigas({ limite = 400 } = {}) {
  if (!Number.isFinite(RETENCAO_MIDIA_DIAS) || RETENCAO_MIDIA_DIAS < 1) {
    return { ok: true, pulado: 'retencao_desligada' };
  }
  const corte = new Date(Date.now() - RETENCAO_MIDIA_DIAS * 86400000).toISOString();
  const { data: msgs, error } = await supabase.from('wa_mensagens')
    .select('id, media_url')
    .not('media_url', 'is', null)
    .lt('criado_em', corte)
    .order('criado_em', { ascending: true })
    .limit(limite);
  if (error) return { ok: false, erro: error.message };

  let arquivos = 0, ponteiros = 0;
  const lote = 100;
  for (let i = 0; i < (msgs || []).length; i += lote) {
    const fatia = msgs.slice(i, i + lote);
    const privados = [];
    const publicos = [];
    for (const m of fatia) {
      const u = String(m.media_url);
      if (!/^https?:\/\//i.test(u)) privados.push(u);
      else {
        const p = pathDoBucketPublico(u);
        if (p) publicos.push(p);
      }
    }
    if (privados.length) {
      const { error: e1 } = await supabase.storage.from('wa-inbox-privado').remove(privados);
      if (!e1) arquivos += privados.length; else console.warn('[waInbox] retenção (privado):', e1.message);
    }
    if (publicos.length) {
      const { error: e2 } = await supabase.storage.from('wa-inbox').remove(publicos);
      if (!e2) arquivos += publicos.length; else console.warn('[waInbox] retenção (público):', e2.message);
    }
    const { error: e3 } = await supabase.from('wa_mensagens')
      .update({ media_url: null }).in('id', fatia.map(m => m.id));
    if (!e3) ponteiros += fatia.length; else console.warn('[waInbox] retenção (ponteiro):', e3.message);
  }
  return { ok: true, retencao_dias: RETENCAO_MIDIA_DIAS, candidatas: (msgs || []).length, arquivos, ponteiros };
}

// Mensagem que CHEGOU (do contato). Marca não-lida, reabre e abre a janela de 24h.
// Se vier `mediaId` (imagem/documento/áudio), baixa da Meta e guarda a URL.
async function registrarInbound({ telefone, texto, tipo = 'text', messageId, mediaId, phoneNumberId = null, replyToWaId = null }) {
  const c = await acharOuCriarConversa(telefone, phoneNumberId);
  if (!c) return;
  const ins = await supabase.from('wa_mensagens').insert({
    conversa_id: c.id, direcao: 'in', tipo, texto: texto || null, wa_message_id: messageId || null,
  }).select('id').maybeSingle();
  if (ins.error) return; // provável reentrega (wa_message_id único) → não incrementa
  // Citação (caso da Júlia: "Esse aqui" respondendo o template com o nome do
  // grupo). UPDATE isolado best-effort — a coluna pode não existir ainda
  // (migration 20260813210000); incluí-la no INSERT derrubaria a mensagem.
  if (replyToWaId && ins.data?.id) {
    try {
      const { error: eRep } = await supabase.from('wa_mensagens')
        .update({ reply_to_wa_id: String(replyToWaId) }).eq('id', ins.data.id);
      if (eRep && eRep.code !== '42703') console.warn('[waInbox] reply_to:', eRep.message);
    } catch { /* best-effort */ }
  }
  if (mediaId && ins.data?.id && ['image', 'document', 'audio'].includes(tipo)) {
    const media = await wpp.baixarMedia(mediaId);
    if (media?.buffer) {
      // Recebida → bucket PRIVADO (guarda o PATH; a thread assina na leitura).
      const ref = await subirMediaPrivada({ buffer: media.buffer, mime: media.mime, conversaId: c.id });
      if (ref) await supabase.from('wa_mensagens').update({ media_url: ref }).eq('id', ins.data.id);
    }
  }
  const previa = (texto || (tipo === 'image' ? '[imagem]' : tipo === 'audio' ? '[áudio]' : tipo === 'document' ? '[documento]' : '[mídia]')).slice(0, 140);
  const agora = new Date().toISOString();
  // Incremento ATÔMICO no banco (RPC · migration 20260814120000): o
  // read-modify-write antigo perdia contagem quando 2 mensagens chegavam
  // juntas (o download da mídia acima leva SEGUNDOS entre o read e o write).
  // RPC ausente (42883) → cai no caminho antigo, comportamento histórico.
  const { error: eInc } = await supabase.rpc('wa_conversa_inbound', {
    p_conversa_id: c.id, p_previa: previa, p_agora: agora,
  });
  if (eInc) {
    if (!/wa_conversa_inbound/.test(eInc.message || '')) console.warn('[waInbox] inbound rpc:', eInc.message);
    await supabase.from('wa_conversas').update({
      last_message_at: agora, last_inbound_at: agora,
      nao_lidas: (c.nao_lidas || 0) + 1, resolvida: false, ultima_previa: previa,
    }).eq('id', c.id);
  }
}

// Mensagem que SAIU (bot ou humano). Não mexe em não-lidas nem na janela.
// Envio humano (autorId) ou template → marca a conversa como "assumida por
// humano" (as respostas passam a voltar pro inbox, não pro bot).
// `waMessageId` (13/08 · caso da Júlia): sem gravar o id que a Meta devolve no
// envio, o recibo delivered/read/failed da resposta não tem onde POUSAR — o
// webhook não consegue casar e a thread nunca mostra o ✓✓.
async function registrarOutbound({ telefone, texto, tipo = 'text', autorId = null, mediaUrl = null, phoneNumberId = null, waMessageId = null }) {
  const c = await acharOuCriarConversa(telefone, phoneNumberId);
  if (!c) return null;
  await supabase.from('wa_mensagens').insert({
    conversa_id: c.id, direcao: 'out', tipo, texto: texto || null, autor_id: autorId, media_url: mediaUrl,
    wa_message_id: waMessageId || null,
  });
  const patch = { last_message_at: new Date().toISOString(), ultima_previa: (texto || '').slice(0, 140) };
  if (autorId || tipo === 'template') patch.assumida_humano = true;
  await supabase.from('wa_conversas').update(patch).eq('id', c.id);
  return c;
}

module.exports = {
  registrarInbound, registrarOutbound, acharOuCriarConversa, subirMedia,
  limparMidiasAntigas,
  dentroJanela24h, JANELA_24H_MS, soDigitos,
  mesmoNumeroBR, // pura · exportada pro teste (decide se 2 formas = 1 conversa)
  pathDoBucketPublico, // pura · exportada pro teste (retenção do bucket público)
};
