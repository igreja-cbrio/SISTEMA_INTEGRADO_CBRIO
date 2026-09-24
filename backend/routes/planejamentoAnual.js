// =====================================================================
// Planejamento Anual · rotas (/api/planejamento-anual) · 2026-08-12
// =====================================================================
// Camada FINA de I/O: toda regra de negócio vive em
// services/planejamentoAnualRegras.js (puro · testado em src/test/).
// Visibilidade: as tabelas sensíveis são deny-by-default na RLS; é AQUI
// (service_role + projetarProposta) que cada papel recebe só o que pode
// ver — nunca devolver linhas cruas de plan_avaliacoes/plan_decisoes/
// plan_apontamentos sem passar pela projeção.
// Papéis: Pastor = cargo `pastor-presidente` (decisão é EXCLUSIVA dele ·
// spec) · avaliador = assento em plan_ciclo_avaliadores · proponente =
// lider/preenchido_por/created_by da proposta.
// =====================================================================
const router = require('express').Router();
const { authenticate, authorizeModule, isSuperAdminEmail } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { notificar } = require('../services/notificar');
const { isAuthorizedCron } = require('../utils/cronAuth');
const PA = require('../services/planejamentoAnualRegras');
const PAInsights = require('../services/planejamentoAnualInsights');
const { criarSolicitacaoRotina, gerarSolicitacoesRotinaCompras } = require('../services/planejamentoAnualSolicitacoes');

const MOD = 'planejamento-anual';

function hojeSaoPaulo() {
  // 'YYYY-MM-DD' no fuso America/Sao_Paulo (en-CA formata ISO)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

// Cron (ANTES do authenticate · CRON_SECRET): gera 1 solicitação de COMPRAS
// por ciclo de recorrência vencido, para propostas de rotina JÁ APROVADAS
// (a régua de vencimento vive em services/planejamentoAnualSolicitacoes.js).
// Reserva de espaço NÃO passa por aqui — é gerada uma única vez, no momento
// da decisão (ver aplicarDecisao abaixo).
// ⚠️ Sem slot próprio no vercel.json (a Vercel está no teto de crons do
// plano) — o disparo automático é de carona no cron diário
// `/api/kpis/v2/cron/coletar` (07:00 · ver kpisV2.js). Esta rota é o caminho
// de disparo MANUAL/teste, sempre atrás do CRON_SECRET.
router.get('/cron/gerar-solicitacoes-rotina', async (req, res) => {
  if (!isAuthorizedCron(req)) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const r = await gerarSolicitacoesRotinaCompras();
    console.log(`[planejamento-anual/cron/gerar-solicitacoes-rotina] ${hojeSaoPaulo()} · ${r.avaliadas} avaliadas · ${r.gerados} geradas · ${r.erros.length} erros`);
    res.json({ ok: true, ...r });
  } catch (e) {
    console.error('[planejamento-anual/cron/gerar-solicitacoes-rotina]', e.message);
    res.status(500).json({ error: 'Erro ao gerar solicitações de rotina' });
  }
});

router.use(authenticate);

// Pastor presidente por CARGO · ou SUPER-ADMIN (decisão do Yago 2026-08-13:
// super-admin vê tudo sem restrição — é quem testa e administra o sistema;
// segue o padrão is_super_admin() usado em todos os módulos). O papel de
// decisão "de negócio" continua sendo exclusivo do cargo pastor-presidente.
async function ehPastorOuSuper(req) {
  if (req.user?.granular?.cargoSlug === 'pastor-presidente') return true;
  if (req.user?.is_super_admin === true) return true;
  return isSuperAdminEmail(req.user?.email);
}

// ⚠️ 2026-08-27 (decisão do Diego): visibilidade do CONTEÚDO das propostas
// (nome/área/descrição/custo — não confundir com avaliação, que já era
// cega) passou a ser restrita a proponente + diretoria + Pastor + super-
// admin. `is_diretoria_geral` é o flag canônico dos "5 nominais" da
// diretoria geral (ver CLAUDE.md) — NÃO é o mesmo que profiles.role
// ('diretor'/'admin'): Pedro Paulo Menezes e o Pastor Presidente têm
// role='assistente' mas is_diretoria_geral=true, e são exatamente os
// avaliadores do ciclo. Usar role aqui excluiria quem precisa avaliar.
function ehDiretoria(req) {
  return Boolean(req.user?.is_diretoria_geral);
}

async function carregarCiclo(cicloId) {
  const { data, error } = await supabase.from('plan_ciclos').select('*').eq('id', cicloId).single();
  if (error) return null;
  return data;
}

async function carregarAvaliadores(cicloId) {
  const { data } = await supabase
    .from('plan_ciclo_avaliadores')
    .select('id, diretoria, profile_id, profiles:profile_id (id, name, email)')
    .eq('ciclo_id', cicloId);
  return data || [];
}

async function carregarLocais() {
  const { data } = await supabase.from('plan_locais').select('*').order('ordem');
  const porId = {};
  (data || []).forEach((l) => { porId[l.id] = l; });
  return { lista: data || [], porId };
}

async function carregarProposta(id) {
  const { data, error } = await supabase
    .from('plan_propostas').select('*').eq('id', id).is('deleted_at', null).single();
  if (error) return null;
  return data;
}

async function avaliacoesPorProposta(propostaIds) {
  if (!propostaIds.length) return {};
  const grupos = {};
  const { data } = await supabase
    .from('plan_avaliacoes').select('*')
    .in('proposta_id', propostaIds).is('deleted_at', null);
  (data || []).forEach((a) => {
    (grupos[a.proposta_id] = grupos[a.proposta_id] || []).push(a);
  });
  return grupos;
}

async function decisoesPorProposta(propostaIds) {
  if (!propostaIds.length) return {};
  const grupos = {};
  const { data } = await supabase
    .from('plan_decisoes').select('*').in('proposta_id', propostaIds);
  (data || []).forEach((d) => {
    (grupos[d.proposta_id] = grupos[d.proposta_id] || []).push(d);
  });
  return grupos;
}

function papelPara(req, avaliadores, proposta, pastorFlag) {
  if (pastorFlag) return { papel: 'pastor', minhaDiretoria: null };
  const assento = avaliadores.find((a) => a.profile_id === req.user.id);
  if (assento) return { papel: 'avaliador', minhaDiretoria: assento.diretoria };
  const uid = req.user.id;
  if (proposta && [proposta.lider_id, proposta.preenchido_por_id, proposta.created_by].includes(uid)) {
    return { papel: 'proponente', minhaDiretoria: null };
  }
  return { papel: 'observador', minhaDiretoria: null };
}

const proponenteIds = (p) => [...new Set([p.lider_id, p.preenchido_por_id, p.created_by].filter(Boolean))];

// ── Catálogos ────────────────────────────────────────────────────────────
router.get('/aux/locais', authorizeModule(MOD, 1), async (_req, res) => {
  const { lista } = await carregarLocais();
  res.json(lista.filter((l) => l.ativo !== false));
});

router.get('/aux/areas', authorizeModule(MOD, 1), async (_req, res) => {
  // `lider_id` é lido em consulta própria e tolera a migration ausente (deploy
  // em 2 etapas): pedir a coluna dentro do select principal faria o PostgREST
  // recusar a query inteira se ela não existir ainda (lição do `parcelas_max`).
  const base = await supabase
    .from('plan_areas_diretoria').select('area, diretoria, rotulo, ativo').order('area');
  const lista = (base.data || []).filter((a) => a.ativo !== false);
  const comLider = await supabase.from('plan_areas_diretoria').select('area, lider_id');
  if (!comLider.error) {
    const porArea = new Map((comLider.data || []).map((r) => [r.area, r.lider_id]));
    for (const a of lista) a.lider_id = porArea.get(a.area) || null;
  }
  res.json(lista);
});

router.get('/aux/constantes', authorizeModule(MOD, 1), (_req, res) => {
  res.json({
    criterios: PA.CRITERIOS,
    valores: PA.VALORES_IGREJA,
    campos_apontaveis: PA.CAMPOS_APONTAVEIS,
    suposicoes: PA.SUPOSICOES,
  });
});

// ── Ciclos ───────────────────────────────────────────────────────────────
router.get('/ciclos', authorizeModule(MOD, 1), async (_req, res) => {
  const { data, error } = await supabase.from('plan_ciclos').select('*').order('ano', { ascending: false });
  if (error) return res.status(500).json({ error: 'Erro ao listar ciclos' });
  res.json(data || []);
});

router.get('/ciclos/:id', authorizeModule(MOD, 1), async (req, res) => {
  const ciclo = await carregarCiclo(req.params.id);
  if (!ciclo) return res.status(404).json({ error: 'Ciclo não encontrado' });
  const avaliadores = await carregarAvaliadores(ciclo.id);
  res.json({
    ...ciclo,
    avaliadores: avaliadores.map((a) => ({
      diretoria: a.diretoria,
      profile_id: a.profile_id,
      nome: a.profiles?.name || null,
    })),
    quorum: avaliadores.length,
    meu_papel: papelPara(req, avaliadores, null, await ehPastorOuSuper(req)).papel,
  });
});

router.post('/ciclos', authorizeModule(MOD, 5), async (req, res) => {
  const ano = parseInt(req.body?.ano, 10);
  if (!Number.isInteger(ano) || ano < 2026 || ano > 2100) {
    return res.status(400).json({ error: 'Ano inválido' });
  }
  const { data, error } = await supabase.from('plan_ciclos').insert({ ano }).select().single();
  if (error) return res.status(400).json({ error: 'Não foi possível criar o ciclo (ano já existe?)' });
  res.status(201).json(data);
});

