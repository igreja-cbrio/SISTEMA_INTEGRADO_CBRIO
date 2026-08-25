// ============================================================================
// Resposta do voluntário à escala ("vou" / "não vou poder")
// ============================================================================
//
// Pedido do Matheus (14/08/2026): *"quando a pessoa receber a confirmação de
// escala, deve ter a opção para indicar que NÃO vai. Se ela indicar que não
// vai, deve atualizar imediatamente na escala e avisar [a coordenação] no app
// do staff e no sistema. E deve avisar também no app do membro, mas aí apenas
// para o membro que é supervisor da área da pessoa que disse que não vai."*
//
// ⚠️ Este é o CAMINHO ÚNICO da resposta. Ele serve o link público do WhatsApp
// (`/e/<token>`) e o `POST /my-schedules/:id/respond` do app. Duas implementações
// divergiriam no dia em que uma delas mudasse — e a divergência apareceria como
// "recusou pelo app e ninguém foi avisado".

const { supabase } = require('../utils/supabase');
const { notificar, resolverDestinatarios } = require('./notificar');
const { moduloDaAreaEvento } = require('../utils/moduloDaAreaEvento');
const { equipeSupervisionada } = require('../utils/supervisorArea');
const { notificarApp } = require('./appPush');

const STATUS_VALIDOS = ['confirmed', 'declined'];

function _quandoBRT(iso) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  const brt = new Date(d.getTime() - 3 * 3600000);
  const dd = String(brt.getUTCDate()).padStart(2, '0');
  const mm = String(brt.getUTCMonth() + 1).padStart(2, '0');
  const hh = String(brt.getUTCHours()).padStart(2, '0');
  const mi = String(brt.getUTCMinutes()).padStart(2, '0');
  return `${dd}/${mm} às ${hh}:${mi}`;
}

/**
 * Quem supervisiona a área — `vol_teams.leader_profile_id`, resolvido até a
 * CONTA do app (`profiles.id`).
 *
 * ⚠️ Devolve null em silêncio quando não há líder cadastrado ou quando ele não
 * tem conta no app. Isso NÃO pode derrubar a resposta: a pessoa dizer que não
 * vai é o que importa, e o aviso ao supervisor é consequência.
 */
async function _contaDoSupervisor(teamId) {
  if (!teamId) return null;
  try {
    const { data: team } = await supabase.from('vol_teams')
      .select('id, name, leader_profile_id').eq('id', teamId).maybeSingle();
    if (!team?.leader_profile_id) return null;

    const { data: perfil } = await supabase.from('vol_profiles')
      .select('id, full_name, membresia_id').eq('id', team.leader_profile_id).maybeSingle();
    if (!perfil?.membresia_id) return null;

    const { data: conta } = await supabase.from('profiles')
      .select('id').eq('membro_id', perfil.membresia_id).maybeSingle();
    if (!conta?.id) return null;

    return { userId: conta.id, nome: perfil.full_name, equipe: team.name };
  } catch (e) {
    console.error('[escalaResposta] supervisor não resolvido:', e.message);
    return null;
  }
}

/**
 * Registra a resposta e avisa quem precisa saber.
 *
 * @param {string} scheduleId
 * @param {'confirmed'|'declined'} status
 * @param {object} opts  { origem: 'link'|'app'|'sistema', porUserId }
 * @returns {{ok:boolean, status?:number, erro?:string, escala?:object, mudou?:boolean}}
 */
/**
 * A ÁREA da equipe da escala. É o eixo de tudo aqui: decide quem supervisiona e
 * qual módulo é dono do aviso.
 *
 * ⚠️ Erro de leitura devolve `null` (área desconhecida) — o aviso à coordenação
 * do voluntariado sai igual, e ninguém recebe recusa de área alheia.
 */
async function _areaDaEquipe(teamId) {
  if (!teamId) return null;
  const { data, error } = await supabase
    .from('vol_teams').select('area').eq('id', teamId).maybeSingle();
  if (error) throw error;
  return data?.area || null;
}

