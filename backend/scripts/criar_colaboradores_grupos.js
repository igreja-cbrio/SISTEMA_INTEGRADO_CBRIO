/**
 * Script: criar_colaboradores_grupos.js
 *
 * Cria (idempotente) os usuários de TESTE do módulo Grupos — voluntários de
 * T.I. que usaram o Ekklesia na última temporada e vão validar o nosso fluxo:
 *   - Bernardo Cicchelli · bernardocicchelli3@gmail.com (não é líder · apoio)
 *   - Rafael Alcemar     · rafael@webdec.com.br         (é líder de grupo)
 *
 * Acesso desejado: administrador (nível 5) APENAS no módulo `grupos`, ZERO no
 * resto, e login abrindo DIRETO em /grupos (HOME_MODULO_UNICO no App.tsx).
 *
 * Como isso é garantido (mesmo padrão do criar_colaboradores_producao.js):
 *   - role = 'assistente' → NÃO é isAdmin (não ignora a matriz).
 *   - cargo dedicado `colaborador-grupos` com matriz VAZIA → 0 em todo módulo.
 *   - área "Grupos" em usuario_areas → AREA_MODULO_BOOST eleva SÓ `grupos` a 5.
 *   Direção à prova de falha: erro deixa o usuário com MENOS acesso, nunca mais.
 *
 * Extra deste script (o de Produção não precisava): vincula o auth user ao
 * mem_membros correspondente (profiles.membro_id + vol_profiles.membresia_id)
 * — sem isso o modo "meus pedidos" da tela de pedidos (que resolve o líder
 * via vol_profiles.membresia_id) não funciona pro Rafael.
 *
 * Uso (a partir de backend/, com backend/.env presente):
 *   node scripts/criar_colaboradores_grupos.js            # dry-run
 *   node scripts/criar_colaboradores_grupos.js --apply    # aplica
 *   node scripts/criar_colaboradores_grupos.js --apply --reset-senha
 */

const { createClient } = require('@supabase/supabase-js');
const path = require('path');
try { require('dotenv').config({ path: path.join(__dirname, '../.env') }); } catch {}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SENHA_PADRAO = process.env.SENHA_PADRAO || 'grupos1234';
const APPLY = process.argv.includes('--apply');
const RESET_SENHA = process.argv.includes('--reset-senha');
const ONLY = process.argv.filter((a) => a.includes('@')).map((s) => s.toLowerCase().trim());

const CARGO_SLUG = 'colaborador-grupos';
const COLAB = [
  // membroPrefix = prefixo do mem_membros.id esperado (guarda contra homônimo)
  { email: 'bernardocicchelli3@gmail.com', nome: 'Bernardo Cicchelli', membroPrefix: '5b584ab5' },
  { email: 'rafael@webdec.com.br', nome: 'Rafael Alcemar', membroPrefix: 'e2ccb5ca' },
];

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌  Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (backend/.env).');
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DIACRITICOS = new RegExp('[\\u0300-\\u036f]', 'g');
const norm = (s) => (s || '').toString().toLowerCase().normalize('NFD').replace(DIACRITICOS, '').trim();

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

async function ensureCargoZero() {
  const { data: existente } = await supabase.from('cargos').select('*').eq('slug', CARGO_SLUG).maybeSingle();
  if (existente) {
    if (APPLY) {
      await supabase.from('cargo_modulo_permissao').delete().eq('cargo_id', existente.id);
      await supabase.from('cargos').update({ nivel_padrao_leitura: 1, nivel_padrao_escrita: 1, ativo: true }).eq('id', existente.id);
    }
    return existente;
  }
  const { data: amostra, error: amErr } = await supabase.from('cargos').select('*').eq('ativo', true).order('id').limit(1).single();
  if (amErr) throw new Error(`amostra de cargo: ${amErr.message}`);
  const novo = { ...amostra };
  delete novo.id; delete novo.created_at; delete novo.updated_at;
  novo.slug = CARGO_SLUG;
  novo.nome = 'Colaborador Grupos';
  novo.nome_completo = 'Colaborador de Grupos (acesso só ao módulo Grupos)';
  novo.nivel_padrao_leitura = 1;
  novo.nivel_padrao_escrita = 1;
  novo.ativo = true;
  if ('ordem' in novo) novo.ordem = 999;
  if (!APPLY) return { ...novo, id: '(novo · será criado)' };
  const { data: criado, error } = await supabase.from('cargos').insert(novo).select('*').single();
  if (error) throw new Error(`criar cargo: ${error.message}`);
  await supabase.from('cargo_modulo_permissao').delete().eq('cargo_id', criado.id);
  return criado;
}

