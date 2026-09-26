// ============================================================================
// /api/marketing/linha · Linha do tempo do Marketing (Fase 3 · 2026-09-25)
//
// Semanas do ano × 4 frentes (Institucionais · Sistema · Interno · Rotina),
// JÁ RECORTADAS pelo perfil de quem está vendo (docs/modulo-marketing/
// linha-do-tempo/README.md, seção 3). A régua é pura: utils/marketingLinha.
//
// ⚠️ Marcar subtarefa NÃO mora aqui: é o PATCH /api/marketing/checklist/:itemId,
// o mesmo do Kanban (regra de quem marca + registro obrigatório + aviso de
// entrega quando o checklist fecha o card). Duas portas de escrita divergiriam.
// ============================================================================

const router = require('express').Router();
const { authenticate, authorizeModule } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { contextoSubtarefa } = require('../services/marketingContexto');
const L = require('../utils/marketingLinha');
const A = require('../utils/marketingAlocacao');
const { avisarAtribuidos, avisarPrazoAjustado, avisarSeChecklistConcluiu } = require('../services/marketingAvisos');

router.use(authenticate);

const CARD_COLS = [
  'id', 'titulo', 'descricao', 'origem', 'estado', 'culto', 'visibilidade', 'prioridade',
  'atribuido_a', 'event_id', 'event_phase_id', 'campanha_id', 'solicitacao_id',
  'data_inicio', 'data_fim', 'prazo_producao', 'prazo_confirmado', 'prazo_preliminar',
  'concluido_em', 'created_at',
].join(', ');
const ITEM_COLS = 'id, card_id, texto, grupo, ordem, feito, membro_id, esforco_valor, esforco_unidade, prazo, exige_registro, registro, concluido_em';

// Leitura paginada que LANÇA em erro (lista incompleta aqui vira tarefa sumindo
// do quadro sem aviso; `fetchAllRows` devolveria o acumulado em silêncio).
async function lerTudo(montar) {
  const out = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await montar().range(de, de + 999);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) return out;
  }
}

async function lerEmLotes(tabela, cols, coluna, valores) {
  const unicos = [...new Set((valores || []).filter(Boolean))];
  const out = [];
  for (let i = 0; i < unicos.length; i += 200) {
    const { data, error } = await supabase.from(tabela).select(cols).in(coluna, unicos.slice(i, i + 200));
    if (error) throw new Error(`${tabela}: ${error.message}`);
    out.push(...(data || []));
  }
  return out;
}

const ehTabelaAusente = (e) => e && (e.code === '42P01' || e.code === 'PGRST205');

