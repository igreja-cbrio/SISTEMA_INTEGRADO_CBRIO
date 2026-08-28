import { describe, it, expect } from 'vitest';
// Serviço do backend (CommonJS) — resolve o QR do check-in de voluntário.
import { resolverVoluntarioPorQr } from '../../backend/services/volCheckinResolver.js';

// Mock mínimo do cliente supabase usado pelo resolver.
function makeSb({ profile = null, vqr = null, rpc = null }: any) {
  const chain = (data: any) => ({
    select() { return this; },
    eq() { return this; },
    async maybeSingle() { return { data }; },
  });
  return {
    from(table: string) {
      if (table === 'vol_profiles') return chain(profile);
      if (table === 'vol_volunteer_qrcodes') return chain(vqr);
      return chain(null);
    },
    async rpc(_fn: string, _args: any) { return { data: rpc }; },
  };
}

describe('resolverVoluntarioPorQr', () => {
  it('1) QR de vol_profiles → mantém o fluxo atual', async () => {
    const sb = makeSb({ profile: { id: 'vp-1', planning_center_id: 'pc1', full_name: 'Maria' } });
    const r = await resolverVoluntarioPorQr('QR-VOL-ATUAL', sb);
    expect(r.ok).toBe(true);
    expect(r.volunteerData).toMatchObject({ type: 'profile', id: 'vp-1', name: 'Maria' });
  });

  it('2) QR mem_qrcodes de voluntário ativo → resolve e libera o check-in', async () => {
    const sb = makeSb({ rpc: { is_voluntario: true, vol_profile_id: 'vp-9', planning_center_id: null, nome: 'João' } });
    const r = await resolverVoluntarioPorQr('TOKEN-MEMBRO', sb);
    expect(r.ok).toBe(true);
    expect(r.volunteerData).toMatchObject({ type: 'profile', id: 'vp-9', name: 'João' });
  });

  it('3) QR mem_qrcodes de quem NÃO é voluntário → recusa 403', async () => {
    const sb = makeSb({ rpc: { is_voluntario: false, vol_profile_id: null, nome: 'Estevam' } });
    const r = await resolverVoluntarioPorQr('TOKEN-NAO-VOL', sb);
    expect(r.ok).toBe(false);
    expect(r.statusCode).toBe(403);
    expect(r.error).toMatch(/voluntária ativa/i);
  });

  it('4) QR desconhecido (nem perfil, nem token) → 404', async () => {
    const sb = makeSb({});
    const r = await resolverVoluntarioPorQr('DESCONHECIDO', sb);
    expect(r.ok).toBe(false);
    expect(r.statusCode).toBe(404);
  });
});
