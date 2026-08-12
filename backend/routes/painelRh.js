const router = require('express').Router();
const { authenticate, authorizeModule } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');

// Painel informativo de RH exibido na home (Dashboard). Leitura liberada a
// qualquer autenticado — é um painel geral, não uma tela do módulo RH. Só as
// escritas (gerenciar comunicados, decidir visibilidade de evento) exigem
// nível no módulo rh.
router.use(authenticate);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUUID = (v) => UUID_RE.test(v);

// Categorias cujos eventos entram sozinhos no painel (RH pode esconder um
// específico marcando visivel_painel_rh=false). Resolvidas por NOME em cada
// chamada — evita hardcode de UUID, tolerante à categoria ser recriada.
const CATEGORIAS_AUTOMATICAS = ['Rotina de Liturgia', 'Série', 'Geracional', 'Rotina Staff', 'Feriado'];

// GET /api/painel-rh/aniversariantes — colaboradores que fazem aniversário no
// mês atual. Campos mínimos (sem CPF/salário/telefone) porque é exibido pra
// qualquer autenticado, não só RH.
router.get('/aniversariantes', async (req, res) => {
  try {
    const hoje = new Date();
    const mes = hoje.getMonth() + 1;

    const { data, error } = await supabase
      .from('rh_funcionarios')
      .select('id, nome, foto_url, cargo, area, data_nascimento')
      .in('status', ['ativo', 'ferias', 'licenca'])
      .is('deleted_at', null)
      .not('data_nascimento', 'is', null);
    if (error) throw error;

    const doMes = (data || [])
      .filter((f) => {
        const d = new Date(`${f.data_nascimento}T12:00:00`);
        return d.getMonth() + 1 === mes;
      })
      .map((f) => {
        const d = new Date(`${f.data_nascimento}T12:00:00`);
        return { id: f.id, nome: f.nome, foto_url: f.foto_url, cargo: f.cargo, area: f.area, dia: d.getDate() };
      })
      .sort((a, b) => a.dia - b.dia);

    res.json(doMes);
  } catch (e) {
    console.error('[PainelRH aniversariantes]', e.message);
    res.status(500).json({ error: 'Erro ao buscar aniversariantes' });
  }
});

// GET /api/painel-rh/eventos — próximos eventos visíveis no painel.
router.get('/eventos', async (req, res) => {
  try {
    const { data: cats } = await supabase
      .from('event_categories')
      .select('id, name')
      .in('name', CATEGORIAS_AUTOMATICAS);
    const idsAutomaticos = (cats || []).map((c) => c.id);

    const hoje = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from('events')
      .select('id, name, date, location, category_id, visivel_painel_rh, event_categories(name, color)')
      .gte('date', hoje)
      .order('date')
      .limit(50);
    if (error) throw error;

    const visiveis = (data || []).filter((e) => {
      if (e.visivel_painel_rh === true) return true;
      if (e.visivel_painel_rh === false) return false;
      return idsAutomaticos.includes(e.category_id);
    });

    res.json(
      visiveis.slice(0, 10).map((e) => ({
        id: e.id,
        nome: e.name,
        data: e.date,
        local: e.location,
        categoria: e.event_categories?.name || null,
        categoria_cor: e.event_categories?.color || null,
      }))
    );
  } catch (e) {
    console.error('[PainelRH eventos]', e.message);
    res.status(500).json({ error: 'Erro ao buscar eventos' });
  }
});

// GET /api/painel-rh/comunicados — publicados, pro painel geral.
router.get('/comunicados', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('rh_comunicados')
      .select('id, titulo, corpo, publicado_em')
      .eq('status', 'publicado')
      .is('deleted_at', null)
      .order('publicado_em', { ascending: false })
      .limit(5);
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    console.error('[PainelRH comunicados]', e.message);
    res.status(500).json({ error: 'Erro ao buscar comunicados' });
  }
});

// ── Gestão de comunicados (RH nível >=3) ──

router.get('/comunicados/admin', authorizeModule('rh', 1), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('rh_comunicados')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    console.error('[PainelRH comunicados/admin]', e.message);
    res.status(500).json({ error: 'Erro ao buscar comunicados' });
  }
});

router.post('/comunicados', authorizeModule('rh', 3), async (req, res) => {
  try {
    const { titulo, corpo } = req.body;
    if (!titulo?.trim() || !corpo?.trim()) {
      return res.status(400).json({ error: 'Título e corpo são obrigatórios' });
    }
    const { data, error } = await supabase
      .from('rh_comunicados')
      .insert({ titulo: titulo.trim(), corpo: corpo.trim(), criado_por: req.user?.id ?? null })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    console.error('[PainelRH comunicados POST]', e.message);
    res.status(500).json({ error: 'Erro ao criar comunicado' });
  }
});

router.put('/comunicados/:id', authorizeModule('rh', 3), async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ error: 'ID inválido' });
    const { titulo, corpo } = req.body;
    if (!titulo?.trim() || !corpo?.trim()) {
      return res.status(400).json({ error: 'Título e corpo são obrigatórios' });
    }
    const { data, error } = await supabase
      .from('rh_comunicados')
      .update({ titulo: titulo.trim(), corpo: corpo.trim(), updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Comunicado não encontrado' });
    res.json(data);
  } catch (e) {
    console.error('[PainelRH comunicados PUT]', e.message);
    res.status(500).json({ error: 'Erro ao atualizar comunicado' });
  }
});

router.post('/comunicados/:id/publicar', authorizeModule('rh', 3), async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ error: 'ID inválido' });
    const { data, error } = await supabase
      .from('rh_comunicados')
      .update({ status: 'publicado', publicado_em: new Date().toISOString() })
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Comunicado não encontrado' });
    res.json(data);
  } catch (e) {
    console.error('[PainelRH comunicados publicar]', e.message);
    res.status(500).json({ error: 'Erro ao publicar comunicado' });
  }
});

router.post('/comunicados/:id/arquivar', authorizeModule('rh', 3), async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ error: 'ID inválido' });
    const { data, error } = await supabase
      .from('rh_comunicados')
      .update({ status: 'arquivado' })
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Comunicado não encontrado' });
    res.json(data);
  } catch (e) {
    console.error('[PainelRH comunicados arquivar]', e.message);
    res.status(500).json({ error: 'Erro ao arquivar comunicado' });
  }
});

router.delete('/comunicados/:id', authorizeModule('rh', 3), async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ error: 'ID inválido' });
    const { error } = await supabase
      .from('rh_comunicados')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[PainelRH comunicados DELETE]', e.message);
    res.status(500).json({ error: 'Erro ao excluir comunicado' });
  }
});

module.exports = router;
