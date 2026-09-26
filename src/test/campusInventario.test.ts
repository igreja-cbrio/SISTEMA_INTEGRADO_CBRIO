import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const { varrerFonte, inventariar, comparar } = require('../../backend/scripts/multicampus-inventario.cjs');
const { classificarTabela, TABELAS_CAMPUS } = require('../../backend/utils/campusCatalogo.js');

describe('inventário offline de isolamento por campus', () => {
  it('não transforma tabela nova de um módulo central em acesso compartilhado', () => {
    expect(classificarTabela('rh_funcionarios').escopo).toBe('compartilhado');
    expect(classificarTabela('rh_documentos_novos').escopo).toBe('pendente');
    expect(classificarTabela('mem_membros').escopo).toBe('identidade');
    for (const nome of ['cultos', 'cultos_decisoes_pessoas', 'next_turmas', 'next_matriculas', 'next_presencas']) {
      expect(TABELAS_CAMPUS[nome].escopo).toBe('local');
    }
  });
  it('localiza consultas e rotas; ignora comentários sem destruir URLs', () => {
    const source = [
      '// db.from("segredo_comentado")',
      '/* app.use("/api/comentada", router) */',
      'const url = "https://example.test";',
      'db.from("cultos").select("id");',
      'db.rpc("recalcular_nsm", {});',
      'app.use("/api/nova-porta", router);',
      'fetch(url); localStorage.getItem("campus");',
    ].join('\n');
    const result = varrerFonte(source, 'backend/routes/exemplo.js');
    expect(result.tabelas).toEqual([{ nome: 'cultos', arquivo: 'backend/routes/exemplo.js', linha: 4 }]);
    expect(result.rpcs[0].nome).toBe('recalcular_nsm');
    expect(result.rotas).toEqual([{ caminho: '/api/nova-porta', escopo: 'pendente', arquivo: 'backend/routes/exemplo.js', linha: 6 }]);
    expect(result.fetches).toHaveLength(1);
    expect(result.caches).toHaveLength(1);
  });
  it('mantém chamadas dinâmicas como lacunas, incluindo template interpolado', () => {
    const result = varrerFonte('db.from(tabela); db.rpc(nome, args); db.from(`mem_${tipo}`);', 'backend/x.js');
    expect(result.dinamicos).toHaveLength(3);
    expect(result.tabelas).toEqual([]);
    expect(result.rpcs).toEqual([]);
  });
  it('permite comparar o inventário de main sem mascarar novas superfícies', () => {
    const old = { tabelas: [{ tabela: 'cultos' }], rpcs: [], rotas: [] };
    const next = { tabelas: [{ tabela: 'cultos' }, { tabela: 'nova' }], rpcs: [{ nome: 'rpc_nova' }], rotas: [{ caminho: '/api/nova' }] };
    expect(comparar(next, old)).toEqual({ tabelas: ['nova'], rpcs: ['rpc_nova'], rotas: ['/api/nova'] });
  });
  it('CLI falha fechado em --check e nunca lê env ou inclui conteúdo de dados', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'campus-audit-'));
    try {
      mkdirSync(path.join(root, 'backend'));
      writeFileSync(path.join(root, '.env'), 'SECRET=nao-exportar');
      writeFileSync(path.join(root, 'backend/server.js'), 'app.use("/api/desconhecida", router); db.from("tabela_nova").select("*");');
      const report = inventariar(root);
      expect(report.gaps.tabelas).toContain('tabela_nova');
      expect(report.gaps.rotas).toContain('/api/desconhecida');
      expect(report.prontoParaAtivacao).toBe(false);
      const result = spawnSync(process.execPath, [path.resolve('backend/scripts/multicampus-inventario.cjs'), '--root', root, '--check'], { encoding: 'utf8' });
      expect(result.status).toBe(1);
      expect(JSON.parse(result.stdout).classificacaoCompleta).toBe(false);
      expect(result.stdout).not.toContain('nao-exportar');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
