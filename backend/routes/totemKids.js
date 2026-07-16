// ============================================================================
// /api/totem-kids · backend do Totem Kids (módulo Ministerial > Totem Kids)
// ============================================================================
// Operação: voluntário opera o totem (modo manned · único tipo no MVP).
// Substitui o Planning Center Check-Ins para o ministério infantil.
//
// Permissões:
//   - admin/diretor (role) passam direto (backward compat)
//   - coordenador-kids (nível >= 3 no módulo 'kids') tem acesso total
//   - boost via área KIDS (auth.js) eleva pra nível 5 automático
//   - "líder Kids do dia" e qualquer staff que tenha check-in ativo no
//     voluntariado em culto com has_kids=true · validado dinamicamente
//     em `checkLiderKidsDoDia` quando necessário (override).
//
// Decisões em docs/checkin-kids-plano.md (2026-05-21).
// ============================================================================

const router = require('express').Router();
const multer = require('multer');
const XLSX = require('xlsx');
const { authenticate, authorizeModule } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { safeEqual, isAuthorizedCron } = require('../utils/cronAuth');
const { notificar } = require('../services/notificar');
const wpp = require('../services/whatsappService');
const { traduzErroUmPaiUmaMae } = require('../utils/kidsResponsavel');
const { enviarTexto: enviarTextoWpp, enviarTemplate: enviarTemplateWpp } = require('../services/whatsappSend');
const { acharOuCriarGuardado } = require('../services/membroMatch');
const { syncCriancasPCO } = require('../services/planningCenterKids');

// authenticate aplicado condicionalmente abaixo · só o cron bypassa (com
// CRON_SECRET válido). O modelo antigo de TVs/pagers/estações pareadas foi
// removido (2026-07-07) — o check-out agora é pelo PORTÃO (scan da etiqueta).

const xlsxUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req, file, cb) => {
    const ok = /\.(xlsx|xls|csv)$/i.test(file.originalname);
    cb(ok ? null : new Error('Formato invalido · use .xlsx, .xls ou .csv'), ok);
  },
});

// Cron da Vercel/GitHub manda CRON_SECRET (não JWT) · só pula authenticate
// quando o secret é VÁLIDO (fail-closed via isAuthorizedCron). Chamada manual
// de admin (com JWT, sem secret) segue pelo authenticate normalmente.
router.use((req, res, next) => {
  const isCron = req.path.startsWith('/cron/') && isAuthorizedCron(req);
  if (isCron) return next();
  return authenticate(req, res, next);
});

// ─── Helpers ────────────────────────────────────────────────────────────────

// Resolve a foto exibível da criança. Foto enviada pelo APP fica em bucket
// privado (foto_storage_path) e SÓ aparece com consentimento (ECA/LGPD) →
// signed URL temporária. Foto legada (foto_url) segue como antes.
async function fotoVisivelCrianca(c) {
  if (!c) return null;
  if (c.foto_storage_path) {
    if (!c.foto_consentimento_em) return null;
    const { data } = await supabase.storage.from('kids-documentos').createSignedUrl(c.foto_storage_path, 60 * 30);
    return data?.signedUrl || null;
  }
  return c.foto_url || null;
}

function calcIdadeMeses(dataNascimento) {
  if (!dataNascimento) return null;
  const nasc = new Date(dataNascimento);
  if (isNaN(nasc.getTime())) return null;
  const hoje = new Date();
  let meses = (hoje.getFullYear() - nasc.getFullYear()) * 12 + (hoje.getMonth() - nasc.getMonth());
  if (hoje.getDate() < nasc.getDate()) meses -= 1;
  return Math.max(0, meses);
}

function formatIdade(meses) {
  if (meses == null) return '';
  if (meses < 24) return `${meses} ${meses === 1 ? 'mês' : 'meses'}`;
  const anos = Math.floor(meses / 12);
  return `${anos} ${anos === 1 ? 'ano' : 'anos'}`;
}

function normalizarTelefone(t) {
  if (!t) return null;
  const digits = String(t).replace(/\D/g, '');
  return digits.length >= 8 ? digits : null;
}

function normalizarCpf(c) {
  if (!c) return null;
  const digits = String(c).replace(/\D/g, '');
  return digits.length === 11 ? digits : null;
}

// CPF válido de verdade (dígitos verificadores) — evita "111.111.111-11" e afins,
// que zerariam a qualidade do dado (o CPF vira chave de deduplicação).
function cpfValido(cpf) {
  const d = String(cpf || '').replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dig = (base, pesoIni) => {
    let s = 0;
    for (let i = 0; i < base.length; i++) s += parseInt(base[i], 10) * (pesoIni - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dig(d.slice(0, 9), 10) === +d[9] && dig(d.slice(0, 10), 11) === +d[10];
}

// Sala sugerida pra idade em meses
async function sugerirSala(idadeMeses) {
  if (idadeMeses == null) return null;
  const { data } = await supabase
    .from('kids_salas')
    .select('id, nome, capacidade, faixa_etaria_min_meses, faixa_etaria_max_meses, cor')
    .eq('ativo', true)
    .lte('faixa_etaria_min_meses', idadeMeses)
    .gte('faixa_etaria_max_meses', idadeMeses)
    .order('ordem')
    .limit(1)
    .maybeSingle();
  return data || null;
}

// Verifica se o usuário e "líder Kids do dia": voluntário com check-in ativo
// no voluntariado em algum culto com has_kids=true.
async function isLiderKidsDoDia(authUserId) {
  if (!authUserId) return false;
  const hoje = new Date().toISOString().slice(0, 10);

  // 1. profile.email → vol_profile
  const { data: profile } = await supabase
    .from('profiles').select('email').eq('id', authUserId).maybeSingle();
  if (!profile?.email) return false;

  const { data: volProfile } = await supabase
    .from('vol_profiles').select('id').eq('email', profile.email).maybeSingle();
  if (!volProfile) return false;

  // 2. Tem check-in ativo hoje em culto com has_kids?
  const { data: checkins } = await supabase
    .from('vol_check_ins')
    .select('id, service_id, vol_services(scheduled_at, service_type_name)')
    .eq('volunteer_id', volProfile.id)
    .gte('checked_in_at', `${hoje}T00:00:00`)
    .lte('checked_in_at', `${hoje}T23:59:59`);

  if (!checkins?.length) return false;

  // Pelo menos um service do tipo "tem kids" via vol_service_types
  const { data: serviceTypes } = await supabase
    .from('vol_service_types').select('name, has_kids').eq('has_kids', true);
  const typesComKids = new Set((serviceTypes || []).map(s => s.name));

  return checkins.some(c => typesComKids.has(c.vol_services?.service_type_name));
}

// ═══════════════════════════════════════════════════════════════════════════
// SESSÕES
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/totem-kids/sessoes/atual · retorna a sessão aberta agora (se houver)
router.get('/sessoes/atual', authorizeModule('kids', 1), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('kids_sessoes')
      .select(`
        id, culto_id, status, abrir_em, fechar_em, encerrada_at,
        culto:cultos(id, data, nome, service_type_id, presencial_kids, decisoes_kids,
                     service_type:vol_service_types(id, name, color, has_kids, recurrence_time))
      `)
      .eq('status', 'aberta')
      .order('abrir_em', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    res.json(data || null);
  } catch (e) {
    console.error('[totemKids/sessoes/atual]', e.message);
    res.status(500).json({ error: 'Erro ao buscar sessão atual' });
  }
});

// POST /api/totem-kids/sessoes/garantir · acha-ou-cria a sessão de um culto.
// É o pivô do check-in POR HORÁRIO: o operador não gerencia mais sessão — o
// front escolhe o culto (pelo relógio) e chama isto. Reabre se estava encerrada
// (não bloqueia a operação · a contagem consolida no encerrar/cron). Idempotente.
router.post('/sessoes/garantir', authorizeModule('kids', 2), async (req, res) => {
  try {
    const { culto_id } = req.body;
    if (!culto_id) return res.status(400).json({ error: 'culto_id obrigatorio' });
    const sel = `id, culto_id, status, abrir_em, fechar_em, encerrada_at,
        culto:cultos(id, data, nome, service_type_id, presencial_kids, decisoes_kids,
                     service_type:vol_service_types(id, name, color, has_kids, recurrence_time))`;
    let { data: s } = await supabase.from('kids_sessoes').select(sel).eq('culto_id', culto_id).maybeSingle();
    if (!s) {
      const ins = await supabase.from('kids_sessoes')
        .insert({ culto_id, status: 'aberta', abrir_em: new Date().toISOString() })
        .select(sel).single();
      if (ins.error) {
        // corrida entre 2 totens (UNIQUE culto_id) → re-seleciona a existente
        if (ins.error.code === '23505') {
          const re = await supabase.from('kids_sessoes').select(sel).eq('culto_id', culto_id).maybeSingle();
          s = re.data;
        } else throw ins.error;
      } else s = ins.data;
    } else if (s.status === 'encerrada') {
      await supabase.from('kids_sessoes')
        .update({ status: 'aberta', encerrada_at: null, encerrada_por: null }).eq('id', s.id);
      s.status = 'aberta';
    }
    res.json(s || null);
  } catch (e) {
    console.error('[totemKids/sessoes/garantir]', e.message);
    res.status(500).json({ error: 'Erro ao garantir sessão do culto' });
  }
});

// Data de HOJE em BRT (YYYY-MM-DD) — pra saber o que é "de outro dia".
function _hojeBRT() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

// Encerra sessões ABERTAS cujo culto é de um dia ANTERIOR a hoje (BRT) e dá
// checkout automático em quem ficou aberto nelas — mesmo efeito do "Encerrar"
// manual (#1758a). É o fechamento LAZY (SEM cron · pedido do Marcos): roda na
// carga do totem/admin. Fecha o buraco do R1 (check-in adotar sessão de outro
// dia e corromper presencial_kids/decisoes_kids) e consolida o KPI do culto
// antigo certo (trigger fn_kids_sessao_consolida_culto dispara no status→encerrada).
// Encerra um conjunto de sessões + auto-checkout de quem ficou aberto (mesma
// baixa do "Encerrar" manual · #1758a). Consolida o KPI (trigger no status→encerrada).
async function _fecharSessoes(ids, userId, motivo) {
  if (!ids?.length) return 0;
  const agora = new Date().toISOString();
  await supabase.from('kids_sessoes')
    .update({ status: 'encerrada', encerrada_at: agora, encerrada_por: userId || null })
    .in('id', ids);
  const { error: eCk } = await supabase.from('kids_checkins')
    .update({
      checkout_at: agora,
      checkout_metodo: 'checkout_forcado',
      checkout_por: userId || null,
      responsavel_checkout_nome: motivo,
    })
    .in('sessao_id', ids).is('checkout_at', null);
  if (eCk) console.error('[totemKids/_fecharSessoes] auto-checkout:', eCk.message);
  return ids.length;
}

async function encerrarSessoesVencidas(userId) {
  const hoje = _hojeBRT();
  const { data: abertas, error } = await supabase
    .from('kids_sessoes')
    .select('id, culto:cultos(data)')
    .eq('status', 'aberta');
  if (error) throw error;
  const vencidas = (abertas || [])
    .filter((s) => s.culto?.data && String(s.culto.data).slice(0, 10) < hoje)
    .map((s) => s.id);
  return _fecharSessoes(vencidas, userId, 'Baixa automática (sessão de outro dia)');
}

// POST /api/totem-kids/sessoes/encerrar-vencidas · sweep lazy (SEM cron): o
// totem/admin chama na carga; encerra sessões de dias anteriores + baixa abertos.
router.post('/sessoes/encerrar-vencidas', authorizeModule('kids', 2), async (req, res) => {
  try {
    const n = await encerrarSessoesVencidas(req.user.userId);
    res.json({ encerradas: n });
  } catch (e) {
    console.error('[totemKids/sessoes/encerrar-vencidas]', e.message);
    res.status(500).json({ error: 'Erro ao encerrar sessões vencidas' });
  }
});

// POST /api/totem-kids/sessoes/trocar-periodo · troca a sessão do totem entre
// períodos do MESMO dia (ex.: Domingo de manhã → Domingo à noite). Abre os cultos
// do período escolhido e ENCERRA os OUTROS cultos de HOJE que estiverem abertos
// (consolida o KPI + baixa quem ficou) — o check-in passa a mostrar só o período
// escolhido, sem risco de lançar criança no culto errado.
router.post('/sessoes/trocar-periodo', authorizeModule('kids', 3), async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.culto_ids) ? [...new Set(req.body.culto_ids.map(String))] : [];
    if (!ids.length) return res.status(400).json({ error: 'culto_ids obrigatório' });
    const hoje = _hojeBRT();
    // Só cultos de HOJE entram (proteção contra trocar pra outro dia).
    const { data: alvo } = await supabase.from('cultos').select('id, data').in('id', ids);
    const escolhidos = (alvo || []).filter((c) => String(c.data).slice(0, 10) === hoje).map((c) => c.id);
    if (!escolhidos.length) return res.status(400).json({ error: 'Nenhum culto de hoje nos ids' });
    // Abre/reabre as sessões do período escolhido.
    for (const cid of escolhidos) {
      const { data: s } = await supabase.from('kids_sessoes').select('id, status').eq('culto_id', cid).maybeSingle();
      if (!s) {
        await supabase.from('kids_sessoes').insert({ culto_id: cid, status: 'aberta', abrir_em: new Date().toISOString() });
      } else if (s.status === 'encerrada') {
        await supabase.from('kids_sessoes').update({ status: 'aberta', encerrada_at: null, encerrada_por: null }).eq('id', s.id);
      }
    }
    // Encerra os OUTROS cultos de HOJE que estão abertos (períodos não escolhidos).
    const { data: abertasHoje } = await supabase.from('kids_sessoes')
      .select('id, culto_id, culto:cultos(data)').eq('status', 'aberta');
    const fechar = (abertasHoje || [])
      .filter((s) => s.culto?.data && String(s.culto.data).slice(0, 10) === hoje && !escolhidos.includes(s.culto_id))
      .map((s) => s.id);
    const encerradas = await _fecharSessoes(fechar, req.user.userId, 'Baixa automática (troca de sessão)');
    res.json({ abertas: escolhidos.length, encerradas });
  } catch (e) {
    console.error('[totemKids/sessoes/trocar-periodo]', e.message);
    res.status(500).json({ error: 'Erro ao trocar a sessão' });
  }
});

// GET /api/totem-kids/sessoes · lista sessões (admin)
router.get('/sessoes', authorizeModule('kids', 1), async (req, res) => {
  try {
    const status = req.query.status; // opcional · filtra por status
    const limit = Math.min(parseInt(req.query.limit) || 30, 100);
    let q = supabase
      .from('kids_sessoes')
      .select(`
        id, culto_id, status, abrir_em, fechar_em, encerrada_at,
        culto:cultos(id, data, nome, presencial_kids, decisoes_kids,
                     service_type:vol_service_types(id, name, color, recurrence_time))
      `)
      .order('abrir_em', { ascending: false })
      .limit(limit);
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    console.error('[totemKids/sessoes]', e.message);
    res.status(500).json({ error: 'Erro ao listar sessões' });
  }
});

// POST /api/totem-kids/sessoes · cria sessão pra um culto
router.post('/sessoes', authorizeModule('kids', 3), async (req, res) => {
  try {
    const { culto_id, abrir_em, fechar_em } = req.body;
    if (!culto_id) return res.status(400).json({ error: 'culto_id obrigatorio' });

    const { data, error } = await supabase
      .from('kids_sessoes')
      .insert({
        culto_id,
        abrir_em: abrir_em || new Date().toISOString(),
        fechar_em: fechar_em || null,
        status: 'aberta',
      })
      .select('id, culto_id, status, abrir_em, fechar_em')
      .single();
    if (error) {
      // duplicidade culto_id
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Já existe sessão pra esse culto' });
      }
      throw error;
    }
    res.status(201).json(data);
  } catch (e) {
    console.error('[totemKids/sessoes POST]', e.message);
    res.status(500).json({ error: 'Erro ao criar sessão' });
  }
});

// POST /api/totem-kids/sessoes/:id/abrir · status → aberta
router.post('/sessoes/:id/abrir', authorizeModule('kids', 3), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('kids_sessoes')
      .update({ status: 'aberta' })
      .eq('id', req.params.id)
      .select('id, status')
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao abrir sessão' });
  }
});

