// ════════════════════════════════════════════════════════════════════════════
//  GANCHO DO WEBHOOK · "quero trocar de grupo" → PEDIDO PENDENTE à coordenação
//  (26/09/2026 · determinístico, SEM IA)
//
//  Pedido do Matheus (item 3): *"a pessoa pode trocar sozinha [de grupo] e o
//  sistema já deve atualizar no cadastro dela automaticamente e deve avisar a
//  coordenação. Cuidado para homem não ir para grupo só de mulheres e vice
//  versa."*
//
//  ⚠️⚠️ A METADE "ATUALIZAR AUTOMATICAMENTE" NÃO É IMPLEMENTADA (decisão do
//  conselho, unanimidade, 26/09 — o porquê completo está em
//  `utils/trocaGrupoConversa.js`). A identidade da conversa de WhatsApp é
//  fraca, então ESTE ARQUIVO NUNCA ESCREVE EM `mem_grupo_membros` — nem fecha
//  vínculo, nem cria. Ele cria o PEDIDO PENDENTE em `mem_grupo_transferencias`
//  pelo caminho ÚNICO (`services/grupoTransferencia.solicitarTransferencia`, o
//  mesmo do app do líder) e a coordenação move a pessoa pela Caixa de entrada.
//  Há guarda estática no gate.
//
//  Contrato: `tratarPedidoTroca(...)` NUNCA lança. `{ tratado:false }` devolve a
//  mensagem pro bot de IA; `{ tratado:true, acionarEquipe }` assume.
// ════════════════════════════════════════════════════════════════════════════

const { supabase } = require('../utils/supabase');
const { semFalhar } = require('../utils/semFalhar');
const {
  pedeTroca, grupoCitado, compatibilidadeTroca, ehLiderancaDoGrupo, casoDaTroca,
  montarMotivoTroca, textoRespostaTroca, destinoComoTexto,
} = require('../utils/trocaGrupoConversa');
const { grupoDaConversa } = require('./sugestaoGrupoAgenda');
const { solicitarTransferencia } = require('./grupoTransferencia');
const { registrarOutbound } = require('./waInbox');

/**
 * Os grupos que podem ser DESTINO: ativos, não apagados, menos o de origem.
 * ⚠️ `ativo = true` na consulta: grupo encerrado não é destino de ninguém, e
 * citá-lo como candidato faria a coordenação conferir o que não existe mais.
 * Erro de consulta devolve `null` (o chamador segue sem destino — "não
 * informado" — em vez de inventar um).
 */
async function gruposCandidatos(origemId) {
  const { data, error } = await supabase.from('mem_grupos')
    .select('id, nome, categoria, bairro, ativo, deleted_at, aceitando_inscricoes, modo_inscricao, temporada')
    .eq('ativo', true).is('deleted_at', null);
  if (error) { console.warn('[trocaGrupo] candidatos:', error.message); return null; }
  return (data || []).filter((g) => g.id !== origemId);
}

/** O vínculo ATIVO da pessoa no grupo de origem (id + função). */
async function vinculosNaOrigem(membroId, grupoId) {
  const { data, error } = await supabase.from('mem_grupo_membros')
    .select('id, funcao')
    .eq('membro_id', membroId).eq('grupo_id', grupoId).is('saiu_em', null);
  if (error) { console.warn('[trocaGrupo] vinculo:', error.message); return null; }
  return data || [];
}

async function lerMembro(membroId) {
  const { data, error } = await supabase.from('mem_membros')
    .select('nome, genero').eq('id', membroId).is('deleted_at', null).maybeSingle();
  if (error) { console.warn('[trocaGrupo] membro:', error.message); return null; }
  return data || null;
}

async function gravarTrilha(coletaId, parsed) {
  if (!coletaId) return;
  await semFalhar(supabase.from('whatsapp_coletas').update({
    erro: 'gancho:troca', parsed,
  }).eq('id', coletaId), '[trocaGrupo] coleta');
}

/**
 * @param conversa `wa_conversas` da pessoa (o `ganchosGrupoWhatsapp` já leu).
 * @param enviarTexto `(telefone, texto, opts) → { ok, message_id, error }`.
 */
