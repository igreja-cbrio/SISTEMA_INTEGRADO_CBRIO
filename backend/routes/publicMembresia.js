const router = require('express').Router();
const multer = require('multer');
const crypto = require('crypto');
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
      // grupo de conexao opcional — cria pedido apos cadastro
      grupo_id,
      grupo_observacao,
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

    // Se a pessoa indicou grupo, cria pedido vinculado (cadastro_pendente_id ou
    // membro_id se ja existe duplicado).
    if (grupo_id) {
      try {
        const pedidoBase = {
          grupo_id,
          nome: nome.trim(),
          email: emailLimpo,
          telefone: telefone || null,
          origem: 'cadastro_interno',
          observacao: grupo_observacao || null,
          status: 'pendente',
        };
        if (duplicadoDeId) {
          pedidoBase.membro_id = duplicadoDeId;
        } else {
          pedidoBase.cadastro_pendente_id = data.id;
        }
        const { data: pedido } = await supabase.from('mem_grupo_pedidos').insert(pedidoBase).select('id').single();
        if (pedido) {
          // Notifica o(s) lider(es) do grupo
          const { data: grupo } = await supabase.from('mem_grupos').select('nome').eq('id', grupo_id).maybeSingle();
          notificar({
            modulo: 'grupos',
            tipo: 'pedido_grupo',
            titulo: `Novo pedido para ${grupo?.nome || 'grupo'}`,
            mensagem: `${nome.trim()} pediu para entrar no grupo via cadastro de membresia.`,
            link: '/grupos/pedidos',
            severidade: 'aviso',
            chaveDedup: `pedido_grupo_${pedido.id}`,
          }).catch(err => console.error('[PUBLIC CADASTRO pedido grupo notify]', err.message));
        }
      } catch (pedidoErr) {
        // Nao bloqueia o cadastro — so loga
        console.error('[PUBLIC CADASTRO pedido grupo]', pedidoErr.message);
      }
    }

    // Resposta neutra — não confirma se foi duplicado, preserva privacidade
    res.status(201).json({ ok: true, id: data.id });
  } catch (e) {
    console.error('[PUBLIC CADASTRO] exception:', e.message);
    res.status(500).json({ error: 'Erro ao processar cadastro.' });
  }
});

// ═══════════════════════════════════════════════════════════════════
//  WALLET PASS (Google Wallet / QR) — membros
// ═══════════════════════════════════════════════════════════════════
// Arquitetura: token do QR eh deterministico (SHA256 CPF + salt), entao
// nao precisa de coluna nova em mem_membros. Quem conhece CPF + data de
// nascimento pode gerar/regenerar o passe — usado em 2 fluxos:
//   1. Logo apos o cadastro (CadastroMembresia.jsx) — temos CPF+DOB
//   2. "Ja fiz meu cadastro" — usuario digita CPF+DOB para recuperar

function primeiroNome(nomeCompleto) {
  if (!nomeCompleto) return 'Membro';
  const parts = String(nomeCompleto).trim().split(/\s+/);
  return parts[0] || 'Membro';
}

function memberQrToken(cpfLimpo) {
  const salt = process.env.MEM_QR_SALT || 'cbrio-mem-v1';
  return crypto.createHash('sha256').update(salt + cpfLimpo).digest('hex').slice(0, 24);
}

function memberIdFromCpf(cpfLimpo) {
  // ID legivel derivado do hash (estavel, nao expoe CPF)
  const hash = crypto.createHash('sha256').update(cpfLimpo).digest('hex').slice(0, 8).toUpperCase();
  return `CBR-M-${hash}`;
}

// Registra o mapeamento token → CPF para permitir lookup reverso quando
// o staff escaneia o QR. Idempotente (upsert por token).
async function registerQrToken(token, cpfLimpo) {
  try {
    await supabase
      .from('mem_qrcodes')
      .upsert({ token, cpf: cpfLimpo }, { onConflict: 'token' });
  } catch (err) {
    console.error('[PUBLIC MEM WALLET] registerQrToken falhou:', err.message);
  }
}

