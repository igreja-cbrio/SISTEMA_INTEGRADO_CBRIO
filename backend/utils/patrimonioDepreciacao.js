// Depreciação · indicador GERENCIAL interno (decisão do usuário 2026-07-29 ·
// NÃO é cálculo contábil oficial). Método linear simples, sempre derivado na
// hora — nunca gravado por período. Retorna null quando faltar algum dado
// necessário (valor de aquisição, data de aquisição ou vida útil da categoria).
// Extraído de backend/routes/patrimonio.js pra ser reusado também pelo
// notificacaoGenerator.js (alerta de fim de vida útil) sem duplicar a fórmula.
function calcularDepreciacao(bem) {
  const vidaUtilMeses = bem?.pat_categorias?.vida_util_meses;
  const valor = bem?.valor_aquisicao != null ? Number(bem.valor_aquisicao) : null;
  if (!vidaUtilMeses || valor == null || !bem?.data_aquisicao) return null;
  const aquisicao = new Date(bem.data_aquisicao + 'T00:00:00');
  if (Number.isNaN(aquisicao.getTime())) return null;
  const agora = new Date();
  let mesesDecorridos = (agora.getFullYear() - aquisicao.getFullYear()) * 12 + (agora.getMonth() - aquisicao.getMonth());
  if (agora.getDate() < aquisicao.getDate()) mesesDecorridos -= 1;
  mesesDecorridos = Math.max(0, mesesDecorridos);
  const percentual = Math.min(100, (mesesDecorridos / vidaUtilMeses) * 100);
  const valorAtual = Math.max(0, valor * (1 - percentual / 100));
  return {
    vida_util_meses: vidaUtilMeses,
    meses_decorridos: mesesDecorridos,
    percentual_depreciado: Math.round(percentual * 10) / 10,
    valor_atual_estimado: Math.round(valorAtual * 100) / 100,
  };
}

module.exports = { calcularDepreciacao };
