import { describe, it, expect } from 'vitest';

// @ts-expect-error módulo JS sem tipos
import {
  ENTIDADES_PERMITIDAS_NO_VAULT,
  podeIrProVault,
  decidirRetrySync,
  getSupportedEntityTypes,
  AREA_VAULT_BY_ENTITY,
  MAX_TENTATIVAS_SYNC,
} from '../../backend/services/cerebroSync.js';

/**
 * Duas guardas independentes sobre o sync ERP → vault Obsidian.
 *
 * (A) A ALLOWLIST. O vault é biblioteca do SharePoint espelhada pelo OneDrive:
 *     não tem permissão por linha e a cópia local é irrevogável. Fila pastoral
 *     (`acompanhamento`) não entra — decisão do Marcos em 03/08.
 *
 * (B) O RETRY. Falha de CONSULTA não pode virar erro terminal na 1ª tentativa —
 *     foi assim que os 50 eventos da igreja ficaram fora do vault por 3 meses.
 */

describe('vault · allowlist de entidades', () => {
  it('⚠️ acompanhamento (fila pastoral) NUNCA pode ir pro vault', () => {
    // Se este teste ficar vermelho, alguém acrescentou a fila pastoral à
    // allowlist. NÃO "conserte" o teste: LGPD art. 11 + sigilo pastoral, e a
    // cópia que o OneDrive baixa no laptop não volta atrás. Ver o comentário-lei
    // em cerebroSync.js.
    expect(podeIrProVault('acompanhamento')).toBe(false);
    expect(ENTIDADES_PERMITIDAS_NO_VAULT.has('acompanhamento')).toBe(false);
  });

  it('o backfill não OFERECE tipo bloqueado', () => {
    // 3ª camada: POST /cerebro/backfill/:tipo valida contra esta lista e
    // enfileira todas as linhas do tipo de uma vez.
    expect(getSupportedEntityTypes()).not.toContain('acompanhamento');
  });

  it('libera exatamente o que foi decidido — nem mais, nem menos', () => {
    // Lista fechada: entidade nova só passa por decisão explícita de quem
    // acrescentar aqui, e aí lê o porquê no comentário.
    expect([...ENTIDADES_PERMITIDAS_NO_VAULT].sort()).toEqual([
      'contribuicao-mes', 'evento', 'funcionario', 'membro', 'projeto', 'voluntario',
    ]);
  });

  it('toda entidade permitida tem pasta no vault mapeada', () => {
    // Sem isso a nota cai em `_dados-brutos`, fora da pasta que o
    // AREA_VAULT_TO_ROUTE_KEY do cerebroSearch sabe filtrar por permissão.
    for (const tipo of ENTIDADES_PERMITIDAS_NO_VAULT) {
      expect(AREA_VAULT_BY_ENTITY[tipo], `${tipo} sem area_vault`).toBeTruthy();
    }
  });

  it('tipo desconhecido/vazio é barrado (fail-closed)', () => {
    expect(podeIrProVault('tipo_que_nao_existe')).toBe(false);
    expect(podeIrProVault('')).toBe(false);
    expect(podeIrProVault(null)).toBe(false);
    expect(podeIrProVault(undefined)).toBe(false);
  });
});

describe('vault · retry da fila de sync', () => {
  it('falha de CONSULTA volta pra fila em vez de virar erro terminal', () => {
    // O bug de 22/04: um erro de query devolvia data=null, o chamador dizia
    // "entidade não encontrada", e a fila desistia na primeira tentativa.
    expect(decidirRetrySync({ tentativas: 1, retentavel: true }))
      .toEqual({ status: 'pendente', motivo: 'retentavel' });
  });

  it('entidade REALMENTE ausente é terminal na hora', () => {
    // Re-tentar não faz a linha existir. Aqui "erro" está correto.
    expect(decidirRetrySync({ tentativas: 1, retentavel: false }))
      .toEqual({ status: 'erro', motivo: 'permanente' });
  });

  it('retentável tem teto — não tenta pra sempre', () => {
    expect(decidirRetrySync({ tentativas: MAX_TENTATIVAS_SYNC, retentavel: true }))
      .toEqual({ status: 'erro', motivo: 'tentativas_esgotadas' });
    expect(decidirRetrySync({ tentativas: MAX_TENTATIVAS_SYNC - 1, retentavel: true }).status)
      .toBe('pendente');
  });

  it('sem argumento nenhum, desiste (não trava a fila num item sem contexto)', () => {
    expect(decidirRetrySync().status).toBe('erro');
    expect(decidirRetrySync({}).status).toBe('erro');
  });
});
