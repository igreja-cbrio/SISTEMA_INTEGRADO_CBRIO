import { describe, it, expect } from 'vitest';

import * as cerebroSearch from '../../backend/services/cerebroSearch.js';

const { canReadRouteKey, BIBLIOTECA_TO_ROUTE_KEY, AREA_VAULT_TO_ROUTE_KEY } = cerebroSearch as any;

/**
 * O filtro que decide se um documento do Cérebro entra no prompt do assistente.
 *
 * ⚠️ Por que este teste existe: a lista de bibliotecas monitoradas vive em
 * `cerebro_config.bibliotecas_monitoradas`, uma STRING editável em runtime — sem
 * deploy, sem PR, sem revisão. Se o filtro voltar a ser fail-open, basta alguém
 * digitar "Financas" naquela linha para o resumo de todo documento financeiro
 * ficar legível por qualquer autenticado. O teste trava a direção da falha.
 *
 * Sem banco de propósito: o gate de deploy roda sem Postgres.
 */

// `getEffectiveLevel` (middleware/auth) lê o nível em req.user.granular.modulePerms.
function usuario(nivelPorModulo: Record<string, number> = {}, role = 'assistente') {
  const modulePerms: Record<string, { leitura: number }> = {};
  for (const [slug, n] of Object.entries(nivelPorModulo)) modulePerms[slug] = { leitura: n };
  return { user: { role, granular: { modulePerms } } };
}

describe('cerebroSearch · o filtro falha FECHADO', () => {
  it('origem sem routeKey mapeado NÃO é visível — é o gatilho armado que motivou a mudança', () => {
    // "Financas" não está em BIBLIOTECA_TO_ROUTE_KEY. Antes de 30/07 isto
    // devolvia true e o documento entrava no prompt de qualquer autenticado.
    const routeKey = BIBLIOTECA_TO_ROUTE_KEY['Financas'];
    expect(routeKey).toBeUndefined();
    expect(canReadRouteKey(usuario({ financeiro: 5 }), routeKey)).toBe(false);
  });

  it('routeKey vazio/nulo também fecha', () => {
    expect(canReadRouteKey(usuario(), null)).toBe(false);
    expect(canReadRouteKey(usuario(), undefined)).toBe(false);
    expect(canReadRouteKey(usuario(), '')).toBe(false);
  });

  it('sem usuário autenticado, nada é visível', () => {
    expect(canReadRouteKey(null, 'membresia')).toBe(false);
    expect(canReadRouteKey({}, 'membresia')).toBe(false);
  });

  it('admin e diretor continuam vendo tudo, inclusive origem não mapeada', () => {
    // É o que impede o fail-closed de esconder documento de quem precisa
    // justamente diagnosticar que falta mapear a biblioteca.
    expect(canReadRouteKey(usuario({}, 'admin'), undefined)).toBe(true);
    expect(canReadRouteKey(usuario({}, 'diretor'), 'admin_only')).toBe(true);
  });

  it('admin_only barra quem não é admin/diretor, mesmo com nível alto', () => {
    expect(canReadRouteKey(usuario({ financeiro: 5 }), 'admin_only')).toBe(false);
  });

  it('exige nível >= 2 no módulo — leitura simples (1) não basta para PII de documento', () => {
    expect(canReadRouteKey(usuario({ membresia: 1 }), 'membresia')).toBe(false);
    expect(canReadRouteKey(usuario({ membresia: 2 }), 'membresia')).toBe(true);
    expect(canReadRouteKey(usuario({ membresia: 5 }), 'membresia')).toBe(true);
    expect(canReadRouteKey(usuario({ rh: 5 }), 'membresia')).toBe(false);
  });
});

describe('cerebroSearch · os mapas de origem', () => {
  it('as bibliotecas monitoradas em produção (30/07) estão todas mapeadas', () => {
    // Medido no banco antes de inverter o filtro: é o que garante que
    // fail-closed não escondeu nada que já aparecia.
    for (const b of ['Gestão', 'Criativo', 'Ministerial', 'Planejamento', 'CRM e Pessoas']) {
      expect(BIBLIOTECA_TO_ROUTE_KEY[b], `biblioteca "${b}" perdeu o mapeamento`).toBeTruthy();
    }
  });

  it('as pastas presentes no índice de entidades (30/07) estão todas mapeadas', () => {
    for (const p of ['06-ministerios/voluntariado', '03-projetos', '02-eventos',
      '08-administrativo/rh', '01-crm-pessoas/membros']) {
      expect(AREA_VAULT_TO_ROUTE_KEY[p], `pasta "${p}" perdeu o mapeamento`).toBeTruthy();
    }
  });

  it('nenhum mapa aponta para routeKey vazio — seria fail-closed silencioso', () => {
    for (const [origem, rk] of Object.entries({ ...BIBLIOTECA_TO_ROUTE_KEY, ...AREA_VAULT_TO_ROUTE_KEY })) {
      expect(rk, `origem "${origem}" com routeKey vazio`).toBeTruthy();
    }
  });
});
