/**
 * Planejamento — rotas backend (apenas LITÚRGICA).
 *
 * Restou só a geração de calendário litúrgico (templates fixos: Ceia 1º domingo,
 * Batismo 4º domingo, Apresentação 2º domingo), usada pelo hub "Gestão Anual"
 * (botão "Gerar litúrgicos {ano}"). Lê de event_liturgia_templates e materializa
 * events. Idempotente (pula nome+date já existente).
 *
 * REMOVIDO em 2026-06-10: o fluxo antigo de Planejamento Anual (setores, ciclos,
 * propostas, aprovação diretor→diretoria) — nunca foi usado (0 propostas); as
 * tabelas planejamento_propostas/_audit/_setores/_areas_setor foram dropadas e as
 * telas /planejamento/anual + RevisaoModal deletadas. Agora isso é nativo nos
 * próprios módulos (Gestão Anual + Projetos/Eventos).
 */
const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');

router.use(authenticate);

// ── Helpers de recorrência (datas dos templates litúrgicos) ──
// targetDow: 0=domingo … 6=sábado · nth: 1..5 (1st, 2nd, 3rd, 4th, 5th)
function nthWeekdayOfMonth(year, month0, targetDow, nth) {
  const first = new Date(Date.UTC(year, month0, 1));
  const firstDow = first.getUTCDay();
  const offset = (targetDow - firstDow + 7) % 7;
  const day = 1 + offset + (nth - 1) * 7;
  const d = new Date(Date.UTC(year, month0, day));
  if (d.getUTCMonth() !== month0) return null; // ultrapassou o mês
  return d.toISOString().slice(0, 10);
}

// Última ocorrência do dia-da-semana no mês
function lastWeekdayOfMonth(year, month0, targetDow) {
  const last = new Date(Date.UTC(year, month0 + 1, 0));
  const lastDow = last.getUTCDay();
  const diff = (lastDow - targetDow + 7) % 7;
  const day = last.getUTCDate() - diff;
  return new Date(Date.UTC(year, month0, day)).toISOString().slice(0, 10);
}

// Resolve um padrão de recorrência pra array de datas YYYY-MM-DD ao longo do ano
function expandPattern(pattern, year) {
  const dates = [];
  const DOMINGO = 0;
  const patterns = {
    '1st_sunday': (m) => nthWeekdayOfMonth(year, m, DOMINGO, 1),
    '2nd_sunday': (m) => nthWeekdayOfMonth(year, m, DOMINGO, 2),
    '3rd_sunday': (m) => nthWeekdayOfMonth(year, m, DOMINGO, 3),
    '4th_sunday': (m) => nthWeekdayOfMonth(year, m, DOMINGO, 4),
    'last_sunday': (m) => lastWeekdayOfMonth(year, m, DOMINGO),
  };
  if (patterns[pattern]) {
    for (let m = 0; m < 12; m++) {
      const d = patterns[pattern](m);
      if (d) dates.push(d);
    }
    return dates;
  }
  // monthly_day_DD
  const monthlyMatch = /^monthly_day_(\d{1,2})$/.exec(pattern);
  if (monthlyMatch) {
    const day = parseInt(monthlyMatch[1], 10);
    for (let m = 0; m < 12; m++) {
      const last = new Date(Date.UTC(year, m + 1, 0)).getUTCDate();
      if (day <= last) dates.push(new Date(Date.UTC(year, m, day)).toISOString().slice(0, 10));
    }
    return dates;
  }
  // weekly_dayN — todo X dia da semana, todo mês
  const weeklyMatch = /^weekly_day(\d)$/.exec(pattern);
  if (weeklyMatch) {
    const dow = parseInt(weeklyMatch[1], 10);
    for (let m = 0; m < 12; m++) {
      for (let n = 1; n <= 5; n++) {
        const d = nthWeekdayOfMonth(year, m, dow, n);
        if (d) dates.push(d);
      }
    }
    return dates;
  }
  return [];
}

// GET /api/planejamento/liturgia/templates
router.get('/liturgia/templates', async (req, res) => {
  try {
    const { data, error } = await supabase.from('event_liturgia_templates')
      .select('*').order('nome');
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/planejamento/liturgia/gerar/:year
// Admin clica → backend materializa events fixos no ano X.
// Idempotente: pula se já existe event com mesmo nome+date.
router.post('/liturgia/gerar/:year', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const year = parseInt(req.params.year, 10);
    if (!Number.isFinite(year) || year < 2026 || year > 2050) {
      return res.status(400).json({ error: 'Ano inválido' });
    }

    const { data: templates } = await supabase.from('event_liturgia_templates')
      .select('*').eq('ativo', true);
    if (!templates?.length) return res.json({ created: 0, skipped: 0, total: 0, message: 'Nenhum template ativo' });

    // Pré-busca events existentes do ano pra dedupe
    const { data: existing } = await supabase.from('events')
      .select('name, date')
      .gte('date', `${year}-01-01`)
      .lte('date', `${year}-12-31`);
    const existingSet = new Set((existing || []).map(e => `${e.name}|${e.date}`));

    let created = 0, skipped = 0;
    const insertRows = [];

    for (const tpl of templates) {
      const dates = expandPattern(tpl.recurrence_pattern, year);
      for (const date of dates) {
        const key = `${tpl.nome}|${date}`;
        if (existingSet.has(key)) { skipped++; continue; }
        insertRows.push({
          name: tpl.nome,
          description: tpl.descricao || '',
          date,
          responsible: '',
          budget_planned: tpl.budget_default || 0,
          recurrence: 'unico',
          status: 'no-prazo',
          criacao_origem: 'liturgico',
          created_by: req.user.userId,
        });
      }
    }

    if (insertRows.length > 0) {
      const { error } = await supabase.from('events').insert(insertRows);
      if (error) throw error;
      created = insertRows.length;
    }

    res.json({ created, skipped, total: created + skipped, year });
  } catch (e) {
    console.error('[Planejamento] liturgia/gerar:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