// Janelas de submissão/avaliação: exclusivas do Pastor (spec)
router.patch('/ciclos/:id/janelas', authorizeModule(MOD, 1), async (req, res) => {
  if (!(await ehPastorOuSuper(req))) return res.status(403).json({ error: 'Abrir e fechar janelas é exclusivo do Pastor presidente' });
  const patch = {};
  if (typeof req.body?.submissao_aberta === 'boolean') patch.submissao_aberta = req.body.submissao_aberta;
  if (typeof req.body?.avaliacao_aberta === 'boolean') patch.avaliacao_aberta = req.body.avaliacao_aberta;
  if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nada a alterar' });
  const { data, error } = await supabase.from('plan_ciclos').update(patch).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: 'Erro ao atualizar as janelas' });
  res.json(data);
});

router.put('/ciclos/:id/avaliadores', authorizeModule(MOD, 5), async (req, res) => {
  const itens = Array.isArray(req.body?.avaliadores) ? req.body.avaliadores : [];
  const resultados = [];
  for (const item of itens) {
    if (!item?.diretoria || !item?.profile_id) continue;
    const { error } = await supabase
      .from('plan_ciclo_avaliadores')
      .upsert({ ciclo_id: req.params.id, diretoria: item.diretoria, profile_id: item.profile_id }, { onConflict: 'ciclo_id,diretoria' });
    resultados.push({ diretoria: item.diretoria, ok: !error });
  }
  res.json({ resultados });
});

// Remove uma diretoria do quórum de avaliação (ela deixa de contar em
// `avaliadores.length` — o quórum das propostas cai). Não apaga notas já
// enviadas por ela (ficam como registro histórico).
router.delete('/ciclos/:id/avaliadores/:diretoria', authorizeModule(MOD, 5), async (req, res) => {
  const { error } = await supabase
    .from('plan_ciclo_avaliadores')
    .delete().eq('ciclo_id', req.params.id).eq('diretoria', req.params.diretoria);
  if (error) return res.status(500).json({ error: 'Erro ao remover o assento' });
  res.json({ ok: true });
});

// Quem tem acesso ao orçamento do ciclo (ver/compor/enviar) — independente
// de ser avaliador de notas. Ver comentário em `podeCompoOrcamento`.
router.get('/ciclos/:id/orcamento/responsaveis', authorizeModule(MOD, 5), async (req, res) => {
  const { data, error } = await supabase
    .from('plan_orcamento_responsaveis')
    .select('id, profile_id, profiles:profile_id (id, name, email)')
    .eq('ciclo_id', req.params.id);
  if (error) return res.status(500).json({ error: 'Erro ao listar os responsáveis pelo orçamento' });
  res.json((data || []).map((r) => ({ id: r.id, profile_id: r.profile_id, nome: r.profiles?.name || null, email: r.profiles?.email || null })));
});

router.put('/ciclos/:id/orcamento/responsaveis', authorizeModule(MOD, 5), async (req, res) => {
  const profileIds = Array.isArray(req.body?.profile_ids) ? req.body.profile_ids.filter(Boolean) : [];
  const { error: eDel } = await supabase
    .from('plan_orcamento_responsaveis').delete().eq('ciclo_id', req.params.id);
  if (eDel) return res.status(500).json({ error: 'Erro ao atualizar os responsáveis pelo orçamento' });
  if (profileIds.length) {
    const { error: eIns } = await supabase
      .from('plan_orcamento_responsaveis')
      .insert(profileIds.map((profile_id) => ({ ciclo_id: req.params.id, profile_id })));
    if (eIns) return res.status(500).json({ error: 'Erro ao salvar os responsáveis pelo orçamento' });
  }
  res.json({ ok: true });
});

// ── Propostas ────────────────────────────────────────────────────────────
router.get('/ciclos/:id/propostas', authorizeModule(MOD, 1), async (req, res) => {
  const ciclo = await carregarCiclo(req.params.id);
  if (!ciclo) return res.status(404).json({ error: 'Ciclo não encontrado' });
  const avaliadores = await carregarAvaliadores(ciclo.id);
  const quorum = avaliadores.length;
  const pastorFlag = await ehPastorOuSuper(req);
  const podeVerTudo = pastorFlag || ehDiretoria(req);

  let query = supabase.from('plan_propostas').select('*')
    .eq('ciclo_id', ciclo.id).is('deleted_at', null).order('created_at');
  if (!podeVerTudo || req.query.minhas === 'true') {
    query = query.or(`lider_id.eq.${req.user.id},preenchido_por_id.eq.${req.user.id},created_by.eq.${req.user.id}`);
  }
  const { data: propostas, error } = await query;
  if (error) return res.status(500).json({ error: 'Erro ao listar propostas' });

  const ids = (propostas || []).map((p) => p.id);
  const avs = await avaliacoesPorProposta(ids);
  const decs = await decisoesPorProposta(ids);

  // Lista leve: projeção por papel SEM notas detalhadas (o detalhe traz)
  const lista = (propostas || []).map((p) => {
    const { papel, minhaDiretoria } = papelPara(req, avaliadores, p, pastorFlag);
    const proj = PA.projetarProposta({
      proposta: p,
      avaliacoes: avs[p.id] || [],
      decisoes: decs[p.id] || [],
      apontamentos: [],
      quorum,
      papel,
      minhaDiretoria,
    });
    return {
      id: p.id, nome: p.nome, natureza: p.natureza, area: p.area,
      lider_id: p.lider_id, data_inicio: p.data_inicio, precisao_inicio: p.precisao_inicio,
      estado: p.estado, estado_derivado: proj.estado_derivado,
      situacao_decisao: proj.situacao_decisao,
      avaliacoes_recebidas: proj.avaliacoes_recebidas, quorum,
      custo: p.custo, liquido: proj.liquido, custeio: proj.custeio,
      minha_avaliacao_enviada: papel === 'avaliador' ? Boolean(proj.minha_avaliacao) : undefined,
      meu_papel: papel,
    };
  });
  res.json(lista);
});

router.post('/propostas', authorizeModule(MOD, 2), async (req, res) => {
  const b = req.body || {};
  const ciclo = await carregarCiclo(b.ciclo_id);
  if (!ciclo) return res.status(400).json({ error: 'Ciclo inválido' });
  const insert = {
    ciclo_id: ciclo.id,
    nome: b.nome || 'Sem nome',
    natureza: b.natureza,
    area: b.area,
    lider_id: b.lider_id,
    preenchido_por_id: b.preenchido_por_id || req.user.id,
    data_inicio: b.data_inicio,
    precisao_inicio: b.precisao_inicio || 'mes',
    multi_dia: Boolean(b.multi_dia),
    data_fim: b.multi_dia ? (b.data_fim || null) : null,
    precisao_fim: b.multi_dia ? (b.precisao_fim || null) : null,
    recorrencia: b.recorrencia || 'unica',
    dia_semana: b.dia_semana ?? null,
    hora_inicio: b.hora_inicio || null,
    hora_fim: b.hora_fim || null,
    local_id: b.local_id,
    locais_adicionais_ids: Array.isArray(b.locais_adicionais_ids) ? b.locais_adicionais_ids : [],
    local_fora_detalhe: b.local_fora_detalhe || null,
    publico_alvo: b.publico_alvo || null,
    descricao: b.descricao || null,
    alcance_pct: b.alcance_pct ?? null,
    publico_considerado: b.publico_considerado || 'igreja_inteira',
    pertencimento: b.pertencimento || null,
    valores: Array.isArray(b.valores) ? b.valores : [],
    visao_explique: b.visao_explique || null,
    impacto: b.impacto || null,
    custo: Number(b.custo) || 0,
    tem_arrecadacao: Boolean(b.tem_arrecadacao),
    arrecadacao_prevista: Number(b.arrecadacao_prevista) || 0,
    estado: 'rascunho',
    created_by: req.user.id,
  };
  const { data, error } = await supabase.from('plan_propostas').insert(insert).select().single();
  if (error) {
    console.error('[planejamento-anual] erro ao criar proposta:', error.message);
    return res.status(400).json({ error: 'Não foi possível criar a proposta (verifique área, local e líder)' });
  }
  res.status(201).json(data);
});

router.get('/propostas/:id', authorizeModule(MOD, 1), async (req, res) => {
  const p = await carregarProposta(req.params.id);
  if (!p) return res.status(404).json({ error: 'Proposta não encontrada' });
  const pastorFlag = await ehPastorOuSuper(req);
  // Mesma régua do GET de lista: quem não é proponente/diretoria/Pastor/
  // super-admin não vê a proposta — nem projeção reduzida (era o furo:
  // 'observador' recebia nome/área/descrição/custo por inteiro).
  if (!pastorFlag && !ehDiretoria(req) && !proponenteIds(p).includes(req.user.id)) {
    return res.status(404).json({ error: 'Proposta não encontrada' });
  }
  const avaliadores = await carregarAvaliadores(p.ciclo_id);
  const { papel, minhaDiretoria } = papelPara(req, avaliadores, p, pastorFlag);
  const avs = await avaliacoesPorProposta([p.id]);
  const decs = await decisoesPorProposta([p.id]);
  const { data: apontamentos } = await supabase
    .from('plan_apontamentos').select('*').eq('proposta_id', p.id);
  res.json(PA.projetarProposta({
    proposta: p,
    avaliacoes: avs[p.id] || [],
    decisoes: decs[p.id] || [],
    apontamentos: apontamentos || [],
    quorum: avaliadores.length,
    papel,
    minhaDiretoria,
  }));
});

