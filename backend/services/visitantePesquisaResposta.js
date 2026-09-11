// ════════════════════════════════════════════════════════════════════════════
//  VISITANTES · a resposta da pesquisa que chega no WEBHOOK (10/09/2026)
//
//  O template `visitante_pesquisa_satisfacao` sai com TRÊS botões em texto
//  (escala 1 · 2 · 3 · ver utils/respostaPesquisaVisitante). Quando
//  a pessoa toca, a Meta entrega `type: 'button'` com `context.id` = o wamid da
//  NOSSA mensagem — que está em `whatsapp_envios.message_id`, com `ref_id` = a
//  visita. É o MESMO elo que amarra a resposta da escala (respostaEscala.js).
//
//  Dois passos, uma visita:
//   1. NOTA  — botão (ou dígito sozinho) → `pesquisa_nota` (UPDATE condicionado ·
//              a 1ª vale) → agradecemos por TEXTO (janela aberta, grátis) e o
//              agradecimento entra na FILA com contexto próprio, pra o wamid dele
//              também ficar em whatsapp_envios.
//   2. COMENTÁRIO — texto respondendo ao template OU ao agradecimento →
//              `pesquisa_comentario` (só onde vazio).
//
//  ⚠️⚠️ O COMENTÁRIO TEM PRAZO (decisão do Marcos, 11/09/2026): vale até a
//  virada do dia BRT do voto, com piso de 6h (`comentarioNaJanela`). Depois
//  disso o texto NÃO é mais da pesquisa — devolvemos ao fluxo normal, porque
//  duas semanas depois aquilo é uma conversa com a igreja, não feedback do
//  culto. O agradecimento já avisa a pessoa ("a gente lê tudo, ainda hoje").
//  ⚠️⚠️ NENHUMA mensagem daqui diz o NÚMERO da nota: a pessoa tocou numa
//  frase e nunca viu número. Ver o cabeçalho de respostaPesquisaVisitante.
//
//  ⚠️ Sem `context.id` só agimos quando há EXATAMENTE UM disparo da pesquisa
//  nas últimas 72h pra aquele telefone (a mesma régua de 24/08 da escala) — e
//  só pra NOTA. Comentário sem contexto seria capturar conversa alheia.
//  ⚠️ Devolve false quando a mensagem não é da pesquisa: o fluxo normal segue.
// ════════════════════════════════════════════════════════════════════════════
const { supabase } = require('../utils/supabase');
const { semFalhar } = require('../utils/semFalhar');
const { textoDaResposta, wamidRespondido } = require('../utils/respostaEscala');
const {
  interpretarNotaVisitante, ehComentario, textoObrigado, interpretarRespostaFlowVisitante,
} = require('../utils/respostaPesquisaVisitante');
const { primeiroNome, comentarioNaJanela } = require('../utils/visitanteRegras');
const { CONTEXTO, CONTEXTO_OBRIGADO } = require('./visitantePesquisa');

const JANELA_SEM_CONTEXTO_H = 72;

/** Normaliza pros 8 últimos dígitos (whatsapp_envios.telefone vem com e sem 55). */
function tail8(t) {
  const d = String(t || '').replace(/\D/g, '');
  return d.length >= 8 ? d.slice(-8) : null;
}

/** O único disparo da PESQUISA (não do obrigado) nas últimas 72h pra este telefone — ou null. */
async function envioUnicoRecente(from) {
  const alvo = tail8(from);
  if (!alvo) return null;
  const desde = new Date(Date.now() - JANELA_SEM_CONTEXTO_H * 3600000).toISOString();
  const { data, error } = await supabase.from('whatsapp_envios')
    .select('id, ref_id, contexto, telefone, criado_em')
    .eq('contexto', CONTEXTO).gte('criado_em', desde)
    .order('criado_em', { ascending: false }).limit(200);
  if (error) return null;
  const meus = (data || []).filter((e) => tail8(e.telefone) === alvo && e.ref_id);
  return meus.length === 1 ? meus[0] : null;
}

async function envioPorWamid(wamid) {
  const { data } = await supabase.from('whatsapp_envios')
    .select('id, ref_id, contexto')
    .eq('message_id', wamid).in('contexto', [CONTEXTO, CONTEXTO_OBRIGADO]).maybeSingle();
  return data?.ref_id ? data : null;
}

/**
 * @param m mensagem do webhook · @param deps { enviarTexto, normalizarTelefone } (do chamador,
 *   pra não criar um 2º caminho de envio) · @returns {boolean} true se assumiu.
 */
