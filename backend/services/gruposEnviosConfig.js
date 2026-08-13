// ============================================================================
// Grupos · CONFIG dos envios (leaf · sem dependência de outros serviços de
// grupos pra evitar require circular). Fonte única do estado dos interruptores.
//
// Dois níveis (Marcos 2026-07-23):
//  - bloqueio_total: BLOQUEIO GERAL. Quando true, NENHUM envio de grupos sai —
//    automático, por evento (inscrição/aprovação) OU manual. É a garantia 100%.
//  - grupos_auto_envios: liga/desliga o único envio AUTOMÁTICO proativo (a
//    chamada MENSAL de frequência). Por-tipo (hoje só a frequência é automática).
//    Só vale se o bloqueio geral estiver desligado.
//
// Tudo tolera coluna ausente → estado SEGURO (bloqueio=false lê como não-
// bloqueado; auto=false). Default seguro: bloqueio_total NÃO nasce ligado
// (senão pararia a confirmação de inscrição da abertura); auto nasce desligado.
// ============================================================================
const { supabase } = require('../utils/supabase');

async function _cfg() {
  try {
    const { data } = await supabase.from('whatsapp_config')
      .select('id, grupos_bloqueio_total, grupos_auto_envios, updated_at').limit(1).maybeSingle();
    return data || {};
  } catch { return {}; }
}

// BLOQUEIO GERAL ligado? (true = nada de grupos pode sair)
async function bloqueioTotalAtivo() {
  const c = await _cfg();
  return c.grupos_bloqueio_total === true;
}

// Envio AUTOMÁTICO de frequência permitido? (precisa: não-bloqueado E auto ligado)
async function enviosAutomaticosAtivos() {
  const c = await _cfg();
  if (c.grupos_bloqueio_total === true) return false; // bloqueio geral vence
  return c.grupos_auto_envios === true;
}

async function getConfigEnvios() {
  const c = await _cfg();
  return {
    bloqueio_total: c.grupos_bloqueio_total === true,
    auto_frequencia: c.grupos_auto_envios === true,
    atualizado_em: c.updated_at || null,
  };
}

// patch = { bloqueio_total?, auto_frequencia? } — grava só o que veio.
async function setConfigEnvios(patch, userId) {
  const { data: row } = await supabase.from('whatsapp_config').select('id').limit(1).maybeSingle();
  const upd = { updated_by: userId || null, updated_at: new Date().toISOString() };
  if ('bloqueio_total' in patch) upd.grupos_bloqueio_total = patch.bloqueio_total === true;
  if ('auto_frequencia' in patch) upd.grupos_auto_envios = patch.auto_frequencia === true;
  if (row?.id != null) await supabase.from('whatsapp_config').update(upd).eq('id', row.id);
  else await supabase.from('whatsapp_config').insert(upd);
  return getConfigEnvios();
}

module.exports = { bloqueioTotalAtivo, enviosAutomaticosAtivos, getConfigEnvios, setConfigEnvios };
