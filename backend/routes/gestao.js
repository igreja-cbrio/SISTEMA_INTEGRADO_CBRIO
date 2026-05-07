// ============================================================================
// /api/gestao/* — Painel administrativo do PMO (Marcos + Matheus + Eduardo)
//
// 3 abas:
//   - Pulso        → quem esta atrasado, KPIs cronicamente vermelhos, calendario
//   - Configurar   → reusa /api/estrategia/* e /api/auth/profiles/:id/kpi-areas
//   - Saude        → health check do sistema (KPIs sem meta, sem dono, etc)
// ============================================================================

const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');

router.use(authenticate);
router.use(authorize('admin', 'diretor'));

// ----------------------------------------------------------------------------
// GET /pulso - dashboard de operacao do PMO
// ----------------------------------------------------------------------------
router.get('/pulso', async (req, res) => {
  try {
    const { data: kpis } = await supabase
      .from('kpi_indicadores_taticos')
      .select('id, indicador, area, valores, periodicidade, is_okr, lider_funcionario_id, ativo')
      .eq('ativo', true);

    const { data: trajs } = await supabase
      .from('vw_kpi_trajetoria_atual')
      .select('kpi_id, status_trajetoria, ultimo_periodo, ultimo_valor, percentual_meta');
    const trajByKpi = {};
    (trajs || []).forEach(t => { trajByKpi[t.kpi_id] = t; });

    // 1. Quem esta atrasado (lideres com KPIs sem registro recente)
    const liderIds = [...new Set((kpis || []).map(k => k.lider_funcionario_id).filter(Boolean))];
    const { data: lideres } = liderIds.length > 0 ? await supabase
      .from('rh_funcionarios')
      .select('id, nome, cargo, area')
      .in('id', liderIds) : { data: [] };
    const lideresMap = {};
    (lideres || []).forEach(l => { lideresMap[l.id] = l; });

    const lideresStat = {};
    (kpis || []).forEach(k => {
      if (!k.lider_funcionario_id) return;
      if (!lideresStat[k.lider_funcionario_id]) {
        const l = lideresMap[k.lider_funcionario_id] || { nome: 'Sem nome', cargo: '', area: '' };
        lideresStat[k.lider_funcionario_id] = {
          ...l,
          total_kpis: 0,
          em_dia: 0,
          atrasados: 0,
          criticos: 0,
          sem_dado: 0,
        };
      }
      lideresStat[k.lider_funcionario_id].total_kpis++;
      const s = trajByKpi[k.id]?.status_trajetoria;
      if (s === 'no_alvo') lideresStat[k.lider_funcionario_id].em_dia++;
      else if (s === 'atras') lideresStat[k.lider_funcionario_id].atrasados++;
      else if (s === 'critico') lideresStat[k.lider_funcionario_id].criticos++;
      else lideresStat[k.lider_funcionario_id].sem_dado++;
    });

    const lideresList = Object.values(lideresStat)
      .map(l => ({
        ...l,
        percentual_em_dia: l.total_kpis > 0 ? Math.round((l.em_dia / l.total_kpis) * 100) : 0,
        score: l.criticos * 3 + l.atrasados * 2 + l.sem_dado, // pior score = mais alerta
      }))
      .sort((a, b) => b.score - a.score);

    // 2. KPIs cronicamente vermelhos (≥ 2 ciclos)
    // Por enquanto: KPIs com status critico (refinamos depois com historico)
    const cronicamente = (kpis || [])
      .map(k => ({ ...k, traj: trajByKpi[k.id] }))
      .filter(k => k.traj?.status_trajetoria === 'critico')
      .map(k => ({
        kpi_id: k.id,
        indicador: k.indicador,
        area: k.area,
        is_okr: k.is_okr,
        ultimo_valor: k.traj?.ultimo_valor,
        ultimo_periodo: k.traj?.ultimo_periodo,
        percentual_meta: k.traj?.percentual_meta,
      }));

    // 3. Por area: % de KPIs em dia
    const areasStat = {};
    (kpis || []).forEach(k => {
      const a = String(k.area || 'sem_area').toLowerCase();
      if (!areasStat[a]) areasStat[a] = { area: a, total: 0, em_dia: 0, atrasados: 0, criticos: 0, sem_dado: 0 };
      areasStat[a].total++;
      const s = trajByKpi[k.id]?.status_trajetoria;
      if (s === 'no_alvo') areasStat[a].em_dia++;
      else if (s === 'atras') areasStat[a].atrasados++;
      else if (s === 'critico') areasStat[a].criticos++;
      else areasStat[a].sem_dado++;
    });
    const areasList = Object.values(areasStat).map(a => ({
      ...a,
      percentual_em_dia: a.total > 0 ? Math.round((a.em_dia / a.total) * 100) : 0,
    })).sort((a, b) => a.percentual_em_dia - b.percentual_em_dia);

    res.json({
      total_kpis_ativos: kpis?.length || 0,
      lideres: lideresList,
      cronicamente_vermelhos: cronicamente,
      areas: areasList,
    });
  } catch (e) {
    console.error('gestao/pulso:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ----------------------------------------------------------------------------
// GET /saude - meta-monitoramento do proprio sistema OKR
// ----------------------------------------------------------------------------
router.get('/saude', async (req, res) => {
  try {
    const { data: kpis } = await supabase
      .from('kpi_indicadores_taticos')
      .select('id, indicador, area, valores, meta_descricao, meta_valor, lider_funcionario_id, objetivo_geral_id, is_okr, ativo')
      .eq('ativo', true);

    const sem_meta = (kpis || []).filter(k =>
      (k.meta_valor === null || k.meta_valor === undefined) &&
      (!k.meta_descricao || k.meta_descricao.trim() === '')
    );

    const sem_dono = (kpis || []).filter(k => !k.lider_funcionario_id);
    const sem_objetivo = (kpis || []).filter(k => !k.objetivo_geral_id);
    const sem_valores = (kpis || []).filter(k => !Array.isArray(k.valores) || k.valores.length === 0);

    // Sem registro nos ultimos 60 dias
    const dataLimite = new Date();
    dataLimite.setDate(dataLimite.getDate() - 60);
    const dataLimiteStr = dataLimite.toISOString().slice(0, 10);

    const { data: regs } = await supabase
      .from('kpi_registros')
      .select('indicador_id')
      .gte('data_preenchimento', dataLimiteStr);
    const ativosRecentes = new Set((regs || []).map(r => r.indicador_id));
    const sem_registro_60d = (kpis || []).filter(k => !ativosRecentes.has(k.id));

    // Areas com cobertura incompleta na matriz
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
        items: summarize(sem_meta, ['id', 'indicador', 'area']),
      },
      sem_dono: {
        total: sem_dono.length,
        items: summarize(sem_dono, ['id', 'indicador', 'area']),
      },
      sem_objetivo: {
        total: sem_objetivo.length,
        items: summarize(sem_objetivo, ['id', 'indicador', 'area']),
      },
      sem_valores: {
        total: sem_valores.length,
        items: summarize(sem_valores, ['id', 'indicador', 'area']),
      },
      sem_registro_60d: {
        total: sem_registro_60d.length,
        items: summarize(sem_registro_60d, ['id', 'indicador', 'area']),
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
// POST /pulso/cobrar - dispara notificacao para lider
// ----------------------------------------------------------------------------
router.post('/pulso/cobrar/:lider_id', async (req, res) => {
  try {
    const { mensagem } = req.body || {};
    const { data: lider } = await supabase
      .from('rh_funcionarios')
      .select('id, nome, email')
      .eq('id', req.params.lider_id)
      .maybeSingle();
    if (!lider) return res.status(404).json({ error: 'Lider nao encontrado' });

    // Tentar achar profile do lider via email
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
      return res.status(404).json({ error: 'Lider sem profile vinculado' });
    }

    // Inserir notificacao
    const { error } = await supabase.from('notificacoes').insert({
      usuario_id: userId,
      titulo: 'Atualize seus KPIs',
      mensagem: mensagem || 'O PMO solicitou que voce atualize os indicadores da sua area. Acesse Meus KPIs.',
      tipo: 'cobranca_kpi',
      modulo: 'kpis',
      severidade: 'aviso',
      link: '/meus-kpis',
      lida: false,
    });
    if (error) throw error;
    res.json({ ok: true, notificou: lider.nome });
  } catch (e) {
    console.error('gestao/pulso/cobrar:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
