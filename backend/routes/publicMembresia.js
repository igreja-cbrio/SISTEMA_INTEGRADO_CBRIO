const router = require('express').Router();
const multer = require('multer');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { supabase } = require('../utils/supabase');
const { cepCompleto } = require('../utils/trechoCep');
const { notificar } = require('../services/notificar');
const { donosDoGrupo } = require('../services/gruposDestinatarios');
const { avisarPedidoNovoNoApp } = require('../services/gruposAvisoApp');
const { uploadModuleFile, SHAREPOINT_CONFIGURED } = require('../services/storageService');
// varredura 2026-09: PUB-01 (2ª rodada) — `registrarContatoDaPorta` entra aqui
// porque o contato que o censo deixou de APLICAR não pode sumir: ele passa a ser
// ACUMULADO em mem_contatos (destino já desenhado pra contato divergente).
const { acharMembroGuardado, ehNomeDerivadoDeEmail, registrarContatoDaPorta } = require('../services/membroMatch');
const { registrarObservacaoSegura } = require('../services/identidadeProgressiva');
const { cpfValido, emailValido } = require('../services/inscricaoContrato');
const { verificarTokenCenso } = require('../utils/censoToken');
// varredura 2026-09: PUB-02 — mesma régua PURA do /prefill do censo ("CPF
// IDENTIFICA, NÃO AUTENTICA"), reaproveitada em vez de recopiada: o motivo
// está escrito lá e já entra no gate de deploy (src/test/censoPrefill.test.ts).
const { podeIdentificarPorCpf } = require('../utils/censoPrefill');
const { avaliarProntidao } = require('../utils/prontidaoCadastro');
// varredura 2026-09: PUB-01 — busca PAGINADA do auth user por e-mail. Era um
// helper local aqui; virou util compartilhada porque o /devocional/login fazia a
// MESMA pergunta com o bug da 1ª página. Uma régua só, um lugar só.
const { acharAuthUserPorEmail } = require('../utils/authUsers');
const { canonizarBairro } = require('../services/bairroCanonico');

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

// varredura 2026-09: PUB-01 — base do link de acesso (mesma régua do
// publicDevocional.js; cópia local porque cada porta pública resolve a sua).
function getFrontendUrl() {
  if (process.env.FRONTEND_URL) return process.env.FRONTEND_URL.replace(/\/+$/, '');
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:5173';
}

// varredura 2026-09: PUB-02 (CPF respondia "esta pessoa está na base da igreja?") —
// balde do probing de IDENTIDADE chaveado pelo CPF TENTADO, não pelo IP.
// ⚠️ O teto por IP NÃO defende esta rota: no culto a igreja inteira sai por 1 IP
// via NAT (é por isso que `lookupLimiter` é 3.000 e o do censo é 6.000), e quem
// varre uma lista de CPFs comprada troca de IP de graça. Por CPF, o MESMO
// documento só aceita algumas tentativas por janela — o que mata a força bruta
// da data de nascimento (a segunda metade da prova) sem tocar em quem está
// preenchendo o próprio cadastro, que consulta 1-2 vezes.
// ⚠️ Sem CPF na requisição o balde cai no IP: chave ausente não pode virar
// "sem limite".
// ⚠️ SEM `validate: { ... }` — produção roda a árvore do BACKEND
// (express-rate-limit 7.5.1), onde a opção não existe e responde
// ERR_ERL_UNKNOWN_VALIDATION a cada construção (lição de app.js:164-168).
const cpfProbeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.PUBLIC_MEMBRESIA_CPF_PROBE_MAX) || 20,
  keyGenerator: (req) => {
    const d = soDigitos(req.query?.cpf);
    return d.length === 11 ? `cpfprobe:${d}` : `cpfprobe:ip:${req.ip}`;
  },
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas consultas para este CPF. Tente novamente em alguns minutos.' },
});

