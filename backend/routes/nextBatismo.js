// ============================================================================
// /api/next-batismo · "Check de pessoas" do funil de novos convertidos (Fase 1)
//
// Console de RESOLUÇÃO DE IDENTIDADE (Marcos · 2026-06-15). NÃO faz CRUD nem
// presença — Integração confirma presença e consome as identidades limpas.
// Duas lentes:
//   1. Duplicatas suspeitas (vw_nb_duplicados_suspeitos) → fundir (merge_membros)
//      ou marcar "não é duplicata" (mem_duplicados_ignorados).
//   2. Inscrição/convertido SEM vínculo de membro (membro_id NULL) → ligar ao
//      membro certo (buscarCandidatos) ou criar o cadastro (acharOuCriar).
//
// Tudo reusa o serviço membroMatch (Fase 0) + a infra de merge do Membresia.
// NUNCA auto-funde: match fraco vira revisão humana aqui.
// ============================================================================

const router = require('express').Router();
const { authenticate, authorizeModule } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { buscarCandidatos, acharOuCriar } = require('../services/membroMatch');

router.use(authenticate);

const TABELA = { next: 'next_inscricoes', batismo: 'batismo_inscricoes', convertido: 'cui_convertidos' };

// ── Reshape da view de duplicatas → mesma forma do /membresia/duplicados ──
function reshapeDuplicados(data) {
  return (data || []).map((d) => ({
    par_id: `${d.membro_a_id}_${d.membro_b_id}`,
    membro_a_id: d.membro_a_id,
    membro_b_id: d.membro_b_id,
    motivos: d.motivos || [],
    confianca: d.confianca,
    membro_a: {
      id: d.membro_a_id, nome: d.a_nome, email: d.a_email, telefone: d.a_telefone,
      cpf: d.a_cpf, data_nascimento: d.a_nascimento, status: d.a_status,
      foto_url: d.a_foto_url, criado_em: d.a_criado_em,
    },
    membro_b: {
      id: d.membro_b_id, nome: d.b_nome, email: d.b_email, telefone: d.b_telefone,
      cpf: d.b_cpf, data_nascimento: d.b_nascimento, status: d.b_status,
      foto_url: d.b_foto_url, criado_em: d.b_criado_em,
    },
  }));
}

// ── Similaridade de nome (Dice por bigramas) · só pra ranquear sugestões ──
function normNome(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}
function bigrams(s) {
  const out = new Map();
  for (let i = 0; i < s.length - 1; i++) {
    const g = s.slice(i, i + 2);
    out.set(g, (out.get(g) || 0) + 1);
  }
  return out;
}
function diceNome(a, b) {
  const x = normNome(a), y = normNome(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const bx = bigrams(x), by = bigrams(y);
  let inter = 0, totX = 0, totY = 0;
  for (const v of bx.values()) totX += v;
  for (const [g, v] of by) { totY += v; if (bx.has(g)) inter += Math.min(v, bx.get(g)); }
  return totX + totY === 0 ? 0 : (2 * inter) / (totX + totY);
}

// ── Normaliza uma linha do funil sem vínculo pra forma uniforme ──
function rowNext(r) {
  return {
    tipo: 'next', id: r.id, evento_id: r.evento_id,
    nome: [r.nome, r.sobrenome].filter(Boolean).join(' ').trim() || r.nome,
    cpf: r.cpf, telefone: r.telefone, email: r.email, data_nascimento: r.data_nascimento,
    quando: r.created_at, contexto: 'Inscrição no Next',
  };
}
function rowBatismo(r) {
  return {
    tipo: 'batismo', id: r.id,
    nome: [r.nome, r.sobrenome].filter(Boolean).join(' ').trim() || r.nome,
    cpf: r.cpf, telefone: r.telefone, email: r.email, data_nascimento: r.data_nascimento,
    quando: r.created_at, contexto: `Inscrição de batismo · ${r.status || 'pendente'}`,
  };
}
function rowConvertido(r) {
  return {
    tipo: 'convertido', id: r.id,
    nome: r.nome, cpf: r.cpf, telefone: r.telefone, email: null, data_nascimento: null,
    quando: r.data_culto || r.created_at,
    contexto: `Decisão${r.area ? ' · ' + String(r.area).toUpperCase() : ''}`,
  };
}

// ── GET /resumo · contadores pros badges ─────────────────────────────────────
router.get('/resumo', authorizeModule('next-batismo', 1), async (req, res) => {
  try {
    const cnt = async (q) => { const { count } = await q; return count || 0; };
    const [dup, semNext, semBat, semConv] = await Promise.all([
      cnt(supabase.from('vw_nb_duplicados_suspeitos').select('*', { count: 'exact', head: true })),
      cnt(supabase.from('next_inscricoes').select('id', { count: 'exact', head: true }).is('membro_id', null)),
      cnt(supabase.from('batismo_inscricoes').select('id', { count: 'exact', head: true }).is('membro_id', null).is('deleted_at', null).neq('status', 'cancelado')),
      cnt(supabase.from('cui_convertidos').select('id', { count: 'exact', head: true }).is('membro_id', null).is('deleted_at', null)),
    ]);
    res.json({ duplicatas: dup, sem_vinculo: semNext + semBat + semConv, por_origem: { next: semNext, batismo: semBat, convertido: semConv } });
  } catch (e) {
    console.error('[next-batismo/resumo]', e.message);
    res.status(500).json({ error: e.message || 'Erro ao montar resumo' });
  }
});

// ── GET /duplicados · pares suspeitos do funil novo ──────────────────────────
router.get('/duplicados', authorizeModule('next-batismo', 1), async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 200, 500);
    const { data, error } = await supabase
      .from('vw_nb_duplicados_suspeitos')
      .select('*')
      .order('confianca', { ascending: false })
      .limit(limit);
    if (error) throw error;
    const items = reshapeDuplicados(data);
    res.json({ total: items.length, items });
  } catch (e) {
    console.error('[next-batismo/duplicados]', e.message);
    res.status(500).json({ error: e.message || 'Erro ao buscar duplicados' });
  }
});

