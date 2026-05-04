const router = require('express').Router();
const multer = require('multer');
const { authenticate, authorize } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { uploadModuleFile, SHAREPOINT_CONFIGURED } = require('../services/storageService');
const { notificar } = require('../services/notificar');
const { enqueueSync } = require('../services/cerebroSync');

const uploadMw = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) cb(null, true);
    else cb(new Error('Formato de imagem não suportado. Use JPG, PNG ou WebP.'));
  },
});

router.use(authenticate);

// ── Utils ──
// Nível de generosidade baseado na data da última contribuição.
// Regra do cliente:
//   ativo: contribuiu nos últimos 30 dias
//   irregular: contribuiu entre 31 e 150 dias (≤ 5 meses)
//   inativo: última contribuição > 150 dias
//   nunca_contribuiu: 0 contribuições
function calcularNivelGenerosidade(ultimaContribuicaoDate) {
  if (!ultimaContribuicaoDate) return 'nunca_contribuiu';
  const dias = Math.floor((Date.now() - new Date(ultimaContribuicaoDate).getTime()) / (1000 * 60 * 60 * 24));
  if (dias <= 30) return 'ativo';
  if (dias <= 150) return 'irregular';
  return 'inativo';
}

// Nível de serviço baseado em check-ins (fonte de verdade do "está servindo")
// Regra do cliente:
//   ativo: fez check-in nos últimos 60 dias
//   ausente: último check-in há mais de 60 dias
//   nunca_serviu: 0 check-ins
function calcularNivelServico(ultimoCheckinDate) {
  if (!ultimoCheckinDate) return 'nunca_serviu';
  const dias = Math.floor((Date.now() - new Date(ultimoCheckinDate).getTime()) / (1000 * 60 * 60 * 24));
  if (dias <= 60) return 'ativo';
  return 'ausente';
}

// ── QR Lookup (identidade do membro) ──

