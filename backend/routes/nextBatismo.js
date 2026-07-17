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
const { buscarCandidatos, acharOuCriar, acharOuCriarGuardado } = require('../services/membroMatch');
const { avaliarPossivelDuplicidade } = require('../services/duplicidadePolicy');

router.use(authenticate);

const TABELA = { next: 'next_inscricoes', batismo: 'batismo_inscricoes', convertido: 'cui_convertidos', visita: 'cui_visitas' };

// ── Reshape da view de duplicatas → mesma forma do /membresia/duplicados ──
function reshapeDuplicados(data) {
  return (data || []).map((d) => ({
    par_id: `${d.membro_a_id}_${d.membro_b_id}`,
    membro_a_id: d.membro_a_id,
    membro_b_id: d.membro_b_id,
    motivos: d.motivos || [],
    // `confianca` segue apenas para ordenação retrocompatível. A UI não o
    // apresenta como probabilidade: estas são regras, não um modelo calibrado.
    confianca: d.confianca,
    prioridade: (d.motivos || []).includes('cpf_igual') || (d.motivos || []).includes('nome_e_nascimento')
      ? 'alta' : 'media',
    evidencias: (d.motivos || []).map((m) => ({
      cpf_igual: 'CPF igual',
      nome_e_nascimento: 'Nome e nascimento compatíveis',
      telefone_e_nome: 'Telefone e nome compatíveis',
      email_e_nome: 'E-mail e nome compatíveis',
      nome_muito_parecido: 'Nomes muito parecidos',
    }[m] || m)),
    contradicoes: [
      d.a_cpf && d.b_cpf && String(d.a_cpf).replace(/\D/g, '').length === 11
        && String(d.b_cpf).replace(/\D/g, '').length === 11
        && String(d.a_cpf).replace(/\D/g, '') !== String(d.b_cpf).replace(/\D/g, '') ? 'CPFs diferentes' : null,
      d.a_nascimento && d.b_nascimento && d.a_nascimento !== d.b_nascimento ? 'Nascimentos diferentes' : null,
      d.a_genero && d.b_genero && d.a_genero !== d.b_genero ? 'Gêneros diferentes' : null,
      d.a_email && d.b_email && String(d.a_email).trim().toLowerCase() !== String(d.b_email).trim().toLowerCase() ? 'E-mails diferentes' : null,
    ].filter(Boolean),
    membro_a: {
      id: d.membro_a_id, nome: d.a_nome, email: d.a_email, telefone: d.a_telefone,
      cpf: d.a_cpf, data_nascimento: d.a_nascimento, status: d.a_status,
      foto_url: d.a_foto_url, criado_em: d.a_criado_em, genero: d.a_genero,
    },
    membro_b: {
      id: d.membro_b_id, nome: d.b_nome, email: d.b_email, telefone: d.b_telefone,
      cpf: d.b_cpf, data_nascimento: d.b_nascimento, status: d.b_status,
      foto_url: d.b_foto_url, criado_em: d.b_criado_em, genero: d.b_genero,
    },
  })).filter((item) => {
    const avaliacao = avaliarPossivelDuplicidade(item.membro_a, item.membro_b);
    item.prioridade = avaliacao.prioridade;
    item.evidencias = avaliacao.evidencias;
    item.contradicoes = avaliacao.contradicoes;
    return avaliacao.incluir;
  });
}

