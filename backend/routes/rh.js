const router = require('express').Router();
const multer = require('multer');
const { authenticate, authorizeModule, applyAccessFilter, getEffectiveLevel } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { uploadModuleFile, SHAREPOINT_CONFIGURED, sanitizePath } = require('../services/storageService');
const { notificar } = require('../services/notificar');
const { enqueueSync } = require('../services/cerebroSync');
const { chamarModelo: organogramaIA } = require('../services/organogramaIA');

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
    let query = supabase.from('rh_funcionarios').select('id, status, tipo_contrato, area');
    query = applyAccessFilter(query, req, 'rh', { areaColumn: 'area', ownerColumn: 'email', ownerEmail: true });
    const { data: funcionarios, error } = await query;

    if (error) return res.status(400).json({ error: error.message });

    const total = funcionarios.length;
    const ativos = funcionarios.filter(f => f.status === 'ativo').length;
    const ferias = funcionarios.filter(f => f.status === 'ferias').length;
    const licenca = funcionarios.filter(f => f.status === 'licenca').length;
    const inativos = funcionarios.filter(f => f.status === 'inativo').length;

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
      .select('*, rh_funcionarios(nome)')
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
      total, ativos, ferias, licenca, inativos,
      porContrato, porArea,
      feriasProximas: feriasProximas || [],
      docsVencendo: docsVencendo || [],
    });
  } catch (e) {
    console.error('[RH] Dashboard:', e.message);
    res.status(500).json({ error: 'Erro ao carregar dashboard RH' });
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
      return {
        id: f.id, nome: f.nome, email: f.email || null,
        cargo_rh: f.cargo || null, area_rh: f.area || null,
        tem_usuario: !!u,
        cargo_perm_id: cargo?.id ?? null,
        cargo_perm_slug: cargo?.slug ?? null,
        cargo_perm_nome: cargo ? (cargo.nome_completo || cargo.nome) : null,
        situacao: semAcesso ? 'sem_acesso' : 'com_acesso',
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
      .select('*, rh_ferias_licencas(tipo, data_inicio, data_fim, status)')
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

// POST /api/rh/funcionarios
router.post('/funcionarios', async (req, res) => {
  try {
    const { nome, cpf, email, telefone, cargo, area, tipo_contrato, data_admissao, salario, remuneracao_bruta, grau_id, data_enquadramento, observacoes } = req.body;
    if (!nome || !cargo || !data_admissao) {
      return res.status(400).json({ error: 'Nome, cargo e data de admissão são obrigatórios' });
    }

    // Remuneracao no cadastro inicial · so quem tem nivel alto em RH define.
    const podeRemun = ['admin', 'diretor'].includes(req.user.role) || getEffectiveLevel(req, 'rh') >= 4;
    const insertPayload = {
      nome, cpf: cpf || null, email: email || null, telefone: telefone || null,
      cargo, area: area || null,
      tipo_contrato: String(tipo_contrato || 'CLT').toUpperCase(),  // CHECK exige CLT/PJ/PJ+/PREBENDA (uppercase)
      data_admissao,
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
const CAMPOS_RH_SENSIVEIS = ['salario', 'remuneracao_bruta', 'grau_id', 'data_enquadramento', 'status', 'data_demissao'];

// Tipos das colunas editaveis · coercao segura no UPDATE. O front manda ''
// (string vazia) num campo nao preenchido; sem converter pra null o Postgres
// recusa o cast pra numeric/date — era o que estourava ("invalid input syntax
// for type numeric: \"\"") ao inativar/editar quem nao tem salario lancado.
const RH_FIELD_TYPES = {
  nome: 'text', cpf: 'text', email: 'text', telefone: 'text', cargo: 'text',
  area: 'text', tipo_contrato: 'upper', observacoes: 'text', status: 'text',
  salario: 'num', remuneracao_bruta: 'num',
  data_admissao: 'date', data_demissao: 'date', data_enquadramento: 'date',
  grau_id: 'uuid',
};
function coerceRh(val, type) {
  if (val === undefined) return undefined;       // nao veio no body → nao mexe na coluna
  if (val === '' || val === null) return null;   // vazio → null
  if (type === 'num') { const n = Number(val); return Number.isFinite(n) ? n : null; }
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
    let sharepointUrl = null;
    let sharepointItemId = null;

    // Se veio arquivo, fazer upload para Supabase + SharePoint
    if (req.file) {
      const ext = (req.file.originalname || nome).split('.').pop();
      const supaPath = `documentos/${req.params.id}/${Date.now()}_${sanitizePath(nome)}.${ext}`;

      // Upload para Supabase (acesso rapido)
      const { error: upErr } = await supabase.storage
        .from('rh-fotos')
        .upload(supaPath, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
      if (upErr) console.error('[RH] Supabase upload error:', upErr.message);
      else {
        const { data: urlData } = supabase.storage.from('rh-fotos').getPublicUrl(supaPath);
        finalStoragePath = urlData.publicUrl;
      }

      // Upload para SharePoint em background
      if (SHAREPOINT_CONFIGURED) {
        (async () => {
          try {
            const { data: func } = await supabase.from('rh_funcionarios').select('nome').eq('id', req.params.id).single();
            const nomePasta = sanitizePath(func?.nome || req.params.id);
            const result = await uploadModuleFile('rh', `Documentos/${nomePasta}`, `${sanitizePath(nome)}.${ext}`, req.file.buffer);
            // Atualizar registro com dados do SharePoint
            if (result.url) {
              await supabase.from('rh_documentos')
                .update({ sharepoint_url: result.url, sharepoint_item_id: result.itemId })
                .eq('funcionario_id', req.params.id)
                .eq('nome', nome)
                .order('created_at', { ascending: false })
                .limit(1);
            }
            console.log(`[RH] Documento sincronizado com SharePoint: ${nomePasta}/${nome}`);
          } catch (spErr) {
            console.error('[RH] SharePoint sync erro (nao-critico):', spErr.message);
          }
        })();
      }
    }

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
    const { status } = req.query;
    let query = supabase
      .from('rh_ferias_licencas')
      .select('*, rh_funcionarios(nome, cargo, area)')
      .order('data_inicio', { ascending: false });

    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) {
    console.error('[RH] Listar férias:', e.message);
    res.status(500).json({ error: 'Erro ao listar férias' });
  }
});

// POST /api/rh/funcionarios/:id/ferias
router.post('/funcionarios/:id/ferias', async (req, res) => {
  try {
    const { tipo, data_inicio, data_fim, observacoes } = req.body;
    if (!tipo || !data_inicio || !data_fim) {
      return res.status(400).json({ error: 'Tipo, data início e data fim são obrigatórios' });
    }

    const { data, error } = await supabase
      .from('rh_ferias_licencas')
      .insert({
        funcionario_id: req.params.id,
        tipo, data_inicio, data_fim,
        observacoes: observacoes || null,
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

// DELETE /api/rh/ferias/:id
router.delete('/ferias/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('rh_ferias_licencas').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) {
    console.error('[RH] Remover férias:', e.message);
    res.status(500).json({ error: 'Erro ao remover férias/licença' });
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