// ── GET /sem-vinculo · inscrições/convertidos sem membro_id ──────────────────
router.get('/sem-vinculo', authorizeModule('next-batismo', 1), async (req, res) => {
  try {
    const cap = 300;
    const [next, bat, conv] = await Promise.all([
      supabase.from('next_inscricoes')
        .select('id, evento_id, nome, sobrenome, cpf, telefone, email, data_nascimento, created_at')
        .is('membro_id', null).order('created_at', { ascending: false }).limit(cap),
      supabase.from('batismo_inscricoes')
        .select('id, nome, sobrenome, cpf, telefone, email, data_nascimento, status, created_at')
        .is('membro_id', null).is('deleted_at', null).neq('status', 'cancelado')
        .order('created_at', { ascending: false }).limit(cap),
      supabase.from('cui_convertidos')
        .select('id, nome, cpf, telefone, area, data_culto, created_at')
        .is('membro_id', null).is('deleted_at', null)
        .order('created_at', { ascending: false }).limit(cap),
    ]);
    if (next.error) throw next.error;
    if (bat.error) throw bat.error;
    if (conv.error) throw conv.error;
    const itens = [
      ...(next.data || []).map(rowNext),
      ...(bat.data || []).map(rowBatismo),
      ...(conv.data || []).map(rowConvertido),
    ].sort((a, b) => new Date(b.quando || 0) - new Date(a.quando || 0));
    res.json({
      total: itens.length,
      itens,
      por_origem: { next: (next.data || []).length, batismo: (bat.data || []).length, convertido: (conv.data || []).length },
    });
  } catch (e) {
    console.error('[next-batismo/sem-vinculo]', e.message);
    res.status(500).json({ error: e.message || 'Erro ao buscar pendências' });
  }
});

// ── GET /candidatos · membros que podem ser a pessoa (chave forte + nome) ─────
router.get('/candidatos', authorizeModule('next-batismo', 1), async (req, res) => {
  try {
    const { cpf, email, telefone, nome } = req.query;
    // 1) Chave forte (cpf/telefone/email) via membroMatch
    const fortes = await buscarCandidatos({ cpf, email, telefone }, { limit: 8 });
    const byId = new Map(fortes.map((m) => [m.id, m]));

    // 2) Fallback por nome (Dice) · só quando há nome e poucos candidatos fortes
    if (nome && normNome(nome).length >= 3) {
      const tokens = normNome(nome).split(' ').filter((t) => t.length >= 3).sort((a, b) => b.length - a.length);
      const alvo = tokens[0] || normNome(nome);
      const { data } = await supabase
        .from('mem_membros')
        .select('id, nome, email, telefone, cpf, status, foto_url, familia_id')
        .ilike('nome', `%${alvo}%`)
        .is('deleted_at', null)
        .limit(40);
      for (const m of (data || [])) {
        const score = Math.round(diceNome(nome, m.nome) * 100);
        if (score < 55) continue;
        const ex = byId.get(m.id);
        if (ex) { if (!ex.motivos.includes('nome')) ex.motivos.push('nome'); ex.score = Math.max(ex.score, score); }
        else byId.set(m.id, { ...m, motivos: ['nome'], score });
      }
    }
    const candidatos = [...byId.values()].sort((a, b) => b.score - a.score).slice(0, 8);
    res.json({ candidatos });
  } catch (e) {
    console.error('[next-batismo/candidatos]', e.message);
    res.status(500).json({ error: e.message || 'Erro ao buscar candidatos' });
  }
});

