// ============================================================================
// Seed do ambiente de DEMONSTRACAO · dados 100% ficticios
// ============================================================================
// Popula um projeto Supabase SEPARADO (o de demo) com dados inventados pra
// mostrar o sistema funcionando sem nenhum dado real. NUNCA rodar contra o
// banco de producao.
//
// Pre-requisitos:
//   1. Projeto Supabase demo criado, com TODAS as migrations aplicadas.
//   2. backend/.env apontando pro projeto DEMO (SUPABASE_URL +
//      SUPABASE_SERVICE_ROLE_KEY do demo) · ou passar via env inline.
//
// Uso (a trava de seguranca exige confirmar a URL do demo):
//   SEED_ALLOW_URL="https://SEU-DEMO.supabase.co" node scripts/seed-demo.cjs
//   ... --dry-run   · so mostra o que faria
//
// Idempotente · limpa os dados transacionais ficticios e recria do zero.
// Catalogos seedados por migration (igrejas, cargos, vol_service_types,
// kids_salas, tipos_dado_bruto) NAO sao tocados.
// ============================================================================

const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(__dirname, '..', 'backend', '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY_RUN = process.argv.includes('--dry-run');

const DEMO_EMAIL = process.env.VITE_DEMO_EMAIL || process.env.DEMO_EMAIL || 'demo@cbrio.dev';
const DEMO_PASSWORD = process.env.VITE_DEMO_PASSWORD || process.env.DEMO_PASSWORD || 'demo-cbrio-2026';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('ERRO: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY obrigatorios (backend/.env do projeto DEMO).');
  process.exit(1);
}

// Trava anti-producao · so roda se o operador confirmar a URL do demo.
const ALLOW_URL = process.env.SEED_ALLOW_URL;
if (!ALLOW_URL || !SUPABASE_URL.startsWith(ALLOW_URL)) {
  console.error(
    'ABORTANDO por seguranca.\n' +
    `  SUPABASE_URL atual: ${SUPABASE_URL}\n` +
    '  Para confirmar que este e o projeto DEMO (e nao producao), rode com:\n' +
    `    SEED_ALLOW_URL="${SUPABASE_URL}" node scripts/seed-demo.cjs\n`
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const SEDE_ID = '00000000-0000-0000-0000-000000000001';

// ─────────────────────────────────────────────────────────────────────────
// Geradores de dados ficticios (deterministicos · seed fixo pra re-rodar igual)
// ─────────────────────────────────────────────────────────────────────────
let _seed = 20260527;
function rng() { _seed = (_seed * 1103515245 + 12345) & 0x7fffffff; return _seed / 0x7fffffff; }
function pick(arr) { return arr[Math.floor(rng() * arr.length)]; }
function int(min, max) { return Math.floor(rng() * (max - min + 1)) + min; }
function chance(p) { return rng() < p; }

const NOMES = ['Ana', 'Bruno', 'Carla', 'Daniel', 'Eduarda', 'Felipe', 'Gabriela', 'Henrique', 'Isabela', 'Joao', 'Larissa', 'Marcos', 'Natalia', 'Otavio', 'Patricia', 'Rafael', 'Sofia', 'Thiago', 'Vanessa', 'William', 'Beatriz', 'Caio', 'Debora', 'Enzo', 'Fernanda', 'Gustavo', 'Helena', 'Igor', 'Julia', 'Lucas', 'Mariana', 'Nicolas', 'Olivia', 'Pedro', 'Renata', 'Samuel', 'Tatiana', 'Vitor', 'Yasmin', 'Arthur'];
const SOBRENOMES = ['Silva', 'Santos', 'Oliveira', 'Souza', 'Lima', 'Pereira', 'Ferreira', 'Almeida', 'Costa', 'Rodrigues', 'Martins', 'Araujo', 'Ribeiro', 'Carvalho', 'Gomes', 'Barbosa', 'Rocha', 'Dias', 'Nascimento', 'Moreira'];
const NOMES_KIDS = ['Theo', 'Alice', 'Miguel', 'Laura', 'Heitor', 'Valentina', 'Davi', 'Cecilia', 'Bernardo', 'Maria', 'Gael', 'Liz', 'Noah', 'Aurora', 'Ravi', 'Heloisa'];
const CIDADES = ['Rio de Janeiro', 'Niteroi', 'Sao Goncalo', 'Duque de Caxias', 'Nova Iguacu'];
const BAIRROS = ['Botafogo', 'Tijuca', 'Copacabana', 'Barra da Tijuca', 'Meier', 'Campo Grande', 'Madureira'];
const AREAS_RH = ['Pastoral', 'Administrativo', 'Criativo', 'Ministerial', 'Financeiro', 'Operacoes'];
const CARGOS_RH = ['Pastor Auxiliar', 'Assistente Administrativo', 'Designer', 'Lider de Louvor', 'Analista Financeiro', 'Coordenador', 'Recepcionista', 'Produtor'];

function nomeCompleto() { return `${pick(NOMES)} ${pick(SOBRENOMES)} ${pick(SOBRENOMES)}`; }
function slugEmail(nome, i) {
  const base = nome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]+/g, '.');
  return `${base}.${i}@exemplo-demo.test`;
}
function telefone() { return `21${int(90000, 99999)}${int(1000, 9999)}`; }
function cpf() { return String(int(10000000000, 99999999999)); }
function dataNasc(min = 1960, max = 2008) { return `${int(min, max)}-${String(int(1, 12)).padStart(2, '0')}-${String(int(1, 28)).padStart(2, '0')}`; }
function isoDiasAtras(d) { const dt = new Date(); dt.setDate(dt.getDate() - d); return dt.toISOString(); }
function dateDiasAtras(d) { return isoDiasAtras(d).slice(0, 10); }
function primeiroDiaMes(mesesAtras) { const dt = new Date(); dt.setMonth(dt.getMonth() - mesesAtras, 1); return dt.toISOString().slice(0, 10); }

