// ============================================================================
// Next · identidades do backfill de 13/05 → fila humana de Entradas
//
// O backfill (20260513160100) digitalizou 56 listas do Next e resolveu a pessoa
// de cada linha pelo matcher, gerando `membro_id` DETERMINÍSTICO (UUID v5 de
// nome+telefone). Lista manuscrita + telefone transcrito errado + telefone de
// família compartilhado produziram dois tipos de estrago:
//
//   (a) VÍNCULO DIVERGENTE — a linha do Next aponta pra um membro que é OUTRA
//       pessoa. Ex.: "Euflausino Pereira Paiva Neto" → membro "Thayna neto
//       caetano"; "Sophia Macedo Joseph" → "LAYANE ARAUJO MACEDO BELLO JOSEPH"
//       (mesmo telefone — mãe e filha). Isso contamina jornada/NSM: o
//       engajamento vai pro cadastro errado. NÃO tem como a máquina decidir
//       qual é a certa: alguns são pessoas diferentes, outros são o mesmo nome
//       escrito errado ("Neviton" × "Newton", "Rafael" × "Raphael").
//
//   (b) DUPLICATA DE MEMBRO — duas linhas do Next viraram dois cadastros da
//       MESMA pessoa. Esses a fila de "Possíveis duplicidades" das Entradas já
//       calcula sozinha (mesma `duplicidadePolicy` que este script usa pra
//       conferir), então aqui eles só são RELATADOS.
//
// ⚠️ LEI DA CASA: nunca auto-fundir e nunca auto-decidir identidade. Este
// script só ENFILEIRA em `identidade_pendencias` (tipo `vinculo_divergente`),
// que é a aba "Conflitos de CPF" do /entradas. Nada é apagado, nada é religado.
//
// Uso (na raiz do repo, com backend/.env presente):
//   node backend/scripts/_next_identidades_pendencias.cjs           # DRY-RUN
//   node backend/scripts/_next_identidades_pendencias.cjs --exec    # enfileira
// ============================================================================
const fs = require('fs');
const path = require('path');
const os = require('os');

const CANDIDATOS = [
  path.join(__dirname, '..'),
  path.join(os.homedir(), 'SISTEMA_INTEGRADO_CBRIO', 'backend'),
];
const BACKEND_DEPS = CANDIDATOS.find((p) => fs.existsSync(path.join(p, 'node_modules', '@supabase', 'supabase-js')));
const BACKEND_ENV = CANDIDATOS.find((p) => fs.existsSync(path.join(p, '.env')));
if (!BACKEND_DEPS || !BACKEND_ENV) {
  console.error('Não achei node_modules/@supabase/supabase-js ou o .env do backend.');
  process.exit(1);
}
const { createClient } = require(path.join(BACKEND_DEPS, 'node_modules', '@supabase', 'supabase-js'));
const { avaliarPossivelDuplicidade } = require(path.join(__dirname, '..', 'services', 'duplicidadePolicy.js'));

const env = {};
for (const linha of fs.readFileSync(path.join(BACKEND_ENV, '.env'), 'utf8').split(/\r?\n/)) {
  const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
}
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const EXEC = process.argv.includes('--exec');
const ORIGEM = 'backfill:next_2026_05_13';

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
const tokens = (s) => norm(s).split(' ').filter((t) => t.length > 2);
const digits = (s) => String(s || '').replace(/\D/g, '');

async function todas(tabela, select) {
  let tudo = []; let off = 0;
  for (;;) {
    const { data, error } = await sb.from(tabela).select(select).range(off, off + 999);
    if (error) throw new Error(`${tabela}: ${error.message}`);
    tudo = tudo.concat(data || []);
    if (!data || data.length < 1000) break;
    off += 1000;
  }
  return tudo;
}

// Primeiro nome diferente E não contido no outro = pessoas diferentes.
// "Diane Ribeiro Vieira da Rocha" × membro "Diane Rocha" NÃO entra (é a mesma
// pessoa com nome mais curto) — o critério é o PRIMEIRO nome, não o completo.
function ehVinculoDivergente(nomeLinha, nomeMembro) {
  const a = tokens(nomeLinha); const b = tokens(nomeMembro);
  if (!a.length || !b.length) return false;
  if (a[0] === b[0]) return false;
  if (a.includes(b[0]) || b.includes(a[0])) return false;
  return true;
}

