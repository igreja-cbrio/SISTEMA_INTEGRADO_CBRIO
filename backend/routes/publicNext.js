// ============================================================================
// Rotas publicas do módulo NEXT
//
// GET  /api/public/next/eventos - eventos com status='agendado' (data >= hoje)
// POST /api/public/next/inscrever - cria inscrição (sem auth)
// ============================================================================

const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { supabase } = require('../utils/supabase');
const { notificar } = require('../services/notificar');

// Rate limit dedicado para inscrições (anti-spam)
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
  if (c.length !== 11) return false;
  if (/^(\d)\1+$/.test(c)) return false;
  // Algoritmo oficial dos dígitos verificadores
  let soma = 0;
  for (let i = 0; i < 9; i++) soma += parseInt(c[i]) * (10 - i);
  let d1 = (soma * 10) % 11;
  if (d1 === 10) d1 = 0;
  if (d1 !== parseInt(c[9])) return false;
  soma = 0;
  for (let i = 0; i < 10; i++) soma += parseInt(c[i]) * (11 - i);
  let d2 = (soma * 10) % 11;
  if (d2 === 10) d2 = 0;
  return d2 === parseInt(c[10]);
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

    // Resolver evento: se não informado, pegar o próximo agendado
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

    // Membresia e fonte única: garante que existe mem_membros (cria se não
    // existe). Após esta chamada, toda inscrição NEXT estará vinculada a
    // /ministerial/membresia automaticamente.
    let jaBatizado = false, jaVoluntario = false, jaDoador = false;
    let membroId = null;
    try {
      const { findOrCreateMembro } = require('./pessoas');
      const r = await findOrCreateMembro({
        cpf: cleanCpf,
        email: cleanEmail,
        telefone,
        nome: [nome, sobrenome].filter(Boolean).join(' '),
        status: 'visitante',
      });
      membroId = r.membro_id;
    } catch (e) {
      console.error('publicNext findOrCreateMembro:', e.message);
    }

    // Snapshot do status pre-NEXT (pra coletor saber 'estava nao-batizado')
    if (membroId) {
      const { data: m } = await supabase
        .from('mem_membros').select('batizado').eq('id', membroId).maybeSingle();
      jaBatizado = !!m?.batizado;
    }
    if (cleanCpf) {
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
        observacoes: observacoes ? String(observacoes).trim().slice(0, 1000) : null,
        membro_id: membroId,
        ja_batizado: jaBatizado,
        ja_voluntario: jaVoluntario,
        ja_doador: jaDoador,
        origem: 'formulario',
      })
      .select()
      .single();

    if (insErr) {
      // CPF/email duplicado no mesmo evento: não quebrar, retornar OK
      if (insErr.code === '23505') {
        return res.status(200).json({ ok: true, ja_inscrito: true });
      }
      return res.status(500).json({ error: insErr.message });
    }

    // Dual-write: também matricula na turma do mês (modelo novo de turmas).
    // Defensivo — nunca derruba a inscrição se algo falhar. O next_inscricoes
    // acima segue como fonte legada (verde/KPIs) até o cutover do Cuidados.
    try {
      const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
      const hoje = new Date();
      const ym = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
      let { data: turma } = await supabase.from('next_turmas').select('id').eq('origem_mes', ym).is('deleted_at', null).maybeSingle();
      if (!turma) {
        const { data: nova } = await supabase.from('next_turmas')
          .insert({ nome: `${MESES[hoje.getMonth()]} ${hoje.getFullYear()}`, status: 'aberta', origem_mes: ym })
          .select('id').single();
        turma = nova;
        if (turma) await supabase.from('next_encontros').insert([{ turma_id: turma.id, numero: 1 }, { turma_id: turma.id, numero: 2 }]);
      }
      if (turma) {
        await supabase.from('next_matriculas').insert({
          turma_id: turma.id,
          nome: nome.trim(), sobrenome: sobrenome ? sobrenome.trim() : null,
          cpf: cleanCpf, telefone: telefone ? soDigitos(telefone) : null, email: cleanEmail,
          data_nascimento: data_nascimento || null, membro_id: membroId,
          ja_batizado: jaBatizado, ja_voluntario: jaVoluntario, ja_doador: jaDoador,
          origem: 'formulario',
        });
      }
    } catch (e) {
      console.error('[next] dual-write matrícula:', e.message);
    }

    // Notificação para responsáveis do NEXT
    try {
      await notificar({
        modulo: 'next',
        titulo: 'Nova inscrição no NEXT',
        mensagem: `${nome} ${sobrenome || ''} (${cleanEmail}) se inscreveu para o NEXT.`,
        link: '/ministerial/integracao?tab=next',
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
