// ============================================================================
// /api/gestao/* — Painel administrativo do PMO (Marcos + Matheus + Eduardo)
//
// 3 abas:
//   - Pulso        → quem esta atrasado, KPIs cronicamente vermelhos, calendário
//   - Configurar   → reusa /api/estrategia/* e /api/notificacao-regras/*
//   - Saúde        → health check do sistema (KPIs sem meta, sem dono, etc)
// ============================================================================

const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { classificar, periodosFechados } = require('../services/kpiPontualidade');

router.use(authenticate);
router.use(authorize('admin', 'diretor'));

// Janela de cobrança: 3 períodos fechados do PRÓPRIO KPI (3 meses pro mensal,
// 3 semanas pro semanal, 3 trimestres pro trimestral). Substitui a janela fixa
// de 60 dias, que era alarme garantido pros 28 trimestrais/semestrais/anual e
// silêncio de 8 semanas pros 21 semanais.
const JANELA = 3;

// `kpi_registros` já passou de 2.700 linhas e o limite default do supabase-js é
// 1.000: sem paginar, a cobertura sairia subestimada e a tela acusaria líder
// que preencheu. Cobrança errada só se gasta uma vez.
async function paginado(tabela, colunas, aplicaFiltro) {
  const PAGINA = 1000;
  let saida = [];
  let inicio = 0;
  for (;;) {
    let q = supabase.from(tabela).select(colunas).range(inicio, inicio + PAGINA - 1);
    if (aplicaFiltro) q = aplicaFiltro(q);
    const { data, error } = await q;
    if (error) return { data: saida, error };
    saida = saida.concat(data || []);
    if (!data || data.length < PAGINA) break;
    inicio += PAGINA;
  }
  return { data: saida, error: null };
}

const pct = (parte, total) => (total > 0 ? Math.round((parte / total) * 1000) / 10 : 0);

// Soma a classificação de um KPI num acumulador (líder, área ou total geral).
// Existe pra as três contagens saírem da MESMA régua — três laços parecidos é
// como o líder, a área e o total passariam a discordar entre si.
function acumular(alvo, classe) {
  if (!classe) return alvo;
  alvo.total_kpis++;
  alvo.slots += classe.slots;
  alvo.slots_preenchidos += classe.preenchidos;
  if (classe.pontualidade === 'em_dia') alvo.pont_em_dia++;
  else if (classe.pontualidade === 'atrasado') alvo.pont_atrasado++;
  else alvo.pont_nunca++;
  if (classe.desempenho === 'no_alvo') alvo.des_no_alvo++;
  else if (classe.desempenho === 'abaixo') alvo.des_abaixo++;
  else if (classe.desempenho === 'nao_julgavel') alvo.des_nao_julgavel++;
  else if (classe.desempenho === 'sem_meta') alvo.des_sem_meta++;
  if (classe.fonte !== 'viva') alvo.fonte_morta++;
  return alvo;
}

// Índice { kpi_id: { '2026-08': valor } } com os DOIS caminhos de valor —
// preenchimento manual (`kpi_registros`) e fórmula (`kpi_valores_calculados`).
// Ler só um faz a tela mentir: foi o bug que acusava ~127 "sem registro" quando
// o número real era ~23.
function indexarValores({ registros, calculados }) {
  const valores = {};
  const ultimoCalculo = {};
  (registros || []).forEach(r => {
    if (r.valor_realizado == null) return;
    (valores[r.indicador_id] = valores[r.indicador_id] || {})[r.periodo_referencia] = Number(r.valor_realizado);
  });
  (calculados || []).forEach(c => {
    const atual = ultimoCalculo[c.kpi_id];
    if (!atual || String(c.periodo_referencia) > String(atual.periodo_referencia)) ultimoCalculo[c.kpi_id] = c;
    if (c.valor_calculado == null) return;
    (valores[c.kpi_id] = valores[c.kpi_id] || {})[c.periodo_referencia] = Number(c.valor_calculado);
  });
  return { valores, ultimoCalculo };
}

