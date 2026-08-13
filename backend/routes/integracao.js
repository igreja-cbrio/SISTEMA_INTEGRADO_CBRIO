const router = require('express').Router();
const { authenticate, authorizeModule } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { notificar } = require('../services/notificar');
const { isoWeekRange } = require('../utils/isoWeek');
const { isAuthorizedCron } = require('../utils/cronAuth');

// Cron (ANTES do authenticate · CRON_SECRET): mantém os cultos recorrentes
// gerados ~3 meses à frente. Sem isso, os cultos acabam no fim do ano (a
// migration só gerou até 30/12) e o totem/coleta fica sem culto pra abrir.
// gerar_cultos_recorrentes é idempotente (pula os que já existem) e cria TODOS
// os service_types ativos (Domingo/Quarta/AMI/Bridge).
router.get('/cron/gerar-cultos-recorrentes', async (req, res) => {
  if (!isAuthorizedCron(req)) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    const fimDt = new Date(); fimDt.setMonth(fimDt.getMonth() + 3);
    const fim = fimDt.toISOString().slice(0, 10);
    const { data, error } = await supabase.rpc('gerar_cultos_recorrentes', {
      p_data_inicio: hoje, p_data_fim: fim,
    });
    if (error) throw error;
    const criados = (data || []).filter((r) => r.out_status === 'criado').length;
    console.log(`[integracao/cron/gerar-cultos] ${hoje}→${fim} · ${criados} criados de ${(data || []).length}`);
    res.json({ ok: true, ate: fim, total: (data || []).length, criados });
  } catch (e) {
    console.error('[integracao/cron/gerar-cultos]', e.message);
    res.status(500).json({ error: 'Erro ao gerar cultos recorrentes' });
  }
});

router.use(authenticate);

// ── GET /dashboard — cards do header de /integracao ─────────────────────────
// Reformulado em 2026-05-14 · visitantes/acompanhamentos descontinuados (PR
// #399) e o CRUD órfão removido em 2026-06-25 (limpeza Atlas). Retorna dados
// acionáveis: cultos pendentes/incompletos, decisões do mês, batismos aguardando.
router.get('/dashboard', async (req, res) => {
  try {
    const hoje = new Date();
    const hojeStr = hoje.toISOString().slice(0, 10);
    const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10);
    const sessentaDiasAtrasStr = new Date(hoje.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    // 1. Cultos pendentes / incompletos · passados nos últimos 60 dias.
    //    pendente   = nem frequência nem decisões lançadas (nada preenchido)
    //    incompleto = só a frequência OU só a decisão foi lançada
    //    Usa as flags frequencia_lancada/decisoes_lancadas (lançar 0 conta como
    //    lançado · pedido do Marcos), não os números (0 default ≠ "intocado").
    const { data: cultosRecentes } = await supabase
      .from('cultos')
      .select('id, data, frequencia_lancada, decisoes_lancadas')
      .gte('data', sessentaDiasAtrasStr)
      .lte('data', hojeStr);
    let cultosPendentes = 0;
    let cultosIncompletos = 0;
    for (const c of cultosRecentes || []) {
      const freq = !!c.frequencia_lancada;
      const dec = !!c.decisoes_lancadas;
      if (!freq && !dec) cultosPendentes++;
      else if (freq !== dec) cultosIncompletos++;
    }

    // 2. Frequência + decisões do mês corrente
    const { data: cultosMes } = await supabase
      .from('cultos')
      .select('presencial_adulto, presencial_kids, decisoes_presenciais, decisoes_online')
      .gte('data', inicioMes)
      .lte('data', hojeStr);
    let frequenciaMes = 0;
    let decisoesMes = 0;
    for (const c of cultosMes || []) {
      frequenciaMes += (c.presencial_adulto || 0) + (c.presencial_kids || 0);
      decisoesMes   += (c.decisoes_presenciais || 0) + (c.decisoes_online || 0);
    }

    // Soma também decisões sem culto vinculado · trilha 'conversao' concluída
    // que veio de importação (planilha) e cai no mês corrente.
    // (Decisões registradas via cultos_decisoes_pessoas também criam trilha,
    //  mas com observação 'Decisão registrada no culto' · filtramos por
    //  observação ILIKE '%importação%' pra contar so as historicas/avulsas.)
    const { count: decisoesImportadasMes } = await supabase
      .from('mem_trilha_valores')
      .select('id', { count: 'exact', head: true })
      .eq('etapa', 'conversao')
      .eq('concluida', true)
      .gte('data_conclusao', inicioMes)
      .lte('data_conclusao', hojeStr)
      .ilike('observacoes', '%importacao%');
    decisoesMes += decisoesImportadasMes || 0;

    // 3. Batismos aguardando + próxima data
    const { data: batismosAg } = await supabase
      .from('batismo_inscricoes')
      .select('id, data_batismo, status')
      .in('status', ['pendente', 'confirmado']);
    const batismosAguardando = (batismosAg || []).length;
    const proximoBatismo = (batismosAg || [])
      .map(b => b.data_batismo)
      .filter(d => d && d >= hojeStr)
      .sort()[0] || null;

    res.json({
      cultos_pendentes: cultosPendentes,
      cultos_incompletos: cultosIncompletos,
      frequencia_mes: frequenciaMes,
      decisoes_mes: decisoesMes,
      batismos_aguardando: batismosAguardando,
      proximo_batismo: proximoBatismo,
    });
  } catch (e) {
    console.error('[INTEGRACAO] dashboard', e.message);
    res.status(500).json({ error: 'Erro ao montar dashboard' });
  }
});