// GET /api/membresia/qr-lookup/:token
// Resolve o token do QR de identidade → perfil resumido do membro.
// Usado pelo scanner do staff ("crachá digital"): ao escanear o QR
// do membro, apresenta cartão com dados essenciais + handles para
// ações futuras (inscrição em evento, etc.).
//
// O token vem da tabela mem_qrcodes (mapeamento token→cpf gravado
// quando o membro gera o passe da wallet). Com o CPF resolvemos o
// registro em mem_membros ou, como fallback, em mem_cadastros_pendentes.
router.get('/qr-lookup/:token', async (req, res) => {
  try {
    const token = String(req.params.token || '').trim();
    if (!token || token.length < 8 || token.length > 64) {
      return res.status(400).json({ error: 'Token invalido' });
    }

    const { data: mapping } = await supabase
      .from('mem_qrcodes')
      .select('cpf')
      .eq('token', token)
      .maybeSingle();

    if (!mapping || !mapping.cpf) {
      return res.status(404).json({ error: 'QR nao encontrado' });
    }

    // Marca uso (opcional, nao-critico)
    supabase
      .from('mem_qrcodes')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('token', token)
      .then(() => {}, () => {});

    // 1) Tenta membro ativo em mem_membros
    const { data: membro } = await supabase
      .from('mem_membros')
      .select(`
        id, nome, foto_url, status, email, telefone, data_nascimento, cpf,
        endereco, bairro, cidade, estado_civil, cep, lat, lng,
        familia:mem_familias(id, nome)
      `)
      .eq('cpf', mapping.cpf)
      .eq('active', true)
      .maybeSingle();

    if (membro) {
      // Enriquecer com dados "cartão de identidade":
      // - grupo de conexão atual
      // - ministérios ativos
      // - última contribuição (para nível de generosidade)
      // - último check-in (para nível de serviço)
      const [grupoAtualRes, ministeriosRes, ultContribRes, ultCheckinRes, trilhaRes] = await Promise.all([
        supabase
          .from('mem_grupo_membros')
          .select('grupo:mem_grupos(id, nome, categoria, local, dia_semana, horario)')
          .eq('membro_id', membro.id)
          .is('saiu_em', null)
          .maybeSingle(),
        supabase
          .from('mem_voluntarios')
          .select('ministerio:mem_ministerios(id, nome, cor)')
          .eq('membro_id', membro.id)
          .is('ate', null),
        supabase
          .from('mem_contribuicoes')
          .select('data')
          .eq('membro_id', membro.id)
          .order('data', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('mem_checkins')
          .select('data')
          .eq('membro_id', membro.id)
          .order('data', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('mem_trilha_valores')
          .select('etapa, data_conclusao, concluida')
          .eq('membro_id', membro.id),
      ]);

      const ultimaContribuicao = ultContribRes?.data?.data || null;
      const ultimoCheckin = ultCheckinRes?.data?.data || null;
      const ministerios = (ministeriosRes?.data || [])
        .map((v) => v.ministerio)
        .filter(Boolean);
      const trilha = trilhaRes?.data || [];

      return res.json({
        found: true,
        pending: false,
        membro: {
          id: membro.id,
          nome: membro.nome,
          foto_url: membro.foto_url,
          status: membro.status,
          email: membro.email,
          telefone: membro.telefone,
          data_nascimento: membro.data_nascimento,
          cpf: membro.cpf,
          endereco: membro.endereco,
          bairro: membro.bairro,
          cidade: membro.cidade,
          cep: membro.cep,
          estado_civil: membro.estado_civil,
          familia: membro.familia || null,
          grupo_atual: grupoAtualRes?.data?.grupo || null,
          ministerios,
          trilha,
          ultima_contribuicao: ultimaContribuicao,
          nivel_generosidade: calcularNivelGenerosidade(ultimaContribuicao),
          ultimo_checkin: ultimoCheckin,
          nivel_servico: calcularNivelServico(ultimoCheckin),
        },
      });
    }

    // 2) Fallback: cadastro pendente
    const { data: pendente } = await supabase
      .from('mem_cadastros_pendentes')
      .select('id, nome, foto_url, email, telefone, data_nascimento, cpf, endereco, bairro, cidade, estado_civil, status, created_at')
      .eq('cpf', mapping.cpf)
      .maybeSingle();

    if (pendente) {
      return res.json({
        found: true,
        pending: true,
        cadastro: pendente,
      });
    }

    return res.status(404).json({ error: 'Cadastro nao encontrado' });
  } catch (e) {
    console.error('[MEMBRESIA] qr-lookup error:', e.message);
    res.status(500).json({ error: 'Erro ao consultar QR' });
  }
});

// ── Membros ──

// GET /api/membresia/membros
// Query params:
//   ?status=...        filtra por status (visitante|membro_ativo|...)
//   ?busca=...         busca por nome
//   ?papel=...         filtra por papel: voluntario|visitante|grupo_ativo|
//                      contribuinte|inscrito_next|sem_papel
router.get('/membros', async (req, res) => {
  try {
    const { status, busca, papel } = req.query;
    let query = supabase
      .from('mem_membros')
      .select('*, familia:mem_familias(id, nome)')
      .eq('active', true)
      .order('nome');

    if (status) query = query.eq('status', status);
    if (busca) query = query.ilike('nome', `%${busca}%`);

    const { data: membros, error } = await query;
    if (error) throw error;
    if (!membros || membros.length === 0) return res.json([]);

    // Anotar papeis (vw_pessoas_papeis), batch — evita N+1.
    // A view ja faz JOIN com vol_profiles, int_visitantes, etc.
    const ids = membros.map(m => m.id);
    const { data: papeis } = await supabase
      .from('vw_pessoas_papeis')
      .select('membresia_id, is_voluntario, is_visitante, is_inscrito_next, in_grupo_ativo, is_contribuinte, total_inscricoes_next')
      .in('membresia_id', ids);
    const papeisMap = {};
    (papeis || []).forEach(p => { papeisMap[p.membresia_id] = p; });

    const enriched = membros.map(m => ({
      ...m,
      papeis: papeisMap[m.id] || {
        is_voluntario: false, is_visitante: false, is_inscrito_next: false,
        in_grupo_ativo: false, is_contribuinte: false, total_inscricoes_next: 0,
      },
    }));

    // Filtro por papel (depois de enriched pra suportar 'sem_papel')
    let filtered = enriched;
    if (papel) {
      filtered = enriched.filter(m => {
        const p = m.papeis;
        if (papel === 'voluntario') return p.is_voluntario;
        if (papel === 'visitante') return p.is_visitante;
        if (papel === 'grupo_ativo') return p.in_grupo_ativo;
        if (papel === 'contribuinte') return p.is_contribuinte;
        if (papel === 'inscrito_next') return p.is_inscrito_next;
        if (papel === 'sem_papel') {
          return !p.is_voluntario && !p.is_visitante && !p.is_inscrito_next
            && !p.in_grupo_ativo && !p.is_contribuinte;
        }
        return true;
      });
    }

    res.json(filtered);
  } catch (e) {
    console.error('membresia/membros:', e.message);
    res.status(500).json({ error: 'Erro ao buscar membros' });
  }
});

// GET /api/membresia/membros/:id (detalhe com trilha e histórico)
router.get('/membros/:id', async (req, res) => {
  try {
    const { data: membro, error } = await supabase
      .from('mem_membros')
      .select('*, familia:mem_familias(id, nome)')
      .eq('id', req.params.id)
      .single();
    if (error) throw error;

    // Familiares
    let familiares = [];
    if (membro.familia_id) {
      const { data: fam } = await supabase
        .from('mem_membros')
        .select('id, nome, status, foto_url, parentesco')
        .eq('familia_id', membro.familia_id)
        .neq('id', membro.id)
        .eq('active', true);
      familiares = fam || [];
    }

    // Trilha dos valores
    const { data: trilha } = await supabase
      .from('mem_trilha_valores')
      .select('*')
      .eq('membro_id', membro.id)
      .order('created_at');

    // Histórico
    const { data: historico } = await supabase
      .from('mem_historico')
      .select('*, registrado:profiles(name)')
      .eq('membro_id', membro.id)
      .order('data', { ascending: false })
      .limit(20);

    // Grupo de Conexão — participação atual + histórico
    const { data: participacoes } = await supabase
      .from('mem_grupo_membros')
      .select('*, grupo:mem_grupos(id, nome, categoria, local, dia_semana, horario, lider:mem_membros!lider_id(id, nome))')
      .eq('membro_id', membro.id)
      .order('entrou_em', { ascending: false });

    const grupo_atual = (participacoes || []).find(p => !p.saiu_em) || null;
    const grupo_historico = (participacoes || []).filter(p => p.saiu_em);

    // Contribuições (últimas 30) + nível de generosidade + totais do ano corrente
    const { data: contribuicoes } = await supabase
      .from('mem_contribuicoes')
      .select('*')
      .eq('membro_id', membro.id)
      .order('data', { ascending: false })
      .limit(30);

    const ultimaContribuicao = contribuicoes?.[0]?.data || null;
    const nivelGenerosidade = calcularNivelGenerosidade(ultimaContribuicao);

    const anoAtual = new Date().getFullYear();
    const { data: contribAno } = await supabase
      .from('mem_contribuicoes')
      .select('tipo, valor')
      .eq('membro_id', membro.id)
      .gte('data', `${anoAtual}-01-01`)
      .lte('data', `${anoAtual}-12-31`);

    const totaisAno = { dizimo: 0, oferta: 0, campanha: 0, total: 0 };
    (contribAno || []).forEach(c => {
      const v = Number(c.valor) || 0;
      totaisAno[c.tipo] = (totaisAno[c.tipo] || 0) + v;
      totaisAno.total += v;
    });

    // Voluntariado / Ministérios
    const { data: voluntarios } = await supabase
      .from('mem_voluntarios')
      .select('*, ministerio:mem_ministerios(id, nome, cor, ativo)')
      .eq('membro_id', membro.id)
      .order('desde', { ascending: false });

    const ministerios_ativos = (voluntarios || []).filter(v => !v.ate);
    const ministerios_historico = (voluntarios || []).filter(v => v.ate);

    // Check-ins recentes (últimos 20)
    const { data: checkins } = await supabase
      .from('mem_checkins')
      .select('*, ministerio:mem_ministerios(id, nome, cor)')
      .eq('membro_id', membro.id)
      .order('data', { ascending: false })
      .limit(20);

    const ultimoCheckin = checkins?.[0]?.data || null;
    const nivelServico = calcularNivelServico(ultimoCheckin);

    // Escalas futuras
    const { data: escalasFuturas } = await supabase
      .from('mem_escalas')
      .select('*, ministerio:mem_ministerios(id, nome, cor)')
      .eq('membro_id', membro.id)
      .gte('data', new Date().toISOString().slice(0, 10))
      .order('data')
      .limit(10);

    res.json({
      ...membro,
      familiares,
      trilha: trilha || [],
      historico: historico || [],
      grupo_atual,
      grupo_historico,
      contribuicoes: contribuicoes || [],
      nivel_generosidade: nivelGenerosidade,
      ultima_contribuicao: ultimaContribuicao,
      totais_ano: totaisAno,
      ministerios_ativos,
      ministerios_historico,
      checkins: checkins || [],
      ultimo_checkin: ultimoCheckin,
      nivel_servico: nivelServico,
      escalas_futuras: escalasFuturas || [],
    });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar membro' });
  }
});

// POST /api/membresia/membros
router.post('/membros', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('mem_membros')
      .insert(req.body)
      .select()
      .single();
    if (error) throw error;
    enqueueSync('membro', data.id, 'upsert').catch(() => {});
    res.status(201).json(data);
  } catch (e) {
    console.error('[MEMBROS] create error:', e.message);
    res.status(500).json({ error: `Erro ao criar membro: ${e.message}` });
  }
});