// POST /api/totem-kids/sessoes/:id/encerrar · status → encerrada (consolida cultos.presencial_kids)
router.post('/sessoes/:id/encerrar', authorizeModule('kids', 3), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('kids_sessoes')
      .update({
        status: 'encerrada',
        encerrada_at: new Date().toISOString(),
        encerrada_por: req.user.userId,
      })
      .eq('id', req.params.id)
      .select('id, status, encerrada_at')
      .single();
    if (error) throw error;
    // Sessão finalizada = todo mundo baixado: dá checkout automático em quem
    // ficou com check-in aberto nessa sessão (evita "fantasma" no painel e na
    // busca · era a causa dos 356 abertos do teste que nunca fecharam).
    const { error: eCk } = await supabase.from('kids_checkins')
      .update({
        checkout_at: new Date().toISOString(),
        checkout_metodo: 'checkout_forcado',
        checkout_por: req.user.userId,
        responsavel_checkout_nome: 'Baixa automática (sessão encerrada)',
      })
      .eq('sessao_id', req.params.id).is('checkout_at', null);
    if (eCk) console.error('[totemKids/sessoes/encerrar] auto-checkout:', eCk.message);
    // O resumo do Kids pros líderes NÃO sai mais daqui: o cron /cron/resumo-pco
    // é o emissor ÚNICO (crianças únicas = PCO + totem, dedup por
    // planning_center_id, com kids_resumo_enviado_at + chaveDedup). Evita dois
    // resumos pro mesmo culto (encerrar sessão × cron).
    res.json(data);
  } catch (e) {
    console.error('[totemKids/sessoes/encerrar]', e.message);
    res.status(500).json({ error: 'Erro ao encerrar sessão' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// CRIANÇAS
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/totem-kids/criancas/buscar?q=... · fuzzy search (trigram)
router.get('/criancas/buscar', authorizeModule('kids', 1), async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json([]);
    // Normaliza (minúscula + sem acento) pra casar com nome_norm — "jose" acha
    // "José", sem depender de acento/maiúscula.
    const qNorm = q.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    // Refino: cada PALAVRA precisa aparecer no nome (AND) — "pedro lit" acha
    // "Pedro Theodoro Litwinczuk" mesmo com termos não adjacentes/fora de ordem.
    const termos = qNorm.split(/\s+/).filter(t => t.length >= 1).slice(0, 6);

    // Inclui INATIVAS (marcadas) pra criança que sumiu 6+ meses do PCO ou não
    // apareceu na última importação continuar achável — o check-in reativa.
    // Ativas vêm primeiro.
    let buscaQ = supabase
      .from('kids_criancas')
      .select(`
        id, nome, data_nascimento, sexo, foto_url, foto_storage_path, foto_consentimento_em, observacoes_medicas,
        tem_espectro, espectro_qual, tem_alergia, alergia_qual, tem_limitacao_fisica, limitacao_fisica_qual,
        visitante, ativo, motivo_inativacao, familia_id,
        familia:mem_familias(id, nome),
        responsaveis:kids_responsaveis(
          membro_id, parentesco, autorizado_buscar,
          membro:mem_membros(id, nome, telefone, cpf, foto_url)
        )
      `)
      .is('deleted_at', null);
    for (const t of termos) buscaQ = buscaQ.ilike('nome_norm', `%${t}%`);
    const { data: criancas } = await buscaQ
      .order('ativo', { ascending: false })
      .order('nome')
      .limit(30);

    // Também busca por telefone do responsável (se q parece telefone)
    const digits = q.replace(/\D/g, '');
    let extras = [];
    if (digits.length >= 4) {
      const { data: membrosPorTel } = await supabase
        .from('mem_membros')
        .select('id')
        .like('telefone', `%${digits}%`)
        .limit(10);
      if (membrosPorTel?.length) {
        const membroIds = membrosPorTel.map(m => m.id);
        const { data: responsaveis } = await supabase
          .from('kids_responsaveis')
          .select('crianca_id')
          .in('membro_id', membroIds);
        const criancaIds = [...new Set((responsaveis || []).map(r => r.crianca_id))];
        if (criancaIds.length) {
          const { data: extras2 } = await supabase
            .from('kids_criancas')
            .select(`
              id, nome, data_nascimento, sexo, foto_url, foto_storage_path, foto_consentimento_em, observacoes_medicas,
              visitante, ativo, motivo_inativacao, familia_id,
              familia:mem_familias(id, nome),
              responsaveis:kids_responsaveis(
                membro_id, parentesco, autorizado_buscar,
                membro:mem_membros(id, nome, telefone, cpf, foto_url)
              )
            `)
            .in('id', criancaIds)
            .is('deleted_at', null);
          extras = extras2 || [];
        }
      }
    }

    // Une por id
    const map = new Map();
    [...(criancas || []), ...extras].forEach(c => map.set(c.id, c));
    const lista = await Promise.all([...map.values()].map(async c => ({
      ...c,
      foto_url: await fotoVisivelCrianca(c),
      idade_meses: calcIdadeMeses(c.data_nascimento),
      idade_label: formatIdade(calcIdadeMeses(c.data_nascimento)),
    })));

    res.json(lista);
  } catch (e) {
    console.error('[totemKids/criancas/buscar]', e.message);
    res.status(500).json({ error: 'Erro na busca' });
  }
});

// GET /criancas/:id/irmaos · outras crianças ATIVAS da mesma família, pro
// check-in em lote (uma família chega junta). Mesmo shape da busca, pra o front
// reusar. Sem familia_id → []. (Path de 3 segmentos · não conflita com /:id.)
router.get('/criancas/:id/irmaos', authorizeModule('kids', 1), async (req, res) => {
  try {
    const { data: base } = await supabase
      .from('kids_criancas')
      .select('familia_id')
      .eq('id', req.params.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (!base?.familia_id) return res.json([]);

    const { data: irmaos } = await supabase
      .from('kids_criancas')
      .select(`
        id, nome, data_nascimento, sexo, foto_url, foto_storage_path, foto_consentimento_em, observacoes_medicas,
        tem_espectro, espectro_qual, tem_alergia, alergia_qual, tem_limitacao_fisica, limitacao_fisica_qual,
        visitante, ativo, motivo_inativacao, familia_id,
        familia:mem_familias(id, nome),
        responsaveis:kids_responsaveis(
          membro_id, parentesco, autorizado_buscar,
          membro:mem_membros(id, nome, telefone, cpf, foto_url)
        )
      `)
      .eq('familia_id', base.familia_id)
      .neq('id', req.params.id)
      .eq('ativo', true)
      .is('deleted_at', null)
      .order('nome');

    const lista = await Promise.all((irmaos || []).map(async c => ({
      ...c,
      foto_url: await fotoVisivelCrianca(c),
      idade_meses: calcIdadeMeses(c.data_nascimento),
      idade_label: formatIdade(calcIdadeMeses(c.data_nascimento)),
    })));
    res.json(lista);
  } catch (e) {
    console.error('[totemKids/criancas/irmaos]', e.message);
    res.status(500).json({ error: 'Erro ao buscar irmãos' });
  }
});

// GET /criancas/duplicados · grupos de crianças provavelmente duplicadas (mesmo
// nome normalizado). Declarado ANTES de /criancas/:id (senão casaria como :id).
router.get('/criancas/duplicados', authorizeModule('kids', 1), async (req, res) => {
  try {
    let from = 0; const page = 1000; let all = [];
    while (true) {
      const { data, error } = await supabase.from('kids_criancas')
        .select('id, nome, data_nascimento, ativo, foto_url, familia:mem_familias(nome), responsaveis:kids_responsaveis(membro:mem_membros(nome))')
        .is('deleted_at', null).range(from, from + page - 1);
      if (error) throw error;
      if (!data || !data.length) break;
      all = all.concat(data);
      if (data.length < page) break;
      from += page;
    }
    const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
    const grupos = {};
    all.forEach((c) => { const k = norm(c.nome); if (k.length < 3) return; (grupos[k] = grupos[k] || []).push(c); });
    const dups = Object.values(grupos).filter((g) => g.length > 1).map((g) => g.map((c) => ({
      id: c.id, nome: c.nome, data_nascimento: c.data_nascimento, ativo: c.ativo, foto_url: c.foto_url,
      familia: c.familia?.nome || null,
      responsaveis: (c.responsaveis || []).map((r) => r.membro?.nome).filter(Boolean),
    })));
    // mesmo nascimento no grupo = mais provável → primeiro
    dups.sort((a, b) => {
      const mesma = (g) => { const ds = g.map((x) => x.data_nascimento).filter(Boolean); return ds.length > 1 && new Set(ds).size === 1; };
      return (mesma(b) ? 1 : 0) - (mesma(a) ? 1 : 0);
    });
    res.json(dups);
  } catch (e) { console.error('[totemKids] duplicados:', e.message); res.status(500).json({ error: 'Erro ao detectar duplicados' }); }
});

// POST /criancas/merge { keep_id, merge_ids } · funde duplicadas na mantida
router.post('/criancas/merge', authorizeModule('kids', 3), async (req, res) => {
  try {
    const { keep_id, merge_ids } = req.body || {};
    if (!keep_id || !Array.isArray(merge_ids) || !merge_ids.length) return res.status(400).json({ error: 'keep_id e merge_ids obrigatórios' });
    if (merge_ids.includes(keep_id)) return res.status(400).json({ error: 'A criança mantida não pode estar na lista de fundidas' });
    const { error } = await supabase.rpc('merge_kids_criancas', { p_keep: keep_id, p_merge: merge_ids });
    if (error) throw error;
    res.json({ ok: true, fundidas: merge_ids.length });
  } catch (e) { console.error('[totemKids] merge criancas:', e.message); res.status(500).json({ error: e.message || 'Erro ao fundir' }); }
});

// GET /api/totem-kids/criancas/:id · detalhe completo
router.get('/criancas/:id', authorizeModule('kids', 1), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('kids_criancas')
      .select(`
        *, familia:mem_familias(id, nome),
        responsaveis:kids_responsaveis(
          id, membro_id, parentesco, autorizado_buscar, contato_emergencia, observacao,
          membro:mem_membros(id, nome, telefone, cpf, foto_url, email)
        )
      `)
      .eq('id', req.params.id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Criança não encontrada' });

    res.json({
      ...data,
      foto_url: await fotoVisivelCrianca(data),
      idade_meses: calcIdadeMeses(data.data_nascimento),
      idade_label: formatIdade(calcIdadeMeses(data.data_nascimento)),
      sala_sugerida: await sugerirSala(calcIdadeMeses(data.data_nascimento)),
    });
  } catch (e) {
    console.error('[totemKids/criancas/:id]', e.message);
    res.status(500).json({ error: 'Erro ao buscar criança' });
  }
});

// POST /api/totem-kids/criancas · cria criança + responsável (first visit)
// Body:
//   { criança: { nome, data_nascimento, sexo, observacoes_medicas, ... },
//     responsável: { nome, telefone, cpf, parentesco, email? } }
router.post('/criancas', authorizeModule('kids', 2), async (req, res) => {
  try {
    const { crianca, responsavel, responsaveis, amigo_de_crianca_id, permitir_sem_cpf } = req.body || {};
    if (!crianca?.nome) return res.status(400).json({ error: 'crianca.nome obrigatorio' });

    const txt = (cond, v) => (cond && v ? String(v).trim().slice(0, 500) : null);
    const bool = (v) => (v === true ? true : (v === false ? false : null));
    // Base da criança (+ saúde) compartilhada entre os fluxos. Sempre visitante=true.
    const camposCrianca = {
      nome: crianca.nome,
      data_nascimento: crianca.data_nascimento || null,
      sexo: crianca.sexo || null,
      observacoes_medicas: crianca.observacoes_medicas || null,
      necessidades_especiais: crianca.necessidades_especiais || null,
      serie: crianca.serie || null,
      foto_url: crianca.foto_url || null,
      foto_consentimento_em: crianca.foto_url ? new Date().toISOString() : null,
      tem_alergia: bool(crianca.tem_alergia),
      alergia_qual: txt(crianca.tem_alergia === true, crianca.alergia_qual),
      tem_espectro: bool(crianca.tem_espectro),
      espectro_qual: txt(crianca.tem_espectro === true, crianca.espectro_qual),
      tem_limitacao_fisica: bool(crianca.tem_limitacao_fisica),
      limitacao_fisica_qual: txt(crianca.tem_limitacao_fisica === true, crianca.limitacao_fisica_qual),
      consent_marketing: bool(crianca.consent_marketing),
      consent_marketing_em: crianca.consent_marketing == null ? null : new Date().toISOString(),
      consent_marketing_versao: crianca.consent_marketing == null ? null : 'v1',
      visitante: true,
      created_by: req.user.userId,
    };

    // ── Fluxo "amigo de X": herda família + responsáveis de uma criança cadastrada ──
    if (amigo_de_crianca_id) {
      const { data: amigo } = await supabase.from('kids_criancas')
        .select('id, nome, familia_id').eq('id', amigo_de_crianca_id).is('deleted_at', null).maybeSingle();
      if (!amigo) return res.status(404).json({ error: 'Criança de referência não encontrada' });
      const { data: criancaCriada, error: errC } = await supabase.from('kids_criancas')
        .insert({ ...camposCrianca, familia_id: amigo.familia_id || null,
          observacoes_internas: `Visitante · amigo(a) de ${amigo.nome}` })
        .select('*, familia:mem_familias(id, nome)').single();
      if (errC) throw errC;
      const { data: resps } = await supabase.from('kids_responsaveis')
        .select('membro_id, parentesco, autorizado_buscar, contato_emergencia').eq('crianca_id', amigo.id);
      const aut = (resps || []).filter((r) => r.autorizado_buscar);
      if (aut.length) {
        await supabase.from('kids_responsaveis').insert(aut.map((r) => ({
          crianca_id: criancaCriada.id, membro_id: r.membro_id,
          parentesco: r.parentesco || 'responsavel', autorizado_buscar: true,
          contato_emergencia: r.contato_emergencia || false,
        })));
      }
      return res.status(201).json({ crianca: criancaCriada, amigo_de: { id: amigo.id, nome: amigo.nome }, familia_id: amigo.familia_id });
    }

    // ── Fluxo normal: exige AO MENOS 1 responsável (nome + telefone) ──
    // Aceita `responsaveis` (lista) ou `responsavel` (único · retrocompat).
    const listaResp = (Array.isArray(responsaveis) && responsaveis.length)
      ? responsaveis
      : (responsavel ? [responsavel] : []);
    const validos = listaResp.filter(r => r?.nome && r?.telefone);
    if (!validos.length) {
      return res.status(400).json({ error: 'Informe ao menos um responsável (nome e telefone)' });
    }

    // CPF do responsável obrigatório NO SERVIDOR (auditoria CPF 2026-07-16 ·
    // antes a regra vivia só no gate do React: chamada direta gravava membro
    // sem CPF e CPF malformado era descartado em silêncio pelo normalizarCpf).
    // Válvula do supervisor (permitir_sem_cpf) continua valendo — a política é
    // nunca travar o atendimento, mas a dispensa fica registrada.
    for (const r of validos) {
      const bruto = String(r.cpf || '').replace(/\D/g, '');
      if (bruto && (bruto.length !== 11 || !cpfValido(bruto))) {
        return res.status(400).json({ error: `CPF de ${r.nome} inválido — confira os dígitos` });
      }
      if (!bruto && !permitir_sem_cpf) {
        return res.status(422).json({
          error: `CPF de ${r.nome} é obrigatório — sem o documento agora, o supervisor pode liberar`,
          code: 'cpf_obrigatorio',
        });
      }
    }

    // Resolve cada responsável (find-or-create membro) + resolve a família
    // (compartilhada por todos · a do 1º que já tiver, senão cria uma nova).
    const membros = [];
    let familiaId = null;
    for (const resp of validos) {
      const tel = normalizarTelefone(resp.telefone);
      const cpf = normalizarCpf(resp.cpf);
      const rr = await acharOuCriarGuardado({
        cpf, email: resp.email || null, telefone: tel, nome: resp.nome, status: 'visitante',
      });
      const { data: membro } = await supabase.from('mem_membros')
        .select('id, nome, familia_id').eq('id', rr.membro_id).single();
      if (!familiaId) familiaId = membro.familia_id || null;
      membros.push({ membro, tel, cpf, parentesco: resp.parentesco || 'outro', autorizado_buscar: resp.autorizado_buscar !== false });
    }
    if (!familiaId) {
      const base = membros[0].membro;
      const { data: f, error: fe } = await supabase.from('mem_familias')
        .insert({ nome: `Familia ${base.nome.split(' ')[0]}` }).select('id').single();
      if (fe) throw fe;
      familiaId = f.id;
    }
    // Vincula à família quem ainda não tem
    for (const m of membros) {
      if (!m.membro.familia_id) {
        await supabase.from('mem_membros').update({ familia_id: familiaId, parentesco: 'responsavel' }).eq('id', m.membro.id);
      }
    }

    const { data: criancaCriada, error: errCrianca } = await supabase.from('kids_criancas')
      .insert({ ...camposCrianca, familia_id: familiaId })
      .select('*, familia:mem_familias(id, nome)').single();
    if (errCrianca) throw errCrianca;

    // Vínculos (dedup por membro)
    const vistos = new Set();
    const vinc = [];
    for (const m of membros) {
      if (vistos.has(m.membro.id)) continue;
      vistos.add(m.membro.id);
      vinc.push({ crianca_id: criancaCriada.id, membro_id: m.membro.id, parentesco: m.parentesco, autorizado_buscar: m.autorizado_buscar });
    }
    if (vinc.length) await supabase.from('kids_responsaveis').insert(vinc);

    res.status(201).json({
      crianca: criancaCriada,
      responsavel: { id: membros[0].membro.id, nome: membros[0].membro.nome, telefone: membros[0].tel, cpf: membros[0].cpf },
      responsaveis: membros.map(m => ({ id: m.membro.id, nome: m.membro.nome, telefone: m.tel })),
      familia_id: familiaId,
    });
  } catch (e) {
    const t = traduzErroUmPaiUmaMae(e);
    if (t) return res.status(t.status).json({ error: t.error });
    console.error('[totemKids/criancas POST]', e.message);
    res.status(500).json({ error: 'Erro ao cadastrar criança' });
  }
});

// PATCH /api/totem-kids/criancas/:id · editar
router.patch('/criancas/:id', authorizeModule('kids', 3), async (req, res) => {
  try {
    const allowed = ['nome', 'data_nascimento', 'sexo', 'familia_id', 'observacoes_medicas',
                     'necessidades_especiais', 'foto_url', 'visitante', 'ativo', 'observacoes_internas',
                     'serie', 'data_conversao', 'data_batismo', 'consent_marketing',
                     'tem_espectro', 'espectro_qual', 'tem_alergia', 'alergia_qual',
                     'tem_limitacao_fisica', 'limitacao_fisica_qual'];
    const update = {};
    for (const k of allowed) if (k in req.body) update[k] = req.body[k];
    if (req.body.foto_url && !req.body.foto_consentimento_em) {
      update.foto_consentimento_em = new Date().toISOString();
    }
    // Consentimento de uso de imagem (marketing) · carimba quando é definido
    if ('consent_marketing' in req.body) {
      update.consent_marketing_em = req.body.consent_marketing == null ? null : new Date().toISOString();
      update.consent_marketing_versao = req.body.consent_marketing == null ? null : 'v1';
    }
    const { data, error } = await supabase
      .from('kids_criancas')
      .update(update)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao editar criança' });
  }
});

// PATCH /criancas/:criancaId/responsaveis/:membroId · atualiza o VÍNCULO
// (parentesco / autorizado a buscar) na kids_responsaveis — o parentesco vive
// no vínculo, não no mem_membros.
router.patch('/criancas/:criancaId/responsaveis/:membroId', authorizeModule('kids', 3), async (req, res) => {
  try {
    const allowed = ['parentesco', 'autorizado_buscar', 'contato_emergencia'];
    const update = {};
    for (const k of allowed) if (k in req.body) update[k] = req.body[k];
    if (!Object.keys(update).length) return res.status(400).json({ error: 'Nada pra atualizar' });
    const { data, error } = await supabase
      .from('kids_responsaveis')
      .update(update)
      .eq('crianca_id', req.params.criancaId)
      .eq('membro_id', req.params.membroId)
      .select()
      .maybeSingle();
    if (error) throw error;
    res.json(data || { ok: true });
  } catch (e) {
    const t = traduzErroUmPaiUmaMae(e);
    if (t) return res.status(t.status).json({ error: t.error });
    console.error('[totemKids] update vinculo responsavel:', e.message);
    res.status(500).json({ error: 'Erro ao atualizar o vínculo do responsável' });
  }
});

// DELETE /criancas/:criancaId/responsaveis/:membroId · desvincula o responsável
// da criança (remove só o VÍNCULO kids_responsaveis · NÃO apaga o membro). Não
// deixa a criança ficar sem nenhum responsável.
router.delete('/criancas/:criancaId/responsaveis/:membroId', authorizeModule('kids', 3), async (req, res) => {
  try {
    const { criancaId, membroId } = req.params;
    const { count } = await supabase.from('kids_responsaveis')
      .select('id', { count: 'exact', head: true })
      .eq('crianca_id', criancaId);
    if ((count || 0) <= 1) {
      return res.status(400).json({ error: 'A criança precisa ter ao menos um responsável. Adicione outro antes de remover este.' });
    }
    const { error } = await supabase.from('kids_responsaveis')
      .delete()
      .eq('crianca_id', criancaId).eq('membro_id', membroId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[totemKids] remove vinculo responsavel:', e.message);
    res.status(500).json({ error: 'Erro ao remover o responsável' });
  }
});

// PATCH /api/totem-kids/membro/:id · corrige nome/telefone do responsável
// (mem_membros) direto do totem Kids — pra consertar nome errado no check-in.
router.patch('/membro/:id', authorizeModule('kids', 3), async (req, res) => {
  try {
    const allowed = ['nome', 'telefone'];
    const update = {};
    for (const k of allowed) {
      if (k in req.body && String(req.body[k] ?? '').trim()) update[k] = String(req.body[k]).trim();
    }
    if (Object.keys(update).length === 0) return res.status(400).json({ error: 'Nada pra atualizar' });
    const { data, error } = await supabase
      .from('mem_membros')
      .update(update)
      .eq('id', req.params.id)
      .is('deleted_at', null)
      .select('id, nome, telefone')
      .single();
    if (error) throw error;

    // mem_membros é o cadastro CANÔNICO da pessoa — propaga a mudança pros
    // espelhos (best-effort · não falha a resposta): conta de usuário
    // (profiles) e perfil de voluntariado (vol_profiles). O telefone do bot
    // WhatsApp (whatsapp_lideres) re-sincroniza no cron diário de líderes.
    (async () => {
      try {
        const patchProfile = {};
        if (update.telefone) patchProfile.telefone = update.telefone;
        if (update.nome) patchProfile.name = update.nome;
        if (Object.keys(patchProfile).length) {
          await supabase.from('profiles').update(patchProfile).eq('membro_id', req.params.id);
        }
      } catch (err) { console.error('[totemKids/membro] sync profiles:', err.message); }
      try {
        const patchVol = {};
        if (update.telefone) patchVol.phone = update.telefone;
        if (update.nome) patchVol.full_name = update.nome;
        if (Object.keys(patchVol).length) {
          await supabase.from('vol_profiles').update(patchVol).eq('membresia_id', req.params.id);
        }
      } catch (err) { console.error('[totemKids/membro] sync vol_profiles:', err.message); }
    })();

    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao editar responsável' });
  }
});

// ── Senha de edição da ficha da criança (totem) ──────────────────────────────
// Criada por líder do Kids (Mari/Milena · kids>=4). Editar a ficha no totem exige
// verificar essa senha (qualquer operador kids>=1).
router.get('/edit-senha/status', authorizeModule('kids', 1), async (_req, res) => {
  try {
    const { data } = await supabase.from('kids_totem_config').select('edit_senha_hash').eq('id', true).maybeSingle();
    res.json({ definida: !!data?.edit_senha_hash });
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

router.post('/edit-senha', authorizeModule('kids', 4), async (req, res) => {
  try {
    const bcrypt = require('bcryptjs');
    const senha = String(req.body?.senha || '');
    if (senha.length < 4) return res.status(400).json({ error: 'A senha precisa ter ao menos 4 caracteres' });
    const hash = bcrypt.hashSync(senha, 10);
    const { error } = await supabase.from('kids_totem_config')
      .update({ edit_senha_hash: hash, edit_senha_por: req.user?.userId || null, edit_senha_em: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', true);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao salvar a senha' }); }
});

router.post('/edit-senha/verificar', authorizeModule('kids', 1), async (req, res) => {
  try {
    const bcrypt = require('bcryptjs');
    const senha = String(req.body?.senha || '');
    const { data } = await supabase.from('kids_totem_config').select('edit_senha_hash').eq('id', true).maybeSingle();
    if (!data?.edit_senha_hash) return res.json({ ok: false, naoDefinida: true });
    res.json({ ok: bcrypt.compareSync(senha, data.edit_senha_hash) });
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

// GET /api/totem-kids/criancas · listagem completa (admin)
router.get('/criancas', authorizeModule('kids', 1), async (req, res) => {
  try {
    const ativo = req.query.ativo !== 'false';
    // Paginado · a base de crianças (import XLSX + sync PCO) passa de 1000, e o
    // PostgREST capa em 1000 por página. Loop até trazer todas (antes capava em 500).
    const pageSize = 1000;
    let from = 0;
    let data = [];
    while (true) {
      const { data: page, error } = await supabase
        .from('kids_criancas')
        .select(`
          id, nome, data_nascimento, sexo, foto_url, foto_storage_path, foto_consentimento_em, observacoes_medicas,
          necessidades_especiais, serie, consent_marketing, data_conversao, data_batismo, visitante, ativo, inativado_em, familia_id,
          familia:mem_familias(id, nome),
          responsaveis:kids_responsaveis(membro:mem_membros(id, nome, telefone))
        `)
        .eq('ativo', ativo)
        .order('nome')
        .range(from, from + pageSize - 1);
      if (error) throw error;
      if (!page || page.length === 0) break;
      data = data.concat(page);
      if (page.length < pageSize) break;
      from += pageSize;
    }
    res.json(await Promise.all(data.map(async c => ({
      ...c,
      foto_url: await fotoVisivelCrianca(c),
      idade_meses: calcIdadeMeses(c.data_nascimento),
      idade_label: formatIdade(calcIdadeMeses(c.data_nascimento)),
    }))));
  } catch (e) {
    res.status(500).json({ error: 'Erro ao listar crianças' });
  }
});

// ── Atendimentos por criança (histórico de contatos/cuidados da equipe) ──────
// GET /criancas/:id/atendimentos
router.get('/criancas/:id/atendimentos', authorizeModule('kids', 1), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('kids_atendimentos')
      .select('*')
      .eq('crianca_id', req.params.id)
      .is('deleted_at', null)
      .order('data', { ascending: false }).order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar atendimentos' }); }
});

// POST /criancas/:id/atendimentos  { tipo, descricao, data }
router.post('/criancas/:id/atendimentos', authorizeModule('kids', 2), async (req, res) => {
  try {
    const descricao = String(req.body?.descricao || '').trim();
    if (!descricao) return res.status(400).json({ error: 'Descreva o atendimento' });
    const tiposOk = ['contato', 'ausencia', 'saude', 'observacao', 'outro'];
    const tipo = tiposOk.includes(req.body?.tipo) ? req.body.tipo : 'contato';
    const data = /^\d{4}-\d{2}-\d{2}$/.test(req.body?.data || '') ? req.body.data : new Date().toISOString().slice(0, 10);
    const { data: criado, error } = await supabase
      .from('kids_atendimentos')
      .insert({
        crianca_id: req.params.id, tipo, descricao: descricao.slice(0, 2000), data,
        registrado_por: req.user?.userId || null,
        registrado_por_nome: req.user?.name || req.user?.email || null,
      })
      .select().single();
    if (error) throw error;
    res.status(201).json(criado);
  } catch (e) { res.status(500).json({ error: 'Erro ao registrar atendimento' }); }
});

// DELETE /atendimentos/:id (soft)
router.delete('/atendimentos/:id', authorizeModule('kids', 3), async (req, res) => {
  try {
    const { error } = await supabase.from('kids_atendimentos')
      .update({ deleted_at: new Date().toISOString() }).eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao remover atendimento' }); }
});

// PATCH /criancas/:id/inativar  { motivo }  ·  reativar com { ativo: true }
router.patch('/criancas/:id/inativar', authorizeModule('kids', 3), async (req, res) => {
  try {
    const reativar = req.body?.ativo === true;
    const upd = reativar
      ? { ativo: true, inativado_em: null, motivo_inativacao: null }
      : { ativo: false, inativado_em: new Date().toISOString(), motivo_inativacao: String(req.body?.motivo || 'Desativado manualmente').slice(0, 300) };
    const { data, error } = await supabase.from('kids_criancas')
      .update(upd).eq('id', req.params.id).select('id, ativo').single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar status' }); }
});

// ── Equipe do Kids por posição (usa os times/posições do voluntariado · PCO) ──
// As posições já existem no voluntariado (vol_teams "Kids"/"Apoio Kids"/"Vocal
// Kids" → vol_positions: Baby, Little 3-4, Recepção, Coordenação...). Os
// responsáveis do Kids alocam voluntários nessas posições gravando em
// vol_team_members — 1 fonte de verdade, integrada com o voluntariado.
async function kidsTeamsList() {
  const { data } = await supabase.from('vol_teams')
    .select('id, name, color, sort_order').ilike('name', '%kid%').eq('is_active', true);
  return data || [];
}
const limparTime = (n) => String(n || '').replace(/^[-\s]+/, '');

// GET /kids-equipe · times do Kids + posições + voluntários alocados
router.get('/kids-equipe', authorizeModule('kids', 1), async (req, res) => {
  try {
    const teams = await kidsTeamsList();
    if (!teams.length) return res.json([]);
    const teamIds = teams.map((t) => t.id);
    const [{ data: positions }, { data: membros }] = await Promise.all([
      supabase.from('vol_positions').select('id, team_id, name, sort_order').in('team_id', teamIds).eq('is_active', true),
      supabase.from('vol_team_members').select('id, team_id, position_id, volunteer_profile_id, volunteer_name').in('team_id', teamIds).eq('is_active', true),
    ]);
    const porPos = {}, semPos = {};
    (membros || []).forEach((m) => {
      if (m.position_id) (porPos[m.position_id] = porPos[m.position_id] || []).push(m);
      else (semPos[m.team_id] = semPos[m.team_id] || []).push(m);
    });
    const out = teams
      .sort((a, b) => (a.sort_order ?? 99) - (b.sort_order ?? 99) || a.name.localeCompare(b.name))
      .map((t) => ({
        team_id: t.id, team_nome: limparTime(t.name), cor: t.color,
        posicoes: (positions || []).filter((p) => p.team_id === t.id)
          .sort((a, b) => (a.sort_order ?? 99) - (b.sort_order ?? 99))
          .map((p) => ({ position_id: p.id, nome: p.name, membros: porPos[p.id] || [] })),
        sem_posicao: semPos[t.id] || [],
      }));
    res.json(out);
  } catch (e) { console.error('[totemKids] kids-equipe:', e.message); res.status(500).json({ error: 'Erro ao carregar equipe' }); }
});

// GET /kids-equipe/buscar?q= · busca voluntários (vol_profiles)
router.get('/kids-equipe/buscar', authorizeModule('kids', 1), async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (q.length < 2) return res.json([]);
    const { data } = await supabase.from('vol_profiles')
      .select('id, full_name, phone, email, avatar_url, membresia_id')
      .ilike('full_name', `%${q.replace(/[%_,]/g, '')}%`).limit(12);
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: 'Erro na busca' }); }
});

// POST /kids-equipe/membro · aloca voluntário numa posição (ou no time)
router.post('/kids-equipe/membro', authorizeModule('kids', 3), async (req, res) => {
  try {
    const { team_id, position_id, vol_profile_id, nome } = req.body || {};
    if (!team_id || !vol_profile_id || !nome) return res.status(400).json({ error: 'Dados incompletos' });
    let dup = supabase.from('vol_team_members').select('id').eq('team_id', team_id).eq('volunteer_profile_id', vol_profile_id).eq('is_active', true);
    dup = position_id ? dup.eq('position_id', position_id) : dup.is('position_id', null);
    const { data: existe } = await dup.maybeSingle();
    if (existe) return res.status(409).json({ error: 'Voluntário já está nessa posição' });
    const { data, error } = await supabase.from('vol_team_members').insert({
      team_id, position_id: position_id || null, volunteer_profile_id: vol_profile_id,
      volunteer_name: String(nome).trim(), is_active: true,
    }).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) { console.error('[totemKids] kids-equipe add:', e.message); res.status(500).json({ error: 'Erro ao alocar' }); }
});

// DELETE /kids-equipe/membro/:id · remove (desativa o vínculo)
router.delete('/kids-equipe/membro/:id', authorizeModule('kids', 3), async (req, res) => {
  try {
    const { error } = await supabase.from('vol_team_members').update({ is_active: false }).eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao remover' }); }
});

// GET /kids-equipe/membro/:volProfileId/ficha · ficha do voluntário
router.get('/kids-equipe/membro/:volProfileId/ficha', authorizeModule('kids', 1), async (req, res) => {
  try {
    const { data: p } = await supabase.from('vol_profiles')
      .select('id, full_name, email, phone, cpf, avatar_url, membresia_id, profile_complete').eq('id', req.params.volProfileId).maybeSingle();
    if (!p) return res.status(404).json({ error: 'Voluntário não encontrado' });
    let antecedentes = null;
    if (p.membresia_id) {
      const { data: bc } = await supabase.from('vol_background_checks')
        .select('status, resultado, consulta_em, revisado_em, area').eq('membro_id', p.membresia_id).is('deleted_at', null)
        .order('created_at', { ascending: false }).limit(1);
      antecedentes = (bc || [])[0] || null;
    }
    const teams = await kidsTeamsList();
    const teamIds = teams.map((t) => t.id);
    let posicoes = [];
    if (teamIds.length) {
      const { data: tm } = await supabase.from('vol_team_members')
        .select('team_id, position_id').eq('volunteer_profile_id', p.id).eq('is_active', true).in('team_id', teamIds);
      const posIds = (tm || []).map((m) => m.position_id).filter(Boolean);
      const { data: posRows } = posIds.length
        ? await supabase.from('vol_positions').select('id, name').in('id', posIds)
        : { data: [] };
      const posMap = Object.fromEntries((posRows || []).map((r) => [r.id, r.name]));
      const teamMap = Object.fromEntries(teams.map((t) => [t.id, limparTime(t.name)]));
      posicoes = (tm || []).map((m) => ({ time: teamMap[m.team_id], posicao: m.position_id ? posMap[m.position_id] : null }));
    }
    res.json({ perfil: p, antecedentes, posicoes });
  } catch (e) { console.error('[totemKids] ficha equipe:', e.message); res.status(500).json({ error: 'Erro na ficha' }); }
});

// ── Estoque por sala (qtd esperada vs atual · liga ao Patrimônio com tag Kids) ─
// ── Sala ↔ Patrimônio · localizações Kids, sincronização e reflexo dos bens ──
// Localizações do módulo Patrimônio "do Kids" (CBKIDS, salas, recepção, copa...).
// Exclui os nós-reflexo "Kids" / "Kids · <sala>" criados pelo fluxo inverso.
async function localizacoesKidsPatrimonio() {
  const ors = ['nome.ilike.*kid*', 'nome.ilike.*infantil*', 'nome.ilike.*maternal*', 'nome.ilike.*berç*', 'nome.ilike.*baby*', 'nome.ilike.*little*', 'nome.ilike.*elevate*'].join(',');
  const { data } = await supabase.from('pat_localizacoes').select('id, nome').or(ors).order('nome');
  return (data || []).filter((l) => l.nome && !/^kids(\s·|$)/i.test(String(l.nome).trim()));
}

// GET /salas/localizacoes-kids · localizações Kids do patrimônio + se já têm sala
router.get('/salas/localizacoes-kids', authorizeModule('kids', 1), async (req, res) => {
  try {
    const locs = await localizacoesKidsPatrimonio();
    const { data: salas } = await supabase.from('kids_salas').select('pat_localizacao_id');
    const linkadas = new Set((salas || []).map((s) => s.pat_localizacao_id).filter(Boolean));
    res.json(locs.map((l) => ({ ...l, tem_sala: linkadas.has(l.id) })));
  } catch (e) { console.error('[totemKids] loc-kids:', e.message); res.status(500).json({ error: 'Erro ao listar localizações' }); }
});

// POST /salas/sincronizar-patrimonio · cria salas das localizações Kids sem sala
router.post('/salas/sincronizar-patrimonio', authorizeModule('kids', 3), async (req, res) => {
  try {
    const locs = await localizacoesKidsPatrimonio();
    const { data: salas } = await supabase.from('kids_salas').select('pat_localizacao_id, ordem');
    const linkadas = new Set((salas || []).map((s) => s.pat_localizacao_id).filter(Boolean));
    let ordem = Math.max(0, ...(salas || []).map((s) => s.ordem || 0));
    const novas = locs.filter((l) => !linkadas.has(l.id));
    if (!novas.length) return res.json({ criadas: 0, ja_linkadas: linkadas.size, total_loc: locs.length });
    const rows = novas.map((l) => ({ nome: l.nome, pat_localizacao_id: l.id, cor: '#00B39D', ordem: ++ordem }));
    const { error } = await supabase.from('kids_salas').insert(rows);
    if (error) throw error;
    res.json({ criadas: rows.length, ja_linkadas: linkadas.size, total_loc: locs.length });
  } catch (e) { console.error('[totemKids] sync salas:', e.message); res.status(500).json({ error: 'Erro ao sincronizar' }); }
});

// PATCH /salas/:id/localizacao · liga/desliga uma localização do patrimônio
router.patch('/salas/:id/localizacao', authorizeModule('kids', 3), async (req, res) => {
  try {
    const locId = req.body?.localizacao_id || null;
    const { data, error } = await supabase.from('kids_salas')
      .update({ pat_localizacao_id: locId }).eq('id', req.params.id).select('id, pat_localizacao_id').single();
    if (error) throw error;
    res.json(data);
  } catch (e) { console.error('[totemKids] link sala loc:', e.message); res.status(500).json({ error: 'Erro ao vincular localização' }); }
});

// GET /estoque · salas + itens + bens do patrimônio (sala vinculada) + resumo
router.get('/estoque', authorizeModule('kids', 1), async (req, res) => {
  try {
    const { data: salas } = await supabase.from('kids_salas')
      .select('id, nome, cor, ordem, pat_localizacao_id').eq('ativo', true).order('ordem', { ascending: true });
    const { data: itens } = await supabase.from('kids_estoque')
      .select('id, sala_id, nome, categoria, unidade, qtd_esperada, qtd_atual, pat_bem_id, observacao')
      .is('deleted_at', null).order('categoria', { ascending: true });
    const porSala = {};
    (itens || []).forEach((i) => { (porSala[i.sala_id] = porSala[i.sala_id] || []).push(i); });
    // reflete os bens do Patrimônio das localizações vinculadas
    const locIds = [...new Set((salas || []).map((s) => s.pat_localizacao_id).filter(Boolean))];
    const patPorLoc = {};
    if (locIds.length) {
      const { data: bens } = await supabase.from('pat_bens')
        .select('id, nome, status, numero_serie, marca, modelo, localizacao_id, pat_categorias(nome)')
        .in('localizacao_id', locIds).order('nome');
      (bens || []).forEach((b) => { (patPorLoc[b.localizacao_id] = patPorLoc[b.localizacao_id] || []).push(b); });
    }
    res.json((salas || []).map((s) => {
      const list = porSala[s.id] || [];
      const faltando = list.filter((i) => (i.qtd_atual || 0) < (i.qtd_esperada || 0)).length;
      const patrimonio = s.pat_localizacao_id ? (patPorLoc[s.pat_localizacao_id] || []) : [];
      return { ...s, itens: list, faltando, total_itens: list.length, patrimonio };
    }));
  } catch (e) { console.error('[totemKids] estoque:', e.message); res.status(500).json({ error: 'Erro ao carregar estoque' }); }
});

// POST /salas/:salaId/estoque · novo item de estoque
router.post('/salas/:salaId/estoque', authorizeModule('kids', 2), async (req, res) => {
  try {
    const { nome, categoria, unidade, qtd_esperada, qtd_atual, observacao } = req.body || {};
    if (!nome) return res.status(400).json({ error: 'Nome do item é obrigatório' });
    const { data, error } = await supabase.from('kids_estoque').insert({
      sala_id: req.params.salaId, nome: String(nome).trim(),
      categoria: categoria || null, unidade: unidade || 'un',
      qtd_esperada: Number(qtd_esperada) || 0, qtd_atual: Number(qtd_atual) || 0,
      observacao: observacao || null, created_by: req.user?.userId || null,
    }).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) { console.error('[totemKids] estoque add:', e.message); res.status(500).json({ error: 'Erro ao adicionar item' }); }
});

// PATCH /estoque/:id · editar (quantidades, nome, categoria...)
router.patch('/estoque/:id', authorizeModule('kids', 2), async (req, res) => {
  try {
    const upd = {};
    for (const k of ['nome', 'categoria', 'unidade', 'qtd_esperada', 'qtd_atual', 'observacao', 'ativo']) if (k in req.body) upd[k] = req.body[k];
    upd.updated_at = new Date().toISOString();
    const { data, error } = await supabase.from('kids_estoque').update(upd).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao editar item' }); }
});

// DELETE /estoque/:id · soft delete
router.delete('/estoque/:id', authorizeModule('kids', 3), async (req, res) => {
  try {
    const { error } = await supabase.from('kids_estoque').update({ deleted_at: new Date().toISOString() }).eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao remover item' }); }
});

// POST /estoque/:id/patrimonio · registra o item no Patrimônio (tag Kids + sala)
router.post('/estoque/:id/patrimonio', authorizeModule('kids', 3), async (req, res) => {
  try {
    const { data: item } = await supabase.from('kids_estoque')
      .select('id, nome, observacao, pat_bem_id, sala_id').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!item) return res.status(404).json({ error: 'Item não encontrado' });
    if (item.pat_bem_id) return res.status(409).json({ error: 'Item já está no patrimônio' });
    const { data: sala } = await supabase.from('kids_salas').select('nome').eq('id', item.sala_id).maybeSingle();
    const salaNome = sala?.nome || 'Kids';
    // categoria "Kids" (tag)
    const { data: cat } = await supabase.from('pat_categorias').select('id').ilike('nome', 'kids').limit(1).maybeSingle();
    // localização "Kids · <sala>" (find-or-create sob o nó "Kids")
    let { data: parent } = await supabase.from('pat_localizacoes').select('id').ilike('nome', 'Kids').is('pai_id', null).limit(1).maybeSingle();
    if (!parent) { const r = await supabase.from('pat_localizacoes').insert({ nome: 'Kids' }).select('id').single(); parent = r.data; }
    const locNome = `Kids · ${salaNome}`;
    let { data: loc } = await supabase.from('pat_localizacoes').select('id').ilike('nome', locNome).limit(1).maybeSingle();
    if (!loc) { const r = await supabase.from('pat_localizacoes').insert({ nome: locNome, pai_id: parent?.id || null }).select('id').single(); loc = r.data; }
    const { data: bem, error } = await supabase.from('pat_bens').insert({
      nome: item.nome, categoria_id: cat?.id || null, localizacao_id: loc?.id || null,
      status: 'ativo', observacoes: item.observacao || `Item do Kids · sala ${salaNome}`,
      created_by: req.user?.userId || null,
    }).select('id').single();
    if (error) throw error;
    await supabase.from('kids_estoque').update({ pat_bem_id: bem.id, updated_at: new Date().toISOString() }).eq('id', item.id);
    res.json({ ok: true, pat_bem_id: bem.id });
  } catch (e) { console.error('[totemKids] estoque->patrimonio:', e.message); res.status(500).json({ error: 'Erro ao registrar no patrimônio' }); }
});

// ── Resumo do Kids no fim do culto (WhatsApp + in-app/e-mail) ─────────────────
// Líderes: Matheus, Milena, Mariane (Mariane sem telefone → só in-app/e-mail).
async function lideresKidsComTelefone() {
  const { data } = await supabase.from('mem_membros')
    .select('id, nome, telefone')
    .or('nome.ilike.*milena*rochet*,nome.ilike.*mariane*gaia*,nome.ilike.*matheus*toscano*')
    .not('telefone', 'is', null).is('deleted_at', null);
  const seen = new Set(); const out = [];
  (data || []).forEach((m) => {
    const n = (m.nome || '').toLowerCase();
    const key = n.includes('milena') ? 'milena' : n.includes('mariane') ? 'mariane' : 'matheus';
    if (!seen.has(key)) { seen.add(key); out.push(m); }
  });
  return out;
}

async function gerarResumoKids(sessaoId, { exemplo = false } = {}) {
  let culto = { nome: 'Domingo 10:00', data: null };
  let totalCriancas = 0, decisoes = 0, porSala = [], voluntarios = [];
  if (exemplo) {
    culto = { nome: 'Domingo 10:00', data: new Date().toISOString().slice(0, 10) };
    totalCriancas = 23; decisoes = 2;
    porSala = [{ sala: 'Berçário', n: 4 }, { sala: 'Maternal', n: 6 }, { sala: 'Infantil 1', n: 8 }, { sala: 'Infantil 2', n: 5 }];
    voluntarios = ['Mariane Gaia · Coordenação', 'Milena Rochet · Recepção', 'Ana · Berçário'];
  } else if (sessaoId) {
    const { data: sessao } = await supabase.from('kids_sessoes').select('id, culto:cultos(nome, data)').eq('id', sessaoId).maybeSingle();
    if (sessao?.culto) culto = sessao.culto;
    const { data: cis } = await supabase.from('kids_checkins').select('sala_id, fez_decisao_jesus').eq('sessao_id', sessaoId).is('deleted_at', null);
    totalCriancas = (cis || []).length;
    decisoes = (cis || []).filter((c) => c.fez_decisao_jesus).length;
    const salaCount = {};
    (cis || []).forEach((c) => { if (c.sala_id) salaCount[c.sala_id] = (salaCount[c.sala_id] || 0) + 1; });
    const { data: salas } = await supabase.from('kids_salas').select('id, nome');
    const nomeSala = Object.fromEntries((salas || []).map((s) => [s.id, s.nome]));
    porSala = Object.entries(salaCount).map(([id, n]) => ({ sala: nomeSala[id] || 'Sala', n }));
  }
  const dataFmt = culto.data ? new Date(culto.data + 'T00:00:00').toLocaleDateString('pt-BR') : '';
  const linhas = [
    `🧒 *Resumo do Kids*${exemplo ? ' (exemplo)' : ''}`,
    `${culto.nome}${dataFmt ? ` · ${dataFmt}` : ''}`,
    '',
    `👶 Crianças no check-in: *${totalCriancas}*`,
    `✝️ Decisões de fé: *${decisoes}*`,
  ];
  if (porSala.length) { linhas.push('', '*Por sala:*'); porSala.forEach((s) => linhas.push(`• ${s.sala}: ${s.n}`)); }
  if (voluntarios.length) { linhas.push('', '*Voluntários:*'); voluntarios.forEach((v) => linhas.push(`• ${v}`)); }
  linhas.push('', '_CBRio · enviado ao fim de cada culto com Kids._');
  const detalheParts = [];
  if (porSala.length) detalheParts.push(porSala.map((s) => `${s.sala} ${s.n}`).join(', '));
  if (voluntarios.length) detalheParts.push(`Voluntários: ${voluntarios.join(', ')}`);
  const params = [
    `${culto.nome}${dataFmt ? ` · ${dataFmt}` : ''}`,
    String(totalCriancas),
    String(decisoes),
    detalheParts.join(' · ') || 'sem registros',
  ];
  return { texto: linhas.join('\n'), params };
}

// Envia o resumo por TEMPLATE aprovado (WHATSAPP_TEMPLATE_KIDS_RESUMO) quando a
// env existe (chega fora da janela de 24h); senão cai no texto livre (dentro da
// janela de 24h). pt_BR por padrão (configurável por WHATSAPP_TEMPLATE_KIDS_RESUMO_LANG).
async function enviarResumoWpp(telefone, { texto, params }) {
  const tpl = process.env.WHATSAPP_TEMPLATE_KIDS_RESUMO;
  if (tpl) return enviarTemplateWpp(telefone, tpl, process.env.WHATSAPP_TEMPLATE_KIDS_RESUMO_LANG || 'pt_BR', params);
  return enviarTextoWpp(telefone, texto);
}

async function enviarResumoKids(sessaoId) {
  try {
    const { texto, params } = await gerarResumoKids(sessaoId);
    const lideres = await lideresKidsComTelefone();
    for (const l of lideres) { await enviarResumoWpp(l.telefone, { texto, params }).catch(() => {}); }
    notificar({ modulo: 'kids', tipo: 'resumo_kids', titulo: 'Resumo do Kids (fim de culto)', mensagem: texto.replace(/\*/g, ''), severidade: 'info', link: '/ministerial/kids', email: true }).catch(() => {});
  } catch (e) { console.error('[totemKids] enviarResumoKids:', e.message); }
}

// POST /resumo/exemplo · envia um exemplo do resumo pro WhatsApp do solicitante
router.post('/resumo/exemplo', authorizeModule('kids', 1), async (req, res) => {
  try {
    const { texto, params } = await gerarResumoKids(null, { exemplo: true });
    let telefone = req.body?.telefone || null;
    if (!telefone && req.user?.userId) {
      const { data: prof } = await supabase.from('profiles').select('email, membro_id').eq('id', req.user.userId).maybeSingle();
      if (prof?.membro_id) { const { data: m } = await supabase.from('mem_membros').select('telefone').eq('id', prof.membro_id).maybeSingle(); telefone = m?.telefone || null; }
      if (!telefone && prof?.email) { const { data: m } = await supabase.from('mem_membros').select('telefone').ilike('email', prof.email).is('deleted_at', null).not('telefone', 'is', null).limit(1).maybeSingle(); telefone = m?.telefone || null; }
    }
    if (!telefone) return res.status(400).json({ error: 'Você não tem telefone cadastrado na Membresia.' });
    const r = await enviarResumoWpp(telefone, { texto, params });
    if (!r?.ok) return res.status(502).json({ error: 'O WhatsApp não enviou — a janela de 24h pode ter fechado. Mande qualquer mensagem pro bot (21 99907-9031) e tente de novo.', preview: texto });
    res.json({ ok: true, telefone, preview: texto });
  } catch (e) { console.error('[totemKids] resumo exemplo:', e.message); res.status(500).json({ error: 'Erro ao enviar exemplo' }); }
});

// POST /resumo-pco/testar · DIAGNÓSTICO (só leitura · não grava, não envia):
// puxa os check-ins do Planning Center de um dia e devolve a frequência de
// crianças por culto + um retrato da estrutura do PCO. Default = último domingo.
router.post('/resumo-pco/testar', authorizeModule('kids', 1), async (req, res) => {
  try {
    const { coletarFrequenciaKidsPCO } = require('../services/planningCenterKidsCheckins');
    let data = req.body?.data;
    if (!data) {
      // último domingo (BRT)
      const hojeBRT = new Date(Date.now() - 3 * 3600 * 1000);
      const d = new Date(hojeBRT); d.setUTCDate(d.getUTCDate() - d.getUTCDay());
      data = d.toISOString().slice(0, 10);
    }
    const r = await coletarFrequenciaKidsPCO(data);
    res.json(r);
  } catch (e) {
    console.error('[totemKids] resumo-pco/testar:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao consultar o Planning Center' });
  }
});

// GET /frequencia-sistema?data=YYYY-MM-DD · check-ins feitos PELO SISTEMA (totem)
// naquele dia, agrupados por culto. Complementa a frequência do PCO (a mesma
// tela mostra as duas fontes).
router.get('/frequencia-sistema', authorizeModule('kids', 1), async (req, res) => {
  try {
    const data = String(req.query.data || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return res.status(400).json({ error: 'Data inválida' });

    const { data: cultos } = await supabase.from('cultos').select('id, nome, data').eq('data', data);
    if (!cultos || cultos.length === 0) return res.json({ data, total_criancas: 0, total_checkins: 0, por_culto: [] });
    const cultoIds = cultos.map(c => c.id);
    const nomeCulto = Object.fromEntries(cultos.map(c => [c.id, c.nome]));

    const { data: sessoes } = await supabase.from('kids_sessoes').select('id, culto_id').in('culto_id', cultoIds);
    if (!sessoes || sessoes.length === 0) return res.json({ data, total_criancas: 0, total_checkins: 0, por_culto: [] });
    const sessaoCulto = Object.fromEntries(sessoes.map(s => [s.id, s.culto_id]));

    const { data: checkins } = await supabase.from('kids_checkins')
      .select('id, sessao_id, crianca_id, checkin_at, checkout_at, codigo_seguranca, responsavel_checkin_nome, crianca:kids_criancas(id, nome, data_nascimento)')
      .in('sessao_id', sessoes.map(s => s.id))
      .is('deleted_at', null)
      .order('checkin_at', { ascending: true });

    const horaBRT = (iso) => {
      if (!iso) return '';
      const d = new Date(new Date(iso).getTime() - 3 * 3600 * 1000);
      return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
    };

    const porCultoMap = {};
    const criancasDistintas = new Set();
    for (const ck of (checkins || [])) {
      const cultoId = sessaoCulto[ck.sessao_id];
      if (!cultoId) continue;
      if (!porCultoMap[cultoId]) porCultoMap[cultoId] = { culto_id: cultoId, nome: nomeCulto[cultoId] || 'Culto', total: 0, criancas: [] };
      const cr = Array.isArray(ck.crianca) ? ck.crianca[0] : ck.crianca;
      porCultoMap[cultoId].criancas.push({
        crianca_id: ck.crianca_id,
        nome: cr?.nome || '—',
        hora: horaBRT(ck.checkin_at),
        codigo: ck.codigo_seguranca || null,
        saiu: !!ck.checkout_at,
        trazida_por: ck.responsavel_checkin_nome || null,
      });
      porCultoMap[cultoId].total++;
      if (ck.crianca_id) criancasDistintas.add(ck.crianca_id);
    }

    res.json({
      data,
      total_criancas: criancasDistintas.size,
      total_checkins: (checkins || []).length,
      por_culto: Object.values(porCultoMap),
    });
  } catch (e) {
    console.error('[totemKids] frequencia-sistema:', e.message);
    res.status(500).json({ error: 'Erro ao buscar check-ins do sistema' });
  }
});

// GET /comparativo-mes?mes=YYYY-MM · base do comparativo "sistema × PCO" da tela
// de Frequência: devolve os cultos do mês com o presencial_kids gravado hoje
// (2025 = backfill da planilha "Dados Reconfigurados" · 2026+ = totem/coleta).
// O front consulta o PCO dia a dia (POST /resumo-pco/testar) e cruza com esta
// lista pra mostrar a diferença por culto e o total do mês.
router.get('/comparativo-mes', authorizeModule('kids', 1), async (req, res) => {
  try {
    const mes = String(req.query.mes || '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(mes)) return res.status(400).json({ error: 'Mês inválido (use YYYY-MM)' });
    const [y, m] = mes.split('-').map(Number);
    const inicio = `${mes}-01`;
    const fim = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);

    const { data: cultos, error } = await supabase.from('cultos')
      .select('id, nome, data, presencial_kids, vol_service_types(name, recurrence_time, has_kids)')
      .gte('data', inicio).lte('data', fim)
      .order('data', { ascending: true });
    if (error) throw error;

    const lista = (cultos || []).map(c => ({
      culto_id: c.id,
      nome: c.nome || c.vol_service_types?.name || 'Culto',
      data: c.data,
      hhmm: (c.vol_service_types?.recurrence_time || '').slice(0, 5) || null,
      has_kids: !!c.vol_service_types?.has_kids,
      presencial_kids: c.presencial_kids ?? null,
    }));
    res.json({ mes, inicio, fim, cultos: lista, datas: [...new Set(lista.map(c => c.data))] });
  } catch (e) {
    console.error('[totemKids] comparativo-mes:', e.message);
    res.status(500).json({ error: 'Erro ao montar o comparativo do mês' });
  }
});

// POST /criancas/depurar-inativos · desativa as crianças (com vínculo PCO) que
// NÃO tiveram check-in nos últimos N meses (default 6). Saem da lista (que mostra
// só ativos). Reversível (ativo=false · não apaga). Body: { meses }.
router.post('/criancas/depurar-inativos', authorizeModule('kids', 3), async (req, res) => {
  try {
    const meses = Math.min(Math.max(Number(req.body?.meses) || 6, 1), 60);
    const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - meses);
    const { idsComCheckinDesde } = require('../services/planningCenterKidsCheckins');
    const ativosPco = await idsComCheckinDesde(cutoff.toISOString());

    // Crianças ativas COM vínculo PCO que não aparecem nos check-ins recentes.
    const inativar = [];
    let from = 0;
    while (true) {
      const { data, error } = await supabase.from('kids_criancas')
        .select('id, planning_center_id')
        .eq('ativo', true).is('deleted_at', null)
        .not('planning_center_id', 'is', null)
        .range(from, from + 999);
      if (error) throw error;
      if (!data || !data.length) break;
      for (const c of data) if (!ativosPco.has(String(c.planning_center_id))) inativar.push(c.id);
      if (data.length < 1000) break;
      from += 1000;
    }

    let desativadas = 0;
    const motivo = `Sem check-in no Planning Center nos últimos ${meses} meses`;
    for (let i = 0; i < inativar.length; i += 500) {
      const lote = inativar.slice(i, i + 500);
      const { error } = await supabase.from('kids_criancas')
        .update({ ativo: false, inativado_em: new Date().toISOString(), motivo_inativacao: motivo })
        .in('id', lote);
      if (!error) desativadas += lote.length;
    }
    res.json({ ok: true, meses, ativos_pco: ativosPco.size, desativadas });
  } catch (e) {
    console.error('[totemKids] depurar-inativos:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao depurar inativos' });
  }
});

// GET /pco-pessoa/:pcoId · ficha + histórico de check-ins de uma criança no PCO
// (clique na lista de frequência). Resolve a ficha local por planning_center_id
// quando existir (sexo, responsáveis). Só leitura.
router.get('/pco-pessoa/:pcoId', authorizeModule('kids', 1), async (req, res) => {
  try {
    const { detalhePessoaPCO } = require('../services/planningCenterKidsCheckins');
    const r = await detalhePessoaPCO(req.params.pcoId);
    const { data: cr } = await supabase.from('kids_criancas')
      .select('id, nome, data_nascimento, sexo, visitante')
      .eq('planning_center_id', req.params.pcoId).maybeSingle();
    let responsaveis = [];
    if (cr?.id) {
      const { data: resp } = await supabase.from('kids_responsaveis')
        .select('parentesco, autorizado_buscar, membro:mem_membros(nome, telefone)')
        .eq('crianca_id', cr.id);
      responsaveis = (resp || []).map(x => ({
        parentesco: x.parentesco, autorizado_buscar: x.autorizado_buscar,
        nome: x.membro?.nome || null, telefone: x.membro?.telefone || null,
      }));
    }
    res.json({ ...r, crianca_local: cr || null, responsaveis });
  } catch (e) {
    console.error('[totemKids] pco-pessoa:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao consultar o Planning Center' });
  }
});

// E-mails dos destinatários do resumo (Mari Gaia, Milena, Matheus) → profile ids
// pra notificação in-app/e-mail (a Mari não tem WhatsApp, recebe por aqui).
const RESUMO_KIDS_EMAILS = ['mariane.gaia@cbrio.org', 'milena.rochet@cbrio.org', 'matheus.toscano@cbrio.org', 'matheus@cbrio.com.br'];

// Check-ins do NOSSO sistema (totem) pra um culto → crianças ÚNICAS.
// Retorna { comPco: Set(planning_center_id), semPco: Set(crianca_id sem vínculo
// PCO) }. Serve pra combinar com o PCO sem dupla contagem (dedup por
// planning_center_id quando a criança está vinculada aos dois lados).
async function nossosCheckinsDoCulto(cultoId) {
  const { data: sessoes } = await supabase.from('kids_sessoes').select('id').eq('culto_id', cultoId);
  const sessIds = (sessoes || []).map((s) => s.id);
  if (!sessIds.length) return { comPco: new Set(), semPco: new Set() };
  const { data: cis } = await supabase.from('kids_checkins')
    .select('crianca_id, crianca:kids_criancas(planning_center_id)')
    .in('sessao_id', sessIds).is('deleted_at', null);
  const comPco = new Set();
  const semPco = new Set();
  for (const ci of cis || []) {
    const pco = ci.crianca?.planning_center_id;
    if (pco) comPco.add(String(pco));
    else if (ci.crianca_id) semPco.add(ci.crianca_id);
  }
  return { comPco, semPco };
}

// Total combinado de crianças ÚNICAS no culto = PCO ∪ nosso sistema (totem),
// deduplicado por planning_center_id. `entry` é a linha por_culto do
// coletarFrequenciaKidsPCO. Devolve { total, pco, totem } (totem = extras do
// nosso sistema que NÃO estavam no PCO).
async function totalKidsCombinado(cultoId, entry) {
  const pco = entry?.total || 0;
  const pcoSet = new Set((entry?.criancas || []).map((c) => c.pco_id).filter(Boolean).map(String));
  const nossos = await nossosCheckinsDoCulto(cultoId);
  let extras = nossos.semPco.size;
  for (const p of nossos.comPco) if (!pcoSet.has(p)) extras += 1;
  return { total: pco + extras, pco, totem: extras };
}

// Dispara o resumo de UM culto (crianças únicas: PCO + totem) pros líderes.
async function dispararResumoKidsCulto(culto, total, fontes) {
  const dataFmt = culto.data ? new Date(culto.data + 'T00:00:00').toLocaleDateString('pt-BR') : '';
  const detalhe = fontes && (fontes.totem || 0) > 0
    ? `PCO ${fontes.pco || 0} · Totem ${fontes.totem || 0}`
    : 'Frequência do Planning Center';
  const linhas = [
    '🧒 *Resumo do Kids*',
    `${culto.nome}${dataFmt ? ` · ${dataFmt}` : ''}`,
    '',
    `👶 Crianças no check-in: *${total}*`,
    '',
    `_${detalhe} · confira a lista em /ministerial/totem-kids/frequencia_`,
  ];
  const texto = linhas.join('\n');
  const params = [`${culto.nome}${dataFmt ? ` · ${dataFmt}` : ''}`, String(total), '—', detalhe];
  // WhatsApp pros líderes com telefone (Matheus, Milena)
  const lideres = await lideresKidsComTelefone();
  for (const l of lideres) { await enviarResumoWpp(l.telefone, { texto, params }).catch(() => {}); }
  // In-app + e-mail pros 3 nominais (cobre a Mari, que não tem WhatsApp)
  let targetIds;
  try {
    const { data: alvos } = await supabase.from('profiles').select('id').in('email', RESUMO_KIDS_EMAILS);
    targetIds = (alvos || []).map(a => a.id);
  } catch { /* fallback no módulo kids */ }
  await notificar({
    modulo: 'kids', tipo: 'resumo_kids',
    titulo: 'Resumo do Kids (fim de culto)',
    mensagem: texto.replace(/\*/g, '').replace(/_/g, ''),
    link: '/ministerial/totem-kids/frequencia', severidade: 'info', email: true,
    chaveDedup: `resumo_kids_${culto.id}`,
    targetIds: targetIds && targetIds.length ? targetIds : undefined,
  }).catch(() => {});
}

// GET /cron/resumo-pco · roda de hora em hora (vercel.json · crons da Vercel são
// GET). Pra cada culto com Kids que JÁ terminou (data+horário+90min) e ainda não
// teve resumo enviado, puxa o total de crianças do PCO, grava em
// cultos.presencial_kids e dispara o resumo pros líderes. Idempotente (dedup por
// kids_resumo_enviado_at). Self-gating (barato quando não há culto pendente).
router.get('/cron/resumo-pco', async (req, res) => {
  if (!isAuthorizedCron(req)) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const { coletarFrequenciaKidsPCO } = require('../services/planningCenterKidsCheckins');
    const agora = Date.now();
    const agoraBRT = new Date(agora - 3 * 3600 * 1000);
    const hoje = agoraBRT.toISOString().slice(0, 10);
    const ontem = new Date(agoraBRT.getTime() - 24 * 3600 * 1000).toISOString().slice(0, 10);

    // Cultos com Kids dos últimos 2 dias (pendentes de resumo + já resumidos,
    // estes pra RECONCILIAR o número · check-ins corrigidos no PCO depois da
    // foto deixavam o dashboard ±1 diferente do módulo · 06/07).
    const { data: cultos } = await supabase
      .from('cultos')
      .select('id, nome, data, presencial_kids, kids_resumo_enviado_at, vol_service_types(recurrence_time, has_kids)')
      .in('data', [ontem, hoje]);

    // Só os que têm Kids e JÁ terminaram (início + 90 min de folga).
    const terminados = (cultos || []).filter((c) => {
      if (!c.vol_service_types?.has_kids) return false;
      const hhmm = (c.vol_service_types.recurrence_time || '').slice(0, 5);
      if (!hhmm) return false;
      const inicio = new Date(`${c.data}T${hhmm}:00-03:00`).getTime();
      return agora >= inicio + 90 * 60 * 1000;
    });
    const pendentes = terminados.filter((c) => !c.kids_resumo_enviado_at);
    const reconciliar = terminados.filter((c) => c.kids_resumo_enviado_at);
    if (!pendentes.length && !reconciliar.length) {
      return res.json({ ok: true, enviados: 0, motivo: 'nenhum culto pendente' });
    }

    // Coleta 1x por data (a coleta já devolve o total por culto do dia).
    const datas = [...new Set([...pendentes, ...reconciliar].map((c) => c.data))];
    const porData = {};
    for (const d of datas) {
      try { porData[d] = await coletarFrequenciaKidsPCO(d); } catch (e) { console.error(`[resumo-pco] coleta ${d}:`, e.message); porData[d] = null; }
    }

    let enviados = 0;
    const detalhe = [];
    for (const c of pendentes) {
      const col = porData[c.data];
      if (!col) continue; // coleta falhou → tenta de novo na próxima hora
      const entry = (col.por_culto || []).find((p) => p.culto_id === c.id);
      // Crianças únicas = PCO ∪ nosso sistema (totem), sem dupla contagem.
      const comb = await totalKidsCombinado(c.id, entry);
      const total = comb.total;
      if (total <= 0) continue; // sem check-in em NENHUMA fonte ainda → não envia "0", reavalia depois
      await supabase.from('cultos')
        .update({ presencial_kids: total, kids_resumo_enviado_at: new Date().toISOString() })
        .eq('id', c.id);
      await dispararResumoKidsCulto(c, total, comb);
      enviados += 1;
      detalhe.push({ culto: c.nome, total, pco: comb.pco, totem: comb.totem });
    }

    // Reconciliação: check-ins corrigidos no PCO/totem depois → atualiza o
    // número SEM reenviar o resumo (kids_resumo_enviado_at fica como está).
    let reconciliados = 0;
    for (const c of reconciliar) {
      const col = porData[c.data];
      if (!col) continue;
      const entry = (col.por_culto || []).find((p) => p.culto_id === c.id);
      const comb = await totalKidsCombinado(c.id, entry);
      const total = comb.total;
      if (total > 0 && total !== c.presencial_kids) {
        await supabase.from('cultos').update({ presencial_kids: total }).eq('id', c.id);
        reconciliados += 1;
        detalhe.push({ culto: c.nome, total, reconciliado: true, antes: c.presencial_kids });
      }
    }
    // Persiste a presença por criança (frequência do Kids · alimenta a aba/alerta
    // "faltando 3+ cultos") a partir do que já foi coletado do PCO.
    try {
      const { data: cris } = await supabase.from('kids_criancas')
        .select('id, planning_center_id').not('planning_center_id', 'is', null).is('deleted_at', null);
      const porPco = new Map((cris || []).map((c) => [String(c.planning_center_id), c.id]));
      for (const d of datas) {
        const col = porData[d]; if (!col) continue;
        const uniq = new Map();
        for (const culto of col.por_culto || []) for (const cr of culto.criancas || []) {
          const cid = cr.pco_id ? porPco.get(String(cr.pco_id)) : null;
          if (cid) uniq.set(cid, { crianca_id: cid, data: d, culto_id: culto.culto_id || null });
        }
        if (uniq.size) await supabase.from('kids_pco_presencas').upsert([...uniq.values()], { onConflict: 'crianca_id,data', ignoreDuplicates: true });
      }
    } catch (e) { console.error('[resumo-pco] presencas:', e.message); }

    res.json({ ok: true, enviados, reconciliados, detalhe });
  } catch (e) {
    console.error('[totemKids] cron resumo-pco:', e.message);
    res.status(500).json({ error: e.message || 'Erro no resumo do Kids' });
  }
});

// POST /sync-presencas-pco?dias=90 · backfill das presenças por criança (do PCO)
// pras datas de culto com Kids no período. Alimenta a aba/alerta de faltantes.
router.post('/sync-presencas-pco', authorizeModule('kids', 3), async (req, res) => {
  try {
    const dias = Math.min(400, Math.max(1, Number(req.query.dias || req.body?.dias) || 90));
    const { sincronizarPresencasKidsPCO } = require('../services/planningCenterKidsCheckins');
    const r = await sincronizarPresencasKidsPCO({ dias });
    res.json({ ok: true, ...r });
  } catch (e) {
    console.error('[totemKids] sync-presencas-pco:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao sincronizar presenças do PCO' });
  }
});

// GET /batismos · crianças inscritas pra batismo (eh_crianca ou <13 anos) · a
// equipe Kids contata a família. Aparece também na Integração (não duplica dado).
router.get('/batismos', authorizeModule('kids', 1), async (req, res) => {
  try {
    const corte = new Date(); corte.setFullYear(corte.getFullYear() - 13);
    const corteISO = corte.toISOString().slice(0, 10);
    const { data } = await supabase.from('batismo_inscricoes')
      .select('id, nome, sobrenome, data_nascimento, telefone, email, status, data_batismo, horario_culto, possui_deficiencia, deficiencia_descricao, observacoes, created_at, membro_id')
      .is('deleted_at', null)
      .or(`eh_crianca.eq.true,data_nascimento.gte.${corteISO}`)
      .order('data_batismo', { ascending: true, nullsFirst: false })
      .limit(500);
    res.json(data || []);
  } catch (e) {
    console.error('[totemKids] batismos:', e.message);
    res.status(500).json({ error: 'Erro ao carregar batismos' });
  }
});

// Apresentação de crianças · inscrições do form público (agrupadas por turma na UI)
router.get('/apresentacoes', authorizeModule('kids', 1), async (req, res) => {
  try {
    const { data } = await supabase.from('apresentacao_criancas')
      .select('id, nome_pai, nome_mae, crianca_nome, crianca_idade, telefone, data_apresentacao, status, observacoes, origem, crianca_id, created_at')
      .is('deleted_at', null)
      .order('data_apresentacao', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(1000);
    res.json(data || []);
  } catch (e) {
    console.error('[totemKids] apresentacoes:', e.message);
    res.status(500).json({ error: 'Erro ao carregar apresentações' });
  }
});

router.patch('/apresentacoes/:id', authorizeModule('kids', 3), async (req, res) => {
  try {
    const allowed = ['status', 'observacoes', 'data_apresentacao', 'crianca_idade'];
    const payload = { updated_at: new Date().toISOString() };
    for (const k of allowed) if (req.body[k] !== undefined) payload[k] = req.body[k];
    const { data, error } = await supabase.from('apresentacao_criancas')
      .update(payload).eq('id', req.params.id).is('deleted_at', null)
      .select('id, status, observacoes, data_apresentacao, crianca_idade').single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[totemKids] apresentacao update:', e.message);
    res.status(500).json({ error: 'Erro ao atualizar apresentação' });
  }
});

router.delete('/apresentacoes/:id', authorizeModule('kids', 4), async (req, res) => {
  try {
    const { error } = await supabase.rpc('app_soft_delete', {
      p_table_name: 'apresentacao_criancas', p_row_id: req.params.id, p_deleted_by: req.user?.id ?? null,
    });
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[totemKids] apresentacao delete:', e.message);
    res.status(500).json({ error: 'Erro ao remover apresentação' });
  }
});

// GET /dashboard · resumo do Kids (cards) + solicitações de vínculo pendentes +
// aniversariantes da semana. Alimenta o hub/dashboard do módulo.
router.get('/dashboard', authorizeModule('kids', 1), async (req, res) => {
  try {
    const corteBat = new Date(); corteBat.setFullYear(corteBat.getFullYear() - 13);
    const [ativas, pend, salas, sess, bat] = await Promise.all([
      supabase.from('kids_criancas').select('id', { count: 'exact', head: true }).eq('ativo', true).is('deleted_at', null),
      supabase.from('kids_vinculo_solicitacoes').select('id', { count: 'exact', head: true }).eq('status', 'pendente').is('deleted_at', null),
      supabase.from('kids_salas').select('id', { count: 'exact', head: true }),
      supabase.from('kids_sessoes').select('id', { count: 'exact', head: true }).eq('status', 'aberta').is('deleted_at', null),
      supabase.from('batismo_inscricoes').select('id', { count: 'exact', head: true }).is('deleted_at', null).neq('status', 'realizado').or(`eh_crianca.eq.true,data_nascimento.gte.${corteBat.toISOString().slice(0, 10)}`),
    ]);
    const { data: vinc } = await supabase.from('kids_vinculo_solicitacoes')
      .select('id, crianca_nome, solicitante_nome, solicitante_parentesco, created_at')
      .eq('status', 'pendente').is('deleted_at', null)
      .order('created_at', { ascending: false }).limit(8);
    const { data: kids } = await supabase.from('kids_criancas')
      .select('id, nome, data_nascimento, foto_url')
      .eq('ativo', true).is('deleted_at', null).not('data_nascimento', 'is', null).range(0, 999);
    const hoje = new Date();
    const dias = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(hoje); d.setDate(hoje.getDate() + i);
      dias.push(`${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    }
    const aniversariantes = (kids || [])
      .filter((k) => dias.includes(String(k.data_nascimento).slice(5, 10)))
      .map((k) => ({ id: k.id, nome: k.nome, data_nascimento: k.data_nascimento, foto_url: k.foto_url }))
      .sort((a, b) => String(a.data_nascimento).slice(5).localeCompare(String(b.data_nascimento).slice(5)));
    res.json({
      resumo: {
        criancas_ativas: ativas.count || 0,
        vinculos_pendentes: pend.count || 0,
        salas: salas.count || 0,
        sessoes_abertas: sess.count || 0,
        aniversariantes_semana: aniversariantes.length,
        batismos_criancas: bat.count || 0,
      },
      vinculos: vinc || [],
      aniversariantes,
    });
  } catch (e) {
    console.error('[totemKids] dashboard:', e.message);
    res.status(500).json({ error: 'Erro ao carregar dashboard' });
  }
});

// POST /criancas/:id/foto · equipe Kids adiciona/troca a foto da criança (no
// sistema). Recebe dataURL base64, sobe pro bucket privado kids-documentos via
// service_role; a foto só aparece resolvida por signed URL (fotoVisivelCrianca).
router.post('/criancas/:id/foto', authorizeModule('kids', 2), async (req, res) => {
  try {
    const { dataUrl } = req.body || {};
    const m = String(dataUrl || '').match(/^data:(image\/(png|jpe?g|webp));base64,(.+)$/);
    if (!m) return res.status(400).json({ error: 'Imagem inválida' });
    const mime = m[1];
    const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
    const buffer = Buffer.from(m[3], 'base64');
    if (buffer.length > 5 * 1024 * 1024) return res.status(413).json({ error: 'Imagem muito grande (máx 5MB)' });
    const path = `foto-crianca/${req.params.id}-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from('kids-documentos').upload(path, buffer, { contentType: mime, upsert: true });
    if (upErr) throw upErr;
    // apaga a foto anterior (se houver)
    const { data: prev } = await supabase.from('kids_criancas').select('foto_storage_path').eq('id', req.params.id).maybeSingle();
    if (prev?.foto_storage_path && prev.foto_storage_path !== path) {
      await supabase.storage.from('kids-documentos').remove([prev.foto_storage_path]).catch(() => {});
    }
    await supabase.from('kids_criancas').update({
      foto_storage_path: path, foto_url: null,
      foto_consentimento_em: new Date().toISOString(), foto_consentimento_por: req.user?.userId || null,
      updated_at: new Date().toISOString(),
    }).eq('id', req.params.id);
    const { data: signed } = await supabase.storage.from('kids-documentos').createSignedUrl(path, 60 * 30);
    res.json({ foto_url: signed?.signedUrl || null });
  } catch (e) {
    console.error('[totemKids] foto upload:', e.message);
    res.status(500).json({ error: 'Erro ao salvar a foto' });
  }
});

// POST /responsaveis/:membroId/foto · equipe Kids adiciona/troca a foto do
// responsável (mem_membros · bucket público fotos-membros, igual à membresia).
router.post('/responsaveis/:membroId/foto', authorizeModule('kids', 2), async (req, res) => {
  try {
    const { dataUrl } = req.body || {};
    const m = String(dataUrl || '').match(/^data:(image\/(png|jpe?g|webp));base64,(.+)$/);
    if (!m) return res.status(400).json({ error: 'Imagem inválida' });
    const mime = m[1];
    const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
    const buffer = Buffer.from(m[3], 'base64');
    if (buffer.length > 5 * 1024 * 1024) return res.status(413).json({ error: 'Imagem muito grande (máx 5MB)' });
    const path = `membros/${req.params.membroId}.${ext}`;
    const { error: upErr } = await supabase.storage.from('fotos-membros').upload(path, buffer, { contentType: mime, upsert: true });
    if (upErr) throw upErr;
    const { data: urlData } = supabase.storage.from('fotos-membros').getPublicUrl(path);
    const foto_url = `${urlData.publicUrl}?t=${Date.now()}`;
    const { error: dbErr } = await supabase.from('mem_membros').update({ foto_url }).eq('id', req.params.membroId).is('deleted_at', null);
    if (dbErr) throw dbErr;
    res.json({ foto_url });
  } catch (e) {
    console.error('[totemKids] foto responsavel:', e.message);
    res.status(500).json({ error: 'Erro ao salvar a foto do responsável' });
  }
});

// DELETE /criancas/:id/foto · remove a foto
router.delete('/criancas/:id/foto', authorizeModule('kids', 2), async (req, res) => {
  try {
    const { data: c } = await supabase.from('kids_criancas').select('foto_storage_path').eq('id', req.params.id).maybeSingle();
    if (c?.foto_storage_path) await supabase.storage.from('kids-documentos').remove([c.foto_storage_path]).catch(() => {});
    await supabase.from('kids_criancas').update({ foto_storage_path: null, foto_url: null, foto_consentimento_em: null, updated_at: new Date().toISOString() }).eq('id', req.params.id);
    res.json({ ok: true });
  } catch (e) {
    console.error('[totemKids] foto remove:', e.message);
    res.status(500).json({ error: 'Erro ao remover a foto' });
  }
});

// GET /criancas/:id/jornada · família (membros) + frequência (check-ins por mês)
// + conversão sugerida (1ª decisão de fé no check-in). Frequência fica vazia até
// os check-ins do totem rodarem.
router.get('/criancas/:id/jornada', authorizeModule('kids', 1), async (req, res) => {
  try {
    const id = req.params.id;
    const { data: crianca } = await supabase.from('kids_criancas').select('familia_id, planning_center_id').eq('id', id).maybeSingle();
    let familia_membros = [];
    if (crianca?.familia_id) {
      const { data: ms } = await supabase.from('mem_membros')
        .select('id, nome, telefone').eq('familia_id', crianca.familia_id).is('deleted_at', null).order('nome');
      familia_membros = ms || [];
    }
    const { data: cis } = await supabase.from('kids_checkins')
      .select('checkin_at, fez_decisao_jesus, decisao_jesus_em')
      .eq('crianca_id', id).is('deleted_at', null).order('checkin_at');
    const lista = cis || [];
    const porMesMap = {};
    let ultima = null;     // 'YYYY-MM-DD'
    let total = 0;
    const addCheckin = (dataYmd) => {
      if (!dataYmd) return;
      const ymd = String(dataYmd).slice(0, 10);
      porMesMap[ymd.slice(0, 7)] = (porMesMap[ymd.slice(0, 7)] || 0) + 1;
      if (!ultima || ymd > ultima) ultima = ymd;
      total += 1;
    };
    lista.forEach((c) => addCheckin(c.checkin_at)); // totem (quando houver)

    // Frequência REAL vem do Planning Center: histórico de check-ins da criança
    // nos eventos do Kids (CBKids). Liga o gráfico mesmo sem o totem.
    if (crianca?.planning_center_id) {
      try {
        const { detalhePessoaPCO, ehEventoKids } = require('../services/planningCenterKidsCheckins');
        const det = await detalhePessoaPCO(crianca.planning_center_id);
        (det?.historico || []).forEach((h) => {
          if (String(h.kind || '').toLowerCase() === 'volunteer') return;
          if (h.evento && !ehEventoKids(h.evento)) return; // só check-ins do Kids
          addCheckin(h.data);
        });
      } catch (e) { console.error('[totemKids] jornada PCO:', e.message); }
    }

    const porMes = Object.entries(porMesMap).map(([mes, total]) => ({ mes, total })).sort((a, b) => a.mes.localeCompare(b.mes));
    const dec = lista.filter((c) => c.fez_decisao_jesus).map((c) => c.decisao_jesus_em || c.checkin_at).filter(Boolean).sort();
    res.json({
      familia_membros,
      frequencia: { porMes, ultima, total },
      conversao_sugerida: dec.length ? String(dec[0]).slice(0, 10) : null,
    });
  } catch (e) {
    console.error('[totemKids] jornada:', e.message);
    res.status(500).json({ error: 'Erro ao carregar jornada' });
  }
});

// GET /criancas/:id/analise-frequencia · análise de IA (Haiku) da frequência da
// criança a partir do histórico de check-ins do Planning Center. As estatísticas
// são calculadas em JS (não no modelo); a IA só interpreta e sugere ação pastoral.
router.get('/criancas/:id/analise-frequencia', authorizeModule('kids', 1), async (req, res) => {
  try {
    const { data: cr } = await supabase.from('kids_criancas')
      .select('nome, data_nascimento, planning_center_id, data_conversao, data_batismo')
      .eq('id', req.params.id).maybeSingle();
    if (!cr) return res.status(404).json({ error: 'Criança não encontrada' });
    if (!cr.planning_center_id) return res.json({ sem_dados: true, motivo: 'Criança sem vínculo com o Planning Center.' });

    const { detalhePessoaPCO, ehEventoKids } = require('../services/planningCenterKidsCheckins');
    const det = await detalhePessoaPCO(cr.planning_center_id);
    const datas = (det?.historico || [])
      .filter(h => String(h.kind || '').toLowerCase() !== 'volunteer' && (!h.evento || ehEventoKids(h.evento)) && h.data)
      .map(h => h.data).sort();
    if (!datas.length) return res.json({ sem_dados: true, motivo: 'Sem check-ins do Kids no Planning Center.' });

    const hoje = new Date();
    const diasDesde = (d) => Math.floor((hoje - new Date(d + 'T00:00:00')) / 86400000);
    const ultimo = datas[datas.length - 1];
    const primeiro = datas[0];
    const dias90 = datas.filter(d => diasDesde(d) <= 90).length;
    const dias90a180 = datas.filter(d => diasDesde(d) > 90 && diasDesde(d) <= 180).length;
    const porMes = {};
    datas.forEach(d => { const m = d.slice(0, 7); porMes[m] = (porMes[m] || 0) + 1; });
    const mesesComPresenca = Object.keys(porMes).length;
    const idade = cr.data_nascimento ? Math.floor((hoje - new Date(cr.data_nascimento + 'T00:00:00')) / (365.25 * 86400000)) : null;

    const stats = {
      nome: cr.nome, idade,
      total_checkins: datas.length,
      primeiro_checkin: primeiro, ultimo_checkin: ultimo,
      dias_desde_ultimo: diasDesde(ultimo),
      checkins_ultimos_90d: dias90, checkins_90_a_180d: dias90a180,
      meses_com_presenca: mesesComPresenca,
      ja_convertida: !!cr.data_conversao, ja_batizada: !!cr.data_batismo,
    };

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.json({ stats, situacao: null, analise: 'Análise de IA indisponível (chave não configurada).', recomendacao: null });
    }
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic();
    const sys = 'Você é analista do ministério infantil (Kids) de uma igreja. A partir de estatísticas de frequência (check-ins) de UMA criança, escreva uma análise curta e útil pra liderança. Responda SOMENTE com JSON válido: {"situacao":"frequente|regular|esporadica|afastada","analise":"2 a 3 frases, específica com números e datas","recomendacao":"1 frase de ação pastoral"}. Português do Brasil. Hoje é ' + hoje.toISOString().slice(0, 10) + '. "afastada" = sem check-in há 60+ dias.';
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 400, system: sys,
      messages: [{ role: 'user', content: JSON.stringify(stats) }],
    });
    const raw = (msg?.content?.[0]?.text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    let parsed = {};
    try { parsed = JSON.parse(raw); } catch { parsed = { analise: raw }; }
    res.json({ stats, situacao: parsed.situacao || null, analise: parsed.analise || '', recomendacao: parsed.recomendacao || null });
  } catch (e) {
    console.error('[totemKids] analise-frequencia:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao gerar análise' });
  }
});

// GET /cron/age-out · desativa crianças que completaram 13 anos (12a+12m) ·
// vira adolescente, sai do Kids (preserva histórico). Cron diário OU admin.
router.get('/cron/age-out', async (req, res) => {
  const isAdmin = ['admin', 'diretor'].includes(req.user?.role);
  if (!isAuthorizedCron(req) && !isAdmin) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const limite = new Date(); limite.setFullYear(limite.getFullYear() - 13);
    const limiteISO = limite.toISOString().slice(0, 10); // nasceu até esta data = 13+
    const { data, error } = await supabase.from('kids_criancas')
      .update({ ativo: false, inativado_em: new Date().toISOString(), motivo_inativacao: 'Completou 13 anos · graduou para adolescente' })
      .eq('ativo', true).is('deleted_at', null)
      .not('data_nascimento', 'is', null).lte('data_nascimento', limiteISO)
      .select('id');
    if (error) throw error;
    res.json({ ok: true, graduados: (data || []).length });
  } catch (e) { console.error('[totemKids] age-out:', e.message); res.status(500).json({ error: 'Erro no age-out' }); }
});

