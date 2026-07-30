// Módulo Propostas · ciclo anual de projetos/eventos/rotinas (spec Yago).
// FASE 1A: só CONFIGURAÇÃO (ciclo, área→diretor, parâmetros, critérios).
// Proposta/formulário/filas vêm na Fase 1B.
const express = require('express');
const router = express.Router();
const { supabase } = require('../utils/supabase');
const { authenticate, authorizeModule } = require('../middleware/auth');

router.use(authenticate);

// Parâmetros default de um ciclo novo (a CBRio ajusta faixas/valores depois).
const PARAMS_DEFAULT = {
  faixa_custo_baixo_ate: '',
  faixa_custo_medio_ate: '',
  min_avaliadores: '3',
  prazo_recurso_dias: '10',
  desembolso_bloqueia_envio: 'false',
};

// ── Ciclos ─────────────────────────────────────────────────────────────────
router.get('/config/ciclos', authorizeModule('propostas', 1), async (req, res) => {
  const { data, error } = await supabase.from('prop_ciclo').select('*').order('ano', { ascending: false });
  if (error) return res.status(400).json({ error: error.message });
  res.json(data || []);
});

router.post('/config/ciclos', authorizeModule('propostas', 5), async (req, res) => {
  try {
    const ano = Number(req.body?.ano);
    if (!Number.isInteger(ano)) return res.status(400).json({ error: 'Ano inválido' });
    const payload = {
      ano,
      data_abertura_submissao: req.body?.data_abertura_submissao || null,
      data_corte_submissao: req.body?.data_corte_submissao || null,
      prazo_avaliacao: req.body?.prazo_avaliacao || null,
      orcamento_disponivel: Number(req.body?.orcamento_disponivel || 0),
    };
    const { data, error } = await supabase.from('prop_ciclo').insert(payload).select().single();
    if (error) return res.status(400).json({ error: error.message });
    // Semeia os parâmetros default do ciclo.
    const params = Object.entries(PARAMS_DEFAULT).map(([chave, valor]) => ({ ciclo_id: data.id, chave, valor }));
    await supabase.from('prop_parametro').upsert(params, { onConflict: 'ciclo_id,chave' });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/config/ciclos/:id', authorizeModule('propostas', 5), async (req, res) => {
  const patch = {};
  for (const k of ['data_abertura_submissao', 'data_corte_submissao', 'prazo_avaliacao', 'estado']) {
    if (req.body?.[k] !== undefined) patch[k] = req.body[k] || null;
  }
  if (req.body?.orcamento_disponivel !== undefined) patch.orcamento_disponivel = Number(req.body.orcamento_disponivel || 0);
  patch.updated_at = new Date().toISOString();
  const { data, error } = await supabase.from('prop_ciclo').update(patch).eq('id', req.params.id).select().maybeSingle();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// ── Parâmetros do ciclo (chave/valor · faixas de custo, quóruns, prazos) ────
router.get('/config/ciclos/:id/parametros', authorizeModule('propostas', 1), async (req, res) => {
  const { data, error } = await supabase.from('prop_parametro').select('*').eq('ciclo_id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  const map = { ...PARAMS_DEFAULT };
  (data || []).forEach(p => { map[p.chave] = p.valor; });
  res.json(map);
});

router.put('/config/ciclos/:id/parametros', authorizeModule('propostas', 5), async (req, res) => {
  const rows = Object.entries(req.body || {})
    .filter(([k]) => Object.prototype.hasOwnProperty.call(PARAMS_DEFAULT, k))
    .map(([chave, valor]) => ({ ciclo_id: req.params.id, chave, valor: valor == null ? '' : String(valor) }));
  if (!rows.length) return res.json({ ok: true });
  const { error } = await supabase.from('prop_parametro').upsert(rows, { onConflict: 'ciclo_id,chave' });
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});

// ── Áreas participantes + diretor de cada uma ──────────────────────────────
router.get('/config/areas', authorizeModule('propostas', 1), async (req, res) => {
  const { data, error } = await supabase
    .from('prop_area_diretor')
    .select('id, area_id, diretor_usuario_id, ativa, area:areas(id, nome), diretor:profiles!prop_area_diretor_diretor_usuario_id_fkey(id, name)');
  if (error) return res.status(400).json({ error: error.message });
  res.json(data || []);
});

router.put('/config/areas/:areaId', authorizeModule('propostas', 5), async (req, res) => {
  const payload = {
    area_id: req.params.areaId,
    diretor_usuario_id: req.body?.diretor_usuario_id || null,
    ativa: req.body?.ativa !== false,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from('prop_area_diretor').upsert(payload, { onConflict: 'area_id' }).select().maybeSingle();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// Catálogo de áreas + diretores possíveis (pra montar os selects da tela).
router.get('/config/aux', authorizeModule('propostas', 1), async (req, res) => {
  const [areas, diretores] = await Promise.all([
    supabase.from('areas').select('id, nome').eq('ativo', true).order('nome'),
    supabase.from('profiles').select('id, name, role').in('role', ['diretor', 'admin']).eq('active', true).order('name'),
  ]);
  res.json({ areas: areas.data || [], diretores: diretores.data || [] });
});

// ── Critérios de avaliação por ciclo (N critérios · RN08/RN09) ─────────────
router.get('/config/ciclos/:id/criterios', authorizeModule('propostas', 1), async (req, res) => {
  const { data, error } = await supabase.from('prop_criterio').select('*').eq('ciclo_id', req.params.id).order('ordem');
  if (error) return res.status(400).json({ error: error.message });
  res.json(data || []);
});

router.post('/config/ciclos/:id/criterios', authorizeModule('propostas', 5), async (req, res) => {
  if (!req.body?.nome?.trim()) return res.status(400).json({ error: 'Nome do critério obrigatório' });
  const payload = {
    ciclo_id: req.params.id,
    nome: req.body.nome.trim(),
    descricao: req.body?.descricao || null,
    peso: Number(req.body?.peso || 1),
    ordem: Number(req.body?.ordem || 0),
  };
  const { data, error } = await supabase.from('prop_criterio').insert(payload).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

router.put('/config/criterios/:id', authorizeModule('propostas', 5), async (req, res) => {
  const patch = {};
  for (const k of ['nome', 'descricao', 'ativo']) if (req.body?.[k] !== undefined) patch[k] = req.body[k];
  if (req.body?.peso !== undefined) patch.peso = Number(req.body.peso || 1);
  if (req.body?.ordem !== undefined) patch.ordem = Number(req.body.ordem || 0);
  const { data, error } = await supabase.from('prop_criterio').update(patch).eq('id', req.params.id).select().maybeSingle();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

router.delete('/config/criterios/:id', authorizeModule('propostas', 5), async (req, res) => {
  const { error } = await supabase.from('prop_criterio').update({ ativo: false }).eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});

module.exports = router;