// varredura 2026-09: PUB-01 (2ª rodada) — balde PRÓPRIO do ramo que CRIA CONTA,
// chaveado pelo E-MAIL ALVO (mesmo desenho do `cpfProbeLimiter` acima).
// ⚠️ O `cadastroLimiter` NÃO defende isto: ele é 10.000/15min por IP, calibrado
// pro culto inteiro sair por um NAT só. Mas o ramo de criação de conta é outra
// coisa — é uma porta ANÔNIMA que dispara e-mail (magic link) pra um endereço
// que quem chama digitou, e cada tentativa custa um `createUser` + um
// `generateLink` no GoTrue. `if (authUserNovo)` já impede que uma conta
// EXISTENTE receba qualquer coisa; falta impedir que um e-mail SEM conta seja
// bombardeado, e o teto por IP não faz isso (trocar de IP é de graça).
// ⚠️ NÃO responde 429 e NÃO manda header: estourar o balde apenas PULA a criação
// de conta (`req.contaPorEmailEstourou`), nunca derruba a submissão — perder o
// cadastro (e o consentimento LGPD que ele carrega) por causa do balde do
// acessório é o contrário da política deste arquivo. Sem `standardHeaders` pra
// não devolver a quem sonda quantas tentativas restam para aquele e-mail.
// ⚠️ `skip` mantém fora do balde quem nem pediu conta (sem `senha`/sem `email`):
// o balde é do RAMO, não da rota.
// ⚠️ Sem e-mail utilizável a chave cai no IP: chave ausente não pode virar
// "sem limite" (mesma regra do `cpfProbeLimiter`). Com o `skip` acima esse ramo
// é quase inalcançável (só e-mail em branco passa) — fica como cinto extra.
// ⚠️ SEM `validate: { ... }` — produção roda express-rate-limit 7.5.1, que
// responde ERR_ERL_UNKNOWN_VALIDATION a cada construção (lição de app.js:164-168).
const contaPorEmailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.PUBLIC_MEMBRESIA_CONTA_EMAIL_MAX) || 3,
  skip: (req) => !req.body?.senha || !req.body?.email,
  keyGenerator: (req) => {
    const e = String(req.body?.email || '').trim().toLowerCase();
    return e ? `contaemail:${e}` : `contaemail:ip:${req.ip}`;
  },
  handler: (req, _res, next) => {
    req.contaPorEmailEstourou = true;
    console.warn('[PUBLIC CADASTRO] criação de conta bloqueada pelo balde por e-mail alvo');
    next();
  },
  standardHeaders: false,
  legacyHeaders: false,
});

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
// GET /api/public/membresia/bairros — o catálogo que a lista suspensa lê.
//
// ⚠️⚠️ POR QUE ISTO EXISTE: a lista do formulário era uma constante de 11
// APELIDOS CURTOS no próprio arquivo ('Barra', 'Recreio', 'Freguesia'), e o
// ViaCEP devolve o nome OFICIAL. A comparação nunca casava nos três bairros com
// mais gente, então o CEP jogava a pessoa em "Outro" e ela gravava o nome longo
// enquanto quem escolhia da lista gravava o curto. Medido em 23/08: Barra da
// Tijuca 33 × Barra 22 · Recreio dos Bandeirantes 15 × Recreio 14. O formulário
// fabricava a duplicidade que o mapa depois tentava remendar com alias.
//
// ⚠️ NÃO é PII: nome de bairro e quantas pessoas moram nele não identificam
// ninguém. Por isso pode ser público — e precisa ser, porque a porta pública de
// cadastro não tem sessão.
// ⚠️ Balde do LOOKUP, não o da submissão: é consulta, e a cota da submissão é o
// que não pode acabar (lição da cota compartilhada que quebrava o formulário na
// 3ª pessoa).
//
// ⚠️ Cache de 10 min em memória: o catálogo muda quando alguém cadastra um
// bairro novo, e a lista abre a cada formulário. Sem cache, cada abertura no
// culto vira uma agregação sobre mem_membros.
let _bairrosCache = { em: 0, itens: null };
const BAIRROS_CACHE_MS = 10 * 60 * 1000;

