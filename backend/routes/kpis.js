const express = require('express');
const multer = require('multer');
const router = express.Router();
// varredura 2026-09: `authorizeModule` entrou no import — as leituras de pessoa deste arquivo passaram a ser gateadas pela matriz cargo × módulo.
const { authenticate, authorize, authorizeModule, getEffectiveLevel } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { criarGuardasCultos, campusLocal, destinatariosDecisaoCampus } = require('../services/campusCultos');
const campusCultos = criarGuardasCultos();
const { criarGuardasRegistro } = require('../services/campusRegistro');
const campusBatismos = criarGuardasRegistro({ modulo: 'batismo', tabela: 'batismo_inscricoes' });
const campusBatismoHorarios = criarGuardasRegistro({ modulo: 'batismo', tabela: 'batismo_horarios' });
const { filtrarCampus, carimbarCampus } = require('../utils/campusQuery');
const { lerTodasPaginas } = require('../utils/campusPaginacao');
const { listarBatismos, listarHorarios, validarHorario } = require('../services/campusBatismoAdmin');
const { salvar: salvarInscricaoBatismo, registrarCheckin: registrarCheckinBatismo } = require('../services/campusBatismoInscricao');
const { lerConfigBatismo, salvarConfigBatismo, salvarFotoReferencia } = require('../services/campusBatismoArquivos');
const { coberturaBatismo } = require('../services/campusBatismoCobertura');
const { responderErroCampus } = require('../services/campusContexto');
const { notificar } = require('../services/notificar');
const { coletarTodos } = require('../services/kpiAutoCollector');
const { tipoVigenteEm } = require('../utils/lentesDomingo');
const { acharOuCriarGuardado } = require('../services/membroMatch');
const { reconciliarCpfTardio, propagarCpfConvertido } = require('../services/cpfReconciliar');
const { cpfValido } = require('../utils/cpf');
// varredura 2026-09: a `idade` da decisão era calculada no NAVEGADOR e o buscador parou de devolver o nascimento — o servidor passa a derivá-la. Reusa a régua que já existe (dia em BRT, não UTC).
const { idadeEmAnos, hojeBRT } = require('../utils/inscricaoMenor');
// Divisor da média de frequência da mandala = nº de DOMINGOS (régua pura · o
// cabeçalho de utils/divisorMandala.js tem o porquê e os números medidos).
const { divisorDomingos } = require('../utils/divisorMandala');
const painelCache = require('../services/painelCache');
const { isAuthorizedCron } = require('../utils/cronAuth');

// Upload em memória da selfie de referência do check-in de batismo (quiosque).
const uploadFotoRef = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpe?g|png|webp)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Formato inválido (use JPG, PNG ou WebP)'));
  },
});

// ⚠️⚠️ O `authenticate` ENGOLIA O CRON ANTES DO HANDLER (conserto de 11/08/2026).
//
// O `router.use(authenticate)` roda antes de qualquer rota deste arquivo. O
// Vercel Cron chama com `Authorization: Bearer <CRON_SECRET>`; o `authenticate`
// tenta validar isso como JWT do Supabase, falha, e devolve **401**. Resultado:
// a checagem `isAuthorizedCron(req) || isAdmin` escrita dentro dos handlers era
// CÓDIGO MORTO para cron — nunca era alcançada.
//
// Medido antes do conserto, em `system_job_runs`: HTTP_401 em **11 de 11**
// execuções de `/api/kpis/youtube/sync` e o mesmo em `/api/kpis/cultos/auto-create`
// e `/api/governanca/cron/lembrete`. Três rotinas que não faziam nada, todos os
// dias, em silêncio — quem percebeu foi o alarme de incidente, não uma pessoa.
//
// ⚠️ A LISTA É EXPLÍCITA de propósito. Deixar qualquer requisição com
// CRON_SECRET passar por todo o router transformaria o segredo do cron numa
// chave-mestra para as dezenas de rotas autenticadas daqui. Só entram caminhos
// que TÊM cron no `vercel.json`, e o handler continua fazendo a própria
// verificação (agora alcançável).
//
// ⚠️ Sem segredo válido nada muda: cai no `authenticate` normal, então admin e
// diretor seguem podendo disparar a rotina à mão pela tela.
// ⚠️ LISTA, e não o prefixo `/cron/` usado em governanca.js e totemKids.js: esta
// rotina se chama `/cultos/auto-create` (a tela chama o MESMO caminho por POST),
// então não cai na convenção. Renomear pra `/cron/...` quebraria o botão da tela.
// Rota de cron NOVA neste arquivo deve nascer sob `/cron/` — aí some a lista.
const CAMINHOS_DE_CRON = new Set(['/cultos/auto-create']);
router.use((req, res, next) => (
  CAMINHOS_DE_CRON.has(req.path) && isAuthorizedCron(req)
    ? next()
    : authenticate(req, res, next)
));

// Helper: permite escrita em cultos/decisoes/batismos pra admin/diretor OU
// quem tem 'integração' em kpi_areas (Lorena, líder de Integração).
// Auditoria de pre-liberacao identificou que essas rotas estavam so com
// authenticate · qualquer usuário logado escrevia. Agora restringido.
function authorizeIntegracao(req, res, next) {
  const u = req.user || {};
  if (['admin', 'diretor'].includes(u.role)) return next();
  const areas = (u.kpi_areas || []).map(a => String(a).toLowerCase());
  if (areas.includes('integracao')) return next();
  // Honra a matriz granular (cargo × módulo): nível >=2 em integracao = lançar
  // dado bruto. Ex.: supervisor-jornada (Marcelo) tem nível 3 pela matriz sem
  // estar em kpi_areas — sem isto, o guard legado o bloqueava (403).
  if ((getEffectiveLevel(req, 'integracao') || 0) >= 2) return next();
  return res.status(403).json({
    error: 'Sem permissão · necessário ser admin, diretor ou líder de Integração',
  });
}

// Helper: escrita em BATISMO · aceita quem tem Integração (admin/diretor, área
// integracao, ou nível >=2 na matriz de integracao) OU o módulo dedicado
// `batismo` >=2 (cargo responsavel-batismo · acesso isolado a batismo).
// Guard SEPARADO de propósito: quem só tem `batismo` NÃO pode escrever em
// cultos/decisões (que seguem em authorizeIntegracao). Fail-closed.
function authorizeBatismo(req, res, next) {
  const u = req.user || {};
  if (['admin', 'diretor'].includes(u.role)) return next();
  const areas = (u.kpi_areas || []).map(a => String(a).toLowerCase());
  if (areas.includes('integracao')) return next();
  if ((getEffectiveLevel(req, 'integracao') || 0) >= 2) return next();
  if ((getEffectiveLevel(req, 'batismo') || 0) >= 2) return next();
  // Conta de quiosque do lounge: o check-in de batismo (etiqueta QR + selfie)
  // é operado no próprio Totem Membro.
  if ((getEffectiveLevel(req, 'totem-membro') || 0) >= 2) return next();
  return res.status(403).json({
    error: 'Sem permissão · necessário acesso a Batismo ou Integração',
  });
}

// ── varredura 2026-09 · LEITURA de pessoa neste arquivo (achado A02) ─────────
// As ESCRITAS de culto/decisão/batismo já estavam em authorizeIntegracao /
// authorizeBatismo (acima); só as LEITURAS ficaram com `authenticate` puro.
// Medido em `profiles` (205 linhas): 184 contas role='assistente' ativas — o
// voluntário comum com login, incluindo quem só usa o app — liam em JSON
// `cultos_decisoes_pessoas` (218 linhas, com CPF, data_nascimento e o
// responsável do menor) e `batismo_inscricoes` (634, com CPF, nascimento e
// `possui_deficiencia`): convicção religiosa + saúde, art. 11 da LGPD.
//
// ⚠️ A régua de leitura SOMA com a régua da escrita. `authorizeModule` só olha a
// matriz cargo × módulo; authorizeIntegracao/authorizeBatismo também aceitam
// `profiles.kpi_areas` (fonte DIFERENTE de `usuario_areas`, que é a que gera o
// boost da matriz). Sem somar, o dono legítimo do dado (líder de Integração por
// kpi_areas) tomaria 403 na LISTA e continuaria com o botão de gravar.
// ⚠️ O deny explícito por pessoa (`modulosBloqueados`) vence: é conferido ANTES
// do atalho de kpi_areas, igual faz o `authorizeModule`.
// ⚠️ Trava POR ROTA, nunca `router.use`: `/dashboard`, `/cultura` e `/metas`
// deste arquivo são agregados sem PII e alimentam o /painel.
const _gateIntegracaoLeitura = authorizeModule('integracao', 1);
const _gateIntegracaoNominal = authorizeModule('integracao', 2);
const _gateBatismoLeitura = authorizeModule('batismo-leitura', 1);

// kpi_areas (profiles) inclui a área, e o módulo não está bloqueado por override.
function _porAreaKpi(req, slug) {
  const u = req.user || {};
  if ((u.granular?.modulosBloqueados || []).includes(slug)) return false;
  return (u.kpi_areas || []).map(a => String(a).toLowerCase()).includes(slug);
}

// Leitura de decisões (nível 1 = ver a lista do próprio módulo).
function authorizeIntegracaoLeitura(req, res, next) {
  if (_porAreaKpi(req, 'integracao')) return next();
  return _gateIntegracaoLeitura(req, res, next);
}

// Leitura NOMINAL sobre a base inteira (buscador por CPF/nome) · exige nível 2,
// a mesma régua de "resposta nominal" usada em membresia/censo.
function authorizeIntegracaoNominal(req, res, next) {
  if (_porAreaKpi(req, 'integracao')) return next();
  return _gateIntegracaoNominal(req, res, next);
}

// Leitura de batismo · espelha authorizeBatismo em modo leitura: a tela
// `/batismo` é gateada por `batismo` e a aba Batismos da Integração por
// `integracao` (src/App.tsx:845-846), então as duas portas valem.
function authorizeBatismoLeitura(req, res, next) {
  if (_porAreaKpi(req, 'integracao')) return next();
  return _gateBatismoLeitura(req, res, next);
}

