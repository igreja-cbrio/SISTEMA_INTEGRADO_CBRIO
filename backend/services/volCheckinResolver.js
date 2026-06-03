// Resolve o QR escaneado no check-in de voluntário em uma identidade de voluntário.
//
// Aceita 3 formatos, nesta ordem (detecção automática):
//   1) vol_profiles.qr_code          · voluntário com perfil próprio (fluxo atual)
//   2) vol_volunteer_qrcodes.qr_code · QR legado (Planning Center)
//   3) mem_qrcodes.token             · QR unificado do cartão de membro (novo)
//
// Para o caso (3), usa a RPC `fn_vol_resolver_membro_token`, que faz
// token → cpf → membro e verifica se a pessoa é VOLUNTÁRIA ATIVA
// (via vol_profiles OU mem_voluntarios com deleted_at/ate IS NULL). Quem não
// é voluntário ativo é recusado (403), sem registrar check-in.
//
// `sb` é o cliente supabase (injetado · facilita testes).
// Retorna { ok:true, volunteerData } OU { ok:false, statusCode, error }.
async function resolverVoluntarioPorQr(qrCode, sb) {
  if (!qrCode) return { ok: false, statusCode: 400, error: 'qr_code obrigatorio' };

  // 1) vol_profiles.qr_code — comportamento atual (mantido)
  const { data: profile } = await sb.from('vol_profiles')
    .select('id, planning_center_id, full_name').eq('qr_code', qrCode).maybeSingle();
  if (profile) {
    return { ok: true, volunteerData: {
      type: 'profile', id: profile.id,
      planning_center_id: profile.planning_center_id, name: profile.full_name || 'Voluntario',
    } };
  }

  // 2) vol_volunteer_qrcodes.qr_code — QR legado
  const { data: vqr } = await sb.from('vol_volunteer_qrcodes')
    .select('id, planning_center_person_id, volunteer_name').eq('qr_code', qrCode).maybeSingle();
  if (vqr) {
    return { ok: true, volunteerData: {
      type: 'volunteer_qrcode', id: null,
      planning_center_id: vqr.planning_center_person_id, name: vqr.volunteer_name,
    } };
  }

  // 3) mem_qrcodes.token — QR unificado do cartão de membro
  const { data: membro } = await sb.rpc('fn_vol_resolver_membro_token', { p_token: qrCode });
  if (!membro) return { ok: false, statusCode: 404, error: 'Voluntário não encontrado' };
  if (!membro.is_voluntario) return { ok: false, statusCode: 403, error: 'Pessoa não é voluntária ativa' };
  return { ok: true, volunteerData: {
    type: 'profile', id: membro.vol_profile_id || null,
    planning_center_id: membro.planning_center_id || null, name: membro.nome || 'Voluntario',
  } };
}

module.exports = { resolverVoluntarioPorQr };
