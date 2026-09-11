// ============================================================================
// PORTA PÚBLICA · /visitante · "Primeira vez aqui? Ganhe um café" (2026-09-09)
// ============================================================================
// QR nos cartazes da igreja (lounge · banheiro · estacionamento · templo). A
// pessoa preenche nome + WhatsApp + CPF, aceita a LGPD e (opcional) o opt-in
// do WhatsApp. O sistema:
//   1. resolve o culto que ela está vivendo (régua `services/cultoDeAgora`);
//   2. grava o consentimento ANTES (id pré-gerado · padrão da porta de decisão);
//   3. resolve/cria a PESSOA pelo matcher canônico (`fn_link_or_create_membro`,
//      status 'visitante' · Contrato de porta);
//   4. grava a visita em `vis_visitas` com o VOUCHER (1 por CPF, na vida);
//   5. a pesquisa de satisfação sai DEPOIS do culto, pela fila (ver
//      services/visitantePesquisa.js) — não daqui.
//
// ⚠️ NÃO é decisão de fé: nada entra em cultos_decisoes_pessoas nem em
// cui_convertidos (denominador da NSM). Ver o cabeçalho da migration
// 20260909120000.
//
// Público · sem auth · service_role. Montado ANTES do publicLimiter estrito e
// no skip() do limiter global: no culto a igreja inteira sai por 1 IP (NAT).
// ============================================================================
const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const { supabase } = require('../utils/supabase');
const { cultoDeAgora } = require('../services/cultoDeAgora');
const { registrarConsentimentos, TEXTOS } = require('../services/inscricaoContrato');
const {
  LOCAIS, validarVisitante, gerarCodigoVoucher, normalizarNota, primeiroNome,
} = require('../utils/visitanteRegras');
const { verificarTokenPesquisa } = require('../utils/visitanteToken');

// Generoso: dezenas de pessoas no mesmo WiFi. Só a submissão é um pouco mais
// contida (60/min) — probing de CPF não existe aqui (a resposta nunca devolve
// dado de terceiro).
const limiterLeitura = rateLimit({
  windowMs: 60 * 1000, max: 600, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Muitas tentativas · aguarde um instante.' },
});
const limiterEscrita = rateLimit({
  windowMs: 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Muitas tentativas · aguarde um instante.' },
});

const TEXTO_LGPD_VISITANTE =
  'Autorizo a Igreja CBRio a guardar meu nome, CPF e WhatsApp para registrar ' +
  'minha visita, entregar o voucher da cafeteria e para que a equipe de ' +
  'integração fale comigo, conforme a LGPD. O CPF é usado só para não emitir ' +
  'o voucher duas vezes. Posso pedir acesso, correção ou exclusão dos meus ' +
  'dados a qualquer momento pelos canais da igreja.';

const TEXTO_OPTIN_VISITANTE =
  'Aceito receber, pelo WhatsApp informado, uma pesquisa rápida de satisfação ' +
  'sobre o culto de hoje e mensagens da equipe de integração. Posso pedir ' +
  'para parar a qualquer momento.';

/** Voucher único entre os vivos: tenta até 5 códigos (colisão é improvável · 32^6). */
async function codigoVoucherLivre() {
  for (let i = 0; i < 5; i++) {
    const cod = gerarCodigoVoucher();
    const { data } = await supabase.from('vis_visitas')
      .select('id').eq('voucher_codigo', cod).is('deleted_at', null).limit(1);
    if (!data?.length) return cod;
  }
  return null;
}

// GET /contexto?local= · o que a tela mostra antes de a pessoa digitar
router.get('/contexto', limiterLeitura, async (req, res) => {
  try {
    const local = LOCAIS.find((l) => l.id === String(req.query.local || '').toLowerCase()) || null;
    let culto = null, aoVivo = false;
    try {
      const r = await cultoDeAgora();
      culto = r.culto ? { id: r.culto.id, nome: r.culto.nome, data: r.culto.data } : null;
      aoVivo = !!r.ao_vivo;
    } catch (e) {
      console.warn('[public/visitante/contexto] culto indisponível:', e.message);
    }
    res.json({
      ok: true,
      local: local ? { id: local.id, nome: local.nome, chamada: local.chamada } : null,
      culto, ao_vivo: aoVivo,
      textos: { lgpd: TEXTO_LGPD_VISITANTE, whatsapp: TEXTO_OPTIN_VISITANTE },
    });
  } catch (e) {
    console.error('[public/visitante/contexto]', e.message);
    // A tela funciona sem contexto: o registro não depende disto.
    res.json({ ok: false, local: null, culto: null, ao_vivo: false,
      textos: { lgpd: TEXTO_LGPD_VISITANTE, whatsapp: TEXTO_OPTIN_VISITANTE } });
  }
});

