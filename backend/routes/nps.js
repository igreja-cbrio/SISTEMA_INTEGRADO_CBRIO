const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const { authenticate, authorize, authorizeModule, getUserAreas } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { notificar } = require('../services/notificar');
const npsService = require('../services/npsService');
const multer = require('multer');
const XLSX = require('xlsx');
const { parseGoogleForm, converterNota } = require('../services/googleFormsParser');
// Sync do agregado da pesquisa → dados_brutos → KPIs (compartilhado com o
// canal público em publicNps.js).
const { sincronizarKpi, removerDadosBrutos } = require('../services/npsKpiSync');

// Upload da planilha de respostas (molde do uploadPlanilha da logística).
const SHEET_MIMES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  'application/csv',
];
const uploadPlanilha = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (SHEET_MIMES.includes(file.mimetype) || /\.(xlsx?|csv)$/i.test(file.originalname || '')) cb(null, true);
    else cb(new Error('Envie a planilha em .xlsx, .xls ou .csv.'));
  },
});

const TIPOS_KPI_VALIDOS = ['nps_geral', 'nps_next', 'nps_lideres', 'nps_voluntarios', 'nps_culto'];

// Rate limit para chamadas de IA (geração/análise) — caro em tokens.
const iaLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Limite de chamadas à IA atingido. Tente novamente em 1h.' },
  skip: (req) => req.user?.role === 'admin',
});

router.use(authenticate);

// ── Escopo por ÁREA ──────────────────────────────────────────────────
// Líder de área (ex.: coordenador-ami com área AMI) vê/edita SÓ a NPS da sua
// área. admin/diretor veem tudo (inclusive 'geral'). As áreas do usuário vêm
// de usuario_areas (getUserAreas) e são normalizadas (lowercase, sem acento)
// pra casar com nps_pesquisas.area (ex.: "KIDS" → "kids", "Integração" →
// "integracao"). Sem área e sem ser admin → não vê nada.
function ehAdminDiretor(req) {
  return ['admin', 'diretor'].includes(req.user?.role);
}
function _norm(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}
function areasDoUsuario(req) {
  return getUserAreas(req).map(_norm).filter(Boolean);
}
// Pode ver/agir na NPS desta área? admin/diretor sempre; senão só se for a dele.
function podeNaArea(req, area) {
  if (ehAdminDiretor(req)) return true;
  return areasDoUsuario(req).includes(_norm(area));
}
// Busca a área da pesquisa e checa o escopo (usado em PUT/DELETE/analisar/notificar).
async function guardArea(req, id) {
  if (ehAdminDiretor(req)) return true;
  const { data } = await supabase.from('nps_pesquisas').select('area').eq('id', id).single();
  return !!data && podeNaArea(req, data.area);
}
// Nível efetivo do módulo NPS do usuário (0-5).
function nivelNps(req) {
  const p = req.user?.granular?.modulePerms?.nps || {};
  return Math.max(Number(p.leitura) || 0, Number(p.escrita) || 0);
}
// Pode GERENCIAR a pesquisa (editar/analisar/notificar/encerrar/excluir)?
//   admin/diretor · o CRIADOR (mesmo sem nível alto · gerencia o que criou) ·
//   coordenador da área (nps>=3 na área da pesquisa).
function podeGerenciarPesquisa(req, pesquisa) {
  if (!pesquisa) return false;
  if (ehAdminDiretor(req)) return true;
  if (pesquisa.criado_por && pesquisa.criado_por === req.user.userId) return true;
  return nivelNps(req) >= 3 && podeNaArea(req, pesquisa.area);
}
async function podeGerenciar(req, id) {
  if (ehAdminDiretor(req)) return true;
  const { data } = await supabase.from('nps_pesquisas').select('criado_por, area').eq('id', id).single();
  return podeGerenciarPesquisa(req, data);
}

