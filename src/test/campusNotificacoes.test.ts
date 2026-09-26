import { createRequire } from 'node:module';
import { describe, it, expect } from 'vitest';
const { filtrarDestinatariosCampus } = createRequire(import.meta.url)('../../backend/services/campusNotificacoes.js');
const A = '00000000-0000-0000-0000-000000000001';
const contexto = { estado: 'ativo', campus_id: A, campi: [{ id: A }] };
function banco(fail = '') {
  const calls: any[] = [];
  const db = { from: (table: string) => {
    const call: any = { table, eq: [], in: [] }; calls.push(call);
    const q: any = {};
    for (const name of ['select','eq','in','order','range']) q[name] = (...args: any[]) => { (call[name] ||= []).push(args); return q; };
    q.then = (resolve: any, reject: any) => {
      const rows: any = {
        app_super_admins: [{ email: 'global@example.test' }],
        usuario_igrejas: [{ usuario_id: 'local' }],
        profiles: [
          { id: 'local', email: 'local@example.test', active: true },
          { id: 'outro', email: 'outro@example.test', active: true, role: 'admin' },
          { id: 'geral', email: 'geral@example.test', active: true, is_diretoria_geral: true },
          { id: 'super', email: 'global@example.test', active: true },
          { id: 'extra', email: 'global@example.test', active: true },
        ],
      };
      return Promise.resolve({ data: rows[table], error: fail === table ? { message: 'offline' } : null }).then(resolve, reject);
    };
    return q;
  }};
  return { db, calls };
}
describe('destinatários multicampus', () => {
  it('intersecta, preserva acesso geral explícito e não amplia a lista', async () => {
    const env = banco();
    expect(await filtrarDestinatariosCampus(env.db, contexto, ['local','outro','geral','super','local'])).toEqual(['local','geral','super']);
    expect(env.calls.find(c => c.table === 'usuario_igrejas').eq).toContainEqual(['igreja_id', A]);
    expect(env.calls.find(c => c.table === 'profiles').eq).toContainEqual(['active', true]);
  });
  it.each(['usuario_igrejas','profiles','app_super_admins'])('falha em %s impede envio', async table => {
    await expect(filtrarDestinatariosCampus(banco(table).db, contexto, ['local'])).rejects.toBeTruthy();
  });
  it('recusa consolidado para evento nominal', async () => {
    await expect(filtrarDestinatariosCampus(banco().db, { ...contexto, campus_id: 'consolidado', consolidado_permitido: true }, ['local'])).rejects.toThrow();
  });
  it('preparação preserva destinatários existentes e lista vazia não consulta', async () => {
    const env = banco();
    expect(await filtrarDestinatariosCampus(env.db, { ...contexto, estado: 'preparacao' }, ['outro'])).toEqual(['outro']);
    expect(await filtrarDestinatariosCampus(env.db, contexto, [])).toEqual([]);
    expect(env.calls).toHaveLength(0);
  });
});
