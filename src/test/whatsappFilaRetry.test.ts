import { describe, it, expect } from 'vitest';
// @ts-expect-error — serviço do backend em CommonJS, sem tipos.
import fila from '../../backend/services/whatsappFila.js';

const { decidirRetry, limitarPorTelefone, falhaPermanente, IDADE_MIN_DESISTIR_H, BACKOFF_MIN } = fila;

const base = { reason: 'api_error', tentativas: 0, maxTentativas: 5, idadeHoras: 0, permanente: false };

describe('decidirRetry · não desistir antes da janela de 24h da Meta', () => {
  it('erro PERMANENTE desiste na primeira falha (reenviar não muda nada)', () => {
    const d = decidirRetry({ ...base, permanente: true });
    expect(d.status).toBe('erro');
    expect(d.terminal).toBe(true);
  });

  it('falha passageira mantém pendente com o backoff crescente', () => {
    [0, 1, 2, 3].forEach((t) => {
      const d = decidirRetry({ ...base, tentativas: t });
      expect(d.status).toBe('pendente');
      expect(d.terminal).toBe(false);
      expect(d.backoffMin).toBe(BACKOFF_MIN[t]);
    });
  });

  // ESTE é o caso do domingo de abertura: teto estourado, 5 tentativas gastas
  // em 20,5h, mas a cota da Meta só libera perto de 24h.
  it('tentativas esgotadas mas linha NOVA: continua pendente (não descarta)', () => {
    const d = decidirRetry({ ...base, tentativas: 4, idadeHoras: 20.5 });
    expect(d.tentativas).toBe(5);
    expect(d.status).toBe('pendente');
    expect(d.terminal).toBe(false);
    expect(d.backoffMin).toBeLessThanOrEqual(60); // tenta de novo na próxima hora
  });

  it('só desiste depois de a janela ter virado com folga', () => {
    const d = decidirRetry({ ...base, tentativas: 9, idadeHoras: IDADE_MIN_DESISTIR_H + 1 });
    expect(d.status).toBe('erro');
    expect(d.terminal).toBe(true);
  });

  it('a janela mínima cobre as 24h da Meta com folga', () => {
    expect(IDADE_MIN_DESISTIR_H).toBeGreaterThan(24);
  });

  it("'disabled' não queima tentativa (env desligada não é falha de envio)", () => {
    const d = decidirRetry({ ...base, reason: 'disabled', tentativas: 3 });
    expect(d.tentativas).toBe(3);
    expect(d.status).toBe('pendente');
    expect(d.terminal).toBe(false);
  });
});

describe('falhaPermanente', () => {
  it('telefone inválido e link local são permanentes', () => {
    expect(falhaPermanente({ reason: 'invalid_phone' })).toBe(true);
    expect(falhaPermanente({ reason: 'link_local' })).toBe(true);
  });

  it('teto/rate limit da Meta NÃO é permanente (é o motivo de a fila existir)', () => {
    // 130429 rate limit · 131048 spam rate limit · 131049 ecossistema · 131056 pair rate limit
    [130429, 131048, 131049, 131056].forEach((code) => {
      expect(falhaPermanente({ reason: 'api_error', detail: { error: { code } } })).toBe(false);
    });
  });

  it('erro de template/param inexistente é permanente', () => {
    expect(falhaPermanente({ reason: 'api_error', detail: { error: { code: 132001 } } })).toBe(true);
  });
});

describe('limitarPorTelefone · suaviza a rajada por destinatário', () => {
  it('deixa no máx 2 por telefone e preserva a ordem (mais antigo primeiro)', () => {
    const pend = [
      { id: 1, telefone: '21999990000' },
      { id: 2, telefone: '21999990000' },
      { id: 3, telefone: '21999990000' },
      { id: 4, telefone: '21988880000' },
      { id: 5, telefone: '21999990000' },
    ];
    const r = limitarPorTelefone(pend, 2);
    expect(r.map((x: any) => x.id)).toEqual([1, 2, 4]);
  });

  it('não mexe quando cada telefone aparece uma vez', () => {
    const pend = [
      { id: 1, telefone: '1' },
      { id: 2, telefone: '2' },
      { id: 3, telefone: '3' },
    ];
    expect(limitarPorTelefone(pend, 2)).toHaveLength(3);
  });

  it('8 pedidos pro mesmo líder drenam em 4 rodadas (4 horas), não de uma vez', () => {
    let restantes: any[] = Array.from({ length: 8 }, (_, i) => ({ id: i, telefone: '21999990000' }));
    let rodadas = 0;
    while (restantes.length) {
      const naRodada = limitarPorTelefone(restantes, 2);
      expect(naRodada.length).toBeLessThanOrEqual(2);
      const ids = new Set(naRodada.map((x) => x.id));
      restantes = restantes.filter((x) => !ids.has(x.id));
      rodadas++;
      if (rodadas > 10) break;
    }
    expect(rodadas).toBe(4);
  });

  it('lista vazia não quebra', () => {
    expect(limitarPorTelefone([], 2)).toEqual([]);
    expect(limitarPorTelefone(undefined as any, 2)).toEqual([]);
  });
});
