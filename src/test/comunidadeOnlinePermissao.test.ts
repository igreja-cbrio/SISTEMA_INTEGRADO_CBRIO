// Quem pode gravar o número da comunidade do Online — e o que ele NÃO alcança.
//
// ⚠️⚠️ O que este arquivo protege, em ordem de dano:
//   1. ⚠️⚠️ alguém "simplificar" apontando a tela de volta para
//      `POST /kpis/cultura/mensal`. Aquele endpoint escreve TAMBÉM
//      `qtd_dizimistas`, `qtd_ofertantes`, `freq_presencial_semanal`,
//      `freq_online_semanal`, `decisoes_total` e `freq_grupos_total` — e é
//      `authorize('admin','diretor')`. Abri-lo ao módulo `online` daria à
//      equipe do Online escrita sobre número FINANCEIRO e sobre os overrides
//      que alimentam a mandala inteira;
//   2. a rota estreita crescer e passar a aceitar outras colunas;
//   3. o gate voltar a `isAdmin`, que era o estado anterior e trancava
//      justamente quem sabe o número.
//
// ⚠️ Por que `authorizeModule('online', 3)` alcança a coordenação do Online:
// a MATRIZ dá nível 1 ao cargo "Coord Onl", mas `AREA_MODULO_BOOST` concede
// `Math.max(nivel, 5)` a quem tem a área correspondente em `usuario_areas`.
// Medido em 02/09/2026: renata.martins@cbrio.org tem a área "Online".
// ⚠️ Por isso NÃO se mexeu na matriz — e mexer teria sido pior: `online >= 3`
// na matriz alcança 11 pessoas de Dev/Assist Área/Assist Mini/Supervisor
// Jornada, NENHUMA delas do Online.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = join(__dirname, '..', '..');
const semComentarios = (src: string) => src
  .split('\n')
  .map((l) => l.replace(/(^|[^:])\/\/[^\n]*/, '$1'))
  .join('\n')
  .replace(/\/\*[\s\S]*?\*\//g, '');

const rotaComunidade = () => {
  const src = semComentarios(readFileSync(join(RAIZ, 'backend/routes/online.js'), 'utf8'));
  const i = src.indexOf("router.post('/comunidade-mensal'");
  expect(i, 'rota /comunidade-mensal não encontrada').toBeGreaterThan(-1);
  const resto = src.slice(i);
  const fim = resto.search(/\nrouter\.(get|post|patch|put|delete)\(|\nmodule\.exports/);
  return fim === -1 ? resto : resto.slice(0, fim);
};

describe('⚠️⚠️ a rota estreita não alcança mais nada', () => {
  const COLUNAS_PROIBIDAS = [
    'qtd_dizimistas', 'qtd_ofertantes',
    'freq_presencial_semanal', 'freq_online_semanal',
    'decisoes_total', 'freq_grupos_total', 'observacoes',
  ];

  it('escreve SÓ investir_comunidade_online', () => {
    const corpo = rotaComunidade();
    expect(corpo).toContain('investir_comunidade_online');
    for (const col of COLUNAS_PROIBIDAS) {
      expect(corpo, `a rota passou a tocar ${col}`).not.toContain(col);
    }
  });

  it('⚠️ grava em cultura_mensal e em nenhuma outra tabela', () => {
    const corpo = rotaComunidade();
    const tabelas = [...corpo.matchAll(/\.from\('([^']+)'\)/g)].map((m) => m[1]);
    expect([...new Set(tabelas)]).toEqual(['cultura_mensal']);
  });

  it('⚠️ o corpo do request não é espalhado no payload', () => {
    // `...req.body` reabriria a porta para qualquer coluna.
    const corpo = rotaComunidade();
    expect(corpo).not.toMatch(/\.\.\.\s*req\.body/);
    expect(corpo).not.toMatch(/\.\.\.\s*corpo/);
  });
});

describe('⚠️ o gate é o do MÓDULO, não admin', () => {
  it('a rota usa authorizeModule(online, 3)', () => {
    expect(rotaComunidade()).toMatch(/authorizeModule\('online',\s*3\)/);
  });

  it('⚠️⚠️ NÃO é authorize(admin, diretor) — isso trancava quem sabe o número', () => {
    expect(rotaComunidade()).not.toMatch(/authorize\('admin'/);
  });

  it('a tela espelha o gate do servidor (nada de botão que dá 403)', () => {
    const src = semComentarios(readFileSync(join(RAIZ, 'src/pages/ministerial/Online.tsx'), 'utf8'));
    const i = src.indexOf('function ComunidadeOnlineCard');
    const corpo = src.slice(i, i + 1400);
    expect(corpo).toMatch(/getAccessLevel\?\.\(\['online'\]\) \?\? 0\) >= 3/);
    expect(corpo).toMatch(/if \(!podeSalvar\) return null;/);
  });

  it('⚠️⚠️ a tela NÃO chama mais o endpoint genérico de cultura_mensal', () => {
    const src = semComentarios(readFileSync(join(RAIZ, 'src/pages/ministerial/Online.tsx'), 'utf8'));
    expect(src, 'voltou a usar o endpoint que escreve o mês inteiro')
      .not.toContain('culturaMensalUpsert');
    expect(src).toContain('online.comunidadeMensal(');
  });
});

describe('⚠️ o endpoint genérico continua restrito', () => {
  it('POST /kpis/cultura/mensal segue admin/diretor', () => {
    const src = semComentarios(readFileSync(join(RAIZ, 'backend/routes/kpis.js'), 'utf8'));
    expect(src).toMatch(/router\.post\('\/cultura\/mensal',\s*authorize\('admin',\s*'diretor'\)/);
  });
});
