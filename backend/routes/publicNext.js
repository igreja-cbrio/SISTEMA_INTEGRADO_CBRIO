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
const { verifyDirecionarToken, direcionarMatricula } = require('../services/nextDirecionar');

// Rate limit dedicado para inscrições (anti-spam)
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 min
  max: 10,
  message: { error: 'Muitas requisicoes. Aguarde um minuto.' },
});
router.use(limiter);

// Motivos válidos da inscrição (slugs · espelham MOTIVO_OPTIONS do form)
const MOTIVOS_VALIDOS = ['recem_convertido', 'prestes_batizar', 'conhecer_cbrio', 'servir_voluntario'];
function motivoValido(m) { return MOTIVOS_VALIDOS.includes(String(m || '')) ? String(m) : null; }

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
      nome, sobrenome, cpf, telefone, email, data_nascimento, motivo, observacoes,
      website, // honeypot
    } = req.body || {};

    if (website) return res.status(200).json({ ok: true }); // honeypot

    const cleanMotivo = motivoValido(motivo);

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

    // Snapshot do status pre-NEXT (pra coletor saber 'estava nao-batizado').
    // As duas leituras são independentes → em paralelo (corta um round-trip).
    const [snapBatizado, snapVol] = await Promise.all([
      membroId
        ? supabase.from('mem_membros').select('batizado').eq('id', membroId).maybeSingle()
        : Promise.resolve({ data: null }),
      cleanCpf
        ? supabase.from('vol_profiles').select('id', { count: 'exact', head: true })
            .eq('cpf', cleanCpf).eq('allocation_status', 'active')
        : Promise.resolve({ count: 0 }),
    ]);
    jaBatizado = !!snapBatizado?.data?.batizado;
    if (snapVol?.count && snapVol.count > 0) jaVoluntario = true;

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
        motivo: cleanMotivo,
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

    // Dual-write: matricula na turma ABERTA do momento. Se NÃO houver turma
    // aberta, entra na LISTA DE ESPERA (turma_id null) — é puxada quando a próxima
    // turma for aberta. NUNCA matricula numa turma já encerrada (decisão Marcos ·
    // 2026-06-26). Defensivo — nunca derruba a inscrição. O next_inscricoes acima
    // segue como fonte legada (verde/KPIs).
    try {
      const turma = await turmaAbertaAtual(); // null = sem turma aberta → lista de espera
      await supabase.from('next_matriculas').insert({
        turma_id: turma?.id || null,
        nome: nome.trim(), sobrenome: sobrenome ? sobrenome.trim() : null,
        cpf: cleanCpf, telefone: telefone ? soDigitos(telefone) : null, email: cleanEmail,
        data_nascimento: data_nascimento || null, membro_id: membroId, motivo: cleanMotivo,
        ja_batizado: jaBatizado, ja_voluntario: jaVoluntario, ja_doador: jaDoador,
        origem: 'formulario',
      });
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

// ── Direcionamento self-service pelo QR no fim do Next (Fase 2a) ──────────────
// UM QR pro Next inteiro (token fixo assinado): resolve a TURMA ABERTA do momento e lista
// as pessoas dela. A pessoa acha o nome e escolhe pra onde vai (Grupos/Voluntários/Batismo ·
// Devocional é Fase 2b). Escreve na matrícula (mesmo motor do líder). Não há turmas
// simultâneas, então "a turma aberta" é sempre clara.

// Resolve a turma ABERTA do momento (a mais recente, se houver mais de uma).
async function turmaAbertaAtual() {
  const { data } = await supabase.from('next_turmas')
    .select('id, nome').eq('status', 'aberta').is('deleted_at', null)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  return data || null;
}

// GET /api/public/next/direcionar/:token — turma aberta + suas pessoas pra escolher o nome
router.get('/direcionar/:token', async (req, res) => {
  try {
    if (!verifyDirecionarToken(req.params.token)) return res.status(403).json({ error: 'Link inválido' });
    const turma = await turmaAbertaAtual();
    if (!turma) return res.json({ turma: null, pessoas: [] }); // nenhuma turma aberta agora
    const { data: pessoas } = await supabase.from('next_matriculas')
      .select('id, nome, sobrenome, indicou_grupo, indicou_servir, indicou_batismo')
      .eq('turma_id', turma.id).is('deleted_at', null).order('nome');
    res.json({
      turma: { nome: turma.nome },
      pessoas: (pessoas || []).map(p => ({
        id: p.id,
        nome: `${p.nome || ''}${p.sobrenome ? ' ' + p.sobrenome : ''}`.trim(),
        ja: { grupos: !!p.indicou_grupo, voluntarios: !!p.indicou_servir, batismo: !!p.indicou_batismo },
      })),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/public/next/direcionar/:token — { matricula_id, destinos: ['grupos','voluntarios','batismo'] }
router.post('/direcionar/:token', async (req, res) => {
  try {
    if (!verifyDirecionarToken(req.params.token)) return res.status(403).json({ error: 'Link inválido' });
    const { matricula_id, destinos } = req.body || {};
    if (!matricula_id) return res.status(400).json({ error: 'Selecione a pessoa' });
    const turma = await turmaAbertaAtual();
    if (!turma) return res.status(409).json({ error: 'Nenhuma turma aberta no momento' });
    // Segurança: a matrícula PRECISA ser da turma aberta (não direcionar gente de fora)
    const { data: m } = await supabase.from('next_matriculas')
      .select('id, turma_id').eq('id', matricula_id).is('deleted_at', null).maybeSingle();
    if (!m || m.turma_id !== turma.id) return res.status(403).json({ error: 'Pessoa não pertence à turma aberta' });
    const r = await direcionarMatricula({
      matriculaId: matricula_id, destinos, userId: null,
      permitir: ['grupos', 'voluntarios', 'batismo'], // Devocional = Fase 2b (com o app do Matheus)
    });
    res.json(r);
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

module.exports = router;
