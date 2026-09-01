// ============================================================================
// INSCRIÇÕES · o ESCRITOR ÚNICO do check-in de evento
//
// Extraído de `routes/inscricoes.js` em 28/08/2026 para que a porta pública de
// AUTOATENDIMENTO (`routes/publicEventoCheckin.js`) marque presença pelo MESMO
// caminho da tela do operador.
//
// ⚠️ Duas cópias desta função divergiriam no primeiro ajuste — e o sintoma
// seria a portaria e o totem discordando sobre quem entrou, no meio do evento.
// Quem precisa marcar presença importa daqui; não reimplementar.
// ============================================================================

const { supabase } = require('../utils/supabase');

function rpcArquiteturalIndisponivel(error) {
  return !!error && ['PGRST202', '42883'].includes(error.code);
}

async function marcarCheckinAuditavel({ inscricaoId, por, modo, overridePendente, motivo }) {
  const { data, error } = await supabase.rpc('fn_insc_checkin_marcar', {
    p_inscricao_id: inscricaoId,
    p_por: por,
    p_modo: modo,
    p_override_pendente: !!overridePendente,
    p_override_motivo: motivo || null,
  });
  if (!error) return data;
  if (!rpcArquiteturalIndisponivel(error)) throw error;

  // Compatibilidade durante deploy em duas etapas: comportamento antigo,
  // protegido pelo UNIQUE, até a migration da trilha estar disponível.
  const { data: marcado, error: erroLegado } = await supabase.from('insc_checkins')
    .insert({ inscricao_id: inscricaoId, por, modo })
    .select('em').single();
  if (erroLegado) {
    if (erroLegado.code !== '23505') throw erroLegado;
    const { data: existente } = await supabase.from('insc_checkins')
      .select('em').eq('inscricao_id', inscricaoId).maybeSingle();
    return { ok: true, ja_checkin: true, em: existente?.em || null };
  }
  return { ok: true, ja_checkin: false, em: marcado.em };
}

async function desfazerCheckinAuditavel({ eventoId, inscricaoId, por, motivo }) {
  const { data, error } = await supabase.rpc('fn_insc_checkin_desfazer', {
    p_evento_id: eventoId,
    p_inscricao_id: inscricaoId,
    p_por: por,
    p_motivo: motivo || null,
  });
  if (!error) return data;
  if (!rpcArquiteturalIndisponivel(error)) throw error;
  const { error: erroLegado } = await supabase.from('insc_checkins')
    .delete().eq('inscricao_id', inscricaoId);
  if (erroLegado) throw erroLegado;
  return { ok: true, auditoria_disponivel: false };
}

module.exports = { marcarCheckinAuditavel, desfazerCheckinAuditavel };