async function processarRespostaVisitante(m, { enviarTexto, normalizarTelefone }) {
  const wamid = wamidRespondido(m);

  // ── O FORMULÁRIO (WhatsApp Flow · botão "Avaliar minha visita") ──────────────
  // ⚠️ Tem que rodar ANTES do `processarFlowReply` do webhook, que DESCARTA todo
  // nfm_reply (a coleta por Flow do bot foi aposentada em 13/08). A resposta do
  // Flow traz nota + comentário de uma vez.
  if (m.type === 'interactive' && m.interactive?.type === 'nfm_reply') {
    const resp = interpretarRespostaFlowVisitante(m.interactive.nfm_reply?.response_json);
    if (!resp) return false; // não é o nosso formulário
    const envio = wamid ? await envioPorWamid(wamid) : await envioUnicoRecente(m.from);
    if (!envio) return false;
    const messageId = m.id;
    const telefone = normalizarTelefone(m.from);
    const { data: jaVisto } = await supabase.from('whatsapp_coletas')
      .select('id').eq('whatsapp_message_id', messageId).maybeSingle();
    if (jaVisto) return true;
    const { data: visita } = await supabase.from('vis_visitas')
      .select('id, nome, telefone, pesquisa_nota, pesquisa_comentario')
      .eq('id', envio.ref_id).is('deleted_at', null).maybeSingle();
    if (!visita) return false;
    const nome = primeiroNome(visita.nome);
    await semFalhar(supabase.from('whatsapp_coletas').insert({
      whatsapp_message_id: messageId, telefone, status: 'ignorado',
      raw_text: `[visitante·flow] nota ${resp.nota}${resp.comentario ? `: ${resp.comentario}` : ''}`.slice(0, 500),
    }), '[visitante-pesquisa]');
    if (visita.pesquisa_nota != null) {
      // 2º envio do formulário: a 1ª nota vale; comentário novo é acrescentado.
      if (resp.comentario) {
        const novo = visita.pesquisa_comentario
          ? `${visita.pesquisa_comentario}\n${resp.comentario}`.slice(0, 1000) : resp.comentario;
        await supabase.from('vis_visitas').update({ pesquisa_comentario: novo }).eq('id', visita.id);
      }
      await enviarTexto(telefone, `Sua avaliação já estava registrada, ${nome}. Obrigado! 💚`).catch(() => {});
      return true;
    }
    const agora = new Date().toISOString();
    const patch = { pesquisa_nota: resp.nota, pesquisa_respondida_em: agora, pesquisa_status: 'respondida' };
    if (resp.comentario) patch.pesquisa_comentario = resp.comentario;
    const { data: gravou } = await supabase.from('vis_visitas').update(patch)
      .eq('id', visita.id).is('pesquisa_nota', null).select('id');
    if (!gravou?.length) return true; // corrida: outra entrega gravou antes
    try {
      const { enfileirar } = require('./whatsappFila');
      await enfileirar({ telefone: visita.telefone || telefone,
        texto: resp.comentario
          ? `Recebemos, ${nome}! 💚 Obrigado por responder e por contar como foi. Esperamos te ver de novo!`
          : textoObrigado(nome, resp.nota),
        contexto: CONTEXTO_OBRIGADO, refId: visita.id });
    } catch (e) {
      await enviarTexto(telefone, textoObrigado(nome, resp.nota)).catch(() => {});
    }
    return true;
  }

  const bruto = textoDaResposta(m);
  if (!bruto) return false;

  // Opt-out tem prioridade (decisão de 24/07): quem pede pra parar é do fluxo normal.
  try {
    const optSvc = require('./whatsappOptout');
    if (optSvc.intencaoOptOut(bruto, { deBotao: m.type !== 'text' })) return false;
  } catch (e) { /* sem o serviço, segue */ }

  const envio = wamid ? await envioPorWamid(wamid) : await envioUnicoRecente(m.from);
  if (!envio) return false;

  const messageId = m.id;
  const telefone = normalizarTelefone(m.from);
  const { data: jaVisto } = await supabase.from('whatsapp_coletas')
    .select('id').eq('whatsapp_message_id', messageId).maybeSingle();
  if (jaVisto) return true;

  const { data: visita } = await supabase.from('vis_visitas')
    .select('id, nome, telefone, pesquisa_nota, pesquisa_comentario, pesquisa_respondida_em')
    .eq('id', envio.ref_id).is('deleted_at', null).maybeSingle();
  if (!visita) return false;

  const registrar = (raw) => semFalhar(supabase.from('whatsapp_coletas').insert({
    whatsapp_message_id: messageId, telefone, raw_text: raw, status: 'ignorado',
  }), '[visitante-pesquisa]');
  const nome = primeiroNome(visita.nome);
  const nota = interpretarNotaVisitante(bruto);

  // ── passo 1 · a NOTA ────────────────────────────────────────────────────────
  if (visita.pesquisa_nota == null) {
    if (nota == null) {
      // Sem contexto pode ser outra conversa: devolve pro fluxo normal.
      if (!wamid) return false;
      // Texto respondendo ao template sem nota: pode ser o comentário chegando
      // antes da nota — guarda como comentário e pede o botão.
      if (ehComentario(bruto)) {
        await supabase.from('vis_visitas')
          .update({ pesquisa_comentario: String(bruto).slice(0, 1000) })
          .eq('id', visita.id).is('pesquisa_comentario', null);
        await registrar(`[visitante] comentário antes da nota: ${bruto}`.slice(0, 500));
        await enviarTexto(telefone,
          `Anotado, ${nome}, obrigado! 💚 Só falta uma coisa: toque em uma das três opções da mensagem anterior.`)
          .catch(() => {});
        return true;
      }
      await registrar(`[visitante] não interpretado: ${bruto}`.slice(0, 500));
      await enviarTexto(telefone,
        'Não entendi 🙈 Toque em uma das três opções da mensagem anterior.')
        .catch(() => {});
      return true;
    }
    const agora = new Date().toISOString();
    const { data: gravou } = await supabase.from('vis_visitas')
      .update({ pesquisa_nota: nota, pesquisa_respondida_em: agora, pesquisa_status: 'respondida' })
      .eq('id', visita.id).is('pesquisa_nota', null).select('id');
    await registrar(`[visitante] nota ${nota}: ${bruto}`.slice(0, 500));
    if (!gravou?.length) {
      // corrida: outra entrega gravou antes — não repetir o obrigado
      return true;
    }
    // O obrigado vai pela FILA como texto (sessão aberta · sem template) para o
    // wamid ficar em whatsapp_envios e o comentário poder responder a ele.
    try {
      const { enfileirar } = require('./whatsappFila');
      await enfileirar({ telefone: visita.telefone || telefone, texto: textoObrigado(nome, nota),
        contexto: CONTEXTO_OBRIGADO, refId: visita.id });
    } catch (e) {
      await enviarTexto(telefone, textoObrigado(nome, nota)).catch(() => {});
    }
    return true;
  }

  // ── passo 2 · o COMENTÁRIO ──────────────────────────────────────────────────
  // Já tem nota. Sem contexto não assumimos texto (pode ser conversa alheia).
  if (!wamid) {
    // Exceção: outro toque de botão/dígito sozinho é repetição → confirma sem gravar.
    if (nota != null && m.type === 'button') {
      await registrar(`[visitante] nota repetida: ${bruto}`.slice(0, 500));
      await enviarTexto(telefone, `Sua resposta já está registrada, ${nome}. Obrigado! 💚`).catch(() => {});
      return true;
    }
    return false;
  }
  if (nota != null && !ehComentario(bruto)) {
    await registrar(`[visitante] nota repetida: ${bruto}`.slice(0, 500));
    await enviarTexto(telefone, `Sua resposta já está registrada, ${nome}. Obrigado! 💚`).catch(() => {});
    return true;
  }

  // ⚠️ Daqui pra baixo é COMENTÁRIO — e comentário tem PRAZO. Fora da janela
  // devolvemos ao fluxo normal (return false): não gravamos, não respondemos
  // como pesquisa e não engolimos a mensagem, que vira conversa comum.
  if (!comentarioNaJanela({ respondidaEm: visita.pesquisa_respondida_em })) {
    return false;
  }
  if (visita.pesquisa_comentario) {
    // Já comentou: acrescenta (o campo é texto, não fatia) — a 2ª mensagem não pode sumir.
    const novo = `${visita.pesquisa_comentario}\n${String(bruto).trim()}`.slice(0, 1000);
    await supabase.from('vis_visitas').update({ pesquisa_comentario: novo }).eq('id', visita.id);
  } else {
    await supabase.from('vis_visitas')
      .update({ pesquisa_comentario: String(bruto).trim().slice(0, 1000) })
      .eq('id', visita.id).is('pesquisa_comentario', null);
  }
  await registrar(`[visitante] comentário: ${bruto}`.slice(0, 500));
  await enviarTexto(telefone, `Anotado, ${nome}. Obrigado de coração 💚 Esperamos te ver de novo!`).catch(() => {});
  return true;
}

module.exports = { processarRespostaVisitante, envioUnicoRecente };