router.get('/', authorizeModule('marketing', 1), async (req, res) => {
  const avisos = [];
  try {
    const hoje = L.dataSP(new Date());
    const anoHoje = Number(hoje.slice(0, 4));
    const pedido = Number(req.query.ano);
    const ano = Number.isInteger(pedido) && pedido >= 2024 && pedido <= anoHoje + 2 ? pedido : anoHoje;
    const semanas = L.semanasDoAno(ano);
    // Ano passado: tudo é passado (semana atual além do fim). Ano futuro: nada é.
    const semanaAtual = ano < anoHoje ? semanas.length + 1 : ano > anoHoje ? 0 : L.semanaDe(hoje, semanas);

    const ctx = await contextoSubtarefa(req);

    const [cards, membros] = await Promise.all([
      lerTudo(() => supabase.from('marketing_kanban_cards').select(CARD_COLS).is('deleted_at', null).order('id')),
      lerTudo(() => supabase.from('marketing_membros').select('id, profile_id, nome_display, habilidade, slots_dia, ativo')
        .is('deleted_at', null).order('id')),
    ]);

    // Nome do membro: profile > nome_display. Nunca "sem nome" mudo.
    const profIds = membros.map(m => m.profile_id).filter(Boolean);
    const profs = profIds.length ? await lerEmLotes('profiles', 'id, name', 'id', profIds) : [];
    const nomeProf = Object.fromEntries(profs.map(p => [p.id, p.name]));
    const membrosOut = membros.filter(m => m.ativo !== false).map(m => ({
      id: m.id, nome: nomeProf[m.profile_id] || m.nome_display || 'Sem nome',
      habilidade: m.habilidade, slots_dia: m.slots_dia,
    }));

    // Só entra o que cai no ano, e o que ficou ABERTO de antes (vem como atrasado).
    const noAno = [];
    for (const c of cards) {
      const prazo = L.prazoDoCard(c);
      const semana = prazo ? L.semanaDe(prazo, semanas) : null;
      if (prazo && semana == null) continue;             // depois do ano
      if (semana === 0 && c.estado === 'concluido') continue; // passado resolvido
      noAno.push({ card: c, prazo, semana });
    }

    const itens = await lerEmLotes('marketing_card_checklist', ITEM_COLS, 'card_id', noAno.map(x => x.card.id));
    const itensPorCard = {};
    for (const i of itens) (itensPorCard[i.card_id] ||= []).push(i);
    for (const k of Object.keys(itensPorCard)) itensPorCard[k].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));

    // Responsáveis do culto de cada série: quem responde pelas tarefas 'equipe'
    // daquele (evento, culto). É quem vê as etapas lider_move (Aprovação etc).
    const respCulto = {};
    for (const { card: c } of noAno) {
      if (c.event_id && c.culto && c.atribuido_a && (c.visibilidade || 'equipe') === 'equipe') {
        (respCulto[`${c.event_id}|${c.culto}`] ||= new Set()).add(c.atribuido_a);
      }
    }

    const eventIds = noAno.map(x => x.card.event_id);
    const faseIds = noAno.map(x => x.card.event_phase_id);
    const campIds = noAno.map(x => x.card.campanha_id);
    const solIds = noAno.map(x => x.card.solicitacao_id);
    const [eventos, fases, campanhas, solics] = await Promise.all([
      lerEmLotes('events', 'id, name, date, status', 'id', eventIds),
      lerEmLotes('event_cycle_phases', 'id, event_id, nome_fase, numero_fase, data_inicio_prevista, data_fim_prevista', 'id', faseIds),
      lerEmLotes('marketing_campanhas', 'id, titulo, dor_descricao, prazo_entrega, solicitacao_id, status', 'id', campIds),
      lerEmLotes('solicitacoes', 'id, titulo, descricao, data_necessaria', 'id', solIds),
    ]);
    const evPorId = Object.fromEntries(eventos.map(e => [e.id, e]));
    const fasePorId = Object.fromEntries(fases.map(f => [f.id, f]));
    const campPorId = Object.fromEntries(campanhas.map(c => [c.id, c]));
    const solPorId = Object.fromEntries(solics.map(s => [s.id, s]));

    const tarefas = [];
    for (const { card: c, prazo, semana } of noAno) {
      const recorte = L.recortarCard({
        card: c, itens: itensPorCard[c.id] || [], ctx,
        responsaveisDoCulto: [...(respCulto[`${c.event_id}|${c.culto}`] || [])],
      });
      if (!recorte) continue;
      const camp = campPorId[c.campanha_id] || null;
      const sol = solPorId[c.solicitacao_id] || solPorId[camp?.solicitacao_id] || null;
      tarefas.push({
        id: c.id, frente: L.frenteDoCard(c), titulo: c.titulo, descricao: c.descricao,
        estado: c.estado, culto: c.culto, visibilidade: c.visibilidade || 'equipe', prioridade: c.prioridade,
        atribuido_a: c.atribuido_a, prazo, semana, papel: recorte.papel,
        aberta: L.tarefaAberta({ estado: c.estado, papel: recorte.papel, itens: recorte.itens }),
        event_id: c.event_id, event_phase_id: c.event_phase_id,
        entrega_final: camp?.prazo_entrega || null,
        pedido: sol ? { titulo: sol.titulo, descricao: sol.descricao, data_necessaria: sol.data_necessaria }
          : camp ? { titulo: camp.titulo, descricao: camp.dor_descricao } : null,
        itens: recorte.itens,
      });
    }

    // ── Institucionais: série → etapas → faixas (1 por culto) ───────────────
    const series = {};
    for (const t of tarefas.filter(x => x.frente === 'ins')) {
      const ev = evPorId[t.event_id] || {};
      const s = (series[t.event_id || 'sem_evento'] ||= {
        event_id: t.event_id, nome: ev.name || 'Evento sem nome', data: ev.date || null, etapas: {},
      });
      const fase = fasePorId[t.event_phase_id] || null;
      const chave = t.event_phase_id || `solta-${t.id}`;
      const e = (s.etapas[chave] ||= {
        event_phase_id: t.event_phase_id, nome_fase: fase?.nome_fase || t.titulo,
        numero_fase: fase?.numero_fase ?? null, semana: t.semana, faixas: [],
      });
      e.faixas.push(t);
      if (t.semana != null && (e.semana == null || t.semana < e.semana)) e.semana = t.semana;
    }
    const listaSeries = Object.values(series).map(s => {
      const etapas = Object.values(s.etapas).sort((a, b) => (a.numero_fase ?? 99) - (b.numero_fase ?? 99));
      const abertas = etapas.flatMap(e => e.faixas).filter(t => t.aberta && t.semana != null);
      return { ...s, etapas, proxima_pendencia: abertas.length ? Math.min(...abertas.map(t => t.semana)) : null };
    }).sort((a, b) => (a.proxima_pendencia ?? 999) - (b.proxima_pendencia ?? 999) || String(a.data).localeCompare(String(b.data)));

    // ── Rotina ───────────────────────────────────────────────────────────────
    let rotina = [];
    let rotinaDisponivel = true;
    try {
      const comp = await lerTudo(() => supabase.from('marketing_compromissos_recorrentes')
        .select('id, membro_id, dia_semana, hora_inicio, duracao_h, descricao, created_at')
        .is('deleted_at', null).eq('ativo', true).order('id'));
      const parts = await lerEmLotes('marketing_recorrentes_participantes', 'compromisso_id, membro_id', 'compromisso_id', comp.map(c => c.id));
      const partPor = {};
      for (const p of parts) (partPor[p.compromisso_id] ||= []).push(p.membro_id);
      const compostos = comp.map(c => ({ ...c, participantes_ids: partPor[c.id] || [] }));
      const { data: execs, error: eExec } = await supabase.from('marketing_rotina_execucoes')
        .select('compromisso_id, membro_id, semana_inicio')
        .gte('semana_inicio', semanas[0].inicio).lte('semana_inicio', semanas[semanas.length - 1].fim);
      if (eExec) {
        if (!ehTabelaAusente(eExec)) throw eExec;
        rotinaDisponivel = false;
        avisos.push('A rotina da semana ainda não pode ser marcada: falta aplicar a migration da Fase 3.');
      }
      rotina = L.tarefasDaRotina({ compromissos: compostos, execucoes: execs || [], semanas, ctx });
    } catch (e) {
      rotina = null;
      avisos.push(`Não deu para carregar a rotina: ${e.message}`);
    }

    // ── Sistema: TODA solicitação de marketing (2026-09-26 · Pendentes entrou aqui)
    // O que já virou tarefa aparece como tarefa (acima). O que ainda não virou
    // aparece como PEDIDO, só para o líder: aguardando o diretor aprovar, ou
    // aguardando ele alocar (clica e aloca, com a pessoa sugerida).
    let carga = {};
    if (ctx.lider) {
      const [camps, sols] = await Promise.all([
        lerTudo(() => supabase.from('marketing_campanhas')
          .select('id, titulo, dor_descricao, publico_alvo, solicitacao_id, sugerido_membro_id, status, created_at')
          .is('deleted_at', null).order('id')),
        lerTudo(() => supabase.from('solicitacoes')
          .select('id, titulo, descricao, data_necessaria, solicitante_id, status, created_at')
          .eq('categoria', 'marketing').is('deleted_at', null).order('id')),
      ]);
      const campDaSol = {};
      for (const c of camps) if (c.solicitacao_id) campDaSol[c.solicitacao_id] = c;
      const campComCard = new Set(cards.map(c => c.campanha_id).filter(Boolean));
      const solComCard = new Set(cards.map(c => c.solicitacao_id).filter(Boolean));
      const FECHADA = new Set(['concluido', 'avaliado', 'cancelado', 'rejeitado']);
      const abertas = sols.filter(x => {
        if (FECHADA.has(x.status) || solComCard.has(x.id)) return false;
        const c = campDaSol[x.id];
        return !(c && campComCard.has(c.id));
      });
      const solicitantes = await lerEmLotes('profiles', 'id, name', 'id', abertas.map(x => x.solicitante_id));
      const nomeSolicitante = Object.fromEntries(solicitantes.map(p => [p.id, p.name]));
      const mais7 = (d) => (d ? new Date(Date.parse(d + 'T12:00:00Z') + 7 * 864e5).toISOString().slice(0, 10) : null);
      for (const sol of abertas) {
        const c = campDaSol[sol.id] || null;
        const pedidoStatus = sol.status === 'aguardando_aprovacao_origem' ? 'aguardando_aprovacao'
          : c?.status === 'triagem' ? 'aguardando_alocacao' : 'sem_tarefa';
        const quando = L.dataSP(sol.data_necessaria) || mais7(L.dataSP(sol.created_at));
        const semana = L.semanaDe(quando, semanas);
        if (semana == null) continue; // depois do ano
        tarefas.push({
          id: c?.id || sol.id, frente: 'sis', tipo: 'pedido', pedido_status: pedidoStatus,
          campanha_id: c?.id || null, solicitacao_id: sol.id,
          titulo: sol.titulo || c?.titulo, descricao: sol.descricao || c?.dor_descricao || null,
          publico_alvo: c?.publico_alvo || null, data_necessaria: L.dataSP(sol.data_necessaria) || null,
          prazo: quando, semana: Math.max(1, semana), aberta: true, atrasada: semana === 0,
          sugerido_membro_id: c?.sugerido_membro_id || null,
          solicitante: nomeSolicitante[sol.solicitante_id] || null, itens: [],
        });
      }

      const prazoDaTarefa = Object.fromEntries(noAno.map(x => [x.card.id, x.prazo]));
      carga = A.cargaPorSemana(itens, { prazoDaTarefa, semanaDe: (d) => L.semanaDe(d, semanas) });
    }

    const porFrente = (f) => tarefas.filter(t => t.frente === f);
    const frentes = {
      ins: { ...L.statusFrente(porFrente('ins'), semanaAtual), series: listaSeries },
      sis: { ...L.statusFrente(porFrente('sis'), semanaAtual), tarefas: porFrente('sis') },
      int: { ...L.statusFrente(porFrente('int'), semanaAtual), tarefas: porFrente('int') },
      rot: rotina == null
        ? { status: 'indisponivel', pendentes: null, semanas_atrasadas: [], tarefas: [], marcavel: false }
        : { ...L.statusFrente(rotina, semanaAtual), tarefas: rotina, marcavel: rotinaDisponivel },
    };

    res.json({
      ano, hoje, semana_atual: semanaAtual, semanas,
      perfil: { lider: ctx.lider, meus_membro_ids: ctx.meusMembroIds },
      membros: membrosOut,
      carga,
      frentes,
      sem_data: tarefas.filter(t => t.semana == null).length,
      avisos,
    });
  } catch (e) {
    console.error('[MARKETING-LINHA] get:', e.message);
    res.status(500).json({ error: 'Não foi possível carregar a linha do tempo', detalhe: e.message });
  }
});

