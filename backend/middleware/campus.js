const { resolverContextoCampus, responderErroCampus, ErroCampus } = require('../services/campusContexto');

// Cobertura é uma declaração do servidor após implementação/testes do handler.
// Ausência não libera queries globais. Instalar DEPOIS do guard de módulo.
function criarMiddlewareCampus({ modulo, cobertura = {}, resolver = resolverContextoCampus, ...dependencias } = {}) {
  if (!modulo || typeof modulo !== 'string') throw new Error('Informe o módulo do contexto de campus.');
  const contrato = Object.freeze({ ...cobertura });
  return async function contextoDeCampus(req, res, next) {
    try {
      const contexto = await resolver(req, { ...dependencias, exigirSelecao: true, permitirConsolidado: contrato.consolidado === true });
      const leitura = req.method === 'GET' || req.method === 'HEAD';
      const exigeCobertura = contexto.estado !== 'preparacao' || contexto.campus_id !== contexto.campus_legado_id;
      if (exigeCobertura && contrato[leitura ? 'leitura' : 'escrita'] !== true) {
        throw new ErroCampus(503, 'campus_operacao_nao_habilitada', 'Esta operação ainda não está habilitada para múltiplos campi.');
      }
      const db = dependencias.supabase || require('../utils/supabase').supabase;
      if (!db) throw new Error('Banco indisponível');
      const { data: configuracaoModulo, error } = await db.from('modulos')
        .select('slug, escopo_campus').eq('slug', modulo).eq('ativo', true).maybeSingle();
      if (error || !configuracaoModulo || !['isolado', 'compartilhado'].includes(configuracaoModulo.escopo_campus)) {
        throw new ErroCampus(503, 'campus_modulo_nao_configurado', 'O escopo de campus deste módulo ainda não está configurado.');
      }
      // Compartilhado conserva autorização/PII e ainda exige contrato de cobertura.
      req.campus = Object.freeze({ ...contexto, modulo, escopo_modulo: configuracaoModulo.escopo_campus });
      return next();
    } catch (erro) {
      return responderErroCampus(res, erro);
    }
  };
}

module.exports = { criarMiddlewareCampus };
