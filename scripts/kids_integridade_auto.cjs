// Auditoria e correção conservadora da base Kids.
// Uso: node scripts/kids_integridade_auto.cjs          (somente diagnóstico)
//      node scripts/kids_integridade_auto.cjs --auto   (backup + aplica)

const fs = require('fs');
const path = require('path');

const worktree = path.resolve(__dirname, '..');
const mainRepo = fs.existsSync(path.join(worktree, 'backend', '.env'))
  ? worktree : path.resolve(worktree, '..', '..');
require(path.join(mainRepo, 'node_modules', 'dotenv')).config({ path: path.join(mainRepo, 'backend', '.env') });
const { createClient } = require(path.join(mainRepo, 'node_modules', '@supabase', 'supabase-js'));

const auto = process.argv.includes('--auto');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Credenciais Supabase ausentes');

const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
const digits = (s) => String(s || '').replace(/\D/g, '');
const lev = (a, b) => {
  const m = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = m[0]; m[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const old = m[j];
      m[j] = Math.min(m[j] + 1, m[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = old;
    }
  }
  return m[b.length];
};

async function all(table, cols, filter) {
  const out = []; let from = 0;
  for (;;) {
    let q = sb.from(table).select(cols).range(from, from + 999);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data || []));
    if (!data || data.length < 1000) return out;
    from += 1000;
  }
}

async function rpc(nome, args) {
  const { error } = await sb.rpc(nome, args);
  if (error) throw new Error(`${nome}: ${error.message}`);
}

function melhorCrianca(g, respCount) {
  return [...g].sort((a, b) => {
    const score = (c) => (c.planning_center_id ? 100 : 0) + (c.data_nascimento ? 20 : 0)
      + (c.familia_id ? 10 : 0) + (respCount.get(c.id) || 0) * 5 + (c.ativo ? 2 : 0);
    return score(b) - score(a) || new Date(a.created_at) - new Date(b.created_at);
  })[0];
}

function sobrenomeFamilia(criancas) {
  const stop = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'jr', 'junior', 'filho', 'neta', 'neto']);
  const nomes = criancas.map((c) => String(c.nome || '').trim().split(/\s+/).filter(Boolean));
  const tokens = nomes.flatMap((p) => p.slice(1).filter((x) => !stop.has(norm(x))));
  if (!tokens.length) return nomes[0]?.[0] || 'Sem sobrenome';
  return tokens.slice(-2).map((x) => x.charAt(0).toUpperCase() + x.slice(1).toLowerCase()).join(' ');
}

