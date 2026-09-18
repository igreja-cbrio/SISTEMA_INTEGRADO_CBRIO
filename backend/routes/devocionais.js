// ============================================================================
// Devocionais (Gap 3) - tracking pessoal/familiar/grupo
// Alimenta KID-04 (famílias com devocionais) via mem_devocionais.
// ============================================================================

const router = require('express').Router();
const { authenticate, authorizeModule } = require('../middleware/auth'); // varredura 2026-09: A04 — o arquivo inteiro era só `authenticate`.
const { supabase } = require('../utils/supabase');
// varredura 2026-09: A04 — `_` e `%` são CURINGA no `ilike` do PostgREST; sem escapar, um
// e-mail com `_` (comum: `maria_silva@…`) casaria com QUALQUER caractere naquela posição e
// arrastaria o cadastro de outra pessoa pro conjunto de "quem sou eu". É o MESMO escape que
// o lookup do front usa (`membroMatch.buscarCandidatos`).
const { escapePostgrestValue } = require('../utils/sanitize');

router.use(authenticate);

// varredura 2026-09: A04 — prática devocional por pessoa é convicção religiosa (LGPD art. 11)
// e antes qualquer logado lia/gravava/apagava em nome de qualquer membro_id.
// Régua: o DONO faz o próprio; para MEXER NO DE OUTRA PESSOA vale a matriz.
// ⚠️ Guard POR ROTA (nunca `router.use`): as rotas agregadas (/kpis, /stats) têm régua
// mais baixa que as nominais, e um `router.use` achataria as duas na mesma.
const guardLerDeTerceiro   = authorizeModule('devocionais', 2); // histórico NOMINAL de outra pessoa
const guardAgregado        = authorizeModule('devocionais', 1); // só contagem, sem nome
const guardGerirDeTerceiro = authorizeModule('devocionais', 3); // gravar/editar/apagar de outra pessoa

// varredura 2026-09: A04 — o CONJUNTO de membros que este login alcança. Ela NÃO espelha o
// lookup do front (`GET /pessoas/lookup` → `buscarCandidatos`, que é um matcher com
// pontuação sobre cpf/telefone/e-mail e devolve o mais provável): aqui a régua é outra e é
// deliberadamente mais estreita — só o e-mail do login, exato, sobre cadastro vivo.
// ⚠️⚠️ Devolve TODOS, nunca "um": escolher um com `.limit(1)` sem `order` deixava o
// desempate a cargo do PostgREST, e como as duas resoluções (esta e a do front) podem
// apontar membros DIFERENTES, o `DevocionalPanel` mandava o `membro_id` da escolha DELE, o
// guard comparava com a escolha DAQUI, dava diferente e a pessoa tomava 403 ao salvar o
// PRÓPRIO devocional. Medido: 44 e-mails repetidos alcançam 89 membros em produção.
async function membroIdsDoUsuario(req) {
  // varredura 2026-09: A04 — SOMA, nunca curto-circuito. O `profiles.membro_id` entra no
  // conjunto, não o substitui: o front resolve o dono por conta própria
  // (`DevocionalPanel.tsx` → `pessoas.lookup` → `buscarCandidatos`), e esse resolvedor é
  // MAIS LARGO que este — ele também acha por contato SECUNDÁRIO e ranqueia por score
  // entre cadastros que dividem o e-mail. Retornar só o `membro_id` do profile fazia a
  // promessa de "devolve TODOS" valer para umas contas e não para outras, e nessas a
  // pessoa voltava a tomar 403 ao salvar o próprio devocional.
  const ids = new Set();
  if (req.user?.membro_id) ids.add(String(req.user.membro_id));
  const email = String(req.user?.email || '').trim().toLowerCase();
  if (!email) return [...ids];
  const { data, error } = await supabase
    .from('mem_membros')
    .select('id')
    // varredura 2026-09: A04 — `.ilike` continua (o e-mail no cadastro tem caixa MISTA e
    // `.eq` sobre o minúsculo perderia quem está gravado com maiúscula), mas agora com o
    // valor ESCAPADO — sem isso `_` e `%` do e-mail viram curinga.
    .ilike('email', escapePostgrestValue(email))
    // varredura 2026-09: A04 — era `.eq('active', true)`, régua MAIS ESTREITA que a do front
    // (o lookup do DevocionalPanel não olha `active`): o membro inativo deixava de ser
    // reconhecido como dono, caía na matriz e tomava 403 na própria lista.
    .is('deleted_at', null);
  // varredura 2026-09: A04 — erro PROPAGA pro `catch` do guard, que cai na matriz. Antes o
  // `error` era descartado e "a consulta falhou" virava "não é dono" em silêncio.
  if (error) throw error;
  for (const m of data || []) if (m.id) ids.add(String(m.id));
  return [...ids];
}