// Item 4 (Marcos · "só vincular"): ao resolver uma pessoa do Next, vincula a
// matrícula dela ao membro resolvido — a aba Pessoas consolida (1 linha) e,
// sendo convertida, ela já aparece no primeiro contato do Cuidados. Não cria
// convertido pra externo (decisão do Marcos) nem mexe em formado/desistiu.
// (O /fundir já vincula via merge_membros, que repointa next_matriculas.membro_id.)
async function vincularMatriculaNext(membroId, row) {
  if (!membroId || !row) return;
  try {
    let q = supabase.from('next_matriculas')
      .update({ membro_id: membroId, updated_at: new Date().toISOString() })
      .is('membro_id', null).is('deleted_at', null);
    if (row.cpf) q = q.eq('cpf', row.cpf);
    else if (row.email) q = q.eq('email', row.email);
    else return; // sem chave forte (cpf/email), não arrisca match por nome
    await q;
  } catch (e) { console.error('[next-batismo] vincular matrícula Next:', e.message); }
}

// ── POST /ligar · carimba membro_id na linha do funil (ligar OU criar) ────────
router.post('/ligar', authorizeModule('next-batismo', 2), async (req, res) => {
  try {
    const { tipo, id, membro_id, criar } = req.body || {};
    const tabela = TABELA[tipo];
    if (!tabela || !id) return res.status(400).json({ error: 'tipo (next|batismo|convertido) e id obrigatórios' });

    // Carrega a linha (pra criar stub a partir dela quando for o caso)
    const { data: row, error: rowErr } = await supabase.from(tabela).select('*').eq('id', id).maybeSingle();
    if (rowErr) throw rowErr;
    if (!row) return res.status(404).json({ error: 'Registro não encontrado' });

    let alvoMembroId = membro_id || null;
    let criado = false;

    if (!alvoMembroId) {
      if (!criar) return res.status(400).json({ error: 'informe membro_id ou criar:true' });
      const nome = [row.nome, row.sobrenome].filter(Boolean).join(' ').trim() || row.nome || 'Sem nome';
      const r = await acharOuCriar({ cpf: row.cpf, email: row.email, telefone: row.telefone, nome, status: 'visitante' });
      alvoMembroId = r.membro_id;
      criado = !!r.created;
    }

    const patch = { membro_id: alvoMembroId };
    if (tipo === 'convertido') patch.cadastrado = true;

    const { error: upErr } = await supabase.from(tabela).update(patch).eq('id', id);
    if (upErr) {
      // UNIQUE (evento_id, membro_id) no next_inscricoes · esse membro já tem inscrição nesse Next
      if (String(upErr.code) === '23505') {
        return res.status(409).json({ error: 'Esse membro já tem uma inscrição nesse mesmo Next — pode ser uma duplicata da própria inscrição.' });
      }
      throw upErr;
    }
    if (tipo === 'next') await vincularMatriculaNext(alvoMembroId, row);
    res.json({ ok: true, membro_id: alvoMembroId, criado });
  } catch (e) {
    console.error('[next-batismo/ligar]', e.message);
    res.status(500).json({ error: e.message || 'Erro ao ligar' });
  }
});

// ── POST /ignorar-duplicata · "não é a mesma pessoa" ─────────────────────────
router.post('/ignorar-duplicata', authorizeModule('next-batismo', 2), async (req, res) => {
  try {
    const { membro_a_id, membro_b_id, motivo } = req.body || {};
    if (!membro_a_id || !membro_b_id) return res.status(400).json({ error: 'membro_a_id e membro_b_id obrigatórios' });
    const [a, b] = [membro_a_id, membro_b_id].sort();
    const { data, error } = await supabase
      .from('mem_duplicados_ignorados')
      .upsert({ membro_a_id: a, membro_b_id: b, ignorado_por: req.user?.id || null, motivo: motivo || 'Marcado como pessoas distintas (Next-Batismo)' },
        { onConflict: 'membro_a_id,membro_b_id' })
      .select().single();
    if (error) throw error;
    res.json({ ok: true, registro: data });
  } catch (e) {
    console.error('[next-batismo/ignorar-duplicata]', e.message);
    res.status(500).json({ error: e.message || 'Erro ao ignorar' });
  }
});

// ── POST /fundir · merge_membros (sensível · nível 3) ─────────────────────────
router.post('/fundir', authorizeModule('next-batismo', 3), async (req, res) => {
  try {
    const { keep_id, merge_ids, observacao } = req.body || {};
    if (!keep_id) return res.status(400).json({ error: 'keep_id obrigatório' });
    if (!Array.isArray(merge_ids) || merge_ids.length === 0) return res.status(400).json({ error: 'merge_ids obrigatório (array de uuids)' });
    const { data, error } = await supabase.rpc('merge_membros', {
      p_keep_id: keep_id,
      p_merge_ids: merge_ids,
      p_feito_por: req.user?.id || null,
      p_observacao: observacao || 'Fusão via Next-Batismo (check de pessoas)',
    });
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[next-batismo/fundir]', e.message);
    res.status(500).json({ error: e.message || 'Erro ao fundir membros' });
  }
});

module.exports = router;