// ────────────────────────────────────────────────────────────────────
// Geração de perguntas (preview antes de criar)
// POST /api/nps/gerar-perguntas
// ────────────────────────────────────────────────────────────────────
// Gerar perguntas (preview) é parte do fluxo de criar — liberado pra qualquer
// colaborador logado (iaLimiter segura abuso de custo de IA).
router.post('/gerar-perguntas', iaLimiter, async (req, res) => {
  try {
    const { valor, objetivo, contexto_kpi, area } = req.body || {};
    if (!objetivo) {
      return res.status(400).json({ error: 'objetivo é obrigatório' });
    }
    const areaInformada = area && String(area).toLowerCase() !== 'geral' ? area : null;
    if (!valor && !areaInformada) {
      return res.status(400).json({ error: 'Defina um escopo: um valor da CBRio ou uma área específica.' });
    }
    const contextoKpi = TIPOS_KPI_VALIDOS.includes(contexto_kpi) ? contexto_kpi : 'nps_geral';
    const result = await npsService.gerarPerguntas({ valor: valor || null, objetivo, contextoKpi, area });
    res.json(result);
  } catch (e) {
    console.error('[nps] gerar-perguntas:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao gerar perguntas' });
  }
});

// ────────────────────────────────────────────────────────────────────
// Importar perguntas de um Google Forms (preview · não cria)
// POST /api/nps/importar-form  body { url }
// Lê a página pública do formulário e devolve as perguntas no formato NPS +
// os candidatos a "nota" (escalas). A criação reusa o POST /api/nps (o front
// monta pergunta_nps/perguntas_extras + import_meta e chama create).
// ────────────────────────────────────────────────────────────────────
router.post('/importar-form', async (req, res) => {
  try {
    const { url } = req.body || {};
    const form = await parseGoogleForm(url);
    res.json(form);
  } catch (e) {
    console.error('[nps] importar-form:', e.message);
    res.status(400).json({ error: e.message || 'Não consegui ler o formulário' });
  }
});

// ────────────────────────────────────────────────────────────────────
// CRUD pesquisas
// ────────────────────────────────────────────────────────────────────

// GET /api/nps  → lista pesquisas (escopadas por área p/ não-admin)
// Aberto a qualquer logado (criar NPS é pra todos): o filtro por área abaixo já
// devolve [] pra quem não tem área/gestão — sem vazar pesquisas de outras áreas.
router.get('/', async (req, res) => {
  try {
    const { status, valor } = req.query;
    let q = supabase
      .from('nps_pesquisas')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (status) q = q.eq('status', status);
    if (valor) q = q.eq('valor', valor);
    // Escopo por área · líder vê só a(s) sua(s); admin/diretor vê tudo (+ 'geral').
    if (!ehAdminDiretor(req)) {
      const areas = areasDoUsuario(req);
      if (!areas.length) return res.json([]);
      q = q.in('area', areas);
    }
    const { data, error } = await q;
    if (error) throw error;

    // Anexa stats agregadas em lote
    if (data?.length) {
      const ids = data.map(p => p.id);
      const { data: stats } = await supabase
        .from('vw_nps_pesquisa_stats')
        .select('*')
        .in('pesquisa_id', ids);
      const byId = Object.fromEntries((stats || []).map(s => [s.pesquisa_id, s]));
      data.forEach(p => { p.stats = byId[p.id] || null; });
    }

    res.json(data);
  } catch (e) {
    console.error('[nps] list:', e.message);
    res.status(500).json({ error: 'Erro ao listar pesquisas' });
  }
});

// GET /api/nps/:id  → detalhe + stats
// NÃO gated por área/módulo: também é usado por quem vai RESPONDER a pesquisa
// (/nps/:id/responder · qualquer colaborador). Os dados sensíveis (respostas
// individuais) ficam em /:id/respostas, que é escopado. Stats aqui são agregados.
router.get('/:id', async (req, res) => {
  try {
    const { data: pesquisa, error } = await supabase
      .from('nps_pesquisas')
      .select('*')
      .eq('id', req.params.id)
      .is('deleted_at', null)
      .single();
    if (error || !pesquisa) return res.status(404).json({ error: 'Pesquisa não encontrada' });

    const { data: stats } = await supabase
      .from('vw_nps_pesquisa_stats')
      .select('*')
      .eq('pesquisa_id', pesquisa.id)
      .single();

    res.json({ ...pesquisa, stats: stats || null });
  } catch (e) {
    console.error('[nps] get:', e.message);
    res.status(500).json({ error: 'Erro ao buscar pesquisa' });
  }
});

