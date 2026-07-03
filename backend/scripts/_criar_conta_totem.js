// ============================================================================
// Cria uma conta de QUIOSQUE do Totem Membro (computadores do lounge).
//
// Uso (a partir de backend/, onde está o .env):
//   node scripts/_criar_conta_totem.js totem1@cbrio.org "SenhaForte123" "Totem Lounge 1"
//
// O que a conta recebe:
//   - auth user (e-mail confirmado) + profile role='assistente' com
//     is_membro_only=true → junto com o acesso a UM único módulo, o login
//     TRAVA em /totem (sem menu, sem navegar pra outras telas).
//   - usuarios.cargo_id = cargo 'totem-kiosk' (matriz toda zerada).
//   - override em permissoes_modulo: totem-membro nível 3 (o ÚNICO módulo).
//
// Pré-requisito: migration 20260703160000_totem_membro_kiosk.sql aplicada.
// Depois de rodar: bust de cache em /admin/permissoes e logar no computador.
// Idempotente: rodar de novo com o mesmo e-mail só reforça profile/cargo/override.
// ============================================================================
require('dotenv').config();
const { supabase } = require('../utils/supabase');

async function acharUserPorEmail(email) {
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const hit = (data?.users || []).find(u => (u.email || '').toLowerCase() === email);
    if (hit) return hit;
    if (!data || (data.users || []).length < 1000) return null;
    page++;
  }
}

async function main() {
  const [emailArg, senha, nomeArg] = process.argv.slice(2);
  if (!emailArg || !senha) {
    console.log('Uso: node scripts/_criar_conta_totem.js <email> <senha> [nome de exibição]');
    process.exit(1);
  }
  const email = String(emailArg).toLowerCase().trim();
  const nome = nomeArg || 'Totem Lounge';

  // Pré-requisitos do banco (migration aplicada?)
  const [{ data: modulo }, { data: cargo }] = await Promise.all([
    supabase.from('modulos').select('id').eq('slug', 'totem-membro').maybeSingle(),
    supabase.from('cargos').select('id').eq('slug', 'totem-kiosk').maybeSingle(),
  ]);
  if (!modulo || !cargo) {
    console.error('✗ Módulo totem-membro e/ou cargo totem-kiosk não existem — aplicar a migration 20260703160000 antes.');
    process.exit(1);
  }

  // 1) auth user
  let userId = null;
  const { data: created, error: cErr } = await supabase.auth.admin.createUser({
    email, password: senha, email_confirm: true,
  });
  if (cErr) {
    const jaExiste = /already|registered|exists/i.test(cErr.message || '');
    if (!jaExiste) throw cErr;
    const existente = await acharUserPorEmail(email);
    if (!existente) throw new Error('Usuário parece existir mas não foi encontrado: ' + cErr.message);
    userId = existente.id;
    console.log('· auth user já existia (senha NÃO alterada — rota pública nunca reseta senha; troque no dashboard se precisar)');
  } else {
    userId = created.user.id;
    console.log('✓ auth user criado');
  }

  // 2) profile: assistente + is_membro_only (metade do gatilho da trava)
  const { error: pErr } = await supabase.from('profiles').upsert({
    id: userId, email, name: nome, role: 'assistente', is_membro_only: true,
  }, { onConflict: 'id' });
  if (pErr) throw pErr;
  console.log('✓ profile: role=assistente · is_membro_only=true');

  // 3) usuarios (sistema granular · id INTEGER) com o cargo de matriz zerada
  let usuarioId = null;
  const { data: uExist } = await supabase.from('usuarios').select('id').ilike('email', email).maybeSingle();
  if (uExist) {
    usuarioId = uExist.id;
    const { error } = await supabase.from('usuarios').update({ cargo_id: cargo.id, nome }).eq('id', usuarioId);
    if (error) throw error;
  } else {
    const { data: uNew, error } = await supabase.from('usuarios')
      .insert({ email, nome, cargo_id: cargo.id }).select('id').single();
    if (error) throw error;
    usuarioId = uNew.id;
  }
  console.log('✓ usuarios: cargo totem-kiosk (matriz zerada)');

  // 4) override: totem-membro nível 3 — o ÚNICO módulo da conta
  const { data: ovExist } = await supabase.from('permissoes_modulo')
    .select('id').eq('usuario_id', usuarioId).eq('modulo_id', modulo.id).maybeSingle();
  const ovPayload = {
    usuario_id: usuarioId, modulo_id: modulo.id,
    nivel_leitura: 3, nivel_escrita: 3,
    pode_exportar: false, pode_aprovar: false, escopo_proprio: false,
    motivo: 'Conta de quiosque do Totem Membro (computador do lounge)',
    // criado_por é INTEGER (FK) — não aceita texto; fica null no script.
  };
  if (ovExist) {
    const { error } = await supabase.from('permissoes_modulo').update(ovPayload).eq('id', ovExist.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('permissoes_modulo').insert(ovPayload);
    if (error) throw error;
  }
  console.log('✓ override: totem-membro nível 3');

  console.log('\nConta de quiosque pronta: ' + email);
  console.log('Próximos passos: (1) bust de cache em /admin/permissoes · (2) logar no computador do lounge — o login abre travado em /totem.');
}

main().catch((e) => { console.error('✗ Falhou:', e.message); process.exit(1); });