// Busca cadastro por CPF+DOB em mem_membros e, como fallback, em mem_cadastros_pendentes
// Retorna { found, nome, pending } — resposta neutra quando nao encontra
async function lookupCadastro(cpfLimpo, dataNascimento) {
  if (!cpfLimpo || cpfLimpo.length !== 11 || !dataNascimento) {
    return { found: false };
  }

  // mem_membros (ativo)
  const { data: membro } = await supabase
    .from('mem_membros')
    .select('id, nome, data_nascimento, active')
    .eq('cpf', cpfLimpo)
    .eq('active', true)
    .maybeSingle();
  if (membro && membro.data_nascimento === dataNascimento) {
    return { found: true, nome: membro.nome, pending: false };
  }

  // mem_cadastros_pendentes (ainda nao aprovado)
  const { data: pendente } = await supabase
    .from('mem_cadastros_pendentes')
    .select('id, nome, data_nascimento')
    .eq('cpf', cpfLimpo)
    .maybeSingle();
  if (pendente && pendente.data_nascimento === dataNascimento) {
    return { found: true, nome: pendente.nome, pending: true };
  }

  return { found: false };
}

// POST /api/public/membresia/wallet/verify
// Body: { cpf, data_nascimento } — valida se existe cadastro com esse par.
// Usado pelo fluxo "Ja fiz meu cadastro" antes de oferecer o botao da wallet.
router.post('/wallet/verify', cadastroLimiter, async (req, res) => {
  try {
    const { cpf, data_nascimento } = req.body || {};
    const cleanCpf = soDigitos(cpf);
    if (!cpfValido(cleanCpf)) return res.status(400).json({ error: 'CPF invalido' });
    if (!data_nascimento) return res.status(400).json({ error: 'Data de nascimento obrigatoria' });

    const r = await lookupCadastro(cleanCpf, data_nascimento);
    if (!r.found) {
      // Resposta neutra — nao revela se CPF existe com DOB diferente
      return res.json({ found: false });
    }
    res.json({ found: true, nome: primeiroNome(r.nome), pending: r.pending });
  } catch (e) {
    console.error('[PUBLIC MEM WALLET] verify error:', e.message);
    res.status(500).json({ error: 'Erro ao verificar cadastro' });
  }
});

// POST /api/public/membresia/wallet/qr-token
// Body: { cpf, data_nascimento } — retorna o token do QR para renderizar
// inline (fallback iPhone — salva como imagem da foto).
router.post('/wallet/qr-token', cadastroLimiter, async (req, res) => {
  try {
    const { cpf, data_nascimento } = req.body || {};
    const cleanCpf = soDigitos(cpf);
    if (!cpfValido(cleanCpf)) return res.status(400).json({ error: 'CPF invalido' });
    if (!data_nascimento) return res.status(400).json({ error: 'Data de nascimento obrigatoria' });

    const r = await lookupCadastro(cleanCpf, data_nascimento);
    if (!r.found) return res.status(404).json({ error: 'Cadastro nao encontrado' });

    const qr = memberQrToken(cleanCpf);
    await registerQrToken(qr, cleanCpf);

    res.json({
      qr,
      memberId: memberIdFromCpf(cleanCpf),
      nome: r.nome,
    });
  } catch (e) {
    console.error('[PUBLIC MEM WALLET] qr-token error:', e.message);
    res.status(500).json({ error: 'Erro ao gerar QR' });
  }
});

