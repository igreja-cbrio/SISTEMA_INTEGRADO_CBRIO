const router = require('express').Router();
const multer = require('multer');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { supabase } = require('../utils/supabase');
const { notificar } = require('../services/notificar');
const { uploadModuleFile, SHAREPOINT_CONFIGURED } = require('../services/storageService');
const { acharMembroGuardado, ehNomeDerivadoDeEmail } = require('../services/membroMatch');
const { registrarObservacaoSegura } = require('../services/identidadeProgressiva');
const { cpfValido, emailValido } = require('../services/inscricaoContrato');
const { verificarTokenCenso } = require('../utils/censoToken');
const { avaliarProntidao } = require('../utils/prontidaoCadastro');

const uploadMw = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) cb(null, true);
    else cb(new Error('Formato de imagem não suportado.'));
  },
});

// ── Rate limit do formulário público de membresia ──
//
// ⚠️ DOIS BALDES SEPARADOS de propósito (sweep do CENSO · 2026-08-03). O teto
// antigo era 10/15min por IP COMPARTILHADO entre submissão e os lookups que o
// formulário dispara enquanto a pessoa digita (lookup-cpf, lookup-nome-telefone,
// verificar-familia) — cada pessoa gasta 3-5 requisições, então no WiFi da igreja
// (1 IP público via NAT) o formulário morria por volta da 3ª pessoa, e o
// autocomplete queimava a cota ANTES de alguém conseguir enviar.
//
// O censo é escaneado pela igreja inteira no mesmo minuto do culto, então o teto
// da submissão segue a calibragem já validada em multidão real do NPS e da
// inscrição de grupos (10000/15min · ~700 pessoas × algumas requisições num IP só).
//
// ⚠️ Estes limiters ficam SÓ nas rotas (não em `router.use`): limiter no
// router.use E na rota conta 2× a mesma requisição (lição do sweep de 28/07).
// ⚠️ A proteção anti-DDoS da BORDA do Vercel é separada e pode desafiar uma
// rajada concentrada no mesmo IP — mitigar via Firewall do Vercel.
const cadastroLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.PUBLIC_MEMBRESIA_RATE_LIMIT_MAX) || 10000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas submissões deste endereço. Tente novamente em alguns minutos.' },
});

// Balde do PROBING (lookup por CPF / nome+telefone / família / wallet). Separado
// da submissão porque estes endpoints respondem "esta pessoa existe na base?" —
// teto menor limita varredura em lote sem derrubar o formulário no culto
// (dimensionado pra ~700 pessoas × 4 consultas). NÃO unificar com o de cima:
// foi a cota compartilhada que quebrava o formulário.
const lookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.PUBLIC_MEMBRESIA_LOOKUP_RATE_LIMIT_MAX) || 3000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas consultas deste endereço. Tente novamente em alguns minutos.' },
});

// Normaliza telefone mantendo apenas dígitos (para comparação de duplicados)
function soDigitos(v) {
  return (v || '').toString().replace(/\D+/g, '');
}

// Vocabulário do vínculo AUTODECLARADO no censo (espelha o CHECK da migration
// 20260803160000). Sem acento: é identificador persistido.
const VINCULOS_DECLARADOS = ['membro', 'congregado', 'visitante'];

// Colunas que só existem depois da PARTE 1 da migration do censo
// (20260803160000_censo_recadastramento.sql · mem_cadastros_pendentes).
const COLUNAS_CENSO = ['censo', 'vinculo_declarado', 'censo_conflitos'];

// 42703 = undefined_column. O PostgREST recusa a query INTEIRA quando uma
// coluna não existe, então pedir coluna nova antes da migration derrubaria o
// formulário pra TODO MUNDO (lição do `parcelas_max`). Aqui a submissão é o que
// não pode se perder: tenta com as colunas do censo e, se elas não existirem
// ainda, repete SEM elas — a pessoa se cadastra, só a marcação do censo espera
// a migration.
function semColunasDoCenso(payload) {
  const copia = { ...payload };
  for (const c of COLUNAS_CENSO) delete copia[c];
  return copia;
}
function ehColunaAusente(error) {
  if (!error) return false;
  return error.code === '42703'
    || /column .* does not exist/i.test(error.message || '')
    || /could not find the .* column/i.test(error.message || '');
}