/**
 * Quem mais é avisado de uma recusa, além da coordenação do voluntariado.
 *
 * ⚠️⚠️ SÃO DUAS FONTES, e nenhuma delas é lista de nome no código:
 *
 * 1 · **Supervisores da área** (`vol_area_supervisores`) — o que o Matheus
 *    pediu em 21/08: *"o perfeito era avisar para o supervisor da área. Com o
 *    tempo vamos cadastrando os supervisores de cada área"*. Fica LIGADO desde
 *    já: à medida que a coordenação cadastra, o aviso passa a chegar sozinho,
 *    sem PR. O curinga `geral` (`supervisorArea.CURINGA`) supervisiona tudo.
 *
 * 2 · **Módulo dono da área** (`moduloDaAreaEvento`) — o MESMO mapa de 17/08
 *    (`KIDS → kids`, `AMI → ami`…). Generaliza o caso do Kids em vez de
 *    mantê-lo como exceção: duas réguas para "quem cuida do Kids" divergiriam
 *    no primeiro ajuste. As pessoas seguem vindo de `notificacao_regras`.
 *
 * ⚠️ Área sem módulo no mapa (Louvor, Produção…) devolve `null` de propósito —
 * inventar slug faria o resolver procurar regra de um módulo inexistente: sem
 * erro, sem destinatário, e sem ninguém descobrir.
 *
 * ⚠️ SUBÁREA NÃO ESTREITA ESTE AVISO (decisão de 25/08/2026). A concessão passou
 * a ter subárea (`position_id`), e aqui continua valendo só a ÁREA — de
 * propósito: isto é NOTIFICAÇÃO, não permissão. Estreitar deixaria a recusa do
 * Estacionamento sem ninguém avisado quando a área só tem supervisor de
 * Ofertório, e silêncio é pior que ruído num aviso de véspera. Permissão fina
 * vive em `utils/supervisorArea.podeSupervisionar`, usada pelas rotas do app.
 */
async function _supervisoresDaArea(area) {
  const ids = new Set();
  const { data, error } = await supabase
    .from('vol_area_supervisores').select('membro_id, area');
  if (error) throw error;
  const membros = (data || [])
    .filter((r) => equipeSupervisionada({ area }, [r.area]))
    .map((r) => r.membro_id)
    .filter(Boolean);
  if (!membros.length) return [];
  // ⚠️ O supervisor é um MEMBRO; quem recebe aviso é o PROFILE. Sem esta ponte
  // o id não casaria com nada e o aviso sumiria em silêncio.
  const { data: perfis, error: pErr } = await supabase
    .from('profiles').select('id').in('membro_id', [...new Set(membros)]);
  if (pErr) throw pErr;
  for (const p of perfis || []) if (p?.id) ids.add(p.id);
  return [...ids];
}

/** Quem cuida do MÓDULO dono daquela área (`notificacao_regras`). */
async function _donosDoModulo(area) {
  const modulo = moduloDaAreaEvento(area);
  if (!modulo) return [];
  return (await resolverDestinatarios(modulo, 'escala_recusada')).filter(Boolean);
}