router.put('/propostas/:id', authorizeModule(MOD, 2), async (req, res) => {
  const p = await carregarProposta(req.params.id);
  if (!p) return res.status(404).json({ error: 'Proposta não encontrada' });
  if (!proponenteIds(p).includes(req.user.id) && !(await ehPastorOuSuper(req))) {
    return res.status(403).json({ error: 'Só o proponente edita a proposta' });
  }
  if (p.estado !== 'rascunho') {
    return res.status(409).json({ error: 'Proposta enviada não pode ser editada (use retificação quando devolvida)' });
  }
  const permitidos = [
    'nome', 'natureza', 'area', 'lider_id', 'preenchido_por_id', 'data_inicio', 'precisao_inicio',
    'multi_dia', 'data_fim', 'precisao_fim', 'recorrencia', 'dia_semana', 'hora_inicio', 'hora_fim',
    'local_id', 'locais_adicionais_ids', 'local_fora_detalhe',
    'publico_alvo', 'descricao', 'alcance_pct', 'publico_considerado', 'pertencimento',
    'valores', 'visao_explique', 'impacto', 'custo', 'tem_arrecadacao', 'arrecadacao_prevista',
  ];
  const patch = {};
  permitidos.forEach((c) => { if (req.body[c] !== undefined) patch[c] = req.body[c]; });
  const { data, error } = await supabase.from('plan_propostas').update(patch).eq('id', p.id).select().single();
  if (error) return res.status(400).json({ error: 'Não foi possível salvar a proposta' });
  res.json(data);
});

// ── Config de rotina (Compras/Reserva de Espaço) ────────────────────────
// Vive em tabela PRÓPRIA (plan_propostas_rotina_solicitacao), NUNCA em coluna
// de plan_propostas — as rotas de avaliação/decisão fazem select('*') na
// proposta e repassam a linha adiante; isolar aqui garante por construção
// que diretores e Pastor nunca veem esses campos. Só o próprio proponente
// (ou Pastor/super-admin) lê/edita.
router.get('/propostas/:id/config-rotina', authorizeModule(MOD, 1), async (req, res) => {
  const p = await carregarProposta(req.params.id);
  if (!p) return res.status(404).json({ error: 'Proposta não encontrada' });
  if (!proponenteIds(p).includes(req.user.id) && !(await ehPastorOuSuper(req))) {
    return res.status(403).json({ error: 'Só o proponente vê a configuração de rotina' });
  }
  const { data } = await supabase
    .from('plan_propostas_rotina_solicitacao').select('*').eq('proposta_id', p.id).maybeSingle();
  res.json(data || null);
});

router.put('/propostas/:id/config-rotina', authorizeModule(MOD, 2), async (req, res) => {
  const p = await carregarProposta(req.params.id);
  if (!p) return res.status(404).json({ error: 'Proposta não encontrada' });
  if (!proponenteIds(p).includes(req.user.id) && !(await ehPastorOuSuper(req))) {
    return res.status(403).json({ error: 'Só o proponente edita a configuração de rotina' });
  }
  if (p.natureza !== 'rotina') {
    return res.status(422).json({ error: 'Esta configuração só existe para propostas de natureza "rotina"' });
  }
  const categoria = req.body?.categoria;
  if (!['compras', 'reserva_espaco', 'outros'].includes(categoria)) {
    return res.status(400).json({ error: 'Categoria inválida (compras · reserva_espaco · outros)' });
  }
  const dados = categoria === 'outros' ? {} : (req.body?.dados && typeof req.body.dados === 'object' ? req.body.dados : {});
  const { data, error } = await supabase
    .from('plan_propostas_rotina_solicitacao')
    .upsert({ proposta_id: p.id, categoria, dados, ativo: true }, { onConflict: 'proposta_id' })
    .select().single();
  if (error) {
    console.error('[planejamento-anual] erro ao salvar config de rotina:', error.message);
    return res.status(400).json({ error: 'Não foi possível salvar a configuração de rotina' });
  }
  res.json(data);
});

// Enviar: valida a janela NO BACKEND (teste de aceitação 11)
router.post('/propostas/:id/enviar', authorizeModule(MOD, 2), async (req, res) => {
  const p = await carregarProposta(req.params.id);
  if (!p) return res.status(404).json({ error: 'Proposta não encontrada' });
  if (!proponenteIds(p).includes(req.user.id)) {
    return res.status(403).json({ error: 'Só o proponente envia a proposta' });
  }
  if (!PA.podeTransicionar(p.estado, 'enviada')) {
    return res.status(409).json({ error: `Proposta em "${p.estado}" não pode ser enviada` });
  }
  const ciclo = await carregarCiclo(p.ciclo_id);
  const erros = PA.validarEnvio(p, ciclo);
  if (erros.length) return res.status(422).json({ error: erros[0], erros });

  const { data, error } = await supabase.from('plan_propostas')
    .update({ estado: 'enviada', enviada_em: new Date().toISOString() })
    .eq('id', p.id).eq('estado', p.estado).select().single();
  if (error) return res.status(500).json({ error: 'Erro ao enviar a proposta' });

  const avaliadores = await carregarAvaliadores(p.ciclo_id);
  notificar({
    modulo: MOD,
    tipo: 'pa_proposta_enviada',
    titulo: 'Nova proposta para avaliar',
    mensagem: `"${p.nome}" entrou no ciclo de planejamento e aguarda a pontuação da sua diretoria.`,
    link: '/planejamento-anual',
    chaveDedup: `pa_enviada_${p.id}`,
    targetIds: avaliadores.map((a) => a.profile_id),
  }).catch(() => {});
  res.json(data);
});

// ── Avaliação (cega até o quórum) ────────────────────────────────────────
router.put('/propostas/:id/avaliacao', authorizeModule(MOD, 1), async (req, res) => {
  const p = await carregarProposta(req.params.id);
  if (!p) return res.status(404).json({ error: 'Proposta não encontrada' });
  const avaliadores = await carregarAvaliadores(p.ciclo_id);
  // A diretoria vem do ASSENTO do usuário, nunca do body (anti-tamper)
  const assento = avaliadores.find((a) => a.profile_id === req.user.id);
  if (!assento) return res.status(403).json({ error: 'Você não tem assento de avaliação neste ciclo' });

  const ciclo = await carregarCiclo(p.ciclo_id);
  if (!ciclo?.avaliacao_aberta) return res.status(409).json({ error: 'A janela de avaliação está fechada' });
  if (p.estado !== 'enviada') return res.status(409).json({ error: 'Esta proposta não está em avaliação' });

  const erros = PA.validarAvaliacao(req.body || {});
  if (erros.length) return res.status(422).json({ error: 'Os sete critérios são obrigatórios.', erros });

  const linha = {
    proposta_id: p.id,
    diretoria: assento.diretoria,
    avaliador_id: req.user.id,
    coment_criterios: req.body.coment_criterios || {},
    comentario_geral: req.body.comentario_geral || null,
    enviado_em: new Date().toISOString(),
  };
  PA.CRITERIOS.forEach((c) => { linha['nota_' + c.chave] = req.body['nota_' + c.chave]; });

  // Upsert manual (o UNIQUE é índice parcial · onConflict não cobre)
  const { data: existente } = await supabase
    .from('plan_avaliacoes').select('id')
    .eq('proposta_id', p.id).eq('diretoria', assento.diretoria).is('deleted_at', null)
    .maybeSingle();

  let error;
  if (existente) {
    ({ error } = await supabase.from('plan_avaliacoes').update(linha).eq('id', existente.id));
  } else {
    ({ error } = await supabase.from('plan_avaliacoes').insert(linha));
  }
  if (error) {
    console.error('[planejamento-anual] erro ao salvar avaliação:', error.message);
    return res.status(500).json({ error: 'Erro ao salvar a avaliação' });
  }

  const avs = await avaliacoesPorProposta([p.id]);
  const recebidas = (avs[p.id] || []).length;
  if (recebidas >= avaliadores.length) {
    notificar({
      modulo: MOD,
      tipo: 'pa_quorum_completo',
      titulo: 'Proposta pronta para decisão',
      mensagem: `As ${avaliadores.length} diretorias pontuaram "${p.nome}". A proposta entrou no ranking.`,
      link: '/planejamento-anual',
      chaveDedup: `pa_quorum_${p.id}_v${p.versao}`,
    }).catch(() => {});
  }
  res.json({ ok: true, avaliacoes_recebidas: recebidas, quorum: avaliadores.length });
});

// ── Ranking (painel de decisões · exclusivo do Pastor) ──────────────────
router.get('/ciclos/:id/ranking', authorizeModule(MOD, 1), async (req, res) => {
  if (!(await ehPastorOuSuper(req))) return res.status(403).json({ error: 'O ranking de decisão é exclusivo do Pastor presidente' });
  const avaliadores = await carregarAvaliadores(req.params.id);
  const { data: propostas } = await supabase
    .from('plan_propostas').select('*').eq('ciclo_id', req.params.id).is('deleted_at', null);
  const ids = (propostas || []).map((p) => p.id);
  const avs = await avaliacoesPorProposta(ids);
  const decs = await decisoesPorProposta(ids);
  const ranking = PA.montarRanking({
    propostas: propostas || [],
    avaliacoesPorProposta: avs,
    quorum: avaliadores.length,
    diretorias: avaliadores.map((a) => a.diretoria),
  });
  res.json({
    ...ranking,
    ranqueadas: ranking.ranqueadas.map((r) => ({
      ...r,
      situacao_decisao: PA.decisaoVigente(decs[r.proposta.id] || [])?.decisao || null,
      no_calendario: PA.noCalendario(r.proposta, decs[r.proposta.id] || []),
    })),
  });
});

