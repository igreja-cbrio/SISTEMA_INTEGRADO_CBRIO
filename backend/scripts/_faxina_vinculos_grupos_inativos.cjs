#!/usr/bin/env node
// Faxina aprovada pelo Marcos (11/08/2026, caso Eliandra): fecha (saiu_em) os
// vínculos ABERTOS de mem_grupo_membros cujo grupo está ativo=false ou
// soft-deletado — "grupo que nem existe mais" segurando gente no roster
// (375 vínculos · 264+ pessoas medidos em 11/08). SÓ fecha o vínculo: a pessoa
// continua na base e pode entrar em grupo novo normalmente.
//
// ⚠️ NÃO toca nos vínculos abertos em grupos ATIVOS de temporada encerrada
// (os ~402 do handoff de 04/08) — essa é outra decisão, ainda aberta.
//
// Uso:  node backend/scripts/_faxina_vinculos_grupos_inativos.cjs          (dry-run)
//       node backend/scripts/_faxina_vinculos_grupos_inativos.cjs --exec   (grava)
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

const env = carregarEnv();
const { createClient } = resolverModulo('@supabase/supabase-js');
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const EXEC = process.argv.includes('--exec');
const HOJE = new Date().toISOString().slice(0, 10);
const MOTIVO = 'Grupo encerrado — faxina de vínculos 2026-08-11';

(async () => {
  console.log(EXEC ? '== EXEC ==' : '== DRY-RUN (use --exec pra gravar) ==');

  // vínculos abertos, paginado (o cap de 1000 do PostgREST trunca em silêncio)
  let abertos = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('mem_grupo_membros')
      .select('id, grupo_id, membro_id, funcao, entrou_em')
      .is('deleted_at', null).is('saiu_em', null)
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    abertos = abertos.concat(data || []);
    if (!data || data.length < 1000) break;
  }

  const gids = [...new Set(abertos.map((v) => v.grupo_id))];
  const grupos = new Map();
  for (let i = 0; i < gids.length; i += 200) {
    const { data, error } = await sb.from('mem_grupos')
      .select('id, codigo, nome, ativo, deleted_at, lider_id')
      .in('id', gids.slice(i, i + 200));
    if (error) throw new Error(error.message);
    for (const g of data || []) grupos.set(g.id, g);
  }

  const alvo = abertos.filter((v) => {
    const g = grupos.get(v.grupo_id);
    return g && (!g.ativo || g.deleted_at);
  });

  const porGrupo = new Map();
  for (const v of alvo) {
    const g = grupos.get(v.grupo_id);
    const k = `${g.codigo || g.id} · ${g.nome}${g.deleted_at ? ' [DELETADO]' : ' [inativo]'}`;
    porGrupo.set(k, (porGrupo.get(k) || 0) + 1);
  }
  console.log(`\nvínculos abertos: ${abertos.length} · em grupo inativo/deletado: ${alvo.length} (${new Set(alvo.map((v) => v.membro_id)).size} pessoas · ${porGrupo.size} grupos)`);
  for (const [k, n] of [...porGrupo.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}  ${k}`);

  const lideres = alvo.filter((v) => ['lider', 'co_lider'].includes(v.funcao)).length;
  console.log(`\n(inclui ${lideres} vínculos de liderança — o grupo está morto, o vínculo fecha junto; mem_grupos.lider_id NÃO é tocado)`);

  if (!EXEC || !alvo.length) return;

  const bk = path.join(os.homedir(), 'Downloads', '_bk_20260811_faxina_vinculos_grupos_inativos.json');
  fs.writeFileSync(bk, JSON.stringify(alvo, null, 2));
  console.log(`\nbackup: ${bk}`);

  let ok = 0; let pulados = 0;
  for (let i = 0; i < alvo.length; i += 100) {
    const lote = alvo.slice(i, i + 100).map((v) => v.id);
    // .is('saiu_em', null) = guarda de corrida: saída manual concorrente não é sobrescrita
    const { data, error } = await sb.from('mem_grupo_membros')
      .update({ saiu_em: HOJE, motivo_saida: MOTIVO })
      .in('id', lote).is('saiu_em', null).is('deleted_at', null).select('id');
    if (error) { console.warn(`  lote ${i}: ${error.message}`); pulados += lote.length; continue; }
    ok += (data || []).length;
    pulados += lote.length - (data || []).length;
  }
  console.log(`\nfechados: ${ok} · pulados (já fechados no meio): ${pulados}`);
  console.log('desfazer: restaurar saiu_em/motivo_saida NULL pros ids do backup');
})().catch((e) => { console.error('FALHA:', e); process.exit(1); });
