'use strict';
// Régua PURA: quais modelos de etapa um evento usa ao ativar o ciclo.
//
// ⚠️⚠️ Medido na Fase 0 da linha do tempo (25/09/2026): as 11 etapas do ciclo
// criativo existem SÓ com category_id NULL ("criativo padrão"). A ativação
// filtrava pela categoria do evento, e a categoria Série não tem etapas
// próprias — ativar o ciclo de uma série nova criava um ciclo VAZIO, sem
// erro. A régua: a categoria usa os seus modelos quando tem; senão, o padrão.
// Governança tem modelos próprios e continua usando os dela.

function escolherTemplates(daCategoria, padrao) {
  if (Array.isArray(daCategoria) && daCategoria.length > 0) {
    return { templates: daCategoria, origem: 'categoria' };
  }
  return { templates: Array.isArray(padrao) ? padrao : [], origem: 'padrao' };
}

module.exports = { escolherTemplates };
