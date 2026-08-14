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
const { notificar } = require('./notificar');
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

  // 1 · Coordenação — o SISTEMA e o app do STAFF leem a mesma tabela, então
  //     uma chamada cobre os dois.
  //
  // ⚠️ Quem recebe vem de `notificacao_regras` do módulo `voluntariado`, NÃO de
  // uma lista de nomes no código: é a lei do projeto (o dono do fluxo muda sem
  // PR). Sem regra configurada, cai no fallback de admin/diretor.
  try {
    await notificar({
      modulo: 'voluntariado',
      tipo: 'escala_recusada',
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

  // 2 · App do MEMBRO — só o supervisor da área, como pedido.
  //
  // ⚠️ O tipo `escala` já é roteado pelos dois mapas do app pra /voluntariado.
  // Tipo novo cairia em "Outros" e o toque não levaria a lugar nenhum.
  try {
    const sup = await _contaDoSupervisor(atual.team_id);
    if (sup) {
      await notificarApp([sup.userId], {
        tipo: 'escala',
        titulo: `${nome} não vai poder servir`,
        body: `${area}${funcao}${quando ? ` · ${quando}` : ''}. A vaga está em aberto.`,
        data: { tipo: 'escala' },
        chaveDedup: `escala_recusada:${scheduleId}`,
      });
    }
  } catch (e) {
    console.error('[escalaResposta] aviso ao supervisor falhou:', e.message);
  }

  return { ok: true, escala, mudou };
}

module.exports = { responderEscala, STATUS_VALIDOS };
