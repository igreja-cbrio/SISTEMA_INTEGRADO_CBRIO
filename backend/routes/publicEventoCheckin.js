// ============================================================================
// EVENTO · AUTOATENDIMENTO de check-in (2026-08-28)
//
// A pessoa lê o QR na porta, digita CPF + nascimento, o sistema pergunta
// "você é fulano?" e ela confirma. Rota PÚBLICA — sem login.
//
// ⚠️ Montada ANTES do `publicLimiter` global no server.js, com limiter próprio:
// no evento a igreja inteira sai por UM IP, e o teto de 10/15min do global
// travaria na terceira pessoa. É a lição do censo (04/08) e do NPS.
// ============================================================================

const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { supabase } = require('../utils/supabase');
const { verificarTokenCheckin } = require('../utils/eventoCheckinToken');
const {
  validarEntrada, escolherInscricao, resumoPublico,
} = require('../utils/checkinAutoatendimento');
const { marcarCheckinAuditavel } = require('../services/inscricaoCheckin');

// ⚠️ DOIS BALDES, e é de propósito (censo · 04/08):
//   · o de IP é GENEROSO — a fila inteira sai pelo wi-fi da igreja;
//   · o de BUSCA é o que limita o probing de CPF, e é bem mais apertado.
const limiterGeral = rateLimit({
  windowMs: 15 * 60 * 1000, max: 5000,
  message: { error: 'Muitas requisições. Aguarde alguns instantes.' },
  skip: () => process.env.NODE_ENV !== 'production',
  standardHeaders: true, legacyHeaders: false,
});
const limiterBusca = rateLimit({
  windowMs: 10 * 60 * 1000, max: 300,
  message: { error: 'Muitas tentativas. Procure alguém da equipe na entrada.' },
  skip: () => process.env.NODE_ENV !== 'production',
  standardHeaders: true, legacyHeaders: false,
});
router.use(limiterGeral);

/**
 * Resolve o evento do token e confere que ele ACEITA check-in agora.
 * ⚠️ A validade real é aqui, não no token: desligar `checkin_ativo` mata o QR
 * na hora, que é o freio que a operação entende.
 */
async function eventoDoToken(token) {
  const id = verificarTokenCheckin(token);
  if (!id) return { erro: 'token' };
  const { data: ev, error } = await supabase.from('insc_eventos')
    .select('id, nome, data, hora, local, status, checkin_ativo, tem_sorteio')
    .eq('id', id).is('deleted_at', null).maybeSingle();
  if (error) return { erro: 'infra' };
  if (!ev) return { erro: 'token' };
  if (ev.status !== 'publicado') return { erro: 'fechado', evento: ev };
  if (!ev.checkin_ativo) return { erro: 'fechado', evento: ev };
  return { evento: ev };
}

// ── GET /:token — o que a tela mostra antes de a pessoa digitar ─────────────
// ⚠️ Devolve SÓ o cabeçalho do evento. Nenhuma lista, nenhum contador de
// inscritos: o QR fica na parede e quem passa por ele é público.
router.get('/:token', async (req, res) => {
  try {
    const r = await eventoDoToken(req.params.token);
    if (r.erro === 'infra') return res.status(503).json({ error: 'Não foi possível abrir o check-in agora.' });
    if (r.erro === 'token') return res.status(404).json({ error: 'Este QR não é válido.' });
    if (r.erro === 'fechado') {
      return res.status(409).json({ error: 'O check-in deste evento não está aberto.', motivo: 'fechado' });
    }
    const { evento: e } = r;
    res.json({ evento: { nome: e.nome, data: e.data, hora: e.hora, local: e.local } });
  } catch (e) {
    console.error('[public/evento-checkin] get:', e.message);
    res.status(500).json({ error: 'Erro ao abrir o check-in.' });
  }
});

