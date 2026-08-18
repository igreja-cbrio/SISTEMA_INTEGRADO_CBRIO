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
const { horariosDisponiveis } = require('../utils/batismoHorario');
const {
  horariosConfigurados: batismoHorariosConfigurados,
  ocupacaoPorHorario: batismoOcupacaoPorHorario,
  dataProximoBatismo,
} = require('../services/batismoHorarios');
const { acharOuCriarGuardado } = require('../services/membroMatch');
const { registrarObservacaoSegura } = require('../services/identidadeProgressiva');

// Janela do dia de HOJE em BRT (UTC-3, sem horário de verão) → intervalo em UTC.
// 00:00 BRT = 03:00 UTC do mesmo dia. Usado pra "quem fez check-in hoje".
function brtHojeRangeUtc() {
  const brt = new Date(Date.now() - 3 * 3600 * 1000);
  const start = new Date(Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate(), 3, 0, 0));
  const end = new Date(start.getTime() + 24 * 3600 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

// Limiter GENEROSO no router (padrão grupos/NPS/eventos): o form roda em
// Wi-Fi único (igreja) e o TOTEM de check-in dispara dezenas de POSTs do
// mesmo IP numa turma — o teto antigo de 10/min no router inteiro dava 429
// no operador depois da 10ª marcação (achado do sweep 28/07). Anti-spam
// real = honeypot + validação do contrato.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.PUBLIC_FORM_RATE_LIMIT_MAX) || (process.env.NODE_ENV === 'production' ? 600 : 5000),
  message: { error: 'Muitas requisições. Aguarde alguns minutos.' },
  skip: () => process.env.NODE_ENV !== 'production',
  standardHeaders: true,
  legacyHeaders: false,
});
router.use(limiter);

// Resolve a turma ABERTA do momento (a mais recente, se houver mais de uma).
// ⚠️ Declarada AQUI (antes do primeiro uso, no POST /inscrever) de propósito:
// era usada 80 linhas antes da declaração, salva só pelo hoisting de `async
// function` — converter pra arrow const derrubava o form inteiro com TDZ
// (mesmo padrão do bug do Ariel · sweep 28/07).
async function turmaAbertaAtual() {
  const { data } = await supabase.from('next_turmas')
    .select('id, nome').eq('status', 'aberta').is('deleted_at', null)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  return data || null;
}

// Contrato de Inscrição (F3.1 · docs/modulo-inscricoes/) — utils da fonte única
const {
  temAbreviacaoNome, splitNomeCompleto, validarNascimento,
  registrarConsentimentos, SEXOS, TEXTOS, cpfValido, emailValido,
} = require('../services/inscricaoContrato');

// Motivos válidos da inscrição (slugs · espelham MOTIVO_OPTIONS do form)
const MOTIVOS_VALIDOS = ['recem_convertido', 'prestes_batizar', 'conhecer_cbrio', 'servir_voluntario'];
function motivoValido(m) { return MOTIVOS_VALIDOS.includes(String(m || '')) ? String(m) : null; }

function soDigitos(s) { return String(s || '').replace(/\D/g, ''); }
// emailValido/cpfValido agora vêm de services/inscricaoContrato (fonte única —
// P3 do sweep 28/07: as cópias locais eram idênticas, mas cópia diverge um dia).

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

// GET /textos — textos canônicos de consentimento (o snapshot gravado é
// sempre o do backend)
router.get('/textos', (_req, res) => {
  res.json({ termos_lgpd: TEXTOS.termos_lgpd, aviso_optin: TEXTOS.aviso_optin });
});