// POST /api/nps  → cria pesquisa (com perguntas já geradas) e notifica
// Criar pesquisa NPS é liberado pra QUALQUER colaborador logado (2026-07-13,
// pedido do Matheus). O que é sensível (respostas/edição/análise) segue gateado.
router.post('/', async (req, res) => {
  try {
    const d = req.body || {};
    if (!d.titulo || !d.objetivo || !d.perguntas) {
      return res.status(400).json({ error: 'título, objetivo e perguntas são obrigatórios' });
    }
    const areaNormalizada = (d.area || 'geral').toLowerCase().slice(0, 60);
    const valorNormalizado = d.valor || null;
    if (!valorNormalizado && areaNormalizada === 'geral') {
      return res.status(400).json({ error: 'Defina um escopo: um valor da CBRio ou uma área específica.' });
    }

    const contextoKpi = TIPOS_KPI_VALIDOS.includes(d.contexto_kpi) ? d.contexto_kpi : 'nps_geral';

    const token = d.permite_publico === false ? null : crypto.randomBytes(18).toString('base64url');

    const insert = {
      titulo: d.titulo.slice(0, 200),
      valor: valorNormalizado,
      objetivo: d.objetivo,
      contexto_kpi: contextoKpi,
      area: areaNormalizada,
      perguntas: d.perguntas,
      ia_modelo: d.ia_modelo || npsService.MODELO_PADRAO,
      ia_prompt: d.ia_prompt || null,
      link_publico_token: token,
      permite_publico: d.permite_publico !== false,
      data_inicio: d.data_inicio || new Date().toISOString().slice(0, 10),
      data_fim: d.data_fim || null,
      status: 'ativa',
      criado_por: req.user.userId,
      import_meta: d.import_meta || null,
    };

    const { data: pesquisa, error } = await supabase
      .from('nps_pesquisas')
      .insert(insert)
      .select()
      .single();
    if (error) throw error;

    // Notificação in-app para colaboradores cadastrados
    try {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id')
        .eq('active', true);
      const targetIds = (profiles || []).map(p => p.id);

      const valorNome = pesquisa.valor ? npsService.VALORES_INFO[pesquisa.valor]?.nome : null;
      const foco = valorNome
        ? `Sua opinião ajuda a melhorar o valor "${valorNome}".`
        : `Sua opinião ajuda a melhorar a área "${pesquisa.area}".`;

      await notificar({
        modulo: 'nps',
        tipo: 'pesquisa_aberta',
        titulo: `Nova pesquisa: ${pesquisa.titulo}`,
        mensagem: `${foco} Leva menos de 2 minutos.`,
        link: `/nps/${pesquisa.id}/responder`,
        severidade: 'info',
        chaveDedup: `nps_${pesquisa.id}`,
        targetIds,
      });
    } catch (notifErr) {
      console.warn('[nps] notificar falhou (criação seguiu):', notifErr.message);
    }

    res.status(201).json(pesquisa);
  } catch (e) {
    console.error('[nps] create:', e.message);
    res.status(500).json({ error: 'Erro ao criar pesquisa' });
  }
});

// PUT /api/nps/:id  → atualizar (encerrar, mudar título, etc)
router.put('/:id', authorizeModule('nps', 1), async (req, res) => {
  try {
    const d = req.body || {};
    // Só o criador, coordenador da área (nps>=3) ou admin/diretor gerencia.
    if (!(await podeGerenciar(req, req.params.id))) {
      return res.status(403).json({ error: 'Sem acesso para editar esta pesquisa.' });
    }
    if (d.area !== undefined && !podeNaArea(req, d.area)) {
      return res.status(403).json({ error: 'Não pode mover a pesquisa para fora da sua área.' });
    }
    const update = {};
    if (d.titulo !== undefined) update.titulo = d.titulo;
    if (d.objetivo !== undefined) update.objetivo = d.objetivo;
    if (d.status !== undefined) update.status = d.status;
    if (d.data_fim !== undefined) update.data_fim = d.data_fim;
    if (d.permite_publico !== undefined) update.permite_publico = d.permite_publico;
    if (d.area !== undefined) update.area = String(d.area).toLowerCase();
    // Editar perguntas após lançada · as respostas JÁ coletadas são preservadas
    // (a nota NPS 0-10 não depende das perguntas; respostas de texto ficam ligadas
    // ao id da pergunta). O frontend mantém os ids das perguntas existentes.
    if (d.perguntas !== undefined) update.perguntas = d.perguntas;

    const { data, error } = await supabase
      .from('nps_pesquisas')
      .update(update)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    // Edição pode mudar área/data/status (encerrar, reativar) → re-sincroniza
    // o agregado no dados_brutos (também garante o valor FINAL da pesquisa
    // encerrada, cobrindo o rabo do throttle do canal público).
    sincronizarKpi(req.params.id).catch(err =>
      console.warn('[nps] sincronizarKpi (update) falhou:', err.message)
    );
    res.json(data);
  } catch (e) {
    console.error('[nps] update:', e.message);
    res.status(500).json({ error: 'Erro ao atualizar pesquisa' });
  }
});