// ── GET /historico-anual — agregacao por ano + tipo de culto ────────────────
// Le vw_culto_historico_anual · agregacao no SQL escala pra qualquer volume.
// Frontend desenha tabela/grafico anual sem limit no client.
router.get('/historico-anual', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('vw_culto_historico_anual')
      .select('*')
      .order('ano', { ascending: false });
    if (error) return res.status(400).json({ error: error.message });
    res.json(data || []);
  } catch (e) {
    console.error('[INTEGRACAO] historico-anual', e.message);
    res.status(500).json({ error: 'Erro ao carregar histórico' });
  }
});

// ── GET /historico-batismos — total de batismos realizados por ano ──────────
router.get('/historico-batismos', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('vw_batismo_historico_anual')
      .select('*')
      .order('ano', { ascending: false });
    if (error) return res.status(400).json({ error: error.message });
    res.json(data || []);
  } catch (e) {
    console.error('[INTEGRACAO] historico-batismos', e.message);
    res.status(500).json({ error: 'Erro ao carregar histórico de batismos' });
  }
});

// ═════════════════════════════════════════════════════════════════════════
// COLETA MOBILE · submissoes de dados de culto pendentes de aprovação
// ═════════════════════════════════════════════════════════════════════════

// GET /coleta/cultos-abertos · lista cultos dos últimos 14 dias com status por ambiente
// Guards espelham a RLS da 20260526120000 (lançar >=2 · decidir >=3) — o
// backend usa service_role (bypassa RLS), então sem authorizeModule qualquer
// autenticado passava direto (gap achado na auditoria da coleta · 2026-07-10).
//
// Recorte opcional da janela (sem params = últimos 14 dias, idêntico ao
// original) — usado pelo app CBRio Staff pra navegar a coleta por semana,
// inclusive a PRÓXIMA (cultos futuros já existem em `cultos`, materializados
// pela gerar_cultos_recorrentes até o fim do ano). Dois formatos aceitos:
//   ?ano=&semana=   · semana ISO seg→dom (tem precedência)
//   ?inicio=&fim=   · datas YYYY-MM-DD (máx. 31 dias)
router.get('/coleta/cultos-abertos', authorizeModule('integracao', 2), async (req, res) => {
  try {
    const isYmd = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
    const hoje = new Date().toISOString().slice(0, 10);
    const limite = new Date(); limite.setDate(limite.getDate() - 14);
    let desde = limite.toISOString().slice(0, 10);
    let ate = hoje;

    const anoQ = parseInt(req.query.ano, 10);
    const semanaQ = parseInt(req.query.semana, 10);
    if (anoQ && semanaQ && semanaQ >= 1 && semanaQ <= 53) {
      const { inicio, fim } = isoWeekRange(anoQ, semanaQ);
      desde = inicio.toISOString().slice(0, 10);
      ate = fim.toISOString().slice(0, 10); // pode ser futuro (próxima semana)
    } else if (isYmd(req.query.inicio) || isYmd(req.query.fim)) {
      desde = isYmd(req.query.inicio) ? String(req.query.inicio) : desde;
      ate = isYmd(req.query.fim) ? String(req.query.fim) : hoje;
      if (ate < desde) return res.status(400).json({ error: 'fim anterior ao início' });
      if ((new Date(ate) - new Date(desde)) / 86400000 > 31) {
        return res.status(400).json({ error: 'range máximo de 31 dias' });
      }
    }

    const { data: cultos, error: errCultos } = await supabase
      .from('cultos')
      .select(`
        id, data, presencial_adulto, presencial_kids,
        decisoes_presenciais, decisoes_kids,
        service_type:vol_service_types(id, name, recurrence_time, has_kids)
      `)
      .gte('data', desde)
      .lte('data', ate)
      .order('data', { ascending: false })
      .limit(40);
    if (errCultos) return res.status(400).json({ error: errCultos.message });

    const ids = (cultos || []).map(c => c.id);
    let subsByKey = {};
    if (ids.length) {
      const { data: subs, error: errSubs } = await supabase
        .from('cultos_dados_submissoes')
        .select('id, culto_id, ambiente, status, presencial, decisoes, submitted_at')
        .in('culto_id', ids)
        .in('status', ['pendente', 'aprovado']);
      if (errSubs) return res.status(400).json({ error: errSubs.message });
      for (const s of (subs || [])) {
        subsByKey[`${s.culto_id}:${s.ambiente}`] = s;
      }
    }

    const out = (cultos || []).map(c => ({
      id: c.id,
      data: c.data,
      service_type: c.service_type,
      templo: {
        submissao: subsByKey[`${c.id}:templo`] || null,
        ja_em_cultos: (c.presencial_adulto != null && c.presencial_adulto > 0) ||
                      (c.decisoes_presenciais != null && c.decisoes_presenciais > 0),
      },
      kids: {
        habilitado: !!c.service_type?.has_kids,
        submissao: subsByKey[`${c.id}:kids`] || null,
        ja_em_cultos: (c.presencial_kids != null && c.presencial_kids > 0) ||
                      (c.decisoes_kids != null && c.decisoes_kids > 0),
      },
    }));

    res.json(out);
  } catch (e) {
    console.error('[INTEGRACAO] coleta/cultos-abertos', e.message);
    res.status(500).json({ error: 'Erro ao carregar cultos abertos' });
  }
});