// ── Rotina: fechar / reabrir um compromisso numa semana ────────────────────
// Quem marca: o líder, ou a própria pessoa (membro_id é dela).
async function autorizarRotina(req, res) {
  const { compromissoId, semanaInicio } = req.params;
  const membroId = (req.body && req.body.membro_id) || req.query.membro_id;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(semanaInicio) || L.domingoDe(semanaInicio) !== semanaInicio) {
    res.status(400).json({ error: 'semana_inicio tem que ser o domingo da semana (YYYY-MM-DD)' });
    return null;
  }
  if (!membroId) { res.status(400).json({ error: 'membro_id obrigatório' }); return null; }
  const ctx = await contextoSubtarefa(req);
  if (!ctx.lider && !ctx.meusMembroIds.includes(membroId)) {
    res.status(403).json({ error: 'Só a própria pessoa ou o líder do Marketing marca esta rotina' });
    return null;
  }
  const { data: comp, error } = await supabase.from('marketing_compromissos_recorrentes')
    .select('id, membro_id').eq('id', compromissoId).is('deleted_at', null).maybeSingle();
  if (error) throw error;
  if (!comp) { res.status(404).json({ error: 'Compromisso não encontrado' }); return null; }
  if (comp.membro_id !== membroId) {
    const { data: p, error: eP } = await supabase.from('marketing_recorrentes_participantes')
      .select('membro_id').eq('compromisso_id', compromissoId).eq('membro_id', membroId).maybeSingle();
    if (eP) throw eP;
    if (!p) { res.status(400).json({ error: 'Esta pessoa não participa deste compromisso' }); return null; }
  }
  return { compromissoId, semanaInicio, membroId };
}

