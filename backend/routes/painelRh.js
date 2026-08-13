const router = require('express').Router();
const { authenticate, authorizeModule } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { proximoQuartoDomingoISO } = require('./publicBatismo');

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

    // Busca eventos únicos com data futura + TODOS os recorrentes (que podem
    // ter events.date antiga — a ocorrência de verdade vive em
    // event_occurrences, mesmo padrão usado no PATCH /:id/status "reabrir").
    // visivel_painel_rh é aditivo (migration 20260812200000) — se ainda não
    // aplicada, pedir a coluna faz o PostgREST recusar a query INTEIRA (lição
    // do parcelas_max). Tenta com ela; em 42703, cai sem ela.
    async function buscarEventos(comVisivelPainelRh) {
      const campos = comVisivelPainelRh
        ? 'id, name, date, location, category_id, recurrence, visivel_painel_rh, event_categories(name, color)'
        : 'id, name, date, location, category_id, recurrence, event_categories(name, color)';
      const [unicos, recorrentes] = await Promise.all([
        supabase.from('events').select(campos).eq('recurrence', 'unico').gte('date', hoje).order('date').limit(50),
        supabase.from('events').select(campos).neq('recurrence', 'unico').limit(100),
      ]);
      if (unicos.error) throw unicos.error;
      if (recorrentes.error) throw recorrentes.error;
      const porId = new Map();
      [...(unicos.data || []), ...(recorrentes.data || [])].forEach((e) => porId.set(e.id, e));
      return [...porId.values()];
    }

    let eventos;
    try {
      eventos = await buscarEventos(true);
    } catch (err) {
      if (err.code !== '42703') throw err;
      eventos = (await buscarEventos(false)).map((e) => ({ ...e, visivel_painel_rh: null }));
    }

    // Pra recorrentes, a data efetiva é a próxima ocorrência PENDENTE — não a
    // events.date (que guarda só a data da 1ª ocorrência, ficando no passado
    // pra sempre depois que o evento começa a se repetir).
    const idsRecorrentes = eventos.filter((e) => e.recurrence !== 'unico').map((e) => e.id);
    const proximaOcorrenciaPorEvento = new Map();
    if (idsRecorrentes.length > 0) {
      const { data: occs } = await supabase
        .from('event_occurrences')
        .select('event_id, date')
        .in('event_id', idsRecorrentes)
        .eq('status', 'pendente')
        .gte('date', hoje)
        .order('date');
      (occs || []).forEach((o) => {
        if (!proximaOcorrenciaPorEvento.has(o.event_id)) proximaOcorrenciaPorEvento.set(o.event_id, o.date);
      });
    }

    const comDataEfetiva = eventos
      .map((e) => ({ ...e, data_efetiva: e.recurrence === 'unico' ? e.date : proximaOcorrenciaPorEvento.get(e.id) || null }))
      .filter((e) => e.data_efetiva && e.data_efetiva >= hoje);

    const visiveis = comDataEfetiva.filter((e) => {
      if (e.visivel_painel_rh === true) return true;
      if (e.visivel_painel_rh === false) return false;
      return idsAutomaticos.includes(e.category_id);
    });

    const lista = visiveis
      .sort((a, b) => a.data_efetiva.localeCompare(b.data_efetiva))
      .slice(0, 9)
      .map((e) => ({
        id: e.id,
        nome: e.name,
        data: e.data_efetiva,
        local: e.location,
        categoria: e.event_categories?.name || null,
        categoria_cor: e.event_categories?.color || null,
      }));

    // Batismo não é uma linha em `events` — a data é calculada (próximo 4º
    // domingo, mesma régua do formulário público de inscrição). Mas pode
    // TAMBÉM existir um evento "Batismo" cadastrado manualmente no módulo
    // Eventos pra essa mesma data — sem essa checagem ele apareceria 2x.
    const dataBatismo = proximoQuartoDomingoISO();
    const jaTemBatismoNaLista = lista.some((e) => e.data === dataBatismo && /batismo/i.test(e.nome));
    if (!jaTemBatismoNaLista) {
      lista.push({
        id: 'batismo',
        nome: 'Batismo',
        data: dataBatismo,
        local: null,
        categoria: 'Batismo',
        categoria_cor: null,
      });
    }

    // Extensão pro /inscricoes (Marcos, 13/08): a espinha de inscrições é
    // tabela separada de `events` — sem isso, evento publicado ali (ex.:
    // Celebra) nunca aparecia aqui. Interino até a unificação futura das
    // duas tabelas/módulos; só "publicado" com data futura entra (é o mesmo
    // gate que já expõe o formulário público, sem flag extra por enquanto).
    try {
      const { data: eventosInsc } = await supabase
        .from('insc_eventos')
        .select('id, nome, data, local')
        .eq('status', 'publicado')
        .gte('data', hoje)
        .is('deleted_at', null)
        .order('data')
        .limit(10);
      (eventosInsc || []).forEach((e) => {
        if (lista.some((l) => l.data === e.data && l.nome === e.nome)) return;
        lista.push({
          id: `insc:${e.id}`,
          nome: e.nome,
          data: e.data,
          local: e.local,
          categoria: 'Inscrições',
          categoria_cor: null,
        });
      });
    } catch (err) {
      console.error('[PainelRH eventos] insc_eventos', err.message);
    }

    lista.sort((a, b) => a.data.localeCompare(b.data));

    res.json(lista.slice(0, 10));
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