(async () => {
  console.log(`== Integridade Kids · modo ${auto ? 'AUTO' : 'DIAGNÓSTICO'} ==`);
  let criancas = await all('kids_criancas', 'id,nome,data_nascimento,familia_id,planning_center_id,ativo,created_at,deleted_at', (q) => q.is('deleted_at', null));
  let resps = await all('kids_responsaveis', 'id,crianca_id,membro_id,parentesco,autorizado_buscar,created_at');
  const membrosTodos = await all('mem_membros', 'id,nome,cpf,telefone,familia_id,status,created_at,deleted_at', (q) => q.is('deleted_at', null));
  const idsResponsaveisKids = new Set(resps.map((r) => r.membro_id));
  const membros = membrosTodos.filter((m) => idsResponsaveisKids.has(m.id));
  let familias = await all('mem_familias', 'id,nome,deleted_at', (q) => q.is('deleted_at', null));
  const checkins = await all('kids_checkins', 'id,crianca_id,checkin_at,deleted_at', (q) => q.is('deleted_at', null));
  const pco = await all('kids_pco_presencas', 'crianca_id,data');

  const respCount = new Map();
  for (const r of resps) respCount.set(r.crianca_id, (respCount.get(r.crianca_id) || 0) + 1);
  const gruposCrianca = new Map();
  for (const c of criancas) {
    const keys = [];
    if (c.planning_center_id) keys.push(`pco:${c.planning_center_id}`);
    if (c.data_nascimento) keys.push(`ident:${norm(c.nome)}|${c.data_nascimento}`);
    for (const k of keys) (gruposCrianca.get(k) || gruposCrianca.set(k, []).get(k)).push(c);
  }
  // Une grupos sobrepostos (mesmo registro pode ligar chave PCO e identidade).
  const dupSets = [];
  for (const g of gruposCrianca.values()) if (g.length > 1) {
    const ids = new Set(g.map((x) => x.id));
    const sobreposto = dupSets.find((s) => [...ids].some((id) => s.has(id)));
    if (sobreposto) ids.forEach((id) => sobreposto.add(id)); else dupSets.push(ids);
  }
  const byCrianca = new Map(criancas.map((x) => [x.id, x]));
  const mergesCrianca = dupSets.map((ids) => {
    const g = [...ids].map((id) => byCrianca.get(id)).filter(Boolean);
    const keep = melhorCrianca(g, respCount);
    return { keep, merge: g.filter((x) => x.id !== keep.id) };
  }).filter((x) => x.merge.length);

  const porTel = new Map();
  for (const m of membros) {
    const t = digits(m.telefone);
    if (t.length >= 10) (porTel.get(t) || porTel.set(t, []).get(t)).push(m);
  }
  const mergesMembro = [];
  for (const g of porTel.values()) {
    if (g.length < 2) continue;
    const candidatos = g.filter((m, i) => g.some((n, j) => {
      if (i === j) return false;
      const cpfM = digits(m.cpf), cpfN = digits(n.cpf);
      if (cpfM.length === 11 && cpfN.length === 11 && cpfM !== cpfN) return false;
      const mn = norm(m.nome), nn = norm(n.nome);
      return mn === nn || (mn[0] === nn[0] && lev(mn, nn) <= 2);
    }));
    if (candidatos.length < 2) continue;
    candidatos.sort((a, b) => (digits(b.cpf).length === 11) - (digits(a.cpf).length === 11)
      || new Date(a.created_at) - new Date(b.created_at));
    mergesMembro.push({ keep: candidatos[0], merge: candidatos.slice(1) });
  }

  console.log(`Duplicatas confirmáveis de crianças: ${mergesCrianca.length} grupos`);
  mergesCrianca.forEach((x) => console.log(`  manter ${x.keep.nome} (${x.keep.id}) <- ${x.merge.map((m) => `${m.nome} (${m.id})`).join(', ')}`));
  console.log(`Duplicatas confirmáveis de responsáveis (mesmo telefone + nome quase idêntico): ${mergesMembro.length} grupos`);
  mergesMembro.forEach((x) => console.log(`  manter ${x.keep.nome} <- ${x.merge.map((m) => m.nome).join(', ')}`));

  const backup = { gerado_em: new Date().toISOString(), criancas, resps, membros, familias, checkins, pco };
  let backupPath = null;
  if (auto) {
    const out = path.join(worktree, 'tmp_diag'); fs.mkdirSync(out, { recursive: true });
    backupPath = path.join(out, `kids_integridade_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));
    console.log(`Backup local completo: ${backupPath}`);
    for (const x of mergesCrianca) {
      try { await rpc('merge_kids_criancas', { p_keep: x.keep.id, p_merge: x.merge.map((m) => m.id) }); }
      catch (e) { console.error(`FALHA merge criança ${x.keep.nome}: ${e.message}`); }
    }
    for (const x of mergesMembro) {
      try { await rpc('merge_membros', { p_keep_id: x.keep.id, p_merge_ids: x.merge.map((m) => m.id), p_feito_por: null, p_observacao: 'Limpeza automática Kids 2026-07-17: mesmo telefone e nome quase idêntico' }); }
      catch (e) { console.error(`FALHA merge responsável ${x.keep.nome}: ${e.message}`); }
    }
  }

  // Recarrega depois das fusões, pois vínculos/FKs podem ter mudado.
  criancas = await all('kids_criancas', 'id,nome,data_nascimento,familia_id,planning_center_id,ativo,created_at,deleted_at', (q) => q.is('deleted_at', null));
  resps = await all('kids_responsaveis', 'id,crianca_id,membro_id,parentesco,autorizado_buscar,created_at');
  familias = await all('mem_familias', 'id,nome,deleted_at', (q) => q.is('deleted_at', null));
  const membroById = new Map(membros.map((m) => [m.id, m]));

  // Mais de uma mãe/pai: preserva todas as pessoas autorizadas, mas deixa apenas
  // um vínculo biológico e converte os demais para "outro".
  const relabel = [];
  const linksByChild = new Map();
  for (const r of resps) (linksByChild.get(r.crianca_id) || linksByChild.set(r.crianca_id, []).get(r.crianca_id)).push(r);
  const childById = new Map(criancas.map((c) => [c.id, c]));
  for (const [cid, links] of linksByChild) for (const tipo of ['mae', 'pai']) {
    const g = links.filter((r) => r.parentesco === tipo);
    if (g.length <= 1) continue;
    const c = childById.get(cid);
    g.sort((a, b) => {
      const score = (r) => { const m = membroById.get(r.membro_id); return (m?.familia_id === c?.familia_id ? 20 : 0) + (digits(m?.cpf).length === 11 ? 5 : 0) + (digits(m?.telefone).length >= 10 ? 2 : 0); };
      return score(b) - score(a) || new Date(a.created_at) - new Date(b.created_at);
    });
    relabel.push(...g.slice(1).map((r) => ({ ...r, nome: membroById.get(r.membro_id)?.nome, novo: 'outro' })));
  }
  console.log(`Vínculos pai/mãe excedentes preservados como "outro": ${relabel.length}`);
  if (auto) for (const r of relabel) {
    const { error } = await sb.from('kids_responsaveis').update({ parentesco: r.novo }).eq('id', r.id);
    if (error) console.error(`FALHA parentesco ${r.id}: ${error.message}`);
  }

  // Mesmo pai/mãe biológico em famílias diferentes: consolida os filhos na
  // família que já concentra mais filhos daquele responsável.
  const parentFamilies = new Map();
  for (const r of resps.filter((x) => x.parentesco === 'mae' || x.parentesco === 'pai')) {
    const c = childById.get(r.crianca_id); if (!c?.familia_id) continue;
    const x = parentFamilies.get(r.membro_id) || new Map();
    (x.get(c.familia_id) || x.set(c.familia_id, []).get(c.familia_id)).push(c);
    parentFamilies.set(r.membro_id, x);
  }
  const moverFamilia = [];
  for (const fams of parentFamilies.values()) if (fams.size > 1) {
    const canonical = [...fams.entries()].sort((a, b) => b[1].length - a[1].length)[0][0];
    for (const [fid, cs] of fams) if (fid !== canonical) for (const c of cs) moverFamilia.push({ crianca: c, de: fid, para: canonical });
  }
  console.log(`Crianças com pai/mãe comum consolidadas na mesma família: ${moverFamilia.length}`);
  if (auto) for (const x of moverFamilia) {
    const { error } = await sb.from('kids_criancas').update({ familia_id: x.para }).eq('id', x.crianca.id);
    if (error) console.error(`FALHA família ${x.crianca.nome}: ${error.message}`);
  }

  // Nomes de família repetidos não provam identidade. Em vez de fundir no escuro,
  // torna cada nome específico usando até dois sobrenomes das crianças do grupo.
  if (auto && moverFamilia.length) criancas = await all('kids_criancas', 'id,nome,data_nascimento,familia_id,planning_center_id,ativo,created_at,deleted_at', (q) => q.is('deleted_at', null));
  const kidsByFam = new Map();
  for (const c of criancas) if (c.familia_id) (kidsByFam.get(c.familia_id) || kidsByFam.set(c.familia_id, []).get(c.familia_id)).push(c);
  const names = new Map();
  const familiasKids = familias.filter((f) => kidsByFam.has(f.id));
  for (const f of familiasKids) (names.get(norm(f.nome)) || names.set(norm(f.nome), []).get(norm(f.nome))).push(f);
  const used = new Set(familias.map((f) => norm(f.nome)));
  const renomes = [];
  for (const g of names.values()) if (g.length > 1) for (const f of g) {
    const base = `Família ${sobrenomeFamilia(kidsByFam.get(f.id) || [])}`;
    let novo = base; let n = 2;
    while (used.has(norm(novo)) && norm(novo) !== norm(f.nome)) novo = `${base} ${n++}`;
    used.add(norm(novo));
    if (novo !== f.nome) renomes.push({ ...f, novo });
  }
  console.log(`Famílias homônimas renomeadas com sobrenomes: ${renomes.length}`);
  if (auto) for (const f of renomes) {
    const { error } = await sb.from('mem_familias').update({ nome: f.novo }).eq('id', f.id);
    if (error) console.error(`FALHA renome família ${f.nome}: ${error.message}`);
  }

  // Criança sem responsável, mas com irmãos na mesma família: herda os adultos
  // já autorizados dos irmãos. É evidência relacional forte e evita inventar
  // vínculos para famílias que realmente não têm nenhum responsável cadastrado.
  const membrosVivos = new Set(membros.filter((m) => !m.deleted_at).map((m) => m.id));
  const kidsFamAtual = new Map();
  for (const c of criancas) if (c.familia_id) (kidsFamAtual.get(c.familia_id) || kidsFamAtual.set(c.familia_id, []).get(c.familia_id)).push(c);
  const atuaisPorCrianca = new Map();
  for (const r of resps) (atuaisPorCrianca.get(r.crianca_id) || atuaisPorCrianca.set(r.crianca_id, []).get(r.crianca_id)).push(r);
  const herdarResponsaveis = [];
  for (const c of criancas) {
    if (!c.familia_id || (atuaisPorCrianca.get(c.id) || []).length) continue;
    const candidatos = new Map();
    for (const irmao of kidsFamAtual.get(c.familia_id) || []) for (const r of atuaisPorCrianca.get(irmao.id) || []) {
      if (membrosVivos.has(r.membro_id) && !candidatos.has(r.membro_id)) candidatos.set(r.membro_id, r);
    }
    let mae = false, pai = false;
    for (const r of candidatos.values()) {
      let parentesco = r.parentesco || 'outro';
      if (parentesco === 'mae') { if (mae) parentesco = 'outro'; else mae = true; }
      if (parentesco === 'pai') { if (pai) parentesco = 'outro'; else pai = true; }
      herdarResponsaveis.push({ crianca_id: c.id, membro_id: r.membro_id, parentesco,
        autorizado_buscar: r.autorizado_buscar !== false, contato_emergencia: false,
        observacao: 'Vínculo herdado de irmão da mesma família · limpeza integridade 2026-07-17' });
    }
  }
  console.log(`Vínculos de responsáveis recuperados de irmãos da mesma família: ${herdarResponsaveis.length}`);
  if (auto && herdarResponsaveis.length) {
    for (let i = 0; i < herdarResponsaveis.length; i += 100) {
      const { error } = await sb.from('kids_responsaveis').upsert(herdarResponsaveis.slice(i, i + 100), { onConflict: 'crianca_id,membro_id', ignoreDuplicates: true });
      if (error) console.error(`FALHA herança responsáveis: ${error.message}`);
    }
    resps = await all('kids_responsaveis', 'id,crianca_id,membro_id,parentesco,autorizado_buscar,created_at');
  }

  // Exclusão recuperável apenas para casos realmente sem base confiável: sem
  // idade, sem responsável e sem presença/check-in há mais de um ano.
  const cutoff = new Date(); cutoff.setFullYear(cutoff.getFullYear() - 1);
  const last = new Map();
  const bump = (id, d) => { const x = new Date(d); if (!last.has(id) || x > last.get(id)) last.set(id, x); };
  checkins.forEach((x) => bump(x.crianca_id, x.checkin_at)); pco.forEach((x) => bump(x.crianca_id, `${x.data}T12:00:00Z`));
  const respIds = new Set(resps.map((r) => r.crianca_id));
  const stale = criancas.filter((c) => c.ativo !== false && !c.data_nascimento && !respIds.has(c.id)
    && new Date(c.created_at) < cutoff && (!last.get(c.id) || last.get(c.id) < cutoff));
  console.log(`Cadastros sem idade/responsável e sem atividade >1 ano (soft-delete): ${stale.length}`);
  if (auto) for (const c of stale) {
    const { error } = await sb.from('kids_criancas').update({
      ativo: false, deleted_at: new Date().toISOString(),
      motivo_inativacao: 'Cadastro sem idade/responsável e sem atividade há mais de 1 ano · limpeza integridade 2026-07-17',
    }).eq('id', c.id).is('deleted_at', null);
    if (error) console.error(`FALHA soft-delete ${c.nome}: ${error.message}`);
  }

  console.log(JSON.stringify({ merges_crianca: mergesCrianca.length, merges_membro: mergesMembro.length,
    parentescos_corrigidos: relabel.length, criancas_familia_consolidada: moverFamilia.length,
    familias_renomeadas: renomes.length, vinculos_herdados_de_irmaos: herdarResponsaveis.length,
    cadastros_obsoletos_soft_delete: stale.length, backup: backupPath }, null, 2));
})().catch((e) => { console.error(e); process.exit(1); });
