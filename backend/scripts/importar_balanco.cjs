#!/usr/bin/env node
/**
 * Importa balanço histórico (2022-2026) das planilhas Excel exportadas
 * do sistema financeiro legado para fin_transacoes.
 *
 * Uso (a partir da RAIZ do repo):
 *   node backend/scripts/importar_balanco.cjs caminho/Balanco_2024.xlsx
 *   node backend/scripts/importar_balanco.cjs --dir /caminho/com/balancos
 *
 * Idempotente · usa codigo_legado UNIQUE. Pode rodar várias vezes ·
 * só insere o que faltar.
 *
 * Requer envs (em backend/.env ou .env):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Antes de rodar, aplique a migration 20260528120000_balanco_classe_metas_views.sql
 * no SQL Editor do Supabase.
 */

const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

// .env do backend (prioritário) e fallback no .env da raiz
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausentes (rode com .env em backend/ ou na raiz).');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

const BATCH_SIZE = 500;

// ============================================================
// Detecta layout de colunas a partir do cabeçalho · 2023 ≠ outros
// ============================================================
function detectarLayout(header) {
  // header é array de string ou null
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  const idx = (label) => header.findIndex(h => norm(h) === norm(label));

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
  // codPdc pode ser '3.01.01.04' direto ou null
  if (codPdc && /^[\d.]+$/.test(String(codPdc).trim())) return String(codPdc).trim();
  // cnPdc tipo '3.01.01.04 - Dízimos em Geral' · separa
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
    // Excel serial date
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  if (typeof v === 'string') {
    // ISO ou dd/mm/yyyy
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

// ============================================================
// Lê 1 arquivo XLSX e retorna lista de payloads JSONB
// ============================================================
function lerArquivo(filepath) {
  console.log(`📂 Lendo ${path.basename(filepath)}...`);
  const wb = XLSX.readFile(filepath, { cellDates: true, cellNF: false, cellStyles: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });

  if (rows.length < 2) return [];
  const header = rows[0];
  const layout = detectarLayout(header);

  const payloads = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r[layout.codigo]) continue;

    const codPdc = layout.cod_pdc >= 0 ? r[layout.cod_pdc] : null;
    const cnPdc  = layout.cn_pdc >= 0 ? r[layout.cn_pdc] : null;
    const planoTxt = layout.plano_de_contas >= 0 ? r[layout.plano_de_contas] : null;

    const codCC = layout.cod_cc >= 0 ? r[layout.cod_cc] : null;
    const cnCC  = layout.cn_cc >= 0 ? r[layout.cn_cc] : null;
    const centroTxt = layout.centro_de_custo >= 0 ? r[layout.centro_de_custo] : null;

    payloads.push({
      codigo: Number(r[layout.codigo]),
      cadastro: dataToTimestamp(r[layout.cadastro]),
      data: dataToISO(r[layout.data]),
      tipo: r[layout.tipo],
      valor: r[layout.valor],
      plano_codigo: extrairCodigo(cnPdc, codPdc),
      plano_nome:   extrairNomePdc(cnPdc, planoTxt),
      centro_codigo: extrairCodigo(cnCC, codCC),
      centro_nome:   extrairNomePdc(cnCC, centroTxt),
      grupo_movimento: layout.grupo_movimento >= 0 ? r[layout.grupo_movimento] : null,
      origem_destino:  layout.origem_destino >= 0 ? r[layout.origem_destino] : null,
      historico:       layout.historico >= 0 ? r[layout.historico] : null,
      forma_pagamento: layout.forma_pagto >= 0 ? r[layout.forma_pagto] : null,
      conta_caixa:     layout.conta_caixa >= 0 ? r[layout.conta_caixa] : null,
      username:        layout.user_name >= 0 ? r[layout.user_name] : null,
    });
  }
  console.log(`   → ${payloads.length} linhas válidas`);
  return payloads;
}

