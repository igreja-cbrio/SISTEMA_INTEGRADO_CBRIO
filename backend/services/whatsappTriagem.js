// Bot de triagem do inbox Conversas · número desconhecido → menu de setores →
// nome → tria pra área + notifica a equipe da área. Estado por conversa em
// wa_conversas (bot_estado, bot_area_pendente). Coexiste com o inbox: as
// respostas do bot aparecem na thread (tipo 'bot') sem marcar assumida_humano.
const { supabase } = require('../utils/supabase');
const { enviarTexto } = require('./whatsappSend');
const { normalizarTelefone } = require('./whatsappService');
const waInbox = require('./waInbox');
const { notificar } = require('./notificar');
const { ehSoAgradecimento } = require('../utils/agradecimento');

function primeiroNome(nome) { return String(nome || '').trim().split(/\s+/)[0] || ''; }

async function setoresAtivos() {
  // select('*') DE PROPÓSITO: as colunas de FLUXO (mensagem_resposta,
  // pedir_nome, destino_tipo, atendente_id · migration 20260813150000) podem
  // ainda não existir — pedi-las nominalmente derrubaria a triagem inteira
  // (lição do parcelas_max). Sem elas, cada opção cai no fluxo padrão.
  const { data } = await supabase.from('conversas_setores')
    .select('*').eq('ativo', true).order('ordem', { ascending: true });
  return data || [];
}

// Conclui a triagem de acordo com o FLUXO da opção (F3 · 13/08): mensagem de
// confirmação PRÓPRIA (ou a padrão), destino = ÁREA ou ATENDENTE específico
// (a conversa já nasce atribuída), e o aviso vai pra quem atende. Usada pelos
// dois caminhos — com nome (pedir_nome=true, o histórico) e sem.
async function concluirTriagem({ conv, telefone, setor, nomeInformado }) {
  const area = setor?.area || null;
  const rotulo = setor?.rotulo || area || 'atendimento';
  const paraAtendente = !!(setor?.destino_tipo === 'atendente' && setor?.atendente_id);
  const patch = { bot_estado: 'concluido', bot_area_pendente: null, area };
  // só sobrescreve o nome se não veio do cadastro de membro
  if (!conv.membro_id && nomeInformado) patch.nome = nomeInformado;
  if (paraAtendente) patch.atribuido_a = setor.atendente_id;
  await supabase.from('wa_conversas').update(patch).eq('id', conv.id);

  const nome = primeiroNome(patch.nome || conv.nome || nomeInformado || '');
  const proto = conv.protocolo ? `\n\nSeu protocolo de atendimento é *${conv.protocolo}* (guarde pra acompanhar).` : '';
  const propria = String(setor?.mensagem_resposta || '').trim();
  await responder(telefone, propria
    ? `${propria}${proto}`
    : `Obrigado${nome ? `, ${nome}` : ''}! 🙏 Já encaminhei sua mensagem pro time de *${rotulo}*. Em breve alguém fala com você por aqui.${proto}`);

  try {
    const alvos = paraAtendente ? [setor.atendente_id] : await resolverProfilesDaArea(area);
    const nomePessoa = patch.nome || conv.nome || nomeInformado || 'Contato';
    await notificar({
      modulo: 'conversas',
      tipo: 'conversa_triada',
      titulo: `Nova conversa · ${rotulo}`,
      mensagem: `${nomePessoa}${conv.membro_id ? '' : ' (⚠️ não cadastrado na membresia)'} quer falar com ${rotulo}${paraAtendente ? ' — atribuída a você' : ''}.`,
      link: `/comunicacao?tab=conversas${area ? `&area=${encodeURIComponent(area)}` : ''}`,
      chaveDedup: `conversa_triada_${conv.id}`,
      targetIds: alvos.length ? alvos : undefined, // sem alvos → fallback admin/diretor do notificar
    });
  } catch (e) { console.error('[triagem] notificar:', e.message); }
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
  const r = await enviarTexto(telefone, texto).catch(e => { console.error('[triagem] enviarTexto:', e.message); return null; });
  // waMessageId: é o que deixa o recibo delivered/read da Meta pousar na thread
  await waInbox.registrarOutbound({ telefone, texto, tipo: 'bot', waMessageId: r?.message_id || null }).catch(() => {});
}

