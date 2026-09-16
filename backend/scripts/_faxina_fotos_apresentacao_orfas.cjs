#!/usr/bin/env node
// Faxina das FOTOS ÓRFÃS da apresentação (16/09/2026).
//
// A família escolhe a foto ANTES de a inscrição existir: a porta pública sobe o
// arquivo, devolve o caminho, e o caminho volta no envio. Quem anexa e abandona
// o formulário deixa o arquivo no bucket sem nenhuma linha que o aponte.
//
// ⚠️⚠️ DUAS ARMADILHAS, e as duas apagam foto de gente de verdade:
//
//  1. LINHA SOFT-DELETADA AINDA APONTA PRO ARQUIVO. Varredura que olha só as
//     linhas VIVAS acharia órfã a foto de uma inscrição apagada — e o
//     soft-delete aqui é reversível. Restaurar a inscrição devolveria uma ficha
//     apontando pro nada. Medido em 16/09: das linhas com `foto_storage_path`,
//     a única existente era justamente uma apagada.
//
//  2. ARQUIVO RECÉM-SUBIDO AINDA NÃO TEM LINHA. Entre escolher a foto e apertar
//     "Enviar" passam minutos — o arquivo existe e a inscrição não. Apagar ali
//     quebraria um envio em andamento. Daí a carência.
//
// Uso:  node backend/scripts/_faxina_fotos_apresentacao_orfas.cjs            (dry-run)
//       node backend/scripts/_faxina_fotos_apresentacao_orfas.cjs --exec     (apaga)
//       ... --dias=30                                                        (carência)
const fs = require('fs');
const path = require('path');
const os = require('os');

const PRINCIPAL = path.join(os.homedir(), 'SISTEMA_INTEGRADO_CBRIO', 'backend');
const LOCAL = path.join(__dirname, '..');

function carregarEnv() {
  for (const dir of [LOCAL, PRINCIPAL]) {
    const f = path.join(dir, '.env');
    if (!fs.existsSync(f)) continue;
    const env = {};
    for (const l of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
      const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
    if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) return env;
  }
  throw new Error('SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY não encontrados em .env');
}
function resolverModulo(nome) {
  for (const dir of [LOCAL, PRINCIPAL]) {
    try { return require(path.join(dir, 'node_modules', nome)); } catch { /* tenta o próximo */ }
  }
  return require(nome);
}

const env = carregarEnv();
const { createClient } = resolverModulo('@supabase/supabase-js');
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const EXEC = process.argv.includes('--exec');
const argDias = process.argv.find((a) => a.startsWith('--dias='));
const DIAS = argDias ? Math.max(1, parseInt(argDias.split('=')[1], 10) || 7) : 7;
const PASTA = 'apresentacao-foto';
const BUCKET = 'kids-documentos';

const kb = (n) => `${(n / 1024).toFixed(0)}KB`;

(async () => {
  console.log(EXEC ? '== EXEC ==' : '== DRY-RUN (use --exec pra apagar) ==');
  console.log(`carência: ${DIAS} dia(s) — arquivo mais novo que isso nunca é tocado\n`);

  // ── 1 · todo arquivo da pasta (paginado: o list tem teto) ──────────────────
  let arquivos = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await sb.storage.from(BUCKET).list(PASTA, { limit: 100, offset });
    if (error) throw new Error(`list: ${error.message}`);
    arquivos = arquivos.concat(data || []);
    if (!data || data.length < 100) break;
  }

  // ── 2 · todo caminho apontado por ALGUMA linha, apagada ou não ─────────────
  // ⚠️ Sem `.is('deleted_at', null)` de PROPÓSITO — ver a armadilha 1 no topo.
  let apontados = new Set();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('apresentacao_criancas')
      .select('foto_storage_path')
      .not('foto_storage_path', 'is', null)
      .range(from, from + 999);
    if (error) throw new Error(`select: ${error.message}`);
    (data || []).forEach((r) => apontados.add(r.foto_storage_path));
    if (!data || data.length < 1000) break;
  }

  // ── 3 · o que sobra, já velho o bastante ───────────────────────────────────
  const corte = Date.now() - DIAS * 24 * 3600 * 1000;
  const orfas = [];
  const novasDemais = [];
  for (const f of arquivos) {
    const caminho = `${PASTA}/${f.name}`;
    if (apontados.has(caminho)) continue;
    const criadoEm = new Date(f.created_at || f.updated_at || 0).getTime();
    if (criadoEm > corte) { novasDemais.push({ caminho, criadoEm }); continue; }
    orfas.push({ caminho, tam: (f.metadata && f.metadata.size) || 0, criadoEm });
  }

  console.log(`arquivos na pasta: ${arquivos.length}`);
  console.log(`apontados por alguma linha (incl. apagadas): ${apontados.size}`);
  console.log(`sem linha, mas dentro da carência (INTOCADOS): ${novasDemais.length}`);
  console.log(`ÓRFÃS pra apagar: ${orfas.length}${orfas.length ? ` · ${kb(orfas.reduce((s, o) => s + o.tam, 0))}` : ''}\n`);
  orfas.forEach((o) => console.log(`  ${o.caminho}  ${kb(o.tam)}  ${new Date(o.criadoEm).toISOString().slice(0, 10)}`));

  if (!orfas.length) return console.log('\nnada a fazer.');
  if (!EXEC) return console.log('\n(dry-run — nada foi apagado)');

  // ⚠️ Em lotes: `remove` com centenas de caminhos de uma vez estoura o limite
  // da API e falha o lote INTEIRO, inclusive o que daria certo.
  let apagadas = 0;
  for (let i = 0; i < orfas.length; i += 50) {
    const lote = orfas.slice(i, i + 50).map((o) => o.caminho);
    const { error } = await sb.storage.from(BUCKET).remove(lote);
    if (error) { console.error(`  lote ${i / 50 + 1} falhou: ${error.message}`); continue; }
    apagadas += lote.length;
  }
  console.log(`\napagadas: ${apagadas} de ${orfas.length}`);
})().catch((e) => { console.error('FALHOU:', e.message); process.exit(1); });
