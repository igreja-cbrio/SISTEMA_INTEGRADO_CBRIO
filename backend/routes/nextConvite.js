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

// Mesma régua do cuidados.js: contato feito = status real OU primeiro_contato_em.
const CONTATO_FEITO_STATUS = new Set(['respondeu', 'atendido_respondido', 'nao_respondeu', 'nao_compareceu', 'nao_atendido']);
const contatoFoiFeito = (c) => !!c.primeiro_contato_em || CONTATO_FEITO_STATUS.has(c.primeiro_contato_status);

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

// Marca o status da PESSOA quando a mensagem é disparada:
// - boas_vindas → primeiro_contato_em (vira "contactada", se ainda não tinha)
// - next       → next_convite_em (foi convidada pro NEXT, se ainda não tinha)
async function marcarStatusDisparo(ids, tipo, userId) {
  if (!Array.isArray(ids) || ids.length === 0) return;
  const agora = new Date().toISOString();
  if (tipo === 'boas_vindas') {
    await supabase.from('cui_convertidos')
      .update({ primeiro_contato_em: agora, primeiro_contato_por: userId || null })
      .in('id', ids).is('primeiro_contato_em', null);
  } else {
    await supabase.from('cui_convertidos')
      .update({ next_convite_em: agora, next_convite_por: userId || null })
      .in('id', ids).is('next_convite_em', null);
  }
}

// GET /pendentes?contato=nao|sim|todos — convertidos (últimos 120d) sem NEXT.
// Filtro por contato pastoral (padrão: não contactados, p/ aquecer com boas-vindas).
router.get('/pendentes', authorizeModule('cuidados', 1), async (req, res) => {
  try {
    const contato = String(req.query.contato || 'todos'); // 'nao' | 'sim' | 'todos'
    const desde = new Date(Date.now() - 120 * DIA).toISOString().slice(0, 10);
    const { data: convs } = await supabase
      .from('cui_convertidos')
      .select('id, nome, cpf, telefone, area, data_culto, membro_id, primeiro_contato_em, primeiro_contato_status, next_convite_em')
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
        contatado: contatoFoiFeito(c),
        next_convite_em: c.next_convite_em || null,
      }))
      .filter((c) => (contato === 'nao' ? !c.contatado : contato === 'sim' ? c.contatado : true));
    res.json(pendentes);
  } catch (e) {
    console.error('[next-convite] pendentes:', e.message);
    res.status(500).json({ error: 'Erro ao carregar convertidos' });
  }
});

// GET /config — modelo de mensagem + link.
router.get('/config', authorizeModule('cuidados', 1), async (_req, res) => {
  try {
    const { data } = await supabase.from('next_convite_config').select('mensagem_modelo, mensagem_boas_vindas, link_inscricao').eq('id', 1).maybeSingle();
    res.json({
      mensagem_modelo: data?.mensagem_modelo || '',
      mensagem_boas_vindas: data?.mensagem_boas_vindas || '',
      link_inscricao: data?.link_inscricao || '',
      template_configurado: !!process.env.WHATSAPP_TEMPLATE_NEXT_CONVITE,
      template_boas_vindas_configurado: !!process.env.WHATSAPP_TEMPLATE_BOAS_VINDAS,
    });
  } catch (e) {
    console.error('[next-convite] config get:', e.message);
    res.status(500).json({ error: 'Erro ao carregar config' });
  }
});

// PUT /config — edita modelo + link.
router.put('/config', authorizeModule('cuidados', 2), async (req, res) => {
  try {
    const { mensagem_modelo, mensagem_boas_vindas, link_inscricao } = req.body || {};
    const patch = { id: 1, updated_at: new Date().toISOString() };
    if (mensagem_modelo !== undefined) patch.mensagem_modelo = mensagem_modelo != null ? String(mensagem_modelo).slice(0, 2000) : null;
    if (mensagem_boas_vindas !== undefined) patch.mensagem_boas_vindas = mensagem_boas_vindas != null ? String(mensagem_boas_vindas).slice(0, 2000) : null;
    if (link_inscricao !== undefined) patch.link_inscricao = link_inscricao != null ? String(link_inscricao).slice(0, 500) : null;
    const { error } = await supabase.from('next_convite_config').upsert(patch);
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

    // tipo: 'next' (convite com link no botão) ou 'boas_vindas' (só acolhimento, sem link)
    const tipo = req.body?.tipo === 'boas_vindas' ? 'boas_vindas' : 'next';
    const templateName = tipo === 'boas_vindas'
      ? process.env.WHATSAPP_TEMPLATE_BOAS_VINDAS
      : process.env.WHATSAPP_TEMPLATE_NEXT_CONVITE;

    const { data: convs } = await supabase
      .from('cui_convertidos').select('id, nome, telefone').in('id', ids).is('deleted_at', null);

    let enviados = 0, sem_telefone = 0, falhas = 0;
    const enviadosIds = [];
    for (const c of convs || []) {
      const tel = soDigitos(c.telefone);
      if (!tel) { sem_telefone++; continue; }
      if (!templateName) continue; // sem template aprovado: não envia (no-op)
      const primeiro = (c.nome || '').trim().split(/\s+/)[0] || '';
      // Ambos os templates têm só {{1}} = nome no corpo (o link do NEXT é botão).
      const r = await wpp.sendTemplate(c.telefone, templateName, 'pt_BR', [primeiro]);
      if (r?.sent) { enviados++; enviadosIds.push(c.id); } else falhas++;
    }
    // atualiza o status da pessoa só de quem realmente recebeu
    if (enviadosIds.length) await marcarStatusDisparo(enviadosIds, tipo, req.user?.id);

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

// POST /marcar { convertido_ids, tipo } — marca o status da pessoa SEM enviar
// pela API (usado quando o envio foi manual pelo WhatsApp/wa.me).
router.post('/marcar', authorizeModule('cuidados', 2), async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.convertido_ids) ? req.body.convertido_ids : [];
    if (ids.length === 0) return res.status(400).json({ error: 'Nada para marcar' });
    const tipo = req.body?.tipo === 'boas_vindas' ? 'boas_vindas' : 'next';
    await marcarStatusDisparo(ids, tipo, req.user?.id);
    res.json({ ok: true });
  } catch (e) {
    console.error('[next-convite] marcar:', e.message);
    res.status(500).json({ error: 'Erro ao marcar status' });
  }
});

module.exports = router;
