// Bot de triagem do inbox Conversas · número desconhecido → menu de setores →
// nome → tria pra área + notifica a equipe da área. Estado por conversa em
// wa_conversas (bot_estado, bot_area_pendente). Coexiste com o inbox: as
// respostas do bot aparecem na thread (tipo 'bot') sem marcar assumida_humano.
const { supabase } = require('../utils/supabase');
const { enviarTexto } = require('./whatsappSend');
const { normalizarTelefone } = require('./whatsappService');
const waInbox = require('./waInbox');
const { notificar } = require('./notificar');

function primeiroNome(nome) { return String(nome || '').trim().split(/\s+/)[0] || ''; }

async function setoresAtivos() {
  const { data } = await supabase.from('conversas_setores')
    .select('ordem, rotulo, area').eq('ativo', true).order('ordem', { ascending: true });
  return data || [];
}

function montarMenu(setores, nome) {
  const saud = nome ? `Olá, ${primeiroNome(nome)}! ` : 'Olá! ';
  const linhas = setores.map((s, i) => `${i + 1} - ${s.rotulo}`).join('\n');
  return `${saud}Obrigado por entrar em contato com a CBRio!\nResponda, com qual setor você deseja entrar em contato:\n\n${linhas}`;
}

// número (1..N) ou texto batendo com rótulo/área
function escolherSetor(texto, setores) {
  const t = String(texto || '').trim().toLowerCase();
  const n = parseInt(t.replace(/\D+/g, ''), 10);
  if (n >= 1 && n <= setores.length) return setores[n - 1];
  return setores.find(s => t === s.rotulo.toLowerCase() || t === s.area.toLowerCase())
    || setores.find(s => t.length >= 3 && (s.rotulo.toLowerCase().includes(t) || t.includes(s.rotulo.toLowerCase())));
}

async function resolverProfilesDaArea(areaNome) {
  try {
    const { data } = await supabase.rpc('conversas_profiles_da_area', { area_nome: areaNome });
    return [...new Set((data || []).map(r => r.profile_id).filter(Boolean))];
  } catch (e) { console.error('[triagem] resolverProfilesDaArea:', e.message); return []; }
}

// responde pelo bot e registra a saída na thread do inbox (sem marcar assumida_humano)
async function responder(telefone, texto) {
  await enviarTexto(telefone, texto).catch(e => console.error('[triagem] enviarTexto:', e.message));
  await waInbox.registrarOutbound({ telefone, texto, tipo: 'bot' }).catch(() => {});
}

// Retorna true se o bot assumiu (chamador deve dar return sem cair no institucional).
// A conversa já foi criada/atualizada por registrarInbound antes desta chamada.
async function tratar({ telefone, texto }) {
  const tel = normalizarTelefone(telefone) || String(telefone).replace(/\D+/g, '');
  const { data: conv } = await supabase.from('wa_conversas')
    .select('id, nome, membro_id, bot_estado, bot_area_pendente')
    .eq('telefone', tel).is('deleted_at', null).maybeSingle();
  if (!conv) return false; // sem conversa (não deveria acontecer) → deixa o institucional

  const setores = await setoresAtivos();
  if (!setores.length) return false; // sem menu configurado → institucional

  const estado = conv.bot_estado || null;

  // 1) primeira mensagem → menu
  if (!estado) {
    await responder(telefone, montarMenu(setores, conv.nome));
    await supabase.from('wa_conversas').update({ bot_estado: 'aguardando_setor' }).eq('id', conv.id);
    return true;
  }

  // 2) escolha do setor
  if (estado === 'aguardando_setor') {
    const setor = escolherSetor(texto, setores);
    if (!setor) {
      await responder(telefone, `Não entendi 🙈. Responda só o número do setor:\n\n${setores.map((s, i) => `${i + 1} - ${s.rotulo}`).join('\n')}`);
      return true;
    }
    await responder(telefone, 'Para atendermos você da melhor forma, me diga seu *NOME*');
    await supabase.from('wa_conversas').update({ bot_estado: 'aguardando_nome', bot_area_pendente: setor.area }).eq('id', conv.id);
    return true;
  }

  // 3) nome → tria + notifica
  if (estado === 'aguardando_nome') {
    const nomeInformado = String(texto || '').trim().slice(0, 120);
    const area = conv.bot_area_pendente;
    const setor = setores.find(s => s.area === area);
    const rotulo = setor?.rotulo || area;
    const patch = { bot_estado: 'concluido', bot_area_pendente: null, area };
    // só sobrescreve o nome se não veio do cadastro de membro
    if (!conv.membro_id && nomeInformado) patch.nome = nomeInformado;
    await supabase.from('wa_conversas').update(patch).eq('id', conv.id);

    await responder(telefone, `Obrigado, ${primeiroNome(patch.nome || conv.nome || nomeInformado)}! 🙏 Já encaminhei sua mensagem pro time de *${rotulo}*. Em breve alguém fala com você por aqui.`);

    // notifica a equipe da área (todos de usuario_areas)
    try {
      const alvos = await resolverProfilesDaArea(area);
      const nomePessoa = patch.nome || conv.nome || nomeInformado || 'Contato';
      await notificar({
        modulo: 'conversas',
        tipo: 'conversa_triada',
        titulo: `Nova conversa · ${rotulo}`,
        mensagem: `${nomePessoa}${conv.membro_id ? '' : ' (⚠️ não cadastrado na membresia)'} quer falar com ${rotulo}.`,
        link: `/conversas?area=${encodeURIComponent(area)}`,
        chaveDedup: `conversa_triada_${conv.id}`,
        targetIds: alvos.length ? alvos : undefined, // sem alvos → fallback admin/diretor do notificar
      });
    } catch (e) { console.error('[triagem] notificar:', e.message); }
    return true;
  }

  // 4) concluído → bot silencia (mensagem já entrou no inbox; a área responde por lá)
  return true;
}

module.exports = { tratar };
