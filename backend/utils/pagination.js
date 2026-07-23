// Paginação para contornar o cap server-side de 1000 linhas do PostgREST
// (db-max-rows). Um `select` de coleção SEM isto trunca em 1000 EM SILÊNCIO
// (não dá erro) — corrompendo contagens/agregações/listas de tabelas grandes.
//
// `build()` deve retornar uma query NOVA a cada chamada (os builders do
// supabase-js são de uso único). Uso:
//   const linhas = await fetchAllRows(() => supabase.from('x').select('...').eq(...));
//   const primeiras = await fetchAllRows(build, { max: 5000 }); // respeita um teto
//
// Degrada em erro (retorna o acumulado, sem derrubar o chamador) — mesmo
// comportamento tolerante do padrão antigo `.data || []`, só que sem truncar.
async function fetchAllRows(build, { page = 1000, max = Infinity } = {}) {
  const out = [];
  for (;;) {
    const restante = max - out.length;
    if (restante <= 0) break;
    const size = Math.min(page, restante);
    // offset = quantas linhas já foram lidas
    const { data, error } = await build().range(out.length, out.length + size - 1);
    if (error) break;
    const rows = data || [];
    out.push(...rows);
    if (rows.length < size) break; // última página
  }
  return out;
}

module.exports = { fetchAllRows };
