// Módulo Propostas · ciclo anual de projetos/eventos/rotinas (spec Yago).
// FASE 1A: configuração. FASE 1B: proposta (form, filas, histórico) até EM_AVALIACAO.
const express = require('express');
const multer = require('multer');
const router = express.Router();
const { supabase } = require('../utils/supabase');
const { authenticate, authorizeModule } = require('../middleware/auth');
let notificar; try { ({ notificar } = require('../services/notificar')); } catch { notificar = async () => {}; }

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

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

// ═══════════════════════════════════════════════════════════════════════════
// FASE 1B · Propostas (formulário, filas, transições, histórico)
// ═══════════════════════════════════════════════════════════════════════════
const CAMPOS = ['tipo', 'area_id', 'lider_usuario_id', 'titulo', 'equipe_envolvida', 'ano_execucao',
  'data_inicio_prevista', 'data_termino_prevista', 'data_realizacao_prevista', 'frequencia', 'periodo_do_ano',
  'periodo_previsto', 'descricao_motivacao', 'justificativa_geral', 'colabora_plano_expansao', 'explicacao_alinhamento',
  'como_gera_unidade', 'objetivo_geral', 'objetivos_especificos', 'publico_alvo', 'participantes_estimados',
  'complexidade', 'impacto_esperado', 'custo_total', 'arrecadacao_prevista', 'recursos_materiais',
  'recursos_patrimoniais', 'suporte_equipes', 'retorno_esperado', 'centro_de_custo', 'informacoes_contabeis',
  'passa_no_ourico', 'justificativa_ourico', 'observacoes'];
const DATA_FIELDS = ['data_inicio_prevista', 'data_termino_prevista', 'data_realizacao_prevista'];
const NUM_FIELDS = ['ano_execucao', 'participantes_estimados', 'custo_total', 'arrecadacao_prevista'];
const FILHAS = {
  indicadores: { table: 'prop_indicador', cols: ['indicador', 'meta', 'forma_medicao'] },
  atividades: { table: 'prop_atividade', cols: ['etapa', 'responsavel', 'prazo'] },
  riscos: { table: 'prop_risco', cols: ['risco', 'mitigacao'] },
  desembolsos: { table: 'prop_desembolso', cols: ['referencia', 'valor'] },
};

const nivelProp = (req) => req.user?.granular?.modulePerms?.propostas?.leitura ?? 0;
const meuId = (req) => req.user?.id || null;

function sanitizarProposta(body) {
  const out = {};
  for (const k of CAMPOS) {
    if (body[k] === undefined) continue;
    let v = body[k];
    if (DATA_FIELDS.includes(k)) v = v || null;
    else if (NUM_FIELDS.includes(k)) v = v === '' || v == null ? null : Number(v);
    out[k] = v;
  }
  return out;
}

async function diretorDaArea(areaId) {
  if (!areaId) return null;
  const { data } = await supabase.from('prop_area_diretor').select('diretor_usuario_id').eq('area_id', areaId).maybeSingle();
  return data?.diretor_usuario_id || null;
}

async function salvarFilhas(propostaId, body) {
  for (const [chave, cfg] of Object.entries(FILHAS)) {
    if (!Array.isArray(body[chave])) continue;
    await supabase.from(cfg.table).delete().eq('proposta_id', propostaId);
    const linhas = body[chave]
      .map((row, i) => {
        const r = { proposta_id: propostaId, ordem: i };
        for (const c of cfg.cols) r[c] = c === 'valor' ? Number(row?.[c] || 0) : (row?.[c] ?? null);
        return r;
      })
      .filter(r => cfg.cols.some(c => r[c] !== null && r[c] !== '' && r[c] !== 0));
    if (linhas.length) await supabase.from(cfg.table).insert(linhas);
  }
}

