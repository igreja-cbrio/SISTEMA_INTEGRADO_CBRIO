// ════════════════════════════════════════════════════════════════════════════
//  Aniversário do voluntário · UM parabéns por pessoa por ano
//
//  ⚠️ EXISTEM DOIS CAMINHOS, e eles não se conheciam:
//
//   1. MANUAL — a tela de aniversariantes da SEMANA (próximos 7 dias) tem o
//      botão "Parabenizar" (`POST /voluntariado/aniversariantes/:id/parabenizar`),
//      que grava em `vol_parabens`.
//   2. AUTOMÁTICO — o cron `/api/whatsapp-cron/aniversarios` roda 9h BRT no DIA
//      do aniversário e **não olhava `vol_parabens`**.
//
//  Caso real de 05/08/2026: a coordenação parabenizou o Marcos Paulo às 13:30,
//  um dia ANTES (a tela mostra a semana). O cron do dia 06 mandaria o segundo.
//  E na direção inversa: o cron não gravava em `vol_parabens`, então a tela
//  mostrava "não parabenizado" pra quem já tinha recebido, convidando a
//  coordenação a mandar o duplicado na mão.
//
//  Template de MARKETING repetido pra mesma pessoa é o padrão que a Meta lê como
//  spam — e a nota de qualidade do número é o que decide a subida de tier.
// ════════════════════════════════════════════════════════════════════════════

const { supabase } = require('../utils/supabase');

const CONTEXTO = 'app.aniversario';

/** Ano em BRT — `getFullYear()` no relógio do servidor (UTC) vira o ano seguinte na virada. */
function anoBrt(agora = new Date()) {
  return new Date(agora.getTime() - 3 * 3600 * 1000).getUTCFullYear();
}

/**
 * Esta pessoa já foi parabenizada neste ano, por QUALQUER um dos dois caminhos?
 *
 * ⚠️ A prova principal é `whatsapp_envios`, não `vol_parabens`: é a ÚNICA fonte
 * que os dois caminhos alimentam (os dois passam por `notificarMembro`, que
 * enfileira com `ref_id` = membro e este contexto). `vol_parabens` é por
 * `vol_profile_id` e nem todo voluntário de `mem_voluntarios` tem perfil no
 * vol_* — dedup só por ela deixaria gente descoberta.
 *
 * ⚠️ Só `status='enviado'` conta. Tentativa que ERROU não é parabéns dado:
 * bloquear por causa dela deixaria a pessoa sem mensagem no aniversário dela.
 *
 * Best-effort: em falha de leitura devolve `false` (não bloqueia o envio). Perder
 * o parabéns por causa de uma consulta instável é pior que o risco de duplicar,
 * e a duplicata segue coberta pelo `vol_parabens` no caminho manual.
 */
async function jaParabenizado({ membroId, volProfileId, ano = anoBrt() }) {
  try {
    if (membroId) {
      const { data } = await supabase
        .from('whatsapp_envios')
        .select('id')
        .eq('contexto', CONTEXTO)
        .eq('ref_id', membroId)
        .eq('status', 'enviado')
        .gte('criado_em', `${ano}-01-01T00:00:00Z`)
        .lt('criado_em', `${ano + 1}-01-01T00:00:00Z`)
        .limit(1);
      if (data?.length) return true;
    }
    if (volProfileId) {
      const { data } = await supabase
        .from('vol_parabens')
        .select('vol_profile_id')
        .eq('vol_profile_id', volProfileId)
        .eq('ano', ano)
        .eq('resultado', 'enviado')
        .limit(1);
      if (data?.length) return true;
    }
    return false;
  } catch (e) {
    console.warn('[aniversario] jaParabenizado:', e.message);
    return false;
  }
}

/** vol_profile do membro (o cron itera membros; `vol_parabens` é por perfil). */
async function volProfileDoMembro(membroId) {
  try {
    const { data } = await supabase
      .from('vol_profiles').select('id')
      .eq('membresia_id', membroId).limit(1);
    return data?.[0]?.id || null;
  } catch {
    return null;
  }
}

/**
 * Registra o parabéns dado — é o que faz a TELA da coordenação mostrar
 * "parabenizado" pra quem o cron já alcançou (sem isso, mandam o duplicado na
 * mão). `enviado_por` fica NULL quando foi o cron: a coluna é "que PESSOA
 * enviou", e inventar um usuário ali sujaria a auditoria.
 */
async function registrarParabens({ volProfileId, ano = anoBrt(), porUserId = null, resultado = 'enviado' }) {
  if (!volProfileId) return { skipped: 'sem_vol_profile' };
  try {
    const { error } = await supabase.from('vol_parabens').upsert({
      vol_profile_id: volProfileId,
      ano,
      enviado_em: new Date().toISOString(),
      enviado_por: porUserId,
      resultado,
    }, { onConflict: 'vol_profile_id,ano' });
    if (error) throw error;
    return { ok: true };
  } catch (e) {
    console.warn('[aniversario] registrarParabens:', e.message);
    return { error: e.message };
  }
}

module.exports = { CONTEXTO, anoBrt, jaParabenizado, volProfileDoMembro, registrarParabens };
