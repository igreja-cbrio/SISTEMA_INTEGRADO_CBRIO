// Módulo Comunicação (WhatsApp central) · C3 — backend das entidades centrais.
//   /numeros        · números de envio (V1 = 1 · remetente por param no waSender)
//   /templates      · espelho do catálogo da Meta (+ sync + seed dos envs)
//   /agendamentos   · programadas/recorrência (cron varredor em /cron/agendamentos)
//   /atendentes     · quem atende o chat (áreas + escala/horário)
//   /tarifas        · tarifa por categoria (custo estimado)
//   /envios         · HISTÓRICO CENTRAL da fila (todos os módulos · pós C0-C2)
//   /erros          · falhas terminais + statuses failed + órfãos
// UI chega no C4; aqui é a fundação. Guard: módulo 'comunicacao'
// (matriz seedada da de 'conversas' na migration).
const router = require('express').Router();
const { authenticate, authorizeModule } = require('../middleware/auth');
const { requireCron } = require('../utils/cronAuth');
const { supabase } = require('../utils/supabase');
const { sincronizarComMeta, seedDosEnvs } = require('../services/waTemplates');
const { enfileirarLote } = require('../services/whatsappFila');
const { AppError, ERROR_CODES } = require('../utils/appError');
const { captureHandledException } = require('../utils/sentry');

function communicationError(error, publicMessage) {
  return new AppError(error?.message || publicMessage, {
    code: ERROR_CODES.COMMUNICATION_OPERATION_FAILED,
    publicMessage,
    cause: error,
    isOperational: false,
  });
}


