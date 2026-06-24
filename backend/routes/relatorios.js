// Módulo Relatórios (ministerial) · builder de relatórios por período.
// Cada relatório é um "dataset" com colunas selecionáveis. O frontend escolhe
// o tipo + período + colunas e baixa em planilha (.xlsx de verdade) ou PDF.
const router = require('express').Router();
const XLSX = require('xlsx');
const { authenticate, authorizeModule } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');

router.use(authenticate);

const PAGE = 1000;
// Busca paginada (escapa do cap de 1000 do PostgREST).
async function paginate(queryFactory) {
  const out = [];
  let from = 0;
  for (;;) {
    const { data, error } = await queryFactory(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

// fim + 1 dia (pra incluir o dia inteiro em colunas timestamptz)
const fimMais1 = (fim) => {
  const d = new Date(fim + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

const num = (v) => (v == null ? 0 : Number(v) || 0);

// ── Registry de relatórios ───────────────────────────────────────────────────
const REPORTS = {
  frequencia_cultos: {
    label: 'Frequência e decisões por culto',
    descricao: 'Um registro por culto no período: presença, decisões e online.',
    periodo: 'data do culto',
    colunas: [
      { key: 'data', label: 'Data' },
      { key: 'culto', label: 'Culto' },
      { key: 'presencial_adulto', label: 'Presencial adulto' },
      { key: 'presencial_kids', label: 'Presencial kids' },
      { key: 'total_presencial', label: 'Total presencial' },
      { key: 'decisoes_presenciais', label: 'Decisões presenciais' },
      { key: 'decisoes_online', label: 'Decisões online' },
      { key: 'decisoes_kids', label: 'Decisões kids' },
      { key: 'total_decisoes', label: 'Total decisões' },
      { key: 'online_pico', label: 'Pico online' },
      { key: 'online_ds', label: 'Views (D+1)' },
      { key: 'voluntarios', label: 'Voluntários' },
      { key: 'visitantes', label: 'Visitantes' },
    ],
    fetch: async (ini, fim) => {
      const rows = await paginate((a, b) => supabase.from('cultos')
        .select('data, nome, presencial_adulto, presencial_kids, decisoes_presenciais, decisoes_online, decisoes_kids, online_pico, online_ds, voluntarios, visitantes, st:vol_service_types(name)')
        .is('deleted_at', null).gte('data', ini).lte('data', fim).order('data').range(a, b));
      return rows.map(c => ({
        data: c.data,
        culto: c.nome || c.st?.name || '—',
        presencial_adulto: num(c.presencial_adulto),
        presencial_kids: num(c.presencial_kids),
        total_presencial: num(c.presencial_adulto) + num(c.presencial_kids),
        decisoes_presenciais: num(c.decisoes_presenciais),
        decisoes_online: num(c.decisoes_online),
        decisoes_kids: num(c.decisoes_kids),
        total_decisoes: num(c.decisoes_presenciais) + num(c.decisoes_online) + num(c.decisoes_kids),
        online_pico: num(c.online_pico),
        online_ds: num(c.online_ds),
        voluntarios: num(c.voluntarios),
        visitantes: num(c.visitantes),
      }));
    },
  },

  decisoes_pessoas: {
    label: 'Decisões — pessoas (nominais)',
    descricao: 'Lista nominal de quem tomou decisão no período.',
    periodo: 'data da decisão',
    colunas: [
      { key: 'data', label: 'Data' },
      { key: 'nome', label: 'Nome' },
      { key: 'telefone', label: 'Telefone' },
      { key: 'email', label: 'E-mail' },
      { key: 'idade', label: 'Idade' },
      { key: 'tipo_decisao', label: 'Tipo' },
      { key: 'status_followup', label: 'Acompanhamento' },
      { key: 'culto', label: 'Culto' },
    ],
    fetch: async (ini, fim) => {
      const rows = await paginate((a, b) => supabase.from('cultos_decisoes_pessoas')
        .select('nome, telefone, email, idade, tipo_decisao, status_followup, registrado_em, culto:cultos(data, nome)')
        .is('deleted_at', null)
        .gte('registrado_em', ini).lt('registrado_em', fimMais1(fim))
        .order('registrado_em', { ascending: false }).range(a, b));
      return rows.map(d => ({
        data: d.culto?.data || (d.registrado_em ? String(d.registrado_em).slice(0, 10) : ''),
        nome: d.nome || '',
        telefone: d.telefone || '',
        email: d.email || '',
        idade: d.idade ?? '',
        tipo_decisao: d.tipo_decisao || '',
        status_followup: d.status_followup || '',
        culto: d.culto?.nome || '',
      }));
    },
  },

  batismos: {
    label: 'Batismos',
    descricao: 'Inscrições de batismo no período (por data do batismo).',
    periodo: 'data do batismo',
    colunas: [
      { key: 'nome', label: 'Nome' },
      { key: 'telefone', label: 'Telefone' },
      { key: 'email', label: 'E-mail' },
      { key: 'status', label: 'Status' },
      { key: 'data_batismo', label: 'Data do batismo' },
      { key: 'horario_culto', label: 'Horário' },
      { key: 'categoria_etaria', label: 'Categoria' },
      { key: 'origem', label: 'Origem' },
    ],
    fetch: async (ini, fim) => {
      const rows = await paginate((a, b) => supabase.from('batismo_inscricoes')
        .select('nome, sobrenome, telefone, email, status, data_batismo, horario_culto, categoria_etaria, origem')
        .is('deleted_at', null).gte('data_batismo', ini).lte('data_batismo', fim)
        .order('data_batismo', { ascending: false }).range(a, b));
      return rows.map(b => ({
        nome: [b.nome, b.sobrenome].filter(Boolean).join(' '),
        telefone: b.telefone || '',
        email: b.email || '',
        status: b.status || '',
        data_batismo: b.data_batismo || '',
        horario_culto: b.horario_culto || '',
        categoria_etaria: b.categoria_etaria || '',
        origem: b.origem || '',
      }));
    },
  },

  voluntarios_checkins: {
    label: 'Voluntários — check-ins',
    descricao: 'Check-ins de voluntários nos cultos do período.',
    periodo: 'data do check-in',
    colunas: [
      { key: 'data', label: 'Data' },
      { key: 'voluntario', label: 'Voluntário' },
      { key: 'culto', label: 'Culto' },
      { key: 'metodo', label: 'Método' },
      { key: 'escalado', label: 'Escalado?' },
    ],
    fetch: async (ini, fim) => {
      const rows = await paginate((a, b) => supabase.from('vol_check_ins')
        .select('checked_in_at, method, is_unscheduled, vol:vol_profiles(full_name), svc:vol_services(name, scheduled_at)')
        .gte('checked_in_at', ini).lt('checked_in_at', fimMais1(fim))
        .order('checked_in_at', { ascending: false }).range(a, b));
      return rows.map(c => ({
        data: c.svc?.scheduled_at ? String(c.svc.scheduled_at).slice(0, 10) : (c.checked_in_at ? String(c.checked_in_at).slice(0, 10) : ''),
        voluntario: c.vol?.full_name || '',
        culto: c.svc?.name || '',
        metodo: c.method || '',
        escalado: c.is_unscheduled ? 'Não' : 'Sim',
      }));
    },
  },

  grupos_participantes: {
    label: 'Grupos — participantes',
    descricao: 'Pessoas ativas nos grupos no período (pessoa × grupo).',
    periodo: 'vínculo ativo no período',
    colunas: [
      { key: 'pessoa', label: 'Pessoa' },
      { key: 'grupo', label: 'Grupo' },
      { key: 'funcao', label: 'Função' },
      { key: 'entrou_em', label: 'Entrou em' },
      { key: 'presencas', label: 'Presenças' },
    ],
    fetch: async (ini, fim) => {
      const rows = await paginate((a, b) => supabase.from('mem_grupo_membros')
        .select('entrou_em, saiu_em, funcao, presencas, membro:mem_membros(nome), grupo:mem_grupos(nome)')
        .is('deleted_at', null)
        .lte('entrou_em', fim).or(`saiu_em.is.null,saiu_em.gte.${ini}`)
        .range(a, b));
      return rows.map(g => ({
        pessoa: g.membro?.nome || '',
        grupo: g.grupo?.nome || '',
        funcao: g.funcao || 'membro',
        entrou_em: g.entrou_em || '',
        presencas: num(g.presencas),
      })).sort((x, y) => (x.grupo || '').localeCompare(y.grupo || '') || (x.pessoa || '').localeCompare(y.pessoa || ''));
    },
  },

  membresia: {
    label: 'Membresia — pessoas',
    descricao: 'Censo de membros cadastrados no período.',
    periodo: 'data de cadastro',
    colunas: [
      { key: 'nome', label: 'Nome' },
      { key: 'cpf', label: 'CPF' },
      { key: 'telefone', label: 'Telefone' },
      { key: 'email', label: 'E-mail' },
      { key: 'status', label: 'Status' },
      { key: 'data_nascimento', label: 'Nascimento' },
      { key: 'frequenta_area', label: 'Área' },
      { key: 'cadastro', label: 'Cadastro' },
    ],
    fetch: async (ini, fim) => {
      const rows = await paginate((a, b) => supabase.from('mem_membros')
        .select('nome, cpf, telefone, email, status, data_nascimento, frequenta_area, created_at')
        .is('deleted_at', null)
        .gte('created_at', ini).lt('created_at', fimMais1(fim))
        .order('created_at', { ascending: false }).range(a, b));
      return rows.map(m => ({
        nome: m.nome || '',
        cpf: m.cpf || '',
        telefone: m.telefone || '',
        email: m.email || '',
        status: m.status || '',
        data_nascimento: m.data_nascimento || '',
        frequenta_area: m.frequenta_area || '',
        cadastro: m.created_at ? String(m.created_at).slice(0, 10) : '',
      }));
    },
  },
};

function tiposPublicos() {
  return Object.entries(REPORTS).map(([key, r]) => ({
    key, label: r.label, descricao: r.descricao, periodo: r.periodo, colunas: r.colunas,
  }));
}

function validarParams(req, res) {
  const { tipo, inicio, fim } = req.query;
  if (!tipo || !REPORTS[tipo]) { res.status(400).json({ error: 'Relatório inválido' }); return null; }
  const isData = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
  if (!isData(inicio) || !isData(fim)) { res.status(400).json({ error: 'Período inválido (use AAAA-MM-DD)' }); return null; }
  return { tipo, inicio, fim };
}

// GET /api/relatorios/tipos — catálogo de relatórios + colunas
router.get('/tipos', authorizeModule('relatorios', 1), (_req, res) => {
  res.json({ tipos: tiposPublicos() });
});

// GET /api/relatorios/dados?tipo=&inicio=&fim= — dados (preview + base do PDF)
router.get('/dados', authorizeModule('relatorios', 1), async (req, res) => {
  const p = validarParams(req, res);
  if (!p) return;
  try {
    const rows = await REPORTS[p.tipo].fetch(p.inicio, p.fim);
    res.json({ colunas: REPORTS[p.tipo].colunas, rows, total: rows.length });
  } catch (e) {
    console.error('[relatorios] dados:', e.message);
    res.status(500).json({ error: 'Erro ao gerar o relatório' });
  }
});

// GET /api/relatorios/xlsx?tipo=&inicio=&fim=&colunas=a,b — Excel .xlsx
router.get('/xlsx', authorizeModule('relatorios', 1), async (req, res) => {
  const p = validarParams(req, res);
  if (!p) return;
  try {
    const def = REPORTS[p.tipo];
    const rows = await def.fetch(p.inicio, p.fim);
    // colunas selecionadas (default = todas), preservando a ordem do dataset
    const sel = String(req.query.colunas || '').split(',').map(s => s.trim()).filter(Boolean);
    const cols = sel.length ? def.colunas.filter(c => sel.includes(c.key)) : def.colunas;
    const aoa = [
      cols.map(c => c.label),
      ...rows.map(r => cols.map(c => r[c.key] ?? '')),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = cols.map(c => ({ wch: Math.max(12, c.label.length + 2) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Relatório');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const fn = `${p.tipo}_${p.inicio}_a_${p.fim}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fn}"`);
    res.send(buf);
  } catch (e) {
    console.error('[relatorios] xlsx:', e.message);
    res.status(500).json({ error: 'Erro ao gerar a planilha' });
  }
});

module.exports = router;
