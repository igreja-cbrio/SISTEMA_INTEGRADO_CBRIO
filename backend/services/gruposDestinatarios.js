// ════════════════════════════════════════════════════════════════════════════
//  QUEM É O DONO DE UM ASSUNTO DE GRUPO
//
//  Pedido do Matheus (10/08/2026): *"as notificações de grupos devem chegar
//  apenas para os seus respectivos responsáveis. O Arthur Serpa tá recebendo
//  todas as notificações de grupos. Ele deve receber só se for líder de grupo, e
//  mesmo assim só do grupo dele. Eu também to recebendo de todos os grupos.
//  Preciso que isso seja para todos."*
//
//  ⚠️ POR QUE ISSO ACONTECIA — a causa não era "esqueceram de filtrar", era o
//  FALLBACK. `resolverDestinatarios()` (services/notificar.js) procura uma lista
//  nomeada em `notificacao_regras` para o módulo e, se não achar, manda para
//  TODOS os `profiles` com role admin/diretor. Treze módulos têm lista nomeada;
//  **`grupos` nunca teve** — então todo assunto de grupo caía nas ~16 pessoas
//  com cargo alto, uma linha para cada.
//
//  Medido em 21 dias, antes deste conserto:
//    · 10.914 notificações de módulo `grupos` para 18 pessoas
//    · 9.637 (88%) NUNCA foram lidas — o sino tinha virado ruído
//    · 4.762 foram para contas-robô (`agente.*`, que têm role `diretor`)
//    · e 368 das 388 decisões de pedido (95%) foram tomadas pelo LÍDER, pelo
//      link do WhatsApp — ou seja, o aviso in-app não era o canal de trabalho
//      de quase ninguém.
//
//  ⚠️ ESTE ARQUIVO NÃO DECIDE QUEM VÊ, DECIDE QUEM É AVISADO. Autorização de
//  leitura continua onde sempre esteve (RLS + `authorizeModule`); mudar aviso
//  não tira nem dá acesso a nada.
// ════════════════════════════════════════════════════════════════════════════
const { supabase } = require('../utils/supabase');

/**
 * Profiles que respondem por um grupo: LÍDER principal + SUPERVISOR.
 *
 * ⚠️ Só contas que enxergam a notificação. A tabela `notificacoes` é lida pelo
 * ERP web e pelo app do STAFF; o app do MEMBRO lê `app_notificacoes`, que é
 * outra tabela. Então escrever para um profile `is_membro_only` produziria linha
 * que ninguém abre — pior que não avisar, porque parece avisado. Quem é líder e
 * só tem o app do membro continua sendo avisado por WhatsApp, que é o canal por
 * onde 95% das decisões já acontecem.
 *
 * ⚠️ DUAS FONTES DE VÍNCULO, de propósito. O código antigo resolvia o líder por
 * `vol_profiles.membresia_id → auth_user_id` — a tabela do VOLUNTARIADO. Medido:
 * ela alcança **8 dos 100** grupos com líder, contra **12** por
 * `profiles.membro_id`. Líder que não é voluntário cadastrado simplesmente não
 * recebia, e ninguém sabia. A união das duas é o que existe de vínculo.
 *
 * @returns {Promise<string[]>} profile ids (sem repetição). Vazio = ninguém
 *   responde por este grupo COM CONTA de sistema — e aí quem chama decide se
 *   cala (o resumo diário da coordenação cobre) ou cai na lista do módulo.
 */
async function donosDoGrupo(grupoId) {
  if (!grupoId) return [];
  const { data: grupo } = await supabase
    .from('mem_grupos')
    .select('lider_id, supervisor_id')
    .eq('id', grupoId)
    .maybeSingle();
  if (!grupo) return [];

  const membros = [grupo.lider_id, grupo.supervisor_id].filter(Boolean);
  if (!membros.length) return [];

  const ids = new Set();

  // Vínculo canônico: profiles.membro_id.
  const { data: profs } = await supabase
    .from('profiles')
    .select('id')
    .in('membro_id', membros)
    .eq('active', true)
    .or('is_membro_only.is.null,is_membro_only.eq.false');
  for (const p of profs || []) ids.add(p.id);

  // Complemento: quem só tem o vínculo pelo voluntariado.
  const { data: vols } = await supabase
    .from('vol_profiles')
    .select('auth_user_id')
    .in('membresia_id', membros)
    .not('auth_user_id', 'is', null);
  const authIds = (vols || []).map(v => v.auth_user_id).filter(Boolean);
  if (authIds.length) {
    // ⚠️ Confere em `profiles` antes de usar: `auth_user_id` pode apontar para
    // conta desativada ou só-membro, e inserir notificação para conta assim é
    // criar linha órfã.
    const { data: profsVol } = await supabase
      .from('profiles')
      .select('id')
      .in('id', authIds)
      .eq('active', true)
      .or('is_membro_only.is.null,is_membro_only.eq.false');
    for (const p of profsVol || []) ids.add(p.id);
  }

  return [...ids];
}

/**
 * Igual ao `donosDoGrupo`, para vários grupos de uma vez — o cron precisa disso
 * (um round-trip por grupo × 100 grupos por rodada é o que fazia a geração de
 * notificação levar minutos).
 *
 * @returns {Promise<Map<string, string[]>>} grupoId → profile ids
 */
async function donosDeVariosGrupos(grupoIds) {
  const alvo = [...new Set((grupoIds || []).filter(Boolean))];
  const mapa = new Map();
  if (!alvo.length) return mapa;

  const { data: grupos } = await supabase
    .from('mem_grupos')
    .select('id, lider_id, supervisor_id')
    .in('id', alvo);

  const membros = new Set();
  for (const g of grupos || []) {
    for (const m of [g.lider_id, g.supervisor_id]) if (m) membros.add(m);
  }
  if (!membros.size) return mapa;

  const { data: profs } = await supabase
    .from('profiles')
    .select('id, membro_id')
    .in('membro_id', [...membros])
    .eq('active', true)
    .or('is_membro_only.is.null,is_membro_only.eq.false');
  const porMembro = new Map();
  for (const p of profs || []) {
    if (!porMembro.has(p.membro_id)) porMembro.set(p.membro_id, []);
    porMembro.get(p.membro_id).push(p.id);
  }

  for (const g of grupos || []) {
    const ids = new Set();
    for (const m of [g.lider_id, g.supervisor_id]) {
      for (const pid of porMembro.get(m) || []) ids.add(pid);
    }
    if (ids.size) mapa.set(g.id, [...ids]);
  }
  return mapa;
}

module.exports = { donosDoGrupo, donosDeVariosGrupos };
