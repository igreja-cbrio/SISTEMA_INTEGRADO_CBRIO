// ⚠️⚠️ GUARDA que teria pego um bug MEU em produção (26/08/2026).
//
// `backend/utils/supabase.js` exporta `{ supabase, pool, query, transaction }`.
// Escrever `const supabase = require('../utils/supabase')` (sem chaves) dá um
// OBJETO cujo `.from` é `undefined` — e o sintoma é `supabase.from is not a
// function` em runtime, nunca em build.
//
// Foi assim que `conversaRoteamento.js` foi mergeado e ficou INERTE em
// produção: o serviço tem try/catch, então a falha só ia pro log e nenhuma
// conversa era etiquetada. Nada pegou:
//   • `tsc -b` e `npm run build` — é CommonJS sem tipos
//   • `npm test` — o teste é do util PURO; o serviço precisaria de banco
//   • `node -e "require(...)"` — require CARREGA, não EXECUTA
//   • o gate inteiro (2442 testes + 19 scripts) passou verde
//
// É a lição de 25/08 ("`node --check` não pega ReferenceError") na sua versão
// mais cara: erro de IMPORT que só aparece quando a linha roda.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = join(process.cwd(), 'backend');

function arquivosJs(dir: string): string[] {
  const out: string[] = [];
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) out.push(...arquivosJs(p));
    else if (nome.endsWith('.js') && !nome.endsWith('.test.js')) out.push(p);
  }
  return out;
}

/** ⚠️ Comentário fora antes de casar — o próprio cabeçalho deste teste cita a
 *  forma errada, e sem isto a explicação viraria a evidência (lição de 06/08). */
function semComentarios(src: string): string {
  // ⚠️ `//` de LINHA primeiro, bloco depois — a ordem inversa faz um `//` que
  // contenha `/*` comer o arquivo até o próximo `*/` (84 arquivos, 8.169 linhas
  // na árvore deste repo). Mesma correção aplicada em routeModuleMap/rpcsCliente.
  return src
    .split('\n').map(l => l.replace(/(^|[^:])\/\/[^\n]*/, '$1')).join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('import do cliente Supabase no backend', () => {
  const arquivos = arquivosJs(RAIZ);

  // ⚠️ Lê e limpa cada arquivo UMA vez. Antes cada `it` varria os ~700 sozinho,
  // e na suíte cheia os dois casos estouravam o timeout de 5s do vitest (11,8s
  // e 12,4s medidos) — passando isolados. Guarda que fica vermelha por TEMPO
  // acaba sendo ignorada ou removida, que é o oposto do que ela existe pra
  // fazer. O timeout explícito abaixo é o cinto; isto é o conserto.
  const fontes = arquivos.map(f => ({ f, src: semComentarios(readFileSync(f, 'utf8')) }));
  const T = 30_000;

  it('há arquivos para varrer (o próprio varredor não pode virar no-op)', () => {
    expect(arquivos.length).toBeGreaterThan(50);
  });

  it('⚠️ NENHUM arquivo importa utils/supabase sem desestruturar', () => {
    const errados: string[] = [];
    for (const { f, src } of fontes) {
      // pega `const supabase = require('.../utils/supabase')` (sem chaves)
      if (/(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*require\([^)]*utils\/supabase[^)]*\)/.test(src)) {
        errados.push(f.replace(RAIZ, 'backend'));
      }
    }
    expect(errados, `importe com chaves: const { supabase } = require('../utils/supabase')`).toEqual([]);
  }, T);

  it('quem usa `supabase.from` importa o cliente de verdade', () => {
    const semImport: string[] = [];
    for (const { f, src } of fontes) {
      if (!/\bsupabase\s*\.\s*(from|rpc|storage)\b/.test(src)) continue;
      const ok = /\{[^}]*\bsupabase\b[^}]*\}\s*=\s*require\([^)]*supabase[^)]*\)/.test(src)
        || /\bsupabase\s*=\s*createClient\(/.test(src)
        || /function[^(]*\(\s*[^)]*\bsupabase\b/.test(src)   // recebe por parâmetro
        || /\bsupabase\s*[,)]/.test(src.split('\n')[0] || '');
      if (!ok) semImport.push(f.replace(RAIZ, 'backend'));
    }
    expect(semImport).toEqual([]);
  }, T);
});
