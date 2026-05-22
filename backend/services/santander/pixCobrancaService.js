// Service de Cobranca PIX (QR Code) via API Santander
//
// O Santander expoe PIX Cobranca em paths que VARIAM por contrato/produto.
// Padrao BACEN/Open Finance e' /pix/v1/cob/{txid} mas o Trust Open Sandbox
// pode mapear o produto em paths como:
//   - /cob_management/v1/cobs/{txid}
//   - /pix_cobranca/v1/cob/{txid}
//   - /collection_management/v1/cob/{txid}
//
// Estrategia: tenta multiplos paths em ordem · primeiro que retornar !=404
// vira o "path funcionando" e fica em cache de memoria.
//
// Toggle e overrides:
//   SANTANDER_PIX_COB_ENABLED=true
//   SANTANDER_PIX_COB_BASE_PATH=/pix/v1   · forca path especifico
//   SANTANDER_PIX_COB_CHAVE=<chave PIX>

const crypto = require('crypto');
const { callApi } = require('./httpClient');

const ENABLED = (process.env.SANTANDER_PIX_COB_ENABLED || 'false').toLowerCase() === 'true';
const BASE_PATH_OVERRIDE = process.env.SANTANDER_PIX_COB_BASE_PATH || '';
const CHAVE_PIX = process.env.SANTANDER_PIX_COB_CHAVE || process.env.SANTANDER_CNPJ_TITULAR || '';

// Paths plausiveis · ordem de tentativa
const PIX_COB_PATHS = BASE_PATH_OVERRIDE ? [{ base: BASE_PATH_OVERRIDE, cobSegment: 'cob' }] : [
  { base: '/pix/v1',                     cobSegment: 'cob' },
  { base: '/cob_management/v1',          cobSegment: 'cobs' },
  { base: '/cob_management/v1',          cobSegment: 'cob' },
  { base: '/pix_cobranca/v1',            cobSegment: 'cob' },
  { base: '/pix-cobranca/v1',            cobSegment: 'cob' },
  { base: '/collection_management/v1',   cobSegment: 'cob' },
  { base: '/pix_charge/v1',              cobSegment: 'cob' },
  { base: '/banking/v1/pix',             cobSegment: 'cob' },
];

let pathFuncionando = null;

function isEnabled() { return ENABLED; }
function getChave() { return CHAVE_PIX; }
function getPathsTestados() { return PIX_COB_PATHS; }
function getPathFuncionando() { return pathFuncionando; }

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
        const ag = new Error(`${e.message}\n\nPaths tentados antes deste:\n${errosPorPath.map((x, i) => `  ${i+1}. [${x.status}] ${x.path}`).join('\n')}`);
        ag.status = e.status;
        ag.body = e.body;
        ag.tentativas = errosPorPath;
        throw ag;
      }
    }
  }
  const ag = new Error(
    `Nenhum dos ${PIX_COB_PATHS.length} paths Santander PIX Cobranca respondeu. Tentativas:\n` +
    errosPorPath.map((x, i) => `  ${i+1}. [${x.status}] ${x.path}`).join('\n') +
    `\n\nUltimo erro: ${errosPorPath[errosPorPath.length-1]?.msg || ''}`
  );
  ag.tentativas = errosPorPath;
  throw ag;
}

async function criarCobranca({ txid, valor, devedor, solicitacao, expiracao = 3600 }) {
  if (!ENABLED) throw new Error('PIX Cobranca desabilitado · setar SANTANDER_PIX_COB_ENABLED=true');
  if (!CHAVE_PIX) throw new Error('SANTANDER_PIX_COB_CHAVE nao configurada');
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
