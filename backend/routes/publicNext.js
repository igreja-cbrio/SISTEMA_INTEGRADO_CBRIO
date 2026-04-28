// ============================================================================
// Rotas publicas do modulo NEXT
//
// GET  /api/public/next/eventos - eventos com status='agendado' (data >= hoje)
// POST /api/public/next/inscrever - cria inscricao (sem auth)
// ============================================================================

const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { supabase } = require('../utils/supabase');
const { notificar } = require('../services/notificar');

// Rate limit dedicado para inscricoes (anti-spam)
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 min
  max: 10,
  message: { error: 'Muitas requisicoes. Aguarde um minuto.' },
});
router.use(limiter);

function soDigitos(s) { return String(s || '').replace(/\D/g, ''); }
function ehEmailValido(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '')); }
function ehCpfValido(cpf) {
  const c = soDigitos(cpf);
  return c.length === 11 && !/^(\d)\1+$/.test(c);
}

// ----------------------------------------------------------------------------
// GET /eventos - lista eventos agendados
// ----------------------------------------------------------------------------
router.get('/eventos', async (_req, res) => {
  const hoje = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('next_eventos')
    .select('id, data, titulo, status')
    .eq('status', 'agendado')
    .gte('data', hoje)
    .order('data');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// ----------------------------------------------------------------------------
// POST /inscrever
// ----------------------------------------------------------------------------
router.post('/inscrever', async (req, res) => {
  try {
    const {
      evento_id,
      nome, sobrenome, cpf, telefone, email, data_nascimento, observacoes,
      website, // honeypot
    } = req.body || {};

    if (website) return res.status(200).json({ ok: true }); // honeypot

    if (!nome || nome.trim().length < 2) {
      return res.status(400).json({ error: 'Nome obrigatorio' });
    }
    if (!email || !ehEmailValido(email)) {
      return res.status(400).json({ error: 'Email invalido' });
    }
    if (!telefone || soDigitos(telefone).length < 10) {
      return res.status(400).json({ error: 'Telefone invalido' });
    }
    if (cpf && !ehCpfValido(cpf)) {
      return res.status(400).json({ error: 'CPF invalido' });
    }

    const cleanCpf = cpf ? soDigitos(cpf) : null;
    const cleanEmail = String(email).toLowerCase().trim();

    // Resolver evento: se nao informado, pegar o proximo agendado
    let eventoId = evento_id || null;
    if (!eventoId) {
      const hoje = new Date().toISOString().slice(0, 10);
      const { data: prox } = await supabase
        .from('next_eventos')
        .select('id')
        .eq('status', 'agendado')
        .gte('data', hoje)
        .order('data')
        .limit(1)
        .maybeSingle();
      eventoId = prox?.id || null;
    }

    // Snapshot do status atual da pessoa (cruza com base existente)
    let jaBatizado = false, jaVoluntario = false, jaDoador = false;
    let membroId = null;
    if (cleanCpf) {
      const { data: membro } = await supabase
        .from('mem_membros')
        .select('id, batizado')
        .eq('cpf', cleanCpf)
        .maybeSingle();
      if (membro) {
        membroId = membro.id;
        jaBatizado = !!membro.batizado;
      }
      const { count: volCount } = await supabase
        .from('vol_profiles')
        .select('id', { count: 'exact', head: true })
        .eq('cpf', cleanCpf)
        .eq('allocation_status', 'active');
      if (volCount && volCount > 0) jaVoluntario = true;
    }

    const { data: insc, error: insErr } = await supabase
      .from('next_inscricoes')
      .insert({
        evento_id: eventoId,
        nome: nome.trim(),
        sobrenome: sobrenome ? sobrenome.trim() : null,
        cpf: cleanCpf,
        telefone: telefone ? soDigitos(telefone) : null,
        email: cleanEmail,
        data_nascimento: data_nascimento || null,
        observacoes: observacoes ? observacoes.trim() : null,
        membro_id: membroId,
        ja_batizado: jaBatizado,
        ja_voluntario: jaVoluntario,
        ja_doador: jaDoador,
        origem: 'formulario',
      })
      .select()
      .single();

    if (insErr) {
      // CPF/email duplicado no mesmo evento: nao quebrar, retornar OK
      if (insErr.code === '23505') {
        return res.status(200).json({ ok: true, ja_inscrito: true });
      }
      return res.status(500).json({ error: insErr.message });
    }

    // Notificacao para responsaveis do NEXT
    try {
      await notificar({
        modulo: 'next',
        titulo: 'Nova inscricao no NEXT',
        mensagem: `${nome} ${sobrenome || ''} (${cleanEmail}) se inscreveu para o NEXT.`,
        link: '/ministerial/next?tab=inscritos',
      });
    } catch (e) {
      console.error('[next] erro ao notificar:', e.message);
    }

    res.json({ ok: true, id: insc.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