router.get('/bairros', lookupLimiter, async (req, res) => {
  try {
    if (_bairrosCache.itens && Date.now() - _bairrosCache.em < BAIRROS_CACHE_MS) {
      return res.json({ bairros: _bairrosCache.itens, cache: true });
    }
    const { data, error } = await supabase.rpc('fn_dem_bairros_catalogo');
    if (error) throw error;
    const itens = (data || []).map((b) => ({
      norm: b.bairro_norm,
      nome: b.bairro,
      pessoas: b.pessoas || 0,
      apelidos: b.apelidos || [],
    }));
    _bairrosCache = { em: Date.now(), itens };
    res.json({ bairros: itens, cache: false });
  } catch (e) {
    // ⚠️ Catálogo indisponível NÃO pode travar cadastro: o seletor cai em campo
    // de texto e a pessoa termina o formulário. Lista vazia é degradação
    // aceitável; 500 aqui derrubaria a porta pública inteira.
    console.error('[public/membresia/bairros]', e.message);
    res.json({ bairros: [], indisponivel: true });
  }
});

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
//
// varredura 2026-09: PUB-02 — EXIGE CPF **+ DATA DE NASCIMENTO**, como o
// /prefill do censo (publicCenso.js + utils/censoPrefill.js). Só o CPF fazia
// esta porta responder "esta pessoa está na base da CBRio?" a qualquer um com
// uma lista de CPFs na mão — e estar na base de uma igreja é convicção
// religiosa, dado sensível do art. 5º, II da LGPD. O estágio "só o CPF" já
// tinha MORRIDO no censo em 17/08/2026; esta porta tinha ficado para trás.
// ⚠️ RECUSA NEUTRA: falta de nascimento, nascimento errado e CPF inexistente
// devolvem EXATAMENTE o mesmo corpo. Qualquer diferença devolve o oráculo.
// ─────────────────────────────────────────────────────────────────────────
router.get('/lookup-cpf', lookupLimiter, cpfProbeLimiter, async (req, res) => {
  // varredura 2026-09: PUB-02 — corpo único de recusa (nada distingue os casos).
  const neutra = { found: false };
  try {
    const cpf = req.query.cpf;
    // varredura 2026-09: PUB-02 — `reason:'invalid'` some junto: era o
    // discriminador que separava "CPF malformado" de "não está na base".
    if (!cpf || !cpfValido(cpf)) {
      return res.json(neutra);
    }
    const d = soDigitos(cpf);

    // varredura 2026-09: PUB-02 — sem o nascimento a resposta é a MESMA de CPF
    // inexistente; aceita `nascimento` e `data_nascimento` (o formulário já
    // coleta o campo, só precisa mandá-lo junto).
    const nascimento = String(req.query.data_nascimento || req.query.nascimento || '').trim();
    const temNascimento = /^\d{4}-\d{2}-\d{2}$/.test(nascimento);
    if (!podeIdentificarPorCpf({ cpfValido: true, temNascimento })) {
      return res.json(neutra);
    }

    // 1. mem_membros ativos
    const { data: m } = await supabase
      .from('mem_membros')
      .select('id, nome, data_nascimento, status')
      .eq('cpf', d)
      .eq('active', true)
      .maybeSingle();

    // varredura 2026-09: PUB-02 — nascimento divergente = mesma recusa neutra.
    if (m && m.data_nascimento !== nascimento) {
      return res.json(neutra);
    }

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
    // varredura 2026-09: PUB-02 — `data_nascimento` entra no select porque a
    // fila de cadastros responde a mesma pergunta sensível que mem_membros e
    // precisa da mesma prova.
    const { data: p } = await supabase
      .from('mem_cadastros_pendentes')
      .select('id, nome, status, data_nascimento')
      .eq('cpf', d)
      .in('status', ['pendente', 'duplicado'])
      .maybeSingle();

    // varredura 2026-09: PUB-02 — nascimento divergente = mesma recusa neutra.
    if (p && p.data_nascimento !== nascimento) {
      return res.json(neutra);
    }

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

    return res.json(neutra);
  } catch (e) {
    console.error('[PUBLIC] lookup-cpf error:', e.message);
    // varredura 2026-09: PUB-02 — `reason:'error'` some: mesmo corpo de recusa
    // em TODA saída sem sucesso (erro do banco não pode virar sinal).
    res.json(neutra);
  }
});