// Contexto do usuário (ciclos abertos, áreas, líderes possíveis, minhas áreas de diretor)
router.get('/aux', authorizeModule('propostas', 1), async (req, res) => {
  const me = meuId(req);
  const [ciclos, areas, lideres, dirAreas] = await Promise.all([
    supabase.from('prop_ciclo').select('*').order('ano', { ascending: false }),
    supabase.from('areas').select('id, nome').eq('ativo', true).order('nome'),
    supabase.from('profiles').select('id, name').eq('active', true).order('name'),
    supabase.from('prop_area_diretor').select('area_id').eq('diretor_usuario_id', me),
  ]);
  res.json({
    ciclos: ciclos.data || [], areas: areas.data || [], lideres: lideres.data || [],
    diretor_de: (dirAreas.data || []).map(d => d.area_id),
    me, nivel: nivelProp(req),
  });
});

// Lista escopada (minhas / fila do líder / fila do diretor)
router.get('/', authorizeModule('propostas', 1), async (req, res) => {
  try {
    const me = meuId(req);
    const admin = nivelProp(req) >= 5;
    const { ciclo_id, estado, fila } = req.query;
    let q = supabase.from('prop_proposta')
      .select('id, codigo, tipo, area_id, titulo, estado, versao, custo_liquido, classificacao_custo, lider_usuario_id, criado_por_usuario_id, updated_at, ' +
              'area:areas(id, nome)')
      .is('deleted_at', null).order('updated_at', { ascending: false });
    if (ciclo_id) q = q.eq('ciclo_id', ciclo_id);
    if (estado) q = q.eq('estado', estado);
    if (fila === 'lider') q = q.eq('estado', 'AGUARDANDO_VALIDACAO_LIDER').eq('lider_usuario_id', me);
    else if (fila === 'diretor') {
      const { data: minhas } = await supabase.from('prop_area_diretor').select('area_id').eq('diretor_usuario_id', me);
      const ids = (minhas || []).map(m => m.area_id);
      if (!ids.length && !admin) return res.json([]);
      q = q.eq('estado', 'AGUARDANDO_DIRETOR_AREA');
      if (!admin) q = q.in('area_id', ids);
    } else if (!admin) {
      q = q.or(`criado_por_usuario_id.eq.${me},lider_usuario_id.eq.${me}`);
    }
    const { data, error } = await q.limit(1000);
    if (error) return res.status(400).json({ error: error.message });
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Detalhe + filhas
router.get('/:id', authorizeModule('propostas', 1), async (req, res) => {
  const { data: p, error } = await supabase.from('prop_proposta').select('*, area:areas(id, nome)').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
  if (error) return res.status(400).json({ error: error.message });
  if (!p) return res.status(404).json({ error: 'Proposta não encontrada' });
  const [ind, ati, ris, des, anx] = await Promise.all([
    supabase.from('prop_indicador').select('*').eq('proposta_id', p.id).order('ordem'),
    supabase.from('prop_atividade').select('*').eq('proposta_id', p.id).order('ordem'),
    supabase.from('prop_risco').select('*').eq('proposta_id', p.id).order('ordem'),
    supabase.from('prop_desembolso').select('*').eq('proposta_id', p.id).order('ordem'),
    supabase.from('prop_anexo').select('*').eq('proposta_id', p.id).order('ordem'),
  ]);
  res.json({ ...p, indicadores: ind.data || [], atividades: ati.data || [], riscos: ris.data || [], desembolsos: des.data || [], anexos: anx.data || [] });
});

// Criar (rascunho)
router.post('/', authorizeModule('propostas', 2), async (req, res) => {
  try {
    if (!req.body?.ciclo_id) return res.status(400).json({ error: 'Ciclo obrigatório' });
    if (!['projeto', 'evento', 'rotina'].includes(req.body?.tipo)) return res.status(400).json({ error: 'Tipo inválido' });
    const payload = { ...sanitizarProposta(req.body), ciclo_id: req.body.ciclo_id, criado_por_usuario_id: meuId(req), estado: 'RASCUNHO' };
    const { data, error } = await supabase.from('prop_proposta').insert(payload).select().single();
    if (error) return res.status(400).json({ error: error.message });
    await salvarFilhas(data.id, req.body);
    await supabase.from('prop_log').insert({ proposta_id: data.id, de_estado: null, para_estado: 'RASCUNHO', acao: 'criar', ator_usuario_id: meuId(req), versao: 1 });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Editar (só RASCUNHO/EM_AJUSTE · autor ou líder)
router.put('/:id', authorizeModule('propostas', 2), async (req, res) => {
  try {
    const { data: p } = await supabase.from('prop_proposta').select('id, estado, criado_por_usuario_id, lider_usuario_id').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!p) return res.status(404).json({ error: 'Proposta não encontrada' });
    if (!['RASCUNHO', 'EM_AJUSTE'].includes(p.estado)) return res.status(409).json({ error: 'Proposta não editável neste estado' });
    const me = meuId(req);
    if (!(nivelProp(req) >= 5 || p.criado_por_usuario_id === me || p.lider_usuario_id === me)) return res.status(403).json({ error: 'Sem permissão pra editar' });
    const { error } = await supabase.from('prop_proposta').update(sanitizarProposta(req.body)).eq('id', p.id);
    if (error) return res.status(400).json({ error: error.message });
    await salvarFilhas(p.id, req.body);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Transição de estado (autorização por ação; RPC faz a mudança + log atômico)
router.post('/:id/transicao', authorizeModule('propostas', 2), async (req, res) => {
  try {
    const { acao, comentario } = req.body || {};
    const { data: p } = await supabase.from('prop_proposta')
      .select('id, estado, area_id, ciclo_id, criado_por_usuario_id, lider_usuario_id, codigo, ciclo:prop_ciclo(data_corte_submissao)')
      .eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!p) return res.status(404).json({ error: 'Proposta não encontrada' });
    const me = meuId(req); const admin = nivelProp(req) >= 5;
    const souAutorOuLider = p.criado_por_usuario_id === me || p.lider_usuario_id === me;
    const souDiretor = admin || (await diretorDaArea(p.area_id)) === me;

    const autoriza = {
      enviar: souAutorOuLider || admin, reenviar: souAutorOuLider || admin, descartar: souAutorOuLider || admin,
      validar: p.lider_usuario_id === me || admin, devolver_lider: p.lider_usuario_id === me || admin,
      aprovar: souDiretor, devolver_area: souDiretor, negar: souDiretor,
    };
    if (!autoriza[acao]) return res.status(403).json({ error: 'Sem permissão pra esta ação' });

    // RN03 · envio bloqueado após o corte da submissão
    if ((acao === 'enviar' || acao === 'reenviar') && p.ciclo?.data_corte_submissao) {
      const hoje = new Date().toISOString().slice(0, 10);
      if (hoje > p.ciclo.data_corte_submissao) return res.status(409).json({ error: 'Janela de submissão encerrada (após o corte).' });
    }

    const { data: r, error } = await supabase.rpc('fn_prop_transicionar', { p_id: p.id, p_acao: acao, p_comentario: comentario || null, p_ator: me });
    if (error) return res.status(400).json({ error: error.message });
    if (!r?.ok) return res.status(409).json(r);

    // Notifica o próximo responsável + autor (best-effort · RN22)
    const alvo = [];
    if (r.para === 'AGUARDANDO_VALIDACAO_LIDER' && p.lider_usuario_id) alvo.push(p.lider_usuario_id);
    if (r.para === 'AGUARDANDO_DIRETOR_AREA') { const d = await diretorDaArea(p.area_id); if (d) alvo.push(d); }
    if (['EM_AJUSTE', 'REPROVADO_AREA', 'EM_AVALIACAO'].includes(r.para) && p.criado_por_usuario_id) alvo.push(p.criado_por_usuario_id);
    if (alvo.length) {
      notificar({ modulo: 'propostas', tipo: 'proposta_transicao', titulo: `Proposta ${p.codigo || ''} · ${r.para}`,
        mensagem: comentario || `A proposta mudou para ${r.para}.`, link: '/propostas',
        targetIds: [...new Set(alvo)], email: false }).catch(() => {});
    }
    res.json(r);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Anexos (orçamentos)
router.post('/:id/anexos', authorizeModule('propostas', 2), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Arquivo obrigatório' });
    const path = `propostas/${req.params.id}/${Date.now()}_${req.file.originalname.replace(/[^\w.\-]/g, '_')}`;
    const { error: upErr } = await supabase.storage.from('log-arquivos').upload(path, req.file.buffer, { contentType: req.file.mimetype, upsert: false });
    if (upErr) return res.status(400).json({ error: upErr.message });
    const { count } = await supabase.from('prop_anexo').select('id', { count: 'exact', head: true }).eq('proposta_id', req.params.id);
    const { data, error } = await supabase.from('prop_anexo').insert({ proposta_id: req.params.id, ordem: count || 0, nome: req.file.originalname, storage_path: path, enviado_por: meuId(req) }).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/anexos/:anexoId', authorizeModule('propostas', 2), async (req, res) => {
  const { error } = await supabase.from('prop_anexo').delete().eq('id', req.params.anexoId);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});

// Histórico (prop_log · append-only). ator_usuario_id é snapshot SEM FK
// (ledger imutável), então resolve o nome em JS.
router.get('/:id/historico', authorizeModule('propostas', 1), async (req, res) => {
  const { data, error } = await supabase.from('prop_log')
    .select('id, de_estado, para_estado, acao, comentario, versao, ocorrido_em, ator_usuario_id')
    .eq('proposta_id', req.params.id).order('ocorrido_em', { ascending: false });
  if (error) return res.status(400).json({ error: error.message });
  const ids = [...new Set((data || []).map(l => l.ator_usuario_id).filter(Boolean))];
  let nomes = {};
  if (ids.length) {
    const { data: profs } = await supabase.from('profiles').select('id, name').in('id', ids);
    nomes = Object.fromEntries((profs || []).map(p => [p.id, p.name]));
  }
  res.json((data || []).map(l => ({ ...l, ator_nome: nomes[l.ator_usuario_id] || 'sistema' })));
});

// Soft-delete (autor em rascunho ou super-admin)
router.delete('/:id', authorizeModule('propostas', 2), async (req, res) => {
  const { data: p } = await supabase.from('prop_proposta').select('estado, criado_por_usuario_id').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
  if (!p) return res.status(404).json({ error: 'Não encontrada' });
  if (!(nivelProp(req) >= 5 || (p.criado_por_usuario_id === meuId(req) && ['RASCUNHO', 'EM_AJUSTE', 'CANCELADO'].includes(p.estado)))) {
    return res.status(403).json({ error: 'Sem permissão pra excluir' });
  }
  const { error } = await supabase.rpc('app_soft_delete', { p_table_name: 'prop_proposta', p_row_id: req.params.id, p_deleted_by: meuId(req) });
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════════
// FASE 2 · Avaliação (0-5) + Mural da reunião + deliberação
// ═══════════════════════════════════════════════════════════════════════════
const ESTADOS_MURAL = ['EM_AVALIACAO', 'EM_DELIBERACAO', 'APROVADO', 'EM_ADEQUACAO', 'EM_VERIFICACAO_RESSALVAS', 'AGUARDANDO_RECURSO', 'EM_REAVALIACAO', 'CONSOLIDADO'];

async function avaliadoresSet() {
  const { data } = await supabase.from('prop_area_diretor').select('diretor_usuario_id').eq('ativa', true).not('diretor_usuario_id', 'is', null);
  return new Set((data || []).map(d => d.diretor_usuario_id));
}
async function souAvaliador(req) {
  if (nivelProp(req) >= 5) return true;
  return (await avaliadoresSet()).has(meuId(req));
}
async function paramCiclo(cicloId, chave, def) {
  const { data } = await supabase.from('prop_parametro').select('valor').eq('ciclo_id', cicloId).eq('chave', chave).maybeSingle();
  const v = data?.valor; return v == null || v === '' ? def : v;
}

// Fila de avaliação do diretor
router.get('/avaliar', authorizeModule('propostas', 1), async (req, res) => {
  try {
    if (!(await souAvaliador(req))) return res.status(403).json({ error: 'Só diretores avaliam' });
    const me = meuId(req);
    let q = supabase.from('prop_proposta').select('id, codigo, tipo, titulo, area_id, custo_liquido, estado, area:areas(nome)').eq('estado', 'EM_AVALIACAO').is('deleted_at', null);
    if (req.query.ciclo_id) q = q.eq('ciclo_id', req.query.ciclo_id);
    const { data: props, error } = await q.order('codigo');
    if (error) return res.status(400).json({ error: error.message });
    const ids = (props || []).map(p => p.id);
    let feitas = new Set();
    if (ids.length) {
      const { data: avs } = await supabase.from('prop_avaliacao').select('proposta_id').eq('diretor_usuario_id', me).not('enviada_em', 'is', null).in('proposta_id', ids);
      feitas = new Set((avs || []).map(a => a.proposta_id));
    }
    res.json({ propostas: (props || []).map(p => ({ ...p, avaliei: feitas.has(p.id) })), pendentes: (props || []).filter(p => !feitas.has(p.id)).length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Minha avaliação de uma proposta (+ critérios do ciclo)
router.get('/:id/avaliacao', authorizeModule('propostas', 1), async (req, res) => {
  const me = meuId(req);
  const { data: p } = await supabase.from('prop_proposta').select('id, ciclo_id').eq('id', req.params.id).maybeSingle();
  if (!p) return res.status(404).json({ error: 'Proposta não encontrada' });
  const [crit, av] = await Promise.all([
    supabase.from('prop_criterio').select('id, nome, descricao, peso, ordem').eq('ciclo_id', p.ciclo_id).eq('ativo', true).order('ordem'),
    supabase.from('prop_avaliacao').select('id, comentario, enviada_em').eq('proposta_id', p.id).eq('diretor_usuario_id', me).maybeSingle(),
  ]);
  let notas = {};
  if (av.data?.id) { const { data: ns } = await supabase.from('prop_avaliacao_nota').select('criterio_id, nota').eq('avaliacao_id', av.data.id); notas = Object.fromEntries((ns || []).map(n => [n.criterio_id, n.nota])); }
  res.json({ criterios: crit.data || [], avaliacao: av.data || null, notas });
});

// Enviar/salvar minha avaliação
router.post('/:id/avaliacao', authorizeModule('propostas', 2), async (req, res) => {
  try {
    if (!(await souAvaliador(req))) return res.status(403).json({ error: 'Só diretores avaliam' });
    const me = meuId(req);
    const { comentario, notas, enviar } = req.body || {};
    const { data: p } = await supabase.from('prop_proposta').select('id, ciclo_id, estado').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!p) return res.status(404).json({ error: 'Proposta não encontrada' });
    if (p.estado !== 'EM_AVALIACAO') return res.status(409).json({ error: 'Proposta não está em avaliação' });
    const { data: existente } = await supabase.from('prop_avaliacao').select('id, enviada_em').eq('proposta_id', p.id).eq('diretor_usuario_id', me).maybeSingle();
    if (existente?.enviada_em) return res.status(409).json({ error: 'Avaliação já enviada — não pode ser editada (RN08)' });
    if (enviar && (!comentario || !comentario.trim())) return res.status(400).json({ error: 'Comentário obrigatório (RN08)' });

    let avId = existente?.id;
    if (avId) await supabase.from('prop_avaliacao').update({ comentario: comentario || null, enviada_em: enviar ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq('id', avId);
    else { const { data: nova, error } = await supabase.from('prop_avaliacao').insert({ proposta_id: p.id, diretor_usuario_id: me, comentario: comentario || null, enviada_em: enviar ? new Date().toISOString() : null }).select('id').single(); if (error) return res.status(400).json({ error: error.message }); avId = nova.id; }
    // notas (0-5 por critério)
    await supabase.from('prop_avaliacao_nota').delete().eq('avaliacao_id', avId);
    const linhas = Object.entries(notas || {}).filter(([, v]) => v != null && v !== '').map(([criterio_id, nota]) => ({ avaliacao_id: avId, criterio_id, nota: Math.max(0, Math.min(5, Number(nota))) }));
    if (linhas.length) await supabase.from('prop_avaliacao_nota').insert(linhas);
    res.json({ ok: true, enviada: !!enviar });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Mural da reunião · ranking + orçamento (RN09/RN10/RN11/RN13)
router.get('/mural', authorizeModule('propostas', 1), async (req, res) => {
  try {
    if (!(await souAvaliador(req))) return res.status(403).json({ error: 'Mural restrito a diretores/presidente' });
    const cicloId = req.query.ciclo_id;
    if (!cicloId) return res.status(400).json({ error: 'ciclo_id obrigatório' });
    const [{ data: ciclo }, { data: props }, { data: crit }, minAv] = await Promise.all([
      supabase.from('prop_ciclo').select('orcamento_disponivel').eq('id', cicloId).maybeSingle(),
      supabase.from('prop_proposta').select('id, codigo, tipo, titulo, area_id, custo_total, custo_liquido, classificacao_custo, complexidade, impacto_esperado, passa_no_ourico, estado, area:areas(nome)').eq('ciclo_id', cicloId).in('estado', ESTADOS_MURAL).is('deleted_at', null),
      supabase.from('prop_criterio').select('id, peso').eq('ciclo_id', cicloId).eq('ativo', true),
      paramCiclo(cicloId, 'min_avaliadores', '3'),
    ]);
    const propostas = props || [];
    const ids = propostas.map(p => p.id);
    const pesoDe = Object.fromEntries((crit || []).map(c => [c.id, Number(c.peso || 1)]));
    const somaPesos = Object.values(pesoDe).reduce((s, w) => s + w, 0) || 1;
    // diretor de cada área
    const areaIds = [...new Set(propostas.map(p => p.area_id).filter(Boolean))];
    let diretorArea = {};
    if (areaIds.length) { const { data: ad } = await supabase.from('prop_area_diretor').select('area_id, diretor_usuario_id').in('area_id', areaIds); diretorArea = Object.fromEntries((ad || []).map(a => [a.area_id, a.diretor_usuario_id])); }
    // avaliações enviadas + notas + nomes
    let avs = [], notasPorAv = {}, nomes = {};
    if (ids.length) {
      const { data: a } = await supabase.from('prop_avaliacao').select('id, proposta_id, diretor_usuario_id, comentario').not('enviada_em', 'is', null).in('proposta_id', ids);
      avs = a || [];
      const avIds = avs.map(x => x.id);
      if (avIds.length) { const { data: ns } = await supabase.from('prop_avaliacao_nota').select('avaliacao_id, criterio_id, nota').in('avaliacao_id', avIds); (ns || []).forEach(n => { (notasPorAv[n.avaliacao_id] = notasPorAv[n.avaliacao_id] || []).push(n); }); }
      const dids = [...new Set(avs.map(x => x.diretor_usuario_id))];
      if (dids.length) { const { data: profs } = await supabase.from('profiles').select('id, name').in('id', dids); nomes = Object.fromEntries((profs || []).map(p => [p.id, p.name])); }
    }
    const notaAv = (avId) => { const ns = notasPorAv[avId] || []; if (!ns.length) return null; const soma = ns.reduce((s, n) => s + Number(n.nota) * (pesoDe[n.criterio_id] || 1), 0); return soma / somaPesos; };
    const minA = Number(minAv);
    const linhas = propostas.map(p => {
      const avP = avs.filter(a => a.proposta_id === p.id);
      const dirArea = diretorArea[p.area_id];
      const outros = avP.filter(a => a.diretor_usuario_id !== dirArea);
      const daArea = avP.find(a => a.diretor_usuario_id === dirArea);
      const mediaOutros = outros.length ? outros.reduce((s, a) => s + (notaAv(a.id) || 0), 0) / outros.length : null;
      const notaArea = daArea ? notaAv(daArea.id) : null;
      const geral = avP.length ? avP.reduce((s, a) => s + (notaAv(a.id) || 0), 0) / avP.length : null;
      return {
        id: p.id, codigo: p.codigo, tipo: p.tipo, titulo: p.titulo, area: p.area?.nome, estado: p.estado,
        custo_total: Number(p.custo_total), custo_liquido: Number(p.custo_liquido), classificacao_custo: p.classificacao_custo,
        complexidade: p.complexidade, impacto: p.impacto_esperado, passa_no_ourico: p.passa_no_ourico,
        nota_outros: mediaOutros, nota_area: notaArea, nota_geral: geral, n_avaliadores: avP.length,
        quorum: avP.length >= minA,
        comentarios: avP.map(a => ({ diretor: nomes[a.diretor_usuario_id] || '—', comentario: a.comentario, nota: notaAv(a.id) })),
      };
    });
    // ranking: com quórum primeiro, por nota_geral desc; sem quórum ao fim
    linhas.sort((a, b) => (b.quorum - a.quorum) || ((b.nota_geral ?? -1) - (a.nota_geral ?? -1)));
    linhas.forEach((l, i) => { l.posicao = l.quorum ? i + 1 : null; });
    res.json({ orcamento_disponivel: Number(ciclo?.orcamento_disponivel || 0), min_avaliadores: minA, propostas: linhas });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Registrar decisão da reunião (RN14/RN15/RN17) — move o estado
router.post('/:id/deliberar', authorizeModule('propostas', 2), async (req, res) => {
  try {
    if (!(await souAvaliador(req))) return res.status(403).json({ error: 'Só diretores/presidente decidem' });
    const { resultado, ressalvas, motivo } = req.body || {};
    const mapa = { aprovado: 'deliberar_aprovar', aprovado_com_ressalvas: 'deliberar_ressalvas', devolvido: 'deliberar_devolver', reprovado: 'deliberar_reprovar' };
    if (!mapa[resultado]) return res.status(400).json({ error: 'Resultado inválido' });
    if (resultado === 'aprovado_com_ressalvas' && !ressalvas?.trim()) return res.status(400).json({ error: 'Ressalvas obrigatórias' });
    if ((resultado === 'devolvido' || resultado === 'reprovado') && !motivo?.trim()) return res.status(400).json({ error: 'Motivo obrigatório' });

    const { data: p } = await supabase.from('prop_proposta').select('*').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!p) return res.status(404).json({ error: 'Proposta não encontrada' });

    // snapshot da proposta no momento da decisão (RN17)
    const { data: snap } = await supabase.from('prop_snapshot').insert({ proposta_id: p.id, versao: p.versao, payload: p }).select('id').maybeSingle();

    // garante EM_DELIBERACAO (a decisão em reunião move avaliação→deliberação)
    if (p.estado === 'EM_AVALIACAO') {
      const { data: t1 } = await supabase.rpc('fn_prop_transicionar', { p_id: p.id, p_acao: 'entrar_deliberacao', p_ator: meuId(req) });
      if (t1 && t1.ok === false) return res.status(409).json(t1);
    }
    const coment = resultado === 'aprovado_com_ressalvas' ? ressalvas : (motivo || null);
    const { data: r, error } = await supabase.rpc('fn_prop_transicionar', { p_id: p.id, p_acao: mapa[resultado], p_comentario: coment, p_ator: meuId(req) });
    if (error) return res.status(400).json({ error: error.message });
    if (!r?.ok) return res.status(409).json(r);

    await supabase.from('prop_deliberacao').insert({ proposta_id: p.id, tipo: 'deliberacao', resultado, ressalvas: ressalvas || null, motivo: motivo || null, snapshot_id: snap?.id || null, registrado_por_usuario_id: meuId(req) });
    if (p.criado_por_usuario_id) notificar({ modulo: 'propostas', tipo: 'proposta_deliberacao', titulo: `Proposta ${p.codigo || ''} · ${r.para}`, mensagem: coment || `Decisão da reunião: ${resultado}.`, link: '/propostas', targetIds: [p.criado_por_usuario_id], email: false }).catch(() => {});
    res.json(r);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
