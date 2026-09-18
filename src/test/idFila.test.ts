// O id da fila de propostas dos agentes é INTEIRO, não UUID.
//
// ⚠️⚠️ O que estes testes protegem, em ordem de dano:
//   1. ⚠️⚠️ o botão "Aprovar" da fila do /assistente-ia voltar a recusar TODO
//      clique com 400 "ID inválido" — foi o que aconteceu desde sempre até
//      02/09/2026 (440 propostas na história, ZERO aplicadas), porque a rota
//      validava `isValidUUID` numa coluna `integer DEFAULT nextval(...)`;
//   2. lixo não-numérico chegar ao PostgREST e virar 22P02 traduzido como
//      "Erro" genérico (era o caso do Rejeitar, que não validava nada);
//   3. a validação aceitar coisa que o banco depois recusa — `Number('+7')` é
//      7 e `parseInt('12abc')` é 12, então os dois atalhos óbvios furam.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { idFila } = require('../../backend/utils/idFila.js');

describe('idFila · aceita id de fila', () => {
  it('⚠️⚠️ os ids REAIS de produção passam (a fila usa 1, 439, 440…)', () => {
    for (const v of ['1', '8', '433', '439', '440']) {
      expect(idFila(v)).toBe(Number(v));
    }
  });

  it('devolve NÚMERO, não string — é o valor que vai no .eq() do PostgREST', () => {
    expect(idFila('440')).toStrictEqual(440);
  });

  it('número inteiro positivo também passa (chamada interna)', () => {
    expect(idFila(440)).toBe(440);
  });
});

describe('idFila · recusa o que o banco recusaria', () => {
  it('⚠️ zero e negativo não são id de sequência', () => {
    for (const v of ['0', '-1', '-440', 0, -3]) expect(idFila(v)).toBeNull();
  });

  it('⚠️ fracionário e notação científica (o banco daria 22P02)', () => {
    for (const v of ['1.5', '1e3', '4.0', 1.5]) expect(idFila(v)).toBeNull();
  });

  it('⚠️⚠️ sinal e sufixo: os dois atalhos óbvios furariam', () => {
    // Number('+7') === 7 · parseInt('12abc') === 12 — nenhum dos dois pode passar.
    for (const v of ['+7', '12abc', '7px', '1,5']) expect(idFila(v)).toBeNull();
  });

  it('⚠️ espaço em volta não é aceito (Number(" 7") é 7)', () => {
    for (const v of [' 7', '7 ', '  ', '\t9']) expect(idFila(v)).toBeNull();
  });

  it('vazio, nulo e tipo errado', () => {
    for (const v of ['', null, undefined, {}, [], true, NaN]) expect(idFila(v)).toBeNull();
  });

  it('⚠️ acima do inteiro seguro do JS não passa (perderia precisão)', () => {
    expect(idFila('9007199254740993')).toBeNull();
    expect(idFila('99999999999999999999')).toBeNull();
  });

  it('⚠️ uuid NÃO é id de fila — é o inverso exato do bug', () => {
    expect(idFila('9d0a7f1e-4b2c-4d3e-8f1a-2b3c4d5e6f70')).toBeNull();
  });
});

describe('⚠️⚠️ guarda estática · as rotas da fila não podem validar UUID', () => {
  // Sem comentário: este próprio arquivo e o `agents.js` CITAM `isValidUUID` na
  // explicação, e casar no texto cru daria falso positivo (a armadilha de
  // 06/08 e de 10/08, que já mordeu duas vezes neste repo).
  const semComentarios = (src: string) => src
    .split('\n')
    .map((l) => l.replace(/(^|[^:])\/\/[^\n]*/, '$1'))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  // ⚠️ `__dirname` + join, como as outras guardas estáticas do repo: sob o
  // ambiente do vitest o `import.meta.url` não é file:// e o readFileSync
  // estoura ("The URL must be of scheme file").
  const fonte = semComentarios(
    readFileSync(join(__dirname, '..', '..', 'backend', 'routes', 'agents.js'), 'utf8'),
  );

  const corpoDaRota = (assinatura: string) => {
    const i = fonte.indexOf(assinatura);
    expect(i, `rota não encontrada: ${assinatura}`).toBeGreaterThan(-1);
    // Até a próxima declaração de rota, que é onde o handler termina.
    const resto = fonte.slice(i + assinatura.length);
    const fim = resto.search(/\nrouter\.(get|post|patch|put|delete)\(/);
    return fim === -1 ? resto : resto.slice(0, fim);
  };

  const ROTAS = [
    "router.post('/queue/:id/apply'",
    "router.patch('/queue/:id/approve'",
    "router.patch('/queue/:id/reject'",
  ];

  it('⚠️⚠️ nenhuma valida isValidUUID (a coluna é integer)', () => {
    for (const r of ROTAS) {
      expect(corpoDaRota(r), `${r} voltou a validar UUID`).not.toContain('isValidUUID');
    }
  });

  it('⚠️ todas as três validam com idFila — inclusive o Rejeitar', () => {
    for (const r of ROTAS) {
      expect(corpoDaRota(r), `${r} sem validação de id`).toContain('idFila(req.params.id)');
    }
  });

  it('⚠️ e o id validado é o que vai pro banco, não o req.params cru', () => {
    for (const r of ROTAS) {
      const corpo = corpoDaRota(r);
      expect(corpo, `${r} usa req.params.id no .eq()`).not.toMatch(/\.eq\('id',\s*req\.params\.id\)/);
      expect(corpo).toMatch(/\.eq\('id',\s*propostaId\)/);
    }
  });

  it('⚠️ as rotas de /runs/:id CONTINUAM validando UUID (agent_runs é uuid)', () => {
    // Não é simetria estética: trocar a validação lá reintroduziria o bug
    // espelhado, aceitando inteiro numa coluna uuid.
    for (const r of ["router.get('/runs/:id'", "router.post('/runs/:id/cancel'"]) {
      expect(corpoDaRota(r)).toContain('isValidUUID');
    }
  });
});
