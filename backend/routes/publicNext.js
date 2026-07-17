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
const { acharOuCriarGuardado } = require('../services/membroMatch');

// Janela do dia de HOJE em BRT (UTC-3, sem horário de verão) → intervalo em UTC.
// 00:00 BRT = 03:00 UTC do mesmo dia. Usado pra "quem fez check-in hoje".
function brtHojeRangeUtc() {
  const brt = new Date(Date.now() - 3 * 3600 * 1000);
  const start = new Date(Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate(), 3, 0, 0));
  const end = new Date(start.getTime() + 24 * 3600 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

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
      nome, sobrenome, cpf, telefone, email, data_nascimento, motivo, observacoes,
      whatsapp_optin, // consentimento p/ mensagens no WhatsApp (Marketing · LGPD)
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
    // CPF obrigatório no form público (decisão do Marcos · 2026-07-17): o Next
    // é a porta do funil com menos CPF (6 de 1.630 matrículas) e o CPF é a
    // chave da identidade global — sem ele, a matrícula depende de sinal fraco
    // e vira candidata a duplicata. O walk-in do check-in continua sem exigir
    // (política "nunca travar o atendimento na hora").
    if (!cpf || !ehCpfValido(cpf)) {
      return res.status(400).json({ error: 'CPF obrigatório — confira os dígitos' });
    }

    const cleanCpf = soDigitos(cpf);
    const cleanEmail = String(email).toLowerCase().trim();

    // Membresia e fonte única: garante que existe mem_membros (cria se não
    // existe). Após esta chamada, toda inscrição NEXT estará vinculada a
    // /ministerial/membresia automaticamente.
    let jaBatizado = false, jaVoluntario = false, jaDoador = false;
    let membroId = null;
    try {
      const { acharOuCriarGuardado } = require('../services/membroMatch');
      const r = await acharOuCriarGuardado({
        cpf: cleanCpf,
        email: cleanEmail,
        telefone,
        nome: [nome, sobrenome].filter(Boolean).join(' '),
        dataNascimento: data_nascimento || null,
        status: 'visitante',
      });
      membroId = r.membro_id;
    } catch (e) {
      console.error('publicNext acharOuCriarGuardado:', e.message);
    }

    // Opt-in de WhatsApp (só liga, nunca desliga um consentimento existente).
    if (whatsapp_optin && membroId) {
      try {
        await supabase.from('mem_membros')
          .update({ whatsapp_optin: true, whatsapp_optin_em: new Date().toISOString() })
          .eq('id', membroId).is('deleted_at', null);
      } catch (e) {
        console.warn('publicNext optin membro:', e.message);
      }
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

    // FONTE ÚNICA: matrícula na turma ABERTA do momento. Se NÃO houver turma
    // aberta, entra na LISTA DE ESPERA (turma_id null) — puxada quando a próxima
    // turma abrir. NUNCA matricula numa turma já encerrada (decisão Marcos ·
    // 2026-06-26). O legado next_inscricoes foi aposentado como destino de escrita
    // (a coleta agora vive só em next_matriculas · migration 20260626180000).
    const turma = await turmaAbertaAtual(); // null = sem turma aberta → lista de espera

    // Dedup por membro_id (CPF é opcional no formulário): se a pessoa JÁ está na
    // lista de espera (sem turma) OU na turma aberta, não duplica (reenvio do form).
    // Reinscrição é permitida quando as matrículas antigas estão em turmas encerradas.
    if (membroId) {
      let q = supabase.from('next_matriculas').select('id')
        .eq('membro_id', membroId).is('deleted_at', null);
      q = turma?.id ? q.eq('turma_id', turma.id) : q.is('turma_id', null);
      const { data: ja } = await q.limit(1).maybeSingle();
      if (ja) return res.json({ ok: true, ja_inscrito: true, id: ja.id });
    }

    const { data: mat, error: matErr } = await supabase
      .from('next_matriculas')
      .insert({
        turma_id: turma?.id || null,
        nome: nome.trim(), sobrenome: sobrenome ? sobrenome.trim() : null,
        cpf: cleanCpf, telefone: telefone ? soDigitos(telefone) : null, email: cleanEmail,
        data_nascimento: data_nascimento || null, membro_id: membroId, motivo: cleanMotivo,
        observacoes: observacoes ? String(observacoes).trim().slice(0, 1000) : null,
        ja_batizado: jaBatizado, ja_voluntario: jaVoluntario, ja_doador: jaDoador,
        origem: 'formulario',
      })
      .select('id')
      .single();

    if (matErr) {
      // UNIQUE (turma_id, cpf|email): a pessoa já está na turma → não quebrar.
      if (matErr.code === '23505') return res.status(200).json({ ok: true, ja_inscrito: true });
      return res.status(500).json({ error: matErr.message });
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

    res.json({ ok: true, id: mat.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Direcionamento self-service pelo QR no fim do Next (Fase 2a) ──────────────
// UM QR pro Next inteiro (token fixo assinado): resolve a TURMA ABERTA do momento e lista
// as pessoas dela. A pessoa acha o nome e escolhe pra onde vai (Grupos/Voluntários/Batismo ·
// Devocional é Fase 2b). Escreve na matrícula (mesmo motor do líder). Quando há
// mais de uma turma aberta (2 por mês), o público cai na MAIS RECENTE (ver
// turmaAbertaAtual) · o operador reorganiza quem vai em cada uma na aba Turmas.

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
    // Só mostra quem fez check-in HOJE (decisão Matheus 2026-07-07): o self-service
    // no fim do NEXT lista os presentes do dia, não a turma inteira.
    const { start, end } = brtHojeRangeUtc();
    const { data: pessoas } = await supabase.from('next_matriculas')
      .select('id, nome, sobrenome, indicou_grupo, indicou_servir, indicou_batismo')
      .eq('turma_id', turma.id).is('deleted_at', null)
      .gte('check_in_at', start).lt('check_in_at', end)
      .order('nome');
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
    const { matricula_id, destinos, areas } = req.body || {};
    if (!matricula_id) return res.status(400).json({ error: 'Selecione a pessoa' });
    const turma = await turmaAbertaAtual();
    if (!turma) return res.status(409).json({ error: 'Nenhuma turma aberta no momento' });
    // Segurança: a matrícula PRECISA ser da turma aberta (não direcionar gente de fora)
    const { data: m } = await supabase.from('next_matriculas')
      .select('id, turma_id').eq('id', matricula_id).is('deleted_at', null).maybeSingle();
    if (!m || m.turma_id !== turma.id) return res.status(403).json({ error: 'Pessoa não pertence à turma aberta' });
    const r = await direcionarMatricula({
      matriculaId: matricula_id, destinos, areas, userId: null,
      permitir: ['grupos', 'voluntarios', 'batismo'], // Devocional = Fase 2b (com o app do Matheus)
    });
    res.json(r);
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

// ── Check-in / lista de presença do NEXT (totem · token assinado) ────────────
// Mesma turma aberta do direcionamento. O totem marca quem chegou (presença) e
// cadastra quem veio sem inscrição (walk-in), sempre cruzando com a base pra não
// duplicar. O self-service (direcionar) só mostra quem tem check-in de hoje.

// GET /checkin/:token — turma aberta + pessoas com status de presença (hoje)
router.get('/checkin/:token', async (req, res) => {
  try {
    if (!verifyDirecionarToken(req.params.token)) return res.status(403).json({ error: 'Link inválido' });
    const turma = await turmaAbertaAtual();
    if (!turma) return res.json({ turma: null, pessoas: [] });
    const { start, end } = brtHojeRangeUtc();
    const { data: pessoas } = await supabase.from('next_matriculas')
      .select('id, nome, sobrenome, check_in_at, origem')
      .eq('turma_id', turma.id).is('deleted_at', null).order('nome');
    res.json({
      turma: { nome: turma.nome },
      pessoas: (pessoas || []).map(p => ({
        id: p.id,
        nome: `${p.nome || ''}${p.sobrenome ? ' ' + p.sobrenome : ''}`.trim(),
        presente: !!(p.check_in_at && p.check_in_at >= start && p.check_in_at < end),
        walk_in: p.origem === 'totem',
      })),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /checkin/:token — { matricula_id, presente } marca/desmarca presença
router.post('/checkin/:token', async (req, res) => {
  try {
    if (!verifyDirecionarToken(req.params.token)) return res.status(403).json({ error: 'Link inválido' });
    const { matricula_id, presente = true } = req.body || {};
    if (!matricula_id) return res.status(400).json({ error: 'Selecione a pessoa' });
    const turma = await turmaAbertaAtual();
    if (!turma) return res.status(409).json({ error: 'Nenhuma turma aberta no momento' });
    const { data: m } = await supabase.from('next_matriculas')
      .select('id, turma_id').eq('id', matricula_id).is('deleted_at', null).maybeSingle();
    if (!m || m.turma_id !== turma.id) return res.status(403).json({ error: 'Pessoa não pertence à turma aberta' });
    await supabase.from('next_matriculas')
      .update({ check_in_at: presente ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
      .eq('id', matricula_id);
    res.json({ ok: true, presente: !!presente });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /checkin/:token/walkin — cadastra quem chegou sem inscrição (dedup) + check-in
router.post('/checkin/:token/walkin', async (req, res) => {
  try {
    if (!verifyDirecionarToken(req.params.token)) return res.status(403).json({ error: 'Link inválido' });
    const { nome, sobrenome, cpf, telefone, email, data_nascimento } = req.body || {};
    if (!nome || String(nome).trim().length < 2) return res.status(400).json({ error: 'Informe o nome' });
    if (cpf && !ehCpfValido(cpf)) return res.status(400).json({ error: 'CPF inválido' });
    if (email && !ehEmailValido(email)) return res.status(400).json({ error: 'E-mail inválido' });
    const turma = await turmaAbertaAtual();
    if (!turma) return res.status(409).json({ error: 'Nenhuma turma aberta no momento' });

    const cleanCpf = cpf ? soDigitos(cpf) : null;
    const cleanTel = telefone ? soDigitos(telefone) : null;
    const cleanEmail = email ? String(email).toLowerCase().trim() : null;
    const nomeCompleto = [nome, sobrenome].filter(Boolean).join(' ').trim();

    // Cruza com a base (CPF/telefone+nome/nome+nascimento) pra não duplicar cadastro.
    let membroId = null;
    try {
      const r = await acharOuCriarGuardado({
        cpf: cleanCpf, email: cleanEmail, telefone: cleanTel,
        nome: nomeCompleto, dataNascimento: data_nascimento || null, status: 'visitante',
      });
      membroId = r?.membro_id || null;
    } catch (e) { console.error('[next walkin] acharOuCriarGuardado:', e.message); }

    // Se a pessoa já tem matrícula na turma aberta, só marca presença (não duplica).
    if (membroId) {
      const { data: ja } = await supabase.from('next_matriculas').select('id')
        .eq('turma_id', turma.id).eq('membro_id', membroId).is('deleted_at', null)
        .limit(1).maybeSingle();
      if (ja) {
        await supabase.from('next_matriculas')
          .update({ check_in_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('id', ja.id);
        return res.json({ ok: true, id: ja.id, ja_inscrito: true });
      }
    }

    const { data: mat, error: matErr } = await supabase.from('next_matriculas').insert({
      turma_id: turma.id,
      nome: String(nome).trim(), sobrenome: sobrenome ? String(sobrenome).trim() : null,
      cpf: cleanCpf, telefone: cleanTel, email: cleanEmail,
      data_nascimento: data_nascimento || null, membro_id: membroId,
      origem: 'totem', check_in_at: new Date().toISOString(),
    }).select('id').single();
    if (matErr) {
      if (matErr.code === '23505') return res.json({ ok: true, ja_inscrito: true });
      return res.status(500).json({ error: matErr.message });
    }
    res.json({ ok: true, id: mat.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