// emailValido/cpfValido agora vêm de services/inscricaoContrato (fonte única —
// mesma troca zero-diff do P3 #2134; membresia é porta de PESSOA e segue o
// mesmo contrato de porta). O grandfathering de CPF legado continua nos call
// sites (valor idêntico ao armazenado passa sem DV — validação é só do novo).

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
router.get('/verificar-familia', lookupLimiter, async (req, res) => {
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

// ─────────────────────────────────────────────────────────────────────────
// GET /api/public/membresia/lookup-nome-telefone?nome=...&telefone=...
//
// Lookup proativo enquanto a pessoa preenche nome + celular no formulário.
// Caso de uso: novos convertidos importados (planilha) já existem como
// mem_membros status='visitante'. Quando a pessoa volta pra completar o
// cadastro, o sistema reconhece e vincula automaticamente em vez de
// criar duplicata.
//
// Privacidade: retorna celular MASCARADO (últimos 2 digitos antes do hifen
// + últimos 2 do final) para confirmação visual. Não expoe email/CPF/end.
// Match key = primeiro_nome (case-insensitive) + telefone (digitos exatos).
// ─────────────────────────────────────────────────────────────────────────
function mascararTelefone(telefone) {
  const d = soDigitos(telefone);
  if (d.length !== 10 && d.length !== 11) return '';
  // (XX) 9XXXX-XXXX → (XX) 9****-XX12  | (XX) XXXX-XXXX → (XX) ****-XX12
  if (d.length === 11) {
    return `(${d.slice(0, 2)}) ${d[2]}****-**${d.slice(9, 11)}`;
  }
  return `(${d.slice(0, 2)}) ****-**${d.slice(8, 10)}`;
}

router.get('/lookup-nome-telefone', lookupLimiter, async (req, res) => {
  try {
    const nomeRaw = (req.query.nome || '').toString().trim();
    const telefoneRaw = (req.query.telefone || '').toString();
    const digits = soDigitos(telefoneRaw);

    if (nomeRaw.length < 2 || (digits.length !== 10 && digits.length !== 11)) {
      return res.json({ found: false, reason: 'invalid' });
    }

    const primeiroNome = nomeRaw.split(/\s+/)[0].toLowerCase();
    if (primeiroNome.length < 2) {
      return res.json({ found: false, reason: 'invalid' });
    }

    // Busca candidatos em mem_membros ativos pelo primeiro nome — depois
    // filtra por telefone (digitos exatos) em JS. Lista curta porque o
    // primeiro nome já restringe bem.
    const { data: candidatos } = await supabase
      .from('mem_membros')
      .select('id, nome, telefone, status, cpf, data_nascimento')
      .eq('active', true)
      .ilike('nome', `${primeiroNome}%`)
      .limit(50);

    const match = (candidatos || []).find(
      (c) => soDigitos(c.telefone) === digits,
    );

    if (match) {
      const partes = (match.nome || '').trim().split(/\s+/);
      const pn = partes[0] || '';
      const ini = partes
        .slice(1)
        .map((p) => p[0]?.toUpperCase() || '')
        .join('. ')
        .trim();
      // Indica se já tem cadastro completo (cpf+nascimento) ou se ainda
      // e visitante/importado — UI usa para mensagem diferente.
      const cadastroCompleto = !!(match.cpf && match.data_nascimento);
      return res.json({
        found: true,
        matchId: match.id,
        primeiroNome: pn,
        iniciaisSobrenome: ini ? ini + '.' : '',
        telefoneMascarado: mascararTelefone(match.telefone),
        cadastroCompleto,
        status: match.status || 'visitante',
      });
    }

    return res.json({ found: false });
  } catch (e) {
    console.error('[PUBLIC] lookup-nome-telefone error:', e.message);
    res.json({ found: false, reason: 'error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// GET /api/public/membresia/censo/meus-dados?t=<token>
//
// Atualização cadastral pelo link PESSOAL do convite do censo. Devolve os
// dados da própria pessoa pra o formulário abrir preenchido, marcando o que
// falta.
//
// ⚠️ É o ÚNICO endpoint público desta rota que devolve dado de pessoa. Pode,
//    porque a prova de identidade é o token ter chegado no WhatsApp/e-mail
//    DELA — o mesmo nível do comprovante de inscrição. Os lookups por CPF/nome
//    continuam devolvendo só nome + iniciais + telefone mascarado, e é assim
//    que tem que ficar: CPF vaza e se compra, então CPF não é prova.
//
// ⚠️ NUNCA aceitar identificação por `membro_id` cru na query aqui. Seria
//    enumerável (UUID vaza em log, em print, no histórico do navegador) e
//    transformaria este endpoint num extrator da base inteira. Quem decide é
//    sempre a assinatura.
// ─────────────────────────────────────────────────────────────────────────
router.get('/censo/meus-dados', lookupLimiter, async (req, res) => {
  try {
    const membroId = verificarTokenCenso(req.query.t);
    // Resposta NEUTRA: não diz se o token é malformado, se o segredo falta ou
    // se a pessoa não existe. Distinguir isso é dar ao atacante a régua.
    if (!membroId) return res.status(404).json({ ok: false, error: 'Link inválido ou expirado.' });

    const { data: m, error } = await supabase
      .from('mem_membros')
      .select('id, nome, cpf, email, telefone, data_nascimento, genero, estado_civil, endereco, bairro, cidade, cep, profissao, foto_url, censo_respondido_em')
      .eq('id', membroId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    if (!m) return res.status(404).json({ ok: false, error: 'Link inválido ou expirado.' });

    // Reusa a MESMA régua de obrigatórios da aprovação em massa, para a pessoa
    // completar exatamente o que a fila cobraria dela depois.
    const prontidao = avaliarProntidao({
      ...m, status: 'pendente', aceita_termos: true, duplicado_de_id: null,
    });

    res.json({
      ok: true,
      ja_respondeu: !!m.censo_respondido_em,
      faltando: prontidao.faltando,
      dados: {
        nome: m.nome || '',
        cpf: m.cpf || '',
        email: m.email || '',
        telefone: m.telefone || '',
        data_nascimento: m.data_nascimento || '',
        genero: m.genero || '',
        estado_civil: m.estado_civil || '',
        endereco: m.endereco || '',
        bairro: m.bairro || '',
        cidade: m.cidade || '',
        cep: m.cep || '',
        profissao: m.profissao || '',
        foto_url: m.foto_url || '',
      },
    });
  } catch (e) {
    console.error('[PUBLIC] censo/meus-dados error:', e.message);
    res.status(500).json({ ok: false, error: 'Erro ao carregar seus dados' });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// GET /api/public/membresia/lookup-cpf?cpf=...
//
// Lookup proativo enquanto o usuário digita CPF no formulário público.
// Por privacidade NÃO retorna dados sensiveis (telefone/email/endereco):
// retorna apenas { found, primeiroNome, iniciaisSobrenome, fonte } pra
// confirmação visual. Se confirmar, o backend já faz o de-dup correto
// na submissao via duplicado_de_id.
// ─────────────────────────────────────────────────────────────────────────
router.get('/lookup-cpf', lookupLimiter, async (req, res) => {
  try {
    const cpf = req.query.cpf;
    if (!cpf || !cpfValido(cpf)) {
      return res.json({ found: false, reason: 'invalid' });
    }
    const d = soDigitos(cpf);

    // 1. mem_membros ativos
    const { data: m } = await supabase
      .from('mem_membros')
      .select('id, nome, data_nascimento, status')
      .eq('cpf', d)
      .eq('active', true)
      .maybeSingle();

    if (m) {
      const partes = (m.nome || '').trim().split(/\s+/);
      const primeiroNome = partes[0] || '';
      const iniciaisSobrenome = partes.slice(1).map(p => p[0]?.toUpperCase() || '').join('. ').trim();
      return res.json({
        found: true,
        fonte: 'membro',
        primeiroNome,
        iniciaisSobrenome: iniciaisSobrenome ? iniciaisSobrenome + '.' : '',
        status: m.status,
      });
    }

    // 2. Cadastro pendente
    const { data: p } = await supabase
      .from('mem_cadastros_pendentes')
      .select('id, nome, status')
      .eq('cpf', d)
      .in('status', ['pendente', 'duplicado'])
      .maybeSingle();

    if (p) {
      const partes = (p.nome || '').trim().split(/\s+/);
      const primeiroNome = partes[0] || '';
      const iniciaisSobrenome = partes.slice(1).map(x => x[0]?.toUpperCase() || '').join('. ').trim();
      return res.json({
        found: true,
        fonte: 'pendente',
        primeiroNome,
        iniciaisSobrenome: iniciaisSobrenome ? iniciaisSobrenome + '.' : '',
        status: p.status,
      });
    }

    return res.json({ found: false });
  } catch (e) {
    console.error('[PUBLIC] lookup-cpf error:', e.message);
    res.json({ found: false, reason: 'error' });
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
      // Sexo canônico `masculino|feminino` (o form passou a coletar em 04/08).
      // Sem ele o cadastro nunca ficava completo pela régua da fila.
      genero,
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
      whatsapp_optin, // consentimento p/ mensagens no WhatsApp (Marketing · LGPD)
      consentimento_texto,
      converteu_na_cbrio, // autodeclarado (checkbox) · NUNCA vira convertido/NSM
      // Censo / recadastramento (2026-08-03). `vinculo_declarado` é
      // AUTODECLARADO (membro|congregado|visitante) e NUNCA vira
      // mem_membros.status — quem é membro é decisão da igreja.
      vinculo_declarado,
      censo,
      // Token do link PESSOAL do convite (?t=). Identifica a pessoa sem
      // depender de CPF — ver utils/censoToken.js.
      censo_token,
      familia_sugerida_id,
      foto_url,
      // grupo de conexão opcional — cria pedido após cadastro
      grupo_id,
      grupo_observacao,
      // match confirmado pelo usuário via lookup-nome-telefone
      // (pessoa reconheceu seu cadastro pre-existente e clicou "sou eu")
      match_membro_id,
      // OPCIONAL: criar conta de acesso (senha · /devocional/login depois)
      // Quando preenchido + email valido, cria auth user com senha pra
      // permitir login com email+senha (além do magic link).
      senha,
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
    if (email && !emailValido(email)) {
      return res.status(400).json({ error: 'E-mail inválido.' });
    }
    if (senha !== undefined && senha !== null && senha !== '') {
      if (typeof senha !== 'string' || senha.length < 6) {
        return res.status(400).json({ error: 'Senha precisa ter pelo menos 6 caracteres.' });
      }
      if (!email) {
        return res.status(400).json({ error: 'Email obrigatório quando criar senha.' });
      }
    }
    if (!aceita_termos) {
      return res.status(400).json({ error: 'É necessário aceitar os termos para enviar o cadastro.' });
    }

    if (!VINCULOS_DECLARADOS.includes(vinculo_declarado || '') && vinculo_declarado) {
      return res.status(400).json({ error: 'Vínculo declarado inválido.' });
    }
    const ehCenso = !!censo;
    if (ehCenso && !vinculo_declarado) {
      return res.status(400).json({ error: 'Informe seu vínculo com a igreja.' });
    }

    const origemValida = ['site', 'qr_code', 'evento', 'importacao'];
    const origemFinal = origemValida.includes(origem) ? origem : 'site';

    // ── Detecção de duplicado contra mem_membros ──
    let duplicadoDeId = null;
    // Como o vínculo foi encontrado — decide se o censo pode aplicar dado
    // sozinho. Só 'cpf' é chave forte (ver services/censoReconciliar.js).
    let matchedBy = null;
    const emailLimpo = email ? email.trim().toLowerCase() : null;
    const telefoneLimpo = soDigitos(telefone);
    const cpfLimpo = soDigitos(cpf);

    // ⚠️ TOKEN do convite do censo vence tudo: é o link pessoal que o sistema
    // emitiu e entregou no contato DELA (assinado com o membro_id dentro), então
    // não há dúvida de identidade — nem depende de a pessoa ter CPF cadastrado,
    // que é exatamente o público da campanha. Confere-se contra o banco antes de
    // confiar (token de cadastro apagado não vale).
    const membroIdToken = verificarTokenCenso(censo_token);
    if (membroIdToken) {
      const { data: alvo } = await supabase
        .from('mem_membros').select('id').eq('id', membroIdToken)
        .is('deleted_at', null).maybeSingle();
      if (alvo) {
        duplicadoDeId = alvo.id;
        matchedBy = 'token_censo';   // chave FORTE (ver censoReconciliar)
      }
    }

    // Se o usuário confirmou um match via lookup-nome-telefone, usa direto
    // (e valida que o id existe e o telefone bate — defesa contra forja).
    if (!duplicadoDeId && match_membro_id && typeof match_membro_id === 'string') {
      const { data: confirmado } = await supabase
        .from('mem_membros')
        .select('id, telefone')
        .eq('id', match_membro_id)
        .eq('active', true)
        .maybeSingle();
      if (confirmado && soDigitos(confirmado.telefone) === telefoneLimpo) {
        duplicadoDeId = confirmado.id;
        // ⚠️ Confirmação da pessoa NÃO é chave forte: o "sou eu" é validado só
        // contra o TELEFONE, que a família compartilha — quem clica pode estar
        // reconhecendo o cadastro do cônjuge/filho. Segue como sinal fraco (o
        // censo só aplica se o nascimento conferir dos dois lados).
        matchedBy = 'confirmado_usuario';
      }
    }

    if (!duplicadoDeId) {
      const match = await acharMembroGuardado({
        cpf: cpfLimpo, email: emailLimpo, telefone: telefoneLimpo,
        nome: nome.trim(), dataNascimento: data_nascimento,
      });
      duplicadoDeId = match?.membro_id || null;
      matchedBy = match?.matched_by || null;
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
      // Aceita só o canônico: "outro" e variações não entram (a coluna e os
      // KPIs por sexo não os aceitam — lei do Contrato de Inscrição).
      genero: ['masculino', 'feminino'].includes(String(genero || '').toLowerCase())
        ? String(genero).toLowerCase() : null,
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
      whatsapp_optin: !!whatsapp_optin,
      whatsapp_optin_em: whatsapp_optin ? new Date().toISOString() : null,
      consentimento_texto: consentimento_texto ? String(consentimento_texto).slice(0, 2000) : null,
      // Só inclui a coluna quando a pessoa marcou (tolera a migration ainda não
      // aplicada · flow antigo sem o checkbox não toca a coluna).
      ...(converteu_na_cbrio ? { converteu_na_cbrio: true } : {}),
      familia_sugerida_id: familia_sugerida_id || null,
      foto_url: foto_url || null,
      status: duplicadoDeId ? 'duplicado' : 'pendente',
      duplicado_de_id: duplicadoDeId,
      ip_origem: ip,
      user_agent: userAgent,
      ...(ehCenso ? { censo: true } : {}),
      ...(vinculo_declarado ? { vinculo_declarado } : {}),
    };

    let { data, error } = await supabase
      .from('mem_cadastros_pendentes')
      .insert(payload)
      .select('id, status')
      .single();

    if (error && ehColunaAusente(error)) {
      console.warn('[PUBLIC CADASTRO] colunas do censo ausentes (parte 1 da migration, 20260803160000, não aplicada) — gravando sem elas');
      ({ data, error } = await supabase
        .from('mem_cadastros_pendentes')
        .insert(semColunasDoCenso(payload))
        .select('id, status')
        .single());
    }

    if (error) {
      console.error('[PUBLIC CADASTRO] insert error:', error.message);
      return res.status(500).json({ error: 'Não foi possível registrar seu cadastro.' });
    }

    await registrarObservacaoSegura({
      membroId: duplicadoDeId,
      origem: 'membresia_formulario', origemId: data.id,
      nome: nome.trim(), cpf: cpfLimpo, email: emailLimpo,
      telefone: telefoneLimpo, dataNascimento: data_nascimento,
      dados: { status: data.status },
    });

    // ── CENSO · recadastramento de quem JÁ EXISTE ─────────────────────────────
    // Roda DEPOIS do insert de propósito: a submissão (e o consentimento LGPD
    // que ela carrega) não pode se perder porque a reconciliação falhou. Se algo
    // aqui estourar, a linha continua 'duplicado' e vai pra fila humana — que é
    // o comportamento seguro, e era o comportamento de sempre.
    let censoResultado = null;
    if (ehCenso && duplicadoDeId) {
      try {
        const { reconciliarCenso } = require('../services/censoReconciliar');
        censoResultado = await reconciliarCenso({
          membroId: duplicadoDeId,
          matchedBy,
          origemId: data.id,
          dados: {
            email: emailLimpo, telefone: telefoneLimpo, data_nascimento,
            estado_civil, endereco, bairro, cidade, cep, profissao,
          },
        });

        // Sem conflito → sai da fila humana ('aplicado'), mas a linha continua
        // existindo como prova do que a pessoa enviou e do que ela consentiu.
        // Com conflito → segue 'duplicado' e carrega os dois lados de cada campo.
        const semConflito = censoResultado.acao === 'aplicado'
          || censoResultado.acao === 'sem_mudanca';
        const patch = semConflito
          ? { status: 'aplicado', censo_conflitos: null }
          : { censo_conflitos: censoResultado.conflitos?.length ? censoResultado.conflitos : null };

        let { error: ePatch } = await supabase
          .from('mem_cadastros_pendentes').update(patch).eq('id', data.id);
        if (ePatch && ehColunaAusente(ePatch)) {
          // Migration ausente: 'aplicado' não existe no CHECK e censo_conflitos
          // não existe na tabela. Mantém a linha na fila humana (seguro).
          ePatch = null;
        }
        if (ePatch) console.error('[PUBLIC CADASTRO censo patch]', ePatch.message);
        else if (semConflito) data.status = 'aplicado';

        // Cobertura: a pessoa RESPONDEU, independente de ter dado conflito ou de
        // o gate de confiança ter barrado a aplicação. Coberta é quem respondeu.
        const { error: eCob } = await supabase
          .from('mem_membros')
          .update({
            censo_respondido_em: new Date().toISOString(),
            censo_vinculo_declarado: vinculo_declarado || null,
          })
          .eq('id', duplicadoDeId);
        if (eCob && !ehColunaAusente(eCob)) {
          console.error('[PUBLIC CADASTRO censo cobertura]', eCob.message);
        }
      } catch (censoErr) {
        console.error('[PUBLIC CADASTRO censo]', censoErr.message);
      }

      // ⚠️⚠️ O CPF É O OBJETIVO DA CAMPANHA E ESTAVA SENDO DESCARTADO.
      // `CAMPOS_CENSO` exclui `cpf` de propósito (CPF tem serviço próprio, que
      // trata conflito de identidade e CPF já pertencente a outro membro) — mas
      // esse serviço NUNCA era chamado aqui. Resultado medido em 04/08: as 4
      // primeiras pessoas do disparo preencheram o CPF no formulário, a
      // submissão foi marcada `aplicado`, e o CPF não chegou ao cadastro. A
      // campanha inteira existe pra coletar CPF de ~2.000 pessoas que não têm.
      //
      // `confianca` espelha a força do vínculo: só CPF e o token pessoal do
      // convite identificam sozinhos. Com sinal fraco (telefone+nome), o
      // serviço exige nascimento conferível e manda pra fila humana se
      // divergir — é o que impede gravar o CPF de uma pessoa no cadastro de
      // outra da mesma família.
      if (duplicadoDeId && cpfLimpo) {
        try {
          const { reconciliarCpfTardio } = require('../services/cpfReconciliar');
          const rCpf = await reconciliarCpfTardio({
            membroId: duplicadoDeId,
            cpf: cpfLimpo,
            origem: matchedBy === 'token_censo' ? 'censo_link_pessoal' : 'censo_formulario',
            origemId: data.id,
            dataNascimento: data_nascimento || null,
            confianca: (matchedBy === 'cpf' || matchedBy === 'token_censo') ? 'forte' : 'fraca',
          });
          if (rCpf?.acao && !['consolidado', 'ja_tinha'].includes(rCpf.acao)) {
            console.warn('[PUBLIC CADASTRO censo cpf]', rCpf.acao);
          }
        } catch (cpfErr) {
          // Best-effort: a submissão já está gravada e não se desfaz porque a
          // consolidação do CPF falhou. O dado fica na linha pra reprocessar.
          console.error('[PUBLIC CADASTRO censo cpf]', cpfErr.message);
        }
      }
    }

    // Notifica responsáveis pela integração (assíncrono, não bloqueia resposta).
    // ⚠️ Submissão de censo que o reconciliador RESOLVEU não notifica: não há
    // nada pra ninguém fazer, e no domingo do lançamento seriam centenas de
    // avisos (sem regra configurada, `notificar` cai no fallback = TODOS os
    // admin/diretor, então cada submissão viraria dezenas de linhas). Aviso é
    // pra trabalho pendente — o volume do censo se acompanha pelo painel de
    // cobertura, não pelo sino.
    if (data.status !== 'aplicado') {
      notificar({
        modulo: 'membresia',
        tipo: 'novo_cadastro',
        titulo: ehCenso ? 'Censo · cadastro para revisar' : 'Novo cadastro de membresia',
        mensagem: ehCenso
          ? `${nome.trim()} respondeu o censo e o cadastro precisa de revisão${censoResultado?.conflitos?.length ? ` (${censoResultado.conflitos.length} campo(s) em conflito)` : ''}.`
          : `${nome.trim()} enviou um cadastro pelo formulário público.`,
        // ⚠️ Deep link até a ABA e o STATUS certos. Antes ia pra
        // `/ministerial/membresia` e caía na lista de 3.973 membros, sem pista
        // de onde estava o cadastro a revisar. Conflito do censo mantém o
        // status `duplicado` (a submissão tem `duplicado_de_id`), então é esse
        // o filtro — chegar na aba com "pendente" esconderia a própria linha.
        link: ehCenso
          ? `/ministerial/membresia?tab=cadastros&status=${data.status === 'duplicado' ? 'duplicado' : 'pendente'}`
          : '/ministerial/membresia?tab=cadastros&status=pendente',
        severidade: 'info',
        chaveDedup: `novo_cadastro_${data.id}`,
      }).catch(err => console.error('[PUBLIC CADASTRO] notificação falhou:', err.message));
    }

    // Se a pessoa indicou grupo, cria pedido vinculado (cadastro_pendente_id ou
    // membro_id se já existe duplicado).
    if (grupo_id) {
      try {
        const pedidoBase = {
          grupo_id,
          nome: nome.trim(),
          email: emailLimpo,
          telefone: telefone || null,
          origem: 'cadastro_interno',
          observacao: grupo_observacao ? String(grupo_observacao).slice(0, 500) : null,
          status: 'pendente',
        };
        if (duplicadoDeId) {
          pedidoBase.membro_id = duplicadoDeId;
        } else {
          pedidoBase.cadastro_pendente_id = data.id;
        }
        const { data: pedido } = await supabase.from('mem_grupo_pedidos').insert(pedidoBase).select('id').single();
        if (pedido) {
          // Notifica o(s) líder(es) do grupo
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
        // Não bloqueia o cadastro — so loga
        console.error('[PUBLIC CADASTRO pedido grupo]', pedidoErr.message);
      }
    }

    // Cria conta de acesso (auth user + profile) se a pessoa preencheu senha.
    // - Se já existe membro vinculado (duplicadoDeId) · profile aponta pra ele
    //   e a pessoa já tem acesso ao devocional imediatamente.
    // - Se for cadastro novo (sem match) · cria auth user + profile com
    //   membro_id=null. Acesso ao devocional vai depender do admin promover
    //   o cadastro_pendente pra mem_membros depois.
    let accountCreated = false;
    let canLoginDevocional = false;
    if (senha && emailLimpo) {
      try {
        // 1. Acha ou cria auth user
        let authUserId = null;
        const { data: { users } = { users: [] } } = await supabase.auth.admin.listUsers();
        const existing = users?.find(u => (u.email || '').toLowerCase() === emailLimpo);
        if (existing) {
          authUserId = existing.id;
          // SEGURANÇA: NÃO sobrescrever a senha de uma conta que já existe.
          // Este endpoint é público (sem login) — resetar a senha aqui permitia
          // que qualquer pessoa assumisse a conta de outra só sabendo o e-mail
          // (account takeover). Quem já tem conta e esqueceu a senha recupera
          // pelo fluxo próprio (/redefinir-senha · e-mail enviado ao dono).
        } else {
          const { data: created, error: createErr } = await supabase.auth.admin.createUser({
            email: emailLimpo,
            password: senha,
            email_confirm: true,
            // ⚠️ `full_name` é OBRIGATÓRIO aqui. O gatilho de signup em auth.users
            // faz COALESCE(full_name, name, split_part(email,'@',1)) — sem ele, o
            // PREFIXO DO E-MAIL vira o nome da pessoa no profile E no cadastro que
            // o gatilho cria (15 casos medidos em 04/08, ~1/dia). A pessoa acabou
            // de digitar o nome completo neste formulário; não há motivo pra
            // chutar.
            user_metadata: {
              full_name: nome.trim(),
              name: nome.trim(),
              source: 'membresia_publica',
              cadastro_pendente_id: data.id,
            },
          });
          if (createErr) {
            console.error('[PUBLIC CADASTRO] createUser:', createErr.message);
          } else {
            authUserId = created.user?.id;
          }
        }

        // 2. Garante profile vinculado
        if (authUserId) {
          const { data: profileExistente } = await supabase
            .from('profiles')
            .select('id, membro_id, name')
            .eq('id', authUserId)
            .maybeSingle();

          if (!profileExistente) {
            await supabase.from('profiles').insert({
              id: authUserId,
              email: emailLimpo,
              name: nome.trim(),
              role: null,
              membro_id: duplicadoDeId || null,
              is_membro_only: true,
              active: true,
            });
          } else {
            // O gatilho de auth.users cria o profile ANTES daqui, então este ramo
            // é o caminho normal — e era onde o nome ruim ficava para sempre.
            const patch = {};
            if (duplicadoDeId && !profileExistente.membro_id) patch.membro_id = duplicadoDeId;
            if (ehNomeDerivadoDeEmail(profileExistente.name, emailLimpo)) patch.name = nome.trim();
            if (Object.keys(patch).length) {
              await supabase.from('profiles').update(patch).eq('id', authUserId);
            }

            // E conserta o CADASTRO que o gatilho criou com o prefixo do e-mail.
            // É o caso da pessoa que preencheu este formulário corretamente e
            // ganhou um segundo registro vazio minutos depois. Guarda estreita:
            // só reescreve quando o nome atual É PROVADAMENTE derivado do e-mail.
            const membroDoLogin = profileExistente.membro_id || duplicadoDeId;
            if (membroDoLogin) {
              const { data: mem } = await supabase.from('mem_membros')
                .select('id, nome, email').eq('id', membroDoLogin).maybeSingle();
              if (mem && ehNomeDerivadoDeEmail(mem.nome, mem.email || emailLimpo)) {
                const { error: eNome } = await supabase.from('mem_membros')
                  .update({ nome: nome.trim() }).eq('id', mem.id).eq('nome', mem.nome);
                if (eNome) console.error('[PUBLIC CADASTRO] corrigir nome do membro:', eNome.message);
                else console.log(`[PUBLIC CADASTRO] nome derivado do e-mail corrigido: ${mem.nome} -> ${nome.trim()}`);
              }
            }
          }
          accountCreated = true;
          canLoginDevocional = !!duplicadoDeId; // so quem já e membro entra no devocional na hora
        }
      } catch (accErr) {
        // Não bloqueia o cadastro · so loga · admin pode criar acesso depois
        console.error('[PUBLIC CADASTRO] criar conta falhou:', accErr.message);
      }
    }

    // Resposta neutra — não confirma se foi duplicado, preserva privacidade.
    // `censo_atualizado` diz apenas se ATUALIZAMOS um cadastro (pra a tela dizer
    // "seus dados foram atualizados" em vez de "cadastro enviado"); NÃO revela
    // quais campos, nem se havia conflito, nem quem é a pessoa encontrada.
    res.status(201).json({
      ok: true,
      id: data.id,
      account_created: accountCreated,
      can_login_devocional: canLoginDevocional,
      ...(ehCenso ? { censo_atualizado: !!duplicadoDeId } : {}),
    });
  } catch (e) {
    console.error('[PUBLIC CADASTRO] exception:', e.message);
    res.status(500).json({ error: 'Erro ao processar cadastro.' });
  }
});

// ═══════════════════════════════════════════════════════════════════
//  WALLET PASS (Google Wallet / QR) — membros
// ═══════════════════════════════════════════════════════════════════
// Arquitetura: token do QR eh deterministico (SHA256 CPF + salt), então
// não precisa de coluna nova em mem_membros. Quem conhece CPF + data de
// nascimento pode gerar/regenerar o passe — usado em 2 fluxos:
//   1. Logo após o cadastro (CadastroMembresia.jsx) — temos CPF+DOB
//   2. "Já fiz meu cadastro" — usuário digita CPF+DOB para recuperar

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
  // ID legivel derivado do hash (estavel, não expoe CPF)
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
// Retorna { found, nome, pending } — resposta neutra quando não encontra
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

  // mem_cadastros_pendentes (ainda não aprovado)
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
// Usado pelo fluxo "Já fiz meu cadastro" antes de oferecer o botao da wallet.
router.post('/wallet/verify', lookupLimiter, async (req, res) => {
  try {
    const { cpf, data_nascimento } = req.body || {};
    const cleanCpf = soDigitos(cpf);
    if (!cpfValido(cleanCpf)) return res.status(400).json({ error: 'CPF invalido' });
    if (!data_nascimento) return res.status(400).json({ error: 'Data de nascimento obrigatória' });

    const r = await lookupCadastro(cleanCpf, data_nascimento);
    if (!r.found) {
      // Resposta neutra — não revela se CPF existe com DOB diferente
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
router.post('/wallet/qr-token', lookupLimiter, async (req, res) => {
  try {
    const { cpf, data_nascimento } = req.body || {};
    const cleanCpf = soDigitos(cpf);
    if (!cpfValido(cleanCpf)) return res.status(400).json({ error: 'CPF invalido' });
    if (!data_nascimento) return res.status(400).json({ error: 'Data de nascimento obrigatória' });

    const r = await lookupCadastro(cleanCpf, data_nascimento);
    if (!r.found) return res.status(404).json({ error: 'Cadastro não encontrado' });

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
router.post('/wallet/google', lookupLimiter, async (req, res) => {
  try {
    const issuerId = process.env.GOOGLE_WALLET_ISSUER_ID;
    const serviceAccountEmail = process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL;
    const rawKey = process.env.GOOGLE_WALLET_PRIVATE_KEY || '';
    const privateKey = rawKey.replace(/\\n/g, '\n');

    if (!issuerId || !serviceAccountEmail || !privateKey) {
      return res.status(503).json({ error: 'Google Wallet não configurado' });
    }

    const { cpf, data_nascimento } = req.body || {};
    const cleanCpf = soDigitos(cpf);
    if (!cpfValido(cleanCpf)) return res.status(400).json({ error: 'CPF invalido' });
    if (!data_nascimento) return res.status(400).json({ error: 'Data de nascimento obrigatória' });

    const r = await lookupCadastro(cleanCpf, data_nascimento);
    if (!r.found) return res.status(404).json({ error: 'Cadastro não encontrado' });

    const jwt = require('jsonwebtoken');
    const qrToken = memberQrToken(cleanCpf);
    const memberId = memberIdFromCpf(cleanCpf);
    await registerQrToken(qrToken, cleanCpf);

    const classId = `${issuerId}.cbrio_membro_v1`;
    // objectId precisa ser único por passe — hash do CPF mantem estabilidade sem expor PII
    const objectId = `${issuerId}.mem_${qrToken}`;

    const frontendUrl = (process.env.FRONTEND_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')).replace(/\/+$/, '');
    const logoUrl = frontendUrl ? `${frontendUrl}/logo-cbrio-text.png` : 'https://sistema-cbrio.vercel.app/logo-cbrio-text.png';

    const genericObject = {
      id: objectId,
      classId,
      genericType: 'GENERIC_OTHER',
      hexBackgroundColor: '#408097',
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
router.post('/wallet/apple', lookupLimiter, async (req, res) => {
  try {
    const { buildMembroPass } = require('../services/appleWallet');
    const { cpf, data_nascimento } = req.body || {};
    const cleanCpf = soDigitos(cpf);
    if (!cpfValido(cleanCpf)) return res.status(400).json({ error: 'CPF invalido' });
    if (!data_nascimento) return res.status(400).json({ error: 'Data de nascimento obrigatória' });

    const r = await lookupCadastro(cleanCpf, data_nascimento);
    if (!r.found) return res.status(404).json({ error: 'Cadastro não encontrado' });

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
    res.status(503).json({ error: 'Apple Wallet indisponível no momento. Use o QR acima.' });
  }
});

module.exports = router;
