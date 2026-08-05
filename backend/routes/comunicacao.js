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

// Cron público (CRON_SECRET) declarado ANTES do authenticate.
// Varredor das programadas: dispara agendamentos vencidos (único ou recorrente).
router.get('/cron/agendamentos', requireCron, async (_req, res) => {
  try {
    const agora = new Date(Date.now() - 3 * 3600 * 1000); // BRT
    const hojeISO = agora.toISOString().slice(0, 10);
    const horaAtual = agora.getUTCHours();
    const diaSemana = agora.getUTCDay();
    const diaMes = agora.getUTCDate();

    const { data: ativos } = await supabase.from('wa_agendamentos')
      .select('*').eq('ativo', true).limit(200);

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
        await supabase.from('wa_agendamentos')
          .update({ ultimo_disparo: new Date().toISOString(), ...(a.quando ? { ativo: false } : {}) })
          .eq('id', a.id);
        disparados += 1;
        resultados.push({ id: a.id, nome: a.nome, enfileirados: r.queued });
      } catch (e) {
        console.error('[comunicacao] agendamento %s:', a.id, e.message);
        resultados.push({ id: a.id, erro: e.message });
      }
    }
    res.json({ ok: true, disparados, resultados });
  } catch (e) {
    console.error('[comunicacao] cron agendamentos:', e.message);
    res.status(500).json({ error: 'Erro no cron de agendamentos' });
  }
});

router.use(authenticate, authorizeModule('comunicacao'));