// GET /cron/encerrar-vencidas · fecha sessões Kids de dias ANTERIORES + auto-checkout
// (checkout_forcado) + consolida o culto. Garante o fechamento "SEMPRE no dia seguinte"
// (Marcos 2026-07-16) — antes era só lazy no carregar do totem, que não bastava se
// ninguém abrisse o app no dia seguinte. Cron diário de madrugada (BRT).
router.get('/cron/encerrar-vencidas', async (req, res) => {
  const isAdmin = ['admin', 'diretor'].includes(req.user?.role);
  if (!isAuthorizedCron(req) && !isAdmin) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const encerradas = await encerrarSessoesVencidas(null);
    res.json({ ok: true, encerradas });
  } catch (e) { console.error('[totemKids] cron/encerrar-vencidas:', e.message); res.status(500).json({ error: 'Erro ao encerrar vencidas' }); }
});

// POST /api/totem-kids/sync-pco · puxa a base de crianças do Planning Center
// Check-Ins e faz upsert por planning_center_id (idempotente). Nível 3 no módulo.
router.post('/sync-pco', authorizeModule('kids', 3), async (req, res) => {
  try {
    const maxIdade = Number(req.body?.maxIdade) || 12;
    const resumo = await syncCriancasPCO({ maxIdade });
    res.json({ ok: true, ...resumo });
  } catch (e) {
    console.error('[totemKids/sync-pco]', e.message);
    res.status(500).json({ error: e.message || 'Erro ao sincronizar com o Planning Center' });
  }
});

