#!/usr/bin/env node
/**
 * Lê os XLSX do balanço e dumpa chunks JSONB em /tmp/balanco_chunks/chunk_NNN.json
 * que serão consumidos via MCP execute_sql.
 */
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');

const CHUNK_SIZE = 1000;
const OUT_DIR = '/tmp/balanco_chunks';

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Uso: node dump_balanco_chunks.cjs arq1.xlsx arq2.xlsx ...');
  process.exit(1);
}

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
fs.readdirSync(OUT_DIR).forEach(f => fs.unlinkSync(path.join(OUT_DIR, f)));

function detectarLayout(header) {
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  const idx = (label) => header.findIndex(h => norm(h) === norm(label));
  return {
    codigo: idx('Código'), cadastro: idx('Cadastro'), data: idx('Data'),
    tipo: idx('Tipo (E/S)'), valor: idx('Valor(R$)'),
    plano_de_contas: idx('Plano de Contas'),
    centro_de_custo: idx('Centro de Custo'),
    origem_destino: idx('Origem/Destino'),
    grupo_movimento: idx('Grupo do Movimento'),
    cn_pdc: idx('Cód/Nome do Plano de Contas'),
    cod_pdc: idx('Cod. Plano de Contas'),
    historico: idx('Historico'),
    cn_cc: idx('Cód/Nome do Centro de Custo'),
    cod_cc: idx('Cod. Centro de Custo'),
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
function extrairNome(cnPdc, planoTexto) {
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

const all = [];
const seen = new Set();
for (const f of files) {
  console.log(`📂 ${path.basename(f)}`);
  const wb = XLSX.readFile(f, { cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
  const layout = detectarLayout(rows[0]);
  let count = 0;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r[layout.codigo]) continue;
    const codigo = Number(r[layout.codigo]);
    if (seen.has(codigo)) continue; // dedup global
    seen.add(codigo);

    const codPdc = layout.cod_pdc >= 0 ? r[layout.cod_pdc] : null;
    const cnPdc  = layout.cn_pdc >= 0 ? r[layout.cn_pdc] : null;
    const planoTxt = layout.plano_de_contas >= 0 ? r[layout.plano_de_contas] : null;
    const codCC = layout.cod_cc >= 0 ? r[layout.cod_cc] : null;
    const cnCC  = layout.cn_cc >= 0 ? r[layout.cn_cc] : null;
    const centroTxt = layout.centro_de_custo >= 0 ? r[layout.centro_de_custo] : null;

    all.push({
      codigo,
      cadastro: dataToTimestamp(r[layout.cadastro]),
      data: dataToISO(r[layout.data]),
      tipo: r[layout.tipo],
      valor: r[layout.valor],
      plano_codigo: extrairCodigo(cnPdc, codPdc),
      plano_nome:   extrairNome(cnPdc, planoTxt),
      centro_codigo: extrairCodigo(cnCC, codCC),
      centro_nome:   extrairNome(cnCC, centroTxt),
      grupo_movimento: layout.grupo_movimento >= 0 ? r[layout.grupo_movimento] : null,
      origem_destino:  layout.origem_destino >= 0 ? r[layout.origem_destino] : null,
      historico:       layout.historico >= 0 ? r[layout.historico] : null,
      forma_pagamento: layout.forma_pagto >= 0 ? r[layout.forma_pagto] : null,
      conta_caixa:     layout.conta_caixa >= 0 ? r[layout.conta_caixa] : null,
      username:        layout.user_name >= 0 ? r[layout.user_name] : null,
    });
    count++;
  }
  console.log(`   → ${count} linhas extraídas`);
}

console.log(`\n📦 Total: ${all.length} linhas únicas`);
console.log(`📦 Dumpando em chunks de ${CHUNK_SIZE}...`);

let chunkIdx = 0;
for (let i = 0; i < all.length; i += CHUNK_SIZE) {
  const chunk = all.slice(i, i + CHUNK_SIZE);
  const filename = path.join(OUT_DIR, `chunk_${String(chunkIdx).padStart(4, '0')}.json`);
  fs.writeFileSync(filename, JSON.stringify(chunk));
  chunkIdx++;
}
console.log(`✅ ${chunkIdx} chunks gerados em ${OUT_DIR}`);
console.log(`   Tamanho médio: ${(fs.statSync(path.join(OUT_DIR, 'chunk_0000.json')).size / 1024).toFixed(1)} KB`);
