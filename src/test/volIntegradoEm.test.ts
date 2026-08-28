// Contrato do carimbo `vol_inscricoes.integrado_em`.
//
// Guarda DUAS coisas que, se regredirem, fazem a tela e o relatório impresso
// afirmarem algo errado sobre uma pessoa:
//   1. sair de 'integrado' limpa o carimbo — em TODOS os caminhos (triagem,
//      desistência e o PATCH do Kids);
//   2. o carimbo é o dia da IGREJA (BRT), não o dia UTC.
//
// Mutantes que este arquivo mata (rodados):
//   - `deveLimparCarimbo` devolvendo true sem olhar o status atual → apaga
//     texto legado da planilha em linha que nunca foi integrada;
//   - trocar `diaIntegracaoBRT` por `toISOString().slice(0,10)` → integração
//     do culto de domingo à noite carimba segunda-feira.

import { describe, it, expect } from 'vitest';
import { deveLimparCarimbo, diaIntegracaoBRT } from '../../backend/utils/volIntegradoEm.js';

describe('deveLimparCarimbo · sair de integrado limpa', () => {
  it('limpa ao voltar pra triagem', () => {
    expect(deveLimparCarimbo('integrado', 'inscrito')).toBe(true);
  });

  it('limpa ao voltar pro ministério', () => {
    expect(deveLimparCarimbo('integrado', 'enviado_ministerio')).toBe(true);
  });

  it('limpa ao registrar desistência de quem estava integrado', () => {
    expect(deveLimparCarimbo('integrado', 'desistente')).toBe(true);
  });

  it('NÃO limpa ao integrar (é quando o carimbo nasce)', () => {
    expect(deveLimparCarimbo('inscrito', 'integrado')).toBe(false);
    expect(deveLimparCarimbo('integrado', 'integrado')).toBe(false);
  });

  // ⚠️ O caso que protege o dado legado: 625 linhas têm "True"/"False" da
  // planilha do Google e outras têm texto livre ("Integrada 19/01") sem nunca
  // terem status 'integrado'. Um "voltar pra triagem" nelas não pode apagar
  // registro histórico da equipe.
  it('NÃO limpa quando a linha nunca foi integrada', () => {
    expect(deveLimparCarimbo('inscrito', 'enviado_ministerio')).toBe(false);
    expect(deveLimparCarimbo('enviado_ministerio', 'inscrito')).toBe(false);
    expect(deveLimparCarimbo('desistente', 'inscrito')).toBe(false);
    expect(deveLimparCarimbo(null, 'inscrito')).toBe(false);
    expect(deveLimparCarimbo(undefined, 'desistente')).toBe(false);
  });

  it('patch sem status (só feedback) não mexe no carimbo', () => {
    expect(deveLimparCarimbo('integrado', undefined)).toBe(false);
    expect(deveLimparCarimbo('integrado', null)).toBe(false);
    expect(deveLimparCarimbo('integrado', '')).toBe(false);
  });
});

describe('diaIntegracaoBRT · o dia é o da igreja', () => {
  it('22h de domingo em BRT ainda é domingo (em UTC já virou segunda)', () => {
    // 2026-08-17 é domingo. 22h BRT = 2026-08-18T01:00:00Z.
    const agora = Date.parse('2026-08-18T01:00:00Z');
    expect(new Date(agora).toISOString().slice(0, 10)).toBe('2026-08-18'); // o erro que evitamos
    expect(diaIntegracaoBRT(agora)).toBe('2026-08-17');
  });

  it('meia-noite UTC ainda é o dia anterior no Rio', () => {
    expect(diaIntegracaoBRT(Date.parse('2026-08-17T00:00:00Z'))).toBe('2026-08-16');
  });

  it('meio-dia BRT bate com o dia UTC', () => {
    expect(diaIntegracaoBRT(Date.parse('2026-08-17T15:00:00Z'))).toBe('2026-08-17');
  });

  it('devolve sempre AAAA-MM-DD', () => {
    expect(diaIntegracaoBRT(Date.parse('2026-01-05T14:00:00Z'))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
