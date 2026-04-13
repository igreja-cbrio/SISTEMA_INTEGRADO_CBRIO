const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { supabase } = require('../utils/supabase');

// ── Rate limit específico para formulário público ──
// Bem mais restritivo que o global: 10 submissões por IP a cada 15 min.
// Sempre ativo (inclusive em dev) porque expõe tabela para anon.
const cadastroLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas submissões deste endereço. Tente novamente mais tarde.' },
});

// Normaliza telefone mantendo apenas dígitos (para comparação de duplicados)
function soDigitos(v) {
  return (v || '').toString().replace(/\D+/g, '');
}

function ehEmailValido(email) {
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// POST /api/public/membresia/cadastro
// Submissão pública do formulário de cadastro de membresia.
// - Não exige autenticação (RLS permite INSERT para role anon)
// - Honeypot (website): bots tendem a preencher qualquer input visível
// - LGPD: aceita_termos é obrigatório; snapshot do texto consentido é gravado
// - Detecta duplicados por email OU (nome + telefone) em mem_membros
router.post('/cadastro', cadastroLimiter, async (req, res) => {
  try {
    const {
      nome,
      email,
      telefone,
      data_nascimento,
      estado_civil,
      endereco,
      bairro,
      cidade,
      cep,
      profissao,
      como_conheceu,
      origem,
      aceita_termos,
      aceita_contato,
      consentimento_texto,
      // honeypot (não deve ser preenchido por humanos)
      website,
    } = req.body || {};

    // Honeypot — se preencheu, é bot. Responde 201 falso para não dar pista.
    if (website && String(website).trim() !== '') {
      return res.status(201).json({ ok: true });
    }

    // Validações mínimas
    if (!nome || typeof nome !== 'string' || nome.trim().length < 3) {
      return res.status(400).json({ error: 'Nome é obrigatório (mínimo 3 caracteres).' });
    }
    if (nome.trim().length > 200) {
      return res.status(400).json({ error: 'Nome muito longo.' });
    }
    if (email && !ehEmailValido(email)) {
      return res.status(400).json({ error: 'E-mail inválido.' });
    }
    if (!aceita_termos) {
      return res.status(400).json({ error: 'É necessário aceitar os termos para enviar o cadastro.' });
    }

    const origemValida = ['site', 'qr_code', 'evento', 'importacao'];
    const origemFinal = origemValida.includes(origem) ? origem : 'site';

    // ── Detecção de duplicado contra mem_membros ──
    let duplicadoDeId = null;
    const emailLimpo = email ? email.trim().toLowerCase() : null;
    const telefoneLimpo = soDigitos(telefone);

    if (emailLimpo) {
      const { data: porEmail } = await supabase
        .from('mem_membros')
        .select('id')
        .eq('active', true)
        .ilike('email', emailLimpo)
        .limit(1)
        .maybeSingle();
      if (porEmail) duplicadoDeId = porEmail.id;
    }

    if (!duplicadoDeId && telefoneLimpo && telefoneLimpo.length >= 10) {
      // Busca por nome parcial + telefone (só dígitos)
      const primeiroNome = nome.trim().split(/\s+/)[0];
      if (primeiroNome) {
        const { data: candidatos } = await supabase
          .from('mem_membros')
          .select('id, telefone')
          .eq('active', true)
          .ilike('nome', `%${primeiroNome}%`)
          .limit(20);
        const match = (candidatos || []).find(
          (c) => soDigitos(c.telefone) === telefoneLimpo,
        );
        if (match) duplicadoDeId = match.id;
      }
    }

    // ── Monta payload de inserção ──
    const ip =
      (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim() ||
      req.ip ||
      null;
    const userAgent = (req.headers['user-agent'] || '').toString().slice(0, 500);

    const payload = {
      nome: nome.trim(),
      email: emailLimpo,
      telefone: telefone || null,
      data_nascimento: data_nascimento || null,
      estado_civil: estado_civil || null,
      endereco: endereco || null,
      bairro: bairro || null,
      cidade: cidade || null,
      cep: cep || null,
      profissao: profissao || null,
      como_conheceu: como_conheceu || null,
      origem: origemFinal,
      aceita_termos: !!aceita_termos,
      aceita_contato: !!aceita_contato,
      consentimento_texto: consentimento_texto || null,
      status: duplicadoDeId ? 'duplicado' : 'pendente',
      duplicado_de_id: duplicadoDeId,
      ip_origem: ip,
      user_agent: userAgent,
    };

    const { data, error } = await supabase
      .from('mem_cadastros_pendentes')
      .insert(payload)
      .select('id, status')
      .single();

    if (error) {
      console.error('[PUBLIC CADASTRO] insert error:', error.message);
      return res.status(500).json({ error: 'Não foi possível registrar seu cadastro.' });
    }

    // Resposta neutra — não confirma se foi duplicado, preserva privacidade
    res.status(201).json({ ok: true, id: data.id });
  } catch (e) {
    console.error('[PUBLIC CADASTRO] exception:', e.message);
    res.status(500).json({ error: 'Erro ao processar cadastro.' });
  }
});

module.exports = router;
