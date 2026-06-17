// Importa o Balanço (planilha exportada do sistema financeiro legado) para
// fin_transacoes. Mesma lógica de mapeamento do script
// backend/scripts/importar_balanco.cjs, exposta como serviço pra ser usada
// pelo upload em POST /api/financeiro-v2/importar/balanco.
//
// Idempotente: a dedup é por codigo_legado UNIQUE (a RPC balanco_importar_lote
// só insere o que faltar). Pode subir a mesma planilha várias vezes · só entra
// o que é novo.
//
// O mapeamento (E→receita / S→despesa, abs(valor), classe_movimento via
// fin_classificar_movimento que respeita a regra "empréstimo não é receita
// ordinária", get-or-create de plano/centro/conta/grupo) vive todo na RPC
// balanco_importar_linha — este serviço só parseia e delega.

const XLSX = require('xlsx');
const { supabase } = require('../utils/supabase');

const BATCH_SIZE = 500;

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

function detectarLayout(header) {
  const idx = (label) => header.findIndex((h) => norm(h) === norm(label));
  return {
    codigo: idx('Código'),
    cadastro: idx('Cadastro'),
    data: idx('Data'),
    tipo: idx('Tipo (E/S)'),
    competencia: idx('Competência'),
    valor: idx('Valor(R$)'),
    plano_de_contas: idx('Plano de Contas'),
    centro_de_custo: idx('Centro de Custo'),
    origem_destino: idx('Origem/Destino'),
    grupo_movimento: idx('Grupo do Movimento'),
    cn_pdc: idx('Cód/Nome do Plano de Contas'),
    cod_pdc: idx('Cod. Plano de Contas'),
    historico: idx('Historico'),
    parcela: idx('Parcela'),
    cn_cc: idx('Cód/Nome do Centro de Custo'),
    cod_cc: idx('Cod. Centro de Custo'),
    designacao: idx('Designação'),
    forma_pagto: idx('Forma Pagto'),
    conta_caixa: idx('Conta/Caixa'),
    user_name: idx('User Name'),
  };
}

function extrairCodigo(cnPdc, codPdc) {
  if (codPdc && /^[\d.]+$/.test(String(codPdc).trim())) return String(codPdc).trim();
  if (cnPdc) {
    const m = String(cnPdc).match(/^([\d.]+)\s*-\s*(.+)$/);
    if (m) return m[1];
  }
  return null;
}

function extrairNomePdc(cnPdc, planoTexto) {
  if (cnPdc) {
    const m = String(cnPdc).match(/^[\d.]+\s*-\s*(.+)$/);
    if (m) return m[1].trim();
    return String(cnPdc).trim();
  }
  return planoTexto ? String(planoTexto).trim() : null;
}

function dataToISO(v) {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  if (typeof v === 'string') {
    const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    return v.slice(0, 10);
  }
  return null;
}

function dataToTimestamp(v) {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return new Date(Date.UTC(d.y, d.m - 1, d.d, d.H || 0, d.M || 0, Math.floor(d.S || 0))).toISOString();
  }
  return null;
}

