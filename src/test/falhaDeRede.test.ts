import { describe, it, expect } from 'vitest';
import { ehFalhaDeRedeOuServidor, ehDuplicado } from '../lib/falhaDeRede';

describe('⚠️⚠️ o bug que deixava a fila offline DESLIGADA no banco fora', () => {
  it('5xx É indisponibilidade — era esta linha que estava invertida', () => {
    // O `isNetworkError` antigo fazia `if (err.status) return false`, então
    // 500/503/522 (tudo o que apareceu na queda de 02/09) devolvia FALSE e a
    // fila nunca ligava. Só WiFi caído a acionava.
    for (const s of [500, 502, 503, 504, 521, 522, 524]) {
      expect(ehFalhaDeRedeOuServidor({ status: s, message: 'x' }), `status ${s}`).toBe(true);
    }
  });

  it('429 conta: o servidor está pedindo para recuar', () => {
    expect(ehFalhaDeRedeOuServidor({ status: 429 })).toBe(true);
  });

  it('⚠️⚠️ 4xx NÃO é falha de rede — é RESPOSTA sobre o pedido', () => {
    // Enfileirar um 409 ("já tem check-in") faria a fila retentar para sempre
    // algo que o servidor já decidiu.
    for (const s of [400, 401, 403, 404, 409, 422]) {
      expect(ehFalhaDeRedeOuServidor({ status: s, message: 'x' }), `status ${s}`).toBe(false);
    }
  });

  it('WiFi caído (sem status) continua contando', () => {
    expect(ehFalhaDeRedeOuServidor({ name: 'TypeError', message: 'Failed to fetch' })).toBe(true);
    expect(ehFalhaDeRedeOuServidor({ message: 'NetworkError when attempting to fetch' })).toBe(true);
    expect(ehFalhaDeRedeOuServidor({ name: 'TimeoutError', message: 'aborted' })).toBe(true);
  });

  it('⚠️ na dúvida NÃO enfileira (fail-closed)', () => {
    // Enfileirar o que não é falha de infra faz a fila crescer com lixo que
    // nunca vai sincronizar.
    expect(ehFalhaDeRedeOuServidor(null)).toBe(false);
    expect(ehFalhaDeRedeOuServidor({})).toBe(false);
    expect(ehFalhaDeRedeOuServidor('texto solto')).toBe(false);
  });
});

describe('duplicado é SUCESSO na sincronização', () => {
  it('409 e 23505 contam', () => {
    expect(ehDuplicado({ status: 409 })).toBe(true);
    expect(ehDuplicado({ message: 'duplicate key value violates ... 23505' })).toBe(true);
    expect(ehDuplicado({ message: 'A criança já possui check-in ativo' })).toBe(true);
  });
  it('erro de infra NÃO é duplicado', () => {
    expect(ehDuplicado({ status: 503 })).toBe(false);
    expect(ehDuplicado(null)).toBe(false);
  });
});
