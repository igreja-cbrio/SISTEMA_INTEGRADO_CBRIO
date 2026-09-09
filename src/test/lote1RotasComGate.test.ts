import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Guarda das rotas de ESCRITA fechadas no lote 1 da varredura (achados A06, B01, B02).
 *
 * ⚠️⚠️ POR QUE ISTO EXISTE (varredura de 04–08/09/2026)
 * `events.js`, `projects.js` e `kpisV2.js` aplicam só `router.use(authenticate)`:
 * qualquer conta logada — inclusive as 138 membro-only do app de membros —
 * alterava tarefa, fase, despesa e KPI de ciclo, e aprovava card. Em `kpisV2.js`
 * o POST /registros já checava `kpi_areas`, mas o PUT e o DELETE irmãos não.
 *
 * `permissoes.js` é o caso mais grave: gateava por `authorize('admin','diretor')`,
 * que passa por NÍVEL DE CARGO e não consulta módulo nenhum — a matriz que a
 * própria tela desenha não valia ali. Medido em 08/09: dos 45 cargos, só `Dev` e
 * `Coord Estratégico` têm linha em `permissoes-admin` (ambos nível 5), e havia
 * 9 cargos entrando só pelo nível base.
 */

const raiz = (p: string) => resolve(__dirname, '../../', p);

/**
 * ⚠️ COMENTÁRIO SAI ANTES DE CASAR: os comentários dos próprios arquivos CITAM
 * as rotas, e sem remover o texto explicativo vira a evidência (armadilha de
 * 06/08/2026). Bloco só é removido quando abre e fecha na MESMA linha
 * (armadilha de 02/09/2026).
 */
