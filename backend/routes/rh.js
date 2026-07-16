const router = require('express').Router();
const multer = require('multer');
const { authenticate, authorizeModule, applyAccessFilter, getEffectiveLevel } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { uploadModuleFile, SHAREPOINT_CONFIGURED, sanitizePath } = require('../services/storageService');
const { notificar } = require('../services/notificar');
const { enqueueSync } = require('../services/cerebroSync');
const { chamarModelo: organogramaIA } = require('../services/organogramaIA');
const { aplicarCobertura, encerrarCobertura } = require('../services/cobertura');

const uploadMw = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

// Requer permissão granular no módulo RH (DP ou Pessoas, nível >= 2)
// Admin e Diretor passam automaticamente
router.use(authenticate, authorizeModule('rh'));

// Quando o funcionário não tem foto cadastrada no RH, usa a foto que ele
// mesmo subiu no perfil (profiles.avatar_url), casando por e-mail. Assim a
// foto que o colaborador adiciona reflete na lista de colaboradores do RH.
async function preencherFotoDoPerfil(funcs) {
  const lista = Array.isArray(funcs) ? funcs : [funcs];
  const semFoto = lista.filter((f) => f && !f.foto_url && f.email);
  if (!semFoto.length) return;
  const brutos = semFoto.map((f) => f.email).filter(Boolean);
  const emails = [...new Set([...brutos, ...brutos.map((e) => e.toLowerCase().trim())])];
  const { data: profs } = await supabase
    .from('profiles')
    .select('email, avatar_url')
    .in('email', emails)
    .not('avatar_url', 'is', null);
  if (!profs || !profs.length) return;
  const porEmail = new Map(
    profs.map((p) => [(p.email || '').toLowerCase().trim(), p.avatar_url])
  );
  for (const f of semFoto) {
    const url = porEmail.get((f.email || '').toLowerCase().trim());
    if (url) f.foto_url = url;
  }
}

// ── DASHBOARD ──────────────────────────────────────────────
router.get('/dashboard', async (req, res) => {
  try {
    let query = supabase.from('rh_funcionarios').select('id, status, tipo_contrato, area, data_admissao, data_demissao, salario, custo_total_mensal');
    query = applyAccessFilter(query, req, 'rh', { areaColumn: 'area', ownerColumn: 'email', ownerEmail: true });
    const { data: funcionarios, error } = await query;

    if (error) return res.status(400).json({ error: error.message });

    const total = funcionarios.length;
    const ativos = funcionarios.filter(f => f.status === 'ativo').length;
    const ferias = funcionarios.filter(f => f.status === 'ferias').length;
    const licenca = funcionarios.filter(f => f.status === 'licenca').length;
    const inativos = funcionarios.filter(f => f.status === 'inativo').length;
    const emAdmissao = funcionarios.filter(f => f.status === 'em_admissao').length;

    // Admissões / desligamentos nos últimos 12 meses + turnover.
    // Turnover = desligamentos no período ÷ ativos atuais × 100 (sem histórico de
    // headcount, usamos os ativos como denominador · rótulo deixa claro na UI).
    const umAnoAtras = new Date(); umAnoAtras.setFullYear(umAnoAtras.getFullYear() - 1);
    const limiteAno = umAnoAtras.toISOString().slice(0, 10);
    const admissoesAno = funcionarios.filter(f => f.data_admissao && f.data_admissao >= limiteAno).length;
    const desligamentosAno = funcionarios.filter(f => f.data_demissao && f.data_demissao >= limiteAno).length;
    const turnover = ativos > 0 ? Math.round((desligamentosAno / ativos) * 1000) / 10 : 0;

    // Folha / custo só pra quem pode ver remuneração (mesma regra do resto do RH).
    const podeRemun = podeEditarRemuneracao(req);
    const ativosList = funcionarios.filter(f => f.status === 'ativo');
    const totalSalarios = podeRemun ? ativosList.reduce((s, f) => s + Number(f.salario || 0), 0) : null;
    const custoMensal = podeRemun ? ativosList.reduce((s, f) => s + Number(f.custo_total_mensal || f.salario || 0), 0) : null;

    // Contagem por tipo de contrato
    const porContrato = {};
    funcionarios.forEach(f => {
      porContrato[f.tipo_contrato] = (porContrato[f.tipo_contrato] || 0) + 1;
    });

    // Contagem por área
    const porArea = {};
    funcionarios.forEach(f => {
      const area = f.area || 'Sem área';
      porArea[area] = (porArea[area] || 0) + 1;
    });

    // Férias/licenças próximas do vencimento (próximos 30 dias)
    const hoje = new Date().toISOString().slice(0, 10);
    const em30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const { data: feriasProximas } = await supabase
      .from('rh_ferias_licencas')
      .select('*, rh_funcionarios!funcionario_id(nome)')
      .in('status', ['pendente', 'aprovado'])
      .gte('data_inicio', hoje)
      .lte('data_inicio', em30)
      .order('data_inicio');

    // Documentos com vencimento próximo (60 dias)
    const em60 = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
    const { data: docsVencendo } = await supabase
      .from('rh_documentos')
      .select('*, rh_funcionarios(nome)')
      .is('deleted_at', null)
      .lte('data_expiracao', em60)
      .gte('data_expiracao', hoje)
      .order('data_expiracao');

    res.json({
      total, ativos, ferias, licenca, inativos, emAdmissao,
      admissoesPendentes: emAdmissao,
      admissoesAno, desligamentosAno, turnover,
      totalSalarios, custoMensal,
      porContrato, porArea,
      feriasProximas: feriasProximas || [],
      docsVencendo: docsVencendo || [],
    });
  } catch (e) {
    console.error('[RH] Dashboard:', e.message);
    res.status(500).json({ error: 'Erro ao carregar dashboard RH' });
  }
});

// GET /api/rh/dashboard/series?meses=N — séries mensais pros gráficos do dashboard.
// quadro: entradas/saídas/headcount por mês (de data_admissao/data_demissao).
// folha:  snapshots mensais (rh_folha_snapshots) · só pra quem vê remuneração.
router.get('/dashboard/series', async (req, res) => {
  try {
    const meses = Math.min(Math.max(parseInt(req.query.meses, 10) || 12, 1), 36);
    let q = supabase.from('rh_funcionarios').select('data_admissao, data_demissao').is('deleted_at', null);
    q = applyAccessFilter(q, req, 'rh', { areaColumn: 'area', ownerColumn: 'email', ownerEmail: true });
    const { data: funcs, error } = await q;
    if (error) return res.status(400).json({ error: error.message });

    const hoje = new Date();
    const quadro = [];
    for (let i = meses - 1; i >= 0; i--) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      const ini = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
      const fimD = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      const fim = `${fimD.getFullYear()}-${String(fimD.getMonth() + 1).padStart(2, '0')}-${String(fimD.getDate()).padStart(2, '0')}`;
      const entradas = (funcs || []).filter(f => f.data_admissao && f.data_admissao >= ini && f.data_admissao <= fim).length;
      const saidas = (funcs || []).filter(f => f.data_demissao && f.data_demissao >= ini && f.data_demissao <= fim).length;
      const headcount = (funcs || []).filter(f => f.data_admissao && f.data_admissao <= fim && (!f.data_demissao || f.data_demissao > fim)).length;
      quadro.push({ mes: ini.slice(0, 7), entradas, saidas, headcount });
    }

    // Folha (snapshots) · só remuneração — não vaza salário pra quem não pode ver.
    const podeRemun = podeEditarRemuneracao(req);
    let folha = [];
    if (podeRemun) {
      const desde = new Date(hoje.getFullYear(), hoje.getMonth() - (meses - 1), 1);
      const desdeStr = `${desde.getFullYear()}-${String(desde.getMonth() + 1).padStart(2, '0')}-01`;
      const { data: snaps } = await supabase
        .from('rh_folha_snapshots')
        .select('mes, total_salarios, total_custo, headcount')
        .gte('mes', desdeStr)
        .order('mes');
      folha = (snaps || []).map(s => ({
        mes: String(s.mes).slice(0, 7),
        total_salarios: Number(s.total_salarios) || 0,
        total_custo: Number(s.total_custo) || 0,
        headcount: s.headcount,
      }));
    }

    res.json({ quadro, folha, podeRemun });
  } catch (e) {
    console.error('[RH] Dashboard series:', e.message);
    res.status(500).json({ error: 'Erro ao carregar séries do dashboard' });
  }
});

