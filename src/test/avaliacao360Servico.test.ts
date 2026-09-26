import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';

const requireLocal = createRequire(import.meta.url);
const anonimato = requireLocal('../../backend/utils/avaliacaoAnonimato.js');
const fonte = readFileSync(resolve(__dirname, '../../backend/services/avaliacao360.js'), 'utf8');

type Resultado = { data?: unknown; error?: { message: string; code?: string } | null };
function carregar(resultados: Resultado[] = [], retornoRpc: Resultado = { data: { gravados: 0, existentes: 0 } }) {
  const consultas: { tabela: string; filtros: unknown[][] }[] = [];
  const supabase = {
    from: vi.fn((tabela: string) => {
      const consulta = { tabela, filtros: [] as unknown[][] };
      consultas.push(consulta);
      const builder: any = {};
      for (const metodo of ['select', 'eq', 'is', 'ilike', 'order', 'range', 'maybeSingle']) {
        builder[metodo] = (...args: unknown[]) => { consulta.filtros.push([metodo, ...args]); return builder; };
      }
      builder.then = (resolve: (resultado: Resultado) => unknown) => {
        if (!resultados.length) throw new Error('Consulta inesperada');
        return Promise.resolve(resultados.shift()).then(resolve);
      };
      return builder;
    }),
    rpc: vi.fn().mockResolvedValue(retornoRpc),
  };
  const modulo = { exports: {} as any };
  runInNewContext(fonte, {
    module: modulo,
    require: (id: string) => {
      if (id === '../utils/supabase') return { supabase };
      if (id === '../utils/avaliacaoAnonimato') return anonimato;
      throw new Error(`Import inesperado: ${id}`);
    },
  });
  return { servico: modulo.exports, supabase, consultas };
}

const funcionario = (id: string, gestor_id: string | null = null) => ({ id, gestor_id, nome: id, area: 'Equipe', email: `${id}@example.org` });
const ciclo = { id: 'ciclo', status: 'rascunho', piso_respondentes: 3, max_pares: 3 };

describe('360: identidade literal do login', () => {
  it('normaliza caixa e espaços e escapa curingas antes da consulta', async () => {
    const pessoa = { ...funcionario('a'), email: 'A_B%\\X@example.org' };
    const { servico, consultas } = carregar([{ data: [pessoa] }]);
    const resultado = await servico.funcionarioDoLogin({ user: { email: ' A_B%\\X@example.org ' } });
    expect(resultado).toEqual({ funcionario: pessoa, erro: null });
    expect(consultas[0].filtros).toContainEqual(['ilike', 'email', 'a\\_b\\%\\\\x@example.org']);
    expect(consultas[0].filtros).toContainEqual(['eq', 'status', 'ativo']);
    expect(consultas[0].filtros).toContainEqual(['is', 'deleted_at', null]);
  });

  it('não vincula funcionário retornado apenas por expansão de curinga', async () => {
    const { servico } = carregar([{ data: [{ ...funcionario('a'), email: 'anaXsilva@example.org' }] }]);
    expect(await servico.funcionarioDoLogin({ user: { email: 'ana_silva@example.org' } })).toEqual({ funcionario: null, erro: 'nao_e_funcionario' });
  });

  it('e-mail com asterisco só resolve o candidato literalmente igual', async () => {
    const literal = { ...funcionario('a'), email: 'ana*silva@example.org' };
    const outro = { ...funcionario('b'), email: 'anaXsilva@example.org' };
    const { servico, consultas } = carregar([{ data: [literal, outro] }]);
    expect((await servico.funcionarioDoLogin({ user: { email: literal.email } })).funcionario).toEqual(literal);
    expect(consultas[0].filtros).toContainEqual(['ilike', 'email', 'ana_silva@example.org']);
  });

  it('recusa duas identidades literais e não trata erro de banco como cadastro ausente', async () => {
    const pessoa = funcionario('a');
    const { servico } = carregar([{ data: [pessoa, { ...pessoa, id: 'b' }] }, { error: { message: 'offline' } }]);
    expect((await servico.funcionarioDoLogin({ user: { email: pessoa.email } })).erro).toBe('email_ambiguo');
    expect((await servico.funcionarioDoLogin({ user: { email: pessoa.email } })).erro).toBe('consulta_falhou');
  });

  it('não consulta o banco para login sem e-mail', async () => {
    const { servico, supabase } = carregar();
    expect((await servico.funcionarioDoLogin({ user: {} })).erro).toBe('sem_email');
    expect(supabase.from).not.toHaveBeenCalled();
  });
});

