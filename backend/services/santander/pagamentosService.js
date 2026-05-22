// Service de Pagamentos · boletos, tributos, concessionarias, DARFs
//
// Linha digitavel:
//   47 digitos · boleto bancario (banco emissor diferente de 8)
//   48 digitos · tributo/concessionaria (comeca com 8)
//
// Conversao linha → codigo de barras (44 digitos): segue norma FEBRABAN.
//
// Endpoints variam por produto Santander (cada um tem seu silo). Override:
//   SANTANDER_PAGTO_BASE_PATH (default '/payments/v1')
//   SANTANDER_PAGTO_BOLETO_PATH   (override '/bank_slips/v1/payments')
//   SANTANDER_PAGTO_TRIBUTO_PATH  (override '/tax_payments/v1/payments')
//   SANTANDER_PAGTO_CONCESS_PATH  (override '/concessionary_bills/v1/payments')
//
// Toggle:
//   SANTANDER_PAGTO_ENABLED=true

const { callApi } = require('./httpClient');

const ENABLED = (process.env.SANTANDER_PAGTO_ENABLED || 'false').toLowerCase() === 'true';

const OVERRIDE_BOLETO = process.env.SANTANDER_PAGTO_BOLETO_PATH || '';
const OVERRIDE_TRIBUTO = process.env.SANTANDER_PAGTO_TRIBUTO_PATH || '';
const OVERRIDE_CONCESS = process.env.SANTANDER_PAGTO_CONCESS_PATH || '';

// Lista de paths plausiveis por tipo · primeiro que retornar !=404 ganha
const PATHS_POR_TIPO = {
  boleto: OVERRIDE_BOLETO ? [OVERRIDE_BOLETO] : [
    '/payments/v1/bank_slips',
    '/bank_slips_payment/v1/payments',
    '/payment_bank_slip/v1/payments',
    '/bank_slips/v1/payments',
    '/pagamento_boletos/v1/payments',
    '/banking/v1/payments/bank-slips',
  ],
  tributo: OVERRIDE_TRIBUTO ? [OVERRIDE_TRIBUTO] : [
    '/payments/v1/tax_payments',
    '/tax_payments/v1/payments',
    '/payment_tax/v1/payments',
    '/pagamento_tributos/v1/payments',
    '/banking/v1/payments/taxes',
  ],
  concessionaria: OVERRIDE_CONCESS ? [OVERRIDE_CONCESS] : [
    '/payments/v1/utility_bills',
    '/concessionary_bills/v1/payments',
    '/payment_concessionary/v1/payments',
    '/pagamento_concessionarias/v1/payments',
    '/banking/v1/payments/utilities',
  ],
};

const pathFuncionando = {};

function isEnabled() { return ENABLED; }
function getPathsTestados() { return PATHS_POR_TIPO; }
function getPathFuncionando(tipo) { return pathFuncionando[tipo] || null; }

function pathsParaTipo(tipo) {
  if (tipo === 'darf') tipo = 'tributo';
  return PATHS_POR_TIPO[tipo] || PATHS_POR_TIPO.boleto;
}

function isPathNaoExiste(err) {
  const msg = (err.message || '').toLowerCase();
  return msg.includes('404')
    || msg.includes('applicationnotfound')
    || msg.includes('unable to identify proxy')
    || msg.includes('not found')
    || msg.includes('resource not found');
}

async function tentarComPaths(tipo, fn) {
  const cached = pathFuncionando[tipo];
  if (cached) return fn(cached);
  const paths = pathsParaTipo(tipo);
  let ultimoErro = null;
  for (const p of paths) {
    try {
      const res = await fn(p);
      pathFuncionando[tipo] = p;
      return res;
    } catch (e) {
      ultimoErro = e;
      if (!isPathNaoExiste(e)) throw e;
    }
  }
  throw ultimoErro || new Error(`Nenhum path Santander para ${tipo} respondeu`);
}

