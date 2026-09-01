import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const { deveAvisar, AVISAM, SILENCIOSOS } = require_('../../backend/utils/mlAvisoEntrega.js');

// Decisão do Matheus (19/08/2026), opção B: avisar só no "saiu para entrega" e
// no "entregue". Os 7 estados do ML virariam ~7 mensagens por compra.

describe('deveAvisar · o que chega no celular de quem pediu', () => {
  it('avisa quando o pedido SAI', () => {
    expect(deveAvisar('shipped')).toBe(true);
    expect(deveAvisar('out_for_delivery')).toBe(true);
  });

  it('avisa quando é ENTREGUE', () => {
    expect(deveAvisar('delivered')).toBe(true);
  });

  it('⚠️ avisa nas EXCEÇÕES — silenciar problema é pior que excesso', () => {
    expect(deveAvisar('not_delivered')).toBe(true);
    expect(deveAvisar('cancelled')).toBe(true);
  });

  it('NÃO avisa nos intermediários (ficam só na linha do tempo)', () => {
    for (const s of ['pending', 'handling', 'ready_to_ship', 'in_transit']) {
      expect(deveAvisar(s)).toBe(false);
    }
  });

  it('⚠️ status DESCONHECIDO avisa (fail-open)', () => {
    // O ML acrescenta estado sem avisar ninguém. Custo assimétrico: mensagem a
    // mais é incômodo; entrega falha que ninguém soube é prejuízo.
    expect(deveAvisar('estado_que_o_ml_inventou')).toBe(true);
  });

  it('sem status não avisa', () => {
    expect(deveAvisar('')).toBe(false);
    expect(deveAvisar(null)).toBe(false);
    expect(deveAvisar(undefined)).toBe(false);
    expect(deveAvisar('   ')).toBe(false);
  });

  it('tolera caixa e espaços do payload', () => {
    expect(deveAvisar(' DELIVERED ')).toBe(true);
    expect(deveAvisar('Ready_To_Ship')).toBe(false);
  });

  it('as duas listas não se sobrepõem', () => {
    for (const s of AVISAM) expect(SILENCIOSOS.has(s)).toBe(false);
  });

  it('⚠️ shipped e out_for_delivery avisam os DOIS — nem todo vendedor emite o segundo', () => {
    expect(deveAvisar('shipped') && deveAvisar('out_for_delivery')).toBe(true);
  });
});
