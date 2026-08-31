// ════════════════════════════════════════════════════════════════════════════
//  Rotas PÚBLICAS da campanha · /api/public/campanhas
//
//  GET  /:slug            - a barrinha de progresso (telas do culto + página)
//  GET  /descadastrar     - tira a pessoa dos e-mails de campanha (1 clique)
//  POST /descadastrar     - o mesmo, para quem preferir confirmar
//
//  ⚠️ SEM LOGIN de propósito: a barrinha vai para as telas laterais do culto e
//  para a página que a igreja compartilha. Ela devolve o MÍNIMO — nome, meta,
//  arrecadado, percentual. Nenhuma lista de doador, nenhum nome, nenhum valor
//  individual: link vaza em print e vira janela para o que estiver do outro lado.
//
//  ⚠️ Montado ANTES do `publicLimiter` global e com limiter próprio: a tela do
//  culto faz polling e a igreja inteira sai por UM IP no Wi-Fi do templo — sob o
//  teto de 30/15min a barrinha congelaria no meio do lançamento.
// ════════════════════════════════════════════════════════════════════════════
const express = require('express');
const { semFalhar } = require('../utils/semFalhar');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { supabase } = require('../utils/supabase');
const { semCache } = require('../middleware/semCache');
const { calcularProgresso, estaNoAr, brl, brlRedondo } = require('../utils/campanhaProgresso');
const { valorComDigito } = require('../utils/digitoCampanha');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.CAMPANHA_PUBLIC_RATE_LIMIT_MAX, 10)
    || (process.env.NODE_ENV === 'production' ? 10000 : 20000),
  message: { error: 'Muitas requisições. Aguarde alguns minutos.' },
  skip: () => process.env.NODE_ENV !== 'production',
  standardHeaders: true,
  legacyHeaders: false,
});
router.use(limiter);

// ⚠️ Router inteiro sem cache: a barrinha é ESTADO e a tela do culto faz polling.
// Servir estado velho ali é dizer "não entrou nada" depois de alguém doar.
router.use(semCache);

/** Hoje em BRT — `toISOString` é UTC e às 21h do Rio o dia já virou. */
function hojeBrt() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

// ── Descadastrar de e-mail de campanha ─────────────────────────────────────
//
// ⚠️ Declarada ANTES de `/:slug`: no Express o primeiro match vence, e
// `/descadastrar` cairia no handler de detalhe como se fosse um slug — a
// armadilha que engoliu `/avaliar` e `/mural` no módulo de Propostas.

async function descadastrar(membroId) {
  const id = String(membroId || '').trim();
  // ⚠️ Resposta NEUTRA sempre: id inválido, inexistente ou já descadastrado
  // devolvem a mesma coisa. Distinguir transformaria o endereço num oráculo de
  // "este uuid é uma pessoa da igreja?".
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: true };
  await semFalhar(supabase.from('mem_membros')
    .update({ email_optout: true, email_optout_em: new Date().toISOString() })
    .eq('id', id).is('deleted_at', null)
    , '[campanha-optout]');
  return { ok: true };
}

router.get('/descadastrar', async (req, res) => {
  await descadastrar(req.query.m);
  // Resposta em HTML porque o destino é um clique no cliente de e-mail.
  res.set('Content-Type', 'text/html; charset=utf-8').send(`<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Pronto</title></head>
<body style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
  max-width:520px;margin:64px auto;padding:0 24px;color:#1a1a1a;line-height:1.6">
<h1 style="font-size:22px;margin:0 0 12px">Pronto, você saiu da lista</h1>
<p style="margin:0 0 12px">Não vamos mais te enviar e-mails de campanha.</p>
<p style="margin:0;font-size:14px;color:#666">Você continua recebendo o que for do
seu cadastro — comprovante de inscrição, recuperação de senha e avisos do que você
mesmo pediu. Se quiser voltar a receber as campanhas, fale com a secretaria.</p>
</body></html>`);
});

router.post('/descadastrar', async (req, res) => {
  await descadastrar(req.body?.membro_id || req.query.m);
  res.json({ ok: true });
});

// ── A barrinha ─────────────────────────────────────────────────────────────

router.get('/:slug', async (req, res) => {
  try {
    const { data: camp, error } = await supabase.from('camp_campanhas')
      .select('id, slug, nome, descricao_curta, descricao, digito, meta_centavos, status, publica, mostrar_valor, aceita_online, video_url, imagem_url, cor_destaque, data_inicio, data_lancamento, data_fim')
      .eq('slug', req.params.slug).is('deleted_at', null).maybeSingle();
    // ⚠️ Falha de consulta NÃO vira 404: "a campanha não existe" e "não conseguimos
    // consultar" levam a decisões opostas — na tela do culto a segunda pede que
    // alguém olhe, e a primeira faria trocarem o cartaz.
    if (error) return res.status(503).json({ error: 'Não foi possível consultar a campanha agora.' });

    const hoje = hojeBrt();
    // ⚠️ Campanha não PÚBLICA responde 404, não 403: quem escaneia o QR não tem
    // nada a ver com o estado interno dela, e 403 confirmaria que o slug existe.
    if (!camp || !camp.publica || !estaNoAr(camp, hoje)) {
      return res.status(404).json({ error: 'Campanha não encontrada' });
    }

    const { data: arr } = await supabase.from('vw_camp_arrecadacao')
      .select('*').eq('campanha_id', camp.id).maybeSingle();
    const p = calcularProgresso(arr || { meta_centavos: camp.meta_centavos });

    // ⚠️ `mostrar_valor = false` OMITE o valor do PAYLOAD, não só da tela. Calar
    // só no front deixa o número no JSON para quem abrir a aba de rede — e a
    // decisão de não publicar o valor é de quem comunica, não decoração.
    const corpo = {
      slug: camp.slug,
      nome: camp.nome,
      descricao_curta: camp.descricao_curta,
      descricao: camp.descricao,
      video_url: camp.video_url,
      imagem_url: camp.imagem_url,
      cor_destaque: camp.cor_destaque,
      data_lancamento: camp.data_lancamento,
      data_fim: camp.data_fim,
      pct: p.pct_barra,
      bateu_meta: p.bateu_meta,
      mostrar_valor: camp.mostrar_valor,
      // ⚠️ O dígito é público de propósito: é a instrução para quem vai transferir
      // do banco. É o único campo "interno" que a barrinha revela, e revelar é o
      // ponto — sem ele a pessoa não sabe como identificar a doação dela.
      digito: camp.digito,
      exemplo_com_digito: camp.digito ? brl(valorComDigito(10000, camp.digito)) : null,
      aceita_online: camp.aceita_online,
    };
    if (camp.mostrar_valor) {
      corpo.arrecadado = brlRedondo(p.total_centavos);
      corpo.meta = brlRedondo(p.meta_centavos);
      corpo.arrecadado_centavos = p.total_centavos;
      corpo.meta_centavos = p.meta_centavos;
    }
    // ⚠️ NUNCA sai daqui: doador, nome, valor individual, quantos deram, nem a
    // fatia "em conciliação" (é conversa interna do financeiro).
    res.json(corpo);
  } catch (e) {
    console.error('[publicCampanha]', e.message);
    res.status(503).json({ error: 'Não foi possível consultar a campanha agora.' });
  }
});

module.exports = router;
