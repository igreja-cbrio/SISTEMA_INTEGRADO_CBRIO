const { ErroCampus, responderErroCampus } = require('../services/campusContexto');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Somente identidade própria, bootstrap e telemetria sem leitura nominal.
// /auth/users NÃO entra: lista pessoas da rede inteira.
const BOOTSTRAP = new Set([
  'GET /api/campus/contexto',
  'GET /api/auth/me',
  'GET /api/auth/my-permissions',
  'PATCH /api/auth/profile',
  'POST /api/auth/profile/foto',
  'POST /api/telemetry/web-vitals',
  'GET /api/health',
  'GET /api/health/db',
]);
// Domínios que permanecem centrais por decisão do plano. Seus próprios guards
// continuam obrigatórios; esta lista não concede permissão a nenhum usuário.
const CENTRAIS = Object.freeze(['/api/rh', '/api/financeiro', '/api/financeiro-v2', '/api/patrimonio']);

function caminhoDaRequisicao(req) {
  // originalUrl conserva /api quando o middleware é montado em app.use('/api').
  return String(req.originalUrl || `${req.baseUrl || ''}${req.path || ''}`).split('?')[0].replace(/\/$/, '');
}

function criarCampusSuperficie({ supabase, cobertura = [] } = {}) {
  // Ampliações devem nomear método+caminho exatos. Nunca aceitar regex/prefixo
  // para declarar prontos todos os futuros endpoints de um módulo.
  if (!Array.isArray(cobertura)) throw new Error('A cobertura de campus deve listar rotas exatas.');
  const certificadas = cobertura.map(rota => {
    if (!rota || !['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(rota.metodo)
      || typeof rota.caminho !== 'string' || !/^\/api\/[a-zA-Z0-9_/:-]+$/.test(rota.caminho)
      || rota.caminho.includes('//') || rota.caminho.endsWith('/')) {
      throw new Error('Cobertura de campus inválida: informe método e caminho exatos.');
    }
    const partes = rota.caminho.split('/');
    if (partes.some(p => p.includes(':') && ![':id', ':temporada', ':data', ':arquivo', ':token'].includes(p))) throw new Error('Parâmetro de cobertura inválido.');
    const pattern = partes.map(p => p === ':id'
      ? '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
      : p === ':token' ? '[A-Za-z0-9_-]{1,256}'
      : p === ':temporada' ? '[A-Za-z0-9_-]{1,64}'
        : p === ':data' ? '[0-9]{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])'
          : p === ':arquivo' ? '[A-Za-z0-9_-]{1,160}\\.(?:jpg|jpeg|png|webp)' : p).join('/');
    return { metodo: rota.metodo, regex: new RegExp(`^${pattern}$`) };
  });
  return async function protegerSuperficieCampus(req, res, next) {
    try {
      const db = supabase || require('../utils/supabase').supabase;
      if (!db) throw new Error('Banco indisponível');
      // Sem cache de estado: rollback em memória não reabre superfície legada.
      const { data: config, error } = await db.from('app_campus_config')
        .select('estado, campus_legado_id').eq('id', true).maybeSingle();
      if (error || !config || !['preparacao', 'ensaio', 'ativo'].includes(config.estado)
        || !UUID.test(config.campus_legado_id || '')) {
        throw new ErroCampus(503, 'campus_configuracao_pendente', 'A configuração de campus ainda não está disponível.');
      }
      if (config.estado === 'preparacao') {
        const solicitado = req.headers?.['x-campus-id'];
        if (solicitado !== undefined && (typeof solicitado !== 'string'
          || solicitado.trim().toLowerCase() !== config.campus_legado_id.toLowerCase())) {
          throw new ErroCampus(409, 'campus_ainda_nao_habilitado', 'Somente o campus atual está disponível durante a preparação.');
        }
        return next();
      }
      const caminho = caminhoDaRequisicao(req);
      const chave = `${req.method} ${caminho}`;
      const central = CENTRAIS.some(prefixo => caminho === prefixo || caminho.startsWith(`${prefixo}/`));
      if (BOOTSTRAP.has(chave) || central || certificadas.some(r => r.metodo === req.method && r.regex.test(caminho))) return next();
      throw new ErroCampus(503, 'campus_operacao_nao_habilitada', 'Esta operação ainda não está habilitada para múltiplos campi.');
    } catch (erro) {
      return responderErroCampus(res, erro);
    }
  };
}

module.exports = { criarCampusSuperficie };