// ----------------------------------------------------------------------------
// POST /inscrever — Contrato de Inscrição pleno (D1–D9 + 28/07). As regras
// novas valem SÓ AQUI: o walk-in do totem (POST /checkin/:token/walkin)
// continua com a política "nunca travar o atendimento na hora".
// ----------------------------------------------------------------------------
router.post('/inscrever', async (req, res) => {
  try {
    const {
      nome, sobrenome, nome_completo, cpf, telefone, email, data_nascimento,
      sexo, endereco, motivo, observacoes,
      aceita_termos, // termos LGPD (Contrato de Inscrição)
      whatsapp_optin, // consentimento p/ mensagens no WhatsApp (Marketing · LGPD)
      website, // honeypot
    } = req.body || {};

    if (website) return res.status(200).json({ ok: true }); // honeypot

    const cleanMotivo = motivoValido(motivo);

    // D1: campo único "Nome completo"; tolera o payload antigo nome+sobrenome.
    let cleanNome = String(nome || '').trim();
    let cleanSobrenome = sobrenome ? String(sobrenome).trim() : '';
    if (nome_completo && String(nome_completo).trim()) {
      const s = splitNomeCompleto(nome_completo);
      cleanNome = s.nome;
      cleanSobrenome = s.sobrenome;
    }
    if (!cleanNome || cleanNome.length < 2) {
      return res.status(400).json({ error: 'Nome obrigatorio' });
    }
    if (temAbreviacaoNome([cleanNome, cleanSobrenome].filter(Boolean).join(' '))) {
      return res.status(400).json({ error: 'Escreva seu nome completo, sem abreviações' });
    }
    if (!email || !emailValido(email)) {
      return res.status(400).json({ error: 'Email invalido' });
    }
    const telDigitos = soDigitos(telefone);
    if (telDigitos.length < 10 || telDigitos.length > 11) {
      return res.status(400).json({ error: 'Telefone invalido' });
    }
    // D3 (28/07): nascimento obrigatório e validado NESTA rota pública.
    const cleanNascimento = validarNascimento(data_nascimento);
    if (!cleanNascimento) {
      return res.status(400).json({ error: 'Informe uma data de nascimento válida' });
    }
    // 28/07: sexo obrigatório (masculino|feminino); endereço fixo-opcional.
    const cleanSexo = String(sexo || '').toLowerCase();
    if (!SEXOS.includes(cleanSexo)) {
      return res.status(400).json({ error: 'Selecione masculino ou feminino' });
    }
    const cleanEndereco = endereco ? String(endereco).trim().slice(0, 300) : null;
    if (!aceita_termos) {
      return res.status(400).json({ error: 'É preciso aceitar os termos para se inscrever' });
    }
    // CPF obrigatório no form público (decisão do Marcos · 2026-07-17): o Next
    // é a porta do funil com menos CPF (6 de 1.630 matrículas) e o CPF é a
    // chave da identidade global — sem ele, a matrícula depende de sinal fraco
    // e vira candidata a duplicata. O walk-in do check-in continua sem exigir
    // (política "nunca travar o atendimento na hora").
    if (!cpf || !cpfValido(cpf)) {
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
        nome: [cleanNome, cleanSobrenome].filter(Boolean).join(' '),
        dataNascimento: cleanNascimento,
        // ⚠️ O sexo é OBRIGATÓRIO neste formulário desde 28/07 (`cleanSexo`,
        // 400 se faltar) e era gravado só em `next_matriculas` — o cadastro
        // nascia sem ele. Medido em 18/08: 3 dos 4 cadastros criados por esta
        // porta desde 05/08 estão sem sexo, com o valor guardado na matrícula.
        genero: cleanSexo || null,
        status: 'visitante',
        origem: 'next_formulario',
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
    // ja_voluntario: por CPF OU pelo próprio membro (antes só CPF — perdia
    // quem tinha vol_profile ligado ao membro com CPF divergente/ausente).
    const orVol = [`cpf.eq.${cleanCpf}`];
    if (membroId) orVol.push(`membresia_id.eq.${membroId}`);
    const [snapBatizado, snapVol] = await Promise.all([
      membroId
        ? supabase.from('mem_membros').select('batizado').eq('id', membroId).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from('vol_profiles').select('id', { count: 'exact', head: true })
        .or(orVol.join(',')).eq('allocation_status', 'active'),
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
        nome: cleanNome, sobrenome: cleanSobrenome || null,
        cpf: cleanCpf, telefone: telDigitos || null, email: cleanEmail,
        data_nascimento: cleanNascimento, sexo: cleanSexo, endereco: cleanEndereco,
        membro_id: membroId, motivo: cleanMotivo,
        observacoes: observacoes ? String(observacoes).trim().slice(0, 1000) : null,
        ja_batizado: jaBatizado, ja_voluntario: jaVoluntario, ja_doador: jaDoador,
        origem: 'formulario',
        whatsapp_optin: !!whatsapp_optin,
        whatsapp_optin_em: whatsapp_optin ? new Date().toISOString() : null,
      })
      .select('id')
      .single();

    if (matErr) {
      // UNIQUE (turma_id, cpf|email): a pessoa já está na turma → não quebrar.
      if (matErr.code === '23505') return res.status(200).json({ ok: true, ja_inscrito: true });
      return res.status(500).json({ error: matErr.message });
    }
    await registrarObservacaoSegura({
      membroId, origem: 'next_formulario', origemId: mat.id,
      nome: [cleanNome, cleanSobrenome].filter(Boolean).join(' '), cpf: cleanCpf,
      telefone, email: cleanEmail, dataNascimento: cleanNascimento,
    });

    // Atos de consentimento na satélite (Contrato de Inscrição · best-effort).
    registrarConsentimentos({
      porta: 'next', refId: mat.id, membroId,
      ip: req.ip || null, userAgent: (req.headers['user-agent'] || '').slice(0, 300) || null,
      itens: [
        { tipo: 'termos_lgpd', aceito: true },
        { tipo: 'whatsapp', aceito: !!whatsapp_optin },
      ],
    }).catch((e) => console.error('[next] consentimentos:', e.message));

    // Notificação para responsáveis do NEXT
    try {
      await notificar({
        modulo: 'next',
        titulo: 'Nova inscrição no NEXT',
        mensagem: `${cleanNome} ${cleanSobrenome || ''} (${cleanEmail}) se inscreveu para o NEXT.`,
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
      // Horários do batismo pro seletor de "Quero me batizar" — vai no MESMO
      // payload (o totem já recarrega a cada pessoa, então a ocupação chega
      // fresca sem round-trip novo).
      batismo: await horariosDoBatismo(),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Horários ABERTOS e COM VAGA pro próximo batismo (catálogo da Integração ·
// régua única `utils/batismoHorario`).
// ⚠️ BEST-EFFORT: falha aqui NÃO pode derrubar o totem inteiro — o check-in e os
// outros destinos seguem funcionando. Devolve `indisponivel` pra tela distinguir
// "a equipe fechou tudo" de "não conseguimos ler agora"; nos dois casos o botão
// de batismo fica desligado, que é a mesma falha fechada do servidor.
async function horariosDoBatismo() {
  try {
    const dataBatismo = await dataProximoBatismo();
    const configurados = await batismoHorariosConfigurados();
    if (!dataBatismo || configurados === null) {
      return { data_batismo: dataBatismo || null, horarios: [], indisponivel: true };
    }
    const ocup = await batismoOcupacaoPorHorario(dataBatismo);
    return { data_batismo: dataBatismo, horarios: horariosDisponiveis(configurados, ocup) };
  } catch (e) {
    console.error('[publicNext] horariosDoBatismo:', e.message);
    return { data_batismo: null, horarios: [], indisponivel: true };
  }
}

// POST /api/public/next/direcionar/:token — { matricula_id, destinos: ['grupos','voluntarios','batismo'] }
router.post('/direcionar/:token', async (req, res) => {
  try {
    if (!verifyDirecionarToken(req.params.token)) return res.status(403).json({ error: 'Link inválido' });
    const { matricula_id, destinos, areas, horario_batismo } = req.body || {};
    if (!matricula_id) return res.status(400).json({ error: 'Selecione a pessoa' });
    const turma = await turmaAbertaAtual();
    if (!turma) return res.status(409).json({ error: 'Nenhuma turma aberta no momento' });
    // Segurança: a matrícula PRECISA ser da turma aberta (não direcionar gente de fora)
    const { data: m } = await supabase.from('next_matriculas')
      .select('id, turma_id').eq('id', matricula_id).is('deleted_at', null).maybeSingle();
    if (!m || m.turma_id !== turma.id) return res.status(403).json({ error: 'Pessoa não pertence à turma aberta' });
    const r = await direcionarMatricula({
      matriculaId: matricula_id, destinos, areas,
      horarioBatismo: horario_batismo || null,
      userId: null,
      permitir: ['grupos', 'voluntarios', 'batismo'], // Devocional = Fase 2b (com o app do Matheus)
    });
    res.json(r);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, codigo: e.codigo, campo: e.campo });
  }
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
    if (cpf && !cpfValido(cpf)) return res.status(400).json({ error: 'CPF inválido' });
    if (email && !emailValido(email)) return res.status(400).json({ error: 'E-mail inválido' });
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
        origem: 'next_checkin',
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
    await registrarObservacaoSegura({
      membroId, origem: 'next_checkin', origemId: mat.id,
      nome: nomeCompleto, cpf: cleanCpf, telefone: cleanTel,
      email: cleanEmail, dataNascimento: data_nascimento || null,
    });
    res.json({ ok: true, id: mat.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
