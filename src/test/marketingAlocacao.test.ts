import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const A = require('../../backend/utils/marketingAlocacao.js');

const PEDRO = '11111111-1111-4111-8111-111111111111';
const LORENA = '22222222-2222-4222-8222-222222222222';

function base(extra = {}) {
  return {
    titulo: 'Arte do evento',
    atribuido_a: LORENA,
    prioridade: 'normal',
    descricao: 'Post pro feed e stories',
    prazo_entrega: '2027-02-20',
    itens: [{ texto: 'Post feed', esforco_valor: 3, prazo: '2027-02-10' }],
    ...extra,
  };
}

describe('alocar pedido (modo pendente) · o Pedro sempre etiqueta', () => {
  it('pedido completo passa e a subtarefa herda o responsável da tarefa', () => {
    const r = A.validarNovaTarefa(base());
    expect(r.erro).toBeUndefined();
    expect(r.itens[0].membro_id).toBe(LORENA);
    expect(r.card.data_fim).toBe('2027-02-10');
    expect(r.prazo_entrega).toBe('2027-02-20');
  });
  it('sem prioridade, sem descrição ou sem entrega final é recusado', () => {
    expect(A.validarNovaTarefa(base({ prioridade: undefined })).erro).toMatch(/prioridade/);
    expect(A.validarNovaTarefa(base({ descricao: '  ' })).erro).toMatch(/espera/);
    expect(A.validarNovaTarefa(base({ prazo_entrega: undefined })).erro).toMatch(/entrega final/);
  });
  it('subtarefa sem esforço ou sem prazo é recusada', () => {
    expect(A.validarNovaTarefa(base({ itens: [{ texto: 'x', prazo: '2027-02-10' }] })).erro).toMatch(/esforço/);
    expect(A.validarNovaTarefa(base({ itens: [{ texto: 'x', esforco_valor: 2 }] })).erro).toMatch(/prazo/);
  });
  it('DOIS TEMPOS: entrega final antes do último prazo de subtarefa é recusada', () => {
    const r = A.validarNovaTarefa(base({ prazo_entrega: '2027-02-05' }));
    expect(r.erro).toMatch(/não pode ser antes/);
  });
  it('entrega final no MESMO dia do último prazo é aceita', () => {
    expect(A.validarNovaTarefa(base({ prazo_entrega: '2027-02-10' })).erro).toBeUndefined();
  });
  it('esforço em texto não é coagido', () => {
    expect(A.validarNovaTarefa(base({ itens: [{ texto: 'x', esforco_valor: '3', prazo: '2027-02-10' }] })).erro).toBeTruthy();
  });
  it('culto fora da lista é recusado; vazio vira null', () => {
    expect(A.validarNovaTarefa(base({ culto: 'bridge' })).erro).toMatch(/Culto/);
    expect(A.validarNovaTarefa(base({ culto: '' })).card.culto).toBeNull();
    expect(A.validarNovaTarefa(base({ culto: 'kids' })).card.culto).toBe('kids');
  });
});

describe('nova tarefa interna', () => {
  it('não exige descrição nem entrega final', () => {
    const r = A.validarNovaTarefa(base({ descricao: '', prazo_entrega: undefined }), { modo: 'interna' });
    expect(r.erro).toBeUndefined();
    expect(r.prazo_entrega).toBeNull();
  });
});

describe('editar tarefa', () => {
  const atual = {
    atribuido_a: LORENA,
    prazo_entrega: '2027-02-20',
    itens: [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', prazo: '2027-02-10' }, { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', prazo: '2027-02-15' }],
  };
  it('mexer só no título não mexe nas datas', () => {
    const r = A.validarEdicao({ titulo: 'Novo' }, atual);
    expect(r.card).toEqual({ titulo: 'Novo' });
  });
  it('item que não é da tarefa é recusado', () => {
    expect(A.validarEdicao({ atualizar_itens: [{ id: 'zzz', prazo: '2027-02-11' }] }, atual).erro).toMatch(/não pertence/);
  });
  it('adiar subtarefa para depois da entrega final é recusado', () => {
    const r = A.validarEdicao({ atualizar_itens: [{ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', prazo: '2027-03-01' }] }, atual);
    expect(r.erro).toMatch(/não pode ser antes/);
  });
  it('remover o item mais tardio recalcula o fim da produção', () => {
    const r = A.validarEdicao({ remover_itens: ['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'] }, atual);
    expect(r.card.data_fim).toBe('2027-02-10');
  });
  it('item novo herda o responsável novo quando ele muda junto', () => {
    const r = A.validarEdicao({ atribuido_a: PEDRO, novos_itens: [{ texto: 'x', esforco_valor: 1, prazo: '2027-02-12' }] }, atual);
    expect(r.novos[0].membro_id).toBe(PEDRO);
  });
});

describe('carga por pessoa × semana', () => {
  const semanaDe = (d: string) => (d < '2027-01-01' ? 0 : d > '2027-12-31' ? null : Number(d.slice(8, 10)) > 15 ? 7 : 6);
  it('soma horas abertas, converte dias e ignora feito', () => {
    const carga = A.cargaPorSemana([
      { card_id: 'c', membro_id: LORENA, esforco_valor: 3, esforco_unidade: 'horas', prazo: '2027-02-10' },
      { card_id: 'c', membro_id: LORENA, esforco_valor: 1, esforco_unidade: 'dias', prazo: '2027-02-12' },
      { card_id: 'c', membro_id: LORENA, esforco_valor: 5, prazo: '2027-02-12', feito: true },
    ], { semanaDe });
    expect(carga[LORENA][6]).toBe(11);
  });
  it('item sem prazo usa o prazo da tarefa; atrasado cai na semana 1; depois do ano não pesa', () => {
    const carga = A.cargaPorSemana([
      { card_id: 'c', membro_id: LORENA, esforco_valor: 2 },
      { card_id: 'x', membro_id: LORENA, esforco_valor: 4, prazo: '2026-12-20' },
      { card_id: 'x', membro_id: LORENA, esforco_valor: 9, prazo: '2028-01-05' },
    ], { semanaDe, prazoDaTarefa: { c: '2027-02-20' } });
    expect(carga[LORENA]).toEqual({ 7: 2, 1: 4 });
  });
});