// ── ACESSOS · cargo RH × cargo de permissão ────────────────
// Relatório read-only: cruza rh_funcionarios (ativos) com o cadastro de
// permissões (`usuarios` por e-mail → `cargos`) pra mostrar quem está SEM
// acesso ao sistema e o cargo de permissão de cada um. A sugestão de cargo
// (heurística pelo título do RH) é calculada no front · aqui só devolvemos o
// dado cru + o catálogo de cargos.
router.get('/acessos', async (req, res) => {
  try {
    let fq = supabase
      .from('rh_funcionarios')
      .select('id, nome, email, cargo, area, status')
      .eq('status', 'ativo')
      .is('deleted_at', null)
      .order('nome');
    fq = applyAccessFilter(fq, req, 'rh', { areaColumn: 'area', ownerColumn: 'email', ownerEmail: true });
    const { data: funcs, error } = await fq;
    if (error) return res.status(400).json({ error: error.message });

    const [{ data: usuarios }, { data: cargos }] = await Promise.all([
      supabase.from('usuarios').select('id, email, cargo_id, ativo'),
      supabase.from('cargos').select('id, slug, nome, nome_completo, nivel_padrao_leitura, ativo').order('id'),
    ]);

    const cargoById = {};
    (cargos || []).forEach(c => { cargoById[c.id] = c; });
    const usuarioByEmail = {};
    (usuarios || []).forEach(u => { if (u.email) usuarioByEmail[u.email.toLowerCase()] = u; });

    const itens = (funcs || []).map(f => {
      const u = f.email ? usuarioByEmail[f.email.toLowerCase()] : null;
      const cargo = u?.cargo_id ? cargoById[u.cargo_id] : null;
      // "Sem acesso" = sem usuário no sistema granular, sem cargo, ou cargo
      // "Acesso negado". (Não uso usuarios.ativo aqui: o acesso é decidido por
      // cargo+matriz+áreas, não por essa flag — usá-la geraria falso alarme.)
      const semAcesso = !u || !u.cargo_id || /negad/i.test(cargo?.nome || '');
      // Motivo do "sem acesso" — deixa claro o que falta pra liberar (na maioria
      // dos casos operacionais o bloqueio é não ter e-mail/conta, não o cargo).
      let motivo = null;
      if (semAcesso) {
        if (!f.email) motivo = 'Sem e-mail cadastrado';
        else if (/negad/i.test(cargo?.nome || '')) motivo = 'Cargo "Acesso negado"';
        else motivo = 'Sem cargo de acesso';
      }
      return {
        id: f.id, nome: f.nome, email: f.email || null,
        cargo_rh: f.cargo || null, area_rh: f.area || null,
        tem_usuario: !!u,
        cargo_perm_id: cargo?.id ?? null,
        cargo_perm_slug: cargo?.slug ?? null,
        cargo_perm_nome: cargo ? (cargo.nome_completo || cargo.nome) : null,
        situacao: semAcesso ? 'sem_acesso' : 'com_acesso',
        motivo,
      };
    });

    res.json({
      resumo: {
        total: itens.length,
        com_acesso: itens.filter(i => i.situacao === 'com_acesso').length,
        sem_acesso: itens.filter(i => i.situacao === 'sem_acesso').length,
      },
      itens,
      cargos: cargos || [],
    });
  } catch (e) {
    console.error('[RH] Acessos:', e.message);
    res.status(500).json({ error: 'Erro ao carregar relatório de acessos' });
  }
});

// ── FUNCIONÁRIOS ───────────────────────────────────────────
// GET /api/rh/funcionarios
router.get('/funcionarios', async (req, res) => {
  try {
    const { status, area, busca, tipo_contrato } = req.query;
    let query = supabase
      .from('rh_funcionarios')
      .select('*, rh_ferias_licencas!funcionario_id(tipo, data_inicio, data_fim, status)')
      .order('nome');

    // Filtro de acesso por nível: área (3) ou pessoal (2)
    query = applyAccessFilter(query, req, 'rh', { areaColumn: 'area', ownerColumn: 'email', ownerEmail: true });

    if (status) query = query.eq('status', status);
    if (area) query = query.eq('area', area);
    if (tipo_contrato) query = query.eq('tipo_contrato', tipo_contrato);
    if (busca) query = query.ilike('nome', `%${busca}%`);

    const { data, error } = await query;
    if (error) return res.status(400).json({ error: error.message });
    await preencherFotoDoPerfil(data);
    res.json(data);
  } catch (e) {
    console.error('[RH] Listar funcionários:', e.message);
    res.status(500).json({ error: 'Erro ao listar funcionários' });
  }
});

// GET /api/rh/funcionarios/:id
router.get('/funcionarios/:id', async (req, res) => {
  try {
    let query = supabase.from('rh_funcionarios').select('*').eq('id', req.params.id);
    query = applyAccessFilter(query, req, 'rh', { areaColumn: 'area', ownerColumn: 'email', ownerEmail: true });
    const { data: func, error } = await query.single();

    if (error) return res.status(404).json({ error: 'Funcionário não encontrado' });

    // Buscar dados relacionados
    const [docs, treinamentos, ferias] = await Promise.all([
      supabase.from('rh_documentos').select('*').eq('funcionario_id', req.params.id).is('deleted_at', null).order('created_at', { ascending: false }),
      supabase.from('rh_treinamentos_funcionarios')
        .select('*, rh_treinamentos(*)')
        .eq('funcionario_id', req.params.id)
        .order('rh_treinamentos(data_inicio)', { ascending: false }),
      supabase.from('rh_ferias_licencas').select('*').eq('funcionario_id', req.params.id).order('data_inicio', { ascending: false }),
    ]);

    await preencherFotoDoPerfil(func);
    res.json({
      ...func,
      documentos: docs.data || [],
      treinamentos: treinamentos.data || [],
      ferias_licencas: ferias.data || [],
    });
  } catch (e) {
    console.error('[RH] Detalhe funcionário:', e.message);
    res.status(500).json({ error: 'Erro ao buscar funcionário' });
  }
});

// GET /api/rh/funcionarios/:id/pagamentos
// Histórico de pagamentos do colaborador, cruzado do FINANCEIRO: lê os
// lançamentos de despesa de pessoal (plano de contas 4.01%) cujo texto do
// lançamento contém o nome do colaborador, agrupados por competência (mês).
// Somente leitura (não altera nada). Só quem pode ver remuneração.
// ⚠️ Limitação conhecida: pagamentos via cartão corporativo/PJ+ (ex.: "caju
// lider pj+") e lançamentos sem o nome no texto NÃO são atribuídos.
router.get('/funcionarios/:id/pagamentos', async (req, res) => {
  try {
    if (!podeEditarRemuneracao(req)) return res.status(403).json({ error: 'Sem permissão para ver pagamentos (exige RH nível ≥ 4).' });

    let fq = supabase.from('rh_funcionarios').select('id, nome').eq('id', req.params.id);
    fq = applyAccessFilter(fq, req, 'rh', { areaColumn: 'area', ownerColumn: 'email', ownerEmail: true });
    const { data: func, error: fErr } = await fq.maybeSingle();
    if (fErr || !func) return res.status(404).json({ error: 'Funcionário não encontrado' });

    const nome = (func.nome || '').trim();
    if (nome.length < 4) return res.json({ nome, meses: [], total_encontrado: 0 });

    // Escapa curingas do ILIKE (nomes normais não têm, mas por segurança)
    const termo = nome.replace(/[%_]/g, '\\$&');
    const { data: tx, error: tErr } = await supabase
      .from('vw_fin_transacoes_completa')
      .select('id, data_competencia, data_pagamento, valor, status, plano_contas_codigo, plano_contas_nome, descricao')
      .like('plano_contas_codigo', '4.01%')
      .eq('tipo', 'despesa')
      .neq('status', 'cancelado')
      .ilike('descricao', `%${termo}%`)
      .order('data_competencia', { ascending: false })
      .limit(2000);
    if (tErr) return res.status(400).json({ error: tErr.message });

    // Agrupa por competência (mês da data_competencia)
    const mapa = new Map();
    for (const t of tx || []) {
      const d = t.data_competencia ? String(t.data_competencia).slice(0, 7) : 'sem-data';
      if (!mapa.has(d)) mapa.set(d, { mes: d, total: 0, qtd: 0, itens: [] });
      const g = mapa.get(d);
      g.total += Number(t.valor || 0);
      g.qtd += 1;
      g.itens.push({
        id: t.id,
        data_competencia: t.data_competencia,
        data_pagamento: t.data_pagamento,
        valor: Number(t.valor || 0),
        status: t.status,
        plano_codigo: t.plano_contas_codigo,
        plano_nome: t.plano_contas_nome,
        descricao: t.descricao,
      });
    }
    const meses = [...mapa.values()].sort((a, b) => (a.mes < b.mes ? 1 : -1));
    res.json({ nome, meses, total_encontrado: (tx || []).length });
  } catch (e) {
    console.error('[RH] Pagamentos do funcionário:', e.message);
    res.status(500).json({ error: 'Erro ao buscar pagamentos' });
  }
});

