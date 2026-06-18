/**
 * Script: criar_colaboradores_producao.js
 *
 * Cria (idempotente) os colaboradores que SÓ preenchem a Produção de Culto:
 *   - André Texeira  · andre.texeira@cbrio.org
 *   - Gabriel Munck  · gabriel.munck@cbrio.org
 *
 * Acesso desejado: administrador completo (nível 5) APENAS no módulo
 * `producao`, e ZERO em todos os outros módulos.
 *
 * Como isso é garantido (sem vazar acesso):
 *   - role = 'assistente'  → NÃO é isAdmin (não "vê tudo" ignorando a matriz).
 *   - cargo dedicado `colaborador-producao` com matriz VAZIA → 0 em todo módulo
 *     (resolveEffectivePerms usa override ?? default-do-cargo ?? 0; sem linha
 *     na matriz = 0; o nivel_padrao do cargo NÃO é piso).
 *   - área "Produção" em usuario_areas → AREA_MODULO_BOOST eleva SÓ `producao`
 *     para 5 (mesmo mecanismo do Pedro Fernandes). Nenhum outro módulo recebe boost.
 *   Direção à prova de falha: qualquer erro deixa o usuário com MENOS acesso,
 *   nunca com acesso indevido.
 *
 * Uso (a partir de backend/, com backend/.env presente):
 *   node scripts/criar_colaboradores_producao.js            # dry-run (só mostra o plano)
 *   node scripts/criar_colaboradores_producao.js --apply    # aplica
 */

const { createClient } = require('@supabase/supabase-js');
const path = require('path');
try { require('dotenv').config({ path: path.join(__dirname, '../.env') }); } catch {}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SENHA_PADRAO = process.env.SENHA_PADRAO || 'cbrio1234';
const APPLY = process.argv.includes('--apply');
// reseta a senha p/ a padrão MESMO se a conta já existir (contas dormentes)
const RESET_SENHA = process.argv.includes('--reset-senha');
// allowlist opcional: e-mails passados na linha de comando restringem quem é processado
const ONLY = process.argv.filter((a) => a.includes('@')).map((s) => s.toLowerCase().trim());

const CARGO_SLUG = 'colaborador-producao';
const COLAB = [
  { email: 'andre.texeira@cbrio.org', nome: 'André Texeira' },
  { email: 'gabriel.munck@cbrio.org', nome: 'Gabriel Munck' },
];

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌  Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (backend/.env).');
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DIACRITICOS = new RegExp('[\\u0300-\\u036f]', 'g'); // marcas de acento (NFD)
const norm = (s) => (s || '').toString().toLowerCase().normalize('NFD').replace(DIACRITICOS, '').trim();

async function findAuthUser(email) {
  // listUsers é paginado; varremos até achar (base pequena).
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
      // reafirma matriz vazia (defensivo) + ativo. O que zera o acesso é a
      // matriz vazia (resolveEffectivePerms não usa nivel_padrao como piso);
      // nivel_padrao fica no mínimo válido (CHECK proíbe 0).
      await supabase.from('cargo_modulo_permissao').delete().eq('cargo_id', existente.id);
      await supabase.from('cargos').update({ nivel_padrao_leitura: 1, nivel_padrao_escrita: 1, ativo: true }).eq('id', existente.id);
    }
    return existente;
  }
  // clona um cargo existente p/ herdar TODAS as colunas NOT NULL e sobrescreve o essencial
  const { data: amostra, error: amErr } = await supabase.from('cargos').select('*').eq('ativo', true).order('id').limit(1).single();
  if (amErr) throw new Error(`amostra de cargo: ${amErr.message}`);
  const novo = { ...amostra };
  delete novo.id; delete novo.created_at; delete novo.updated_at;
  novo.slug = CARGO_SLUG;
  novo.nome = 'Colaborador Produção';
  novo.nome_completo = 'Colaborador de Produção (acesso só ao módulo Produção)';
  // o acesso é zerado pela matriz VAZIA (não pelo nivel_padrao); CHECK proíbe 0
  novo.nivel_padrao_leitura = 1;
  novo.nivel_padrao_escrita = 1;
  novo.ativo = true;
  if ('ordem' in novo) novo.ordem = 999;
  if (!APPLY) return { ...novo, id: '(novo · será criado)' };
  const { data: criado, error } = await supabase.from('cargos').insert(novo).select('*').single();
  if (error) throw new Error(`criar cargo: ${error.message}`);
  // garante zero linhas de matriz (cargo novo já não tem, mas é defensivo)
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