// PUT /api/membresia/membros/:id
router.put('/membros/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('mem_membros')
      .update(req.body)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    enqueueSync('membro', req.params.id, 'upsert').catch(() => {});
    res.json(data);
  } catch (e) {
    console.error('[MEMBROS] update error:', e.message);
    res.status(500).json({ error: `Erro ao atualizar membro: ${e.message}` });
  }
});

// DELETE /api/membresia/membros/:id (soft delete)
router.delete('/membros/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    await supabase.from('mem_membros').update({ active: false }).eq('id', req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao remover membro' });
  }
});

// POST /api/membresia/membros/:id/foto — upload de foto do membro
router.post('/membros/:id/foto', authorize('admin', 'diretor'), uploadMw.single('foto'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Imagem não fornecida' });
    const { id } = req.params;
    const ext = req.file.mimetype === 'image/png' ? 'png' : req.file.mimetype === 'image/webp' ? 'webp' : 'jpg';
    const path = `membros/${id}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from('fotos-membros')
      .upload(path, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
    if (upErr) throw upErr;

    const { data: urlData } = supabase.storage.from('fotos-membros').getPublicUrl(path);
    const foto_url = `${urlData.publicUrl}?t=${Date.now()}`;

    const { error: dbErr } = await supabase.from('mem_membros').update({ foto_url }).eq('id', id);
    if (dbErr) throw dbErr;

    // Copiar para SharePoint "CRM e Pessoas" em background (nao bloqueia resposta)
    if (SHAREPOINT_CONFIGURED) {
      (async () => {
        try {
          const { data: membro } = await supabase.from('mem_membros').select('nome').eq('id', id).single();
          const nomePasta = membro?.nome || id;
          await uploadModuleFile('membresia', `Fotos`, `${nomePasta}_${id}.${ext}`, req.file.buffer);
          console.log(`[MEMBROS] Foto sincronizada com SharePoint: ${nomePasta}`);
        } catch (spErr) {
          console.error('[MEMBROS] SharePoint sync erro (nao-critico):', spErr.message);
        }
      })();
    }

    res.json({ foto_url });
  } catch (e) {
    console.error('[MEMBROS] foto upload error:', e.message);
    res.status(500).json({ error: `Erro ao enviar foto: ${e.message}` });
  }
});

// ── Trilha dos Valores ──

// POST /api/membresia/trilha
router.post('/trilha', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('mem_trilha_valores')
      .insert(req.body)
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao registrar etapa da trilha' });
  }
});

// PATCH /api/membresia/trilha/:id
router.patch('/trilha/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('mem_trilha_valores')
      .update(req.body)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao atualizar trilha' });
  }
});

// ── Famílias ──

// GET /api/membresia/familias
router.get('/familias', async (req, res) => {
  try {
    const { busca } = req.query;
    let query = supabase
      .from('mem_familias')
      .select('*, membros:mem_membros(id, nome, status, parentesco)')
      .order('nome');
    if (busca) query = query.ilike('nome', `%${busca}%`);
    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar famílias' });
  }
});

// POST /api/membresia/familias
router.post('/familias', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('mem_familias')
      .insert(req.body)
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao criar família' });
  }
});

// PUT /api/membresia/familias/:id
router.put('/familias/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('mem_familias')
      .update(req.body)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao atualizar família' });
  }
});

// DELETE /api/membresia/familias/:id
router.delete('/familias/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    // Desvincula todos os membros antes de remover
    await supabase
      .from('mem_membros')
      .update({ familia_id: null, parentesco: null })
      .eq('familia_id', req.params.id);
    const { error } = await supabase
      .from('mem_familias')
      .delete()
      .eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao remover família' });
  }
});

// PATCH /api/membresia/membros/:id/familia — vincular/desvincular
router.patch('/membros/:id/familia', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { familia_id, parentesco } = req.body || {};
    const payload = {
      familia_id: familia_id || null,
      parentesco: familia_id ? (parentesco || null) : null,
    };
    const { data, error } = await supabase
      .from('mem_membros')
      .update(payload)
      .eq('id', req.params.id)
      .select('*, familia:mem_familias(id, nome)')
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao vincular família' });
  }
});

// ── Histórico ──

// POST /api/membresia/historico
router.post('/historico', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const body = { ...req.body, registrado_por: req.user.id };
    const { data, error } = await supabase
      .from('mem_historico')
      .insert(body)
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao registrar histórico' });
  }
});

// ── Grupos de Conexão ──

// GET /api/membresia/grupos
router.get('/grupos', async (req, res) => {
  try {
    const { ativo } = req.query;
    let query = supabase
      .from('mem_grupos')
      .select('*, lider:mem_membros!lider_id(id, nome), membros:mem_grupo_membros(id, membro_id, entrou_em, saiu_em)')
      .order('nome');

    if (ativo === 'true') query = query.eq('ativo', true);
    if (ativo === 'false') query = query.eq('ativo', false);

    const { data, error } = await query;
    if (error) throw error;

    // Injeta total_ativos (só participações com saiu_em null)
    const withCount = (data || []).map(g => ({
      ...g,
      total_ativos: (g.membros || []).filter(m => !m.saiu_em).length,
    }));
    res.json(withCount);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar grupos' });
  }
});

// GET /api/membresia/grupos/:id (detalhe com membros ativos e históricos)
router.get('/grupos/:id', async (req, res) => {
  try {
    const { data: grupo, error } = await supabase
      .from('mem_grupos')
      .select('*, lider:mem_membros!lider_id(id, nome)')
      .eq('id', req.params.id)
      .single();
    if (error) throw error;

    const { data: participacoes } = await supabase
      .from('mem_grupo_membros')
      .select('*, membro:mem_membros(id, nome, status)')
      .eq('grupo_id', grupo.id)
      .order('entrou_em', { ascending: false });

    const ativos = (participacoes || []).filter(p => !p.saiu_em);
    const historico = (participacoes || []).filter(p => p.saiu_em);

    res.json({ ...grupo, ativos, historico });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar grupo' });
  }
});

// POST /api/membresia/grupos
router.post('/grupos', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const payload = { ...req.body };
    if (payload.lider_id === '') delete payload.lider_id;
    if (payload.dia_semana === '' || payload.dia_semana == null) delete payload.dia_semana;
    if (payload.horario === '') delete payload.horario;

    const { data, error } = await supabase.from('mem_grupos').insert(payload).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao criar grupo' });
  }
});

// PUT /api/membresia/grupos/:id
router.put('/grupos/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const payload = { ...req.body };
    if (payload.lider_id === '') payload.lider_id = null;
    if (payload.dia_semana === '') payload.dia_semana = null;
    if (payload.horario === '') payload.horario = null;

    const { data, error } = await supabase.from('mem_grupos').update(payload).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao atualizar grupo' });
  }
});

// DELETE /api/membresia/grupos/:id (soft delete: ativo = false)
router.delete('/grupos/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { error } = await supabase.from('mem_grupos').update({ ativo: false }).eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao desativar grupo' });
  }
});

// POST /api/membresia/grupos/:id/membros — adicionar membro ao grupo
// Se o membro já estava em outro grupo ativo, fecha o registro anterior (saiu_em = hoje).
router.post('/grupos/:id/membros', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const grupoId = req.params.id;
    const { membro_id, entrou_em } = req.body;
    if (!membro_id) return res.status(400).json({ error: 'membro_id obrigatório' });

    const hoje = new Date().toISOString().slice(0, 10);

    // Fecha participação ativa anterior (se houver)
    await supabase
      .from('mem_grupo_membros')
      .update({ saiu_em: hoje, motivo_saida: 'Transferido para outro grupo' })
      .eq('membro_id', membro_id)
      .is('saiu_em', null);

    // Cria nova
    const { data, error } = await supabase
      .from('mem_grupo_membros')
      .insert({ grupo_id: grupoId, membro_id, entrou_em: entrou_em || hoje })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao adicionar membro ao grupo' });
  }
});

// GET /api/membresia/geocode-cep?cep=XXXXXXXX — geocodifica um CEP brasileiro (ViaCEP + Nominatim)
router.get('/geocode-cep', async (req, res) => {
  try {
    const cep = (req.query.cep || '').replace(/\D/g, '');
    if (cep.length !== 8) return res.status(400).json({ error: 'CEP invalido' });
    const viaCepRes = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const viaCep = await viaCepRes.json();
    if (viaCep.erro) return res.status(404).json({ error: 'CEP nao encontrado' });
    const q = encodeURIComponent(`${viaCep.logradouro || ''} ${viaCep.localidade} ${viaCep.uf} Brasil`.trim());
    const nomRes = await fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`, {
      headers: { 'User-Agent': 'CBRio-Sistema/1.0 (contato@cbrio.com.br)' },
    });
    const nom = await nomRes.json();
    res.json({
      cep, logradouro: viaCep.logradouro, bairro: viaCep.bairro,
      cidade: viaCep.localidade, uf: viaCep.uf,
      lat: nom?.[0] ? parseFloat(nom[0].lat) : null,
      lng: nom?.[0] ? parseFloat(nom[0].lon) : null,
    });
  } catch (e) { res.status(500).json({ error: 'Erro ao geocodificar' }); }
});

