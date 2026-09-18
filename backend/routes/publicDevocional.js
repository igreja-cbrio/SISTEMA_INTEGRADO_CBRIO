/**
 * Rota publica do devocional.
 *
 * Sobrou UMA: `GET /hoje`, o versículo do dia, sem login — igual pra todo
 * mundo e consumido pelo WIDGET iOS do app. O login por magic link saiu em
 * 16/09/2026 junto com as telas web (ver o bloco REM-02 abaixo).
 */

const router = require('express').Router();
const { supabase } = require('../utils/supabase');

// ── POST /api/public/devocional/login — REMOVIDA em 16/09/2026 ────────
// REM-02 da auditoria do banco. A rota mandava um magic link — só que
// `supabase.auth.admin.generateLink()` **gera o link e devolve**, quem envia é
// quem chama, e aqui o `action_link` era descartado (só o `error` era lido).
// Nenhuma função de envio era chamada, e mesmo assim o servidor logava
// “Magic link enviado” e devolvia 200. Quebrado em silêncio.
//
// ⚠⚠ O CONSERTO NÃO FOI FAZER O ENVIO FUNCIONAR: **a porta que ela servia não
// existe mais.** As telas web do devocional (login/hoje/histórico) foram
// removidas quando o devocional migrou pro app — `/devocional` hoje renderiza
// `DevocionalMovido` e as outras duas redirecionam pra ele. A rota ficou órfã,
// e órfã com poder: pública, sem login, **criava auth user e `profiles`** a
// partir de um e-mail que batesse com `mem_membros`.
//
// O que continua vivo é o `GET /hoje` logo abaixo (widget iOS). Conferido
// antes de remover: no app (`targets/widget/widgets.swift:25`) o único endpoint
// público de devocional chamado é `/hoje`; no front, só `src/api.js` declarava
// o cliente do `/login`, sem nenhuma tela chamando.
//
// Se o devocional voltar pro navegador um dia: use `signInWithOtp` (esse envia)
// ou pegue `data.properties.action_link` e mande por `services/email.js`.
// ──────────────────────────────────────────────────────────

// ── GET /api/public/devocional/hoje ──────────────────────────────
// Devocional do dia (planos ativos), SEM auth. Consumido pelo WIDGET
// iOS do app (URLSession no TimelineProvider). Versículo é igual pra
// todos, então pode ser público. Cache de borda 30 min.
router.get('/hoje', async (req, res) => {
  try {
    // Hoje no fuso de Brasília
    const hoje = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());

    const { data, error } = await supabase
      .from('devocional_itens')
      .select('titulo, passagem, passagem_texto, data, devocional_planos!inner(ativo)')
      .eq('devocional_planos.ativo', true)
      .eq('data', hoje)
      .limit(1)
      .maybeSingle();
    if (error) throw error;

    res.set('Cache-Control', 'public, max-age=1800, s-maxage=1800');
    if (!data) {
      return res.json({ tem: false, data: hoje });
    }
    res.json({
      tem: true,
      data: data.data,
      titulo: data.titulo,
      passagem: data.passagem,
      passagem_texto: data.passagem_texto,
    });
  } catch (e) {
    console.error('[PublicDevocional] hoje:', e.message);
    res.status(500).json({ error: 'Erro ao buscar devocional' });
  }
});

module.exports = router;
