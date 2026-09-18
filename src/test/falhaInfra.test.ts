import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const req = createRequire(import.meta.url);
const { ehFalhaDeInfra, respostaDeFalhaAuth } = req('../../backend/utils/falhaInfra.js');

describe('⚠️⚠️ banco fora NÃO é token inválido', () => {
  it('o erro que o supabase-js emite quando a rede cai é INFRA', () => {
    expect(ehFalhaDeInfra({ name: 'AuthRetryableFetchError', message: 'Failed to fetch' })).toBe(true);
  });

  it('os erros REAIS do incidente de 02/09 são INFRA', () => {
    // `fetch failed` é o do undici; 522 é o Cloudflare na frente do Supabase;
    // `Connection terminated` é o do pooler. Os três apareceram na queda.
    expect(ehFalhaDeInfra({ message: 'fetch failed' })).toBe(true);
    expect(ehFalhaDeInfra({ status: 522, message: 'error code: 522' })).toBe(true);
    expect(ehFalhaDeInfra({ message: 'Connection terminated due to connection timeout' })).toBe(true);
    expect(ehFalhaDeInfra({ message: 'x', cause: { code: 'ECONNREFUSED' } })).toBe(true);
  });

  it('5xx e status 0 são infra', () => {
    for (const s of [500, 502, 503, 504, 522, 0]) {
      expect(ehFalhaDeInfra({ status: s, message: 'x' })).toBe(true);
    }
  });

  it('⚠️⚠️ token de verdade inválido NÃO vira "sistema fora"', () => {
    // Fail-closed ao contrário: chamar de instabilidade um acesso revogado
    // esconderia a revogação atrás de uma mensagem de indisponibilidade.
    expect(ehFalhaDeInfra({ status: 401, message: 'invalid JWT: token is expired' })).toBe(false);
    expect(ehFalhaDeInfra({ status: 403, message: 'bad_jwt' })).toBe(false);
    expect(ehFalhaDeInfra({ message: 'invalid claim: missing sub' })).toBe(false);
  });

  it('⚠️ na dúvida, NÃO afirma que é o sistema', () => {
    expect(ehFalhaDeInfra(null)).toBe(false);
    expect(ehFalhaDeInfra(undefined)).toBe(false);
    expect(ehFalhaDeInfra('texto solto')).toBe(false);
    expect(ehFalhaDeInfra({})).toBe(false);
  });
});

describe('o que a pessoa lê', () => {
  it('⚠️⚠️ banco fora → 503 com Retry-After, e a mensagem diz que NÃO é a conta dela', () => {
    // 401 e 503 mandam fazer coisas OPOSTAS: 401 diz "relogue" (que durante a
    // queda também não funcionava, porque o login fala direto com o Auth).
    const r = respostaDeFalhaAuth({ name: 'AuthRetryableFetchError' });
    expect(r.status).toBe(503);
    expect(r.corpo.reason).toBe('banco_indisponivel');
    expect(r.corpo.retry_apos_seg).toBe(30);
    expect(r.corpo.error.toLowerCase()).toContain('não é a sua conta');
  });

  it('token inválido segue 401', () => {
    const r = respostaDeFalhaAuth({ status: 401, message: 'token expired' });
    expect(r.status).toBe(401);
    expect(r.corpo.reason).toBe('invalid_token');
  });
});