router.put('/rotina/:compromissoId/:semanaInicio', authorizeModule('marketing', 1), async (req, res) => {
  try {
    const a = await autorizarRotina(req, res);
    if (!a) return;
    const { error } = await supabase.from('marketing_rotina_execucoes').upsert({
      compromisso_id: a.compromissoId, membro_id: a.membroId, semana_inicio: a.semanaInicio,
      concluido_por: req.user.userId,
    }, { onConflict: 'compromisso_id,membro_id,semana_inicio', ignoreDuplicates: true });
    if (error) {
      if (ehTabelaAusente(error)) return res.status(503).json({ error: 'Falta aplicar a migration da Fase 3 (marketing_rotina_execucoes)' });
      throw error;
    }
    res.json({ ok: true, feito: true });
  } catch (e) {
    console.error('[MARKETING-LINHA] rotina put:', e.message);
    res.status(500).json({ error: 'Não foi possível marcar a rotina', detalhe: e.message });
  }
});

router.delete('/rotina/:compromissoId/:semanaInicio', authorizeModule('marketing', 1), async (req, res) => {
  try {
    const a = await autorizarRotina(req, res);
    if (!a) return;
    const { error } = await supabase.from('marketing_rotina_execucoes').delete()
      .eq('compromisso_id', a.compromissoId).eq('membro_id', a.membroId).eq('semana_inicio', a.semanaInicio);
    if (error) {
      if (ehTabelaAusente(error)) return res.status(503).json({ error: 'Falta aplicar a migration da Fase 3 (marketing_rotina_execucoes)' });
      throw error;
    }
    res.json({ ok: true, feito: false });
  } catch (e) {
    console.error('[MARKETING-LINHA] rotina delete:', e.message);
    res.status(500).json({ error: 'Não foi possível reabrir a rotina', detalhe: e.message });
  }
});

