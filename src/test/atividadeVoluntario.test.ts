// Contrato do termômetro de atividade do voluntário (Matheus · 27/08/2026).
// ⚠️ A régua nasceu dentro do endpoint de DETALHE e saiu porque a LISTA passou
// a precisar dela. Duas cópias divergiriam, e o sintoma seria a lista dizer
// "inativo" e a ficha "pouco ativo" sobre a MESMA pessoa.
import { describe, it, expect } from 'vitest';
import { nivelPorDias, ehInativo, diasDesde, LIMIAR_INATIVO_DIAS } from '../../backend/utils/atividadeVoluntario.js';

describe('termômetro de atividade', () => {
  it('os limiares da casa: 30 · 45 · 90', () => {
    expect(nivelPorDias(5, 6).nivel).toBe('muito_ativo');
    expect(nivelPorDias(40).nivel).toBe('ativo');
    expect(nivelPorDias(70).nivel).toBe('pouco_ativo');
    expect(nivelPorDias(120).nivel).toBe('inativo');
  });

  it('⚠️ a fronteira dos 90 dias é INCLUSIVA', () => {
    expect(nivelPorDias(90).nivel).toBe('pouco_ativo');
    expect(nivelPorDias(91).nivel).toBe('inativo');
    expect(LIMIAR_INATIVO_DIAS).toBe(90);
  });

  it('⚠️ sem o VOLUME, o topo é "ativo" — não se afirma "muito ativo" sem contar', () => {
    // A lista não conta serviços (seriam 674 contagens), e omitir o parâmetro
    // NÃO pode rebaixar ninguém para inativo.
    expect(nivelPorDias(5).nivel).toBe('ativo');
    expect(nivelPorDias(5, 2).nivel).toBe('ativo');
    expect(nivelPorDias(5, 4).nivel).toBe('muito_ativo');
  });

  it('⚠️ sem atividade na janela é INATIVO, e o rótulo não diz "nunca serviu"', () => {
    // A lista olha 120 dias: ausência ali prova "90+ sem servir", não prova
    // "nunca serviu". Afirmar o segundo é o erro que já foi cometido com
    // telefone de voluntário (13/08).
    expect(nivelPorDias(null).nivel).toBe('inativo');
    expect(nivelPorDias(null).label).toBe('Inativo');
    expect(ehInativo(null)).toBe(true);
  });

  it('valor inválido não vira "ativo" por acidente', () => {
    expect(nivelPorDias(NaN).nivel).toBe('inativo');
    expect(nivelPorDias(undefined).nivel).toBe('inativo');
  });

  it('diasDesde: sem data devolve null, nunca 0', () => {
    // 0 significaria "serviu hoje" — o oposto de "não sei".
    expect(diasDesde(null)).toBeNull();
    expect(diasDesde('nao-e-data')).toBeNull();
    expect(diasDesde('2026-08-27T12:00:00Z', new Date('2026-08-27T12:00:00Z').getTime())).toBe(0);
    expect(diasDesde('2026-05-27T12:00:00Z', new Date('2026-08-27T12:00:00Z').getTime())).toBe(92);
  });

  it('⚠️ ehInativo concorda com nivelPorDias em toda faixa', () => {
    for (const d of [0, 30, 45, 46, 89, 90, 91, 200, null]) {
      expect(ehInativo(d)).toBe(nivelPorDias(d).nivel === 'inativo');
    }
  });
});