// ── Decisões (exclusivas do Pastor · append-only por rodada) ────────────
async function aplicarDecisao({ proposta, corpo, pastorId }) {
  const tipo = corpo.decisao;
  if (!['aprovada', 'aprovada_ressalvas', 'reprovada', 'arquivada'].includes(tipo)) {
    return { erro: 'Decisão inválida' };
  }
  if (!PA.podeTransicionar(proposta.estado, tipo)) {
    return { erro: `Proposta em "${proposta.estado}" não aceita a decisão "${tipo}"` };
  }
  const hoje = hojeSaoPaulo();
  const linha = {
    proposta_id: proposta.id,
    rodada: proposta.versao, // 1 = original · 2 = pós-retificação (CHECK físico)
    decisao: tipo,
    decidido_por: pastorId,
  };
  if (tipo === 'aprovada_ressalvas') {
    if (!corpo.ressalva?.texto?.trim()) return { erro: 'Escreva a ressalva.' };
    if (!corpo.ressalva?.responsavel_id) return { erro: 'Ressalva exige um responsável.' };
    linha.ressalva_texto = corpo.ressalva.texto.trim();
    linha.ressalva_responsavel_id = corpo.ressalva.responsavel_id;
    linha.ressalva_prazo = corpo.ressalva.prazo || PA.somarDias(hoje, PA.SUPOSICOES.prazoDias);
  }
  if (tipo === 'reprovada') {
    if (!corpo.exigencia?.texto?.trim()) return { erro: 'Escreva a exigência.' };
    linha.exigencia_texto = corpo.exigencia.texto.trim();
    linha.exigencia_prazo = corpo.exigencia.prazo || PA.somarDias(hoje, PA.SUPOSICOES.prazoDias);
  }

  const { data: decisao, error: e1 } = await supabase.from('plan_decisoes').insert(linha).select().single();
  if (e1) {
    console.error('[planejamento-anual] erro ao registrar decisão:', e1.message);
    return { erro: 'Não foi possível registrar a decisão (já existe decisão ativa nesta rodada?)' };
  }

  const patch = { estado: tipo === 'arquivada' ? 'arquivada' : tipo };
  if (tipo === 'reprovada') patch.retificacao_prazo = linha.exigencia_prazo;
  const { error: e2 } = await supabase.from('plan_propostas').update(patch).eq('id', proposta.id);
  if (e2) {
    // compensação best-effort: revoga a decisão órfã pra não travar a rodada
    await supabase.from('plan_decisoes')
      .update({ revogada_em: new Date().toISOString(), revogada_por: pastorId })
      .eq('id', decisao.id);
    return { erro: 'Erro ao atualizar o estado da proposta · decisão desfeita' };
  }

  // Rotina de Reserva de Espaço · geração ÚNICA, no momento em que a decisão
  // aprova a proposta (nunca por cron — é uma reserva permanente, não um
  // pedido novo a cada ciclo · ver services/planejamentoAnualSolicitacoes.js).
  // Best-effort: falha aqui não pode desfazer uma decisão já registrada.
  if (['aprovada', 'aprovada_ressalvas'].includes(tipo) && proposta.natureza === 'rotina') {
    try {
      const { data: cfg } = await supabase
        .from('plan_propostas_rotina_solicitacao').select('*')
        .eq('proposta_id', proposta.id).eq('categoria', 'reserva_espaco').eq('ativo', true)
        .is('ultima_geracao_em', null).maybeSingle();
      if (cfg) {
        const r = await criarSolicitacaoRotina({ proposta, categoria: 'reserva_espaco', dados: cfg.dados || {} });
        if (r.solicitacao) {
          await supabase.from('plan_propostas_rotina_solicitacao')
            .update({ ultima_geracao_em: new Date().toISOString(), ativo: false })
            .eq('id', cfg.id);
        } else if (r.erro) {
          console.error('[planejamento-anual] rotina reserva_espaco não gerada:', r.erro);
        }
      }
    } catch (e) {
      console.error('[planejamento-anual] exceção ao gerar rotina de reserva de espaço:', e.message);
    }
  }

  return { decisao };
}

router.post('/propostas/:id/decisao', authorizeModule(MOD, 1), async (req, res) => {
  if (!(await ehPastorOuSuper(req))) return res.status(403).json({ error: 'Decidir é exclusivo do Pastor presidente' });
  const p = await carregarProposta(req.params.id);
  if (!p) return res.status(404).json({ error: 'Proposta não encontrada' });

  // Quórum é pré-condição da decisão (sem dispensa de voto)
  const avaliadores = await carregarAvaliadores(p.ciclo_id);
  const avs = await avaliacoesPorProposta([p.id]);
  if (p.estado === 'enviada' && (avs[p.id] || []).length < avaliadores.length) {
    return res.status(409).json({ error: 'Proposta sem quórum de avaliação não pode ser decidida' });
  }

  const r = await aplicarDecisao({ proposta: p, corpo: req.body || {}, pastorId: req.user.id });
  if (r.erro) return res.status(422).json({ error: r.erro });

  notificar({
    modulo: MOD,
    tipo: 'pa_decisao',
    titulo: 'Sua proposta recebeu uma decisão',
    mensagem: `"${p.nome}": ${req.body.decisao === 'aprovada' ? 'aprovada' : req.body.decisao === 'aprovada_ressalvas' ? 'aprovada com ressalvas' : req.body.decisao === 'reprovada' ? 'devolvida com exigência (você tem uma rodada e cinco dias)' : 'arquivada'}.`,
    link: '/planejamento-anual',
    chaveDedup: `pa_decisao_${p.id}_r${p.versao}`,
    targetIds: proponenteIds(p),
  }).catch(() => {});
  res.json(r.decisao);
});

// Lote: aprovar várias · reprovar várias com a MESMA exigência (spec)
router.post('/ciclos/:id/decisoes-lote', authorizeModule(MOD, 1), async (req, res) => {
  if (!(await ehPastorOuSuper(req))) return res.status(403).json({ error: 'Decidir é exclusivo do Pastor presidente' });
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  const tipo = req.body?.decisao;
  if (!ids.length || !['aprovada', 'reprovada'].includes(tipo)) {
    return res.status(400).json({ error: 'Informe ids e a decisão (aprovada|reprovada)' });
  }
  if (tipo === 'reprovada' && !req.body?.exigencia?.texto?.trim()) {
    return res.status(422).json({ error: 'Escreva a exigência (será aplicada a todas as marcadas).' });
  }
  const avaliadoresPorCiclo = await carregarAvaliadores(req.params.id);
  const resultados = [];
  for (const id of ids) {
    const p = await carregarProposta(id);
    if (!p || p.ciclo_id !== req.params.id) { resultados.push({ id, ok: false, erro: 'não encontrada' }); continue; }
    const avs = await avaliacoesPorProposta([p.id]);
    if (p.estado === 'enviada' && (avs[p.id] || []).length < avaliadoresPorCiclo.length) {
      resultados.push({ id, ok: false, erro: 'sem quórum' });
      continue;
    }
    const r = await aplicarDecisao({ proposta: p, corpo: { decisao: tipo, exigencia: req.body.exigencia }, pastorId: req.user.id });
    resultados.push({ id, ok: !r.erro, erro: r.erro });
    if (!r.erro) {
      notificar({
        modulo: MOD, tipo: 'pa_decisao', titulo: 'Sua proposta recebeu uma decisão',
        mensagem: `"${p.nome}": ${tipo === 'aprovada' ? 'aprovada' : 'devolvida com exigência (você tem uma rodada e cinco dias)'}.`,
        link: '/planejamento-anual', chaveDedup: `pa_decisao_${p.id}_r${p.versao}`, targetIds: proponenteIds(p),
      }).catch(() => {});
    }
  }
  res.json({ resultados });
});

// Ressalva: verificar / reabrir (Pastor)
router.post('/propostas/:id/ressalva/verificar', authorizeModule(MOD, 1), async (req, res) => {
  if (!(await ehPastorOuSuper(req))) return res.status(403).json({ error: 'Gerir ressalvas é exclusivo do Pastor presidente' });
  const p = await carregarProposta(req.params.id);
  if (!p || p.estado !== 'aprovada_ressalvas') return res.status(409).json({ error: 'Proposta não está aprovada com ressalvas' });
  const decs = await decisoesPorProposta([p.id]);
  const vigente = PA.decisaoVigente(decs[p.id] || []);
  if (!vigente || vigente.decisao !== 'aprovada_ressalvas') return res.status(409).json({ error: 'Sem ressalva vigente' });
  const { error } = await supabase.from('plan_decisoes')
    .update({ ressalva_cumprida_em: new Date().toISOString(), ressalva_verificada_por: req.user.id })
    .eq('id', vigente.id);
  if (error) return res.status(500).json({ error: 'Erro ao verificar a ressalva' });
  res.json({ ok: true });
});

router.post('/propostas/:id/ressalva/reabrir', authorizeModule(MOD, 1), async (req, res) => {
  if (!(await ehPastorOuSuper(req))) return res.status(403).json({ error: 'Gerir ressalvas é exclusivo do Pastor presidente' });
  const decs = await decisoesPorProposta([req.params.id]);
  const vigente = PA.decisaoVigente(decs[req.params.id] || []);
  if (!vigente || vigente.decisao !== 'aprovada_ressalvas') return res.status(409).json({ error: 'Sem ressalva vigente' });
  const { error } = await supabase.from('plan_decisoes')
    .update({ ressalva_cumprida_em: null, ressalva_verificada_por: null })
    .eq('id', vigente.id);
  if (error) return res.status(500).json({ error: 'Erro ao reabrir a ressalva' });
  res.json({ ok: true });
});

// Retirar do calendário: revoga a decisão vigente · volta ao ranking
router.post('/propostas/:id/retirar', authorizeModule(MOD, 1), async (req, res) => {
  if (!(await ehPastorOuSuper(req))) return res.status(403).json({ error: 'Retirar do calendário é exclusivo do Pastor presidente' });
  const p = await carregarProposta(req.params.id);
  if (!p || !PA.podeTransicionar(p.estado, 'enviada')) {
    return res.status(409).json({ error: 'Esta proposta não está no calendário' });
  }
  const decs = await decisoesPorProposta([p.id]);
  const vigente = PA.decisaoVigente(decs[p.id] || []);
  if (vigente) {
    await supabase.from('plan_decisoes')
      .update({ revogada_em: new Date().toISOString(), revogada_por: req.user.id })
      .eq('id', vigente.id);
  }
  const { error } = await supabase.from('plan_propostas').update({ estado: 'enviada' }).eq('id', p.id);
  if (error) return res.status(500).json({ error: 'Erro ao retirar a proposta' });
  res.json({ ok: true });
});