async function ins(table, rows) {
  if (!rows.length) { console.log(`  · ${table}: 0 linhas (pulado)`); return []; }
  if (DRY_RUN) { console.log(`  [dry-run] ${table}: ${rows.length} linhas`); return rows.map((r, i) => ({ id: `dry-${i}`, ...r })); }
  const out = [];
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { data, error } = await supabase.from(table).insert(chunk).select();
    if (error) { console.error(`  ✗ ${table}: ${error.message}`); throw error; }
    out.push(...(data || []));
  }
  console.log(`  ✓ ${table}: ${out.length} linhas`);
  return out;
}

async function wipe(table) {
  if (DRY_RUN) { console.log(`  [dry-run] wipe ${table}`); return; }
  const { error } = await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (error && !/does not exist/i.test(error.message)) console.warn(`  ! wipe ${table}: ${error.message}`);
}

// ─────────────────────────────────────────────────────────────────────────
// Usuario demo (auth + profile + cargo dev + super-admin)
// ─────────────────────────────────────────────────────────────────────────
async function ensureDemoUser() {
  console.log('\n[1] Usuario demo');
  if (DRY_RUN) { console.log('  [dry-run] criaria auth user + profile + super-admin'); return 'dry-user'; }

  // auth.users
  let userId = null;
  const { data: created, error: cErr } = await supabase.auth.admin.createUser({
    email: DEMO_EMAIL, password: DEMO_PASSWORD, email_confirm: true,
    user_metadata: { name: 'Visitante Demo' },
  });
  if (created?.user) {
    userId = created.user.id;
  } else if (cErr && /already|registered|exists/i.test(cErr.message)) {
    // ja existe · localiza e ressincroniza a senha
    for (let page = 1; page <= 20 && !userId; page++) {
      const { data } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
      const u = data?.users?.find((x) => x.email?.toLowerCase() === DEMO_EMAIL.toLowerCase());
      if (u) userId = u.id;
      if (!data?.users?.length) break;
    }
    if (userId) await supabase.auth.admin.updateUserById(userId, { password: DEMO_PASSWORD, email_confirm: true });
  } else if (cErr) {
    throw cErr;
  }
  if (!userId) throw new Error('Nao consegui criar/localizar o auth user demo.');
  console.log(`  ✓ auth user: ${DEMO_EMAIL}`);

  // cargo dev (pra nivel 5 na matriz granular · backend)
  const { data: dev } = await supabase.from('cargos').select('id').eq('slug', 'dev').maybeSingle();
  if (!dev) console.warn('  ! cargo "dev" nao encontrado · aplique as migrations de permissoes no demo.');

  // profile · role=admin garante "ve tudo" no frontend
  const { error: pErr } = await supabase.from('profiles').upsert({
    id: userId, name: 'Visitante Demo', email: DEMO_EMAIL, role: 'admin',
    area: 'Tecnologia', active: true,
  }, { onConflict: 'id' });
  if (pErr) throw pErr;
  console.log('  ✓ profile (role=admin)');

  // usuarios · vincula cargo dev (sistema granular)
  const { error: uErr } = await supabase.from('usuarios').upsert({
    email: DEMO_EMAIL, cargo_id: dev?.id ?? null, ativo: true,
  }, { onConflict: 'email' });
  if (uErr) console.warn(`  ! usuarios: ${uErr.message}`);
  else console.log('  ✓ usuarios (cargo dev)');

  // super-admin · bypass de RLS no backend
  const { error: sErr } = await supabase.from('app_super_admins').upsert({
    email: DEMO_EMAIL, nome: 'Visitante Demo', added_by: 'seed-demo', notes: 'usuario de demonstracao',
  }, { onConflict: 'email' });
  if (sErr) console.warn(`  ! app_super_admins: ${sErr.message}`);
  else console.log('  ✓ app_super_admins');

  return userId;
}