// POST /api/public/membresia/cadastro
// Submissão pública do formulário de cadastro de membresia.
// - Não exige autenticação (RLS permite INSERT para role anon)
// - Honeypot (website): bots tendem a preencher qualquer input visível
// - LGPD: aceita_termos é obrigatório; snapshot do texto consentido é gravado
// - Detecta duplicados por email OU (nome + telefone) em mem_membros
// varredura 2026-09: PUB-01 (2ª rodada) — `contaPorEmailLimiter` entra DEPOIS do
// balde geral e só conta quem pediu conta; ele nunca recusa a submissão, só
// marca `req.contaPorEmailEstourou` pro ramo de criação de conta lá embaixo.
router.post('/cadastro', cadastroLimiter, contaPorEmailLimiter, async (req, res) => {
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

    // ⚠️ SEXO OBRIGATÓRIO (Matheus · 05/08: "em todos os formulários"). Era a
    // ÚNICA porta de pessoa que não exigia — as outras 7 já validam no servidor
    // (batismo, apresentação, grupos + cônjuge, eventos, voluntariado, next,
    // totem do bebê). Ontem o campo entrou na tela mas o servidor só
    // sanitizava para `null`: quem postasse direto, ou abrisse com bundle
    // antigo, gravava sem sexo — e cadastro sem sexo nunca fica completo pela
    // régua da fila, então ficaria preso em aprovação manual pra sempre.
    // Vocabulário canônico, NUNCA "outro" (lei do Contrato de Inscrição).
    const generoNorm = String(genero || '').trim().toLowerCase();
    if (!['masculino', 'feminino'].includes(generoNorm)) {
      return res.status(400).json({ error: 'Selecione o sexo (masculino ou feminino).', campo: 'genero' });


    // CEP OBRIGATÓRIO nesta porta (pedido do Matheus · 25/08/2026, antes do
    // censo presencial). ⚠️ É decisão DESTA porta, não do Contrato de
    // Inscrição — endereço segue fixo-opcional nas outras 6.
    //
    // ⚠️ Exige COMPLETO (8 dígitos), não "preenchido": CEP pela metade entra
    // no cadastro parecendo endereço e o mapa da aba Perfil não consegue
    // posicionar a pessoa — `regiaoDeCep` recusa qualquer coisa que não tenha
    // 8. O censo já coletou CEP de 7 dígitos por engano justamente porque o
    // formulário não avisava.
    if (!cepCompleto(cep)) {
      return res.status(400).json({
        error: String(cep || '').trim()
          ? 'CEP incompleto — informe os 8 dígitos.'
          : 'CEP é obrigatório.',
        campo: 'cep',
      });
    }    }

    // ⚠️ Espelho do CHECK `mem_cadastros_pendentes_origem_check` (o banco é a
    // régua; aqui é só a porta recusando cedo). `online` entrou em 27/08/2026 e
    // NÃO é só etiqueta: a tabela não tem `frequenta_area`, então é a origem que
    // carrega a declaração "acompanha pelo Online" até a APROVAÇÃO, que a grava
    // em `mem_membros.frequenta_area`. Origem desconhecida cai em 'site' —
    // recusar o cadastro por causa de um parâmetro de URL seria perder a pessoa.
    const origemValida = ['site', 'qr_code', 'evento', 'importacao', 'online'];
    const origemFinal = origemValida.includes(origem) ? origem : 'site';

    // Uma grafia só para o bairro, antes de qualquer gravação.
    // ⚠️ Best-effort por dentro: catálogo fora do ar devolve o texto trimado —
    // qualidade de dado nunca derruba a submissão de um cadastro.
    const bairroCanon = await canonizarBairro(bairro);

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
      genero: generoNorm,   // já validado acima — só o canônico chega aqui
      estado_civil: estado_civil || null,
      endereco: endereco || null,
      // ⚠️ Grafia canônica JÁ NA PORTA: sem isto a fila acumula "Barra" ao lado
      // de "Barra da Tijuca" e a aprovação copia a variação para o cadastro.
      // Bairro que o catálogo não conhece passa como veio (trimado) — porta
      // pública não recusa quem mora onde a base ainda não viu.
      bairro: bairroCanon,
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

        // ⚠️⚠️ varredura 2026-09: PUB-01 (2ª rodada) — TOMADA DE CONTA EM DOIS
        // PASSOS PELA PORTA DO CENSO. Mandar `email`/`telefone` daqui reabria,
        // por desvio, o buraco que o resto do lote fechou:
        //   1. um anônimo posta este /cadastro com `censo:true`, o CPF da VÍTIMA
        //      e o PRÓPRIO e-mail. `acharMembroGuardado` casa por CPF, então
        //      `matchedBy='cpf'` e `podeAplicar` trata como sinal FORTE;
        //   2. em `decidirCampos`, se `mem_membros.email` da vítima estiver
        //      VAZIO, o e-mail cai em `aplicar` (destino vazio → enriquece) e
        //      NÃO em `CAMPOS_ACUMULAVEIS`, que só protege quem JÁ tem e-mail.
        //      O endereço do atacante vira o e-mail OFICIAL do membro;
        //   3. ele vai no /devocional/login, que acha o membro por
        //      `ilike('email', ...)` e grava `profiles.membro_id = membro.id` —
        //      exatamente o desfecho (ficha, família, filhos, contribuições via
        //      `current_user_membro_id()`) que este lote removeu do /cadastro.
        // A trava é de ORIGEM, não de valor: o TOKEN PESSOAL do censo é a única
        // prova de posse do contato nesta porta (link assinado que o sistema
        // entregou no WhatsApp/e-mail DELA). CPF digitado numa porta anônima
        // identifica, não autentica — e nunca pode escolher a chave de login.
        const contatoProvado = matchedBy === 'token_censo';

        // ⚠️ O que foi cortado NÃO SE PERDE. Sem o token, o contato vira contato
        // ACUMULADO em `mem_contatos` — o destino que a decisão de 17/07 já
        // desenhou pra contato divergente, e o mesmo que o `reconciliarCenso`
        // usaria. A equipe vê o e-mail novo na tela e decide; ele só não vira o
        // `mem_membros.email` que o /devocional/login usa como identidade.
        // Best-effort (não retorna promise): falha aqui não desfaz nada.
        //
        // varredura 2026-09: PUB-01 (3ª rodada) — este bloco roda ANTES do
        // `await reconciliarCenso`, não depois. O serviço propaga erro de infra
        // DE PROPÓSITO; com o acúmulo lá embaixo, no mesmo `try`, uma falha do
        // reconciliador pulava direto pro `catch` e o contato não chegava nem em
        // `mem_membros` (cortado pela trava) nem em `mem_contatos` — o "não se
        // perde" caía justamente no caminho de erro. A ordem não muda nada pra
        // quem lê: a função é best-effort e não retorna promise.
        if (!contatoProvado && (emailLimpo || telefoneLimpo)) {
          registrarContatoDaPorta(
            duplicadoDeId,
            { telefone: telefoneLimpo || null, email: emailLimpo || null },
            'censo',
          );

          // varredura 2026-09: PUB-01 (3ª rodada) — RASTRO NO HISTÓRICO. Antes da
          // trava, contato divergente entrava pelo `acumular` do
          // `reconciliarCenso` e o serviço escrevia `[censo] contato acumulado:
          // email` em `mem_historico`. Agora o contato nem chega no `dados`, então
          // `acumular` fica vazio e o acúmulo acontecia SEM linha na linha do tempo
          // do membro — cego exatamente no caso que mais interessa auditar depois
          // (alguém de fora tentando mexer no cadastro). Escrevemos a linha aqui.
          // Schema VIVO de `mem_historico` (mesma nota do censoReconciliar/
          // cpfReconciliar): `tipo` é NOT NULL com CHECK que aceita 'outro'; a ação
          // vai no prefixo da descrição.
          // Best-effort e SEM `await`: histórico não pode derrubar a rota.
          const camposContato = [
            emailLimpo ? 'email' : null,
            telefoneLimpo ? 'telefone' : null,
          ].filter(Boolean).join(', ');
          supabase.from('mem_historico').insert({
            membro_id: duplicadoDeId,
            tipo: 'outro',
            descricao: `[censo] contato de porta anônima acumulado (sem token pessoal): ${camposContato} (cadastro ${data.id})`,
            created_at: new Date().toISOString(),
          }).then(({ error: eHist }) => {
            if (eHist) console.warn('[PUBLIC CADASTRO censo] histórico do contato não gravado:', eHist.message);
          }, (e) => console.warn('[PUBLIC CADASTRO censo] histórico do contato não gravado:', e?.message));
        }

        censoResultado = await reconciliarCenso({
          membroId: duplicadoDeId,
          matchedBy,
          origemId: data.id,
          dados: {
            ...(contatoProvado ? { email: emailLimpo, telefone: telefoneLimpo } : {}),
            data_nascimento,
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

        // ⚠️⚠️ O OPT-IN DE WHATSAPP TAMBÉM ERA DESCARTADO — mesma família do bug
        // do CPF, e pelo mesmo motivo estrutural: `CAMPOS_CENSO` não inclui
        // `whatsapp_optin`, e quem propaga consentimento é a APROVAÇÃO
        // (`aprovarCadastroCore` / `promoverInscricaoLider`). A linha do censo
        // vira `aplicado` e NUNCA é aprovada ⇒ o consentimento ficava só na
        // submissão. Medido em 05/08: 70 das 74 respostas marcaram a caixa
        // (95%) e só 13 tinham chegado ao cadastro — 57 consentimentos válidos
        // invisíveis pra quem decide se pode enviar.
        //
        // ⚠️ SÓ LIGA, NUNCA DESLIGA (mesma política da aprovação): não marcar a
        // caixa é ausência de consentimento nesta submissão, não revogação do
        // que a pessoa já autorizou em outra porta. Revogar é ação dela.
        // ⚠️ `whatsapp_optin_em` é preservado quando já havia consentimento —
        // é a data da PROVA, e sobrescrevê-la apagaria desde quando ela vale.
        if (whatsapp_optin) {
          const { error: eOptin } = await supabase
            .from('mem_membros')
            .update({ whatsapp_optin: true, whatsapp_optin_em: new Date().toISOString() })
            .eq('id', duplicadoDeId)
            .or('whatsapp_optin.is.null,whatsapp_optin.eq.false');
          if (eOptin && !ehColunaAusente(eOptin)) {
            console.error('[PUBLIC CADASTRO censo optin]', eOptin.message);
          }
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
          // ⚠️ O comentário aqui dizia "Notifica o(s) líder(es) do grupo" e o
          // código não mandava target NENHUM — ia 100% pro fan-out de ~16
          // admins, e o líder nunca era avisado. Bug de intenção, não de
          // digitação: o comentário descrevia o que se queria, não o que fazia.
          const { data: grupo } = await supabase.from('mem_grupos').select('nome').eq('id', grupo_id).maybeSingle();
          // Sino do app do líder — a 5ª origem de pedido de grupo (o cadastro de
          // membresia). Awaited pelo mesmo motivo das outras.
          await avisarPedidoNovoNoApp({
            grupoId: grupo_id, pedidoId: pedido.id,
            grupoNome: grupo?.nome, pessoaNome: nome,
          });
          donosDoGrupo(grupo_id).then((donos) => {
            if (!donos.length) return;
            return notificar({
              modulo: 'grupos',
              tipo: 'pedido_grupo',
              titulo: `Novo pedido para ${grupo?.nome || 'grupo'}`,
              mensagem: `${nome.trim()} pediu para entrar no grupo via cadastro de membresia.`,
              link: '/grupos/pedidos',
              severidade: 'aviso',
              chaveDedup: `pedido_grupo_${pedido.id}`,
              targetIds: donos,
            });
          }).catch(err => console.error('[PUBLIC CADASTRO pedido grupo notify]', err.message));
        }
      } catch (pedidoErr) {
        // Não bloqueia o cadastro — so loga
        console.error('[PUBLIC CADASTRO pedido grupo]', pedidoErr.message);
      }
    }

    // Cria conta de acesso (auth user + profile) se a pessoa preencheu senha.
    // - Cria auth user + profile SEM `membro_id` e SEM senha; o acesso sai por
    //   magic link no e-mail. O vínculo com mem_membros só nasce quando a
    //   equipe promove o `mem_cadastros_pendentes`.
    //
    // ⚠️⚠️ varredura 2026-09: PUB-01 — ESTE BLOCO ENTREGAVA A CONTA DE OUTRA
    // PESSOA. Era uma porta SEM LOGIN: quem soubesse só o CPF de um membro
    // (2.390 têm CPF gravado) enviava o formulário com o PRÓPRIO e-mail e a
    // PRÓPRIA senha e recebia uma conta já confirmada cujo `profiles.membro_id`
    // apontava pro membro casado por CPF. E `profiles.membro_id` não é
    // etiqueta: alimenta `current_user_membro_id()`, usada nas policies de
    // contribuições e Kids (migration 20260816194649), e é o vínculo que o app
    // de membros lê (routes/app.js). Ficha, família, filhos, grupos,
    // inscrições e contribuição da vítima — sem nenhum aviso a ela, porque o
    // e-mail era marcado confirmado sem verificação nenhuma.
    // Três travas, todas aqui:
    //   (1) `membro_id` NUNCA sai do casamento por CPF nesta porta;
    //   (2) nada de senha escolhida por quem chama — entrada só pelo link que
    //       chega no e-mail (posse provada), padrão do publicDevocional.js;
    //   (3) `email_confirm: false` — o endereço passa a ser verificado.
    //   (4) varredura 2026-09: PUB-01 (2ª rodada) — o ramo inteiro fica atrás do
    //       `contaPorEmailLimiter`, balde estreito chaveado pelo E-MAIL ALVO
    //       (~3/15min). Estourar não recusa a submissão: só pula a criação de
    //       conta, que é acessório desta porta.
    let accountCreated = false;
    let canLoginDevocional = false;
    if (senha && emailLimpo && !req.contaPorEmailEstourou) {
      try {
        // 1. Acha ou cria auth user
        let authUserId = null;
        // varredura 2026-09: PUB-01 — só a conta CRIADA agora recebe link de
        // acesso. Quem já tinha conta já tem caminho próprio (/devocional/login)
        // e disparar e-mail pra ela daqui transformaria uma porta anônima em
        // gatilho de mensagem pro endereço de qualquer um.
        let authUserNovo = false;
        // varredura 2026-09: PUB-01 — `listUsers()` sem paginação lê só a 1ª
        // página (50 no supabase-js 2.x) e não via ~155 dos 205 usuários: quem
        // já tinha conta caía no ramo de CRIAR, e um e-mail existente virava
        // erro silencioso (ou pior, tratamento de conta nova).
        const existing = await acharAuthUserPorEmail(emailLimpo);
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
            // varredura 2026-09: PUB-01 — SEM `password`. A senha vinha do
            // chamador numa porta anônima: era credencial escolhida por um
            // desconhecido para um e-mail que ninguém verificou. Quem entra,
            // entra pelo link que chega no e-mail (abaixo); quem quiser senha
            // define depois, autenticado, pelo /redefinir-senha.
            // varredura 2026-09: PUB-01 — `email_confirm: false`: marcar
            // confirmado sem verificar era o que tirava o dono legítimo do
            // circuito (nenhum e-mail, nenhum aviso).
            email_confirm: false,
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
            authUserNovo = !!authUserId;   // varredura 2026-09: PUB-01
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
              // varredura 2026-09: PUB-01 — `membro_id` NASCE NULO nesta porta.
              // Era aqui que o CPF de outra pessoa virava acesso ao cadastro
              // dela. O vínculo com mem_membros é ato da EQUIPE, ao promover o
              // `mem_cadastros_pendentes` (a fila continua com o
              // `duplicado_de_id`, então nada se perde — só deixa de ser
              // automático a partir de uma porta anônima).
              membro_id: null,
              is_membro_only: true,
              active: true,
            });
          } else {
            // O gatilho de auth.users cria o profile ANTES daqui, então este ramo
            // é o caminho normal — e era onde o nome ruim ficava para sempre.
            const patch = {};
            // varredura 2026-09: PUB-01 — o patch de `membro_id` SAIU pelo mesmo
            // motivo do insert acima: casamento por CPF numa porta sem login não
            // pode ligar a conta de quem chama ao membro casado.
            if (ehNomeDerivadoDeEmail(profileExistente.name, emailLimpo)) patch.name = nome.trim();
            if (Object.keys(patch).length) {
              await supabase.from('profiles').update(patch).eq('id', authUserId);
            }

            // E conserta o CADASTRO que o gatilho criou com o prefixo do e-mail.
            // É o caso da pessoa que preencheu este formulário corretamente e
            // ganhou um segundo registro vazio minutos depois. Guarda estreita:
            // só reescreve quando o nome atual É PROVADAMENTE derivado do e-mail.
            // varredura 2026-09: PUB-01 — só `profileExistente.membro_id`. Com
            // `|| duplicadoDeId`, o casamento por CPF autorizava um anônimo a
            // ESCREVER no `mem_membros` de outra pessoa (a guarda do nome
            // derivado de e-mail é estreita, mas a autorização vinha do lugar
            // errado). O vínculo já provado no profile continua valendo.
            const membroDoLogin = profileExistente.membro_id;
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
          // varredura 2026-09: PUB-01 — a ENTRADA passa a ser o link no e-mail
          // (mesmo desenho do publicDevocional.js): é ele que prova a posse do
          // endereço. Best-effort — o cadastro já está gravado e não se desfaz
          // porque o envio falhou; a pessoa entra depois pelo /devocional/login.
          if (authUserNovo) {
            try {
              const { error: linkErr } = await supabase.auth.admin.generateLink({
                type: 'magiclink',
                email: emailLimpo,
                options: { redirectTo: `${getFrontendUrl()}/devocional/hoje` },
              });
              if (linkErr) console.error('[PUBLIC CADASTRO] magic link:', linkErr.message);
            } catch (linkEx) {
              console.error('[PUBLIC CADASTRO] magic link:', linkEx.message);
            }
          }
          // varredura 2026-09: PUB-01 — sempre `false`: sem `membro_id`, e sem
          // senha, ninguém "entra na hora" a partir desta porta. A tela cai no
          // caminho de sucesso normal, que é o correto agora.
          canLoginDevocional = false;
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
