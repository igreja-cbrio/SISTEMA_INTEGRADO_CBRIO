const { filtrarCampus } = require('../utils/campusQuery');
const { lerTodasPaginas } = require('../utils/campusPaginacao');

function listarGruposCampus(db, contexto, filtros = {}, colunas = '*') {
  return lerTodasPaginas(() => {
    let q = filtrarCampus(db.from('mem_grupos').select(colunas).is('deleted_at', null), contexto);
    if (filtros.ativo !== 'all') q = q.eq('ativo', filtros.ativo === undefined || filtros.ativo === true || filtros.ativo === 'true');
    for (const campo of ['categoria', 'bairro', 'temporada', 'status_temporada', 'codigo']) {
      if (filtros[campo]) q = q.eq(campo, filtros[campo]);
    }
    return q.order('nome').order('id');
  });
}
// IDs devem vir de pais já autorizados, nunca diretamente da entrada do cliente.
// Lotes limitam tamanho da URL e cada lote pagina para não truncar o roster.
async function lerReferenciasGrupo(ids, criarConsulta) {
  const unicos = [...new Set(ids.filter(Boolean))];
  const rows = [];
  for (let i = 0; i < unicos.length; i += 200) {
    rows.push(...await lerTodasPaginas(() => criarConsulta(unicos.slice(i, i + 200)).order('id')));
  }
  return rows;
}
module.exports = { listarGruposCampus, lerReferenciasGrupo };
