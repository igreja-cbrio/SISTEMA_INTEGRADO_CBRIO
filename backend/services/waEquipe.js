// Equipe de atendimento do inbox · leitura do banco + atribuição + aviso.
// A RÉGUA é pura e mora em utils/equipeAtendimento.js (no gate). Aqui é só
// SELECT, UPDATE condicionado e notificar — padrão de conversaRoteamento.js.
//
// Quem chama (08/09/2026):
//   · whatsappTriagem.concluirTriagem  — a opção do MENU aponta pra área
//   · conversaRoteamento.rotearPorDisparo — resposta a disparo etiquetou a área
//   · publicWhatsapp (menu calado, IA calada) e inboxDireto (CBZap) — Entrada
//   · waInbox PATCH area / POST transferir — triagem humana
// Todos best-effort: a mensagem da pessoa já está gravada e nada aqui pode
// derrubá-la. Sem a migration (42P01) a equipe é vazia ⇒ comportamento de
// sempre (avisar a área inteira, ninguém atribuído).
const { supabase } = require('../utils/supabase');
const { notificar } = require('./notificar');
const { normalizarTelefone } = require('./whatsappService');
const R = require('../utils/equipeAtendimento');

async function lerEquipe() {
  const { data, error } = await supabase.from('wa_equipe_atendimento')
    .select('area, titular_id, suplente_id');
  if (error) {
    if (error.code !== '42P01' && !/wa_equipe_atendimento/.test(error.message || '')) {
      console.warn('[waEquipe] ler:', error.message);
    }
    return { equipe: [], migracaoAusente: error.code === '42P01' || /wa_equipe_atendimento/.test(error.message || '') };
  }
  return { equipe: data || [], migracaoAusente: false };
}

/** Responsável configurado para a área (titular, senão suplente) — ou null. */
async function responsavelDaArea(area) {
  const { equipe } = await lerEquipe();
  return R.decidirResponsavel({ area, equipe });
}

/**
 * Atribui a conversa ao responsável da área (a dela, ou a passada em `area`) e
 * avisa SÓ ele. Devolve { atribuido, profileId?, papel?, area?, motivo? } e
 * NUNCA lança.
 *
 * ⚠️ Só onde `atribuido_a` está vazio — decisão humana manda.
 * ⚠️⚠️ O UPDATE é CONDICIONADO (`.is('atribuido_a', null)`) e é ele que decide se
 * houve transição: a pessoa manda 3 mensagens seguidas, o webhook roda 3× em
 * paralelo, e sem a guarda o aviso sairia 3× (lição dos recibos da Meta e do
 * conversaRoteamento).
 */
async function atribuirPelaEquipe({ conversaId = null, telefone = null, area = undefined, origem = 'inbox', avisar: deveAvisar = true } = {}) {
  try {
    let q = supabase.from('wa_conversas')
      .select('id, nome, telefone, area, atribuido_a, membro_id, resolvida')
      .is('deleted_at', null);
    if (conversaId) q = q.eq('id', conversaId);
    else {
      const tel = normalizarTelefone(telefone) || String(telefone || '').replace(/\D+/g, '');
      if (!tel) return { atribuido: false, motivo: 'sem_telefone' };
      q = q.eq('telefone', tel);
    }
    const { data: conv, error } = await q.maybeSingle();
    if (error) { console.warn('[waEquipe] conversa:', error.message); return { atribuido: false, motivo: 'erro_leitura' }; }
    if (!conv) return { atribuido: false, motivo: 'sem_conversa' };
    if (!R.podeAutoAtribuir(conv)) return { atribuido: false, motivo: 'ja_atribuida' };

    const areaAlvo = area !== undefined ? area : conv.area;
    const { equipe } = await lerEquipe();
    const resp = R.decidirResponsavel({ area: areaAlvo, equipe });
    if (!resp) return { atribuido: false, motivo: 'sem_responsavel', area: R.chaveDaArea(areaAlvo) };

    const { data: mudou, error: eUp } = await supabase.from('wa_conversas')
      .update({ atribuido_a: resp.profileId })
      .eq('id', conv.id).is('atribuido_a', null)
      .select('id');
    if (eUp) { console.warn('[waEquipe] update:', eUp.message); return { atribuido: false, motivo: 'erro_update' }; }
    if (!mudou?.length) return { atribuido: false, motivo: 'corrida' }; // outra execução chegou primeiro

    if (deveAvisar) await avisar(conv, resp, origem);
    return { atribuido: true, profileId: resp.profileId, papel: resp.papel, area: resp.area };
  } catch (e) {
    console.error('[waEquipe]', e.message);
    return { atribuido: false, motivo: 'erro' };
  }
}

/**
 * ⚠️ `targetIds` com UMA pessoa, nunca o fallback: sem alvo o `notificar` cai em
 * todos os admin/diretor (16), e o sino já tem milhares de não lidas por isso.
 * ⚠️ A chave de dedup leva a ÁREA (`conversa_triada_<id>_<area>`): o dedup do
 * `notificar` é por chave enquanto o aviso não é lido, não por destinatário —
 * a conversa que sai da Entrada e vai pra Grupos precisa avisar o titular de
 * Grupos mesmo com o aviso da Entrada ainda não lido por outra pessoa.
 */
async function avisar(conv, resp, origem) {
  try {
    const t = R.textoAviso({
      nome: conv.nome || conv.telefone, area: resp.area, papel: resp.papel,
      cadastrada: !!conv.membro_id, origem,
    });
    const areaQs = resp.area === R.ENTRADA ? 'entrada' : encodeURIComponent(resp.area);
    await notificar({
      modulo: 'conversas',
      tipo: 'conversa_triada',
      titulo: t.titulo,
      mensagem: t.mensagem,
      link: `/comunicacao?tab=conversas&area=${areaQs}`,
      chaveDedup: `conversa_triada_${conv.id}_${R.normalizarArea(resp.area)}`,
      targetIds: [resp.profileId],
    });
  } catch (e) { console.error('[waEquipe] notificar:', e.message); }
}

module.exports = { lerEquipe, responsavelDaArea, atribuirPelaEquipe };
