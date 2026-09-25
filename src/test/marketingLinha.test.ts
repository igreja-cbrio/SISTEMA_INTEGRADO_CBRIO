import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const L = require('../../backend/utils/marketingLinha.js');

const EU = '11111111-1111-4111-8111-111111111111';
const OUTRO = '22222222-2222-4222-8222-222222222222';
const semanas27 = L.semanasDoAno(2027);

describe('semanas · domingo a sábado dentro do ano', () => {
  it('2027: semana 1 = 01/01–02/01 (sexta e sábado), semana 2 começa no domingo', () => {
    expect(semanas27[0]).toEqual({ n: 1, inicio: '2027-01-01', fim: '2027-01-02' });
    expect(semanas27[1]).toEqual({ n: 2, inicio: '2027-01-03', fim: '2027-01-09' });
  });
  it('a última semana termina em 31/12, sem vazar pro ano seguinte', () => {
    expect(semanas27[semanas27.length - 1].fim).toBe('2027-12-31');
    expect(semanas27.length).toBe(53);
  });
  it('data antes do ano = 0 (vem atrasada) · depois = null (fora)', () => {
    expect(L.semanaDe('2026-12-20', semanas27)).toBe(0);
    expect(L.semanaDe('2028-01-01', semanas27)).toBeNull();
    expect(L.semanaDe('2027-01-03', semanas27)).toBe(2);
  });
  it('timestamptz é lido em BRT: domingo 23h do Rio não vira segunda', () => {
    // ⚠️ Força UTC (o gate roda em UTC; em BRT o mutante sem fuso passaria).
    const antes = process.env.TZ;
    process.env.TZ = 'UTC';
    try {
      // 2027-01-03 23:30 BRT = 2027-01-04 02:30 UTC
      expect(L.semanaDe('2027-01-04T02:30:00Z', semanas27)).toBe(2);
      expect(L.dataSP('2027-01-04T02:30:00Z')).toBe('2027-01-03');
    } finally {
      if (antes === undefined) delete process.env.TZ; else process.env.TZ = antes;
    }
  });
  it('domingoDe devolve o domingo da semana civil', () => {
    expect(L.domingoDe('2026-09-30')).toBe('2026-09-27');
    expect(L.domingoDe('2026-09-27')).toBe('2026-09-27');
  });
});

describe('frenteDoCard', () => {
  it('evento → ins · pedido → sis · resto → int', () => {
    expect(L.frenteDoCard({ event_id: 'e', origem: 'evento' })).toBe('ins');
    expect(L.frenteDoCard({ campanha_id: 'c', origem: 'interna' })).toBe('sis');
    expect(L.frenteDoCard({ origem: 'interna' })).toBe('int');
  });
});

describe('recortarCard · quem vê o quê', () => {
  const itens = [{ id: 'a', membro_id: EU }, { id: 'b', membro_id: OUTRO }];
  const base = { nivel: 0, meusMembroIds: [EU] };
  it('líder vê todos os itens de qualquer card, inclusive so_lider', () => {
    const r = L.recortarCard({ card: { visibilidade: 'so_lider' }, itens, ctx: { ...base, lider: true } });
    expect(r.papel).toBe('lider');
    expect(r.itens).toHaveLength(2);
  });
  it('so_lider some para a equipe', () => {
    expect(L.recortarCard({ card: { visibilidade: 'so_lider', atribuido_a: EU }, itens, ctx: { ...base, lider: false } })).toBeNull();
  });
  it('responsável do card vê todas as subtarefas', () => {
    const r = L.recortarCard({ card: { atribuido_a: EU }, itens, ctx: { ...base, lider: false } });
    expect(r.papel).toBe('responsavel');
    expect(r.itens).toHaveLength(2);
  });
  it('os demais só veem os próprios itens', () => {
    const r = L.recortarCard({ card: { atribuido_a: OUTRO }, itens, ctx: { ...base, lider: false } });
    expect(r.papel).toBe('dono');
    expect(r.itens.map((i: any) => i.id)).toEqual(['a']);
  });
  it('sem item seu, o card não aparece', () => {
    expect(L.recortarCard({ card: { atribuido_a: OUTRO }, itens: [{ id: 'b', membro_id: OUTRO }], ctx: { ...base, lider: false } })).toBeNull();
  });
  it('lider_move: o responsável do culto vê, mas não marca', () => {
    const r = L.recortarCard({
      card: { visibilidade: 'lider_move', atribuido_a: OUTRO }, itens,
      ctx: { ...base, lider: false, nivel: 5 }, responsaveisDoCulto: [EU],
    });
    expect(r.papel).toBe('responsavel');
    expect(r.itens.every((i: any) => i.pode_marcar === false)).toBe(true);
  });
  it('lider_move sem ser responsável do culto: não vê', () => {
    expect(L.recortarCard({ card: { visibilidade: 'lider_move', atribuido_a: OUTRO }, itens, ctx: { ...base, lider: false } })).toBeNull();
  });
});

