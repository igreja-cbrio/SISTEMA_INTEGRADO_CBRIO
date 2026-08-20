import { describe, it, expect } from 'vitest';
import { decidirReconciliacao } from '../../backend/utils/volSyncIntegrity';

/**
 * ⚠️ O incidente de 17–20/08/2026: o sync devolveu 0 cultos e 0 escalas em
 * TODA rodada por três dias, sempre gravando status 'success'. Voluntários
 * escalados no Planning Center pararam de aparecer no sistema e ninguém
 * percebeu, porque o log dizia que estava tudo bem.
 */
describe('a rodada de sync tem que se declarar', () => {
  // Espelho da régua de `backend/routes/voluntariado-sync.js`.
  const statusDaRodada = (r: any) => {
    const falhas = Number(r?.tiposComFalha || 0);
    const total = Number(r?.tiposTotal || 0);
    if (falhas > 0 && total > 0 && falhas >= total) return 'error';
    if (falhas > 0) return 'partial';
    if (!r?.services) return 'partial';
    return 'success';
  };

  it('⚠️ o caso que passou três dias escondido: tudo falhou e o log dizia sucesso', () => {
    expect(statusDaRodada({ services: 0, schedules: 0, tiposComFalha: 7, tiposTotal: 7 })).toBe('error');
  });

  it('⚠️ zero culto SEM falha declarada também não é sucesso', () => {
    // Ou a janela não tem culto, ou algo quebrou em silêncio. Quem lê o log
    // precisa enxergar a diferença entre isso e uma rodada boa.
    expect(statusDaRodada({ services: 0, tiposComFalha: 0, tiposTotal: 7 })).toBe('partial');
  });

  it('falha parcial é parcial, não sucesso nem erro', () => {
    expect(statusDaRodada({ services: 18, tiposComFalha: 2, tiposTotal: 7 })).toBe('partial');
  });

  it('rodada boa continua sucesso', () => {
    expect(statusDaRodada({ services: 22, schedules: 460, tiposComFalha: 0, tiposTotal: 7 })).toBe('success');
  });

  it('o histórico não tem contador de tipos e ainda assim se declara', () => {
    expect(statusDaRodada({ services: 30 })).toBe('success');
    expect(statusDaRodada({ services: 0 })).toBe('partial');
  });
});

describe('roster incompleto trava o arquivamento, não a entrada', () => {
  it('⚠️ com tipo falhando, a reconciliação NÃO roda', () => {
    // É a proteção que o PR #2524 quis criar, e ela continua de pé — só que
    // agora sem impedir as escalas de entrarem.
    const d = decidirReconciliacao({ tiposComFalha: 1, pessoasCompletas: true });
    expect(d.podeReconciliar).toBe(false);
    expect(d.motivo).toBe('tipos_de_servico_com_falha');
  });

  it('com tudo íntegro, a reconciliação roda', () => {
    expect(decidirReconciliacao({ tiposComFalha: 0, pessoasCompletas: true }).podeReconciliar).toBe(true);
  });
});