(async () => {
  const legado = await todas('next_inscricoes', 'id, membro_id, nome, sobrenome, telefone');
  const mats = await todas('next_matriculas', 'id, membro_id, nome, sobrenome, telefone, deleted_at');
  const linhas = [
    ...legado.map((r) => ({ ...r, tabela: 'next_inscricoes' })),
    ...mats.filter((m) => !m.deleted_at).map((r) => ({ ...r, tabela: 'next_matriculas' })),
  ];

  const ids = [...new Set(linhas.map((r) => r.membro_id).filter(Boolean))];
  const membros = {};
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await sb.from('mem_membros')
      .select('id, nome, cpf, telefone, email, data_nascimento, genero, status, deleted_at')
      .in('id', ids.slice(i, i + 150));
    if (error) throw new Error(`mem_membros: ${error.message}`);
    for (const m of (data || [])) membros[m.id] = m;
  }

  // ── (a) vínculos divergentes ──
  const porMembro = new Map();
  for (const r of linhas) {
    const m = membros[r.membro_id]; if (!m) continue;
    const nomeLinha = `${r.nome || ''} ${r.sobrenome || ''}`.trim();
    if (!ehVinculoDivergente(nomeLinha, m.nome)) continue;
    if (!porMembro.has(m.id)) porMembro.set(m.id, { membro: m, linhas: [] });
    porMembro.get(m.id).linhas.push({ ...r, nomeLinha });
  }

  // ── (b) duplicatas de membro (só relatório · a fila das Entradas já calcula) ──
  const porNome = {}; const porTel = {};
  for (const m of Object.values(membros)) {
    (porNome[norm(m.nome)] = porNome[norm(m.nome)] || []).push(m);
    const t = digits(m.telefone);
    if (t.length >= 10) (porTel[t] = porTel[t] || []).push(m);
  }
  const pares = new Map();
  const addPar = (a, b) => {
    const k = [a.id, b.id].sort().join('|');
    if (!pares.has(k)) pares.set(k, { a, b });
  };
  for (const g of [...Object.values(porNome), ...Object.values(porTel)]) {
    for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) addPar(g[i], g[j]);
  }
  const duplicatas = [...pares.values()]
    .map((p) => ({ ...p, r: avaliarPossivelDuplicidade(p.a, p.b) }))
    .filter((p) => p.r?.incluir === true);

  // ── (c) membro_id órfão (o membro não existe mais) ──
  const orfaos = ids.filter((i) => !membros[i]);

  console.log('=== Next · identidades do backfill de 13/05 ===');
  console.log(`Linhas analisadas: ${linhas.length} (legado ${legado.length} + matrículas vivas ${linhas.length - legado.length})`);
  console.log(`\n(a) VÍNCULO DIVERGENTE · ${porMembro.size} membros, ${[...porMembro.values()].reduce((s, x) => s + x.linhas.length, 0)} linhas`);
  for (const { membro, linhas: ls } of porMembro.values()) {
    const nomes = [...new Set(ls.map((l) => l.nomeLinha))];
    console.log(`  · membro ${membro.id.slice(0, 8)} "${membro.nome}" (tel ${membro.telefone || '—'}) ← ${ls.length} linha(s) de: ${nomes.join(' | ')}`);
  }
  console.log(`\n(b) DUPLICATA DE MEMBRO aceita pela política da casa · ${duplicatas.length} pares`);
  for (const d of duplicatas) {
    console.log(`  · [${d.r.prioridade}] "${d.a.nome}" × "${d.b.nome}" — ${d.r.evidencias.join(', ')}`);
  }
  console.log('  (esses já são calculados pela aba "Possíveis duplicidades" do /entradas — aqui é só conferência)');
  console.log(`\n(c) MEMBRO_ID ÓRFÃO (cadastro não existe mais) · ${orfaos.length}`);
  if (orfaos.length) console.log(`  ${orfaos.slice(0, 8).join(', ')}${orfaos.length > 8 ? ' …' : ''}`);
  console.log('  ⚠️ `merge_membros` não repointa next_inscricoes/next_matriculas — fusão de');
  console.log('     membro deixa a linha do Next apontando pra um id que sumiu. Corrigir exige');
  console.log('     o mem_merge_log (qual id virou qual) — fora do escopo deste script.');

  if (!EXEC) {
    console.log(`\nDRY-RUN. Rode com --exec para enfileirar ${porMembro.size} pendências \`vinculo_divergente\` em identidade_pendencias.`);
    return;
  }

  let criadas = 0; let jaExistiam = 0;
  for (const { membro, linhas: ls } of porMembro.values()) {
    const nomes = [...new Set(ls.map((l) => l.nomeLinha))].slice(0, 6);
    const detalhe = `Backfill do Next (13/05): ${ls.length} linha(s) do Next com nome de outra pessoa apontam para este cadastro `
      + `(${nomes.join(' | ')}). Causa provável: telefone compartilhado na família ou transcrito errado na lista manuscrita. `
      + `Conferir e repontar/desvincular manualmente — o script NÃO altera vínculo.`;
    // A UNIQUE parcial (tipo, membro_id, membro_conflito_id) WHERE status='pendente'
    // faz reentrada ser no-op (23505) — o script é idempotente.
    const { error } = await sb.from('identidade_pendencias').insert({
      tipo: 'vinculo_divergente',
      membro_id: membro.id,
      membro_conflito_id: null,
      origem: ORIGEM,
      origem_id: ls[0].id,
      detalhe: detalhe.slice(0, 2000),
    });
    if (error) {
      if (error.code === '23505') { jaExistiam++; continue; }
      console.error(`  ! membro ${membro.id.slice(0, 8)}: ${error.message}`);
      continue;
    }
    criadas++;
  }
  console.log(`\nEnfileiradas: ${criadas} novas · ${jaExistiam} já estavam na fila.`);
  console.log('Aparecem em /entradas → Conflitos de CPF (tipo vinculo_divergente).');
})().catch((e) => { console.error('FALHOU:', e.message); process.exit(1); });