// Vínculos comprovados da pessoa em cada módulo. Não atribui proveniência a um
// campo específico (o legado não guarda isso); informa onde a equipe pode
// conferir a identidade com responsáveis e histórico operacional.
async function enriquecerOrigensDuplicados(items) {
  const ids = [...new Set((items || []).flatMap((p) => [p.membro_a_id, p.membro_b_id]).filter(Boolean))];
  if (!ids.length) return items;
  const porMembro = new Map(ids.map((id) => [id, []]));
  const adicionar = (id, origem) => {
    const lista = porMembro.get(id);
    if (!lista || lista.some((x) => x.tipo === origem.tipo && x.detalhe === origem.detalhe)) return;
    lista.push(origem);
  };
  const consultas = await Promise.all([
    supabase.from('cui_convertidos').select('membro_id, area, data_culto').in('membro_id', ids).is('deleted_at', null),
    supabase.from('mem_grupo_membros').select('membro_id, mem_grupos(nome)').in('membro_id', ids).is('saiu_em', null).is('deleted_at', null),
    supabase.from('next_inscricoes').select('membro_id, created_at').in('membro_id', ids),
    supabase.from('batismo_inscricoes').select('membro_id, status').in('membro_id', ids).is('deleted_at', null),
    supabase.from('cui_visitas').select('membro_id, tipo').in('membro_id', ids).is('deleted_at', null),
    supabase.from('mem_voluntarios').select('membro_id, mem_ministerios(nome)').in('membro_id', ids).is('ate', null),
  ]);
  const [convertidos, grupos, next, batismos, visitas, voluntarios] = consultas.map((r) => r.error ? [] : (r.data || []));
  convertidos.forEach((r) => adicionar(r.membro_id, {
    tipo: 'conversao', label: 'Conversão', detalhe: r.area ? String(r.area).toUpperCase() : null, rota: '/ministerial/cuidados',
  }));
  grupos.forEach((r) => adicionar(r.membro_id, {
    tipo: 'grupos', label: 'Grupos', detalhe: r.mem_grupos?.nome || null, rota: '/grupos',
  }));
  next.forEach((r) => adicionar(r.membro_id, {
    tipo: 'next', label: 'Next', detalhe: null, rota: '/ministerial/next',
  }));
  batismos.forEach((r) => adicionar(r.membro_id, {
    tipo: 'batismo', label: 'Batismo', detalhe: r.status || null, rota: '/batismo',
  }));
  visitas.forEach((r) => adicionar(r.membro_id, {
    tipo: 'visitas', label: 'Visitas', detalhe: r.tipo || null, rota: '/ministerial/cuidados',
  }));
  voluntarios.forEach((r) => adicionar(r.membro_id, {
    tipo: 'voluntariado', label: 'Voluntariado', detalhe: r.mem_ministerios?.nome || null, rota: '/ministerial/voluntariado',
  }));
  return items.map((p) => ({
    ...p,
    membro_a: { ...p.membro_a, origens: porMembro.get(p.membro_a_id) || [] },
    membro_b: { ...p.membro_b, origens: porMembro.get(p.membro_b_id) || [] },
  }));
}

