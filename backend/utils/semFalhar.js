/**
 * Executa uma consulta do PostgREST em modo BEST-EFFORT, sem derrubar o fluxo.
 *
 * ⚠️⚠️ EXISTE POR UM BUG REAL, repetido 25 vezes no backend. O
 * `PostgrestFilterBuilder` é THENABLE mas **não é Promise**: tem `.then` e
 * **não tem `.catch`** (conferido no supabase-js 2.101.1, o que `backend/`
 * pina). Então o padrão que parece inofensivo
 *
 *     await supabase.from('t').update({...}).eq('id', x).catch(() => {});
 *
 * levanta `TypeError: ... .catch is not a function` **antes do await** — o
 * oposto do que o autor queria. Onde havia try/catch em volta, o "ignore a
 * falha" virou "aborte o resto da função"; onde não havia, virou 500.
 *
 * Foi assim que a coleta do pico ao vivo e das views da live morreu entre 26 e
 * 31/08/2026 (uma linha em `liveMonitor` matou os dois indicadores), e é por
 * isso que apagar tarefa de evento, apagar ocorrência, apagar marco de expansão
 * e o opt-out público de e-mail respondiam erro.
 *
 * ⚠️ Erro de CONSULTA não vem por rejeição — vem em `error` no resultado. Falha
 * de REDE vem por rejeição. Esta função cobre os dois e **registra** o motivo:
 * o `.catch(() => {})` original engolia em silêncio, e silêncio é como o bug
 * sobreviveu tanto tempo.
 *
 * Guarda no portão: `src/test/postgrestCatch.test.ts`.
 */
async function semFalhar(consulta, tag) {
  const prefixo = tag ? `${tag} ` : '';
  try {
    const { error } = (await consulta) || {};
    if (error) console.error(`${prefixo}${error.message}`);
    return !error;
  } catch (e) {
    console.error(`${prefixo}${e?.message || e}`);
    return false;
  }
}

module.exports = { semFalhar };