// POST /api/rh/funcionarios
router.post('/funcionarios', async (req, res) => {
  try {
    const { nome, cpf, email, telefone, cargo, area, tipo_contrato, data_admissao, salario, remuneracao_bruta, grau_id, data_enquadramento, observacoes, setor_id, foto_url, status, admissao_dados } = req.body;
    if (!nome || !cargo || !data_admissao) {
      return res.status(400).json({ error: 'Nome, cargo e data de admissão são obrigatórios' });
    }
    // Novo contratado pode entrar "em admissão" (onboarding) e só virar 'ativo' ao
    // concluir. Qualquer outro valor no create cai no default 'ativo' (sem injeção).
    const statusInicial = status === 'em_admissao' ? 'em_admissao' : 'ativo';

    // Remuneracao no cadastro inicial · so quem tem nivel alto em RH define.
    const podeRemun = ['admin', 'diretor'].includes(req.user.role) || getEffectiveLevel(req, 'rh') >= 4;
    const insertPayload = {
      nome, cpf: cpf || null, email: email || null, telefone: telefone || null,
      cargo, area: area || null,
      tipo_contrato: String(tipo_contrato || 'CLT').toUpperCase(),  // CHECK exige CLT/PJ/PJ+/PREBENDA (uppercase)
      setor_id: setor_id ? parseInt(setor_id, 10) : null,
      foto_url: foto_url || null,
      data_admissao,
      status: statusInicial,
      admissao_dados: admissao_dados || null,
      salario: podeRemun ? (salario || null) : null,
      remuneracao_bruta: podeRemun ? (remuneracao_bruta || null) : null,
      grau_id: podeRemun ? (grau_id || null) : null,
      data_enquadramento: podeRemun ? (data_enquadramento || (grau_id ? new Date().toISOString().slice(0, 10) : null)) : null,
      observacoes: observacoes || null,
      created_by: req.user.userId,
    };
    const { data, error } = await supabase
      .from('rh_funcionarios')
      .insert(insertPayload)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });

    notificar({
      modulo: 'rh',
      tipo: 'novo_funcionario',
      titulo: `Novo funcionário: ${data.nome}`,
      mensagem: `${data.nome} foi admitido como ${data.cargo}${data.area ? ` na área ${data.area}` : ''}. Admissão em ${data.data_admissao}.`,
      link: '/admin/rh',
      severidade: 'info',
      chaveDedup: `novo_funcionario_${data.id}`,
    }).catch(() => {});

    enqueueSync('funcionario', data.id, 'upsert').catch(() => {});

    res.status(201).json(data);
  } catch (e) {
    console.error('[RH] Criar funcionário:', e.message);
    res.status(500).json({ error: 'Erro ao criar funcionário' });
  }
});

// Campos sensiveis (remuneracao + status de vinculo) · so editaveis por quem tem
// nivel alto em RH (>=4) ou admin/diretor. Antes, um nivel-2 (data entry) editava
// salario de qualquer funcionario — inclusive o proprio — ou demitia alguem.
function podeEditarRemuneracao(req) {
  return ['admin', 'diretor'].includes(req.user.role) || getEffectiveLevel(req, 'rh') >= 4;
}
const CAMPOS_RH_SENSIVEIS = [
  'salario', 'remuneracao_bruta', 'grau_id', 'data_enquadramento', 'status', 'data_demissao',
  // benefícios/descontos/totais/provisões também são remuneração → só nível alto edita
  'complemento_salario', 'alimentacao', 'transporte', 'saude', 'seguro_vida', 'educacao',
  'saldo_livre', 'plano_saude', 'gratificacao', 'adicional_nivel', 'participacao_comite', 'veiculo',
  'adicional_pastores', 'adicional_lideranca', 'adicional_pulpito',
  'fgts', 'ir', 'inss', 'remuneracao_liquida', 'custo_total_mensal',
  'bonus_anual_50', 'bonus_anual_integral', 'ferias_integral',
];

// Tipos das colunas editaveis · coercao segura no UPDATE. O front manda ''
// (string vazia) num campo nao preenchido; sem converter pra null o Postgres
// recusa o cast pra numeric/date — era o que estourava ("invalid input syntax
// for type numeric: \"\"") ao inativar/editar quem nao tem salario lancado.
const RH_FIELD_TYPES = {
  nome: 'text', cpf: 'text', email: 'text', telefone: 'text', cargo: 'text',
  area: 'text', tipo_contrato: 'upper', observacoes: 'text', status: 'text', foto_url: 'text',
  setor_id: 'int',
  salario: 'num', remuneracao_bruta: 'num',
  // Benefícios / descontos / totais / provisões — editados na seção Benefícios da
  // ficha. Antes NÃO entravam no payload (eram descartados silenciosamente) → a
  // Folha ficava sem dado. Agora persistem (e são sensíveis · ver CAMPOS_RH_SENSIVEIS).
  complemento_salario: 'num', alimentacao: 'num', transporte: 'num', saude: 'num',
  seguro_vida: 'num', educacao: 'num', saldo_livre: 'num', plano_saude: 'num',
  gratificacao: 'num', adicional_nivel: 'num', participacao_comite: 'num', veiculo: 'num',
  adicional_pastores: 'num', adicional_lideranca: 'num', adicional_pulpito: 'num',
  fgts: 'num', ir: 'num', inss: 'num',
  remuneracao_liquida: 'num', custo_total_mensal: 'num',
  bonus_anual_50: 'num', bonus_anual_integral: 'num', ferias_integral: 'num',
  data_admissao: 'date', data_demissao: 'date', data_enquadramento: 'date',
  grau_id: 'uuid',
  admissao_dados: 'json', // jsonb com dados extras do onboarding (RG, PJ, contrato…) · não sensível
};
function coerceRh(val, type) {
  if (val === undefined) return undefined;       // nao veio no body → nao mexe na coluna
  if (type === 'json') return val ?? null;       // objeto jsonb passa direto (null limpa)
  if (val === '' || val === null) return null;   // vazio → null
  if (type === 'num') { const n = Number(val); return Number.isFinite(n) ? n : null; }
  if (type === 'int') { const n = parseInt(val, 10); return Number.isFinite(n) ? n : null; }
  if (type === 'upper') return String(val).toUpperCase();  // tipo_contrato · CHECK exige CLT/PJ/PJ+/PREBENDA
  return val;                                     // text/date/uuid passam direto
}

// PUT /api/rh/funcionarios/:id
router.put('/funcionarios/:id', async (req, res) => {
  try {
    const b = req.body || {};
    // Update PARCIAL e seguro: monta o payload so com os campos presentes no
    // body e coage '' → null. (1) corrige o erro ao inativar/editar quem nao tem
    // salario/data e (2) impede que um update parcial (ex.: autosave de
    // anotacoes) zere campos que nao foram enviados.
    const updatePayload = { updated_at: new Date().toISOString() };
    for (const [k, type] of Object.entries(RH_FIELD_TYPES)) {
      if (!(k in b)) continue;
      const v = coerceRh(b[k], type);
      // nome e data_admissao sao NOT NULL · nunca apaga por engano
      if ((k === 'nome' || k === 'data_admissao') && (v === null || v === '')) continue;
      updatePayload[k] = v;
    }
    // Bloqueia edicao de remuneracao/status por quem nao tem nivel suficiente.
    if (!podeEditarRemuneracao(req)) {
      for (const f of CAMPOS_RH_SENSIVEIS) delete updatePayload[f];
    }
    const { data, error } = await supabase
      .from('rh_funcionarios')
      .update(updatePayload)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    enqueueSync('funcionario', req.params.id, 'upsert').catch(() => {});
    res.json(data);
  } catch (e) {
    console.error('[RH] Atualizar funcionário:', e.message);
    res.status(500).json({ error: 'Erro ao atualizar funcionário' });
  }
});

// DELETE /api/rh/funcionarios/:id (desligamento lógico · NÃO apaga o registro)
// Mantido por retrocompatibilidade · usa a data de hoje. Pra informar a data
// real do desligamento + motivo, use POST /funcionarios/:id/desligar.
router.delete('/funcionarios/:id', async (req, res) => {
  try {
    if (!podeEditarRemuneracao(req)) return res.status(403).json({ error: 'Sem permissão para desligar colaborador (exige nível alto em RH).' });
    const { error } = await supabase
      .from('rh_funcionarios')
      .update({ status: 'inativo', data_demissao: new Date().toISOString().split('T')[0] })
      .eq('id', req.params.id);

    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) {
    console.error('[RH] Desativar funcionário:', e.message);
    res.status(500).json({ error: 'Erro ao desativar funcionário' });
  }
});