// ============================================================
// Pré-filtra payloads que já existem no banco (perf)
// ============================================================
async function filtrarJaExistentes(payloads) {
  if (payloads.length === 0) return [];
  const codigos = payloads.map(p => p.codigo);

  const existentes = new Set();
  // PostgREST limita ~1000 valores no IN(...). Particiona em chunks de 500
  for (let i = 0; i < codigos.length; i += 500) {
    const chunk = codigos.slice(i, i + 500);
    const { data, error } = await supabase
      .from('fin_transacoes')
      .select('codigo_legado')
      .in('codigo_legado', chunk);
    if (error) {
      console.error('Erro consultando existentes:', error.message);
      continue;
    }
    (data || []).forEach(r => existentes.add(Number(r.codigo_legado)));
  }
  const novos = payloads.filter(p => !existentes.has(p.codigo));
  console.log(`   → ${existentes.size} já existem · ${novos.length} a inserir`);
  return novos;
}

// ============================================================
// Insere em lote via RPC balanco_importar_lote
// ============================================================
async function inserirLote(payloads) {
  let total = 0;
  for (let i = 0; i < payloads.length; i += BATCH_SIZE) {
    const chunk = payloads.slice(i, i + BATCH_SIZE);
    const { data, error } = await supabase.rpc('balanco_importar_lote', { p_linhas: chunk });
    if (error) {
      console.error(`   ⚠️  Erro lote ${i}-${i + chunk.length}:`, error.message);
      continue;
    }
    total += chunk.length;
    const pct = ((i + chunk.length) / payloads.length * 100).toFixed(1);
    process.stdout.write(`\r   📥 ${total}/${payloads.length} (${pct}%)`);
  }
  process.stdout.write('\n');
  return total;
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Uso: node scripts/importar_balanco.js arquivo1.xlsx [arquivo2.xlsx ...]');
    console.error('  ou: node scripts/importar_balanco.js --dir /caminho/com/balancos');
    process.exit(1);
  }

  let arquivos = [];
  if (args[0] === '--dir' && args[1]) {
    const dir = args[1];
    arquivos = fs.readdirSync(dir)
      .filter(f => f.toLowerCase().endsWith('.xlsx'))
      .map(f => path.join(dir, f));
  } else {
    arquivos = args.filter(a => fs.existsSync(a));
  }

  if (arquivos.length === 0) {
    console.error('Nenhum arquivo XLSX encontrado.');
    process.exit(1);
  }

  console.log(`🚀 Importando balanço de ${arquivos.length} arquivo(s)\n`);

  const t0 = Date.now();
  let totalLidos = 0;
  let totalInseridos = 0;

  for (const arq of arquivos) {
    const payloads = lerArquivo(arq);
    totalLidos += payloads.length;

    const novos = await filtrarJaExistentes(payloads);
    if (novos.length === 0) {
      console.log('   ✅ Nada novo · pulando\n');
      continue;
    }

    const inseridos = await inserirLote(novos);
    totalInseridos += inseridos;
    console.log(`   ✅ ${inseridos} novas linhas inseridas\n`);
  }

  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📊 Resumo:`);
  console.log(`   Arquivos:    ${arquivos.length}`);
  console.log(`   Linhas lidas: ${totalLidos.toLocaleString('pt-BR')}`);
  console.log(`   Inseridas:    ${totalInseridos.toLocaleString('pt-BR')}`);
  console.log(`   Tempo:        ${secs}s`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Sumário pós-import
  try {
    const { data, error } = await supabase
      .from('fin_transacoes')
      .select('classe_movimento, tipo, valor', { count: 'exact', head: false })
      .limit(0);
    console.log('\nTotal de transações no banco agora:', data ? data.length : '?');
  } catch (e) {}

  console.log('\n✅ Import concluído. Pode rodar de novo · só pega o que faltar.');
}

main().catch(err => {
  console.error('❌ Falha:', err);
  process.exit(1);
});