// POST / · registra a visita e emite (ou não) o voucher
router.post('/', limiterEscrita, async (req, res) => {
  try {
    // ⚠️ Régua PURA no gate (utils/visitanteRegras). O formulário valida antes,
    // mas quem MANDA é aqui — payload é do cliente.
    const v = validarVisitante(req.body);
    if (!v.ok) return res.status(400).json({ error: v.erro, campo: v.campo });
    const { nome, telefone, cpf, whatsapp_optin, local } = v.valores;

    // ── culto de agora (best-effort · a visita vale sem culto) ──────────────
    let culto = null;
    try { culto = (await cultoDeAgora()).culto || null; } catch (e) {
      console.warn('[public/visitante] culto indisponível:', e.message);
    }

    // ── idempotência de quiosque: mesmo CPF hoje (BRT) devolve a MESMA visita ──
    // Toque duplo, refresh no meio, ou a pessoa reescaneando o QR de outro
    // cartaz não pode virar 2 visitas nem 2 vouchers.
    const hojeBrtIni = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
    const inicioDiaUtc = new Date(`${hojeBrtIni}T03:00:00Z`).toISOString();
    const { data: hoje, error: eHoje } = await supabase.from('vis_visitas')
      .select('id, voucher_codigo, voucher_status, culto_nome, culto_data, nome')
      .eq('cpf', cpf).is('deleted_at', null).gte('created_at', inicioDiaUtc)
      .order('created_at', { ascending: false }).limit(1);
    if (eHoje) console.error('[public/visitante] dedup do dia falhou:', eHoje.message);
    if (hoje?.length) {
      const j = hoje[0];
      return res.json({
        ok: true, repetida_hoje: true, visita_id: j.id, nome: primeiroNome(j.nome),
        voucher: { codigo: j.voucher_codigo, status: j.voucher_status },
        culto: j.culto_nome ? { nome: j.culto_nome, data: j.culto_data } : null,
      });
    }

    // ── "só pra não pegar duas vezes": voucher é 1 por CPF, na vida ─────────
    const { data: anterior, error: eAnt } = await supabase.from('vis_visitas')
      .select('id').eq('cpf', cpf).is('deleted_at', null)
      .in('voucher_status', ['emitido', 'resgatado']).limit(1);
    if (eAnt) throw eAnt;
    const jaGanhou = !!anterior?.length;

    // ── consentimento ANTES da escrita (id pré-gerado · órfão é inofensivo) ──
    const visitaId = crypto.randomUUID();
    await registrarConsentimentos({
      porta: 'visitante', refId: visitaId, ip: req.ip, userAgent: req.get('user-agent'),
      itens: [
        { tipo: 'termos_lgpd', aceito: true, texto: TEXTO_LGPD_VISITANTE },
        // gravado MESMO quando diz não — é a prova de que a pergunta foi feita
        { tipo: 'whatsapp', aceito: whatsapp_optin, texto: TEXTO_OPTIN_VISITANTE || TEXTOS.whatsapp },
      ],
    });

    // ── a PESSOA nasce pelo matcher canônico (CPF é chave forte) ───────────
    let membroId = null;
    try {
      const { data, error } = await supabase.rpc('fn_link_or_create_membro', {
        p_cpf: cpf, p_telefone: telefone, p_email: null, p_nome: nome,
        p_status_inicial: 'visitante', p_fonte: 'visitante_qr',
      });
      if (error) throw error;
      membroId = data || null;
    } catch (e) {
      // A visita e o voucher NÃO dependem do vínculo: a pessoa está no hall
      // esperando o código. O membro_id fica nulo e a tela de Visitantes declara.
      console.error('[public/visitante] matcher falhou:', e.message);
    }

    // opt-in do WhatsApp no cadastro · SÓ LIGA, nunca desliga (lei de 05/08)
    if (membroId && whatsapp_optin) {
      await supabase.from('mem_membros')
        .update({ whatsapp_optin: true, whatsapp_optin_em: new Date().toISOString() })
        .eq('id', membroId).or('whatsapp_optin.is.null,whatsapp_optin.eq.false')
        .then(() => {}, (e) => console.warn('[public/visitante] optin:', e.message));
    }

    const voucherCodigo = jaGanhou ? null : await codigoVoucherLivre();
    const voucherStatus = jaGanhou ? 'repetido' : 'emitido';

    const { data: criada, error } = await supabase.from('vis_visitas').insert({
      id: visitaId,
      membro_id: membroId,
      culto_id: culto?.id || null,
      culto_nome: culto?.nome || null,
      culto_data: culto?.data || null,
      nome, telefone, cpf, local,
      voucher_codigo: voucherCodigo,
      voucher_status: voucherStatus,
      whatsapp_optin,
      pesquisa_status: whatsapp_optin ? 'pendente' : 'sem_optin',
      ip_origem: req.ip || null,
      user_agent: String(req.get('user-agent') || '').slice(0, 300) || null,
    }).select('id').maybeSingle();
    if (error) throw error;

    res.json({
      ok: true, repetida_hoje: false, visita_id: criada?.id || visitaId, nome: primeiroNome(nome),
      voucher: { codigo: voucherCodigo, status: voucherStatus },
      culto: culto ? { nome: culto.nome, data: culto.data } : null,
      pesquisa: whatsapp_optin ? 'depois_do_culto' : 'sem_optin',
    });
  } catch (e) {
    console.error('[public/visitante POST]', e.message);
    res.status(500).json({ error: 'Não foi possível registrar agora. Tente novamente ou procure alguém da equipe.' });
  }
});

