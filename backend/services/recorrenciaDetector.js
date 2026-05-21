// Engine de deteccao de despesas recorrentes
//
// Estrategia:
//   - Olha fin_transacoes tipo='despesa' dos ultimos 6 meses
//   - Agrupa por documento_contraparte (ou nome normalizado se sem documento)
//   - Pra cada grupo com 3+ ocorrencias:
//     - Calcula valor medio + min + max
//     - Calcula cadencia media (dias entre lancamentos consecutivos)
//     - Se a variacao do valor < 25% E cadencia 25-35 dias → marca como recorrente fixa
//     - Variacao 25-50% ou cadencia 50-70 dias → variavel
//     - Resto → eventual
//   - UPSERT em fin_despesas_recorrentes (UNIQUE chave + tipo)
//   - Liga ja todas as transacoes ao registro de recorrencia (FK)
//
// Roda sob demanda via endpoint admin · pode ser chamado tambem do cron diario.

const { supabase } = require('../utils/supabase');

function normalize(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim();
}

function classificarRecorrencia(stats) {
  const { variacaoValor, cadenciaMediaDias } = stats;
  if (variacaoValor <= 0.10 && cadenciaMediaDias >= 25 && cadenciaMediaDias <= 35) {
    return { classe: 'fixa', confianca: 0.95 };
  }
  if (variacaoValor <= 0.25 && cadenciaMediaDias >= 25 && cadenciaMediaDias <= 35) {
    return { classe: 'fixa', confianca: 0.85 };
  }
  if (variacaoValor <= 0.50 && cadenciaMediaDias >= 25 && cadenciaMediaDias <= 35) {
    return { classe: 'variavel', confianca: 0.75 };
  }
  if (cadenciaMediaDias >= 55 && cadenciaMediaDias <= 70) {
    return { classe: 'variavel', confianca: 0.60 }; // bimestral
  }
  if (cadenciaMediaDias >= 80 && cadenciaMediaDias <= 100) {
    return { classe: 'variavel', confianca: 0.55 }; // trimestral
  }
  return { classe: 'eventual', confianca: 0.40 };
}

/**
 * Executa deteccao em batch · retorna stats agregadas
 */
