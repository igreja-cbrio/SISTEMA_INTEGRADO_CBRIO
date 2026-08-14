// ============================================================================
// Agente de Voluntariado · API (listas acionáveis + cron)
// ============================================================================

const router = require('express').Router();
const { authenticate, authorizeModule } = require('../middleware/auth');
const { isAuthorizedCron } = require('../utils/cronAuth');
const { analisar, alertar } = require('../services/agenteVoluntariado');
const fila = require('../services/whatsappFila');
const { avisarEscalasDaSemana } = require('../services/escalaAviso');

// Cron (CRON_SECRET) — alerta o coordenador. Também roda no cron diário.
async function cronChecar(req, res) {
  if (!isAuthorizedCron(req)) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const alertas = await alertar();

    // ⚠️ Aviso da semana de CARONA neste cron (14/08/2026), sem slot novo no
    // `vercel.json` — são 46 crons e a lição dos pagamentos é não gastar slot
    // quando dá pra pegar carona. Roda todo dia às 8h10 BRT, então quem for
    // escalado hoje pra um culto dos próximos 7 dias é avisado amanhã cedo.
    //
    // ⚠️ O aviso NÃO pode derrubar o cron: o alerta do coordenador divide esta
    // execução, e uma falha no envio levaria junto o alerta que já funcionava.
    let aviso = null;
    try {
      aviso = await avisarEscalasDaSemana();
    } catch (e) {
      console.error('[agente-voluntariado/cron] aviso de escala falhou:', e.message);
      aviso = { erro: e.message };
    }

    res.json({ ok: true, alertas, aviso });
  } catch (e) {
    console.error('[agente-voluntariado/cron]', e.message);
    res.status(500).json({ error: e.message });
  }
}
router.get('/cron/checar', cronChecar);
router.post('/cron/checar', cronChecar);

// GET / — listas acionáveis (confirmações pendentes c/ wa.me 1-toque, reposições,
// no-shows) pro coordenador. Leitura: voluntariado>=1.
router.get('/', authenticate, authorizeModule('voluntariado', 1), async (_req, res) => {
  try {
    const r = await analisar();
    res.json(r);
  } catch (e) {
    console.error('[agente-voluntariado] analisar:', e.message);
    res.status(500).json({ error: 'Erro ao analisar as escalas' });
  }
});

// ⚠️ Teto da rodada, espelhando a lei do censo (04/08): a conta está em
// TIER_250 (250 destinatários únicos por 24h) e a fila DESISTE 36h depois. Com
// 87 escalas pendentes hoje isto nunca morde — existe pra que o dia em que
// morder seja DECLARADO (`adiados`) em vez de virar lembrete que morre na fila.
const TETO_RODADA = 200;

