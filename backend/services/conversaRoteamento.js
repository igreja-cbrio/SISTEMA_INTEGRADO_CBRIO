// Aplica no banco a decisão de `utils/roteamentoDisparo`: quem responde a um
// disparo cai etiquetado e (quando o setor tem dono) já atribuído.
//
// ⚠️ A RÉGUA não mora aqui — mora no util PURO, que entra no gate de deploy.
// Aqui é só leitura do banco + UPDATE + aviso. Foi assim que `whatsappModulo`
// e `escalaAviso` foram feitos, pelo mesmo motivo: régua que exige webhook,
// banco e WhatsApp para ser testada não é testada.

const supabase = require('../utils/supabase');
const { decidirRoteamento, JANELA_DIAS } = require('../utils/roteamentoDisparo');
const { notificar } = require('./notificar');

/** Últimos 8 dígitos — a MESMA chave que `acharOuCriarConversa` e `contatoPessoa` usam. */
function sufixo(telefone) {
  const d = String(telefone || '').replace(/\D+/g, '');
  return d.length >= 8 ? d.slice(-8) : null;
}

/**
 * O disparo mais recente para este telefone dentro da janela.
 *
 * ⚠️ O casamento é pelos 8 ÚLTIMOS DÍGITOS porque `whatsapp_envios.telefone`
 * guarda **o que o chamador passou**, não uma forma canônica: grupos grava
 * digits-only e `whatsapp_lideres` grava com o 55 na frente. Comparar cru
 * dependeria de sorte (lição de 03/08, `contatoPessoa`).
 * ⚠️ Só envios que SAÍRAM. Linha `erro`/`pendente` não chegou na pessoa, então
 * não pode explicar a resposta dela.
 */
async function ultimoDisparo(telefone) {
  const suf = sufixo(telefone);
  if (!suf) return null;
  const desde = new Date(Date.now() - JANELA_DIAS * 86400000).toISOString();
  const { data, error } = await supabase.from('whatsapp_envios')
    .select('contexto, criado_em, ref_id')
    .ilike('telefone', `%${suf}`)
    .eq('status', 'enviado')
    .gte('criado_em', desde)
    .order('criado_em', { ascending: false })
    .limit(1);
  // ⚠️ Erro NÃO vira "não houve disparo": devolve null e o chamador não roteia,
  // mas o log existe pra a falha aparecer. Silêncio aqui seria conversa sem
  // dono sem ninguém saber por quê.
  if (error) { console.warn('[conversaRoteamento] envios:', error.message); return null; }
  return (data && data[0]) || null;
}

async function setoresAtivos() {
  const { data, error } = await supabase.from('conversas_setores')
    .select('id, ordem, rotulo, area, ativo, destino_tipo, atendente_id')
    .eq('ativo', true).order('ordem');
  if (error) { console.warn('[conversaRoteamento] setores:', error.message); return []; }
  return data || [];
}

/**
 * Etiqueta e atribui a conversa a partir do disparo que a originou.
 *
 * Best-effort: NUNCA lança e nunca derruba `registrarInbound` — a mensagem da
 * pessoa já está gravada, e perder a etiqueta é infinitamente melhor que
 * perder a mensagem.
 */
async function rotearPorDisparo(conversa) {
  try {
    if (!conversa?.id) return null;
    if (conversa.area || conversa.atribuido_a) return null; // decisão humana manda

    const disparo = await ultimoDisparo(conversa.telefone);
    if (!disparo?.contexto) return null;

    const setores = await setoresAtivos();
    const decisao = decidirRoteamento({
      area: conversa.area, atribuidoA: conversa.atribuido_a,
      contexto: disparo.contexto, disparoEm: disparo.criado_em, setores,
    });
    if (!decisao) return null;

    const patch = { area: decisao.area };
    if (decisao.atendenteId) patch.atribuido_a = decisao.atendenteId;

    // ⚠️⚠️ UPDATE CONDICIONADO ao estado vazio, e é ele que decide se houve
    // transição. Duas mensagens chegando juntas (a pessoa manda 3 seguidas)
    // rodariam isto em paralelo; sem a guarda, o aviso sairia 3×. Mesma lição
    // dos recibos do WhatsApp: o efeito colateral fica amarrado à mudança REAL.
    const { data: mudou, error } = await supabase.from('wa_conversas')
      .update(patch).eq('id', conversa.id)
      .is('area', null).is('atribuido_a', null)
      .select('id');
    if (error) { console.warn('[conversaRoteamento] update:', error.message); return null; }
    if (!mudou?.length) return null; // outra execução chegou primeiro

    if (decisao.atendenteId) await avisar(conversa, decisao);
    return { area: decisao.area, atendenteId: decisao.atendenteId };
  } catch (e) {
    console.error('[conversaRoteamento]', e.message);
    return null;
  }
}

/**
 * Avisa quem recebeu a conversa.
 *
 * ⚠️ `targetIds` com UMA pessoa, nunca o fallback: sem alvo o `notificar` cai
 * em TODOS os admin/diretor (16 pessoas), e o sino já tem ~16 mil não lidas
 * exatamente por causa desse fallback. Aqui o dono é conhecido — não há
 * desculpa para avisar a igreja inteira.
 */
async function avisar(conversa, decisao) {
  try {
    const nome = conversa.nome || conversa.telefone || 'Contato';
    await notificar({
      modulo: 'conversas',
      tipo: 'conversa_triada',
      titulo: `Nova conversa · ${decisao.setor?.rotulo || decisao.area}`,
      mensagem: `${nome} respondeu um disparo de ${decisao.setor?.rotulo || decisao.area} — atribuída a você.`,
      link: `/comunicacao?tab=conversas&area=${encodeURIComponent(decisao.area)}`,
      chaveDedup: `conversa_triada_${conversa.id}`,
      targetIds: [decisao.atendenteId],
    });
  } catch (e) { console.error('[conversaRoteamento] notificar:', e.message); }
}

module.exports = { rotearPorDisparo, ultimoDisparo, sufixo };