// ════════════════════════════════════════════════════════════════════════
// Fase 4 · editor do Pedro (só líder): alocar pendente · nova tarefa · editar
// A régua é pura (utils/marketingAlocacao). Aqui só lê, grava e avisa.
// ════════════════════════════════════════════════════════════════════════

async function exigirLider(req, res) {
  const ctx = await contextoSubtarefa(req);
  if (!ctx.lider) { res.status(403).json({ error: 'Só o líder do Marketing aloca e edita tarefas' }); return null; }
  return ctx;
}

async function membrosAtivos(ids) {
  const unicos = [...new Set(ids.filter(Boolean))];
  if (!unicos.length) return true;
  const { data, error } = await supabase.from('marketing_membros').select('id')
    .in('id', unicos).eq('ativo', true).is('deleted_at', null);
  if (error) throw error;
  return (data || []).length === unicos.length;
}

const prazoProducao = (dataFim) => (dataFim ? new Date(dataFim + 'T18:00:00-03:00').toISOString() : null);

// Cria card + checklist. Se o checklist falhar, o card sai (soft) e o erro sobe.
async function criarTarefa({ card, itens, extras, userId }) {
  const { data: novo, error } = await supabase.from('marketing_kanban_cards').insert({
    origem: 'interna', estado: 'backlog', visibilidade: 'equipe',
    ...card, ...extras,
    data_inicio: L.dataSP(new Date()),
    prazo_producao: prazoProducao(card.data_fim),
    criado_por: userId,
  }).select(CARD_COLS).single();
  if (error) throw error;
  const { error: eItens } = await supabase.from('marketing_card_checklist')
    .insert(itens.map(i => ({ ...i, card_id: novo.id, feito: false })));
  if (eItens) {
    await supabase.from('marketing_kanban_cards').update({ deleted_at: new Date().toISOString() }).eq('id', novo.id);
    throw eItens;
  }
  return novo;
}