// varredura 2026-09: A04 — LEITURA: se o alvo está no conjunto do login, passa; senão vale a
// matriz. Conjunto (e não igualdade com UM escolhido) porque o alvo pode ser qualquer um dos
// cadastros que compartilham o e-mail do login.
async function soDonoOuMatriz(req, res, next) {
  try {
    const alvo = req.params.id || req.query.membro_id || null;
    if (alvo) {
      const meus = await membroIdsDoUsuario(req);
      if (meus.includes(String(alvo))) return next();
    }
  } catch (e) {
    console.error('devocionais posse (leitura):', e.message); // fail-closed: cai na matriz
  }
  return guardLerDeTerceiro(req, res, next);
}

// varredura 2026-09: A04 — POST: registrar PRA SI passa; em nome de terceiro exige nível 3.
async function escritaSoDoDono(req, res, next) {
  try {
    const meus = await membroIdsDoUsuario(req);
    const alvo = req.body?.membro_id ? String(req.body.membro_id) : null;
    // ⚠️ só marca o dono no caminho "pra si": se marcasse sempre, o gestor de nível 3
    // gravaria no PRÓPRIO nome o devocional que ele está registrando pra outra pessoa.
    // ⚠️⚠️ E o carimbo só existe quando o conjunto tem UM membro: com dois ou mais, "pra si"
    // é ambíguo e escolher por nós gravaria o devocional no cadastro errado — em silêncio,
    // porque o 201 chega igual.
    if (meus.length === 1 && (!alvo || alvo === meus[0])) {
      req.devocionalMembroId = meus[0];
      return next();
    }
    // varredura 2026-09: A04 — conjunto ambíguo: exige o `membro_id` EXPLÍCITO do body (o que
    // o front já manda, resolvido pelo lookup) e confere pertinência. Sem carimbo: quem
    // decide é o body, e o guard só atesta que aquele alvo é alcançável por este login.
    if (meus.length > 1 && alvo && meus.includes(alvo)) return next();
  } catch (e) {
    console.error('devocionais posse (escrita):', e.message); // fail-closed: cai na matriz
  }
  return guardGerirDeTerceiro(req, res, next);
}