// POST /api/membresia/totem/grupos/:id/entrar — qualquer staff autenticado (via totem)
router.post('/totem/grupos/:id/entrar', async (req, res) => {
  try {
    const grupoId = req.params.id;
    const { membro_id } = req.body;
    if (!membro_id) return res.status(400).json({ error: 'membro_id obrigatorio' });
    const hoje = new Date().toISOString().slice(0, 10);
    await supabase.from('mem_grupo_membros')
      .update({ saiu_em: hoje, motivo_saida: 'Transferido via totem' })
      .eq('membro_id', membro_id).is('saiu_em', null);
    const { data, error } = await supabase.from('mem_grupo_membros')
      .insert({ grupo_id: grupoId, membro_id, entrou_em: hoje })
      .select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao entrar no grupo' }); }
});

// PUT /api/membresia/totem/membros/:id — self-update pelo totem (campos seguros)
router.put('/totem/membros/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const allowed = ['email', 'telefone', 'data_nascimento', 'endereco', 'bairro', 'cidade', 'cep', 'estado_civil'];
    const updates = {};
    for (const f of allowed) {
      if (req.body[f] !== undefined && req.body[f] !== null) updates[f] = req.body[f];
    }
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'Nenhum campo para atualizar' });
    const { data, error } = await supabase.from('mem_membros').update(updates).eq('id', id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[TOTEM] update membro error:', e.message);
    res.status(500).json({ error: 'Erro ao atualizar dados: ' + e.message });
  }
});

