/**
 * Script: criar_logins_totem_kids.js
 *
 * Cria (idempotente) as contas de QUIOSQUE do Totem Kids — os computadores de
 * check-in/checkout do ministério infantil:
 *   - Totem Kids 1 · totem.kids1@cbrio.org
 *   - Totem Kids 2 · totem.kids2@cbrio.org
 *   - Totem Kids 3 · totem.kids3@cbrio.org
 *
 * Acesso desejado: SÓ o módulo `kids` (Ministerial), nível 3 — suficiente pra
 * operar o totem inteiro (abrir/encerrar sessão, check-in, checkout, cadastro
 * de criança, etiquetas, painel, config de salas/estações/pagers). Nada além.
 *
 * Como isso é garantido (sem vazar acesso):
 *   - role = 'assistente' → NÃO é isAdmin (não "vê tudo" ignorando a matriz).
 *   - cargo dedicado `totem-kids` com matriz VAZIA → 0 em todo módulo
 *     (resolveEffectivePerms usa override ?? default-do-cargo ?? 0; sem linha
 *     na matriz = 0; o nivel_padrao do cargo NÃO é piso).
 *   - override em permissoes_modulo: kids nível 3 — o ÚNICO módulo da conta
 *     (override vence cargo/área · mesmo mecanismo do totem-membro).
 *   - NENHUMA área em usuario_areas (área daria boost nível 5; totem não precisa).
 *   - is_membro_only = true → com um único módulo, o login TRAVA no Kids
 *     operacional (hub /ministerial/kids + telas do totem, via
 *     MODULO_TRAVA_PREFIXOS no AuthContext): sem menu, sem dashboard, sem
 *     Inteligência e sem /kids (painel do culto). Ao logar, abre direto no hub.
 *   - senha forte gerada + profiles.password_changed_at preenchido — sem isso o
 *     PrimeiroAcessoSenhaModal (obrigatório) travaria o totem pedindo troca.
 *   Direção à prova de falha: qualquer erro deixa a conta com MENOS acesso,
 *   nunca com acesso indevido.
 *
 * Uso (a partir de backend/, com backend/.env presente):
 *   node scripts/criar_logins_totem_kids.js                # dry-run (só mostra o plano)
 *   node scripts/criar_logins_totem_kids.js --apply        # aplica
 *   node scripts/criar_logins_totem_kids.js --apply --reset-senha  # regenera senha de conta existente
 */

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const path = require('path');
try { require('dotenv').config({ path: path.join(__dirname, '../.env') }); } catch {}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APPLY = process.argv.includes('--apply');
const RESET_SENHA = process.argv.includes('--reset-senha');

const CARGO_SLUG = 'totem-kids';
const MODULO_SLUG = 'kids';
const NIVEL = 3;
const CONTAS = [
  { email: 'totem.kids1@cbrio.org', nome: 'Totem Kids 1' },
  { email: 'totem.kids2@cbrio.org', nome: 'Totem Kids 2' },
  { email: 'totem.kids3@cbrio.org', nome: 'Totem Kids 3' },
];

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌  Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (backend/.env).');
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Senha forte porém digitável (sem caracteres ambíguos: 0/O/1/l/I).
function gerarSenha() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const grupo = () => Array.from({ length: 4 }, () => chars[crypto.randomInt(chars.length)]).join('');
  return `Kids-${grupo()}-${grupo()}-${grupo()}`;
}

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
      // reafirma matriz vazia (defensivo) + ativo. Quem zera o acesso é a matriz
      // vazia (o nivel_padrao não é piso); CHECK da tabela proíbe 0 nessas colunas.
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
  novo.nome = 'Totem Kids (quiosque)';
  novo.nome_completo = 'Conta de quiosque · Totem Kids (acesso só ao módulo Kids)';
  if ('descricao' in novo) novo.descricao = 'Conta dedicada dos computadores do totem Kids. Sem matriz: acesso só por override no módulo kids (nível 3).';
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
  const { data: existe } = await supabase.from('usuarios').select('id').ilike('email', email).maybeSingle();
  if (existe) {
    if (APPLY) {
      const { error } = await supabase.from('usuarios').update({ nome, cargo_id: cargoId, ativo: true }).eq('id', existe.id);
      if (error) throw new Error(`atualizar usuario: ${error.message}`);
    }
    return existe.id;
  }
  if (!APPLY) return '(novo · será criado)';
  const { data, error } = await supabase.from('usuarios').insert({ email, nome, cargo_id: cargoId, ativo: true }).select('id').single();
  if (error) throw new Error(`criar usuario: ${error.message}`);
  return data.id;
}