// Pedido do formulário (campanha em triagem) → tarefa em Sistema.
router.post('/pendentes/:campanhaId/alocar', authorizeModule('marketing', 1), async (req, res) => {
  try {
    if (!(await exigirLider(req, res))) return;
    const v = A.validarNovaTarefa(req.body, { modo: 'pendente' });
    if (v.erro) return res.status(400).json({ error: v.erro });
    if (!(await membrosAtivos([v.card.atribuido_a, ...v.itens.map(i => i.membro_id)]))) {
      return res.status(400).json({ error: 'Alguém escolhido não está ativo na equipe do Marketing' });
    }

    // Tira da triagem ANTES de criar: dois cliques (ou duas abas) não alocam duas vezes.
    const { data: camp, error: eCamp } = await supabase.from('marketing_campanhas')
      .update({ status: 'ativa', triada_por: req.user.userId, prazo_entrega: v.prazo_entrega, updated_at: new Date().toISOString() })
      .eq('id', req.params.campanhaId).eq('status', 'triagem').is('deleted_at', null)
      .select('id, titulo, status, solicitacao_id, solicitante_id, prazo_entrega').maybeSingle();
    if (eCamp) throw eCamp;
    if (!camp) return res.status(409).json({ error: 'Este pedido não está mais em Pendentes (já foi alocado ou removido)' });

    let card;
    try {
      card = await criarTarefa({ card: v.card, itens: v.itens, extras: { campanha_id: camp.id }, userId: req.user.userId });
    } catch (e) {
      await supabase.from('marketing_campanhas')
        .update({ status: 'triagem', triada_por: null, triada_em: null, prazo_entrega: null }).eq('id', camp.id);
      throw e;
    }
    await avisarAtribuidos(card, [card.atribuido_a, ...v.itens.map(i => i.membro_id)]);
    await avisarPrazoAjustado(camp);
    res.status(201).json({ ok: true, card_id: card.id });
  } catch (e) {
    console.error('[MARKETING-LINHA] alocar:', e.message);
    res.status(500).json({ error: 'Não foi possível alocar o pedido', detalhe: e.message });
  }
});

// "+ Nova tarefa" do Pedro → Interno (sem solicitante, sem entrega final).
router.post('/tarefas', authorizeModule('marketing', 1), async (req, res) => {
  try {
    if (!(await exigirLider(req, res))) return;
    const v = A.validarNovaTarefa(req.body, { modo: 'interna' });
    if (v.erro) return res.status(400).json({ error: v.erro });
    if (!(await membrosAtivos([v.card.atribuido_a, ...v.itens.map(i => i.membro_id)]))) {
      return res.status(400).json({ error: 'Alguém escolhido não está ativo na equipe do Marketing' });
    }
    const card = await criarTarefa({ card: v.card, itens: v.itens, extras: {}, userId: req.user.userId });
    await avisarAtribuidos(card, [card.atribuido_a, ...v.itens.map(i => i.membro_id)]);
    res.status(201).json({ ok: true, card_id: card.id });
  } catch (e) {
    console.error('[MARKETING-LINHA] nova tarefa:', e.message);
    res.status(500).json({ error: 'Não foi possível criar a tarefa', detalhe: e.message });
  }
});