// DELETE /api/nps/:id  → EXCLUIR (soft-delete · some da lista de vez)
// A pesquisa some de todas as listas/telas; as respostas ficam preservadas no
// banco (deleted_at na pesquisa · reversível por super-admin), mas saem dos
// KPIs. Diferente de "Encerrar" (status=encerrada · só trava novas respostas).
router.delete('/:id', authorizeModule('nps', 1), async (req, res) => {
  try {
    if (!(await podeGerenciar(req, req.params.id))) {
      return res.status(403).json({ error: 'Sem acesso para excluir esta pesquisa.' });
    }
    const { error } = await supabase.rpc('app_soft_delete', {
      p_table_name: 'nps_pesquisas',
      p_row_id: req.params.id,
      p_deleted_by: req.user?.userId ?? null,
    });
    if (error) throw error;
    // Pesquisa excluída sai do KPI (a linha agregada dela em dados_brutos é removida).
    removerDadosBrutos(req.params.id).catch(err =>
      console.warn('[nps] removerDadosBrutos falhou:', err.message)
    );
    res.json({ success: true });
  } catch (e) {
    console.error('[nps] delete:', e.message);
    res.status(500).json({ error: 'Erro ao excluir pesquisa' });
  }
});

// ────────────────────────────────────────────────────────────────────
// Respostas
// ────────────────────────────────────────────────────────────────────

// O PostgREST capa cada select em 1000 linhas server-side — um culto de
// domingo já rende ~700 respostas, então uma pesquisa maior truncaria a
// lista (e as estatísticas) em silêncio. Pagina até esgotar.
async function listarRespostasCompletas(pesquisaId, select) {
  const pageSize = 1000;
  let todas = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from('nps_respostas')
      .select(select)
      .eq('pesquisa_id', pesquisaId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    todas = todas.concat(data || []);
    if (!data || data.length < pageSize) break;
  }
  return todas;
}

/**
 * Anexa `turma_nome` em cada resposta que tem `turma_id` (NPS do Next por turma).
 *
 * ⚠️⚠️ POR QUE ISTO EXISTE (03/09/2026). A tela do NPS resolvia o nome da turma
 * com um 2º request pra `next.turmas.list()` (`GET /api/next/turmas`). Quando o
 * `/api/next` ganhou guard de módulo (#2859 · rodava só com `authenticate`),
 * esse request passou a exigir `next` ou `integracao` — e quem cuida do NPS sem
 * ser do Next caía no fallback "Turma (sem nome)" no seletor.
 *
 * Resolver aqui é mais certo que alargar o guard: o NPS já é dono desta linha
 * (é ele que grava `turma_id`), a leitura é do service role, e mata um request
 * de rede que carregava TODAS as turmas só pra usar 1 ou 2 nomes.
 *
 * ⚠️ Nunca quebra a lista de respostas: turma apagada ou leitura com erro só
 * deixa `turma_nome` ausente, e a tela volta ao fallback de antes.
 */
async function anexarNomeDaTurma(respostas) {
  const ids = [...new Set((respostas || []).map(r => r.turma_id).filter(Boolean))];
  if (!ids.length) return respostas;
  try {
    const { data, error } = await supabase
      .from('next_turmas').select('id, nome').in('id', ids).is('deleted_at', null);
    if (error) throw error;
    const nomePorId = new Map((data || []).map(t => [t.id, t.nome]));
    return respostas.map(r => (
      r.turma_id && nomePorId.has(r.turma_id) ? { ...r, turma_nome: nomePorId.get(r.turma_id) } : r
    ));
  } catch (e) {
    console.error('[nps] nome da turma:', e.message);
    return respostas;
  }
}

