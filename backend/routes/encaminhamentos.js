// ─────────────────────────────────────────────────────────────────────────
// Encaminhamentos da jornada · caixa de entrada das áreas receptoras
// ─────────────────────────────────────────────────────────────────────────
// O pastor encaminha o convertido (desfecho do encontro em /cuidados) e a
// área receptora (Grupos / Voluntários / Jornada 180) recebe aqui, faz o
// primeiro contato e registra a devolutiva. Auth por módulo do destino:
// quem tem leitura em 'cuidados' vê tudo; quem tem 'grupos'/'voluntariado'
// vê o seu destino. Tudo passa pelo backend (service_role) · RLS é defesa extra.
const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');

router.use(authenticate);

const DEVOLUTIVAS = ['nao_respondeu', 'em_duvida', 'engajou', 'sem_interesse'];
const STATUS_TODOS = ['pendente', ...DEVOLUTIVAS];

function nivel(req, slug) {
  if (['admin', 'diretor'].includes(req.user?.role)) return 5;
  return req.user?.granular?.modulePerms?.[slug]?.leitura ?? 0;
}
// Cuidados (origem pastoral) enxerga tudo · cada área enxerga o seu destino
function podeVerDestino(req, destino) {
  if (nivel(req, 'cuidados') >= 1) return true;
  if (destino === 'grupos' && nivel(req, 'grupos') >= 1) return true;
  if (destino === 'voluntarios' && nivel(req, 'voluntariado') >= 1) return true;
  return false;
}

