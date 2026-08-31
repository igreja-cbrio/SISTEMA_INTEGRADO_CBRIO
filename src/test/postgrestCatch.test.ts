import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { semComentariosJs } from './_semComentarios';

/**
 * ⚠️⚠️ O `PostgrestFilterBuilder` é THENABLE, mas NÃO é Promise: tem `.then` e
 * **não tem `.catch`**. Encadear `.catch()` numa cadeia do PostgREST levanta
 * `TypeError: ... .catch is not a function` ANTES do `await`, e o erro cai no
 * try/catch de fora — **abortando o resto da função**.
 *
 * Conferido no supabase-js **2.101.1**, a versão que `backend/package.json` pina
 * (a raiz tem 2.103.0 · as duas se comportam igual):
 *   typeof builder.then  === 'function'
 *   typeof builder.catch === 'undefined'
 *   typeof builder.then(fn).catch === 'function'   ← `.then()` devolve Promise real
 *
 * ⚠️ ISTO QUEBROU COLETA EM PRODUÇÃO (26→31/08/2026). Uma linha em
 * `liveMonitor`:
 *
 *   await supabase.from('cultos').update({ online_views_live }).eq('id', id).catch(() => {});
 *
 * matou DOIS indicadores de uma vez: `online_views_live` (a gravação era a
 * própria linha que estourava) e `online_pico` (o código depois nunca rodava).
 * Perdeu o pico do AMI de 29/08 e dos TRÊS cultos de domingo 30/08 — e
 * `concurrentViewers` só existe DURANTE a transmissão, então é irrecuperável.
 * O dashboard publicou "pior semana · −70%" pra uma falha de coleta.
 *
 * ⚠️ A guarda é ESTÁTICA e roda sobre o código SEM COMENTÁRIO — a explicação
 * acima cita o padrão proibido e viraria falso positivo (lição de 06/08).
 */

const RAIZ = path.resolve(__dirname, '../..');

/**
 * Anda pra trás a partir do `.catch(` até o começo da member-expression.
 * ⚠️ `}` NÃO é tratado como delimitador balanceado: fim de BLOCO não faz parte
 * de uma cadeia, e engoli-lo faz o caminhador atravessar o bloco anterior e
 * acusar quem está limpo (falso positivo que a 1ª versão deste detector deu).
 */
function inicioDaCadeia(s: string, pos: number): number {
  const ABRE: Record<string, string> = { ')': '(', ']': '[' };
  let i = pos - 1;
  while (i >= 0) {
    const c = s[i];
    if (/\s/.test(c)) { i -= 1; continue; }
    if (c === ')' || c === ']') {
      const abre = ABRE[c];
      let prof = 0;
      while (i >= 0) {
        if (s[i] === c) prof += 1;
        else if (s[i] === abre) { prof -= 1; if (prof === 0) break; }
        i -= 1;
      }
      i -= 1;
      continue;
    }
    if (c === '.' || /[\w$]/.test(c)) { i -= 1; continue; }
    break;
  }
  return i + 1;
}

export function catchEmBuilder(src: string): Array<{ linha: number; cadeia: string }> {
  const s = semComentariosJs(src);
  const achados: Array<{ linha: number; cadeia: string }> = [];
  const re = /\.catch\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    const cadeia = s.slice(inicioDaCadeia(s, m.index), m.index);
    if (!cadeia.includes('.from(')) continue;
    // `storage.from(...).remove()` e `auth.*` devolvem Promise REAL — `.catch` ok.
    if (cadeia.includes('.storage') || cadeia.includes('.auth')) continue;
    // `builder.then(...)` devolve Promise real — `.catch` depois disso é válido.
    if (cadeia.includes('.then(')) continue;
    const nu = cadeia.trim().replace(/^(await|return|void|const|let|var)\s+/, '');
    if (!/^(supabase|db|client|sb)\b/.test(nu)) continue;
    achados.push({ linha: s.slice(0, m.index).split('\n').length, cadeia: nu.replace(/\s+/g, ' ').slice(0, 120) });
  }
  return achados;
}

