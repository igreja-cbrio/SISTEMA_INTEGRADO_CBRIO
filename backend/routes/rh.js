const router = require('express').Router();
const multer = require('multer');
const { authenticate, authorizeModule, applyAccessFilter, getEffectiveLevel } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { uploadModuleFile, SHAREPOINT_CONFIGURED, sanitizePath } = require('../services/storageService');
const { notificar } = require('../services/notificar');
const { enqueueSync } = require('../services/cerebroSync');

const uploadMw = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

// Requer permissão granular no módulo RH (DP ou Pessoas, nível >= 2)
// Admin e Diretor passam automaticamente
router.use(authenticate, authorizeModule('rh'));

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
      supabase.from('rh_documentos').select('*').eq('funcionario_id', req.params.id).order('created_at', { ascending: false }),
      supabase.from('rh_treinamentos_funcionarios')
        .select('*, rh_treinamentos(*)')
        .eq('funcionario_id', req.params.id)
        .order('rh_treinamentos(data_inicio)', { ascending: false }),
      supabase.from('rh_ferias_licencas').select('*').eq('funcionario_id', req.params.id).order('data_inicio', { ascending: false }),
    ]);

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

    const { data, error } = await supabase
      .from('rh_funcionarios')
      .insert({
        nome, cpf: cpf || null, email: email || null, telefone: telefone || null,
        cargo, area: area || null, tipo_contrato: tipo_contrato || 'clt',
        data_admissao, salario: salario || null,
        remuneracao_bruta: remuneracao_bruta || null,
        grau_id: grau_id || null,
        data_enquadramento: data_enquadramento || (grau_id ? new Date().toISOString().slice(0, 10) : null),
        observacoes: observacoes || null,
        created_by: req.user.userId,
      })
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

// PUT /api/rh/funcionarios/:id
router.put('/funcionarios/:id', async (req, res) => {
  try {
    const { nome, cpf, email, telefone, cargo, area, tipo_contrato, data_admissao, data_demissao, salario, remuneracao_bruta, grau_id, data_enquadramento, status, observacoes } = req.body;
    const updatePayload = {
      nome, cpf, email, telefone, cargo, area, tipo_contrato,
      data_admissao, data_demissao: data_demissao || null,
      salario, status, observacoes,
      updated_at: new Date().toISOString(),
    };
    if (remuneracao_bruta !== undefined) updatePayload.remuneracao_bruta = remuneracao_bruta;
    if (grau_id !== undefined) updatePayload.grau_id = grau_id || null;
    if (data_enquadramento !== undefined) updatePayload.data_enquadramento = data_enquadramento || null;
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

// DELETE /api/rh/funcionarios/:id (desativação lógica)
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
    const { error } = await supabase
      .from('rh_documentos')
      .delete()
      .eq('id', req.params.id);

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

// Submeter notas dos 6 fatores numa fonte (autoavaliacao | lider | calibracao)
// fatores: [{ criterio_id, nivel, observacao? }]
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
    // Converte para escala 0-5 (multiplica nivel médio ponderado / 5 * 5 = nivel ponderado mesmo)
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

// Conclui o ciclo (calibração aprovada → status concluida)
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