// Helper: valida número >= 0 (rejeita negativos antes do INSERT/UPDATE)
function nonNeg(v, fallback = 0) {
  const n = Number(v);
  if (Number.isNaN(n) || n < 0) return fallback;
  return n;
}

// Helper: data de hoje em America/Sao_Paulo (YYYY-MM-DD · en-CA = ISO).
function hojeSP() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

// ── Service Types (culto types) ───────────────────────────────────────────────
router.get('/service-types', async (req, res) => {
  const { data, error } = await supabase
    .from('vol_service_types')
    .select('id, name, color, recurrence_day, recurrence_time, has_online_stream')
    .eq('is_active', true)
    .order('recurrence_day')
    .order('recurrence_time');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── Cultos ────────────────────────────────────────────────────────────────────
router.get('/cultos', campusCultos.contexto, async (req, res) => {
  const { limit = 100, offset = 0, service_type_id, data_inicio, data_fim } = req.query;
  let query = supabase
    .from('vw_culto_stats')
    .select('*')
    .eq('igreja_id', campusLocal(req))
    .is('deleted_at', null)
    .order('data', { ascending: false })
    .order('hora', { ascending: false })
    .range(Number(offset), Number(offset) + Number(limit) - 1);
  if (service_type_id) query = query.eq('service_type_id', service_type_id);
  if (data_inicio)     query = query.gte('data', data_inicio);
  if (data_fim)        query = query.lte('data', data_fim);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post('/cultos', authorizeIntegracao, campusCultos.contexto, campusCultos.payload, async (req, res) => {
  const {
    service_type_id, nome, data, hora,
    presencial_adulto, presencial_kids,
    decisoes_presenciais, decisoes_online, decisoes_kids,
    youtube_video_id, online_pico, observacoes,
  } = req.body;
  if (!data || !hora || !nome) return res.status(400).json({ error: 'data, hora e nome são obrigatórios' });

  const { data: culto, error } = await supabase
    .from('cultos')
    .insert({
      igreja_id: campusLocal(req),
      service_type_id, nome, data, hora,
      presencial_adulto:    nonNeg(presencial_adulto),
      presencial_kids:      nonNeg(presencial_kids),
      decisoes_presenciais: nonNeg(decisoes_presenciais),
      decisoes_online:      nonNeg(decisoes_online),
      decisoes_kids:        nonNeg(decisoes_kids),
      youtube_video_id: youtube_video_id || null,
      online_pico: online_pico ? nonNeg(online_pico, null) : null,
      observacoes: observacoes ? String(observacoes).trim() : null,
      inserido_por: req.user.userId || req.user.id,
    })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(culto);
});

router.put('/cultos/:id', authorizeIntegracao, campusCultos.contexto, campusCultos.payload, campusCultos.culto, async (req, res) => {
  const allowed = [
    'presencial_adulto', 'presencial_kids',
    'decisoes_presenciais', 'decisoes_online', 'decisoes_kids',
    // Decisões online FORA do formulário (chat e outros) · 14/09/2026. O
    // trigger `fn_cultos_dec_online_extra_ajusta` recompõe `decisoes_online`
    // (total) por delta — o modal manda SÓ este campo, nunca o total.
    'decisoes_online_extra',
    'youtube_video_id', 'online_pico', 'nome',
    'online_ds', 'online_ddus',
    'voluntarios_escalados', 'voluntarios_checkin',
    'observacoes',
    // Flags de lançamento (boolean) · marcam seção preenchida incl. 0 explícito.
    'frequencia_lancada', 'decisoes_lancadas',
  ];
  const camposNumericos = [
    'presencial_adulto', 'presencial_kids',
    'decisoes_presenciais', 'decisoes_online', 'decisoes_kids',
    'decisoes_online_extra',
    'online_pico', 'online_ds', 'online_ddus',
    'voluntarios_escalados', 'voluntarios_checkin',
  ];
  const update = { updated_at: new Date().toISOString() };
  for (const [k, v] of Object.entries(req.body)) {
    if (!allowed.includes(k)) continue;
    if (v === '' || v === null || v === undefined) { update[k] = null; continue; }
    if (camposNumericos.includes(k)) {
      const n = Number(v);
      if (Number.isNaN(n) || n < 0) {
        return res.status(400).json({ error: `Campo ${k} deve ser número >= 0 (recebido: ${v})` });
      }
      update[k] = n;
    } else {
      update[k] = v;
    }
  }
  const { data, error } = await supabase
    .from('cultos').update(update).eq('id', req.params.id)
    .eq('igreja_id', campusLocal(req)).is('deleted_at', null).select().maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Culto não encontrado.' });

  // KPIs auto-cultos/batismos são recalculados via trigger SQL (migration
  // 20260514210000_kpis_trigger_realtime.sql · trg_kpi_recalcular_culto).
  // Aqui so limpa o cache do /painel pra forcar releitura do dado novo.
  painelCache.bust('');

  res.json(data);
});

router.delete('/cultos/:id', authorize('admin', 'diretor'), campusCultos.contexto, campusCultos.culto, async (req, res) => {
  const { data, error } = await supabase.rpc('fn_campus_soft_delete_culto', {
    p_culto_id: req.params.id, p_igreja_id: campusLocal(req), p_usuario_id: req.user.id,
  });
  if (error) return res.status(500).json({ error: error.message });
  if (data !== true) return res.status(404).json({ error: 'Culto não encontrado.' });
  painelCache.bust('');
  res.json({ ok: true });
});

// Conta automática de voluntários escalados/checkin · usada no modal pra
// mostrar valor sugerido. Quando user salva nas colunas manuais, sobrescreve.
router.get('/cultos/:id/voluntarios', async (req, res) => {
  const { data, error } = await supabase
    .from('vw_culto_voluntarios')
    .select('escalados_manual, checkin_manual, escalados_auto, checkin_auto, escalados, checkin')
    .eq('culto_id', req.params.id)
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || { escalados_auto: 0, checkin_auto: 0, escalados_manual: null, checkin_manual: null });
});

// ── Decisões com dados das pessoas (cultos_decisoes_pessoas) ──────────────────
// 1 row por pessoa que decidiu no culto · vincula opcionalmente a mem_membros.

// varredura 2026-09: era só `authenticate` e devolvia nome/CPF/nascimento/responsável de quem decidiu — leitura de decisão agora exige Integração.
router.get('/cultos/:id/decisoes-pessoas', authorizeIntegracaoLeitura, campusCultos.contexto, campusCultos.culto, async (req, res) => {
  const { data, error } = await supabase
    .from('cultos_decisoes_pessoas')
    .select('id, culto_id, membro_id, nome, telefone, email, idade, data_nascimento, cpf, tipo_decisao, observacoes, status_followup, registrado_em, registrado_por, responsavel_nome, responsavel_telefone, responsavel_cpf')
    .eq('culto_id', req.params.id)
    .eq('igreja_id', campusLocal(req))
    .is('deleted_at', null)
    .order('registrado_em', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// Decisões históricas que foram importadas (planilha, etc) e NÃO tem
// culto vinculado. Vem de mem_trilha_valores etapa='conversao' filtrando
// por observacoes/origem. Alimenta a aba Pessoas em /integracao/decisoes
// pra incluir esse histórico junto com as decisões registradas em cultos.
// varredura 2026-09: era só `authenticate` e devolvia CPF/nascimento de convertido importado — leitura de decisão agora exige Integração.
router.get('/decisoes-pessoas/historico-importado', authorizeIntegracaoLeitura, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 500, 2000);
    const desdeDias = Number(req.query.dias) || 365;
    const desde = new Date();
    desde.setDate(desde.getDate() - desdeDias);

    // Trilha de conversao importada · join com mem_membros pra dados
    const { data: trilhas, error } = await supabase
      .from('mem_trilha_valores')
      .select('membro_id, data_conclusao, observacoes, mem_membros(id, nome, telefone, cpf, data_nascimento, status, observacoes)')
      .eq('etapa', 'conversao')
      .eq('concluida', true)
      .ilike('observacoes', '%importacao%')
      .gte('data_conclusao', desde.toISOString().slice(0, 10))
      .order('data_conclusao', { ascending: false })
      .limit(limit);

    if (error) throw error;

    const items = (trilhas || [])
      .filter(t => t.mem_membros)
      .map(t => ({
        id: t.membro_id,
        membro_id: t.membro_id,
        nome: t.mem_membros.nome,
        telefone: t.mem_membros.telefone,
        cpf: t.mem_membros.cpf,
        data_nascimento: t.mem_membros.data_nascimento,
        data_conversao: t.data_conclusao,
        status_membro: t.mem_membros.status,
        origem: 'importacao_planilha',
        observacoes_membro: t.mem_membros.observacoes,
      }));

    res.json({ total: items.length, items });
  } catch (e) {
    console.error('[kpis/decisoes-pessoas/historico-importado]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Decisões com cadastro incompleto (sem CPF ou sem data_nascimento)
// Marcos: "futuramente quando tivermos esse convertido já alinhado na
// jornada vamos conseguir buscar melhor esses dados em um censo posterior"
// varredura 2026-09: era só `authenticate` e lista até 1.000 convertidos com CPF/nascimento — leitura de decisão agora exige Integração.
router.get('/decisoes-pessoas/incompletos', authorizeIntegracaoLeitura, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 200, 1000);
  const { data, error } = await supabase
    .from('cultos_decisoes_pessoas')
    .select(`
      id, culto_id, membro_id, nome, telefone, email, idade, data_nascimento, cpf,
      tipo_decisao, status_followup, registrado_em,
      culto:culto_id(id, data, service_type_id, service_type_name)
    `)
    .or('cpf.is.null,data_nascimento.is.null')
    .order('registrado_em', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('[kpis/decisoes-pessoas/incompletos]', error.message);
    return res.status(500).json({ error: error.message });
  }
  const items = (data || []).map(p => ({
    ...p,
    falta_cpf:   !p.cpf,
    falta_nasc:  !p.data_nascimento,
  }));
  res.json({
    total: items.length,
    items,
  });
});

// Busca de membro/visitante por nome, CPF, email, telefone
// Usada pelo autocomplete no modal antes de cadastrar manual
// varredura 2026-09: com 5 dígitos de CPF isto era um oráculo CPF→nome/telefone/nascimento sobre 4.082 membros + 4.535 visitantes do WiFi — agora nível 2 em Integração.
router.get('/decisoes-pessoas/buscar-membro', authorizeIntegracaoNominal, async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json([]);

  const cpfLimpo = q.replace(/\D/g, '');
  // varredura 2026-09: exigia só PREFIXO de 5 dígitos (11 chamadas varrem o CPF inteiro) — agora só CPF COMPLETO busca por documento.
  // varredura 2026-09 · sem `cpfValido` na BUSCA: o que mata a varredura por prefixo são os 11 DÍGITOS, não o DV. Medido em `mem_membros` vivos: 2.073 têm CPF (50,8%) e 4 deles têm DV INVÁLIDO (legado importado, todos com 11 dígitos). Exigir DV aqui faria o operador digitar o CPF ditado, não achar ninguém e cadastrar decisão NOVA — pessoa duplicada em vez de vínculo. A ESCRITA (POST, abaixo) continua exigindo DV: lá o CPF entra sob índice UNIQUE e um errado bloqueia o dono verdadeiro.
  const isCpf = cpfLimpo.length === 11 && /^\d+$/.test(cpfLimpo);
  const escaped = q.replace(/[%_,()]/g, '\\$&');

  // 1) Membros cadastrados
  let memQuery = supabase
    .from('mem_membros')
    // varredura 2026-09: `data_nascimento` saiu do select (ninguém mais o recebe) e o `cpf` fica só pra montar os 2 últimos dígitos e casar o filtro por documento.
    .select('id, nome, email, telefone, cpf, status')
    .is('deleted_at', null)
    .limit(10);

  // 2) Pessoas da lista do WiFi (portal · podem ainda não ser membros)
  let wifiQuery = supabase
    .from('wifi_visitantes')
    // varredura 2026-09: `id` entrou no select — é a referência OPACA que o POST usa pra recompor o CPF do visitante (ver `wifi_id` no payload abaixo).
    .select('id, nome, email, telefone, cpf, cpf_norm, tel_norm, membro_id, data_acesso')
    .is('deleted_at', null)
    .order('data_acesso', { ascending: false, nullsFirst: false })
    .limit(30);

  if (isCpf) {
    memQuery = memQuery.ilike('cpf', `${cpfLimpo}%`);
    wifiQuery = wifiQuery.ilike('cpf_norm', `${cpfLimpo}%`);
  } else {
    memQuery = memQuery.or(`nome.ilike.%${escaped}%,email.ilike.%${escaped}%,telefone.ilike.%${escaped}%`);
    wifiQuery = wifiQuery.or(`nome.ilike.%${escaped}%,email.ilike.%${escaped}%,telefone.ilike.%${escaped}%`);
  }

  const [memRes, wifiRes] = await Promise.all([memQuery, wifiQuery]);

  if (memRes.error) {
    console.error('[kpis/decisoes-pessoas buscar-membro]', memRes.error.message);
    return res.status(500).json({ error: memRes.error.message });
  }
  if (wifiRes.error) {
    // WiFi é complementar · não derruba a busca de membros
    console.error('[kpis/decisoes-pessoas buscar-membro wifi]', wifiRes.error.message);
  }

  // varredura 2026-09: o CPF e o nascimento NÃO voltam mais no payload — só os 2 últimos dígitos, o bastante pra desambiguar homônimo sem entregar o documento.
  const doisUltimos = (v) => {
    const d = String(v || '').replace(/\D/g, '');
    return d ? d.slice(-2) : null;
  };
  const out = (memRes.data || []).map(m => ({
    id: m.id, nome: m.nome, email: m.email, telefone: m.telefone, status: m.status,
    cpf_final: doisUltimos(m.cpf), membro_id: m.id, origem: 'membro',
  }));
  const idsMembro = new Set(out.map(m => m.id));
  const vistosWifi = new Set();

  for (const w of (wifiRes.data || [])) {
    // se já está vinculada a um membro que veio na busca de membros, evita duplicar
    if (w.membro_id && idsMembro.has(w.membro_id)) continue;
    const chave = w.cpf_norm || w.tel_norm || (w.nome || '').toLowerCase().trim();
    if (!chave || vistosWifi.has(chave)) continue;
    vistosWifi.add(chave);
    out.push({
      // varredura 2026-09: o id deixava de fora a máscara — `chave` é o `cpf_norm` (todos os 4.535 visitantes vivos têm), então `wifi:<chave>` devolvia o CPF INTEIRO no payload. Agora vai o id opaco da linha.
      id: w.membro_id || `wifi:${w.id}`,
      membro_id: w.membro_id || null,
      // varredura 2026-09: referência OPACA da linha do WiFi — o POST recompõe o CPF a partir dela (mesma ideia da recomposição por `membro_id`). Sem isto a decisão do visitante nasce SEM documento, cai em `/decisoes-pessoas/incompletos` e o trigger que resolve/cria `mem_membros` passa a casar só por nome/telefone.
      wifi_id: w.id,
      nome: w.nome,
      email: w.email,
      telefone: w.telefone,
      // varredura 2026-09: mesma máscara do ramo de membros — o visitante do WiFi nunca consentiu com consulta de documento.
      cpf_final: doisUltimos(w.cpf_norm || w.cpf),
      status: w.membro_id ? null : 'visitante',
      origem: 'wifi',
    });
    if (out.length >= 25) break;
  }

  res.json(out);
});

// GET /cultos/links-decisoes?inicio=&fim= — os links de TODOS os cultos de um
// período (na prática: a semana escolhida no calendário), pra a Integração
// distribuir ANTES do culto.
//
// ⚠️ Existe porque a distribuição é ANTECIPADA e o lançamento não é: o link é
// mandado no grupo dos voluntários na semana, e cada um só consegue lançar no
// dia do culto (a janela é reconferida no servidor a cada uso, em
// `publicDecisaoCulto`). Pedir link culto a culto na véspera é o tipo de tarefa
// que ninguém faz 4 vezes num domingo — e porta sem caminho de distribuição não
// existe na prática (foi assim que o formulário do online passou 3 meses no ar
// com zero registros).
//
// ⚠️ Rota LITERAL declarada antes de qualquer `/cultos/:id/...` de um segmento
// só — no Express o primeiro match vence, e é assim que `/cultos/auto-create`
// já convive com os handlers por id.
router.get('/cultos/links-decisoes', authorizeIntegracao, async (req, res) => {
  try {
    const { montarLinkCulto } = require('../utils/cultoToken');
    const ISO = /^\d{4}-\d{2}-\d{2}$/;
    const inicio = String(req.query.inicio || '').slice(0, 10);
    const fim = String(req.query.fim || '').slice(0, 10);
    if (!ISO.test(inicio) || !ISO.test(fim)) {
      return res.status(400).json({ error: 'Informe inicio e fim no formato AAAA-MM-DD.' });
    }
    if (fim < inicio) return res.status(400).json({ error: 'O fim não pode ser anterior ao início.' });

    const { data, error } = await supabase
      .from('vw_culto_stats')
      .select('id, data, hora, nome, service_type_name')
      .gte('data', inicio)
      .lte('data', fim)
      .order('data', { ascending: true })
      .order('hora', { ascending: true })
      .limit(100);
    if (error) throw error;

    const cultos = (data || []).map(c => ({
      id: c.id,
      data: c.data,
      hora: c.hora,
      nome: c.service_type_name || c.nome || 'Culto',
      // `null` quando não há segredo configurado (fail-closed): a tela declara
      // "indisponível" em vez de o conferente mandar no grupo um link que não
      // abre pra ninguém.
      link: montarLinkCulto(c.id),
    }));
    res.json({ inicio, fim, cultos });
  } catch (e) {
    console.error('[kpis/links-decisoes]', e.message);
    res.status(500).json({ error: 'Erro ao gerar os links da semana' });
  }
});

// GET /cultos/:id/link-decisoes — link assinado pro VOLUNTÁRIO lançar as
// decisões daquele culto pelo celular, na hora, sem login.
//
// ⚠️ O link é o único caminho de distribuição que existe: sem um botão aqui, a
// porta nova não chega em ninguém. Foi exatamente isso que matou o formulário
// do online — ele existe desde junho, nunca teve QR nem link divulgado, e por
// isso registrou ZERO decisões em 3 meses.
//
// Devolve `null` quando não há segredo configurado (fail-closed): a tela mostra
// "indisponível" em vez de entregar um link quebrado que o voluntário
// distribui e ninguém consegue usar.
router.get('/cultos/:id/link-decisoes', authorizeIntegracao, async (req, res) => {
  try {
    const { montarLinkCulto } = require('../utils/cultoToken');
    const { data: c } = await supabase
      .from('cultos').select('id, data').eq('id', req.params.id).maybeSingle();
    if (!c) return res.status(404).json({ error: 'Culto não encontrado' });
    res.json({ link: montarLinkCulto(c.id), data: c.data });
  } catch (e) {
    console.error('[kpis/link-decisoes]', e.message);
    res.status(500).json({ error: 'Erro ao gerar o link' });
  }
});

router.post('/cultos/:id/decisoes-pessoas', authorizeIntegracao, campusCultos.contexto, campusCultos.payload, campusCultos.culto, campusCultos.referenciasDecisao, async (req, res) => {
  const {
    nome, telefone, email, idade, data_nascimento, cpf,
    tipo_decisao, observacoes, membro_id,
    responsavel_nome, responsavel_telefone, responsavel_cpf,
    wifi_id, // varredura 2026-09: referência opaca devolvida pelo buscador pro visitante de WiFi — o CPF dele não trafega mais, é recomposto abaixo.
  } = req.body || {};

  if (!nome || String(nome).trim().length < 2) {
    return res.status(400).json({ error: 'Nome obrigatorio (min 2 chars)' });
  }

  const tipo = ['presencial', 'online', 'kids'].includes(tipo_decisao) ? tipo_decisao : 'presencial';

  // Validacoes diferentes conforme tipo:
  // - presencial/online: telefone da pessoa eh obrigatório (11 digitos)
  // - kids: nome da criança + dados do responsável (telefone responsável
  //   obrigatório · CPF responsável opcional)
  let telLimpo = telefone ? String(telefone).replace(/\D/g, '') : '';
  let cpfLimpo = cpf ? String(cpf).replace(/\D/g, '') : null;
  // varredura 2026-09: o buscador parou de devolver cpf/nascimento, então o valor agora é recomposto do CADASTRO abaixo (a tela já não tem o que copiar).
  let nascLimpo = data_nascimento || null;
  let respTelLimpo = responsavel_telefone ? String(responsavel_telefone).replace(/\D/g, '') : '';
  let respCpfLimpo = responsavel_cpf ? String(responsavel_cpf).replace(/\D/g, '') : null;

  if (tipo === 'kids') {
    if (!responsavel_nome || String(responsavel_nome).trim().length < 2) {
      return res.status(400).json({ error: 'Nome do responsável obrigatório (min 2 chars) pra decisão Kids' });
    }
    if (respTelLimpo.length !== 11) {
      return res.status(400).json({ error: 'Telefone do responsável deve ter 11 digitos pra decisão Kids' });
    }
    if (respCpfLimpo && (respCpfLimpo.length !== 11 || !cpfValido(respCpfLimpo))) {
      return res.status(400).json({ error: 'CPF do responsável inválido — confira os dígitos (ou deixe vazio)' });
    }
    // Criança não precisa de telefone próprio
    telLimpo = telLimpo || '';
    if (telLimpo && telLimpo.length !== 11) {
      return res.status(400).json({ error: 'Telefone da criança (se preenchido) deve ter 11 digitos' });
    }
  } else {
    // presencial / online
    if (telLimpo.length !== 11) {
      return res.status(400).json({ error: 'Telefone deve ter 11 digitos (DDD + 9 + numero)' });
    }
    if (cpfLimpo && (cpfLimpo.length !== 11 || !cpfValido(cpfLimpo))) {
      // DV no servidor: com o CPF sob índice UNIQUE, um CPF digitado errado
      // "ocupa a vaga" e bloqueia o dono verdadeiro em todas as portas.
      return res.status(400).json({ error: 'CPF inválido — confira os dígitos' });
    }
  }

  // varredura 2026-09: compensa o buscador mascarado — pessoa JÁ VINCULADA tem
  // CPF e nascimento no cadastro, e sem isto a decisão nasceria vazia e cairia
  // no relatório de `/decisoes-pessoas/incompletos` (fonte passa a ser o
  // cadastro, não o navegador). Só consulta quando falta algo.
  if (membro_id && tipo !== 'kids' && (!cpfLimpo || !nascLimpo)) {
    const { data: cad, error: erroCadastro } = await supabase
      .from('mem_membros')
      .select('cpf, data_nascimento')
      .eq('id', membro_id)
      .eq('igreja_id', campusLocal(req))
      .is('deleted_at', null)
      .maybeSingle();
    if (erroCadastro) return res.status(503).json({ error: 'Não foi possível verificar o cadastro. Tente novamente.' });
    if (!cad) return res.status(404).json({ error: 'Membro não encontrado neste campus.' });
    if (cad) {
      if (!cpfLimpo && cad.cpf) cpfLimpo = String(cad.cpf).replace(/\D/g, '') || null;
      if (!nascLimpo && cad.data_nascimento) nascLimpo = cad.data_nascimento;
    }
  }

  // varredura 2026-09: mesma recomposição pro ramo do WiFi. O visitante não tem
  // linha em `mem_membros` (é justamente quem o trigger vai criar), então sem
  // isto a decisão nasce SEM CPF — o dado que `/decisoes-pessoas/incompletos`
  // cobra — e o trigger passa a casar só por nome/telefone. Só consulta quando
  // falta: um CPF digitado na mão (já validado no DV acima) vence a referência.
  if (wifi_id && tipo !== 'kids' && !cpfLimpo) {
    const { data: vis } = await supabase
      .from('wifi_visitantes')
      .select('cpf, cpf_norm')
      .eq('id', wifi_id)
      .is('deleted_at', null)
      .maybeSingle();
    const dVis = String(vis?.cpf_norm || vis?.cpf || '').replace(/\D/g, '');
    if (dVis.length === 11) cpfLimpo = dVis;
  }

  // varredura 2026-09: a `idade` vinha calculada do NAVEGADOR a partir do
  // nascimento que o buscador deixou de devolver — sem derivar aqui ela nasceria
  // NULL pra TODA decisão de membro vinculado. Deriva do nascimento já recomposto
  // acima; `hojeBRT` porque das 21h do Rio em diante o dia UTC já virou e quem
  // faz aniversário amanhã contaria um ano a mais. Faixa 0–120 espelha a mesma
  // sanidade que a tela aplicava (`calcularIdade` em CalendarioCultos.jsx).
  let idadeFinal = idade ? Number(idade) : null;
  if (idadeFinal == null && nascLimpo) {
    const derivada = idadeEmAnos(nascLimpo, hojeBRT());
    if (derivada !== null && derivada >= 0 && derivada <= 120) idadeFinal = derivada;
  }

  // Se não veio membro_id explicito, trigger BEFORE INSERT resolve/cria
  // (trigger pula tipo='kids' · não cria mem_membros pra criança por LGPD)
  const { data, error } = await supabase
    .from('cultos_decisoes_pessoas')
    .insert({
      culto_id: req.params.id,
      igreja_id: campusLocal(req),
      membro_id: tipo === 'kids' ? null : (membro_id || null),
      nome: String(nome).trim(),
      telefone: telLimpo || null,
      email: email ? String(email).trim().toLowerCase() : null,
      idade: idadeFinal, // varredura 2026-09: derivada do nascimento quando a tela não mandou (o buscador não devolve mais o nascimento pra ela calcular).
      data_nascimento: nascLimpo, // varredura 2026-09: valor já recomposto do cadastro quando a tela não tinha o dado.
      cpf: cpfLimpo,
      tipo_decisao: tipo,
      observacoes: observacoes || null,
      responsavel_nome:     tipo === 'kids' ? String(responsavel_nome).trim() : null,
      responsavel_telefone: tipo === 'kids' ? respTelLimpo : null,
      responsavel_cpf:      tipo === 'kids' ? respCpfLimpo : null,
      registrado_por: req.user?.id || null,
    })
    .select()
    .single();
  if (error) {
    console.error('[kpis/decisoes-pessoas POST]', error.message);
    return res.status(500).json({ error: error.message });
  }

  // Avisa o time de Cuidados (Marcelo + Wesley) pra entrar em contato com quem
  // tomou a decisão. Fire-and-forget · não bloqueia a resposta. Kids fica fora
  // (criança não entra na jornada/NSM). Dedup por decisão (não duplica em edição).
  if (tipo !== 'kids') {
    (async () => {
      try {
        const { data: equipe } = await supabase.from('profiles')
          .select('id').in('email', ['marcelo.soares@cbrio.org', 'wesley.ramos@cbrio.org']);
        const ids = await destinatariosDecisaoCampus(supabase, req.campus, (equipe || []).map(p => p.id).filter(Boolean));
        if (!ids.length) return;
        const nomePessoa = String(nome).trim();
        await notificar({
          modulo: 'cuidados',
          tipo: 'nova_aceitacao',
          titulo: `🙌 Nova decisão: ${nomePessoa}`,
          mensagem: `${nomePessoa} tomou uma decisão${telLimpo ? ` · ${telLimpo}` : ''}${tipo === 'online' ? ' (online)' : ''}. Entre em contato pra acompanhar nos próximos passos.`,
          link: '/ministerial/cuidados?tab=convertidos',
          severidade: 'info',
          chaveDedup: `nova_aceitacao_${req.campus.campus_id}_${data.id}`,
          targetIds: ids,
        });
      } catch (e) {
        console.error('[kpis/decisoes-pessoas] notif cuidados:', e.message);
      }
    })();
  }

  res.status(201).json(data);
});

router.put('/decisoes-pessoas/:id', authorizeIntegracao, async (req, res) => {
  const allowed = [
    'nome', 'telefone', 'email', 'idade', 'data_nascimento', 'cpf',
    'tipo_decisao', 'observacoes', 'status_followup', 'observacoes_followup',
    'responsavel_nome', 'responsavel_telefone', 'responsavel_cpf',
  ];
  const update = {};
  // CPFs já armazenados na decisão: idênticos ao payload passam SEM validar DV
  // (grandfathering — o modal reenvia o cpf existente; sem isso um CPF legado
  // DV-inválido travaria a edição de QUALQUER campo). DV só pra CPF novo/alterado.
  let cpfsAtuais = null;
  const precisaCpfAtual = ['cpf', 'responsavel_cpf'].some((k) => req.body?.[k]);
  if (precisaCpfAtual) {
    const { data: atual } = await supabase.from('cultos_decisoes_pessoas')
      .select('cpf, responsavel_cpf').eq('id', req.params.id).maybeSingle();
    cpfsAtuais = atual || {};
  }
  for (const [k, v] of Object.entries(req.body || {})) {
    if (!allowed.includes(k)) continue;
    if ((k === 'cpf' || k === 'responsavel_cpf') && v) {
      const d = String(v).replace(/\D/g, '');
      const atualNorm = String(cpfsAtuais?.[k] || '').replace(/\D/g, '');
      if (d && atualNorm && d === atualNorm) { update[k] = d; continue; }
      if (d.length !== 11 || !cpfValido(d)) {
        return res.status(400).json({ error: 'CPF inválido — confira os dígitos' });
      }
      update[k] = d;
    }
    else if ((k === 'telefone' || k === 'responsavel_telefone') && v) update[k] = String(v).replace(/\D/g, '');
    else if (k === 'email' && v) update[k] = String(v).trim().toLowerCase();
    else if (k === 'idade') update[k] = v ? Number(v) : null;
    else if (k === 'data_nascimento') update[k] = v || null;
    else update[k] = v === '' ? null : v;
  }
  const { data, error } = await supabase
    .from('cultos_decisoes_pessoas').update(update)
    .eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });

  // Reconciliação de CPF tardio ("censo posterior" · auditoria CPF 2026-07-16):
  // o trigger resolve_membro é BEFORE INSERT — editar a decisão preenchendo o
  // CPF depois NÃO atualizava o membro-stub criado sem CPF. Agora o CPF que
  // chega pela edição é consolidado no membro vinculado (ou vira pendência de
  // identidade se conflitar) e espelhado no convertido. Fire-and-forget.
  if (update.cpf && data?.membro_id && data.tipo_decisao !== 'kids') {
    (async () => {
      try {
        await reconciliarCpfTardio({
          membroId: data.membro_id, cpf: update.cpf,
          origem: 'decisao_edicao', origemId: data.id,
          dataNascimento: data.data_nascimento || null,
        });
        await propagarCpfConvertido({ membroId: data.membro_id });
      } catch (e) {
        console.error('[kpis/decisoes-pessoas PUT] reconciliar cpf:', e.message);
      }
    })();
  }
  res.json(data);
});

router.delete('/decisoes-pessoas/:id', authorizeIntegracao, async (req, res) => {
  const { error } = await supabase.from('cultos_decisoes_pessoas').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ── Auto-criação semanal de cultos ────────────────────────────────────────────
// POST /kpis/cultos/auto-create[?weeks=N]
// Cria cultos da semana corrente a partir de vol_service_types (recurrence_day, recurrence_time).
// Idempotente: ON CONFLICT DO NOTHING via índice único (service_type_id, data, hora).
// weeks=N: backfill das últimas N semanas (default 1 = só semana corrente).
// ⚠️ GET **E** POST: o Vercel Cron chama sempre por GET, e rota só-POST não dá
// "não autorizado" — dá NÃO ENCONTRADO, que é ainda mais difícil de diagnosticar
// (o job registra o erro HTTP e ninguém suspeita do verbo). O
// `/api/kpis/v2/cron/coletar` já registrava os dois; aqui tinha ficado só POST.
// A tela continua chamando por POST.
async function cultosAutoCreate(req, res) {
  const isAdmin = ['admin', 'diretor'].includes(req.user?.role);
  if (!isAuthorizedCron(req) && !isAdmin) {
    return res.status(401).json({ error: 'Não autorizado' });
  }

  const weeks = Math.max(1, Math.min(Number(req.query.weeks) || 1, 12));

  const { data: types, error: typesErr } = await supabase
    .from('vol_service_types')
    .select('id, name, recurrence_day, recurrence_time')
    .eq('is_active', true)
    .eq('has_online_stream', true)
    .not('recurrence_day', 'is', null)
    .not('recurrence_time', 'is', null);
  if (typesErr) return res.status(500).json({ error: typesErr.message });

  // ⚠️⚠️ VIGÊNCIA. Sem isto o cron materializa culto em data em que o culto NÃO
  // EXISTE — e não é hipótese: em 18/08 o tipo "Domingo 09:30" (que só passa a
  // valer em 24/08) foi ativado por alguém, e a próxima execução, domingo 23/08
  // às 00:05, teria criado um culto de 09:30 no ÚLTIMO domingo do formato antigo.
  // Pior: o script do corte remove futuros a partir de 30/08, então o fantasma de
  // 23/08 ficaria lá para sempre, com os gatilhos de KPI e NSM já disparados.
  //
  // É a régua do §9.1 da varredura (docs/cultos-domingo/) aplicada ao lado da
  // ESCRITA: quem LISTA o que existiu não filtra vigência; quem GERA culto novo
  // filtra "vigente NAQUELA data". `is_active` não substitui isto — é um flag que
  // qualquer um vira na tela de Tipos de Culto, e foi exatamente o que aconteceu.
  //
  // SELECT isolado e best-effort: pedir coluna que a migration ainda não criou faz
  // o PostgREST recusar a query INTEIRA (lição do parcelas_max), e aqui isso
  // pararia a criação de TODOS os cultos.
  const vigencia = new Map();
  try {
    const { data: vig, error: vErr } = await supabase
      .from('vol_service_types')
      .select('id, vigente_de, vigente_ate');
    if (!vErr && Array.isArray(vig)) {
      for (const v of vig) vigencia.set(v.id, v);
    }
  } catch { /* sem as colunas, o comportamento é o de antes */ }

  // ⚠️ A comparação é DELEGADA a `tipoVigenteEm` (utils/lentesDomingo), que já
  // existe e já é coberta por teste — uma SEGUNDA cópia de "este culto vale nesta
  // data?" é a duplicação que produziu o bug da régua do voluntariado.
  // ⚠️⚠️ O que NÃO se delega é o fallback: `tipoVigenteEm` é fail-CLOSED
  // (`!tipo → false`), e se as colunas de vigência não existirem o mapa vem vazio
  // — delegar direto pararia a criação de TODOS os cultos. Sem informação, o
  // comportamento é o de antes.
  const vigenteEm = (tipoId, dataStr) => {
    const v = vigencia.get(tipoId);
    if (!v) return true;
    return tipoVigenteEm(v, dataStr);
  };

  // Calcula a data do "weekStart" (domingo) para cada semana no range [hoje - (weeks-1) semanas, hoje]
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const sundayThisWeek = new Date(today);
  sundayThisWeek.setDate(today.getDate() - today.getDay()); // dow=0 → 0 dias

  const weekStarts = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const ws = new Date(sundayThisWeek);
    ws.setDate(sundayThisWeek.getDate() - i * 7);
    weekStarts.push(ws);
  }

  const created = [];
  const skipped = [];
  const erros = [];

  const foraDeVigencia = [];

  for (const ws of weekStarts) {
    for (const t of types || []) {
      const dayDate = new Date(ws);
      dayDate.setDate(ws.getDate() + Number(t.recurrence_day || 0));
      const dataStr = dayDate.toISOString().split('T')[0];
      const horaStr = String(t.recurrence_time).slice(0, 8);
      const dFmt = dayDate.toLocaleDateString('pt-BR');
      const nome = `${t.name} — ${dFmt}`;

      // fora de vigência naquela data: não é erro nem "já existe" — é culto que
      // não acontece nesse dia. Vai DECLARADO, para não sumir em silêncio.
      if (!vigenteEm(t.id, dataStr)) {
        foraDeVigencia.push({ tipo: t.name, data: dataStr });
        continue;
      }

      // Idempotência pela MESMA chave do índice único: (service_type_id, data) —
      // lei de 2026-08-04 (guarda em chave diferente do índice deixa o INSERT
      // estourar). Checar também a `hora` escondia culto EXISTENTE com hora
      // divergente (snapshot cultos.hora ≠ recurrence_time do tipo — o caso real
      // da virada dos cultos de domingo · docs/cultos-domingo/) → o insert
      // violava o UNIQUE e a falha sumia no meio dos "skipped".
      const { data: existente } = await supabase
        .from('cultos')
        .select('id')
        .eq('service_type_id', t.id)
        .eq('data', dataStr)
        .maybeSingle();

      if (existente) { skipped.push({ tipo: t.name, data: dataStr, hora: horaStr }); continue; }

      const { data: novo, error: insErr } = await supabase
        .from('cultos')
        .insert({
          service_type_id: t.id,
          nome,
          data: dataStr,
          hora: horaStr,
          presencial_adulto: 0,
          presencial_kids: 0,
          decisoes_presenciais: 0,
          decisoes_online: 0,
          inserido_por: req.user?.id || null,
        })
        .select('id, nome, data, hora')
        .single();
      // Falha AUDÍVEL: insert que erra não se mistura com skip normal — vai em
      // lista própria + log (cron sem leitor de resposta ainda deixa rastro).
      if (insErr) {
        console.error('[kpis/cultos/auto-create] insert falhou', t.name, dataStr, insErr.message);
        erros.push({ tipo: t.name, data: dataStr, hora: horaStr, error: insErr.message });
        continue;
      }
      created.push(novo);
    }
  }

  res.json({ weeks, created: created.length, skipped: skipped.length, erros: erros.length,
    fora_de_vigencia: foraDeVigencia.length, items: created, skippedItems: skipped, erroItems: erros,
    foraDeVigenciaItems: foraDeVigencia });
}
router.get('/cultos/auto-create', cultosAutoCreate);
router.post('/cultos/auto-create', cultosAutoCreate);

// ── Batismos ──────────────────────────────────────────────────────────────────
// varredura 2026-09: era só `authenticate` e devolve as 634 inscrições com CPF, nascimento e `possui_deficiencia` (inclusive de criança) — agora exige Batismo ou Integração.
router.get('/batismos', authorizeBatismoLeitura, campusBatismos.contexto, async (req, res) => {
  try { res.json(await listarBatismos(supabase, req.campus, req.query.status)); }
  catch (e) { responderErroCampus(res, e); }
});

// Convertidos locais; conclusão pessoal retorna apenas um sinal, nunca atos alheios.
router.get('/batismos/cobertura-convertidos', authorizeBatismoLeitura, campusBatismos.contexto, async (req, res) => {
  try { res.json(await coberturaBatismo(supabase, req.campus)); }
  catch (e) { responderErroCampus(res, e); }
});

// ── Horários de batismo (abrir/fechar + limite) ──────────────────────────────
// GET /api/kpis/batismos/horarios — todos os horários (incl. fechados) + ocupação
router.get('/batismos/horarios', authorizeBatismo, campusBatismoHorarios.contexto, async (req, res) => {
  try { res.json(await listarHorarios(supabase, req.campus, req.query.data)); }
  catch (e) { responderErroCampus(res, e); }
});

router.post('/batismos/horarios', authorizeBatismo, campusBatismoHorarios.contexto, campusBatismoHorarios.payload, async (req, res) => {
  try {
    const payload = validarHorario(req.body, true);
    const { data, error } = await supabase.from('batismo_horarios')
      .insert(carimbarCampus(payload, req.campus)).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) { responderErroCampus(res, e); }
});

router.patch('/batismos/horarios/:id', authorizeBatismo, campusBatismoHorarios.contexto, campusBatismoHorarios.payload, campusBatismoHorarios.registro, async (req, res) => {
  try {
    const payload = validarHorario(req.body, false);
    const { data, error } = await filtrarCampus(supabase.from('batismo_horarios')
      .update({ ...payload, updated_at: new Date().toISOString() }), req.campus)
      .eq('id', req.params.id).is('deleted_at', null).select().maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Horário não encontrado.' });
    res.json(data);
  } catch (e) { responderErroCampus(res, e); }
});

// DELETE /api/kpis/batismos/horarios/:id — remove (soft)
router.delete('/batismos/horarios/:id', authorizeBatismo, campusBatismoHorarios.contexto, campusBatismoHorarios.registro, async (req, res) => {
  try {
    const { error } = await supabase.rpc('fn_campus_batismo_excluir_horario', {
      p_igreja_id: req.campus.campus_id, p_id: req.params.id, p_ator: req.user.id,
    });
    if (error) return res.status(error.code === '23514' ? 409 : 503).json({ error: error.code === '23514' ? error.message : 'Não foi possível excluir o horário.' });
    res.json({ ok: true });
  } catch (e) { responderErroCampus(res, e); }
});

// Config do batismo · link do grupo de WhatsApp (Lorena atualiza a cada mês)
router.get('/batismos/config', authorizeBatismo, campusBatismos.contexto, async (req, res) => {
  try { res.json(await lerConfigBatismo(supabase, req.campus.campus_id)); }
  catch (e) { responderErroCampus(res, e); }
});

router.patch('/batismos/config', authorizeBatismo, campusBatismos.contexto, campusBatismos.payload, async (req, res) => {
  try {
    const grupo_url = req.body?.grupo_url ? String(req.body.grupo_url).trim() : null;
    res.json(await salvarConfigBatismo(supabase, req.campus.campus_id, { grupo_url, updated_by: req.user.id }));
  } catch (e) { responderErroCampus(res, e); }
});

router.post('/batismos', authorizeBatismo, campusBatismos.contexto, campusBatismos.payload, campusBatismos.membro, async (req, res) => {
  try {
    const inscricao = await salvarInscricaoBatismo(supabase, req.campus, req.body || {}, { usuarioId: req.user?.id });
    notificar({ modulo: 'membresia', tipo: 'novo_batismo', titulo: 'Nova inscrição de batismo',
      mensagem: `${inscricao.nome} ${inscricao.sobrenome} se inscreveu para batismo.`,
      link: '/kpis', severidade: 'info', chaveDedup: `batismo_${inscricao.id}`, campus: req.campus,
    }).catch(() => {});
    if (inscricao.origem === 'totem' && inscricao.telefone) {
      const { enfileirar } = require('../services/whatsappFila');
      enfileirar({ telefone: inscricao.telefone,
        template: process.env.WHATSAPP_TEMPLATE_BATISMO_CONF || 'batismo_confirmacao',
        params: [String(inscricao.nome).split(' ')[0], inscricao.data_batismo ? inscricao.data_batismo.split('-').reverse().join('/') : 'a confirmar', inscricao.horario_culto || 'a confirmar'],
        contexto: 'batismo_totem', refId: inscricao.id, campus: req.campus,
      }).catch(() => {});
    }
    res.json(inscricao);
  } catch (e) { responderErroCampus(res, e); }
});

// PUT /batismos/em-massa — muda o status de VÁRIAS inscrições de uma vez (ex.:
// marcar os presentes como 'realizado'). body { ids: [...], status }. Precisa vir
// ANTES de '/batismos/:id' (senão o :id captura "em-massa").
router.put('/batismos/em-massa', authorizeBatismo, campusBatismos.contexto, campusBatismos.payload, async (req, res) => {
  try {
    const { ids, status } = req.body || {};
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!Array.isArray(ids) || !ids.length || ids.length > 500 || ids.some(id => typeof id !== 'string' || !uuid.test(id))) {
      return res.status(400).json({ error: 'Selecione de 1 a 500 inscrições válidas.' });
    }
    if (!['pendente','confirmado','realizado','cancelado'].includes(status)) return res.status(400).json({ error: 'Status inválido.' });
    const { data, error } = await supabase.rpc('fn_campus_batismo_status_lote', {
      p_igreja_id: req.campus.campus_id, p_ids: [...new Set(ids)], p_status: status,
    });
    if (error) return res.status(['23514','23505'].includes(error.code) ? 409 : 503).json({ error: ['23514','23505'].includes(error.code) ? error.message : 'Não foi possível atualizar as inscrições.' });
    res.json({ ok: true, atualizados: data });
  } catch (e) { responderErroCampus(res, e); }
});

router.put('/batismos/:id', authorizeBatismo, campusBatismos.contexto, campusBatismos.payload, campusBatismos.registro, async (req, res) => {
  try {
    res.json(await salvarInscricaoBatismo(supabase, req.campus, req.body || {}, { atual: req.registroCampus, usuarioId: req.user?.id }));
  } catch (e) { responderErroCampus(res, e); }
});

// ── Check-in de batismo · Quiosque (Fase 1) ──────────────────────────────────
// Fluxo assistido no Totem Membro: lista os batizandos do dia → a pessoa se acha
// → captura CPF (dedup na origem) + selfie + consentimento → imprime etiqueta
// com QR (token forte) + código curto. Spec: docs/quiosque-lounge-identidade.md.

// Lista os batizandos de uma data (default = hoje, São Paulo) para o check-in.
// Não expõe CPF cru — só nome + flags.
router.get('/batismos/checkin/do-dia', authorizeBatismo, campusBatismos.contexto, async (req, res) => {
  try {
  const data = req.query.data || hojeSP();
  const rows = await lerTodasPaginas(() => filtrarCampus(supabase
    .from('batismo_inscricoes')
    .select('id, nome, sobrenome, checkin_em, foto_referencia_url'), req.campus)
    .eq('data_batismo', data)
    .in('status', ['pendente', 'confirmado'])
    .is('deleted_at', null)
    .order('nome', { ascending: true }).order('id'));
  res.json({
    data,
    batizandos: (rows || []).map(r => ({
      id: r.id,
      nome: r.nome,
      sobrenome: r.sobrenome,
      ja_checkin: !!r.checkin_em,
      tem_foto: !!r.foto_referencia_url,
    })),
  });
  } catch (e) { responderErroCampus(res, e); }
});

// Registra o check-in: dedup por CPF (acharOuCriarGuardado · opcional), grava
// presença + consentimento, devolve os códigos para imprimir a etiqueta.
// Idempotente: pode ser rodado de novo (reimpressão) — o token não muda.
router.post('/batismos/:id/checkin', authorizeBatismo, campusBatismos.contexto, campusBatismos.payload, campusBatismos.registro, async (req, res) => {
  try {
    res.json(await registrarCheckinBatismo(supabase, req.campus, req.registroCampus, req.body || {}, req.user?.id));
  } catch (e) { responderErroCampus(res, e); }
});

// Upload da selfie de referência (opcional · consentida) → bucket privado.
router.post('/batismos/:id/foto-referencia', authorizeBatismo, campusBatismos.contexto, campusBatismos.registro, uploadFotoRef.single('foto'), async (req, res) => {
  try { res.json(await salvarFotoReferencia(supabase, req.campus.campus_id, req.params.id, req.file)); }
  catch (e) { responderErroCampus(res, e); }
});

// ── Dashboard (agregado) ──────────────────────────────────────────────────────
router.get('/dashboard', async (req, res) => {
  const semanas = Number(req.query.semanas) || 12;
  const dataInicio = new Date();
  dataInicio.setDate(dataInicio.getDate() - semanas * 7);
  const dataInicioStr = dataInicio.toISOString().split('T')[0];

  const [
    { data: cultos },
    { count: batPendentes },
    { count: batRealizados },
    { count: totalGrupos },
    { count: volAtivos },
    { data: metas },
  ] = await Promise.all([
    supabase.from('vw_culto_stats').select('*').gte('data', dataInicioStr).order('data', { ascending: true }),
    supabase.from('batismo_inscricoes').select('*', { count: 'exact', head: true }).is('deleted_at', null).eq('status', 'pendente'),
    supabase.from('batismo_inscricoes').select('*', { count: 'exact', head: true }).is('deleted_at', null).eq('status', 'realizado'),
    supabase.from('mem_grupos').select('*', { count: 'exact', head: true }).is('deleted_at', null).eq('ativo', true),
    supabase.from('mem_checkins').select('membro_id', { count: 'exact', head: true })
      .gte('data', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]),
    supabase.from('kpi_metas').select('*').eq('ativo', true).order('area'),
  ]);

  res.json({
    cultos: cultos || [],
    batismos: { pendentes: batPendentes || 0, realizados: batRealizados || 0 },
    voluntarios_ativos: volAtivos || 0,
    total_grupos: totalGrupos || 0,
    metas: metas || [],
  });
});

// ── Metas ─────────────────────────────────────────────────────────────────────
router.get('/metas', async (req, res) => {
  const { data, error } = await supabase
    .from('kpi_metas').select('*').eq('ativo', true).order('area');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.put('/metas/:id', authorize('admin', 'diretor'), async (req, res) => {
  const { meta_6m, meta_12m, meta_24m, valor_base } = req.body;
  const { data, error } = await supabase
    .from('kpi_metas')
    .update({ meta_6m, meta_12m, meta_24m, valor_base })
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ⚠️⚠️ OS DOIS ENDPOINTS DE YOUTUBE FORAM REMOVIDOS AQUI (11/08/2026) — e a
// razão é o oposto de "limpeza": eles eram a ÚNICA manifestação viva de uma
// rotina morta, na forma de um alarme diário no celular do Matheus.
//
// O que foi medido antes de apagar:
//  · `POST /kpis/youtube/sync` rodava por cron às 13h e falhava com HTTP 401 em
//    **11 de 11 execuções** registradas (desde 01/08, quando o system_job_runs
//    começou a gravar). Nunca teve um sucesso.
//  · a causa do 401 é o `router.use(authenticate)` do topo deste arquivo: ele
//    roda ANTES do handler, tenta validar o `Authorization: Bearer <CRON_SECRET>`
//    do Vercel como JWT do Supabase, falha e devolve 401. A checagem
//    `isAuthorizedCron(req) || isAdmin` que o handler fazia era CÓDIGO MORTO pra
//    cron — nunca era alcançada. (Somado a isso, a rota era POST e o Vercel Cron
//    chama por GET: dois defeitos empilhados.)
//  · o dado que ela ia buscar JÁ É COLETADO, e por fonte melhor: os coletores do
//    módulo `online` (`/api/online/cron/ds-collect` e `ddus-collect`, verdes
//    todos os dias) gravam `cultos.online_ds`, `online_ddus` e `online_pico`
//    pela YouTube **Analytics** API, contra o `videos?part=statistics` público
//    daqui. Conferido em produção: os cultos das últimas 3 semanas estão com os
//    três campos preenchidos.
//  · e NENHUMA tela chamava: `youtubeSync`/`youtubeStatus` existiam em
//    `src/api.js` sem um único consumidor.
//
// Consertar o 401 para uma rotina redundante seria manter de pé um segundo
// escritor dos mesmos campos, com fonte pior, só para calar um alarme. O alarme
// estava certo: a rotina não funcionava. O que estava errado era ela existir.
//
// ⚠️ `cultos.ds_coletado_em` / `ddus_coletado_em` continuam existindo e
// permanentemente NULL: só esta rotina os escrevia, e ela nunca rodou. Não vale
// migration pra derrubar coluna vazia — mas quem for usá-las precisa saber que
// não significam "nunca coletado", significam "ninguém nunca estampou".


// ═══════════════════════════════════════════════════════════════════════════
// MANDALA CULTURA — 5 valores CBRio + Decisões (centro)
// ═══════════════════════════════════════════════════════════════════════════

function parseMes(input) {
  // Aceita 'YYYY-MM' ou 'YYYY-MM-DD'. Default: mês corrente.
  let y, m;
  if (input && /^\d{4}-\d{2}/.test(input)) {
    const [yy, mm] = input.split('-');
    y = Number(yy); m = Number(mm);
  } else {
    const now = new Date();
    y = now.getFullYear(); m = now.getMonth() + 1;
  }
  const inicio = new Date(Date.UTC(y, m - 1, 1));
  const fimExclusivo = new Date(Date.UTC(y, m, 1));
  const diasNoMes = new Date(Date.UTC(y, m, 0)).getUTCDate();
  // Semanas "completas" · domingo (D) E quarta (D+3) ambos dentro do mês.
  // Regra do negócio: so contam semanas com ambos os dias de culto (dom+qua).
  // Ex.: abr/26 → 4 semanas (dom 5/12/19/26 + qua 8/15/22/29 todos em abril)
  //      jun/26 → 3 semanas (dom 28/jun + qua 1/jul cai fora)
  let semanasNoMes = 0;
  for (let d = 1; d <= diasNoMes; d++) {
    const date = new Date(Date.UTC(y, m - 1, d));
    if (date.getUTCDay() === 0) {
      const qua = new Date(date.getTime() + 3 * 86400000);
      if (qua.getUTCMonth() === m - 1) semanasNoMes++;
    }
  }
  semanasNoMes = Math.max(1, semanasNoMes);
  const mesISO = `${y}-${String(m).padStart(2, '0')}`;
  const inicioStr = inicio.toISOString().split('T')[0];
  const fimExclusivoStr = fimExclusivo.toISOString().split('T')[0];
  const fimInclusivoStr = new Date(Date.UTC(y, m, 0)).toISOString().split('T')[0];
  return { y, m, mesISO, inicioStr, fimExclusivoStr, fimInclusivoStr, diasNoMes, semanasNoMes };
}

// GET /kpis/cultura?mes=YYYY-MM
router.get('/cultura', async (req, res) => {
  try {
    const { y: anoRef, m: mesRef, mesISO, inicioStr, fimInclusivoStr, diasNoMes, semanasNoMes } = parseMes(req.query.mes);

    // Hoje - 90d para Servir
    const noventaDias = new Date();
    noventaDias.setDate(noventaDias.getDate() - 90);
    const noventaDiasStr = noventaDias.toISOString();

    const settled = await Promise.allSettled([
      supabase.from('cultos')
        .select('data, presencial_adulto, presencial_kids, decisoes_presenciais, decisoes_online, decisoes_kids, online_ds')
        .gte('data', inicioStr).lte('data', fimInclusivoStr),
      // Conectar = PESSOAS distintas em grupos ativos (saiu_em IS NULL), NÃO o nº
      // de vínculos: quem está em 2+ grupos conta 1x. Pagina pra escapar do cap de
      // 1000 do PostgREST (há >1000 vínculos). Tabela pode não existir — tolerante.
      (async () => {
        try {
          const ids = new Set();
          const page = 1000;
          for (let from = 0; ; from += page) {
            const { data, error } = await supabase
              .from('mem_grupo_membros')
              .select('membro_id')
              .is('deleted_at', null)
              .is('saiu_em', null)
              .range(from, from + page - 1);
            if (error) return { count: null, error };
            (data || []).forEach(r => { if (r.membro_id) ids.add(r.membro_id); });
            if (!data || data.length < page) break;
          }
          return { count: ids.size, error: null };
        } catch (error) {
          return { count: null, error };
        }
      })(),
      // Investir Tempo com Deus = DEVOCIONAL feito no app (mem_devocionais ·
      // decisão Matheus 2026-06-20). Antes era views/dia dos vídeos PENSE.
      supabase.from('mem_devocionais')
        .select('membro_id')
        .eq('concluida', true)
        .is('deleted_at', null)
        .gte('data_devocional', inicioStr)
        .lte('data_devocional', fimInclusivoStr),
      // RPC: count(distinct volunteer_id) direto no banco — evita trafegar milhares de linhas
      supabase.rpc('kpi_servir_comunidade', { _since: noventaDiasStr }),
      supabase.from('cultura_mensal').select('*').eq('mes', inicioStr).maybeSingle(),
      // Generosidade · fallback do fin_transacoes via RPC (escapa do cap de 1000 do PostgREST)
      supabase.rpc('fin_generosidade_mes', { p_mes: inicioStr }),
    ]);

    const pick = (i) => (settled[i].status === 'fulfilled' ? settled[i].value : { data: null, error: settled[i].reason });
    const cultosRes = pick(0);
    const grupoMembrosRes = pick(1);
    const devocionalRes = pick(2);
    const servirRes = pick(3);
    const culturaMensalRes = pick(4);
    const finGenRes = pick(5);

    const cultos = cultosRes.data || [];
    const presencialTotal = cultos.reduce((s, c) => s + (c.presencial_adulto || 0) + (c.presencial_kids || 0), 0);
    const onlineDsTotal   = cultos.reduce((s, c) => s + (c.online_ds || 0), 0);

    // Semanas do mês = nº de semanas ISO (seg→dom) DISTINTAS que de fato tiveram
    // culto no mês. Consistente com o numerador (que soma TODOS os cultos do
    // mês): junho/26 → 4 (não 3). Antes o pareamento dom→quarta-seguinte
    // descartava a última semana e dividia o total de 4 semanas por 3, inflando
    // a média. Cai no cálculo do parseMes se não houver culto no mês.
    const chaveSemana = (iso) => {
      const d = new Date(`${iso}T00:00:00Z`);
      const dow = (d.getUTCDay() + 6) % 7; // 0 = segunda
      d.setUTCDate(d.getUTCDate() - dow);
      return d.toISOString().slice(0, 10);
    };
    const semanasComCulto = new Set(cultos.map((c) => c.data && chaveSemana(c.data)).filter(Boolean)).size;
    const divisorSemanas = semanasComCulto || semanasNoMes;

    // ⚠️ A MÉDIA DE FREQUÊNCIA é por DOMINGO, não por semana (decisão do Marcos ·
    // 2026-08-12). A semana ISO das bordas do mês entrava na conta trazendo a
    // quarta sem o domingo dela, e isso derrubava a média em ~25% nos meses de 4
    // domingos (jan/fev/abr/jul de 2026). Só a média MUDA: meta, semáforo e
    // periodicidade de KPI seguem intactos, e nenhum outro valor da mandala usa
    // este divisor. `divisorSemanas` continua sendo o que a resposta publica em
    // `semanas_no_mes` (informativo).
    const divisorFrequencia = divisorDomingos(cultos, { ano: anoRef, mes: mesRef });
    // Decisões: presencial + online + KIDS (kids passou a entrar na conta ·
    // pedido do Matheus 2026-07-29). Guardamos o detalhe pra exibir no clique.
    const decisoesPresencial = cultos.reduce((s, c) => s + (c.decisoes_presenciais || 0), 0);
    const decisoesOnline     = cultos.reduce((s, c) => s + (c.decisoes_online || 0), 0);
    const decisoesKids       = cultos.reduce((s, c) => s + (c.decisoes_kids || 0), 0);
    const decisoesTotal      = decisoesPresencial + decisoesOnline + decisoesKids;

    const conectarPessoas = grupoMembrosRes.error ? null : (grupoMembrosRes.count || 0);

    // Investir = devocional do app · investir_deus = pessoas distintas que
    // fizeram devocional no mês; total = nº de check-ins concluídos no mês.
    const devCheckins = (devocionalRes.data || []).length;
    const investirDeus = devocionalRes.error ? null : new Set((devocionalRes.data || []).map(d => d.membro_id).filter(Boolean)).size;

    // Voluntários ativos via RPC kpi_servir_comunidade(_since)
    const servirComunidade = servirRes.error ? null : (typeof servirRes.data === 'number' ? servirRes.data : (servirRes.data ?? null));

    const cm = culturaMensalRes.data;

    // Fallback de generosidade · RPC fin_generosidade_mes retorna agregado JSONB
    // (escapa do cap de 1000 do PostgREST quando fin_transacoes > 1000 linhas no mês)
    const finGen = finGenRes.error || !finGenRes.data ? null : finGenRes.data;
    const finDizimistas = finGen ? Number(finGen.dizimistas || 0) : null;
    const finOfertantes = finGen ? Number(finGen.ofertantes || 0) : null;
    const finValorDizimo = finGen ? Number(finGen.valor_dizimo || 0) : 0;
    const finValorOferta = finGen ? Number(finGen.valor_oferta || 0) : 0;
    const finDoadoresUnicos = finGen ? Number(finGen.doadores_unicos || 0) : null;

    const generosidade = {
      // Prioriza valor manual (cultura_mensal) · fallback pra fin_transacoes
      dizimistas: cm?.qtd_dizimistas ?? finDizimistas ?? null,
      ofertantes: cm?.qtd_ofertantes ?? finOfertantes ?? null,
      doadores_unicos: finDoadoresUnicos,
      valor_dizimo: finValorDizimo,
      valor_oferta: finValorOferta,
      valor_total: finValorDizimo + finValorOferta,
      fonte: cm?.qtd_dizimistas != null || cm?.qtd_ofertantes != null ? 'manual' : 'fin_transacoes',
    };

    // Valores manuais de cultura_mensal tem prioridade sobre o agregado de
    // cultos · permite lancar mês consolidado sem cultos individuais.
    const presencialSemanal = cm?.freq_presencial_semanal != null
      ? cm.freq_presencial_semanal
      : Math.round(presencialTotal / divisorFrequencia);
    const onlineSemanal = cm?.freq_online_semanal != null
      ? cm.freq_online_semanal
      : Math.round(onlineDsTotal / divisorFrequencia);
    const decisoesMes = cm?.decisoes_total != null ? cm.decisoes_total : decisoesTotal;
    const conectarMes = cm?.freq_grupos_total != null ? cm.freq_grupos_total : conectarPessoas;

    res.json({
      mes: mesISO,
      semanas_no_mes: divisorSemanas,
      // Divisor REAL da média de frequência. `semanas_no_mes` fica só como
      // informação do mês — quem divide é este.
      domingos_no_mes: divisorFrequencia,
      dias_no_mes: diasNoMes,
      seguir_jesus: {
        presencial: presencialSemanal,
        online: onlineSemanal,
        presencial_total: presencialTotal,
        online_total: onlineDsTotal,
        fonte: cm?.freq_presencial_semanal != null ? 'manual' : 'auto',
      },
      conectar_pessoas: conectarMes,
      investir_deus: investirDeus,
      investir_deus_total: devCheckins,
      // ⚠️⚠️ PARCELA SEPARADA, NUNCA SOMADA em `investir_deus`. Pedido do
      // Matheus era somar; a medição de 02/09/2026 mostrou que a soma
      // enterraria a variação do devocional (2→14 pessoas de jul→ago, contra
      // uma comunidade de ordem de grandeza maior) e misturaria ESTOQUE com
      // FLUXO. A pétala mostra as duas lado a lado. Ver a migration
      // `20260902180000` e o precedente do Marcos na `20260514140000`.
      // ⚠️ `?? null` e não `|| 0`: não informado ≠ comunidade vazia.
      investir_comunidade_online: cm?.investir_comunidade_online ?? null,
      servir_comunidade: servirComunidade,
      generosidade,
      decisoes: decisoesMes,
      decisoes_detalhe: {
        presencial: decisoesPresencial,
        online: decisoesOnline,
        kids: decisoesKids,
        // soma dos ambientes (pode diferir de `decisoes` se houver total manual em cultura_mensal)
        soma_ambientes: decisoesTotal,
        fonte: cm?.decisoes_total != null ? 'manual' : 'auto',
      },
    });
  } catch (e) {
    console.error('[kpis/cultura] erro:', e);
    res.status(500).json({
      error: e?.message || 'Erro ao calcular cultura',
      stack: process.env.NODE_ENV === 'development' ? e?.stack : undefined,
    });
  }
});

// POST /kpis/cultura/mensal — upsert (mês, qtd_dizimistas, qtd_ofertantes, observações)
router.post('/cultura/mensal', authorize('admin', 'diretor'), async (req, res) => {
  const corpo = req.body || {};
  const { mes } = corpo;
  if (!mes || !/^\d{4}-\d{2}/.test(mes)) {
    return res.status(400).json({ error: 'Campo "mês" obrigatório no formato YYYY-MM' });
  }
  // Sempre dia 01
  const mesDate = `${mes.slice(0, 7)}-01`;
  const intOrNull = (v) => v == null || v === '' ? null : Number(v);

  // ⚠️⚠️ PATCH: só grava a chave que VEIO no corpo. Antes o payload era montado
  // INTEIRO, então uma tela que salvasse um campo só NULIFICAVA os outros —
  // `freq_presencial_semanal`, `freq_online_semanal`, `decisoes_total` e
  // `freq_grupos_total` iam a NULL e dizimistas/ofertantes a ZERO (o
  // `Number(x) || 0`). A tabela tem 1 linha por mês, então isso apagaria em
  // silêncio o consolidado daquele mês. Achado em 02/09/2026, ao construir a
  // primeira tela que escreve aqui — o endpoint existia desde maio e NENHUMA
  // tela o chamava (os valores foram postos por SQL), então a bomba nunca
  // tinha sido armada.
  // ⚠️ `Object.prototype.hasOwnProperty` e não `!== undefined`: mandar
  // `{ decisoes_total: null }` é a forma de LIMPAR o campo de propósito, e
  // isso tem que continuar possível.
  const tem = (k) => Object.prototype.hasOwnProperty.call(corpo, k);
  const payload = { mes: mesDate, updated_at: new Date().toISOString(), updated_by: req.user?.id || null };
  // ⚠️ dizimistas/ofertantes são NOT NULL com default 0 — por isso o `|| 0`
  // fica, mas SÓ quando a chave veio.
  if (tem('qtd_dizimistas')) payload.qtd_dizimistas = Number(corpo.qtd_dizimistas) || 0;
  if (tem('qtd_ofertantes')) payload.qtd_ofertantes = Number(corpo.qtd_ofertantes) || 0;
  for (const k of ['freq_presencial_semanal', 'freq_online_semanal', 'decisoes_total',
    'freq_grupos_total', 'investir_comunidade_online']) {
    if (tem(k)) payload[k] = intOrNull(corpo[k]);
  }
  if (tem('observacoes')) payload.observacoes = corpo.observacoes || null;
  const { data, error } = await supabase
    .from('cultura_mensal')
    .upsert(payload, { onConflict: 'mes' })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.get('/cultura/mensal', async (req, res) => {
  const { data, error } = await supabase
    .from('cultura_mensal').select('*').order('mes', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// PENSE — CRUD vídeos
router.get('/cultura/pense', async (req, res) => {
  const { data, error } = await supabase
    .from('pense_videos').select('*').order('data_publicacao', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

router.post('/cultura/pense', authorize('admin', 'diretor'), async (req, res) => {
  const { video_id, titulo, data_publicacao, views, ativo } = req.body || {};
  if (!video_id || !data_publicacao) {
    return res.status(400).json({ error: 'video_id e data_publicacao são obrigatórios' });
  }
  const { data, error } = await supabase
    .from('pense_videos')
    .upsert({
      video_id,
      titulo: titulo || null,
      data_publicacao,
      views: Number(views) || 0,
      ativo: ativo !== false,
      created_by: req.user?.id || null,
    }, { onConflict: 'video_id' })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.delete('/cultura/pense/:id', authorize('admin', 'diretor'), async (req, res) => {
  const { error } = await supabase.from('pense_videos').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// POST /kpis/cultura/pense/sync — atualiza views via YouTube API
router.post('/cultura/pense/sync', async (req, res) => {
  const isAdmin = ['admin', 'diretor'].includes(req.user?.role);
  if (!isAuthorizedCron(req) && !isAdmin) {
    return res.status(401).json({ error: 'Não autorizado' });
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'YOUTUBE_API_KEY não configurada' });

  const { data: videos, error } = await supabase
    .from('pense_videos').select('id, video_id').eq('ativo', true);
  if (error) return res.status(500).json({ error: error.message });

  // YouTube API aceita até 50 IDs por request
  const ids = (videos || []).map(v => v.video_id);
  const chunks = [];
  for (let i = 0; i < ids.length; i += 50) chunks.push(ids.slice(i, i + 50));

  const results = [];
  for (const chunk of chunks) {
    try {
      const url = `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${chunk.join(',')}&key=${apiKey}`;
      const r = await fetch(url);
      const json = await r.json();
      for (const item of (json.items || [])) {
        const views = parseInt(item.statistics?.viewCount || '0', 10);
        await supabase.from('pense_videos')
          .update({ views, views_atualizado_em: new Date().toISOString() })
          .eq('video_id', item.id);
        results.push({ video_id: item.id, views });
      }
    } catch (e) {
      results.push({ error: e.message });
    }
  }
  res.json({ synced: results.length, results });
});

module.exports = router;