// Cron público (CRON_SECRET) declarado ANTES do authenticate.
// Varredor das programadas: dispara agendamentos vencidos (único ou recorrente).
router.get('/cron/agendamentos', requireCron, async (req, res, next) => {
  try {
    const agora = new Date(Date.now() - 3 * 3600 * 1000); // BRT
    const hojeISO = agora.toISOString().slice(0, 10);
    const horaAtual = agora.getUTCHours();
    const diaSemana = agora.getUTCDay();
    const diaMes = agora.getUTCDate();

    const { data: ativos, error: errAtivos } = await supabase.from('wa_agendamentos')
      .select('*').eq('ativo', true).order('created_at', { ascending: true }).limit(200);
    if (errAtivos) {
      // Falha de consulta NÃO é "zero agendamentos" — responder ok esconderia
      // um cron morto (lição do cerebroSync).
      console.error('[comunicacao] cron agendamentos query:', errAtivos.message);
      return res.status(500).json({ error: 'Falha ao consultar os agendamentos' });
    }

    let disparados = 0;
    const resultados = [];
    for (const a of ativos || []) {
      try {
        let deve = false;
        if (a.quando) {
          // Disparo único: venceu e ainda não saiu
          deve = !a.ultimo_disparo && new Date(a.quando) <= new Date();
        } else if (a.recorrencia) {
          // Recorrente: casa dia + hora (janela da hora corrente) e não saiu hoje
          const horaAg = a.hora ? parseInt(String(a.hora).slice(0, 2), 10) : 9;
          const jaHoje = a.ultimo_disparo && String(new Date(new Date(a.ultimo_disparo).getTime() - 3 * 3600 * 1000).toISOString()).slice(0, 10) === hojeISO;
          const casaDia = a.recorrencia === 'diaria'
            || (a.recorrencia === 'semanal' && a.dia_semana === diaSemana)
            || (a.recorrencia === 'mensal' && a.dia_mes === diaMes);
          deve = casaDia && horaAtual >= horaAg && !jaHoje;
        }
        if (!deve) continue;

        // V1: audiência salva de telefones ({tipo:'telefones', telefones:[...]})
        const telefones = a.audiencia?.tipo === 'telefones' ? (a.audiencia.telefones || []) : [];
        if (!telefones.length) { resultados.push({ id: a.id, pulado: 'audiencia_vazia' }); continue; }

        const itens = telefones.map((tel) => ({
          telefone: tel,
          template: a.template_nome || undefined,
          texto: a.texto || undefined,
          params: Array.isArray(a.params) ? a.params : [],
          contexto: `comunicacao.agendamento`,
          refId: a.id,
        }));
        const r = await enfileirarLote(itens);
        // Só consome o disparo se ALGO entrou na fila. Antes, com o kill-switch
        // WHATSAPP_ENABLED desligado, enfileirarLote devolvia queued=0 e mesmo
        // assim o agendamento era marcado como disparado (único até se
        // auto-desativava) — a mensagem sumia sem rastro.
        if (!r.queued) {
          resultados.push({ id: a.id, nome: a.nome, pulado: r.motivo || 'nada_enfileirado' });
          continue;
        }
        await supabase.from('wa_agendamentos')
          .update({ ultimo_disparo: new Date().toISOString(), ...(a.quando ? { ativo: false } : {}) })
          .eq('id', a.id);
        disparados += 1;
        resultados.push({ id: a.id, nome: a.nome, enfileirados: r.queued });
      } catch (e) {
        console.error('[comunicacao] agendamento %s:', a.id, e.message);
        captureHandledException(communicationError(e, 'Erro ao processar agendamento.'), req, 'communication.schedule.item');
        resultados.push({ id: a.id, erro: 'falha_no_agendamento', request_id: req.requestId });
      }
    }
    // Sincronização HORÁRIA do espelho de templates (14/08): a trava de
    // template rejeitado da fila e a aba Templates dependem do espelho estar
    // fresco — em 14/08 ele estava 2 semanas velho (v2 dos grupos como PENDING
    // e 2 templates nem constavam). Best-effort: sem token de management, a
    // própria função devolve o erro e nada quebra.
    const sync_templates = await sincronizarComMeta().catch((e) => ({ sincronizados: 0, erro: e.message }));
    if (sync_templates?.erro) console.warn('[comunicacao] sync templates (cron):', sync_templates.erro);

    // Reconciliação dos recibos ÓRFÃOS (1×/hora, carona neste cron): recibo
    // que chegou antes de a fila gravar o message_id agora CASA em vez de
    // ficar órfão pra sempre; órfão >60d sem dono é descartado (declarado).
    const orfaos_reconciliados = await require('../services/waStatusReconcile')
      .reconciliarStatusOrfaos().catch((e) => ({ ok: false, erro: e.message }));
    if (orfaos_reconciliados && orfaos_reconciliados.ok === false) {
      console.error('[comunicacao] reconciliar órfãos:', orfaos_reconciliados.erro);
    }

    // Faxina diária da mídia do inbox (retenção · decisão do Marcos 12/08:
    // "acaba vindo muito lixo"). Pega carona neste cron HORÁRIO de propósito —
    // o vercel.json já tem 45 crons e slot novo é risco (lição dos pagamentos).
    // Roda 1×/dia na janela das 4h BRT (o cron dispara a cada hora no :05).
    let faxina_midia = null;
    if (horaAtual === 4) {
      faxina_midia = await require('../services/waInbox').limparMidiasAntigas()
        .catch((e) => ({ ok: false, erro: e.message }));
      if (faxina_midia && faxina_midia.ok === false) {
        console.error('[comunicacao] faxina de mídia:', faxina_midia.erro);
      }
    }

    // ── CAMPANHAS · de carona neste cron HORÁRIO (27/08) ────────────────────
    //
    // ⚠️ Sem slot novo no `vercel.json`: a Vercel está com 46 crons e o teto do
    // plano é apertado. Este é o cron horário da Comunicação, e disparo de
    // campanha É comunicação — é o host certo, não um atalho.
    //
    // ⚠️⚠️ CADA BLOCO É PROTEGIDO. Falhar no disparo da campanha NÃO pode
    // derrubar o agendamento do WhatsApp, o sync de templates nem a
    // reconciliação de recibos, que são o trabalho principal deste cron. É a
    // mesma régua da abertura automática de turmas do Next.
    let campanha_semanal = null;
    let campanha_disparos = null;
    let campanha_agradecimentos = null;
    try {
      const campanhas = require('./campanhas');

      // Segunda-feira: garante o "pocket" semanal da campanha (o resumo do
      // domingo, com o link do vídeo e o CTA). A criação é idempotente pela
      // semana ISO, então rodar 24× na segunda cria UM disparo.
      if (diaSemana === 1) {
        const { data: ativas } = await supabase.from('camp_campanhas')
          .select('id').eq('status', 'ativa').is('deleted_at', null);
        const criados = [];
        for (const c of ativas || []) {
          criados.push(await campanhas.garantirSemanal(c.id).catch((e) => ({ erro: e.message })));
        }
        campanha_semanal = criados;
      }

      // Envia o que está agendado e vencido, com orçamento de tempo: o que não
      // couber fica pendente e sai na próxima hora (o snapshot por destinatário
      // é o que faz a retomada não duplicar ninguém).
      campanha_disparos = await campanhas.enviarPendentes({ budgetMs: 120000 });

      // Agradecimento ao doador: reativo, de hora em hora.
      campanha_agradecimentos = await campanhas.rodarAgradecimentos({ limite: 40 });
    } catch (e) {
      console.error('[comunicacao] campanhas (carona no cron):', e.message);
      campanha_disparos = { erro: e.message };
    }

    res.json({
      ok: true, disparados, resultados, orfaos_reconciliados,
      ...(faxina_midia ? { faxina_midia } : {}),
      ...(campanha_semanal ? { campanha_semanal } : {}),
      ...(campanha_disparos ? { campanha_disparos } : {}),
      ...(campanha_agradecimentos ? { campanha_agradecimentos } : {}),
    });
  } catch (e) {
    console.error('[comunicacao] cron agendamentos:', e.message);
    next(communicationError(e, 'Erro no cron de agendamentos.'));
  }
});