// Auditoria da fila não pode derrubar a ação principal durante uma janela de
// deploy em que o backend novo suba antes da migration.
async function registrarResolucao(payload) {
  const { error } = await supabase.from('entradas_resolucoes').insert(payload);
  if (error && !/entradas_resolucoes|schema cache|does not exist/i.test(error.message || '')) {
    console.warn('[next-batismo] resolução não registrada:', error.message);
  }
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
// Visitas pastorais (cui_visitas) sem cadastro ligado. Vêm pra cá só pra RESOLVER a
// identidade (quem é essa pessoa no sistema) — visita NÃO é sinal de NSM nem marco de
// jornada; ligar só carimba cui_visitas.membro_id (Marcos 2026-07-02).
const NB_VISITA_LABEL = { visita_domiciliar: 'Visita domiciliar', visita_hospitalar: 'Visita hospitalar', funeral: 'Funeral', casamento: 'Casamento', aconselhamento: 'Aconselhamento', outro: 'Outro' };
function rowVisita(r) {
  const t = r.tipo === 'outro' && r.tipo_outro ? `Outro · ${r.tipo_outro}` : (NB_VISITA_LABEL[r.tipo] || r.tipo || 'Visita');
  return {
    tipo: 'visita', id: r.id,
    nome: r.nome, cpf: null, telefone: r.telefone, email: null, data_nascimento: null,
    quando: r.data_visita || r.created_at,
    contexto: `Visita/atendimento · ${t}`,
  };
}

// ── GET /resumo · contadores pros badges ─────────────────────────────────────
router.get('/resumo', authorizeModule('next-batismo', 1), async (req, res) => {
  try {
    const cnt = async (q) => { const { count } = await q; return count || 0; };
    const [dup, semNext, semBat, semConv, semVis, vivos, comCpf] = await Promise.all([
      cnt(supabase.from('vw_nb_duplicados_suspeitos').select('*', { count: 'exact', head: true })),
      cnt(supabase.from('next_inscricoes').select('id', { count: 'exact', head: true }).is('membro_id', null)),
      cnt(supabase.from('batismo_inscricoes').select('id', { count: 'exact', head: true }).is('membro_id', null).is('deleted_at', null).neq('status', 'cancelado')),
      cnt(supabase.from('cui_convertidos').select('id', { count: 'exact', head: true }).is('membro_id', null).is('deleted_at', null)),
      cnt(supabase.from('cui_visitas').select('id', { count: 'exact', head: true }).is('membro_id', null).is('deleted_at', null)),
      cnt(supabase.from('mem_membros').select('id', { count: 'exact', head: true }).is('deleted_at', null)),
      cnt(supabase.from('mem_membros').select('id', { count: 'exact', head: true }).is('deleted_at', null).not('cpf', 'is', null)),
    ]);
    res.json({
      duplicatas: dup,
      sem_vinculo: semNext + semBat + semConv + semVis,
      por_origem: { next: semNext, batismo: semBat, convertido: semConv, visita: semVis },
      // Saúde da identidade (corrida do CPF · faixa do topo da tela)
      saude: { pessoas: vivos, com_cpf: comCpf, pct_cpf: vivos > 0 ? Math.round((comCpf / vivos) * 100) : 0 },
    });
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
    const items = await enriquecerOrigensDuplicados(reshapeDuplicados(data));
    res.json({ total: items.length, items });
  } catch (e) {
    console.error('[next-batismo/duplicados]', e.message);
    res.status(500).json({ error: e.message || 'Erro ao buscar duplicados' });
  }
});

// ── GET /resolucoes · histórico auditável da fila única ─────────────────────
router.get('/resolucoes', authorizeModule('next-batismo', 1), async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 200, 500);
    let q = supabase.from('entradas_resolucoes').select('*')
      .order('resolvido_em', { ascending: false }).limit(limit);
    if (req.query.tipo) q = q.eq('tipo', req.query.tipo);
    if (req.query.acao) q = q.eq('acao', req.query.acao);
    const { data, error } = await q;
    if (error) throw error;

    const ids = [...new Set((data || []).flatMap((r) => [r.membro_principal_id, r.membro_secundario_id]).filter(Boolean))];
    const porId = new Map();
    for (let i = 0; i < ids.length; i += 200) {
      const { data: membros, error: membrosErr } = await supabase.from('mem_membros')
        .select('id, nome, cpf, telefone, email, status, deleted_at').in('id', ids.slice(i, i + 200));
      if (membrosErr) throw membrosErr;
      for (const m of membros || []) porId.set(m.id, m);
    }
    res.json({
      total: (data || []).length,
      items: (data || []).map((r) => ({
        ...r,
        membro_principal: porId.get(r.membro_principal_id) || null,
        membro_secundario: porId.get(r.membro_secundario_id) || null,
      })),
    });
  } catch (e) {
    console.error('[next-batismo/resolucoes]', e.message);
    res.status(500).json({ error: e.message || 'Erro ao buscar resoluções' });
  }
});

