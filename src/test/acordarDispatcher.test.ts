import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { decidirAcordar, MOTIVO } = require('../../backend/utils/acordarDispatcher.js');

const A = 'aaaaaaaa-0000-0000-0000-000000000001';
const B = 'bbbbbbbb-0000-0000-0000-000000000002';

describe('decidirAcordar · quando a Vercel empurra o dispatcher do worker', () => {
  it('acorda quando há tarefa que o dispatcher pegaria', () => {
    const r = decidirAcordar({ tarefas: [A] });
    expect(r.acordar).toBe(true);
    expect(r.motivo).toBe(MOTIVO.HA_TRABALHO);
    expect(r.elegiveis).toEqual([A]);
  });

  it('board vazio NÃO acorda — é o que impede o keepalive', () => {
    const r = decidirAcordar({ tarefas: [] });
    expect(r.acordar).toBe(false);
    expect(r.motivo).toBe(MOTIVO.SEM_TAREFA);
  });

  // ⚠️⚠️ O caso que evita o keepalive PERMANENTE: tarefa bloqueada por ambiente
  // fica `agendada` para sempre. Sem esta guarda, cada tique de 5 min acordaria
  // o container por uma tarefa que não pode andar.
  it('tarefa bloqueada por ambiente NÃO acorda, e o adiamento é DECLARADO', () => {
    const r = decidirAcordar({ tarefas: [A], bloqueadas: [A] });
    expect(r.acordar).toBe(false);
    expect(r.motivo).toBe(MOTIVO.AMBIENTE_BLOQUEADO);
    expect(r.adiadas).toEqual([A]);
    expect(r.elegiveis).toEqual([]);
  });

  it('uma livre entre bloqueadas ACORDA, e a bloqueada continua declarada', () => {
    const r = decidirAcordar({ tarefas: [A, B], bloqueadas: [A] });
    expect(r.acordar).toBe(true);
    expect(r.elegiveis).toEqual([B]);
    expect(r.adiadas).toEqual([A]);
  });

  // ⚠️ FAIL-CLOSED: acordar é uma chamada que LIGA um container.
  it('entrada malformada não acorda', () => {
    for (const ruim of [undefined, null, 'x', 42, {}]) {
      const r = decidirAcordar({ tarefas: ruim as never });
      expect(r.acordar).toBe(false);
      expect(r.motivo).toBe(MOTIVO.ENTRADA_INVALIDA);
    }
    expect(decidirAcordar().acordar).toBe(false);
  });

  it('id que não é id não vira tarefa, e id repetido conta uma vez', () => {
    expect(decidirAcordar({ tarefas: [null, '', '   ', 7] as never }).motivo).toBe(MOTIVO.SEM_TAREFA);
    expect(decidirAcordar({ tarefas: [A, A, A] }).elegiveis).toEqual([A]);
  });

  it('bloqueadas malformada não derruba nem bloqueia por engano', () => {
    const r = decidirAcordar({ tarefas: [A], bloqueadas: 'nao-e-lista' as never });
    expect(r.acordar).toBe(true);
  });
});

// ⚠️⚠️ ESPELHO. O filtro do lado da Vercel tem de ser o MESMO do dispatcher do
// worker: divergir acorda o container por tarefa que ele não pega (custo à toa)
// ou deixa de acordar por tarefa que ele pegaria (a retentativa some).
// ⚠️ Comentário sai dos DOIS lados antes de casar — o comentário deste guard e o
// do serviço CITAM o filtro, e sem limpar eles seriam a própria evidência
// (armadilha registrada em 06/08).
function semComentarios(src: string): string {
  return src
    .split('\n')
    .map((l) => l.replace(/(^|[^:])\/\/[^\n]*/, '$1'))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('o filtro de tarefa é espelho do devDispatcher do worker', () => {
  const worker = semComentarios(readFileSync('agent-worker/src/agents/devDispatcher.ts', 'utf8'));
  const erp = semComentarios(readFileSync('backend/services/diagnosticoResolver.js', 'utf8'));

  for (const pedaco of [
    '"agent_tarefas"',
    'developer_agent',
    'status.eq.agendada',
    'status.eq.nova,classe.eq.bug',
    'deleted_at',
  ]) {
    it(`os dois lados filtram por ${pedaco}`, () => {
      const alvo = pedaco.replace(/"/g, '');
      expect(worker.includes(alvo)).toBe(true);
      expect(erp.includes(alvo)).toBe(true);
    });
  }
});