// Leitura = nível 1 (front, menu e RLS da migration 20260728230000 já assumem
// isso; o default 2 do middleware deixava as 9 abas em 403 pra quem tem nível 1).
// As escritas seguem com guard próprio por rota (3/4/5).
router.use(authenticate, authorizeModule('comunicacao', 1));

// ── Números ──────────────────────────────────────────────────────────
router.get('/numeros', async (_req, res) => {
  const { data, error } = await supabase.from('wa_numeros').select('*').order('created_at');
  if (error) return res.status(400).json({ error: error.message });
  // Sem cadastro ainda → mostra o número da env como "não cadastrado" (transição)
  res.json({ numeros: data || [], env_phone_number_id: process.env.WHATSAPP_PHONE_NUMBER_ID || null });
});

// Sugestão de resposta para "quando é o meu grupo?" — as 4 conversas reais de
// 25/08 (Ana Cristina, Jessica, Thalya e o 98633-5326) eram a MESMA pergunta.
//
// ⚠️ É SUGESTÃO, não envio: devolve texto para o atendente revisar e mandar. A
// lei de 12/08 ("não quero bot; será apenas atendimento humanizado") continua
// valendo, e é ela que permite a régua ser generosa — errar aqui custa uma
// sugestão recusada, não uma mensagem errada em nome da igreja.
// ⚠️ Nível 1 (o mesmo que abre a aba): quem lê a conversa pode ver a sugestão.
router.get('/conversas/:id/sugestao-grupo', async (req, res) => {
  try {
    const r = await require('../services/sugestaoGrupoAgenda').sugerirAgenda(req.params.id);
    res.json(r);
  } catch (e) {
    // ⚠️ 500 com motivo, nunca `{disponivel:false}`: "não há sugestão" e "a
    // consulta falhou" levam a decisões opostas na tela.
    console.error('[comunicacao] sugestao-grupo:', e.message);
    res.status(500).json({ error: 'Erro ao montar a sugestão', detalhe: e.message });
  }
});

