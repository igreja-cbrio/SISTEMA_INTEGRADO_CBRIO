#!/usr/bin/env node
// Varredura: cadastros cujo nome é versão ABREVIADA do nome que a própria
// pessoa declarou numa porta (observações de identidade, pedidos de grupo,
// candidaturas a líder). Aplica a MESMA régua `nomeMaisCompleto` que passou a
// rodar no matcher (2026-08-11) — este script cobre o passado.
//
// Uso:  node backend/scripts/_reparo_nomes_mais_completos.cjs          (dry-run)
//       node backend/scripts/_reparo_nomes_mais_completos.cjs --exec   (grava)
//
// Roda de qualquer worktree: resolve .env e node_modules com fallback pro
// checkout principal (~/SISTEMA_INTEGRADO_CBRIO/backend).
const fs = require('fs');
const path = require('path');
const os = require('os');

const PRINCIPAL = path.join(os.homedir(), 'SISTEMA_INTEGRADO_CBRIO', 'backend');
const LOCAL = path.join(__dirname, '..');

function carregarEnv() {
  for (const dir of [LOCAL, PRINCIPAL]) {
    const f = path.join(dir, '.env');
    if (!fs.existsSync(f)) continue;
    const env = {};
    for (const l of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
      const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
    if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) return env;
  }
  throw new Error('SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY não encontrados em .env');
}
function resolverModulo(nome) {
  for (const dir of [LOCAL, PRINCIPAL]) {
    try { return require(path.join(dir, 'node_modules', nome)); } catch { /* tenta o próximo */ }
  }
  return require(nome);
}

// O require TRANSITIVO (services → utils/supabase → @supabase/supabase-js)
// não passa pelo resolverModulo: injeta o node_modules do checkout principal
// no NODE_PATH quando o local está vazio (worktree recém-criada).
if (!fs.existsSync(path.join(LOCAL, 'node_modules', '@supabase'))) {
  process.env.NODE_PATH = [path.join(PRINCIPAL, 'node_modules'), process.env.NODE_PATH || ''].filter(Boolean).join(path.delimiter);
  require('module')._initPaths();
}

const env = carregarEnv();
const { createClient } = resolverModulo('@supabase/supabase-js');
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { nomeMaisCompleto } = require(path.join(LOCAL, 'services', 'identidadeProgressiva.js'));

const EXEC = process.argv.includes('--exec');

async function paginado(builderFn) {
  let all = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await builderFn().range(from, from + 999);
    if (error) throw new Error(error.message);
    all = all.concat(data || []);
    if (!data || data.length < 1000) break;
  }
  return all;
}

(async () => {
  console.log(EXEC ? '== EXEC ==' : '== DRY-RUN (use --exec pra gravar) ==');

  // 1. Fontes de nome DECLARADO ligado a membro
  const fontes = [];
  const obs = await paginado(() => sb.from('mem_identidade_observacoes')
    .select('membro_id, nome, origem, observado_em')
    .not('membro_id', 'is', null).not('nome', 'is', null)
    .order('observado_em', { ascending: true }));
  for (const o of obs) fontes.push({ membro_id: o.membro_id, nome: o.nome, origem: `obs:${o.origem}` });

  const pedidos = await paginado(() => sb.from('mem_grupo_pedidos')
    .select('membro_id, nome, created_at')
    .not('membro_id', 'is', null).not('nome', 'is', null).is('deleted_at', null)
    .order('created_at', { ascending: true }));
  for (const p of pedidos) fontes.push({ membro_id: p.membro_id, nome: p.nome, origem: 'grupo_pedido' });

  const lideres = await paginado(() => sb.from('mem_lider_inscricoes')
    .select('membro_id, nome, created_at')
    .not('membro_id', 'is', null).not('nome', 'is', null).is('deleted_at', null)
    .order('created_at', { ascending: true }));
  for (const l of lideres) fontes.push({ membro_id: l.membro_id, nome: l.nome, origem: 'lider_inscricao' });

  console.log(`declarações: ${obs.length} observações + ${pedidos.length} pedidos de grupo + ${lideres.length} candidaturas de líder`);

  // 2. Nomes atuais dos membros citados
  const ids = [...new Set(fontes.map((f) => f.membro_id))];
  const membros = new Map();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await sb.from('mem_membros')
      .select('id, nome').in('id', ids.slice(i, i + 200)).is('deleted_at', null);
    if (error) throw new Error(error.message);
    for (const m of data || []) membros.set(m.id, m.nome);
  }

  // 3. Melhor nome por membro: aplica a régua em CADEIA (a promoção anterior
  //    vira o "atual" da próxima — a mais completa de todas vence)
  const propostas = new Map();
  for (const f of fontes) {
    const atualBase = propostas.get(f.membro_id)?.novo || membros.get(f.membro_id);
    if (atualBase === undefined) continue; // membro deletado/inexistente
    const novo = nomeMaisCompleto(atualBase, f.nome);
    if (novo) propostas.set(f.membro_id, { antes: membros.get(f.membro_id), novo, origem: f.origem });
  }

  const lista = [...propostas.entries()].map(([id, p]) => ({ membro_id: id, ...p }));
  console.log(`\ncandidatos a promoção de nome: ${lista.length}`);
  for (const c of lista) console.log(`  "${c.antes}" -> "${c.novo}"  (${c.origem} · ${c.membro_id})`);

  if (!EXEC || !lista.length) return;

  // 4. Backup + gravação (com guarda de corrida .eq no nome atual)
  const bk = path.join(os.homedir(), 'Downloads', `_bk_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}_nomes_mais_completos.json`);
  fs.writeFileSync(bk, JSON.stringify(lista, null, 2));
  console.log(`\nbackup: ${bk}`);

  let ok = 0; let pulados = 0; let profs = 0;
  for (const c of lista) {
    const { data, error } = await sb.from('mem_membros')
      .update({ nome: c.novo }).eq('id', c.membro_id).eq('nome', c.antes).select('id');
    if (error || !data || !data.length) { pulados += 1; console.warn(`  PULADO ${c.membro_id}: ${error?.message || 'nome mudou no meio'}`); continue; }
    ok += 1;
    const { data: pr } = await sb.from('profiles').select('id, name').eq('membro_id', c.membro_id).limit(5);
    for (const p of pr || []) {
      if (nomeMaisCompleto(p.name, c.novo)) {
        const { data: u } = await sb.from('profiles').update({ name: c.novo }).eq('id', p.id).eq('name', p.name).select('id');
        if (u && u.length) profs += 1;
      }
    }
  }
  console.log(`\ngravados: ${ok} membros (+${profs} profiles sincronizados) · pulados: ${pulados}`);
})().catch((e) => { console.error('FALHA:', e); process.exit(1); });
