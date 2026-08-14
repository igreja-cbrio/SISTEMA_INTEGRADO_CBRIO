// ============================================================================
// Formulário PÚBLICO de decisão online · "Eu aceito Jesus"
// ============================================================================
// Link fixado na descricao/chat da live. Quem assiste online e decide preenche
// nome + telefone · o sistema:
//   1. resolve o culto online que esta NO AR agora (janela do horario);
//   2. grava cultos_decisoes_pessoas (tipo='online', fonte='form_publico');
//   3. o trigger fn_cultos_dec_online_form_incrementa soma +1 em
//      cultos.decisoes_online (KPI ONL-13 recalcula em tempo real).
//
// Público · sem auth · usa service_role (bypassa RLS). Monta em /api/public/...
// (já coberto pelo publicLimiter global) + limiter dedicado anti-spam.
// ============================================================================
const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const { supabase } = require('../utils/supabase');
const { findCultoAtual } = require('../services/onlineCollectors');
const { registrarConsentimentos, TEXTOS } = require('../services/inscricaoContrato');

// Quantos dias pra trás aceitamos anexar a decisão de quem assiste o REPLAY.
// Medido em 14/08/2026: nos últimos 120 dias houve culto online em 111 deles,
// com intervalo máximo de 3 dias e NENHUM acima de 7. Ou seja, 7 dias cobre
// 100% dos casos reais e o "não há culto" vira inalcançável na prática.
const DIAS_REPLAY = 7;

// ⚠️ Limiter generoso e o router montado ANTES do publicLimiter estrito (com
// entrada no skip() do global). O teto anterior era 8/min AQUI somado a
// 30/15min por IP lá — e a igreja inteira sai pelo NAT do prédio.
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas · aguarde um instante.' },
});
router.use(limiter);

function soDigitos(s) {
  return String(s || '').replace(/\D/g, '');
}

// Último culto online dos últimos DIAS_REPLAY dias. É o que sustenta o replay:
// quem assiste a gravação na terça decidiu de verdade, e a decisão pertence
// àquela transmissão. Sem isto a única saída seria gravar `culto_id` nulo — e
// aí `tg_cultos_dec_pessoas_to_cuidados` faz `RETURN NEW` e a pessoa NUNCA
// entra na fila pastoral, trocando "decisão perdida" por "decisão registrada e
// abandonada", que é pior porque some do radar.
async function ultimoCultoOnlineRecente() {
  const desde = new Date(Date.now() - 3 * 60 * 60 * 1000 - DIAS_REPLAY * 86400000)
    .toISOString().slice(0, 10);
  const { data } = await supabase
    .from('cultos')
    .select('id, data, vol_service_types!inner(name, has_online)')
    .eq('vol_service_types.has_online', true)
    .gte('data', desde)
    .order('data', { ascending: false })
    .limit(1);
  const c = data?.[0];
  if (!c) return null;
  return { id: c.id, data: c.data, nome: c.vol_service_types?.name || 'Culto' };
}

// Resolve o culto online relacionado agora. Reusa findCultoAtual (janela
// [-30min, +4h] do horario, has_online=true). Com comFallback=true ainda anexa
// ao último culto online do dia no grace pos-live (quem preenche atrasado) e,
// por último, ao último culto online recente (replay).
async function resolverCultoOnline({ comFallback = false } = {}) {
  const culto = await findCultoAtual({ fallbackUltimoDoDia: comFallback });
  if (culto) {
    const st = culto.vol_service_types;
    if (st?.has_online) return { id: culto.id, data: culto.data, nome: st.name || 'Culto' };
  }
  return comFallback ? await ultimoCultoOnlineRecente() : null;
}

// GET /ativo · o frontend pergunta se deve mostrar o form. aoVivo = janela real
// (label "Ao vivo agora"); ativo = janela OU fallback pos-live (form utilizavel).
router.get('/ativo', async (_req, res) => {
  try {
    const aoVivoCulto = await resolverCultoOnline();
    const culto = aoVivoCulto || await resolverCultoOnline({ comFallback: true });
    res.json({ ativo: !!culto, aoVivo: !!aoVivoCulto, culto });
  } catch (e) {
    console.error('[public/decisao-online/ativo]', e.message);
    res.json({ ativo: false, culto: null });
  }
});

// POST / · registra a decisão online
router.post('/', async (req, res) => {
  try {
    const nome = String(req.body?.nome || '').trim();
    const telefone = soDigitos(req.body?.telefone);
    const email = String(req.body?.email || '').trim() || null;
    const aceiteLgpd = req.body?.aceite_lgpd === true;

    if (nome.length < 2) {
      return res.status(400).json({ error: 'Informe seu nome.' });
    }
    // ⚠️ Telefone passa a ser OBRIGATÓRIO (era opcional). O módulo inteiro
    // existe pra fazer o 1º contato em até 3 dias — decisão sem contato é um
    // número no painel e uma pessoa que ninguém alcança.
    if (telefone.length < 10 || telefone.length > 11) {
      return res.status(400).json({ error: 'Informe seu WhatsApp com DDD (10 ou 11 dígitos) para a equipe falar com você.' });
    }
    // ⚠️ Convicção religiosa é dado SENSÍVEL (LGPD art. 11) e a base aqui é
    // consentimento específico — legítimo interesse não alcança. Diferente da
    // porta do voluntário (onde um terceiro transcreve), aqui é a própria
    // pessoa declarando sobre si, então a caixa é dela e não pode vir marcada.
    if (!aceiteLgpd) {
      return res.status(400).json({ error: 'Para registrar, é preciso aceitar o tratamento dos seus dados.' });
    }

    // comFallback · aceita quem preenche logo após o culto (grace pos-live) e
    // quem assiste o REPLAY nos dias seguintes. Nunca descarta a decisão.
    const culto = await resolverCultoOnline({ comFallback: true });
    if (!culto) {
      return res.status(409).json({
        error: 'sem_culto_recente',
        message: 'Não conseguimos registrar agora. Fale com a gente pelo WhatsApp da igreja — sua decisão importa.',
      });
    }

    // ⚠️ Id gerado aqui pra gravar o consentimento ANTES da decisão: falha na
    // gravação da decisão deixa uma linha órfã no ledger (inofensiva), a ordem
    // inversa deixaria dado de pessoa sem prova legal.
    const decisaoId = crypto.randomUUID();

    await registrarConsentimentos({
      porta: 'decisao',
      refId: decisaoId,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      itens: [{ tipo: 'termos_lgpd', aceito: true, texto: TEXTOS.termos_lgpd }],
    });

    const { error } = await supabase.from('cultos_decisoes_pessoas').insert({
      id: decisaoId,
      culto_id: culto.id,
      nome,
      telefone,
      email,
      tipo_decisao: 'online',
      fonte: 'form_publico',
    });
    if (error) throw error;

    res.json({ ok: true, culto: { nome: culto.nome, data: culto.data } });
  } catch (e) {
    console.error('[public/decisao-online POST]', e.message);
    res.status(500).json({ error: 'Não foi possível registrar agora. Tente novamente.' });
  }
});

module.exports = router;