// POST /coleta · submeter dados de um culto (templo OU kids)
router.post('/coleta', authorizeModule('integracao', 2), async (req, res) => {
  try {
    const { culto_id, ambiente, presencial, decisoes, observacao } = req.body || {};
    if (!culto_id) return res.status(400).json({ error: 'culto_id obrigatorio' });
    if (!['templo', 'kids'].includes(ambiente)) {
      return res.status(400).json({ error: 'ambiente invalido (templo ou kids)' });
    }
    const pres = Number(presencial);
    const dec = Number(decisoes ?? 0);
    if (!Number.isFinite(pres) || pres < 0) {
      return res.status(400).json({ error: 'presencial deve ser número >= 0' });
    }
    if (!Number.isFinite(dec) || dec < 0) {
      return res.status(400).json({ error: 'decisões deve ser número >= 0' });
    }

    // Culto futuro não recebe lançamento (o app mostra a semana seguinte só
    // pra visualização). Data local de São Paulo — toISOString() em UTC viraria
    // o dia seguinte a partir das 21h BRT e bloquearia o culto da noite.
    const { data: cultoAlvo, error: errCulto } = await supabase
      .from('cultos')
      .select('data')
      .eq('id', culto_id)
      .maybeSingle();
    if (errCulto) return res.status(400).json({ error: errCulto.message });
    if (!cultoAlvo) return res.status(404).json({ error: 'Culto não encontrado' });
    const hojeSp = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    if (cultoAlvo.data > hojeSp) {
      return res.status(422).json({ error: 'Este culto ainda não aconteceu — lance depois do culto.' });
    }

    const { data, error } = await supabase
      .from('cultos_dados_submissoes')
      .insert({
        culto_id,
        ambiente,
        presencial: Math.round(pres),
        decisoes: Math.round(dec),
        observacao: observacao || null,
        status: 'pendente',
        submitted_by: req.user?.id || null,
      })
      .select()
      .single();
    if (error) {
      // 23505 = unique_violation · já tem submissao ativa pra esse (culto, ambiente)
      if (error.code === '23505') {
        return res.status(409).json({
          error: 'Já existe uma submissao pendente ou aprovada deste ambiente neste culto.',
        });
      }
      return res.status(400).json({ error: error.message });
    }

    // Notificação · admins/diretores (ou regras customizadas em /admin/notificacoes-regras)
    (async () => {
      try {
        const [{ data: prof }, { data: culto }] = await Promise.all([
          supabase.from('profiles').select('name, email').eq('id', req.user.id).single(),
          supabase
            .from('cultos')
            .select('data, service_type:vol_service_types(name)')
            .eq('id', culto_id)
            .single(),
        ]);
        const quem = prof?.name || prof?.email || 'Alguem';
        const ambienteLabel = ambiente === 'kids' ? 'Kids' : 'Templo';
        const dataPt = culto?.data ? new Date(culto.data + 'T12:00:00').toLocaleDateString('pt-BR') : '';
        const cultoLabel = `${culto?.service_type?.name || 'Culto'}${dataPt ? ' · ' + dataPt : ''}`;
        await notificar({
          modulo: 'integracao',
          tipo: 'dados_culto_pendente',
          titulo: `Dados de culto aguardando aprovação`,
          mensagem: `${quem} lancou ${ambienteLabel} do ${cultoLabel} · presencial ${Math.round(pres)} · decisões ${Math.round(dec)}`,
          link: '/integracao?tab=pendentes',
          severidade: 'info',
          chaveDedup: `dados_culto_sub_${data.id}`,
        });
      } catch (e) {
        console.warn('[INTEGRACAO] notificar coleta:', e.message);
      }
    })();

    res.status(201).json(data);
  } catch (e) {
    console.error('[INTEGRACAO] coleta POST', e.message);
    res.status(500).json({ error: 'Erro ao registrar submissao' });
  }
});

