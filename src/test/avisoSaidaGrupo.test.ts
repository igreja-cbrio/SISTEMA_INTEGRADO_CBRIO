import { describe, it, expect } from 'vitest';
import { avisoSaida, avisoPedidoNovo, TIPOS_ROTEADOS_HOJE } from '../../backend/utils/avisoGrupoApp.js';

// ─────────────────────────────────────────────────────────────────────────────
// Pedido da Naná (18/08/2026): nos grupos que ela frequenta, poder SAIR — com
// confirmação. Quem precisa saber é o LÍDER, não o grupo.
// ─────────────────────────────────────────────────────────────────────────────
describe('aviso de saída de grupo', () => {
  const base = { grupoId: 'g1', grupoNome: 'GRUPO DE MENINAS', pessoaNome: 'Natasha Mauerberg', dia: '2026-08-18' };

  it('usa o vocabulário do APP, não o do ERP', () => {
    // ⚠️ `notificar()` emite `pedido_grupo`; o app entende `grupo_pedido` —
    // invertido. Trocar um pelo outro faz o aviso chegar e não abrir tela.
    expect(avisoSaida(base).tipo).toBe('grupo_saida');
    expect(avisoPedidoNovo({ pedidoId: 'p1', grupoId: 'g1' }).tipo).toBe('grupo_pedido');
  });

  it('fala no PRIMEIRO nome, pra caber no título do push', () => {
    expect(avisoSaida(base).titulo).toBe('Natasha saiu do grupo');
  });

  it('⚠️ dedup por (grupo, pessoa, DIA): sair e voltar no mesmo dia não duplica', () => {
    const a = avisoSaida(base);
    const b = avisoSaida({ ...base });
    expect(a.chaveDedup).toBe(b.chaveDedup);
    // …mas sair de novo em outro dia avisa de novo.
    expect(avisoSaida({ ...base, dia: '2026-09-01' }).chaveDedup).not.toBe(a.chaveDedup);
  });

  it('sem grupo ou sem dia devolve null, não aviso quebrado', () => {
    expect(avisoSaida({ ...base, grupoId: null })).toBeNull();
    expect(avisoSaida({ ...base, dia: null })).toBeNull();
  });

  it('grupo sem nome não vira "undefined" no texto', () => {
    expect(avisoSaida({ ...base, grupoNome: null }).body).toBe('Natasha saiu de seu grupo.');
  });

  it('⚠️ o tipo NOVO não está na lista dos roteados de 11/08 — ele entra com o OTA que ensina os 2 mapas', () => {
    expect(TIPOS_ROTEADOS_HOJE).toEqual(['grupo_pedido']);
    expect(TIPOS_ROTEADOS_HOJE).not.toContain('grupo_saida');
  });
});