// GET /api/nps/:id/respostas  → admin/diretor ou criador
router.get('/:id/respostas', async (req, res) => {
  try {
    const { data: pesquisa } = await supabase
      .from('nps_pesquisas').select('criado_por, area').eq('id', req.params.id).is('deleted_at', null).single();
    const isPrivileged = ['admin', 'diretor'].includes(req.user.role);
    const isOwner = pesquisa?.criado_por === req.user.userId;
    const naArea = !!pesquisa && podeNaArea(req, pesquisa.area);
    if (!isPrivileged && !isOwner && !naArea) {
      return res.status(403).json({ error: 'Sem permissão' });
    }

    const data = await listarRespostasCompletas(
      req.params.id,
      'id, score, respostas, comentario, origem, nome_publico, email_publico, profile_id, turma_id, created_at'
    );
    res.json(await anexarNomeDaTurma(data));
  } catch (e) {
    console.error('[nps] respostas:', e.message);
    res.status(500).json({ error: 'Erro ao listar respostas' });
  }
});

// POST /api/nps/:id/responder  → respondente logado
router.post('/:id/responder', async (req, res) => {
  try {
    const { score, respostas, comentario } = req.body || {};
    const { data: pesquisa } = await supabase
      .from('nps_pesquisas').select('id, status, perguntas').eq('id', req.params.id).is('deleted_at', null).single();
    if (!pesquisa) return res.status(404).json({ error: 'Pesquisa não encontrada' });
    if (pesquisa.status !== 'ativa') {
      return res.status(400).json({ error: 'Pesquisa não está ativa' });
    }
    // Escala da nota (10 padrão · 5 nas pesquisas 0-5). A nota é normalizada pra
    // 0-10 no banco (métrica do NPS); o respondente escolhe na escala do form.
    const maxNota = Number(pesquisa.perguntas?.pergunta_nps?.max) || 10;
    if (score === undefined || score === null || score < 0 || score > maxNota) {
      return res.status(400).json({ error: `score deve estar entre 0 e ${maxNota}` });
    }
    const score10 = Math.round((Number(score) / maxNota) * 10);

    const { data, error } = await supabase
      .from('nps_respostas')
      .insert({
        pesquisa_id: pesquisa.id,
        profile_id: req.user.userId,
        score: score10,
        respostas: respostas || {},
        comentario: comentario || null,
        origem: 'logado',
      })
      .select()
      .single();
    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Você já respondeu esta pesquisa' });
      }
      throw error;
    }

    // Atualiza dados_brutos com a nova média (sem bloquear resposta)
    sincronizarKpi(pesquisa.id).catch(err =>
      console.warn('[nps] sincronizarKpi falhou:', err.message)
    );

    res.status(201).json({ ok: true, id: data.id });
  } catch (e) {
    console.error('[nps] responder:', e.message);
    res.status(500).json({ error: 'Erro ao registrar resposta' });
  }
});

// ────────────────────────────────────────────────────────────────────
// Importar respostas de uma planilha (export do Google Forms) → NPS existente
// POST /api/nps/:id/importar-respostas  (multipart 'arquivo'; ?preview=1 = dry-run)
// Mapeia colunas → perguntas por texto (usa import_meta quando existe), converte
// a coluna-nota pra 0-10 e grava nps_respostas (origem 'importado').
// ────────────────────────────────────────────────────────────────────
function perguntasFlat(perguntas) {
  const lista = [];
  const nps = perguntas?.pergunta_nps;
  if (nps) lista.push({ ...nps, id: nps.id || 'nps', _nps: true });
  for (const p of (perguntas?.perguntas_extras || [])) {
    if (p?.tipo === 'secao') continue;
    if (p) lista.push(p);
  }
  return lista;
}
const _isCarimbo = (h) => /carimbo|timestamp|data\/?\s*hora/i.test(_norm(h));
const _isEmail = (h) => /e-?mail|email/i.test(_norm(h));

