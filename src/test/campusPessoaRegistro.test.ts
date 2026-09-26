import { createRequire } from 'node:module';
import { describe, it, expect, vi } from 'vitest';
const { resolverPessoaRegistro } = createRequire(import.meta.url)('../../backend/services/campusPessoaRegistro.js');
const A = '00000000-0000-0000-0000-000000000001';
const ctx = { campus_id: A, campi: [{ id: A }] };
function ambiente(cpf: string | null = null, presente = true, nascimento: string | null = null) {
  const filtros: any[] = [];
  const q: any = {};
  for (const method of ['select','eq','is']) q[method] = (...args: any[]) => { filtros.push([method, ...args]); return q; };
  q.maybeSingle = async () => ({ data: presente ? { id: 'pessoa', cpf, data_nascimento: nascimento } : null, error: null });
  q.insert = vi.fn(async () => ({ error: null }));
  const supabase = { from: vi.fn(() => q), rpc: vi.fn(async () => ({ error: null })) };
  const matcher = vi.fn(async () => ({ membro_id: 'global', matchedBy: 'cpf' }));
  const reconciliar = vi.fn(async () => ({ acao: 'conflito_pendencia' }));
  return { supabase, matcher, reconciliar, filtros };
}
describe('Cuidados · contrato de pessoa e campus do ato', () => {
  it('usa matcher canônico global e campus apenas para nova identidade', async () => {
    const env = ambiente();
    expect(await resolverPessoaRegistro({ nome: ' Pessoa ', telefone: '(21) 99999-9999', email: ' A@EXAMPLE.TEST ' }, ctx, 'cuidados_visita', env)).toBe('global');
    expect(env.matcher).toHaveBeenCalledWith({ nome: 'Pessoa', telefone: '21999999999', email: 'a@example.test', cpf: null, dataNascimento: null, origem: 'cuidados_visita', status: 'visitante', extra: { igreja_id: A } });
  });
  it.each(['123','11111111111','abc'])('recusa CPF inválido %s antes de criar pessoa', async cpf => {
    const env = ambiente(); await expect(resolverPessoaRegistro({ nome: 'Pessoa', cpf },ctx,'cuidados',env)).rejects.toThrow('CPF inválido');
    expect(env.matcher).not.toHaveBeenCalled();
  });
  it('preserva CPF legado idêntico sem passar valor inválido à reconciliação', async () => {
    const env = ambiente('11111111111');
    expect(await resolverPessoaRegistro({ membro_id: 'pessoa', cpf: '111.111.111-11' },ctx,'cuidados',env)).toBe('pessoa');
    expect(env.reconciliar).not.toHaveBeenCalled();
  });
  it('reconcilia CPF novo e acumula contato sem atualizar principal', async () => {
    const env = ambiente(); await resolverPessoaRegistro({ membro_id: 'pessoa', cpf: '529.982.247-25', telefone: '(21) 99999-9999' },ctx,'cuidados',env);
    expect(env.reconciliar).toHaveBeenCalledWith({ membroId: 'pessoa', cpf: '52998224725', origem: 'cuidados', igrejaId: A, dataNascimento: null, confianca: 'forte' });
    expect(env.supabase.rpc).toHaveBeenCalledWith('fn_registrar_contato', { p_membro_id: 'pessoa', p_telefone: '21999999999', p_email: null, p_fonte: 'cuidados' });
    expect(env.filtros).toContainEqual(['eq','igreja_id',A]);
    expect(env.matcher).not.toHaveBeenCalled();
  });
  it('ID explicitamente fora do campus não chama matcher nem registra contato', async () => {
    const env = ambiente(null,false); await expect(resolverPessoaRegistro({ membro_id: 'pessoa' },ctx,'cuidados',env)).rejects.toThrow('Membro não encontrado');
    expect(env.matcher).not.toHaveBeenCalled(); expect(env.supabase.rpc).not.toHaveBeenCalled();
  });
  it('pedido sem nome não cria cadastro fictício', async () => {
    const env = ambiente(); expect(await resolverPessoaRegistro({ telefone: '21999999999' },ctx,'cuidados',env)).toBeNull();
    expect(env.matcher).not.toHaveBeenCalled();
  });
  it('encaminha nascimento ao matcher para a última chave canônica', async () => {
    const env = ambiente(); await resolverPessoaRegistro({ nome: 'Pessoa', data_nascimento: '1990-01-02' },ctx,'cuidados',env);
    expect(env.matcher).toHaveBeenCalledWith(expect.objectContaining({ dataNascimento: '1990-01-02' }));
  });
  it('nascimento divergente vira revisão mesmo se CPF coincide', async () => {
    const env = ambiente('52998224725',true,'1990-01-02');
    await resolverPessoaRegistro({ membro_id: 'pessoa', cpf: '52998224725', data_nascimento: '1991-01-02' },ctx,'cuidados',env);
    expect(env.supabase.from).toHaveBeenCalledWith('identidade_pendencias');
    expect(env.reconciliar).not.toHaveBeenCalled();
  });
  it('vínculo histórico validado no ato permite identidade global sem mover campus-base', async () => {
    const env = ambiente(); await resolverPessoaRegistro({ membro_id: 'pessoa', telefone: '21999999999' },ctx,'cuidados',{ ...env, membroVinculado: 'pessoa' });
    expect(env.filtros).not.toContainEqual(['eq','igreja_id',A]);
    expect(env.supabase.rpc).toHaveBeenCalledWith('fn_registrar_contato',expect.objectContaining({ p_membro_id: 'pessoa' }));
  });

});
