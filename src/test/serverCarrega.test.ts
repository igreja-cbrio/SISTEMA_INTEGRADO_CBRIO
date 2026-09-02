/**
 * ⚠️⚠️ A GUARDA QUE FALTAVA: o gate não carregava o `backend/server.js`.
 *
 * Em 02/09/2026, um `}` órfão nesse arquivo derrubou **toda a `/api`** em
 * produção por 13 minutos — e o gate inteiro tinha passado VERDE:
 *
 *   | verificação            | carrega o server.js? |
 *   |------------------------|----------------------|
 *   | `tsc -b`               | não (não checa .js do backend) |
 *   | `npm run build`        | não (é só o front)   |
 *   | `npm test` (3.165)     | não                  |
 *   | os 21 scripts do gate  | não                  |
 *
 * A função morria no CARREGAMENTO do módulo, antes de rodar uma linha — então
 * nem log de aplicação saía (`FUNCTION_INVOCATION_FAILED`, sem stack).
 *
 * Este teste carrega pelo MESMO caminho da Vercel (`api/index.js` →
 * `require('../backend/server.js')`). É barato e fecha a classe inteira:
 * erro de sintaxe, import quebrado e `ReferenceError` de topo de módulo.
 *
 * ⚠️ `node --check` NÃO substitui isto: ele valida sintaxe e não pega
 * `ReferenceError` de símbolo usado e não importado (a lição de 25/08, quando
 * `ancorasDeGrupos` ficou sem import e o endpoint responderia 500 pra sempre).
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const raiz = path.resolve(__dirname, '../..');

describe('o backend CARREGA (guarda de FUNCTION_INVOCATION_FAILED)', () => {
  it('api/index.js existe — é o entrypoint da Vercel', () => {
    expect(existsSync(path.join(raiz, 'api/index.js'))).toBe(true);
    expect(existsSync(path.join(raiz, 'backend/server.js'))).toBe(true);
  });

  it('⚠️⚠️ backend/server.js carrega sem estourar', () => {
    // Subprocesso: o server monta o Express inteiro e faz `listen`; carregar
    // no processo do vitest deixaria porta aberta e poluiria as outras suítes.
    // ⚠️ PORT=0 pede porta efêmera ao SO — sem isso, a 3001 ocupada por um
    // `npm run dev` na máquina de alguém faria este teste falhar por EADDRINUSE,
    // que é falso vermelho (o arquivo carregou; a porta é que estava tomada).
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

    // ⚠️ A asserção é sobre a MARCA, não sobre "não deu erro": o server loga
    // avisos legítimos (env de Supabase ausente no CI, por exemplo) e olhar
    // stderr daria falso vermelho.
    expect(saida, `o backend não carregou · saída:\n${saida}`).toContain('CARREGOU_OK');
    expect(saida).not.toContain('CARREGOU_FALHOU');
  });
});
