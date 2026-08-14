// ════════════════════════════════════════════════════════════════════════════
//  WhatsApp · de que MÓDULO é este envio (régua PURA)
//
//  Vive em utils/ (sem cliente Supabase, sem rede, sem relógio externo) porque é
//  aqui que se decide QUEM recebe o aviso de mensagem não entregue — e isso tem
//  que ser testável no gate de deploy. Quem lê o banco e notifica é
//  services/whatsappContexto.js.
// ════════════════════════════════════════════════════════════════════════════

/**
 * `contexto` → módulo dono do aviso (+ link da tela onde se resolve).
 *
 * ⚠️ O PREFIXO DO CONTEXTO NÃO É UM MÓDULO. Era isso que estava errado no
 * aniversário: o contexto é `app.aniversario` (o prefixo `app.` diz que o
 * disparo nasceu de um evento do app, não que exista um módulo "app"), então
 * `contexto.split('.')[0]` devolvia `'app'`, `resolverDestinatarios` não achava
 * regra e o aviso caía no fallback = TODOS os admin/diretor. Aviso que chega
 * pra 16 pessoas e não é de nenhuma é aviso que ninguém trata.
 *
 * Chave mais específica primeiro (`app.aniversario` antes de `app`).
 */
const MAPA = [
  // Aniversário e escala são do Ministério do Voluntariado — o cron de
  // aniversário só envia pra quem tem vínculo de voluntário ABERTO.
  ['app.aniversario', { modulo: 'voluntariado', link: '/voluntariado' }],
  ['app.escala_voluntario', { modulo: 'voluntariado', link: '/voluntariado' }],
  ['app.kids_vinculo', { modulo: 'kids', link: '/ministerial/totem-kids/vinculos' }],
  ['app.kids_precheckin', { modulo: 'kids', link: '/ministerial/totem-kids' }],
  ['app.batismo_lembrete', { modulo: 'integracao', link: '/integracao?tab=batismos' }],
  ['app.familia_convite_aceito', { modulo: 'membresia', link: '/ministerial/membresia' }],
  ['app.pedido_atualizado', { modulo: 'solicitacoes', link: '/solicitacoes' }],
  ['app.doacao_recebida', { modulo: 'financeiro', link: '/financeiro-v2' }],
  ['app.inscricao_confirmada', { modulo: 'inscricoes', link: '/inscricoes' }],
  ['grupos', { modulo: 'grupos', link: '/grupos' }],
  ['censo', { modulo: 'membresia', link: '/ministerial/membresia?tab=cadastros' }],
  ['membresia', { modulo: 'membresia', link: '/ministerial/membresia?tab=cadastros' }],
  ['inscricoes', { modulo: 'inscricoes', link: '/inscricoes' }],
  ['next', { modulo: 'next', link: '/next' }],
  ['voluntariado', { modulo: 'voluntariado', link: '/voluntariado' }],
  // Donos dos envios migrados pra fila no C2 (lote 5 · 2026-08-14).
  ['cuidados', { modulo: 'cuidados', link: '/ministerial/cuidados' }],
  ['kids', { modulo: 'kids', link: '/ministerial/totem-kids' }],
  ['solicitacoes', { modulo: 'solicitacoes', link: '/solicitacoes' }],
];

// ⚠️ `integracao` como padrão preserva o comportamento que a fila já tinha —
// contexto desconhecido não pode virar aviso sem dono.
const PADRAO = { modulo: 'integracao', link: null };

function moduloDoContexto(contexto) {
  const c = String(contexto || '').trim().toLowerCase();
  if (!c) return PADRAO;
  for (const [chave, destino] of MAPA) {
    if (c === chave || c.startsWith(`${chave}.`)) return destino;
  }
  return PADRAO;
}

/** Dia em BRT — `toISOString()` é UTC e das 21h em diante já viraria o dia seguinte. */
function diaBrt(agora = new Date()) {
  return new Date(agora.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);
}

module.exports = { moduloDoContexto, diaBrt, MAPA, PADRAO };