function semComentarios(js: string): string {
  return js
    .split('\n')
    .map((l) => l.replace(/\/\*.*?\*\//g, ''))
    .map((l) => l.replace(/(^|[^:])\/\/[^\n]*/, '$1'))
    .join('\n');
}

function linhaDaRota(src: string, metodo: string, caminho: string): string | undefined {
  return src.split('\n').find((l) => l.includes(`router.${metodo}('${caminho}'`));
}

const ESCRITA: Array<{ arquivo: string; guarda: string; rotas: Array<[string, string]> }> = [
  {
    arquivo: 'backend/routes/events.js',
    guarda: 'escritaEventos',
    rotas: [
      ['patch', '/:id/status'], ['patch', '/:id/occurrences/:occId'],
      ['post', '/:id/tasks'], ['put', '/tasks/:taskId'], ['patch', '/tasks/:taskId/status'],
      ['post', '/tasks/:taskId/subtasks'], ['patch', '/subtasks/:subId'], ['delete', '/subtasks/:subId'],
      ['post', '/tasks/:taskId/comments'], ['post', '/:id/risks'], ['patch', '/risks/:riskId'],
      ['post', '/:id/retrospective'], ['post', '/:eventId/tasks/:taskId/attachments'],
    ],
  },
  {
    arquivo: 'backend/routes/projects.js',
    guarda: 'escritaProjetos',
    rotas: [
      ['patch', '/tasks/:taskId/status'], ['post', '/tasks/:taskId/subtasks'],
      ['patch', '/subtasks/:subId'], ['post', '/tasks/:taskId/comments'],
      ['patch', '/milestones/:mId/status'], ['patch', '/kpis/:kpiId'],
      ['patch', '/risks/:riskId'], ['patch', '/budget/:itemId'],
    ],
  },
];

describe('lote 1 · rotas de escrita que precisam de gate', () => {
  for (const grupo of ESCRITA) {
    const bruto = readFileSync(raiz(grupo.arquivo), 'utf8');
    const limpo = semComentarios(bruto);

    it(`${grupo.arquivo} · o limpador de comentários não destrói o arquivo`, () => {
      expect(limpo.length).toBeGreaterThan(bruto.length * 0.5);
      expect(limpo).toContain(`const ${grupo.guarda} = authorizeModule(`);
    });

    for (const [metodo, caminho] of grupo.rotas) {
      it(`${grupo.arquivo} · ${metodo.toUpperCase()} ${caminho} exige ${grupo.guarda}`, () => {
        const linha = linhaDaRota(limpo, metodo, caminho);
        expect(linha, `rota ${metodo.toUpperCase()} ${caminho} sumiu de ${grupo.arquivo}`).toBeTruthy();
        expect(linha, `${metodo.toUpperCase()} ${caminho} ficou SEM gate de escrita`).toContain(grupo.guarda);
      });
    }
  }

  it('kpisV2 · PUT e DELETE /registros/:id checam a área do KPI, igual ao POST', () => {
    // O POST /registros já validava `kpi_areas`; o PUT e o DELETE irmãos não —
    // dava para editar e apagar registro de área alheia.
    const limpo = semComentarios(readFileSync(raiz('backend/routes/kpisV2.js'), 'utf8'));
    for (const [metodo, caminho] of [['put', '/registros/:id'], ['delete', '/registros/:id']] as const) {
      const linha = linhaDaRota(limpo, metodo, caminho);
      expect(linha, `rota ${metodo.toUpperCase()} ${caminho} sumiu`).toBeTruthy();
      expect(linha, `${metodo.toUpperCase()} ${caminho} sem checagem de área`).toContain('authorizeKpiArea');
    }
  });

  it('permissoes.js · o gate do router é a MATRIZ, não o nível de cargo', () => {
    // `authorize('admin','diretor')` passava por max(cargoNivelLeitura,
    // cargoNivelEscrita) >= 4 e não consultava módulo nenhum. Nível 4 e não 2:
    // na convenção da casa 2 é "pessoal", e este módulo concede acesso.
    const limpo = semComentarios(readFileSync(raiz('backend/routes/permissoes.js'), 'utf8'));
    expect(limpo).toContain("router.use(authenticate, authorizeModule('permissoes', 4))");
    expect(limpo).not.toMatch(/router\.use\([^)]*authorize\(\s*'admin'/);
  });

  it('permissoes.js · as 3 portas laterais de auto-escalação estão fechadas', () => {
    const limpo = semComentarios(readFileSync(raiz('backend/routes/permissoes.js'), 'utf8'));
    // (a) POST /usuario casava por E-MAIL e gravava cargo_id sem passar por
    //     bloqueiaAutoEdicao — dava para se promover pelo próprio e-mail.
    // (b) PUT /matriz/celula mexe na régua do CARGO (global) e não tinha bloqueio.
    // (c) DELETE /usuario/:id/modulo apagava o PRÓPRIO deny; o PUT irmão bloqueava.
    const trechoDelete = limpo.slice(limpo.indexOf("router.delete('/usuario/:id/modulo/:moduloId'"));
    expect(trechoDelete.slice(0, 900)).toContain('bloqueiaAutoEdicao');
    const trechoMatriz = limpo.slice(limpo.indexOf("router.put('/matriz/celula'"));
    expect(trechoMatriz.slice(0, 1600)).toContain('podeMexerNoControleDeAcesso');
    expect(trechoMatriz.slice(0, 1600)).toMatch(/cargoId/);
  });

  it('permissoes.js · o bloqueio do próprio cargo tem escape para o time de sistemas', () => {
    // MEDIDO em 08/09: 5 contas ativas têm o cargo `Dev`. Sem o escape, a linha
    // desse cargo ficaria ineditável por todo mundo — beco sem saída, não
    // "peça a outro administrador".
    const limpo = semComentarios(readFileSync(raiz('backend/routes/permissoes.js'), 'utf8'));
    const trecho = limpo.slice(limpo.indexOf("router.put('/matriz/celula'"));
    expect(trecho.slice(0, 1600)).toMatch(/!\(await ehDev\(req\)\)/);
  });

  it('permissoes.js · conceder o próprio módulo de permissões exige a régua forte', () => {
    // Sem isto, quem passa no gate do router dava nível 5 em `permissoes-admin`
    // a um terceiro e voltava por ele — escalada por procuração.
    const limpo = semComentarios(readFileSync(raiz('backend/routes/permissoes.js'), 'utf8'));
    const trecho = limpo.slice(limpo.indexOf("router.put('/usuario/:id/modulo'"));
    expect(trecho.slice(0, 2000)).toContain("permissoes-admin");
    expect(trecho.slice(0, 2000)).toContain('podeMexerNoControleDeAcesso');
  });

  it('permissoes.js · toda rota mutante deixa trilha em app_audit_log', () => {
    const limpo = semComentarios(readFileSync(raiz('backend/routes/permissoes.js'), 'utf8'));
    // A matriz de permissões era alterada sem nenhuma linha de auditoria: o
    // trigger declarado depende de `auth.uid()`, que é NULL no caminho da API
    // (o backend usa service_role).
    expect(limpo).toContain('app_audit_log');
    const mutantes = limpo
      .split('\n')
      .filter((l) => /^router\.(post|put|patch|delete)\(/.test(l))
      .length;
    const auditorias = (limpo.match(/auditarAcesso\(/g) || []).length;
    expect(auditorias, `${mutantes} rotas mutantes e só ${auditorias} chamadas de auditoria`).toBeGreaterThanOrEqual(8);
  });
});