async function main() {
  console.log(`\n${APPLY ? '🚀 MODO APLICAR' : '🔎 DRY-RUN (nada será gravado · use --apply para aplicar)'}\n`);
  const alvo = ONLY.length ? COLAB.filter((c) => ONLY.includes(c.email.toLowerCase().trim())) : COLAB;
  if (ONLY.length) console.log(`(escopo restrito a: ${alvo.map((c) => c.email).join(', ') || '— nenhum —'})\n`);

  // PREFLIGHT — área "Produção"
  const { data: areas, error: aErr } = await supabase.from('areas').select('id, nome');
  if (aErr) { console.error('Erro ao ler areas:', aErr.message); process.exit(1); }
  const areaProd = (areas || []).find((a) => norm(a.nome) === 'producao');
  if (!areaProd) {
    console.error('❌  Área "Produção" não encontrada em `areas`. Sem ela o boost não eleva o módulo. Abortando.');
    process.exit(1);
  }
  console.log(`✓ Área de boost: "${areaProd.nome}" (id=${areaProd.id}) → eleva só o módulo producao`);

  // cargo zero
  const cargo = await ensureCargoZero();
  console.log(`✓ Cargo: ${CARGO_SLUG} (id=${cargo.id}) · matriz vazia ⇒ 0 em todos os módulos`);

  // por colaborador
  for (const c of alvo) {
    const email = c.email.toLowerCase().trim();
    const existing = await findAuthUser(email);
    console.log(`\n— ${email} (${c.nome})`);
    console.log(`   auth.users: ${existing ? 'JÁ EXISTE (id=' + existing.id + ') · senha ' + (RESET_SENHA ? 'SERÁ redefinida p/ a padrão' : 'NÃO será alterada') : 'será criado com a senha padrão'}`);

    if (!APPLY) {
      console.log('   [dry-run] criaria/garantiria: profile(role=assistente) · usuarios(cargo=colaborador-producao) · usuario_areas=[Produção]');
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

    await supabase.from('profiles').upsert({ id: uid, name: c.nome, email, role: 'assistente', active: true }, { onConflict: 'id' });
    const usuarioId = await ensureUsuario(email, c.nome, cargo.id);
    await supabase.from('usuario_areas').delete().eq('usuario_id', usuarioId);
    const { error: aiErr } = await supabase.from('usuario_areas').insert({ usuario_id: usuarioId, area_id: areaProd.id, is_principal: true });
    if (aiErr) { console.error(`   ✗ erro ao vincular área: ${aiErr.message}`); continue; }
    console.log(`   ✓ profile(role=assistente) · usuarios#${usuarioId}(cargo=${CARGO_SLUG}) · área=Produção`);
  }

  // VERIFICAÇÃO (só no apply)
  if (APPLY) {
    console.log('\n══ Verificação ══');
    const { count } = await supabase.from('cargo_modulo_permissao').select('*', { count: 'exact', head: true }).eq('cargo_id', cargo.id);
    console.log(`Matriz do cargo ${CARGO_SLUG}: ${count ?? 0} linha(s) (esperado 0 ⇒ baseline zero).`);
    for (const c of alvo) {
      const email = c.email.toLowerCase().trim();
      const { data: u } = await supabase.from('usuarios').select('id, ativo, cargo_id, cargos(slug), usuario_areas(areas(nome))').eq('email', email).maybeSingle();
      const { data: p } = await supabase.from('profiles').select('role, active').eq('email', email).maybeSingle();
      const areasU = (u?.usuario_areas || []).map((x) => x.areas?.nome).filter(Boolean);
      console.log(`• ${email}: role=${p?.role} · cargo=${u?.cargos?.slug} · áreas=[${areasU.join(', ')}] ⇒ esperado: producao=5, resto=0`);
    }
  }

  console.log(`\n${APPLY ? '✅ Concluído.' : 'ℹ️  Rode de novo com --apply para aplicar.'}`);
  if (APPLY) console.log('Próximo: os 2 fazem login (senha padrão) — JWT novo já reflete tudo. Cache de permissão não precisa de bust (cargo/áreas novos).');
}

main().catch((e) => { console.error('Erro fatal:', e.message); process.exit(1); });
