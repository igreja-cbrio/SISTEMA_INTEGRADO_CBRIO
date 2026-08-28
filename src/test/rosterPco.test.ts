// ⚠️⚠️ POR QUE ESTE ARQUIVO EXISTE (25/08/2026): esta régua DESATIVA PESSOAS.
// Ela decide quem sai do cadastro de voluntários — some do seletor de escala e
// do denominador do KPI. Errar pra um lado esconde voluntário ativo do líder na
// hora de montar a escala; errar pro outro mantém no cadastro gente que a
// própria liderança já deu baixa no Planning Center.
//
// O buraco que ela fecha: o PCO tem baixa PRÓPRIA (`archived` / `status:
// 'inactive'`) e o sync a ignorava — a pessoa continuava vindo no roster, então
// a reconciliação a via como presente. Medido em 25/08: 17 pessoas inativas no
// PCO seguiam ativas aqui.
import { describe, it, expect } from 'vitest';
import { rosterAtivoDoPco, podeDesarquivar } from '../../backend/services/planningCenter.js';

const p = (id: string, extra = {}) => [id, { planning_center_person_id: id, ...extra }] as const;

describe('rosterAtivoDoPco', () => {
  it('pessoa normal do PCO entra como ativa', () => {
    const r = rosterAtivoDoPco(new Map([p('1'), p('2')]));
    expect([...r.pcIds].sort()).toEqual(['1', '2']);
    expect(r.rosterBruto).toBe(2);
  });

  it('⚠️ quem o PCO marcou como inativo NÃO entra em pcIds', () => {
    const r = rosterAtivoDoPco(new Map([p('1'), p('2', { pco_inativo: true })]));
    expect([...r.pcIds]).toEqual(['1']);
  });

  it('⚠️⚠️ o roster BRUTO conta o inativo — é ele que guarda o pull parcial', () => {
    // se a guarda medisse o filtrado, uma rodada em que a liderança deu baixa em
    // muita gente pareceria um pull quebrado e a reconciliação seria pulada
    const r = rosterAtivoDoPco(new Map([p('1'), p('2', { pco_inativo: true }), p('3', { pco_inativo: true })]));
    expect(r.rosterBruto).toBe(3);
    expect(r.pcIds.size).toBe(1);
  });

  it('⚠️ ids viram STRING — o PCO devolve número e o banco guarda texto', () => {
    const r = rosterAtivoDoPco(new Map([[123 as unknown as string, { planning_center_person_id: 123 }]]));
    expect([...r.pcIds]).toEqual(['123']);
  });

  it('⚠️ `pco_inativo` ausente ou false conta como ATIVO — na dúvida ninguém é desativado', () => {
    const r = rosterAtivoDoPco(new Map([p('1'), p('2', { pco_inativo: false }), p('3', { pco_inativo: undefined })]));
    expect(r.pcIds.size).toBe(3);
  });

  it('id vazio é descartado dos dois lados', () => {
    const r = rosterAtivoDoPco(new Map([p('1'), ['', { planning_center_person_id: '' }] as const]));
    expect(r.rosterBruto).toBe(1);
    expect(r.pcIds.size).toBe(1);
  });

  it('aceita objeto simples e entrada vazia sem quebrar', () => {
    expect(rosterAtivoDoPco({ a: { pco_inativo: false } }).pcIds.size).toBe(1);
    expect(rosterAtivoDoPco(new Map()).rosterBruto).toBe(0);
    expect(rosterAtivoDoPco(null as never).rosterBruto).toBe(0);
  });
});

// ⚠️⚠️ Sem esta guarda a limpeza de base se DESFAZ SOZINHA em uma hora: quem
// foi arquivado à mão continua no roster do PCO (768 `active` medidos em
// 25/08), e o cron horário o traria de volta — em silêncio.
describe('podeDesarquivar', () => {
  const roster = new Set(['1', '2']);

  it('quem voltou pro roster do PCO é desarquivado', () => {
    expect(podeDesarquivar({ planning_center_id: '1' }, roster)).toBe(true);
  });

  it('⚠️⚠️ quem foi arquivado À MÃO fica arquivado, mesmo estando no roster', () => {
    expect(podeDesarquivar({ planning_center_id: '1', arquivado_manual: true }, roster)).toBe(false);
  });

  it('quem não está no roster não volta', () => {
    expect(podeDesarquivar({ planning_center_id: '99' }, roster)).toBe(false);
  });

  it('⚠️ coluna AUSENTE (migration não aplicada) = comportamento antigo, o PCO manda', () => {
    expect(podeDesarquivar({ planning_center_id: '1' }, roster)).toBe(true);
    expect(podeDesarquivar({ planning_center_id: '1', arquivado_manual: undefined }, roster)).toBe(true);
    expect(podeDesarquivar({ planning_center_id: '1', arquivado_manual: false }, roster)).toBe(true);
  });

  it('⚠️ só o booleano TRUE trava — string "true" vinda de payload não conta', () => {
    expect(podeDesarquivar({ planning_center_id: '1', arquivado_manual: 'true' as never }, roster)).toBe(true);
  });

  it('id numérico casa com o roster em string', () => {
    expect(podeDesarquivar({ planning_center_id: 1 as never }, roster)).toBe(true);
  });

  it('perfil sem planning_center_id ou nulo não quebra', () => {
    expect(podeDesarquivar({ planning_center_id: null }, roster)).toBe(false);
    expect(podeDesarquivar(null as never, roster)).toBe(false);
  });
});
