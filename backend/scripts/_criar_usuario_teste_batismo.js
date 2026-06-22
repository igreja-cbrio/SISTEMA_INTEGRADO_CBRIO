/**
 * Script: _criar_usuario_teste_batismo.js   ⚠️ TEMPORÁRIO · apagar nesta semana
 *
 * Cria (idempotente) um usuário de TESTE pra operar o check-in de batismo no
 * Totem Membro (/totem → botão "Equipe · Check-in de Batismo").
 *
 *   teste.batismo@cbrio.org   ·   senha: cbrio1234
 *
 * Acesso (mínimo): o check-in exige `authorizeIntegracao` (backend/routes/kpis.js),
 * que passa quando `profiles.kpi_areas` inclui 'integracao'. Damos SÓ isso —
 * role 'assistente' (NÃO é admin/diretor, não "vê tudo") e sem cargo/área
 * especial. Escopo do acesso = módulo Integração; nada além. A direção é à
 * prova de falha: qualquer erro deixa o usuário com MENOS acesso.
 * password_changed_at = now() para NÃO disparar o modal de 1º acesso (é teste).
 *
 * Uso (a partir de backend/, com backend/.env presente):
 *   node scripts/_criar_usuario_teste_batismo.js            # dry-run (mostra o plano)
 *   node scripts/_criar_usuario_teste_batismo.js --apply    # cria/garante o usuário
 *   node scripts/_criar_usuario_teste_batismo.js --delete   # APAGA o usuário de teste
 */

const { createClient } = require('@supabase/supabase-js');
const path = require('path');
try { require('dotenv').config({ path: path.join(__dirname, '../.env') }); } catch {}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SENHA = process.env.SENHA_PADRAO || 'cbrio1234';
const APPLY = process.argv.includes('--apply');
const DELETE = process.argv.includes('--delete');

const EMAIL = 'teste.batismo@cbrio.org';
const NOME = 'Teste Batismo (TEMP)';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌  Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (backend/.env).');
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findAuthUser(email) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    const u = (data.users || []).find((x) => (x.email || '').toLowerCase().trim() === email);
    if (u) return u;
    if (!data.users || data.users.length < 1000) break;
  }
  return null;
}

async function apagar() {
  const existing = await findAuthUser(EMAIL);
  await supabase.from('profiles').delete().eq('email', EMAIL);
  const { data: u } = await supabase.from('usuarios').select('id').eq('email', EMAIL).maybeSingle();
  if (u) {
    await supabase.from('usuario_areas').delete().eq('usuario_id', u.id);
    await supabase.from('usuarios').delete().eq('id', u.id);
  }
  if (existing) {
    const { error } = await supabase.auth.admin.deleteUser(existing.id);
    if (error) console.error(`✗ erro ao apagar auth user: ${error.message}`);
    else console.log(`✓ auth user apagado (id=${existing.id})`);
  } else {
    console.log(`(auth.users não tinha ${EMAIL})`);
  }
  console.log('✅ Usuário de teste removido.');
}

async function criar() {
  const existing = await findAuthUser(EMAIL);
  let uid = existing?.id;
  if (!uid) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: EMAIL, password: SENHA, email_confirm: true, user_metadata: { name: NOME },
    });
    if (error) throw new Error(`createUser: ${error.message}`);
    uid = data.user.id;
    console.log(`✓ auth user criado (id=${uid}) · senha=${SENHA}`);
  } else {
    const { error } = await supabase.auth.admin.updateUserById(uid, { password: SENHA });
    if (error) console.error(`✗ erro ao redefinir senha: ${error.message}`);
    else console.log(`✓ auth user já existia (id=${uid}) · senha redefinida p/ ${SENHA}`);
  }

  const { error: pErr } = await supabase.from('profiles').upsert({
    id: uid, name: NOME, email: EMAIL, role: 'assistente', active: true,
    kpi_areas: ['integracao'],
    password_changed_at: new Date().toISOString(), // pula o modal de 1º acesso (é teste)
  }, { onConflict: 'id' });
  if (pErr) throw new Error(`profiles upsert: ${pErr.message}`);
  console.log(`✓ profile · role=assistente · kpi_areas=['integracao'] ⇒ passa no authorizeIntegracao`);

  const { data: p } = await supabase.from('profiles').select('role, kpi_areas, active').eq('email', EMAIL).maybeSingle();
  console.log(`\n══ Verificação ══`);
  console.log(`• ${EMAIL}: role=${p?.role} · kpi_areas=[${(p?.kpi_areas || []).join(', ')}] · active=${p?.active}`);
  console.log(`\nLogin: ${EMAIL} / ${SENHA}  →  abrir /totem → "Equipe · Check-in de Batismo".`);
  console.log('⚠️  TEMPORÁRIO: apague nesta semana com `node scripts/_criar_usuario_teste_batismo.js --delete`.');
}

async function main() {
  if (DELETE) {
    console.log('\n🗑️  MODO APAGAR\n');
    await apagar();
    return;
  }
  if (!APPLY) {
    console.log('\n🔎 DRY-RUN (nada será gravado · use --apply)\n');
    console.log(`Criaria/garantiria: auth user ${EMAIL} (senha ${SENHA}) + profile(role=assistente, kpi_areas=['integracao'], password_changed_at=now).`);
    console.log('Para apagar depois: --delete');
    return;
  }
  console.log('\n🚀 MODO APLICAR\n');
  await criar();
}

main().catch((e) => { console.error('Erro fatal:', e.message); process.exit(1); });