// ── GET /sem-vinculo · inscrições/convertidos sem membro_id ──────────────────
router.get('/sem-vinculo', authorizeModule('next-batismo', 1), async (req, res) => {
  try {
    const cap = 300;
    const [next, bat, conv, visita] = await Promise.all([
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
      supabase.from('cui_visitas')
        .select('id, nome, telefone, tipo, tipo_outro, data_visita, created_at')
        .is('membro_id', null).is('deleted_at', null)
        .order('created_at', { ascending: false }).limit(cap),
    ]);
    if (next.error) throw next.error;
    if (bat.error) throw bat.error;
    if (conv.error) throw conv.error;
    if (visita.error) throw visita.error;
    const itens = [
      ...(next.data || []).map(rowNext),
      ...(bat.data || []).map(rowBatismo),
      ...(conv.data || []).map(rowConvertido),
      ...(visita.data || []).map(rowVisita),
    ].sort((a, b) => new Date(b.quando || 0) - new Date(a.quando || 0));
    res.json({
      total: itens.length,
      itens,
      por_origem: { next: (next.data || []).length, batismo: (bat.data || []).length, convertido: (conv.data || []).length, visita: (visita.data || []).length },
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

function ultimoSobrenome(nome) {
  const t = String(nome || '').trim().split(/\s+/).filter(Boolean);
  return t.length ? t[t.length - 1] : '';
}

// Liga `novoMembroId` à MESMA família do `candidatoId` (cria a família se o
// candidato ainda não tiver uma) e marca o par como NÃO-duplicata (são família,
// não a mesma pessoa) pra parar de aparecer na fila de duplicados.
async function ligarMesmaFamilia(novoMembroId, candidatoId, feitoPor) {
  if (!novoMembroId || !candidatoId || novoMembroId === candidatoId) return null;
  const { data: cand } = await supabase.from('mem_membros').select('id, nome, familia_id').eq('id', candidatoId).maybeSingle();
  if (!cand) return null;
  let familiaId = cand.familia_id;
  if (!familiaId) {
    const { data: novo } = await supabase.from('mem_membros').select('nome').eq('id', novoMembroId).maybeSingle();
    const sob = ultimoSobrenome(cand.nome) || ultimoSobrenome(novo?.nome) || 'sem sobrenome';
    const { data: fam, error } = await supabase.from('mem_familias').insert({ nome: `Família ${sob}` }).select('id').single();
    if (error) throw error;
    familiaId = fam.id;
    await supabase.from('mem_membros').update({ familia_id: familiaId }).eq('id', candidatoId);
  }
  await supabase.from('mem_membros').update({ familia_id: familiaId }).eq('id', novoMembroId);
  const [a, b] = [novoMembroId, candidatoId].sort();
  await supabase.from('mem_duplicados_ignorados').upsert(
    { membro_a_id: a, membro_b_id: b, ignorado_por: feitoPor || null, motivo: 'Mesma família (não é a mesma pessoa) · Next-Batismo' },
    { onConflict: 'membro_a_id,membro_b_id' });
  return familiaId;
}

// ── POST /ligar · carimba membro_id na linha do funil (ligar OU criar) ────────
router.post('/ligar', authorizeModule('next-batismo', 2), async (req, res) => {
  try {
    const { tipo, id, membro_id, criar, familia_de } = req.body || {};
    const tabela = TABELA[tipo];
    if (!tabela || !id) return res.status(400).json({ error: 'tipo (next|batismo|convertido) e id obrigatórios' });

    // Carrega a linha (pra criar stub a partir dela quando for o caso)
    const { data: row, error: rowErr } = await supabase.from(tabela).select('*').eq('id', id).maybeSingle();
    if (rowErr) throw rowErr;
    if (!row) return res.status(404).json({ error: 'Registro não encontrado' });

    let alvoMembroId = membro_id || null;
    let criado = false;
    let familiaLigada = false;

    // "É da mesma família": pessoa NOVA (distinta do candidato) ligada à família dele.
    if (familia_de && !membro_id) {
      const nome = [row.nome, row.sobrenome].filter(Boolean).join(' ').trim() || row.nome || 'Sem nome';
      const r = await acharOuCriarGuardado({
        cpf: row.cpf, email: row.email, telefone: row.telefone, nome,
        dataNascimento: row.data_nascimento, status: 'visitante',
      });
      alvoMembroId = r.membro_id;
      criado = !!r.created;
      await ligarMesmaFamilia(alvoMembroId, familia_de, req.user?.id);
      familiaLigada = true;
    } else if (!alvoMembroId) {
      if (!criar) return res.status(400).json({ error: 'informe membro_id ou criar:true' });
      const nome = [row.nome, row.sobrenome].filter(Boolean).join(' ').trim() || row.nome || 'Sem nome';
      // acharOuCriarGuardado reaproveita match por telefone+nome e nome+nascimento
      // antes de criar stub — evita duplicar quem já existe sem CPF/e-mail batendo.
      const r = await acharOuCriarGuardado({
        cpf: row.cpf, email: row.email, telefone: row.telefone, nome,
        dataNascimento: row.data_nascimento, status: 'visitante',
      });
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
    await registrarResolucao({
      tipo: 'sem_vinculo',
      acao: criado ? 'cadastro_criado' : 'vinculado',
      membro_principal_id: alvoMembroId,
      origem: tipo,
      origem_id: String(id),
      detalhe: { nome: row.nome || null, familia_ligada: familiaLigada },
      resolvido_por: req.user?.id || null,
    });
    res.json({ ok: true, membro_id: alvoMembroId, criado, familia_ligada: familiaLigada });
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
    await registrarResolucao({
      tipo: 'duplicidade', acao: 'pessoas_distintas',
      membro_principal_id: a, membro_secundario_id: b,
      origem: 'mem_duplicados_ignorados', origem_id: data?.id ? String(data.id) : null,
      detalhe: { motivo: motivo || 'Marcado como pessoas distintas' },
      resolvido_por: req.user?.id || null,
    });
    res.json({ ok: true, registro: data });
  } catch (e) {
    console.error('[next-batismo/ignorar-duplicata]', e.message);
    res.status(500).json({ error: e.message || 'Erro ao ignorar' });
  }
});

// ── Mesa responsável por origem (NÃO hardcoda pessoa · líder de grupo vem real) ──
const DESK_POR_ORIGEM = {
  decisao: { papel: 'Cuidados', contexto: 'acompanhamento do novo convertido' },
  next:    { papel: 'Integração', contexto: 'inscrição no Next' },
  batismo: { papel: 'Integração', contexto: 'inscrição de batismo' },
};

// ── GET /pessoa/:id · Ficha de Entrada (vitrine) ─────────────────────────────
// Por onde a pessoa entrou (1º toque) · linha do tempo de todos os toques ·
// conexões (família / mesmo contato / mesmo grupo) · quem perguntar. Cada fonte
// roda em try/catch isolado: se a outra sessão (a que unifica a pessoa/NSM)
// reescrever uma tabela, a ficha DEGRADA (some aquele toque) em vez de quebrar.
// Contrato fino de propósito — esta tela é a vitrine, não dona do dado.
router.get('/pessoa/:id', authorizeModule('next-batismo', 1), async (req, res) => {
  try {
    const id = req.params.id;
    const { data: pessoa, error: pErr } = await supabase
      .from('mem_membros')
      .select('id, nome, cpf, telefone, email, status, foto_url, data_nascimento, familia_id, created_at')
      .eq('id', id).is('deleted_at', null).maybeSingle();
    if (pErr) throw pErr;
    if (!pessoa) return res.status(404).json({ error: 'Pessoa não encontrada' });

    const toques = [];
    const quemPerguntar = [];
    const origensVistas = new Set();
    const gruposDaPessoa = [];
    const safe = async (label, fn) => {
      try { await fn(); } catch (e) { console.error(`[next-batismo/pessoa ${label}]`, e.message); }
    };

    // Decisão / convertido
    await safe('decisao', async () => {
      const { data } = await supabase.from('cui_convertidos')
        .select('id, area, data_culto, atendido_apos_culto, created_at')
        .eq('membro_id', id).is('deleted_at', null);
      (data || []).forEach((r) => {
        origensVistas.add('decisao');
        toques.push({
          tipo: 'decisao', titulo: 'Decisão por Jesus',
          contexto: [r.area ? `Área ${String(r.area).toUpperCase()}` : null, r.atendido_apos_culto ? 'já atendido' : 'aguardando contato'].filter(Boolean).join(' · '),
          quando: r.data_culto || r.created_at,
        });
      });
    });

    // Next
    await safe('next', async () => {
      const { data } = await supabase.from('next_inscricoes')
        .select('id, evento_id, created_at').eq('membro_id', id);
      (data || []).forEach((r) => {
        origensVistas.add('next');
        toques.push({ tipo: 'next', titulo: 'Inscrição no Next', contexto: 'Funil de novo convertido', quando: r.created_at });
      });
    });

    // Batismo
    await safe('batismo', async () => {
      const { data } = await supabase.from('batismo_inscricoes')
        .select('id, status, data_batismo, created_at').eq('membro_id', id).is('deleted_at', null);
      (data || []).forEach((r) => {
        origensVistas.add('batismo');
        toques.push({ tipo: 'batismo', titulo: 'Inscrição de batismo', contexto: r.status || 'pendente', quando: r.created_at });
        if (r.data_batismo) toques.push({ tipo: 'batizado', titulo: 'Batizado', contexto: '', quando: r.data_batismo });
      });
    });

    // Grupo (vínculo ativo)
    await safe('grupo', async () => {
      const { data } = await supabase.from('mem_grupo_membros')
        .select('grupo_id, funcao, mem_grupos(id, nome, lider_id)')
        .eq('membro_id', id).is('saiu_em', null).is('deleted_at', null);
      (data || []).forEach((r) => {
        const g = r.mem_grupos;
        if (g) {
          gruposDaPessoa.push(g);
          toques.push({ tipo: 'grupo', titulo: 'Entrou em grupo', contexto: g.nome || '', quando: null });
        }
      });
    });

    // Trilha (marcos da jornada já concluídos)
    await safe('trilha', async () => {
      const { data } = await supabase.from('mem_trilha_valores')
        .select('etapa, concluida, data_conclusao').eq('membro_id', id).eq('concluida', true);
      (data || []).forEach((r) => {
        toques.push({ tipo: 'trilha', titulo: `Trilha · ${r.etapa}`, contexto: 'concluída', quando: r.data_conclusao });
      });
    });

    // Ordena cronológico (toques sem data caem ao fim)
    toques.sort((a, b) => {
      if (!a.quando) return 1; if (!b.quando) return -1;
      return new Date(a.quando) - new Date(b.quando);
    });
    const primeiroComData = toques.find((t) => t.quando);
    const primeiro_toque = primeiroComData
      ? { tipo: primeiroComData.tipo, label: primeiroComData.titulo, quando: primeiroComData.quando }
      : { tipo: 'cadastro', label: 'Cadastro criado', quando: pessoa.created_at };

    // Conexões
    const conexoes = { familia: [], mesmo_contato: [], mesmo_grupo: [] };
    await safe('familia', async () => {
      if (!pessoa.familia_id) return;
      const { data } = await supabase.from('mem_membros')
        .select('id, nome, status').eq('familia_id', pessoa.familia_id).neq('id', id).is('deleted_at', null).limit(20);
      conexoes.familia = data || [];
    });
    await safe('mesmo_contato', async () => {
      const cands = await buscarCandidatos({ cpf: pessoa.cpf, email: pessoa.email, telefone: pessoa.telefone }, { limit: 10 });
      conexoes.mesmo_contato = cands.filter((c) => c.id !== id)
        .map((c) => ({ id: c.id, nome: c.nome, status: c.status, motivos: c.motivos }));
    });
    await safe('mesmo_grupo', async () => {
      const ids = gruposDaPessoa.map((g) => g.id).filter(Boolean);
      if (!ids.length) return;
      const { data } = await supabase.from('mem_grupo_membros')
        .select('membro_id, mem_membros(id, nome, status), mem_grupos(nome)')
        .in('grupo_id', ids).neq('membro_id', id).is('saiu_em', null).is('deleted_at', null).limit(30);
      const seen = new Set();
      (data || []).forEach((r) => {
        const m = r.mem_membros;
        if (m && !seen.has(m.id)) { seen.add(m.id); conexoes.mesmo_grupo.push({ id: m.id, nome: m.nome, status: m.status, grupo: r.mem_grupos?.nome || '' }); }
      });
    });

    // Quem perguntar (líder de grupo = nome REAL · mesa por origem = sem nome)
    await safe('quem-perguntar', async () => {
      const liderIds = [...new Set(gruposDaPessoa.map((g) => g.lider_id).filter(Boolean))];
      if (liderIds.length) {
        const { data } = await supabase.from('mem_membros').select('id, nome, telefone').in('id', liderIds);
        const byId = new Map((data || []).map((m) => [m.id, m]));
        gruposDaPessoa.forEach((g) => {
          const l = g.lider_id && byId.get(g.lider_id);
          if (l) quemPerguntar.push({ papel: 'Líder do grupo', nome: l.nome, contexto: g.nome || '', telefone: l.telefone || null });
        });
      }
      origensVistas.forEach((o) => {
        const d = DESK_POR_ORIGEM[o];
        if (d) quemPerguntar.push({ papel: d.papel, nome: null, contexto: d.contexto });
      });
    });

    // Contatos ACUMULADOS (mem_contatos · telefones/e-mails de outras portas)
    let contatos = [];
    await safe('contatos', async () => {
      const { data } = await supabase.from('mem_contatos')
        .select('tipo, valor, fonte, ultimo_visto')
        .eq('membro_id', id).is('deleted_at', null)
        .order('ultimo_visto', { ascending: false }).limit(20);
      contatos = data || [];
    });

    res.json({
      pessoa: { ...pessoa, criado_em: pessoa.created_at },
      primeiro_toque, toques, conexoes, quem_perguntar: quemPerguntar, contatos,
    });
  } catch (e) {
    console.error('[next-batismo/pessoa]', e.message);
    res.status(500).json({ error: e.message || 'Erro ao montar ficha' });
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