router.post('/:id/importar-respostas', uploadPlanilha.single('arquivo'), async (req, res) => {
  try {
    if (!(await podeGerenciar(req, req.params.id))) return res.status(403).json({ error: 'Sem permissão' });
    if (!req.file) return res.status(400).json({ error: 'Nenhuma planilha enviada' });
    const { data: pesquisa } = await supabase.from('nps_pesquisas')
      .select('id, perguntas, import_meta').eq('id', req.params.id).is('deleted_at', null).single();
    if (!pesquisa) return res.status(404).json({ error: 'Pesquisa não encontrada' });

    const wb = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false });
    if (!rows.length) return res.status(400).json({ error: 'Planilha vazia' });
    const headers = (rows[0] || []).map(h => (h == null ? '' : String(h)));

    const flat = perguntasFlat(pesquisa.perguntas);
    const meta = pesquisa.import_meta || {};
    const porTexto = {};
    for (const p of flat) porTexto[_norm(p.texto)] = p;
    const idPorTextoImport = {};
    for (const [id, txt] of Object.entries(meta.mapa_textos || {})) idPorTextoImport[_norm(txt)] = id;

    const colDef = headers.map((h, idx) => {
      if (!h) return { idx, papel: 'vazia' };
      if (_isCarimbo(h)) return { idx, papel: 'carimbo', header: h };
      if (_isEmail(h)) return { idx, papel: 'email', header: h };
      const nh = _norm(h);
      let p = porTexto[nh];
      if (!p && idPorTextoImport[nh]) p = flat.find(x => x.id === idPorTextoImport[nh]);
      if (!p) p = flat.find(x => _norm(x.texto) && (_norm(x.texto).includes(nh) || nh.includes(_norm(x.texto))));
      return p ? { idx, papel: 'pergunta', header: h, pergunta: p } : { idx, papel: 'sem_mapa', header: h };
    });

    const notaHeaderOverride = req.body?.nota_coluna || req.query?.nota_coluna;
    const notaPerguntaId = meta.nota?.pergunta_id || flat.find(p => p._nps)?.id || 'nps';
    let notaCol = notaHeaderOverride ? colDef.find(c => c.header === notaHeaderOverride) : null;
    if (!notaCol) notaCol = colDef.find(c => c.papel === 'pergunta' && c.pergunta.id === notaPerguntaId);
    const escalaNota = meta.nota?.escala || { tipo: '0-10' };

    const comentarioCol = colDef.find(c => c.papel === 'pergunta' &&
      (c.pergunta.tipo === 'texto_longo' || /motivo|coment/i.test(c.pergunta.id) || /motivo|coment/i.test(c.pergunta.texto)));

    const linhas = rows.slice(1).filter(r => (r || []).some(v => v != null && String(v).trim() !== ''));
    const construir = (r) => {
      const score = converterNota(notaCol ? r[notaCol.idx] : null, escalaNota);
      if (score == null) return { erro: true };
      const respostas = {};
      for (const c of colDef) {
        if (c.papel !== 'pergunta') continue;
        if (notaCol && c.idx === notaCol.idx) continue; // a nota vira score, não resposta
        const val = r[c.idx];
        if (val == null || String(val).trim() === '') continue;
        respostas[c.pergunta.id] = c.pergunta.tipo === 'multipla'
          ? String(val).split(',').map(s => s.trim()).filter(Boolean)
          : String(val);
      }
      const emailCol = colDef.find(c => c.papel === 'email');
      const carimboCol = colDef.find(c => c.papel === 'carimbo');
      const email = emailCol ? r[emailCol.idx] : null;
      let created_at = null;
      if (carimboCol && r[carimboCol.idx]) {
        const d = new Date(r[carimboCol.idx]);
        if (!isNaN(d.getTime())) created_at = d.toISOString();
      }
      return {
        pesquisa_id: pesquisa.id,
        profile_id: null,
        nome_publico: email ? String(email).split('@')[0].slice(0, 120) : 'Importado',
        email_publico: email ? String(email).toLowerCase().slice(0, 200) : null,
        score,
        respostas,
        comentario: comentarioCol && r[comentarioCol.idx] ? String(r[comentarioCol.idx]).slice(0, 2000) : null,
        origem: 'importado',
        ...(created_at ? { created_at } : {}),
      };
    };

    const construidas = linhas.map(construir);
    const validas = construidas.filter(x => !x.erro);
    const ignoradas = construidas.length - validas.length;

    if (req.query.preview) {
      return res.json({
        total_linhas: linhas.length,
        validas: validas.length,
        ignoradas,
        nota_coluna: notaCol?.header || null,
        nota_ok: !!notaCol,
        mapeamento: colDef.filter(c => c.papel !== 'vazia').map(c => ({
          coluna: c.header, papel: c.papel,
          pergunta: c.papel === 'pergunta' ? c.pergunta.texto : null,
          eh_nota: !!(notaCol && c.idx === notaCol.idx),
        })),
        amostra: validas.slice(0, 5),
        sem_mapa: colDef.filter(c => c.papel === 'sem_mapa').map(c => c.header),
      });
    }

    if (!notaCol) return res.status(400).json({ error: 'Não identifiquei a coluna da nota. Escolha-a na prévia.' });
    if (!validas.length) return res.status(400).json({ error: 'Nenhuma resposta com nota válida pra importar.' });

    let inseridas = 0;
    for (let i = 0; i < validas.length; i += 200) {
      const lote = validas.slice(i, i + 200);
      const { error } = await supabase.from('nps_respostas').insert(lote);
      if (error) throw error;
      inseridas += lote.length;
    }
    sincronizarKpi(pesquisa.id).catch(err => console.warn('[nps] sincronizarKpi:', err.message));
    res.json({ inseridas, ignoradas });
  } catch (e) {
    console.error('[nps] importar-respostas:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao importar respostas' });
  }
});

