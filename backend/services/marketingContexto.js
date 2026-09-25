'use strict';
// Quem está logado, na régua do Marketing. Compartilhado por routes/marketing.js
// e routes/marketingLinha.js: duas cópias da régua de líder divergiriam no
// primeiro ajuste, e a linha do tempo recortaria diferente do checklist.
//
// ⚠️ Líder vem da HABILIDADE, não do nível: o AREA_MODULO_BOOST dá nível 5 à
// equipe inteira de Marketing (utils/marketingChecklist).

const { supabase } = require('../utils/supabase');
const regraSubtarefa = require('../utils/marketingChecklist');

function levelOf(req) {
  const modulePerms = req.user.granular?.modulePerms || {};
  const mkt = modulePerms.marketing || modulePerms.Marketing;
  if (!mkt) return 0;
  return Math.max(mkt.leitura || 0, mkt.escrita || 0);
}

async function contextoSubtarefa(req) {
  const { data, error } = await supabase
    .from('marketing_membros')
    .select('id, habilidade')
    .eq('profile_id', req.user.userId)
    .eq('ativo', true)
    .is('deleted_at', null);
  if (error) throw error;
  const membros = data || [];
  return {
    lider: regraSubtarefa.ehLider({ role: req.user.role, habilidades: membros.map(m => m.habilidade) }),
    nivel: levelOf(req),
    meusMembroIds: membros.map(m => m.id),
  };
}

module.exports = { levelOf, contextoSubtarefa };