// GET /coleta/minhas · submissoes do próprio usuário (histórico pessoal)
router.get('/coleta/minhas', authorizeModule('integracao', 1), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('cultos_dados_submissoes')
      .select(`
        id, culto_id, ambiente, presencial, decisoes, observacao,
        status, submitted_at, approved_at, rejected_reason,
        culto:cultos(id, data, service_type:vol_service_types(name))
      `)
      .eq('submitted_by', req.user.id)
      .order('submitted_at', { ascending: false })
      .limit(50);
    if (error) return res.status(400).json({ error: error.message });
    res.json(data || []);
  } catch (e) {
    console.error('[INTEGRACAO] coleta/minhas', e.message);
    res.status(500).json({ error: 'Erro ao carregar suas submissoes' });
  }
});

// GET /coleta/pendentes · lista submissoes pendentes pro coord aprovar
router.get('/coleta/pendentes', authorizeModule('integracao', 3), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('cultos_dados_submissoes')
      .select(`
        id, culto_id, ambiente, presencial, decisoes, observacao,
        status, submitted_at, rejected_reason,
        submitted_by, submitter:profiles!cultos_dados_submissoes_submitted_by_fkey(id, name, email, avatar_url),
        culto:cultos(id, data, presencial_adulto, presencial_kids, decisoes_presenciais, decisoes_kids,
                     service_type:vol_service_types(name, recurrence_time))
      `)
      .eq('status', 'pendente')
      .order('submitted_at', { ascending: true });
    if (error) return res.status(400).json({ error: error.message });
    res.json(data || []);
  } catch (e) {
    console.error('[INTEGRACAO] coleta/pendentes', e.message);
    res.status(500).json({ error: 'Erro ao listar pendentes' });
  }
});