describe('tarefaAberta', () => {
  it('card concluído não está aberto para quem vê o card inteiro', () => {
    expect(L.tarefaAberta({ estado: 'concluido', papel: 'responsavel', itens: [{ feito: false }] })).toBe(false);
  });
  it('quem só vê os próprios itens está em dia quando os DELE estão feitos', () => {
    expect(L.tarefaAberta({ estado: 'producao', papel: 'dono', itens: [{ feito: true }] })).toBe(false);
    expect(L.tarefaAberta({ estado: 'concluido', papel: 'dono', itens: [{ feito: false }] })).toBe(true);
  });
  it('card sem checklist e não concluído está aberto', () => {
    expect(L.tarefaAberta({ estado: 'backlog', papel: 'lider', itens: [] })).toBe(true);
  });
});

describe('statusFrente · pendência só até a semana atual', () => {
  it('aberta no futuro é previsto, não pendência', () => {
    expect(L.statusFrente([{ aberta: true, semana: 20 }], 10)).toMatchObject({ status: 'verde', pendentes: 0 });
  });
  it('aberta na semana atual pinta vermelho mas não é "atrasada"', () => {
    expect(L.statusFrente([{ aberta: true, semana: 10 }], 10)).toMatchObject({ status: 'vermelho', semanas_atrasadas: [] });
  });
  it('aberta antes da semana atual entra em semanas_atrasadas', () => {
    expect(L.statusFrente([{ aberta: true, semana: 3 }, { aberta: true, semana: 0 }], 10).semanas_atrasadas).toEqual([0, 3]);
  });
});

describe('tarefasDaRotina', () => {
  const comp = [{ id: 'c1', membro_id: EU, descricao: 'Arte do culto', duracao_h: 4, participantes_ids: [OUTRO], created_at: '2026-01-01' }];
  const semanas26 = L.semanasDoAno(2026);
  it('não cobra semanas antes da Fase 3 existir', () => {
    const t = L.tarefasDaRotina({ compromissos: comp, execucoes: [], semanas: semanas26, ctx: { lider: true, meusMembroIds: [] } });
    expect(t.every((x: any) => x.semana_inicio >= L.ROTINA_DESDE)).toBe(true);
  });
  it('quem não é líder só vê a própria rotina', () => {
    const t = L.tarefasDaRotina({ compromissos: comp, execucoes: [], semanas: semanas26, ctx: { lider: false, meusMembroIds: [OUTRO] } });
    expect(new Set(t.map((x: any) => x.membro_id))).toEqual(new Set([OUTRO]));
  });
  it('execução gravada fecha o item daquela pessoa naquela semana', () => {
    const t = L.tarefasDaRotina({
      compromissos: comp, semanas: semanas26, ctx: { lider: true, meusMembroIds: [] },
      execucoes: [{ compromisso_id: 'c1', membro_id: EU, semana_inicio: '2026-09-27' }],
    });
    const minha = t.find((x: any) => x.membro_id === EU && x.semana_inicio === '2026-09-27');
    const dele = t.find((x: any) => x.membro_id === OUTRO && x.semana_inicio === '2026-09-27');
    expect(minha.aberta).toBe(false);
    expect(dele.aberta).toBe(true);
  });
});