// ── pesquisa de satisfação · link assinado que chega no WhatsApp ────────────
function visitaDoToken(token) {
  return verificarTokenPesquisa(token);
}

// GET /avaliar/:token · o mínimo pra tela montar (1º nome + culto)
router.get('/avaliar/:token', limiterLeitura, async (req, res) => {
  try {
    const id = visitaDoToken(req.params.token);
    // Recusa NEUTRA: token malformado e visita inexistente respondem igual.
    if (!id) return res.status(404).json({ error: 'Link inválido.' });
    const { data, error } = await supabase.from('vis_visitas')
      .select('id, nome, culto_nome, culto_data, pesquisa_nota, pesquisa_respondida_em, pesquisa_comentario')
      .eq('id', id).is('deleted_at', null).maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Link inválido.' });
    res.json({
      ok: true,
      nome: primeiroNome(data.nome),
      culto: data.culto_nome ? { nome: data.culto_nome, data: data.culto_data } : null,
      ja_respondida: !!data.pesquisa_respondida_em,
      nota: data.pesquisa_nota,
      // A tela usa isto pra não oferecer o campo de comentário duas vezes.
      // ⚠️ O TEXTO do comentário NÃO sai daqui — o link pode ter sido
      // encaminhado, e devolver o que a pessoa escreveu seria vazá-lo.
      tem_comentario: !!data.pesquisa_comentario,
    });
  } catch (e) {
    console.error('[public/visitante/avaliar GET]', e.message);
    res.status(500).json({ error: 'Não foi possível carregar a pesquisa.' });
  }
});

// POST /avaliar/:token · DOIS usos, de propósito (desenho de 11/09/2026):
//   · { nota: 1..5, comentario? } → a resposta. Vale UMA vez.
//   · { comentario } SEM nota     → acrescenta o comentário DEPOIS, porque a
//     tela envia a nota no primeiro toque e só então oferece o campo.
// ⚠️ Comentário SEM resposta anterior é RECUSADO: visita com texto e sem nota
// não é resposta de pesquisa, é texto solto que ninguém sabe ler.
router.post('/avaliar/:token', limiterEscrita, async (req, res) => {
  try {
    const id = visitaDoToken(req.params.token);
    if (!id) return res.status(404).json({ error: 'Link inválido.' });
    const nota = normalizarNota(req.body?.nota);
    const comentario = String(req.body?.comentario || '').trim().slice(0, 1000) || null;

    // ── 2º passo: só o comentário, sobre uma resposta que JÁ existe ──
    if (!nota) {
      if (!comentario) return res.status(400).json({ error: 'Escolha uma carinha.', campo: 'nota' });
      // Condicionado nos dois lados: exige resposta dada e comentário ainda
      // vazio. Reenvio do mesmo formulário não sobrescreve o que já veio.
      const { data: com, error: errCom } = await supabase.from('vis_visitas')
        .update({ pesquisa_comentario: comentario })
        .eq('id', id).is('deleted_at', null)
        .not('pesquisa_respondida_em', 'is', null).is('pesquisa_comentario', null)
        .select('id');
      if (errCom) throw errCom;
      // Nada atualizado = ou não respondeu ainda, ou já tinha comentário.
      // Nos dois casos a resposta é a mesma, e é honesta: não há o que fazer.
      return res.json({ ok: true, comentario_gravado: !!com?.length });
    }

    // UPDATE condicionado: a 1ª resposta vale; a 2ª não sobrescreve.
    const { data, error } = await supabase.from('vis_visitas')
      .update({ pesquisa_nota: nota, pesquisa_comentario: comentario,
        pesquisa_respondida_em: new Date().toISOString(), pesquisa_status: 'respondida' })
      .eq('id', id).is('deleted_at', null).is('pesquisa_respondida_em', null)
      .select('id');
    if (error) throw error;
    if (!data?.length) {
      const { data: ja } = await supabase.from('vis_visitas')
        .select('id, pesquisa_respondida_em').eq('id', id).is('deleted_at', null).maybeSingle();
      if (!ja) return res.status(404).json({ error: 'Link inválido.' });
      return res.json({ ok: true, ja_respondida: true });
    }
    res.json({ ok: true, ja_respondida: false });
  } catch (e) {
    console.error('[public/visitante/avaliar POST]', e.message);
    res.status(500).json({ error: 'Não foi possível enviar agora. Tente novamente.' });
  }
});

module.exports = router;
module.exports.TEXTO_LGPD_VISITANTE = TEXTO_LGPD_VISITANTE;
module.exports.TEXTO_OPTIN_VISITANTE = TEXTO_OPTIN_VISITANTE;
