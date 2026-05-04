// ============================================================================
// /api/pessoas/* - lookup unificado e helpers de pessoa
//
// Pedido do Marcos: Membresia e fonte unica. Antes de criar visitante /
// inscricao Next / voluntario, busca CPF aqui pra evitar duplicacao.
// ============================================================================

const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');

router.use(authenticate);

function cleanCpf(cpf) {
  return String(cpf || '').replace(/\D/g, '');
}

// ---------------------------------------------------------------------------
// findOrCreateMembro: dado cpf/email/telefone/nome, acha mem_membros existente
// ou cria um novo (status='visitante'). Retorna { membro_id, created, conflicts }.
// Usado por outras rotas (next, voluntariado, etc) para evitar duplicacao.
// ---------------------------------------------------------------------------
async function findOrCreateMembro({ cpf, email, telefone, nome, status = 'visitante' }) {
  const cleanedCpf = cleanCpf(cpf);
  const cleanedEmail = email ? String(email).trim().toLowerCase() : null;
  const cleanedTel = telefone ? String(telefone).replace(/\D/g, '') : null;

  // 1) Busca por CPF (mais confiavel)
  if (cleanedCpf && cleanedCpf.length === 11) {
    const { data } = await supabase
      .from('mem_membros')
      .select('id, nome, email, status')
      .eq('cpf', cleanedCpf)
      .maybeSingle();
    if (data?.id) return { membro_id: data.id, created: false, matched_by: 'cpf' };
  }

  // 2) Por email
  if (cleanedEmail) {
    const { data } = await supabase
      .from('mem_membros')
      .select('id, nome, email')
      .ilike('email', cleanedEmail)
      .limit(1);
    if (data && data[0]?.id) return { membro_id: data[0].id, created: false, matched_by: 'email' };
  }

  // 3) Cria novo
  const payload = {
    nome: nome || 'Sem nome',
    email: cleanedEmail || null,
    telefone: cleanedTel || null,
    cpf: cleanedCpf && cleanedCpf.length === 11 ? cleanedCpf : null,
    status,
    active: true,
  };
  const { data, error } = await supabase
    .from('mem_membros')
    .insert(payload)
    .select('id')
    .single();
  if (error) throw error;
  return { membro_id: data.id, created: true };
}

// ---------------------------------------------------------------------------
// GET /api/pessoas/lookup
// Query: ?cpf=xxx&email=yyy&telefone=zzz
// Retorna pessoa em mem_membros + papeis ativos (voluntario, visitante,
// inscrito_next).
// ---------------------------------------------------------------------------
router.get('/lookup', async (req, res) => {
  try {
    const cpf = cleanCpf(req.query.cpf);
    const email = req.query.email ? String(req.query.email).trim().toLowerCase() : null;
    const tel = req.query.telefone ? String(req.query.telefone).replace(/\D/g, '') : null;

    if (!cpf && !email && !tel) {
      return res.status(400).json({ error: 'Informe ao menos cpf, email ou telefone' });
    }

    // Constroi OR para encontrar o melhor match em mem_membros
    let q = supabase.from('mem_membros').select('id, nome, email, telefone, cpf, status, foto_url, familia_id');
    const ors = [];
    if (cpf && cpf.length === 11) ors.push(`cpf.eq.${cpf}`);
    if (email) ors.push(`email.ilike.${email}`);
    if (tel) ors.push(`telefone.ilike.%${tel}%`);
    if (ors.length === 0) return res.json({ found: false });

    const { data: membros, error } = await q.or(ors.join(',')).limit(5);
    if (error) throw error;

    if (!membros || membros.length === 0) {
      // Fallback: busca em int_visitantes / next_inscricoes (sem mem_membros ainda)
      const visitantePromise = (cpf && cpf.length === 11) || tel || email
        ? supabase.from('int_visitantes')
            .select('id, nome, email, telefone, cpf, status, membresia_id, data_visita')
            .or([
              cpf && cpf.length === 11 ? `cpf.eq.${cpf}` : null,
              email ? `email.ilike.${email}` : null,
              tel ? `telefone.ilike.%${tel}%` : null,
            ].filter(Boolean).join(','))
            .order('data_visita', { ascending: false })
            .limit(1)
        : Promise.resolve({ data: [] });

      const nextPromise = (cpf && cpf.length === 11) || email
        ? supabase.from('next_inscricoes')
            .select('id, nome, email, cpf, evento_id, membro_id, created_at')
            .or([
              cpf && cpf.length === 11 ? `cpf.eq.${cpf}` : null,
              email ? `email.ilike.${email}` : null,
            ].filter(Boolean).join(','))
            .order('created_at', { ascending: false })
            .limit(1)
        : Promise.resolve({ data: [] });

      const [{ data: visitantes }, { data: inscricoes }] = await Promise.all([visitantePromise, nextPromise]);
      if ((visitantes || []).length === 0 && (inscricoes || []).length === 0) {
        return res.json({ found: false });
      }
      return res.json({
        found: true,
        membro: null, // ainda nao virou mem_membros
        sugestao_visitante: (visitantes || [])[0] || null,
        sugestao_inscricao_next: (inscricoes || [])[0] || null,
      });
    }

    const m = membros[0];
    // Busca papeis ativos
    const [vol, visitante, inscNext, grupo, contribuicao] = await Promise.all([
      supabase.from('vol_profiles').select('id, planning_center_id, full_name').eq('membresia_id', m.id).maybeSingle(),
      supabase.from('int_visitantes').select('id, status, data_visita').eq('membresia_id', m.id).order('data_visita', { ascending: false }).limit(1),
      supabase.from('next_inscricoes').select('id, evento_id, created_at').eq('membro_id', m.id).order('created_at', { ascending: false }).limit(3),
      supabase.from('mem_grupo_membros').select('grupo_id, mem_grupos(nome)').eq('membro_id', m.id).is('saiu_em', null).maybeSingle(),
      supabase.from('mem_contribuicoes').select('id').eq('membro_id', m.id).gte('data', new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10)).limit(1),
    ]);

    res.json({
      found: true,
      membro: m,
      papeis: {
        voluntario: vol?.data || null,
        visitante: (visitante?.data || [])[0] || null,
        inscricoes_next: inscNext?.data || [],
        grupo_ativo: grupo?.data || null,
        contribuinte_recente: (contribuicao?.data || []).length > 0,
      },
      multi_match: membros.length > 1 ? membros.slice(1).map(x => ({ id: x.id, nome: x.nome, cpf: x.cpf })) : null,
    });
  } catch (e) {
    console.error('pessoas lookup:', e.message);
    res.status(500).json({ error: 'Erro no lookup' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/pessoas/find-or-create
// Body: { cpf, email, telefone, nome, status? }
// Usado por rotas que querem garantir mem_membros antes de seguir.
// ---------------------------------------------------------------------------
router.post('/find-or-create', async (req, res) => {
  try {
    const r = await findOrCreateMembro(req.body || {});
    res.json(r);
  } catch (e) {
    console.error('pessoas find-or-create:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
module.exports.findOrCreateMembro = findOrCreateMembro;
