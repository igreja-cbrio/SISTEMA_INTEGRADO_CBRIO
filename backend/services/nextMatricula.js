// ============================================================================
// Next · matrícula a partir de um ENCONTRO (2026-07-29)
//
// PROBLEMA QUE ISTO RESOLVE: o app inscreve por ENCONTRO (`next_eventos` +
// `next_inscricoes`), mas a gestão do Next migrou pra TURMA/MATRÍCULA
// (`next_turmas` + `next_matriculas`) no cutover de 17/06. Resultado: quem se
// inscrevia pelo app caía só na camada legada e NÃO aparecia em turma nenhuma
// — inscrição nova nascendo na camada que ninguém gerencia.
//
// DESENHO (não é troca de escritor, é ESPELHO):
//   · `next_inscricoes` continua sendo a presença POR ENCONTRO (é o que o KPI
//     `frequencia_next` lê e o que o app usa pro check-in por geolocalização);
//   · `next_matriculas` passa a existir também, uma por (mês do encontro ×
//     pessoa), que é a inscrição do mês — a camada viva.
//   · a `vw_inscricoes_unificadas` dedupa a legada contra a matrícula pela
//     MESMA chave `origem_mes_key` (migration 20260729190000), então o espelho
//     NÃO reintroduz contagem dupla.
//
// ⚠️ SEMPRE best-effort: o write primário do app (a inscrição/o check-in) já
// respondeu ao usuário e não se desfaz porque o espelho falhou. Erro aqui só
// loga — mesma regra do módulo de Eventos ("write primário decide a resposta").
// ============================================================================
const { supabase } = require('../utils/supabase');

/** 'YYYY-MM' do encontro — é a metade do `origem_mes_key`. */
function mesDoEncontro(data) {
  const s = String(data || '');
  return /^\d{4}-\d{2}/.test(s) ? s.slice(0, 7) : null;
}

/** `origem_mes_key` = chave canônica (mês × pessoa) · UNIQUE no banco
 *  (uq_next_matriculas_origem_mes_key), o que torna o espelho idempotente. */
function chaveMesMembro(dataEncontro, membroId) {
  const mes = mesDoEncontro(dataEncontro);
  return mes && membroId ? `${mes}|${membroId}` : null;
}

// Turma do MÊS do encontro; sem ela, a turma aberta (mesma régua do formulário
// público); sem nenhuma, matrícula sem turma = lista de espera (o ramo 8 da
// view já trata `turma_id IS NULL` como 'recebida').
async function resolverTurma(mes) {
  if (mes) {
    const { data } = await supabase.from('next_turmas')
      .select('id').eq('origem_mes', mes).is('deleted_at', null)
      .limit(1).maybeSingle();
    if (data?.id) return data.id;
  }
  const { data: aberta } = await supabase.from('next_turmas')
    .select('id').eq('status', 'aberta').is('deleted_at', null)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  return aberta?.id || null;
}

/**
 * Garante a matrícula do mês do encontro. Devolve `{ ok, matricula_id, criada }`
 * ou `{ ok: false, motivo }` — NUNCA lança.
 */
async function espelharMatriculaDoEncontro({
  membro, evento, nome, sobrenome, email, checkInAt = null, checkInBy = null, origem = 'app',
}) {
  try {
    if (!membro?.id || !evento?.data) return { ok: false, motivo: 'sem_membro_ou_encontro' };
    const chave = chaveMesMembro(evento.data, membro.id);
    if (!chave) return { ok: false, motivo: 'data_do_encontro_invalida' };

    const { data: ja } = await supabase.from('next_matriculas')
      .select('id, check_in_at').eq('origem_mes_key', chave).is('deleted_at', null)
      .limit(1).maybeSingle();
    if (ja) {
      // Já existe (reenvio, ou o check-in chegando depois da inscrição): só
      // completa a presença que faltava.
      if (checkInAt && !ja.check_in_at) {
        await supabase.from('next_matriculas')
          .update({ check_in_at: checkInAt, check_in_by: checkInBy, updated_at: new Date().toISOString() })
          .eq('id', ja.id);
      }
      return { ok: true, matricula_id: ja.id, criada: false };
    }

    const turmaId = await resolverTurma(mesDoEncontro(evento.data));
    const { data: nova, error } = await supabase.from('next_matriculas').insert({
      turma_id: turmaId,
      nome: nome || membro.nome || 'Membro',
      sobrenome: sobrenome || null,
      cpf: membro.cpf || null,
      telefone: membro.telefone || null,
      email: email || membro.email || null,
      data_nascimento: membro.data_nascimento || null,
      membro_id: membro.id,
      origem,
      origem_mes_key: chave,
      status: 'matriculado',
      check_in_at: checkInAt,
      check_in_by: checkInBy,
    }).select('id').single();

    if (error) {
      // 23505 = corrida na UNIQUE (origem_mes_key, ou turma+cpf/email da
      // fundação das turmas): a matrícula existe, o objetivo foi atingido.
      if (error.code === '23505') return { ok: true, criada: false, motivo: 'ja_existia' };
      throw error;
    }
    return { ok: true, matricula_id: nova.id, criada: true };
  } catch (e) {
    console.error('[nextMatricula] espelho da matrícula:', e.message);
    return { ok: false, motivo: e.message };
  }
}

module.exports = { espelharMatriculaDoEncontro, chaveMesMembro, mesDoEncontro };
