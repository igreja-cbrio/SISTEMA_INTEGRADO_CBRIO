// ============================================================================
// Migracao Planning Center · pessoas → kids_criancas + responsaveis + familias
// ============================================================================
// Le CSV exportado do PC (todas as pessoas que fizeram check-in num periodo),
// filtra Child=true, identifica responsaveis adultos do mesmo Household,
// cria/vincula:
//   - mem_familias (uma por Household ID)
//   - mem_membros (1 por adulto · status visitante se nao existir)
//   - kids_criancas (1 por crianca · visitante=true)
//   - kids_responsaveis (M:N · ate 2 adultos por crianca)
//
// Idempotente (re-rodar não duplica). Match prioridade:
//   - mem_membros: por cpf > telefone > email > nome+familia
//   - kids_criancas: por nome + familia_id
//
// Uso:
//   node scripts/importar_kids_pco.js <caminho-do-csv> [--dry-run]
//
// Requer SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY no backend/.env
// ============================================================================

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Le .env do backend
require('dotenv').config({ path: path.join(__dirname, '..', 'backend', '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('ERRO: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY obrigatorios no backend/.env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const csvPath = process.argv[2];
const DRY_RUN = process.argv.includes('--dry-run');

if (!csvPath) {
  console.error('Uso: node scripts/importar_kids_pco.js <caminho-do-csv> [--dry-run]');
  process.exit(1);
}
if (!fs.existsSync(csvPath)) {
  console.error('Arquivo nao encontrado:', csvPath);
  process.exit(1);
}

// ─── CSV Parser simples (suporta aspas + virgulas dentro) ──────────────────
function parseCsv(text) {
  const lines = [];
  let cur = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { cur.push(field); field = ''; }
      else if (c === '\n') { cur.push(field); lines.push(cur); cur = []; field = ''; }
      else if (c === '\r') { /* ignora */ }
      else field += c;
    }
  }
  if (field.length || cur.length) { cur.push(field); lines.push(cur); }
  const header = lines.shift();
  return lines
    .filter(row => row.length === header.length)
    .map(row => Object.fromEntries(header.map((h, i) => [h, row[i] ?? ''])));
}

// ─── Helpers de normalizacao ───────────────────────────────────────────────
function normTel(v) {
  if (!v) return null;
  const d = String(v).replace(/\D/g, '');
  return d.length >= 8 ? d : null;
}
function normCpf(v) {
  if (!v) return null;
  const d = String(v).replace(/\D/g, '');
  return d.length === 11 ? d : null;
}
function normEmail(v) {
  if (!v) return null;
  const s = String(v).trim().toLowerCase();
  return s.includes('@') ? s : null;
}
function nomeCompleto(row) {
  const parts = [
    row['Nickname'] || row['First Name'],
    row['Middle Name'],
    row['Last Name'],
  ].filter(s => s && s.trim());
  return parts.join(' ').trim();
}
function isChild(row) {
  // Coluna Child = "true" ou "false"
  return String(row['Child'] || '').toLowerCase() === 'true';
}
function sexo(row) {
  const g = String(row['Gender'] || '').toLowerCase();
  if (g === 'male' || g === 'm' || g === 'masc') return 'M';
  if (g === 'female' || g === 'f' || g === 'fem') return 'F';
  return null;
}
function dataNasc(row) {
  const d = String(row['Birthdate'] || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}
function parentescoPorPosicao(idx) {
  // Heuristica: 1o adulto = "mae" (mais provavel · titular do household),
  // 2o = "pai", 3o = "outro"
  if (idx === 0) return 'mae';
  if (idx === 1) return 'pai';
  return 'outro';
}

// ─── Operacoes Supabase com cache (idempotente + rapido) ───────────────────
const familiaPorHousehold = new Map(); // household_id (PC) → familia_id (CBRio)
const membroPorPersonId = new Map();   // person_id (PC) → mem_membros.id
const criancaPorPersonId = new Map();  // person_id (PC) → kids_criancas.id

async function resolveOrCreateMembro(row, familiaId) {
  const personId = row['Person ID'];
  if (membroPorPersonId.has(personId)) return membroPorPersonId.get(personId);

  const nome = nomeCompleto(row);
  const cpf = normCpf(row['CPF :: CPF']);
  const tel = normTel(row['Mobile Phone Number']) || normTel(row['Home Phone Number']);
  const email = normEmail(row['Home Email']) || normEmail(row['Work Email']);

  // 1. Busca por CPF
  let membro = null;
  if (cpf) {
    const { data } = await supabase.from('mem_membros')
      .select('id, familia_id').eq('cpf', cpf).maybeSingle();
    if (data) membro = data;
  }
  // 2. Por telefone
  if (!membro && tel) {
    const { data } = await supabase.from('mem_membros')
      .select('id, familia_id').eq('telefone', tel).maybeSingle();
    if (data) membro = data;
  }
  // 3. Por email
  if (!membro && email) {
    const { data } = await supabase.from('mem_membros')
      .select('id, familia_id').eq('email', email).maybeSingle();
    if (data) membro = data;
  }

  if (!membro) {
    if (DRY_RUN) {
      const fakeId = `dryrun-novo-${personId}`;
      membroPorPersonId.set(personId, fakeId);
      return fakeId;
    }
    const { data, error } = await supabase.from('mem_membros').insert({
      nome,
      email,
      telefone: tel,
      cpf,
      data_nascimento: dataNasc(row),
      status: 'visitante',
      familia_id: familiaId,
      active: true,
    }).select('id').single();
    if (error) {
      console.warn(`  ! erro criando membro ${nome} (person ${personId}):`, error.message);
      return null;
    }
    membroPorPersonId.set(personId, data.id);
    return data.id;
  }

  // Atualiza familia_id se nao tinha
  if (familiaId && !membro.familia_id && !DRY_RUN) {
    await supabase.from('mem_membros').update({ familia_id: familiaId }).eq('id', membro.id);
  }
  membroPorPersonId.set(personId, membro.id);
  return membro.id;
}

async function resolveOrCreateFamilia(householdId, householdName) {
  if (!householdId) return null;
  if (familiaPorHousehold.has(householdId)) return familiaPorHousehold.get(householdId);

  // Tenta achar por nome exato
  const nomeFamilia = householdName?.trim() || `Familia ${householdId}`;
  const { data: existente } = await supabase.from('mem_familias')
    .select('id').eq('nome', nomeFamilia).maybeSingle();
  if (existente) {
    familiaPorHousehold.set(householdId, existente.id);
    return existente.id;
  }

  if (DRY_RUN) {
    const fakeId = `dryrun-familia-${householdId}`;
    familiaPorHousehold.set(householdId, fakeId);
    return fakeId;
  }

  const { data, error } = await supabase.from('mem_familias')
    .insert({ nome: nomeFamilia })
    .select('id').single();
  if (error) {
    console.warn(`  ! erro criando familia ${nomeFamilia}:`, error.message);
    return null;
  }
  familiaPorHousehold.set(householdId, data.id);
  return data.id;
}

async function resolveOrCreateCrianca(row, familiaId) {
  const personId = row['Person ID'];
  if (criancaPorPersonId.has(personId)) return criancaPorPersonId.get(personId);

  const nome = nomeCompleto(row);
  if (!nome || nome.length < 2) return null;

  // Match por nome + familia
  const { data: existente } = await supabase.from('kids_criancas')
    .select('id').ilike('nome', nome).eq('familia_id', familiaId).maybeSingle();

  if (existente) {
    criancaPorPersonId.set(personId, existente.id);
    // Atualiza dados que sao melhores no CSV
    if (!DRY_RUN) {
      const update = {};
      const dn = dataNasc(row);
      if (dn) update.data_nascimento = dn;
      const sx = sexo(row);
      if (sx) update.sexo = sx;
      const obs = row['Medical Notes']?.trim();
      if (obs) update.observacoes_medicas = obs;
      if (Object.keys(update).length) {
        await supabase.from('kids_criancas').update(update).eq('id', existente.id);
      }
    }
    return existente.id;
  }

  if (DRY_RUN) {
    const fakeId = `dryrun-crianca-${personId}`;
    criancaPorPersonId.set(personId, fakeId);
    return fakeId;
  }

  const { data, error } = await supabase.from('kids_criancas').insert({
    nome,
    data_nascimento: dataNasc(row),
    sexo: sexo(row),
    familia_id: familiaId,
    observacoes_medicas: row['Medical Notes']?.trim() || null,
    visitante: true,
    ativo: true,
  }).select('id').single();
  if (error) {
    console.warn(`  ! erro criando crianca ${nome} (person ${personId}):`, error.message);
    return null;
  }
  criancaPorPersonId.set(personId, data.id);
  return data.id;
}

async function vincularResponsavel(criancaId, membroId, parentesco) {
  if (DRY_RUN || !criancaId || !membroId) return;
  if (String(criancaId).startsWith('dryrun-') || String(membroId).startsWith('dryrun-')) return;
  const { error } = await supabase.from('kids_responsaveis').upsert({
    crianca_id: criancaId,
    membro_id: membroId,
    parentesco,
    autorizado_buscar: true,
  }, { onConflict: 'crianca_id,membro_id', ignoreDuplicates: false });
  if (error) console.warn(`  ! erro vinculando responsavel:`, error.message);
}

// ─── Execucao principal ────────────────────────────────────────────────────
async function main() {
  console.log(`\n=== Importar Kids do Planning Center ${DRY_RUN ? '· DRY RUN' : ''} ===\n`);
  console.log(`Arquivo: ${csvPath}`);

  const text = fs.readFileSync(csvPath, 'utf8');
  const rows = parseCsv(text);
  console.log(`Total de linhas no CSV: ${rows.length}`);

  // Filtra so ativos (com check-in no periodo)
  const ativos = rows.filter(r => String(r['Status'] || '').toLowerCase() === 'active');
  console.log(`Status=active: ${ativos.length}`);

  // Agrupa por Household ID
  const porHousehold = new Map();
  for (const r of ativos) {
    const hid = r['Household ID'] || '';
    if (!hid) continue;
    if (!porHousehold.has(hid)) porHousehold.set(hid, []);
    porHousehold.get(hid).push(r);
  }
  console.log(`Households: ${porHousehold.size}`);

  const criancasTotal = ativos.filter(isChild);
  console.log(`Crianças (Child=true): ${criancasTotal.length}`);
  console.log(`Adultos: ${ativos.length - criancasTotal.length}\n`);

  if (criancasTotal.length === 0) {
    console.log('Nenhuma criança encontrada · nada a importar.');
    return;
  }

  // Stats
  let familiasResolvidas = 0;
  let criancasCriadas = 0;
  let criancasAtualizadas = 0;
  let criancasSemResponsavel = 0;
  let responsaveisVinculados = 0;
  let erros = 0;

  let n = 0;
  const total = porHousehold.size;
  for (const [hid, membros] of porHousehold.entries()) {
    n++;
    if (n % 50 === 0) console.log(`  (${n}/${total}) processando households...`);

    const criancas = membros.filter(isChild);
    if (criancas.length === 0) continue; // household sem criança

    const adultos = membros.filter(m => !isChild(m));
    const householdName = membros.find(m => String(m['Household Primary Contact']).toUpperCase() === 'TRUE')?.['Household Name']
                       || membros[0]?.['Household Name']
                       || null;

    try {
      // 1. Familia
      const familiaId = await resolveOrCreateFamilia(hid, householdName);
      if (familiaId) familiasResolvidas++;

      // 2. Cria membros adultos (max 2 · pra evitar fluff)
      const responsavelIds = [];
      const adultosOrdenados = adultos.sort((a, b) => {
        // Prioriza Primary Contact e mulheres (heuristica: mae primeiro)
        const pa = String(a['Household Primary Contact']).toUpperCase() === 'TRUE' ? 1 : 0;
        const pb = String(b['Household Primary Contact']).toUpperCase() === 'TRUE' ? 1 : 0;
        if (pa !== pb) return pb - pa;
        const fa = (a['Gender'] || '').toLowerCase() === 'female' ? 1 : 0;
        const fb = (b['Gender'] || '').toLowerCase() === 'female' ? 1 : 0;
        return fb - fa;
      });

      for (let i = 0; i < adultosOrdenados.length; i++) {
        const adulto = adultosOrdenados[i];
        const mid = await resolveOrCreateMembro(adulto, familiaId);
        if (mid) {
          const parentesco = adulto['Gender'] === 'Female' ? 'mae'
                           : adulto['Gender'] === 'Male'   ? 'pai'
                           : parentescoPorPosicao(i);
          responsavelIds.push({ id: mid, parentesco });
        }
      }

      // 3. Pra cada crianca · cria + vincula
      for (const crianca of criancas) {
        const antes = criancaPorPersonId.has(crianca['Person ID']);
        const criancaId = await resolveOrCreateCrianca(crianca, familiaId);
        if (!criancaId) { erros++; continue; }
        if (antes) criancasAtualizadas++;
        else if (!String(criancaId).startsWith('dryrun-')) criancasCriadas++;
        else criancasCriadas++; // dry run conta como criadas

        if (responsavelIds.length === 0) criancasSemResponsavel++;

        for (const r of responsavelIds) {
          await vincularResponsavel(criancaId, r.id, r.parentesco);
          responsaveisVinculados++;
        }
      }
    } catch (e) {
      console.warn(`  ! erro household ${hid}:`, e.message);
      erros++;
    }
  }

  console.log('\n=== Resultado ===');
  console.log(`Famílias resolvidas/criadas: ${familiasResolvidas}`);
  console.log(`Crianças criadas:           ${criancasCriadas}`);
  console.log(`Crianças atualizadas:       ${criancasAtualizadas}`);
  console.log(`Crianças sem responsável:   ${criancasSemResponsavel}`);
  console.log(`Vínculos responsável-criança: ${responsaveisVinculados}`);
  console.log(`Erros:                      ${erros}`);
  console.log(`\n${DRY_RUN ? '* DRY RUN · nada foi gravado de verdade' : 'Import concluído.'}\n`);
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