// ── Retificação (1 rodada de 5 dias · proponente) ────────────────────────
router.post('/propostas/:id/retificar', authorizeModule(MOD, 2), async (req, res) => {
  const p = await carregarProposta(req.params.id);
  if (!p) return res.status(404).json({ error: 'Proposta não encontrada' });
  if (!proponenteIds(p).includes(req.user.id)) {
    return res.status(403).json({ error: 'Só o proponente retifica a proposta' });
  }
  const erros = PA.validarRetificacao(p, hojeSaoPaulo());
  if (erros.length) return res.status(422).json({ error: erros[0], erros });

  const permitidos = [
    'nome', 'data_inicio', 'precisao_inicio', 'multi_dia', 'data_fim', 'precisao_fim',
    'recorrencia', 'dia_semana', 'hora_inicio', 'hora_fim', 'local_id',
    'locais_adicionais_ids', 'local_fora_detalhe', 'publico_alvo',
    'descricao', 'alcance_pct', 'publico_considerado', 'pertencimento', 'valores',
    'visao_explique', 'impacto', 'custo', 'tem_arrecadacao', 'arrecadacao_prevista',
  ];
  const patch = {
    versao: 2,
    versao_anterior: PA.snapshotRetificacao(p), // congela os 8 campos do diff
    retificada_em: new Date().toISOString(),
    estado: 'retificada',
  };
  permitidos.forEach((c) => { if (req.body[c] !== undefined) patch[c] = req.body[c]; });

  const { data, error } = await supabase.from('plan_propostas')
    .update(patch).eq('id', p.id).eq('versao', 1).select().single();
  if (error) return res.status(409).json({ error: 'Não foi possível retificar (rodada já usada?)' });

  notificar({
    modulo: MOD, tipo: 'pa_retificada',
    titulo: 'Proposta retificada aguarda sua reavaliação',
    mensagem: `"${p.nome}" foi retificada pelo proponente. Você reavalia sozinho, com as notas da versão anterior.`,
    link: '/planejamento-anual',
    chaveDedup: `pa_retificada_${p.id}`,
  }).catch(() => {});
  res.json(data);
});

// Decisão pós-retificação: aprovar / ressalvas / arquivar / reabrir pros diretores
router.post('/propostas/:id/decisao-retificacao', authorizeModule(MOD, 1), async (req, res) => {
  if (!(await ehPastorOuSuper(req))) return res.status(403).json({ error: 'Reavaliar retificação é exclusivo do Pastor presidente' });
  const p = await carregarProposta(req.params.id);
  if (!p || p.estado !== 'retificada') return res.status(409).json({ error: 'Proposta não está retificada' });

  const tipo = req.body?.decisao;

  if (tipo === 'reaberta_diretores') {
    // Apaga as 4 notas (soft · rastro no audit) e devolve ao painel das diretorias
    const agora = new Date().toISOString();
    await supabase.from('plan_avaliacoes')
      .update({ deleted_at: agora })
      .eq('proposta_id', p.id).is('deleted_at', null);
    const decs = await decisoesPorProposta([p.id]);
    for (const d of (decs[p.id] || []).filter((x) => !x.revogada_em)) {
      await supabase.from('plan_decisoes')
        .update({ revogada_em: agora, revogada_por: req.user.id }).eq('id', d.id);
    }
    const { error } = await supabase.from('plan_propostas').update({ estado: 'enviada' }).eq('id', p.id);
    if (error) return res.status(500).json({ error: 'Erro ao reabrir a avaliação' });
    const avaliadores = await carregarAvaliadores(p.ciclo_id);
    notificar({
      modulo: MOD, tipo: 'pa_reaberta',
      titulo: 'Proposta reaberta para nova avaliação',
      mensagem: `O Pastor reabriu "${p.nome}" · as notas anteriores foram apagadas e a proposta voltou ao painel de avaliação.`,
      link: '/planejamento-anual',
      chaveDedup: `pa_reaberta_${p.id}`,
      targetIds: avaliadores.map((a) => a.profile_id),
    }).catch(() => {});
    return res.json({ ok: true, estado: 'enviada' });
  }

  if (tipo === 'reprovada') {
    // Pós-retificação não existe nova devolução: reprovar em definitivo arquiva
    req.body.decisao = 'arquivada';
  }
  const r = await aplicarDecisao({ proposta: p, corpo: req.body || {}, pastorId: req.user.id });
  if (r.erro) return res.status(422).json({ error: r.erro });
  notificar({
    modulo: MOD, tipo: 'pa_decisao', titulo: 'Sua proposta retificada recebeu a decisão final',
    mensagem: `"${p.nome}": ${req.body.decisao === 'aprovada' ? 'aprovada' : req.body.decisao === 'aprovada_ressalvas' ? 'aprovada com ressalvas' : 'arquivada em definitivo'}.`,
    link: '/planejamento-anual', chaveDedup: `pa_decisao_${p.id}_r2`, targetIds: proponenteIds(p),
  }).catch(() => {});
  res.json(r.decisao);
});

// ── Apontamentos (Pastor → proponente) ───────────────────────────────────
router.post('/propostas/:id/apontamentos', authorizeModule(MOD, 1), async (req, res) => {
  if (!(await ehPastorOuSuper(req))) return res.status(403).json({ error: 'Apontar respostas é prerrogativa do Pastor presidente' });
  const campo = req.body?.campo;
  const texto = (req.body?.texto || '').trim();
  if (!PA.CAMPOS_APONTAVEIS.some((c) => c.chave === campo)) return res.status(400).json({ error: 'Campo inválido' });
  if (!texto) return res.status(422).json({ error: 'Escreva o apontamento.' });
  const { data, error } = await supabase.from('plan_apontamentos')
    .insert({ proposta_id: req.params.id, campo, texto, criado_por: req.user.id })
    .select().single();
  if (error) return res.status(400).json({ error: 'Não foi possível criar o apontamento' });
  const p = await carregarProposta(req.params.id);
  if (p) {
    notificar({
      modulo: MOD, tipo: 'pa_apontamento', titulo: 'Novo apontamento na sua proposta',
      mensagem: `O Pastor apontou o campo "${PA.CAMPOS_APONTAVEIS.find((c) => c.chave === campo).rotulo}" em "${p.nome}".`,
      link: '/planejamento-anual', chaveDedup: `pa_apont_${data.id}`, targetIds: proponenteIds(p),
    }).catch(() => {});
  }
  res.status(201).json(data);
});

// ── Apontamento do Pastor sobre custo/recorrência/data (2026-09-18) ─────
// Distinto de /apontamentos (que é um comentário/observação sobre um
// campo apontável genérico): este é o valor NUMÉRICO/estruturado que
// substitui custo/recorrência/data para o cálculo do orçamento "aprovadas
// em tempo real" (ver planejamentoAnualRegras.distribuirCustoPorMes).
// `valor: null` limpa o apontamento daquele campo (volta ao original) —
// cobre o caso de "remover apontamento" sem precisar de rota DELETE.
const CAMPOS_APONTAMENTO_PASTOR = ['custo', 'recorrencia', 'data'];
router.put('/propostas/:id/apontamento-pastor', authorizeModule(MOD, 1), async (req, res) => {
  if (!(await ehPastorOuSuper(req))) return res.status(403).json({ error: 'Apontar custo/recorrência/data é prerrogativa do Pastor presidente' });
  const p = await carregarProposta(req.params.id);
  if (!p) return res.status(404).json({ error: 'Proposta não encontrada' });
  const campo = req.body?.campo;
  if (!CAMPOS_APONTAMENTO_PASTOR.includes(campo)) {
    return res.status(400).json({ error: 'Campo inválido (use custo, recorrencia ou data)' });
  }
  const valor = req.body?.valor === undefined ? null : req.body.valor;
  const patch = { apontamento_pastor_em: new Date().toISOString(), apontamento_pastor_por: req.user.id };
  if (campo === 'custo') {
    if (valor !== null && (Number.isNaN(Number(valor)) || Number(valor) < 0)) {
      return res.status(422).json({ error: 'Custo apontado inválido' });
    }
    patch.custo_apontado = valor === null ? null : Number(valor);
  } else if (campo === 'recorrencia') {
    const validas = ['unica', 'diaria', 'semanal', 'mensal', 'trimestral', 'semestral', 'personalizada'];
    if (valor !== null && !validas.includes(valor)) {
      return res.status(422).json({ error: 'Recorrência apontada inválida' });
    }
    patch.recorrencia_apontada = valor;
    // dia_semana só faz sentido para recorrências semanais/diárias — aceito
    // junto quando o campo permite, senão limpa.
    if (valor === null) {
      patch.dia_semana_apontado = null;
    } else if (req.body.dia_semana !== undefined) {
      const ds = req.body.dia_semana === null ? null : Number(req.body.dia_semana);
      if (ds !== null && (Number.isNaN(ds) || ds < 0 || ds > 6)) {
        return res.status(422).json({ error: 'Dia da semana apontado inválido (0-6)' });
      }
      patch.dia_semana_apontado = ds;
    }
  } else if (campo === 'data') {
    if (valor !== null && !/^\d{4}-\d{2}-\d{2}$/.test(String(valor))) {
      return res.status(422).json({ error: 'Data apontada inválida (YYYY-MM-DD)' });
    }
    patch.data_inicio_apontada = valor;
    patch.precisao_inicio_apontada = valor === null ? null : (req.body.precisao || 'dia');
  }
  const { data, error } = await supabase.from('plan_propostas').update(patch).eq('id', p.id).select().single();
  if (error) return res.status(500).json({ error: 'Erro ao gravar o apontamento' });
  res.json(data);
});