// ─────────────────────────────────────────────────────────────────────────
async function seedMembros() {
  console.log('\n[2] Membros');
  const rows = [];
  for (let i = 0; i < 90; i++) {
    const nome = nomeCompleto();
    rows.push({
      nome,
      email: chance(0.8) ? slugEmail(nome, i) : null,
      telefone: chance(0.9) ? telefone() : null,
      cpf: chance(0.6) ? cpf() : null,
      data_nascimento: chance(0.85) ? dataNasc() : null,
      cidade: pick(CIDADES),
      bairro: pick(BAIRROS),
      status: pick(['membro_ativo', 'membro_ativo', 'membro_ativo', 'congregado', 'visitante']),
      igreja_id: SEDE_ID,
      active: true,
      quer_servir: chance(0.3),
    });
  }
  return ins('mem_membros', rows);
}

async function seedGrupos(membros) {
  console.log('\n[3] Grupos + membros');
  const cats = ['Celula', 'Discipulado', 'Casais', 'Jovens', 'Mulheres', 'Homens'];
  const gruposRows = cats.map((c, i) => ({
    nome: `Grupo ${c} ${i + 1}`,
    categoria: c,
    lider_id: membros[i]?.id ?? null,
    local: pick(BAIRROS),
    dia_semana: int(1, 6),
    horario: `${int(18, 20)}:00:00`,
    ativo: true,
  }));
  const grupos = await ins('mem_grupos', gruposRows);
  if (!grupos.length) return;

  // cada membro (subset) entra em no maximo 1 grupo ativo (UNIQUE membro_id WHERE saiu_em IS NULL)
  const vinculos = [];
  membros.slice(0, 60).forEach((m, i) => {
    vinculos.push({
      grupo_id: grupos[i % grupos.length].id,
      membro_id: m.id,
      entrou_em: dateDiasAtras(int(30, 400)),
      saiu_em: chance(0.12) ? dateDiasAtras(int(1, 20)) : null,
    });
  });
  await ins('mem_grupo_membros', vinculos);
}

async function seedContribuicoes(membros) {
  console.log('\n[4] Contribuicoes (generosidade)');
  const rows = [];
  for (let mes = 0; mes < 6; mes++) {
    const doadores = membros.slice(0, 50);
    for (const m of doadores) {
      if (!chance(0.6)) continue;
      rows.push({
        membro_id: m.id,
        tipo: pick(['dizimo', 'dizimo', 'oferta']),
        valor: (int(20, 600) + rng()).toFixed(2),
        data: dateDiasAtras(mes * 30 + int(0, 27)),
        forma_pagamento: pick(['pix', 'pix', 'cartao', 'dinheiro', 'transferencia']),
        origem: 'manual',
      });
    }
  }
  await ins('mem_contribuicoes', rows);
}