// POST /api/public/membresia/wallet/google
// Body: { cpf, data_nascimento } — retorna URL do Google Wallet (Android)
router.post('/wallet/google', cadastroLimiter, async (req, res) => {
  try {
    const issuerId = process.env.GOOGLE_WALLET_ISSUER_ID;
    const serviceAccountEmail = process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL;
    const rawKey = process.env.GOOGLE_WALLET_PRIVATE_KEY || '';
    const privateKey = rawKey.replace(/\\n/g, '\n');

    if (!issuerId || !serviceAccountEmail || !privateKey) {
      return res.status(503).json({ error: 'Google Wallet nao configurado' });
    }

    const { cpf, data_nascimento } = req.body || {};
    const cleanCpf = soDigitos(cpf);
    if (!cpfValido(cleanCpf)) return res.status(400).json({ error: 'CPF invalido' });
    if (!data_nascimento) return res.status(400).json({ error: 'Data de nascimento obrigatoria' });

    const r = await lookupCadastro(cleanCpf, data_nascimento);
    if (!r.found) return res.status(404).json({ error: 'Cadastro nao encontrado' });

    const jwt = require('jsonwebtoken');
    const qrToken = memberQrToken(cleanCpf);
    const memberId = memberIdFromCpf(cleanCpf);
    await registerQrToken(qrToken, cleanCpf);

    const classId = `${issuerId}.cbrio_membro_v1`;
    // objectId precisa ser unico por passe — hash do CPF mantem estabilidade sem expor PII
    const objectId = `${issuerId}.mem_${qrToken}`;

    const frontendUrl = (process.env.FRONTEND_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')).replace(/\/+$/, '');
    const logoUrl = frontendUrl ? `${frontendUrl}/logo-cbrio-text.png` : 'https://sistema-cbrio.vercel.app/logo-cbrio-text.png';

    const genericObject = {
      id: objectId,
      classId,
      genericType: 'GENERIC_OTHER',
      hexBackgroundColor: '#eae3da',
      logo: {
        sourceUri: { uri: logoUrl },
        contentDescription: { defaultValue: { language: 'pt-BR', value: 'CBRio' } },
      },
      cardTitle: { defaultValue: { language: 'pt-BR', value: 'CBRio' } },
      subheader: { defaultValue: { language: 'pt-BR', value: 'MEMBRO' } },
      header: { defaultValue: { language: 'pt-BR', value: r.nome || 'Membro' } },
      textModulesData: [
        { id: 'membro_id', header: 'MEMBRO ID', body: memberId },
      ],
      barcode: { type: 'QR_CODE', value: qrToken, alternateText: memberId },
      state: 'ACTIVE',
    };

    const claims = {
      iss: serviceAccountEmail,
      aud: 'google',
      typ: 'savetowallet',
      iat: Math.floor(Date.now() / 1000),
      payload: { genericObjects: [genericObject] },
    };

    const token = jwt.sign(claims, privateKey, { algorithm: 'RS256' });
    res.json({ url: `https://pay.google.com/gp/v/save/${token}`, memberId });
  } catch (err) {
    console.error('[PUBLIC MEM WALLET] google error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/public/membresia/wallet/apple
// Body: { cpf, data_nascimento } — retorna .pkpass para Apple Wallet (iOS)
router.post('/wallet/apple', cadastroLimiter, async (req, res) => {
  try {
    const { buildMembroPass } = require('../services/appleWallet');
    const { cpf, data_nascimento } = req.body || {};
    const cleanCpf = soDigitos(cpf);
    if (!cpfValido(cleanCpf)) return res.status(400).json({ error: 'CPF invalido' });
    if (!data_nascimento) return res.status(400).json({ error: 'Data de nascimento obrigatoria' });

    const r = await lookupCadastro(cleanCpf, data_nascimento);
    if (!r.found) return res.status(404).json({ error: 'Cadastro nao encontrado' });

    const qrToken = memberQrToken(cleanCpf);
    const memberId = memberIdFromCpf(cleanCpf);
    await registerQrToken(qrToken, cleanCpf);

    const pkpassBuffer = await buildMembroPass({
      nome: r.nome,
      qrToken,
      memberId,
      pending: r.pending,
    });

    res.setHeader('Content-Type', 'application/vnd.apple.pkpass');
    res.setHeader('Content-Disposition', `attachment; filename="cbrio-membro.pkpass"`);
    res.send(pkpassBuffer);
  } catch (err) {
    console.error('[PUBLIC MEM WALLET] apple error:', err.message);
    res.status(503).json({ error: 'Apple Wallet indisponivel no momento. Use o QR acima.' });
  }
});

module.exports = router;
