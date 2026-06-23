// ============================================================================
// gruposImporter.js · importa o consolidado de participantes em grupos (XLSX)
// ============================================================================
// Planilha "Participantes_Consolidado" (formato largo): 1 linha por pessoa com
// NOME, CPF, TELEFONE, QTD. GRUPOS e GRUPO 1..GRUPO 17.
//
// Regras (pedido do Matheus):
//   - não duplicar pessoa (uma pessoa pode estar em vários grupos);
//   - não duplicar com quem já está no sistema;
//   - quem NÃO existe → cadastra (mem_membros);
//   - quem EXISTE → ignora;
//   - quem EXISTE mas sem CPF (e a planilha tem) → atualiza o cadastro (CPF/telefone).
//
// Match: CPF (chave forte) → senão NOME normalizado exato (sem acento, minúsculo,
// espaços colapsados). Nome com >1 candidato = AMBÍGUO (não cria, não funde · vai
// pro relatório pra revisão humana — o sistema nunca auto-funde por nome).
//
// SEMPRE rodar dryRun primeiro: devolve o relatório do que faria, sem gravar.

const XLSX = require('xlsx');
const { supabase } = require('../utils/supabase');

const onlyDigits = (s) => String(s || '').replace(/\D/g, '');
const cpf11 = (s) => { const d = onlyDigits(s); return d.length === 11 ? d : null; };
const tel10 = (s) => { const d = onlyDigits(s); return d.length >= 10 ? d : null; };
const normNome = (s) => String(s || '').trim().toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\s+/g, ' ');

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

// Carrega uma tabela inteira contornando o cap de 1000 do PostgREST.
async function carregarTodos(tabela, cols) {
  const size = 1000;
  let from = 0;
  let all = [];
  while (true) {
    const { data, error } = await supabase.from(tabela).select(cols).range(from, from + size - 1);
    if (error) throw new Error(`${tabela}: ${error.message}`);
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < size) break;
    from += size;
  }
  return all;
}

function parsePlanilha(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null });
  const pessoas = [];
  for (const r of rows) {
    const nome = String(r['NOME'] || '').trim();
    if (!nome) continue;
    const grupos = [];
    for (let i = 1; i <= 17; i++) {
      const g = String(r['GRUPO ' + i] || '').trim();
      if (g) grupos.push(g);
    }
    pessoas.push({ nome, cpf: cpf11(r['CPF']), telefone: tel10(r['TELEFONE']), grupos });
  }
  return pessoas;
}