router.delete('/apontamentos/:id', authorizeModule(MOD, 1), async (req, res) => {
  if (!(await ehPastorOuSuper(req))) return res.status(403).json({ error: 'Remover apontamento é prerrogativa do Pastor presidente' });
  const { error } = await supabase.from('plan_apontamentos')
    .update({ deleted_at: new Date().toISOString() }).eq('id', req.params.id);
  if (error) return res.status(500).json({ error: 'Erro ao remover o apontamento' });
  res.json({ ok: true });
});

// ── Conflitos e calendário ───────────────────────────────────────────────
async function contextoCalendario(cicloId) {
  const [{ porId: locaisById }, avaliadores] = await Promise.all([carregarLocais(), carregarAvaliadores(cicloId)]);
  const { data: propostas } = await supabase
    .from('plan_propostas').select('*').eq('ciclo_id', cicloId).is('deleted_at', null);
  const ids = (propostas || []).map((p) => p.id);
  const [avs, decs, { data: aceites }] = await Promise.all([
    avaliacoesPorProposta(ids),
    decisoesPorProposta(ids),
    supabase.from('plan_conflitos_aceitos').select('*').eq('ciclo_id', cicloId),
  ]);
  return { locaisById, avaliadores, propostas: propostas || [], avs, decs, aceites: aceites || [] };
}

router.get('/ciclos/:id/conflitos', authorizeModule(MOD, 1), async (req, res) => {
  const ctx = await contextoCalendario(req.params.id);
  const emCalendario = ctx.propostas.filter((p) => PA.noCalendario(p, ctx.decs[p.id] || []));
  const conflitos = PA.aplicarAceites(PA.detectarConflitos(emCalendario, ctx.locaisById), ctx.aceites);
  res.json(conflitos.map((c) => ({
    proposta_a: { id: c.a.id, nome: c.a.nome, natureza: c.a.natureza },
    proposta_b: { id: c.b.id, nome: c.b.nome, natureza: c.b.natureza },
    tipo: c.tipo,
    firme: c.firme,
    aceite: c.aceite ? { id: c.aceite.id, justificativa: c.aceite.justificativa, aceito_em: c.aceite.aceito_em } : null,
  })));
});

router.post('/ciclos/:id/conflitos/aceitar', authorizeModule(MOD, 1), async (req, res) => {
  if (!(await ehPastorOuSuper(req))) return res.status(403).json({ error: 'Aceitar conflito é exclusivo do Pastor presidente' });
  const justificativa = (req.body?.justificativa || '').trim();
  if (justificativa.length < 5) return res.status(422).json({ error: 'Por que esta coincidência é tolerável? (justificativa obrigatória)' });
  const [a, b] = [req.body?.proposta_a, req.body?.proposta_b].sort();
  const { data, error } = await supabase.from('plan_conflitos_aceitos')
    .insert({ ciclo_id: req.params.id, proposta_a: a, proposta_b: b, tipo: req.body?.tipo, justificativa, aceito_por: req.user.id })
    .select().single();
  if (error) return res.status(400).json({ error: 'Não foi possível aceitar (já aceito?)' });
  res.status(201).json(data);
});

router.delete('/ciclos/:id/conflitos/aceites/:aceiteId', authorizeModule(MOD, 1), async (req, res) => {
  if (!(await ehPastorOuSuper(req))) return res.status(403).json({ error: 'Reabrir conflito é exclusivo do Pastor presidente' });
  const { error } = await supabase.from('plan_conflitos_aceitos')
    .delete().eq('id', req.params.aceiteId).eq('ciclo_id', req.params.id);
  if (error) return res.status(500).json({ error: 'Erro ao reabrir o conflito' });
  res.json({ ok: true });
});

// Insights de IA (aba somente-leitura): conflitos de data/espaço (régua
// pura, sem IA) + propostas parecidas/candidatas a mesclar (Claude Haiku,
// best-effort). Mesma régua de visibilidade de CONTEÚDO das propostas
// (decisão do Diego 2026-08-27): proponente vê a própria, mas esta aba
// cruza propostas de todo o ciclo — só diretoria/Pastor/super-admin.
router.get('/ciclos/:id/insights', authorizeModule(MOD, 1), async (req, res) => {
  const ciclo = await carregarCiclo(req.params.id);
  if (!ciclo) return res.status(404).json({ error: 'Ciclo não encontrado' });
  if (!(ehDiretoria(req) || await ehPastorOuSuper(req))) {
    return res.status(403).json({ error: 'Os insights de IA são visíveis só para a diretoria e o Pastor presidente' });
  }
  try {
    const ctx = await contextoCalendario(ciclo.id);
    const insights = await PAInsights.montarInsights(ctx);
    res.json(insights);
  } catch (e) {
    console.error('[planejamento-anual] erro ao montar insights:', e.message);
    res.status(500).json({ error: 'Erro ao montar os insights' });
  }
});

const CAMPOS_DIVERGENCIA = ['data_inicio', 'precisao_inicio', 'hora_inicio', 'hora_fim', 'recorrencia', 'dia_semana'];

router.get('/ciclos/:id/calendario', authorizeModule(MOD, 1), async (req, res) => {
  const ciclo = await carregarCiclo(req.params.id);
  if (!ciclo) return res.status(404).json({ error: 'Ciclo não encontrado' });
  const ctx = await contextoCalendario(ciclo.id);
  const { porId: locaisById } = { porId: ctx.locaisById };

  const emCalendario = ctx.propostas.filter((p) => PA.noCalendario(p, ctx.decs[p.id] || []));
  const conflitos = PA.aplicarAceites(PA.detectarConflitos(emCalendario, locaisById), ctx.aceites);

  // Definitivo: snapshot da versão vigente + detecção de divergência
  let definitivo = null;
  if (ciclo.publicacao_versao > 0) {
    const { data: itens } = await supabase
      .from('plan_calendario_itens').select('*')
      .eq('ciclo_id', ciclo.id).eq('publicacao_versao', ciclo.publicacao_versao);
    const vivasPorId = {};
    emCalendario.forEach((p) => { vivasPorId[p.id] = p; });
    const divergencias = [];
    (itens || []).forEach((item) => {
      const atual = vivasPorId[item.proposta_id];
      if (!atual) { divergencias.push({ nome: item.nome, tipo: 'saiu_do_calendario' }); return; }
      const mudou = CAMPOS_DIVERGENCIA.some((c) => String(item[c] ?? '') !== String(atual[c] ?? ''))
        || item.local_nome !== (locaisById[atual.local_id]?.nome || item.local_nome);
      if (mudou) divergencias.push({ nome: item.nome, tipo: 'alterada' });
      delete vivasPorId[item.proposta_id];
    });
    Object.values(vivasPorId).forEach((p) => divergencias.push({ nome: p.nome, tipo: 'aprovada_depois' }));
    definitivo = { itens: itens || [], publicado_em: ciclo.publicado_em, versao: ciclo.publicacao_versao, divergencias };
  }

  res.json({
    planejamento: {
      itens: emCalendario.map((p) => ({
        ...p,
        local_nome: locaisById[p.local_id]?.nome || null,
        liquido: PA.liquido(p),
      })),
      conflitos: conflitos.map((c) => ({
        proposta_a: { id: c.a.id, nome: c.a.nome }, proposta_b: { id: c.b.id, nome: c.b.nome },
        tipo: c.tipo, firme: c.firme, aceito: Boolean(c.aceite),
      })),
    },
    definitivo,
  });
});

// Remanejar (Pastor · mesma mudança vale pro calendário e pro orçamento)
router.put('/propostas/:id/remanejar', authorizeModule(MOD, 1), async (req, res) => {
  if (!(await ehPastorOuSuper(req))) return res.status(403).json({ error: 'Remanejar é exclusivo do Pastor presidente' });
  const p = await carregarProposta(req.params.id);
  if (!p) return res.status(404).json({ error: 'Proposta não encontrada' });
  const permitidos = ['data_inicio', 'precisao_inicio', 'multi_dia', 'data_fim', 'precisao_fim', 'recorrencia', 'dia_semana', 'hora_inicio', 'hora_fim', 'local_id'];
  const patch = {};
  permitidos.forEach((c) => { if (req.body[c] !== undefined) patch[c] = req.body[c]; });
  if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nada a remanejar' });
  const { data, error } = await supabase.from('plan_propostas').update(patch).eq('id', p.id).select().single();
  if (error) return res.status(400).json({ error: 'Não foi possível remanejar' });
  res.json(data);
});

// ── Travas e publicação ──────────────────────────────────────────────────
router.get('/ciclos/:id/travas', authorizeModule(MOD, 1), async (req, res) => {
  if (!(await ehPastorOuSuper(req))) return res.status(403).json({ error: 'Publicação é exclusiva do Pastor presidente' });
  const ctx = await contextoCalendario(req.params.id);
  const travas = PA.validarTravas({
    propostas: ctx.propostas,
    avaliacoesPorProposta: ctx.avs,
    decisoesPorProposta: ctx.decs,
    quorum: ctx.avaliadores.length,
    locaisById: ctx.locaisById,
    aceites: ctx.aceites,
  });
  res.json({
    bloqueada: travas.bloqueada,
    motivos: travas.motivos,
    itens_no_calendario: travas.detalhe.itensCalendario.length,
    conflitos_aceitos: ctx.aceites.length,
  });
});

