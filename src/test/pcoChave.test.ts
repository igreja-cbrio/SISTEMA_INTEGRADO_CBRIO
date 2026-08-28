import { describe, it, expect } from 'vitest';
import { chavePco } from '../../backend/utils/pcoChave';

/**
 * ⚠️ Esta régua tem uma GÊMEA EM SQL (`fn_vol_pco_chave`, migration
 * 20260816120000). Divergir dela não dá erro em lugar nenhum: o sync não acha
 * o nome no mapa, trata como "time desconhecido" e o voluntário fica SEM
 * EQUIPE. Os casos abaixo são os nomes REAIS que estavam duplicados no banco.
 */
describe('chavePco', () => {
  it('colapsa acento — as duas equipes "Cameras"/"Câmeras" do banco', () => {
    expect(chavePco('Câmeras')).toBe(chavePco('Cameras'));
    expect(chavePco('Projeção')).toBe('projecao');
    expect(chavePco('Integração')).toBe('integracao');
  });

  it('colapsa caixa — "Preletor"/"preletor", "Check-in"/"Check-In", "LIDERANÇA"', () => {
    expect(chavePco('Preletor')).toBe(chavePco('preletor'));
    expect(chavePco('Check-in')).toBe(chavePco('Check-In'));
    expect(chavePco('LIDERANÇA')).toBe('lideranca');
  });

  it('colapsa espaço repetido e apara as pontas', () => {
    expect(chavePco('Broadcast  (  Supervisão  )')).toBe('broadcast ( supervisao )');
    expect(chavePco('  Vocal  ')).toBe('vocal');
  });

  it('NÃO junta nomes que são funções diferentes de verdade', () => {
    // O de-para manda "Projeção Led" e "Projeção" pra funções distintas —
    // se a régua os igualasse, 22 pessoas de LED virariam Projeção comum.
    expect(chavePco('Projeção Led')).not.toBe(chavePco('Projeção'));
    expect(chavePco('Oferta 8:30')).not.toBe(chavePco('Oferta 10:00'));
    expect(chavePco('Câmera 3')).not.toBe(chavePco('Câmera 4'));
  });

  it('aceita vazio/nulo sem estourar (team_name pode vir nulo do PCO)', () => {
    expect(chavePco('')).toBe('');
    expect(chavePco(null)).toBe('');
    expect(chavePco(undefined)).toBe('');
  });
});
