import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const require = createRequire(import.meta.url);
const r = require('../../backend/utils/marketingChecklist.js');

const EU = '11111111-1111-4111-8111-111111111111';
const OUTRO = '22222222-2222-4222-8222-222222222222';

describe('ehLider · habilidade, nunca nível', () => {
  it('coordenador é líder', () => expect(r.ehLider({ role: 'assistente', habilidades: ['coordenador'] })).toBe(true));
  it('admin/diretor são líder', () => {
    expect(r.ehLider({ role: 'admin', habilidades: [] })).toBe(true);
    expect(r.ehLider({ role: 'diretor' })).toBe(true);
  });
  it('designer com nível 5 NÃO é líder', () => expect(r.ehLider({ role: 'assistente', habilidades: ['designer'] })).toBe(false));
});

describe('podeMarcarItem', () => {
  const base = { lider: false, nivel: 0, meusMembroIds: [EU] };
  it('dono do item marca mesmo sem nível 3', () => {
    expect(r.podeMarcarItem({ ...base, item: { membro_id: EU }, card: { visibilidade: 'equipe', atribuido_a: OUTRO } })).toBe(true);
  });
  it('responsável do card marca item de outro', () => {
    expect(r.podeMarcarItem({ ...base, item: { membro_id: OUTRO }, card: { visibilidade: 'equipe', atribuido_a: EU } })).toBe(true);
  });
  it('nível 3 continua marcando (o Kanban de hoje não muda)', () => {
    expect(r.podeMarcarItem({ lider: false, nivel: 3, meusMembroIds: [], item: {}, card: { visibilidade: 'equipe' } })).toBe(true);
  });
  it('quem não é dono, nem responsável, nem nível 3 não marca', () => {
    expect(r.podeMarcarItem({ ...base, nivel: 1, item: { membro_id: OUTRO }, card: { visibilidade: 'equipe', atribuido_a: OUTRO } })).toBe(false);
  });
  it('lider_move: nem o responsável nem nível 5 marcam — só o líder', () => {
    const card = { visibilidade: 'lider_move', atribuido_a: EU };
    expect(r.podeMarcarItem({ lider: false, nivel: 5, meusMembroIds: [EU], item: { membro_id: EU }, card })).toBe(false);
    expect(r.podeMarcarItem({ lider: true, nivel: 0, meusMembroIds: [], item: {}, card })).toBe(true);
  });
  it('so_lider: só o líder', () => {
    expect(r.podeMarcarItem({ lider: false, nivel: 5, meusMembroIds: [EU], item: { membro_id: EU }, card: { visibilidade: 'so_lider' } })).toBe(false);
  });
  it('card sem visibilidade vale como equipe', () => {
    expect(r.podeMarcarItem({ ...base, item: { membro_id: EU }, card: {} })).toBe(true);
  });
});

describe('podeEditarItem', () => {
  it('nível 3 edita em card da equipe', () => expect(r.podeEditarItem({ lider: false, nivel: 3, card: { visibilidade: 'equipe' } })).toBe(true));
  it('dono sem nível 3 não edita a estrutura', () => expect(r.podeEditarItem({ lider: false, nivel: 1, card: { visibilidade: 'equipe' } })).toBe(false));
  it('card do líder: só o líder edita', () => {
    expect(r.podeEditarItem({ lider: false, nivel: 5, card: { visibilidade: 'lider_move' } })).toBe(false);
    expect(r.podeEditarItem({ lider: true, nivel: 0, card: { visibilidade: 'so_lider' } })).toBe(true);
  });
});

describe('camposSubtarefa · erro, nunca coerção', () => {
  it('aceita esforço em horas e em dias', () => {
    expect(r.camposSubtarefa({ esforco_valor: 2.5, esforco_unidade: 'dias' }).campos)
      .toEqual({ esforco_valor: 2.5, esforco_unidade: 'dias' });
  });
  it('unidade fora da lista é erro', () => expect(r.camposSubtarefa({ esforco_unidade: 'dia' }).erro).toBeTruthy());
  it('esforço em texto é erro (não vira número)', () => expect(r.camposSubtarefa({ esforco_valor: '2' }).erro).toBeTruthy());
  it('esforço negativo é erro', () => expect(r.camposSubtarefa({ esforco_valor: -1 }).erro).toBeTruthy());
  it('prazo AAAA-MM-DD passa; outro formato é erro', () => {
    expect(r.camposSubtarefa({ prazo: '2026-10-05' }).campos.prazo).toBe('2026-10-05');
    expect(r.camposSubtarefa({ prazo: '05/10/2026' }).erro).toBeTruthy();
  });
  it('prazo vazio limpa', () => expect(r.camposSubtarefa({ prazo: '' }).campos.prazo).toBeNull());
  it('membro inválido é erro; vazio vira null', () => {
    expect(r.camposSubtarefa({ membro_id: 'x' }).erro).toBeTruthy();
    expect(r.camposSubtarefa({ membro_id: '' }).campos.membro_id).toBeNull();
  });
  it('exige_registro precisa ser booleano de verdade', () => expect(r.camposSubtarefa({ exige_registro: 'true' }).erro).toBeTruthy());
  it('registro em branco vira null', () => expect(r.camposSubtarefa({ registro: '   ' }).campos.registro).toBeNull());
  it('campo ausente não entra', () => expect(r.camposSubtarefa({}).campos).toEqual({}));
});

describe('faltaRegistro', () => {
  it('item de registro não fecha sem texto', () => expect(r.faltaRegistro({ exigeRegistro: true, feito: true, registro: ' ' })).toBe(true));
  it('com texto fecha', () => expect(r.faltaRegistro({ exigeRegistro: true, feito: true, registro: 'Conceito X' })).toBe(false));
  it('item comum fecha sem texto', () => expect(r.faltaRegistro({ exigeRegistro: false, feito: true, registro: null })).toBe(false));
  it('reabrir nunca é bloqueado', () => expect(r.faltaRegistro({ exigeRegistro: true, feito: false, registro: null })).toBe(false));
});

describe('camposCardLider', () => {
  it('valores válidos passam', () => {
    expect(r.camposCardLider({ culto: 'kids', prioridade: 'alta', visibilidade: 'lider_move' }).campos)
      .toEqual({ culto: 'kids', prioridade: 'alta', visibilidade: 'lider_move' });
  });
  it('valor fora da lista é erro', () => {
    expect(r.camposCardLider({ culto: 'sede' }).erro).toBeTruthy();
    expect(r.camposCardLider({ visibilidade: null }).erro).toBeTruthy();
  });
});

describe('a régua fica fora do banco e a rota a usa', () => {
  const util = readFileSync(resolve(__dirname, '../../backend/utils/marketingChecklist.js'), 'utf8');
  const rota = readFileSync(resolve(__dirname, '../../backend/routes/marketing.js'), 'utf8');
  it('util não importa supabase', () => expect(util).not.toMatch(/require\([^)]*supabase/));
  it('PATCH do checklist confere quem marca e o registro', () => {
    expect(rota).toContain('regraSubtarefa.podeMarcarItem');
    expect(rota).toContain('regraSubtarefa.faltaRegistro');
    expect(rota).toContain('update.concluido_por = req.user.userId');
  });
  it('PATCH do card grava atualizado_por', () => expect(rota).toContain('update.atualizado_por = req.user.userId'));
});