async function ensureUsuario(email, nome, cargoId) {
  const { data: existe } = await supabase.from('usuarios').select('id').eq('email', email).maybeSingle();
  if (existe) {
    if (APPLY) await supabase.from('usuarios').update({ nome, cargo_id: cargoId, ativo: true }).eq('id', existe.id);
    return existe.id;
  }
  if (!APPLY) return '(novo · será criado)';
  const { data, error } = await supabase.from('usuarios').insert({ email, nome, cargo_id: cargoId, ativo: true }).select('id').single();
  if (error) throw new Error(`criar usuario: ${error.message}`);
  return data.id;
}

// Resolve o mem_membros da pessoa (email → nome+prefixo de segurança).
async function findMembro(email, nome, prefix) {
  const { data: porEmail } = await supabase.from('mem_membros')
    .select('id, nome, email').eq('email', email).is('deleted_at', null).limit(2);
  if (porEmail?.length === 1) return porEmail[0];
  const { data: porNome } = await supabase.from('mem_membros')
    .select('id, nome, email').ilike('nome', nome).is('deleted_at', null).limit(5);
  const hit = (porNome || []).find((m) => m.id.toLowerCase().startsWith(prefix.toLowerCase()));
  return hit || null;
}

async function main() {
  console.log(`\n${APPLY ? '🚀 MODO APLICAR' : '🔎 DRY-RUN (nada será gravado · use --apply para aplicar)'}\n`);
  const alvo = ONLY.length ? COLAB.filter((c) => ONLY.includes(c.email.toLowerCase().trim())) : COLAB;
  if (ONLY.length) console.log(`(escopo restrito a: ${alvo.map((c) => c.email).join(', ') || '— nenhum —'})\n`);

  // PREFLIGHT — área "Grupos" (é ela que dá o boost pro módulo grupos)
  const { data: areas, error: aErr } = await supabase.from('areas').select('id, nome');
  if (aErr) { console.error('Erro ao ler areas:', aErr.message); process.exit(1); }
  const areaGrupos = (areas || []).find((a) => norm(a.nome) === 'grupos');
  if (!areaGrupos) {
    console.error('❌  Área "Grupos" não encontrada em `areas`. Sem ela o boost não eleva o módulo. Abortando.');
    process.exit(1);
  }
  console.log(`✓ Área de boost: "${areaGrupos.nome}" (id=${areaGrupos.id}) → eleva só o módulo grupos`);

  const cargo = await ensureCargoZero();
  console.log(`✓ Cargo: ${CARGO_SLUG} (id=${cargo.id}) · matriz vazia ⇒ 0 em todos os módulos`);

  for (const c of alvo) {
    const email = c.email.toLowerCase().trim();
    const existing = await findAuthUser(email);
    const membro = await findMembro(email, c.nome, c.membroPrefix);
    console.log(`\n— ${email} (${c.nome})`);
    console.log(`   auth.users: ${existing ? 'JÁ EXISTE (id=' + existing.id + ') · senha ' + (RESET_SENHA ? 'SERÁ redefinida p/ a padrão' : 'NÃO será alterada') : 'será criado com a senha padrão'}`);
    console.log(`   mem_membros: ${membro ? membro.id + ' (' + membro.nome + ')' : 'NÃO ENCONTRADO — sem vínculo de membro (modo "meus pedidos" não funcionará)'}`);

    if (!APPLY) {
      console.log('   [dry-run] criaria/garantiria: profile(role=assistente, membro_id) · usuarios(cargo=colaborador-grupos) · usuario_areas=[Grupos] · vol_profiles(membresia_id)');
      continue;
    }

    let uid = existing?.id;
    if (!uid) {
      const { data: novo, error } = await supabase.auth.admin.createUser({
        email, password: SENHA_PADRAO, email_confirm: true, user_metadata: { name: c.nome },
      });
      if (error) { console.error(`   ✗ erro ao criar auth user: ${error.message}`); continue; }
      uid = novo.user.id;
      console.log(`   ✓ auth user criado (id=${uid}) · senha=${SENHA_PADRAO}`);
    } else if (RESET_SENHA) {
      const { error } = await supabase.auth.admin.updateUserById(uid, { password: SENHA_PADRAO });
      if (error) console.error(`   ✗ erro ao redefinir senha: ${error.message}`);
      else console.log(`   ✓ senha redefinida p/ ${SENHA_PADRAO}`);
    }

    const profilePayload = { id: uid, name: c.nome, email, role: 'assistente', active: true };
    if (membro) profilePayload.membro_id = membro.id;
    await supabase.from('profiles').upsert(profilePayload, { onConflict: 'id' });

    const usuarioId = await ensureUsuario(email, c.nome, cargo.id);
    await supabase.from('usuario_areas').delete().eq('usuario_id', usuarioId);
    const { error: aiErr } = await supabase.from('usuario_areas').insert({ usuario_id: usuarioId, area_id: areaGrupos.id, is_principal: true });
    if (aiErr) { console.error(`   ✗ erro ao vincular área: ${aiErr.message}`); continue; }

    // Vínculo de membresia (modo "meus pedidos" da tela de pedidos resolve o
    // líder via vol_profiles.membresia_id).
    if (membro) {
      const { data: vp } = await supabase.from('vol_profiles').select('id').eq('auth_user_id', uid).maybeSingle();
      if (vp) {
        await supabase.from('vol_profiles').update({ membresia_id: membro.id }).eq('id', vp.id);
      } else {
        const { error: vpErr } = await supabase.from('vol_profiles').insert({ auth_user_id: uid, membresia_id: membro.id, full_name: c.nome, email });
        if (vpErr) console.error(`   ✗ vol_profiles: ${vpErr.message} (modo "meus pedidos" pode não funcionar)`);
      }
    }
    console.log(`   ✓ profile(role=assistente${membro ? ', membro_id' : ''}) · usuarios#${usuarioId}(cargo=${CARGO_SLUG}) · área=Grupos${membro ? ' · vol_profiles ok' : ''}`);
  }

  if (APPLY) {
    console.log('\n══ Verificação ══');
    const { count } = await supabase.from('cargo_modulo_permissao').select('*', { count: 'exact', head: true }).eq('cargo_id', cargo.id);
    console.log(`Matriz do cargo ${CARGO_SLUG}: ${count ?? 0} linha(s) (esperado 0 ⇒ baseline zero).`);
    for (const c of alvo) {
      const email = c.email.toLowerCase().trim();
      const { data: u } = await supabase.from('usuarios').select('id, ativo, cargo_id, cargos(slug), usuario_areas(areas(nome))').eq('email', email).maybeSingle();
      const { data: p } = await supabase.from('profiles').select('role, active, membro_id').eq('email', email).maybeSingle();
      const areasU = (u?.usuario_areas || []).map((x) => x.areas?.nome).filter(Boolean);
      console.log(`• ${email}: role=${p?.role} · membro_id=${p?.membro_id ? 'ok' : '—'} · cargo=${u?.cargos?.slug} · áreas=[${areasU.join(', ')}] ⇒ esperado: grupos=5, resto=0`);
    }
  }

  console.log(`\n${APPLY ? '✅ Concluído.' : 'ℹ️  Rode de novo com --apply para aplicar.'}`);
  if (APPLY) console.log('Próximo: os 2 fazem login (senha padrão · trocam no 1º acesso) e caem direto em /grupos (HOME_MODULO_UNICO).');
}

main().catch((e) => { console.error('Erro fatal:', e.message); process.exit(1); });
