const { validarContexto } = require('../utils/campusQuery');

// Os IDs são extraídos de linhas locais já carregadas pela rota, nunca do query/body.
async function sinaisNextDosAtos(db, contexto, convertidos, matriculas) {
  validarContexto(contexto, true); // exige um campus, sem modo consolidado
  const atos = [
    ...convertidos.map(c => ({ tipo: 'convertido', id: c.id })),
    ...matriculas.map(m => ({ tipo: 'matricula', id: m.id })),
  ];
  const formados = new Set();
  for (let inicio = 0; inicio < atos.length; inicio += 500) {
    const lote = atos.slice(inicio, inicio + 500);
    const esperados = new Set(lote.map(a => `${a.tipo}:${a.id}`));
    const { data, error } = await db.rpc('fn_campus_next_sinais', {
      p_igreja_id: contexto.campus_id,
      p_convertido_ids: lote.filter(a => a.tipo === 'convertido').map(a => a.id),
      p_matricula_ids: lote.filter(a => a.tipo === 'matricula').map(a => a.id),
    });
    if (error || !Array.isArray(data)) throw error || new Error('Sinal de conclusão indisponível.');
    for (const linha of data) {
      const chave = `${linha.tipo}:${linha.registro_id}`;
      if (!esperados.delete(chave) || typeof linha.fez_next !== 'boolean') throw new Error('Resposta de conclusão inválida.');
      if (linha.fez_next) formados.add(chave);
    }
    if (esperados.size) throw new Error('Resposta de conclusão incompleta.');
  }
  return (registro, tipo) => !!registro && formados.has(`${tipo}:${registro.id}`);
}
module.exports = { sinaisNextDosAtos };
