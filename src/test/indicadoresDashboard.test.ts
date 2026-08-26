// ⚠️ As duas listas de indicadores do Dashboard Semanal são ESPELHOS:
//   backend/routes/dashboardSemanal.js  → INDICADORES (objeto)  · quem valida
//   src/pages/DashboardSemanal.jsx      → INDICADORES (array)   · quem oferece
// Divergir dá um de dois estragos silenciosos: chave só no front vira 400 ao
// escolher o indicador, e chave só no backend fica invisível pra sempre.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = process.cwd();

function chavesBackend(): string[] {
  const src = readFileSync(join(RAIZ, 'backend', 'routes', 'dashboardSemanal.js'), 'utf8');
  const bloco = src.slice(src.indexOf('const INDICADORES = {'));
  const fim = bloco.indexOf('\n};');
  return [...bloco.slice(0, fim).matchAll(/^\s{2}([a-z_]+):\s*\{/gm)].map(m => m[1]);
}

function chavesFront(): string[] {
  const src = readFileSync(join(RAIZ, 'src', 'pages', 'DashboardSemanal.jsx'), 'utf8');
  const bloco = src.slice(src.indexOf('export const INDICADORES = ['));
  const fim = bloco.indexOf('\n];');
  return [...bloco.slice(0, fim).matchAll(/key:\s*'([a-z_]+)'/g)].map(m => m[1]);
}

describe('indicadores do Dashboard Semanal', () => {
  const back = chavesBackend();
  const front = chavesFront();

  it('as duas listas foram lidas (o varredor não pode virar no-op)', () => {
    expect(back.length).toBeGreaterThan(8);
    expect(front.length).toBeGreaterThan(8);
  });

  it('⚠️ toda chave do front existe no backend (senão o servidor recusa com 400)', () => {
    expect(front.filter(k => !back.includes(k))).toEqual([]);
  });

  it('⚠️ toda chave do backend é oferecida no front (senão fica invisível)', () => {
    expect(back.filter(k => !front.includes(k))).toEqual([]);
  });

  it('o indicador de views totais da live está nos dois', () => {
    expect(back).toContain('online_views_live');
    expect(front).toContain('online_views_live');
  });
});
