/**
 * Script: criar-usuarios.js
 *
 * Cria contas Supabase Auth (email + senha) para todos os funcionários
 * ativos em rh_funcionarios que ainda não têm acesso ao sistema.
 * Também cria os registros em `profiles` e `usuarios` se necessário.
 *
 * Uso:
 *   cd backend
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/criar-usuarios.js
 *
 *   Ou com .env:
 *   node -r dotenv/config scripts/criar-usuarios.js
 */

const { createClient } = require('@supabase/supabase-js');
const path = require('path');

// Tenta carregar .env do backend
try { require('dotenv').config({ path: path.join(__dirname, '../.env') }); } catch {}

const SUPABASE_URL             = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SENHA_PADRAO             = 'cbrio1234';
const CARGO_PADRAO             = 'Acesso assistente'; // cargo inicial para novos usuários

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌  Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log('🔍  Buscando funcionários ativos em rh_funcionarios...\n');

  // 1. Todos os funcionários ativos com e-mail
  const { data: funcionarios, error: fErr } = await supabase
    .from('rh_funcionarios')
    .select('nome, email, area, cargo')
    .eq('status', 'ativo')
    .not('email', 'is', null);

  if (fErr) { console.error('Erro ao buscar funcionários:', fErr.message); process.exit(1); }

  const total = funcionarios.length;
  console.log(`   ${total} funcionário(s) encontrado(s).\n`);

  // 2. Todos os auth.users existentes (para detectar quem já tem conta)
  const { data: { users: authUsers }, error: aErr } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (aErr) { console.error('Erro ao listar auth users:', aErr.message); process.exit(1); }

  const emailsExistentes = new Set(authUsers.map(u => u.email?.toLowerCase().trim()));

  // 3. Buscar cargo padrão
  const { data: cargoPadrao } = await supabase
    .from('cargos')
    .select('id')
    .eq('nome', CARGO_PADRAO)
    .maybeSingle();

  const cargoId = cargoPadrao?.id ?? null;
  if (!cargoId) console.warn(`⚠️   Cargo "${CARGO_PADRAO}" não encontrado — usuarios serão criados sem cargo.\n`);

  let criados = 0, jaExistem = 0, erros = 0;

  for (const func of funcionarios) {
    const email = func.email.toLowerCase().trim();

    // Já tem conta → apenas garante entrada na tabela usuarios
    if (emailsExistentes.has(email)) {
      jaExistem++;
      await garantirUsuario(email, func, cargoId);
      console.log(`✓  ${email.padEnd(45)} — já possui conta`);
      continue;
    }

    // Criar auth user
    const { data: authData, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password: SENHA_PADRAO,
      email_confirm: true,
      user_metadata: { name: func.nome },
    });

    if (createErr) {
      erros++;
      console.error(`✗  ${email.padEnd(45)} — erro: ${createErr.message}`);
      continue;
    }

    const uid = authData.user.id;

    // Criar / atualizar profile
    await supabase.from('profiles').upsert({
      id:    uid,
      name:  func.nome,
      email,
      role:  'assistente',
      area:  func.area ?? null,
    }, { onConflict: 'id' });

    // Criar entrada na tabela usuarios (sistema de permissões)
    await garantirUsuarioPorId(uid, email, func, cargoId);

    criados++;
    console.log(`✅  ${email.padEnd(45)} — criado  (${func.nome})`);
  }

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Concluído!
   Criados:       ${criados}
   Já existiam:   ${jaExistem}
   Erros:         ${erros}
   Total:         ${total}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Senha padrão: ${SENHA_PADRAO}
 Os usuários devem alterar a senha no primeiro acesso.
`);
}

// Garante que o profile.email tem entrada em `usuarios`
async function garantirUsuario(email, func, cargoId) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (!profile) return;
  await garantirUsuarioPorId(profile.id, email, func, cargoId);
}

async function garantirUsuarioPorId(uid, email, func, cargoId) {
  const { data: existe } = await supabase
    .from('usuarios')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (!existe) {
    await supabase.from('usuarios').insert({
      email,
      ativo:    true,
      cargo_id: cargoId,
    });
  }
}

main().catch(err => { console.error('Erro fatal:', err.message); process.exit(1); });