async function responderEscala(scheduleId, status, opts = {}) {
  if (!STATUS_VALIDOS.includes(status)) {
    return { ok: false, status: 400, erro: 'Status deve ser confirmed ou declined' };
  }

  const { data: atual, error: lErr } = await supabase.from('vol_schedules')
    .select('id, service_id, volunteer_id, volunteer_name, team_id, team_name, position_name, confirmation_status')
    .eq('id', scheduleId).maybeSingle();
  if (lErr) return { ok: false, status: 400, erro: lErr.message };
  if (!atual) return { ok: false, status: 404, erro: 'Escala não encontrada' };

  const { data: servico } = await supabase.from('vol_services')
    .select('id, name, scheduled_at').eq('id', atual.service_id).maybeSingle();

  // ⚠️ O UPDATE é CONDICIONADO ao status anterior, e é o que decide se houve
  // transição. Sem isso, a pessoa abrindo o link duas vezes (ou o app e o link)
  // dispararia o aviso à coordenação de novo — o mesmo cuidado do `.select('id')`
  // nos recibos do WhatsApp: o efeito colateral fica amarrado à mudança real.
  const { data: mudadas, error: uErr } = await supabase.from('vol_schedules')
    .update({ confirmation_status: status })
    .eq('id', scheduleId).neq('confirmation_status', status)
    .select('id');
  if (uErr) return { ok: false, status: 400, erro: uErr.message };

  const mudou = (mudadas || []).length > 0;
  const escala = { ...atual, confirmation_status: status, service: servico || null };
  if (!mudou || status !== 'declined') return { ok: true, escala, mudou };

  // ── A partir daqui: alguém disse que NÃO VAI ────────────────────────────
  const quando = servico?.scheduled_at ? _quandoBRT(servico.scheduled_at) : '';
  const area = atual.team_name || 'Voluntariado';
  const funcao = atual.position_name ? ` (${atual.position_name})` : '';
  const nome = atual.volunteer_name || 'Um voluntário';
  const ondeVer = '/ministerial/voluntariado/montar-escala';

  // ⚠️⚠️ TRAVA A PESSOA NAQUELE CULTO (21/08/2026). Pedido do Matheus: *"o
  // sistema já deve deixar a pessoa inativa para aquele culto que ela disse que
  // não pode ir, pois senão o supervisor da área pode escalar a pessoa de novo
  // sem querer."*
  //
  // A recusa só mudava `confirmation_status`, e a trava de disponibilidade
  // (`utils/volDisponibilidade`, que barra o POST de escala, o /bulk, o /copy,
  // o auto-preencher e o aplicar-template) lê `vol_availability` — que NUNCA
  // recebia nada. Medido em 21/08: **27 escalas futuras recusadas e as 27 sem
  // trava nenhuma**; a tabela por culto estava vazia.
  //
  // ⚠️ É a linha POR CULTO (`service_id` preenchido), nunca a faixa de datas:
  // a pessoa disse que não pode NESTE culto, não que está de férias.
  // ⚠️ Best-effort e DEPOIS da mudança de status: a recusa dela é o que não
  // pode se perder. Falhar aqui deixa a vaga reabrindo sem a trava — ruim, mas
  // melhor que engolir o "não vou poder".
  try {
    const { data: jaTem } = await supabase.from('vol_availability')
      .select('id').eq('service_id', atual.service_id)
      .eq('volunteer_profile_id', atual.volunteer_id).limit(1);
    if (!jaTem?.length) {
      const { error: eDisp } = await supabase.from('vol_availability').insert({
        volunteer_profile_id: atual.volunteer_id,
        service_id: atual.service_id,
        reason: 'Avisou que não pode servir neste culto',
      });
      if (eDisp) throw eDisp;
    }
  } catch (e) {
    console.error('[escalaResposta] não consegui travar a disponibilidade:', e.message);
  }

  // 1 · Coordenação — o SISTEMA e o app do STAFF leem a mesma tabela, então
  //     uma chamada cobre os dois.
  //
  // ⚠️ Quem recebe vem de `notificacao_regras` do módulo `voluntariado`, NÃO de
  // uma lista de nomes no código: é a lei do projeto (o dono do fluxo muda sem
  // PR). Sem regra configurada, cai no fallback de admin/diretor.
  // ⚠️⚠️ RECUSA DO KIDS TAMBÉM AVISA QUEM CUIDA DO MÓDULO `kids` (21/08/2026).
  // Pedido do Matheus: a Mari Gaia e a Milena precisam saber QUEM disse que não
  // vai e em QUAL função, pra escalar outra pessoa. Elas estão em
  // `notificacao_regras` do módulo `kids` e NÃO do `voluntariado`, então sem
  // isto a recusa do Kids nunca chegava nelas.
  //
  // ⚠️ Mesmo padrão do `moduloDaAreaEvento` (17/08): a ÁREA do fato leva ao
  // módulo dono, e as pessoas continuam vindo de `notificacao_regras` — nome de
  // gente não entra no código (lei do projeto). Vai por `extraTargetIds` numa
  // ÚNICA notificação: dois `notificar()` dariam duas linhas no sino de quem
  // estivesse nas duas regras.
  // ⚠️ A ÁREA é o eixo: decide quem supervisiona e qual módulo é dono.
  let areaEquipe = null;
  try { areaEquipe = await _areaDaEquipe(atual.team_id); }
  catch (e) { console.error('[escalaResposta] área da equipe falhou:', e.message); }

  // ⚠️⚠️ Os supervisores da área servem aos DOIS canais (21-22/08): no sistema
  // e no app do staff via `notificar`, e no app do MEMBRO via `notificarApp` —
  // pedido do Matheus. Resolvidos UMA vez e reusados: duas consultas dariam
  // duas respostas possíveis pra "quem supervisiona esta área".
  let supervisores = [];
  try { supervisores = await _supervisoresDaArea(areaEquipe); }
  catch (e) { console.error('[escalaResposta] supervisores da área falharam:', e.message); }

  let avisarTambem = [...supervisores];
  try {
    // ⚠️ Donos do módulo entram SÓ no canal do sistema/staff: `notificacao_regras`
    // é régua de quem opera o ERP, e o app do membro é outro público.
    for (const id of await _donosDoModulo(areaEquipe)) {
      if (!avisarTambem.includes(id)) avisarTambem.push(id);
    }
  } catch (e) {
    // Falha aqui NÃO pode derrubar o aviso à coordenação do voluntariado, que
    // é o destinatário que já funcionava.
    console.error('[escalaResposta] donos do módulo falharam:', e.message);
  }

  try {
    await notificar({
      modulo: 'voluntariado',
      tipo: 'escala_recusada',
      extraTargetIds: avisarTambem,
      titulo: `${nome} não vai poder servir`,
      mensagem: `${nome} avisou que não vai poder servir em ${area}${funcao}${quando ? ` · ${quando}` : ''}${servico?.name ? ` (${servico.name})` : ''}. A vaga voltou a ficar em aberto.`,
      link: ondeVer,
      // Uma recusa é um fato único — dedup por escala impede que o link aberto
      // duas vezes vire dois avisos, mesmo se a guarda de transição falhar.
      chaveDedup: `escala_recusada_${scheduleId}`,
    });
  } catch (e) {
    console.error('[escalaResposta] aviso à coordenação falhou:', e.message);
  }

  // 2 · App do MEMBRO — os SUPERVISORES DA ÁREA + o líder da equipe.
  //
  // ⚠️⚠️ Pedido do Matheus (22/08): *"preciso que os supervisores de cada área
  // sejam notificados no app dos membros tbm."* Antes só o líder da equipe
  // (`vol_teams.leader_profile_id`) recebia aqui — e líder de equipe NÃO é
  // supervisor de área: a Mari e a Milena não lideram a equipe Kids, elas
  // supervisionam a área. Os dois entram, sem repetir.
  //
  // ⚠️ O tipo `escala` já é roteado pelos dois mapas do app pra /voluntariado.
  // Tipo novo cairia em "Outros" e o toque não levaria a lugar nenhum.
  //
  // ⚠️ `chaveDedup` amarra ao FATO (a escala), então quem for supervisor E
  // líder recebe UMA linha só — e reabrir o link não gera outra.
  try {
    const alvos = new Set(supervisores);
    const sup = await _contaDoSupervisor(atual.team_id);
    if (sup?.userId) alvos.add(sup.userId);
    if (alvos.size) {
      await notificarApp([...alvos], {
        tipo: 'escala',
        titulo: `${nome} não vai poder servir`,
        body: `${area}${funcao}${quando ? ` · ${quando}` : ''}. A vaga está em aberto.`,
        data: { tipo: 'escala' },
        chaveDedup: `escala_recusada:${scheduleId}`,
      });
    }
  } catch (e) {
    console.error('[escalaResposta] aviso no app do membro falhou:', e.message);
  }

  return { ok: true, escala, mudou };
}

module.exports = { responderEscala, STATUS_VALIDOS };