// POST /lembrar { schedule_ids?: [] } — enfileira o lembrete de escala pelo WhatsApp
// (template `escala_voluntario` · {{1}} ministério {{2}} evento {{3}} quando).
// Sem schedule_ids = lembra TODOS os pendentes com telefone. Escrita: voluntariado>=2.
// No-op gracioso até o template ser aprovado na Meta + WHATSAPP_TEMPLATE_ESCALA setado.
//
// ⚠️⚠️ VAI PELA FILA (`whatsapp_envios`), NÃO por `sendTemplate` em laço.
//
// Isto era um `for` sequencial com `await wpp.sendTemplate` e NENHUM registro do
// que já havia saído. Era inofensivo enquanto o botão nunca aparecia — o agente
// lia telefone só de `vol_profiles.phone`, que está preenchido em 8 de 930
// perfis, então "com telefone" era ZERO. Ao consertar a resolução do telefone
// (services/agenteVoluntariado.js), o mesmo botão passa a alcançar ~59 pessoas
// numa tacada, e aí o laço síncrono vira a armadilha da lei de 04/08:
// cada envio tem timeout de 15s contra um `maxDuration` de 300s, então a função
// pode MORRER NO MEIO — com as mensagens já entregues e nada gravado. A próxima
// tentativa reenviaria pra todo mundo.
//
// A fila resolve por construção: o INSERT do lote acontece ANTES de qualquer
// envio, o cron horário drena com retry/backoff, e falha permanente avisa gente
// (`whatsappFila.avisarFalhaTerminal`). É o funil que todo o resto do sistema
// já usa; este era o único disparo fora dele.
//
// ⚠️ RESÍDUO CONSCIENTE, registrado por não ser óbvio: este disparo segue SEM
// gate de `whatsapp_optin`, exatamente como antes. O template é UTILITY e a
// mensagem é sobre um compromisso que a própria pessoa assumiu, então a Meta não
// exige opt-in aqui — mas quem marcou "não quero receber" vai receber. Ligar o
// gate é decisão de POLÍTICA (do Marcos), não efeito colateral de um conserto de
// leitura, e por isso não foi feito aqui. Se for ligado, o caminho é
// `notificarMembro` (que já lê o opt-in) e não uma segunda régua neste arquivo.
// POST /avisar-semana — o MESMO aviso do cron, sob demanda.
//
// Existe porque o cron roda uma vez por dia (8h10 BRT): quem for escalado
// depois disso, para um culto do próprio dia ou do dia seguinte, só seria
// avisado na rodada seguinte — às vezes depois do culto. A coordenação aperta
// isto e o aviso sai na hora.
//
// ⚠️ É idempotente por construção: quem já foi avisado não recebe de novo (o
// registro é a linha da fila), então apertar duas vezes não duplica nada.
router.post('/avisar-semana', authenticate, authorizeModule('voluntariado', 2), async (req, res) => {
  try {
    const dias = Math.min(14, Math.max(1, parseInt(req.body?.dias, 10) || 7));
    const r = await avisarEscalasDaSemana({ dias });
    res.json(r);
  } catch (e) {
    console.error('[agente-voluntariado] avisar-semana:', e.message);
    res.status(500).json({ error: 'Erro ao avisar os escalados da semana' });
  }
});

router.post('/lembrar', authenticate, authorizeModule('voluntariado', 2), async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.schedule_ids) ? req.body.schedule_ids : null;
    const templateName = process.env.WHATSAPP_TEMPLATE_ESCALA;

    const { confirmacoes_pendentes } = await analisar();
    const alvo = ids ? confirmacoes_pendentes.filter((p) => ids.includes(p.schedule_id)) : confirmacoes_pendentes;

    const comTelefone = alvo.filter((p) => p.telefone);
    const sem_telefone = alvo.length - comTelefone.length;
    const rodada = comTelefone.slice(0, TETO_RODADA);
    const adiados = comTelefone.length - rodada.length;

    // Sem template aprovado NADA sai — e a resposta diz isso em vez de
    // devolver "0 enviados" como se fosse sucesso (lição do disparo do censo:
    // caixa verde para envio que não aconteceu).
    if (!templateName) {
      return res.json({
        total: alvo.length, enfileirados: 0, sem_telefone, adiados,
        template_configurado: false,
        motivo: 'O template de escala ainda não está configurado (WHATSAPP_TEMPLATE_ESCALA) — nenhuma mensagem foi enviada. Lembre-se de que a Vercel só aplica variável de ambiente nova em deployment novo.',
      });
    }

    const r = await fila.enfileirarLote(rodada.map((p) => ({
      telefone: p.telefone,
      template: templateName,
      idioma: 'pt_BR',
      params: [p.funcao || 'Voluntariado', p.servico || 'culto', p.quando || ''],
      // ⚠️ O prefixo do contexto é lido por `utils/whatsappModulo` pra decidir
      // QUEM é avisado quando a entrega falha. `voluntariado` é módulo real e
      // tem regras em `notificacao_regras` — sem isso o aviso cairia no
      // fallback de todos os admin/diretor (lição de 05/08).
      contexto: 'voluntariado.escala_lembrete',
      refId: p.schedule_id,
    })));

    res.json({
      total: alvo.length,
      enfileirados: r.queued || 0,
      sem_telefone,
      adiados,
      template_configurado: true,
      motivo: (r.queued || 0) === 0
        ? (r.motivo === 'disabled'
          ? 'O envio de WhatsApp está desligado (kill-switch) — nenhuma mensagem foi enviada.'
          : 'Nenhuma mensagem foi enfileirada.')
        : null,
    });
  } catch (e) {
    console.error('[agente-voluntariado] lembrar:', e.message);
    res.status(500).json({ error: 'Erro ao enviar lembretes' });
  }
});

module.exports = router;