describe('PostgREST · .catch() encadeado no builder é TypeError', () => {
  it('o detector reconhece a linha exata que quebrou a coleta', () => {
    const ruim = "await supabase.from('cultos').update({ a: 1 }).eq('id', x).catch(() => {});";
    expect(catchEmBuilder(ruim)).toHaveLength(1);
  });

  it('NÃO acusa o que é Promise de verdade', () => {
    // `.then()` antes → Promise real
    expect(catchEmBuilder("supabase.from('t').update({a:1}).eq('id',x).then(()=>{}).catch(()=>{});")).toHaveLength(0);
    // storage e auth devolvem Promise real
    expect(catchEmBuilder("await supabase.storage.from('b').remove([p]).catch(()=>{});")).toHaveLength(0);
    expect(catchEmBuilder("await supabase.auth.getUser(t).catch(()=>{});")).toHaveLength(0);
    // função async própria → Promise real
    expect(catchEmBuilder("await coletarChatDecisoes(id).catch(()=>{});")).toHaveLength(0);
  });

  it('⚠️ NÃO atravessa o bloco anterior (falso positivo do 1º detector)', () => {
    const ok = [
      "if (x) {",
      "  await supabase.from('cultos').update({ a: 1 }).eq('id', y);",
      "}",
      "await minhaFuncaoAsync(id).catch(() => {});",
    ].join('\n');
    expect(catchEmBuilder(ok)).toHaveLength(0);
  });

  it('ignora o padrão que aparece só em COMENTÁRIO', () => {
    const doc = "// await supabase.from('t').update({a:1}).eq('id',x).catch(() => {});\nconst y = 1;";
    expect(catchEmBuilder(doc)).toHaveLength(0);
  });

  it('⚠️ o BACKEND INTEIRO está limpo', () => {
    // Varredura completa: eram 25 sítios em 8 arquivos (31/08/2026), e cada um
    // era um TypeError garantido. Vários viravam 500 na cara de quem clicava —
    // apagar tarefa de evento, apagar ocorrência, apagar marco de expansão e o
    // opt-out público de e-mail. O caminho best-effort correto é
    // `utils/semFalhar`, que awaita, LÊ o `error` e registra.
    const suspeitos: string[] = [];
    const pilha = [path.join(RAIZ, 'backend')];
    while (pilha.length) {
      const atual = pilha.pop()!;
      for (const ent of fs.readdirSync(atual, { withFileTypes: true })) {
        const caminho = path.join(atual, ent.name);
        if (ent.isDirectory()) { if (ent.name !== 'node_modules') pilha.push(caminho); continue; }
        if (!ent.name.endsWith('.js')) continue;
        for (const a of catchEmBuilder(fs.readFileSync(caminho, 'utf8'))) {
          suspeitos.push(`${path.relative(RAIZ, caminho)}:${a.linha} :: ${a.cadeia}`);
        }
      }
    }
    expect(suspeitos).toEqual([]);
  });

  it('semFalhar existe, awaita e LÊ o error', () => {
    // Engolir em silêncio (`.catch(() => {})`) é como o bug sobreviveu meses.
    const src = semComentariosJs(fs.readFileSync(path.join(RAIZ, 'backend/utils/semFalhar.js'), 'utf8'));
    expect(src).toContain('const { error } = (await consulta)');
    expect(src).toContain('console.error');
    expect(src).toMatch(/catch \(e\)/);
  });

  it('liveMonitor grava views_live conferindo o `error`, não por .catch', () => {
    const src = semComentariosJs(
      fs.readFileSync(path.join(RAIZ, 'backend/services/onlineCollectors.js'), 'utf8'),
    );
    // O await tem que devolver o resultado e o erro tem que ser LIDO — se
    // ninguém ler, uma falha de gravação volta a ser invisível.
    expect(src).toMatch(/const \{ error: eViews \} = await supabase[\s\S]{0,200}?online_views_live/);
    expect(src).toContain('if (eViews)');
  });
});