async function importarParticipantes(buffer, { dryRun = true } = {}) {
  const pessoas = parsePlanilha(buffer);

  // ── Base atual em memória (rápido + sem N+1) ──
  const membros = await carregarTodos('mem_membros', 'id, nome, cpf, telefone, deleted_at');
  const byCpf = new Map();
  const byNome = new Map(); // normNome -> [membros]
  for (const m of membros) {
    if (m.deleted_at) continue;
    const c = cpf11(m.cpf);
    if (c) byCpf.set(c, m);
    const nn = normNome(m.nome);
    if (nn) { if (!byNome.has(nn)) byNome.set(nn, []); byNome.get(nn).push(m); }
  }

  const grupos = await carregarTodos('mem_grupos', 'id, nome, ativo');
  const byGrupo = new Map(); // normNome -> grupo
  for (const g of grupos) { const nn = normNome(g.nome); if (nn && !byGrupo.has(nn)) byGrupo.set(nn, g); }

  const vinculos = await carregarTodos('mem_grupo_membros', 'membro_id, grupo_id, saiu_em');
  const vinculoAtivo = new Set(vinculos.filter((v) => !v.saiu_em).map((v) => `${v.membro_id}|${v.grupo_id}`));

  const rep = {
    pessoas_planilha: pessoas.length,
    criar: 0, atualizar: 0, ignorar: 0, ambiguos: 0,
    grupos_existentes: 0, grupos_criar: 0,
    vinculos_criar: 0, vinculos_existentes: 0,
    exemplos: { ambiguos: [], criar: [], atualizar: [] },
  };

  // ── 1. Resolve grupos distintos (find-or-create por nome normalizado) ──
  const grupoLabelPorNN = new Map();
  for (const p of pessoas) for (const g of p.grupos) { const nn = normNome(g); if (!grupoLabelPorNN.has(nn)) grupoLabelPorNN.set(nn, g.trim()); }
  const grupoIdPorNN = new Map();
  const gruposNovos = [];
  for (const [nn, label] of grupoLabelPorNN) {
    if (byGrupo.has(nn)) { grupoIdPorNN.set(nn, byGrupo.get(nn).id); rep.grupos_existentes++; }
    else { gruposNovos.push({ nn, nome: label }); rep.grupos_criar++; }
  }
  if (!dryRun && gruposNovos.length) {
    for (const lote of chunk(gruposNovos, 200)) {
      const { data, error } = await supabase.from('mem_grupos')
        .insert(lote.map((g) => ({ nome: g.nome, ativo: true }))).select('id, nome');
      if (error) throw new Error('criar grupos: ' + error.message);
      (data || []).forEach((g) => grupoIdPorNN.set(normNome(g.nome), g.id));
    }
  }

  // ── 2. Resolve pessoas (match cpf → nome) e prepara criações/atualizações ──
  // Cada item: { p, membroId|null, acao }
  const resolvidos = [];
  const aCriar = []; // pessoas novas (insert em lote)
  for (const p of pessoas) {
    let m = p.cpf ? byCpf.get(p.cpf) : null;
    if (!m) {
      const cand = byNome.get(normNome(p.nome)) || [];
      if (cand.length === 1) m = cand[0];
      else if (cand.length > 1) {
        rep.ambiguos++;
        if (rep.exemplos.ambiguos.length < 15) rep.exemplos.ambiguos.push(p.nome);
        // Não cria (evita duplicar) e não funde (evita merge errado). Fica de fora.
        resolvidos.push({ p, membroId: null, acao: 'ambiguo' });
        continue;
      }
    }
    if (m) {
      // Existe → ignora, mas atualiza se faltava CPF/telefone e a planilha tem.
      const patch = {};
      if (p.cpf && !cpf11(m.cpf)) patch.cpf = p.cpf;
      if (p.telefone && !tel10(m.telefone)) patch.telefone = p.telefone;
      if (Object.keys(patch).length) {
        rep.atualizar++;
        if (rep.exemplos.atualizar.length < 15) rep.exemplos.atualizar.push(p.nome);
        if (!dryRun) await supabase.from('mem_membros').update(patch).eq('id', m.id);
      } else {
        rep.ignorar++;
      }
      resolvidos.push({ p, membroId: m.id, acao: 'existe' });
    } else {
      rep.criar++;
      if (rep.exemplos.criar.length < 15) rep.exemplos.criar.push(p.nome);
      aCriar.push(p);
      resolvidos.push({ p, membroId: null, acao: 'criar' });
    }
  }

  // Cria os novos em lote e casa o id de volta pelo nome normalizado.
  if (!dryRun && aCriar.length) {
    for (const lote of chunk(aCriar, 500)) {
      const payload = lote.map((p) => ({
        nome: p.nome,
        cpf: p.cpf || null,
        telefone: p.telefone || null,
        status: 'visitante',
      }));
      const { data, error } = await supabase.from('mem_membros').insert(payload).select('id, nome');
      if (error) throw new Error('criar membros: ' + error.message);
      (data || []).forEach((m) => {
        const nn = normNome(m.nome);
        if (!byNome.has(nn)) byNome.set(nn, []);
        byNome.get(nn).push(m);
      });
    }
    // re-resolve os ids dos criados
    for (const r of resolvidos) {
      if (r.acao === 'criar' && !r.membroId) {
        const cand = byNome.get(normNome(r.p.nome)) || [];
        if (cand.length) r.membroId = cand[cand.length - 1].id;
      }
    }
  }

  // ── 3. Vínculos pessoa-grupo (dedup por par ativo) ──
  const novosVinculos = [];
  for (const r of resolvidos) {
    if (!r.membroId && dryRun && r.acao === 'criar') {
      // no dry-run pessoa nova ainda não tem id · conta os vínculos dela como "a criar"
      for (const g of r.p.grupos) { if (grupoIdPorNN.has(normNome(g)) || true) rep.vinculos_criar++; }
      continue;
    }
    if (!r.membroId) continue; // ambíguo ou sem id
    for (const g of r.p.grupos) {
      const gid = grupoIdPorNN.get(normNome(g));
      if (!gid) continue; // grupo novo no dry-run (sem id ainda)
      const chave = `${r.membroId}|${gid}`;
      if (vinculoAtivo.has(chave)) { rep.vinculos_existentes++; continue; }
      rep.vinculos_criar++;
      vinculoAtivo.add(chave);
      novosVinculos.push({ membro_id: r.membroId, grupo_id: gid, entrou_em: new Date().toISOString().slice(0, 10) });
    }
  }
  if (!dryRun && novosVinculos.length) {
    for (const lote of chunk(novosVinculos, 500)) {
      const { error } = await supabase.from('mem_grupo_membros').insert(lote);
      if (error) throw new Error('criar vínculos: ' + error.message);
    }
  }

  rep.dry_run = dryRun;
  return rep;
}

module.exports = { importarParticipantes };