/**
 * Normaliza linha digitavel · remove pontos, espacos, hifens.
 */
function normalizar(linha) {
  return String(linha || '').replace(/\D/g, '');
}

/**
 * Detecta o tipo da linha digitavel.
 * - 48 digitos comecando com 8 → tributo/concessionaria
 * - 47 digitos → boleto bancario
 */
function detectarTipo(linhaNorm) {
  if (linhaNorm.length === 48 && linhaNorm.startsWith('8')) {
    // Posicao 1 (0-indexed) diz o segmento:
    // 1=prefeituras 2=saneamento 3=energia/gas 4=telecom
    // 5=ordens publicas 6=outros 7=multas/transito 9=concessionarias
    const seg = linhaNorm[1];
    if (seg === '5' || seg === '6' || seg === '7') return 'tributo';
    return 'concessionaria';
  }
  if (linhaNorm.length === 47) return 'boleto';
  return null;
}

/**
 * Converte linha digitavel (47) em codigo de barras (44 digitos).
 * Boleto: layout
 *   AAABC.CCCCX DDDDD.DDDDDY EEEEE.EEEEEZ K UUUUVVVVVVVVVV
 *   A = banco (3) + B = moeda (1) + C+D+E (campos 5-5-5+5-5-5+5-5-5+digit)
 *   Codigo de barras: AAA + B + K + UUUU + VVVVVVVVVV + C + D + E
 */
function boletoLinhaParaBarcode(linhaNorm) {
  if (linhaNorm.length !== 47) return null;
  const banco = linhaNorm.slice(0, 3);
  const moeda = linhaNorm[3];
  const campo1 = linhaNorm.slice(4, 9);   // posicoes 4-8 (5 chars)
  const campo2 = linhaNorm.slice(10, 15); // pula DV (pos 9)
  const campo3 = linhaNorm.slice(16, 21);
  const campo4 = linhaNorm.slice(22, 27);
  const campo5 = linhaNorm.slice(28, 33);
  const dvGeral = linhaNorm[33];
  const fatorVenc = linhaNorm.slice(34, 38);
  const valor = linhaNorm.slice(38, 47);
  return `${banco}${moeda}${dvGeral}${fatorVenc}${valor}${campo1}${campo2}${campo3}${campo4}${campo5}`;
}

/**
 * Converte linha digitavel de tributo (48) em codigo de barras (44).
 * Tributo: 4 grupos de 12 com DV ao fim de cada → tira os 4 DVs.
 */
function tributoLinhaParaBarcode(linhaNorm) {
  if (linhaNorm.length !== 48) return null;
  const g1 = linhaNorm.slice(0, 11);
  const g2 = linhaNorm.slice(12, 23);
  const g3 = linhaNorm.slice(24, 35);
  const g4 = linhaNorm.slice(36, 47);
  return `${g1}${g2}${g3}${g4}`;
}

/**
 * Extrai valor da linha digitavel.
 * - Boleto (47): posicoes 38-46 (9 digitos) em centavos
 * - Tributo (48): posicoes 4-14 (11 digitos) em centavos (apos os primeiros 4)
 */
function valorDaLinha(linhaNorm) {
  if (linhaNorm.length === 47) {
    const cents = Number(linhaNorm.slice(37, 47)) || 0;
    return cents / 100;
  }
  if (linhaNorm.length === 48) {
    const cents = Number(linhaNorm.slice(4, 15)) || 0;
    return cents / 100;
  }
  return 0;
}

/**
 * Extrai vencimento (boleto · base 07/10/1997 + fator).
 */
function vencimentoDaLinha(linhaNorm) {
  if (linhaNorm.length !== 47) return null;
  const fator = Number(linhaNorm.slice(33, 37));
  if (!fator || fator < 1000) return null;
  // Base FEBRABAN: 07/10/1997. Apos 22/02/2025 reset opcional · usar referencia simples
  const base = new Date(Date.UTC(1997, 9, 7));
  base.setUTCDate(base.getUTCDate() + fator);
  return base.toISOString().slice(0, 10);
}

