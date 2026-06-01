// ============================================================================
// Formulario PUBLICO de decisao online · "Eu aceito Jesus"
// ============================================================================
// Link fixado na descricao/chat da live. Quem assiste online e decide preenche
// nome + telefone · o sistema:
//   1. resolve o culto online que esta NO AR agora (janela do horario);
//   2. grava cultos_decisoes_pessoas (tipo='online', fonte='form_publico');
//   3. o trigger fn_cultos_dec_online_form_incrementa soma +1 em
//      cultos.decisoes_online (KPI ONL-13 recalcula em tempo real).
//
// Publico · sem auth · usa service_role (bypassa RLS). Monta em /api/public/...
// (ja coberto pelo publicLimiter global) + limiter dedicado anti-spam.
// ============================================================================
const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { supabase } = require('../utils/supabase');
const { findCultoAtual } = require('../services/onlineCollectors');

// Anti-spam dedicado · 1 IP nao manda dezenas de decisoes
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas · aguarde um instante.' },
});
router.use(limiter);

function soDigitos(s) {
  return String(s || '').replace(/\D/g, '');
}

// Resolve o culto online em curso agora. Reusa findCultoAtual (janela
// [-30min, +4h] do horario, has_online=true). Retorna null se nenhum.
async function resolverCultoOnline() {
  const culto = await findCultoAtual();
  if (!culto) return null;
  const st = culto.vol_service_types;
  if (!st?.has_online) return null;
  return { id: culto.id, data: culto.data, nome: st.name || 'Culto' };
}

// GET /ativo · o frontend pergunta se ha culto ao vivo pra mostrar o form
router.get('/ativo', async (_req, res) => {
  try {
    const culto = await resolverCultoOnline();
    res.json({ ativo: !!culto, culto });
  } catch (e) {
    console.error('[public/decisao-online/ativo]', e.message);
    res.json({ ativo: false, culto: null });
  }
});

// POST / · registra a decisao online
router.post('/', async (req, res) => {
  try {
    const nome = String(req.body?.nome || '').trim();
    const telefone = soDigitos(req.body?.telefone);
    const email = String(req.body?.email || '').trim() || null;

    if (nome.length < 2) {
      return res.status(400).json({ error: 'Informe seu nome.' });
    }
    if (telefone && (telefone.length < 10 || telefone.length > 11)) {
      return res.status(400).json({ error: 'Telefone invalido · use DDD + numero.' });
    }

    const culto = await resolverCultoOnline();
    if (!culto) {
      return res.status(409).json({
        error: 'sem_culto_ao_vivo',
        message: 'Nao ha culto ao vivo neste momento. Assista em cbrio.tv · sua decisao pode ser registrada durante a transmissao.',
      });
    }

    const { error } = await supabase.from('cultos_decisoes_pessoas').insert({
      culto_id: culto.id,
      nome,
      telefone: telefone || null,
      email,
      tipo_decisao: 'online',
      fonte: 'form_publico',
    });
    if (error) throw error;

    res.json({ ok: true, culto: { nome: culto.nome, data: culto.data } });
  } catch (e) {
    console.error('[public/decisao-online POST]', e.message);
    res.status(500).json({ error: 'Nao foi possivel registrar agora. Tente novamente.' });
  }
});

module.exports = router;