// POST /api/rh/funcionarios/:id/desligar — marca como inativo preservando o
// histórico, com a data real de desligamento + motivo opcional.
router.post('/funcionarios/:id/desligar', async (req, res) => {
  try {
    if (!podeEditarRemuneracao(req)) return res.status(403).json({ error: 'Sem permissão para desligar colaborador (exige nível alto em RH).' });
    const { data_demissao, motivo } = req.body || {};
    const payload = {
      status: 'inativo',
      data_demissao: data_demissao || new Date().toISOString().split('T')[0],
      motivo_desligamento: motivo || null,
    };
    const { data, error } = await supabase
      .from('rh_funcionarios')
      .update(payload)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) {
    console.error('[RH] Desligar funcionário:', e.message);
    res.status(500).json({ error: 'Erro ao desligar funcionário' });
  }
});

// POST /api/rh/funcionarios/:id/reativar — volta um ex-colaborador pra ativo.
router.post('/funcionarios/:id/reativar', async (req, res) => {
  try {
    if (!podeEditarRemuneracao(req)) return res.status(403).json({ error: 'Sem permissão para reativar colaborador (exige nível alto em RH).' });
    const { data, error } = await supabase
      .from('rh_funcionarios')
      .update({ status: 'ativo', data_demissao: null, motivo_desligamento: null })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) {
    console.error('[RH] Reativar funcionário:', e.message);
    res.status(500).json({ error: 'Erro ao reativar funcionário' });
  }
});

// POST /api/rh/funcionarios/:id/concluir-admissao — encerra o onboarding:
// o colaborador "em admissão" passa a 'ativo'. Mudança de vínculo (status) →
// gated igual aos demais (só nível alto em RH / admin / diretor).
router.post('/funcionarios/:id/concluir-admissao', async (req, res) => {
  try {
    if (!podeEditarRemuneracao(req)) {
      return res.status(403).json({ error: 'Sem permissão para concluir admissão (exige nível alto em RH).' });
    }
    const { data, error } = await supabase
      .from('rh_funcionarios')
      .update({ status: 'ativo' })
      .eq('id', req.params.id)
      .eq('status', 'em_admissao') // só conclui quem está em admissão (idempotente/seguro)
      .select()
      .maybeSingle();
    if (error) return res.status(400).json({ error: error.message });
    if (!data) return res.status(409).json({ error: 'Colaborador não está em admissão.' });
    enqueueSync('funcionario', req.params.id, 'upsert').catch(() => {});
    res.json(data);
  } catch (e) {
    console.error('[RH] Concluir admissão:', e.message);
    res.status(500).json({ error: 'Erro ao concluir admissão' });
  }
});

// PUT /api/rh/funcionarios/:id/gestor — define APENAS o gestor direto, com
// validação de ciclo. Endpoint dedicado porque o PUT genérico não trata
// gestor_id (e um update parcial nele zeraria outros campos).
router.put('/funcionarios/:id/gestor', async (req, res) => {
  try {
    const id = req.params.id;
    const gestorId = req.body?.gestor_id || null;
    if (gestorId && gestorId === id) {
      return res.status(400).json({ error: 'Um colaborador não pode ser gestor de si mesmo.' });
    }
    // Carrega todos (access-filtered) pra validar existência e ciclo
    let q = supabase.from('rh_funcionarios').select('id, gestor_id');
    q = applyAccessFilter(q, req, 'rh', { areaColumn: 'area', ownerColumn: 'email', ownerEmail: true });
    const { data: todos, error: qErr } = await q;
    if (qErr) return res.status(400).json({ error: qErr.message });
    const ids = new Set((todos || []).map(f => f.id));
    if (!ids.has(id)) return res.status(404).json({ error: 'Colaborador não encontrado.' });
    if (gestorId && !ids.has(gestorId)) return res.status(400).json({ error: 'Gestor inválido.' });

    const mapa = new Map((todos || []).map(f => [f.id, f.gestor_id || null]));
    mapa.set(id, gestorId);
    if (temCiclo(mapa)) {
      return res.status(400).json({ error: 'Essa mudança criaria um ciclo na hierarquia.' });
    }

    const { error } = await supabase.from('rh_funcionarios')
      .update({ gestor_id: gestorId, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ ok: true, gestor_id: gestorId });
  } catch (e) {
    console.error('[RH] definir gestor:', e.message);
    res.status(500).json({ error: 'Erro ao definir gestor.' });
  }
});

// ── ORGANOGRAMA · assistente de IA ─────────────────────────
// Detecta ciclo: aplicando o mapa de gestores, ninguém pode ser ancestral de
// si mesmo. Retorna true se houver ciclo a partir de algum nó.
function temCiclo(mapaGestor) {
  for (const inicio of mapaGestor.keys()) {
    let atual = mapaGestor.get(inicio);
    const visitados = new Set([inicio]);
    let passos = 0;
    while (atual && passos < 1000) {
      if (visitados.has(atual)) return true;
      visitados.add(atual);
      atual = mapaGestor.get(atual) || null;
      passos += 1;
    }
  }
  return false;
}

async function carregarAtivosOrg(req) {
  let q = supabase.from('rh_funcionarios')
    .select('id, nome, cargo, area, gestor_id, status')
    .eq('status', 'ativo')
    .order('nome');
  q = applyAccessFilter(q, req, 'rh', { areaColumn: 'area', ownerColumn: 'email', ownerEmail: true });
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data || [];
}

// POST /api/rh/organograma/ia — interpreta o pedido e PROPÕE mudanças (não aplica)
router.post('/organograma/ia', async (req, res) => {
  try {
    const instrucao = (req.body?.instrucao || '').toString().trim();
    if (!instrucao) return res.status(400).json({ error: 'Descreva o que deseja fazer.' });
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(503).json({ error: 'Assistente de IA indisponível (ANTHROPIC_API_KEY não configurada).' });
    }

    const ativos = await carregarAtivosOrg(req);
    if (!ativos.length) return res.status(400).json({ error: 'Nenhum colaborador ativo para organizar.' });

    // Index curto pro modelo (evita ecoar UUIDs)
    const porIdx = ativos.map((f, i) => ({ ...f, idx: i }));
    const idPorIdx = new Map(porIdx.map((f) => [f.idx, f.id]));
    const idxPorId = new Map(porIdx.map((f) => [f.id, f.idx]));
    const nomePorId = new Map(porIdx.map((f) => [f.id, f.nome]));
    const paraModelo = porIdx.map((f) => ({
      idx: f.idx, nome: f.nome, cargo: f.cargo, area: f.area,
      gestorIdx: f.gestor_id != null && idxPorId.has(f.gestor_id) ? idxPorId.get(f.gestor_id) : null,
    }));

    let bruto;
    try {
      bruto = await organogramaIA(instrucao, paraModelo);
    } catch (e) {
      console.error('[RH] organograma IA:', e.message);
      return res.status(502).json({ error: 'Não consegui interpretar o pedido. Tente reformular de forma mais direta.' });
    }

    const avisos = [];
    const mudancas = [];
    for (const m of (bruto?.mudancas || [])) {
      const cIdx = Number(m.colaborador);
      if (!idPorIdx.has(cIdx)) continue;
      const colaboradorId = idPorIdx.get(cIdx);
      let gestorId = null;
      if (m.gestor !== null && m.gestor !== undefined) {
        const gIdx = Number(m.gestor);
        if (!idPorIdx.has(gIdx)) { avisos.push(`Gestor inválido para ${nomePorId.get(colaboradorId)}.`); continue; }
        gestorId = idPorIdx.get(gIdx);
      }
      if (gestorId && gestorId === colaboradorId) { avisos.push(`${nomePorId.get(colaboradorId)} não pode ser gestor de si.`); continue; }
      mudancas.push({
        funcionario_id: colaboradorId,
        funcionario_nome: nomePorId.get(colaboradorId),
        gestor_id: gestorId,
        gestor_nome: gestorId ? nomePorId.get(gestorId) : null,
        motivo: (m.motivo || '').toString().slice(0, 200),
      });
    }

    // Valida ciclo no conjunto final (mapa atual + mudanças propostas)
    if (mudancas.length) {
      const mapa = new Map(ativos.map((f) => [f.id, f.gestor_id || null]));
      for (const c of mudancas) mapa.set(c.funcionario_id, c.gestor_id);
      if (temCiclo(mapa)) {
        return res.status(400).json({ error: 'Essa mudança criaria um ciclo na hierarquia (alguém acabaria reportando a si mesmo). Revise o pedido.' });
      }
    }

    res.json({ mudancas, observacao: (bruto?.observacao || '').toString().slice(0, 400), avisos });
  } catch (e) {
    console.error('[RH] organograma IA:', e.message);
    res.status(500).json({ error: 'Erro ao consultar o assistente.' });
  }
});