async function seedCultos() {
  console.log('\n[5] Cultos (ultimos 6 meses)');
  const { data: tipos } = await supabase.from('vol_service_types').select('*').eq('is_active', true);
  if (!tipos?.length) { console.warn('  ! sem vol_service_types · pulando cultos.'); return []; }

  const rows = [];
  const hoje = new Date();
  for (let semana = 0; semana < 26; semana++) {
    for (const t of tipos) {
      if (t.recurrence_day == null) continue;
      const base = new Date(hoje);
      base.setDate(base.getDate() - semana * 7);
      // snap pro dia da semana do culto (getDay 0=Dom): volta pro domingo e soma o dia alvo
      base.setDate(base.getDate() - base.getDay() + t.recurrence_day);
      if (base > hoje) continue;
      const data = base.toISOString().slice(0, 10);
      const presAdulto = int(60, 320);
      const row = {
        service_type_id: t.id,
        nome: t.name,
        data,
        hora: t.recurrence_time || '10:00:00',
        presencial_adulto: presAdulto,
        presencial_kids: t.has_kids ? int(15, 70) : 0,
        decisoes_presenciais: chance(0.6) ? int(0, 8) : 0,
        decisoes_online: t.has_online && chance(0.4) ? int(0, 5) : 0,
      };
      if (t.has_online) {
        row.online_pico = int(80, 600);
        row.online_ds = int(300, 2500);
        row.online_ddus = int(800, 6000);
      }
      rows.push(row);
    }
  }
  // upsert por (service_type_id, data)
  if (DRY_RUN) { console.log(`  [dry-run] cultos: ${rows.length} linhas`); return rows.map((r, i) => ({ id: `dry-c-${i}`, ...r })); }
  const out = [];
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { data, error } = await supabase.from('cultos').upsert(chunk, { onConflict: 'service_type_id,data' }).select();
    if (error) { console.error(`  ✗ cultos: ${error.message}`); throw error; }
    out.push(...(data || []));
  }
  console.log(`  ✓ cultos: ${out.length} linhas`);
  return out;
}

async function seedDecisoesPessoas(cultos, membros) {
  console.log('\n[6] Pessoas decididas (recentes)');
  const recentes = cultos.filter((c) => c.data >= dateDiasAtras(60));
  const rows = [];
  for (const c of recentes) {
    const n = int(0, 3);
    for (let k = 0; k < n; k++) {
      const nome = nomeCompleto();
      rows.push({
        culto_id: c.id,
        nome,
        telefone: telefone(),
        cpf: chance(0.5) ? cpf() : null,
        idade: int(12, 60),
        tipo_decisao: chance(0.8) ? 'presencial' : 'online',
        status_followup: pick(['pendente', 'em_acompanhamento', 'integrado']),
      });
    }
  }
  await ins('cultos_decisoes_pessoas', rows);
}

async function seedBatismos(membros) {
  console.log('\n[7] Batismos');
  const rows = [];
  for (let i = 0; i < 18; i++) {
    const nome = pick(NOMES);
    const sobrenome = `${pick(SOBRENOMES)} ${pick(SOBRENOMES)}`;
    const st = pick(['pendente', 'confirmado', 'realizado', 'realizado']);
    rows.push({
      nome, sobrenome,
      data_nascimento: dataNasc(1980, 2010),
      cpf: chance(0.6) ? cpf() : null,
      telefone: telefone(),
      status: st,
      data_batismo: st === 'realizado' ? dateDiasAtras(int(10, 120)) : null,
      origem: 'manual',
    });
  }
  await ins('batismo_inscricoes', rows);
}

async function seedRH() {
  console.log('\n[8] RH · funcionarios');
  const rows = [];
  for (let i = 0; i < 16; i++) {
    const nome = nomeCompleto();
    const demitido = chance(0.12);
    rows.push({
      nome,
      cpf: cpf(),
      email: slugEmail(nome, `rh${i}`),
      telefone: telefone(),
      cargo: pick(CARGOS_RH),
      area: pick(AREAS_RH),
      tipo_contrato: pick(['CLT', 'CLT', 'PJ']),
      data_admissao: dateDiasAtras(int(120, 1400)),
      data_demissao: demitido ? dateDiasAtras(int(1, 90)) : null,
      salario: (int(1800, 9000) + rng()).toFixed(2),
      status: demitido ? 'inativo' : 'ativo',
    });
  }
  await ins('rh_funcionarios', rows);
}