async function tratarPedidoTroca({ telefone, texto, messageId, phoneNumberId = null, enviarTexto, conversa } = {}) {
  let coletaId = null;
  try {
    const forca = pedeTroca(texto);
    if (!forca) return { tratado: false, motivo: 'nao_e_pedido' };
    // ⚠️ Sem cadastro não há de QUEM é a troca — a transferência exige
    // `membro_id`. Gente responde.
    if (!conversa?.membro_id) return { tratado: false, motivo: 'sem_cadastro' };

    // ⚠️ Origem só pelo VÍNCULO ATIVO (nunca por pedido): trocar de grupo é sair
    // de um grupo em que a pessoa está. Ambíguo ou erro ⇒ gente decide.
    const vinc = await grupoDaConversa(conversa);
    if (!vinc.grupo) return { tratado: false, motivo: vinc.motivo || 'sem_grupo' };
    const origem = vinc.grupo;

    const candidatos = await gruposCandidatos(origem.id);
    const destino = candidatos ? grupoCitado(texto, candidatos) : { tipo: 'nenhum' };
    // ⚠️ "Quero ir pro grupo X" só é troca com UM destino claro — senão é quase
    // sempre "posso ir pro grupo hoje?" (ir ao encontro).
    if (forca === 'destino' && destino.tipo !== 'unico') return { tratado: false, motivo: 'destino_nao_claro' };

    const roster = await vinculosNaOrigem(conversa.membro_id, origem.id);
    if (roster === null) return { tratado: false, motivo: 'erro_vinculo' };

    // Daqui pra frente o gancho ASSUME a mensagem (idempotência pela coleta,
    // como o bot de IA — e só agora, depois de decidir tratar).
    if (messageId) {
      const ins = await supabase.from('whatsapp_coletas').insert({
        whatsapp_message_id: messageId, telefone, raw_text: String(texto || '').slice(0, 4000),
        status: 'ignorado', erro: 'gancho:troca', modulo_destino: 'bot_ia',
      }).select('id').maybeSingle();
      if (ins.error) {
        if (ins.error.code === '23505') return { tratado: true, acao: 'duplicado', motivo: 'reentrega' };
        console.warn('[trocaGrupo] coleta:', ins.error.message);
      } else coletaId = ins.data?.id || null;
    }

    const membro = await lerMembro(conversa.membro_id);
    const nome = conversa.nome || membro?.nome || '';
    const lideranca = ehLiderancaDoGrupo({ membroId: conversa.membro_id, grupo: origem, roster });
    const compat = destino.tipo === 'unico'
      ? compatibilidadeTroca({ destino: destino.grupo, genero: membro?.genero })
      : { bloqueia: false, notas: [] };

    // ⚠️ A decisão é da régua PURA (no gate): liderança e sexo incompatível
    // NÃO criam pedido. Só `criar` chega na transferência.
    let caso = casoDaTroca({ lideranca, compat });
    const exigido = caso === 'sexo_incompativel' ? compat.exigido : null;
    let transferenciaId = null;
    if (caso === 'criar') {
      const r = await solicitarTransferencia({
        membroId: conversa.membro_id,
        grupoOrigemId: origem.id,
        grupoOrigemNome: origem.nome,
        vinculoId: roster[0]?.id || null,
        motivo: montarMotivoTroca({ telefone: conversa.telefone || telefone, destino, texto, notas: compat.notas }),
        pedidoPor: null,
        pedidoPorNome: 'A própria pessoa (WhatsApp)',
        origem: 'whatsapp',
        pessoaNome: nome || null,
        destinoTexto: destinoComoTexto(destino),
      });
      caso = r.ja_pedido ? 'ja_pedido' : 'anotado';
      transferenciaId = r.transferencia_id || null;
    }

    const resposta = textoRespostaTroca({ caso, nome, grupoAtualNome: origem.nome, destino, exigido });
    const opts = phoneNumberId ? { phoneNumberId } : {};
    const env = typeof enviarTexto === 'function'
      ? await enviarTexto(telefone, resposta, opts).catch((e) => ({ ok: false, error: e.message }))
      : { ok: false, error: 'sem_enviarTexto' };
    if (env?.ok) {
      await registrarOutbound({ telefone, texto: resposta, tipo: 'bot', phoneNumberId, waMessageId: env.message_id || null })
        .catch((e) => console.warn('[trocaGrupo] outbound:', e.message));
    }

    await gravarTrilha(coletaId, {
      gancho: 'troca', caso, forca,
      grupo_origem_id: origem.id,
      destino: destino.tipo === 'unico' ? destino.grupo.id : destino.tipo,
      transferencia_id: transferenciaId, enviado: !!env?.ok,
    });

    // ⚠️ Liderança e sexo incompatível NÃO criam pedido — alguém precisa ver a
    // conversa. Resposta que não saiu também.
    const acionarEquipe = !env?.ok || caso === 'lideranca' || caso === 'sexo_incompativel';
    return { tratado: true, acao: 'troca', caso, transferencia_id: transferenciaId, enviado: !!env?.ok, acionarEquipe };
  } catch (e) {
    console.error('[trocaGrupo] tratar:', e.message);
    if (coletaId) {
      await gravarTrilha(coletaId, { gancho: 'troca', erro: String(e.message || 'erro').slice(0, 200) });
      // ⚠️ A coleta já foi reivindicada (o bot de IA não vai responder). Sem
      // "anotei" — não sabemos se o pedido foi gravado —, a equipe é acionada.
      return { tratado: true, acao: 'erro', acionarEquipe: true };
    }
    return { tratado: false, motivo: 'erro' };
  }
}

module.exports = { tratarPedidoTroca };