// POST /api/rh/organograma/ia/aplicar — aplica as mudanças confirmadas
router.post('/organograma/ia/aplicar', async (req, res) => {
  try {
    const mudancas = Array.isArray(req.body?.mudancas) ? req.body.mudancas : [];
    if (!mudancas.length) return res.status(400).json({ error: 'Nenhuma mudança para aplicar.' });

    const ativos = await carregarAtivosOrg(req);
    const idsValidos = new Set(ativos.map((f) => f.id));

    // Revalida (ids existem, sem auto-gestor) e revalida ciclo
    const mapa = new Map(ativos.map((f) => [f.id, f.gestor_id || null]));
    const aplicar = [];
    for (const c of mudancas) {
      const fid = c.funcionario_id;
      const gid = c.gestor_id ?? null;
      if (!idsValidos.has(fid)) continue;
      if (gid && !idsValidos.has(gid)) continue;
      if (gid && gid === fid) continue;
      mapa.set(fid, gid);
      aplicar.push({ fid, gid });
    }
    if (!aplicar.length) return res.status(400).json({ error: 'Mudanças inválidas.' });
    if (temCiclo(mapa)) return res.status(400).json({ error: 'As mudanças criariam um ciclo na hierarquia.' });

    let ok = 0;
    for (const { fid, gid } of aplicar) {
      const { error } = await supabase.from('rh_funcionarios').update({ gestor_id: gid }).eq('id', fid);
      if (error) { console.error('[RH] aplicar organograma:', error.message); continue; }
      ok += 1;
    }
    res.json({ aplicadas: ok });
  } catch (e) {
    console.error('[RH] aplicar organograma IA:', e.message);
    res.status(500).json({ error: 'Erro ao aplicar mudanças.' });
  }
});

// POST /api/rh/funcionarios/:id/onboarding-link — gera (ou reusa) o link público
// do formulário de dados pessoais pra mandar pro colaborador preencher. O RH só
// cuida de salário/cargo; os dados pessoais vêm do próprio colaborador.
router.post('/funcionarios/:id/onboarding-link', authorizeModule('rh', 2), async (req, res) => {
  try {
    const { data: func } = await supabase.from('rh_funcionarios')
      .select('id, nome, onboarding_token').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!func) return res.status(404).json({ error: 'Colaborador não encontrado' });

    let token = func.onboarding_token;
    if (!token || (req.body && req.body.regenerar)) {
      token = require('crypto').randomBytes(18).toString('base64url'); // ~24 chars
    }
    const { error } = await supabase.from('rh_funcionarios')
      .update({ onboarding_token: token, onboarding_enviado_em: new Date().toISOString() })
      .eq('id', func.id);
    if (error) return res.status(400).json({ error: error.message });

    const base = process.env.FRONTEND_URL || 'https://cbrio.org';
    const url = `${base.replace(/\/$/, '')}/onboarding/${token}`;
    res.json({ url, token, nome: func.nome });
  } catch (e) {
    console.error('[RH] onboarding-link:', e.message);
    res.status(500).json({ error: 'Erro ao gerar o link do formulário' });
  }
});