/**
 * Parser completo · entrada string, saida `{tipo, valor, vencimento, codigoBarras, linha}`.
 */
function parseLinha(linha) {
  const linhaNorm = normalizar(linha);
  const tipo = detectarTipo(linhaNorm);
  if (!tipo) {
    throw new Error(`Linha digitavel invalida (${linhaNorm.length} digitos · espera 47 ou 48)`);
  }
  const codigoBarras = tipo === 'boleto'
    ? boletoLinhaParaBarcode(linhaNorm)
    : tributoLinhaParaBarcode(linhaNorm);
  return {
    tipo,
    linha_digitavel: linhaNorm,
    codigo_barras: codigoBarras,
    valor: valorDaLinha(linhaNorm),
    vencimento: vencimentoDaLinha(linhaNorm),
  };
}

/**
 * Cria pagamento via API Santander.
 * tipo · 'boleto' | 'tributo' | 'concessionaria' | 'darf'
 */
async function criarPagamento({ tipo, linhaDigitavel, codigoBarras, valor, dataPagamento, descricao, beneficiarioNome }) {
  if (!ENABLED) throw new Error('Pagamentos desabilitado · setar SANTANDER_PAGTO_ENABLED=true');
  if (!linhaDigitavel) throw new Error('linhaDigitavel obrigatorio');
  if (!dataPagamento) throw new Error('dataPagamento obrigatorio');
  if (!valor || valor <= 0) throw new Error('valor invalido');

  const body = {
    paymentDate: dataPagamento,
    amount: Number(valor).toFixed(2),
    digitableLine: linhaDigitavel,
    barCode: codigoBarras || undefined,
    description: descricao ? String(descricao).slice(0, 100) : undefined,
    beneficiary: beneficiarioNome ? { name: String(beneficiarioNome).slice(0, 100) } : undefined,
  };

  return tentarComPaths(tipo, p => callApi(p, { method: 'POST', body }));
}

async function consultarPagamento({ tipo, paymentId }) {
  if (!ENABLED) throw new Error('Pagamentos desabilitado');
  return tentarComPaths(tipo, p =>
    callApi(`${p}/${encodeURIComponent(paymentId)}`, { method: 'GET' })
  );
}

async function cancelarPagamento({ tipo, paymentId }) {
  if (!ENABLED) throw new Error('Pagamentos desabilitado');
  return tentarComPaths(tipo, p =>
    callApi(`${p}/${encodeURIComponent(paymentId)}`, { method: 'DELETE' })
  );
}

/**
 * Mapeia status Santander → status interno.
 */
function mapStatus(s) {
  if (!s) return 'PENDENTE';
  const norm = String(s).toUpperCase();
  if (['EFETIVADO', 'EFFECTED', 'PAID', 'CONCLUIDO', 'CONCLUDED'].includes(norm)) return 'EFETIVADO';
  if (['AGENDADO', 'SCHEDULED'].includes(norm)) return 'AGENDADO';
  if (['CANCELADO', 'CANCELLED', 'CANCELED'].includes(norm)) return 'CANCELADO';
  if (['REJEITADO', 'REJECTED', 'FAILED'].includes(norm)) return 'REJEITADO';
  if (['PENDING_APPROVAL', 'AGUARDANDO_APROVACAO', 'WAITING_APPROVAL'].includes(norm)) return 'AGUARDANDO_APROVACAO';
  return norm;
}

module.exports = {
  isEnabled,
  parseLinha,
  detectarTipo,
  normalizar,
  boletoLinhaParaBarcode,
  tributoLinhaParaBarcode,
  valorDaLinha,
  vencimentoDaLinha,
  criarPagamento,
  consultarPagamento,
  cancelarPagamento,
  mapStatus,
  getPathsTestados,
  getPathFuncionando,
};
