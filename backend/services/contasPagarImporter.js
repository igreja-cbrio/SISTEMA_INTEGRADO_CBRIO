// Importador da planilha de Contas a Pagar do sistema financeiro externo (Toscano)
// → fin_contas_pagar.
//
// Layout (export "Cp_Toscano.xlsx" · 1 aba · 1 linha por título):
//   Código | Vencimento | Baixa | Nº do Documento | Valor(R$) | Plano de Contas |
//   Histórico | Grupo de Movimento | Credor | Planejada | Paga com cartão de crédito |
//   Cod Plano de Contas | Centro de Custo | Cod Centro de Custo | Juros(R$) | Mora(R$) |
//   Multa(R$) | Desconto(R$) | Valor Pago(R$) | Forma Pagto | ContaCaixa
//
// Regras:
//   - "Baixa" preenchida → status='pago' (baixada) · vazia → 'pendente' (em aberto).
//   - Última linha de TOTAL (sem Vencimento e sem Credor) é descartada.
//   - "Cod Plano de Contas"/"Cod Centro de Custo" batem 1:1 com fin_plano_contas/
//     fin_centros_custo → resolve os FKs em memória (catálogos < 1000 linhas).
//   - Idempotente: import_chave = '<origem>:<Código>'. Reimportar ATUALIZA o título
//     (mantém a planilha como fonte de verdade · uma conta aberta que foi baixada
//     passa a 'pago' no reimport).

const XLSX = require('xlsx');
const crypto = require('crypto');
const { supabase } = require('../utils/supabase');

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();

const txt = (v) => (v === null || v === undefined || String(v).trim() === '') ? null : String(v).trim();

