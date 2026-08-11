// ============================================================================
// PERFIL DE VOLUNTÁRIO NO APP · a chave que faltava (11/08/2026)
//
// Relato do Marcos: *"Pedro Fernandes, nosso responsável da produção que está
// escalado em TODOS os cultos, ao abrir o app e entrar em Servir apareceu as
// áreas para ele escolher e o pedido de quero ser voluntário."*
//
// ⚠️⚠️ A CAUSA NÃO ERA A TELA — ERA A CHAVE DO JOIN. Todos os 5 endpoints de
// voluntariado do app resolviam o perfil por **`vol_profiles.auth_user_id`**, e
// essa coluna está preenchida em **20 de 928 perfis** (medido 11/08/2026). Quem
// não tem a coluna preenchida:
//   · não é reconhecido como voluntário  ⇒ a tela oferece o FORMULÁRIO
//   · não recebe escala nenhuma          ⇒ "você não tem escalas futuras"
//   · não consegue marcar indisponibilidade
//
// Medido em produção: **8 contas do app estão escaladas** (89, 72, 59, 58, 57,
// 12, 5 e 1 escalas — com escalas FUTURAS) e as 8 caíam no formulário. Todas as
// 8 com `auth_user_id` NULL. O vínculo EXISTIA no dado (`membresia_id` ou
// e-mail) — só não estava na coluna que o backend consultava.
//
// ⚠️ E o escape hatch estava MORTO: a tela tinha um "Já sirvo, cruzar meu CPF"
// que chamava `POST /app/voluntariado/vincular-cpf` — **endpoint que nunca
// existiu no backend**. Único caminho de saída do formulário, e era um 404.
//
// A régua aqui é a MESMA ideia de Grupos: quem decide se você é do time é o
// ROSTER (aqui, o perfil de voluntário), não o formulário de inscrição.
// ============================================================================

const { supabase } = require('./supabase');

const CAMPOS = 'id, full_name, allocation_status, planning_center_id, membresia_id, auth_user_id, email, arquivado';

/**
 * ⚠️⚠️ "ESTÁ SERVINDO" NÃO É `allocation_status === 'active'`.
 *
 * Medido: `allocation_status` é **'active' em 928 de 928** perfis. Ela não
 * discrimina ninguém — dizia "ativo" só por o perfil ter sido achado, o que
 * fazia a régua responder "sim" para qualquer perfil e "não" para todo mundo
 * cujo `auth_user_id` estava vazio. Era um booleano disfarçado de status.
 *
 * O sinal que DE FATO separa é `arquivado`: **793 false × 135 true**. Perfil
 * arquivado é quem a coordenação tirou do time.
 */
function estaServindo(vp) {
  return !!vp && vp.arquivado === false;
}

/**
 * Resolve o perfil de voluntário da conta logada, do vínculo mais forte pro
 * mais fraco, e CONSERTA a coluna quando acha por um vínculo fraco.
 *
 * 1. `auth_user_id` — o vínculo explícito (o único que existia)
 * 2. `membresia_id` — via `profiles.membro_id`; é a mesma pessoa no cadastro
 * 3. `email`        — último recurso, com duas guardas (ver abaixo)
 *
 * ⚠️ A GUARDA DO E-MAIL NÃO É PARANOIA: medi **28 e-mails que apontam para 2
 * `vol_profiles` cada**. Hoje nenhuma conta do app cai nesses casos (0 ambíguos,
 * 0 conflitos), então é gatilho ARMADO, não disparado — e é justamente por isso
 * que a guarda entra agora, não depois de ligar a escala de alguém na conta de
 * outra pessoa. Recusa quando:
 *   · o e-mail casa com mais de um perfil (ambíguo — não se escolhe no chute)
 *   · o perfil já aponta para OUTRO membro ou OUTRA conta
 *
 * ⚠️ O self-heal só escreve quando `auth_user_id` está **NULL** (`.is(...)` na
 * própria condição do UPDATE, não um if no JS). Sem isso, duas contas que
 * resolvem pro mesmo perfil ficariam roubando o vínculo uma da outra a cada
 * abertura da tela — e a última a abrir ganharia as escalas da outra.
 */
async function resolverPerfilVoluntario(req, membro = null) {
  const authId = req.user?.id || null;
  const email = String(req.user?.email || '').toLowerCase().trim();

  // 1 · vínculo explícito
  if (authId) {
    const { data } = await supabase.from('vol_profiles')
      .select(CAMPOS).eq('auth_user_id', authId).maybeSingle();
    if (data) return { vp: data, via: 'auth_user_id' };
  }

  // 2 · mesma pessoa no cadastro de membresia
  const membroId = membro?.id || null;
  if (membroId) {
    const { data } = await supabase.from('vol_profiles')
      .select(CAMPOS).eq('membresia_id', membroId).limit(2);
    // Mais de um perfil pro mesmo membro é dado sujo — não se escolhe no chute.
    if (data && data.length === 1) {
      await ligarPerfil(data[0], authId);
      return { vp: data[0], via: 'membresia_id' };
    }
  }

  // 3 · e-mail, com as duas guardas
  if (email) {
    const { data } = await supabase.from('vol_profiles')
      .select(CAMPOS).ilike('email', email).limit(2);
    if (data && data.length === 1) {
      const vp = data[0];
      const conflitaMembro = vp.membresia_id && membroId && vp.membresia_id !== membroId;
      const conflitaConta = vp.auth_user_id && authId && vp.auth_user_id !== authId;
      if (!conflitaMembro && !conflitaConta) {
        await ligarPerfil(vp, authId);
        return { vp, via: 'email' };
      }
    }
  }

  return { vp: null, via: null };
}

/** Grava `auth_user_id` — só se ainda estiver vazio. Best-effort. */
async function ligarPerfil(vp, authId) {
  if (!vp || !authId || vp.auth_user_id) return;
  try {
    await supabase.from('vol_profiles')
      .update({ auth_user_id: authId })
      .eq('id', vp.id)
      .is('auth_user_id', null);   // ⚠️ a trava mora AQUI, no WHERE
    vp.auth_user_id = authId;
  } catch (e) {
    // Falhar aqui não pode tirar a pessoa da tela dela: a leitura desta abertura
    // já funcionou, e na próxima o fallback acha de novo.
    console.error('[perfilVoluntarioApp] self-heal falhou:', e.message);
  }
}

module.exports = { resolverPerfilVoluntario, estaServindo };