describe('360: planejamento e geração de convites', () => {
  it('não conta gestor fora dos ativos nem auto-hierarquia como gestor/liderado', async () => {
    const a = funcionario('a', 'a');
    const b = funcionario('b', 'inativo');
    const { servico } = carregar();
    expect(await servico.elegiveisPorPapel(a, [a, b])).toMatchObject({ gestor: 0, liderado: 0 });
    expect(await servico.elegiveisPorPapel(b, [a, b])).toMatchObject({ gestor: 0 });
    expect(await servico.elegiveisPorPapel({ ...b, gestor_id: 'a' }, [a, b])).toMatchObject({ gestor: 1 });
  });

  it('suprime pares quando o teto torna impossível atingir o piso', async () => {
    const ativos = Array.from({ length: 7 }, (_, i) => funcionario(String(i)));
    const { servico } = carregar([{ data: ativos }]);
    const retrato = await servico.retratoDoCiclo({ ...ciclo, piso_respondentes: 5, max_pares: 3 });
    expect(retrato.resumo.convites_previstos).toBe(7);
    expect(retrato.linhas[0].elegiveis.par).toBe(6);
    expect(retrato.linhas[0].coletar).not.toContain('par');
    expect(retrato.linhas[0].suprimidos).toContainEqual({ papel: 'par', motivo: 'abaixo_do_piso' });
  });

  it('envia uma operação atômica sem pares e informa os números confirmados pelo banco', async () => {
    const ativos = [funcionario('g'), funcionario('a', 'g'), funcionario('b', 'g'), funcionario('c', 'g'), funcionario('d', 'inativo')];
    const { servico, supabase } = carregar([{ data: ciclo }, { data: ativos }], { data: { gravados: 2, existentes: 9 } });
    expect(await servico.gerarConvitesAutomaticos('ciclo')).toMatchObject({ ok: true, gravados: 2, existentes: 9, piso: 3 });
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    const [nome, args] = supabase.rpc.mock.calls[0];
    expect(nome).toBe('fn_aval360_gerar_convites');
    expect(args.p_ciclo_id).toBe('ciclo');
    expect(args.p_linhas).toHaveLength(11);
    expect(args.p_linhas.filter((l: any) => l.papel === 'liderado')).toHaveLength(3);
    expect(args.p_linhas.some((l: any) => l.papel === 'par' || l.avaliador_id === 'inativo')).toBe(false);
    expect(supabase.from.mock.calls.map(([t]) => t)).not.toContain('rh_aval360_convite');
  });

  it('não divide em lotes uma geração que ultrapassa 500 convites', async () => {
    const ativos = Array.from({ length: 501 }, (_, i) => funcionario(String(i)));
    const { servico, supabase } = carregar([{ data: ciclo }, { data: ativos }], { data: { gravados: 501, existentes: 0 } });
    await servico.gerarConvitesAutomaticos('ciclo');
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    expect(supabase.rpc.mock.calls[0][1].p_linhas).toHaveLength(501);
  });

  it('falha da transação ou retorno ilegível não vira geração bem-sucedida', async () => {
    const { servico } = carregar([{ data: ciclo }, { data: [] }], { error: { message: 'ciclo alterado', code: 'P0409' } });
    await expect(servico.gerarConvitesAutomaticos('ciclo')).rejects.toMatchObject({ message: 'falha ao gravar convites: ciclo alterado', code: 'P0409' });
    const invalido = carregar([{ data: ciclo }, { data: [] }], { data: null });
    await expect(invalido.servico.gerarConvitesAutomaticos('ciclo')).rejects.toThrow('confirmar');
  });

  it('não tenta gerar depois da abertura da coleta', async () => {
    const { servico, supabase } = carregar([{ data: { ...ciclo, status: 'coleta' } }]);
    expect(await servico.gerarConvitesAutomaticos('ciclo')).toMatchObject({ ok: false, motivo: 'ciclo_fora_da_janela' });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('página seguinte de funcionários é carregada e erro na leitura não gera convites', async () => {
    const mil = Array.from({ length: 1000 }, (_, i) => funcionario(String(i)));
    const { servico, consultas } = carregar([{ data: mil }, { data: [funcionario('1000')] }]);
    expect(await servico.listarAtivos()).toHaveLength(1001);
    expect(consultas[1].filtros).toContainEqual(['range', 1000, 1999]);
    const falha = carregar([{ data: ciclo }, { error: { message: 'offline' } }]);
    await expect(falha.servico.gerarConvitesAutomaticos('ciclo')).rejects.toThrow('offline');
    expect(falha.supabase.rpc).not.toHaveBeenCalled();
  });
});
