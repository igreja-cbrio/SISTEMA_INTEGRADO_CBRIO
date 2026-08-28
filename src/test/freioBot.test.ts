// Contrato do freio do bot (Matheus · 25-26/08/2026).
// ⚠️ Este teste existe porque o gate ESTAVA CERTO e mesmo assim o bot falou:
// ele era fail-OPEN, e uma falha de leitura da config o religava.
import { describe, it, expect } from 'vitest';
import { botPodeResponder, webhookDesligado } from '../../backend/utils/freioBot.js';

describe('freio do bot · respostas_automaticas', () => {
  it('freio LIGADO no banco: o bot cala', () => {
    expect(botPodeResponder({ cfg: { respostas_automaticas: false } })).toBe(false);
  });

  it('freio DESLIGADO no banco: o bot responde', () => {
    expect(botPodeResponder({ cfg: { respostas_automaticas: true } })).toBe(true);
  });

  it('⚠️⚠️ ERRO ao ler a config → NÃO responde (fail-CLOSED)', () => {
    // Era exatamente aqui que o bot escapava: `cfg` null + `error` descartado.
    expect(botPodeResponder({ cfg: null, erroConfig: { message: 'timeout' } })).toBe(false);
    // e nem um cfg aparentemente liberado vence o erro
    expect(botPodeResponder({ cfg: { respostas_automaticas: true }, erroConfig: { message: 'x' } })).toBe(false);
  });

  it('⚠️ config ausente também não libera', () => {
    expect(botPodeResponder({ cfg: null })).toBe(false);
    expect(botPodeResponder({})).toBe(false);
  });

  it('⚠️ coluna AUSENTE mantém o comportamento histórico (responde)', () => {
    // Deploy anterior à migration: `undefined` não é "cale-se". Só `false`
    // EXPLÍCITO no banco significa freio ligado.
    expect(botPodeResponder({ cfg: { ia_ativa: true } })).toBe(true);
  });

  it('⚠️ valor estranho não é lido como freio', () => {
    // `0`, `''` e `null` na coluna são dado torto, não decisão de calar.
    expect(botPodeResponder({ cfg: { respostas_automaticas: 0 } })).toBe(true);
    expect(botPodeResponder({ cfg: { respostas_automaticas: null } })).toBe(true);
  });
});

describe('freio de emergência · ia_ativa', () => {
  it('só um false EXPLÍCITO corta o webhook', () => {
    expect(webhookDesligado({ cfg: { ia_ativa: false } })).toBe(true);
    expect(webhookDesligado({ cfg: { ia_ativa: true } })).toBe(false);
  });

  it('⚠️⚠️ FAIL-OPEN de propósito — direção OPOSTA à do outro freio', () => {
    // Este corta o webhook INTEIRO, inclusive o registrarInbound. Fechar em
    // caso de falha faria a mensagem da pessoa não aparecer no inbox.
    expect(webhookDesligado({ cfg: null })).toBe(false);
    expect(webhookDesligado({})).toBe(false);
  });

  it('as duas direções são OPOSTAS no mesmo cenário de falha', () => {
    const semConfig = { cfg: null };
    expect(botPodeResponder(semConfig)).toBe(false);   // não responde
    expect(webhookDesligado(semConfig)).toBe(false);   // mas não corta o inbox
  });
});