// POST /api/totem-kids/responsaveis-pco · corrige os responsáveis poluídos
// (household-dump de 22/05) podando pelos guardiões reais do PCO (checked_in_by).
// Body { apply:true } grava · sem apply = prévia (dry-run · não altera nada).
router.post('/responsaveis-pco', authorizeModule('kids', 3), async (req, res) => {
  try {
    const apply = ['1', 'true', true].includes(req.body?.apply);
    const { corrigirResponsaveisPCO } = require('../services/planningCenterKidsCheckins');
    const r = await corrigirResponsaveisPCO({ apply });
    res.json(r);
  } catch (e) {
    console.error('[totemKids/responsaveis-pco]', e.message);
    res.status(500).json({ error: e.message || 'Erro ao corrigir responsáveis pelo PCO' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// RESPONSÁVEIS
// ═══════════════════════════════════════════════════════════════════════════

// POST /api/totem-kids/criancas/:id/responsaveis · adiciona responsável autorizado
router.post('/criancas/:id/responsaveis', authorizeModule('kids', 2), async (req, res) => {
  try {
    const { membro_id, parentesco, autorizado_buscar, contato_emergencia, observacao } = req.body;
    if (!membro_id) return res.status(400).json({ error: 'membro_id obrigatorio' });

    const { data, error } = await supabase
      .from('kids_responsaveis')
      .insert({
        crianca_id: req.params.id,
        membro_id,
        parentesco: parentesco || 'outro',
        autorizado_buscar: autorizado_buscar !== false,
        contato_emergencia: !!contato_emergencia,
        observacao: observacao || null,
      })
      .select('*, membro:mem_membros(id, nome, telefone, foto_url)')
      .single();
    if (error) {
      const t = traduzErroUmPaiUmaMae(error);
      if (t) return res.status(t.status).json({ error: t.error });
      if (error.code === '23505') return res.status(409).json({ error: 'Responsável já cadastrado' });
      throw error;
    }
    res.status(201).json(data);
  } catch (e) {
    const t = traduzErroUmPaiUmaMae(e);
    if (t) return res.status(t.status).json({ error: t.error });
    res.status(500).json({ error: 'Erro ao adicionar responsável' });
  }
});

// POST /api/totem-kids/criancas/:id/responsavel-rapido
// Cria/vincula responsável a partir de dados crus (nome, tel, cpf, parentesco).
// Cria mem_membros se não existir (match por cpf/telefone) + liga em kids_responsaveis.
// Usado pelo modal de auto-cadastro quando criança chega sem responsável.
router.post('/criancas/:id/responsavel-rapido', authorizeModule('kids', 2), async (req, res) => {
  try {
    const { nome, telefone, cpf, parentesco, autorizado_buscar, permitir_sem_cpf } = req.body || {};
    if (!nome || !nome.trim()) return res.status(400).json({ error: 'nome obrigatorio' });
    if (!telefone || !telefone.trim()) return res.status(400).json({ error: 'telefone obrigatorio' });

    const tel = normalizarTelefone(telefone);
    const cpfNorm = normalizarCpf(cpf);
    if (!tel) return res.status(400).json({ error: 'telefone invalido (precisa ter pelo menos 8 digitos)' });

    // Obrigatoriedade + DV do CPF no servidor (antes era só no gate do React ·
    // CPF malformado era descartado em silêncio). Válvula do supervisor mantém.
    const cpfBruto = String(cpf || '').replace(/\D/g, '');
    if (cpfBruto && (cpfBruto.length !== 11 || !cpfValido(cpfBruto))) {
      return res.status(400).json({ error: 'CPF do responsável inválido — confira os dígitos' });
    }
    if (!cpfBruto && !permitir_sem_cpf) {
      return res.status(422).json({
        error: 'CPF do responsável é obrigatório — sem o documento agora, o supervisor pode liberar',
        code: 'cpf_obrigatorio',
      });
    }

    // 1. Resolve criança + família (pra vincular novo mem_membros na família)
    const { data: crianca, error: errC } = await supabase
      .from('kids_criancas')
      .select('id, nome, familia_id')
      .eq('id', req.params.id)
      .maybeSingle();
    if (errC) throw errC;
    if (!crianca) return res.status(404).json({ error: 'criança não encontrada' });

    // 2. Resolve mem_membros · guarda na origem (CPF→e-mail→telefone+nome→cria)
    const r = await acharOuCriarGuardado({
      cpf: cpfNorm, telefone: tel, nome: nome.trim(), status: 'visitante',
      extra: { familia_id: crianca.familia_id || null },
    });
    const { data: membro } = await supabase.from('mem_membros')
      .select('id, nome, familia_id').eq('id', r.membro_id).single();
    // Membro já existia sem família → herda a da criança
    if (!r.created && crianca.familia_id && !membro.familia_id) {
      await supabase.from('mem_membros').update({ familia_id: crianca.familia_id }).eq('id', membro.id);
    }

    // 4. Vincula kids_responsaveis (upsert · idempotente)
    const { data: ligacao, error: errLig } = await supabase
      .from('kids_responsaveis')
      .upsert({
        crianca_id: req.params.id,
        membro_id: membro.id,
        parentesco: parentesco || 'outro',
        autorizado_buscar: autorizado_buscar !== false,
      }, { onConflict: 'crianca_id,membro_id', ignoreDuplicates: false })
      .select('*, membro:mem_membros(id, nome, telefone, foto_url)')
      .single();
    if (errLig) throw errLig;

    res.status(201).json(ligacao);
  } catch (e) {
    const t = traduzErroUmPaiUmaMae(e);
    if (t) return res.status(t.status).json({ error: t.error });
    console.error('[totemKids/responsavel-rapido]', e.message);
    res.status(500).json({ error: e.message || 'Erro ao adicionar responsável' });
  }
});

// DELETE /api/totem-kids/responsaveis/:id · remove responsável
router.delete('/responsaveis/:id', authorizeModule('kids', 3), async (req, res) => {
  try {
    const { error } = await supabase.from('kids_responsaveis').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao remover responsável' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// CHECK-IN / CHECK-OUT
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/totem-kids/ausentes?min=3 · crianças ativas faltando N cultos seguidos
// (aba dedicada · mesma régua do alerta) + contato dos responsáveis pra ação.
router.get('/ausentes', authorizeModule('kids', 1), async (req, res) => {
  try {
    const min = Math.max(1, Number(req.query.min) || 3);
    const { data: ausentes, error } = await supabase
      .rpc('fn_kids_ausentes_consecutivos', { p_min: min });
    if (error) throw error;
    const ids = (ausentes || []).map(a => a.crianca_id);
    let respPorCrianca = {};
    if (ids.length) {
      const { data: resps } = await supabase
        .from('kids_responsaveis')
        .select('crianca_id, parentesco, autorizado_buscar, membro:mem_membros(nome, telefone)')
        .in('crianca_id', ids);
      for (const r of resps || []) {
        (respPorCrianca[r.crianca_id] = respPorCrianca[r.crianca_id] || []).push({
          nome: r.membro?.nome || null,
          telefone: r.membro?.telefone || null,
          parentesco: r.parentesco || null,
          autorizado_buscar: r.autorizado_buscar || false,
        });
      }
    }
    res.json((ausentes || []).map(a => ({
      ...a,
      responsaveis: respPorCrianca[a.crianca_id] || [],
    })));
  } catch (e) {
    console.error('[totemKids/ausentes]', e.message);
    res.status(500).json({ error: 'Erro ao listar crianças faltantes' });
  }
});

// GET /api/totem-kids/cultos-do-dia?data=YYYY-MM-DD · cultos COM Kids do dia
// (pro check-in multi-culto: marcar em quais a criança vai ficar).
router.get('/cultos-do-dia', authorizeModule('kids', 2), async (req, res) => {
  try {
    const data = req.query.data;
    if (!data) return res.json([]);
    const { data: cultos } = await supabase.from('cultos')
      .select('id, nome, vol_service_types(has_kids, recurrence_time)')
      .eq('data', data);
    const lista = (cultos || [])
      .filter(c => c.vol_service_types?.has_kids)
      .map(c => ({ id: c.id, nome: c.nome, hora: (c.vol_service_types?.recurrence_time || '').slice(0, 5) }))
      .sort((a, b) => (a.hora || '').localeCompare(b.hora || ''));
    res.json(lista);
  } catch (e) {
    console.error('[totemKids/cultos-do-dia]', e.message);
    res.status(500).json({ error: 'Erro ao listar cultos do dia' });
  }
});

// GET /api/totem-kids/checkin/aberto?sessao_id=&crianca_id= · check-in ABERTO da
// criança na sessão, com sala/culto/responsável — pra REIMPRIMIR a etiqueta
// perdida (mesmo código) sem criar outro check-in.
router.get('/checkin/aberto', authorizeModule('kids', 1), async (req, res) => {
  try {
    const { sessao_id, crianca_id } = req.query;
    if (!sessao_id || !crianca_id) return res.status(400).json({ error: 'sessao_id e crianca_id obrigatórios' });
    const { data } = await supabase
      .from('kids_checkins')
      .select('id, codigo_seguranca, codigo_barras, checkin_grupo_id, responsavel_checkin_nome, created_at, sala:kids_salas(id, nome, cor, logo_url), sessao:kids_sessoes(id, culto:cultos(id, nome, data))')
      .eq('sessao_id', sessao_id)
      .eq('crianca_id', crianca_id)
      .is('checkout_at', null)
      .maybeSingle();
    // Check-ins ABERTOS em OUTRAS sessões (culto anterior sem check-out) —
    // não impedem o novo check-in, mas o totem avisa e oferece regularizar.
    const { data: anteriores } = await supabase
      .from('kids_checkins')
      .select('id, codigo_seguranca, created_at, sessao:kids_sessoes(id, status, culto:cultos(id, nome, data))')
      .eq('crianca_id', crianca_id)
      .neq('sessao_id', sessao_id)
      .is('checkout_at', null)
      .order('created_at', { ascending: false })
      .limit(5);
    res.json({ checkin: data || null, abertos_anteriores: anteriores || [] });
  } catch (e) {
    console.error('[totemKids] checkin aberto:', e.message);
    res.status(500).json({ error: 'Erro ao consultar o check-in' });
  }
});

// POST /api/totem-kids/checkin · cria check-in + gera código + retorna pra impressão
router.post('/checkin', authorizeModule('kids', 2), async (req, res) => {
  try {
    const {
      sessao_id, crianca_id, sala_id, estacao_id,
      responsavel_id, responsavel_nome_manual, responsavel_telefone_manual, responsavel_parentesco,
      cultos_extras, // ids de OUTROS cultos do dia em que a criança também fica (multi-culto)
      enviar_wpp,    // enviar código + QR de retirada por WhatsApp pro responsável (plus · etiqueta sempre imprime)
      responsavel_cpf,   // CPF do responsável (obrigatório · Marcos 2026-07-15) · salvo no cadastro
      permitir_sem_cpf,  // válvula: supervisor liberou o check-in sem CPF (PIN no totem)
    } = req.body;

    if (!sessao_id) return res.status(400).json({ error: 'sessao_id obrigatorio' });
    if (!crianca_id) return res.status(400).json({ error: 'crianca_id obrigatorio' });
    if (!sala_id) return res.status(400).json({ error: 'sala_id obrigatorio' });

    // Sessão deve estar aberta
    const { data: sessao } = await supabase
      .from('kids_sessoes')
      .select('id, status, culto_id, culto:cultos(data, nome)')
      .eq('id', sessao_id)
      .maybeSingle();
    if (!sessao) return res.status(404).json({ error: 'Sessão não encontrada' });
    if (sessao.status !== 'aberta') {
      return res.status(400).json({ error: 'Sessão não esta aberta', status: sessao.status });
    }
    // Backstop de integridade (R1): nunca lança em culto de dia ANTERIOR — isso
    // corromperia presencial_kids/decisoes_kids do culto antigo. NÃO bloqueia o
    // culto de HOJE (a data de hoje nunca é < hoje) → respeita o princípio "nunca
    // travar o check-in na hora". As vencidas já são encerradas no carregar
    // (encerrar-vencidas); isto só cobre corrida / totem desatualizado.
    if (sessao.culto?.data && String(sessao.culto.data).slice(0, 10) < _hojeBRT()) {
      return res.status(409).json({ error: 'Essa sessão é de um culto de outro dia e já foi encerrada. Recarregue o totem.' });
    }

    // Anti-duplicidade: bloqueia só quando há check-in ABERTO (sem check-out) na
    // sessão. Depois do check-out a criança PODE fazer novo check-in (saiu e
    // voltou pra outra celebração) — gera código e etiqueta novos.
    const { data: existentes } = await supabase
      .from('kids_checkins')
      .select('id, codigo_seguranca, sala_id, checkout_at')
      .eq('sessao_id', sessao_id)
      .eq('crianca_id', crianca_id);
    const checkinAberto = (existentes || []).find(c => !c.checkout_at);
    if (checkinAberto) {
      return res.status(409).json({
        error: 'Criança já está com check-in aberto nessa sessão. Perdeu a etiqueta? Use "Imprimir etiqueta de novo".',
        checkin_existente: checkinAberto,
      });
    }

    // ── Responsável + CPF obrigatório (Marcos 2026-07-15) ──
    // Todo responsável do check-in precisa de CPF. O totem pede num modal e manda
    // aqui em `responsavel_cpf`; capturar salva no cadastro (uma vez só) e vira
    // chave forte de deduplicação. Supervisor pode dispensar (`permitir_sem_cpf`,
    // via PIN no totem) — nunca trava a família de verdade.
    const cpfInformado = normalizarCpf(responsavel_cpf);
    if (responsavel_cpf && !cpfValido(cpfInformado)) {
      return res.status(400).json({ error: 'CPF inválido — confira os números.', precisa_cpf: true });
    }
    const ligarResponsavel = async (membroId, parentesco) => {
      const { data: link } = await supabase.from('kids_responsaveis')
        .select('crianca_id').eq('crianca_id', crianca_id).eq('membro_id', membroId).maybeSingle();
      if (!link) {
        await supabase.from('kids_responsaveis')
          .insert({ crianca_id, membro_id: membroId, parentesco: parentesco || 'responsavel', autorizado_buscar: true })
          .then(() => {}, (e) => console.error('[totemKids/checkin] ligar responsável:', e?.message));
      }
    };

    let respId = null, respNome = null, respTel = null;
    if (responsavel_id) {
      const { data: m } = await supabase
        .from('mem_membros').select('id, nome, telefone, cpf').eq('id', responsavel_id).maybeSingle();
      if (!m) return res.status(404).json({ error: 'Responsável não encontrado' });
      respId = m.id; respNome = m.nome; respTel = m.telefone;
      const jaTemCpf = m.cpf && String(m.cpf).replace(/\D/g, '').length === 11;
      if (!jaTemCpf) {
        if (cpfInformado) {
          // CPF já é de OUTRA pessoa? → é duplicata: usa a pessoa existente (dedup).
          const { data: outro } = await supabase.from('mem_membros')
            .select('id, nome, telefone').eq('cpf', cpfInformado).neq('id', m.id).maybeSingle();
          if (outro) {
            respId = outro.id; respNome = outro.nome; respTel = outro.telefone || respTel;
            await ligarResponsavel(outro.id, responsavel_parentesco);
          } else {
            await supabase.from('mem_membros').update({ cpf: cpfInformado }).eq('id', m.id);
          }
        } else if (!permitir_sem_cpf) {
          return res.status(422).json({ error: 'Precisamos do CPF do responsável.', precisa_cpf: true, responsavel_nome: m.nome });
        } else {
          console.warn(`[totemKids/checkin] CPF dispensado (supervisor) · resp ${m.id}`);
        }
      }
    } else if (responsavel_nome_manual) {
      // Responsável manual → também exige CPF e vira cadastro (achar-ou-criar).
      if (cpfInformado) {
        const rr = await acharOuCriarGuardado({
          cpf: cpfInformado, telefone: normalizarTelefone(responsavel_telefone_manual),
          nome: responsavel_nome_manual, status: 'visitante',
        });
        const { data: m } = await supabase.from('mem_membros').select('id, nome, telefone').eq('id', rr.membro_id).single();
        respId = m.id; respNome = m.nome; respTel = m.telefone || normalizarTelefone(responsavel_telefone_manual);
        await ligarResponsavel(m.id, responsavel_parentesco || 'outro');
      } else if (!permitir_sem_cpf) {
        return res.status(422).json({ error: 'Precisamos do CPF do responsável.', precisa_cpf: true });
      } else {
        respNome = responsavel_nome_manual;
        respTel = normalizarTelefone(responsavel_telefone_manual);
        console.warn('[totemKids/checkin] CPF dispensado (supervisor · manual)');
      }
    }
    if (!respNome) return res.status(400).json({ error: 'responsavel_id ou responsavel_nome_manual obrigatório' });

    // Buscar dados da criança (pro snapshot na resposta)
    const { data: crianca } = await supabase
      .from('kids_criancas')
      .select('id, nome, data_nascimento, observacoes_medicas, necessidades_especiais')
      .eq('id', crianca_id)
      .maybeSingle();
    if (!crianca) return res.status(404).json({ error: 'Criança não encontrada' });

    // Buscar sala
    const { data: sala } = await supabase
      .from('kids_salas')
      .select('id, nome, cor, logo_url')
      .eq('id', sala_id)
      .maybeSingle();
    if (!sala) return res.status(404).json({ error: 'Sala não encontrada' });

    // Gera código via função do banco
    const { data: codigoRow, error: errCod } = await supabase.rpc('fn_kids_gerar_codigo_seguranca');
    const codigo = codigoRow || (errCod ? null : null);
    if (!codigo) {
      // fallback js
      const alfa = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let c = '';
      for (let i = 0; i < 4; i++) c += alfa[Math.floor(Math.random() * alfa.length)];
      // tenta
    }
    const codigoFinal = codigo || (() => {
      const alfa = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let c = '';
      for (let i = 0; i < 4; i++) c += alfa[Math.floor(Math.random() * alfa.length)];
      return c;
    })();

    // Multi-culto: se a criança fica em mais de um culto, todas as linhas
    // (uma por culto) compartilham o mesmo código + checkin_grupo_id. A retirada
    // fecha o grupo; cada culto conta a presença (consolidação por sessao_id).
    const cultosExtras = Array.isArray(cultos_extras)
      ? [...new Set(cultos_extras.map(String))].filter(cid => cid && cid !== sessao.culto_id)
      : [];
    const grupoId = cultosExtras.length ? require('crypto').randomUUID() : null;

    // INSERT (primário · culto atual)
    const { data: checkin, error: errIns } = await supabase
      .from('kids_checkins')
      .insert({
        sessao_id,
        crianca_id,
        sala_id,
        estacao_checkin_id: estacao_id || null,
        responsavel_checkin_id: respId,
        responsavel_checkin_nome: respNome,
        responsavel_checkin_telefone: respTel,
        responsavel_checkin_parentesco: responsavel_parentesco || null,
        codigo_seguranca: codigoFinal,
        codigo_barras: codigoFinal,                      // mesmo código
        checkin_por: req.user.userId,
        checkin_grupo_id: grupoId,
      })
      .select('*')
      .single();
    // 23505 = índice único (check-in aberto) — corrida entre 2 totens ou
    // migration 20260707220000 ainda não aplicada (UNIQUE antiga no lugar).
    if (errIns && errIns.code === '23505') {
      return res.status(409).json({ error: 'Criança já está com check-in nessa sessão. Perdeu a etiqueta? Use "Imprimir etiqueta de novo".' });
    }
    if (errIns) throw errIns;

    // Fez check-in → a criança está ativa de novo. Reativa se tinha sido
    // auto-inativada (sumiu 6+ meses do PCO / não veio no último import).
    supabase.from('kids_criancas')
      .update({ ativo: true, motivo_inativacao: null, inativado_em: null })
      .eq('id', crianca_id).eq('ativo', false)
      .then(() => {}, (e) => console.error('[totemKids/checkin] reativar criança:', e?.message));

    // Cultos do grupo (pro recibo): começa com o atual.
    const cultosDoGrupo = [{ id: sessao.culto_id, nome: sessao.culto?.nome || null }];

    // Linhas secundárias dos outros cultos do dia (find-or-create a sessão).
    for (const cultoId of cultosExtras) {
      try {
        let { data: sx } = await supabase.from('kids_sessoes')
          .select('id, status, culto:cultos(nome)').eq('culto_id', cultoId).maybeSingle();
        if (!sx) {
          const { data: nova } = await supabase.from('kids_sessoes')
            .insert({ culto_id: cultoId, status: 'aberta', abrir_em: new Date().toISOString() })
            .select('id, status, culto:cultos(nome)').single();
          sx = nova;
        }
        if (!sx) continue;
        const { error: e2 } = await supabase.from('kids_checkins').insert({
          sessao_id: sx.id, crianca_id, sala_id,
          estacao_checkin_id: estacao_id || null,
          responsavel_checkin_id: respId,
          responsavel_checkin_nome: respNome,
          responsavel_checkin_telefone: respTel,
          responsavel_checkin_parentesco: responsavel_parentesco || null,
          codigo_seguranca: codigoFinal, codigo_barras: codigoFinal,
          checkin_por: req.user.userId, checkin_grupo_id: grupoId, labels_impressas: 0,
        });
        // 23505 = criança já tinha check-in nesse culto · ignora
        if (!e2 || e2.code === '23505') cultosDoGrupo.push({ id: cultoId, nome: sx.culto?.nome || null });
      } catch (ex) { console.error('[totemKids/checkin] culto extra:', ex.message); }
    }

    // Envio opcional do código + QR de retirada por WhatsApp (best-effort · NUNCA
    // derruba o check-in). A etiqueta é impressa de qualquer jeito; isto é um plus
    // (pais perdem a etiqueta). O QR da página codifica o mesmo código → o leitor
    // 2D do portão lê e o /portao/scan já faz o checkout.
    if (enviar_wpp && respTel) {
      const template = process.env.WHATSAPP_TEMPLATE_KIDS_RETIRADA;
      if (template) {
        const primeiroNome = String(crianca?.nome || '').trim().split(/\s+/)[0] || 'sua criança';
        const base = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
        const link = `${base}/kids/retirada/${codigoFinal}`;
        const lang = process.env.WHATSAPP_TEMPLATE_KIDS_RETIRADA_LANG || 'pt_BR';
        enviarTemplateWpp(respTel, template, lang, [primeiroNome, codigoFinal, link])
          .then((r) => { if (!r?.ok) console.warn('[totemKids/checkin] wpp retirada pulado:', r?.error); })
          .catch((e) => console.warn('[totemKids/checkin] wpp retirada erro:', e?.message));
      } else {
        console.warn('[totemKids/checkin] WHATSAPP_TEMPLATE_KIDS_RETIRADA não configurado · envio pulado');
      }
    }

    // Retorna tudo pro frontend renderizar as 2 etiquetas
    res.status(201).json({
      checkin,
      crianca,
      sala,
      sessao: { id: sessao.id, culto: sessao.culto },
      cultos: cultosDoGrupo,
      responsavel: { id: respId, nome: respNome, telefone: respTel, parentesco: responsavel_parentesco },
      codigo_seguranca: codigoFinal,
      codigo_barras: codigoFinal,
    });
  } catch (e) {
    console.error('[totemKids/checkin]', e.message);
    res.status(500).json({ error: 'Erro ao fazer check-in' });
  }
});

// GET /api/totem-kids/checkin/codigo/:código · busca por código de segurança
router.get('/checkin/codigo/:codigo', authorizeModule('kids', 2), async (req, res) => {
  try {
    const codigo = String(req.params.codigo).toUpperCase().trim();
    if (codigo.length !== 4) return res.status(400).json({ error: 'Codigo invalido' });

    const { data, error } = await supabase
      .from('kids_checkins')
      .select(`
        *,
        crianca:kids_criancas(id, nome, data_nascimento, foto_url, observacoes_medicas, tem_espectro, espectro_qual, tem_alergia, alergia_qual, tem_limitacao_fisica, limitacao_fisica_qual),
        sala:kids_salas(id, nome, cor, logo_url),
        sessao:kids_sessoes(id, status, culto:cultos(id, nome, data))
      `)
      .eq('codigo_seguranca', codigo)
      .is('checkout_at', null)
      .order('checkin_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Código não encontrado ou já foi feito checkout' });

    // Lista responsáveis autorizados pra exibir no pickup
    const { data: responsaveis } = await supabase
      .from('kids_responsaveis')
      .select('id, parentesco, autorizado_buscar, membro:mem_membros(id, nome, telefone, foto_url)')
      .eq('crianca_id', data.crianca.id)
      .eq('autorizado_buscar', true);

    // Multi-culto: cultos em que a criança ficou (pra mostrar no pickup que a
    // retirada encerra todos).
    let cultos_grupo = null;
    if (data.checkin_grupo_id) {
      const { data: grupo } = await supabase.from('kids_checkins')
        .select('sessao:kids_sessoes(culto:cultos(id, nome))')
        .eq('checkin_grupo_id', data.checkin_grupo_id).is('checkout_at', null);
      cultos_grupo = (grupo || []).map(g => g.sessao?.culto?.nome).filter(Boolean);
    }

    res.json({ ...data, responsaveis: responsaveis || [], cultos_grupo });
  } catch (e) {
    console.error('[totemKids/checkin/codigo]', e.message);
    res.status(500).json({ error: 'Erro ao buscar código' });
  }
});

// POST /api/totem-kids/checkout · faz checkout
// Body: { checkin_id, responsavel_id?, responsavel_nome?, método, override_motivo? }
router.post('/checkout', authorizeModule('kids', 2), async (req, res) => {
  try {
    const { checkin_id, responsavel_id, responsavel_nome, metodo, override_motivo } = req.body;
    if (!checkin_id) return res.status(400).json({ error: 'checkin_id obrigatorio' });
    if (!metodo) return res.status(400).json({ error: 'metodo obrigatorio' });

    // 'painel' = check-out simples pela equipe (painel ao vivo / regularização
    // de culto anterior no totem) — sem escolher qual responsável retirou.
    const validMetodos = ['codigo_digitado', 'barcode_escaneado', 'responsavel_autorizado', 'override_supervisor', 'painel'];
    if (!validMetodos.includes(metodo)) return res.status(400).json({ error: 'metodo invalido', validos: validMetodos });

    // Override exige motivo + permissão
    if (metodo === 'override_supervisor') {
      if (!override_motivo || override_motivo.trim().length < 10) {
        return res.status(400).json({ error: 'override_motivo obrigatorio (min 10 chars)' });
      }
      // Verifica se pode aprovar override: coord-kids OU admin OU líder Kids do dia
      const podeOverride =
        ['admin', 'diretor'].includes(req.user.role) ||
        (req.user.granular?.modulePerms?.kids?.pode_aprovar) ||
        (req.user.granular?.modulePerms?.kids?.leitura >= 5) ||
        await isLiderKidsDoDia(req.user.userId);
      if (!podeOverride) {
        return res.status(403).json({ error: 'Sem permissão pra override · pedir coord Kids ou admin' });
      }
    }

    // Buscar nome do responsável (snapshot) · dispensado no método 'painel'
    let respNome = responsavel_nome;
    if (responsavel_id && !respNome) {
      const { data: m } = await supabase.from('mem_membros').select('nome').eq('id', responsavel_id).maybeSingle();
      respNome = m?.nome;
    }
    if (!respNome && metodo !== 'painel') return res.status(400).json({ error: 'responsavel_nome obrigatorio (snapshot)' });

    // Multi-culto: se o check-in faz parte de um grupo (criança ficou em mais de
    // um culto), a retirada fecha TODAS as linhas ativas do grupo de uma vez.
    const { data: alvo } = await supabase.from('kids_checkins')
      .select('id, checkin_grupo_id, checkout_at').eq('id', checkin_id).maybeSingle();
    if (!alvo) return res.status(404).json({ error: 'Check-in não encontrado' });
    if (alvo.checkout_at) return res.status(409).json({ error: 'Check-in já foi feito checkout' });

    const patch = {
      checkout_at: new Date().toISOString(),
      responsavel_checkout_id: responsavel_id || null,
      responsavel_checkout_nome: respNome || null,
      checkout_metodo: metodo,
      checkout_por: req.user.userId,
      override_motivo: metodo === 'override_supervisor' ? override_motivo : null,
      override_aprovado_por: metodo === 'override_supervisor' ? req.user.userId : null,
    };
    let q = supabase.from('kids_checkins').update(patch).is('checkout_at', null);
    q = alvo.checkin_grupo_id ? q.eq('checkin_grupo_id', alvo.checkin_grupo_id) : q.eq('id', checkin_id);
    const { data, error } = await q.select(`*, crianca:kids_criancas(id, nome), sala:kids_salas(id, nome)`);
    if (error) throw error;
    if (!data || !data.length) return res.status(409).json({ error: 'Check-in já foi feito checkout' });
    res.json({ ...data[0], cultos_encerrados: data.length });
  } catch (e) {
    console.error('[totemKids/checkout]', e.message);
    res.status(500).json({ error: 'Erro ao fazer checkout' });
  }
});

// POST /api/totem-kids/checkin/:id/reabrir · DESFAZ um check-out (feito sem
// querer) → a criança volta a constar presente. Reabre o grupo multi-culto todo.
router.post('/checkin/:id/reabrir', authorizeModule('kids', 2), async (req, res) => {
  try {
    const { data: alvo } = await supabase.from('kids_checkins')
      .select('id, checkin_grupo_id, checkout_at, sessao:kids_sessoes(status)')
      .eq('id', req.params.id).maybeSingle();
    if (!alvo) return res.status(404).json({ error: 'Check-in não encontrado' });
    if (!alvo.checkout_at) return res.json({ ok: true, ja_presente: true });
    if (alvo.sessao?.status && alvo.sessao.status !== 'aberta') {
      return res.status(409).json({ error: 'A sessão já foi encerrada — não dá pra reabrir o check-in.' });
    }
    const patch = {
      checkout_at: null, responsavel_checkout_id: null, responsavel_checkout_nome: null,
      checkout_metodo: null, checkout_por: null, override_motivo: null, override_aprovado_por: null,
      updated_at: new Date().toISOString(),
    };
    let q = supabase.from('kids_checkins').update(patch).not('checkout_at', 'is', null);
    q = alvo.checkin_grupo_id ? q.eq('checkin_grupo_id', alvo.checkin_grupo_id) : q.eq('id', req.params.id);
    const { data, error } = await q.select('id, crianca:kids_criancas(nome)');
    if (error) throw error;
    res.json({ ok: true, reabertos: (data || []).length });
  } catch (e) {
    console.error('[totemKids/checkin/reabrir]', e.message);
    res.status(500).json({ error: 'Erro ao reabrir o check-in' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// PORTÃO DE SAÍDA · validação da etiqueta na entrada do corredor
// ═══════════════════════════════════════════════════════════════════════════
// Modelo (Marcos + líderes do Kids · 2026-07-07): o prédio tem corredor único —
// o pai ENTRA, bipa o RECIBO num leitor de código de barras na porta e segue;
// a professora confere na sala se o código do recibo bate com a etiqueta da
// criança (custódia real). O scan VERDE registra a saída no sistema
// (checkout_metodo='portao'). O portão é NÃO-BLOQUEANTE: anomalia (código já
// usado / de sessão antiga / desconhecido) vira aviso âmbar "pode seguir —
// confirmação na sala" e fica logada em kids_portao_scans (auditoria). Regra
// de ouro: o portão nunca resolve exceção — exceção se resolve na sala/depois.
// Substitui o modelo de chamadas TV/pagers (removido nesta mesma data).

// POST /api/totem-kids/portao/scan · Body: { codigo }
// Sempre responde 200 com { resultado } (o portão não bloqueia) · loga todo bip.
router.post('/portao/scan', authorizeModule('kids', 2), async (req, res) => {
  const registrar = async (row) => {
    const { error } = await supabase.from('kids_portao_scans')
      .insert({ criado_por: req.user.userId, ...row });
    if (error) console.warn('[totemKids/portao] log falhou:', error.message);
  };
  try {
    const cru = String(req.body?.codigo || '').toUpperCase().trim();
    if (!/^[A-Z0-9]{4}$/.test(cru)) {
      await registrar({ codigo: cru.slice(0, 24) || '?', resultado: 'nao_reconhecido' });
      return res.json({ resultado: 'nao_reconhecido' });
    }
    const codigo = cru;

    // 1) Match vivo: check-in ABERTO em sessão ABERTA → saída autorizada
    const { data: aberto, error: e1 } = await supabase
      .from('kids_checkins')
      .select('id, checkin_grupo_id, crianca:kids_criancas(id, nome), sala:kids_salas(id, nome, cor, logo_url), sessao:kids_sessoes(id, status)')
      .eq('codigo_seguranca', codigo)
      .is('checkout_at', null)
      .order('checkin_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (e1) throw e1;

    if (aberto && aberto.sessao?.status === 'aberta') {
      // Fecha o grupo multi-culto inteiro (mesma regra do /checkout).
      // Sem snapshot de responsável: a posse da etiqueta é conferida na sala.
      const patch = {
        checkout_at: new Date().toISOString(),
        checkout_metodo: 'portao',
        checkout_por: req.user.userId,
      };
      let q = supabase.from('kids_checkins').update(patch).is('checkout_at', null);
      q = aberto.checkin_grupo_id ? q.eq('checkin_grupo_id', aberto.checkin_grupo_id) : q.eq('id', aberto.id);
      const { data: fechados, error: e2 } = await q.select('id');
      if (e2) throw e2;
      if (!fechados || !fechados.length) {
        // Corrida: outro bip fechou no meio do caminho → trata como já retirada
        await registrar({ codigo, checkin_id: aberto.id, crianca_nome: aberto.crianca?.nome, resultado: 'ja_retirada', detalhe: 'corrida entre scans' });
        return res.json({ resultado: 'ja_retirada', crianca: aberto.crianca?.nome || null });
      }
      await registrar({ codigo, checkin_id: aberto.id, crianca_nome: aberto.crianca?.nome, resultado: 'ok' });
      return res.json({
        resultado: 'ok',
        crianca: aberto.crianca?.nome || null,
        sala: aberto.sala ? { nome: aberto.sala.nome, cor: aberto.sala.cor } : null,
        cultos_encerrados: fechados.length,
      });
    }

    // Check-in aberto mas a sessão já foi encerrada → etiqueta de culto antigo
    if (aberto) {
      await registrar({ codigo, checkin_id: aberto.id, crianca_nome: aberto.crianca?.nome, resultado: 'fora_de_sessao' });
      return res.json({ resultado: 'fora_de_sessao', crianca: aberto.crianca?.nome || null });
    }

    // 2) Código sem check-in aberto: já usado (sessão atual) ou culto antigo?
    const { data: usado, error: e3 } = await supabase
      .from('kids_checkins')
      .select('id, checkout_at, crianca:kids_criancas(nome), sessao:kids_sessoes(status)')
      .eq('codigo_seguranca', codigo)
      .order('checkin_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (e3) throw e3;

    if (usado && usado.checkout_at && usado.sessao?.status === 'aberta') {
      // Dupla retirada em potencial — o sinal de segurança mais importante do log
      await registrar({ codigo, checkin_id: usado.id, crianca_nome: usado.crianca?.nome, resultado: 'ja_retirada', detalhe: `retirada anterior em ${usado.checkout_at}` });
      return res.json({ resultado: 'ja_retirada', crianca: usado.crianca?.nome || null, retirada_em: usado.checkout_at });
    }
    if (usado) {
      await registrar({ codigo, checkin_id: usado.id, crianca_nome: usado.crianca?.nome, resultado: 'fora_de_sessao' });
      return res.json({ resultado: 'fora_de_sessao', crianca: usado.crianca?.nome || null });
    }

    await registrar({ codigo, resultado: 'nao_reconhecido' });
    return res.json({ resultado: 'nao_reconhecido' });
  } catch (e) {
    console.error('[totemKids/portao/scan]', e.message);
    res.status(500).json({ error: 'Erro ao validar o código' });
  }
});

// GET /api/totem-kids/portao/scans?limit=&resultado= · auditoria dos bips do portão
router.get('/portao/scans', authorizeModule('kids', 3), async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
    let q = supabase
      .from('kids_portao_scans')
      .select('id, codigo, resultado, crianca_nome, detalhe, created_at, checkin_id')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (req.query.resultado) q = q.eq('resultado', String(req.query.resultado));
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    console.error('[totemKids/portao/scans]', e.message);
    res.status(500).json({ error: 'Erro ao listar scans do portão' });
  }
});

// PATCH /api/totem-kids/checkin/:id · marca observacoes/decisao Jesus
router.patch('/checkin/:id', authorizeModule('kids', 2), async (req, res) => {
  try {
    const allowed = ['observacoes_no_dia', 'fez_decisao_jesus'];
    const update = {};
    for (const k of allowed) if (k in req.body) update[k] = req.body[k];
    if ('fez_decisao_jesus' in update && update.fez_decisao_jesus === true) {
      update.decisao_jesus_marcada_por = req.user.userId;
      update.decisao_jesus_em = new Date().toISOString();
    }
    const { data, error } = await supabase
      .from('kids_checkins')
      .update(update)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao atualizar check-in' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// PAINEL AO VIVO
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/totem-kids/painel/dia?data=YYYY-MM-DD · resumo dos cultos do dia com
// a contagem de crianças por culto (pra Milena abrir no celular e ver rápido
// quantas crianças em cada culto do dia + drilldown por sala/criança). Sem
// `data`, usa hoje (America/Sao_Paulo).
router.get('/painel/dia', authorizeModule('kids', 1), async (req, res) => {
  try {
    const data = req.query.data
      || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    const COLS = 'sessao_id, sala_id, culto_id, data_culto, culto_nome, service_type_name, status, abrir_em, criancas_presentes, criancas_saidas, decisoes_jesus, total_checkins';
    // Cultos do dia + QUALQUER sessão ABERTA (independe de ser dia de culto —
    // testes/cultos atípicos com sessão aberta e check-ins reais devem aparecer).
    const [rHoje, rAbertas] = await Promise.all([
      supabase.from('vw_kids_sessao_ao_vivo').select(COLS).eq('data_culto', data),
      supabase.from('vw_kids_sessao_ao_vivo').select(COLS).eq('status', 'aberta'),
    ]);
    if (rHoje.error) throw rHoje.error;
    if (rAbertas.error) throw rAbertas.error;
    const vistos = new Set();
    const linhas = [];
    for (const r of [...(rHoje.data || []), ...(rAbertas.data || [])]) {
      const k = `${r.sessao_id}|${r.sala_id ?? ''}`;
      if (vistos.has(k)) continue;
      vistos.add(k);
      linhas.push(r);
    }

    // Agrega por culto (a view vem 1 linha por sala)
    const porCulto = new Map();
    for (const r of (linhas || [])) {
      const k = r.culto_id;
      const cur = porCulto.get(k) || {
        culto_id: r.culto_id,
        sessao_id: r.sessao_id,
        culto_nome: r.culto_nome,
        service_type_name: r.service_type_name,
        abrir_em: r.abrir_em,
        status: r.status,
        presentes: 0, sairam: 0, decisoes: 0, total: 0,
      };
      cur.presentes += Number(r.criancas_presentes) || 0;
      cur.sairam    += Number(r.criancas_saidas) || 0;
      cur.decisoes  += Number(r.decisoes_jesus) || 0;
      cur.total     += Number(r.total_checkins) || 0;
      // aberta vence encerrada pra sinalizar culto em andamento
      if (r.status === 'aberta') cur.status = 'aberta';
      porCulto.set(k, cur);
    }
    const lista = Array.from(porCulto.values())
      .sort((a, b) => String(a.abrir_em || '').localeCompare(String(b.abrir_em || '')));

    // Crianças ÚNICAS no dia (distinct crianca_id somando TODOS os cultos) —
    // evita a dupla contagem de quem ficou em mais de um culto. presentes = sem
    // checkout agora; total = todas que passaram hoje.
    const sessaoIds = [...new Set(linhas.map(r => r.sessao_id).filter(Boolean))];
    const vistosTotal = new Set(), vistosPresentes = new Set();
    if (sessaoIds.length) {
      let from = 0; const page = 1000;
      for (;;) {
        const { data: cks, error: eCk } = await supabase
          .from('kids_checkins')
          .select('crianca_id, checkout_at')
          .in('sessao_id', sessaoIds)
          .range(from, from + page - 1);
        if (eCk) throw eCk;
        for (const ck of (cks || [])) {
          vistosTotal.add(ck.crianca_id);
          if (!ck.checkout_at) vistosPresentes.add(ck.crianca_id);
        }
        if (!cks || cks.length < page) break;
        from += page;
      }
    }
    res.json({ data, cultos: lista, unicas: { presentes: vistosPresentes.size, total: vistosTotal.size } });
  } catch (e) {
    console.error('[totemKids/painel/dia]', e.message);
    res.status(500).json({ error: 'Erro ao resumir os cultos do dia' });
  }
});

// POST /api/totem-kids/painel/checkout-todos · baixa (check-out) em massa de
// TODAS as crianças que ainda constam presentes (checkout_at IS NULL). Uso: fim
// do culto ou segunda de manhã pra limpar quem ficou sem baixa. Não bloqueia nada.
router.post('/painel/checkout-todos', authorizeModule('kids', 3), async (req, res) => {
  try {
    const { data: baixados, error } = await supabase
      .from('kids_checkins')
      .update({
        checkout_at: new Date().toISOString(),
        checkout_metodo: 'checkout_forcado',
        checkout_por: req.user.userId,
        responsavel_checkout_nome: 'Baixa em massa (painel)',
      })
      .is('checkout_at', null)
      .select('id');
    if (error) throw error;
    res.json({ baixados: (baixados || []).length });
  } catch (e) {
    console.error('[totemKids/painel/checkout-todos]', e.message);
    res.status(500).json({ error: 'Erro ao dar baixa em todos' });
  }
});

// GET /api/totem-kids/painel/ao-vivo?sessao_id=... · agregado por sala
router.get('/painel/ao-vivo', authorizeModule('kids', 1), async (req, res) => {
  try {
    const sessaoId = req.query.sessao_id;
    let q = supabase.from('vw_kids_sessao_ao_vivo').select('*');
    if (sessaoId) q = q.eq('sessao_id', sessaoId);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: 'Erro no painel ao vivo' });
  }
});

// GET /api/totem-kids/painel/sala/:id?sessao_id=... · lista de crianças na sala
router.get('/painel/sala/:id', authorizeModule('kids', 1), async (req, res) => {
  try {
    const sessaoId = req.query.sessao_id;
    let q = supabase
      .from('kids_checkins')
      .select(`
        id, checkin_at, checkout_at, codigo_seguranca, crianca_id,
        responsavel_checkin_nome, fez_decisao_jesus, observacoes_no_dia,
        crianca:kids_criancas(id, nome, data_nascimento, foto_url, observacoes_medicas, tem_espectro, espectro_qual, tem_alergia, alergia_qual, tem_limitacao_fisica, limitacao_fisica_qual)
      `)
      .eq('sala_id', req.params.id)
      .order('checkin_at', { ascending: false });
    if (sessaoId) q = q.eq('sessao_id', sessaoId);
    const { data, error } = await q;
    if (error) throw error;

    // Anexa total de decisões anteriores por criança (vw_kids_decisoes_resumo_crianca)
    const criancaIds = [...new Set((data || []).map(d => d.crianca_id).filter(Boolean))];
    let resumoPorCrianca = {};
    if (criancaIds.length) {
      const { data: resumo } = await supabase
        .from('vw_kids_decisoes_resumo_crianca')
        .select('crianca_id, total_decisoes')
        .in('crianca_id', criancaIds);
      resumoPorCrianca = Object.fromEntries((resumo || []).map(r => [r.crianca_id, r.total_decisoes]));
    }

    res.json((data || []).map(ci => ({
      ...ci,
      crianca: ci.crianca && {
        ...ci.crianca,
        idade_label: formatIdade(calcIdadeMeses(ci.crianca.data_nascimento)),
      },
      total_decisoes_historico: resumoPorCrianca[ci.crianca_id] || 0,
    })));
  } catch (e) {
    res.status(500).json({ error: 'Erro ao listar crianças da sala' });
  }
});

// GET /api/totem-kids/sessoes/:id/criancas-presentes · lista quem fez check-in
// Usado pela UI de decisões pra selecionar crianças reais (não texto livre).
router.get('/sessoes/:id/criancas-presentes', authorizeModule('kids', 1), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('vw_kids_criancas_presentes_sessao')
      .select('*')
      .eq('sessao_id', req.params.id)
      .order('crianca_nome');
    if (error) throw error;
    res.json((data || []).map(c => ({
      ...c,
      idade_label: formatIdade(calcIdadeMeses(c.data_nascimento)),
    })));
  } catch (e) {
    console.error('[totemKids/sessoes/criancas-presentes]', e.message);
    res.status(500).json({ error: 'Erro ao listar crianças presentes' });
  }
});

// GET /api/totem-kids/decisoes/historico/:criancaId · todas as decisões da criança
router.get('/decisoes/historico/:criancaId', authorizeModule('kids', 1), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('vw_kids_decisoes_historico_crianca')
      .select('*')
      .eq('crianca_id', req.params.criancaId)
      .order('sequencia_decisao');
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar histórico de decisões' });
  }
});

// GET /api/totem-kids/decisoes/resumo-por-crianca · ranking de decisões
router.get('/decisoes/resumo-por-crianca', authorizeModule('kids', 1), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('vw_kids_decisoes_resumo_crianca')
      .select('*')
      .gt('total_decisoes', 0)
      .order('total_decisoes', { ascending: false })
      .order('nome');
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar resumo de decisões' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// SALAS
// ═══════════════════════════════════════════════════════════════════════════

router.get('/salas', authorizeModule('kids', 1), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('kids_salas')
      .select('*')
      .order('ordem')
      .order('nome');
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao listar salas' });
  }
});

router.post('/salas', authorizeModule('kids', 3), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('kids_salas')
      .insert(req.body)
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao criar sala' });
  }
});

router.patch('/salas/:id', authorizeModule('kids', 3), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('kids_salas')
      .update(req.body)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao editar sala' });
  }
});

// DELETE /salas/:id · exclui a sala DE VERDADE (não é PII · é config).
// Guard: se a sala já tem check-ins no histórico, não dá pra excluir (FK
// RESTRICT) — devolve 409 pedindo pra desativar. Estoque/voluntários da sala
// têm ON DELETE CASCADE, então somem junto.
router.delete('/salas/:id', authorizeModule('kids', 5), async (req, res) => {
  try {
    const salaId = req.params.id;
    const { count: nChk } = await supabase
      .from('kids_checkins').select('id', { count: 'exact', head: true }).eq('sala_id', salaId);
    if (nChk && nChk > 0) {
      return res.status(409).json({
        error: `Esta sala tem ${nChk} check-in(s) no histórico e não pode ser excluída permanentemente. Desative-a em vez de excluir.`,
      });
    }
    const { error } = await supabase.from('kids_salas').delete().eq('id', salaId);
    if (error) {
      if (error.code === '23503') {
        return res.status(409).json({
          error: 'Esta sala está em uso (registros vinculados) e não pode ser excluída. Desative-a em vez de excluir.',
        });
      }
      throw error;
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('[totemKids] excluir sala:', e.message);
    res.status(500).json({ error: 'Erro ao excluir sala' });
  }
});

// POST /salas/:id/logo · logo da categoria (impressa na etiqueta da criança).
// Bucket público fotos-membros (prefixo kids-logos/) pra o iframe de impressão
// carregar a imagem sem header de auth. Branding · sem PII.
router.post('/salas/:id/logo', authorizeModule('kids', 3), async (req, res) => {
  try {
    const { dataUrl } = req.body || {};
    const m = String(dataUrl || '').match(/^data:(image\/(png|jpe?g|webp));base64,(.+)$/);
    if (!m) return res.status(400).json({ error: 'Imagem inválida' });
    const mime = m[1];
    const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
    const buffer = Buffer.from(m[3], 'base64');
    if (buffer.length > 3 * 1024 * 1024) return res.status(413).json({ error: 'Imagem muito grande (máx 3MB)' });
    const path = `kids-logos/${req.params.id}.${ext}`;
    const { error: upErr } = await supabase.storage.from('fotos-membros').upload(path, buffer, { contentType: mime, upsert: true });
    if (upErr) throw upErr;
    const { data: urlData } = supabase.storage.from('fotos-membros').getPublicUrl(path);
    const logo_url = `${urlData.publicUrl}?t=${Date.now()}`;
    const { error: dbErr } = await supabase.from('kids_salas').update({ logo_url }).eq('id', req.params.id);
    if (dbErr) throw dbErr;
    res.json({ logo_url });
  } catch (e) {
    console.error('[totemKids] logo sala:', e.message);
    res.status(500).json({ error: 'Erro ao salvar a logo da sala' });
  }
});

// POST /salas/:id/logo/remover · tira a logo (volta pra sem logo na etiqueta)
router.post('/salas/:id/logo/remover', authorizeModule('kids', 3), async (req, res) => {
  try {
    for (const ext of ['png', 'jpg', 'webp']) {
      await supabase.storage.from('fotos-membros').remove([`kids-logos/${req.params.id}.${ext}`]).catch(() => {});
    }
    const { error } = await supabase.from('kids_salas').update({ logo_url: null }).eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[totemKids] remover logo sala:', e.message);
    res.status(500).json({ error: 'Erro ao remover a logo' });
  }
});

// ─── Config de layout da etiqueta (singleton) ───────────────────────────────
router.get('/etiqueta-config', authorizeModule('kids', 1), async (req, res) => {
  try {
    const { data } = await supabase.from('kids_etiqueta_config').select('*').eq('id', 1).maybeSingle();
    res.json(data || { logo_tamanho: 'M', logo_posicao: 'esquerda', nome_tamanho: 'auto' });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao carregar layout' });
  }
});

router.put('/etiqueta-config', authorizeModule('kids', 3), async (req, res) => {
  try {
    const tamOk = ['P', 'M', 'G'];
    const posOk = ['esquerda', 'direita', 'acima'];
    const nomeOk = ['auto', 'P', 'M', 'G'];
    const patch = { id: 1, updated_at: new Date().toISOString() };
    if (tamOk.includes(req.body?.logo_tamanho)) patch.logo_tamanho = req.body.logo_tamanho;
    if (posOk.includes(req.body?.logo_posicao)) patch.logo_posicao = req.body.logo_posicao;
    if (nomeOk.includes(req.body?.nome_tamanho)) patch.nome_tamanho = req.body.nome_tamanho;
    const { data, error } = await supabase.from('kids_etiqueta_config')
      .upsert(patch, { onConflict: 'id' }).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[totemKids] etiqueta-config:', e.message);
    res.status(500).json({ error: 'Erro ao salvar layout' });
  }
});

// POST /etiqueta-config/logo · logo do Kids da etiqueta de ANIVERSÁRIO (global).
// Bucket público fotos-membros (kids-logos/_aniversario) pra o iframe imprimir.
router.post('/etiqueta-config/logo', authorizeModule('kids', 3), async (req, res) => {
  try {
    const { dataUrl } = req.body || {};
    const m = String(dataUrl || '').match(/^data:(image\/(png|jpe?g|webp));base64,(.+)$/);
    if (!m) return res.status(400).json({ error: 'Imagem inválida' });
    const mime = m[1];
    const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
    const buffer = Buffer.from(m[3], 'base64');
    if (buffer.length > 3 * 1024 * 1024) return res.status(413).json({ error: 'Imagem muito grande (máx 3MB)' });
    const path = `kids-logos/_aniversario.${ext}`;
    const { error: upErr } = await supabase.storage.from('fotos-membros').upload(path, buffer, { contentType: mime, upsert: true });
    if (upErr) throw upErr;
    const { data: urlData } = supabase.storage.from('fotos-membros').getPublicUrl(path);
    const logo_aniversario_url = `${urlData.publicUrl}?t=${Date.now()}`;
    const { error: dbErr } = await supabase.from('kids_etiqueta_config')
      .upsert({ id: 1, logo_aniversario_url, updated_at: new Date().toISOString() }, { onConflict: 'id' });
    if (dbErr) throw dbErr;
    res.json({ logo_aniversario_url });
  } catch (e) {
    console.error('[totemKids] etiqueta-config logo:', e.message);
    res.status(500).json({ error: 'Erro ao salvar a logo' });
  }
});

// POST /etiqueta-config/logo/remover · tira a logo de aniversário
router.post('/etiqueta-config/logo/remover', authorizeModule('kids', 3), async (req, res) => {
  try {
    for (const ext of ['png', 'jpg', 'webp']) {
      await supabase.storage.from('fotos-membros').remove([`kids-logos/_aniversario.${ext}`]).catch(() => {});
    }
    const { error } = await supabase.from('kids_etiqueta_config')
      .upsert({ id: 1, logo_aniversario_url: null, updated_at: new Date().toISOString() }, { onConflict: 'id' });
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[totemKids] etiqueta-config logo remover:', e.message);
    res.status(500).json({ error: 'Erro ao remover a logo' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ETIQUETAS · LOG (auditoria de impressão)
// ═══════════════════════════════════════════════════════════════════════════

router.post('/etiquetas-log', authorizeModule('kids', 2), async (req, res) => {
  try {
    const { checkin_id, estacao_id, tipo, conteudo, reimpressao, motivo_reimpressao, status, erro } = req.body;
    if (!checkin_id || !tipo) return res.status(400).json({ error: 'checkin_id e tipo obrigatórios' });

    const row = {
      checkin_id,
      estacao_id: estacao_id || null,
      tipo,
      conteudo_json: conteudo || {},
      reimpressao: !!reimpressao,
      motivo_reimpressao: motivo_reimpressao || null,
      impressa_por: req.user.userId,
      status: status || 'enviada',
      erro: erro || null,
    };
    let { data, error } = await supabase.from('kids_etiquetas_log').insert(row).select('id').single();
    // Estação é auditoria OPCIONAL: pareamento antigo no localStorage do totem
    // apontando pra estação inexistente derrubava o log com FK (8× 500 em
    // 2026-07-07 · caso Diego). Descarta a estação e loga mesmo assim.
    if (error && error.code === '23503' && String(error.message || '').includes('estacao')) {
      ({ data, error } = await supabase.from('kids_etiquetas_log')
        .insert({ ...row, estacao_id: null }).select('id').single());
    }
    // Valor fora do CHECK (tipo/status) é erro do chamador, não do servidor
    if (error && error.code === '23514') {
      return res.status(400).json({ error: 'tipo ou status inválido', detalhe: error.message });
    }
    if (error) throw error;

    // Incrementa contador no checkin (best effort)
    const { data: cur } = await supabase
      .from('kids_checkins').select('labels_impressas').eq('id', checkin_id).maybeSingle();
    if (cur) {
      await supabase
        .from('kids_checkins')
        .update({ labels_impressas: (cur.labels_impressas || 0) + 1 })
        .eq('id', checkin_id);
    }

    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao logar etiqueta' });
  }
});

// GET /api/totem-kids/auditoria/overrides · log de overrides pra coord
router.get('/auditoria/overrides', authorizeModule('kids', 3), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('kids_checkins')
      .select(`
        id, checkin_at, checkout_at, codigo_seguranca,
        responsavel_checkin_nome, responsavel_checkout_nome,
        override_motivo, override_aprovado_por,
        crianca:kids_criancas(id, nome),
        sessao:kids_sessoes(id, culto:cultos(nome, data))
      `)
      .eq('checkout_metodo', 'override_supervisor')
      .order('checkout_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao listar overrides' });
  }
});

// GET /api/totem-kids/historico/crianca/:id · histórico completo
router.get('/historico/crianca/:id', authorizeModule('kids', 1), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('vw_kids_historico_crianca')
      .select('*')
      .eq('crianca_id', req.params.id)
      .order('data_culto', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar histórico' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// IMPORT XLSX · cadastro em massa de crianças + responsáveis
// ═══════════════════════════════════════════════════════════════════════════

// Normaliza nome de coluna pra match · lowercase, sem acento, sem espaco
function normalizeColName(s) {
  return String(s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// Aliases aceitos por campo lógico
const COL_ALIASES = {
  nome_crianca:           ['nome_crianca','nome','crianca','child_name','first_name'],
  data_nascimento:        ['data_nascimento','nascimento','aniversario','birthdate','dob','data_nasc'],
  sexo:                   ['sexo','genero','gender'],
  alergia:                ['alergia','alergias','observacoes_medicas','medical','medical_notes','allergies'],
  observacoes:            ['observacoes','obs','notas','notes','observacao'],
  responsavel_nome:       ['responsavel_nome','responsavel','mae','pai','household_name','parent_name'],
  responsavel_telefone:   ['responsavel_telefone','telefone','phone','mobile'],
  responsavel_cpf:        ['responsavel_cpf','cpf'],
  responsavel_parentesco: ['responsavel_parentesco','parentesco','relationship'],
  responsavel2_nome:      ['responsavel2_nome','responsavel_2','segundo_responsavel','parent2_name'],
  responsavel2_telefone:  ['responsavel2_telefone','telefone2','phone2'],
  responsavel2_cpf:       ['responsavel2_cpf','cpf2'],
  responsavel2_parentesco: ['responsavel2_parentesco','parentesco2'],
  ultima_visita:          ['ultima_visita','ultima_presenca','last_visit'],
};

// Resolve mapa coluna_planilha → campo_logico
function resolveColumnMap(firstRow) {
  const keys = Object.keys(firstRow).map(k => ({ original: k, norm: normalizeColName(k) }));
  const map = {};
  for (const [logico, aliases] of Object.entries(COL_ALIASES)) {
    const found = keys.find(k => aliases.includes(k.norm));
    if (found) map[logico] = found.original;
  }
  return map;
}

function pickRowValue(row, colMap, logico) {
  const orig = colMap[logico];
  if (!orig) return null;
  const v = row[orig];
  if (v == null || v === '') return null;
  return typeof v === 'string' ? v.trim() : v;
}

function normalizeTelefone(t) {
  if (!t) return null;
  const d = String(t).replace(/\D/g, '');
  return d.length >= 8 ? d : null;
}
function normalizeCpf(c) {
  if (!c) return null;
  const d = String(c).replace(/\D/g, '');
  return d.length === 11 ? d : null;
}
function normalizeDateStr(v) {
  if (v == null || v === '') return null;
  // Excel date number
  if (typeof v === 'number') {
    try {
      const d = XLSX.SSF.parse_date_code(v);
      if (d) return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
    } catch { /* fallthrough */ }
  }
  // Date object
  if (v instanceof Date && !isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  // dd/mm/yyyy
  const m1 = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(s);
  if (m1) {
    const ano = m1[3].length === 2 ? `20${m1[3]}` : m1[3];
    return `${ano}-${m1[2].padStart(2,'0')}-${m1[1].padStart(2,'0')}`;
  }
  // yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}
function normalizeSexo(v) {
  if (!v) return null;
  const s = String(v).trim().toLowerCase();
  if (['m','masc','masculino','male','menino','boy','h','homem'].includes(s)) return 'M';
  if (['f','fem','feminino','female','menina','girl','mulher'].includes(s)) return 'F';
  return null;
}
function normalizeParentesco(v) {
  if (!v) return null;
  const s = String(v).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (['mae','mother','mom'].includes(s)) return 'mae';
  if (['pai','father','dad'].includes(s)) return 'pai';
  if (['padrasto','step_father','step-father'].includes(s)) return 'padrasto';
  if (['madrasta','step_mother','step-mother'].includes(s)) return 'madrasta';
  if (['avo','avo_a','avo(a)','grandparent','grandpa','grandma','vovo','vovó'].includes(s)) return 'avo_a';
  if (['tio','tia','tio_a','tio(a)','uncle','aunt'].includes(s)) return 'tio_a';
  if (['irmao','irma','irmao_a','irmao(a)','brother','sister'].includes(s)) return 'irmao_a';
  if (['tutor','guardian'].includes(s)) return 'tutor';
  return 'outro';
}

// Resolve ou cria mem_membros do responsável
async function resolveOrCreateMembro({ nome, telefone, cpf, parentesco }) {
  // guarda na origem (CPF→e-mail→telefone+nome→cria · não liga por telefone só)
  const r = await acharOuCriarGuardado({
    cpf, telefone, nome, status: 'visitante',
    extra: { parentesco: parentesco === 'mae' || parentesco === 'pai' ? 'responsavel' : null },
  });
  const { data: membro } = await supabase.from('mem_membros')
    .select('id, nome, familia_id, parentesco').eq('id', r.membro_id).single();
  return { membro, criado: !!r.created };
}

async function getOrCreateFamilia(membro) {
  if (membro.familia_id) return membro.familia_id;
  const primeiroNome = (membro.nome || 'Familia').split(' ')[0];
  const { data, error } = await supabase.from('mem_familias')
    .insert({ nome: `Familia ${primeiroNome}` })
    .select('id').single();
  if (error) throw error;
  await supabase.from('mem_membros').update({ familia_id: data.id }).eq('id', membro.id);
  return data.id;
}

// Processa 1 linha · retorna { status, msg } pra relatório
async function processarLinhaImport(row, colMap, dryRun, userId) {
  const nomeCrianca = pickRowValue(row, colMap, 'nome_crianca');
  const respNome = pickRowValue(row, colMap, 'responsavel_nome');
  const respTel = normalizeTelefone(pickRowValue(row, colMap, 'responsavel_telefone'));

  if (!nomeCrianca) return { status: 'erro', msg: 'nome_crianca obrigatorio' };
  if (!respNome) return { status: 'erro', msg: 'responsavel_nome obrigatorio' };
  if (!respTel) return { status: 'erro', msg: 'responsavel_telefone obrigatorio (>=8 digitos)' };

  const dataNasc = normalizeDateStr(pickRowValue(row, colMap, 'data_nascimento'));
  const sexo = normalizeSexo(pickRowValue(row, colMap, 'sexo'));
  const alergia = pickRowValue(row, colMap, 'alergia');
  const obs = pickRowValue(row, colMap, 'observacoes');
  const respCpf = normalizeCpf(pickRowValue(row, colMap, 'responsavel_cpf'));
  const respParentesco = normalizeParentesco(pickRowValue(row, colMap, 'responsavel_parentesco'));

  if (dryRun) {
    return { status: 'preview', msg: `${nomeCrianca} → resp ${respNome}` };
  }

  // 1. Resolve responsável
  const { membro: resp1, criado: resp1Criado } = await resolveOrCreateMembro({
    nome: respNome, telefone: respTel, cpf: respCpf, parentesco: respParentesco,
  });

  // 2. Família
  const familiaId = await getOrCreateFamilia(resp1);

  // 3. Criança · match por nome (case-insensitive) + família
  const { data: jaExiste } = await supabase
    .from('kids_criancas')
    .select('id')
    .ilike('nome', nomeCrianca)
    .eq('familia_id', familiaId)
    .maybeSingle();

  let criancaId;
  let statusResp;
  if (jaExiste) {
    criancaId = jaExiste.id;
    const update = {};
    if (dataNasc) update.data_nascimento = dataNasc;
    if (sexo) update.sexo = sexo;
    if (alergia) update.observacoes_medicas = alergia;
    if (obs) update.observacoes_internas = obs;
    if (Object.keys(update).length) {
      await supabase.from('kids_criancas').update(update).eq('id', criancaId);
    }
    statusResp = 'atualizada';
  } else {
    const { data: nova, error } = await supabase.from('kids_criancas').insert({
      nome: nomeCrianca,
      data_nascimento: dataNasc,
      sexo,
      familia_id: familiaId,
      observacoes_medicas: alergia,
      observacoes_internas: obs,
      visitante: true,
      ativo: true,
      created_by: userId,
    }).select('id').single();
    if (error) throw error;
    criancaId = nova.id;
    statusResp = 'criada';
  }

  // 4. Liga responsável 1 (se não tem)
  await supabase.from('kids_responsaveis').upsert({
    crianca_id: criancaId,
    membro_id: resp1.id,
    parentesco: respParentesco,
    autorizado_buscar: true,
  }, { onConflict: 'crianca_id,membro_id', ignoreDuplicates: false });

  // 5. Responsável 2 (opcional)
  const resp2Nome = pickRowValue(row, colMap, 'responsavel2_nome');
  const resp2Tel = normalizeTelefone(pickRowValue(row, colMap, 'responsavel2_telefone'));
  if (resp2Nome && resp2Tel) {
    const resp2Cpf = normalizeCpf(pickRowValue(row, colMap, 'responsavel2_cpf'));
    const resp2Parentesco = normalizeParentesco(pickRowValue(row, colMap, 'responsavel2_parentesco'));
    try {
      const { membro: resp2 } = await resolveOrCreateMembro({
        nome: resp2Nome, telefone: resp2Tel, cpf: resp2Cpf, parentesco: resp2Parentesco,
      });
      // Mesma família
      if (!resp2.familia_id) {
        await supabase.from('mem_membros').update({ familia_id: familiaId }).eq('id', resp2.id);
      }
      await supabase.from('kids_responsaveis').upsert({
        crianca_id: criancaId,
        membro_id: resp2.id,
        parentesco: resp2Parentesco,
        autorizado_buscar: true,
      }, { onConflict: 'crianca_id,membro_id', ignoreDuplicates: false });
    } catch (e) {
      console.warn('[import] resp2 falhou:', e.message);
    }
  }

  return {
    status: statusResp,
    msg: `${nomeCrianca} → ${respNome}${resp1Criado ? ' (resp novo)' : ''}`,
  };
}

// POST /api/totem-kids/criancas/importar?dry_run=1
router.post(
  '/criancas/importar',
  authorizeModule('kids', 3),
  xlsxUpload.single('arquivo'),
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'arquivo obrigatorio (campo "arquivo")' });

      const dryRun = ['1','true','yes'].includes(String(req.query.dry_run || '').toLowerCase());

      const wb = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
      const sheetName = wb.SheetNames[0];
      if (!sheetName) return res.status(400).json({ error: 'planilha vazia' });
      const sheet = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false });
      if (!rows.length) return res.status(400).json({ error: 'nenhuma linha encontrada' });

      const colMap = resolveColumnMap(rows[0]);

      const colObrigatorias = ['nome_crianca','responsavel_nome','responsavel_telefone'];
      const faltando = colObrigatorias.filter(c => !colMap[c]);
      if (faltando.length) {
        return res.status(400).json({
          error: 'colunas obrigatorias faltando',
          faltando,
          colunas_encontradas: Object.keys(rows[0]),
          colunas_mapeadas: colMap,
        });
      }

      const relatorio = { total: rows.length, criadas: 0, atualizadas: 0, preview: 0, erros: 0, detalhes: [] };

      for (let i = 0; i < rows.length; i++) {
        try {
          const r = await processarLinhaImport(rows[i], colMap, dryRun, req.user.userId);
          if (r.status === 'criada') relatorio.criadas++;
          else if (r.status === 'atualizada') relatorio.atualizadas++;
          else if (r.status === 'preview') relatorio.preview++;
          else if (r.status === 'erro') relatorio.erros++;
          relatorio.detalhes.push({ linha: i + 2, ...r }); // +2 = +1 header +1 base 1
        } catch (e) {
          relatorio.erros++;
          relatorio.detalhes.push({ linha: i + 2, status: 'erro', msg: e.message || 'erro desconhecido' });
        }
      }

      res.json({ dry_run: dryRun, coluna_mapeamento: colMap, ...relatorio });
    } catch (e) {
      console.error('[totemKids/importar]', e);
      res.status(500).json({ error: e.message || 'Erro ao processar planilha' });
    }
  }
);

// GET /api/totem-kids/criancas/modelo-importacao · gera modelo XLSX
router.get('/criancas/modelo-importacao', authorizeModule('kids', 1), async (req, res) => {
  const ws = XLSX.utils.aoa_to_sheet([
    [
      'nome_crianca', 'data_nascimento', 'sexo', 'alergia', 'observacoes',
      'responsavel_nome', 'responsavel_telefone', 'responsavel_cpf', 'responsavel_parentesco',
      'responsavel2_nome', 'responsavel2_telefone', 'responsavel2_cpf', 'responsavel2_parentesco',
      'ultima_visita',
    ],
    [
      'Maria Clara Silva', '2020-05-15', 'F', 'Amendoim', 'Usa óculos',
      'Cláudia Silva', '21999998888', '12345678900', 'mae',
      'João Silva', '21988887777', '98765432100', 'pai',
      '2026-05-15',
    ],
    [
      'Pedro Oliveira', '2019-08-20', 'M', '', '',
      'Ana Oliveira', '21977776666', '', 'mae',
      '', '', '', '',
      '',
    ],
  ]);
  ws['!cols'] = [
    { wch: 22 }, { wch: 14 }, { wch: 6 }, { wch: 16 }, { wch: 18 },
    { wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 16 },
    { wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 16 },
    { wch: 14 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Criancas');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="modelo-importacao-criancas.xlsx"');
  res.send(buf);
});

// ── Pré-check-in (vindo do app de membros) ─────────────────────────────────
// GET /pre-checkin/codigo/:codigo — o voluntário escaneia/digita o código do
// app e recebe responsável + filhos (com sala sugerida) pra confirmar e
// imprimir. Só pré-popula; o check-in real continua sendo o POST /checkin.
router.get('/pre-checkin/codigo/:codigo', authorizeModule('kids', 2), async (req, res) => {
  try {
    const codigo = String(req.params.codigo || '').trim().toUpperCase();
    if (!codigo) return res.status(400).json({ error: 'Código vazio' });

    const { data: pre } = await supabase
      .from('kids_pre_checkins')
      .select('*')
      .eq('codigo', codigo)
      .eq('status', 'pendente')
      .maybeSingle();
    if (!pre) return res.status(404).json({ error: 'Pré-check-in não encontrado ou já usado' });
    if (new Date(pre.expira_em) < new Date()) {
      return res.status(410).json({ error: 'Pré-check-in expirado. Peça pro responsável gerar de novo.' });
    }

    const { data: criancas } = await supabase
      .from('kids_criancas')
      .select('id, nome, data_nascimento, sexo, foto_url, foto_storage_path, foto_consentimento_em, observacoes_medicas, necessidades_especiais')
      .in('id', pre.crianca_ids)
      .eq('ativo', true);

    const enriquecidas = await Promise.all((criancas || []).map(async (c) => {
      let idadeMeses = null;
      if (c.data_nascimento) {
        const nasc = new Date(c.data_nascimento);
        idadeMeses = Math.floor((Date.now() - nasc.getTime()) / (1000 * 60 * 60 * 24 * 30.44));
      }
      const sala = await sugerirSala(idadeMeses);
      return { ...c, foto_url: await fotoVisivelCrianca(c), idade_meses: idadeMeses, sala_sugerida: sala };
    }));

    res.json({
      pre_checkin_id: pre.id,
      responsavel: {
        membro_id: pre.responsavel_membro_id,
        nome: pre.responsavel_nome,
        telefone: pre.responsavel_telefone,
      },
      criancas: enriquecidas,
    });
  } catch (e) {
    console.error('[TOTEM-KIDS] pre-checkin/codigo:', e.message);
    res.status(500).json({ error: 'Erro ao ler pré-check-in' });
  }
});

// POST /pre-checkin/:id/consumir { checkin_ids } — marca como usado após o
// voluntário confirmar os check-ins reais (auditoria: quem e quais).
router.post('/pre-checkin/:id/consumir', authorizeModule('kids', 2), async (req, res) => {
  try {
    const { checkin_ids } = req.body || {};
    const { error } = await supabase
      .from('kids_pre_checkins')
      .update({
        status: 'usado',
        usado_em: new Date().toISOString(),
        usado_por: req.user?.id || null,
        checkin_ids: Array.isArray(checkin_ids) ? checkin_ids : null,
      })
      .eq('id', req.params.id)
      .eq('status', 'pendente');
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[TOTEM-KIDS] pre-checkin/consumir:', e.message);
    res.status(500).json({ error: 'Erro ao consumir pré-check-in' });
  }
});

// ============================================================
// Solicitações de vínculo (criança↔responsável) feitas pelo app
// A equipe Kids confere os documentos e aprova/rejeita. Aprovar cria a
// criança (se nova) + o vínculo kids_responsaveis (autorizado_buscar).
// ============================================================

// GET /pre-checkin é separado · aqui /vinculo-solicitacoes
// GET /vinculo-solicitacoes?status=pendente — lista pra triagem
router.get('/vinculo-solicitacoes', authorizeModule('kids', 1), async (req, res) => {
  try {
    const status = String(req.query.status || 'pendente');
    let q = supabase
      .from('kids_vinculo_solicitacoes')
      .select('id, solicitante_nome, solicitante_telefone, solicitante_parentesco, crianca_nome, crianca_data_nascimento, status, motivo_rejeicao, observacao, created_at, decidido_em, decidido_por_nome')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(200);
    if (status && status !== 'todos') q = q.eq('status', status);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    console.error('[TOTEM-KIDS] vinculo-solicitacoes list:', e.message);
    res.status(500).json({ error: 'Erro ao listar solicitações' });
  }
});

// GET /vinculo-solicitacoes/:id — detalhe + signed URLs dos documentos (15 min)
router.get('/vinculo-solicitacoes/:id', authorizeModule('kids', 2), async (req, res) => {
  try {
    const { data: s, error } = await supabase
      .from('kids_vinculo_solicitacoes')
      .select('*')
      .eq('id', req.params.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    if (!s) return res.status(404).json({ error: 'Solicitação não encontrada' });

    const signed = async (path) => {
      if (!path) return null;
      const { data } = await supabase.storage.from('kids-documentos').createSignedUrl(path, 900);
      return data?.signedUrl || null;
    };
    // Foto da criança só é exibida com consentimento registrado. Docs legados
    // (versões antigas do app) seguem assinados pra triagem das pendentes.
    const [crianca_foto_url, crianca_doc_url, doc_pai_url, doc_mae_url, foto_mae_url, foto_pai_url] = await Promise.all([
      s.foto_consentimento_em ? signed(s.crianca_foto_path) : null,
      signed(s.crianca_doc_path), signed(s.doc_pai_path), signed(s.doc_mae_path),
      signed(s.foto_mae_path), signed(s.foto_pai_path),
    ]);

    // Anti-duplicata: se o pedido não aponta uma criança existente, sugere
    // crianças com nome parecido (a equipe vincula a uma em vez de criar nova).
    let possiveis_criancas = [];
    if (!s.crianca_id && s.crianca_nome && String(s.crianca_nome).trim().length >= 3) {
      const termo = String(s.crianca_nome).trim().replace(/[%_,]/g, '');
      const { data: cands } = await supabase.from('kids_criancas')
        .select('id, nome, data_nascimento, ativo, familia:mem_familias(nome), responsaveis:kids_responsaveis(membro:mem_membros(nome))')
        .ilike('nome', `%${termo}%`).is('deleted_at', null).limit(10);
      possiveis_criancas = (cands || []).map((c) => ({
        id: c.id, nome: c.nome, data_nascimento: c.data_nascimento, ativo: c.ativo,
        familia: c.familia?.nome || null,
        responsaveis: (c.responsaveis || []).map((r) => r.membro?.nome).filter(Boolean),
        match_forte: !!(s.crianca_data_nascimento && c.data_nascimento && c.data_nascimento === s.crianca_data_nascimento),
      })).sort((a, b) => (b.match_forte ? 1 : 0) - (a.match_forte ? 1 : 0));
    }

    res.json({ ...s, crianca_foto_url, crianca_doc_url, doc_pai_url, doc_mae_url, foto_mae_url, foto_pai_url, possiveis_criancas });
  } catch (e) {
    console.error('[TOTEM-KIDS] vinculo-solicitacoes detalhe:', e.message);
    res.status(500).json({ error: 'Erro ao abrir solicitação' });
  }
});

// POST /vinculo-solicitacoes/:id/aprovar — cria criança (se nova) + vínculo
router.post('/vinculo-solicitacoes/:id/aprovar', authorizeModule('kids', 3), async (req, res) => {
  try {
    const { data: s } = await supabase
      .from('kids_vinculo_solicitacoes')
      .select('*')
      .eq('id', req.params.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (!s) return res.status(404).json({ error: 'Solicitação não encontrada' });
    if (s.status !== 'pendente') return res.status(409).json({ error: 'Solicitação já decidida' });

    // 1. Resolve a criança: criança escolhida na triagem (anti-duplicata) >
    //    a apontada no pedido > cria nova na família do solicitante.
    let criancaId = req.body?.crianca_id || s.crianca_id;
    if (!criancaId) {
      // garante família do solicitante
      const { data: membro } = await supabase
        .from('mem_membros').select('id, nome, familia_id').eq('id', s.solicitante_membro_id).maybeSingle();
      if (!membro) return res.status(400).json({ error: 'Membro solicitante não encontrado' });
      let familiaId = membro.familia_id;
      if (!familiaId) {
        const { data: f, error: fe } = await supabase
          .from('mem_familias').insert({ nome: `Familia ${membro.nome.split(' ')[0]}` }).select('id').single();
        if (fe) throw fe;
        familiaId = f.id;
        await supabase.from('mem_membros').update({ familia_id: familiaId, parentesco: 'responsavel' }).eq('id', membro.id);
      }
      const { data: criada, error: ce } = await supabase
        .from('kids_criancas')
        .insert({
          nome: s.crianca_nome,
          data_nascimento: s.crianca_data_nascimento || null,
          serie: s.serie || null,
          necessidades_especiais: s.necessidade_especial || null,
          consent_marketing: s.consent_marketing ?? null,
          consent_marketing_em: s.consent_marketing_em || null,
          consent_marketing_versao: s.consent_marketing_versao || null,
          tem_espectro: s.tem_espectro ?? null,
          espectro_qual: s.espectro_qual || null,
          tem_alergia: s.tem_alergia ?? null,
          alergia_qual: s.alergia_qual || null,
          tem_limitacao_fisica: s.tem_limitacao_fisica ?? null,
          limitacao_fisica_qual: s.limitacao_fisica_qual || null,
          observacoes_medicas: s.observacoes_medicas || null,
          familia_id: familiaId,
          visitante: true,
          created_by: req.user?.id || null,
        })
        .select('id')
        .single();
      if (ce) throw ce;
      criancaId = criada.id;
    }
    // Dados informados no pedido acompanham a criança (cria ou atualiza).
    {
      const upd = {};
      if (s.serie) upd.serie = s.serie;
      if (s.necessidade_especial) upd.necessidades_especiais = s.necessidade_especial;
      if (s.consent_marketing != null) {
        upd.consent_marketing = s.consent_marketing;
        upd.consent_marketing_em = s.consent_marketing_em || null;
        upd.consent_marketing_versao = s.consent_marketing_versao || null;
      }
      if (Object.keys(upd).length) await supabase.from('kids_criancas').update(upd).eq('id', criancaId);
    }

    // 2. Cria/garante o vínculo do solicitante como responsável autorizado.
    const { error: ve } = await supabase
      .from('kids_responsaveis')
      .upsert({
        crianca_id: criancaId,
        membro_id: s.solicitante_membro_id,
        parentesco: s.solicitante_parentesco || 'outro',
        autorizado_buscar: true,
      }, { onConflict: 'crianca_id,membro_id' });
    if (ve) {
      const t = traduzErroUmPaiUmaMae(ve);
      if (t) return res.status(t.status).json({ error: t.error });
      throw ve;
    }

    // 3. Marca a solicitação como aprovada.
    const { error: ue } = await supabase
      .from('kids_vinculo_solicitacoes')
      .update({
        status: 'aprovado',
        crianca_criada_id: criancaId,
        decidido_por: req.user?.id || null,
        decidido_por_nome: req.user?.name || req.user?.email || null,
        decidido_em: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', s.id);
    if (ue) throw ue;

    // Avisa o responsável no WhatsApp (no-op até template aprovado/configurado).
    wpp.notificarMembro(s.solicitante_membro_id, 'kids_vinculo', [s.crianca_nome, 'aprovado'])
      .catch((e) => console.warn('[TOTEM-KIDS] vinculo wpp:', e.message));

    res.json({ ok: true, crianca_id: criancaId });
  } catch (e) {
    const t = traduzErroUmPaiUmaMae(e);
    if (t) return res.status(t.status).json({ error: t.error });
    console.error('[TOTEM-KIDS] vinculo-solicitacoes aprovar:', e.message);
    res.status(500).json({ error: 'Erro ao aprovar solicitação' });
  }
});

// POST /vinculo-solicitacoes/:id/rejeitar { motivo } — não cria vínculo
router.post('/vinculo-solicitacoes/:id/rejeitar', authorizeModule('kids', 3), async (req, res) => {
  try {
    const motivo = req.body?.motivo ? String(req.body.motivo).trim() : null;
    const { data: s } = await supabase
      .from('kids_vinculo_solicitacoes')
      .select('id, status, solicitante_membro_id, crianca_nome')
      .eq('id', req.params.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (!s) return res.status(404).json({ error: 'Solicitação não encontrada' });
    if (s.status !== 'pendente') return res.status(409).json({ error: 'Solicitação já decidida' });

    const { error } = await supabase
      .from('kids_vinculo_solicitacoes')
      .update({
        status: 'rejeitado',
        motivo_rejeicao: motivo,
        decidido_por: req.user?.id || null,
        decidido_por_nome: req.user?.name || req.user?.email || null,
        decidido_em: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', s.id);
    if (error) throw error;

    wpp.notificarMembro(s.solicitante_membro_id, 'kids_vinculo', [s.crianca_nome, 'recusado'])
      .catch((e) => console.warn('[TOTEM-KIDS] vinculo wpp:', e.message));

    res.json({ ok: true });
  } catch (e) {
    console.error('[TOTEM-KIDS] vinculo-solicitacoes rejeitar:', e.message);
    res.status(500).json({ error: 'Erro ao rejeitar solicitação' });
  }
});

// ── Voluntariado · inscrições de quem quer servir no KIDS ────────────────────
// Pra a coordenação do Kids (Mariane Gaia / Milena) ver e gerenciar quem se
// inscreveu no voluntariado indicando o Kids (vol_inscricoes.area='kids').
// Só leitura + status leve + contato (WhatsApp na UI). Integrar (com verificação
// de antecedentes · ECA/LGPD) continua no módulo Voluntariado — não bypassa aqui.
router.get('/voluntariado-inscricoes', authorizeModule('kids', 1), async (req, res) => {
  try {
    const status = req.query.status ? String(req.query.status) : null;
    const search = req.query.search ? String(req.query.search).trim() : null;
    let q = supabase.from('vol_inscricoes')
      .select('id, nome_completo, nome, sobrenome, telefone, email, status, ministerios_interesse, dom_predominante, data_inscricao, feedback, integrado_em')
      .eq('area', 'kids')
      .order('data_inscricao', { ascending: false, nullsFirst: false })
      .limit(1000);
    if (status) q = q.eq('status', status);
    if (search) q = q.ilike('nome_completo', `%${search}%`);
    const { data, error } = await q;
    if (error) throw error;
    res.json({ rows: data || [] });
  } catch (e) {
    console.error('[TOTEM-KIDS] voluntariado-inscricoes:', e.message);
    res.status(500).json({ error: 'Erro ao listar inscrições de voluntariado do Kids' });
  }
});

// PATCH · status leve (encaminhar/voltar) + anotação. NÃO aceita 'integrado'
// (a integração exige a triagem de antecedentes, feita no módulo Voluntariado).
const KIDS_VOL_STATUS = ['inscrito', 'enviado_ministerio'];
router.patch('/voluntariado-inscricoes/:id', authorizeModule('kids', 2), async (req, res) => {
  try {
    const { status, feedback } = req.body || {};
    // Só age em inscrição de área kids (trava de escopo).
    const { data: insc } = await supabase.from('vol_inscricoes')
      .select('area').eq('id', req.params.id).maybeSingle();
    if (!insc) return res.status(404).json({ error: 'Inscrição não encontrada.' });
    if (String(insc.area || '').toLowerCase() !== 'kids') {
      return res.status(403).json({ error: 'Esta inscrição não é do Kids.' });
    }
    const patch = { updated_at: new Date().toISOString() };
    if (status !== undefined) {
      if (!KIDS_VOL_STATUS.includes(status)) {
        return res.status(400).json({
          error: 'Integrar exige a verificação de antecedentes — faça isso no módulo Voluntariado.',
          code: 'integrar_no_voluntariado',
        });
      }
      patch.status = status;
      if (status === 'enviado_ministerio') patch.enviado_lider_em = new Date().toISOString();
    }
    if (feedback !== undefined) patch.feedback = feedback ? String(feedback).slice(0, 2000) : null;
    const { data, error } = await supabase.from('vol_inscricoes')
      .update(patch).eq('id', req.params.id).select('*').single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[TOTEM-KIDS] patch voluntariado-inscricoes:', e.message);
    res.status(500).json({ error: 'Erro ao atualizar inscrição' });
  }
});

module.exports = router;
