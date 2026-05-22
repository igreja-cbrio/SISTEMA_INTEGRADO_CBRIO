// ============================================================================
// Vincular responsaveis PCO as criancas ja importadas
// ============================================================================
// Le CSV com adultos (filtro "Households is parent/guardian of active children"
// do Planning Center), faz match com mem_familias existentes pelo Household
// Name, e vincula em kids_responsaveis pra cada crianca da familia.
//
// Premissa: o script `importar_kids_pco.cjs` ja foi rodado · 660 mem_familias
// foram criadas com nome = Household Name original. Match e por nome exato.
//
// Uso:
//   node scripts/vincular_responsaveis_pco.cjs <caminho-do-csv> [--dry-run]
// ============================================================================

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

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
  console.error('Uso: node scripts/vincular_responsaveis_pco.cjs <caminho-do-csv> [--dry-run]');
  process.exit(1);
}
if (!fs.existsSync(csvPath)) {
  console.error('Arquivo nao encontrado:', csvPath);
  process.exit(1);
}

// ─── CSV Parser ────────────────────────────────────────────────────────────
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

function normTel(v) { if (!v) return null; const d = String(v).replace(/\D/g, ''); return d.length >= 8 ? d : null; }
function normCpf(v) { if (!v) return null; const d = String(v).replace(/\D/g, ''); return d.length === 11 ? d : null; }
function normEmail(v) { if (!v) return null; const s = String(v).trim().toLowerCase(); return s.includes('@') ? s : null; }
function nomeCompleto(row) {
  const parts = [
    row['Nickname'] || row['First Name'],
    row['Middle Name'],
    row['Last Name'],
  ].filter(s => s && s.trim());
  return parts.join(' ').trim();
}
function parentescoPorGenero(gender, primaryContact) {
  const g = String(gender || '').toLowerCase();
  if (g === 'female') return 'mae';
  if (g === 'male') return 'pai';
  // Sem genero · usa Primary Contact como sinal
  if (primaryContact === 'TRUE') return 'mae'; // chute razoavel
  return 'outro';
}

// ─── Caches ────────────────────────────────────────────────────────────────
const familiaPorNome = new Map();    // Household Name normalizado → familia_id
const membroPorPersonId = new Map(); // person_id → mem_membros.id
const criancasPorFamilia = new Map(); // familia_id → array de crianca_ids