// Retorna true se o bot assumiu (chamador deve dar return sem cair no institucional).
// A conversa já foi criada/atualizada por registrarInbound antes desta chamada.
async function tratar({ telefone, texto }) {
  const tel = normalizarTelefone(telefone) || String(telefone).replace(/\D+/g, '');
  const { data: conv } = await supabase.from('wa_conversas')
    .select('id, nome, membro_id, protocolo, bot_estado, bot_area_pendente')
    .eq('telefone', tel).is('deleted_at', null).maybeSingle();
  if (!conv) return false; // sem conversa (não deveria acontecer) → deixa o institucional

  const setores = await setoresAtivos();
  if (!setores.length) return false; // sem menu configurado → institucional

  const estado = conv.bot_estado || null;

  // ⚠️⚠️ AGRADECIMENTO NÃO ABRE O MENU (Matheus · 11/08/2026).
  // A igreja dispara uma mensagem, a pessoa responde "Obrigado" — e o bot abria
  // o menu de setores como se ela quisesse atendimento. Medido no inbox: 102
  // conversas não lidas, boa parte só de gente agradecendo um disparo.
  //
  // Aqui o bot responde uma cortesia e ENSINA o caminho: manda um "oi" quando
  // quiser falar de algo. E NÃO entra em `aguardando_setor` — se entrasse, a
  // próxima mensagem dela seria interpretada como escolha de setor.
  // ⚠️ `concluido` fica FORA: ali a conversa já foi triada e a área vai
  // responder. Mandar "manda um oi" depois de a pessoa agradecer o atendimento
  // que ela acabou de receber reabriria um loop com o bot. Nesse estado o bot
  // continua calado, como já era.
  if (estado !== 'concluido' && ehSoAgradecimento(texto)) {
    // Já agradeceu antes e agradeceu de novo: o bot CALA. Repetir a mesma
    // cortesia a cada "🙏" é a versão automática de não ouvir.
    if (estado === 'cortesia') return true;
    const oi = primeiroNome(conv.nome) ? `${primeiroNome(conv.nome)}, ` : '';
    await responder(
      telefone,
      `${oi}nós que agradecemos! 🙏\n\nSe precisar falar com a gente sobre alguma coisa, manda um *oi* aqui que eu te ajudo a chegar na pessoa certa.`,
    );
    await supabase.from('wa_conversas').update({ bot_estado: 'cortesia' }).eq('id', conv.id);
    return true;
  }

  // Agradeceu antes e agora escreveu de verdade → é a primeira mensagem que
  // pede atendimento. Cai no menu, e é por isso que o estado 'cortesia' não
  // pode ser um beco sem saída.
  if (estado === 'cortesia') {
    await responder(telefone, montarMenu(setores, conv.nome));
    await supabase.from('wa_conversas').update({ bot_estado: 'aguardando_setor' }).eq('id', conv.id);
    return true;
  }

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
    // Fluxo da opção (F3): pula a pergunta do nome quando o fluxo diz que não
    // precisa (ex.: oração — a pessoa já vai escrever o pedido em seguida).
    if (setor.pedir_nome === false) {
      await concluirTriagem({ conv, telefone, setor, nomeInformado: null });
      return true;
    }
    await responder(telefone, 'Para atendermos você da melhor forma, me diga seu *NOME*');
    // Guarda o ID da opção (não a área): duas opções podem apontar pra MESMA
    // área com fluxos diferentes. Conversa em andamento com a ÁREA antiga
    // gravada continua resolvendo (fallback por área na conclusão).
    await supabase.from('wa_conversas').update({ bot_estado: 'aguardando_nome', bot_area_pendente: String(setor.id) }).eq('id', conv.id);
    return true;
  }

  // 3) nome → conclui pelo FLUXO da opção (id novo · área = conversa antiga)
  if (estado === 'aguardando_nome') {
    const nomeInformado = String(texto || '').trim().slice(0, 120);
    const pend = conv.bot_area_pendente;
    const setor = setores.find(s => String(s.id) === String(pend))
      || setores.find(s => s.area === pend)
      || { area: pend, rotulo: pend };
    await concluirTriagem({ conv, telefone, setor, nomeInformado });
    return true;
  }

  // 4) concluído → bot silencia (mensagem já entrou no inbox; a área responde por lá)
  return true;
}

module.exports = { tratar };