router.post('/ciclos/:id/publicar', authorizeModule(MOD, 1), async (req, res) => {
  if (!(await ehPastorOuSuper(req))) return res.status(403).json({ error: 'Publicar o calendário é exclusivo do Pastor presidente' });
  // Pré-checagem amigável (a RPC re-verifica DENTRO da transação · anti-TOCTOU)
  const ctx = await contextoCalendario(req.params.id);
  const travas = PA.validarTravas({
    propostas: ctx.propostas,
    avaliacoesPorProposta: ctx.avs,
    decisoesPorProposta: ctx.decs,
    quorum: ctx.avaliadores.length,
    locaisById: ctx.locaisById,
    aceites: ctx.aceites,
  });
  if (travas.bloqueada) {
    return res.status(409).json({ error: 'A publicação está bloqueada', motivos: travas.motivos });
  }
  const { data, error } = await supabase.rpc('fn_plan_publicar_ciclo', {
    p_ciclo_id: req.params.id,
    p_publicado_por: req.user.id,
  });
  if (error) {
    console.error('[planejamento-anual] publicação bloqueada/falhou:', error.message);
    return res.status(409).json({ error: 'A publicação foi bloqueada na verificação final', detalhe: error.message });
  }
  notificar({
    modulo: MOD, tipo: 'pa_publicado', titulo: 'Calendário do ciclo publicado',
    mensagem: `O calendário definitivo foi publicado (versão ${data?.versao}, ${data?.itens} itens).`,
    link: '/planejamento-anual', chaveDedup: `pa_publicado_${req.params.id}_v${data?.versao}`,
  }).catch(() => {});
  res.json(data);
});

// ── Orçamento do ciclo ───────────────────────────────────────────────────
// ⚠️ 2026-09-18: acesso ao orçamento é DECOUPLED do assento de avaliador de
// notas (migration `20260918130000`). Antes as duas coisas eram o MESMO
// assento em `plan_ciclo_avaliadores` (diretoria='financeiro') — foi assim
// que o Pr. Pedro Junior acabou preso a avaliar notas só por compor o
// orçamento. Hoje: `assentoFinanceiro` segue valendo (se um dia a diretoria
// Financeiro tiver avaliador de novo, ele também compõe o orçamento por
// tabela), mas quem realmente autoriza é `plan_orcamento_responsaveis`.
async function assentoFinanceiro(req, cicloId) {
  const avaliadores = await carregarAvaliadores(cicloId);
  return avaliadores.find((a) => a.diretoria === 'financeiro' && a.profile_id === req.user.id) || null;
}

async function ehResponsavelOrcamento(req, cicloId) {
  const { data } = await supabase
    .from('plan_orcamento_responsaveis')
    .select('id').eq('ciclo_id', cicloId).eq('profile_id', req.user.id).maybeSingle();
  return Boolean(data);
}

async function podeCompoOrcamento(req, cicloId) {
  if (await assentoFinanceiro(req, cicloId)) return true;
  return ehResponsavelOrcamento(req, cicloId);
}

router.get('/ciclos/:id/orcamento', authorizeModule(MOD, 1), async (req, res) => {
  const pode = await podeCompoOrcamento(req, req.params.id);
  if (!pode && !(await ehPastorOuSuper(req))) {
    return res.status(403).json({ error: 'O orçamento do ciclo é preenchido pela diretoria Financeira e avaliado pelo Pastor presidente.' });
  }
  const [{ data: header }, { data: valores }] = await Promise.all([
    supabase.from('plan_orcamentos').select('*').eq('ciclo_id', req.params.id).maybeSingle(),
    supabase.from('plan_orcamento_valores').select('linha, mes, valor').eq('ciclo_id', req.params.id),
  ]);
  res.json({
    header: header || null,
    valores: valores || [],
    caixa_livre: PA.caixaLivreMensal(valores || []),
    linhas: PA.LINHAS_ORCAMENTO,
  });
});

router.put('/ciclos/:id/orcamento', authorizeModule(MOD, 1), async (req, res) => {
  if (!(await podeCompoOrcamento(req, req.params.id))) {
    return res.status(403).json({ error: 'Só a diretoria Financeira compõe o orçamento do ciclo' });
  }

  const valores = Array.isArray(req.body?.valores) ? req.body.valores : [];
  for (const v of valores) {
    if (!PA.LINHAS_ORCAMENTO.includes(v.linha) || !(v.mes >= 1 && v.mes <= 12)) {
      return res.status(422).json({ error: `Linha/mês inválido: ${v.linha}/${v.mes}` });
    }
  }
  const { error: e1 } = await supabase.from('plan_orcamentos').upsert({
    ciclo_id: req.params.id,
    obs: req.body?.obs ?? null,
    premissas: Array.isArray(req.body?.premissas) ? req.body.premissas : [],
  }, { onConflict: 'ciclo_id' });
  if (e1) return res.status(500).json({ error: 'Erro ao salvar o orçamento' });

  for (const v of valores) {
    await supabase.from('plan_orcamento_valores').upsert({
      ciclo_id: req.params.id, linha: v.linha, mes: v.mes, valor: Number(v.valor) || 0,
    }, { onConflict: 'ciclo_id,linha,mes' });
  }
  const { data: atuais } = await supabase.from('plan_orcamento_valores')
    .select('linha, mes, valor').eq('ciclo_id', req.params.id);
  res.json({ ok: true, caixa_livre: PA.caixaLivreMensal(atuais || []) });
});

router.post('/ciclos/:id/orcamento/enviar', authorizeModule(MOD, 1), async (req, res) => {
  if (!(await podeCompoOrcamento(req, req.params.id))) {
    return res.status(403).json({ error: 'Só a diretoria Financeira envia o orçamento ao Pastor' });
  }
  const { error } = await supabase.from('plan_orcamentos').upsert({
    ciclo_id: req.params.id,
    enviado_em: new Date().toISOString(),
    enviado_por: req.user.id,
  }, { onConflict: 'ciclo_id' });
  if (error) return res.status(500).json({ error: 'Erro ao enviar o orçamento' });
  notificar({
    modulo: MOD, tipo: 'pa_orcamento', titulo: 'Orçamento do ciclo enviado',
    mensagem: 'A diretoria Financeira enviou (ou reenviou) o orçamento do ciclo para sua referência de decisão.',
    link: '/planejamento-anual', chaveDedup: `pa_orcamento_${req.params.id}_${hojeSaoPaulo()}`,
  }).catch(() => {});
  res.json({ ok: true });
});

// Visão orçamentária do Pastor (+ simulação de 1 proposta isolada)
router.get('/ciclos/:id/orcamento/pastor', authorizeModule(MOD, 1), async (req, res) => {
  if (!(await ehPastorOuSuper(req))) return res.status(403).json({ error: 'Esta visão é exclusiva do Pastor presidente' });
  const [{ data: header }, { data: valores }] = await Promise.all([
    supabase.from('plan_orcamentos').select('*').eq('ciclo_id', req.params.id).maybeSingle(),
    supabase.from('plan_orcamento_valores').select('linha, mes, valor').eq('ciclo_id', req.params.id),
  ]);
  const semOrcamento = !header?.enviado_em;
  // 2026-09-18: sem orçamento enviado pelo Financeiro NÃO bloqueia mais a
  // tela inteira — só a linha "caixa livre" (e o saldo, que depende dela)
  // ficam ausentes. "Todas as propostas" e "aprovado em tempo real" são
  // deriváveis das próprias propostas do ciclo, sem depender do Financeiro.
  const ctx = await contextoCalendario(req.params.id);
  const caixa = semOrcamento ? null : PA.caixaLivreMensal(valores || []);

  let propostas = ctx.propostas;
  const simular = req.query.simular; // efeito de UMA proposta isolada (tela de decisão)
  if (simular) {
    propostas = ctx.propostas.filter((p) => {
      const pendente = p.estado === 'enviada';
      return !pendente || p.id === simular;
    });
  }
  const visao = PA.orcamentoDoPastor({
    propostas,
    avaliacoesPorProposta: ctx.avs,
    decisoesPorProposta: ctx.decs,
    quorum: ctx.avaliadores.length,
    caixaLivre: caixa,
  });
  // 2026-09-18: "comprometido" passa a refletir os apontamentos do Pastor
  // (custoMensalAprovadas usa valorEfetivoProposta) — antes era o rateio
  // simples sem considerar apontamento. "todas_propostas" é a linha nova,
  // imutável (NUNCA usa apontamento), com todas as propostas do funil.
  const comprometidoComApontamento = PA.custoMensalAprovadas(visao.aprovadas);
  // A simulação de UMA proposta isolada (query `simular`) preserva o
  // comportamento existente: `propostas` já foi filtrado acima para
  // conter só a proposta simulada + as já aprovadas.
  const todasPropostas = PA.custoMensalTodasPropostas(ctx.propostas);
  res.json({
    sem_orcamento: semOrcamento,
    mensagem: semOrcamento
      ? 'A diretoria Financeira ainda não enviou o orçamento do ciclo. Sem ele, não há referência de caixa livre — mas as linhas de "todas as propostas" e "aprovado em tempo real" abaixo já refletem os dados do ciclo.'
      : null,
    caixa_livre: caixa, // null quando sem_orcamento
    comprometido: comprometidoComApontamento,
    todas_propostas: todasPropostas,
    propostos: visao.propostos,
    saldo: semOrcamento ? null : visao.saldo, // sem caixa livre, "saldo" mentiria
    meses_negativos: semOrcamento ? null : visao.mesesNegativos,
    enviado_por: header?.enviado_por || null,
    enviado_em: header?.enviado_em || null,
    premissas: header?.premissas || [],
    obs: header?.obs || null,
    itens: visao.aprovadas.map((p) => ({ id: p.id, nome: p.nome, rateio: PA.distribuirCustoPorMes(p, { usarApontamento: true }) })),
    pendentes: visao.pendentes.map((p) => ({ id: p.id, nome: p.nome, rateio: PA.rateioMensal(p) })),
  });
});