router.post('/numeros', authorizeModule('comunicacao', 5), async (req, res) => {
  const b = req.body || {};
  if (!b.phone_number_id) return res.status(400).json({ error: 'phone_number_id obrigatório' });
  const { data, error } = await supabase.from('wa_numeros')
    .insert({
      phone_number_id: String(b.phone_number_id).trim(),
      rotulo: b.rotulo || null,
      waba_id: b.waba_id || process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || null,
      is_default: b.is_default !== false, // 1º número cadastrado tende a ser o default
    }).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

router.put('/numeros/:id', authorizeModule('comunicacao', 5), async (req, res) => {
  const b = req.body || {};
  const patch = {};
  ['rotulo', 'waba_id', 'is_default', 'ativo'].forEach(k => { if (k in b) patch[k] = b[k]; });
  const { data, error } = await supabase.from('wa_numeros')
    .update(patch).eq('id', req.params.id).select().maybeSingle();
  if (error) return res.status(400).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Número não encontrado' });
  res.json(data);
});

// ── Templates ────────────────────────────────────────────────────────
router.get('/templates', async (req, res) => {
  let q = supabase.from('wa_templates').select('*').order('nome');
  if (req.query.modulo) q = q.eq('modulo', String(req.query.modulo));
  if (req.query.status) q = q.eq('status_meta', String(req.query.status).toUpperCase());
  const { data, error } = await q;
  if (error) return res.status(400).json({ error: error.message });
  res.json(data || []);
});

// Sincroniza com o catálogo da Meta + marca donos dos envs legados
router.post('/templates/sync', authorizeModule('comunicacao', 3), async (_req, res) => {
  const meta = await sincronizarComMeta();
  const seed = await seedDosEnvs();
  res.json({ ...meta, ...seed });
});

router.put('/templates/:id', authorizeModule('comunicacao', 3), async (req, res) => {
  const b = req.body || {};
  const patch = {};
  // 'categoria' é editável à mão (fallback quando o sync com a Meta não traz —
  // ex.: token sem whatsapp_business_management) · o custo (C5) usa ela.
  ['modulo', 'ativo', 'exemplo', 'categoria'].forEach(k => { if (k in b) patch[k] = b[k]; });
  if ('categoria' in patch && patch.categoria) patch.categoria = String(patch.categoria).toLowerCase();
  const { data, error } = await supabase.from('wa_templates')
    .update(patch).eq('id', req.params.id).select().maybeSingle();
  if (error) return res.status(400).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Template não encontrado' });
  res.json(data);
});

// ── Agendamentos (programadas) ───────────────────────────────────────
router.get('/agendamentos', async (_req, res) => {
  const { data, error } = await supabase.from('wa_agendamentos')
    .select('*').order('created_at', { ascending: false }).limit(200);
  if (error) return res.status(400).json({ error: error.message });
  res.json(data || []);
});

function validarAgendamento(b) {
  if (!b.nome || !String(b.nome).trim()) return 'Nome obrigatório';
  if (!b.template_nome && !b.texto) return 'Informe o template ou o texto';
  if (!b.quando && !b.recorrencia) return 'Informe a data única ou a recorrência';
  if (b.recorrencia === 'semanal' && (b.dia_semana == null)) return 'Recorrência semanal exige o dia da semana';
  if (b.recorrencia === 'mensal' && (b.dia_mes == null)) return 'Recorrência mensal exige o dia do mês';
  const tel = b.audiencia?.telefones;
  if (b.audiencia?.tipo !== 'telefones' || !Array.isArray(tel) || tel.length === 0) {
    return 'Audiência (lista de telefones) obrigatória';
  }
  if (tel.length > 500) return 'Audiência acima de 500 telefones — divida o disparo';
  return null;
}

router.post('/agendamentos', authorizeModule('comunicacao', 3), async (req, res) => {
  const b = req.body || {};
  const erro = validarAgendamento(b);
  if (erro) return res.status(400).json({ error: erro });
  const { data, error } = await supabase.from('wa_agendamentos')
    .insert({
      nome: String(b.nome).trim(),
      template_nome: b.template_nome || null,
      texto: b.texto || null,
      params: Array.isArray(b.params) ? b.params : [],
      audiencia: b.audiencia,
      quando: b.quando || null,
      recorrencia: b.recorrencia || null,
      dia_semana: b.dia_semana ?? null,
      dia_mes: b.dia_mes ?? null,
      hora: b.hora || null,
      criado_por: req.user?.id || null,
    }).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

router.put('/agendamentos/:id', authorizeModule('comunicacao', 3), async (req, res) => {
  const b = req.body || {};
  const patch = {};
  ['nome', 'template_nome', 'texto', 'params', 'audiencia', 'quando', 'recorrencia', 'dia_semana', 'dia_mes', 'hora', 'ativo']
    .forEach(k => { if (k in b) patch[k] = b[k]; });

  const { data: atual, error: errAtual } = await supabase.from('wa_agendamentos')
    .select('*').eq('id', req.params.id).maybeSingle();
  if (errAtual) return res.status(400).json({ error: errAtual.message });
  if (!atual) return res.status(404).json({ error: 'Agendamento não encontrado' });

  // Edição passa pela MESMA régua da criação — o teto de 500 telefones e a
  // coerência dia×recorrência só valiam no POST (criar com 10 e editar colando
  // 600 salvava sem erro e o cron disparava pros 600). Valida o estado FINAL.
  const erro = validarAgendamento({ ...atual, ...patch });
  if (erro) return res.status(400).json({ error: erro });

  // Reagendar um disparo ÚNICO já executado precisa voltar a disparar: o cron
  // exige ultimo_disparo NULO pra única, e a coluna não era limpável por
  // nenhum caminho — reagendar+reativar mostrava "ativa" e ficava mudo pra
  // sempre. Trocar a data (quando) zera o marcador; recorrente NÃO zera
  // (zeraria o "já saiu hoje" e dispararia 2× no mesmo dia).
  if ('quando' in patch && patch.quando) patch.ultimo_disparo = null;

  const { data, error } = await supabase.from('wa_agendamentos')
    .update(patch).eq('id', req.params.id).select().maybeSingle();
  if (error) return res.status(400).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Agendamento não encontrado' });
  res.json(data);
});

router.delete('/agendamentos/:id', authorizeModule('comunicacao', 4), async (req, res) => {
  const { error } = await supabase.from('wa_agendamentos').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});

// ── Atendentes ───────────────────────────────────────────────────────
router.get('/atendentes', async (_req, res) => {
  const { data, error } = await supabase.from('wa_atendentes')
    .select('*, profile:profile_id(id, name, email)').order('created_at');
  if (error) return res.status(400).json({ error: error.message });
  res.json(data || []);
});

router.post('/atendentes', authorizeModule('comunicacao', 3), async (req, res) => {
  const b = req.body || {};
  if (!b.profile_id) return res.status(400).json({ error: 'profile_id obrigatório' });
  const { data, error } = await supabase.from('wa_atendentes')
    .insert({
      profile_id: b.profile_id,
      areas: Array.isArray(b.areas) ? b.areas : [],
      horarios: Array.isArray(b.horarios) ? b.horarios : [],
    }).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

router.put('/atendentes/:id', authorizeModule('comunicacao', 3), async (req, res) => {
  const b = req.body || {};
  const patch = {};
  ['areas', 'horarios', 'ativo'].forEach(k => { if (k in b) patch[k] = b[k]; });
  const { data, error } = await supabase.from('wa_atendentes')
    .update(patch).eq('id', req.params.id).select().maybeSingle();
  if (error) return res.status(400).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Atendente não encontrado' });
  res.json(data);
});

// Liga/desliga um disparo automático do catálogo (decisão do Marcos · 14/08:
// "na aba de disparos automáticos eu não consigo cancelar isso"). Desligar NÃO
// é caminho de envio — é o freio central que faltava; cada cron consulta a
// lista ANTES de montar o público (comunicacaoDisparosOff).
router.patch('/automaticas/:id', authorizeModule('comunicacao', 3), async (req, res) => {
  const { IDS_CATALOGO } = require('../services/comunicacaoAutomaticas');
  const id = String(req.params.id);
  if (!IDS_CATALOGO.includes(id)) return res.status(404).json({ error: 'Disparo desconhecido' });
  const ativo = req.body?.ativo !== false;
  const r = await require('../services/comunicacaoDisparosOff').setDisparo(id, ativo);
  if (!r.ok) {
    return res.status(409).json({
      error: /disparos_off/.test(r.erro || '')
        ? 'O interruptor precisa da migration 20260814150000 — aplique e tente de novo.'
        : r.erro,
    });
  }
  res.json({ ok: true, id, ativo, desligados: r.desligados });
});

// ── Contatos (decisão do Marcos · 13/08) ─────────────────────────────
// A audiência REAL de mensagens proativas: membros com OPT-IN explícito +
// líderes do bot (o papel implica o aceite — quem quer liderar grupo aprova
// pedidos por WhatsApp). Cada contato carrega DE ONDE veio ("virou uma
// necessidade"): a porta do consentimento (inscricao_consentimentos tipo
// 'whatsapp') ou o vínculo de líder (auto-sync do cadastro de grupos).
router.get('/contatos', async (req, res) => {
  try {
    const { contemNormalizado } = require('../services/busca');
    const busca = String(req.query.busca || '').trim();
    const dig = (t) => String(t || '').replace(/\D+/g, '');

    // Líderes do bot (dezenas · 1 query)
    const { data: lids, error: e1 } = await supabase.from('whatsapp_lideres')
      .select('id, telefone, nome_exibicao, papel, escopo, ativo, recebe_lembretes, origem, grupo_id')
      .is('deleted_at', null).limit(1000);
    if (e1) throw e1;

    // Membros com opt-in (paginado · cap DECLARADO — silêncio de truncamento
    // é a classe de bug do cap de 1000 do PostgREST)
    const membros = [];
    const PAGE = 1000; const CAP = 5000;
    for (let from = 0; from < CAP; from += PAGE) {
      const { data, error } = await supabase.from('mem_membros')
        .select('id, nome, telefone, whatsapp_optin_em')
        .eq('whatsapp_optin', true).is('deleted_at', null)
        .not('telefone', 'is', null)
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      membros.push(...(data || []));
      if (!data || data.length < PAGE) break;
    }
    const truncado = membros.length >= CAP;

    // Nome do grupo dos líderes sincronizados (lote ≤200 — URL do PostgREST)
    const grupoIds = [...new Set((lids || []).map(l => l.grupo_id).filter(Boolean))];
    const grupoNome = new Map();
    for (let i = 0; i < grupoIds.length; i += 200) {
      const { data } = await supabase.from('mem_grupos').select('id, nome').in('id', grupoIds.slice(i, i + 200));
      (data || []).forEach(g => grupoNome.set(g.id, g.nome));
    }

    // Origem do opt-in: consentimento 'whatsapp' mais recente por membro
    const consent = new Map();
    const ids = membros.map(m => m.id);
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await supabase.from('inscricao_consentimentos')
        .select('membro_id, porta, em')
        .eq('tipo', 'whatsapp').eq('aceito', true).is('deleted_at', null)
        .in('membro_id', ids.slice(i, i + 200))
        .order('em', { ascending: false });
      (data || []).forEach(c => { if (c.membro_id && !consent.has(c.membro_id)) consent.set(c.membro_id, c); });
    }

    // Junta por TELEFONE (a mesma pessoa pode ser membro opt-in E líder)
    const PORTA_LABEL = {
      batismo: 'inscrição de batismo', apresentacao: 'apresentação de crianças',
      grupos: 'inscrição em grupo', grupos_lider: 'inscrição de líder',
      next: 'inscrição no Next', voluntariado: 'ficha de voluntariado',
      evento_externo: 'inscrição em evento', inscricoes: 'inscrição em evento',
    };
    const porTel = new Map();
    for (const m of membros) {
      const tel = dig(m.telefone);
      if (!tel) continue;
      const c = consent.get(m.id);
      porTel.set(tel, {
        telefone: m.telefone, nome: m.nome, membro_id: m.id, papeis: ['optin'],
        origem: c ? `Opt-in na ${PORTA_LABEL[c.porta] || c.porta}` : 'Opt-in registrado no cadastro',
        desde: c?.em || m.whatsapp_optin_em || null,
      });
    }
    for (const l of lids || []) {
      const tel = dig(l.telefone);
      if (!tel) continue;
      const gNome = grupoNome.get(l.grupo_id);
      const origemLider = l.origem === 'auto'
        ? `Líder de grupo${gNome ? ` · ${gNome}` : ''} (aprova pedidos por WhatsApp)`
        : 'Vinculado manualmente ao bot';
      const ex = porTel.get(tel);
      if (ex) {
        ex.papeis.push('lider');
        ex.origem_lider = origemLider;
        ex.lider_id = l.id;
        ex.lider_ativo = l.ativo !== false;
        ex.recebe_lembretes = l.recebe_lembretes !== false;
      } else {
        porTel.set(tel, {
          telefone: l.telefone, nome: l.nome_exibicao || null, membro_id: null, papeis: ['lider'],
          origem: origemLider, desde: null,
          lider_id: l.id, lider_ativo: l.ativo !== false, recebe_lembretes: l.recebe_lembretes !== false,
        });
      }
    }

    let contatos = [...porTel.values()];
    if (busca) {
      contatos = contatos.filter(c =>
        contemNormalizado(c.nome || '', busca) || (dig(busca) && dig(c.telefone).includes(dig(busca))));
    }
    contatos.sort((a, b) => String(a.nome || '￿').localeCompare(String(b.nome || '￿'), 'pt-BR'));
    res.json({
      contatos,
      total: contatos.length,
      resumo: { optin: membros.length, lideres: (lids || []).length },
      truncado,
    });
  } catch (e) {
    console.error('[comunicacao] contatos:', e.message);
    res.status(500).json({ error: 'Erro ao listar os contatos' });
  }
});

// ── Tarifas ──────────────────────────────────────────────────────────
router.get('/tarifas', async (_req, res) => {
  const { data, error } = await supabase.from('wa_tarifas').select('*').order('categoria');
  if (error) return res.status(400).json({ error: error.message });
  res.json(data || []);
});

router.put('/tarifas/:categoria', authorizeModule('comunicacao', 5), async (req, res) => {
  const tarifa = Number(req.body?.tarifa);
  if (!Number.isFinite(tarifa) || tarifa < 0) return res.status(400).json({ error: 'Tarifa inválida' });
  const { data, error } = await supabase.from('wa_tarifas')
    .upsert({ categoria: req.params.categoria, tarifa, atualizado_em: new Date().toISOString() })
    .select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// ── Histórico central de envios (a fila de TODOS os módulos) ─────────
router.get('/envios', async (req, res, next) => {
  try {
    const limite = Math.min(parseInt(req.query.limit, 10) || 100, 500);
    const offset = parseInt(req.query.offset, 10) || 0;
    let q = supabase.from('whatsapp_envios')
      .select('id, telefone, tipo, template, texto, contexto, status, tentativas, erro, erro_status, message_id, criado_em, enviado_em, delivered_at, read_at, failed_at', { count: 'exact' })
      .order('criado_em', { ascending: false })
      .range(offset, offset + limite - 1);
    // 'falha_meta' não é um status da fila: é envio ACEITO (status=enviado) que
    // a Meta depois reportou como não entregue — o recorte é pelo failed_at.
    if (req.query.status === 'falha_meta') q = q.not('failed_at', 'is', null);
    else if (req.query.status) q = q.eq('status', String(req.query.status));
    if (req.query.contexto) q = q.ilike('contexto', `${String(req.query.contexto)}%`);
    if (req.query.telefone) q = q.ilike('telefone', `%${String(req.query.telefone).replace(/\D/g, '')}%`);
    if (req.query.de) q = q.gte('criado_em', String(req.query.de));
    if (req.query.ate) q = q.lte('criado_em', String(req.query.ate) + 'T23:59:59');
    const { data, error, count } = await q;
    if (error) throw error;
    res.json({ envios: data || [], total: count || 0 });
  } catch (e) {
    console.error('[comunicacao] envios:', e.message);
    next(communicationError(e, 'Erro ao listar envios.'));
  }
});

// Resumo pro topo do histórico (e semente do dashboard do C5)
// ── AUTOMÁTICAS · quem recebe as mensagens que o sistema manda sozinho ──────
// Pedido do Matheus (05/08): "queria conseguir saber quem são as pessoas que
// recebem as mensagens automáticas". 100% SOMENTE LEITURA — descreve o que os
// crons disparam, nunca envia/agenda/desliga (a lógica de cada disparo vive no
// módulo dono; um 2º caminho de escrita aqui é a classe de bug que o inventário
// de portas do /inscricoes evita de propósito).
//
// ⚠️ `?pessoas=1` exige nível 2: a lista carrega NOME e TELEFONE. "Quantos
// recebem" é gestão; "quem recebe, com telefone" é cadastro de gente.
router.get('/automaticas', async (req, res, next) => {
  try {
    const dias = Math.min(parseInt(req.query.dias, 10) || 30, 120);
    const querPessoas = req.query.pessoas === '1' || req.query.pessoas === 'true';
    const nivel = req.user?.granular?.modulePerms?.comunicacao?.leitura || 0;
    const comPessoas = querPessoas && nivel >= 2;
    const { listar } = require('../services/comunicacaoAutomaticas');
    const r = await listar({ comPessoas, dias });
    // Interruptor central (14/08): marca o que está DESLIGADO pela aba.
    try {
      const desligados = await require('../services/comunicacaoDisparosOff').listarDesligados();
      r.itens = (r.itens || []).map((i) => ({ ...i, desligado: desligados.has(String(i.id)) }));
    } catch { /* sem interruptor → tudo ligado */ }
    // Se pediu a lista e não tem nível, DIZ que não veio (silêncio faria a tela
    // parecer vazia — "nenhuma pessoa" é a leitura errada de "sem permissão").
    res.json({ ...r, pessoas_ocultas: querPessoas && !comPessoas });
  } catch (e) {
    console.error('[comunicacao] automaticas', e.message);
    next(communicationError(e, 'Erro ao carregar os disparos automáticos.'));
  }
});

router.get('/envios/resumo', async (req, res, next) => {
  try {
    const dias = Math.min(parseInt(req.query.dias, 10) || 30, 120);
    const desde = new Date(Date.now() - dias * 86400000).toISOString();
    const conta = async (filtro) => {
      let q = supabase.from('whatsapp_envios').select('id', { count: 'exact', head: true }).gte('criado_em', desde);
      q = filtro(q);
      const { count, error } = await q;
      if (error) throw error;
      return count || 0;
    };
    const [total, enviados, pendentes, erros, entregues, lidos, falhosMeta] = await Promise.all([
      conta(q => q),
      conta(q => q.eq('status', 'enviado')),
      conta(q => q.eq('status', 'pendente')),
      conta(q => q.eq('status', 'erro')),
      conta(q => q.not('delivered_at', 'is', null)),
      conta(q => q.not('read_at', 'is', null)),
      conta(q => q.not('failed_at', 'is', null)),
    ]);
    // Órfãos (recibo da Meta sem envio correspondente) — best-effort: a aba
    // Envios (que absorveu a Erros) mostra o selo quando > 0.
    let orfaos = 0;
    try {
      const { count, error: errOrf } = await supabase.from('whatsapp_status_orfaos')
        .select('id', { count: 'exact', head: true }).gte('criado_em', desde);
      if (errOrf) console.warn('[comunicacao] resumo orfaos:', errOrf.message);
      orfaos = count || 0;
    } catch { /* tabela ausente → 0 */ }
    // Respostas RECEBIDAS (inbound do chat) — era o requisito original do
    // Marcos ("dashboard com custo, total de envios e respostas") que faltava.
    let respostas = 0;
    try {
      const { count: cIn } = await supabase.from('wa_mensagens')
        .select('id', { count: 'exact', head: true })
        .eq('direcao', 'in').gte('criado_em', desde);
      respostas = cIn || 0;
    } catch { /* best-effort */ }
    res.json({ dias, total, enviados, pendentes, erros, entregues, lidos, falhos_meta: falhosMeta, orfaos, respostas });
  } catch (e) {
    console.error('[comunicacao] resumo:', e.message);
    next(communicationError(e, 'Erro no resumo de envios.'));
  }
});

// ── Custo estimado (C5) ──────────────────────────────────────────────
// Modelo (estimativa · a Meta cobra por conversa iniciada por categoria):
//   custo do envio = tarifa da CATEGORIA do template (wa_templates.categoria →
//   wa_tarifas). Envio de TEXTO (tipo=texto · janela 24h = service) = grátis.
//   Template sem categoria conhecida cai em 'nao_classificado' (tarifa 0 · mas
//   COUNT exibido, com aviso pra classificar na aba Templates). É estimativa,
//   não a fatura — as tarifas são editáveis em wa_tarifas.
router.get('/custo', async (req, res, next) => {
  try {
    const meses = Math.min(parseInt(req.query.meses, 10) || 6, 12);
    const desde = new Date(); desde.setMonth(desde.getMonth() - (meses - 1)); desde.setDate(1);
    const desdeISO = desde.toISOString().slice(0, 10);

    // Só o que SAIU (conversa iniciada): status enviado + os que a Meta confirmou.
    const envios = await (async () => {
      const out = []; let from = 0; const page = 1000;
      while (true) {
        // ⚠️ .order() obrigatório: range() sem ORDER BY tem ordem indefinida no
        // PostgREST — páginas podiam duplicar/perder linhas e o custo estimado
        // saía errado em silêncio. id no desempate (criado_em pode empatar).
        const { data, error } = await supabase.from('whatsapp_envios')
          .select('tipo, template, contexto, criado_em')
          .eq('status', 'enviado').gte('criado_em', desdeISO)
          .order('criado_em', { ascending: true }).order('id', { ascending: true })
          .range(from, from + page - 1);
        if (error) throw error;
        out.push(...(data || []));
        if (!data || data.length < page) break;
        from += page;
      }
      return out;
    })();

    // Mapa template(nome) → categoria; e categoria → tarifa.
    const { data: tpls, error: tplsError } = await supabase.from('wa_templates').select('nome, categoria');
    if (tplsError) throw tplsError;
    const catDoTemplate = new Map((tpls || []).map(t => [t.nome, t.categoria || null]));
    const { data: tarifas, error: tarifasError } = await supabase.from('wa_tarifas').select('categoria, tarifa');
    if (tarifasError) throw tarifasError;
    const tarifaDaCat = new Map((tarifas || []).map(t => [t.categoria, Number(t.tarifa) || 0]));

    const porMes = {}, porModulo = {}, porCategoria = {};
    let total = 0, naoClassificados = 0;
    for (const e of envios) {
      const mes = String(e.criado_em).slice(0, 7);
      const modulo = String(e.contexto || 'sem_contexto').split('.')[0] || 'sem_contexto';
      // Texto (janela 24h · service) = grátis. Template = tarifa da categoria.
      let cat, custo;
      if (e.tipo === 'texto') { cat = 'service'; custo = tarifaDaCat.get('service') || 0; }
      else {
        cat = catDoTemplate.get(e.template) || null;
        if (!cat) { cat = 'nao_classificado'; naoClassificados += 1; custo = 0; }
        else custo = tarifaDaCat.get(cat) || 0;
      }
      total += custo;
      porMes[mes] = (porMes[mes] || 0) + custo;
      porModulo[modulo] = (porModulo[modulo] || 0) + custo;
      if (!porCategoria[cat]) porCategoria[cat] = { envios: 0, custo: 0 };
      porCategoria[cat].envios += 1; porCategoria[cat].custo += custo;
    }

    const ord = (obj) => Object.entries(obj).map(([k, v]) => ({ chave: k, valor: v })).sort((a, b) => b.valor - a.valor);
    res.json({
      meses,
      total: Math.round(total * 100) / 100,
      envios_considerados: envios.length,
      nao_classificados: naoClassificados,
      por_mes: Object.entries(porMes).map(([mes, custo]) => ({ mes, custo: Math.round(custo * 100) / 100 })).sort((a, b) => a.mes.localeCompare(b.mes)),
      por_modulo: ord(porModulo).map(x => ({ modulo: x.chave, custo: Math.round(x.valor * 100) / 100 })),
      por_categoria: Object.entries(porCategoria).map(([categoria, v]) => ({ categoria, envios: v.envios, custo: Math.round(v.custo * 100) / 100 })).sort((a, b) => b.custo - a.custo),
    });
  } catch (e) {
    console.error('[comunicacao] custo:', e.message);
    next(communicationError(e, 'Erro ao calcular o custo.'));
  }
});

// ── Erros (falha terminal da fila + failed da Meta + órfãos) ─────────
router.get('/erros', async (_req, res, next) => {
  try {
    const [filaResult, metaResult, orfaosResult] = await Promise.all([
      supabase.from('whatsapp_envios')
        .select('id, telefone, tipo, template, contexto, erro, tentativas, criado_em')
        .eq('status', 'erro').order('criado_em', { ascending: false }).limit(100),
      supabase.from('whatsapp_envios')
        .select('id, telefone, tipo, template, contexto, erro_status, failed_at')
        .not('failed_at', 'is', null).order('failed_at', { ascending: false }).limit(100),
      supabase.from('whatsapp_status_orfaos').select('id', { count: 'exact', head: true }),
    ]);
    const sourceError = filaResult.error || metaResult.error || orfaosResult.error;
    if (sourceError) throw sourceError;
    const fila = filaResult.data;
    const falhosMeta = metaResult.data;
    const orfaos = orfaosResult.count;
    res.json({ falhas_fila: fila || [], falhas_meta: falhosMeta || [], orfaos: orfaos || 0 });

  } catch (e) {
    console.error('[comunicacao] erros:', e.message);
    next(communicationError(e, 'Erro ao listar falhas.'));
  }
});

// Reenviar uma falha terminal (após corrigir o telefone, p.ex.): volta a linha
// pra 'pendente' com telefone opcionalmente corrigido — o cron reprocessa.
router.post('/erros/:id/reenviar', authorizeModule('comunicacao', 3), async (req, res, next) => {
  try {
    const patch = {
      status: 'pendente',
      tentativas: 0,
      erro: null,
      proxima_tentativa_em: new Date().toISOString(),
    };
    if (req.body?.telefone) patch.telefone = String(req.body.telefone).replace(/\D/g, '');
    const { data, error } = await supabase.from('whatsapp_envios')
      .update(patch).eq('id', req.params.id).eq('status', 'erro').select('id').maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Envio não encontrado (ou não está em erro)' });
    res.json({ ok: true });
  } catch (e) {
    next(communicationError(e, 'Erro ao reenviar.'));
  }
});

module.exports = router;