// POST /api/nps/:id/analisar  → roda análise IA (admin/diretor)
router.post('/:id/analisar', authorizeModule('nps', 1), iaLimiter, async (req, res) => {
  try {
    const { data: pesquisa, error: pErr } = await supabase
      .from('nps_pesquisas').select('*').eq('id', req.params.id).is('deleted_at', null).single();
    if (pErr || !pesquisa) return res.status(404).json({ error: 'Pesquisa não encontrada' });
    if (!podeGerenciarPesquisa(req, pesquisa)) {
      return res.status(403).json({ error: 'Sem acesso para analisar esta pesquisa.' });
    }

    const { data: stats } = await supabase
      .from('vw_nps_pesquisa_stats').select('*').eq('pesquisa_id', pesquisa.id).single();
    const respostas = await listarRespostasCompletas(pesquisa.id, 'score, comentario, respostas');

    const analise = await npsService.analisarRespostas({
      pesquisa,
      stats: stats || { total_respostas: 0, score_medio: 0, nps_score: 0, promoters: 0, passives: 0, detractors: 0 },
      respostas,
    });

    await supabase
      .from('nps_pesquisas')
      .update({ analise_ia: analise, analise_atualizada_em: new Date().toISOString() })
      .eq('id', pesquisa.id);

    res.json(analise);
  } catch (e) {
    console.error('[nps] analisar:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao analisar' });
  }
});

// POST /api/nps/:id/notificar  → re-notifica colaboradores (admin/diretor)
router.post('/:id/notificar', authorizeModule('nps', 1), async (req, res) => {
  try {
    const { data: pesquisa } = await supabase
      .from('nps_pesquisas').select('*').eq('id', req.params.id).is('deleted_at', null).single();
    if (!pesquisa) return res.status(404).json({ error: 'Pesquisa não encontrada' });
    if (!podeGerenciarPesquisa(req, pesquisa)) {
      return res.status(403).json({ error: 'Sem acesso para notificar sobre esta pesquisa.' });
    }

    const { data: profiles } = await supabase
      .from('profiles').select('id').eq('active', true);
    const targetIds = (profiles || []).map(p => p.id);

    const enviadas = await notificar({
      modulo: 'nps',
      tipo: 'pesquisa_lembrete',
      titulo: `Lembrete: ${pesquisa.titulo}`,
      mensagem: 'A pesquisa continua aberta — sua resposta nos ajuda bastante.',
      link: `/nps/${pesquisa.id}/responder`,
      severidade: 'info',
      chaveDedup: `nps_lembrete_${pesquisa.id}_${Date.now()}`,
      targetIds,
    });

    res.json({ enviadas });
  } catch (e) {
    console.error('[nps] notificar:', e.message);
    res.status(500).json({ error: 'Erro ao enviar lembretes' });
  }
});

module.exports = router;
