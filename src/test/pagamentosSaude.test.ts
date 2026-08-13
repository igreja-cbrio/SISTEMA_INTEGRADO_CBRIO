// Sonda de credencial do PSP · classificação do erro.
//
// Por que testar SÓ os classificadores: são eles que decidem entre "cala a boca"
// (configuração intencional) e "acorda gente" (credencial morta). Errar essa
// separação tem os dois custos ruins: alarme diário que ninguém lê, ou chave
// expirada em silêncio até o dia do lançamento.
//
// As mensagens usadas aqui são as REAIS do adapter (providers/asaas.js):
// `apiKey()` lança 'ASAAS_API_KEY não configurada' e as duas de ambiente.
import { describe, it, expect } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const saude = require('../../backend/services/pagamentos/saude.js');
const { ehCredencialAusente, ehAmbienteTrocado, ehCredencialRecusada } = saude._internos;

describe('credencial ausente = configuração, não falha', () => {
  it('reconhece a mensagem real do adapter', () => {
    expect(ehCredencialAusente('ASAAS_API_KEY não configurada')).toBe(true);
  });

  it('tolera a variante sem acento', () => {
    expect(ehCredencialAusente('ASAAS_API_KEY nao configurada')).toBe(true);
  });

  it('não confunde com erro de credencial recusada', () => {
    expect(ehCredencialAusente('Asaas GET /customers: invalid api key')).toBe(false);
  });

  it('não estoura com null/undefined', () => {
    expect(ehCredencialAusente(null)).toBe(false);
    expect(ehCredencialAusente(undefined)).toBe(false);
  });
});

describe('chave do ambiente errado = misconfiguração que merece aviso', () => {
  it('pega a guarda de sandbox em produção', () => {
    const msg = 'ASAAS_API_KEY é de SANDBOX ($aact_hmlg_) mas o ambiente é PRODUÇÃO (production) — nada seria cobrado de verdade.';
    expect(ehAmbienteTrocado(msg)).toBe(true);
  });

  it('pega a guarda de produção fora de produção', () => {
    const msg = 'ASAAS_API_KEY é de PRODUÇÃO ($aact_prod_) fora de produção (preview) — um teste cobraria dinheiro real.';
    expect(ehAmbienteTrocado(msg)).toBe(true);
  });

  it('não dispara em erro comum de rede', () => {
    expect(ehAmbienteTrocado('fetch failed')).toBe(false);
    expect(ehAmbienteTrocado('Asaas GET /customers: HTTP 500')).toBe(false);
  });
});

describe('401/403 = credencial recusada (avisa na primeira)', () => {
  it('401 e 403 contam', () => {
    expect(ehCredencialRecusada(401)).toBe(true);
    expect(ehCredencialRecusada(403)).toBe(true);
  });

  it('erro transitório NÃO conta — senão soluço de rede acorda gente', () => {
    expect(ehCredencialRecusada(500)).toBe(false);
    expect(ehCredencialRecusada(502)).toBe(false);
    expect(ehCredencialRecusada(429)).toBe(false);
    expect(ehCredencialRecusada(null)).toBe(false);
    expect(ehCredencialRecusada(undefined)).toBe(false);
  });
});

describe('intervalos', () => {
  it('a sonda roda no máximo 1x/dia, com folga pra não pular um dia', () => {
    // 20h e não 24h: com 24h exatas, o tick que roda segundos antes do
    // aniversário empurra a verificação pro dia seguinte.
    expect(saude._internos.INTERVALO_MS).toBeLessThan(24 * 60 * 60 * 1000);
    expect(saude._internos.INTERVALO_MS).toBeGreaterThanOrEqual(12 * 60 * 60 * 1000);
  });

  it('exige mais de uma falha antes de incomodar por erro transitório', () => {
    expect(saude._internos.FALHAS_PRA_AVISAR).toBeGreaterThan(1);
  });
});
