/**
 * ⚠️⚠️ A GUARDA QUE FALTAVA: o gate não verificava o `backend/` de forma nenhuma.
 *
 * Em 02/09/2026, um `}` órfão no `backend/server.js` derrubou **toda a `/api`**
 * em produção por 13 min — e o gate inteiro passou VERDE:
 *
 *   | verificação            | via o server.js? |
 *   |------------------------|------------------|
 *   | `tsc -b`               | não (não checa .js do backend) |
 *   | `npm run build`        | não (é só o front)             |
 *   | `npm test` (3.165)     | não                            |
 *   | os 21 scripts do gate  | não                            |
 *
 * A função morria no CARREGAMENTO do módulo — `FUNCTION_INVOCATION_FAILED`,
 * sem stack e sem log de aplicação.
 *
 * ⚠️⚠️ SÃO DUAS CAMADAS, e a diferença entre elas importa:
 *
 *  1. SINTAXE (`node --check`) — roda SEMPRE, inclusive no CI, porque não
 *     precisa de dependência nenhuma. É a que pega o bug de 02/09.
 *  2. CARREGAMENTO REAL — pega o que a sintaxe não vê: `ReferenceError` de
 *     símbolo usado sem import (a lição de 25/08, `ancorasDeGrupos`) e import
 *     de arquivo inexistente. **Só roda onde `backend/node_modules` existe.**
 *
 * ⚠️ A camada 2 PULA no CI, e isso é declarado, não escondido: o workflow roda
 * `npm ci` só na raiz, e `backend/` tem árvore de dependências PRÓPRIA (é a
 * armadilha já registrada em 06/08, quando `express-rate-limit` divergia entre
 * as duas). Um teste que fingisse cobrir isso seria pior que a lacuna.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, statSync, readFileSync } from 'node:fs';
import path from 'node:path';

const raiz = path.resolve(__dirname, '../..');
const temDepsBackend = existsSync(path.join(raiz, 'backend/node_modules/express'));

function jsDoBackend(dir: string, acc: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    if (nome === 'node_modules' || nome.startsWith('.')) continue;
    const p = path.join(dir, nome);
    if (statSync(p).isDirectory()) jsDoBackend(p, acc);
    else if (nome.endsWith('.js') || nome.endsWith('.cjs')) acc.push(p);
  }
  return acc;
}

describe('o backend é sintaticamente válido (guarda de FUNCTION_INVOCATION_FAILED)', () => {
  it('api/index.js e backend/server.js existem', () => {
    expect(existsSync(path.join(raiz, 'api/index.js'))).toBe(true);
    expect(existsSync(path.join(raiz, 'backend/server.js'))).toBe(true);
  });

  it('⚠️⚠️ TODO .js do backend é sintaticamente válido', () => {
    // Roda no CI: só precisa do parser do Node, não das dependências.
    // ⚠️ `vm.Script` em vez de `node --check`: são ~580 arquivos, e um
    // processo por arquivo levava 58 s — o teste estourava o timeout padrão
    // do vitest e ficava vermelho por LENTIDÃO, não por defeito (a mesma
    // armadilha do `mapaGerador` em 24/08). Em memória são ~2 s.
    // ⚠️ `Module.wrap` reproduz o envelope CJS real: sem ele, `return` de topo
    // e o próprio `module` acusariam erro em arquivo perfeitamente válido.
    const arquivos = jsDoBackend(path.join(raiz, 'backend'));
    expect(arquivos.length).toBeGreaterThan(300); // sanidade: achou a árvore

    const quebrados: string[] = [];
    for (const f of arquivos) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        new (require('node:vm').Script)(
          // ⚠️ O shebang (`#!/usr/bin/env node`) é removido pelo Node ao
          // carregar o arquivo, mas NÃO por `Module.wrap` — sem tirar aqui,
          // os 17 scripts do backend acusariam "Invalid or unexpected token"
          // sendo perfeitamente válidos. Falso vermelho é pior que lacuna.
          (require('node:module') as any).wrap(
            readFileSync(f, 'utf8').replace(/^#![^\n]*/, ''),
          ),
          { filename: f },
        );
      } catch (e: any) {
        quebrados.push(`${path.relative(raiz, f)} · ${String(e?.message).split('\n')[0]}`);
      }
    }
    expect(quebrados, `sintaxe quebrada:\n${quebrados.join('\n')}`).toEqual([]);
  }, 60_000);
});

describe.skipIf(!temDepsBackend)('o backend CARREGA de verdade', () => {
  it('⚠️ carrega pelo mesmo caminho da Vercel (pega ReferenceError, não só sintaxe)', () => {
    // ⚠️ Subprocesso: o server monta o Express e faz `listen`; carregar no
    // processo do vitest deixaria porta aberta e poluiria as outras suítes.
    // ⚠️ PORT=0 pede porta efêmera — sem isso, a 3001 ocupada por um
    // `npm run dev` daria falso vermelho por EADDRINUSE (o arquivo carregou;
    // a porta é que estava tomada).
    let saida = '';
    try {
      saida = execFileSync(process.execPath, [
        '-e',
        `process.env.PORT='0';
         try { require(${JSON.stringify(path.join(raiz, 'backend/server.js'))}); console.log('CARREGOU_OK'); }
         catch (e) { console.log('CARREGOU_FALHOU:' + e.name + ': ' + e.message); }
         process.exit(0);`,
      ], { cwd: raiz, encoding: 'utf8', timeout: 60_000, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e: any) {
      saida = String(e?.stdout || '') + String(e?.stderr || '');
    }
    // ⚠️ Assertar a MARCA, não "ausência de erro": o server loga avisos
    // legítimos (env de Supabase ausente) e olhar stderr daria falso vermelho.
    expect(saida, `o backend não carregou · saída:\n${saida}`).toContain('CARREGOU_OK');
    expect(saida).not.toContain('CARREGOU_FALHOU');
    // ⚠️ Timeout explícito: este caso SPAWNA um processo que monta o Express
    // inteiro (~600ms sozinho, >10s sob a carga da suíte cheia). Com o default
    // de 5s ele fica vermelho por LENTIDÃO, não por defeito — a asserção é
    // sobre o backend carregar, não sobre ser rápido. Mesma correção do
    // `mapaGerador` em 24/08.
  }, 90_000);
});