// =====================================================================
// ── Execução do Planejamento (2026-09-23) ───────────────────────────────
// =====================================================================
// Módulo novo, unificando Eventos/Projetos/Rotinas nascidos do ciclo de
// propostas. routeKey PRÓPRIO no ROUTE_MODULE_MAP ('planejamento-execucao',
// distinto de 'planejamento-anual') — leitura nível 1, materializar nível 3.
// Reaproveita o SELECT/mapeamento de GET /ciclos/:id/propostas (linha ~264),
// mas: (a) sem escopo "minhas vs todas" — é visão consolidada de quem tem
// acesso ao módulo; (b) filtro server-side por natureza/área; (c) inclui o
// derivado no_calendario (PA.noCalendario) e o vínculo materializado.
const EXEC_MOD = 'planejamento-execucao';

router.get('/execucao/propostas', authorizeModule(EXEC_MOD, 1), async (req, res) => {
  let query = supabase.from('plan_propostas').select('*')
    .in('estado', ['aprovada', 'aprovada_ressalvas'])
    .is('deleted_at', null)
    .order('data_inicio');
  if (req.query.ciclo_id) query = query.eq('ciclo_id', req.query.ciclo_id);
  if (req.query.natureza) query = query.eq('natureza', req.query.natureza);
  if (req.query.area) query = query.eq('area', req.query.area);
  const { data: propostas, error } = await query;
  if (error) return res.status(500).json({ error: 'Erro ao listar as propostas aprovadas' });

  const ids = (propostas || []).map((p) => p.id);
  const decs = await decisoesPorProposta(ids);

  // Líder por consulta PRÓPRIA (não embed) — evita depender do nome exato
  // da FK do PostgREST e degrada sozinho se a consulta falhar.
  const liderIds = [...new Set((propostas || []).map((p) => p.lider_id).filter(Boolean))];
  const lideres = {};
  if (liderIds.length) {
    const { data } = await supabase.from('profiles').select('id, name').in('id', liderIds);
    (data || []).forEach((r) => { lideres[r.id] = r.name; });
  }

  // Vínculo materializado (projeto/evento) · consulta ISOLADA best-effort —
  // falha aqui vira "vínculo desconhecido", nunca derruba a lista inteira.
  const vinculoPorProposta = {};
  if (ids.length) {
    try {
      const [{ data: projs }, { data: evs }] = await Promise.all([
        supabase.from('projects').select('id, proposta_id').in('proposta_id', ids),
        supabase.from('events').select('id, proposta_id').in('proposta_id', ids),
      ]);
      (projs || []).forEach((r) => { vinculoPorProposta[r.proposta_id] = { tipo: 'projeto', id: r.id }; });
      (evs || []).forEach((r) => { vinculoPorProposta[r.proposta_id] = { tipo: 'evento', id: r.id }; });
    } catch (e) {
      console.error('[planejamento-execucao] erro ao ler vínculos:', e.message);
    }
  }

  res.json((propostas || []).map((p) => ({
    id: p.id, nome: p.nome, natureza: p.natureza, area: p.area,
    lider_id: p.lider_id, lider_nome: lideres[p.lider_id] || null,
    data_inicio: p.data_inicio, precisao_inicio: p.precisao_inicio,
    multi_dia: p.multi_dia, data_fim: p.data_fim, precisao_fim: p.precisao_fim,
    estado: p.estado, ciclo_id: p.ciclo_id, custo: p.custo,
    no_calendario: PA.noCalendario(p, decs[p.id] || []),
    vinculo: vinculoPorProposta[p.id] || { tipo: null, id: null },
  })));
});

// Detalhe somente-leitura (aba Info + o que a aba Fases precisa pra decidir
// o que mostrar). A régua de visibilidade é a mesma do GET /propostas/:id
// restrita a quem já está aprovada — quem acessa o módulo de execução vê
// qualquer proposta aprovada, não só a própria (é o "consolidado" do plano).
router.get('/execucao/propostas/:id', authorizeModule(EXEC_MOD, 1), async (req, res) => {
  const p = await carregarProposta(req.params.id);
  if (!p || !['aprovada', 'aprovada_ressalvas'].includes(p.estado)) {
    return res.status(404).json({ error: 'Proposta não encontrada' });
  }
  const decs = await decisoesPorProposta([p.id]);

  let vinculo = { tipo: null, id: null };
  try {
    const [{ data: proj }, { data: ev }] = await Promise.all([
      supabase.from('projects').select('id').eq('proposta_id', p.id).maybeSingle(),
      supabase.from('events').select('id').eq('proposta_id', p.id).maybeSingle(),
    ]);
    if (proj) vinculo = { tipo: 'projeto', id: proj.id };
    else if (ev) vinculo = { tipo: 'evento', id: ev.id };
  } catch (e) {
    console.error('[planejamento-execucao] erro ao ler vínculo:', e.message);
  }

  let liderNome = null;
  if (p.lider_id) {
    const { data } = await supabase.from('profiles').select('name').eq('id', p.lider_id).maybeSingle();
    liderNome = data?.name || null;
  }
  let localNome = null;
  if (p.local_id) {
    const { data } = await supabase.from('plan_locais').select('nome').eq('id', p.local_id).maybeSingle();
    localNome = data?.nome || null;
  }
  let rotinaConfig = null;
  if (p.natureza === 'rotina') {
    const { data } = await supabase
      .from('plan_propostas_rotina_solicitacao').select('*').eq('proposta_id', p.id).maybeSingle();
    rotinaConfig = data || null;
  }

  res.json({
    ...p,
    lider_nome: liderNome,
    local_nome: localNome,
    no_calendario: PA.noCalendario(p, decs[p.id] || []),
    vinculo,
    rotina_config: rotinaConfig,
  });
});

// Materializa o Projeto/Evento vinculado. Só depois de `no_calendario` —
// nunca automático na decisão do Pastor (decisão do plano) — e nunca duas
// vezes (1 proposta → no máximo 1 vínculo, checado nas DUAS tabelas).
router.post('/propostas/:id/materializar', authorizeModule(EXEC_MOD, 3), async (req, res) => {
  const tipo = req.body?.tipo;
  if (!['projeto', 'evento'].includes(tipo)) {
    return res.status(400).json({ error: 'Tipo inválido (informe "projeto" ou "evento")' });
  }
  const p = await carregarProposta(req.params.id);
  if (!p) return res.status(404).json({ error: 'Proposta não encontrada' });
  if (p.natureza !== tipo) {
    return res.status(422).json({ error: `Esta proposta é de natureza "${p.natureza}" — não pode virar ${tipo}` });
  }
  const decs = await decisoesPorProposta([p.id]);
  if (!PA.noCalendario(p, decs[p.id] || [])) {
    return res.status(409).json({ error: 'A proposta ainda não entrou no calendário (ressalva pendente de verificação, ou fora do estado aprovado)' });
  }

  const [{ data: projExistente }, { data: evExistente }] = await Promise.all([
    supabase.from('projects').select('id').eq('proposta_id', p.id).maybeSingle(),
    supabase.from('events').select('id').eq('proposta_id', p.id).maybeSingle(),
  ]);
  if (projExistente || evExistente) {
    return res.status(409).json({ error: 'Esta proposta já tem um Projeto/Evento vinculado' });
  }

  let liderNome = '';
  if (p.lider_id) {
    const { data } = await supabase.from('profiles').select('name').eq('id', p.lider_id).maybeSingle();
    liderNome = data?.name || '';
  }
  const anoInicio = parseInt(String(p.data_inicio || '').slice(0, 4), 10) || new Date().getFullYear();

  if (tipo === 'projeto') {
    const insert = {
      name: p.nome, year: anoInicio, description: p.descricao || '', status: 'no-prazo',
      responsible: liderNome, responsible_id: p.lider_id,
      leader: liderNome, leader_id: p.lider_id,
      area: p.area || '',
      date_start: p.data_inicio || null, date_end: p.data_fim || null,
      budget_planned: Number(p.custo) || 0, priority: 'media', notes: '',
      created_by: req.user.id, proposta_id: p.id,
    };
    const { data, error } = await supabase.from('projects').insert(insert).select().single();
    if (error) {
      console.error('[planejamento-execucao] erro ao criar projeto:', error.message);
      return res.status(500).json({ error: 'Não foi possível criar o projeto vinculado' });
    }
    return res.status(201).json({ tipo, id: data.id });
  }

  // tipo === 'evento'
  let localNome = '';
  if (p.local_id) {
    const { data } = await supabase.from('plan_locais').select('nome').eq('id', p.local_id).maybeSingle();
    localNome = data?.nome || '';
  }
  // `events.recurrence` só aceita unico|semanal|mensal|anual — recorrências
  // mais finas da proposta (trimestral/semestral/personalizada) degradam pra
  // 'unico' (a periodicidade real fica registrada na proposta de origem).
  const recorrenciaMap = { unica: 'unico', semanal: 'semanal', mensal: 'mensal' };
  const insertEvento = {
    name: p.nome, date: p.data_inicio, description: p.descricao || '',
    location: localNome, responsible: liderNome,
    budget_planned: Number(p.custo) || 0,
    recurrence: recorrenciaMap[p.recorrencia] || 'unico',
    notes: '', created_by: req.user.id, proposta_id: p.id,
  };
  const { data, error } = await supabase.from('events').insert(insertEvento).select().single();
  if (error) {
    console.error('[planejamento-execucao] erro ao criar evento:', error.message);
    return res.status(500).json({ error: 'Não foi possível criar o evento vinculado' });
  }
  res.status(201).json({ tipo, id: data.id });
});

module.exports = router;
