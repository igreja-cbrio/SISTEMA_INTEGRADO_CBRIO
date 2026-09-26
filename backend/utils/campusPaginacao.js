// O chamador fornece uma consulta nova com ordenação estável a cada página.
// Qualquer falha invalida o resultado inteiro; nunca publicar totais parciais.
async function lerTodasPaginas(criarConsulta) {
  const resultado = [];
  for (let inicio = 0; ; inicio += 1000) {
    const { data, error } = await criarConsulta().range(inicio, inicio + 999);
    if (error || !Array.isArray(data)) throw error || new Error('Resposta de paginação inválida');
    resultado.push(...data);
    if (data.length < 1000) return resultado;
  }
}
module.exports = { lerTodasPaginas };
