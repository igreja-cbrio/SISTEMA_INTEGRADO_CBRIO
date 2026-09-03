import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { modoIntegracao } from '../lib/integracaoAbas';

describe('modoIntegracao · a porta de quem ficou sem item no menu', () => {
  it('com integracao, a página é a de sempre', () => {
    const m = modoIntegracao({ integracao: 1, next: 0, batismo: 0 });
    expect(m.restrito).toBe(false);
    expect(m.abaInicial).toBe('frequencia');
  });

  it('só Next abre na aba Next (comportamento que já existia)', () => {
    const m = modoIntegracao({ integracao: 0, next: 3, batismo: 0 });
    expect(m).toMatchObject({ restrito: true, abaInicial: 'next', soNext: true, soBatismo: false });
  });

  // ⚠️⚠️ O caso que motivou a mudança: cargo "Responsável de Batismo"
  // (batismo 3 · integracao 0 · sem área · role assistente · 1 pessoa ATIVA).
  // Sem isto, tirar o item do menu a deixaria sem porta nenhuma.
  it('só Batismo abre na aba Batismos', () => {
    const m = modoIntegracao({ integracao: 0, next: 0, batismo: 3 });
    expect(m).toMatchObject({ restrito: true, abaInicial: 'batismos', soNext: false, soBatismo: true });
  });

  // ⚠️ Precedência PRESERVA o comportamento anterior — mudar trocaria a tela de
  // abertura de alguém sem ninguém ter pedido.
  it('tendo os dois sem integracao, Next vence', () => {
    const m = modoIntegracao({ integracao: 0, next: 1, batismo: 5 });
    expect(m.abaInicial).toBe('next');
    expect(m.soBatismo).toBe(false);
  });

  it('integracao vence os dois', () => {
    expect(modoIntegracao({ integracao: 5, next: 5, batismo: 5 }).restrito).toBe(false);
  });

  // ⚠️ FAIL-CLOSED: sem módulo nenhum o ModuleGuard barra antes; se chegar, não
  // pode ver a Integração inteira.
  it('sem módulo nenhum não abre a Integração inteira', () => {
    for (const n of [{}, null, undefined, { integracao: 0, next: 0, batismo: 0 }]) {
      const m = modoIntegracao(n as never);
      expect(m.restrito).toBe(true);
    }
  });

  it('nível inválido conta como zero', () => {
    const m = modoIntegracao({ integracao: NaN, next: 'x' as never, batismo: 2 });
    expect(m).toMatchObject({ restrito: true, abaInicial: 'batismos' });
  });
});

// ⚠️⚠️ Tirar item do menu é tirar do NAV_ITEMS, NUNCA da rota — o menu é vitrine,
// quem decide acesso é o ModuleGuard. E a rota da Integração virou a porta de
// quem só tem `batismo`.
describe('menu × rota depois de tirar Next e Batismo', () => {
  const semComentarios = (src: string) => src
    .split('\n').map((l) => l.replace(/(^|[^:])\/\/[^\n]*/, '$1')).join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
  const menu = semComentarios(readFileSync('src/components/layout/AppShell.jsx', 'utf8'));
  const app = semComentarios(readFileSync('src/App.tsx', 'utf8'));

  it('os dois itens saíram do menu', () => {
    expect(menu).not.toContain("label: 'Next'");
    expect(menu).not.toContain("label: 'Batismo'");
  });

  it('as ROTAS continuam de pé (link salvo e deep link não podem quebrar)', () => {
    expect(app).toContain('path="/batismo"');
    expect(app).toContain('path="/ministerial/next"');
    expect(app).toContain('path="/ministerial/batismos"');
  });

  it('a rota da Integração aceita quem só tem batismo', () => {
    expect(app).toContain("anyOf={['integracao', 'next', 'batismo']}");
  });
});