async function seedKids(membros, cultos) {
  console.log('\n[9] Kids');
  const { data: salas } = await supabase.from('kids_salas').select('id, nome').eq('ativo', true);
  if (!salas?.length) { console.warn('  ! sem kids_salas · pulando kids.'); return; }

  // criancas
  const criancasRows = [];
  for (let i = 0; i < 32; i++) {
    criancasRows.push({
      nome: `${pick(NOMES_KIDS)} ${pick(SOBRENOMES)}`,
      data_nascimento: dataNasc(2015, 2024),
      sexo: pick(['M', 'F']),
      visitante: chance(0.3),
      ativo: true,
    });
  }
  const criancas = await ins('kids_criancas', criancasRows);
  if (!criancas.length) return;

  // responsaveis (1 membro por crianca)
  const respRows = criancas.map((c, i) => ({
    crianca_id: c.id,
    membro_id: membros[i % membros.length].id,
    parentesco: pick(['mae', 'pai', 'avo_a', 'tutor']),
    autorizado_buscar: true,
    contato_emergencia: true,
  }));
  await ins('kids_responsaveis', respRows);

  // sessoes nos cultos recentes com kids
  const cultosKids = cultos.filter((c) => c.presencial_kids > 0 && c.data >= dateDiasAtras(40)).slice(0, 6);
  const sessoesRows = cultosKids.map((c) => ({
    culto_id: c.id,
    abrir_em: `${c.data}T${c.hora}`,
    status: 'encerrada',
    encerrada_at: `${c.data}T12:00:00`,
  }));
  if (DRY_RUN) { console.log(`  [dry-run] kids_sessoes: ${sessoesRows.length}`); return; }
  const sessoes = [];
  for (const s of sessoesRows) {
    const { data, error } = await supabase.from('kids_sessoes').upsert(s, { onConflict: 'culto_id' }).select().maybeSingle();
    if (error) { console.warn(`  ! kids_sessoes: ${error.message}`); continue; }
    if (data) sessoes.push(data);
  }
  console.log(`  ✓ kids_sessoes: ${sessoes.length} linhas`);

  // checkins
  const checkRows = [];
  for (const s of sessoes) {
    const presentes = criancas.slice(0, int(8, 18));
    for (const cr of presentes) {
      checkRows.push({
        sessao_id: s.id,
        crianca_id: cr.id,
        sala_id: pick(salas).id,
        responsavel_checkin_nome: nomeCompleto(),
        responsavel_checkin_telefone: telefone(),
        codigo_seguranca: `${pick(['A','B','C','D','E','F','G','H'])}${int(2,9)}${pick(['K','L','M','N','P','Q','R'])}${int(2,9)}`,
        codigo_barras: `DEMO${int(100000, 999999)}`,
        checkin_at: `${s.abrir_em}`,
        checkout_at: chance(0.85) ? `${s.encerrada_at}` : null,
        checkout_metodo: chance(0.85) ? 'codigo_digitado' : null,
        labels_impressas: 2,
      });
    }
  }
  // unique (sessao_id, crianca_id) garantido (1 por crianca por sessao)
  await ins('kids_checkins', checkRows);
}

async function seedVoluntarios(membros) {
  console.log('\n[10] Voluntarios');
  const { data: mins } = await supabase.from('mem_ministerios').select('id').limit(20);
  if (!mins?.length) { console.warn('  ! sem mem_ministerios · pulando voluntarios.'); return; }
  const rows = [];
  const usados = new Set();
  membros.slice(0, 40).forEach((m, i) => {
    const min = mins[i % mins.length];
    const key = `${m.id}:${min.id}`;
    if (usados.has(key)) return;
    usados.add(key);
    rows.push({
      membro_id: m.id,
      ministerio_id: min.id,
      papel: pick(['Recepcao', 'Louvor', 'Kids', 'Diaconia', 'Midia', 'Estacionamento']),
      desde: dateDiasAtras(int(60, 700)),
      ate: chance(0.15) ? dateDiasAtras(int(1, 40)) : null,
    });
  });
  await ins('mem_voluntarios', rows);
}

