// Contrato da cota de 24h da Meta.
// ⚠️ Este arquivo existe por causa do incidente de 26/08/2026: 3 rodadas de 200
// em 48 SEGUNDOS (rodadas 9, 10 e 11 do censo), 600 pessoas, 321 recusadas com
// "Spam Rate limit hit" — e o estrago atingiu os avisos TRANSACIONAIS do dia
// seguinte (grupos_pedido_aprovado_v2, pedido_atualizado, aniversário).
// O teto POR RODADA (200) foi respeitado nas três. Ele nunca poderia proteger.
import { describe, it, expect } from 'vitest';
import { cotaDisponivel, tetoEfetivo, CAPACIDADE_24H, RESERVA_OPERACIONAL } from '../../backend/utils/cotaMeta.js';

describe('cota de 24h da Meta', () => {
  it('⚠️⚠️ a 2ª rodada do incidente de 26/08 é BLOQUEADA', () => {
    // 02:14 saíram 200. Às 02:15 a rodada 10 pediu mais 200.
    const r = tetoEfetivo({ tetoCanal: 200, unicos24h: 200 });
    expect(r.teto).toBe(0);
    expect(r.motivo).toBe('cota_24h_esgotada');
  });

  it('dia limpo: a rodada sai inteira, como antes', () => {
    const r = tetoEfetivo({ tetoCanal: 200, unicos24h: 0 });
    expect(r.teto).toBe(200);
    expect(r.motivo).toBe('teto_do_canal');
  });

  it('⚠️ com a cota parcialmente usada, a rodada ENCOLHE e diz por quê', () => {
    const r = tetoEfetivo({ tetoCanal: 200, unicos24h: 150 });
    expect(r.teto).toBe(50);
    expect(r.motivo).toBe('limitado_pela_cota_24h');
    expect(r.contatados_24h ?? r.unicos_24h).toBe(150);
  });

  it('⚠️⚠️ não conseguir CONTAR não libera nada (fail-CLOSED)', () => {
    // Não saber quanto já saiu é justamente quando disparar é mais perigoso.
    expect(tetoEfetivo({ tetoCanal: 200, unicos24h: null }).teto).toBe(0);
    expect(tetoEfetivo({ tetoCanal: 200 }).teto).toBe(0);
    expect(tetoEfetivo({ tetoCanal: 200, unicos24h: null }).motivo).toBe('nao_deu_pra_conferir_a_cota');
    expect(cotaDisponivel({})).toBe(0);
  });

  it('⚠️⚠️ a RESERVA operacional é intocável por campanha', () => {
    // Campanha espera; "seu pedido de grupo foi aprovado" não. Era essa faixa
    // que morria em 26/08.
    expect(cotaDisponivel({ unicos24h: 0 })).toBe(CAPACIDADE_24H - RESERVA_OPERACIONAL);
    expect(cotaDisponivel({ unicos24h: CAPACIDADE_24H - RESERVA_OPERACIONAL })).toBe(0);
    // mesmo com a cota "cheia" pela conta da Meta, campanha não invade a reserva
    expect(cotaDisponivel({ unicos24h: 210 })).toBe(0);
  });

  it('nunca devolve negativo', () => {
    expect(cotaDisponivel({ unicos24h: 9999 })).toBe(0);
    expect(tetoEfetivo({ tetoCanal: 200, unicos24h: 9999 }).teto).toBe(0);
  });

  it('aceita o texto que o banco devolve', () => {
    expect(cotaDisponivel({ unicos24h: '150' })).toBe(50);
  });

  it('valor absurdo é tratado como zero usado, não como cota infinita', () => {
    expect(cotaDisponivel({ unicos24h: -5 })).toBe(CAPACIDADE_24H - RESERVA_OPERACIONAL);
  });

  it('⚠️ o teto do CANAL continua valendo quando é o menor', () => {
    expect(tetoEfetivo({ tetoCanal: 20, unicos24h: 0 }).teto).toBe(20);
  });
});