// Editar título, responsável, prioridade, culto, descrição, itens e entrega final.
router.patch('/tarefas/:id', authorizeModule('marketing', 1), async (req, res) => {
  try {
    if (!(await exigirLider(req, res))) return;
    const { data: card, error: eCard } = await supabase.from('marketing_kanban_cards')
      .select(CARD_COLS).eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (eCard) throw eCard;
    if (!card) return res.status(404).json({ error: 'Tarefa não encontrada' });
    const { data: itensAtuais, error: eIt } = await supabase.from('marketing_card_checklist')
      .select(ITEM_COLS).eq('card_id', card.id);
    if (eIt) throw eIt;
    let camp = null;
    if (card.campanha_id) {
      const { data, error } = await supabase.from('marketing_campanhas')
        .select('id, titulo, solicitacao_id, solicitante_id, prazo_entrega').eq('id', card.campanha_id).maybeSingle();
      if (error) throw error;
      camp = data;
    }
    if (req.body?.prazo_entrega !== undefined && !camp) {
      return res.status(400).json({ error: 'Só pedido do formulário tem entrega final' });
    }

    const v = A.validarEdicao(req.body, {
      itens: itensAtuais || [], atribuido_a: card.atribuido_a,
      prazo_entrega: camp?.prazo_entrega ? L.dataSP(camp.prazo_entrega) : null,
    });
    if (v.erro) return res.status(400).json({ error: v.erro });
    const pessoas = [v.card.atribuido_a, ...v.atualizar.map(a => a.campos.membro_id), ...v.novos.map(n => n.membro_id)];
    if (!(await membrosAtivos(pessoas))) {
      return res.status(400).json({ error: 'Alguém escolhido não está ativo na equipe do Marketing' });
    }

    const estadoAntes = card.estado;
    if (Object.keys(v.card).length) {
      const upd = { ...v.card, atualizado_por: req.user.userId };
      if (v.card.data_fim !== undefined) upd.prazo_producao = prazoProducao(v.card.data_fim);
      const { error } = await supabase.from('marketing_kanban_cards').update(upd).eq('id', card.id);
      if (error) throw error;
    }
    for (const a of v.atualizar) {
      if (!Object.keys(a.campos).length) continue;
      const { error } = await supabase.from('marketing_card_checklist').update(a.campos).eq('id', a.id).eq('card_id', card.id);
      if (error) throw error;
    }
    if (v.novos.length) {
      const base = Math.max(-1, ...(itensAtuais || []).map(i => i.ordem ?? 0)) + 1;
      const { error } = await supabase.from('marketing_card_checklist')
        .insert(v.novos.map((n, k) => ({ ...n, card_id: card.id, feito: false, ordem: base + k })));
      if (error) throw error;
    }
    if (v.remover.length) {
      const { error } = await supabase.from('marketing_card_checklist').delete().in('id', v.remover).eq('card_id', card.id);
      if (error) throw error;
      // Remover o último item aberto pode completar o checklist → o gatilho fecha o card.
      await avisarSeChecklistConcluiu(card.id, estadoAntes);
    }
    if (v.prazo_entrega !== undefined && camp) {
      const { data: c2, error } = await supabase.from('marketing_campanhas')
        .update({ prazo_entrega: v.prazo_entrega, updated_at: new Date().toISOString() })
        .eq('id', camp.id).select('id, titulo, solicitacao_id, solicitante_id, prazo_entrega').single();
      if (error) throw error;
      if (L.dataSP(camp.prazo_entrega) !== v.prazo_entrega) await avisarPrazoAjustado(c2);
    }

    // Avisa só quem ENTROU agora (dono novo ou item novo/realocado).
    const antes = new Set([card.atribuido_a, ...(itensAtuais || []).map(i => i.membro_id)].filter(Boolean));
    const entraram = pessoas.filter(p => p && !antes.has(p));
    if (entraram.length) await avisarAtribuidos({ ...card, ...v.card }, entraram);
    res.json({ ok: true });
  } catch (e) {
    console.error('[MARKETING-LINHA] editar tarefa:', e.message);
    res.status(500).json({ error: 'Não foi possível salvar a tarefa', detalhe: e.message });
  }
});

module.exports = router;