// POST /coleta/:id/aprovar · aplica os valores em cultos.* e marca aprovado
router.post('/coleta/:id/aprovar', authorizeModule('integracao', 3), async (req, res) => {
  try {
    const { id } = req.params;
    const { data: sub, error: errFetch } = await supabase
      .from('cultos_dados_submissoes')
      .select('id, culto_id, ambiente, presencial, decisoes, status')
      .eq('id', id)
      .single();
    if (errFetch || !sub) return res.status(404).json({ error: 'Submissao não encontrada' });
    if (sub.status !== 'pendente') {
      return res.status(409).json({ error: `Submissao já esta ${sub.status}` });
    }

    // (docs/cultos-domingo/ · F1) Submissão de KIDS só aplica em culto cujo tipo
    // TEM Kids — em has_kids=false ela gravaria presencial_kids fantasma num
    // culto que o totem nunca alimenta. Leitura isolada e best-effort: só recusa
    // quando o banco DIZ has_kids=false (falha de leitura não bloqueia a fila).
    if (sub.ambiente !== 'templo') {
      try {
        const { data: cultoAlvo } = await supabase.from('cultos')
          .select('id, service_type:vol_service_types(has_kids)')
          .eq('id', sub.culto_id).maybeSingle();
        if (cultoAlvo?.service_type && cultoAlvo.service_type.has_kids === false) {
          return res.status(409).json({ error: 'Este culto não tem Kids — a submissão de kids não pode ser aplicada nele.' });
        }
      } catch { /* não bloqueia por falha de leitura */ }
    }

    // A submissão mobile traz presencial + decisões do ambiente · marca as duas
    // seções como lançadas (incl. 0) pro culto não cair em "incompleto".
    const updateCulto = sub.ambiente === 'templo'
      ? { presencial_adulto: sub.presencial, decisoes_presenciais: sub.decisoes, frequencia_lancada: true, decisoes_lancadas: true }
      : { presencial_kids: sub.presencial, decisoes_kids: sub.decisoes, frequencia_lancada: true, decisoes_lancadas: true };

    const { error: errCulto } = await supabase
      .from('cultos')
      .update(updateCulto)
      .eq('id', sub.culto_id);
    if (errCulto) return res.status(400).json({ error: 'Erro ao atualizar culto: ' + errCulto.message });

    const { data: updSub, error: errUpd } = await supabase
      .from('cultos_dados_submissoes')
      .update({
        status: 'aprovado',
        approved_by: req.user?.id || null,
        approved_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();
    if (errUpd) return res.status(400).json({ error: errUpd.message });

    res.json(updSub);
  } catch (e) {
    console.error('[INTEGRACAO] coleta aprovar', e.message);
    res.status(500).json({ error: 'Erro ao aprovar submissao' });
  }
});

// POST /coleta/:id/rejeitar · marca rejeitada · libera novo envio do mesmo (culto,ambiente)
router.post('/coleta/:id/rejeitar', authorizeModule('integracao', 3), async (req, res) => {
  try {
    const { id } = req.params;
    const { motivo } = req.body || {};
    if (!motivo || String(motivo).trim().length < 3) {
      return res.status(400).json({ error: 'Informe um motivo (min 3 chars)' });
    }
    const { data, error } = await supabase
      .from('cultos_dados_submissoes')
      .update({
        status: 'rejeitado',
        rejected_reason: String(motivo).trim(),
        approved_by: req.user?.id || null,
        approved_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('status', 'pendente')
      .select()
      .single();
    if (error) return res.status(400).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Submissao não encontrada ou já decidida' });
    res.json(data);
  } catch (e) {
    console.error('[INTEGRACAO] coleta rejeitar', e.message);
    res.status(500).json({ error: 'Erro ao rejeitar submissao' });
  }
});

// ── Decisões de fé pelo APP (fila de revisão · Modo Culto) ──────────────────
// Decisão da liderança: nada do app entra direto na NSM — a Integração confirma.

// GET /decisoes-app?status=pendente|confirmada|descartada
router.get('/decisoes-app', authorizeModule('integracao', 1), async (req, res) => {
  try {
    const status = ['pendente', 'confirmada', 'descartada'].includes(req.query.status) ? req.query.status : 'pendente';
    const { data, error } = await supabase
      .from('app_decisoes')
      .select('id, ambiente, tipo, observacao, status, criada_em, culto_id, membro:mem_membros(id, nome, telefone, email), culto:cultos(nome, data)')
      .eq('status', status).is('deleted_at', null)
      .order('criada_em', { ascending: false }).limit(100);
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    console.error('[INTEGRACAO] decisoes-app list', e.message);
    res.status(500).json({ error: 'Erro ao listar decisões do app' });
  }
});

// POST /decisoes-app/:id/confirmar · vira decisão oficial (entra na NSM via trigger)
router.post('/decisoes-app/:id/confirmar', authorizeModule('integracao', 3), async (req, res) => {
  try {
    const { id } = req.params;
    const { data: sub } = await supabase
      .from('app_decisoes')
      .select('id, status, ambiente, tipo, observacao, culto_id, membro:mem_membros(id, nome, telefone, email, cpf)')
      .eq('id', id).is('deleted_at', null).maybeSingle();
    if (!sub) return res.status(404).json({ error: 'Decisão não encontrada' });
    if (sub.status !== 'pendente') return res.status(409).json({ error: `Decisão já está ${sub.status}` });
    const m = sub.membro;
    if (!m?.nome) return res.status(400).json({ error: 'Membro sem nome — não dá pra confirmar' });

    const cultoId = req.body?.culto_id || sub.culto_id || null;
    const tipoLabel = { aceitar: 'Aceitou a Jesus', reconciliacao: 'Reconciliação', rededicacao: 'Rededicação', batismo: 'Decisão pelo batismo', outro: 'Decisão' };
    const obs = ['Decisão registrada pelo app.', sub.tipo ? tipoLabel[sub.tipo] : null, sub.observacao].filter(Boolean).join(' · ');

    const { data: dec, error: errDec } = await supabase
      .from('cultos_decisoes_pessoas')
      .insert({
        culto_id: cultoId,
        membro_id: m.id,
        nome: m.nome,
        telefone: m.telefone || null,
        email: m.email || null,
        cpf: m.cpf || null,
        tipo_decisao: sub.ambiente === 'online' ? 'online' : 'presencial',
        fonte: 'app',
        observacoes: obs,
        registrado_por: req.user?.id || null,
        registrado_em: new Date().toISOString(),
      })
      .select('id').single();
    if (errDec) return res.status(400).json({ error: 'Erro ao criar decisão: ' + errDec.message });

    const { error: errUpd } = await supabase
      .from('app_decisoes')
      .update({ status: 'confirmada', decisao_id: dec.id, revisada_em: new Date().toISOString(), revisada_por: req.user?.id || null })
      .eq('id', id);
    if (errUpd) return res.status(400).json({ error: errUpd.message });

    res.json({ ok: true, decisao_id: dec.id });
  } catch (e) {
    console.error('[INTEGRACAO] decisoes-app confirmar', e.message);
    res.status(500).json({ error: 'Erro ao confirmar decisão' });
  }
});

// POST /decisoes-app/:id/descartar
router.post('/decisoes-app/:id/descartar', authorizeModule('integracao', 3), async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('app_decisoes')
      .update({ status: 'descartada', revisada_em: new Date().toISOString(), revisada_por: req.user?.id || null })
      .eq('id', id).eq('status', 'pendente').is('deleted_at', null)
      .select('id').maybeSingle();
    if (error) return res.status(400).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Decisão não encontrada ou já decidida' });
    res.json({ ok: true });
  } catch (e) {
    console.error('[INTEGRACAO] decisoes-app descartar', e.message);
    res.status(500).json({ error: 'Erro ao descartar decisão' });
  }
});

module.exports = router;