async function detectarRecorrencias({ mesesHistorico = 6, dryRun = false } = {}) {
  const desde = new Date();
  desde.setMonth(desde.getMonth() - mesesHistorico);
  const desdeStr = desde.toISOString().slice(0, 10);

  // 1. Busca despesas com plano_contas_id e documento OU nome
  // Precisa do plano pra herdar classe e centro de custo no UPSERT
  const { data: lancamentosBrutos } = await supabase
    .from('fin_transacoes')
    .select(`
      id, valor, data_competencia, descricao, plano_contas_id,
      lancamento_bruto:lancamento_bruto_id ( documento_contraparte, nome_contraparte )
    `)
    .eq('tipo', 'despesa')
    .gte('data_competencia', desdeStr)
    .neq('status', 'cancelado')
    .not('plano_contas_id', 'is', null);

  if (!lancamentosBrutos || lancamentosBrutos.length === 0) {
    return { total_analisadas: 0, padroes_detectados: 0, transacoes_ligadas: 0, dryRun };
  }

  // 2. Agrupa por documento OU nome (prioriza documento)
  const grupos = new Map();
  for (const t of lancamentosBrutos) {
    const doc = t.lancamento_bruto?.documento_contraparte;
    const nome = t.lancamento_bruto?.nome_contraparte;
    let chave, tipoChave;
    if (doc) { chave = doc; tipoChave = 'documento'; }
    else if (nome) { chave = normalize(nome); tipoChave = 'nome'; }
    else continue;

    if (!grupos.has(chave)) grupos.set(chave, { tipoChave, lancamentos: [], chave });
    grupos.get(chave).lancamentos.push(t);
  }

  // 3. Pra cada grupo com 3+ ocorrencias, calcula stats
  let padroesDetectados = 0;
  let transacoesLigadas = 0;
  const resultado = [];

  for (const grupo of grupos.values()) {
    if (grupo.lancamentos.length < 3) continue;

    const ordenados = [...grupo.lancamentos].sort((a, b) =>
      a.data_competencia.localeCompare(b.data_competencia)
    );

    const valores = ordenados.map(l => Math.abs(Number(l.valor)));
    const valorMedio = valores.reduce((s, v) => s + v, 0) / valores.length;
    const valorMin = Math.min(...valores);
    const valorMax = Math.max(...valores);
    const variacaoValor = (valorMax - valorMin) / (valorMedio || 1);

    // Cadencia: media de dias entre lancamentos consecutivos
    const diffsDias = [];
    for (let i = 1; i < ordenados.length; i++) {
      const d1 = new Date(ordenados[i - 1].data_competencia);
      const d2 = new Date(ordenados[i].data_competencia);
      diffsDias.push(Math.round((d2 - d1) / 86400000));
    }
    const cadenciaMediaDias = diffsDias.length
      ? diffsDias.reduce((s, d) => s + d, 0) / diffsDias.length
      : 30;

    const { classe, confianca } = classificarRecorrencia({ variacaoValor, cadenciaMediaDias });
    if (confianca < 0.50) continue; // descarta eventuais com baixa confianca · poluiria a base

    const ultimaData = ordenados[ordenados.length - 1].data_competencia;
    const proximaEstimada = new Date(ultimaData);
    proximaEstimada.setDate(proximaEstimada.getDate() + Math.round(cadenciaMediaDias));

    // Plano e centro herdados do ultimo lancamento (mais recente · provavelmente correto)
    const planoContasId = ordenados[ordenados.length - 1].plano_contas_id;

    const descricaoCurta = (ordenados[ordenados.length - 1].descricao || '')
      .slice(0, 80)
      .trim();

    const payload = {
      chave_match: grupo.chave,
      tipo_chave: grupo.tipoChave,
      descricao: descricaoCurta || `Recorrente · ${grupo.chave}`,
      valor_medio: valorMedio,
      valor_minimo: valorMin,
      valor_maximo: valorMax,
      cadencia_dias: Math.round(cadenciaMediaDias),
      ocorrencias: ordenados.length,
      ultima_ocorrencia: ultimaData,
      proxima_estimada: proximaEstimada.toISOString().slice(0, 10),
      plano_contas_id: planoContasId,
      classe,
      confianca,
      ativa: true,
      updated_at: new Date().toISOString(),
    };

    resultado.push({ ...payload, _lancamento_ids: ordenados.map(o => o.id) });
    padroesDetectados++;
    transacoesLigadas += ordenados.length;
  }

  if (dryRun) {
    return {
      total_analisadas: lancamentosBrutos.length,
      padroes_detectados: padroesDetectados,
      transacoes_ligadas: transacoesLigadas,
      dryRun: true,
      preview: resultado.slice(0, 20).map(({ _lancamento_ids, ...r }) => r),
    };
  }

  // 4. UPSERT em fin_despesas_recorrentes + linka transacoes
  for (const item of resultado) {
    const { _lancamento_ids, ...payload } = item;
    const { data: rec, error } = await supabase
      .from('fin_despesas_recorrentes')
      .upsert(payload, { onConflict: 'chave_match,tipo_chave' })
      .select('id')
      .single();

    if (error) {
      console.warn('[recorrencia] upsert erro:', error.message);
      continue;
    }

    // Liga transacoes a essa recorrencia
    if (rec?.id && _lancamento_ids.length) {
      await supabase
        .from('fin_transacoes')
        .update({ recorrencia_id: rec.id })
        .in('id', _lancamento_ids);
    }
  }

  return {
    total_analisadas: lancamentosBrutos.length,
    padroes_detectados: padroesDetectados,
    transacoes_ligadas: transacoesLigadas,
    dryRun: false,
  };
}

module.exports = { detectarRecorrencias };
