// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const A = '00000000-0000-0000-0000-000000000001';
const B = '00000000-0000-0000-0000-000000000002';
function ambiente(estado = 'ensaio', falhaConfig = false) {
  const criadas = new Map(); let falhar = true;
  const rpc = vi.fn(async (_fn, args) => {
    if (falhar) { falhar = false; return { data: null, error: { message: 'transação revertida' } }; }
    const chave = `${args.p_igreja_id}:${args.p_auto_domingo}`;
    const ja_existia = criadas.has(chave); criadas.set(chave, true);
    return { data: { id: chave, nome: args.p_nome, ja_existia }, error: null };
  });
  const q: any = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: { estado, campus_legado_id: A, ja_ativado: false }, error: falhaConfig ? {} : null }) };
  const db = { from: vi.fn(() => q), rpc };
  const mod: any = { exports: {} };
  vm.runInNewContext(readFileSync('backend/services/nextTurmasAuto.js','utf8'), { module: mod, require(name: string) {
    if (name === '../utils/supabase') return { supabase: db };
    return require('../../backend/utils/nextTurmas.js');
  }});
  return { ...mod.exports, db, criadas };
}
describe('Next · produtor automático explícito e transacional', () => {
  it('recusa campus implícito fora da preparação sem iniciar gravações', async () => {
    const env = ambiente(); await expect(env.garantirTurmasDoMes('2026-11', new Date('2026-10-01'))).rejects.toThrow(/Campus explícito/);
    expect(env.db.rpc).not.toHaveBeenCalled();
  });
  it('falha de configuração nunca volta silenciosamente à Sede', async () => {
    const env = ambiente('preparacao', true); await expect(env.garantirTurmasDoMes('2026-11')).rejects.toThrow(/indisponível/);
    expect(env.db.rpc).not.toHaveBeenCalled();
  });
  it('preparação aceita apenas campus legado', async () => {
    const env = ambiente('preparacao'); await expect(env.garantirTurmasDoMes('2026-11',new Date('2026-10-01'),{ campusId: B })).rejects.toThrow(/Campus explícito/);
  });
  it('retry recupera falha isolada, não duplica e inclui o quinto domingo', async () => {
    const env = ambiente(); const agora = new Date('2026-10-01');
    const first = await env.garantirTurmasDoMes('2026-11',agora,{ campusId: B });
    expect(first.criadas).toHaveLength(4); expect(first.erros).toHaveLength(1);
    const retry = await env.garantirTurmasDoMes('2026-11',agora,{ campusId: B });
    expect(retry.criadas).toHaveLength(1); expect(retry.ja_existiam).toHaveLength(4); expect(env.criadas.size).toBe(5);
    for (const [fn, args] of env.db.rpc.mock.calls) { expect(fn).toBe('fn_campus_next_criar_turma'); expect(args).toMatchObject({ p_igreja_id: B, p_puxar_fila: false }); }
  });
});