// varredura 2026-09: A04 — PUT/DELETE: carrega a linha e confere POSSE antes de deixar passar.
async function registroSoDoDono(req, res, next) {
  let linha = null;
  try {
    const { data, error } = await supabase
      .from('mem_devocionais')
      .select('id, membro_id')
      .eq('id', req.params.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    linha = data;
    if (!linha) return res.status(404).json({ error: 'Devocional não encontrado' });
    // varredura 2026-09: A04 — o dono da LINHA tem de estar no conjunto do login (não bastava
    // igualar com um membro escolhido a esmo: o devocional pode estar no outro cadastro que
    // compartilha o mesmo e-mail, e a pessoa não conseguiria editar o próprio registro).
    const meus = await membroIdsDoUsuario(req);
    if (linha.membro_id && meus.includes(String(linha.membro_id))) return next();
  } catch (e) {
    console.error('devocionais posse (registro):', e.message); // fail-closed: cai na matriz
  }
  return guardGerirDeTerceiro(req, res, next);
}

// ─────────────────────────────────────────────────────────────
// GET /api/devocionais — lista paginada com filtros
// query: ?membro_id=&tipo=&desde=&ate=&page=&limit=
// ─────────────────────────────────────────────────────────────
// varredura 2026-09: A04 — a lista traz NOME e foto do membro; sem `membro_id` próprio, vale a matriz.
router.get('/', soDonoOuMatriz, async (req, res) => {
  try {
    const { membro_id, tipo, desde, ate, page = 1, limit = 50 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let q = supabase
      .from('mem_devocionais')
      .select('*, mem_membros(nome, foto_url)', { count: 'exact' })
      .is('deleted_at', null) // varredura 2026-09: A04 — o DELETE virou soft; sem isto o apagado continuaria na lista.
      .order('data_devocional', { ascending: false })
      .range(offset, offset + Number(limit) - 1);

    if (membro_id) q = q.eq('membro_id', membro_id);
    if (tipo) q = q.eq('tipo', tipo);
    if (desde) q = q.gte('data_devocional', desde);
    if (ate) q = q.lte('data_devocional', ate);

    const { data, count, error } = await q;
    if (error) throw error;
    res.json({ data: data || [], total: count || 0 });
  } catch (e) {
    console.error('devocionais list:', e.message);
    res.status(500).json({ error: 'Erro ao listar devocionais' });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/devocionais/membro/:id — histórico de um membro
// ─────────────────────────────────────────────────────────────
// varredura 2026-09: A04 — histórico devocional nominal: o próprio membro, ou a matriz (nível 2).
router.get('/membro/:id', soDonoOuMatriz, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 90, 366);
    const { data, error } = await supabase
      .from('mem_devocionais')
      .select('*, devocional_itens(id, titulo, passagem)')
      .is('deleted_at', null) // varredura 2026-09: A04 — não contar/mostrar o que foi soft-deletado.
      .eq('membro_id', req.params.id)
      .order('data_devocional', { ascending: false })
      .limit(limit);
    if (error) throw error;

    const rows = data || [];

    // Sequência atual: dias consecutivos com check-in terminando hoje ou ontem
    const dias = new Set(rows.map(r => r.data_devocional));
    let streak = 0;
    const umDia = 86400000;
    let cursor = new Date();
    const fmt = (d) => d.toISOString().slice(0, 10);
    if (!dias.has(fmt(cursor))) cursor = new Date(cursor.getTime() - umDia);
    while (dias.has(fmt(cursor))) {
      streak++;
      cursor = new Date(cursor.getTime() - umDia);
    }

    const { count: total } = await supabase
      .from('mem_devocionais')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null) // varredura 2026-09: A04 — o total tem de bater com a lista acima.
      .eq('membro_id', req.params.id);

    const inicioMes = new Date();
    inicioMes.setDate(1);
    const noMes = rows.filter(r => r.data_devocional >= fmt(inicioMes)).length;

    res.json({ data: rows, resumo: { total: total || 0, streak, no_mes: noMes } });
  } catch (e) {
    console.error('devocionais membro:', e.message);
    res.status(500).json({ error: 'Erro ao buscar devocionais do membro' });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/devocionais/kpis — arquitetura KPI/OKR do devocional
//   Resumo do mês + séries + KPIs DEV-* (matriz Investir) + KRs ligados.
// ─────────────────────────────────────────────────────────────
// varredura 2026-09: A04 — só números (sem nome), então nível 1: a régua do agregado, igual censo.
router.get('/kpis', guardAgregado, async (req, res) => {
  try {
    const hoje = new Date();
    const fmt = (d) => d.toISOString().slice(0, 10);
    const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const d30 = new Date(hoje.getTime() - 29 * 86400000);
    const m6 = new Date(hoje.getFullYear(), hoje.getMonth() - 5, 1);

    // Check-ins dos últimos 6 meses (paginado · cap 1000 do PostgREST)
    const rows = [];
    let offset = 0;
    const pageSize = 1000;
    while (true) {
      const { data, error } = await supabase
        .from('mem_devocionais')
        .select('membro_id, data_devocional, tipo, mem_membros(familia_id)')
        .is('deleted_at', null) // varredura 2026-09: A04 — KPI não conta check-in soft-deletado.
        .gte('data_devocional', fmt(m6))
        .order('data_devocional', { ascending: true })
        .order('id', { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      rows.push(...data);
      if (data.length < pageSize) break;
      offset += pageSize;
    }

    const inicioMesStr = fmt(inicioMes);
    const d30Str = fmt(d30);

    const mesAtual = { checkins: 0, pessoas: new Set(), familias: new Set() };
    const porDia = {};
    const porMes = {};
    for (const r of rows) {
      const mes = r.data_devocional.slice(0, 7);
      porMes[mes] = porMes[mes] || { checkins: 0, pessoas: new Set() };
      porMes[mes].checkins++;
      if (r.membro_id) porMes[mes].pessoas.add(r.membro_id);
      if (r.data_devocional >= d30Str) {
        porDia[r.data_devocional] = (porDia[r.data_devocional] || 0) + 1;
      }
      if (r.data_devocional >= inicioMesStr) {
        mesAtual.checkins++;
        if (r.membro_id) mesAtual.pessoas.add(r.membro_id);
        if (r.tipo === 'familiar' && r.mem_membros?.familia_id) mesAtual.familias.add(r.mem_membros.familia_id);
      }
    }

    const serieDiaria = [];
    for (let i = 29; i >= 0; i--) {
      const d = fmt(new Date(hoje.getTime() - i * 86400000));
      serieDiaria.push({ data: d, checkins: porDia[d] || 0 });
    }
    const serieMensal = Object.keys(porMes).sort().map(m => ({
      mes: m, checkins: porMes[m].checkins, pessoas: porMes[m].pessoas.size,
    }));

    // KPIs da matriz (DEV-*) + status da view oficial
    const { data: kpis } = await supabase
      .from('kpi_indicadores_taticos')
      .select('id, indicador, descricao, periodicidade, meta_valor, valores, area, fonte_auto')
      .like('id', 'DEV-%')
      .eq('ativo', true);
    const ids = (kpis || []).map(k => k.id);
    let trajetoria = [];
    if (ids.length) {
      const { data: tr } = await supabase
        .from('vw_kpi_trajetoria_atual')
        .select('kpi_id, ultimo_valor, ultimo_periodo, status, percentual_meta')
        .in('kpi_id', ids);
      trajetoria = tr || [];
    }
    const trMap = new Map(trajetoria.map(t => [t.kpi_id, t]));

    // OKR: objetivo + KRs do devocional (medidos via fonte_kpi_id)
    const { data: objetivo } = await supabase
      .from('kpi_objetivos_gerais')
      .select('id, nome, meta_descricao')
      .eq('id', '576c04ec-88a2-40f3-6ba2-9d03fe65de96')
      .maybeSingle();
    const { data: krs } = await supabase
      .from('kpi_krs')
      .select('id, titulo, meta_valor, meta_texto, unidade, fonte_kpi_id, ativo, kr_pai_id')
      .eq('objetivo_geral_id', '576c04ec-88a2-40f3-6ba2-9d03fe65de96')
      .eq('ativo', true)
      .is('kr_pai_id', null);

    const diasNoMes = hoje.getDate();
    res.json({
      mes_atual: {
        checkins: mesAtual.checkins,
        pessoas: mesAtual.pessoas.size,
        familias: mesAtual.familias.size,
        media_dia: diasNoMes ? Math.round((mesAtual.checkins / diasNoMes) * 10) / 10 : 0,
      },
      serie_diaria: serieDiaria,
      serie_mensal: serieMensal,
      kpis: (kpis || []).map(k => ({ ...k, trajetoria: trMap.get(k.id) || null })),
      okr: {
        objetivo: objetivo || null,
        krs: (krs || []).map(k => {
          const t = k.fonte_kpi_id ? trMap.get(k.fonte_kpi_id) : null;
          return { ...k, realizado: t?.ultimo_valor ?? null, realizado_periodo: t?.ultimo_periodo ?? null, kr_status: t?.status ?? 'sem_dado' };
        }),
      },
    });
  } catch (e) {
    console.error('devocionais kpis:', e.message);
    res.status(500).json({ error: 'Erro ao calcular KPIs do devocional' });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/devocionais/stats — agregados para dashboard
// query: ?desde=&ate=
// ─────────────────────────────────────────────────────────────
// varredura 2026-09: A04 — agregado do dashboard (sem nome): nível 1, mesma régua do /kpis.
router.get('/stats', guardAgregado, async (req, res) => {
  try {
    const { desde, ate } = req.query;
    const hoje = new Date().toISOString().slice(0, 10);
    const d30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const inicio = desde || d30;
    const fim = ate || hoje;

    const { data } = await supabase
      .from('mem_devocionais')
      .select('membro_id, tipo, mem_membros(familia_id)')
      .is('deleted_at', null) // varredura 2026-09: A04 — agregado não conta check-in soft-deletado.
      .gte('data_devocional', inicio)
      .lte('data_devocional', fim);

    const rows = data || [];
    const familias = new Set();
    const membros = new Set();
    const porTipo = { pessoal: 0, familiar: 0, grupo: 0 };

    rows.forEach(r => {
      membros.add(r.membro_id);
      if (porTipo[r.tipo] !== undefined) porTipo[r.tipo]++;
      const fid = r.mem_membros?.familia_id;
      if (r.tipo === 'familiar' && fid) familias.add(fid);
    });

    res.json({
      periodo: { inicio, fim },
      total_registros: rows.length,
      familias_com_devocional_familiar: familias.size,
      membros_com_devocional: membros.size,
      por_tipo: porTipo,
    });
  } catch (e) {
    console.error('devocionais stats:', e.message);
    res.status(500).json({ error: 'Erro ao calcular stats' });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/devocionais — registrar 1 devocional
// body: { membro_id, data_devocional?, tipo, topico?, observações? }
// ─────────────────────────────────────────────────────────────
// varredura 2026-09: A04 — registrar em nome de terceiro (inflar o KID-04) agora exige nível 3.
router.post('/', escritaSoDoDono, async (req, res) => {
  try {
    const { data_devocional, tipo, topico, observacoes } = req.body || {};
    // varredura 2026-09: A04 — pra si, o membro é o do LOGIN (o body não decide); só quem
    // passou pelo guard de nível 3 escreve em nome de outra pessoa.
    const membro_id = req.devocionalMembroId || req.body?.membro_id;
    if (!membro_id) return res.status(400).json({ error: 'membro_id obrigatorio' });
    if (!tipo || !['pessoal', 'familiar', 'grupo'].includes(tipo)) {
      return res.status(400).json({ error: "tipo deve ser 'pessoal', 'familiar' ou 'grupo'" });
    }

    const payload = {
      membro_id,
      data_devocional: data_devocional || new Date().toISOString().slice(0, 10),
      tipo,
      topico: topico || null,
      observacoes: observacoes || null,
      created_by: req.user?.id || null,
    };

    const { data, error } = await supabase
      .from('mem_devocionais')
      .insert(payload)
      .select()
      .single();

    if (error) {
      // 23505 = unique violation (mesmo membro+data+tipo)
      if (error.code === '23505') {
        // varredura 2026-09: A04 — RESSUSCITAR. O DELETE virou soft, mas `uq_mem_devocionais_dia`
        // (migration 20260430130000, linha 59) NÃO é índice parcial: não tem `WHERE deleted_at
        // IS NULL`, então a linha apagada CONTINUA ocupando (membro_id, data_devocional, tipo).
        // Sem este ramo, quem removesse o próprio devocional de hoje nunca mais conseguiria
        // salvar naquela data: a lista (que filtra `deleted_at`) aparece vazia e o POST responde
        // 409 "já registrado" — a tela dizendo duas coisas contrárias. Com DELETE físico isso
        // não acontecia, então a trilha não pode custar o fluxo: se a linha está morta, revive.
        const { data: conflito } = await supabase
          .from('mem_devocionais')
          .select('id, deleted_at')
          .eq('membro_id', payload.membro_id)
          .eq('data_devocional', payload.data_devocional)
          .eq('tipo', payload.tipo)
          .limit(1)
          .maybeSingle();

        if (conflito?.deleted_at) {
          const { data: revivido, error: erroRevive } = await supabase
            .from('mem_devocionais')
            .update({
              deleted_at: null,
              topico: payload.topico,
              observacoes: payload.observacoes,
              created_by: payload.created_by,
              // varredura 2026-09: A04 — a linha tem de voltar como o INSERT acima a criaria, e o
              // UPDATE só reescreve o que ele lista: toda coluna omitida sobrevive ao apagamento.
              // `concluida: true` é o default da tabela — sem ele, um `concluida: false` gravado
              // antes do DELETE voltaria junto.
              concluida: true,
              // varredura 2026-09: A04 — mesmo motivo, e este é o caso que MENTE em número: o
              // check-in do app amarra `devocional_item_id` a um item do plano; apagado no web e
              // recriado por aqui (o POST do web NUNCA manda item), a linha voltava com o item
              // ANTIGO colado e a adesão do plano contava um item que a pessoa não escolheu de
              // novo. `null` é o default da coluna — é o que o insert teria gravado.
              devocional_item_id: null,
            })
            .eq('id', conflito.id)
            // varredura 2026-09: A04 — trava de corrida: se alguém reviveu a linha entre a
            // leitura e este UPDATE, nenhuma volta e caímos no 409 abaixo, sem sobrescrever vivo.
            .not('deleted_at', 'is', null)
            .select()
            .maybeSingle();
          if (erroRevive) throw erroRevive;
          // varredura 2026-09: A04 — pro cliente é criação: mesmo 201, mesmo corpo do insert.
          if (revivido) return res.status(201).json(revivido);
        }

        // varredura 2026-09: A04 — só é conflito de verdade se a linha existe e está VIVA.
        return res.status(409).json({ error: 'Devocional já registrado para esse membro/dia/tipo' });
      }
      throw error;
    }
    res.status(201).json(data);
  } catch (e) {
    console.error('devocionais create:', e.message);
    res.status(500).json({ error: 'Erro ao registrar devocional' });
  }
});

// ─────────────────────────────────────────────────────────────
// PUT /api/devocionais/:id
// ─────────────────────────────────────────────────────────────
// varredura 2026-09: A04 — editar o devocional de outra pessoa exige nível 3 (posse conferida no guard).
router.put('/:id', registroSoDoDono, async (req, res) => {
  try {
    const { tipo, topico, observacoes, concluida } = req.body || {};
    const patch = {};
    if (tipo !== undefined) {
      if (!['pessoal', 'familiar', 'grupo'].includes(tipo)) {
        return res.status(400).json({ error: 'tipo invalido' });
      }
      patch.tipo = tipo;
    }
    if (topico !== undefined) patch.topico = topico;
    if (observacoes !== undefined) patch.observacoes = observacoes;
    if (concluida !== undefined) patch.concluida = !!concluida;

    const { data, error } = await supabase
      .from('mem_devocionais')
      .update(patch)
      .eq('id', req.params.id)
      .is('deleted_at', null) // varredura 2026-09: A04 — não ressuscitar/editar linha já apagada.
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('devocionais update:', e.message);
    res.status(500).json({ error: 'Erro ao atualizar devocional' });
  }
});

// ─────────────────────────────────────────────────────────────
// DELETE /api/devocionais/:id
// ─────────────────────────────────────────────────────────────
// varredura 2026-09: A04 — apagar o devocional de outra pessoa exige nível 3 (posse conferida no guard).
router.delete('/:id', registroSoDoDono, async (req, res) => {
  try {
    // varredura 2026-09: A04 — era DELETE FÍSICO numa tabela da whitelist de soft-delete
    // (migration 20260521180000, `app_soft_deletable_tables`): apagava sem trilha e sem volta.
    const { error } = await supabase.rpc('app_soft_delete', {
      p_table_name: 'mem_devocionais',
      p_row_id: req.params.id,
      p_deleted_by: req.user?.id ?? null,
    });
    if (error) throw error;
    res.status(204).end();
  } catch (e) {
    console.error('devocionais delete:', e.message);
    res.status(500).json({ error: 'Erro ao deletar devocional' });
  }
});

module.exports = router;
