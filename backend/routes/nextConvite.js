// ============================================================================
// Convite do NEXT · convidar convertidos que ainda não fizeram o NEXT
// ============================================================================
// Lista os convertidos sem NEXT, deixa selecionar e dispara o convite por
// WhatsApp (template aprovado da Meta · env WHATSAPP_TEMPLATE_NEXT_CONVITE),
// com o link de inscrição. Modelo de mensagem editável (config singleton).
// ============================================================================

const router = require('express').Router();
const { authenticate, authorizeModule } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const wpp = require('../services/whatsappService');

const DIA = 86400000;
const soDigitos = (s) => String(s || '').replace(/\D/g, '');
const chaveNome = (s) => String(s || '').trim().toLowerCase();

router.use(authenticate);

// Marca quais convertidos JÁ têm NEXT (match por membro_id/cpf/nome).
async function jaTemNext(membroIds, cpfs, nomes) {
  const membro = new Set(), cpf = new Set(), nome = new Set();
  const qIn = async (col, vals, alvo, tf = (x) => x) => {
    const uniq = [...new Set(vals.filter(Boolean))];
    for (let i = 0; i < uniq.length; i += 200) {
      const chunk = uniq.slice(i, i + 200);
      if (chunk.length === 0) break;
      const { data } = await supabase.from('next_inscricoes').select(col).in(col, chunk);
      for (const r of data || []) if (r[col] != null) alvo.add(tf(r[col]));
    }
  };
  await qIn('membro_id', membroIds, membro);
  await qIn('cpf', cpfs, cpf, soDigitos);
  await qIn('nome', nomes, nome, chaveNome);
  return { membro, cpf, nome };
}

// GET /pendentes — convertidos (últimos 120d) sem NEXT, com telefone p/ convite.
router.get('/pendentes', authorizeModule('cuidados', 1), async (req, res) => {
  try {
    const desde = new Date(Date.now() - 120 * DIA).toISOString().slice(0, 10);
    const { data: convs } = await supabase
      .from('cui_convertidos')
      .select('id, nome, cpf, telefone, area, data_culto, membro_id')
      .is('deleted_at', null)
      .gte('data_culto', desde)
      .order('data_culto', { ascending: false })
      .limit(1000);

    const sets = await jaTemNext(
      (convs || []).map((c) => c.membro_id).filter(Boolean),
      (convs || []).map((c) => c.cpf).filter(Boolean),
      (convs || []).map((c) => c.nome).filter(Boolean),
    );
    const temNext = (c) =>
      (c.membro_id && sets.membro.has(c.membro_id)) ||
      (c.cpf && sets.cpf.has(soDigitos(c.cpf))) ||
      (c.nome && sets.nome.has(chaveNome(c.nome)));

    const pendentes = (convs || [])
      .filter((c) => !temNext(c))
      .map((c) => ({
        id: c.id, nome: c.nome, telefone: c.telefone || null, area: c.area || null,
        data_culto: c.data_culto, tem_telefone: !!soDigitos(c.telefone),
      }));
    res.json(pendentes);
  } catch (e) {
    console.error('[next-convite] pendentes:', e.message);
    res.status(500).json({ error: 'Erro ao carregar convertidos' });
  }
});

// GET /config — modelo de mensagem + link.
router.get('/config', authorizeModule('cuidados', 1), async (_req, res) => {
  try {
    const { data } = await supabase.from('next_convite_config').select('mensagem_modelo, link_inscricao').eq('id', 1).maybeSingle();
    res.json({
      mensagem_modelo: data?.mensagem_modelo || '',
      link_inscricao: data?.link_inscricao || '',
      template_configurado: !!process.env.WHATSAPP_TEMPLATE_NEXT_CONVITE,
    });
  } catch (e) {
    console.error('[next-convite] config get:', e.message);
    res.status(500).json({ error: 'Erro ao carregar config' });
  }
});

// PUT /config — edita modelo + link.
router.put('/config', authorizeModule('cuidados', 2), async (req, res) => {
  try {
    const { mensagem_modelo, link_inscricao } = req.body || {};
    const { error } = await supabase.from('next_convite_config').upsert({
      id: 1,
      mensagem_modelo: mensagem_modelo != null ? String(mensagem_modelo).slice(0, 2000) : null,
      link_inscricao: link_inscricao != null ? String(link_inscricao).slice(0, 500) : null,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[next-convite] config put:', e.message);
    res.status(500).json({ error: 'Erro ao salvar config' });
  }
});

// POST /enviar { convertido_ids: [] } — dispara o convite via template da Meta.
router.post('/enviar', authorizeModule('cuidados', 2), async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.convertido_ids) ? req.body.convertido_ids : [];
    if (ids.length === 0) return res.status(400).json({ error: 'Selecione ao menos uma pessoa' });

    const templateName = process.env.WHATSAPP_TEMPLATE_NEXT_CONVITE;
    const { data: cfg } = await supabase.from('next_convite_config').select('link_inscricao').eq('id', 1).maybeSingle();
    const link = cfg?.link_inscricao || 'https://cbrio.org/next';

    const { data: convs } = await supabase
      .from('cui_convertidos').select('id, nome, telefone').in('id', ids).is('deleted_at', null);

    let enviados = 0, sem_telefone = 0, falhas = 0;
    for (const c of convs || []) {
      const tel = soDigitos(c.telefone);
      if (!tel) { sem_telefone++; continue; }
      if (!templateName) continue; // sem template aprovado: não envia (no-op)
      const primeiro = (c.nome || '').trim().split(/\s+/)[0] || '';
      const r = await wpp.sendTemplate(c.telefone, templateName, 'pt_BR', [primeiro, link]);
      if (r?.sent) enviados++; else falhas++;
    }

    res.json({
      total: ids.length,
      enviados,
      sem_telefone,
      falhas,
      template_configurado: !!templateName,
    });
  } catch (e) {
    console.error('[next-convite] enviar:', e.message);
    res.status(500).json({ error: 'Erro ao enviar convites' });
  }
});

module.exports = router;
