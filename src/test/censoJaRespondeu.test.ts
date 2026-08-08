import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';

// A regra que decide se o censo APARECE no app. Errar para um lado convida a
// pessoa a preencher 93 campos duas vezes; errar para o outro esconde o censo
// de quem ainda não respondeu. As duas falhas são silenciosas.

const consultas: { tabela: string; filtros: Record<string, unknown> }[] = [];
let respostaPorMembro: unknown = null;
let respostaPorCpf: unknown = null;

// ⚠️ `require` de verdade, não `vi.mock`: o serviço é CommonJS e DESESTRUTURA o
// cliente no topo (`const { supabase } = require(...)`), então a troca precisa
// acontecer no module.exports ANTES de ele ser carregado — coisa que o mock do
// Vitest (grafo do Vite) não alcança daqui. Mesmo padrão de
// pagamentosReemissao.test.ts.
const req = createRequire(import.meta.url);
req('../../backend/utils/supabase.js').supabase = {
    from(tabela: string) {
      const filtros: Record<string, unknown> = {};
      consultas.push({ tabela, filtros });
      const q: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'not', 'is', 'order', 'limit']) {
        q[m] = (a: unknown, b: unknown) => { if (a) filtros[String(a)] = b ?? true; return q; };
      }
      q.maybeSingle = () => Promise.resolve({
        data: tabela === 'cen_resposta' ? respostaPorMembro : respostaPorCpf, error: null,
      });
      return q;
    },
};

const { acharRespostaDaPessoa } = req('../../backend/services/censoJaRespondeu.js');

describe('já respondeu o censo?', () => {
  beforeEach(() => { consultas.length = 0; respostaPorMembro = null; respostaPorCpf = null; });

  it('acha pelo vínculo quando o pós-processamento já rodou', async () => {
    respostaPorMembro = { id: 'r1', concluida_em: '2026-08-09T12:00:00Z' };
    const r = await acharRespostaDaPessoa({ pesquisaId: 'p1', membroId: 'm1', cpf: '14804761705' });
    expect(r?.por).toBe('membro');
    // Achou no primeiro caminho: não gasta a segunda consulta.
    expect(consultas.map((c) => c.tabela)).toEqual(['cen_resposta']);
  });

  it('⚠️ acha pelo CPF quando o vínculo AINDA não foi feito', async () => {
    // Este é o caso que motivou o arquivo. O vínculo resposta→pessoa é
    // deferido de propósito (custava 7 das 8,3 idas ao banco por resposta no
    // culto). Na janela até o pós-processamento rodar, a resposta existe,
    // concluída, com o CPF certo — e sem membro_id. Só por membro_id, o app
    // convidaria a pessoa a responder tudo de novo.
    respostaPorMembro = null;
    respostaPorCpf = { cen_resposta: { id: 'r2', concluida_em: '2026-08-09T13:00:00Z' } };
    const r = await acharRespostaDaPessoa({ pesquisaId: 'p1', membroId: 'm1', cpf: '148.047.617-05' });
    expect(r?.por).toBe('cpf');
    expect(r?.id).toBe('r2');
    // E procurou pelos DÍGITOS: é assim que o item guarda (11 caracteres).
    expect(consultas[1].filtros.valor_texto).toBe('14804761705');
  });

  it('devolve null quando ninguém respondeu — é o que libera o censo no app', async () => {
    expect(await acharRespostaDaPessoa({ pesquisaId: 'p1', membroId: 'm1', cpf: '14804761705' }))
      .toBeNull();
  });

  it('membro sem CPF não vira erro — 743 membros estão assim hoje', async () => {
    const r = await acharRespostaDaPessoa({ pesquisaId: 'p1', membroId: 'm1', cpf: null });
    expect(r).toBeNull();
    // Só tentou o caminho do vínculo; não montou consulta de CPF com lixo.
    expect(consultas.map((c) => c.tabela)).toEqual(['cen_resposta']);
  });

  it('CPF malformado não vira consulta', async () => {
    await acharRespostaDaPessoa({ pesquisaId: 'p1', membroId: null, cpf: '123' });
    expect(consultas).toEqual([]);
  });

  it('sem pesquisa não consulta nada', async () => {
    expect(await acharRespostaDaPessoa({ pesquisaId: null, membroId: 'm1', cpf: '14804761705' }))
      .toBeNull();
    expect(consultas).toEqual([]);
  });

  it('a busca por CPF filtra pela pesquisa e só pega resposta CONCLUÍDA', async () => {
    respostaPorCpf = { cen_resposta: { id: 'r3', concluida_em: '2026-08-09T13:00:00Z' } };
    await acharRespostaDaPessoa({ pesquisaId: 'p9', membroId: null, cpf: '14804761705' });
    const f = consultas[0].filtros;
    // Sem o filtro de pesquisa, responder o censo de 2026 esconderia o de 2027.
    expect(f['cen_resposta.pesquisa_id']).toBe('p9');
    // Rascunho abandonado não conta como "já respondeu".
    expect(f['cen_resposta.concluida_em']).toBeDefined();
  });
});
