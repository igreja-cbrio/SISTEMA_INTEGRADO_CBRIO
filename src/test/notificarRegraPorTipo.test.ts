import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRequire } from 'node:module';

// ⚠️ Este teste protege o caminho por onde passa TODA notificação do sistema.
// A regra nova (por tipo) existe porque um mesmo módulo emite coisas de
// naturezas diferentes — medido em `inscricoes`, 30 dias:
//   nova_inscricao ............ 2.146 avisos (operacional, da coordenação)
//   webhook_pagamento_recusado .   23 avisos (técnico, de quem mantém)
// Sem a dimensão do tipo, restringir um significava restringir o outro.

const req = createRequire(import.meta.url);

/** Supabase de mentira: só o que `resolverDestinatarios` usa. */
function fakeSupabase(cfg: any) {
  return {
    from(tabela: string) {
      const b: any = {
        _cols: '',
        select(c: string) { this._cols = c; return this; },
        eq() { return this; },
        in() { return this; },
        then(res: any, rej: any) {
          if (tabela === 'notificacao_regras') {
            // A 1ª consulta pede `tipo`; simula o PostgREST recusando a query
            // inteira quando a coluna ainda não existe (deploy em 2 etapas).
            if (this._cols.includes('tipo')) {
              return Promise.resolve(cfg.erroTipo
                ? { data: null, error: { message: 'column notificacao_regras.tipo does not exist' } }
                : { data: cfg.regras || [], error: null }).then(res, rej);
            }
            return Promise.resolve({ data: cfg.regrasSemTipo || [], error: null }).then(res, rej);
          }
          return Promise.resolve({ data: cfg.profiles || [], error: null }).then(res, rej);
        },
      };
      return b;
    },
  };
}

// ⚠️ UM fake só, com config MUTÁVEL. `vi.resetModules()` NÃO limpa o cache do
// `createRequire` (é CJS do Node, fora do grafo do Vitest) e o `notificar.js`
// DESESTRUTURA o supabase no topo — então recarregar por teste devolveria
// sempre o primeiro duplo, e os casos seguintes passariam por acidente.
const cfgAtual: any = {};
req('../../backend/utils/supabase.js').supabase = fakeSupabase(cfgAtual);
const { resolverDestinatarios } = req('../../backend/services/notificar.js');

function comCenario(cfg: any) {
  for (const k of Object.keys(cfgAtual)) delete cfgAtual[k];
  Object.assign(cfgAtual, cfg);
}

const ADMINS = [
  { id: 'admin-1', is_servico: false },
  { id: 'admin-2', is_servico: false },
];

describe('resolverDestinatarios · regra por TIPO', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('regra do TIPO vence a regra do módulo', async () => {
    comCenario({
      regras: [
        { profile_id: 'coordenacao', tipo: null },
        { profile_id: 'matheus', tipo: 'webhook_pagamento_recusado' },
        { profile_id: 'marcos', tipo: 'webhook_pagamento_recusado' },
      ],
    });
    const r = await resolverDestinatarios('inscricoes', 'webhook_pagamento_recusado');
    expect(r.sort()).toEqual(['marcos', 'matheus']);
  });

  it('⚠️ configurar UM tipo não muda o destino dos OUTROS avisos do módulo', async () => {
    // É o ponto do desenho: restringir o alerta técnico não pode tirar a
    // coordenação do feed de inscrição nova.
    comCenario({
      regras: [
        { profile_id: 'coordenacao', tipo: null },
        { profile_id: 'matheus', tipo: 'webhook_pagamento_recusado' },
      ],
    });
    const r = await resolverDestinatarios('inscricoes', 'nova_inscricao');
    expect(r).toEqual(['coordenacao']);
  });

  it('regra de OUTRO tipo nunca vaza pro aviso pedido', async () => {
    comCenario({
      regras: [{ profile_id: 'matheus', tipo: 'webhook_pagamento_recusado' }],
      profiles: ADMINS,
    });
    // Só existe regra de um tipo específico: para os demais, vale o fallback.
    const r = await resolverDestinatarios('inscricoes', 'nova_inscricao');
    expect(r).not.toContain('matheus');
    expect(r.sort()).toEqual(['admin-1', 'admin-2']);
  });

  it('sem tipo pedido, usa as regras genéricas (comportamento histórico)', async () => {
    comCenario({
      regras: [
        { profile_id: 'coordenacao', tipo: null },
        { profile_id: 'matheus', tipo: 'webhook_pagamento_recusado' },
      ],
    });
    expect(await resolverDestinatarios('inscricoes')).toEqual(['coordenacao']);
  });

  it('sem regra nenhuma, cai no fallback de admin/diretor', async () => {
    comCenario({ regras: [], profiles: ADMINS });
    expect((await resolverDestinatarios('inscricoes', 'nova_inscricao')).sort())
      .toEqual(['admin-1', 'admin-2']);
  });

  it('conta-robô fica de fora do fallback (não regredir)', async () => {
    comCenario({
      regras: [],
      profiles: [...ADMINS, { id: 'robo', is_servico: true }],
    });
    expect(await resolverDestinatarios('inscricoes', 'x')).not.toContain('robo');
  });

  it('⚠️⚠️ coluna `tipo` ausente NÃO derruba a notificação do sistema inteiro', async () => {
    // Pedir coluna inexistente faz o PostgREST recusar a query INTEIRA. Aqui
    // isso não deixaria "alguns de fora": deixaria TODO MUNDO, em módulo nenhum,
    // até a migration rodar. É a lição do `event_id` (telemetria morta 5 dias).
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    comCenario({
      erroTipo: true,
      regrasSemTipo: [{ profile_id: 'coordenacao' }],
    });
    expect(await resolverDestinatarios('inscricoes', 'webhook_pagamento_recusado'))
      .toEqual(['coordenacao']);
  });
});
