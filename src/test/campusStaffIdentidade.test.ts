import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
const { funcionarioDaSessao } = createRequire(import.meta.url)('../../backend/services/staffIdentidade.js');
function banco(data: any[] | null, error: any = null) {
  const q: any = {};
  for (const name of ['select','ilike','in','is','limit']) q[name] = vi.fn(() => q);
  q.then = (r: any, e: any) => Promise.resolve({ data, error }).then(r,e);
  return { from: vi.fn(() => q), q };
}
describe('Staff · identidade própria em RH central', () => {
  it('resolve só o e-mail literal, ativo e não excluído', async () => {
    const db = banco([{ id: 'func', email: 'a_b@example.test', nome: 'Pessoa' }]);
    expect(await funcionarioDaSessao(db, ' A_B@example.test ')).toEqual({ id: 'func', nome: 'Pessoa' });
    expect(db.q.ilike).toHaveBeenCalledWith('email','a\\_b@example.test');
    expect(db.q.is).toHaveBeenCalledWith('deleted_at',null);
    expect(db.q.in).toHaveBeenCalledWith('status',['ativo','ferias','licenca']);
    expect(db.q.limit).toHaveBeenCalledWith(2);
  });
  it('não escolhe a primeira ficha quando o vínculo é ambíguo', async () => {
    await expect(funcionarioDaSessao(banco([{email:'p@example.test'},{email:'p@example.test'}]),'p@example.test')).rejects.toThrow('revisado');
  });
  it('resultado de wildcard nunca autoriza outro funcionário', async () => {
    await expect(funcionarioDaSessao(banco([{email:'axb@example.test'}]),'a_b@example.test')).rejects.toThrow('revisado');
  });
  it('erro de banco não vira ausência de ficha', async () => {
    await expect(funcionarioDaSessao(banco(null,{message:'offline'}),'p@example.test')).rejects.toBeTruthy();
  });
  it('sem vínculo retorna null sem fabricar usuário', async () => {
    expect(await funcionarioDaSessao(banco([]),'p@example.test')).toBeNull();
    const db = banco([]); expect(await funcionarioDaSessao(db,null)).toBeNull(); expect(db.from).not.toHaveBeenCalled();
  });
});
