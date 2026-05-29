// Service de Cobranca PIX (QR Code) via API Itau (PIX Recebimentos)
//
// Padrao BACEN/Open Finance · o Itau expoe a cobranca imediata em
// `/pix_recebimentos/v2/cob/{txid}` (PUT pra criar com txid escolhido).
// Mantemos a estrategia multi-path (igual Santander) caso o contrato mapeie
// o produto em outro path · o primeiro que responder !=404 vira o cache.
//
// Toggle e overrides:
//   ITAU_PIX_COB_ENABLED=true
//   ITAU_PIX_COB_BASE_PATH=/pix_recebimentos/v2   · forca path especifico
//   ITAU_PIX_COB_CHAVE=<chave PIX recebedora>

const crypto = require('crypto');
const { callApi } = require('./httpClient');

const ENABLED = (process.env.ITAU_PIX_COB_ENABLED || 'false').toLowerCase() === 'true';
const BASE_PATH_OVERRIDE = process.env.ITAU_PIX_COB_BASE_PATH || '';
const CHAVE_PIX = process.env.ITAU_PIX_COB_CHAVE || process.env.ITAU_CNPJ_TITULAR || '';

// Paths plausiveis · ordem de tentativa. Itau usa /pix_recebimentos/v2 por padrao.
const DEFAULT_PIX_COB_PATHS = [
  { base: '/pix_recebimentos/v2', cobSegment: 'cob' },
  { base: '/pix_recebimentos/v1', cobSegment: 'cob' },
  { base: '/pix/v2',              cobSegment: 'cob' },
  { base: '/pix/v1',              cobSegment: 'cob' },
];

const PIX_COB_PATHS = BASE_PATH_OVERRIDE
  ? [
      { base: BASE_PATH_OVERRIDE, cobSegment: 'cob' },
      ...DEFAULT_PIX_COB_PATHS.filter(p => p.base !== BASE_PATH_OVERRIDE),
    ]
  : DEFAULT_PIX_COB_PATHS;

let pathFuncionando = null;

function isEnabled() { return ENABLED; }
function getChave() { return CHAVE_PIX; }
function getPathsTestados() { return PIX_COB_PATHS; }
function getPathFuncionando() { return pathFuncionando; }

// txid PIX · [A-Za-z0-9]{26,35}
function gerarTxid(prefix = 'cbrio') {
  const random = crypto.randomBytes(16).toString('hex').slice(0, 26);
  const out = `${prefix}${random}`.replace(/[^A-Za-z0-9]/g, '').slice(0, 35);
  if (out.length < 26) return (out + crypto.randomBytes(20).toString('hex')).slice(0, 26);
  return out;
}

function isPathNaoExiste(err) {
  const msg = (err.message || '').toLowerCase();
  return msg.includes('404')
    || msg.includes('applicationnotfound')
    || msg.includes('unable to identify proxy')
    || msg.includes('not found')
    || msg.includes('resource not found');
}

async function tentarComPaths(fn) {
  if (pathFuncionando) return fn(pathFuncionando);
  const errosPorPath = [];
  for (const p of PIX_COB_PATHS) {
    try {
      const res = await fn(p);
      pathFuncionando = p;
      return res;
    } catch (e) {
      errosPorPath.push({ path: `${p.base}/${p.cobSegment}`, status: e.status || '?', msg: (e.message || '').slice(0, 120) });
      if (!isPathNaoExiste(e)) {
        const ag = new Error(`${e.message}\n\nPaths tentados antes deste:\n${errosPorPath.map((x, i) => `  ${i + 1}. [${x.status}] ${x.path}`).join('\n')}`);
        ag.status = e.status;
        ag.body = e.body;
        ag.tentativas = errosPorPath;
        throw ag;
      }
    }
  }
  const ag = new Error(
    `Nenhum dos ${PIX_COB_PATHS.length} paths Itau PIX Cobranca respondeu. Tentativas:\n` +
    errosPorPath.map((x, i) => `  ${i + 1}. [${x.status}] ${x.path}`).join('\n') +
    `\n\nUltimo erro: ${errosPorPath[errosPorPath.length - 1]?.msg || ''}`
  );
  ag.tentativas = errosPorPath;
  throw ag;
}

async function criarCobranca({ txid, valor, devedor, solicitacao, expiracao = 3600 }) {
  if (!ENABLED) throw new Error('PIX Cobranca desabilitado · setar ITAU_PIX_COB_ENABLED=true');
  if (!CHAVE_PIX) throw new Error('ITAU_PIX_COB_CHAVE nao configurada');
  if (!txid) throw new Error('txid obrigatorio');
  if (!valor || valor <= 0) throw new Error('valor invalido');

  const body = {
    calendario: { expiracao: Math.max(60, Math.floor(expiracao)) },
    valor: { original: Number(valor).toFixed(2) },
    chave: CHAVE_PIX,
  };
  if (devedor) {
    const doc = String(devedor.cpf || devedor.cnpj || '').replace(/\D/g, '');
    if (doc.length === 11) body.devedor = { cpf: doc, nome: devedor.nome || 'Pagador' };
    else if (doc.length === 14) body.devedor = { cnpj: doc, nome: devedor.nome || 'Pagador' };
  }
  if (solicitacao) body.solicitacaoPagador = String(solicitacao).slice(0, 140);

  return tentarComPaths(p =>
    callApi(`${p.base}/${p.cobSegment}/${txid}`, { method: 'PUT', body })
  );
}

async function consultarCobranca(txid) {
  if (!ENABLED) throw new Error('PIX Cobranca desabilitado');
  return tentarComPaths(p =>
    callApi(`${p.base}/${p.cobSegment}/${txid}`, { method: 'GET' })
  );
}

async function cancelarCobranca(txid) {
  if (!ENABLED) throw new Error('PIX Cobranca desabilitado');
  return tentarComPaths(p =>
    callApi(`${p.base}/${p.cobSegment}/${txid}`, {
      method: 'PATCH',
      body: { status: 'REMOVIDA_PELO_USUARIO_RECEBEDOR' },
    })
  );
}

async function listarCobrancas({ inicio, fim, cpf, cnpj, status }) {
  if (!ENABLED) throw new Error('PIX Cobranca desabilitado');
  return tentarComPaths(p =>
    callApi(`${p.base}/${p.cobSegment}`, {
      method: 'GET',
      query: {
        inicio: inicio || undefined,
        fim: fim || undefined,
        cpf: cpf || undefined,
        cnpj: cnpj || undefined,
        status: status || undefined,
      },
    })
  );
}

module.exports = {
  isEnabled, getChave, gerarTxid,
  criarCobranca, consultarCobranca, cancelarCobranca, listarCobrancas,
  getPathsTestados, getPathFuncionando, PIX_COB_PATHS,
};
