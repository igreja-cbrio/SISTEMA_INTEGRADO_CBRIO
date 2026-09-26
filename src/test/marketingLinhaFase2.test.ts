import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const require = createRequire(import.meta.url);
const { escolherTemplates } = require('../../backend/utils/templatesCiclo.js');

const ler = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf8').replace(/\r\n/g, '\n')
  .split('\n').map(l => l.replace(/^\s*\/\/[^\n]*/, '')).join('\n');

describe('escolherTemplates · a Série não pode nascer com ciclo vazio', () => {
  const padrao = [{ nome: 'Pré Briefing' }, { nome: 'Briefing' }];
  it('categoria sem etapas próprias usa o criativo padrão', () => {
    expect(escolherTemplates([], padrao)).toEqual({ templates: padrao, origem: 'padrao' });
  });
  it('categoria com etapas próprias (Governança) usa as dela', () => {
    const gov = [{ nome: 'OKR' }];
    expect(escolherTemplates(gov, padrao)).toEqual({ templates: gov, origem: 'categoria' });
  });
  it('nulo não quebra', () => {
    expect(escolherTemplates(null, null)).toEqual({ templates: [], origem: 'padrao' });
  });
});

describe('fiação da Fase 2', () => {
  const cycles = ler('backend/routes/cycles.js');
  const events = ler('backend/routes/events.js');
  const mkt = ler('backend/routes/marketing.js');

  it('a ativação lê os modelos pela régua com fallback, e antes de criar o ciclo', () => {
    const iTpl = cycles.indexOf("lerTemplatesCiclo('cycle_phase_templates'");
    const iCiclo = cycles.indexOf("from('event_cycles')\n      .insert");
    expect(iTpl).toBeGreaterThan(0);
    expect(iCiclo).toBeGreaterThan(iTpl);
    expect(cycles).toContain("lerTemplatesCiclo('adm_task_templates'");
    expect(cycles).not.toMatch(/tplQuery = tplQuery\.eq\('category_id'/);
  });
  it('ciclo sem etapa nenhuma é erro, não ciclo vazio', () => {
    expect(cycles).toContain("if (!templates.length) throw new Error(");
  });
  it('POST /events ativa o ciclo só para categoria com cultos do Marketing', () => {
    expect(events).toContain("from('marketing_categoria_cultos')");
    expect(events).toContain('activateCycleForEvent(ev.id, req.user.userId)');
  });
  it('Kanban e /cards escondem so_lider de quem não é líder', () => {
    const n = (mkt.match(/\.lider \|\| c\.visibilidade !== 'so_lider'/g) || []).length;
    expect(n).toBe(2);
  });
  it('o card nascido da fase ganha os dados da fase no enrichCards', () => {
    expect(mkt).toContain("from('event_cycle_phases')");
    expect(mkt).toContain('faseMap[c.event_phase_id]');
  });
  it('subtarefa padrão usa a mesma régua de esforço da subtarefa real', () => {
    expect(mkt).toMatch(/function camposItemPadrao[\s\S]*regraSubtarefa\.camposSubtarefa/);
  });
});