async function ensureOverrideKids(usuarioId, moduloId) {
  const payload = {
    usuario_id: usuarioId, modulo_id: moduloId,
    nivel_leitura: NIVEL, nivel_escrita: NIVEL,
    pode_exportar: false, pode_aprovar: false, escopo_proprio: false,
    motivo: 'Conta de quiosque do Totem Kids (check-in/checkout do ministério infantil)',
    // criado_por é INTEGER (FK) — fica null no script.
  };
  const { data: existe, error: selErr } = await supabase.from('permissoes_modulo')
    .select('id').eq('usuario_id', usuarioId).eq('modulo_id', moduloId).maybeSingle();
  if (selErr) throw new Error(`ler override: ${selErr.message}`);
  if (existe) {
    const { error } = await supabase.from('permissoes_modulo').update(payload).eq('id', existe.id);
    if (error) throw new Error(`atualizar override: ${error.message}`);
  } else {
    const { error } = await supabase.from('permissoes_modulo').insert(payload);
    if (error) throw new Error(`criar override: ${error.message}`);
  }
}

async function main() {
  console.log(`\n${APPLY ? '🚀 MODO APLICAR' : '🔎 DRY-RUN (nada será gravado · use --apply para aplicar)'}\n`);

  // PREFLIGHT — módulo kids
  const { data: modulo, error: mErr } = await supabase.from('modulos')
    .select('id, slug, ativo').eq('slug', MODULO_SLUG).maybeSingle();
  if (mErr || !modulo) {
    console.error(`❌  Módulo '${MODULO_SLUG}' não encontrado em modulos. Abortando.`);
    process.exit(1);
  }
  console.log(`✓ Módulo alvo: ${modulo.slug} (id=${modulo.id}${modulo.ativo ? '' : ' · ⚠️ INATIVO'})`);

  const cargo = await ensureCargoZero();
  console.log(`✓ Cargo: ${CARGO_SLUG} (id=${cargo.id}) · matriz vazia ⇒ 0 em todos os módulos`);

  const senhasGeradas = [];
  for (const c of CONTAS) {
    const email = c.email.toLowerCase().trim();
    const existing = await findAuthUser(email);
    console.log(`\n— ${email} (${c.nome})`);
    console.log(`   auth.users: ${existing ? 'JÁ EXISTE (id=' + existing.id + ') · senha ' + (RESET_SENHA ? 'SERÁ regenerada' : 'NÃO será alterada') : 'será criado com senha forte gerada'}`);

    if (!APPLY) {
      console.log(`   [dry-run] criaria/garantiria: profile(role=assistente · travado no kids · password_changed_at) · usuarios(cargo=${CARGO_SLUG}) · SEM áreas · override kids=${NIVEL}`);
      continue;
    }

    let uid = existing?.id;
    let senhaDefinida = null;
    if (!uid) {
      const senha = gerarSenha();
      const { data: novo, error } = await supabase.auth.admin.createUser({
        email, password: senha, email_confirm: true, user_metadata: { name: c.nome },
      });
      if (error) { console.error(`   ✗ erro ao criar auth user: ${error.message}`); continue; }
      uid = novo.user.id;
      senhaDefinida = senha;
      console.log(`   ✓ auth user criado (id=${uid})`);
    } else if (RESET_SENHA) {
      const senha = gerarSenha();
      const { error } = await supabase.auth.admin.updateUserById(uid, { password: senha });
      if (error) console.error(`   ✗ erro ao redefinir senha: ${error.message}`);
      else { senhaDefinida = senha; console.log('   ✓ senha regenerada'); }
    }
    if (senhaDefinida) senhasGeradas.push({ email, nome: c.nome, senha: senhaDefinida });

    // profile: assistente + is_membro_only=true → com 1 único módulo, o login
    // trava no Kids operacional (hub + totem · MODULO_TRAVA_PREFIXOS no front).
    // password_changed_at só quando a senha foi definida agora (suprime o modal de 1º acesso).
    const profilePayload = { id: uid, name: c.nome, email, role: 'assistente', active: true, is_membro_only: true };
    if (senhaDefinida) profilePayload.password_changed_at = new Date().toISOString();
    const { error: pErr } = await supabase.from('profiles').upsert(profilePayload, { onConflict: 'id' });
    if (pErr) { console.error(`   ✗ erro no profile: ${pErr.message}`); continue; }

    const usuarioId = await ensureUsuario(email, c.nome, cargo.id);

    // NENHUMA área: área daria boost nível 5 em módulo mapeado (defensivo).
    const { error: uaErr } = await supabase.from('usuario_areas').delete().eq('usuario_id', usuarioId);
    if (uaErr) console.error(`   ✗ erro ao limpar áreas: ${uaErr.message}`);

    await ensureOverrideKids(usuarioId, modulo.id);
    console.log(`   ✓ profile(role=assistente) · usuarios#${usuarioId}(cargo=${CARGO_SLUG}) · sem áreas · override kids=${NIVEL}`);
  }

  // VERIFICAÇÃO (só no apply)
  if (APPLY) {
    console.log('\n══ Verificação ══');
    const { count } = await supabase.from('cargo_modulo_permissao').select('*', { count: 'exact', head: true }).eq('cargo_id', cargo.id);
    console.log(`Matriz do cargo ${CARGO_SLUG}: ${count ?? 0} linha(s) (esperado 0 ⇒ baseline zero).`);
    for (const c of CONTAS) {
      const email = c.email.toLowerCase().trim();
      // queries separadas (sem embed): permissoes_modulo tem 2 FKs pra usuarios
      // (usuario_id + criado_por) e o embed ambíguo anula a query no PostgREST.
      const { data: u } = await supabase.from('usuarios')
        .select('id, ativo, cargos(slug)').ilike('email', email).maybeSingle();
      const { data: p } = await supabase.from('profiles').select('role, active, is_membro_only, password_changed_at').eq('email', email).maybeSingle();
      const { data: ovRows } = u ? await supabase.from('permissoes_modulo')
        .select('nivel_leitura, nivel_escrita, expira_em, modulos(slug)').eq('usuario_id', u.id) : { data: [] };
      const { count: nAreas } = u ? await supabase.from('usuario_areas')
        .select('*', { count: 'exact', head: true }).eq('usuario_id', u.id) : { count: 0 };
      const ovs = (ovRows || []).map((o) => `${o.modulos?.slug}=${o.nivel_leitura}/${o.nivel_escrita}`);
      console.log(`• ${email}: role=${p?.role} · membro_only=${p?.is_membro_only} · senha_ok=${!!p?.password_changed_at} · cargo=${u?.cargos?.slug} · áreas=${nAreas ?? 0} · overrides=[${ovs.join(', ')}] ⇒ esperado: kids=${NIVEL}, resto=0`);
    }
    if (senhasGeradas.length) {
      console.log('\n══ CREDENCIAIS (guarde agora · não ficam salvas em lugar nenhum) ══');
      for (const s of senhasGeradas) console.log(`• ${s.nome} · ${s.email} · senha: ${s.senha}`);
    }
  }

  console.log(`\n${APPLY ? '✅ Concluído.' : 'ℹ️  Rode de novo com --apply para aplicar.'}`);
  if (APPLY) console.log('Próximo: logar nos computadores do totem — o JWT novo já nasce com o acesso certo (contas novas não têm cache antigo).');
}

main().catch((e) => { console.error('Erro fatal:', e.message); process.exit(1); });