// Lê o buffer do XLSX e retorna { payloads, invalidas }.
function parseBuffer(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true, cellNF: false, cellStyles: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return { payloads: [], invalidas: 0 };
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
  if (rows.length < 2) return { payloads: [], invalidas: 0 };

  const header = rows[0];
  const layout = detectarLayout(header);
  if (layout.codigo < 0 || layout.valor < 0 || layout.data < 0 || layout.tipo < 0) {
    throw new Error('Planilha não reconhecida · faltam colunas obrigatórias (Código, Data, Tipo (E/S), Valor(R$)). Use o export padrão do balanço.');
  }

  const payloads = [];
  let invalidas = 0;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r[layout.codigo] == null || String(r[layout.codigo]).trim() === '') continue;

    const data = dataToISO(r[layout.data]);
    const valor = r[layout.valor];
    // data_competencia é NOT NULL e valor é obrigatório · linha sem isso não insere
    if (!data || valor == null || valor === '') { invalidas++; continue; }

    const codPdc = layout.cod_pdc >= 0 ? r[layout.cod_pdc] : null;
    const cnPdc = layout.cn_pdc >= 0 ? r[layout.cn_pdc] : null;
    const planoTxt = layout.plano_de_contas >= 0 ? r[layout.plano_de_contas] : null;

    const codCC = layout.cod_cc >= 0 ? r[layout.cod_cc] : null;
    const cnCC = layout.cn_cc >= 0 ? r[layout.cn_cc] : null;
    const centroTxt = layout.centro_de_custo >= 0 ? r[layout.centro_de_custo] : null;

    payloads.push({
      codigo: Number(r[layout.codigo]),
      cadastro: dataToTimestamp(r[layout.cadastro]),
      data,
      tipo: r[layout.tipo],
      valor,
      plano_codigo: extrairCodigo(cnPdc, codPdc),
      plano_nome: extrairNomePdc(cnPdc, planoTxt),
      centro_codigo: extrairCodigo(cnCC, codCC),
      centro_nome: extrairNomePdc(cnCC, centroTxt),
      grupo_movimento: layout.grupo_movimento >= 0 ? r[layout.grupo_movimento] : null,
      origem_destino: layout.origem_destino >= 0 ? r[layout.origem_destino] : null,
      historico: layout.historico >= 0 ? r[layout.historico] : null,
      forma_pagamento: layout.forma_pagto >= 0 ? r[layout.forma_pagto] : null,
      conta_caixa: layout.conta_caixa >= 0 ? r[layout.conta_caixa] : null,
      username: layout.user_name >= 0 ? r[layout.user_name] : null,
    });
  }
  return { payloads, invalidas };
}

// Filtra os codigos que já existem (pré-filtro de performance · a RPC também
// é idempotente). PostgREST limita ~1000 valores no IN · particiona em 500.
async function filtrarJaExistentes(payloads) {
  if (!payloads.length) return [];
  const existentes = new Set();
  const codigos = payloads.map((p) => p.codigo);
  for (let i = 0; i < codigos.length; i += 500) {
    const chunk = codigos.slice(i, i + 500);
    const { data, error } = await supabase
      .from('fin_transacoes')
      .select('codigo_legado')
      .in('codigo_legado', chunk);
    if (error) throw new Error('Erro consultando lançamentos existentes: ' + error.message);
    (data || []).forEach((r) => existentes.add(Number(r.codigo_legado)));
  }
  return payloads.filter((p) => !existentes.has(p.codigo));
}

async function inserirLote(payloads) {
  let inseridas = 0;
  const erros = [];
  for (let i = 0; i < payloads.length; i += BATCH_SIZE) {
    const chunk = payloads.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.rpc('balanco_importar_lote', { p_linhas: chunk });
    if (error) { erros.push(error.message); continue; }
    inseridas += chunk.length;
  }
  return { inseridas, erros };
}

// Importa o balanço a partir do buffer do arquivo. Retorna o resumo.
async function importarBalanco(buffer) {
  const { payloads, invalidas } = parseBuffer(buffer);
  if (!payloads.length) {
    return { lidas: 0, invalidas, ja_existentes: 0, novas: 0, inseridas: 0, erros: [], periodo: null };
  }

  const datas = payloads.map((p) => p.data).filter(Boolean).sort();
  const periodo = datas.length ? { inicio: datas[0], fim: datas[datas.length - 1] } : null;

  const novos = await filtrarJaExistentes(payloads);
  const { inseridas, erros } = await inserirLote(novos);

  return {
    lidas: payloads.length,
    invalidas,
    ja_existentes: payloads.length - novos.length,
    novas: novos.length,
    inseridas,
    erros,
    periodo,
  };
}

module.exports = { importarBalanco, parseBuffer };
