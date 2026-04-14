const router = require('express').Router();
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const { supabase } = require('../utils/supabase');
const { notificar } = require('../services/notificar');
const { uploadModuleFile, SHAREPOINT_CONFIGURED } = require('../services/storageService');

const uploadMw = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) cb(null, true);
    else cb(new Error('Formato de imagem não suportado.'));
  },
});

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

// Valida CPF (algoritmo oficial). Aceita entrada com ou sem máscara.
function cpfValido(cpf) {
  const d = soDigitos(cpf);
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false;
  const calc = (base, fator) => {
    let soma = 0;
    for (let i = 0; i < base.length; i += 1) {
      soma += parseInt(base[i], 10) * (fator - i);
    }
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  const dv1 = calc(d.slice(0, 9), 10);
  const dv2 = calc(d.slice(0, 10), 11);
  return dv1 === parseInt(d[9], 10) && dv2 === parseInt(d[10], 10);
}

// POST /api/public/membresia/upload-foto — upload de foto pelo formulário público
router.post('/upload-foto', cadastroLimiter, uploadMw.single('foto'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Imagem não fornecida' });
    const id = `pub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const ext = req.file.mimetype === 'image/png' ? 'png' : req.file.mimetype === 'image/webp' ? 'webp' : 'jpg';
    const path = `cadastros/${id}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from('fotos-membros')
      .upload(path, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
    if (upErr) throw upErr;

    const { data: urlData } = supabase.storage.from('fotos-membros').getPublicUrl(path);

    // Copiar para SharePoint "CRM e Pessoas" em background
    if (SHAREPOINT_CONFIGURED) {
      uploadModuleFile('membresia', 'Cadastros_Publicos', `${id}.${ext}`, req.file.buffer)
        .then(() => console.log(`[PUBLIC] Foto sincronizada com SharePoint: ${id}`))
        .catch(spErr => console.error('[PUBLIC] SharePoint sync erro (nao-critico):', spErr.message));
    }

    res.json({ foto_url: urlData.publicUrl });
  } catch (e) {
    console.error('[PUBLIC] foto upload error:', e.message);
    res.status(500).json({ error: 'Erro ao enviar foto' });
  }
});

// GET /api/public/membresia/verificar-familia?sobrenome=...
// Retorna famílias cujo nome contenha o sobrenome informado.
// Usado pelo formulário público para sugerir vínculo antes do envio.
router.get('/verificar-familia', cadastroLimiter, async (req, res) => {
  try {
    const { sobrenome } = req.query;
    if (!sobrenome || typeof sobrenome !== 'string' || sobrenome.trim().length < 2) {
      return res.json({ familias: [] });
    }
    const termo = sobrenome.trim();
    const { data: familias } = await supabase
      .from('mem_familias')
      .select('id, nome')
      .ilike('nome', `%${termo}%`)
      .limit(5);

    // Retorna só id + nome (privacidade: sem dados de membros)
    res.json({ familias: familias || [] });
  } catch (e) {
    console.error('[PUBLIC] verificar-familia error:', e.message);
    res.json({ familias: [] });
  }
});

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
      cpf,
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
      familia_sugerida_id,
      foto_url,
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
    if (!telefone || soDigitos(telefone).length < 10) {
      return res.status(400).json({ error: 'Celular é obrigatório (informe DDD + número).' });
    }
    if (!cpf || !cpfValido(cpf)) {
      return res.status(400).json({ error: 'CPF inválido.' });
    }
    if (!data_nascimento) {
      return res.status(400).json({ error: 'Data de nascimento é obrigatória.' });
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
    const cpfLimpo = soDigitos(cpf);

    if (cpfLimpo) {
      const { data: porCpf } = await supabase
        .from('mem_membros')
        .select('id')
        .eq('active', true)
        .eq('cpf', cpfLimpo)
        .limit(1)
        .maybeSingle();
      if (porCpf) duplicadoDeId = porCpf.id;
    }

    if (!duplicadoDeId && emailLimpo) {
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
      cpf: cpfLimpo,
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
      familia_sugerida_id: familia_sugerida_id || null,
      foto_url: foto_url || null,
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

    // Notifica responsáveis pela integração (assíncrono, não bloqueia resposta)
    notificar({
      modulo: 'membresia',
      tipo: 'novo_cadastro',
      titulo: `Novo cadastro de membresia`,
      mensagem: `${nome.trim()} enviou um cadastro pelo formulário público.`,
      link: '/ministerial/membresia',
      severidade: 'info',
      chaveDedup: `novo_cadastro_${data.id}`,
    }).catch(err => console.error('[PUBLIC CADASTRO] notificação falhou:', err.message));

    // Resposta neutra — não confirma se foi duplicado, preserva privacidade
    res.status(201).json({ ok: true, id: data.id });
  } catch (e) {
    console.error('[PUBLIC CADASTRO] exception:', e.message);
    res.status(500).json({ error: 'Erro ao processar cadastro.' });
  }
});

module.exports = router;
