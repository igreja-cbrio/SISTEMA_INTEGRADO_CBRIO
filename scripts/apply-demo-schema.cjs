// ============================================================================
// Aplica o schema (todas as migrations do repo) num projeto Supabase via
// Management API (HTTPS) · usado pra montar o banco DEMO quando nao ha acesso
// direto ao Postgres.
//
// Uso:
//   SUPABASE_PAT=sbp_xxx DEMO_REF=xxxxx node scripts/apply-demo-schema.cjs
//
// Roda os arquivos de supabase/migrations/*.sql em ordem. Faz varias passadas:
// arquivos que falham por dependencia de ordem sao re-tentados nas passadas
// seguintes (rollback atomico por arquivo garante que nada fica pela metade).
// Ao final, lista os arquivos que ainda falham pra inspecao manual.
// ============================================================================

const fs = require('fs');
const path = require('path');

const PAT = process.env.SUPABASE_PAT;
const REF = process.env.DEMO_REF;
if (!PAT || !REF) { console.error('Faltam SUPABASE_PAT e DEMO_REF'); process.exit(1); }

const MIG_DIR = path.join(__dirname, '..', 'supabase', 'migrations');
const ENDPOINT = `https://api.supabase.com/v1/projects/${REF}/database/query`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runSql(query) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const r = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${PAT}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    if (r.status === 429) { await sleep(2000 * (attempt + 1)); continue; }
    const text = await r.text();
    return { ok: r.status >= 200 && r.status < 300, status: r.status, body: text };
  }
  return { ok: false, status: 429, body: 'rate limited' };
}

// erros que significam "ja aplicado" · tratamos como sucesso idempotente
const IGNORABLE = /already exists|duplicate|já existe/i;

async function main() {
  const files = fs.readdirSync(MIG_DIR).filter((f) => f.endsWith('.sql')).sort();
  console.log(`Aplicando ${files.length} migrations em ${REF}\n`);

  let pending = files.slice();
  const errosFinais = {};

  for (let pass = 1; pass <= 8 && pending.length; pass++) {
    console.log(`\n── Passada ${pass} · ${pending.length} pendentes ──`);
    const aindaFalha = [];
    let aplicadosNaPassada = 0;

    for (const f of pending) {
      const sql = fs.readFileSync(path.join(MIG_DIR, f), 'utf8');
      if (!sql.trim()) { aplicadosNaPassada++; continue; }
      const res = await runSql(sql);
      if (res.ok) {
        aplicadosNaPassada++;
        delete errosFinais[f];
      } else if (IGNORABLE.test(res.body)) {
        // objeto ja existe · considera aplicado
        aplicadosNaPassada++;
        delete errosFinais[f];
      } else {
        aindaFalha.push(f);
        errosFinais[f] = `${res.status} ${res.body.slice(0, 160)}`;
      }
      await sleep(120);
    }

    console.log(`  aplicados: ${aplicadosNaPassada} · ainda falham: ${aindaFalha.length}`);
    if (aindaFalha.length === pending.length) {
      console.log('  (sem progresso nesta passada · parando o loop)');
      pending = aindaFalha;
      break;
    }
    pending = aindaFalha;
  }

  console.log('\n========================================');
  if (!pending.length) {
    console.log('TODAS as migrations aplicadas com sucesso.');
  } else {
    console.log(`${pending.length} migrations ainda falham:\n`);
    for (const f of pending) console.log(`  ✗ ${f}\n      ${errosFinais[f]}`);
  }
}

main().catch((e) => { console.error('FALHOU:', e.message); process.exit(1); });