// ----------------------------------------------------------------------------
// GET /pulso - dashboard de operação do PMO
// ----------------------------------------------------------------------------
router.get('/pulso', async (req, res) => {
  try {
    const { data: kpis } = await supabase
      .from('kpi_indicadores_taticos')
      .select('id, indicador, area, valores, periodicidade, is_okr, lider_funcionario_id, sentido_meta, ativo')
      .eq('ativo', true);

    const { data: trajs } = await supabase
      .from('vw_kpi_trajetoria_atual')
      .select('kpi_id, status_trajetoria, ultimo_periodo, ultimo_valor, percentual_meta, meta_periodo');
    const trajByKpi = {};
    (trajs || []).forEach(t => { trajByKpi[t.kpi_id] = t; });

    // ── A régua de PONTUALIDADE (04/09/2026) ───────────────────────────────
    // Antes esta rota classificava líder por `status_trajetoria`, que responde
    // "bateu a meta?" — e chamava o resultado de "% em dia". Eram duas
    // perguntas na mesma luz: quem parou de preencher ficava invisível
    // enquanto o último número dele fosse bom (medidos 6 KPIs "no alvo" com
    // dado de 2+ períodos atrás, um deles de maio).
    const [regsRes, calcRes] = await Promise.all([
      paginado('kpi_registros', 'indicador_id, periodo_referencia, valor_realizado'),
      paginado('kpi_valores_calculados', 'kpi_id, periodo_referencia, valor_calculado'),
    ]);
    // ⚠️ Falha de leitura NÃO pode virar "esse líder não preencheu". Quando uma
    // das fontes falha, a rota DECLARA a cobertura como incompleta e a tela não
    // mostra ranking — igual ao bloco de saúde.
    const coberturaIncompleta = !!regsRes.error || !!calcRes.error;
    const { valores, ultimoCalculo } = indexarValores({
      registros: regsRes.data,
      calculados: calcRes.data,
    });

    const agora = new Date();
    const classePorKpi = {};
    (kpis || []).forEach(k => {
      classePorKpi[k.id] = classificar({
        kpi: k,
        valoresPorPeriodo: valores[k.id] || {},
        temLinhaCalculada: !!ultimoCalculo[k.id],
        ultimoCalculoNulo: !!ultimoCalculo[k.id] && ultimoCalculo[k.id].valor_calculado == null,
        metaPeriodo: trajByKpi[k.id]?.meta_periodo ?? null,
        janela: JANELA,
        hoje: agora,
      });
    });

    // ── 1 · LÍDERES · duas contas SEPARADAS ────────────────────────────────
    // `percentual_em_dia` (o nome antigo) media DESEMPENHO e se chamava "em
    // dia". Agora são dois números com nomes honestos: cobertura = preencheu?
    // no_alvo = bateu a meta? Misturá-los é o que fazia o PMO cobrar dado de
    // quem preencheu e não cobrar quem parou.
    const liderIds = [...new Set((kpis || []).map(k => k.lider_funcionario_id).filter(Boolean))];
    const { data: lideres } = liderIds.length > 0 ? await supabase
      .from('rh_funcionarios')
      .select('id, nome, cargo, area')
      .in('id', liderIds) : { data: [] };
    const lideresMap = {};
    (lideres || []).forEach(l => { lideresMap[l.id] = l; });

    const zerado = () => ({
      total_kpis: 0,
      // preenchimento
      pont_em_dia: 0, pont_atrasado: 0, pont_nunca: 0,
      slots: 0, slots_preenchidos: 0,
      // desempenho (só do que é julgável)
      des_no_alvo: 0, des_abaixo: 0, des_nao_julgavel: 0, des_sem_meta: 0,
      // engenharia
      fonte_morta: 0,
    });

    const lideresStat = {};
    (kpis || []).forEach(k => {
      if (!k.lider_funcionario_id) return;
      if (!lideresStat[k.lider_funcionario_id]) {
        const l = lideresMap[k.lider_funcionario_id] || { nome: 'Sem nome', cargo: '', area: '' };
        lideresStat[k.lider_funcionario_id] = { ...l, ...zerado() };
      }
      acumular(lideresStat[k.lider_funcionario_id], classePorKpi[k.id]);
    });

    const lideresList = Object.values(lideresStat)
      .map(l => ({
        ...l,
        percentual_cobertura: pct(l.slots_preenchidos, l.slots),
        percentual_no_alvo: pct(l.des_no_alvo, l.des_no_alvo + l.des_abaixo),
        // Ordena por PENDÊNCIA DE PREENCHIMENTO primeiro: é o que o PMO
        // consegue cobrar. Desempenho ruim com dado em dia é conversa de
        // gestão, não de cobrança.
        score: l.pont_nunca * 3 + l.pont_atrasado * 2 + l.des_abaixo,
      }))
      .sort((a, b) => b.score - a.score);

    // ── 2 · VENCIDOS · a fila de cobrança ─────────────────────────────────
    // KPI cujo último período FECHADO não tem valor E cuja fonte está viva.
    // Fonte morta sai daqui de propósito: cobrar o líder por fórmula que não
    // acha dado é a cobrança errada que queima a credibilidade da cobrança.
    const nomeLider = (id) => (id ? (lideresMap[id]?.nome || null) : null);
    const linhaKpi = (k) => ({
      kpi_id: k.id,
      indicador: k.indicador,
      area: k.area,
      is_okr: k.is_okr,
      periodicidade: k.periodicidade,
      dono: nomeLider(k.lider_funcionario_id),
      dono_id: k.lider_funcionario_id || null,
      ...classePorKpi[k.id],
      percentual_meta: trajByKpi[k.id]?.percentual_meta ?? null,
      ultimo_periodo: trajByKpi[k.id]?.ultimo_periodo ?? null,
    });

    const vencidos = (kpis || [])
      .filter(k => classePorKpi[k.id].fonte === 'viva' && classePorKpi[k.id].pontualidade !== 'em_dia')
      .map(linhaKpi)
      .sort((a, b) => (b.periodos_atraso ?? 0) - (a.periodos_atraso ?? 0));

    // Fila de ENGENHARIA, não de cobrança: a fórmula roda e não devolve valor,
    // ou o coletor nunca produziu linha nenhuma.
    const fonte_morta = (kpis || [])
      .filter(k => classePorKpi[k.id].fonte !== 'viva')
      .map(linhaKpi);

    // ── 3 · CRÔNICOS · agora é HISTÓRICO, não a foto de hoje ───────────────
    // O card dizia "cronicamente vermelhos" mostrando quem está vermelho
    // AGORA — o próprio comentário do código admitia ("refinamos depois com
    // histórico"). Crônico = os DOIS últimos períodos fechados abaixo da meta.
    const cronicos = (kpis || [])
      .filter(k => classePorKpi[k.id].cronico)
      .map(linhaKpi)
      .sort((a, b) => (a.percentual_meta ?? 999) - (b.percentual_meta ?? 999));

    // Abaixo da meta com dado RECENTE e confiável (é aqui que mora a conversa
    // de desempenho). Separado dos zeros de fonte vazia.
    const abaixo_da_meta = (kpis || [])
      .filter(k => classePorKpi[k.id].desempenho === 'abaixo')
      .map(linhaKpi)
      .sort((a, b) => (a.percentual_meta ?? 999) - (b.percentual_meta ?? 999));

    // ⚠️ Compatibilidade: o nome antigo continua na resposta apontando para os
    // crônicos, porque bundle em cache ainda lê `cronicamente_vermelhos`.
    const cronicamente = cronicos;

    // ── 4 · POR ÁREA · cobertura E desempenho ─────────────────────────────
    const areasStat = {};
    (kpis || []).forEach(k => {
      const a = String(k.area || 'sem_area').toLowerCase();
      if (!areasStat[a]) areasStat[a] = { area: a, ...zerado() };
      acumular(areasStat[a], classePorKpi[k.id]);
    });
    const areasList = Object.values(areasStat).map(a => ({
      ...a,
      total: a.total_kpis,
      percentual_cobertura: pct(a.slots_preenchidos, a.slots),
      percentual_no_alvo: pct(a.des_no_alvo, a.des_no_alvo + a.des_abaixo),
    })).sort((a, b) => a.percentual_cobertura - b.percentual_cobertura);

    // ── 5 · O TOTAL ───────────────────────────────────────────────────────
    const totalGeral = zerado();
    (kpis || []).forEach(k => acumular(totalGeral, classePorKpi[k.id]));

    res.json({
      total_kpis_ativos: kpis?.length || 0,
      lideres: lideresList,
      // nome antigo preservado + o honesto ao lado
      cronicamente_vermelhos: cronicamente,
      cronicos,
      abaixo_da_meta,
      vencidos,
      fonte_morta,
      areas: areasList,
      cobertura: {
        janela_periodos: JANELA,
        slots: totalGeral.slots,
        preenchidos: totalGeral.slots_preenchidos,
        pct: pct(totalGeral.slots_preenchidos, totalGeral.slots),
        // ⚠️ Bloco incompleto é DECLARADO: cobertura subestimada vira fila de
        // cobrança indevida, e cobrança errada só se gasta uma vez.
        incompleto: coberturaIncompleta,
        aviso: coberturaIncompleta
          ? 'Cobertura incompleta: falha ao ler os lançamentos. O ranking de preenchimento não é confiável nesta leitura.'
          : null,
      },
      pontualidade: {
        em_dia: totalGeral.pont_em_dia,
        atrasado: totalGeral.pont_atrasado,
        nunca: totalGeral.pont_nunca,
      },
      desempenho: {
        no_alvo: totalGeral.des_no_alvo,
        abaixo: totalGeral.des_abaixo,
        nao_julgavel: totalGeral.des_nao_julgavel,
        sem_meta: totalGeral.des_sem_meta,
      },
      fonte: {
        viva: totalGeral.total_kpis - totalGeral.fonte_morta,
        morta: totalGeral.fonte_morta,
      },
    });
  } catch (e) {
    console.error('gestao/pulso:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ----------------------------------------------------------------------------
// GET /saude - meta-monitoramento do próprio sistema OKR
// ----------------------------------------------------------------------------
router.get('/saude', async (req, res) => {
  try {
    const { data: kpis } = await supabase
      .from('kpi_indicadores_taticos')
      .select('id, indicador, descricao, area, valores, meta_descricao, meta_valor, meta_valor_absoluto, periodicidade, lider_funcionario_id, objetivo_geral_id, is_okr, ativo')
      .eq('ativo', true);

    // Apenas KPIs das 6 áreas oficiais (kids/ami/bridge/sede/online/cba) entram
    // nos checks de "sem objetivo geral" e "sem valor da jornada". KPIs cuja
    // área e ministério (integracao/grupos/cuidados/voluntariado/generosidade/next)
    // são processos do ministério · não precisam estar amarrados num objetivo
    // geral nem ter valor da jornada (Marcos: "não e erro ter um processo num
    // ministério e não no outro").
    const AREAS_OFICIAIS = ['kids', 'ami', 'bridge', 'sede', 'online', 'cba'];
    const isAreaOficial = (k) => AREAS_OFICIAIS.includes(String(k.area || '').toLowerCase());
    const kpisAreas = (kpis || []).filter(isAreaOficial);

    const sem_meta = (kpis || []).filter(k =>
      (k.meta_valor === null || k.meta_valor === undefined) &&
      (!k.meta_descricao || k.meta_descricao.trim() === '')
    );

    // ⚠️ `sem_meta` conta DESCRIÇÃO de meta como meta — e o farol não julga
    // descrição. Então "0 sem meta" convivia com 10 KPIs que a view marca
    // `sem_meta` por não terem número. São perguntas diferentes: uma é
    // "alguém escreveu a meta?", a outra é "dá pra dizer se bateu?".
    const meta_so_texto = (kpis || []).filter(k =>
      k.meta_valor == null && k.meta_valor_absoluto == null &&
      !!(k.meta_descricao && k.meta_descricao.trim())
    );

    const sem_dono = (kpis || []).filter(k => !k.lider_funcionario_id);
    const sem_objetivo = kpisAreas.filter(k => !k.objetivo_geral_id);
    const sem_valores = kpisAreas.filter(k => !Array.isArray(k.valores) || k.valores.length === 0);

    // Sem dado nos últimos 60 dias
    // ⚠️ São DUAS fontes de valor e ler só uma faz a tela mentir: KPI manual
    // grava em `kpi_registros`; KPI com fórmula (razao, delta_pct, soma_periodo,
    // delta_abs) grava em `kpi_valores_calculados`. Lendo só a primeira, a tela
    // acusava ~127 "sem registro" quando o número real de KPIs sem dado em lugar
    // nenhum era ~23 — e cobrar líder com base nisso queima a credibilidade da
    // cobrança. É o mesmo bug que o #2486 consertou no farol/score, espelhado.
    const dataLimite = new Date();
    dataLimite.setDate(dataLimite.getDate() - 60);
    const dataLimiteStr = dataLimite.toISOString().slice(0, 10);

    const [regsRes, calcRes] = await Promise.all([
      supabase
        .from('kpi_registros')
        .select('indicador_id')
        .gte('data_preenchimento', dataLimiteStr),
      supabase
        .from('kpi_valores_calculados')
        .select('kpi_id, valor_calculado')
        .gte('periodo_referencia', dataLimiteStr),
    ]);

    // ⚠️ Falha de consulta NÃO pode virar "esse KPI não tem dado" — seria
    // transformar instabilidade de banco em fila de cobrança indevida. Quando
    // uma das fontes falha, o bloco é DECLARADO como incompleto e não afirma.
    const fonteRegistrosOk = !regsRes.error;
    const fonteCalculadosOk = !calcRes.error;

    const comDado = new Set();
    (regsRes.data || []).forEach(r => comDado.add(r.indicador_id));
    // ⚠️ `valor_calculado IS NULL` NÃO conta como dado: a fórmula rodou e não
    // devolveu nada. Contar como "tem dado" esconderia o problema real (~66
    // KPIs que calculam nulo porque ninguém registra o evento de origem).
    const calculamNulo = new Set();
    (calcRes.data || []).forEach(v => {
      if (v.valor_calculado === null || v.valor_calculado === undefined) calculamNulo.add(v.kpi_id);
      else comDado.add(v.kpi_id);
    });

    const semDadoNenhum = (kpis || []).filter(k => !comDado.has(k.id));
    // Os que calculam nulo saem da lista de "ninguém preenche" — o problema
    // deles é a FONTE do dado (processo que não gera evento), não a cobrança.
    const sem_registro_60d = semDadoNenhum.filter(k => !calculamNulo.has(k.id));
    const calculam_nulo = semDadoNenhum.filter(k => calculamNulo.has(k.id));

    // Áreas com cobertura incompleta na matriz
    const VALORES = ['seguir', 'conectar', 'investir', 'servir', 'generosidade'];
    const matriz = {};
    (kpis || []).forEach(k => {
      const a = String(k.area || '').toLowerCase();
      (k.valores || []).forEach(v => {
        const key = `${a}:${v}`;
        matriz[key] = (matriz[key] || 0) + 1;
      });
    });

    const { data: areas } = await supabase
      .from('areas_kpi')
      .select('id, nome')
      .eq('ativa', true)
      .in('id', ['kids', 'bridge', 'ami', 'sede', 'online', 'cba']);

    const matrizCobertura = (areas || []).map(area => {
      const valoresCobertos = VALORES.filter(v => matriz[`${area.id}:${v}`] > 0);
      return {
        area: area.id,
        nome: area.nome,
        valores_cobertos: valoresCobertos,
        valores_faltantes: VALORES.filter(v => !valoresCobertos.includes(v)),
        completo: valoresCobertos.length === VALORES.length,
      };
    });

    // Direcionados sem objetivos vinculados, objetivos sem KPIs
    const { data: objetivos } = await supabase
      .from('kpi_objetivos_gerais')
      .select('id, nome, ativo')
      .eq('ativo', true);

    const objsComKpi = new Set((kpis || []).map(k => k.objetivo_geral_id).filter(Boolean));
    const objetivos_sem_kpis = (objetivos || []).filter(o => !objsComKpi.has(o.id));

    const summarize = (arr, fields) => arr.slice(0, 50).map(item => {
      const r = {};
      fields.forEach(f => { r[f] = item[f]; });
      return r;
    });

    res.json({
      total_kpis_ativos: kpis?.length || 0,
      sem_meta: {
        total: sem_meta.length,
        items: summarize(sem_meta, ['id', 'indicador', 'descricao', 'area']),
      },
      sem_dono: {
        total: sem_dono.length,
        items: summarize(sem_dono, ['id', 'indicador', 'descricao', 'area']),
      },
      sem_objetivo: {
        total: sem_objetivo.length,
        items: summarize(sem_objetivo, ['id', 'indicador', 'descricao', 'area']),
      },
      sem_valores: {
        total: sem_valores.length,
        items: summarize(sem_valores, ['id', 'indicador', 'descricao', 'area']),
      },
      sem_registro_60d: {
        total: sem_registro_60d.length,
        items: summarize(sem_registro_60d, ['id', 'indicador', 'descricao', 'area']),
        janela_dias: 60,
        fontes_lidas: ['kpi_registros', 'kpi_valores_calculados'],
        // ⚠️ Esta janela é FIXA e não sabe a periodicidade do KPI: pros 28
        // trimestrais/semestrais/anual 60 dias é alarme garantido, e pros 21
        // semanais deixa passar 8 semanas de silêncio. A fila de cobrança que
        // respeita a periodicidade é `vencidos`, em GET /gestao/pulso.
        janela_fixa: true,
        onde_esta_a_fila: 'GET /api/gestao/pulso -> vencidos',
        // Bloco incompleto é DECLARADO: número sem a ressalva ao lado vira
        // cobrança errada, e cobrança errada só se gasta uma vez.
        incompleto: !fonteRegistrosOk || !fonteCalculadosOk,
        aviso: (!fonteRegistrosOk || !fonteCalculadosOk)
          ? `Contagem incompleta: falha ao ler ${[!fonteRegistrosOk && 'kpi_registros', !fonteCalculadosOk && 'kpi_valores_calculados'].filter(Boolean).join(' e ')}.`
          : null,
      },
      meta_so_texto: {
        total: meta_so_texto.length,
        items: summarize(meta_so_texto, ['id', 'indicador', 'descricao', 'area']),
      },
      calculam_nulo: {
        total: calculam_nulo.length,
        items: summarize(calculam_nulo, ['id', 'indicador', 'descricao', 'area']),
        janela_dias: 60,
      },
      matriz_cobertura: matrizCobertura,
      objetivos_sem_kpis: {
        total: objetivos_sem_kpis.length,
        items: summarize(objetivos_sem_kpis, ['id', 'nome']),
      },
    });
  } catch (e) {
    console.error('gestao/saude:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ----------------------------------------------------------------------------
// POST /pulso/cobrar - dispara notificação para líder
// ----------------------------------------------------------------------------
router.post('/pulso/cobrar/:lider_id', async (req, res) => {
  try {
    const { mensagem } = req.body || {};
    const { data: lider } = await supabase
      .from('rh_funcionarios')
      .select('id, nome, email')
      .eq('id', req.params.lider_id)
      .maybeSingle();
    if (!lider) return res.status(404).json({ error: 'Líder não encontrado' });

    // Tentar achar profile do líder via email
    let userId = null;
    if (lider.email) {
      const { data: prof } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', lider.email)
        .maybeSingle();
      userId = prof?.id || null;
    }

    if (!userId) {
      return res.status(404).json({ error: 'Líder sem profile vinculado' });
    }

    // Inserir notificação
    const { error } = await supabase.from('notificacoes').insert({
      usuario_id: userId,
      titulo: 'Atualize seus KPIs',
      mensagem: mensagem || 'O PMO solicitou que você atualize os indicadores da sua área.',
      tipo: 'cobranca_kpi',
      modulo: 'kpis',
      severidade: 'aviso',
      // ⚠️ Apontava pra `/meus-kpis`, que virou redirect pro /painel quando a
      // Minha Área saiu (04/09). Enquanto não existir a tela do líder, o
      // destino honesto é o painel — nunca uma rota que não mostra o que falta.
      link: '/painel',
      lida: false,
    });
    if (error) throw error;
    res.json({ ok: true, notificou: lider.nome });
  } catch (e) {
    console.error('gestao/pulso/cobrar:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ----------------------------------------------------------------------------
// GET /painel-adm · agrega 8 áreas adm com indicadores operacionais
// Le KPIs operacionais já calculados + agrega solicitações do mês corrente
// ----------------------------------------------------------------------------
router.get('/painel-adm', async (req, res) => {
  try {
    const AREAS_ADM = [
      { key: 'reserva_espaco',     label: 'Reserva de Espaço', cor: '#8B5CF6' },
      { key: 'cozinha',            label: 'Cozinha',            cor: '#EC4899' },
      { key: 'manutencao',         label: 'Manutenção',         cor: '#F59E0B' },
      { key: 'logistica_estoque',  label: 'Logística Estoque',  cor: '#3B82F6' },
      { key: 'logistica_compras',  label: 'Logística Compras',  cor: '#06B6D4' },
      { key: 'ti',                 label: 'TI',                 cor: '#10B981' },
      { key: 'rh',                 label: 'RH',                 cor: '#EF4444' },
      { key: 'financeiro',         label: 'Financeiro',         cor: '#84CC16' },
    ];

    // Período: mês corrente
    const hoje = new Date();
    const inicio = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`;
    const fim = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate()).padStart(2, '0')}`;

    // Le KPIs operacionais ativos + último valor calculado
    const { data: kpis } = await supabase
      .from('kpi_indicadores_taticos')
      .select('id, indicador, formula_config, meta_valor, unidade, objetivo_geral_id')
      .eq('ativo', true)
      .eq('tipo_kpi', 'operacional');

    const kpiIds = (kpis || []).map(k => k.id);
    const { data: valores } = kpiIds.length ? await supabase
      .from('kpi_valores_calculados')
      .select('kpi_id, valor_calculado, periodo_referencia, calculado_em')
      .in('kpi_id', kpiIds)
      .order('calculado_em', { ascending: false }) : { data: [] };

    const valorByKpi = {};
    (valores || []).forEach(v => {
      if (!valorByKpi[v.kpi_id]) valorByKpi[v.kpi_id] = v;
    });

    // Pra cada área, agrega contagem de solicitações do mês
    const areas = await Promise.all(AREAS_ADM.map(async (area) => {
      const { count: total } = await supabase
        .from('solicitacoes')
        .select('id', { count: 'exact', head: true })
        .eq('area_responsavel', area.key)
        .gte('created_at', inicio)
        .lte('created_at', fim + 'T23:59:59');

      const { count: urgentes } = await supabase
        .from('solicitacoes')
        .select('id', { count: 'exact', head: true })
        .eq('area_responsavel', area.key)
        .eq('eh_urgente', true)
        .gte('created_at', inicio)
        .lte('created_at', fim + 'T23:59:59');

      const { count: pendentes } = await supabase
        .from('solicitacoes')
        .select('id', { count: 'exact', head: true })
        .eq('area_responsavel', area.key)
        .in('status', ['pendente', 'em_analise', 'aguardando_aprovacao_financeira', 'em_atendimento', 'aguardando_entrega']);

      // KPIs dessa área (matching pelo formula_config.area_responsavel)
      const kpisArea = (kpis || []).filter(k => k.formula_config?.area_responsavel === area.key);
      const indicadores = kpisArea.map(k => {
        const vc = valorByKpi[k.id];
        return {
          id: k.id,
          indicador: k.indicador,
          metrica: k.formula_config?.metrica,
          valor: vc?.valor_calculado ?? null,
          meta: k.meta_valor,
          unidade: k.unidade,
          periodo: vc?.periodo_referencia,
        };
      });

      return {
        ...area,
        total_mes: total || 0,
        urgentes_mes: urgentes || 0,
        pct_urgentes: total ? Math.round((urgentes / total) * 100) : 0,
        pendentes_agora: pendentes || 0,
        indicadores,
      };
    }));

    res.json({ periodo_mes: { inicio, fim }, areas });
  } catch (e) {
    console.error('gestao/painel-adm:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Forca recalculo de todos KPIs adm (admin/diretor)
router.post('/painel-adm/recalcular', async (req, res) => {
  try {
    const { data, error } = await supabase.rpc('recalcular_todos_kpis_adm');
    if (error) throw error;
    res.json({ ok: true, resultado: data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