// ── POST /:token/buscar — CPF + nascimento → "você é fulano?" ───────────────
router.post('/:token/buscar', limiterBusca, async (req, res) => {
  try {
    const r = await eventoDoToken(req.params.token);
    if (r.erro === 'infra') return res.status(503).json({ error: 'Não foi possível consultar agora.' });
    if (r.erro) return res.status(r.erro === 'token' ? 404 : 409).json({ error: 'Check-in indisponível.' });

    const v = validarEntrada(req.body || {});
    if (!v.ok) return res.status(400).json({ error: 'Confira o CPF e a data de nascimento.', motivo: v.motivo });

    const { data, error } = await supabase.from('inscricoes')
      .select('id, nome_completo, data_nascimento, status')
      .eq('evento_id', r.evento.id).eq('cpf', v.cpf).is('deleted_at', null)
      .limit(20);
    if (error) throw error;

    // ⚠️⚠️ RECUSA NEUTRA: "CPF não existe" e "nascimento não confere" respondem
    // A MESMA COISA. Distinguir transformaria a porta num oráculo de
    // CPF → data de nascimento, que é dado que não se recupera depois.
    const vivas = (data || []).filter(i => i.status !== 'cancelada');
    const escolha = escolherInscricao(vivas, v.nascimento);
    if (escolha.situacao === 'ambiguo') {
      return res.status(409).json({
        error: 'Encontramos mais de uma inscrição com esses dados. Procure alguém da equipe na entrada.',
        motivo: 'ambiguo',
      });
    }
    if (escolha.situacao !== 'ok') {
      return res.status(404).json({
        error: 'Não encontramos sua inscrição com esses dados. Confira o CPF e a data, ou procure alguém da equipe.',
        motivo: 'nao_encontrada',
      });
    }

    // já fez check-in? (o resumo precisa disso pra tela não prometer novidade)
    const { data: ja } = await supabase.from('insc_checkins')
      .select('em').eq('inscricao_id', escolha.inscricao.id).maybeSingle();

    res.json({ inscricao: resumoPublico({ ...escolha.inscricao, checkin_em: ja?.em || null }) });
  } catch (e) {
    console.error('[public/evento-checkin] buscar:', e.message);
    res.status(500).json({ error: 'Erro ao procurar sua inscrição.' });
  }
});

// ── POST /:token/confirmar — a pessoa disse "sou eu" ───────────────────────
router.post('/:token/confirmar', limiterBusca, async (req, res) => {
  try {
    const r = await eventoDoToken(req.params.token);
    if (r.erro === 'infra') return res.status(503).json({ error: 'Não foi possível confirmar agora.' });
    if (r.erro) return res.status(r.erro === 'token' ? 404 : 409).json({ error: 'Check-in indisponível.' });

    // ⚠️ O CPF e o nascimento vêm DE NOVO e são reconferidos: o `inscricao_id`
    // sozinho é adivinhável e o passo anterior não deixa sessão. Quem confirma
    // tem de provar de novo — é o mesmo par que abriu a tela.
    const v = validarEntrada(req.body || {});
    if (!v.ok) return res.status(400).json({ error: 'Confira o CPF e a data de nascimento.' });

    const { data, error } = await supabase.from('inscricoes')
      .select('id, nome_completo, data_nascimento, status, numero_sorte')
      .eq('evento_id', r.evento.id).eq('cpf', v.cpf).is('deleted_at', null)
      .limit(20);
    if (error) throw error;
    const vivas = (data || []).filter(i => i.status !== 'cancelada');
    const escolha = escolherInscricao(vivas, v.nascimento);
    if (escolha.situacao !== 'ok') {
      return res.status(404).json({ error: 'Não encontramos sua inscrição com esses dados.' });
    }
    const ins = escolha.inscricao;

    // ⚠️ Pagamento pendente NÃO entra sozinho — liberar quem deve é decisão de
    // gente, e a tela do operador tem o "confirmar mesmo assim" com motivo.
    if (ins.status === 'recebida') {
      return res.status(409).json({
        error: 'Sua inscrição está com o pagamento pendente. Procure alguém da equipe na entrada.',
        motivo: 'pagamento_pendente',
      });
    }

    const marcado = await marcarCheckinAuditavel({
      inscricaoId: ins.id, por: null, modo: 'autoatendimento',
    });

    // ⚠️ O número da sorte sai só AGORA, depois de a pessoa provar quem é e o
    // check-in estar feito — e é dela. Nunca aparece na busca.
    res.json({
      ok: true,
      ja_checkin: !!marcado.ja_checkin,
      primeiro_nome: String(ins.nome_completo || '').trim().split(/\s+/)[0] || '',
      numero_sorte: r.evento.tem_sorteio ? (ins.numero_sorte ?? null) : null,
    });
  } catch (e) {
    console.error('[public/evento-checkin] confirmar:', e.message);
    res.status(500).json({ error: 'Erro ao confirmar o check-in.' });
  }
});

module.exports = router;