// GET /api/encaminhamentos?destino=&status=
router.get('/', async (req, res) => {
  try {
    const { destino, status } = req.query;
    if (destino && !podeVerDestino(req, destino)) return res.status(403).json({ error: 'Sem acesso a esse destino' });
    if (!destino && nivel(req, 'cuidados') < 1) return res.status(400).json({ error: 'Informe um destino' });

    let q = supabase.from('jornada_encaminhamentos').select('*')
      .is('deleted_at', null).order('encaminhado_em', { ascending: false }).limit(500);
    if (destino) q = q.eq('destino', destino);
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/encaminhamentos/resumo?destino=  → contagem (badge da aba)
router.get('/resumo', async (req, res) => {
  try {
    const { destino } = req.query;
    if (destino && !podeVerDestino(req, destino)) return res.status(403).json({ error: 'Sem acesso' });
    if (!destino && nivel(req, 'cuidados') < 1) return res.status(400).json({ error: 'Informe um destino' });
    let q = supabase.from('jornada_encaminhamentos').select('status').is('deleted_at', null);
    if (destino) q = q.eq('destino', destino);
    const { data, error } = await q;
    if (error) throw error;
    const counts = {};
    (data || []).forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1; });
    // "a fazer" = ainda não engajou nem foi descartado
    const pendentes = (data || []).filter(r => ['pendente', 'nao_respondeu', 'em_duvida'].includes(r.status)).length;
    res.json({ total: (data || []).length, pendentes, counts });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/encaminhamentos/aux/grupos → grupos ativos pro select do "Engajou"
// (precisa vir ANTES de /:id · senão o Express casa 'aux' como id)
router.get('/aux/grupos', async (req, res) => {
  try {
    if (!podeVerDestino(req, 'grupos')) return res.status(403).json({ error: 'Sem acesso' });
    const { data, error } = await supabase.from('mem_grupos')
      .select('id, nome')
      .eq('ativo', true).is('deleted_at', null)
      .order('nome').limit(500);
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/encaminhamentos/:id  → encaminhamento + log de contatos (a ficha)
router.get('/:id', async (req, res) => {
  try {
    const { data: enc, error } = await supabase.from('jornada_encaminhamentos').select('*').eq('id', req.params.id).single();
    if (error) throw error;
    if (!enc || !podeVerDestino(req, enc.destino)) return res.status(403).json({ error: 'Sem acesso' });
    const { data: contatos } = await supabase
      .from('jornada_encaminhamento_contatos').select('*')
      .eq('encaminhamento_id', req.params.id).order('created_at', { ascending: false });
    res.json({ ...enc, contatos: contatos || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────
// "Engajou" fecha o loop: materializa o vínculo REAL do valor (é o que a NSM
// e os KPIs leem) — antes só mudava o status e a pessoa ficava "solta".
//   grupos      → mem_grupo_membros (exige grupo_id · select na UI)
//   voluntarios → mem_voluntarios (ministério "Voluntariado (geral)" por padrão)
//   jornada180  → cui_jornada180 (1º encontro na data do contato)
// Idempotente: se a pessoa já tem o vínculo ativo, não duplica.
// ─────────────────────────────────────────────────────────────────────────
async function materializarEngajamento(enc, body) {
  let membroId = enc.membro_id || null;
  if (!membroId && enc.convertido_id) {
    const { data: conv } = await supabase.from('cui_convertidos')
      .select('membro_id').eq('id', enc.convertido_id).maybeSingle();
    membroId = conv?.membro_id || null;
  }
  if (!membroId) {
    return { vinculo: null, aviso: 'Encaminhamento sem pessoa vinculada — devolutiva registrada, mas o engajamento não conta na NSM até vincular o membro.' };
  }

  const dataRef = body.data_contato || new Date().toISOString().slice(0, 10);

  if (enc.destino === 'grupos') {
    const { data: atual } = await supabase.from('mem_grupo_membros')
      .select('id, grupo_id')
      .eq('membro_id', membroId).is('saiu_em', null).is('deleted_at', null)
      .limit(1).maybeSingle();
    if (atual) return { vinculo: { tipo: 'grupo', ja_existia: true } };
    if (!body.grupo_id) {
      const err = new Error('Informe em qual grupo a pessoa engajou');
      err.status = 400;
      throw err;
    }
    const { error } = await supabase.from('mem_grupo_membros')
      .insert({ grupo_id: body.grupo_id, membro_id: membroId, entrou_em: dataRef });
    if (error) throw error;
    return { vinculo: { tipo: 'grupo', grupo_id: body.grupo_id } };
  }

  if (enc.destino === 'voluntarios') {
    const { data: atual } = await supabase.from('mem_voluntarios')
      .select('id')
      .eq('membro_id', membroId).is('ate', null).is('deleted_at', null)
      .limit(1).maybeSingle();
    if (atual) return { vinculo: { tipo: 'voluntario', ja_existia: true } };
    let ministerioId = body.ministerio_id || null;
    if (!ministerioId) {
      const { data: min } = await supabase.from('mem_ministerios')
        .select('id').eq('nome', 'Voluntariado (geral)').limit(1).maybeSingle();
      ministerioId = min?.id || null;
      if (!ministerioId) {
        const { data: novo, error: eMin } = await supabase.from('mem_ministerios')
          .insert({ nome: 'Voluntariado (geral)', descricao: 'Ministério guarda-chuva do voluntariado · ajuste o ministério específico pela Membresia.' })
          .select('id').single();
        if (eMin) throw eMin;
        ministerioId = novo.id;
      }
    }
    // área de culto do voluntário = área da conversão (cascata da mandala Servir)
    const { data: conv } = await supabase.from('cui_convertidos')
      .select('area').eq('membro_id', membroId).is('deleted_at', null)
      .in('area', ['kids', 'sede', 'ami', 'bridge', 'online'])
      .order('data_culto', { ascending: false }).limit(1).maybeSingle();
    const { error } = await supabase.from('mem_voluntarios').insert({
      membro_id: membroId,
      ministerio_id: ministerioId,
      papel: 'Voluntário',
      desde: dataRef,
      area: conv?.area || null,
      observacoes: `Via encaminhamento da jornada (${enc.id})`,
    });
    if (error) throw error;
    return { vinculo: { tipo: 'voluntario' } };
  }

  if (enc.destino === 'jornada180') {
    const { data: existente } = await supabase.from('cui_jornada180')
      .select('id').eq('membro_id', membroId).limit(1).maybeSingle();
    if (existente) return { vinculo: { tipo: 'jornada180', ja_existia: true } };
    const { error } = await supabase.from('cui_jornada180').insert({
      membro_id: membroId,
      nome: enc.nome,
      etapa: 1,
      data_encontro: dataRef,
      presente: true,
      observacoes: `Via encaminhamento da jornada (${enc.id})`,
    });
    if (error) throw error;
    return { vinculo: { tipo: 'jornada180' } };
  }

  return { vinculo: null };
}

// POST /api/encaminhamentos/:id/contato  → registra contato + atualiza status (devolutiva)
router.post('/:id/contato', async (req, res) => {
  try {
    const { canal, observacao, devolutiva, data_contato } = req.body;
    const userId = req.user.userId || req.user.id;
    const nome = req.user.name || req.user.nome || null;

    const { data: enc, error: eEnc } = await supabase.from('jornada_encaminhamentos').select('*').eq('id', req.params.id).single();
    if (eEnc) throw eEnc;
    if (!enc || !podeVerDestino(req, enc.destino)) return res.status(403).json({ error: 'Sem acesso' });
    if (devolutiva && !DEVOLUTIVAS.includes(devolutiva)) return res.status(400).json({ error: 'Devolutiva inválida' });
    if (!observacao && !devolutiva) return res.status(400).json({ error: 'Informe a observação ou a devolutiva' });

    // "Engajou" materializa o vínculo ANTES de gravar o contato (se faltar o
    // grupo, devolve 400 e nada é gravado · vínculo é idempotente)
    let vinculo = null;
    let aviso = null;
    if (devolutiva === 'engajou') {
      ({ vinculo, aviso } = await materializarEngajamento(enc, req.body));
    }

    const { data: contato, error } = await supabase.from('jornada_encaminhamento_contatos').insert({
      encaminhamento_id: req.params.id,
      data_contato: data_contato || new Date().toISOString().slice(0, 10),
      canal: canal || null,
      observacao: observacao || null,
      devolutiva: devolutiva || null,
      feito_por: userId,
      feito_por_nome: nome,
    }).select().single();
    if (error) throw error;

    // Atualiza o pai: 1º contato marca recebido · devolutiva vira o status · terminal resolve
    const patch = { updated_at: new Date().toISOString() };
    if (!enc.recebido_em) { patch.recebido_em = new Date().toISOString(); patch.recebido_por = userId; }
    if (devolutiva) {
      patch.status = devolutiva;
      patch.resolvido_em = ['engajou', 'sem_interesse'].includes(devolutiva) ? new Date().toISOString() : null;
    }
    await supabase.from('jornada_encaminhamentos').update(patch).eq('id', req.params.id);

    res.status(201).json({ ...contato, vinculo, aviso });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// PATCH /api/encaminhamentos/:id  → ajuste manual de status
// "engajou" também materializa o vínculo aqui (mesma regra do fluxo de
// contato) — senão o ajuste manual deixava a pessoa "solta" pra NSM.
router.patch('/:id', async (req, res) => {
  try {
    const { status } = req.body;
    if (status && !STATUS_TODOS.includes(status)) return res.status(400).json({ error: 'Status inválido' });
    const { data: enc } = await supabase.from('jornada_encaminhamentos').select('*').eq('id', req.params.id).single();
    if (!enc || !podeVerDestino(req, enc.destino)) return res.status(403).json({ error: 'Sem acesso' });

    let vinculo = null;
    let aviso = null;
    if (status === 'engajou') {
      ({ vinculo, aviso } = await materializarEngajamento(enc, req.body));
    }

    const patch = { updated_at: new Date().toISOString() };
    if (status) {
      patch.status = status;
      patch.resolvido_em = ['engajou', 'sem_interesse'].includes(status) ? new Date().toISOString() : null;
    }
    const { data, error } = await supabase.from('jornada_encaminhamentos').update(patch).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ ...data, vinculo, aviso });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

module.exports = router;