// POST /api/membresia/totem/membros/:id/foto — upload de foto via totem
router.post('/totem/membros/:id/foto', uploadMw.single('foto'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Imagem não fornecida' });
    const { id } = req.params;
    const ext = req.file.mimetype === 'image/png' ? 'png' : req.file.mimetype === 'image/webp' ? 'webp' : 'jpg';
    const path = `membros/${id}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from('fotos-membros')
      .upload(path, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
    if (upErr) throw upErr;
    const { data: urlData } = supabase.storage.from('fotos-membros').getPublicUrl(path);
    const foto_url = `${urlData.publicUrl}?t=${Date.now()}`;
    const { error: dbErr } = await supabase.from('mem_membros').update({ foto_url }).eq('id', id);
    if (dbErr) throw dbErr;
    res.json({ foto_url });
  } catch (e) {
    console.error('[TOTEM] foto upload error:', e.message);
    res.status(500).json({ error: `Erro ao enviar foto: ${e.message}` });
  }
});

// PATCH /api/membresia/grupo-membros/:id/sair — remover membro do grupo (marca saiu_em)
router.patch('/grupo-membros/:id/sair', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { motivo } = req.body || {};
    const { data, error } = await supabase
      .from('mem_grupo_membros')
      .update({ saiu_em: new Date().toISOString().slice(0, 10), motivo_saida: motivo || null })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao remover membro do grupo' });
  }
});

// ── Contribuições (Generosidade) ──

// GET /api/membresia/contribuicoes (lista com filtros)
router.get('/contribuicoes', async (req, res) => {
  try {
    const { membro_id, tipo, data_inicio, data_fim, limit } = req.query;
    let query = supabase
      .from('mem_contribuicoes')
      .select('*, membro:mem_membros(id, nome)')
      .order('data', { ascending: false });

    if (membro_id) query = query.eq('membro_id', membro_id);
    if (tipo) query = query.eq('tipo', tipo);
    if (data_inicio) query = query.gte('data', data_inicio);
    if (data_fim) query = query.lte('data', data_fim);
    if (limit) query = query.limit(Number(limit));

    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar contribuições' });
  }
});

// POST /api/membresia/contribuicoes
router.post('/contribuicoes', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const payload = {
      ...req.body,
      registrado_por: req.user.id,
      origem: req.body.origem || 'manual',
    };
    if (payload.campanha === '') delete payload.campanha;
    if (payload.forma_pagamento === '') delete payload.forma_pagamento;
    if (payload.referencia_externa === '') delete payload.referencia_externa;

    const { data, error } = await supabase
      .from('mem_contribuicoes')
      .insert(payload)
      .select('*, membro:mem_membros(id, nome)')
      .single();
    if (error) throw error;

    // Enfileira o agregado mensal (entity_id = 'YYYY-MM' da data da contribuição)
    if (data.data) {
      const yyyymm = String(data.data).slice(0, 7);
      enqueueSync('contribuicao-mes', yyyymm, 'upsert').catch(() => {});
    }

    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao registrar contribuição' });
  }
});

// PUT /api/membresia/contribuicoes/:id
router.put('/contribuicoes/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const payload = { ...req.body };
    delete payload.registrado_por;
    const { data, error } = await supabase
      .from('mem_contribuicoes')
      .update(payload)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao atualizar contribuição' });
  }
});

// DELETE /api/membresia/contribuicoes/:id
router.delete('/contribuicoes/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { error } = await supabase.from('mem_contribuicoes').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao remover contribuição' });
  }
});

// GET /api/membresia/contribuicoes/kpis — agregados gerais
router.get('/contribuicoes/kpis', async (req, res) => {
  try {
    const hoje = new Date();
    const anoAtual = hoje.getFullYear();

    // Totais do ano por tipo
    const { data: contribsAno } = await supabase
      .from('mem_contribuicoes')
      .select('tipo, valor, data, membro_id')
      .gte('data', `${anoAtual}-01-01`);

    const totais = { dizimo: 0, oferta: 0, campanha: 0, total: 0 };
    const contribuintesPorMembro = new Map(); // membro_id -> data mais recente
    (contribsAno || []).forEach(c => {
      const v = Number(c.valor) || 0;
      totais[c.tipo] = (totais[c.tipo] || 0) + v;
      totais.total += v;
      const atual = contribuintesPorMembro.get(c.membro_id);
      if (!atual || new Date(c.data) > new Date(atual)) {
        contribuintesPorMembro.set(c.membro_id, c.data);
      }
    });

    // Classificação por nível (ativo/irregular/inativo) considerando TODOS os membros ativos
    const { data: todosMembros } = await supabase
      .from('mem_membros')
      .select('id')
      .eq('active', true);

    // Para inativo/ativo preciso olhar histórico completo (não só do ano). Pegamos última contribuição por membro.
    const membroIds = (todosMembros || []).map(m => m.id);
    const niveis = { ativo: 0, irregular: 0, inativo: 0, nunca_contribuiu: 0 };

    if (membroIds.length > 0) {
      const { data: ultimas } = await supabase
        .from('mem_contribuicoes')
        .select('membro_id, data')
        .in('membro_id', membroIds)
        .order('data', { ascending: false });

      const ultimaPorMembro = new Map();
      (ultimas || []).forEach(c => {
        if (!ultimaPorMembro.has(c.membro_id)) ultimaPorMembro.set(c.membro_id, c.data);
      });

      membroIds.forEach(id => {
        const n = calcularNivelGenerosidade(ultimaPorMembro.get(id));
        niveis[n] = (niveis[n] || 0) + 1;
      });
    }

    res.json({
      ano: anoAtual,
      totais,
      niveis,
      contribuintes_unicos_ano: contribuintesPorMembro.size,
    });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar KPIs de contribuições' });
  }
});

// ══════════════════════════════════════════════════════════════
// Ministérios / Voluntariado / Escalas / Check-ins
// ══════════════════════════════════════════════════════════════

// ── Ministérios ──

router.get('/ministerios', async (req, res) => {
  try {
    const { ativo } = req.query;
    let query = supabase
      .from('mem_ministerios')
      .select('*, lider:mem_membros!lider_id(id, nome), voluntarios:mem_voluntarios(id, ate)')
      .order('nome');
    if (ativo === 'true') query = query.eq('ativo', true);
    if (ativo === 'false') query = query.eq('ativo', false);

    const { data, error } = await query;
    if (error) throw error;

    const withCount = (data || []).map(m => ({
      ...m,
      total_voluntarios: (m.voluntarios || []).filter(v => !v.ate).length,
    }));
    res.json(withCount);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar ministérios' });
  }
});

router.get('/ministerios/:id', async (req, res) => {
  try {
    const { data: ministerio, error } = await supabase
      .from('mem_ministerios')
      .select('*, lider:mem_membros!lider_id(id, nome)')
      .eq('id', req.params.id)
      .single();
    if (error) throw error;

    const { data: voluntarios } = await supabase
      .from('mem_voluntarios')
      .select('*, membro:mem_membros(id, nome, status, telefone)')
      .eq('ministerio_id', ministerio.id)
      .order('desde', { ascending: false });

    const ativos = (voluntarios || []).filter(v => !v.ate);
    const historico = (voluntarios || []).filter(v => v.ate);

    res.json({ ...ministerio, ativos, historico });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar ministério' });
  }
});

router.post('/ministerios', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const payload = { ...req.body };
    if (payload.lider_id === '') delete payload.lider_id;
    const { data, error } = await supabase.from('mem_ministerios').insert(payload).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao criar ministério' });
  }
});

router.put('/ministerios/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const payload = { ...req.body };
    if (payload.lider_id === '') payload.lider_id = null;
    const { data, error } = await supabase.from('mem_ministerios').update(payload).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao atualizar ministério' });
  }
});

router.delete('/ministerios/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { error } = await supabase.from('mem_ministerios').update({ ativo: false }).eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao desativar ministério' });
  }
});

// ── Voluntários (membro × ministério) ──

router.post('/voluntarios', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const payload = { ...req.body };
    if (payload.papel === '') delete payload.papel;
    const { data, error } = await supabase
      .from('mem_voluntarios')
      .insert(payload)
      .select('*, ministerio:mem_ministerios(id, nome, cor), membro:mem_membros(id, nome)')
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao cadastrar voluntário' });
  }
});

router.patch('/voluntarios/:id/sair', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { motivo } = req.body || {};
    const { data, error } = await supabase
      .from('mem_voluntarios')
      .update({ ate: new Date().toISOString().slice(0, 10), motivo_saida: motivo || null })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao registrar saída do voluntário' });
  }
});

router.put('/voluntarios/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('mem_voluntarios')
      .update(req.body)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao atualizar voluntário' });
  }
});

// ── Escalas ──

router.get('/escalas', async (req, res) => {
  try {
    const { membro_id, ministerio_id, data_inicio, data_fim, limit } = req.query;
    let query = supabase
      .from('mem_escalas')
      .select('*, ministerio:mem_ministerios(id, nome, cor), membro:mem_membros(id, nome)')
      .order('data', { ascending: false });
    if (membro_id) query = query.eq('membro_id', membro_id);
    if (ministerio_id) query = query.eq('ministerio_id', ministerio_id);
    if (data_inicio) query = query.gte('data', data_inicio);
    if (data_fim) query = query.lte('data', data_fim);
    if (limit) query = query.limit(Number(limit));

    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar escalas' });
  }
});

router.post('/escalas', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('mem_escalas')
      .insert(req.body)
      .select('*, ministerio:mem_ministerios(id, nome, cor), membro:mem_membros(id, nome)')
      .single();
    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Este membro já está escalado neste culto' });
      }
      throw error;
    }
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao criar escala' });
  }
});

router.put('/escalas/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { data, error } = await supabase.from('mem_escalas').update(req.body).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao atualizar escala' });
  }
});

router.delete('/escalas/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { error } = await supabase.from('mem_escalas').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao remover escala' });
  }
});

// ── Check-ins ──
// Estrutura pronta para integração com sistema de check-in futuro.
// Por enquanto, permite registro manual para testes.

router.get('/checkins', async (req, res) => {
  try {
    const { membro_id, ministerio_id, data_inicio, data_fim, limit } = req.query;
    let query = supabase
      .from('mem_checkins')
      .select('*, ministerio:mem_ministerios(id, nome, cor), membro:mem_membros(id, nome)')
      .order('data', { ascending: false });
    if (membro_id) query = query.eq('membro_id', membro_id);
    if (ministerio_id) query = query.eq('ministerio_id', ministerio_id);
    if (data_inicio) query = query.gte('data', data_inicio);
    if (data_fim) query = query.lte('data', data_fim);
    if (limit) query = query.limit(Number(limit));

    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar check-ins' });
  }
});

router.post('/checkins', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const payload = {
      ...req.body,
      registrado_por: req.user.id,
      origem: req.body.origem || 'manual',
    };
    const { data, error } = await supabase
      .from('mem_checkins')
      .insert(payload)
      .select('*, ministerio:mem_ministerios(id, nome, cor), membro:mem_membros(id, nome)')
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao registrar check-in' });
  }
});

router.delete('/checkins/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { error } = await supabase.from('mem_checkins').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao remover check-in' });
  }
});

// ── Cadastros pendentes (fila de aprovação do formulário público) ──

// GET /api/membresia/cadastros — lista cadastros pendentes (filtro por status)
router.get('/cadastros', async (req, res) => {
  try {
    const { status } = req.query;
    // duplicado_de e membro referenciam mem_membros — nomeamos os embeds pela FK.
    let query = supabase
      .from('mem_cadastros_pendentes')
      .select('*, duplicado_de:duplicado_de_id(id, nome), membro:membro_id(id, nome)')
      .order('created_at', { ascending: false });
    if (status) query = query.eq('status', status);
    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[CADASTROS] list error:', e.message);
    res.status(500).json({ error: 'Erro ao buscar cadastros pendentes' });
  }
});

// GET /api/membresia/cadastros/kpis — contadores por status
router.get('/cadastros/kpis', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('mem_cadastros_pendentes')
      .select('status');
    if (error) throw error;
    const counts = { pendente: 0, aprovado: 0, rejeitado: 0, duplicado: 0 };
    (data || []).forEach((c) => {
      counts[c.status] = (counts[c.status] || 0) + 1;
    });
    res.json(counts);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar KPIs de cadastros' });
  }
});

// POST /api/membresia/cadastros/:id/aprovar — cria mem_membros e marca aprovado
router.post('/cadastros/:id/aprovar', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { id } = req.params;
    const { familia_id: reqFamiliaId, parentesco, observacoes } = req.body || {};

    const { data: cad, error: e1 } = await supabase
      .from('mem_cadastros_pendentes')
      .select('*')
      .eq('id', id)
      .single();
    if (e1 || !cad) return res.status(404).json({ error: 'Cadastro não encontrado' });
    if (cad.status === 'aprovado') {
      return res.status(400).json({ error: 'Cadastro já foi aprovado.' });
    }

    // Família: prioriza a escolhida no modal, senão usa sugestão do formulário público
    const familia_id = reqFamiliaId || cad.familia_sugerida_id || null;

    // Observação "Como conheceu" vai para observacoes (mem_membros não tem esse campo).
    const obsAuto = [
      cad.como_conheceu ? `Como conheceu: ${cad.como_conheceu}` : null,
      observacoes || cad.observacoes,
    ].filter(Boolean).join('\n');

    let membro = null;
    let foiAtualizacao = false;

    // Helper: monta objeto apenas com campos não-nulos do cadastro
    function pickNonNull(src, keys) {
      const out = {};
      for (const k of keys) {
        if (src[k] !== null && src[k] !== undefined && src[k] !== '') out[k] = src[k];
      }
      return out;
    }

    // Campos que PODEM existir em mem_membros (depende de quais migrations rodaram).
    // Se PostgREST reclamar de coluna ausente, retiramos e tentamos de novo.
    const cadFields = [
      'nome', 'cpf', 'email', 'telefone', 'data_nascimento', 'estado_civil',
      'endereco', 'bairro', 'cidade', 'cep', 'profissao',
    ];

    // Extrai nome da coluna ausente da mensagem do PostgREST
    function missingCol(err) {
      if (!err?.message) return null;
      const m = err.message.match(/Could not find the '(\w+)' column/);
      return m ? m[1] : null;
    }

    if (cad.duplicado_de_id) {
      // ── Atualização cadastral ──
      let patch = pickNonNull(cad, cadFields);
      if (familia_id) patch.familia_id = familia_id;
      if (parentesco) patch.parentesco = parentesco;
      if (obsAuto) patch.observacoes = obsAuto;

      // Tenta até 3x, removendo colunas ausentes a cada tentativa
      for (let attempt = 0; attempt < 3; attempt++) {
        const { data: atualizado, error: eUpd } = await supabase
          .from('mem_membros')
          .update(patch)
          .eq('id', cad.duplicado_de_id)
          .select()
          .single();
        if (!eUpd && atualizado) {
          membro = atualizado;
          break;
        }
        const bad = missingCol(eUpd);
        if (bad) {
          console.warn(`[CADASTROS] coluna '${bad}' não existe em mem_membros, removendo do payload`);
          delete patch[bad];
          continue;
        }
        const msg = eUpd?.message || 'registro não encontrado';
        console.error('[CADASTROS] erro ao atualizar membro:', msg);
        return res.status(500).json({ error: `Erro ao atualizar membro: ${msg}` });
      }
      if (!membro) {
        return res.status(500).json({ error: 'Não foi possível atualizar: muitas colunas ausentes.' });
      }
      foiAtualizacao = true;
    } else {
      // ── Novo membro ──
      let membroPayload = {
        ...pickNonNull(cad, cadFields),
        nome: cad.nome, // obrigatório
        status: 'membro_ativo',
        active: true,
      };
      if (familia_id) membroPayload.familia_id = familia_id;
      if (parentesco) membroPayload.parentesco = parentesco;
      if (obsAuto) membroPayload.observacoes = obsAuto;

      // Tenta até 3x, removendo colunas ausentes a cada tentativa
      for (let attempt = 0; attempt < 3; attempt++) {
        const { data: novo, error: e2 } = await supabase
          .from('mem_membros')
          .insert(membroPayload)
          .select()
          .single();
        if (!e2 && novo) {
          membro = novo;
          break;
        }
        const bad = missingCol(e2);
        if (bad) {
          console.warn(`[CADASTROS] coluna '${bad}' não existe em mem_membros, removendo do payload`);
          delete membroPayload[bad];
          continue;
        }
        console.error('[CADASTROS] erro ao criar membro:', e2.message, e2.code);
        return res.status(500).json({ error: `Erro ao criar membro: ${e2.message}` });
      }
      if (!membro) {
        return res.status(500).json({ error: 'Não foi possível criar: muitas colunas ausentes.' });
      }
    }

    // Marca cadastro como aprovado e liga ao membro criado/atualizado
    const { error: e3 } = await supabase
      .from('mem_cadastros_pendentes')
      .update({
        status: 'aprovado',
        aprovado_por: req.user.userId,
        aprovado_em: new Date().toISOString(),
        membro_id: membro.id,
        observacoes: observacoes || cad.observacoes,
      })
      .eq('id', id);
    if (e3) console.error('[CADASTROS] erro ao atualizar cadastro:', e3.message);

    // Registra no histórico do membro
    try {
      await supabase.from('mem_historico').insert({
        membro_id: membro.id,
        descricao: foiAtualizacao
          ? `Atualização cadastral a partir do formulário público (origem: ${cad.origem}).`
          : `Aprovado a partir do formulário público (origem: ${cad.origem}).`,
        registrado_por: req.user.userId,
      });
    } catch (_) { /* histórico é opcional */ }

    notificar({
      modulo: 'membresia',
      tipo: 'cadastro_aprovado',
      titulo: `Cadastro aprovado: ${cad.nome}`,
      mensagem: `O cadastro de ${cad.nome} foi ${foiAtualizacao ? 'atualizado' : 'aprovado'} e o membro está ativo no sistema.`,
      link: `/ministerial/membresia`,
      severidade: 'info',
      chaveDedup: `cadastro_aprovado_${id}`,
    }).catch(() => {});

    res.status(foiAtualizacao ? 200 : 201).json({ ok: true, membro, atualizacao: foiAtualizacao });
  } catch (e) {
    console.error('[CADASTROS] aprovar exception:', e.message, e.stack);
    res.status(500).json({ error: `Erro ao aprovar cadastro: ${e.message}` });
  }
});

// POST /api/membresia/cadastros/:id/rejeitar — marca rejeitado com motivo
router.post('/cadastros/:id/rejeitar', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { id } = req.params;
    const { motivo } = req.body || {};
    const { data: cad, error } = await supabase
      .from('mem_cadastros_pendentes')
      .update({
        status: 'rejeitado',
        motivo_rejeicao: motivo || null,
        aprovado_por: req.user.userId,
        aprovado_em: new Date().toISOString(),
      })
      .eq('id', id)
      .select('nome')
      .single();
    if (error) throw error;

    notificar({
      modulo: 'membresia',
      tipo: 'cadastro_rejeitado',
      titulo: `Cadastro rejeitado: ${cad?.nome || id}`,
      mensagem: `O cadastro de ${cad?.nome || 'membro'} foi rejeitado.${motivo ? ` Motivo: ${motivo}` : ''}`,
      link: `/ministerial/membresia`,
      severidade: 'aviso',
      chaveDedup: `cadastro_rejeitado_${id}`,
    }).catch(() => {});

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao rejeitar cadastro' });
  }
});

// PATCH /api/membresia/cadastros/:id — atualiza observações/duplicado_de
router.patch('/cadastros/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { observacoes, duplicado_de_id } = req.body || {};
    const patch = {};
    if (observacoes !== undefined) patch.observacoes = observacoes;
    if (duplicado_de_id !== undefined) patch.duplicado_de_id = duplicado_de_id;
    const { data, error } = await supabase
      .from('mem_cadastros_pendentes')
      .update(patch)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao atualizar cadastro' });
  }
});

// DELETE /api/membresia/cadastros/:id — admin apaga submissão (spam, etc.)
router.delete('/cadastros/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { error } = await supabase
      .from('mem_cadastros_pendentes')
      .delete()
      .eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao remover cadastro' });
  }
});

// ── KPIs ──
router.get('/kpis', async (req, res) => {
  try {
    const { data: membros } = await supabase
      .from('mem_membros')
      .select('id, status')
      .eq('active', true);

    const total = membros?.length || 0;
    const byStatus = {};
    (membros || []).forEach(m => {
      byStatus[m.status] = (byStatus[m.status] || 0) + 1;
    });

    const { count: familias } = await supabase
      .from('mem_familias')
      .select('id', { count: 'exact', head: true });

    // Contribuintes ativos (≤30 dias) — olhando última contribuição de cada membro ativo
    const membroIds = (membros || []).map(m => m.id);
    let contribuintesAtivos = 0;
    if (membroIds.length > 0) {
      const { data: contribs } = await supabase
        .from('mem_contribuicoes')
        .select('membro_id, data')
        .in('membro_id', membroIds)
        .order('data', { ascending: false });
      const vistos = new Set();
      const limite30d = Date.now() - 30 * 24 * 60 * 60 * 1000;
      (contribs || []).forEach(c => {
        if (vistos.has(c.membro_id)) return;
        vistos.add(c.membro_id);
        if (new Date(c.data).getTime() >= limite30d) contribuintesAtivos += 1;
      });
    }

    res.json({
      total,
      byStatus,
      familias: familias || 0,
      contribuintes_ativos: contribuintesAtivos,
    });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar KPIs' });
  }
});

module.exports = router;