function normNomeFamilia(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

async function carregarFamilias() {
  console.log('Carregando mem_familias...');
  const { data, error } = await supabase.from('mem_familias').select('id, nome');
  if (error) throw error;
  for (const f of data || []) {
    familiaPorNome.set(normNomeFamilia(f.nome), f.id);
  }
  console.log(`  ${familiaPorNome.size} familias no banco`);
}

async function carregarCriancasPorFamilia() {
  console.log('Carregando kids_criancas...');
  const { data, error } = await supabase
    .from('kids_criancas')
    .select('id, familia_id')
    .not('familia_id', 'is', null);
  if (error) throw error;
  for (const c of data || []) {
    if (!criancasPorFamilia.has(c.familia_id)) criancasPorFamilia.set(c.familia_id, []);
    criancasPorFamilia.get(c.familia_id).push(c.id);
  }
  console.log(`  ${data?.length || 0} criancas vinculadas a ${criancasPorFamilia.size} familias`);
}

async function resolveOrCreateMembro(row, familiaId) {
  const personId = row['Person ID'];
  if (membroPorPersonId.has(personId)) return membroPorPersonId.get(personId);

  const nome = nomeCompleto(row);
  const cpf = normCpf(row['CPF :: CPF']);
  const tel = normTel(row['Mobile Phone Number']) || normTel(row['Home Phone Number']);
  const email = normEmail(row['Home Email']) || normEmail(row['Work Email']);

  let membro = null;
  if (cpf) {
    const { data } = await supabase.from('mem_membros').select('id, familia_id').eq('cpf', cpf).maybeSingle();
    if (data) membro = data;
  }
  if (!membro && tel) {
    const { data } = await supabase.from('mem_membros').select('id, familia_id').eq('telefone', tel).maybeSingle();
    if (data) membro = data;
  }
  if (!membro && email) {
    const { data } = await supabase.from('mem_membros').select('id, familia_id').eq('email', email).maybeSingle();
    if (data) membro = data;
  }

  if (!membro) {
    if (DRY_RUN) {
      const fake = `dryrun-novo-${personId}`;
      membroPorPersonId.set(personId, fake);
      return fake;
    }
    const dn = String(row['Birthdate'] || '').trim();
    const dataNasc = /^\d{4}-\d{2}-\d{2}$/.test(dn) ? dn : null;
    const { data, error } = await supabase.from('mem_membros').insert({
      nome,
      email,
      telefone: tel,
      cpf,
      data_nascimento: dataNasc,
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

  // Atualiza familia_id do membro se nao tinha
  if (familiaId && !membro.familia_id && !DRY_RUN) {
    await supabase.from('mem_membros').update({ familia_id: familiaId }).eq('id', membro.id);
  }
  membroPorPersonId.set(personId, membro.id);
  return membro.id;
}

async function vincularEmCriancas(criancaIds, membroId, parentesco) {
  if (DRY_RUN) return criancaIds.length;
  if (String(membroId).startsWith('dryrun-')) return criancaIds.length;
  let novos = 0;
  for (const criancaId of criancaIds) {
    const { error } = await supabase.from('kids_responsaveis').upsert({
      crianca_id: criancaId,
      membro_id: membroId,
      parentesco,
      autorizado_buscar: true,
    }, { onConflict: 'crianca_id,membro_id', ignoreDuplicates: false });
    if (!error) novos++;
    else if (error.code !== '23505') console.warn(`  ! erro vinculando:`, error.message);
  }
  return novos;
}

// ─── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n=== Vincular Responsaveis PCO ${DRY_RUN ? '· DRY RUN' : ''} ===\n`);
  console.log(`Arquivo: ${csvPath}\n`);

  await carregarFamilias();
  await carregarCriancasPorFamilia();

  const text = fs.readFileSync(csvPath, 'utf8');
  const rows = parseCsv(text);
  console.log(`\nTotal de linhas: ${rows.length}`);

  // So adultos · esse export ja vem só com adultos
  const adultos = rows.filter(r => {
    const isActive = String(r['Status'] || '').toLowerCase() === 'active';
    const isChild = String(r['Child'] || '').toLowerCase() === 'true';
    return isActive && !isChild;
  });
  console.log(`Adultos ativos: ${adultos.length}`);

  let familiasComMatch = 0;
  let familiasSemMatch = 0;
  let adultosVinculados = 0;
  let vinculosNovos = 0;
  let semCriancas = 0;
  let erros = 0;

  const semMatchList = [];

  for (let i = 0; i < adultos.length; i++) {
    if (i % 100 === 0 && i > 0) console.log(`  (${i}/${adultos.length})`);
    const row = adultos[i];
    const householdName = row['Household Name'];
    if (!householdName?.trim()) { erros++; continue; }

    const familiaId = familiaPorNome.get(normNomeFamilia(householdName));
    if (!familiaId) {
      familiasSemMatch++;
      if (semMatchList.length < 20) semMatchList.push(householdName);
      continue;
    }
    familiasComMatch++;

    const criancaIds = criancasPorFamilia.get(familiaId) || [];
    if (criancaIds.length === 0) { semCriancas++; continue; }

    try {
      const membroId = await resolveOrCreateMembro(row, familiaId);
      if (!membroId) { erros++; continue; }

      const parentesco = parentescoPorGenero(row['Gender'], row['Household Primary Contact']);
      const v = await vincularEmCriancas(criancaIds, membroId, parentesco);
      vinculosNovos += v;
      adultosVinculados++;
    } catch (e) {
      console.warn(`  ! erro adulto ${row['Person ID']}:`, e.message);
      erros++;
    }
  }

  console.log('\n=== Resultado ===');
  console.log(`Adultos no CSV:                  ${adultos.length}`);
  console.log(`Famílias com match (nome bate):  ${familiasComMatch}`);
  console.log(`Famílias SEM match:              ${familiasSemMatch}`);
  console.log(`Famílias sem crianças no banco:  ${semCriancas}`);
  console.log(`Adultos vinculados:              ${adultosVinculados}`);
  console.log(`Vínculos novos criados:          ${vinculosNovos}`);
  console.log(`Erros:                           ${erros}`);

  if (semMatchList.length) {
    console.log('\nPrimeiras 20 famílias sem match (Household Name não bate com mem_familias.nome):');
    semMatchList.forEach(n => console.log(`  - ${n}`));
  }
  console.log(`\n${DRY_RUN ? '* DRY RUN · nada gravado' : 'Concluído.'}\n`);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
