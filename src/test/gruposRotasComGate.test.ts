import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Guarda das rotas de `grupos` que precisam de gate de MÓDULO.
 *
 * ⚠️⚠️ POR QUE ISTO EXISTE (achado de 07/09/2026)
 * `backend/routes/grupos.js` aplica só `router.use(authenticate)` — quem decide
 * o acesso é o `authorizeModule` de cada rota, e 45 das 113 não tinham nenhum.
 * O caso que denunciou: `GET /pedidos/list` devolvia 133 pedidos com NOME,
 * E-MAIL e TELEFONE para QUALQUER conta autenticada — e o auth do Supabase é
 * compartilhado entre o app de membros e o ERP, então "autenticado" é a base
 * inteira de logins, não a equipe.
 *
 * ⚠️ Este teste NÃO cobre as 113 rotas de propósito: as demais 42 sem gate
 * precisam de decisão caso a caso (algumas são self-scoped, como `/meu` e
 * `/supervisao/me`, e fechá-las quebraria líder sem o módulo). Ele fixa as que
 * JÁ foram decididas, para não regredirem.
 */

const ARQ = resolve(__dirname, '../../backend/routes/grupos.js');

/**
 * ⚠️ COMENTÁRIO SAI ANTES DE CASAR. Os comentários deste arquivo CITAM as
 * rotas na explicação — sem remover, o próprio texto explicativo vira a
 * evidência e o teste passa com o gate ausente (armadilha de 06/08/2026).
 * Bloco `/* *​/` só é removido quando abre e fecha na MESMA linha: em JS há
 * `/*` literal dentro de string de rota, e o regex multilinha comeria o
 * arquivo até o próximo fechamento (armadilha de 02/09/2026).
 */
function semComentarios(js: string): string {
  return js
    .split('\n')
    .map((l) => l.replace(/\/\*.*?\*\//g, ''))       // bloco de UMA linha
    .map((l) => l.replace(/(^|[^:])\/\/[^\n]*/, '$1')) // linha (poupa https://)
    .join('\n');
}

const ROTAS_COM_GATE: Array<{ metodo: string; caminho: string; nivel: number; porque: string }> = [
  {
    metodo: 'get', caminho: '/pedidos/list', nivel: 1,
    porque: 'devolve nome, e-mail e telefone de quem pediu para entrar em grupo',
  },
  {
    metodo: 'patch', caminho: '/participacao/:id/presenca', nivel: 2,
    porque: 'incrementa `presencas`, o contador que promove visitante → frequentador',
  },
  {
    metodo: 'post', caminho: '/:id/pedidos', nivel: 3,
    porque: 'cria pedido de entrada EM NOME DE OUTRA PESSOA',
  },
];

describe('grupos.js · rotas que precisam de authorizeModule', () => {
  const limpo = semComentarios(readFileSync(ARQ, 'utf8'));

  // Sanidade do próprio limpador: se ele comesse o arquivo, todo assert abaixo
  // passaria por vacuidade (asserção negativa sobre texto inexistente).
  it('o limpador de comentários não destrói o arquivo', () => {
    expect(limpo).toContain("router.get('/pedidos/list'");
    expect(limpo.length).toBeGreaterThan(readFileSync(ARQ, 'utf8').length * 0.5);
  });

  for (const r of ROTAS_COM_GATE) {
    it(`${r.metodo.toUpperCase()} ${r.caminho} exige grupos >= ${r.nivel} — ${r.porque}`, () => {
      const linha = limpo
        .split('\n')
        .find((l) => l.includes(`router.${r.metodo}('${r.caminho}'`));
      expect(linha, `rota ${r.metodo.toUpperCase()} ${r.caminho} sumiu do arquivo`).toBeTruthy();
      expect(
        linha,
        `${r.metodo.toUpperCase()} ${r.caminho} ficou SEM authorizeModule — ${r.porque}`,
      ).toContain(`authorizeModule('grupos', ${r.nivel})`);
    });
  }

  it('o arquivo continua sem gate global (o gate é por rota — não relaxar)', () => {
    // Se um dia alguém puser `router.use(authorizeModule(...))` no topo, as
    // rotas self-scoped (/meu, /supervisao/me) quebram para líder sem o módulo.
    expect(limpo).not.toMatch(/router\.use\(\s*authorizeModule/);
  });
});