// POST /api/rh/funcionarios/:id/foto — upload foto de perfil (multipart 'foto')
router.post('/funcionarios/:id/foto', uploadMw.single('foto'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Arquivo "foto" obrigatorio' });
    if (!req.file.mimetype?.startsWith('image/')) {
      return res.status(400).json({ error: 'Arquivo precisa ser uma imagem' });
    }

    const ext = (req.file.originalname?.split('.').pop() || 'jpg').toLowerCase().slice(0, 5);
    const path = `funcionarios/${req.params.id}/avatar-${Date.now()}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from('rh-fotos')
      .upload(path, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
    if (upErr) return res.status(500).json({ error: 'Falha ao salvar imagem: ' + upErr.message });

    const { data: urlData } = supabase.storage.from('rh-fotos').getPublicUrl(path);
    const foto_url = urlData.publicUrl;

    const { error: updErr } = await supabase
      .from('rh_funcionarios')
      .update({ foto_url, updated_at: new Date().toISOString() })
      .eq('id', req.params.id);
    if (updErr) return res.status(400).json({ error: updErr.message });

    res.json({ foto_url });
  } catch (e) {
    console.error('[RH] Upload foto:', e.message);
    res.status(500).json({ error: 'Erro ao enviar foto' });
  }
});

// ── DOCUMENTOS ─────────────────────────────────────────────
// POST /api/rh/funcionarios/:id/documentos — aceita JSON ou multipart com arquivo
router.post('/funcionarios/:id/documentos', uploadMw.single('arquivo'), async (req, res) => {
  try {
    const { tipo, nome, storage_path, data_expiracao } = req.body;
    if (!tipo || !nome) return res.status(400).json({ error: 'Tipo e nome são obrigatórios' });

    let finalStoragePath = storage_path || null;
    let extArquivo = null;

    // Se veio arquivo, sobe pro Supabase (acesso rápido).
    if (req.file) {
      extArquivo = (req.file.originalname || nome).split('.').pop();
      const supaPath = `documentos/${req.params.id}/${Date.now()}_${sanitizePath(nome)}.${extArquivo}`;
      const { error: upErr } = await supabase.storage
        .from('rh-fotos')
        .upload(supaPath, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
      if (upErr) console.error('[RH] Supabase upload error:', upErr.message);
      else {
        const { data: urlData } = supabase.storage.from('rh-fotos').getPublicUrl(supaPath);
        finalStoragePath = urlData.publicUrl;
      }
    }

    // Insere PRIMEIRO pra ter o id do documento. A sincronização do SharePoint
    // (background) passa a atualizar ESTE registro POR id — antes rodava antes do
    // insert e atualizava por funcionario_id+nome+limit(1), podendo carimbar o
    // documento errado quando havia 2 docs de mesmo nome (ou nenhum, se 1º).
    const { data, error } = await supabase
      .from('rh_documentos')
      .insert({
        funcionario_id: req.params.id,
        tipo, nome,
        storage_path: finalStoragePath,
        data_expiracao: data_expiracao || null,
      })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });

    // SharePoint em background · atualiza o documento recém-criado (por id).
    if (req.file && SHAREPOINT_CONFIGURED) {
      const buffer = req.file.buffer;
      const docId = data.id;
      (async () => {
        try {
          const { data: func } = await supabase.from('rh_funcionarios').select('nome').eq('id', req.params.id).single();
          const nomePasta = sanitizePath(func?.nome || req.params.id);
          const result = await uploadModuleFile('rh', `Documentos/${nomePasta}`, `${sanitizePath(nome)}.${extArquivo}`, buffer);
          if (result.url) {
            await supabase.from('rh_documentos')
              .update({ sharepoint_url: result.url, sharepoint_item_id: result.itemId })
              .eq('id', docId);
          }
          console.log(`[RH] Documento sincronizado com SharePoint: ${nomePasta}/${nome}`);
        } catch (spErr) {
          console.error('[RH] SharePoint sync erro (nao-critico):', spErr.message);
        }
      })();
    }

    res.json(data);
  } catch (e) {
    console.error('[RH] Criar documento:', e.message);
    res.status(500).json({ error: 'Erro ao criar documento' });
  }
});

// DELETE /api/rh/documentos/:id
router.delete('/documentos/:id', async (req, res) => {
  try {
    const { error } = await supabase.rpc('app_soft_delete', {
      p_table_name: 'rh_documentos',
      p_row_id: req.params.id,
      p_deleted_by: req.user?.id ?? null,
    });

    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) {
    console.error('[RH] Remover documento:', e.message);
    res.status(500).json({ error: 'Erro ao remover documento' });
  }
});

// ── TREINAMENTOS ───────────────────────────────────────────
// GET /api/rh/treinamentos
router.get('/treinamentos', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('rh_treinamentos')
      .select('*, rh_treinamentos_funcionarios(*, rh_funcionarios(id, nome))')
      .order('data_inicio', { ascending: false });

    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) {
    console.error('[RH] Listar treinamentos:', e.message);
    res.status(500).json({ error: 'Erro ao listar treinamentos' });
  }
});

// POST /api/rh/treinamentos
router.post('/treinamentos', async (req, res) => {
  try {
    const { titulo, descricao, data_inicio, data_fim, instrutor, obrigatorio } = req.body;
    if (!titulo || !data_inicio) return res.status(400).json({ error: 'Título e data início são obrigatórios' });

    const { data, error } = await supabase
      .from('rh_treinamentos')
      .insert({ titulo, descricao: descricao || null, data_inicio, data_fim: data_fim || null, instrutor: instrutor || null, obrigatorio: obrigatorio || false })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json(data);
  } catch (e) {
    console.error('[RH] Criar treinamento:', e.message);
    res.status(500).json({ error: 'Erro ao criar treinamento' });
  }
});

// PUT /api/rh/treinamentos/:id
router.put('/treinamentos/:id', async (req, res) => {
  try {
    const { titulo, descricao, data_inicio, data_fim, instrutor, obrigatorio } = req.body;
    const { data, error } = await supabase
      .from('rh_treinamentos')
      .update({ titulo, descricao, data_inicio, data_fim, instrutor, obrigatorio })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) {
    console.error('[RH] Atualizar treinamento:', e.message);
    res.status(500).json({ error: 'Erro ao atualizar treinamento' });
  }
});

// DELETE /api/rh/treinamentos/:id
router.delete('/treinamentos/:id', async (req, res) => {
  try {
    if (!(['admin', 'diretor'].includes(req.user.role) || getEffectiveLevel(req, 'rh') >= 3)) return res.status(403).json({ error: 'Sem permissão para excluir treinamento (exige RH nível ≥ 3).' });
    const { error } = await supabase.from('rh_treinamentos').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) {
    console.error('[RH] Remover treinamento:', e.message);
    res.status(500).json({ error: 'Erro ao remover treinamento' });
  }
});

// POST /api/rh/treinamentos/:id/inscrever — inscrever funcionários
router.post('/treinamentos/:id/inscrever', async (req, res) => {
  try {
    const { funcionario_id, funcionario_ids } = req.body;

    // Suporta tanto inscrição única quanto em lote
    let insercoes;
    if (funcionario_ids && Array.isArray(funcionario_ids)) {
      insercoes = funcionario_ids.map((fid) => ({
        treinamento_id: req.params.id,
        funcionario_id: fid,
        status: 'inscrito',
      }));
    } else if (funcionario_id) {
      insercoes = [{ treinamento_id: req.params.id, funcionario_id, status: 'inscrito' }];
    } else {
      return res.status(400).json({ error: 'funcionario_id ou funcionario_ids é obrigatório' });
    }

    const { data, error } = await supabase
      .from('rh_treinamentos_funcionarios')
      .upsert(insercoes)
      .select();

    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) {
    console.error('[RH] Inscrever em treinamento:', e.message);
    res.status(500).json({ error: 'Erro ao inscrever no treinamento' });
  }
});

// PATCH /api/rh/treinamentos-funcionarios/:id — atualizar status
router.patch('/treinamentos-funcionarios/:id', async (req, res) => {
  try {
    const { status, data_conclusao } = req.body;
    const update = { status };
    if (data_conclusao) update.data_conclusao = data_conclusao;
    if (status === 'concluido' && !data_conclusao) update.data_conclusao = new Date().toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from('rh_treinamentos_funcionarios')
      .update(update)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) {
    console.error('[RH] Atualizar inscrição:', e.message);
    res.status(500).json({ error: 'Erro ao atualizar inscrição' });
  }
});

// ── FÉRIAS E LICENÇAS ──────────────────────────────────────
// GET /api/rh/ferias
router.get('/ferias', async (req, res) => {
  try {
    const { status, incluir_desligados } = req.query;
    let query = supabase
      .from('rh_ferias_licencas')
      .select('*, rh_funcionarios!funcionario_id(nome, cargo, area, status, data_demissao), substituto:rh_funcionarios!substituto_id(nome)')
      .order('data_inicio', { ascending: false });

    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) return res.status(400).json({ error: error.message });
    // Não mostrar férias de quem já foi desligado/inativado (some do calendário).
    // ?incluir_desligados=1 mantém tudo (para relatórios históricos).
    const DESLIGADO = new Set(['inativo', 'desligado']);
    const rows = incluir_desligados
      ? (data || [])
      : (data || []).filter((f) => !DESLIGADO.has(f.rh_funcionarios?.status || 'ativo'));
    res.json(rows);
  } catch (e) {
    console.error('[RH] Listar férias:', e.message);
    res.status(500).json({ error: 'Erro ao listar férias' });
  }
});

// POST /api/rh/funcionarios/:id/ferias
router.post('/funcionarios/:id/ferias', async (req, res) => {
  try {
    const { tipo, data_inicio, data_fim, observacoes, substituto_id } = req.body;
    if (!tipo || !data_inicio || !data_fim) {
      return res.status(400).json({ error: 'Tipo, data início e data fim são obrigatórios' });
    }

    const { data, error } = await supabase
      .from('rh_ferias_licencas')
      .insert({
        funcionario_id: req.params.id,
        tipo, data_inicio, data_fim,
        observacoes: observacoes || null,
        substituto_id: substituto_id || null,
      })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) {
    console.error('[RH] Solicitar férias:', e.message);
    res.status(500).json({ error: 'Erro ao solicitar férias/licença' });
  }
});

// PATCH /api/rh/ferias/:id — aprovar/rejeitar
router.patch('/ferias/:id', async (req, res) => {
  try {
    const { status } = req.body;
    if (!['aprovado', 'rejeitado'].includes(status)) {
      return res.status(400).json({ error: 'Status deve ser aprovado ou rejeitado' });
    }

    const { data, error } = await supabase
      .from('rh_ferias_licencas')
      .update({ status, aprovado_por: req.user.userId })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });

    // Atualiza status do funcionário se aprovado
    if (status === 'aprovado') {
      const tipo = data.tipo === 'ferias' ? 'ferias' : 'licenca';
      await supabase.from('rh_funcionarios').update({ status: tipo }).eq('id', data.funcionario_id);

      // Cobertura: o substituto herda os módulos OPERACIONAIS do titular ·
      // overrides com expira_em = fim da licença (revert automático).
      const hoje = new Date().toISOString().slice(0, 10);
      if (data.substituto_id && data.data_fim >= hoje) {
        try {
          const { data: pessoas } = await supabase.from('rh_funcionarios')
            .select('id, nome, email').in('id', [data.funcionario_id, data.substituto_id]);
          const tit = (pessoas || []).find(p => p.id === data.funcionario_id);
          const sub = (pessoas || []).find(p => p.id === data.substituto_id);
          if (sub?.email) {
            await aplicarCobertura({
              feriasId: data.id,
              titular: { funcionario_id: tit?.id, email: tit?.email, nome: tit?.nome },
              substituto: { funcionario_id: sub.id, email: sub.email, nome: sub.nome },
              dataInicio: data.data_inicio,
              dataFim: data.data_fim,
              criadoPor: req.user?.userId || req.user?.id || null,
            });
            // avisa o substituto (chega pelo sino · mesmo se ele não for do RH)
            const { data: subProfile } = await supabase.from('profiles')
              .select('id').ilike('email', sub.email).maybeSingle();
            notificar({
              modulo: 'rh', tipo: 'cobertura_atribuida',
              titulo: `Você vai cobrir ${tit?.nome || 'um colega'}`,
              mensagem: `Durante a licença de ${tit?.nome || 'um colega'} (${data.data_inicio} a ${data.data_fim}) você assume as áreas/filas dele. O acesso volta sozinho no fim.`,
              link: '/admin/rh', severidade: 'info', chaveDedup: `cobertura_${data.id}`,
              targetIds: subProfile?.id ? [subProfile.id] : undefined,
            }).catch(() => {});
          }
        } catch (e) { console.error('[RH] aplicar cobertura:', e.message); }
      }
    } else if (status === 'rejeitado') {
      // se havia cobertura ativa pra essa licença, encerra (remove os acessos)
      try {
        const { data: cobs } = await supabase.from('rh_cobertura')
          .select('id').eq('ferias_id', data.id).eq('status', 'ativa');
        for (const c of cobs || []) await encerrarCobertura(c.id, 'cancelada');
      } catch (e) { console.error('[RH] encerrar cobertura:', e.message); }
    }

    // Busca nome do funcionário para notificação
    const { data: func } = await supabase.from('rh_funcionarios').select('nome').eq('id', data.funcionario_id).single();
    const tipoLabel = data.tipo === 'ferias' ? 'Férias' : 'Licença';
    const statusLabel = status === 'aprovado' ? 'aprovada' : 'rejeitada';
    notificar({
      modulo: 'rh',
      tipo: 'ferias_status',
      titulo: `${tipoLabel} ${statusLabel}: ${func?.nome || data.funcionario_id}`,
      mensagem: `${tipoLabel} de ${func?.nome || 'funcionário'} de ${data.data_inicio} a ${data.data_fim} foi ${statusLabel}.`,
      link: '/admin/rh',
      severidade: status === 'aprovado' ? 'info' : 'aviso',
      chaveDedup: `ferias_${status}_${data.id}`,
    }).catch(() => {});

    res.json(data);
  } catch (e) {
    console.error('[RH] Aprovar/rejeitar férias:', e.message);
    res.status(500).json({ error: 'Erro ao atualizar férias/licença' });
  }
});

// GET /api/rh/coberturas — gestão das coberturas (RH)
router.get('/coberturas', async (req, res) => {
  try {
    const { status } = req.query;
    let q = supabase.from('rh_cobertura').select('*')
      .order('data_fim', { ascending: false }).limit(500);
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) return res.status(400).json({ error: error.message });
    res.json(data || []);
  } catch (e) {
    console.error('[RH] Listar coberturas:', e.message);
    res.status(500).json({ error: 'Erro ao listar coberturas' });
  }
});

// POST /api/rh/coberturas/:id/cancelar — remove os acessos concedidos + encerra
router.post('/coberturas/:id/cancelar', authorizeModule('rh', 3), async (req, res) => {
  try {
    const r = await encerrarCobertura(req.params.id, 'cancelada');
    if (!r.ok) return res.status(404).json({ error: 'Cobertura não encontrada' });
    res.json({ ok: true });
  } catch (e) {
    console.error('[RH] Cancelar cobertura:', e.message);
    res.status(500).json({ error: 'Erro ao cancelar cobertura' });
  }
});

// DELETE /api/rh/ferias/:id
router.delete('/ferias/:id', async (req, res) => {
  try {
    if (!(['admin', 'diretor'].includes(req.user.role) || getEffectiveLevel(req, 'rh') >= 3)) return res.status(403).json({ error: 'Sem permissão para excluir férias/licença (exige RH nível ≥ 3).' });
    const { error } = await supabase.from('rh_ferias_licencas').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) {
    console.error('[RH] Remover férias:', e.message);
    res.status(500).json({ error: 'Erro ao remover férias/licença' });
  }
});

// ── ESCALAS EXTRAS ─────────────────────────────────────────────
// Escalas pontuais (plantões/coberturas) pagas à parte · rh_escalas_extras.
// GET /api/rh/extras?status=
router.get('/extras', async (req, res) => {
  try {
    const { status } = req.query;
    let query = supabase
      .from('rh_escalas_extras')
      .select('*, funcionario:rh_funcionarios(nome, cargo, foto_url)')
      .order('data', { ascending: false });
    if (status) query = query.eq('status', status);
    const { data, error } = await query;
    if (error) return res.status(400).json({ error: error.message });
    res.json(data || []);
  } catch (e) {
    console.error('[RH] Listar extras:', e.message);
    res.status(500).json({ error: 'Erro ao listar escalas de extra' });
  }
});

// POST /api/rh/extras · aceita funcionario_id (1) OU funcionario_ids[] (escala
// vários colaboradores de uma vez, com os mesmos título/data/horário/valor)
router.post('/extras', async (req, res) => {
  try {
    const { funcionario_id, funcionario_ids, titulo, descricao, data, horario_inicio, horario_fim, valor, observacoes, status } = req.body || {};
    const ids = [...new Set((Array.isArray(funcionario_ids) && funcionario_ids.length ? funcionario_ids : [funcionario_id]).filter(Boolean))];
    if (!ids.length || !titulo || !data) {
      return res.status(400).json({ error: 'Colaborador(es), título e data são obrigatórios' });
    }
    const valorNum = valor === '' || valor == null ? null : Number(valor);
    if (valorNum != null && Number.isNaN(valorNum)) {
      return res.status(400).json({ error: 'Valor inválido' });
    }
    const base = {
      titulo,
      descricao: descricao || null,
      data,
      horario_inicio: horario_inicio || null,
      horario_fim: horario_fim || null,
      valor: valorNum,
      observacoes: observacoes || null,
      status: status || 'agendado',
    };
    const { data: rows, error } = await supabase
      .from('rh_escalas_extras')
      .insert(ids.map((fid) => ({ ...base, funcionario_id: fid })))
      .select('*, funcionario:rh_funcionarios(nome, cargo, foto_url)');
    if (error) return res.status(400).json({ error: error.message });

    const nomes = (rows || []).map((r) => r.funcionario?.nome).filter(Boolean);
    notificar({
      modulo: 'rh',
      tipo: 'escala_extra',
      titulo: rows.length > 1 ? `${rows.length} escalas de extra criadas` : `Escala de extra: ${nomes[0] || 'colaborador'}`,
      mensagem: `${titulo} em ${data}${valorNum != null ? ` · R$ ${valorNum.toFixed(2)}` : ''}${rows.length > 1 ? ` · ${nomes.join(', ')}` : ''}.`,
      link: '/admin/rh',
      severidade: 'info',
      chaveDedup: `escala_extra_${(rows[0] && rows[0].id) || data}`,
    }).catch(() => {});

    res.json(rows.length === 1 ? rows[0] : rows);
  } catch (e) {
    console.error('[RH] Criar extra:', e.message);
    res.status(500).json({ error: 'Erro ao criar escala de extra' });
  }
});

// PATCH /api/rh/extras/:id
router.patch('/extras/:id', async (req, res) => {
  try {
    const campos = ['funcionario_id', 'titulo', 'descricao', 'data', 'horario_inicio', 'horario_fim', 'valor', 'observacoes', 'status'];
    const patch = {};
    for (const c of campos) {
      if (req.body && c in req.body) patch[c] = req.body[c];
    }
    if (patch.valor === '') patch.valor = null;
    if (patch.valor != null && Number.isNaN(Number(patch.valor))) {
      return res.status(400).json({ error: 'Valor inválido' });
    }
    if (patch.valor != null) patch.valor = Number(patch.valor);
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nada para atualizar' });
    patch.updated_at = new Date().toISOString();

    const { data: row, error } = await supabase
      .from('rh_escalas_extras')
      .update(patch)
      .eq('id', req.params.id)
      .select('*, funcionario:rh_funcionarios(nome, cargo, foto_url)')
      .single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(row);
  } catch (e) {
    console.error('[RH] Atualizar extra:', e.message);
    res.status(500).json({ error: 'Erro ao atualizar escala de extra' });
  }
});

// DELETE /api/rh/extras/:id
router.delete('/extras/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('rh_escalas_extras').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) {
    console.error('[RH] Remover extra:', e.message);
    res.status(500).json({ error: 'Erro ao remover escala de extra' });
  }
});

// ── CONFIG (chave/valor do módulo RH) ──────────────────────────
// GET /api/rh/config → objeto { chave: valor }
router.get('/config', async (req, res) => {
  try {
    const { data, error } = await supabase.from('rh_config').select('chave, valor');
    if (error) return res.status(400).json({ error: error.message });
    const cfg = {};
    (data || []).forEach((r) => { cfg[r.chave] = r.valor; });
    res.json(cfg);
  } catch (e) {
    console.error('[RH] Ler config:', e.message);
    res.status(500).json({ error: 'Erro ao ler configuração' });
  }
});

// PUT /api/rh/config/:chave  body { valor }
router.put('/config/:chave', async (req, res) => {
  try {
    const { valor } = req.body || {};
    const { data, error } = await supabase
      .from('rh_config')
      .upsert(
        { chave: req.params.chave, valor: valor == null ? null : String(valor), updated_at: new Date().toISOString(), updated_by: req.user?.userId || null },
        { onConflict: 'chave' }
      )
      .select()
      .single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) {
    console.error('[RH] Salvar config:', e.message);
    res.status(500).json({ error: 'Erro ao salvar configuração' });
  }
});

// ── KPIs ──────────────────────────────────────────────────────
// GET /api/rh/kpis
router.get('/kpis', async (req, res) => {
  try {
    const [{ count: total }, { count: ativos }, { count: ferias }, admissoes] = await Promise.all([
      supabase.from('rh_funcionarios').select('*', { count: 'exact', head: true }),
      supabase.from('rh_funcionarios').select('*', { count: 'exact', head: true }).eq('status', 'ativo'),
      supabase.from('rh_funcionarios').select('*', { count: 'exact', head: true }).in('status', ['ferias', 'licenca']),
      supabase.from('rh_funcionarios')
        .select('id, nome, cargo, data_admissao')
        .gte('data_admissao', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0])
        .order('data_admissao', { ascending: false }),
    ]);

    res.json({
      total_funcionarios: total ?? 0,
      ativos: ativos ?? 0,
      em_ferias_licenca: ferias ?? 0,
      admissoes_mes: admissoes.data ?? [],
    });
  } catch (e) {
    console.error('[RH] KPIs:', e.message);
    res.status(500).json({ error: 'Erro ao carregar KPIs' });
  }
});

// ── AVALIAÇÕES 360° (ciclo PCS) ────────────────────────────
// Cada avaliação tem 6 fatores (PCS), pode receber 3 fontes: autoavaliação, líder, calibração.
// Pontuação final usa a calibração se presente, senão líder, senão autoavaliação.

router.get('/avaliacoes', async (req, res) => {
  try {
    const { funcionario_id, ciclo_ano, status } = req.query;
    let q = supabase
      .from('rh_avaliacoes')
      .select('*, funcionario:rh_funcionarios(id, nome, cargo, area, grau_id), grau_sugerido:grau_sugerido_id(codigo, nivel), fatores:rh_avaliacao_fatores(*)')
      .order('ciclo_ano', { ascending: false })
      .order('updated_at', { ascending: false });
    if (funcionario_id) q = q.eq('funcionario_id', funcionario_id);
    if (ciclo_ano) q = q.eq('ciclo_ano', Number(ciclo_ano));
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) return res.status(400).json({ error: error.message });
    res.json(data || []);
  } catch (e) {
    console.error('[RH] avaliacoes list:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/avaliacoes', async (req, res) => {
  try {
    const { funcionario_id, ciclo_ano, ciclo_periodo = 'anual', metas, lider_id } = req.body;
    if (!funcionario_id || !ciclo_ano) return res.status(400).json({ error: 'funcionario_id e ciclo_ano obrigatórios' });
    const payload = {
      funcionario_id,
      ciclo_ano: Number(ciclo_ano),
      ciclo_periodo,
      metas: metas || null,
      metas_definidas_em: metas ? new Date().toISOString() : null,
      lider_id: lider_id || null,
      status: metas ? 'em_andamento' : 'metas_pendentes',
    };
    const { data, error } = await supabase
      .from('rh_avaliacoes')
      .upsert(payload, { onConflict: 'funcionario_id,ciclo_ano,ciclo_periodo' })
      .select()
      .single();
    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json(data);
  } catch (e) {
    console.error('[RH] avaliacoes create:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.patch('/avaliacoes/:id', async (req, res) => {
  try {
    const allowed = ['metas', 'autoavaliacao_obs', 'lider_obs', 'calibracao_obs', 'lider_id', 'status'];
    const payload = {};
    for (const k of allowed) if (req.body[k] !== undefined) payload[k] = req.body[k];
    const { data, error } = await supabase
      .from('rh_avaliacoes')
      .update(payload)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/avaliacoes/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('rh_avaliacoes').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Submeter notas dos 6 fatores numa fonte (autoavaliacao | líder | calibracao)
// fatores: [{ criterio_id, nível, observação? }]
router.post('/avaliacoes/:id/fatores', async (req, res) => {
  try {
    const { fonte, fatores } = req.body;
    if (!['autoavaliacao', 'lider', 'calibracao'].includes(fonte))
      return res.status(400).json({ error: 'fonte inválida' });
    if (!Array.isArray(fatores) || fatores.length === 0)
      return res.status(400).json({ error: 'fatores obrigatórios' });

    const { data: criterios } = await supabase
      .from('pcs_criterios')
      .select('id, peso, pontos_min, pontos_max');
    const criterioMap = {};
    for (const c of criterios || []) criterioMap[c.id] = c;

    // Limpa fatores antigos da mesma fonte
    await supabase
      .from('rh_avaliacao_fatores')
      .delete()
      .eq('avaliacao_id', req.params.id)
      .eq('fonte', fonte);

    // Insere novos
    const rows = fatores.map(f => {
      const crit = criterioMap[f.criterio_id];
      // Escala 100-500: pontos_max para nível 5, pontos_min para nível 1
      // Linear: pontos = pontos_min + (nivel-1)/4 * (pontos_max - pontos_min)
      let pontos = null;
      if (crit) {
        pontos = Number((crit.pontos_min + ((f.nivel - 1) / 4) * (crit.pontos_max - crit.pontos_min)).toFixed(2));
      }
      return {
        avaliacao_id: req.params.id,
        criterio_id: f.criterio_id,
        fonte,
        nivel: f.nivel,
        pontos,
        observacao: f.observacao || null,
      };
    });

    const { error: errI } = await supabase.from('rh_avaliacao_fatores').insert(rows);
    if (errI) return res.status(400).json({ error: errI.message });

    // Calcula pontuação total da fonte (soma de pontos = 100-500)
    const totalPontos = rows.reduce((acc, r) => acc + Number(r.pontos || 0), 0);
    // Converte para escala 0-5 (multiplica nível médio ponderado / 5 * 5 = nível ponderado mesmo)
    let pontuacao5 = 0;
    let pesoSum = 0;
    for (const r of rows) {
      const c = criterioMap[r.criterio_id];
      if (c) {
        pontuacao5 += r.nivel * Number(c.peso);
        pesoSum += Number(c.peso);
      }
    }
    pontuacao5 = pesoSum > 0 ? Number((pontuacao5 / pesoSum).toFixed(2)) : 0;

    // Atualiza pontuação da fonte e calcula final
    const updateFields = {};
    if (fonte === 'autoavaliacao') {
      updateFields.autoavaliacao_pts = pontuacao5;
      updateFields.autoavaliacao_em = new Date().toISOString();
    } else if (fonte === 'lider') {
      updateFields.lider_pts = pontuacao5;
      updateFields.lider_avaliado_em = new Date().toISOString();
    } else {
      updateFields.calibracao_pts = pontuacao5;
      updateFields.calibracao_em = new Date().toISOString();
    }

    // Busca avaliação para decidir status e final
    const { data: aval } = await supabase
      .from('rh_avaliacoes')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (aval) {
      const finalPts = updateFields.calibracao_pts ?? aval.calibracao_pts ?? updateFields.lider_pts ?? aval.lider_pts ?? updateFields.autoavaliacao_pts ?? aval.autoavaliacao_pts;
      if (finalPts != null) updateFields.pontuacao_final = finalPts;
      updateFields.pontuacao_pcs = Math.round(totalPontos);

      // Mapeia para grau sugerido
      const { data: grau } = await supabase
        .from('pcs_graus')
        .select('id')
        .lte('pontos_min', Math.round(totalPontos))
        .gte('pontos_max', Math.round(totalPontos))
        .limit(1)
        .maybeSingle();
      if (grau) updateFields.grau_sugerido_id = grau.id;

      // Status transitions
      if (fonte === 'autoavaliacao') updateFields.status = 'autoavaliada';
      else if (fonte === 'lider')    updateFields.status = 'avaliada_lider';
      else if (fonte === 'calibracao') updateFields.status = 'calibrada';
    }

    const { data: updated, error: errU } = await supabase
      .from('rh_avaliacoes')
      .update(updateFields)
      .eq('id', req.params.id)
      .select()
      .single();
    if (errU) return res.status(400).json({ error: errU.message });

    res.json({ avaliacao: updated, pontos_total: Math.round(totalPontos), pontuacao_5: pontuacao5 });
  } catch (e) {
    console.error('[RH] avaliacoes/fatores:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Conclui o ciclo (calibração aprovada → status concluída)
router.post('/avaliacoes/:id/concluir', async (req, res) => {
  const { data, error } = await supabase
    .from('rh_avaliacoes')
    .update({ status: 'concluida' })
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// Inicia ciclo para todos os funcionários ativos (ano atual)
router.post('/avaliacoes/iniciar-ciclo', async (req, res) => {
  try {
    const { ciclo_ano, ciclo_periodo = 'anual' } = req.body;
    if (!ciclo_ano) return res.status(400).json({ error: 'ciclo_ano obrigatório' });
    const { data: funcs } = await supabase
      .from('rh_funcionarios')
      .select('id')
      .eq('status', 'ativo');
    const rows = (funcs || []).map(f => ({
      funcionario_id: f.id,
      ciclo_ano: Number(ciclo_ano),
      ciclo_periodo,
      status: 'metas_pendentes',
    }));
    if (!rows.length) return res.json({ criadas: 0 });
    const { error } = await supabase
      .from('rh_avaliacoes')
      .upsert(rows, { onConflict: 'funcionario_id,ciclo_ano,ciclo_periodo', ignoreDuplicates: true });
    if (error) return res.status(400).json({ error: error.message });
    res.json({ criadas: rows.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