async function seedNsm(membros) {
  console.log('\n[11] NSM eventos');
  const valores = ['seguir', 'conectar', 'investir', 'servir', 'generosidade'];
  const rows = [];
  for (let i = 0; i < 70; i++) {
    const m = membros[i % membros.length];
    const decisaoDias = int(0, 120);
    const engajDias = Math.max(0, decisaoDias - int(0, 70));
    rows.push({
      membro_id: m.id,
      nome: m.nome,
      igreja_id: SEDE_ID,
      data_decisao: dateDiasAtras(decisaoDias),
      valor_engajado: pick(valores),
      data_engajamento: dateDiasAtras(engajDias),
      origem: 'seed_demo',
    });
  }
  await ins('nsm_eventos', rows);
  if (!DRY_RUN) {
    const { error } = await supabase.rpc('recalcular_nsm');
    if (error) console.warn(`  ! recalcular_nsm: ${error.message}`);
    else console.log('  ✓ recalcular_nsm()');
  }
}

async function seedDadosBrutos() {
  console.log('\n[12] Dados brutos (KPIs/painel)');
  const { data: tipos } = await supabase.from('tipos_dado_bruto').select('id').eq('ativo', true);
  const existentes = new Set((tipos || []).map((t) => t.id));
  const candidatos = ['frequencia_culto', 'conversoes', 'batismos', 'doacoes_valor', 'voluntarios_ativos', 'devocionais', 'frequencia_grupos'];
  const usar = candidatos.filter((c) => existentes.has(c));
  if (!usar.length) { console.warn('  ! nenhum tipo_dado_bruto conhecido · pulando.'); return; }
  const areas = ['sede', 'ami', 'bridge', 'kids', 'online', 'integracao'];
  const rows = [];
  for (let mes = 0; mes < 6; mes++) {
    const data = primeiroDiaMes(mes);
    for (const area of areas) {
      for (const tipo of usar) {
        let valor;
        if (tipo === 'doacoes_valor') valor = int(8000, 60000);
        else if (tipo === 'conversoes' || tipo === 'batismos') valor = int(0, 25);
        else valor = int(20, 350);
        rows.push({ tipo_id: tipo, area, data, valor, contexto: {}, origem: 'importado' });
      }
    }
  }
  if (DRY_RUN) { console.log(`  [dry-run] dados_brutos: ${rows.length} linhas`); return; }
  const out = [];
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { data, error } = await supabase.from('dados_brutos').upsert(chunk, { onConflict: 'tipo_id,area,data,contexto' }).select();
    if (error) { console.warn(`  ! dados_brutos: ${error.message}`); break; }
    out.push(...(data || []));
  }
  console.log(`  ✓ dados_brutos: ${out.length} linhas`);
}

// ─────────────────────────────────────────────────────────────────────────
async function wipeTransacional() {
  console.log('\n[0] Limpando dados transacionais ficticios');
  const tabelas = [
    'kids_checkins', 'kids_sessoes', 'kids_responsaveis', 'kids_criancas',
    'cultos_decisoes_pessoas', 'batismo_inscricoes', 'nsm_eventos',
    'mem_contribuicoes', 'mem_grupo_membros', 'mem_voluntarios', 'mem_grupos',
    'rh_funcionarios', 'dados_brutos', 'cultos', 'mem_membros',
  ];
  for (const t of tabelas) await wipe(t);
  console.log('  ✓ limpeza concluida');
}

async function main() {
  console.log(`\n=== Seed DEMO ${DRY_RUN ? '(dry-run)' : ''} ===`);
  console.log(`Projeto: ${SUPABASE_URL}\n`);

  await ensureDemoUser();
  if (!DRY_RUN) await wipeTransacional();

  const membros = await seedMembros();
  await seedGrupos(membros);
  await seedContribuicoes(membros);
  const cultos = await seedCultos();
  await seedDecisoesPessoas(cultos, membros);
  await seedBatismos(membros);
  await seedRH();
  await seedKids(membros, cultos);
  await seedVoluntarios(membros);
  await seedNsm(membros);
  await seedDadosBrutos();

  console.log('\n=== Seed concluido ===');
  console.log(`Login demo: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  console.log('Acesse /demo no deploy de demonstracao.\n');
}

main().catch((e) => { console.error('\nFALHOU:', e.message); process.exit(1); });