// ── Números ──────────────────────────────────────────────────────────
router.get('/numeros', async (_req, res) => {
  const { data, error } = await supabase.from('wa_numeros').select('*').order('created_at');
  if (error) return res.status(400).json({ error: error.message });
  // Sem cadastro ainda → mostra o número da env como "não cadastrado" (transição)
  res.json({ numeros: data || [], env_phone_number_id: process.env.WHATSAPP_PHONE_NUMBER_ID || null });
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
router.get('/envios', async (req, res) => {
  try {
    const limite = Math.min(parseInt(req.query.limit, 10) || 100, 500);
    const offset = parseInt(req.query.offset, 10) || 0;
    let q = supabase.from('whatsapp_envios')
      .select('id, telefone, tipo, template, texto, contexto, status, tentativas, erro, erro_status, message_id, criado_em, enviado_em, delivered_at, read_at, failed_at', { count: 'exact' })
      .order('criado_em', { ascending: false })
      .range(offset, offset + limite - 1);
    if (req.query.status) q = q.eq('status', String(req.query.status));
    if (req.query.contexto) q = q.ilike('contexto', `${String(req.query.contexto)}%`);
    if (req.query.telefone) q = q.ilike('telefone', `%${String(req.query.telefone).replace(/\D/g, '')}%`);
    if (req.query.de) q = q.gte('criado_em', String(req.query.de));
    if (req.query.ate) q = q.lte('criado_em', String(req.query.ate) + 'T23:59:59');
    const { data, error, count } = await q;
    if (error) return res.status(400).json({ error: error.message });
    res.json({ envios: data || [], total: count || 0 });
  } catch (e) {
    console.error('[comunicacao] envios:', e.message);
    res.status(500).json({ error: 'Erro ao listar envios' });
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
router.get('/automaticas', async (req, res) => {
  try {
    const dias = Math.min(parseInt(req.query.dias, 10) || 30, 120);
    const querPessoas = req.query.pessoas === '1' || req.query.pessoas === 'true';
    const nivel = req.user?.granular?.modulePerms?.comunicacao?.leitura || 0;
    const comPessoas = querPessoas && nivel >= 2;
    const { listar } = require('../services/comunicacaoAutomaticas');
    const r = await listar({ comPessoas, dias });
    // Se pediu a lista e não tem nível, DIZ que não veio (silêncio faria a tela
    // parecer vazia — "nenhuma pessoa" é a leitura errada de "sem permissão").
    res.json({ ...r, pessoas_ocultas: querPessoas && !comPessoas });
  } catch (e) {
    console.error('[comunicacao] automaticas', e.message);
    res.status(500).json({ error: 'Erro ao carregar os disparos automáticos' });
  }
});

router.get('/envios/resumo', async (req, res) => {
  try {
    const dias = Math.min(parseInt(req.query.dias, 10) || 30, 120);
    const desde = new Date(Date.now() - dias * 86400000).toISOString();
    const conta = async (filtro) => {
      let q = supabase.from('whatsapp_envios').select('id', { count: 'exact', head: true }).gte('criado_em', desde);
      q = filtro(q);
      const { count } = await q;
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
    res.json({ dias, total, enviados, pendentes, erros, entregues, lidos, falhos_meta: falhosMeta });
  } catch (e) {
    console.error('[comunicacao] resumo:', e.message);
    res.status(500).json({ error: 'Erro no resumo de envios' });
  }
});

// ── Custo estimado (C5) ──────────────────────────────────────────────
// Modelo (estimativa · a Meta cobra por conversa iniciada por categoria):
//   custo do envio = tarifa da CATEGORIA do template (wa_templates.categoria →
//   wa_tarifas). Envio de TEXTO (tipo=texto · janela 24h = service) = grátis.
//   Template sem categoria conhecida cai em 'nao_classificado' (tarifa 0 · mas
//   COUNT exibido, com aviso pra classificar na aba Templates). É estimativa,
//   não a fatura — as tarifas são editáveis em wa_tarifas.
router.get('/custo', async (req, res) => {
  try {
    const meses = Math.min(parseInt(req.query.meses, 10) || 6, 12);
    const desde = new Date(); desde.setMonth(desde.getMonth() - (meses - 1)); desde.setDate(1);
    const desdeISO = desde.toISOString().slice(0, 10);

    // Só o que SAIU (conversa iniciada): status enviado + os que a Meta confirmou.
    const envios = await (async () => {
      const out = []; let from = 0; const page = 1000;
      while (true) {
        const { data, error } = await supabase.from('whatsapp_envios')
          .select('tipo, template, contexto, criado_em')
          .eq('status', 'enviado').gte('criado_em', desdeISO)
          .range(from, from + page - 1);
        if (error) throw error;
        out.push(...(data || []));
        if (!data || data.length < page) break;
        from += page;
      }
      return out;
    })();

    // Mapa template(nome) → categoria; e categoria → tarifa.
    const { data: tpls } = await supabase.from('wa_templates').select('nome, categoria');
    const catDoTemplate = new Map((tpls || []).map(t => [t.nome, t.categoria || null]));
    const { data: tarifas } = await supabase.from('wa_tarifas').select('categoria, tarifa');
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
    res.status(500).json({ error: 'Erro ao calcular o custo' });
  }
});

// ── Erros (falha terminal da fila + failed da Meta + órfãos) ─────────
router.get('/erros', async (_req, res) => {
  try {
    const [{ data: fila }, { data: falhosMeta }, { count: orfaos }] = await Promise.all([
      supabase.from('whatsapp_envios')
        .select('id, telefone, tipo, template, contexto, erro, tentativas, criado_em')
        .eq('status', 'erro').order('criado_em', { ascending: false }).limit(100),
      supabase.from('whatsapp_envios')
        .select('id, telefone, tipo, template, contexto, erro_status, failed_at')
        .not('failed_at', 'is', null).order('failed_at', { ascending: false }).limit(100),
      supabase.from('whatsapp_status_orfaos').select('id', { count: 'exact', head: true }),
    ]);
    res.json({ falhas_fila: fila || [], falhas_meta: falhosMeta || [], orfaos: orfaos || 0 });
  } catch (e) {
    console.error('[comunicacao] erros:', e.message);
    res.status(500).json({ error: 'Erro ao listar falhas' });
  }
});

// Reenviar uma falha terminal (após corrigir o telefone, p.ex.): volta a linha
// pra 'pendente' com telefone opcionalmente corrigido — o cron reprocessa.
router.post('/erros/:id/reenviar', authorizeModule('comunicacao', 3), async (req, res) => {
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
    if (error) return res.status(400).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Envio não encontrado (ou não está em erro)' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao reenviar' });
  }
});

module.exports = router;
