// Importador da planilha "CONTROLE DE COMPRAS FIXOS E VARIÁVEIS" → log_compras
//
// Lê as 3 abas (COMPRAS FIXOS, COMPRAS VARIAVÉL, CARTÃO) no mesmo layout que o
// Pery mantinha à mão e materializa cada linha como uma compra aprovada.
// Idempotente: cada linha vira uma import_chave determinística (hash do
// conteúdo) → re-importar a mesma planilha não duplica.

const XLSX = require('xlsx');
const crypto = require('crypto');
const { supabase } = require('../utils/supabase');

// nomes das abas (tolerante a espaço duplo / acento)
const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();

function normFormaPgto(v) {
  if (!v) return null;
  const s = norm(v);
  if (s.includes('SANTAN')) return 'Cartão Santander';
  if (s.includes('ITAU')) return 'Cartão Itaú';
  if (s.includes('CAJU')) return 'Caju';
  if (s === 'PIX') return 'Pix';
  if (s.includes('BOLETO')) return 'Boleto';
  if (s.includes('DINHEIRO') || s.includes('DINEIRO')) return 'Dinheiro';
  if (s.includes('MELI') || s.includes('DOLAR') || s.includes('DÓLAR')) return 'Mercado Livre';
  if (s.includes('CART')) return 'Cartão';
  return String(v).trim();
}

const txt = (v) => (v === null || v === undefined || String(v).trim() === '') ? null : String(v).trim();
const titulo = (v) => txt(v) ? txt(v).replace(/\s+/g, ' ').toLowerCase().replace(/(^|\s|\/)\p{L}/gu, (c) => c.toUpperCase()) : null;

function toISO(v) {
  if (!v) return null;
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
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
  if (typeof v === 'number') return v;
  const s = String(v).replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.').replace(/[^0-9.\-]/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function chaveDe(sheet, linha, data, fornecedor, valor, n_pedido, materiais) {
  // inclui a posição da linha → cada linha da planilha vira uma compra (não
  // colapsa linhas de conteúdo idêntico) e reimportar o MESMO arquivo é idempotente
  const base = [sheet, linha, data || '', norm(fornecedor), valor ?? '', n_pedido || '', norm(materiais)].join('|');
  return `compra:${crypto.createHash('md5').update(base).digest('hex')}`;
}

// Acha o índice da linha de cabeçalho procurando os rótulos esperados
// (robusto contra offset quando o range da aba não começa na linha 1)
function acharHeader(rows, rotulos) {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const cels = (rows[i] || []).map((c) => norm(c));
    if (rotulos.every((rot) => cels.some((c) => c.includes(rot)))) return i;
  }
  return -1;
}

// Lê o buffer e devolve as compras normalizadas (sem gravar)
function parseBuffer(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true, cellNF: false, cellStyles: false });
  const byNorm = {};
  wb.SheetNames.forEach((n) => { byNorm[norm(n)] = n; });
  const compras = [];

  // Abas de COMPRAS (FIXOS / VARIÁVEL): header detectado por conteúdo
  for (const [chaveAba, tipo] of [['COMPRAS FIXOS', 'fixo'], ['COMPRAS VARIAVEL', 'variavel']]) {
    const real = byNorm[chaveAba];
    if (!real) continue;
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[real], { header: 1, defval: null, raw: true });
    const h = acharHeader(rows, ['FORNECEDOR', 'VALOR']);
    if (h < 0) continue;
    for (let i = h + 1; i < rows.length; i++) {
      const r = rows[i] || [];
      const fornecedor = txt(r[3]);
      const valor = toNum(r[7]);
      if (!fornecedor && valor === null) continue;
      const data = toISO(r[0]);
      const n_pedido = txt(r[1]);
      const materiais = txt(r[4]);
      compras.push({
        tipo,
        data_compra: data,
        n_pedido,
        comprador: titulo(r[2]),
        fornecedor,
        materiais,
        origem: txt(r[5]),
        centro_custo: txt(r[6]),                 // coluna TORRE
        valor,
        data_entrega: toISO(r[8]),
        status_entrega: norm(r[9]).includes('PEND') ? 'pendente' : 'entregue',
        forma_pgto: normFormaPgto(r[10]),
        parcelas: null,
        origem_registro: 'planilha',
        status_aprovacao: 'aprovada',
        import_chave: chaveDe(tipo, i, data, fornecedor, valor, n_pedido, materiais),
      });
    }
  }

  // Aba CARTÃO: header detectado por conteúdo (LOJA/PRODUTO/PARCELAS)
  const cartaoReal = byNorm['CARTAO'];
  if (cartaoReal) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[cartaoReal], { header: 1, defval: null, raw: true });
    const h = acharHeader(rows, ['LOJA', 'VALOR']);
    if (h < 0) return compras;
    for (let i = h + 1; i < rows.length; i++) {
      const r = rows[i] || [];
      const fornecedor = txt(r[2]);             // LOJA
      const valor = toNum(r[5]);
      if (!fornecedor && valor === null) continue;
      const data = toISO(r[0]);
      const materiais = txt(r[3]);              // PRODUTO
      compras.push({
        tipo: 'cartao',
        data_compra: data,
        n_pedido: null,
        comprador: titulo(r[1]),                // CARTÃO (pessoa)
        fornecedor,
        materiais,
        origem: null,
        centro_custo: txt(r[4]),                // CENTRO CUSTO
        valor,
        data_entrega: null,
        status_entrega: 'entregue',
        forma_pgto: 'Cartão',
        parcelas: toNum(r[6]),
        origem_registro: 'planilha',
        status_aprovacao: 'aprovada',
        import_chave: chaveDe('cartao', i, data, fornecedor, valor, null, materiais),
      });
    }
  }

  return compras;
}

// Importa de fato (upsert idempotente por import_chave)
async function importar(buffer, userId) {
  const compras = parseBuffer(buffer);
  if (!compras.length) return { lidas: 0, inseridas: 0, duplicadas: 0, erros: 0, valor_total: 0 };

  // dedup interno (mesma chave repetida na planilha)
  const vistos = new Set();
  const unicas = compras.filter((c) => {
    if (vistos.has(c.import_chave)) return false;
    vistos.add(c.import_chave);
    return true;
  });

  let inseridas = 0;
  let erros = 0;
  const LOTE = 200;
  for (let i = 0; i < unicas.length; i += LOTE) {
    const lote = unicas.slice(i, i + LOTE).map((c) => ({ ...c, created_by: userId || null }));
    const { data, error } = await supabase
      .from('log_compras')
      .upsert(lote, { onConflict: 'import_chave', ignoreDuplicates: true })
      .select('id');
    if (error) { erros += lote.length; console.error('[COMPRAS-IMPORT] lote:', error.message); }
    else inseridas += (data?.length || 0);
  }

  const valor_total = unicas.reduce((s, c) => s + (c.valor || 0), 0);
  return {
    lidas: compras.length,
    unicas: unicas.length,
    inseridas,
    duplicadas: unicas.length - inseridas - erros,
    erros,
    valor_total,
  };
}

module.exports = { parseBuffer, importar };