function toISO(v) {
  if (!v) return null;
  if (v instanceof Date && !isNaN(v)) {
    // normaliza pro fuso local da planilha (evita -1 dia por UTC)
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  }
  const s = String(v).trim();
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (br) {
    const [, d, m, y] = br;
    const yy = y.length === 2 ? `20${y}` : y;
    return `${yy}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}

function toNum(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.').replace(/[^0-9.\-]/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function toBool(v) {
  if (v === null || v === undefined || v === '') return null;
  const s = norm(v);
  if (['VERDADEIRO', 'TRUE', 'SIM', 'V', '1'].includes(s)) return true;
  if (['FALSO', 'FALSE', 'NAO', 'F', '0'].includes(s)) return false;
  return null;
}

const anoDe = (iso) => (iso && /^\d{4}/.test(iso)) ? Number(iso.slice(0, 4)) : null;

// Acha a linha de cabeçalho procurando os rótulos esperados (robusto a offset)
function acharHeader(rows) {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const cels = (rows[i] || []).map(norm);
    const temVenc = cels.some((c) => c === 'VENCIMENTO');
    const temValor = cels.some((c) => c.startsWith('VALOR') && !c.startsWith('VALOR PAGO'));
    const temCredor = cels.some((c) => c === 'CREDOR');
    if (temVenc && (temValor || temCredor)) return i;
  }
  return -1;
}

// Lê o buffer → títulos normalizados (sem gravar)
function parseBuffer(buffer, origem = 'toscano') {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true, cellNF: false, cellStyles: false });
  const sheetName = wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: null, raw: true });
  const h = acharHeader(rows);
  if (h < 0) return [];

  // Mapa cabeçalho normalizado → índice da coluna
  const idx = {};
  (rows[h] || []).forEach((cel, i) => {
    const k = norm(cel);
    if (k && !(k in idx)) idx[k] = i;
  });
  // resolve o índice de uma coluna por candidatos exatos (1º que existir)
  const at = (...cands) => { for (const c of cands) if (c in idx) return idx[c]; return -1; };
  // coluna cujo cabeçalho CONTÉM o termo (fallback)
  const atInc = (termo) => {
    const k = Object.keys(idx).find((kk) => kk.includes(termo));
    return k ? idx[k] : -1;
  };

  const iCodigo  = at('CODIGO', 'CÓDIGO');
  const iVenc    = at('VENCIMENTO');
  const iBaixa   = at('BAIXA');
  const iDoc     = atInc('DOCUMENTO');
  const iValor   = at('VALOR(R$)', 'VALOR (R$)', 'VALOR');
  const iPlanoNm = at('PLANO DE CONTAS');
  const iHist    = at('HISTORICO', 'HISTÓRICO');
  const iGrupo   = at('GRUPO DE MOVIMENTO');
  const iCredor  = at('CREDOR');
  const iPlanej  = at('PLANEJADA');
  const iCartao  = atInc('CARTAO');
  const iPlanoCd = at('COD PLANO DE CONTAS');
  const iCentroNm= at('CENTRO DE CUSTO');
  const iCentroCd= at('COD CENTRO DE CUSTO');
  const iJuros   = at('JUROS(R$)', 'JUROS');
  const iMora    = at('MORA(R$)', 'MORA');
  const iMulta   = at('MULTA(R$)', 'MULTA');
  const iDesc    = at('DESCONTO(R$)', 'DESCONTO');
  const iForma   = at('FORMA PAGTO', 'FORMA PAGAMENTO', 'FORMA DE PAGAMENTO');
  const iConta   = at('CONTACAIXA', 'CONTA CAIXA');

  const get = (r, i) => (i >= 0 ? r[i] : null);
  const titulos = [];

  for (let r = h + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const venc = toISO(get(row, iVenc));
    const credor = txt(get(row, iCredor));
    const valor = toNum(get(row, iValor));
    const codigo = toNum(get(row, iCodigo));
    // descarta linha de TOTAL (sem vencimento e sem credor) e linhas vazias
    if (!venc && !credor) continue;
    if (valor === null && !credor && !venc) continue;

    const baixa = toISO(get(row, iBaixa));
    const planoNome = txt(get(row, iPlanoNm));
    const historico = txt(get(row, iHist));
    const ano = anoDe(venc) || anoDe(baixa);
    const importChave = codigo != null
      ? `${origem}:${Math.round(codigo)}`
      : `${origem}:hash:${crypto.createHash('md5').update([venc, credor, valor, planoNome, r].join('|')).digest('hex')}`;

    titulos.push({
      codigo_origem: codigo != null ? Math.round(codigo) : null,
      origem,
      ano,
      descricao: historico || planoNome || credor || (codigo != null ? `Título ${Math.round(codigo)}` : 'Título'),
      fornecedor: credor,
      valor,
      data_vencimento: venc,
      data_pagamento: baixa,
      status: baixa ? 'pago' : 'pendente',
      numero_documento: txt(get(row, iDoc)),
      plano_contas_nome: planoNome,
      plano_contas_codigo: txt(get(row, iPlanoCd)),
      centro_custo_nome: txt(get(row, iCentroNm)),
      centro_custo_codigo: txt(get(row, iCentroCd)),
      historico,
      grupo_movimento: txt(get(row, iGrupo)),
      planejada: toBool(get(row, iPlanej)),
      pago_cartao: toBool(get(row, iCartao)),
      juros: toNum(get(row, iJuros)),
      mora: toNum(get(row, iMora)),
      multa: toNum(get(row, iMulta)),
      desconto: toNum(get(row, iDesc)),
      forma_pagamento: txt(get(row, iForma)),
      conta_caixa: txt(get(row, iConta)),
      import_chave: importChave,
    });
  }
  return titulos;
}

// Carrega catálogos código→id (fin_plano_contas / fin_centros_custo · < 1000 linhas cada)
async function carregarCatalogos() {
  const planoMap = new Map();
  const centroMap = new Map();
  const { data: planos } = await supabase.from('fin_plano_contas').select('id, codigo');
  (planos || []).forEach((p) => { if (p.codigo) planoMap.set(String(p.codigo).trim(), p.id); });
  const { data: centros } = await supabase.from('fin_centros_custo').select('id, codigo');
  (centros || []).forEach((c) => { if (c.codigo) centroMap.set(String(c.codigo).trim(), c.id); });
  return { planoMap, centroMap };
}

// Importa de fato (upsert idempotente por import_chave · reimportar atualiza)
async function importar(buffer, userId, origem = 'toscano') {
  const titulos = parseBuffer(buffer, origem);
  if (!titulos.length) {
    return { lidas: 0, gravadas: 0, baixadas: 0, abertas: 0, sem_plano: 0, sem_centro: 0, valor_total: 0, erros: 0 };
  }

  const { planoMap, centroMap } = await carregarCatalogos();

  // dedup interno por import_chave (mesma chave repetida na planilha)
  const vistos = new Set();
  let sem_plano = 0;
  let sem_centro = 0;
  const unicas = [];
  for (const t of titulos) {
    if (vistos.has(t.import_chave)) continue;
    vistos.add(t.import_chave);
    t.plano_contas_id = t.plano_contas_codigo ? (planoMap.get(t.plano_contas_codigo) || null) : null;
    t.centro_custo_id = t.centro_custo_codigo ? (centroMap.get(t.centro_custo_codigo) || null) : null;
    if (t.plano_contas_codigo && !t.plano_contas_id) sem_plano++;
    if (t.centro_custo_codigo && !t.centro_custo_id) sem_centro++;
    t.created_by = userId || null;
    unicas.push(t);
  }

  let gravadas = 0;
  let erros = 0;
  const LOTE = 200;
  for (let i = 0; i < unicas.length; i += LOTE) {
    const lote = unicas.slice(i, i + LOTE);
    const { data, error } = await supabase
      .from('fin_contas_pagar')
      .upsert(lote, { onConflict: 'import_chave', ignoreDuplicates: false })
      .select('id');
    if (error) { erros += lote.length; console.error('[CONTAS-PAGAR-IMPORT] lote:', error.message); }
    else gravadas += (data?.length || 0);
  }

  return {
    lidas: titulos.length,
    unicas: unicas.length,
    gravadas,
    erros,
    baixadas: unicas.filter((t) => t.status === 'pago').length,
    abertas: unicas.filter((t) => t.status !== 'pago').length,
    sem_plano,
    sem_centro,
    valor_total: unicas.reduce((s, t) => s + (t.valor || 0), 0),
  };
}

module.exports = { parseBuffer, importar };
